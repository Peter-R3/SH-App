const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '..');

// Isolated database fixture: these UI tests never contact Firebase or real accounts.
const fixture = () => {
    window.localPlayer = 'Peter';
    window.activeAppView = 'home';
    window.playerProfiles = { Peter: { nickname: 'Peter' }, Jadey: { nickname: 'Jadey' } };
    window.playUiSound = () => {};
    window.setActiveAppView = view => { window.activeAppView = view; };
    window.applyThemeVariables = () => {};
    window.escapeHtml = value => String(value).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' })[ch]);
    window.switchTab = () => {
        document.querySelectorAll('.screen').forEach(screen => screen.classList.add('hidden'));
        document.getElementById('home-screen').classList.remove('hidden');
        activeAppView = 'home';
    };
    window.testStore = { realmHub: { code: 'EXAMPLE-CODE', locations: {} } };
    let nextKey = 0;
    const listeners = new Map();
    const read = key => key.split('/').reduce((value, part) => value?.[part], testStore) ?? null;
    const write = (key, value) => {
        const parts = key.split('/');
        const last = parts.pop();
        const parent = parts.reduce((object, part) => object[part] ||= {}, testStore);
        if (value === null) delete parent[last]; else parent[last] = value;
        listeners.forEach((callbacks, watched) => {
            if (key.startsWith(watched) || watched.startsWith(key)) callbacks.forEach(callback => callback({ val: () => structuredClone(read(watched)) }));
        });
    };
    window.database = { ref(key) { return {
        push: () => ({ key: `key-${++nextKey}` }),
        on: (_, callback) => { if (!listeners.has(key)) listeners.set(key, new Set()); listeners.get(key).add(callback); callback({ val: () => structuredClone(read(key)) }); },
        off: (_, callback) => listeners.get(key)?.delete(callback),
        set: async value => write(key, value),
        transaction: async update => {
            const value = update(structuredClone(read(key)));
            if (value === undefined) return { committed: false };
            write(key, value); return { committed: true };
        }
    }; } };
};

(async () => {
    const browser = await chromium.launch({ channel: 'msedge', headless: true });
    try {
        const page = await browser.newPage({ viewport: { width: 360, height: 740 } });
        const errors = [];
        page.on('pageerror', error => errors.push(error.message));
        await page.route('**/*', route => route.abort());
        await page.setContent(fs.readFileSync(path.join(root, 'index.html'), 'utf8').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ''));
        for (const css of ['styles.css', 'realm-hub.css']) await page.addStyleTag({ content: fs.readFileSync(path.join(root, css), 'utf8') });
        await page.evaluate(fixture);
        await page.addScriptTag({ content: fs.readFileSync(path.join(root, 'realm-hub.js'), 'utf8') });
        await page.evaluate(() => openRealmHub());
        assert.equal(await page.locator('#realm-code-value').textContent(), 'Code hidden');
        await page.locator('#realm-reveal').click();
        assert.equal(await page.locator('#realm-code-value').textContent(), 'EXAMPLE-CODE');
        await page.locator('#realm-code-edit').click();
        await page.locator('#realm-code-input').fill('NEW-CODE');
        await page.locator('#realm-code-form button[type=submit]').click();
        assert.equal(await page.evaluate(() => testStore.realmHub.code), 'NEW-CODE');

        async function fillLocation(name, dimension = 'overworld') {
            await page.locator('#realm-name').fill(name);
            await page.locator('#realm-dimension').selectOption(dimension);
            for (const axis of ['x', 'y', 'z']) await page.locator(`#realm-${axis}`).fill('5');
        }
        await page.locator('#realm-add').click();
        await fillLocation('Our base');
        await page.locator('#realm-location-form button[type=submit]').click();
        assert.equal(await page.locator('.realm-location').count(), 1);
        await page.locator('#realm-add').click();
        await fillLocation('Duplicate');
        await page.locator('#realm-location-form button[type=submit]').click();
        assert.match(await page.locator('#realm-editor-status').textContent(), /already exist/);
        await page.locator('#realm-dimension').selectOption('nether');
        await page.locator('#realm-location-form button[type=submit]').click();
        assert.equal(await page.locator('.realm-location').count(), 2);
        await page.locator('#realm-search').fill('Our base');
        assert.equal(await page.locator('.realm-location').count(), 1);
        await page.locator('#realm-search').fill('');
        await page.locator('#realm-dimension-filter').selectOption('nether');
        assert.equal(await page.locator('.realm-location').count(), 1);
        await page.locator('[data-realm-action=edit]').click();
        assert.match(await page.locator('#realm-coordinate-helper').textContent(), /X 40, Z 40/);
        await page.locator('#realm-name').fill('Nether base');
        await page.locator('#realm-location-form button[type=submit]').click();
        assert.match(await page.locator('.realm-location h3').textContent(), /Nether base/);
        await page.locator('[data-realm-action=delete]').click();
        await page.locator('#app-confirm-dialog button[value=cancel]').click();
        assert.equal(await page.locator('.realm-location').count(), 1);
        await page.locator('[data-realm-action=delete]').click();
        await page.locator('#app-confirm-dialog button[value=confirm]').click();
        await page.waitForFunction(() => document.querySelectorAll('.realm-location').length === 0);
        assert.equal(await page.locator('.realm-location').count(), 0);

        await page.evaluate(() => { localPlayer = 'Jadey'; openRealmHub(); });
        assert.equal(await page.locator('#realm-code-edit').isVisible(), false);
        await page.locator('#realm-dimension-filter').selectOption('all');
        assert.equal(await page.locator('.realm-location').count(), 1);
        await page.locator('[data-realm-action=edit]').click();
        await page.locator('#realm-note').fill('Shared notes from Jadey');
        await page.locator('#realm-location-form button[type=submit]').click();
        assert.match(await page.locator('.realm-note').textContent(), /Shared notes from Jadey/);

        const checks = await page.evaluate(() => {
            const a = { name: 'Base', dimension: 'overworld', x: 5, y: 5, z: 5, note: '', revision: 'v1' };
            return [
                updateRealmLocations({ a }, 'b', a, null) === undefined,
                updateRealmLocations({ a }, 'a', { ...a, note: 'edit' }, 'v1')?.a.note === 'edit',
                updateRealmLocations({ a }, 'a', a, 'stale') === undefined,
                updateRealmLocations({}, 'a', a, 'v1') === undefined,
                !!updateRealmLocations({ a }, 'b', { ...a, dimension: 'nether' }, null),
                !!validateRealmLocation({ ...a, x: 1.5 }),
                !validateRealmLocation({ ...a, x: -40 }),
                !!validateRealmLocation({ ...a, note: 'x'.repeat(1001) })
            ];
        });
        assert.ok(checks.every(Boolean), 'Duplicate, edit conflict and validation checks');
        for (const viewport of [{ width: 320, height: 568 }, { width: 390, height: 844 }, { width: 1280, height: 800 }]) {
            await page.setViewportSize(viewport);
            assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'No horizontal overflow');
            await page.screenshot({ path: path.join(os.tmpdir(), `realm-hub-${viewport.width}.png`) });
            await page.locator('#realm-add').click();
            assert.ok(await page.locator('#realm-editor').evaluate(dialog => dialog.scrollWidth <= dialog.clientWidth), 'Editor fits viewport');
            await page.screenshot({ path: path.join(os.tmpdir(), `realm-editor-${viewport.width}.png`) });
            await page.locator('[data-realm-action=cancel-edit]').click();
        }
        await page.goBack();
        assert.equal(await page.locator('#home-screen').isVisible(), true);
        assert.deepEqual(errors, []);
        console.log('PASS: code reveal/edit, Peter-only UI, both profiles editing, duplicate validation, dimension separation, search/filter, delete/cancel, stale writes, browser Back and 3 viewport checks.');
    } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });

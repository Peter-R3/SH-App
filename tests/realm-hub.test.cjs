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
        await page.route('**/assets/icons/copy.svg', route => route.fulfill({ contentType: 'image/svg+xml', body: fs.readFileSync(path.join(root, 'assets/icons/copy.svg')) }));
        await page.setContent(fs.readFileSync(path.join(root, 'index.html'), 'utf8').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '').replace('<head>', '<head><base href="https://realm.test/">'));
        for (const css of ['styles.css', 'realm-hub.css', 'realm-planner.css', 'achievements.css']) await page.addStyleTag({ content: fs.readFileSync(path.join(root, css), 'utf8') });
        await page.evaluate(fixture);
        await page.addScriptTag({ content: fs.readFileSync(path.join(root, 'realm-hub.js'), 'utf8') });
        await page.addScriptTag({ content: fs.readFileSync(path.join(root, 'realm-planner.js'), 'utf8') });
        await page.evaluate(() => openRealmHub());
        assert.equal(await page.locator('#realm-code-value').textContent(), 'Code hidden');
        await page.locator('#realm-reveal').click();
        assert.equal(await page.locator('#realm-code-value').textContent(), 'EXAMPLE-CODE');
        await page.locator('#realm-code-edit').click();
        await page.locator('#realm-code-input').fill('NEW-CODE');
        await page.locator('#realm-code-form button[type=submit]').click();
        assert.equal(await page.evaluate(() => testStore.realmHub.code), 'NEW-CODE');

        async function selectDimension(id, value) {
            await page.locator(`#${id}-trigger`).click();
            await page.locator(`#${id}-options [data-value="${value}"]`).click();
        }
        async function fillLocation(name, dimension = 'overworld') {
            await page.locator('#realm-name').fill(name);
            await selectDimension('realm-dimension', dimension);
            for (const axis of ['x', 'y', 'z']) await page.locator(`#realm-${axis}`).fill('5');
        }
        await page.locator('#realm-add').click();
        await fillLocation('Our base');
        await page.locator('#realm-location-form button[type=submit]').click();
        assert.equal(await page.locator('.realm-location').count(), 1);
        await page.locator('[data-plan-action=favourite]').click();
        assert.equal(await page.locator('[data-plan-action=favourite]').getAttribute('aria-pressed'), 'true');
        await page.locator('#realm-favourites-filter').check();
        assert.equal(await page.locator('.realm-location').count(), 1);
        await page.locator('#realm-favourites-filter').uncheck();
        await page.locator('[data-plan-action=categories]').click();
        await page.locator('[data-plan-action=category-add]').click();
        await page.locator('#realm-plan-name').fill('Projects');
        await page.locator('#realm-plan-form button[type=submit]').click();
        const categoryId = await page.evaluate(() => Object.keys(testStore.realmHub.categories).find(id => testStore.realmHub.categories[id] === 'Projects'));
        await page.locator('[data-plan-action=close-categories]').click();
        await page.locator('[data-realm-action=edit]').click();
        await selectDimension('realm-category', categoryId);
        await page.locator('#realm-location-form button[type=submit]').click();
        await selectDimension('realm-category-filter', categoryId);
        assert.equal(await page.locator('.realm-location').count(), 1);
        assert.equal(await page.locator('.realm-category-label').textContent(), 'Projects');
        await page.evaluate(() => { delete realmPlannerData.lists; });
        await page.locator('[data-plan-action=categories]').click();
        await page.locator(`[data-plan-action=category-delete][data-id="${categoryId}"]`).click();
        await page.locator('#app-confirm-dialog button[value=confirm]').click();
        await page.waitForFunction(id => !testStore.realmHub.categories[id], categoryId);
        await page.locator('[data-plan-action=close-categories]').click();
        assert.equal(await page.locator('.realm-category-label').count(), 0);
        await page.locator('#realm-add').click();
        await fillLocation('Duplicate');
        await page.locator('#realm-location-form button[type=submit]').click();
        assert.match(await page.locator('#realm-editor-status').textContent(), /already exist/);
        await selectDimension('realm-dimension', 'nether');
        await page.locator('#realm-location-form button[type=submit]').click();
        assert.equal(await page.locator('.realm-location').count(), 2);
        await page.locator('#realm-search').fill('Our base');
        assert.equal(await page.locator('.realm-location').count(), 1);
        await page.locator('#realm-search').fill('');
        await selectDimension('realm-dimension-filter', 'nether');
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

        await page.evaluate(() => { localPlayer = 'Jadey'; return openRealmHub(); });
        assert.equal(await page.locator('#realm-code-edit').isVisible(), false);
        await page.locator('#realm-favourites-filter').check();
        assert.equal(await page.locator('.realm-location').count(), 0, 'Favourites are personal');
        await page.locator('#realm-favourites-filter').uncheck();
        await selectDimension('realm-dimension-filter', 'all');
        assert.equal(await page.locator('.realm-location').count(), 1);
        await page.locator('[data-realm-action=edit]').click();
        await page.locator('#realm-note').fill('Shared notes from Jadey');
        await page.locator('#realm-location-form button[type=submit]').click();
        assert.match(await page.locator('.realm-note').textContent(), /Shared notes from Jadey/);
        await page.locator('[data-realm-action=edit]').click();
        await page.locator('#realm-x').fill('-120');
        await page.locator('#realm-y').fill('64');
        await page.locator('[data-realm-action=sign][data-axis=y]').click();
        await page.locator('#realm-z').fill('');
        await page.locator('[data-realm-action=sign][data-axis=z]').click();
        await page.locator('#realm-z').pressSequentially('32');
        assert.equal(await page.locator('#realm-z').inputValue(), '-32');
        await page.locator('#realm-location-form button[type=submit]').click();
        assert.match(await page.locator('.realm-coordinates').textContent(), /X -120.*Y -64.*Z -32/);
        await page.locator('[data-realm-action=edit]').click();
        assert.equal(await page.locator('#realm-x').inputValue(), '-120');
        assert.equal(await page.locator('#realm-y').inputValue(), '-64');
        await page.locator('[data-realm-action=cancel-edit]').click();

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
                ,updateRealmLocations(Object.fromEntries(Array.from({ length: 300 }, (_, i) => [`l${i}`, { ...a, x: i }])), 'new', { ...a, x: 301 }, null) === undefined
            ];
        });
        assert.ok(checks.every(Boolean), 'Duplicate, edit conflict and validation checks');
        await page.locator('#realm-dimension-filter-trigger').focus();
        await page.keyboard.press('ArrowDown');
        await page.keyboard.press('End');
        await page.keyboard.press('Enter');
        assert.equal(await page.locator('#realm-dimension-filter').inputValue(), 'end');
        await selectDimension('realm-dimension-filter', 'all');
        await page.locator('#realm-dimension-filter-trigger').click();
        await page.keyboard.press('Escape');
        assert.equal(await page.locator('#realm-dimension-filter-trigger').getAttribute('aria-expanded'), 'false');
        await page.locator('[data-plan-action=tab][data-tab=lists]').click();
        await page.locator('[data-plan-action=list-add]').click();
        await page.locator('#realm-plan-name').fill('Iron farm materials');
        await page.locator('#realm-plan-form button[type=submit]').click();
        await page.locator('[data-plan-action=list-open]').click();
        await page.locator('[data-plan-action=item-add]').click();
        await page.locator('#realm-plan-name').fill('Iron');
        await selectDimension('realm-plan-kind', 'quantity');
        await page.locator('#realm-plan-target').fill('128');
        await page.locator('#realm-plan-amount').fill('32');
        await page.locator('#realm-plan-form button[type=submit]').click();
        assert.match(await page.locator('.realm-checklist-item .realm-quantity-summary').textContent(), /96 left32 \/ 128/);
        await page.locator('[data-plan-action=quantity]').click();
        await page.locator('#realm-plan-amount').fill('16');
        await page.locator('#realm-plan-form button[type=submit]').click();
        assert.match(await page.locator('.realm-checklist-item .realm-quantity-summary').textContent(), /80 left48 \/ 128/);
        assert.equal(await page.locator('[data-plan-action=item-delete]').getAttribute('class'), 'realm-danger');
        assert.equal(await page.locator('[data-plan-check]').evaluate(el => getComputedStyle(el).appearance), 'none');
        for (const width of [320, 390, 1280]) {
            await page.setViewportSize({ width, height: 844 });
            const boxes = await page.locator('.realm-item-actions button').evaluateAll(elements => elements.map(el => ({ top: el.getBoundingClientRect().top, right: el.getBoundingClientRect().right })));
            assert.ok(boxes.every(box => Math.abs(box.top - boxes[0].top) < 1 && box.right <= width), 'Item actions share a row and fit');
            await page.screenshot({ path: path.join(os.tmpdir(), `realm-lists-refined-${width}.png`) });
        }
        await page.locator('[data-plan-check]').check();
        assert.match(await page.locator('#realm-lists-content summary').textContent(), /Completed \(1\)/);
        await page.locator('#realm-lists-content summary').click();
        await page.locator('[data-plan-check]').uncheck();
        await page.screenshot({ path: path.join(os.tmpdir(), 'realm-checklists.png') });
        await page.locator('[data-plan-action=tab][data-tab=locations]').click();
        await page.evaluate(async () => {
            Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async value => { window.copiedCoordinates = value; } } });
            await database.ref('realmHub').transaction(data => {
                Object.values(data.locations)[0].category = 'bases';
                return data;
            });
        });
        await page.locator('[data-realm-action=copy-coordinates]').click();
        assert.match(await page.evaluate(() => copiedCoordinates), /Our base.*X -120, Y -64, Z -32/);
        await page.locator('#realm-dimension-filter-trigger').click();
        await page.locator('#realm-search').click();
        assert.equal(await page.locator('#realm-dimension-filter-trigger').getAttribute('aria-expanded'), 'false');
        for (const viewport of [{ width: 320, height: 568 }, { width: 390, height: 844 }, { width: 1280, height: 800 }]) {
            await page.setViewportSize(viewport);
            assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'No horizontal overflow');
            await page.screenshot({ path: path.join(os.tmpdir(), `realm-hub-${viewport.width}.png`) });
            await page.locator('.realm-location').scrollIntoViewIfNeeded();
            assert.ok(await page.locator('.realm-copy img').evaluate(img => img.complete && img.naturalWidth > 0), 'Copy asset loads');
            const alignment = await page.locator('.realm-location').evaluate(card => {
                const box = selector => card.querySelector(selector).getBoundingClientRect();
                const copy = box('.realm-copy'), favourite = box('.realm-favourite'), coordinates = box('.realm-coordinates');
                return Math.abs(copy.right - favourite.right) < 1 && favourite.top >= copy.bottom && Math.abs(copy.top - coordinates.top) < 1 && card.scrollWidth <= card.clientWidth;
            });
            assert.ok(alignment, 'Copy and favourite align on the right without card overflow');
            assert.ok(await page.locator('.realm-location').evaluate(card => {
                const coords = card.querySelector('.realm-coordinates');
                const notes = card.querySelector('.realm-note');
                return getComputedStyle(coords).minHeight === '0px' && notes.getBoundingClientRect().top - coords.getBoundingClientRect().bottom <= 7;
            }), 'Coordinates and notes remain compact');
            await page.locator('.realm-location').screenshot({ path: path.join(os.tmpdir(), `realm-location-refined-${viewport.width}.png`) });
            await page.locator('#realm-add').click();
            assert.equal(await page.locator('#realm-note').evaluate(el => getComputedStyle(el).resize), 'vertical');
            for (const axis of ['x', 'z']) await page.locator(`#realm-${axis}`).fill('16');
            assert.equal(await page.locator('#realm-coordinate-helper .realm-axis-x').textContent(), 'X');
            assert.equal(await page.locator('#realm-coordinate-helper .realm-converted-coordinate').first().evaluate(el => getComputedStyle(el).color), 'rgb(255, 255, 255)');
            assert.ok(await page.locator('#realm-editor').evaluate(dialog => dialog.scrollWidth <= dialog.clientWidth), 'Editor fits viewport');
            await page.screenshot({ path: path.join(os.tmpdir(), `realm-editor-${viewport.width}.png`) });
            await page.locator('[data-realm-action=cancel-edit]').click();
        }
        await page.goBack();
        await page.waitForFunction(() => !document.getElementById('home-screen').classList.contains('hidden'));
        assert.equal(await page.locator('#home-screen').isVisible(), true);
        await page.waitForFunction(() => !document.querySelector('.realm-portal-transition'));
        await page.emulateMedia({ reducedMotion: 'reduce' });
        await page.evaluate(() => openRealmHub());
        await page.locator('[data-realm-action=exit]').click();
        await page.waitForFunction(() => !document.getElementById('home-screen').classList.contains('hidden'));
        assert.deepEqual(errors, []);
        console.log('PASS: code reveal/edit, Peter-only UI, both profiles editing, duplicate validation, dimension separation, search/filter, delete/cancel, stale writes, browser Back and 3 viewport checks.');
    } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });

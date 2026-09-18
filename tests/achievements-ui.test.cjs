const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '..');
(async () => {
    const browser = await chromium.launch({ channel: 'msedge', headless: true });
    try {
        const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
        const errors = [];
        page.on('pageerror', error => errors.push(error.message));
        const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '');
        await page.route('**/*', route => {
            const asset = new URL(route.request().url()).pathname;
            if (/^\/assets\/achievements\/[A-Za-z_]+\.svg$/.test(asset)) return route.fulfill({ contentType: 'image/svg+xml', body: fs.readFileSync(path.join(root, asset.slice(1))) });
            return route.fulfill({ contentType: 'text/html', body: html });
        });
        await page.goto('http://achievements.test/');
        for (const file of ['styles.css','realm-hub.css','game-pause.css','achievements.css']) await page.addStyleTag({ content: fs.readFileSync(path.join(root,file),'utf8') });
        await page.evaluate(() => {
            const snapshot = { val: () => null, exists: () => false, forEach() {} };
            const ref = { on() {}, off() {}, once: async () => snapshot, set: async () => {}, update: async () => {}, remove: async () => {}, push: () => ({ key: 'key', set: async () => {} }),
                transaction: async update => { const result = update(window.fixtureAchievements || null); window.fixtureAchievements = result; return { committed: result !== undefined, snapshot: { val: () => result } }; },
                orderByChild() { return this; }, limitToLast() { return this; }, onDisconnect() { return this; } };
            window.firebase = { initializeApp() {}, auth: () => ({ currentUser: { uid:'test', email:'test@example.invalid' }, onAuthStateChanged() {} }), database: () => ({ ref: () => ref }) };
            window.firebase.database.ServerValue = { TIMESTAMP: 1 };
            window.AudioContext = undefined;
            window.webkitAudioContext = undefined;
        });
        for (const file of ['app.js','wordsearch.js','battleship.js','connect-four.js','sudoku.js','tic-tac-toe.js','rps.js','realm-hub.js','game-pause.js','achievements.js']) await page.addScriptTag({ content: fs.readFileSync(path.join(root,file),'utf8') });
        await page.evaluate(() => { showAuthenticatedApp('Peter'); achievementReady = true; achievementPlayer = 'Peter'; });
        for (const width of [320,390,1280]) {
            await page.setViewportSize({ width, height: 844 });
            await page.evaluate(() => { calculateRealVh(); switchTab('home'); });
            const bounds = await page.locator('.home-shortcut-grid > button').evaluateAll(buttons => buttons.map(button => {
                const box = button.getBoundingClientRect(); const text = button.querySelector('span');
                return { y: box.y, width: box.width, fits: text.scrollWidth <= box.width - 2 };
            }));
            assert.equal(bounds.length, 3);
            assert.ok(bounds.every(box => box.y === bounds[0].y && Math.abs(box.width - bounds[0].width) < 1 && box.fits));
            await page.screenshot({ path: path.join(os.tmpdir(), `achievement-home-${width}.png`) });
        }
        await page.setViewportSize({ width: 390, height: 844 });
        await page.locator('.home-shortcut-card.achievements').click();
        await page.evaluate(() => {
            achievementReady = true;
            achievementState = awardAchievementTiers({ totals: { number_ten: 7, ws_solo_5_completed: 2 } }, Date.now());
            Object.values(achievementState.unlocked).forEach(item => { item.seenAt = 1; });
            window.fixtureAchievements = achievementState;
            renderAchievements();
        });
        assert.equal(await page.locator('.achievement-track').count(), 31);
        assert.equal(await page.locator('.achievement-track progress').count(), 31);
        assert.equal(await page.locator('#achievements-screen').isVisible(), true);
        await page.locator('#achievement-review').click();
        assert.equal(await page.locator('.achievement-reward-group').count(), 2);
        assert.equal(await page.locator('.achievement-reward').count(), 4);
        await page.locator('.achievement-reward img').evaluateAll(images => Promise.all(images.flatMap(image => image.getAnimations().map(animation => animation.finished))));
        await page.screenshot({ path: path.join(os.tmpdir(), 'achievement-grouped-rewards.png') });
        await page.locator('#achievement-continue').click();
        await page.locator('#achievement-back').click();
        await page.locator('.home-shortcut-card.achievements').click();
        assert.equal(await page.locator('#achievements-screen').isVisible(), true, 'Reopening after rewards shows achievements, not Games');
        assert.equal(await page.locator('#main-dashboard').isVisible(), false);
        await page.waitForFunction(() => [...document.querySelectorAll('.achievement-track img')].every(image => image.complete && image.naturalWidth > 0));
        await page.screenshot({ path: path.join(os.tmpdir(),'achievement-tracks.png') });
        await page.locator('[data-track="number-total"]').click();
        assert.equal(await page.locator('#achievement-filters').isVisible(), false);
        assert.equal(await page.locator('.achievement-tier').count(), 15);
        assert.equal(await page.locator('.achievement-tier img:not(.locked)').count(), 2);
        await page.screenshot({ path: path.join(os.tmpdir(),'achievement-tiers.png') });
        await page.locator('#achievement-back').click();
        await page.evaluate(() => {
            localStorage.removeItem('achievement-seen:Peter');
            achievementState = awardAchievementTiers({ totals: { number_ten: 1 } }, Date.now());
            window.fixtureAchievements = achievementState;
            setActiveAppView('rps'); rpsState = { status: 'active' };
            maybeRevealAchievements();
        });
        assert.equal(await page.locator('#achievement-reveal').evaluate(el => el.open), false, 'Active competition is uninterrupted');
        await page.evaluate(() => { rpsState.status = 'finished'; maybeRevealAchievements(); });
        assert.equal(await page.locator('#achievement-reveal').evaluate(el => el.open), true);
        await page.locator('.achievement-reward img').evaluateAll(images => Promise.all(images.flatMap(image => image.getAnimations().map(animation => animation.finished))));
        await page.screenshot({ path: path.join(os.tmpdir(),'achievement-reveal.png') });
        await page.locator('#achievement-continue').click();
        await page.evaluate(() => maybeRevealAchievements());
        assert.equal(await page.locator('#achievement-reveal').evaluate(el => el.open), false, 'Acknowledged rewards do not replay');
        await page.evaluate(() => {
            achievementState = awardAchievementTiers({ totals: { ws_solo_5_words: 5 } }, Date.now()); window.fixtureAchievements = achievementState;
            wordSearchSettings.mode = 'solo'; setActiveAppView('word-search'); maybeRevealAchievements();
        });
        assert.equal(await page.evaluate(() => activeAppView), 'word-search-menu');
        await page.locator('#achievement-continue').click();
        assert.equal(await page.evaluate(() => activeAppView), 'word-search');
        await page.evaluate(() => {
            openSharedGameMenu('word-search');
            achievementState = awardAchievementTiers({ totals: { ws_solo_5_words: 15 } }, Date.now()); window.fixtureAchievements = achievementState; maybeRevealAchievements();
        });
        await page.locator('#achievement-continue').click();
        assert.equal(await page.evaluate(() => activeAppView), 'word-search-menu', 'Already paused game stays paused');
        await page.evaluate(() => {
            switchTab('home');
            achievementState = awardAchievementTiers({ totals: { number_ten: 750, ws_solo_5_completed: 500 } }, Date.now());
            window.fixtureAchievements = achievementState;
            openAchievements();
        });
        await page.locator('#achievement-review').click();
        assert.equal(await page.locator('.achievement-reward').count(), 33);
        assert.equal(await page.locator('.achievement-reward-group').count(), 2);
        for (const width of [320, 390, 1280]) {
            await page.setViewportSize({ width, height: 844 });
            assert.ok(await page.locator('#achievement-reveal').evaluate(el => el.scrollWidth <= el.clientWidth), 'Large batch has no horizontal overflow');
        }
        await page.locator('#achievement-continue').click();
        assert.equal(await page.locator('#achievements-screen').isVisible(), true);
        assert.deepEqual(errors, []);
        console.log('PASS: three-column Home, real badge loading, progress bars, all tier details, safe competitive queues, persistent reveal acknowledgement and solo pause/resume.');
    } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });

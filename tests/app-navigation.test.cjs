const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '..');

(async () => {
    const browser = await chromium.launch({ channel: 'msedge', headless: true });
    try {
        const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
        const errors = [];
        page.on('pageerror', error => errors.push(error.message));
        await page.route('**/*', route => route.abort());
        await page.setContent(fs.readFileSync(path.join(root, 'index.html'), 'utf8').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ''));
        for (const file of ['styles.css', 'realm-hub.css']) await page.addStyleTag({ content: fs.readFileSync(path.join(root, file), 'utf8') });
        await page.evaluate(() => {
            const snapshot = { val: () => null, exists: () => false, forEach: () => {} };
            const ref = {
                on() {}, off() {}, once: async (_, callback) => { callback?.(snapshot); return snapshot; },
                set: async () => {}, update: async () => {}, remove: async () => {},
                push: () => ({ key: 'fixture-key', set: async () => {} }),
                transaction: async () => ({ committed: false, snapshot }),
                orderByChild() { return this; }, limitToLast() { return this; }, onDisconnect() { return this; }
            };
            const auth = { currentUser: { uid: 'fixture', email: 'test@example.invalid' }, onAuthStateChanged() {} };
            window.firebase = { initializeApp() {}, auth: () => auth, database: () => ({ ref: () => ref }) };
            window.firebase.database.ServerValue = { TIMESTAMP: 1 };
            window.AudioContext = undefined;
            window.webkitAudioContext = undefined;
        });
        for (const file of ['app.js', 'wordsearch.js', 'battleship.js', 'connect-four.js', 'sudoku.js', 'tic-tac-toe.js', 'rps.js', 'realm-hub.js']) await page.addScriptTag({ content: fs.readFileSync(path.join(root, file), 'utf8') });
        await page.evaluate(() => showAuthenticatedApp('Peter'));
        const visible = () => page.locator('.screen:not(.hidden)').evaluateAll(screens => screens.map(screen => screen.id));
        assert.deepEqual(await visible(), ['home-screen']);
        for (const [tab, id] of [['games', 'main-dashboard'], ['messages', 'messages-screen'], ['alerts', 'notifications-screen'], ['profile', 'profile-screen'], ['home', 'home-screen']]) {
            await page.evaluate(tab => switchTab(tab), tab);
            assert.deepEqual(await visible(), [id]);
        }
        assert.ok(await page.locator('.bottom-nav-bar').evaluateAll(bars => bars.every(bar => !bar.textContent.includes('Stats'))));
        await page.evaluate(() => openStatsScreen());
        for (const game of ['number-guess', 'word-search', 'battleship', 'connect-four', 'sudoku', 'tic-tac-toe', 'rps']) {
            await page.evaluate(game => openStatsCategory(game), game);
            assert.equal(await page.locator(`#stats-${game}-detail`).isVisible(), true);
            await page.evaluate(() => closeStatsCategory());
        }
        await page.evaluate(() => { latestStats = { Peter: { ten: 2, hundred: 3, colours: 4 } }; openNumberGuessStats(); });
        assert.deepEqual(await visible(), ['game-1-to-10-screen']);
        assert.equal(await page.locator('#number-guess-pause-peter-total').textContent(), '9');
        await page.evaluate(() => exitGame());
        assert.deepEqual(await visible(), ['main-dashboard']);
        assert.equal(await page.locator('#dashboard-nav-shell .active-tab span').textContent(), 'Games');
        await page.evaluate(() => switchTab('home'));
        await page.evaluate(() => openRealmHub());
        assert.deepEqual(await visible(), ['realm-hub-screen']);
        await page.evaluate(() => closeRealmHub());
        assert.deepEqual(await visible(), ['home-screen']);
        await page.evaluate(async () => {
            const entering = openRealmHub();
            await new Promise(resolve => setTimeout(resolve, 350));
            history.back();
            await entering;
        });
        await page.waitForFunction(() => activeAppView === 'home' && !realmTransitioning);
        assert.deepEqual(await visible(), ['home-screen']);
        assert.deepEqual(errors, []);
        console.log('PASS: full script loading, main tabs, all stats categories, in-game stats, game exit highlighting and Back during portal transition.');
    } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });

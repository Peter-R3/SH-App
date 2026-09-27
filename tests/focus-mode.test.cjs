const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '..');

(async () => {
    const browser = await chromium.launch({ channel: 'msedge', headless: true });
    try {
        const page = await browser.newPage();
        const errors = [];
        page.on('pageerror', error => errors.push(error.message));
        await page.route('**/*', route => route.abort());
        await page.route('https://app.test/', route => route.fulfill({ contentType: 'text/html', body: '<html></html>' }));
        await page.goto('https://app.test/');
        await page.setContent(fs.readFileSync(path.join(root, 'index.html'), 'utf8').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ''));
        for (const file of ['styles.css', 'game-pause.css', 'achievements.css', 'game-history.css', 'focus-mode.css']) await page.addStyleTag({ content: fs.readFileSync(path.join(root, file), 'utf8') });
        await page.evaluate(() => {
            const snapshot = { val: () => null, exists: () => false, forEach() {} };
            const ref = { on() {}, off() {}, once: async () => snapshot, set: async () => {}, update: async () => {}, remove: async () => {}, transaction: async () => ({ committed: false, snapshot }), onDisconnect() { return this; }, orderByChild() { return this; }, limitToLast() { return this; } };
            window.firebase = { initializeApp() {}, auth: () => ({ currentUser: { uid: 'fixture' }, onAuthStateChanged() {} }), database: () => ({ ref: () => ref }) };
            window.firebase.database.ServerValue = { TIMESTAMP: 1 };
            window.AudioContext = undefined;
            window.webkitAudioContext = undefined;
        });
        for (const file of ['app.js', 'store.js', 'minecraft-words.js', 'wordsearch.js', 'battleship.js', 'connect-four.js', 'sudoku.js', 'tic-tac-toe.js', 'rps.js', 'realm-hub.js', 'realm-planner.js', 'game-pause.js', 'achievements.js', 'game-history.js', 'focus-mode.js']) await page.addScriptTag({ content: fs.readFileSync(path.join(root, file), 'utf8') });
        await page.evaluate(() => { showAuthenticatedApp('Peter'); initialiseGamePauseMenus(); switchTab('profile'); });
        await page.locator('#profile-focus-enabled').check();
        await page.evaluate(() => {
            wordSearchPuzzle = createWordSearchPuzzle(9, 'minecraft');
            renderWordSearchBoard();
            sudokuState = createSudokuState(createSudokuPuzzle('easy'));
            renderSudokuBoard(false);
            battleshipState = createBattleshipMatch();
            renderBattleship();
            connectFourState = createConnectFourMatch();
            renderConnectFour();
            ticTacToeState = createTicTacToeState('versus-ai');
            renderTicTacToe();
        });
        assert.equal(await page.evaluate(() => focusModeEnabled), true);
        for (const width of [320, 390, 1280]) {
            await page.setViewportSize({ width, height: width === 320 ? 568 : 844 });
            await page.evaluate(() => calculateRealVh(true));
            for (const game of ['number-guess', 'word-search', 'sudoku', 'battleship', 'connect-four', 'tic-tac-toe', 'rps']) {
                const id = game === 'number-guess' ? 'game-1-to-10-screen' : `${game}-screen`;
                await page.evaluate(({ game, id }) => {
                    closeSharedGameMenu();
                    document.querySelectorAll('.screen').forEach(el => el.classList.add('hidden'));
                    document.getElementById(id).classList.remove('hidden');
                    showNumberGuessPlayArea();
                    setActiveAppView(game);
                    updateFocusModeControls();
                }, { game, id });
                const screen = page.locator(`#${id}`);
                assert.equal(await screen.locator('.dashboard-header').isVisible(), false);
                assert.equal(await screen.locator('.bottom-nav-bar').isVisible(), false);
                await screen.locator('.focus-pause').click();
                await page.waitForFunction(id => document.querySelector(`#${id} .focus-pause`).getAttribute('aria-label') === 'Resume game', id);
                assert.ok(await screen.locator('.focus-game-controls').evaluate(el => !el.inert && getComputedStyle(el).filter === 'none'));
                const menu = screen.locator(game === 'number-guess' ? '#number-guess-menu-area' : '.shared-game-menu');
                assert.ok(await menu.evaluate(el => el.scrollHeight <= el.clientHeight + 1), `${game} pause must fit at ${width}`);
                const before = await page.evaluate(() => JSON.stringify({ number: gameState1To10, words: wordSearchPuzzle, sudoku: sudokuState }));
                await screen.locator('.focus-mode-toggle').click();
                assert.equal(await screen.locator('.dashboard-header').isVisible(), true);
                await screen.locator('.focus-mode-toggle').click();
                assert.equal(await page.evaluate(() => JSON.stringify({ number: gameState1To10, words: wordSearchPuzzle, sudoku: sudokuState })), before);
                await page.screenshot({ path: path.join(os.tmpdir(), `focus-${game}-${width}.png`) });
                await screen.locator('.focus-pause').click();
                assert.equal(await menu.isVisible(), false);
                await page.screenshot({ path: path.join(os.tmpdir(), `focus-play-${game}-${width}.png`) });
                assert.ok(await screen.evaluate(el => el.scrollWidth <= el.clientWidth), `${game} has no horizontal overflow`);
                await screen.locator('.focus-exit').click();
                assert.equal(await page.locator('#main-dashboard').isVisible(), true);
                assert.equal(await page.evaluate(() => focusModeEnabled), true);
            }
        }
        await page.evaluate(() => { loadFocusModePreference('Jadey'); });
        assert.equal(await page.evaluate(() => focusModeEnabled), false);
        await page.evaluate(() => loadFocusModePreference('Peter'));
        assert.equal(await page.evaluate(() => focusModeEnabled), true);
        await page.evaluate(() => { wordSearchSettings.mode = 'versus'; setActiveAppView('word-search'); });
        await page.evaluate(() => { void exitFocusGame('word-search'); });
        assert.equal(await page.locator('#game-confirm-dialog').isVisible(), true);
        await page.locator('#game-confirm-dialog button[value="cancel"]').click();
        assert.equal(await page.evaluate(() => activeAppView), 'word-search');
        assert.deepEqual(errors, []);
        console.log('PASS: seven games at three widths, accessible pause/exit controls, unchanged state, remembered profile preference and competitive exit confirmation.');
    } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });

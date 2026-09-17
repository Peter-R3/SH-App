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
        await page.route('**/*', route => route.abort());
        await page.setContent(fs.readFileSync(path.join(root, 'index.html'), 'utf8').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ''));
        for (const file of ['styles.css', 'realm-hub.css', 'game-pause.css']) await page.addStyleTag({ content: fs.readFileSync(path.join(root, file), 'utf8') });
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
        for (const file of ['app.js', 'wordsearch.js', 'battleship.js', 'connect-four.js', 'sudoku.js', 'tic-tac-toe.js', 'rps.js', 'realm-hub.js', 'game-pause.js']) await page.addScriptTag({ content: fs.readFileSync(path.join(root, file), 'utf8') });
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
        await page.evaluate(() => openNumberGuessPause());
        const numberTab = page.locator('[onclick="toggleNumberGuessPause()"]');
        assert.equal(await numberTab.locator('span').textContent(), 'Play');
        await numberTab.click();
        assert.equal(await numberTab.locator('span').textContent(), 'Pause');
        for (const width of [320, 390, 1280]) {
            await page.setViewportSize({ width, height: width === 320 ? 568 : 844 });
            await page.evaluate(() => calculateRealVh(true));
            for (const game of ['word-search', 'sudoku', 'battleship', 'connect-four', 'tic-tac-toe', 'rps']) {
                await page.evaluate(game => openSharedGameMenu(game), game);
                assert.deepEqual(await visible(), [game + '-screen']);
                const screen = page.locator('#' + game + '-screen');
                const tab = screen.locator('[data-pause-game]');
                assert.equal(await tab.textContent(), 'Play');
                if (game === 'rps') {
                    await page.evaluate(() => { rpsState = { mode: 'versus', status: 'active', players: { Peter: true, Jadey: true }, choices: {} }; renderRps(); });
                    await screen.locator('.shared-game-menu').evaluate(menu => Promise.all(menu.getAnimations().map(animation => animation.finished)));
                    await page.screenshot({ path: path.join(os.tmpdir(), 'shared-pause-' + width + '.png') });
                }
                assert.ok(await screen.evaluate(element => {
                    const menu = element.querySelector('.shared-game-menu').getBoundingClientRect();
                    const header = element.querySelector('.dashboard-header').getBoundingClientRect();
                    const nav = element.querySelector('.bottom-nav-bar').getBoundingClientRect();
                    return menu.top >= header.bottom - 1 && menu.bottom <= nav.top + 1;
                }), game + ': menu between navigation bars');
                await screen.locator('[data-pause-action=stats]').click();
                assert.equal(await screen.locator('.shared-submenu h2').textContent(), 'Statistics');
                if (game === 'rps' && width === 390) await page.screenshot({ path: path.join(os.tmpdir(), 'shared-pause-stats.png') });
                await screen.locator('[data-pause-action=back]').click();
                if (['word-search', 'sudoku', 'tic-tac-toe', 'rps'].includes(game)) {
                    await screen.locator('[data-pause-action=settings]').click();
                    const modesOnly = ['tic-tac-toe', 'rps'].includes(game);
                    assert.equal(await screen.locator('.shared-submenu h2').textContent(), modesOnly ? 'Modes' : 'Game Settings');
                    assert.equal(await screen.locator(modesOnly ? '.mode-option-btn' : '.game-custom-select').count() > 0, true);
                    if (game === 'word-search' && width === 390) await page.screenshot({ path: path.join(os.tmpdir(), 'word-search-settings.png') });
                }
                await tab.click();
                assert.equal(await tab.textContent(), 'Pause');
                assert.equal(await screen.locator('.shared-game-menu').isVisible(), false);
                await page.evaluate(game => openSharedGameMenu(game), game);
                await page.evaluate(() => switchTab('home'));
                assert.deepEqual(await visible(), ['home-screen']);
            }
        }
        await page.evaluate(() => {
            wordSearchSettings = { mode: 'solo', difficulty: 7, aiDifficulty: 'medium' };
            wordSearchLobbyState = createWordSearchState(createWordSearchPuzzle(7));
            setActiveAppView('word-search-lobby');
            document.querySelectorAll('.screen').forEach(screen => screen.classList.add('hidden'));
            document.getElementById('word-search-screen').classList.remove('hidden');
            showWordSearchLobby({ status: `${wordSearchLobbyState.puzzle.words.length} words to find` });
        });
        assert.equal(await page.locator('#word-search-lobby').isVisible(), true);
        assert.equal(await page.locator('#word-search-content').isVisible(), false);
        await page.screenshot({ path: path.join(os.tmpdir(), 'word-search-lobby.png') });
        await page.evaluate(() => { openSharedGameMenu('word-search'); resumeSharedGame(); });
        assert.equal(await page.evaluate(() => activeAppView), 'word-search-lobby');
        await page.locator('#word-search-lobby .word-search-lobby-settings').click();
        await page.getByRole('button', { name: 'Back to lobby', exact: true }).click();
        assert.equal(await page.locator('#word-search-lobby').isVisible(), true);
        assert.equal(await page.locator('#word-search-screen .shared-game-menu').isVisible(), false);
        assert.equal(await page.evaluate(() => activeAppView), 'word-search-lobby');
        await page.locator('#word-search-lobby-primary').click();
        assert.equal(await page.locator('#word-search-lobby').isVisible(), false);
        assert.equal(await page.locator('#word-search-content').isVisible(), true);
        await page.evaluate(() => {
            wordSearchPuzzle = wordSearchLobbyState.puzzle;
            wordSearchStartedAt = wordSearchLobbyState.startedAt;
            showWordSearchCompletionCue();
        });
        const cue = page.locator('#word-search-complete-overlay');
        assert.equal(await cue.isVisible(), true);
        assert.equal(await cue.textContent(), 'Grid complete');
        assert.equal(await cue.evaluate(el => el.style.getPropertyValue('--turn-cue-colour')), await page.evaluate(() => themeColorFor(localPlayer)));
        await page.waitForTimeout(1100);
        await page.evaluate(() => showWordSearchCompletionCue());
        assert.equal(await cue.isVisible(), false, 'Completion cue only plays once per grid');
        await page.evaluate(() => {
            switchTab('home');
            sudokuSettings = { mode: 'versus-ai', difficulty: 'easy', aiDifficulty: 'medium' };
            sudokuState = createAiSudokuState(createSudokuPuzzle('easy'));
            document.querySelectorAll('.screen').forEach(screen => screen.classList.add('hidden'));
            document.getElementById('sudoku-screen').classList.remove('hidden');
            setActiveAppView('sudoku-lobby');
            showSudokuLobby();
            scheduleSudokuAi(sudokuState);
        });
        await page.locator('#sudoku-lobby .word-search-lobby-settings').click();
        await page.getByRole('button', { name: 'Back to lobby', exact: true }).click();
        assert.equal(await page.evaluate(() => activeAppView), 'sudoku-lobby');
        await page.waitForTimeout(1100);
        assert.equal(await page.evaluate(() => sudokuState.aiActiveMs), 0);
        await page.locator('#sudoku-lobby-primary').click();
        assert.equal(await page.locator('#sudoku-lobby-status').textContent(), 'Starting in 5...');
        await page.waitForFunction(() => activeAppView === 'sudoku');
        assert.equal(await page.locator('#sudoku-lobby').isVisible(), false);
        await page.evaluate(() => { clearInterval(sudokuAiTimer); showSudokuCompletionCue(); });
        assert.equal(await page.locator('#sudoku-complete-overlay').isVisible(), true);
        assert.equal(await page.locator('#sudoku-complete-overlay').textContent(), 'Puzzle complete');
        await page.waitForTimeout(1100);
        await page.evaluate(() => showSudokuCompletionCue());
        assert.equal(await page.locator('#sudoku-complete-overlay').isVisible(), false);
        await page.evaluate(async () => {
            const originalRef = database.ref;
            sudokuSettings.mode = 'solo';
            let stored = createSudokuState(createSudokuPuzzle('easy'));
            stored.startedAt -= 60000;
            database.ref = () => ({ transaction: async update => {
                stored = update(structuredClone(stored));
                return { committed: true, snapshot: { val: () => stored } };
            } });
            try {
                sudokuState = structuredClone(stored);
                sudokuLobbyEnteredAt = Date.now() - 60000;
                activeAppView = 'sudoku-lobby';
                await startPreparedSudoku();
                if (!stored.playStarted || Date.now() - stored.startedAt > 1000) throw new Error('Fresh puzzle timer includes lobby wait');
                sudokuLobbyEnteredAt = Date.now() - 60000;
                activeAppView = 'sudoku-lobby';
                await startPreparedSudoku();
                if (stored.pausedMs < 60000) throw new Error('Resumed puzzle includes lobby wait');
            } finally { database.ref = originalRef; }
        });
        await page.evaluate(() => {
            sudokuSettings.mode = 'solo';
            sudokuState = { startedAt: Date.now() - 120000 };
            openSharedGameMenu('sudoku');
            sharedPauseSession.openedAt -= 60000;
            resumeSharedGame();
            if (sudokuState.pausedMs < 60000) throw new Error('Solo pause time was not excluded');
        });
        await page.evaluate(() => {
            sudokuSettings.mode = 'versus-ai';
            sudokuState = { aiDuration: 100000, aiActiveMs: 0 };
            openSharedGameMenu('sudoku');
            scheduleSudokuAi(sudokuState);
        });
        await page.waitForTimeout(1200);
        assert.equal(await page.evaluate(() => sudokuState.aiActiveMs), 0, 'Jaylin does not advance in menu');
        await page.evaluate(() => { clearInterval(sudokuAiTimer); closeSharedGameMenu(); });
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
        await page.setViewportSize({ width: 390, height: 844 });
        for (const [id, launch] of [['connect-four', 'launchConnectFour'], ['tic-tac-toe', 'launchTicTacToe'], ['rps', 'launchRps']]) {
            await page.evaluate(launch => window[launch](), launch);
            const lobby = page.locator(`#${id}-screen .quick-game-lobby`);
            await page.waitForFunction(id => !document.querySelector(`#${id}-screen .quick-game-lobby .word-search-lobby-primary`).disabled, id);
            assert.equal(await lobby.isVisible(), true);
            assert.equal(await lobby.locator('.word-search-lobby-primary').textContent(), 'Invite player');
            if (id !== 'connect-four') {
                await lobby.locator('.word-search-lobby-settings').click();
                assert.equal(await page.locator(`#${id}-screen .mode-option-btn`).count(), 2);
                assert.equal(await page.locator(`#${id}-screen .shared-submenu .sound-effects-toggle`).count(), 0);
                await page.screenshot({ path: path.join(os.tmpdir(), `${id}-modes.png`), animations: 'disabled' });
                await page.getByRole('button', { name: 'Back to lobby', exact: true }).click();
                assert.equal(await lobby.isVisible(), true);
            }
            await page.screenshot({ path: path.join(os.tmpdir(), `${id}-lobby.png`), animations: 'disabled' });
            await page.evaluate(() => switchTab('home'));
        }
        await page.evaluate(() => { window.confirmationResult = null; confirmNewPuzzle('New puzzle?', 'Replace this puzzle?', 'New puzzle').then(value => window.confirmationResult = value); });
        await page.locator('#game-confirm-dialog button[value=cancel]').click();
        await page.waitForFunction(() => window.confirmationResult === false);
        await page.evaluate(() => { window.confirmationResult = null; confirmNewPuzzle('New grid?', 'Replace this grid?', 'New grid').then(value => window.confirmationResult = value); });
        await page.locator('#game-confirm-dialog button[value=confirm]').click();
        await page.waitForFunction(() => window.confirmationResult === true);
        await page.evaluate(() => {
            window.originalPuzzleRef = database.ref;
            window.puzzleWrites = 0;
            window.puzzleData = {};
            database.ref = path => ({
                once: async () => ({ val: () => window.puzzleData[path] || null }),
                set: async value => { if (/^(wordSearch|sudoku)\/solo\//.test(path)) window.puzzleWrites++; window.puzzleData[path] = value; },
                transaction: async update => {
                    const value = update(window.puzzleData[path] || null);
                    if (value !== undefined) window.puzzleData[path] = value;
                    return { committed: value !== undefined, snapshot: { val: () => window.puzzleData[path] } };
                }
            });
            wordSearchSettings.mode = 'solo';
            sudokuSettings.mode = 'solo';
            setActiveAppView('word-search');
            window.cancelledRequestDone = false;
            requestNewWordSearchGrid().then(() => { window.cancelledRequestDone = true; });
        });
        await page.locator('#game-confirm-dialog button[value=cancel]').click();
        await page.waitForFunction(() => window.cancelledRequestDone);
        assert.equal(await page.evaluate(() => window.puzzleWrites), 0);
        await page.evaluate(() => { requestNewWordSearchGrid(); });
        await page.locator('#game-confirm-dialog button[value=confirm]').click();
        await page.waitForTimeout(200);
        assert.deepEqual(errors, []);
        await page.waitForFunction(() => window.puzzleWrites > 0 && activeAppView === 'word-search' && !document.getElementById('word-search-content').classList.contains('hidden'));
        assert.equal(await page.locator('#word-search-lobby').isVisible(), false);
        await page.evaluate(() => { setActiveAppView('sudoku'); requestNewSudokuPuzzle(); });
        await page.locator('#game-confirm-dialog button[value=confirm]').click();
        await page.waitForFunction(() => window.puzzleWrites > 1 && activeAppView === 'sudoku' && document.getElementById('sudoku-lobby').classList.contains('hidden'));
        await page.evaluate(() => { database.ref = window.originalPuzzleRef; });
        assert.deepEqual(errors, []);
        console.log('PASS: full script loading, navigation, six pause menus at three widths, Play toggles, scoped stats, solo/Jaylin pause checks and portal Back.');
    } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });

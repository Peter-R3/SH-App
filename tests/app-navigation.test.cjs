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
        await page.route('**/assets/currency/Coin.svg*', route => route.fulfill({ contentType: 'image/svg+xml', body: fs.readFileSync(path.join(root, 'assets/currency/Coin.svg')) }));
        await page.setContent(fs.readFileSync(path.join(root, 'index.html'), 'utf8').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '').replace('<head>', '<head><base href="https://app.test/">'));
        for (const file of ['styles.css', 'realm-hub.css', 'realm-planner.css', 'game-pause.css', 'achievements.css', 'game-history.css', 'store.css']) await page.addStyleTag({ content: fs.readFileSync(path.join(root, file), 'utf8') });
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
        for (const file of ['app.js', 'store.js', 'wordsearch.js', 'battleship.js', 'connect-four.js', 'sudoku.js', 'tic-tac-toe.js', 'rps.js', 'realm-hub.js', 'realm-planner.js', 'game-pause.js', 'achievements.js', 'game-history.js']) await page.addScriptTag({ content: fs.readFileSync(path.join(root, file), 'utf8') });
        await page.evaluate(() => showAuthenticatedApp('Peter'));
        const visible = () => page.locator('.screen:not(.hidden)').evaluateAll(screens => screens.map(screen => screen.id));
        assert.deepEqual(await visible(), ['home-screen']);
        const greeting = await page.locator('.home-greeting h2').textContent();
        assert.ok(greeting && !greeting.endsWith(','));
        assert.equal(await page.locator('.home-greeting p, #home-greeting-name').count(), 0);
        await page.evaluate(() => applyNicknameRecords({ Peter: { value: 'Pet name' } }));
        assert.equal(await page.locator('.home-greeting h2').textContent(), greeting, 'Nickname sync does not overwrite the greeting');
        await page.evaluate(() => switchTab('home'));
        assert.notEqual(await page.locator('.home-greeting h2').textContent(), greeting);
        for (const [tab, id] of [['games', 'main-dashboard'], ['store', 'store-screen'], ['messages', 'messages-screen'], ['alerts', 'notifications-screen'], ['profile', 'profile-screen'], ['home', 'home-screen']]) {
            await page.evaluate(tab => switchTab(tab), tab);
            assert.deepEqual(await visible(), [id]);
        }
        assert.ok(await page.locator('.bottom-nav-bar').evaluateAll(bars => bars.every(bar => !bar.textContent.includes('Stats'))));
        assert.ok(await page.locator('.bottom-nav-bar').evaluateAll(bars => bars.every(bar => Array.from(bar.querySelectorAll('.nav-tab-btn > span:not(.notification-badge)')).slice(0,4).map(el => el.textContent.trim()).join(',') === 'Home,Store,Messages,Alerts')));
        await page.locator('#home-nav-shell [onclick="switchTab(\'store\')"]').click();
        assert.equal(await page.locator('.store-category').count(), 2);
        assert.equal(await page.locator('[data-store-item]').count(), 0);
        assert.equal(await page.locator('.store-palette').isVisible(), false);
        assert.equal(await page.locator('#store-coin-balance span').textContent(), '0');
        await page.waitForFunction(() => document.querySelector('#store-coin-balance img').naturalWidth > 0);
        assert.equal(await page.locator('#store-screen .store-heading h2').textContent(), 'Browse the collection');
        const beforePreview = await page.evaluate(() => JSON.stringify({ profiles: playerProfiles, photos: profilePhotos }));
        for (const width of [320,390,1280]) {
            await page.setViewportSize({ width, height: 844 });
            await page.evaluate(() => calculateRealVh(true));
            await page.screenshot({ path: path.join(os.tmpdir(), `store-categories-${width}.png`) });
            assert.ok(await page.locator('.store-content').evaluate(el => el.scrollWidth <= el.clientWidth));
            for (const [category, ids] of [['frames', ['sweetheart','pearl','double','glow','stitched','satin']], ['messages', ['love-note']]]) {
                await page.locator(`[data-store-category="${category}"]`).click();
                assert.equal(await page.locator('[data-store-item]').count(), ids.length);
                await page.locator('.store-grid').evaluate(el => Promise.all(el.getAnimations({ subtree: true }).map(a => a.finished)));
                await page.screenshot({ path: path.join(os.tmpdir(), `store-${category}-${width}.png`) });
                for (const id of ids) {
                await page.locator(`[data-store-item="${id}"]`).click();
                assert.equal(await page.locator('#store-preview').isVisible(), true);
                await page.locator('#store-preview').evaluate(el => Promise.all(el.getAnimations({ subtree: true }).map(animation => animation.finished)));
                assert.ok(await page.locator('#store-preview').evaluate(el => el.scrollWidth <= el.clientWidth));
                await page.screenshot({ path: path.join(os.tmpdir(), `store-${id}-${width}.png`) });
                const control = page.locator('#store-adjustment');
                if (await control.getAttribute('type') === 'checkbox') {
                    await control.uncheck();
                    assert.equal(await page.locator('#store-preview .store-hide-detail').count(), 1);
                } else {
                    await control.fill(await control.getAttribute('max'));
                    assert.equal(await page.locator('#store-adjustment-value').textContent(), (await control.getAttribute('max')) + (['pearl','double','stitched'].includes(id) ? 'px' : '%'));
                }
                await page.locator('[data-store-reset]').click();
                if (await control.getAttribute('type') === 'checkbox') assert.equal(await control.isChecked(), true);
                else assert.equal(Number(await control.inputValue()), await page.evaluate(id => storeConcepts.find(item => item.id === id).adjustment.default, id));
                await page.keyboard.press('Escape');
                }
                await page.locator('[data-store-category=""]').click();
            }
        }
        await page.locator('[data-store-category=messages]').click();
        assert.equal(await page.locator('.store-item').count(), 1);
        await page.locator('[data-store-category=""]').click();
        await page.locator('[data-store-category=frames]').click();
        assert.equal(await page.locator('.store-item').count(), 6);
        const originalThemes = await page.evaluate(() => JSON.stringify(playerThemes));
        await page.locator('#store-screen [data-store-colour="#FFD1DC"]').click();
        await page.locator('[data-store-item=sweetheart]').click();
        assert.equal(await page.locator('#store-preview').evaluate(el => el.style.getPropertyValue('--decor-accent')), '#FFD1DC');
        await page.locator('#store-preview [data-store-colour="#15AFD1"]').click();
        assert.equal(await page.locator('#store-screen').evaluate(el => el.style.getPropertyValue('--decor-accent')), '#15AFD1');
        await page.locator('.store-custom-colour summary').click();
        await page.locator('#store-colour-hex').fill('#ABCDEF');
        assert.equal(await page.locator('#store-preview').evaluate(el => el.style.getPropertyValue('--decor-accent')), '#ABCDEF');
        await page.locator('#store-colour-hex').fill('invalid');
        assert.equal(await page.locator('#store-colour-hex').getAttribute('aria-invalid'), 'true');
        assert.equal(await page.locator('#store-preview').evaluate(el => el.style.getPropertyValue('--decor-accent')), '#ABCDEF');
        await page.locator('#store-colour-h').fill('170');
        assert.equal(await page.locator('#store-colour-hex').getAttribute('aria-invalid'), null);
        await page.keyboard.press('Escape');
        assert.equal(await page.evaluate(() => JSON.stringify(playerThemes)), originalThemes, 'Preview colours never change actual themes');
        assert.equal(await page.evaluate(() => JSON.stringify({ profiles: playerProfiles, photos: profilePhotos })), beforePreview, 'Preview does not equip cosmetics or alter profiles');
        assert.equal(await page.locator('#store-screen button, #store-preview button').evaluateAll(buttons => buttons.some(b => /buy|purchase|equip/i.test(b.textContent))), false);
        await page.evaluate(() => { localPlayer = 'Jadey'; switchTab('store'); });
        assert.equal(await page.locator('#store-top-nickname').textContent(), await page.evaluate(() => playerProfiles.Jadey.nickname));
        assert.equal(await page.locator('.store-category').count(), 2);
        await page.locator('[data-store-category=frames]').click();
        await page.locator('[data-store-item=sweetheart]').click();
        await page.locator('#store-preview [aria-label="Close preview"]').click();
        await page.emulateMedia({ reducedMotion: 'reduce' });
        await page.locator('[data-store-item=pearl]').click();
        assert.equal(await page.locator('#store-preview').evaluate(el => el.getAnimations({ subtree: true }).length), 0);
        await page.keyboard.press('Escape');
        await page.emulateMedia({ reducedMotion: 'no-preference' });
        await page.evaluate(() => { localPlayer = 'Peter'; switchTab('home'); });
        await page.locator('.home-shortcut-card.games').click();
        assert.deepEqual(await visible(), ['main-dashboard']);
        await page.evaluate(() => {
            switchTab('home');
            homePresenceReady = true; homePresenceConnected = true;
            homePresenceData = { visible: true, view: 'store', updatedAt: Date.now() };
            renderHomePresence();
        });
        assert.equal(await page.locator('#home-presence').getAttribute('data-status'), 'online');
        await page.setViewportSize({ width: 390, height: 844 });
        await page.evaluate(() => calculateRealVh(true));
        await page.screenshot({ path: path.join(os.tmpdir(), 'home-presence.png') });
        await page.evaluate(() => { homePresenceData.visible = false; renderHomePresence(); });
        assert.equal(await page.locator('#home-presence').getAttribute('data-status'), 'offline');
        await page.evaluate(() => { homePresenceData.visible = true; homePresenceData.updatedAt -= 121000; renderHomePresence(); });
        assert.equal(await page.locator('#home-presence').getAttribute('data-status'), 'offline');
        await page.evaluate(() => { homePresenceConnected = false; renderHomePresence(); });
        assert.match(await page.locator('#home-presence').textContent(), /Status unavailable/);
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
        assert.equal(await page.locator('#dashboard-nav-shell .active-tab span').textContent(), 'Home');
        await page.evaluate(() => openNumberGuessPause());
        const numberTab = page.locator('[onclick="toggleNumberGuessPause()"]');
        assert.equal(await numberTab.locator('span').textContent(), 'Play');
        await numberTab.click();
        assert.equal(await numberTab.locator('span').textContent(), 'Pause');
        for (const width of [320, 390, 1280]) {
            await page.setViewportSize({ width, height: width === 320 ? 568 : 844 });
            await page.evaluate(() => calculateRealVh(true));
            await page.evaluate(() => openNumberGuessPause());
            assert.ok(await page.locator('#number-guess-menu-area').evaluate(el => el.scrollHeight <= el.clientHeight + 1), '1 to 10 pause fits without scrolling');
            const expectedSpacing = await page.locator('#number-guess-pause-panel').evaluate(panel => ({
                gap: getComputedStyle(panel).gap,
                height: getComputedStyle(panel.querySelector('.pause-option-btn')).height,
                padding: getComputedStyle(panel.querySelector('.pause-option-btn')).padding
            }));
            for (const game of ['word-search', 'sudoku', 'battleship', 'connect-four', 'tic-tac-toe', 'rps']) {
                await page.evaluate(game => openSharedGameMenu(game), game);
                assert.deepEqual(await visible(), [game + '-screen']);
                const screen = page.locator('#' + game + '-screen');
                const tab = screen.locator('[data-pause-game]');
                const spacing = await screen.locator('.shared-pause-panel').evaluate(panel => ({
                    gap: getComputedStyle(panel).gap,
                    height: getComputedStyle(panel.querySelector('.pause-option-btn')).height,
                    padding: getComputedStyle(panel.querySelector('.pause-option-btn')).padding
                }));
                assert.deepEqual(spacing, expectedSpacing, `${game}: button spacing matches 1 to 10`);
                assert.ok(await screen.locator('.shared-game-menu').evaluate(el => el.scrollHeight <= el.clientHeight + 1), 'Pause menu fits without scrolling');
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
                await screen.locator('[data-pause-action=history]').click();
                await page.waitForFunction(id => document.querySelector(`#${id}-screen .shared-submenu-content`).textContent.includes('No completed games'), game);
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
        await page.evaluate(async () => {
            const original = database.ref;
            sudokuSettings.mode = 'solo';
            sudokuState.playStarted = false;
            const saved = JSON.parse(JSON.stringify(sudokuState));
            database.ref = path => ({ ...original(path), transaction: async update => {
                if (!update(null)) throw new Error('Cold-cache Sudoku start aborted');
                const value = update(JSON.parse(JSON.stringify(saved)));
                return { committed: Boolean(value), snapshot: { val: () => value } };
            } });
            setActiveAppView('sudoku-lobby');
            showSudokuLobby();
            await startPreparedSudoku();
            database.ref = window.originalPuzzleRef;
        });
        assert.equal(await page.evaluate(() => activeAppView), 'sudoku');
        assert.equal(await page.locator('#sudoku-lobby').isVisible(), false);
        await page.evaluate(() => {
            switchTab('messages');
            window.realViewport = window.visualViewport;
            Object.defineProperty(window, 'visualViewport', { configurable: true, value: { height: 420, offsetTop: 25, scale: 1 } });
            calculateRealVh();
        });
        const keyboardBounds = await page.locator('.app-container').boundingBox();
        assert.equal(Math.round(keyboardBounds.height), 420);
        assert.equal(Math.round(keyboardBounds.y), 25);
        await page.evaluate(() => {
            Object.defineProperty(window, 'visualViewport', { configurable: true, value: window.realViewport });
            calculateRealVh(true);
            switchTab('profile');
            window.nicknameWrites = {};
            window.nicknameData = {};
            database.ref = path => ({
                ...window.originalPuzzleRef(path),
                push: () => ({ key: 'proposal-test' }),
                update: async values => { Object.assign(window.nicknameWrites, values); },
                transaction: async update => {
                    const value = update(JSON.parse(JSON.stringify(window.nicknameData)));
                    if (value) window.nicknameData = value;
                    return { committed: Boolean(value), snapshot: { val: () => value } };
                }
            });
            openNicknameProposal();
        });
        await page.locator('#nickname-proposal-input').fill('Lovely <3');
        await page.locator('#nickname-proposal-dialog button[type=submit]').click();
        await page.waitForFunction(() => !document.getElementById('nickname-proposal-dialog').open);
        assert.equal(await page.evaluate(() => window.nicknameWrites['notifications/proposal-test'].recipient), 'Jadey');
        await page.evaluate(async () => {
            window.nicknameData = { value: 'Sweetheart', proposal: window.nicknameWrites['nicknames/Jadey/proposal'] };
            latestNotifications = [{ id: 'proposal-test', ...window.nicknameWrites['notifications/proposal-test'] }];
            await respondToNicknameProposal('proposal-test', true);
        });
        assert.equal(await page.evaluate(() => window.nicknameData.value), 'Sweetheart', 'Sender cannot accept');
        await page.evaluate(async () => { localPlayer = 'Jadey'; await respondToNicknameProposal('proposal-test', true); });
        assert.equal(await page.evaluate(() => playerProfiles.Jadey.nickname), 'Lovely <3');
        await page.evaluate(async () => {
            window.nicknameData.proposal = { ...window.nicknameWrites['nicknames/Jadey/proposal'], value: 'Declined name' };
            await respondToNicknameProposal('proposal-test', false);
        });
        assert.equal(await page.evaluate(() => window.nicknameData.value), 'Lovely <3', 'Declining preserves nickname');
        await page.evaluate(async () => { await respondToNicknameProposal('proposal-test', true); });
        assert.equal(await page.evaluate(() => window.nicknameData.value), 'Lovely <3', 'Resolved proposal cannot replay');
        await page.evaluate(() => {
            localPlayer = 'Peter';
            switchTab('messages');
            window.messageFixture = { sender: 'Peter', recipient: 'Jadey', text: 'Original message', createdAt: 1 };
            latestMessages = [{ id: 'message-test', ...window.messageFixture }];
            window.messageWrites = [];
            window.messageWriteFailure = false;
            database.ref = path => ({
                ...window.originalPuzzleRef(path),
                once: async () => ({ val: () => window.messageFixture, forEach: callback => {
                    callback({ key: 'linked', val: () => ({ action: 'reply', messageId: 'message-test' }) });
                    callback({ key: 'unrelated', val: () => ({ action: 'reply', messageId: 'other' }) });
                } }),
                transaction: async update => {
                    if (window.messageWriteFailure) throw Object.assign(new Error('Denied'), { code: 'PERMISSION_DENIED' });
                    const value = update(window.messageFixture);
                    if (value) { window.messageFixture = value; window.messageWrites.push(value); }
                    return { committed: Boolean(value), snapshot: { val: () => value } };
                },
                update: async values => {
                    if (window.messageWriteFailure) throw Object.assign(new Error('Denied'), { code: 'PERMISSION_DENIED' });
                    window.messageWrites.push(values);
                }
            });
            selectedMessageActionId = 'message-test';
            editSelectedMessage();
        });
        const messageDialog = page.locator('#message-edit-dialog');
        assert.equal(await messageDialog.locator('textarea').inputValue(), 'Original message');
        await messageDialog.locator('textarea').fill('   ');
        await messageDialog.locator('[type=submit]').click();
        assert.match(await messageDialog.locator('[role=status]').textContent(), /Enter a message/);
        assert.equal(await page.evaluate(() => window.messageWrites.length), 0);
        await messageDialog.locator('textarea').fill('Edited <3');
        await page.evaluate(() => { window.messageWriteFailure = true; });
        await messageDialog.locator('[type=submit]').click();
        await page.waitForFunction(() => document.querySelector('#message-edit-dialog [role=status]').textContent.includes('Could not save'));
        assert.equal(await messageDialog.locator('textarea').inputValue(), 'Edited <3');
        await page.evaluate(() => { window.messageWriteFailure = false; });
        for (const width of [320, 390]) {
            await page.setViewportSize({ width, height: 640 });
            await page.evaluate(() => calculateRealVh());
            const bounds = await messageDialog.boundingBox();
            assert.ok(bounds.x >= 0 && bounds.x + bounds.width <= width && bounds.y >= 0);
        }
        await page.screenshot({ path: path.join(os.tmpdir(), 'message-edit-dialog.png') });
        await messageDialog.locator('[type=submit]').click();
        await page.waitForFunction(() => !document.getElementById('message-edit-dialog').open);
        assert.equal(await page.evaluate(() => window.messageFixture.text), 'Edited <3');
        await page.evaluate(() => {
            latestMessages = [{ id: 'message-test', ...window.messageFixture }];
            selectedMessageActionId = 'message-test'; deleteSelectedMessage();
        });
        assert.equal(await messageDialog.locator('.message-delete-preview').textContent(), 'Edited <3');
        await page.screenshot({ path: path.join(os.tmpdir(), 'message-delete-dialog.png') });
        await messageDialog.locator('[type=button]').click();
        assert.equal(await page.evaluate(() => window.messageWrites.length), 1, 'Cancel does not delete');
        await page.evaluate(() => { selectedMessageActionId = 'message-test'; editSelectedMessage(); });
        await page.mouse.click(2, 2);
        assert.equal(await messageDialog.evaluate(el => el.open), false, 'Backdrop dismisses dialog');
        await page.evaluate(() => { selectedMessageActionId = 'message-test'; deleteSelectedMessage(); });
        await messageDialog.locator('[type=submit]').click();
        await page.waitForFunction(() => !document.getElementById('message-edit-dialog').open);
        assert.deepEqual(await page.evaluate(() => window.messageWrites[1]), { 'messages/message-test': null, 'notifications/linked': null });
        await page.evaluate(() => {
            latestMessages = [{ id: 'other', sender: 'Jadey', text: 'Not mine' }];
            selectedMessageActionId = 'other'; editSelectedMessage();
            selectedMessageActionId = 'other'; deleteSelectedMessage();
        });
        assert.equal(await messageDialog.evaluate(el => el.open), false, 'Other player messages cannot be edited or deleted');
        await page.evaluate(() => {
            window.managementWrites = [];
            database.ref = path => ({
                ...window.originalPuzzleRef(path),
                once: async () => ({ forEach: callback => callback({ key: 'test', val: () => ({ recipient: 'Peter' }) }) }),
                update: async values => { window.managementWrites.push(values); },
                transaction: async update => { window.managementWrites.push({ path, value: update(5) }); return { committed: true }; }
            });
            openManagementScreen();
        });
        const selectManagement = async (id, value) => {
            await page.locator(`#${id}-custom-button`).click();
            await page.locator(`#${id}-custom-options [data-value="${value}"]`).click();
        };
        await selectManagement('score-game', 'sudoku');
        await selectManagement('score-mode', 'versusAi');
        await selectManagement('score-difficulty', 'hard');
        await selectManagement('score-ai-difficulty', 'medium');
        await selectManagement('sudoku-score-metric', 'bestTime');
        assert.equal(await page.locator('#score-metric-custom-button').isVisible(), false);
        await page.evaluate(() => { adjustManagedScores('reset'); });
        await page.locator('#game-confirm-dialog button[value=cancel]').click();
        await page.waitForFunction(() => !document.getElementById('game-confirm-dialog').confirmationPending);
        assert.equal(await page.evaluate(() => window.managementWrites.length), 0);
        await page.evaluate(() => { adjustManagedScores('reset'); });
        await page.locator('#game-confirm-dialog button[value=confirm]').click();
        await page.waitForFunction(() => window.managementWrites.length === 1);
        assert.deepEqual(await page.evaluate(() => window.managementWrites[0]), { 'stats/sudoku/Peter/versusAi/hard/medium/bestTime': 0, 'stats/_achievementEpochs/sudoku_Peter_versusAi_hard_medium_bestTime': 1 });
        await selectManagement('score-game', 'battleship');
        assert.equal(await page.locator('#score-mode-custom-button').isVisible(), false);
        await selectManagement('score-game', 'rps');
        await selectManagement('duel-score-metric', 'roundsPlayed');
        assert.equal(await page.locator('#score-mode-custom-button').isVisible(), true);
        await page.evaluate(() => { clearManagedCommunication('notifications'); });
        await page.locator('#game-confirm-dialog button[value=cancel]').click();
        await page.waitForFunction(() => !document.getElementById('game-confirm-dialog').confirmationPending);
        assert.equal(await page.evaluate(() => window.managementWrites.length), 1);
        await page.evaluate(() => { clearManagedCommunication('notifications'); });
        await page.locator('#game-confirm-dialog button[value=confirm]').click();
        await page.waitForFunction(() => window.managementWrites.length === 2);
        assert.deepEqual(await page.evaluate(() => window.managementWrites[1]), { 'notifications/test': null });
        await page.evaluate(() => { adjustManagedInteractions('reset'); });
        await page.locator('#game-confirm-dialog button[value=confirm]').click();
        await page.waitForFunction(() => window.managementWrites.length === 5);
        await page.setViewportSize({ width: 320, height: 640 });
        await page.locator('#management-profile-custom-button').click();
        await page.screenshot({ path: path.join(os.tmpdir(), 'management-dropdown.png') });
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
        await page.keyboard.press('Escape');
        await page.evaluate(() => { localPlayer = 'Jadey'; clearManagedCommunication('both'); adjustManagedScores('reset'); adjustManagedInteractions('reset'); });
        assert.equal(await page.locator('#game-confirm-dialog').evaluate(el => el.open), false);
        await page.evaluate(() => { database.ref = window.originalPuzzleRef; });
        assert.deepEqual(errors, []);
        console.log('PASS: full script loading, navigation, six pause menus at three widths, Play toggles, scoped stats, solo/Jaylin pause checks and portal Back.');
    } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });

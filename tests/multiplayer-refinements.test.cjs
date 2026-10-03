const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

(async () => {
    const browser = await chromium.launch({ channel: 'msedge', headless: true });
    try {
        const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
        const errors = [];
        page.on('pageerror', error => errors.push(error.message));
        await page.route('**/*', route => route.fulfill({ contentType: 'text/html', body: '<html></html>' }));
        await page.goto('https://refinements.test/');
        await page.setContent(read('index.html').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ''));
        for (const file of ['styles.css', 'game-pause.css']) await page.addStyleTag({ content: read(file) });
        await page.evaluate(() => {
            window.localPlayer = 'Peter';
            window.activeAppView = 'home';
            window.playerProfiles = { Peter: { nickname: 'Peter' }, Jadey: { nickname: 'Jadey' } };
            window.latestStats = {};
            window.sounds = [];
            window.playUiSound = kind => sounds.push(kind);
            window.soundForGameResult = () => {};
            window.otherPlayer = p => p === 'Peter' ? 'Jadey' : 'Peter';
            window.themeColorFor = p => p === 'Peter' ? '#15AFD1' : '#FFD1DC';
            window.textColorFor = () => '#000000';
            window.setActiveAppView = view => { activeAppView = view; };
            window.applyThemeToScreen = () => {};
            window.refreshSharedHeader = () => {};
            window.setActiveNavigationTab = () => {};
            window.updateSoundEffectControls = () => {};
            window.sendAppNotification = () => Promise.resolve();
            window.clearGameNotifications = () => Promise.resolve();
            window.escapeHtml = value => String(value);
            window.loadGameHistory = () => {};
            window.launchWordSearch = window.launchSudoku = window.openWordSearchSettings = window.openSudokuSettings = window.renderWordSearchStats = window.renderSudokuStats = () => {};
            window.records = {};
            window.listeners = new Map();
            window.publish = (key, value) => {
                records[key] = structuredClone(value);
                for (const handler of [...(listeners.get(key) || [])]) queueMicrotask(() => handler({ val: () => structuredClone(records[key]) }));
            };
            window.database = { ref(key) { return {
                on(_, handler) { if (!listeners.has(key)) listeners.set(key, new Set()); listeners.get(key).add(handler); queueMicrotask(() => handler({ val: () => structuredClone(records[key] || null) })); },
                off(_, handler) { listeners.get(key)?.delete(handler); },
                once: async () => ({ val: () => structuredClone(records[key] || null) }),
                set: async value => publish(key, value),
                push: () => ({ key: 'new-round' }),
                transaction(update, complete) {
                    return Promise.resolve().then(() => {
                        const next = update(structuredClone(records[key] || null));
                        if (next !== undefined) publish(key, next);
                        const snapshot = { val: () => structuredClone(records[key] || null) };
                        complete?.(null, next !== undefined, snapshot);
                        return { committed: next !== undefined, snapshot };
                    });
                }
            }; } };
        });
        for (const file of ['battleship.js', 'connect-four.js', 'tic-tac-toe.js', 'rps.js', 'game-pause.js']) await page.addScriptTag({ content: read(file) });
        const app = read('app.js');
        await page.addScriptTag({ content: app.slice(app.indexOf('function handleNotificationAction('), app.indexOf('function updateNotificationBadges(')) });
        await page.evaluate(() => launchTicTacToe());
        await page.waitForFunction(() => document.querySelector('#tic-tac-toe-screen .word-search-lobby-primary').textContent === 'Invite player');
        await page.evaluate(() => publish('games/ticTacToe/current', { status: 'waiting', players: { Jadey: true }, createdAt: 1, board: Array(9).fill('') }));
        await page.waitForFunction(() => document.querySelector('#tic-tac-toe-screen .word-search-lobby-primary').textContent === 'Join match');
        await page.locator('#tic-tac-toe-screen .word-search-lobby-primary').click();
        await page.waitForFunction(() => records['games/ticTacToe/current'].status === 'active');
        await page.evaluate(() => publish('games/ticTacToe/current', { status: 'waiting', players: { Jadey: true }, createdAt: 2, board: Array(9).fill('') }));
        await page.waitForFunction(() => records['games/ticTacToe/current'].status === 'active' && records['games/ticTacToe/current'].createdAt === 2);
        await page.evaluate(() => {
            updateTicTacToeSetting('mode', 'versus-ai');
            handleNotificationAction('invite', 'game', 'tic-tac-toe');
        });
        await page.waitForFunction(() => ticTacToeSettings.mode === 'versus' && ticTacToeRef !== null);
        await page.evaluate(() => { updateRpsSetting('mode', 'versus-ai'); handleNotificationAction('invite-rps', 'game', 'rps'); });
        await page.waitForFunction(() => rpsSettings.mode === 'versus' && rpsRef !== null);
        await page.evaluate(() => launchConnectFour(true));
        await page.evaluate(() => publish('games/connectFour/current', { ...createConnectFourMatch(), id: 'rematch', players: { Jadey: true } }));
        await page.waitForFunction(() => records['games/connectFour/current'].status === 'active');
        await page.evaluate(() => launchBattleship());
        await page.waitForFunction(() => battleshipState?.boards?.Peter);
        await page.evaluate(() => {
            const match = createBattleshipMatch();
            match.id = 'fleet-rematch'; match.players = { Jadey: true }; match.boards = { Jadey: createBattleshipBoard() };
            publish('games/battleship/current', match);
        });
        await page.waitForFunction(() => records['games/battleship/current'].id === 'fleet-rematch' && records['games/battleship/current'].players.Peter === true);
        await page.evaluate(() => {
            const match = createBattleshipMatch();
            ensureBattleshipParticipant(match, 'Jadey');
            match.id = 'battle'; match.status = 'battle'; match.turn = 'Peter';
            publish('games/battleship/current', match);
        });
        await page.waitForFunction(() => battleshipState?.id === 'battle');
        assert.equal(await page.locator('#battleship-turn-overlay').evaluate(el => el.style.getPropertyValue('--turn-cue-colour')), '#15AFD1');
        await page.evaluate(() => openBattleshipSettings());
        await page.locator('.battleship-auto-setting input').check();
        await page.evaluate(() => resumeSharedGame());
        await page.evaluate(() => { const state = structuredClone(records['games/battleship/current']); state.turn = 'Jadey'; state.boards.Jadey.shotsReceived = { 0: { hit: false } }; publish('games/battleship/current', state); });
        await page.waitForFunction(() => battleshipView === 'own');
        assert.equal(await page.locator('#battleship-turn-overlay').evaluate(el => el.style.getPropertyValue('--turn-cue-colour')), '#FFD1DC');
        assert.ok((await page.locator('#battleship-shot-feedback').textContent()).includes('A1 - Miss'));
        const sounds = await page.evaluate(() => window.sounds.length);
        await page.evaluate(() => renderBattleship());
        assert.equal(await page.evaluate(() => window.sounds.length), sounds, 'Rerenders do not replay shots');
        await page.evaluate(() => setBattleshipView('enemy'));
        assert.equal(await page.locator('.battleship-cell.shot-impact').count(), 1);
        for (const width of [320, 390, 1280]) {
            await page.setViewportSize({ width, height: 844 });
            await page.screenshot({ path: path.join(os.tmpdir(), `battleship-feedback-${width}.png`) });
            assert.ok(await page.locator('.battleship-content').evaluate(el => el.scrollWidth <= el.clientWidth));
        }
        await page.evaluate(() => {
            const state = structuredClone(records['games/battleship/current']);
            const ship = state.boards.Peter.ships[0];
            state.boards.Peter.shotsReceived = Object.fromEntries(ship.cells.map(cell => [cell, { hit: true, shipId: ship.id }]));
            state.turn = 'Peter';
            publish('games/battleship/current', state);
        });
        await page.waitForFunction(() => battleshipView === 'enemy' && sounds.includes('ship-sunk'));
        assert.ok((await page.locator('#battleship-shot-feedback').textContent()).includes('Carrier sunk!'));
        await page.evaluate(() => setBattleshipView('own'));
        await page.waitForFunction(() => document.getElementById('battleship-turn-overlay').classList.contains('hidden'));
        await page.screenshot({ path: path.join(os.tmpdir(), 'battleship-shot-result.png') });
        await page.evaluate(() => openBattleshipSettings());
        assert.equal(await page.locator('.battleship-auto-setting input').isChecked(), true);
        await page.screenshot({ path: path.join(os.tmpdir(), 'battleship-settings.png') });
        await page.evaluate(() => resumeSharedGame());
        await page.evaluate(() => { const state = structuredClone(records['games/battleship/current']); state.status = 'finished'; state.winner = 'Peter'; publish('games/battleship/current', state); });
        await page.waitForFunction(() => battleshipState.status === 'finished');
        await page.evaluate(() => setBattleshipView('own'));
        assert.equal(await page.evaluate(() => battleshipView), 'own');
        await page.evaluate(() => setBattleshipView('enemy'));
        assert.equal(await page.evaluate(() => battleshipView), 'enemy');
        assert.ok(await page.locator('#battleship-board .ship').count() > 0, 'Results reveal remaining enemy ships');
        await page.evaluate(() => { startNewBattleshipMatch(); });
        await page.evaluate(() => { battleshipState = { ...battleshipState, id: 'changed-while-dialog-open' }; });
        await page.locator('#game-confirm-dialog button[value=confirm]').click();
        await page.waitForFunction(() => !document.getElementById('game-confirm-dialog').confirmationPending);
        assert.equal(await page.evaluate(() => records['games/battleship/current'].id), 'battle', 'Stale dialog cannot replace a different match');
        await page.evaluate(() => { window.confirm = () => { throw new Error('Native confirmation used'); }; startNewBattleshipMatch(); });
        await page.locator('#game-confirm-dialog button[value=cancel]').click();
        await page.waitForFunction(() => !document.getElementById('game-confirm-dialog').confirmationPending);
        assert.equal(await page.evaluate(() => records['games/battleship/current'].status), 'finished');
        for (const fn of ['startNewTicTacToeMatch', 'abandonTicTacToeMatch', 'startNewRpsRound', 'abandonRpsRound', 'startNewConnectFourMatch', 'abandonConnectFourMatch', 'abandonBattleshipMatch']) {
            await page.evaluate(fn => { window[fn](); }, fn);
            assert.equal(await page.locator('#game-confirm-dialog').isVisible(), true);
            await page.locator('#game-confirm-dialog button[value=cancel]').click();
            await page.waitForFunction(() => !document.getElementById('game-confirm-dialog').confirmationPending);
        }
        assert.deepEqual(errors, []);
        console.log('PASS: live lobbies, open-game rematches, invite mode routing, themed turn cues, saved auto-switch, deduplicated shots, results switching and custom confirmations.');
    } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });

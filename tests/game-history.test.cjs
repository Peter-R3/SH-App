const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../game-history.js'), 'utf8');
const records = {};
const context = vm.createContext({ console, localPlayer: 'Peter', otherPlayer: p => p === 'Peter' ? 'Jadey' : 'Peter',
    database: { ref: key => ({ transaction: update => { records[key] = update(records[key]); return Promise.resolve(); } }) } });
vm.runInContext(source.slice(source.indexOf('function mergeGameHistory'), source.indexOf('let puzzleHistorySubscriptions')), context);
const record = (game, state, mode = 'versus', player = 'Peter') => {
    context.fixture = { game, state, mode, player };
    vm.runInContext('recordGameHistory(fixture.game, fixture.state, fixture.mode, fixture.player)', context);
};
for (let i = 1; i <= 10; i++) record('rps', { roundId: `round${i}`, completedAt: i, status: 'finished', choices: { Peter: 'rock', Jadey: 'scissors' }, winner: 'Peter' });
for (const player of ['Peter','Jadey']) {
    const values = Object.values(records[`history/games/rps/${player}`]);
    assert.equal(values.length, 7);
    assert.deepEqual(values.map(x => x.completedAt), [10,9,8,7,6,5,4]);
}
record('rps', { roundId: 'round10', completedAt: 10, status: 'finished', winner: 'Jadey' });
assert.equal(records['history/games/rps/Peter'].versus_round10.winner, 'Peter');
record('rps', { roundId: 'abandoned', completedAt: 99, status: 'finished', abandonedBy: 'Peter' });
assert.equal(Object.keys(records['history/games/rps/Peter']).length, 7);
record('sudoku', { startedAt: 100, completedAt: 60100, puzzle: { difficulty: 'easy' }, pausedMs: 10000 }, 'solo');
assert.equal(records['history/games/sudoku/Jadey'], undefined);
assert.equal(Object.values(records['history/games/sudoku/Peter'])[0].elapsed, 50000);
record('ws', { startedAt: 200, completedAt: 300, puzzle: { size: 5 }, found: { 0: 'Peter', 1: 'Jadey', 2: 'Peter' }, activeMs: 100 }, 'coop');
assert.equal(Object.values(records['history/games/ws/Jadey'])[0].players.Peter.words, 2);
record('ttt', { startedAt: 1, completedAt: 5, status: 'finished', board: ['Peter','Jaylin','Peter'], winner: 'Peter' }, 'versusAi');
assert.equal(records['history/games/ttt/Jadey'], undefined);
assert.equal(Object.values(records['history/games/ttt/Peter'])[0].board.length, 9);
assert.equal(Object.values(records['history/games/ttt/Peter'])[0].players.Peter.participant, true);
context.playerProfiles = { Peter: { nickname: 'Peter' }, Jadey: { nickname: 'Jadey' } };
context.themeColorFor = () => '#15AFD1';
context.escapeHtml = value => String(value);
vm.runInContext(source.slice(source.indexOf('function historyDate'), source.indexOf('function mergeGameHistory')), context);
vm.runInContext(source.slice(source.indexOf('function historyPlayerName'), source.indexOf('if (localPlayer) initialisePuzzleHistory')), context);
context.sharedPauseSession = { id: 'tic-tac-toe' };
context.historyGameKeys = { 'tic-tac-toe': 'ttt' };
context.host = { innerHTML: '' };
context.oldRecord = { mode: 'versus', completedAt: 1000, winner: 'Peter', board: { 0: 'Peter', 1: 'Peter', 2: 'Peter' } };
context.database.ref = () => ({ once: async () => ({ val: () => ({ old: context.oldRecord }) }) });
(async () => {
    await vm.runInContext("loadGameHistory('tic-tac-toe', host)", context);
    assert.ok(context.host.innerHTML.includes('Peter won'));
    assert.ok(context.host.innerHTML.includes('Jadey'));
    assert.equal((context.host.innerHTML.match(/<span style="color:/g) || []).length, 11, 'Nine cells and two player rows');
    assert.ok(!context.host.innerHTML.includes('Could not load'));
    for (const [game, mode] of [['ttt', 'versusAi'], ['connect', 'versus'], ['sudoku', 'solo']]) {
        context.oldRecord.mode = mode;
        const html = vm.runInContext(`gameHistoryCard('${game}', oldRecord)`, context);
        assert.ok(html.includes('history-card'));
        if (mode === 'versusAi') assert.ok(html.includes('Jaylin'));
        if (mode === 'solo') assert.ok(!html.includes('Jadey'));
    }
    console.log('PASS: Firebase-pruned legacy player data and object-shaped boards load across Tic-Tac-Toe, Connect 4 and Sudoku.');
})().catch(error => { console.error(error); process.exitCode = 1; });
console.log('PASS: seven per game/profile, shared results, personal solo/AI history, duplicate and abandoned exclusion, pause-adjusted time and personal words.');

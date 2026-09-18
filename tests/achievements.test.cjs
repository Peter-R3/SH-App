const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'achievements.js'), 'utf8');
const saved = {};
const storage = new Map();
const context = vm.createContext({ console, Date, localPlayer: 'Peter',
    localStorage: { getItem: key => storage.get(key), setItem: (key, value) => storage.set(key, value) },
    database: { ref: key => ({ transaction: async update => {
        // Exercise the null-cache pass and retry with the latest remote value.
        update(null);
        saved[key] = update(structuredClone(saved[key] || null));
        return { committed: true, snapshot: { val: () => saved[key] } };
    } }) }
});
vm.runInContext(source.slice(0, source.indexOf('function initialiseAchievementScreen(')), context);
const run = code => vm.runInContext(code, context);
const plain = value => JSON.parse(JSON.stringify(value));
(async () => {
    assert.equal(run('ACHIEVEMENT_TRACKS.length'), 31);
    for (const track of plain(run('ACHIEVEMENT_TRACKS'))) {
        assert.equal(track.thresholds.length, track.stars ? 3 : 15);
        track.thresholds.forEach((_, index) => {
            const badge = run(`achievementBadge(ACHIEVEMENT_TRACKS.find(t => t.id === '${track.id}'), ${index})`);
            assert.ok(fs.existsSync(path.join(root, badge.path)));
        });
    }
    run('var state = mergeAchievementStats(null, { number_ten: 5 }, 100)');
    assert.ok(run("state.unlocked['number-total_1']"));
    assert.ok(run("state.unlocked['number-ten_0']"));
    run('state = mergeAchievementStats(state, { number_ten: 5 }, 101)');
    assert.equal(run('state.totals.number_ten'), 5, 'Repeated stats do not double count');
    run('state = mergeAchievementStats(state, { number_ten: { value: 0, epoch: 1 } }, 102)');
    assert.equal(run('state.totals.number_ten'), 5, 'Reset does not erase progress');
    run('state = mergeAchievementStats(state, { number_ten: { value: 1, epoch: 1 } }, 103)');
    assert.equal(run('state.totals.number_ten'), 6, 'New progress after reset counts');
    run('state = mergeAchievementStats(state, { number_ten: 5 }, 104)');
    assert.equal(run('state.totals.number_ten'), 6, 'Old snapshots from before a reset are ignored');
    run('state = mergeAchievementStats(state, { number_ten: { value: 0, epoch: 1 } }, 105)');
    run('state = mergeAchievementStats(state, { number_ten: { value: 1, epoch: 1 } }, 106)');
    assert.equal(run('state.totals.number_ten'), 6, 'Out-of-order snapshots cannot inflate progress');
    run("state = awardAchievementTiers({ totals: { ws_versusAi_9_hard_wins: 1 } }, 104)");
    assert.ok(run("state.unlocked['ws-jaylin_2']"));
    assert.equal(run("state.unlocked['ws-jaylin_0']"), undefined, 'Hard does not award Easy');
    const stats = { wordSearch: { Peter: { coop: { 5: { completedGrids: 5, wordsFound: 2 }, 6: { completedGrids: 5 }, 7: { completedGrids: 5 }, 8: { completedGrids: 5 }, 9: { completedGrids: 5 } } } } };
    context.stats = stats;
    run("state = mergeAchievementStats(null, achievementStatSources(stats, 'Peter'), 200)");
    assert.ok(run("state.unlocked['ws-variety_1']"));
    assert.equal(run("ACHIEVEMENT_TRACKS.find(t => t.id === 'ws-words').value(state)"), 2);
    context.match = { createdAt: 1000, completedAt: 2000, status: 'finished', winner: 'Peter', board: ['Peter','Peter','Peter','','','','','',''], winningCells: [0,1,2] };
    run("recordAchievementMatch('ttt', match)");
    await run("Promise.all([...achievementQueues.values()])");
    assert.equal(saved['achievements/Peter'].totals.ttt_versus_wins, 1);
    assert.equal(saved['achievements/Jadey'].totals.ttt_versus_complete, 1);
    assert.equal(saved['achievements/Peter'].totals.ttt_versus_line0, 1);
    run("recordAchievementMatch('ttt', match)");
    await run("Promise.all([...achievementQueues.values()])");
    assert.equal(saved['achievements/Peter'].totals.ttt_versus_wins, 1, 'Replay does not count twice');
    run("recordAchievementMatch('ttt', { ...match, createdAt: 2000, abandonedBy: 'Jadey' })");
    await run("Promise.all([...achievementQueues.values()])");
    assert.equal(saved['achievements/Peter'].totals.ttt_versus_wins, 1, 'Abandonment is excluded');
    run("recordAchievementMatch('rps', { ...match, createdAt: 3000, choices: { Peter: 'rock', Jaylin: 'scissors' } }, 'versusAi')");
    await run("Promise.all([...achievementQueues.values()])");
    assert.equal(saved['achievements/Peter'].totals.rps_versusAi_rock, 1);
    assert.equal(saved['achievements/Peter'].totals.rps_versus_wins, undefined);
    run("recordAchievementMatch('connect', { ...match, winningCells: [0,8,16,24] })");
    await run("Promise.all([...achievementQueues.values()])");
    assert.equal(saved['achievements/Peter'].totals.connect_diagonal, 1);
    run("recordAchievementMatch('battleship', { ...match, boards: { Peter: { ships: [{cells:[0]},{cells:[1]},{cells:[2]},{cells:[3]},{cells:[4]}], shotsReceived: {} } } })");
    await run("Promise.all([...achievementQueues.values()])");
    for (let index = 0; index < 3; index++) assert.ok(saved['achievements/Peter'].unlocked[`battleship-fleet_${index}`]);
    assert.equal(saved['achievements/Jaylin'], undefined);
    console.log('PASS: all 31 tracks and badge assets, exact independent stars, backfill, reset retention, personal words, mode separation, genuine wins, event deduplication and fleet/line/choice facts.');
})().catch(error => { console.error(error); process.exitCode = 1; });

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
const section = (start, end) => source.slice(source.indexOf(start), source.indexOf(end));
const data = {};
let sequence = 0;
const read = key => key.split('/').reduce((value, part) => value?.[part], data) ?? null;
function write(key, value) {
    const parts = key.split('/');
    const last = parts.pop();
    const parent = parts.reduce((obj, part) => obj[part] ||= {}, data);
    if (value === null) delete parent[last]; else parent[last] = structuredClone(value);
}
const snapshot = value => ({
    val: () => structuredClone(value),
    forEach: callback => Object.entries(value || {}).sort((a, b) => a[1].completedAt - b[1].completedAt || a[0].localeCompare(b[0]))
        .forEach(([key, child]) => callback({ key, val: () => structuredClone(child) }))
});
const database = { ref(key = '') { return {
    push: () => ({ key: `round-${String(++sequence).padStart(4, '0')}` }),
    child: id => database.ref(`${key}/${id}`),
    orderByChild() { return this; },
    once: async () => snapshot(read(key)),
    update: async updates => Object.entries(updates).forEach(([path, value]) => write(path, value)),
    transaction: async (update, complete) => {
        // Simulate a cold local cache, then Firebase's server retry.
        const initial = update(null);
        const next = initial === undefined ? undefined : update(structuredClone(read(key)));
        const committed = next !== undefined;
        if (committed) write(key, next);
        const snap = snapshot(read(key));
        complete?.(null, committed, snap);
        return { committed, snapshot: snap };
    }
}; } };
const context = vm.createContext({
    database, console, Date, localPlayer: 'Peter', currentSelectedGuess: null, isRevealingRound: false,
    gameState1To10: {}, gameModes: { ten: {}, hundred: {}, colours: {} },
    playerProfiles: { Peter: { nickname: 'Peter' }, Jadey: { nickname: 'Jadey' } },
    otherPlayer: player => player === 'Peter' ? 'Jadey' : 'Peter', playUiSound() {}, sendAppNotification() {},
    getCurrentMode: () => ({ title: '1 to 10' })
});
vm.runInContext(
    section('function normalizeGameState(', 'function createFreshRound(') +
    section('function getNumberGuessActingPlayer(', 'function numberGuessTurnCueKey(') +
    section('function recordNumberGuessHistory(', 'function showNumberGuessRoundSummary(') +
    section('let numberGuessSubmissionPending =', 'function advanceRoundAfterReveal('), context);
const run = code => vm.runInContext(code, context);
(async () => {
    let firstRecord;
    const ids = [];
    for (let round = 0; round < 10; round++) {
        const setter = round % 2 ? 'Jadey' : 'Peter';
        // Deliberately reuse a legacy ID and omit Firebase's absent null values.
        write('games/1-to-10', { mode: 'ten', phase: 'SETTING_TARGET', targetSetter: setter,
            guesser: setter === 'Peter' ? 'Jadey' : 'Peter', roundId: 'reused-id', isActive: true });
        context.gameState1To10 = structuredClone(read('games/1-to-10'));
        run('gameState1To10 = normalizeGameState(gameState1To10)');
        context.localPlayer = setter;
        context.currentSelectedGuess = round + 1;
        await run('processPadSubmission()');
        assert.equal(read('games/1-to-10').phase, 'GUESSING');
        const id = read('games/1-to-10').roundId;
        assert.ok(!ids.includes(id)); ids.push(id);
        context.gameState1To10 = structuredClone(read('games/1-to-10'));
        context.localPlayer = read('games/1-to-10').guesser;
        context.currentSelectedGuess = round + 1;
        await run('processPadSubmission()');
        assert.equal(read('games/1-to-10').phase, 'REVEAL');
        const completed = structuredClone(read('games/1-to-10'));
        context.completed = completed;
        const original = structuredClone(read(`history/numberGuess/${id}`));
        await run('recordNumberGuessHistory({ ...completed, currentGuessValue: 99 }, false)');
        assert.deepEqual(read(`history/numberGuess/${id}`), original, 'Duplicate cannot overwrite completed result');
        if (!round) firstRecord = original;
        assert.equal(Object.keys(read('history/numberGuess')).length, Math.min(7, round + 1));
        // A second client submitting the same cached turn must not change the result.
        context.currentSelectedGuess = 99;
        await run('processPadSubmission()');
        assert.equal(read('games/1-to-10').currentGuessValue, round + 1);
    }
    assert.deepEqual(Object.keys(read('history/numberGuess')).sort(), ids.slice(-7).sort());
    assert.equal(firstRecord.target, 1);
    console.log('PASS: ten alternating rounds, fresh IDs despite reused legacy state, cold-cache retries, immutable history, stale submissions and exactly seven retained entries.');
})().catch(error => { console.error(error); process.exitCode = 1; });

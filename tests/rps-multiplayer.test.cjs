const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const source = fs.readFileSync(path.join(__dirname, '..', 'rps.js'), 'utf8');
const data = {};
const subscriptions = new Map();
let sequence = 0;
const read = key => key.split('/').reduce((value, part) => value?.[part], data) ?? null;
const snap = value => ({ val: () => structuredClone(value) });
function write(key, value) {
    const parts = key.split('/');
    const last = parts.pop();
    const parent = parts.reduce((obj, part) => obj[part] ||= {}, data);
    parent[last] = value;
    for (const [watched, handlers] of subscriptions) {
        if (key.startsWith(watched) || watched.startsWith(key)) {
            const snapshot = snap(read(watched));
            handlers.forEach(handler => queueMicrotask(() => handler(snapshot)));
        }
    }
}
const database = { ref(key) { return {
    push: () => ({ key: 'round-' + ++sequence }),
    set: async value => write(key, structuredClone(value)),
    once: async () => snap(read(key)),
    on(_, handler) { if (!subscriptions.has(key)) subscriptions.set(key, new Set()); subscriptions.get(key).add(handler); queueMicrotask(() => handler(snap(read(key)))); },
    off(_, handler) { subscriptions.get(key)?.delete(handler); },
    transaction(update, complete) {
        return Promise.resolve().then(() => {
            const next = update(structuredClone(read(key)));
            const committed = next !== undefined;
            if (committed) write(key, next);
            const snapshot = snap(read(key));
            complete?.(null, committed, snapshot);
            return { committed, snapshot };
        });
    }
}; } };
function client(player) {
    const context = vm.createContext({ database, localPlayer: player, window: { confirm: () => true }, localStorage: { getItem: () => null, setItem() {} }, playerProfiles: { Peter: { nickname: 'Peter' }, Jadey: { nickname: 'Jadey' } }, otherPlayer: p => p === 'Peter' ? 'Jadey' : 'Peter', sendAppNotification() {}, clearGameNotifications: async () => {}, Date, Math, console });
    vm.runInContext(source + '\nrenderRps = () => {}; setRpsStatus = () => {};', context);
    return code => vm.runInContext(code, context);
}
const flush = async () => { for (let i = 0; i < 8; i++) await new Promise(resolve => setImmediate(resolve)); };
(async () => {
    const peter = client('Peter'), jadey = client('Jadey');
    peter('loadRpsVersus()'); jadey('loadRpsVersus()'); await flush();
    assert.equal(read('games/rps/current').status, 'active');
    for (let round = 0; round < 5; round++) {
        peter("chooseRps('rock')"); jadey("chooseRps('scissors')"); await flush();
        assert.equal(read('games/rps/current').status, 'finished');
        assert.equal(peter('rpsState.winner'), 'Peter');
        assert.equal(jadey('rpsState.winner'), 'Peter');
        assert.equal(read('stats/rps/Peter/versus/wins'), round + 1);
        assert.equal(read('stats/rps/Jadey/versus/losses'), round + 1);
        peter('loadRpsVersus()'); await flush();
        assert.equal(read('games/rps/current').status, 'finished');
        if (round < 4) {
            peter('startNewRpsRound()'); jadey('startNewRpsRound()'); await flush();
            assert.equal(read('games/rps/current').status, 'active', 'Both open clients join rematch');
        }
    }
    peter('abandonRpsRound()'); jadey('abandonRpsRound()'); await flush();
    assert.equal(read('stats/rps/Peter/versus/roundsPlayed'), 5, 'Finished rounds cannot be scored again');
    console.log('PASS: two clients, five consecutive rounds, simultaneous rematches, preserved results and no duplicate scoring.');
})().catch(error => { console.error(error); process.exitCode = 1; });

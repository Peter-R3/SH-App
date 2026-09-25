const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const storage = new Map();
let remote = null, fail = false;
const context = vm.createContext({ console, Date, structuredClone, crypto: require('node:crypto'), localPlayer: null,
    window: { setInterval() {}, addEventListener() {} }, document: { getElementById: () => null },
    localStorage: { getItem: key => storage.get(key), setItem: (key,value) => storage.set(key,value) },
    database: { ref: () => ({ transaction: async update => { if (fail) throw new Error('offline'); remote = update(structuredClone(remote)); return { committed: true }; } }) }
});
const achievements = fs.readFileSync(path.join(root,'achievements.js'),'utf8');
vm.runInContext(achievements.slice(0, achievements.indexOf('function initialiseAchievementScreen(')),context);
vm.runInContext(fs.readFileSync(path.join(root,'diagnostics.js'),'utf8'),context);
const run = code => vm.runInContext(code,context);
(async () => {
    for (const [id, name] of Object.entries({
        'number-guess': '1 to 10', number: '1 to 10',
        'word-search': 'Word Search', ws: 'Word Search', sudoku: 'Sudoku',
        battleship: 'Battleship', 'connect-four': 'Connect 4', connect: 'Connect 4',
        'tic-tac-toe': 'Tic-Tac-Toe', ttt: 'Tic-Tac-Toe', rps: 'Rock, Paper, Scissors'
    })) {
        for (const outcome of ['confirmed', 'failed']) {
            const description = run(`describeDiagnostic(${JSON.stringify({event:'history-save',actor:'Peter',game:id,outcome})})`);
            assert.ok(description.includes(name), `${id} history logs must name ${name}`);
            assert.ok(!description.includes('for the game'));
        }
    }
    run(`let state = { totals: { number_ten: 10 } }; awardAchievementTiers(state,1);`);
    run(`state = repairAchievementState(state, { track:'number-total', tier:0, operation:'revoke' },2); awardAchievementTiers(state,3);`);
    assert.equal(run('state.unlocked["number-total_0"]'), undefined);
    run(`state = repairAchievementState(state, { track:'number-total', tier:0, operation:'automatic' },4);`);
    assert.ok(run('state.unlocked["number-total_0"].seenAt'));
    run(`state = repairAchievementState(state, { track:'number-total', tier:0, operation:'progress',value:2 },5);`);
    assert.equal(run('ACHIEVEMENT_TRACKS[0].value(state,0)'),2);
    run('state.totals.number_ten += 1');
    assert.equal(run('ACHIEVEMENT_TRACKS[0].value(state,0)'),3,'Future play increments the corrected value');
    assert.equal(run('state.totals.number_ten'),11,'Repair does not rewrite underlying stats');
    assert.throws(() => run(`repairAchievementState(state,{track:'number-total',tier:0,operation:'progress',value:-1},6)`));
    assert.throws(() => run(`repairAchievementState(state,{track:'invalid',tier:0,operation:'grant'},6)`));
    run(`let stars = repairAchievementState({}, {track:'ws-jaylin',tier:1,operation:'progress',value:5},7);`);
    assert.equal(run(`ACHIEVEMENT_TRACKS.find(t=>t.id==='ws-jaylin').value(stars,0)`),0);
    assert.equal(run(`ACHIEVEMENT_TRACKS.find(t=>t.id==='ws-jaylin').value(stars,1)`),5);
    run(`stars = repairAchievementState(stars, {track:'ws-jaylin',tier:4,operation:'grant'},8);`);
    assert.ok(run(`stars.unlocked['ws-jaylin_4']`));
    run(`const now = Date.now(); const entries = Object.fromEntries(Array.from({length:600},(_,i)=>['e'+i,{event:'connection',actor:'Peter',at:now-i,outcome:'confirmed'}])); entries.expired={event:'connection',actor:'Peter',at:now-8*86400000};`);
    assert.equal(run('Object.keys(mergeDiagnosticLog({},entries,now)).length'),500);
    assert.equal(run('mergeDiagnosticLog({},entries,now).expired'),undefined);
    const clean = run(`sanitiseDiagnostic({event:'history-save',actor:'Jadey',at:now,message:'secret',password:'secret',realmCode:'secret',errorCode:'url-containing-secret',game:'ws'})`);
    assert.equal(JSON.stringify(clean).includes('secret'),false);
    run(`localPlayer='Jadey'; for(let i=0;i<120;i++) recordDiagnostic('connection',{outcome:'failed'});`);
    assert.equal(run('diagnosticPending.length'),100);
    fail = true;
    run('diagnosticConnected=true');
    await run('flushDiagnostics()');
    assert.equal(run('diagnosticPending.length'),100);
    assert.equal(run('diagnosticFailure'),true);
    fail = false;
    await run('flushDiagnostics()');
    assert.equal(run('diagnosticPending.length'),0);
    assert.equal(Object.keys(remote).length,100);
    assert.equal(run('diagnosticFailure'),false);
    console.log('PASS: achievement overrides, continued progress, independent tiers, validation, bounded logs, redaction and offline retry.');
})().catch(error=>{console.error(error);process.exitCode=1;});

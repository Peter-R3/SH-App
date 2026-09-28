const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const model = require('../jigsaw-model.js');
for (const n of model.sizes) for (let seed = 1; seed <= 50; seed++) {
    const state = model.create('image', n, seed, `p${seed}`, 1);
    const edges = model.edges(n, seed);
    assert.equal(Object.keys(state.pieces).length, n*n);
    assert.equal(new Set(Object.values(state.pieces).map(p=>p.order)).size,n*n);
    edges.forEach((e,i)=>{
        assert.ok(model.outline(e).endsWith('Z'));
        if (i % n < n-1) assert.equal(e[1],-edges[i+1][3]);
        if (i < n*(n-1)) assert.equal(e[2],-edges[i+n][0]);
    });
    model.drop(state,0,0,{tray:false,x:.6,y:.6},'Peter',2);
    assert.equal(state.pieces[0].locked,false);
    assert.equal(state.pieces[0].tray,false);
    assert.equal(model.drop(state,0,0,{tray:true},'Jadey',3),undefined,'stale simultaneous move rejected');
    model.drop(state,0,1,{tray:true},'Peter',4);
    assert.equal(state.pieces[0].tray,true);
    for (let i=0;i<n*n;i++) model.drop(state,i,state.pieces[i].revision,{tray:false,x:(i%n)/n,y:Math.floor(i/n)/n},i%2?'Peter':'Jadey',10+i);
    assert.ok(state.completedAt);
    assert.equal(model.drop(state,0,3,{tray:true},'Peter',100),undefined,'locked pieces cannot move');
    state.elapsed=12345;
    const stats=model.credit(null,state,'coop','Peter');
    const before=JSON.stringify(stats);
    assert.equal(JSON.stringify(model.credit(stats,state,'coop','Peter')),before,'completion credited once');
    assert.equal(stats.coop[n].pieces,Math.floor(n*n/2));
}
let state=model.create('image',4,1,'timer',10000);
model.heartbeat(state,'Peter',true,10000);
model.heartbeat(state,'Jadey',true,12000);
model.heartbeat(state,'Peter',false,14000);
model.heartbeat(state,'Jadey',false,16000);
assert.equal(state.elapsed,6000,'overlapping co-op time counted once');
model.heartbeat(state,'Peter',true,999999);
assert.equal(state.elapsed,6000,'no progression while away');
const dir=path.join(__dirname,'../assets/jigsaw');
assert.equal(fs.readdirSync(dir).filter(name=>name.endsWith('.png')).length,15);
for(const name of fs.readdirSync(dir)) {
    const png=fs.readFileSync(path.join(dir,name));
    assert.equal(png.readUInt32BE(16),720); assert.equal(png.readUInt32BE(20),720);
}
console.log('PASS: 250 solvable puzzles, complementary edges, free placement, tray return, stale/locked rejection, idempotent scores, shared active timer and all 15 image dimensions.');

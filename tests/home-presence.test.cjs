const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname,'..','app.js'),'utf8');
let data = {}, disconnected;
const context = vm.createContext({
    console, Date, Number, localPlayer:'Peter', auth:{currentUser:{}}, activeAppView:'home',
    document:{hidden:false}, firebase:{database:{ServerValue:{TIMESTAMP:10000000}}},
    presenceDisconnectHandle:null, refreshActiveMultiplayerSession(){},
    database:{ref:()=>({
        update:async value=>{Object.assign(data,value);},
        onDisconnect:()=>({update:async value=>{disconnected=value;}})
    })}
});
vm.runInContext(source.slice(source.indexOf('function lastOnlineDescription('),source.indexOf('function renderHomePresence(')),context);
vm.runInContext(source.slice(source.indexOf('function updateAppPresence('),source.indexOf('function refreshActiveMultiplayerSession(')),context);
const describe=(ago)=>context.lastOnlineDescription(10000000-ago,10000000);
assert.match(describe(0),/just now/);
assert.match(describe(60000),/1 minute ago/);
assert.match(describe(120000),/2 minutes ago/);
assert.match(describe(3600000),/1 hour ago/);
assert.match(context.lastOnlineDescription(10000000,10000000+172800000),/2 days ago/);
assert.equal(context.lastOnlineDescription(null),'');
assert.equal(context.lastOnlineDescription(10050000,10000000),'');
context.updateAppPresence();
assert.equal(data.lastOnlineAt,10000000);
context.document.hidden=true;
context.firebase.database.ServerValue.TIMESTAMP=11000000;
context.updateAppPresence();
assert.equal(data.visible,false);
assert.equal(data.updatedAt,11000000);
assert.equal(data.lastOnlineAt,10000000,'Background heartbeats must not move last-online time forward');
Object.assign(data,disconnected);
assert.equal(data.lastOnlineAt,10000000,'Disconnect preserves the last active timestamp');
assert.equal(data.visible,false);
console.log('PASS: relative time, invalid timestamps, preserved last activity during background updates and disconnect.');

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const storage=new Map();
const records={};
const context=vm.createContext({console,Date,Math,localPlayer:'Peter',localStorage:{getItem:key=>storage.get(key),setItem:(key,value)=>storage.set(key,value)},database:{ref:key=>({once:async()=>({val:()=>records[key]}),set:async value=>{records[key]=value;},update:async value=>{records[key]={...records[key],...value};}})}});
for(const file of ['minecraft-words.js','wordsearch.js'])vm.runInContext(fs.readFileSync(path.join(__dirname,'..',file),'utf8'),context);
const run=code=>vm.runInContext(code,context);
(async()=>{
    assert.equal(run('WORD_SEARCH_MINECRAFT_LABELS.length'),588);
    assert.equal(run('new Set(WORD_SEARCH_MINECRAFT_LABELS.map(word=>word.replace(/\\s/g,""))).size'),588);
    let spaced=false;
    for(const bank of ['default','minecraft'])for(const size of [5,6,7,8,9])for(let attempt=0;attempt<40;attempt++){
        const puzzle=context.createWordSearchPuzzle(size,bank);
        assert.equal(puzzle.wordBank,bank);
        assert.equal(puzzle.words.length,{5:4,6:5,7:6,8:7,9:8}[size]);
        assert.equal(new Set(puzzle.words).size,puzzle.words.length);
        puzzle.words.forEach((word,index)=>{
            assert.ok(/^[A-Z]+$/.test(word)&&word.length<=size);
            assert.equal(puzzle.paths[index].map(({row,col})=>puzzle.grid[row][col]).join(''),word);
            assert.equal(puzzle.wordLabels[index].replace(/\s/g,'').toUpperCase(),word);
            if(puzzle.wordLabels[index].includes(' '))spaced=true;
        });
    }
    assert.ok(spaced);
    run('loadWordSearchSettings()');assert.equal(run('wordSearchSettings.wordBank'),'default');
    const originalSolo=context.soloWordSearchPath(),originalAI=context.aiWordSearchPath();
    run('wordSearchSettings.wordBank="minecraft";saveWordSearchSettings();loadWordSearchSettings()');
    assert.equal(run('wordSearchSettings.wordBank'),'minecraft');
    assert.notEqual(context.soloWordSearchPath(),originalSolo);assert.notEqual(context.aiWordSearchPath(),originalAI);
    assert.ok(!context.soloWordSearchPath().startsWith(originalSolo+'/'),'Minecraft must not nest underneath an existing default save');
    run('localPlayer="Jadey";loadWordSearchSettings()');assert.equal(run('wordSearchSettings.wordBank'),'default');
    records['wordSearch/coopRequests/test']={recipient:'Jadey',status:'pending',difficulty:5,wordBank:'minecraft'};
    await context.approveCoopWordSearchRequest('test');
    assert.equal(records['wordSearch/coop/current'].puzzle.wordBank,'minecraft');
    records['wordSearch/coopRequests/legacy']={recipient:'Jadey',status:'pending',difficulty:5};
    await context.approveCoopWordSearchRequest('legacy');
    assert.equal(records['wordSearch/coop/current'].puzzle.wordBank,'default');
    console.log('PASS: 400 valid grids across both banks/all sizes, spaced labels, save isolation, per-profile persistence, co-op approval and legacy defaults.');
})().catch(error=>{console.error(error);process.exitCode=1;});

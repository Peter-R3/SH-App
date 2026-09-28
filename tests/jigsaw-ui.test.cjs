const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'..');
(async()=>{
 const browser=await chromium.launch({channel:'msedge',headless:true});
 try {
 const page=await browser.newPage({viewport:{width:390,height:844}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',r=>r.abort());
 await page.route('https://app.test/',r=>r.fulfill({contentType:'text/html',body:'<html></html>'}));
 await page.route('**/assets/**',r=>{const p=path.join(root,new URL(r.request().url()).pathname);return r.fulfill({body:fs.readFileSync(p),contentType:p.endsWith('.png')?'image/png':'image/svg+xml'});});
 await page.goto('https://app.test/');
 await page.setContent(fs.readFileSync(path.join(root,'index.html'),'utf8').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,''));
 for(const file of ['styles.css','game-pause.css','achievements.css','game-history.css','focus-mode.css','jigsaw.css']) await page.addStyleTag({content:fs.readFileSync(path.join(root,file),'utf8')});
 await page.evaluate(()=>{
  window.testData={};const listeners=new Map();let sequence=0;
  const clone=v=>v==null?null:JSON.parse(JSON.stringify(v));
  const get=p=>p==='.info/connected'?true:p.split('/').filter(Boolean).reduce((v,k)=>v?.[k],window.testData)??null;
  const snap=p=>({val:()=>clone(get(p)),exists:()=>get(p)!=null,forEach:cb=>Object.entries(get(p)||{}).forEach(([key,value])=>cb({key,val:()=>clone(value)}))});
  const put=(p,v)=>{const bits=p.split('/'),last=bits.pop();let target=window.testData;for(const k of bits)target=target[k]||=( {} );if(v==null)delete target[last];else target[last]=clone(v);for(const [key,callbacks]of listeners)if(key===p||p.startsWith(key+'/')||key.startsWith(p+'/'))for(const cb of callbacks)queueMicrotask(()=>cb(snap(key)));};
  const ref=p=>({key:p.split('/').at(-1),on(_,cb){if(p.startsWith('jigsaw/')||p==='.info/connected'){if(!listeners.has(p))listeners.set(p,new Set());listeners.get(p).add(cb);queueMicrotask(()=>cb(snap(p)));}},off(_,cb){listeners.get(p)?.delete(cb);},once:async(_,cb)=>{cb?.(snap(p));return snap(p);},set:async v=>put(p,v),update:async v=>{for(const [k,x]of Object.entries(v))put(p+'/'+k,x);},remove:async()=>put(p,null),transaction:async fn=>{const value=fn(clone(get(p)));if(value!==undefined)put(p,value);return {committed:value!==undefined,snapshot:snap(p)};},push:()=>ref(p+'/id'+(++sequence)),onDisconnect(){return this;},orderByChild(){return this;},limitToLast(){return this;}});
  window.firebase={initializeApp(){},auth:()=>({currentUser:{uid:'test'},onAuthStateChanged(){}}),database:()=>({ref:(p='')=>ref(p)})};window.firebase.database.ServerValue={TIMESTAMP:1};window.AudioContext=undefined;window.webkitAudioContext=undefined;
 });
 for(const file of ['app.js','store.js','minecraft-words.js','wordsearch.js','battleship.js','connect-four.js','sudoku.js','tic-tac-toe.js','rps.js','realm-hub.js','realm-planner.js','game-pause.js','focus-mode.js','achievements.js','game-history.js','diagnostics.js','jigsaw-model.js','jigsaw.js'])await page.addScriptTag({content:fs.readFileSync(path.join(root,file),'utf8')});
 await page.evaluate(()=>showAuthenticatedApp('Peter'));
 await page.evaluate(()=>launchJigsaw());
 await page.waitForFunction(()=>document.getElementById('jigsaw-preview').naturalWidth===720);
 assert.equal(await page.locator('#jigsaw-ready').textContent(),'Play');
 await page.locator('#jigsaw-ready').click();
 await page.waitForFunction(()=>activeAppView==='jigsaw'&&document.querySelectorAll('#jigsaw-tray .jigsaw-piece').length===16);
 async function drag(id,x,y,toTray=false){
  const piece=page.locator(`[data-piece="${id}"]`);await piece.scrollIntoViewIfNeeded();const box=await piece.boundingBox();
  await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();
  const target=await page.locator(toTray?'#jigsaw-tray':'#jigsaw-board').boundingBox();
  await page.mouse.move(target.x+target.width*x,target.y+target.height*y,{steps:12});await page.mouse.up();
 }
 await drag(0,.65,.65);
 await page.waitForFunction(()=>jigsawState.pieces[0].revision===1);
 assert.equal(await page.evaluate(()=>jigsawState.pieces[0].locked),false);
 assert.equal(await page.locator('#jigsaw-board [data-piece="0"]').count(),1);
 await drag(0,.5,.5,true);
 await page.waitForFunction(()=>jigsawState.pieces[0].tray);
 await drag(0,.125,.125);
 await page.waitForFunction(()=>jigsawState.pieces[0].locked);
 const lockedStroke = await page.locator('#jigsaw-board [data-piece="0"] svg > path').evaluate(el=>getComputedStyle(el).stroke);
 const looseStroke = await page.locator('#jigsaw-tray .jigsaw-piece svg > path').first().evaluate(el=>getComputedStyle(el).stroke);
 assert.notEqual(lockedStroke,looseStroke,'locked pieces have a distinct theme outline');
 assert.equal(await page.locator('#jigsaw-board [data-piece="0"] svg > path').evaluate(el=>getComputedStyle(el).vectorEffect),'non-scaling-stroke');
 await page.evaluate(()=>{switchTab('home');launchJigsaw();});
 await page.waitForFunction(()=>document.getElementById('jigsaw-ready').textContent==='Resume puzzle');
 await page.locator('#jigsaw-ready').click();
 assert.equal(await page.evaluate(()=>jigsawState.pieces[0].locked),true);
 for(const width of [320,390,1280]){
  await page.setViewportSize({width,height:width===320?568:844});await page.evaluate(()=>calculateRealVh(true));
  await page.screenshot({path:path.join(os.tmpdir(),`jigsaw-play-${width}.png`)});
  assert.ok(await page.locator('#jigsaw-screen').evaluate(el=>el.scrollWidth<=el.clientWidth));
  await page.evaluate(()=>openSharedGameMenu('jigsaw'));
  await page.locator('#jigsaw-screen .focus-mode-toggle').click();
  await page.screenshot({path:path.join(os.tmpdir(),`jigsaw-pause-${width}.png`)});
  await page.locator('#jigsaw-screen .focus-mode-toggle').click();
  await page.evaluate(()=>resumeSharedGame());
 }
 await page.evaluate(()=>openJigsawSettings());
 assert.equal(await page.locator('#jigsaw-gallery button').count(),15);
 await page.screenshot({path:path.join(os.tmpdir(),'jigsaw-settings.png')});
 await page.evaluate(()=>resumeSharedGame());
 await page.evaluate(async()=>{
  await database.ref(jigsawPath).transaction(state=>{for(let i=1;i<16;i++)JigsawModel.drop(state,i,0,{tray:false,x:i%4/4,y:Math.floor(i/4)/4},'Peter',Date.now());return state;});
 });
 await page.waitForFunction(()=>Boolean(testData.stats?.jigsaw?.Peter?.solo?.[4]?.completed));
 assert.equal(await page.evaluate(()=>testData.stats.jigsaw.Peter.solo[4].completed),1);
 await page.waitForFunction(()=>Object.keys(testData.history?.games?.jigsaw?.Peter||{}).length===1);
 assert.equal(await page.locator('#jigsaw-finished').isVisible(),true);
 await page.evaluate(()=>{
  latestStats=testData.stats;
  latestStats.jigsaw.Jadey={pictures:{Me_and_SH:true},coop:{4:{completed:1,pieces:1,times:{Me_and_SH_regular:61000,Me_and_SH_guided:45000}}}};
  openStatsScreen();openStatsCategory('jigsaw');
 });
 assert.equal(await page.locator('#jigsaw-stats-content > .word-stats-player').count(),2);
 assert.equal(await page.locator('#jigsaw-stats-content .jigsaw-stats-row:not(.word-stats-head)').count(),20);
 assert.match(await page.locator('#jigsaw-stats-content .jadey').textContent(),/1 puzzle1 piece/);
 await page.locator('[data-times="Jadey-coop"] summary').click();
 await page.evaluate(()=>renderJigsawStats());
 assert.equal(await page.locator('[data-times="Jadey-coop"]').getAttribute('open'),'');
 assert.match(await page.locator('[data-times="Jadey-coop"]').textContent(),/Unguided.*Guided/);
 for(const width of [320,390,1280]){
  await page.setViewportSize({width,height:844});await page.evaluate(()=>calculateRealVh(true));
  assert.ok(await page.locator('#jigsaw-stats-content').evaluate(el=>el.scrollWidth<=el.clientWidth));
  await page.locator('#jigsaw-stats-content').evaluate(el=>Promise.all(el.getAnimations({subtree:true}).map(animation=>animation.finished)));
  await page.locator('#stats-jigsaw-detail').evaluate(el=>el.scrollIntoView({block:'start'}));
  await page.screenshot({path:path.join(os.tmpdir(),`jigsaw-stats-${width}.png`)});
 }
 await page.evaluate(()=>openManagementScreen());
 assert.equal(await page.locator('#jigsaw-management').isVisible(),true);
 assert.ok(await page.evaluate(()=>ACHIEVEMENT_TRACKS.filter(t=>t.game==='jigsaw').length===5));
 await page.evaluate(()=>{jigsawSettings.mode='coop';jigsawSaveSettings();launchJigsaw();});
 await page.locator('#jigsaw-ready').click();
 await page.waitForFunction(()=>activeAppView==='jigsaw'&&Boolean(testData.jigsaw?.coop?.current));
 const sharedId=await page.evaluate(()=>jigsawState.id);
 await page.evaluate(()=>{openJigsawSettings();changeJigsawSetting('size',5);void requestJigsawPuzzle();});
 await page.waitForFunction(()=>document.getElementById('game-confirm-dialog').open);
 await page.locator('#game-confirm-dialog button[value="confirm"]').click();
 await page.waitForFunction(()=>Boolean(testData.jigsaw.coop.request));
 assert.equal(await page.evaluate(()=>testData.jigsaw.coop.current.id),sharedId,'request does not replace the grid without approval');
 await page.evaluate(async()=>{const id=testData.jigsaw.coop.request.id;localPlayer='Jadey';await respondJigsawRequest(id,true);localPlayer='Peter';});
 await page.waitForFunction(()=>testData.jigsaw.coop.current.size===5);
 assert.equal(await page.evaluate(()=>testData.jigsaw.coop.request),undefined);
 await page.evaluate(async()=>{await respondJigsawRequest('stale-request',true);});
 assert.equal(await page.evaluate(()=>testData.jigsaw.coop.current.size),5);
 await page.waitForFunction(()=>activeAppView==='jigsaw-lobby');
 await page.locator('#jigsaw-ready').click();
 await page.evaluate(async()=>{await database.ref(jigsawPath).transaction(s=>JigsawModel.drop(s,0,0,{tray:false,x:0,y:0},'Jadey',Date.now()));});
 await page.waitForFunction(()=>jigsawState.pieces[0].owner==='Jadey');
 assert.equal(await page.locator('#jigsaw-board [data-piece="0"]').isDisabled(),true,'remote placement locks locally');
 await page.setViewportSize({width:390,height:844});
 await page.evaluate(()=>calculateRealVh(true));
 const touchPiece=page.locator('#jigsaw-tray [data-piece="1"]');await touchPiece.scrollIntoViewIfNeeded();
 const touchBox=await touchPiece.boundingBox(),touchBoard=await page.locator('#jigsaw-board').boundingBox();
 const cdp=await page.context().newCDPSession(page);
 await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:touchBox.x+touchBox.width/2,y:touchBox.y+touchBox.height/2}]});
 await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:touchBoard.x+touchBoard.width*.3,y:touchBoard.y+touchBoard.height*.1}]});
 await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
 await page.waitForFunction(()=>jigsawState.pieces[1].locked);
 await cdp.detach();
 assert.deepEqual(errors,[]);
 console.log('PASS: real image loading, free placement, tray return, snapping, resume, completion credit/history, gallery, management and responsive focus/pause screens.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});

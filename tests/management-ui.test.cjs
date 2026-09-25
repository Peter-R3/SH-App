const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { chromium } = require('playwright');
const root = path.resolve(__dirname,'..');
(async()=>{
    const browser = await chromium.launch({channel:'msedge',headless:true});
    try {
        const page = await browser.newPage({viewport:{width:390,height:844}});
        const errors=[]; page.on('pageerror',error=>errors.push(error.message));
        await page.route('**/*',route=>route.abort());
        await page.setContent(fs.readFileSync(path.join(root,'index.html'),'utf8').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,''));
        for(const file of ['styles.css','realm-hub.css','realm-planner.css','game-pause.css','achievements.css','game-history.css','diagnostics.css','store.css']) await page.addStyleTag({content:fs.readFileSync(path.join(root,file),'utf8')});
        await page.evaluate(()=>{
            window.store = {'achievements/Peter':{totals:{number_ten:10}},'achievements/Jadey':{}};
            const watchers=new Map();
            const snap = value=>({val:()=>structuredClone(value??null),exists:()=>!!value,forEach:()=>{}});
            const ref=key=>({
                on(_event,callback){if(['diagnostics/events','.info/connected','.info/serverTimeOffset'].includes(key)){watchers.set(key,callback);callback(snap(key==='.info/connected'?true:store[key]));}},
                off(){watchers.delete(key);}, once:async()=>snap(store[key]),
                transaction:async update=>{const result=update(structuredClone(store[key]??null));if(result===undefined)return {committed:false,snapshot:snap(store[key])};store[key]=result;watchers.get(key)?.(snap(result));return {committed:true,snapshot:snap(result)};},
                set:async()=>{},update:async()=>{},remove:async()=>{},push:()=>({key:'fixture'}),onDisconnect(){return this;},orderByChild(){return this;},limitToLast(){return this;}
            });
            window.firebase={initializeApp(){},auth:()=>({currentUser:{uid:'fixture'},onAuthStateChanged(){}}),database:()=>({ref})};
            firebase.database.ServerValue={TIMESTAMP:1}; window.AudioContext=undefined;window.webkitAudioContext=undefined;
        });
        for(const file of ['app.js','store.js','wordsearch.js','battleship.js','connect-four.js','sudoku.js','tic-tac-toe.js','rps.js','realm-hub.js','realm-planner.js','game-pause.js','achievements.js','game-history.js','diagnostics.js']) await page.addScriptTag({content:fs.readFileSync(path.join(root,file),'utf8')});
        await page.evaluate(()=>{showAuthenticatedApp('Peter');switchTab('store');});
        await page.locator('[data-store-category=frames]').click();
        await page.locator('[data-store-item=sweetheart]').click();
        await page.locator('#store-preview [data-store-choice=heart][data-value=pair]').click();
        await page.locator('#store-preview [data-store-custom=secondary]').click();
        await page.locator('#store-colour-hex').fill('#ABCDEF');
        assert.equal(await page.evaluate(()=>storeExtras.sweetheart.secondary),'#ABCDEF');
        assert.notEqual(await page.evaluate(()=>storePreviewColour),'#ABCDEF');
        assert.equal(await page.locator('#store-preview .store-charm').evaluate(el=>getComputedStyle(el).backgroundColor),'rgb(171, 205, 239)');
        assert.notEqual(await page.locator('#store-preview .store-charm').evaluate(el=>getComputedStyle(el).color),'rgb(171, 205, 239)');
        await page.locator('#store-preview [data-store-custom=secondary]').click();
        assert.equal(await page.locator('.store-custom-colour').isVisible(),false);
        await page.locator('#store-preview [data-store-custom=secondary]').click();
        assert.equal(await page.locator('.store-custom-colour').isVisible(),true);
        await page.locator('#store-preview [data-store-choice=heart][data-value=none]').click();
        assert.equal(await page.locator('#store-preview .store-charm').isVisible(),false);
        await page.locator('#store-preview [data-store-choice=heart][data-value=filled-pair]').click();
        assert.equal(await page.locator('#store-preview .store-charm').textContent(),'\u2665\u2665');
        for(const width of [320,390,1280]) {
            await page.setViewportSize({width,height:844});
            assert.ok(await page.locator('#store-preview').evaluate(el=>el.scrollWidth<=el.clientWidth));
            await page.screenshot({path:path.join(os.tmpdir(),`store-sweetheart-${width}.png`)});
        }
        await page.locator('#store-preview [aria-label="Close preview"]').click();
        await page.locator('[data-store-item=pearl]').click();
        await page.locator('[data-store-choice=pearls][data-value="20"]').click();
        assert.equal(await page.locator('#store-preview .store-pearls i').count(),20);
        await page.locator('#store-preview [aria-label="Close preview"]').click();
        await page.locator('[data-store-item=satin]').click();
        const avatarWidth = await page.locator('#store-preview .store-avatar').evaluate(el=>el.getBoundingClientRect().width);
        await page.locator('#store-thickness').fill('12');
        assert.equal(await page.locator('#store-preview .store-frame').evaluate(el=>getComputedStyle(el).borderTopWidth),'2px');
        assert.ok(await page.locator('#store-preview .store-avatar').evaluate(el=>el.getBoundingClientRect().width)<avatarWidth);
        await page.locator('#store-preview [aria-label="Close preview"]').click();
        await page.locator('#store-screen [data-store-custom=primary]').click();
        await page.locator('#store-colour-hex').fill('#123456');
        assert.equal(await page.evaluate(()=>storePreviewColour),'#123456');
        await page.evaluate(()=>switchTab('home'));
        assert.deepEqual(await page.evaluate(()=>storeExtras),{});
        assert.equal(await page.evaluate(()=>storePreviewColour===themeColorFor(localPlayer)),true);
        await page.evaluate(()=>openManagementScreen());
        const choose=async(id,value)=>{await page.locator(`#${id}-custom-button`).click();await page.locator(`#${id}-custom-options .game-custom-select-option[data-value="${value}"]`).click();};
        await choose('repair-operation','revoke');
        await page.locator('#repair-preview').click();
        await page.locator('#game-confirm-dialog button[value=cancel]').click();
        assert.equal(await page.evaluate(()=>store['achievements/Peter'].tierOverrides),undefined);
        await page.locator('#repair-preview').click();
        await page.locator('#game-confirm-dialog button[value=confirm]').click();
        await page.waitForFunction(()=>store['achievements/Peter'].tierOverrides?.['number-total_0']==='revoked');
        await choose('repair-operation','progress');
        await page.locator('#repair-value').fill('15');
        await page.locator('#repair-preview').click();
        await page.locator('#game-confirm-dialog button[value=confirm]').click();
        await page.waitForFunction(()=>store['achievements/Peter'].progressAdjustments?.['number-total']===5);
        assert.equal(await page.evaluate(()=>store['achievements/Peter'].unlocked?.['number-total_0']),undefined);
        await choose('repair-operation','grant');
        await page.locator('#repair-preview').click();
        await page.evaluate(()=>{store['achievements/Peter'].totals.number_ten++;});
        await page.locator('#game-confirm-dialog button[value=confirm]').click();
        await page.waitForFunction(()=>document.getElementById('repair-status').textContent.includes('changed'));
        for(const width of [320,390,1280]){
            await page.setViewportSize({width,height:844});
            assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
            await page.screenshot({path:path.join(os.tmpdir(),`management-controls-${width}.png`)});
        }
        await page.locator('[data-management-tab=log]').click();
        assert.equal(await page.locator('#management-controls').isVisible(),false);
        await page.waitForFunction(()=>document.querySelectorAll('.diagnostic-entry').length>0);
        await page.waitForFunction(()=>diagnosticPending.length===0);
        const totalCount = (await page.locator('#diagnostic-status').textContent()).split(' entries')[0];
        await choose('diagnostic-event','connection');
        assert.ok((await page.locator('#diagnostic-status').textContent()).startsWith(totalCount+' entries'));
        assert.match(await page.locator('#diagnostic-status').textContent(), /matching entr/);
        await choose('diagnostic-profile','Jadey');
        assert.ok((await page.locator('#diagnostic-status').textContent()).startsWith(totalCount+' entries'));
        assert.match(await page.locator('#diagnostic-status').textContent(), /0 matching entries/);
        await choose('diagnostic-profile','all');
        await choose('diagnostic-event','all');
        assert.doesNotMatch(await page.locator('#diagnostic-status').textContent(), /matching/);
        await page.locator('#diagnostic-errors').check();
        assert.ok((await page.locator('#diagnostic-status').textContent()).startsWith(totalCount+' entries'));
        assert.ok(await page.locator('.diagnostic-entry').count()>0);
        await page.locator('.diagnostic-entry summary').first().click();
        assert.match(await page.locator('.diagnostic-entry summary').first().textContent(),/Achievement repair.*Failed/);
        assert.match(await page.locator('.diagnostic-description').first().textContent(),/could not confirm/);
        assert.equal(await page.locator('.diagnostic-entry .diagnostic-outcome-icon.diagnostic-failed').count(),await page.locator('.diagnostic-entry').count());
        assert.doesNotMatch(await page.evaluate(()=>describeDiagnostic({event:'history-save',actor:'Peter',outcome:'confirmed'})),/a the game/);
        await page.locator('#diagnostic-collapse').click();
        assert.equal(await page.locator('.diagnostic-entry[open]').count(),0);
        await page.locator('.diagnostic-entry summary').first().click();
        await page.evaluate(()=>renderDiagnosticLog());
        assert.equal(await page.locator('.diagnostic-entry[open]').count(),1);
        await page.screenshot({path:path.join(os.tmpdir(),'management-log.png')});
        const downloadPromise=page.waitForEvent('download');
        await page.locator('#diagnostic-export').click();
        assert.match((await downloadPromise).suggestedFilename(),/app-diagnostics-.*\.json/);
        await page.evaluate(()=>{showAuthScreen();showAuthenticatedApp('Jadey');openManagementScreen();});
        assert.equal(await page.locator('#management-screen').isVisible(),false);
        assert.deepEqual(errors,[]);
        console.log('PASS: management tabs, custom selectors, cancel/apply, persistent revocation, stale edit rejection, log filters/export, mobile layouts and Peter-only entry.');
    } finally {await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});

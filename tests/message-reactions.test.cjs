const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { chromium } = require('playwright');
const root = path.resolve(__dirname,'..');
(async () => {
    const browser = await chromium.launch({channel:'msedge',headless:true});
    try {
        const page = await browser.newPage({viewport:{width:390,height:844}});
        const errors=[]; page.on('pageerror',error=>errors.push(error.message));
        await page.route('**/*',route=>route.abort());
        await page.setContent(fs.readFileSync(path.join(root,'index.html'),'utf8').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,''));
        await page.addStyleTag({content:fs.readFileSync(path.join(root,'styles.css'),'utf8')});
        await page.evaluate(()=>{
            window.messageFixture={own:{sender:'Peter',text:'Hello!',createdAt:1},other:{sender:'Jadey',text:'Good game!',createdAt:2}};
            const snap=value=>({val:()=>structuredClone(value??null),exists:()=>!!value,forEach(){}});
            const ref=key=>({on(){},off(){},once:async()=>snap(null),set:async()=>{},update:async()=>{},remove:async()=>{},push:()=>({key:'fixture'}),onDisconnect(){return this;},orderByChild(){return this;},limitToLast(){return this;},
                transaction:async update=>{
                    const id=key?.split('/')[1];
                    const next=update(structuredClone(messageFixture[id]??null));
                    if(next===undefined)return{committed:false,snapshot:snap(messageFixture[id])};
                    if(next===null)delete messageFixture[id];else messageFixture[id]=next;
                    window.refreshMessageFixture?.();
                    return{committed:true,snapshot:snap(next)};
                }
            });
            window.firebase={initializeApp(){},auth:()=>({currentUser:{uid:'fixture'},onAuthStateChanged(){}}),database:()=>({ref})};
            firebase.database.ServerValue={TIMESTAMP:1};window.AudioContext=undefined;window.webkitAudioContext=undefined;
        });
        for(const file of ['app.js','store.js','wordsearch.js','battleship.js','connect-four.js','sudoku.js','tic-tac-toe.js','rps.js','realm-hub.js','realm-planner.js','game-pause.js','achievements.js','game-history.js']) await page.addScriptTag({content:fs.readFileSync(path.join(root,file),'utf8')});
        await page.evaluate(()=>{
            showAuthenticatedApp('Peter');
            window.refreshMessageFixture=()=>{latestMessages=Object.entries(messageFixture).map(([id,value])=>({id,...value}));renderMessages();};
            refreshMessageFixture();switchTab('messages');
        });
        const other=page.locator('.message-bubble').filter({hasText:'Good game!'});
        const originalWidth=await other.evaluate(el=>el.getBoundingClientRect().width);
        const touch = await page.context().newCDPSession(page);
        const bubbleBox = await other.boundingBox();
        const point = {x:bubbleBox.x+bubbleBox.width/2,y:bubbleBox.y+bubbleBox.height/2};
        await touch.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[point]});
        await page.waitForFunction(()=>!document.getElementById('message-action-menu').classList.contains('hidden'));
        await touch.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
        assert.equal(await page.locator('#message-action-menu').isVisible(),true);
        assert.equal(await page.locator('[data-own-message]').first().isVisible(),false);
        await page.locator('#message-action-menu').getByText('Cancel',{exact:true}).click();
        await other.dispatchEvent('contextmenu',{clientX:point.x,clientY:point.y});
        assert.equal(await page.locator('#message-action-menu').isVisible(),true);
        await page.locator('#message-action-menu').getByText('Cancel',{exact:true}).click();
        await other.dblclick();
        await page.waitForFunction(()=>messageFixture.other.reactions?.Peter?.type==='heart');
        assert.equal(await page.locator('.message-reaction-badge').textContent(),'\uD83E\uDE75');
        await other.dblclick();
        assert.equal(await page.evaluate(()=>messageFixture.other.reactions.Peter.type),'heart');
        assert.equal(await other.evaluate(el=>el.getBoundingClientRect().width),originalWidth);
        const badgeBox=await page.locator('.message-reaction-badge').boundingBox();
        const reactedBubbleBox=await other.boundingBox();
        assert.equal(badgeBox.height,21);
        assert.ok(badgeBox.y<reactedBubbleBox.y+reactedBubbleBox.height && badgeBox.y+badgeBox.height>reactedBubbleBox.y+reactedBubbleBox.height,'Badge must overlap the bottom edge');
        await page.evaluate(()=>openMessageActionMenu('other'));
        assert.equal(await page.locator('[data-own-message]').first().isVisible(),false);
        assert.equal(await page.locator('.message-reaction-picker button').count(),6);
        await page.locator('.message-reaction-picker [aria-label="Thumbs down"]').click();
        await page.waitForFunction(()=>messageFixture.other.reactions.Peter.type==='down');
        await page.evaluate(()=>{messageFixture.other.reactions.Jadey={type:'down',super:false};refreshMessageFixture();});
        assert.equal(await page.locator('.message-reaction-badge').count(),1);
        assert.match(await page.locator('.message-reaction-badge').textContent(),/2/);
        await page.locator('.message-reaction-badge').click();
        await page.waitForFunction(()=>!messageFixture.other.reactions.Peter);
        assert.equal(await page.evaluate(()=>messageFixture.other.reactions.Jadey.type),'down');
        await page.evaluate(()=>openMessageActionMenu('other'));
        const laugh=page.locator('.message-reaction-picker [aria-label=Laugh]');
        await laugh.hover();await page.mouse.down();
        await page.waitForFunction(()=>document.querySelector('.super-ready'));
        await page.mouse.up();
        await page.waitForFunction(()=>messageFixture.other.reactions.Peter?.super);
        assert.equal(await page.locator('.message-reaction-burst span').count(),18);
        assert.equal(await page.locator('.message-reaction-badge.super-reaction').evaluate(el=>getComputedStyle(el).borderTopColor),'rgb(245, 212, 90)');
        assert.doesNotMatch(await page.locator('.message-reaction-badge.super-reaction').textContent(),/\u2605/);
        await page.screenshot({path:path.join(os.tmpdir(),'message-super-reaction.png')});
        await page.locator('.message-reaction-badge[aria-pressed=true]').click();
        await page.waitForFunction(()=>!messageFixture.other.reactions.Peter);
        await page.evaluate(()=>{document.querySelector('.message-reaction-burst')?.remove();messageFixture.other.reactions.Jadey={type:'heart',super:true,burstId:'new-remote'};refreshMessageFixture();});
        assert.equal(await page.locator('.message-reaction-burst span').first().textContent(),'\uD83E\uDD0D');
        await page.evaluate(()=>{document.querySelector('.message-reaction-burst').remove();refreshMessageFixture();});
        assert.equal(await page.locator('.message-reaction-burst').count(),0);
        await page.emulateMedia({reducedMotion:'reduce'});
        await page.evaluate(()=>{messageFixture.other.reactions.Jadey.burstId='reduced-motion';refreshMessageFixture();});
        assert.equal(await page.locator('.message-reaction-burst').count(),0);
        await page.evaluate(()=>{localPlayer='Jadey';refreshMessageFixture();openMessageActionMenu('other');});
        assert.equal(await page.locator('[data-own-message]').first().isVisible(),true);
        assert.equal(await page.locator('.message-reaction-picker [aria-label=Heart]').textContent(),'\uD83E\uDD0D');
        for(const width of [320,390,1280]) {
            await page.setViewportSize({width,height:844});
            await page.evaluate(()=>openMessageActionMenu('other',innerWidth-1,100));
            const bounds=await page.locator('#message-action-menu').boundingBox();
            assert.ok(bounds.x>=0 && bounds.x+bounds.width<=width);
            assert.ok(bounds.height<=120,'Menu should use only two compact rows');
            await page.screenshot({path:path.join(os.tmpdir(),`message-reactions-${width}.png`)});
        }
        await page.evaluate(async()=>{delete messageFixture.other;await setMessageReaction('other','heart');});
        assert.equal(await page.evaluate(()=>messageFixture.other),undefined);
        await page.evaluate(()=>{
            closeMessageActionMenu();
            for(let i=0;i<40;i++)messageFixture['history'+i]={sender:i%2?'Peter':'Jadey',text:'Earlier message '+i,createdAt:i+10};
            refreshMessageFixture();switchTab('home');switchTab('messages');
        });
        await page.waitForFunction(()=>{
            const thread=document.getElementById('messages-thread');
            return thread.scrollHeight-thread.clientHeight-thread.scrollTop<2;
        });
        await page.evaluate(()=>{document.getElementById('messages-thread').scrollTop=0;refreshMessageFixture();});
        assert.equal(await page.locator('#messages-thread').evaluate(el=>el.scrollTop),0,'Live updates preserve an older reading position');
        assert.deepEqual(errors,[]);
        console.log('PASS: double-tap hearts, profile colours, own-only editing, replace/remove/group, unchanged bubble size, super hold and burst, remote deduplication, reduced motion, responsive picker and no deleted-message resurrection.');
    } finally { await browser.close(); }
})().catch(error=>{console.error(error);process.exitCode=1;});

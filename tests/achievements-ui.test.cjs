const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '..');
(async () => {
    const browser = await chromium.launch({ channel: 'msedge', headless: true });
    try {
        const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
        const errors = [];
        page.on('pageerror', error => errors.push(error.message));
        const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '');
        await page.route('**/*', route => {
            const asset = new URL(route.request().url()).pathname;
            if (/^\/assets\/(achievements|currency|games)\/[A-Za-z_-]+\.svg$/.test(asset)) return route.fulfill({ contentType: 'image/svg+xml', body: fs.readFileSync(path.join(root, asset.slice(1))) });
            if (asset === '/assets/games/rps.png') return route.fulfill({ contentType: 'image/png', body: fs.readFileSync(path.join(root, asset.slice(1))) });
            return route.fulfill({ contentType: 'text/html', body: html });
        });
        await page.goto('http://achievements.test/');
        for (const file of ['styles.css','realm-hub.css','game-pause.css','achievements.css','game-history.css']) await page.addStyleTag({ content: fs.readFileSync(path.join(root,file),'utf8') });
        await page.evaluate(() => {
            const snapshot = { val: () => null, exists: () => false, forEach() {} };
            const ref = { on() {}, off() {}, once: async () => snapshot, set: async () => {}, update: async () => {}, remove: async () => {}, push: () => ({ key: 'key', set: async () => {} }),
                transaction: async update => { const result = update(window.fixtureAchievements || null); window.fixtureAchievements = result; return { committed: result !== undefined, snapshot: { val: () => result } }; },
                orderByChild() { return this; }, limitToLast() { return this; }, onDisconnect() { return this; } };
            window.firebase = { initializeApp() {}, auth: () => ({ currentUser: { uid:'test', email:'test@example.invalid' }, onAuthStateChanged() {} }), database: () => ({ ref: () => ref }) };
            window.firebase.database.ServerValue = { TIMESTAMP: 1 };
            window.AudioContext = undefined;
            window.webkitAudioContext = undefined;
        });
        for (const file of ['app.js','wordsearch.js','battleship.js','connect-four.js','sudoku.js','tic-tac-toe.js','rps.js','realm-hub.js','game-pause.js','achievements.js','game-history.js']) await page.addScriptTag({ content: fs.readFileSync(path.join(root,file),'utf8') });
        await page.evaluate(() => { showAuthenticatedApp('Peter'); achievementReady = true; achievementPlayer = 'Peter'; });
        assert.equal(await page.locator('.home-shortcut-card.achievements img').getAttribute('src'), './assets/achievements/Pink_Star.svg');
        await page.waitForFunction(() => document.querySelector('.home-shortcut-card.achievements img').naturalWidth > 0);
        assert.equal(await page.locator('#home-coin-preview').isVisible(), true);
        assert.equal(await page.locator('#home-coin-preview span').textContent(), '0');
        await page.waitForFunction(() => document.querySelector('#home-coin-preview img').naturalWidth > 0);
        assert.deepEqual(await page.locator('#home-coin-preview img').evaluate(el => ({ width: el.getBoundingClientRect().width, height: el.getBoundingClientRect().height })), { width: 22, height: 22 });
        await page.evaluate(() => { localPlayer = 'Jadey'; initialiseHomeScreen(); });
        assert.equal(await page.locator('#home-coin-preview').isVisible(), true);
        assert.equal(await page.locator('#home-coin-preview span').textContent(), '0');
        await page.evaluate(() => { localPlayer = 'Peter'; initialiseHomeScreen(); });
        for (const width of [320,390,1280]) {
            await page.setViewportSize({ width, height: 844 });
            await page.evaluate(() => { calculateRealVh(); switchTab('home'); });
            const bounds = await page.locator('.home-shortcut-grid > button').evaluateAll(buttons => buttons.map(button => {
                const box = button.getBoundingClientRect(); const text = button.querySelector('span');
                return { y: box.y, width: box.width, fits: text.scrollWidth <= box.width - 2 };
            }));
            assert.equal(bounds.length, 3);
            assert.ok(bounds.every(box => box.y === bounds[0].y && Math.abs(box.width - bounds[0].width) < 1 && box.fits));
            await page.evaluate(() => { document.getElementById('home-greeting-text').textContent = 'Lovely to see you'; });
            assert.ok(await page.locator('.home-greeting').evaluate(el => {
                const title = el.querySelector('h2').getBoundingClientRect();
                const coin = el.querySelector('.home-coin-balance').getBoundingClientRect();
                return title.right <= coin.left && coin.right <= el.getBoundingClientRect().right && el.scrollWidth <= el.clientWidth;
            }), 'Greeting and coin preview do not overlap');
            await page.screenshot({ path: path.join(os.tmpdir(), `achievement-home-${width}.png`) });
            await page.evaluate(() => switchTab('games'));
            await page.waitForFunction(() => [...document.querySelectorAll('.game-card-image')].every(img => img.complete && img.naturalWidth > 0));
            assert.equal(await page.locator('.game-card-image').count(), 7);
            await page.screenshot({ path: path.join(os.tmpdir(), `updated-game-art-${width}.png`) });
            await page.evaluate(() => switchTab('home'));
        }
        await page.setViewportSize({ width: 390, height: 844 });
        await page.locator('.home-shortcut-card.achievements').click();
        await page.evaluate(() => {
            achievementReady = true;
            achievementState = awardAchievementTiers({ totals: { number_ten: 7, ws_solo_5_completed: 2 } }, Date.now());
            Object.values(achievementState.unlocked).forEach(item => { item.seenAt = 1; });
            window.fixtureAchievements = achievementState;
            renderAchievements();
        });
        assert.equal(await page.locator('.achievement-track').count(), 31);
        assert.equal(await page.locator('.achievement-track progress').count(), 31);
        assert.equal(await page.locator('#achievements-screen').isVisible(), true);
        await page.locator('#achievement-review').click();
        assert.equal(await page.locator('.achievement-reward-group').count(), 2);
        assert.equal(await page.locator('.achievement-reward').count(), 4);
        await page.locator('.achievement-reward img').evaluateAll(images => Promise.all(images.flatMap(image => image.getAnimations().map(animation => animation.finished))));
        await page.screenshot({ path: path.join(os.tmpdir(), 'achievement-grouped-rewards.png') });
        await page.locator('#achievement-continue').click();
        await page.locator('#achievement-back').click();
        await page.locator('.home-shortcut-card.achievements').click();
        assert.equal(await page.locator('#achievements-screen').isVisible(), true, 'Reopening after rewards shows achievements, not Games');
        assert.equal(await page.locator('#main-dashboard').isVisible(), false);
        await page.waitForFunction(() => [...document.querySelectorAll('.achievement-track img')].every(image => image.complete && image.naturalWidth > 0));
        await page.screenshot({ path: path.join(os.tmpdir(),'achievement-tracks.png') });
        await page.locator('[data-track="number-total"]').click();
        assert.equal(await page.locator('#achievement-filters').isVisible(), false);
        assert.equal(await page.locator('.achievement-tier').count(), 25);
        assert.equal(await page.locator('.achievement-tier img:not(.locked)').count(), 2);
        assert.equal(await page.locator('.achievement-tier h3').last().textContent(), 'Morganite V');
        await page.waitForFunction(() => [...document.querySelectorAll('.achievement-tier img')].every(image => image.complete && image.naturalWidth > 0));
        await page.screenshot({ path: path.join(os.tmpdir(),'achievement-tiers.png') });
        await page.locator('#achievement-back').click();
        await page.evaluate(() => {
            localStorage.removeItem('achievement-seen:Peter');
            achievementState = awardAchievementTiers({ totals: { number_ten: 1 } }, Date.now());
            window.fixtureAchievements = achievementState;
            setActiveAppView('rps'); rpsState = { status: 'active' };
            maybeRevealAchievements();
        });
        assert.equal(await page.locator('#achievement-reveal').evaluate(el => el.open), false, 'Active competition is uninterrupted');
        await page.evaluate(() => { rpsState.status = 'finished'; maybeRevealAchievements(); });
        assert.equal(await page.locator('#achievement-reveal').evaluate(el => el.open), true);
        await page.locator('.achievement-reward img').evaluateAll(images => Promise.all(images.flatMap(image => image.getAnimations().map(animation => animation.finished))));
        await page.screenshot({ path: path.join(os.tmpdir(),'achievement-reveal.png') });
        await page.locator('#achievement-continue').click();
        await page.evaluate(() => maybeRevealAchievements());
        assert.equal(await page.locator('#achievement-reveal').evaluate(el => el.open), false, 'Acknowledged rewards do not replay');
        await page.evaluate(() => {
            achievementState = awardAchievementTiers({ totals: { ws_solo_5_words: 5 } }, Date.now()); window.fixtureAchievements = achievementState;
            wordSearchSettings.mode = 'solo'; setActiveAppView('word-search'); maybeRevealAchievements();
        });
        assert.equal(await page.evaluate(() => activeAppView), 'word-search-menu');
        await page.locator('#achievement-continue').click();
        assert.equal(await page.evaluate(() => activeAppView), 'word-search');
        await page.evaluate(() => {
            openSharedGameMenu('word-search');
            achievementState = awardAchievementTiers({ totals: { ws_solo_5_words: 15 } }, Date.now()); window.fixtureAchievements = achievementState; maybeRevealAchievements();
        });
        await page.locator('#achievement-continue').click();
        assert.equal(await page.evaluate(() => activeAppView), 'word-search-menu', 'Already paused game stays paused');
        await page.evaluate(() => {
            switchTab('home');
            achievementState = awardAchievementTiers({ totals: { number_ten: 750, ws_solo_5_completed: 500 } }, Date.now());
            Object.values(achievementState.unlocked).forEach(item => { item.seenAt = 1; });
            window.fixtureAchievements = achievementState;
            openAchievements();
        });
        await page.locator('#achievement-review').click();
        assert.equal(await page.locator('.achievement-reward').count(), 35);
        assert.equal(await page.locator('.achievement-reward-group').count(), 2);
        for (const width of [320, 390, 1280]) {
            await page.setViewportSize({ width, height: 844 });
            assert.ok(await page.locator('#achievement-reveal').evaluate(el => el.scrollWidth <= el.clientWidth), 'Large batch has no horizontal overflow');
        }
        await page.locator('#achievement-continue').click();
        assert.equal(await page.locator('#achievements-screen').isVisible(), true);
        for (const id of ['number-guess','word-search','sudoku','battleship','connect-four','tic-tac-toe','rps']) {
            await page.evaluate(id => openGameAchievements(id), id);
            assert.ok(await page.locator('.achievement-track').count() > 0);
            assert.equal(await page.locator('#achievement-filters').isVisible(), false);
            await page.locator('.achievement-track').first().click();
            await page.locator('#achievement-back').click();
            await page.locator('#achievement-back').click();
            assert.equal(await page.evaluate(() => gameAchievementContext), null);
            if (id !== 'number-guess') assert.equal(await page.locator(`#${id}-screen .shared-pause-panel`).isVisible(), true);
        }
        await page.evaluate(() => { switchTab('home'); openAchievements(); });
        assert.equal(await page.locator('.achievement-track').count(), 31);
        await page.setViewportSize({ width: 320, height: 568 });
        await page.evaluate(() => {
            calculateRealVh(true);
            openNumberGuessHistory();
        });
        await page.evaluate(() => {
            renderNumberGuessHistory([{ setter: 'Peter', guesser: 'Jadey', target: 7, guess: 5, mode: 'ten', completedAt: Date.now(), points: { Peter: 0, Jadey: 0 } }]);
        });
        assert.equal(await page.locator('.history-player-heading').count(), 0);
        assert.equal(await page.locator('#number-guess-history-list time').count(), 1);
        await page.screenshot({ path: path.join(os.tmpdir(), 'number-history-refined.png') });
        await page.evaluate(() => {
            switchTab('home'); openAchievements();
            achievementState = awardAchievementTiers({ totals: { number_ten: 7 } }, 1);
            Object.values(achievementState.unlocked).forEach(value => { value.seenAt = 1; });
            const ref = database.ref.bind(database);
            window.comparisonFixture = awardAchievementTiers({ totals: { number_ten: 12 } }, 1);
            window.comparisonBefore = JSON.stringify(window.comparisonFixture);
            database.ref = path => path === 'achievements/Jadey' ? {
                on(event, listener) { window.comparisonListener = listener; listener({ val: () => window.comparisonFixture }); },
                off() { window.comparisonListener = null; }
            } : ref(path);
            renderAchievements();
        });
        assert.match(await page.locator('[data-track=number-total] .achievement-next').textContent(), /Bronze III/);
        assert.equal(await page.locator('[data-track=number-total] .achievement-remaining').textContent(), '3 left');
        await page.locator('#achievement-compare').check();
        assert.equal(await page.locator('[data-track=number-total] progress').count(), 2);
        for (const width of [320,390,1280]) {
            await page.setViewportSize({ width, height: 844 });
            assert.ok(await page.locator('.achievements-content').evaluate(el => el.scrollWidth <= el.clientWidth));
            await page.screenshot({ path: path.join(os.tmpdir(), `achievement-compare-${width}.png`) });
        }
        await page.evaluate(() => {
            comparisonFixture = awardAchievementTiers({ totals: { number_ten: 15 } }, 1);
            comparisonListener({ val: () => comparisonFixture });
        });
        assert.match(await page.locator('[data-track=number-total] .achievement-comparison-player').last().textContent(), /Bronze V/);
        await page.locator('[data-track=number-total]').click();
        assert.equal(await page.locator('.achievement-tier progress').count(),50);
        await page.locator('#achievement-back').click();
        await page.locator('#achievement-compare').uncheck();
        assert.equal(await page.evaluate(() => comparisonListener),null);
        assert.deepEqual(errors, []);
        console.log('PASS: three-column Home, real badge loading, progress bars, all tier details, safe competitive queues, persistent reveal acknowledgement and solo pause/resume.');
    } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });

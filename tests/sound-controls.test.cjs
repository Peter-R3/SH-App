const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '..');
const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
const soundCode = app.slice(app.indexOf('function loadSoundEffectsPreference('), app.indexOf('function updateAppPresence('));
const markup = fs.readFileSync(path.join(root, 'index.html'), 'utf8').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '');

(async () => {
    const browser = await chromium.launch({ channel: 'msedge', headless: true });
    try {
        const context = await browser.newContext({ viewport: { width: 320, height: 640 } });
        await context.route('**/*', route => route.fulfill({ contentType: 'text/html', body: markup }));
        async function setup(page) {
            await page.goto('http://sound.test/');
            await page.addStyleTag({ content: fs.readFileSync(path.join(root, 'styles.css'), 'utf8') });
            // Fake audio nodes never send sound to the machine's output device.
            await page.addScriptTag({ content: `
                let localPlayer = 'Peter', soundEffectsEnabled = true, soundContext = null, soundPreferenceRevision = 0;
                const activeSoundNodes = new Set();
                window.startedTones = 0;
                window.stoppedTones = 0;
                window.AudioContext = class {
                    constructor() { this.state = 'running'; this.currentTime = 0; this.destination = {}; }
                    resume() { return new Promise(resolve => { window.finishResume = () => { this.state = 'running'; resolve(); }; }); }
                    createOscillator() { return { frequency: { setValueAtTime(){}, exponentialRampToValueAtTime(){} }, connect(node){ return node; }, start(){ startedTones++; }, stop(){ stoppedTones++; }, disconnect(){} }; }
                    createGain() { return { gain: { setValueAtTime(){}, linearRampToValueAtTime(){}, exponentialRampToValueAtTime(){} }, connect(node){ return node; }, disconnect(){} }; }
                };
                function switchTab() {}
                function openThemePicker() {}
                function showTestScreen(id) {
                    document.querySelectorAll('.screen').forEach(s => s.classList.add('hidden'));
                    document.getElementById(id).classList.remove('hidden');
                }
                ${soundCode}
                loadSoundEffectsPreference('Peter');
                showTestScreen('profile-screen');
            ` });
        }
        const page = await context.newPage();
        const errors = [];
        page.on('pageerror', error => errors.push(error.message));
        await setup(page);
        assert.equal(await page.locator('.sound-settings-row').count(), 0);
        await page.evaluate(() => initialiseSoundEffectControls());
        assert.equal(await page.locator('.sound-settings-row').count(), 0);
        await page.locator('#profile-sound-enabled').uncheck();
        assert.equal(await page.locator('#profile-sound-status').textContent(), 'Muted');
        assert.equal(await page.locator('.sound-effects-toggle[aria-pressed=false]').count(), 1);
        await page.locator('.profile-theme-entry').click();
        assert.equal(await page.evaluate(() => startedTones), 0);
        await setup(page);
        assert.equal(await page.locator('#profile-sound-enabled').isChecked(), false, 'Mute persists after reload');
        await page.locator('#profile-sound-enabled').check();
        assert.equal(await page.evaluate(() => startedTones), 2, 'One confirmation when enabling');
        await page.locator('.profile-theme-entry').click();
        assert.equal(await page.evaluate(() => startedTones), 3, 'One menu tap');
        await page.evaluate(() => {
            showTestScreen('game-1-to-10-screen');
            document.getElementById('number-guess-menu-area').classList.remove('hidden');
            document.getElementById('number-guess-pause-panel').classList.remove('hidden');
        });
        await page.locator('#number-guess-pause-panel .sound-effects-toggle').click();
        assert.equal(await page.locator('#profile-sound-enabled').isChecked(), false);
        assert.equal(await page.evaluate(() => activeSoundNodes.size), 0, 'Mute disconnects active sounds');
        await page.evaluate(() => { localPlayer = 'Jadey'; loadSoundEffectsPreference('Jadey'); });
        assert.equal(await page.locator('#profile-sound-enabled').isChecked(), true, 'Other profile unaffected');
        await page.evaluate(() => { localPlayer = 'Peter'; loadSoundEffectsPreference('Peter'); });
        assert.equal(await page.locator('#profile-sound-enabled').isChecked(), false);
        const second = await context.newPage();
        await setup(second);
        await second.locator('#profile-sound-enabled').check();
        await page.waitForFunction(() => document.getElementById('profile-sound-enabled').checked);
        await second.close();
        await page.evaluate(async () => {
            soundContext.state = 'suspended';
            const pending = playUiSound('tap');
            toggleSoundEffects();
            finishResume();
            await pending;
        });
        assert.equal(await page.evaluate(() => activeSoundNodes.size), 0, 'Muted pending resume does not play');
        for (const id of ['profile-screen', 'word-search-settings-screen', 'sudoku-settings-screen', 'tic-tac-toe-settings-screen', 'rps-settings-screen']) {
            await page.evaluate(id => showTestScreen(id), id);
            assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${id} fits narrow screen`);
            await page.screenshot({ path: path.join(os.tmpdir(), `sound-${id}.png`) });
        }
        await page.emulateMedia({ reducedMotion: 'reduce' });
        assert.ok(await page.locator('.profile-sound-setting input').evaluate(input => parseFloat(getComputedStyle(input, '::after').transitionDuration) < .01));
        assert.deepEqual(errors, []);
        console.log('PASS: profile/menu sync, persistence, per-profile isolation, cross-tab sync, no duplicate taps, immediate mute, pending audio cancellation, narrow layouts and reduced motion.');
    } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });

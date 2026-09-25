const DIAGNOSTIC_LIMIT = 500;
const DIAGNOSTIC_AGE = 7 * 86400000;
const DIAGNOSTIC_EVENTS = ['connection', 'game-view', 'turn-submit', 'history-save', 'achievement-sync', 'achievement-repair', 'communication-clear', 'score-adjust', 'interaction-adjust', 'runtime-error'];
let diagnosticPending = [];
let diagnosticRemote = {};
let diagnosticConnected = false;
let diagnosticBusy = false;
let diagnosticPlayer = null;
let diagnosticStops = [];
let diagnosticLogStop = null;
let diagnosticFailure = false;
function diagnosticId() {
    if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
    return Array.from(crypto.getRandomValues(new Uint32Array(4)), value => value.toString(16).padStart(8, '0')).join('-');
}

// Accept only structural metadata. Never copy payloads, messages, URLs or error messages.
function sanitiseDiagnostic(value) {
    if (!value || !DIAGNOSTIC_EVENTS.includes(value.event) || !['Peter','Jadey'].includes(value.actor)) return null;
    if (!Number.isFinite(value.at) || value.at <= 0) return null;
    const result = { event: value.event, actor: value.actor, at: value.at, outcome: ['attempted','confirmed','failed'].includes(value.outcome) ? value.outcome : 'confirmed' };
    if (['Peter','Jadey','both'].includes(value.profile)) result.profile = value.profile;
    for (const key of ['actionId','game','track','operation','mode']) {
        if (typeof value[key] === 'string' && /^[A-Za-z0-9_-]{1,100}$/.test(value[key])) result[key] = value[key];
    }
    for (const key of ['before','after','count','tier','line','column']) if (Number.isFinite(value[key])) result[key] = value[key];
    if (['app.js','achievements.js','game-history.js','wordsearch.js','sudoku.js','battleship.js','connect-four.js','tic-tac-toe.js','rps.js','realm-hub.js','realm-planner.js','store.js','game-pause.js'].includes(value.source)) result.source = value.source;
    for (const key of ['unlockedBefore','unlockedAfter']) if (typeof value[key] === 'boolean') result[key] = value[key];
    if (['PERMISSION_DENIED','permission-denied','disconnected','unavailable','conflict','network-error'].includes(value.errorCode)) result.errorCode = value.errorCode;
    return result;
}
function mergeDiagnosticLog(current, entries, now = Date.now()) {
    const combined = { ...(current || {}), ...entries };
    return Object.fromEntries(Object.entries(combined).map(([id, value]) => [id, sanitiseDiagnostic(value)])
        .filter(([id, value]) => /^[A-Za-z0-9_-]{1,100}$/.test(id) && value && value.at >= now - DIAGNOSTIC_AGE)
        .sort((a,b) => b[1].at - a[1].at || b[0].localeCompare(a[0])).slice(0, DIAGNOSTIC_LIMIT));
}
function persistDiagnosticBuffer() {
    diagnosticPending = diagnosticPending.filter(item => item.entry.at >= Date.now() - DIAGNOSTIC_AGE).slice(-100);
    try { localStorage.setItem('app-diagnostics-buffer', JSON.stringify(diagnosticPending)); } catch { /* In-memory export still works. */ }
}
function recordDiagnostic(event, data = {}) {
    const actor = data.actor || localPlayer;
    if (!actor) return;
    const entry = sanitiseDiagnostic({ ...data, event, actor, at: Date.now() });
    if (!entry) return;
    const id = diagnosticId();
    diagnosticPending.push({ id, entry });
    persistDiagnosticBuffer();
    renderDiagnosticLog();
    void flushDiagnostics();
}
async function flushDiagnostics() {
    if (diagnosticBusy || !diagnosticConnected || !localPlayer || !diagnosticPending.length) return;
    diagnosticBusy = true;
    const batch = diagnosticPending.slice();
    try {
        const result = await database.ref('diagnostics/events').transaction(current => mergeDiagnosticLog(current, Object.fromEntries(batch.map(item => [item.id, item.entry]))), undefined, false);
        if (!result.committed) throw new Error('Not committed');
        const ids = new Set(batch.map(item => item.id));
        diagnosticPending = diagnosticPending.filter(item => !ids.has(item.id));
        diagnosticFailure = false;
        persistDiagnosticBuffer();
    } catch { diagnosticFailure = true; }
    finally { diagnosticBusy = false; renderDiagnosticLog(); }
}
function stopDiagnostics() {
    diagnosticStops.forEach(stop => stop()); diagnosticStops = [];
    diagnosticLogStop?.(); diagnosticLogStop = null;
    diagnosticConnected = false; diagnosticPlayer = null; diagnosticRemote = {};
}
function startDiagnostics() {
    if (!localPlayer || diagnosticPlayer === localPlayer) return;
    stopDiagnostics();
    diagnosticPlayer = localPlayer;
    try {
        const stored = JSON.parse(localStorage.getItem('app-diagnostics-buffer') || '[]');
        if (Array.isArray(stored)) diagnosticPending = stored.filter(item => /^[a-zA-Z0-9_-]{1,100}$/.test(item?.id || '') && sanitiseDiagnostic(item.entry)).map(item => ({ id: item.id, entry: sanitiseDiagnostic(item.entry) })).slice(-100);
    } catch { /* Ignore malformed local data. */ }
    persistDiagnosticBuffer();
    const player = localPlayer;
    const ref = database.ref('.info/connected');
    const handler = snapshot => {
        if (localPlayer !== player) return;
        const connected = snapshot.val() === true;
        if (connected !== diagnosticConnected) {
            diagnosticConnected = connected;
            recordDiagnostic('connection', { outcome: connected ? 'confirmed' : 'failed', operation: connected ? 'restored' : 'lost' });
        }
        void flushDiagnostics();
    };
    ref.on('value', handler);
    diagnosticStops.push(() => ref.off('value', handler));
}
window.setInterval(() => { if (diagnosticPending.length) void flushDiagnostics(); }, 60000);

function repairAchievementState(state, command, now) {
    const track = ACHIEVEMENT_TRACKS.find(track => track.id === command.track);
    if (!track || !Number.isInteger(command.tier) || command.tier < 0 || command.tier >= track.thresholds.length) throw new Error('Choose an achievement tier.');
    if (!['progress','grant','revoke','automatic'].includes(command.operation)) throw new Error('Choose a repair action.');
    state = structuredClone(state || {});
    state.progressAdjustments ||= {}; state.tierOverrides ||= {}; state.unlocked ||= {};
    const key = `${track.id}_${command.tier}`;
    const progressKey = track.stars ? key : track.id;
    if (command.operation === 'progress') {
        if (!Number.isSafeInteger(command.value) || command.value < 0 || command.value > 1000000000) throw new Error('Progress must be a whole number from 0 to 1,000,000,000.');
        state.progressAdjustments[progressKey] = command.value - track.rawValue(state, command.tier);
    } else if (command.operation === 'automatic') {
        delete state.progressAdjustments[progressKey];
        delete state.tierOverrides[key];
    } else {
        state.tierOverrides[key] = command.operation === 'grant' ? 'granted' : 'revoked';
        if (command.operation === 'revoke') delete state.unlocked[key];
    }
    const previous = new Set(Object.keys(state.unlocked));
    awardAchievementTiers(state, now);
    for (const key of Object.keys(state.unlocked)) if (!previous.has(key)) state.unlocked[key].seenAt = now;
    return state;
}
function achievementRepairFingerprint(state, track) {
    return JSON.stringify(track.thresholds.map((_, index) => [track.value(state || {}, index), state?.tierOverrides?.[`${track.id}_${index}`] || '', Boolean(state?.unlocked?.[`${track.id}_${index}`])]));
}
let managedAchievementBusy = false;
function mountManagementTools() {
    if (localPlayer !== 'Peter') return;
    const content = document.querySelector('.management-content');
    if (!document.getElementById('management-tabs')) {
        const controls = document.createElement('div'); controls.id = 'management-controls';
        while (content.firstChild) controls.append(content.firstChild);
        content.append(controls);
        content.insertAdjacentHTML('afterbegin', '<div id="management-tabs" class="realm-tabs" role="tablist"><button role="tab" aria-selected="true" aria-controls="management-controls" data-management-tab="controls">Controls</button><button role="tab" aria-selected="false" aria-controls="management-log" data-management-tab="log">Activity Log</button></div>');
        controls.insertAdjacentHTML('afterbegin', `<section class="management-group"><h2>Achievements</h2><label for="repair-profile">Profile</label><select id="repair-profile"><option>Peter</option><option>Jadey</option></select><label for="repair-game">Game</label><select id="repair-game">${Object.entries(ACHIEVEMENT_GAMES).map(([id,name]) => `<option value="${id}">${name}</option>`).join('')}</select><label for="repair-track">Achievement track</label><select id="repair-track"></select><label for="repair-tier">Tier</label><select id="repair-tier"></select><label for="repair-operation">Action</label><select id="repair-operation"><option value="progress">Set progress</option><option value="grant">Grant tier</option><option value="revoke">Revoke tier</option><option value="automatic">Restore automatic tracking</option></select><label for="repair-value">Progress</label><input id="repair-value" type="number" min="0" max="1000000000" step="1" value="0"><button id="repair-preview">Review change</button><p id="repair-status" role="status"></p></section>`);
        content.insertAdjacentHTML('beforeend', '<section id="management-log" hidden><h2>Activity Log</h2><p id="diagnostic-status" role="status"></p><div class="diagnostic-filters"><label for="diagnostic-profile">Profile</label><select id="diagnostic-profile"><option value="all">All profiles</option><option>Peter</option><option>Jadey</option></select><label for="diagnostic-event">Event</label><select id="diagnostic-event"><option value="all">All events</option>'+DIAGNOSTIC_EVENTS.map(event => `<option>${event}</option>`).join('')+'</select><label class="diagnostic-errors"><input id="diagnostic-errors" class="app-checkbox" type="checkbox">Errors only</label></div><div class="management-actions"><button id="diagnostic-retry">Retry sync</button><button id="diagnostic-export">Export log</button></div><div id="diagnostic-entries"></div></section>');
        content.querySelectorAll('[data-management-tab]').forEach(button => { button.onclick = () => {
            const tab = button.dataset.managementTab;
            document.getElementById('management-controls').hidden = tab !== 'controls';
            document.getElementById('management-log').hidden = tab !== 'log';
            content.querySelectorAll('[data-management-tab]').forEach(item => item.setAttribute('aria-selected', String(item === button)));
            playUiSound('tap'); renderDiagnosticLog();
        }; });
        document.getElementById('repair-game').onchange = () => refreshRepairOptions(true);
        document.getElementById('repair-track').onchange = () => refreshRepairOptions(false);
        document.getElementById('repair-operation').onchange = () => { document.getElementById('repair-value').disabled = document.getElementById('repair-operation').value !== 'progress'; };
        document.getElementById('repair-preview').onclick = reviewAchievementRepair;
        for (const id of ['diagnostic-profile','diagnostic-event','diagnostic-errors']) document.getElementById(id).onchange = renderDiagnosticLog;
        document.getElementById('diagnostic-retry').onclick = () => { void flushDiagnostics(); playUiSound('tap'); };
        document.getElementById('diagnostic-export').onclick = exportDiagnostics;
        refreshRepairOptions(true);
    }
    if (!diagnosticLogStop) {
        const ref = database.ref('diagnostics/events');
        const callback = snapshot => { if (localPlayer === 'Peter') { diagnosticRemote = mergeDiagnosticLog(snapshot.val(), {}); renderDiagnosticLog(); } };
        ref.on('value', callback, () => { diagnosticFailure = true; renderDiagnosticLog(); });
        diagnosticLogStop = () => ref.off('value', callback);
    }
    renderDiagnosticLog();
}
function refreshRepairOptions(gameChanged) {
    const tracks = ACHIEVEMENT_TRACKS.filter(track => track.game === document.getElementById('repair-game').value);
    const select = document.getElementById('repair-track');
    if (gameChanged) select.replaceChildren(...tracks.map(track => new Option(track.title, track.id)));
    const track = ACHIEVEMENT_TRACKS.find(track => track.id === select.value);
    document.getElementById('repair-tier').replaceChildren(...track.thresholds.map((_,index) => new Option(achievementBadge(track,index).name, index)));
    enhanceGameSettingsSelects(document.getElementById('management-screen'));
    syncGameSettingsSelects(document.getElementById('management-screen'));
}
async function reviewAchievementRepair() {
    if (localPlayer !== 'Peter' || managedAchievementBusy) return;
    const command = { track: document.getElementById('repair-track').value, tier: Number(document.getElementById('repair-tier').value), operation: document.getElementById('repair-operation').value, value: Number(document.getElementById('repair-value').value) };
    const profile = document.getElementById('repair-profile').value;
    if (!['Peter','Jadey'].includes(profile)) return;
    const track = ACHIEVEMENT_TRACKS.find(item => item.id === command.track);
    const status = document.getElementById('repair-status');
    const actionId = diagnosticId();
    managedAchievementBusy = true;
    status.textContent = 'Loading current achievement data...';
    try {
        const ref = database.ref(`achievements/${profile}`);
        const snapshot = await ref.once('value');
        if (localPlayer !== 'Peter') return;
        const before = snapshot.val() || {};
        const after = repairAchievementState(before, command, Date.now());
        const fingerprint = achievementRepairFingerprint(before, track);
        const unlocked = Object.keys(after.unlocked || {}).filter(key => !before.unlocked?.[key]);
        const names = unlocked.map(key => { const index = Number(key.slice(key.lastIndexOf('_') + 1)); const owner = ACHIEVEMENT_TRACKS.find(t => key === `${t.id}_${index}`); return `${owner.title}: ${achievementBadge(owner,index).name}`; });
        const message = `${profile}: ${track.title}, ${achievementBadge(track,command.tier).name}. Progress ${track.value(before,command.tier)} to ${track.value(after,command.tier)}. Tier ${after.unlocked?.[`${track.id}_${command.tier}`] ? 'unlocked' : 'locked'}. ${names.length ? 'New unlocks: ' + names.join(', ') + '. ' : ''}Existing other unlocks are retained. Repairs do not award coins or replay celebrations. Revoked tiers stay locked until restored.`;
        if (!await confirmNewPuzzle('Apply achievement repair?', message, 'Apply') || localPlayer !== 'Peter') { status.textContent = 'No changes made.'; return; }
        recordDiagnostic('achievement-repair', { profile, track: track.id, tier: command.tier, operation: command.operation, outcome: 'attempted', actionId });
        const result = await ref.transaction(current => {
            if (localPlayer !== 'Peter') return;
            if (!current && snapshot.val()) return current;
            if (achievementRepairFingerprint(current,track) !== fingerprint) return;
            return repairAchievementState(current,command,Date.now());
        }, undefined, false);
        if (!result.committed || !result.snapshot.val()) { const error = new Error('This achievement changed. Review it again before applying.'); error.code = 'conflict'; throw error; }
        recordDiagnostic('achievement-repair', { actor: 'Peter', profile, track: track.id, tier: command.tier, operation: command.operation, outcome: 'confirmed', actionId, before: track.value(before,command.tier), after: track.value(result.snapshot.val(),command.tier), unlockedBefore: Boolean(before.unlocked?.[`${track.id}_${command.tier}`]), unlockedAfter: Boolean(result.snapshot.val()?.unlocked?.[`${track.id}_${command.tier}`]), count: unlocked.length });
        status.textContent = 'Achievement repair saved.'; playUiSound('confirm');
    } catch (error) {
        status.textContent = error.code === 'conflict' ? error.message : 'Could not apply the repair. Check the selected values and connection, then retry.';
        recordDiagnostic('achievement-repair', { actor: 'Peter', profile, track: command.track, outcome: 'failed', actionId, errorCode: error.code });
    } finally { managedAchievementBusy = false; }
}
function filteredDiagnostics() {
    const pending = Object.fromEntries(diagnosticPending.map(item => [item.id,item.entry]));
    const entries = Object.entries(mergeDiagnosticLog(diagnosticRemote, pending));
    const profile = document.getElementById('diagnostic-profile')?.value || 'all';
    const event = document.getElementById('diagnostic-event')?.value || 'all';
    const errors = document.getElementById('diagnostic-errors')?.checked;
    return entries.filter(([,entry]) => (profile === 'all' || (entry.profile || entry.actor) === profile || entry.profile === 'both') && (event === 'all' || entry.event === event) && (!errors || entry.outcome === 'failed'));
}
function renderDiagnosticLog() {
    if (typeof localPlayer === 'undefined' || localPlayer !== 'Peter' || !document.getElementById('diagnostic-entries')) return;
    const entries = filteredDiagnostics();
    document.getElementById('diagnostic-status').textContent = `${entries.length} / 500 entries · Last 7 days · ${diagnosticPending.length} pending locally${diagnosticFailure ? ' · Sync unavailable; local records retained' : ''}`;
    document.getElementById('diagnostic-entries').innerHTML = entries.length ? entries.map(([id,entry]) => `<details class="diagnostic-entry"><summary><span>${escapeHtml(entry.event)} · ${escapeHtml(entry.profile || entry.actor)}</span><strong class="diagnostic-${entry.outcome}">${entry.outcome}</strong><time>${new Date(entry.at).toLocaleString('en-GB')}</time></summary><pre>${escapeHtml(JSON.stringify({ id, ...entry }, null, 2))}</pre></details>`).join('') : '<p>No matching activity.</p>';
}
function exportDiagnostics() {
    if (localPlayer !== 'Peter') return;
    const blob = new Blob([JSON.stringify({ exportedAt: new Date().toISOString(), entries: filteredDiagnostics().map(([id, entry]) => ({ id, ...entry })) }, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a'); link.href = url; link.download = `app-diagnostics-${new Date().toISOString().slice(0,10)}.json`; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}
if (typeof localPlayer !== 'undefined' && localPlayer) startDiagnostics();
window.addEventListener('error', event => {
    let source;
    try { source = new URL(event.filename).pathname.split('/').at(-1); } catch { /* No URL or raw message is retained. */ }
    recordDiagnostic('runtime-error', { source, line: event.lineno, column: event.colno, outcome: 'failed', operation: 'exception' });
});
window.addEventListener('unhandledrejection', event => recordDiagnostic('runtime-error', { outcome: 'failed', operation: 'promise', errorCode: event.reason?.code }));

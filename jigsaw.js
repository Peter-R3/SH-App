const JIGSAW_PICTURES = [
    ['Me_and_SH', 'Together'], ['SH_and_Her_Cats', 'With the cats'], ['SH_and_The_Heart', 'The heart'],
    ['SH_and_The_Panda', 'A new friend'], ['SH_and_The_Slime', 'A tiny visitor'], ['SH_Cats_and_The_Spider', 'Watching the window'],
    ['SH_Caving', 'Caving'], ['SH_Caving_2', 'Another adventure'], ['SH_Eating', 'Snack break'],
    ['SH_Farming_Trees', 'Among the trees'], ['SH_in_a_Bookshelf', 'Between the books'], ['SH_in_Her_World', 'Cherry blossom evening'],
    ['SH_in_Our_House', 'At home'], ['SH_Looking_at_the_Ravine', 'The ravine'], ['The_Big_Bunny', 'The big bunny']
];
let jigsawSettings = { mode: 'solo', image: JIGSAW_PICTURES[0][0], size: 4, guide: false, timer: true };
let jigsawState = null, jigsawPath = '', jigsawStop = null, jigsawRequestStop = null;
let jigsawEpoch = 0, jigsawDrag = null, jigsawBusy = false, jigsawConnected = false;
let jigsawClockBusy = false, jigsawCompletionSeen = '', jigsawRequest = null;
const jigsawFinishing = new Set();
const jigsawImage = id => `./assets/jigsaw/${id}.png`;
const jigsawTitle = id => JIGSAW_PICTURES.find(p => p[0] === id)?.[1] || 'Jigsaw';
const jigsawTime = ms => `${Math.floor(ms / 60000)}m ${Math.floor(ms / 1000) % 60}s`;
function jigsawSaveSettings() { try { localStorage.setItem(`jigsaw-settings:${localPlayer}`, JSON.stringify(jigsawSettings)); } catch {} }
function jigsawLoadSettings() {
    let saved = {};
    try { saved = JSON.parse(localStorage.getItem(`jigsaw-settings:${localPlayer}`) || '{}') || {}; } catch {}
    jigsawSettings = { mode: saved.mode === 'coop' ? 'coop' : 'solo',
        image: JIGSAW_PICTURES.some(p => p[0] === saved.image) ? saved.image : JIGSAW_PICTURES[0][0],
        size: JigsawModel.sizes.includes(Number(saved.size)) ? Number(saved.size) : 4,
        guide: saved.guide === true, timer: saved.timer !== false };
}
function jigsawSessionPath() { return jigsawSettings.mode === 'coop' ? 'jigsaw/coop/current' : `jigsaw/solo/${localPlayer}/${jigsawSettings.image}_${jigsawSettings.size}`; }
function jigsawNewState() {
    return JigsawModel.create(jigsawSettings.image, jigsawSettings.size, Math.floor(Math.random() * 2147483647), database.ref('jigsaw/ids').push().key, Date.now());
}
function jigsawStatus(message) { document.getElementById('jigsaw-status').textContent = message; }
function stopJigsaw() {
    void jigsawHeartbeat(false);
    jigsawEpoch++;
    jigsawStop?.(); jigsawStop = null;
    jigsawRequestStop?.(); jigsawRequestStop = null;
    cancelJigsawDrag();
    jigsawPath = '';
}
async function launchJigsaw() {
    stopJigsaw();
    jigsawLoadSettings();
    setActiveAppView('jigsaw-lobby');
    document.querySelectorAll('.screen').forEach(el => el.classList.add('hidden'));
    document.getElementById('jigsaw-screen').classList.remove('hidden');
    applyThemeToScreen('jigsaw-screen', 'jigsaw-header-shell', 'jigsaw-nav-shell');
    refreshSharedHeader('jigsaw');
    showJigsawLobby();
    jigsawPath = jigsawSessionPath();
    const epoch = jigsawEpoch, mode = jigsawSettings.mode, ref = database.ref(jigsawPath);
    jigsawState = null;
    const listener = snapshot => {
        if (epoch !== jigsawEpoch) return;
        const previous = jigsawState;
        jigsawState = snapshot.val();
        if (jigsawDrag && (jigsawState?.id !== jigsawDrag.stateId || jigsawState?.pieces?.[jigsawDrag.id]?.revision !== jigsawDrag.revision)) cancelJigsawDrag();
        if (activeAppView === 'jigsaw-lobby') renderJigsawLobby();
        else if (activeAppView.startsWith('jigsaw')) {
            if (previous?.id && previous.id !== jigsawState?.id) {
                setActiveAppView('jigsaw-lobby'); showJigsawLobby();
            } else renderJigsaw();
        }
        if (jigsawState?.completedAt) void finalizeJigsaw(jigsawState, mode);
    };
    ref.on('value', listener, () => jigsawStatus('Could not load your puzzle. Reopen Jigsaw to retry.'));
    jigsawStop = () => ref.off('value', listener);
    if (jigsawSettings.mode === 'coop') {
        const requestRef = database.ref('jigsaw/coop/request');
        const handle = snapshot => { jigsawRequest = snapshot.val(); renderJigsawRequest(); };
        requestRef.on('value', handle);
        jigsawRequestStop = () => requestRef.off('value', handle);
    } else { jigsawRequest = null; renderJigsawRequest(); }
}
function showJigsawLobby() {
    document.getElementById('jigsaw-lobby').classList.remove('hidden');
    document.getElementById('jigsaw-play').classList.add('hidden');
    renderJigsawLobby();
}
function renderJigsawLobby() {
    const state = jigsawState;
    const current = state && !state.completedAt;
    const image = current ? state.image : jigsawSettings.image;
    document.getElementById('jigsaw-preview').src = jigsawImage(image);
    document.getElementById('jigsaw-preview').alt = jigsawTitle(image);
    document.getElementById('jigsaw-lobby-title').textContent = jigsawTitle(image);
    document.getElementById('jigsaw-lobby-detail').textContent = `${jigsawSettings.mode === 'coop' ? 'Co-op' : 'Solo'} · ${(current ? state.size : jigsawSettings.size) ** 2} pieces`;
    document.getElementById('jigsaw-ready').textContent = current ? 'Resume puzzle' : 'Play';
    const count = state ? Object.values(state.pieces).filter(p => p.locked).length : 0;
    jigsawStatus(current ? `${count} / ${state.size ** 2} pieces placed` : 'Ready when you are');
}
async function startJigsaw() {
    if (jigsawBusy) return;
    if (!jigsawConnected) { jigsawStatus('Connect to the internet to start or resume.'); return; }
    const epoch = jigsawEpoch, path = jigsawPath;
    jigsawBusy = true;
    document.getElementById('jigsaw-ready').disabled = true;
    try {
        const image = new Image(); image.src = jigsawImage(jigsawState && !jigsawState.completedAt ? jigsawState.image : jigsawSettings.image);
        await image.decode();
        if (epoch !== jigsawEpoch) return;
        if (!jigsawState || jigsawState.completedAt) {
            if (jigsawSettings.mode === 'coop' && jigsawState) { await requestJigsawPuzzle(); return; }
            const fresh = jigsawNewState();
            const result = await database.ref(path).transaction(current => current && !current.completedAt ? current : fresh, undefined, false);
            if (epoch !== jigsawEpoch) return;
            jigsawState = result.snapshot.val();
        }
        if (!jigsawState) throw new Error('No puzzle');
        jigsawSettings.image = jigsawState.image; jigsawSettings.size = jigsawState.size; jigsawSaveSettings();
        document.getElementById('jigsaw-lobby').classList.add('hidden');
        document.getElementById('jigsaw-play').classList.remove('hidden');
        setActiveAppView('jigsaw');
        await markJigsawGuide();
        renderJigsaw();
        playUiSound('ready');
        void jigsawHeartbeat(true);
    } catch { jigsawStatus('Could not open the puzzle. Check your connection and try again.'); }
    finally { jigsawBusy = false; document.getElementById('jigsaw-ready').disabled = false; }
}
function openJigsawSettings() {
    openSharedGameMenu('jigsaw', 'modes');
    document.getElementById('jigsaw-mode').value = jigsawSettings.mode;
    document.getElementById('jigsaw-size').value = jigsawSettings.size;
    document.getElementById('jigsaw-guide').checked = jigsawSettings.guide;
    document.getElementById('jigsaw-timer').checked = jigsawSettings.timer;
    renderJigsawGallery(); syncGameSettingsSelects();
}
function changeJigsawSetting(key, value) {
    if (key === 'size') value = Number(value);
    jigsawSettings[key] = value;
    jigsawSaveSettings(); renderJigsawGallery(); syncGameSettingsSelects();
}
function renderJigsawGallery() {
    document.getElementById('jigsaw-gallery').innerHTML = JIGSAW_PICTURES.map(([id,title]) => `<button type="button" data-picture="${id}" aria-label="${title}" aria-pressed="${id === jigsawSettings.image}"><img loading="lazy" src="${jigsawImage(id)}" alt=""><span>${title}</span></button>`).join('');
}
async function requestJigsawPuzzle() {
    if (!jigsawConnected) { jigsawStatus('Connect to the internet to create a puzzle.'); return; }
    const mode = jigsawSettings.mode, epoch = jigsawEpoch, player = localPlayer;
    const path = jigsawSessionPath();
    const current = (await database.ref(path).once('value')).val();
    if (epoch !== jigsawEpoch || player !== localPlayer) return;
    if (current && !current.completedAt && !await confirmNewPuzzle('Replace puzzle?', mode === 'coop' ? 'Ask the other player to replace your shared puzzle?' : 'Restart this picture and difficulty? Other saved puzzles will be kept.', mode === 'coop' ? 'Send request' : 'Restart')) return;
    if (epoch !== jigsawEpoch || player !== localPlayer) return;
    const fresh = jigsawNewState();
    if (mode === 'coop' && current) {
        const id = database.ref('jigsaw/requests').push().key;
        await database.ref('jigsaw/coop/request').set({ id, expected: current.id, requester: localPlayer, recipient: otherPlayer(localPlayer), state: fresh });
        await sendAppNotification({ action: 'jigsaw-request', type: 'Game Update', game: 'jigsaw', requestId: id, sender: localPlayer, recipient: otherPlayer(localPlayer), body: `${playerProfiles[localPlayer].nickname} wants a new Jigsaw: ${jigsawTitle(fresh.image)}, ${fresh.size ** 2} pieces`, createdAt: Date.now() });
        if (sharedPauseSession?.id === 'jigsaw') resumeSharedGame();
        jigsawStatus('Request sent. Your current puzzle is unchanged.');
    } else {
        await database.ref(path).transaction(value => value?.id === current?.id || !value ? fresh : undefined, undefined, false);
        if (sharedPauseSession?.id === 'jigsaw') closeSharedGameMenu();
        await launchJigsaw();
    }
}
function renderJigsawRequest() {
    const host = document.getElementById('jigsaw-request');
    const request = jigsawRequest;
    host.replaceChildren();
    if (!request || jigsawSettings.mode !== 'coop') return;
    const text = document.createElement('p');
    text.textContent = `${jigsawTitle(request.state.image)} · ${request.state.size ** 2} pieces${request.requester === localPlayer ? ' — waiting for approval' : ' — new puzzle requested'}`;
    host.append(text);
    if (request.recipient === localPlayer) for (const [label, answer] of [['Accept',true],['Decline',false]]) {
        const button = document.createElement('button'); button.textContent = label;
        button.onclick = () => respondJigsawRequest(request.id, answer);
        host.append(button);
    }
}
async function respondJigsawRequest(id, accepted) {
    await database.ref('jigsaw/coop').transaction(value => {
        if (!value?.request || value.request.id !== id || value.request.recipient !== localPlayer) return;
        if (accepted && value.current?.id === value.request.expected) value.current = value.request.state;
        delete value.request;
        return value;
    }, undefined, false);
    await removeMatchingNotifications(note => note.action === 'jigsaw-request' && note.requestId === id);
    playUiSound('confirm');
}
function pieceMarkup(state, id, edges) {
    const n = state.size, r = Math.floor(id / n), c = id % n;
    const clip = `jigsaw-piece-${id}`;
    const d = JigsawModel.outline(edges[id]);
    return `<svg viewBox="-22 -22 144 144" aria-hidden="true"><defs><clipPath id="${clip}"><path d="${d}"/></clipPath></defs><image href="${jigsawImage(state.image)}" x="${-c * 100}" y="${-r * 100}" width="${n * 100}" height="${n * 100}" clip-path="url(#${clip})"/><path d="${d}" fill="none" stroke="#FFFFFF80" stroke-width=".65"/></svg>`;
}
function renderJigsaw() {
    if (!jigsawState || jigsawDrag) return;
    const state = jigsawState, board = document.getElementById('jigsaw-board'), tray = document.getElementById('jigsaw-tray');
    board.style.setProperty('--piece-size', `${100 / state.size}%`);
    board.style.backgroundImage = jigsawSettings.guide ? `linear-gradient(#000B,#000B),url('${jigsawImage(state.image)}')` : 'none';
    const edges = JigsawModel.edges(state.size, state.seed);
    board.replaceChildren(); tray.replaceChildren();
    for (const [id,piece] of Object.entries(state.pieces).sort((a,b) => a[1].order - b[1].order)) {
        const button = document.createElement('button');
        button.type = 'button'; button.className = `jigsaw-piece${piece.locked ? ' locked' : ''}`; button.dataset.piece = id;
        button.setAttribute('aria-label', `Piece ${Number(id) + 1}${piece.locked ? ', placed' : ''}`);
        button.innerHTML = pieceMarkup(state, Number(id), edges);
        if (piece.locked) button.style.setProperty('--piece-owner', themeColorFor(piece.owner || localPlayer));
        button.disabled = Boolean(piece.locked || state.completedAt);
        if (piece.tray) tray.append(button);
        else {
            button.style.left = `${piece.x * 100}%`; button.style.top = `${piece.y * 100}%`;
            button.style.zIndex = piece.locked ? '1' : String(2 + Math.max(0, (piece.movedAt || 0) % 1000000));
            board.append(button);
        }
        button.onpointerdown = event => beginJigsawDrag(event, Number(id));
        button.onkeydown = event => keyboardJigsawPiece(event, Number(id));
    }
    const placed = Object.values(state.pieces).filter(p => p.locked).length;
    document.getElementById('jigsaw-progress').textContent = `${placed} / ${state.size ** 2} pieces · ${state.size ** 2 - placed} left`;
    document.getElementById('jigsaw-progress-bar').value = placed / state.size ** 2;
    document.getElementById('jigsaw-time').textContent = jigsawSettings.timer ? jigsawTime(state.elapsed) : '';
    document.getElementById('jigsaw-finished').classList.toggle('hidden', !state.completedAt);
    tray.classList.toggle('hidden', Boolean(state.completedAt));
    if (state.completedAt) {
        board.innerHTML = `<img class="jigsaw-finished-image" src="${jigsawImage(state.image)}" alt="${escapeHtml(jigsawTitle(state.image))}">`;
        if (jigsawCompletionSeen !== state.id && activeAppView === 'jigsaw') {
            jigsawCompletionSeen = state.id;
            const cue = document.getElementById('jigsaw-complete-cue');
            cue.classList.remove('hidden'); playUiSound('complete');
            setTimeout(() => { cue.classList.add('hidden'); maybeRevealAchievements(); }, 1600);
        }
    }
}
function beginJigsawDrag(event, id) {
    if (event.button !== 0 || activeAppView !== 'jigsaw' || !jigsawConnected || jigsawBusy || jigsawDrag || jigsawState?.completedAt) return;
    const piece = jigsawState.pieces[id];
    if (piece.locked) return;
    event.preventDefault();
    const board = document.getElementById('jigsaw-board').getBoundingClientRect();
    const rect = event.currentTarget.getBoundingClientRect();
    const ghost = event.currentTarget.cloneNode(true);
    // A separate clip ID avoids the clone referencing a hidden original.
    ghost.innerHTML = ghost.innerHTML.replaceAll(`jigsaw-piece-${id}`, `jigsaw-drag-${id}`);
    ghost.removeAttribute('style'); ghost.removeAttribute('data-piece'); ghost.className = 'jigsaw-drag-ghost';
    const width = board.width / jigsawState.size * 1.44;
    ghost.style.width = `${width}px`; document.body.append(ghost);
    jigsawDrag = { id, pointer: event.pointerId, ghost, original: event.currentTarget,
        stateId: jigsawState.id, revision: piece.revision, path: jigsawPath,
        dx: (event.clientX - rect.left) / rect.width * width, dy: (event.clientY - rect.top) / rect.height * width };
    event.currentTarget.style.opacity = '.15';
    moveJigsawDrag(event);
    playUiSound('tap');
}
function moveJigsawDrag(event) {
    if (!jigsawDrag || event.pointerId !== jigsawDrag.pointer) return;
    event.preventDefault();
    jigsawDrag.ghost.style.left = `${event.clientX - jigsawDrag.dx}px`;
    jigsawDrag.ghost.style.top = `${event.clientY - jigsawDrag.dy}px`;
}
function cancelJigsawDrag() {
    if (!jigsawDrag) return;
    jigsawDrag.original.style.opacity = ''; jigsawDrag.ghost.remove(); jigsawDrag = null;
}
async function finishJigsawDrag(event) {
    if (!jigsawDrag || event.pointerId !== jigsawDrag.pointer) return;
    const drag = jigsawDrag, board = document.getElementById('jigsaw-board').getBoundingClientRect(), tray = document.getElementById('jigsaw-tray').getBoundingClientRect();
    const overTray = event.clientX >= tray.left && event.clientX <= tray.right && event.clientY >= tray.top && event.clientY <= tray.bottom;
    const overBoard = event.clientX >= board.left && event.clientX <= board.right && event.clientY >= board.top && event.clientY <= board.bottom;
    const pad = board.width / jigsawState.size * .22;
    const destination = { tray: overTray, x: (event.clientX - drag.dx + pad - board.left) / board.width, y: (event.clientY - drag.dy + pad - board.top) / board.height };
    cancelJigsawDrag();
    if (overTray || overBoard) await saveJigsawDrop(drag, destination);
    else renderJigsaw();
}
async function saveJigsawDrop(drag, destination) {
    if (!jigsawConnected || activeAppView !== 'jigsaw') return;
    jigsawBusy = true;
    try {
        const result = await database.ref(drag.path).transaction(state => {
            if (state?.id !== drag.stateId) return;
            JigsawModel.heartbeat(state, localPlayer, true, Date.now() + (homePresenceOffset || 0));
            return JigsawModel.drop(state, drag.id, drag.revision, destination, localPlayer, Date.now());
        }, undefined, false);
        if (result.committed) playUiSound(result.snapshot.val().pieces[drag.id].locked ? 'success' : 'tap');
    } catch { document.getElementById('jigsaw-progress').textContent = 'Move not saved. Please try again.'; }
    finally { jigsawBusy = false; renderJigsaw(); }
}
function keyboardJigsawPiece(event, id) {
    const piece = jigsawState?.pieces[id];
    if (!piece || piece.locked) return;
    const step = 1 / jigsawState.size;
    const offsets = { ArrowLeft: [-step,0], ArrowRight: [step,0], ArrowUp: [0,-step], ArrowDown: [0,step] };
    if (!offsets[event.key] && event.key !== 'Delete' && event.key !== 'Enter') return;
    event.preventDefault();
    const [dx,dy] = offsets[event.key] || [0,0];
    void saveJigsawDrop({ id, stateId: jigsawState.id, revision: piece.revision, path: jigsawPath }, { tray: event.key === 'Delete', x: (piece.x || 0) + dx, y: (piece.y || 0) + dy });
}
async function markJigsawGuide() {
    if (!jigsawSettings.guide || !jigsawPath) return;
    await database.ref(jigsawPath).transaction(state => {
        if (!state || state.completedAt || state.usedGuide) return;
        state.usedGuide = true; return state;
    }, undefined, false);
}
async function jigsawHeartbeat(active) {
    if (!jigsawPath || !jigsawConnected || (active && jigsawClockBusy) || !jigsawState || jigsawState.completedAt) return;
    const path = jigsawPath, id = jigsawState.id, player = localPlayer;
    jigsawClockBusy = true;
    try { await database.ref(path).transaction(state => state?.id === id ? JigsawModel.heartbeat(state, player, active, Date.now() + (homePresenceOffset || 0)) : undefined, undefined, false); }
    catch { /* The next active heartbeat retries without counting time away. */ }
    finally { jigsawClockBusy = false; }
}
function jigsawViewChanged(view) {
    cancelJigsawDrag();
    if (!view.startsWith('jigsaw')) stopJigsaw();
    else { void jigsawHeartbeat(view === 'jigsaw' && !document.hidden); if (view === 'jigsaw') { void markJigsawGuide(); renderJigsaw(); } }
}
async function finalizeJigsaw(state, mode) {
    if (jigsawFinishing.has(state.id)) return;
    jigsawFinishing.add(state.id);
    try {
        for (const player of ['Peter','Jadey'].filter(player => Object.values(state.pieces).some(p => p.owner === player))) {
            await database.ref(`stats/jigsaw/${player}`).transaction(stats => JigsawModel.credit(stats, state, mode, player), undefined, false);
            const record = { id: state.id, mode, completedAt: state.completedAt, difficulty: `${state.size ** 2} pieces`, image: state.image, elapsed: state.elapsed, players: {} };
            for (const owner of ['Peter','Jadey']) {
                const count = Object.values(state.pieces).filter(piece => piece.owner === owner).length;
                if (count) record.players[owner] = { pieces: count };
            }
            await database.ref(`history/games/jigsaw/${player}`).transaction(history => mergeGameHistory(history, record), undefined, false);
        }
    } catch { jigsawFinishing.delete(state.id); }
}
function chooseAnotherJigsaw() { setActiveAppView('jigsaw-lobby'); showJigsawLobby(); openJigsawSettings(); }
function showJigsawReference() {
    if (!jigsawState) return;
    const dialog = document.getElementById('jigsaw-reference');
    dialog.querySelector('img').src = jigsawImage(jigsawState.image);
    dialog.showModal(); playUiSound('tap');
}
function renderJigsawStats() {
    const host = document.getElementById('jigsaw-stats-content');
    if (!host) return;
    const expanded = new Set([...host.querySelectorAll('details[open]')].map(el => el.dataset.times));
    const count = value => Math.max(0, Math.floor(Number(value) || 0));
    host.innerHTML = ['Peter','Jadey'].map(player => {
        const data = latestStats?.jigsaw?.[player] || {};
        const sections = ['solo','coop'].map(mode => {
            const rows = JigsawModel.sizes.map(n => {
                const stats = data[mode]?.[n] || {}, completed = count(stats.completed), pieces = count(stats.pieces);
                return `<div class="word-stats-row jigsaw-stats-row"><strong>${n*n} pieces</strong><span>${completed} ${completed === 1 ? 'puzzle' : 'puzzles'}</span><span>${pieces} ${pieces === 1 ? 'piece' : 'pieces'}</span></div>`;
            }).join('');
            const times = ['regular','guided'].map(category => {
                const entries = JIGSAW_PICTURES.flatMap(([image,title]) => JigsawModel.sizes.flatMap(n => {
                    const time = data[mode]?.[n]?.times?.[`${image}_${category}`];
                    if (time == null || !Number.isFinite(Number(time)) || Number(time) < 0) return [];
                    return [`<div class="word-stats-row jigsaw-time-row"><strong>${escapeHtml(title)}</strong><span>${n*n}</span><span>${jigsawTime(Number(time))}</span></div>`];
                }));
                return entries.length ? `<h5>${category === 'guided' ? 'Guided' : 'Unguided'}</h5><div class="word-stats-row word-stats-head jigsaw-time-row"><strong>Picture</strong><span>Pieces</span><span>Best</span></div>${entries.join('')}` : '';
            }).join('');
            const id = `${player}-${mode}`;
            return `<div class="word-stats-mode"><h4>${mode === 'solo' ? 'Solo' : 'Co-op'}</h4><div class="word-stats-row word-stats-head jigsaw-stats-row"><strong>Difficulty</strong><span>Completed</span><span>Placed</span></div>${rows}<details class="jigsaw-best-times" data-times="${id}" ${expanded.has(id) ? 'open' : ''}><summary>Best times</summary>${times || '<p>No completed puzzles yet.</p>'}</details></div>`;
        }).join('');
        return `<section class="word-stats-player ${player.toLowerCase()}"><h3>${escapeHtml(playerProfiles[player]?.nickname || player)}</h3><p class="jigsaw-picture-count">${Object.keys(data.pictures || {}).length} / ${JIGSAW_PICTURES.length} pictures completed</p>${sections}</section>`;
    }).join('');
}

function initialiseJigsaw() {
    const screen = document.createElement('section'); screen.id = 'jigsaw-screen'; screen.className = 'screen hidden jigsaw-screen';
    const header = document.getElementById('word-search-header-shell').cloneNode(true);
    header.id = 'jigsaw-header-shell'; header.querySelector('.header-title').textContent = 'Jigsaw';
    header.querySelectorAll('[id]').forEach(el => el.id = el.id.replace('word-search','jigsaw'));
    const nav = document.getElementById('home-nav-shell').cloneNode(true); nav.id = 'jigsaw-nav-shell';
    nav.querySelectorAll('[id]').forEach(el => el.removeAttribute('id'));
    screen.append(header);
    screen.insertAdjacentHTML('beforeend', `<div id="jigsaw-lobby" class="jigsaw-lobby"><img id="jigsaw-preview" alt=""><h2 id="jigsaw-lobby-title"></h2><p id="jigsaw-lobby-detail"></p><p id="jigsaw-status" role="status"></p><button id="jigsaw-ready" class="primary" onclick="startJigsaw()">Play</button><button onclick="openJigsawSettings()">Game Settings</button><div id="jigsaw-request"></div></div><div id="jigsaw-play" class="jigsaw-play hidden"><div class="jigsaw-toolbar"><span id="jigsaw-progress" role="status"></span><span id="jigsaw-time"></span><button onclick="showJigsawReference()" aria-label="View reference picture" title="View reference picture"><svg viewBox="0 0 24 24"><path d="M2 3h20v18H2zm2 2v12l5-5 4 4 3-3 4 4V5z"/></svg></button></div><progress id="jigsaw-progress-bar" max="1" value="0" aria-label="Puzzle progress"></progress><div id="jigsaw-board" class="jigsaw-board" aria-label="Puzzle board"></div><div id="jigsaw-tray" class="jigsaw-tray" aria-label="Loose pieces"></div><div id="jigsaw-finished" class="hidden"><h2>Puzzle complete</h2><button class="primary" onclick="chooseAnotherJigsaw()">Choose another</button></div></div><div id="jigsaw-complete-cue" class="jigsaw-complete-cue hidden" aria-live="polite">Puzzle complete</div>`);
    screen.append(nav); document.getElementById('main-content').append(screen);
    const tray = document.getElementById('jigsaw-tray');
    const trayShell = document.createElement('div'); trayShell.className = 'jigsaw-tray-shell';
    tray.before(trayShell); trayShell.append(tray);
    for (const [direction,label] of [[-1,'Previous pieces'],[1,'More pieces']]) {
        const button = document.createElement('button'); button.type = 'button'; button.title = label; button.setAttribute('aria-label',label);
        button.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${direction < 0 ? 'm7 14 5-5 5 5' : 'm7 10 5 5 5-5'}"/></svg>`;
        button.onclick = () => { tray.scrollBy({ top: direction * 86, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' }); playUiSound('tap'); };
        direction < 0 ? trayShell.prepend(button) : trayShell.append(button);
    }
    new ResizeObserver(() => {
        const play = document.getElementById('jigsaw-play');
        if (play.clientHeight) play.style.setProperty('--jigsaw-board-max', `${Math.max(140, play.clientHeight - 232)}px`);
    }).observe(document.getElementById('jigsaw-play'));
    const settings = document.createElement('section'); settings.id = 'jigsaw-settings-screen'; settings.className = 'screen hidden';
    settings.innerHTML = `<div></div><div class="jigsaw-settings"><label for="jigsaw-mode">Mode</label><select id="jigsaw-mode" onchange="changeJigsawSetting('mode',this.value)"><option value="solo">Solo</option><option value="coop">Co-op</option></select><label for="jigsaw-size">Pieces</label><select id="jigsaw-size" onchange="changeJigsawSetting('size',this.value)">${JigsawModel.sizes.map(n=>`<option value="${n}">${n*n} pieces</option>`).join('')}</select><label class="jigsaw-check"><input class="app-checkbox" id="jigsaw-guide" type="checkbox" onchange="changeJigsawSetting('guide',this.checked)">Faint picture guide</label><label class="jigsaw-check"><input class="app-checkbox" id="jigsaw-timer" type="checkbox" onchange="changeJigsawSetting('timer',this.checked)">Show elapsed time</label><h3>Choose a picture</h3><div id="jigsaw-gallery" class="jigsaw-gallery"></div><button class="primary" onclick="requestJigsawPuzzle()">New puzzle</button></div>`;
    document.getElementById('main-content').append(settings);
    document.getElementById('jigsaw-gallery').onclick = event => { const button = event.target.closest('[data-picture]'); if (button) { changeJigsawSetting('image',button.dataset.picture); playUiSound('tap'); } };
    const gameButton = document.createElement('button'); gameButton.className = 'grid-game-btn game-card-art';
    gameButton.style.setProperty('--game-art', "url('./assets/games/jigsaw.svg')");
    gameButton.innerHTML = '<img class="game-card-image" src="./assets/games/jigsaw.svg" alt=""><span>Jigsaw</span>'; gameButton.onclick = launchJigsaw;
    document.querySelector('#main-dashboard .grid-game-btn').parentElement.append(gameButton);
    const statsButton = document.createElement('button'); statsButton.className = 'stats-category-card'; statsButton.innerHTML = '<img src="./assets/games/jigsaw.svg" alt=""><span>Jigsaw</span>'; statsButton.onclick = () => openStatsCategory('jigsaw');
    document.getElementById('stats-categories').append(statsButton);
    const stats = document.createElement('div'); stats.id = 'stats-jigsaw-detail'; stats.className = 'hidden';
    stats.innerHTML = '<div class="stats-content-heading"><h2>Jigsaw</h2><button class="mode-select-btn stats-content-back-btn" onclick="closeStatsCategory()" aria-label="Back to game statistics"><svg viewBox="0 0 24 24"><path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.42-1.41L7.83 13H20v-2z"/></svg></button></div><div id="jigsaw-stats-content"></div>';
    document.getElementById('stats-categories').after(stats);
    sharedPauseGames.jigsaw = { launch: launchJigsaw, settingsAction: openJigsawSettings, settingsLabel: 'Game Settings', settings: () => jigsawSettings, stats: 'jigsaw-stats-content', render: renderJigsawStats };
    focusGameScreens.jigsaw = 'jigsaw-screen'; historyGameKeys.jigsaw = 'jigsaw';
    const dialog = document.createElement('dialog'); dialog.id = 'jigsaw-reference'; dialog.className = 'game-confirm-dialog jigsaw-reference'; dialog.innerHTML = '<img alt="Puzzle reference"><form method="dialog"><button>Close</button></form>'; document.body.append(dialog);
    document.addEventListener('pointermove', moveJigsawDrag, { passive: false });
    document.addEventListener('pointerup', finishJigsawDrag);
    document.addEventListener('pointercancel', () => { cancelJigsawDrag(); renderJigsaw(); });
    window.addEventListener('resize', cancelJigsawDrag);
    document.addEventListener('visibilitychange', () => { cancelJigsawDrag(); void jigsawHeartbeat(!document.hidden && activeAppView === 'jigsaw'); });
    window.addEventListener('pagehide', () => { void jigsawHeartbeat(false); });
    database.ref('.info/connected').on('value', snapshot => {
        jigsawConnected = snapshot.val() === true;
        if (!jigsawConnected) {
            cancelJigsawDrag();
            if (activeAppView.startsWith('jigsaw')) jigsawStatus('Offline. Reconnect to continue your saved puzzle.');
        } else if (activeAppView === 'jigsaw-lobby') renderJigsawLobby();
    });
    setInterval(() => { if (activeAppView === 'jigsaw' && !document.hidden) void jigsawHeartbeat(true).catch(() => {}); }, 5000);
    initialiseGamePauseMenus();
}

initialiseJigsaw();

ACHIEVEMENT_GAMES.jigsaw = 'Jigsaw';
for (const mode of ['solo','coop']) addAchievementTrack('jigsaw', `jigsaw-${mode}`, mode === 'solo' ? 'Solo puzzles' : 'Co-op puzzles',
    [1,2,3,5,8,12,18,25,35,50,70,95,125,165,220], s => achievementTotal(s, `jigsaw_${mode}`), n => `Complete ${n} ${mode === 'solo' ? 'solo' : 'co-op'} puzzles.`);
addAchievementTrack('jigsaw','jigsaw-pieces','Pieces placed',[16,40,80,150,250,400,650,1000,1500,2200,3200,4500,6200,8500,12000],
    s => achievementTotal(s,'jigsaw_pieces'), n => `Place ${n} pieces in completed puzzles.`);
addAchievementTrack('jigsaw','jigsaw-pictures','Picture collection',[1,3,5,10,15],s=>achievementTotal(s,'jigsaw_pictures'),n=>`Complete ${n} different pictures.`,true);
addAchievementTrack('jigsaw','jigsaw-sizes','Every difficulty',[1,2,3,4,5],s=>achievementTotal(s,'jigsaw_sizes'),n=>`Complete puzzles at ${n} different piece counts.`,true);
function jigsawAchievementSources(stats, player, source) {
    const data = stats.jigsaw?.[player] || {}, result = {};
    let pieces = 0;
    for (const mode of ['solo','coop']) {
        let completed = 0;
        for (const n of JigsawModel.sizes) { completed += Number(data[mode]?.[n]?.completed) || 0; pieces += Number(data[mode]?.[n]?.pieces) || 0; }
        result[`jigsaw_${mode}`] = source(completed, `jigsaw/${player}/${mode}`);
    }
    result.jigsaw_pieces = source(pieces, `jigsaw/${player}/pieces`);
    result.jigsaw_pictures = source(Object.keys(data.pictures || {}).length, `jigsaw/${player}/pictures`);
    result.jigsaw_sizes = source(Object.keys(data.difficulties || {}).length, `jigsaw/${player}/sizes`);
    return result;
}

function mountJigsawManagement() {
    if (localPlayer !== 'Peter' || document.getElementById('jigsaw-management')) return;
    const panel = document.createElement('section'); panel.id = 'jigsaw-management'; panel.className = 'management-group';
    panel.innerHTML = `<h2>Jigsaw scores</h2><label for="jigsaw-manage-profile">Profile</label><select id="jigsaw-manage-profile"><option>Peter</option><option>Jadey</option><option value="both">Both profiles</option></select><label for="jigsaw-manage-mode">Mode</label><select id="jigsaw-manage-mode"><option value="all">All</option><option value="solo">Solo</option><option value="coop">Co-op</option></select><label for="jigsaw-manage-size">Piece count</label><select id="jigsaw-manage-size"><option value="all">All</option>${JigsawModel.sizes.map(n=>`<option value="${n}">${n*n}</option>`).join('')}</select><label for="jigsaw-manage-metric">Statistic</label><select id="jigsaw-manage-metric"><option value="completed">Puzzles completed</option><option value="pieces">Pieces placed</option><option value="times">Best times (seconds)</option><option value="all">All scores (reset only)</option></select><label for="jigsaw-manage-image">Picture for best time</label><select id="jigsaw-manage-image">${JIGSAW_PICTURES.map(([id,title])=>`<option value="${id}">${title}</option>`).join('')}</select><label for="jigsaw-manage-guide">Best time category</label><select id="jigsaw-manage-guide"><option value="regular">Unguided</option><option value="guided">Guided</option></select><label for="jigsaw-manage-value">Value</label><input id="jigsaw-manage-value" type="number" min="0" max="1000000" value="0"><div class="management-actions">${[['set','Set'],['increment','+1'],['decrement','-1'],['reset','Reset']].map(([op,label])=>`<button onclick="manageJigsawScores('${op}')">${label}</button>`).join('')}</div><p id="jigsaw-manage-status" role="status"></p>`;
    document.getElementById('management-controls').append(panel);
    enhanceGameSettingsSelects(panel);
}
async function manageJigsawScores(operation) {
    if (localPlayer !== 'Peter') return;
    const value = name => document.getElementById(`jigsaw-manage-${name}`).value;
    const profile = value('profile'), mode = value('mode'), size = value('size'), metric = value('metric');
    const amount = Number(value('value')), image = value('image'), category = value('guide');
    const status = document.getElementById('jigsaw-manage-status');
    if (!Number.isFinite(amount) || amount < 0 || amount > 1000000 || (metric === 'all' && operation !== 'reset')) { status.textContent = 'Enter a valid value. All scores supports Reset only.'; return; }
    if (!await confirmNewPuzzle('Update Jigsaw scores?', `${operation === 'reset' ? 'Reset' : 'Adjust'} ${metric === 'all' ? 'all selected scores' : metric} for ${profile === 'both' ? 'both profiles' : profile}?`, 'Apply')) return;
    if (localPlayer !== 'Peter') return;
    try {
        for (const owner of profile === 'both' ? ['Peter','Jadey'] : [profile]) await database.ref(`stats/jigsaw/${owner}`).transaction(stats => {
            stats ||= {};
            for (const m of mode === 'all' ? ['solo','coop'] : [mode]) for (const n of size === 'all' ? JigsawModel.sizes : [Number(size)]) {
                stats[m] ||= {}; stats[m][n] ||= {};
                const total = stats[m][n];
                for (const key of metric === 'all' ? ['completed','pieces','times'] : [metric]) {
                    if (key === 'times' && operation === 'reset' && metric === 'all') { delete total.times; continue; }
                    const target = key === 'times' ? (total.times ||= {}) : total;
                    const field = key === 'times' ? `${image}_${category}` : key;
                    const unit = key === 'times' ? 1000 : 1;
                    if (operation === 'reset') delete target[field];
                    else target[field] = Math.max(0, operation === 'set' ? Math.round(amount * unit) : (Number(target[field]) || 0) + (operation === 'increment' ? unit : -unit));
                }
            }
            if (metric === 'all' && size === 'all' && mode === 'all') { delete stats.pictures; delete stats.difficulties; }
            return stats;
        }, undefined, false);
        status.textContent = 'Jigsaw scores updated.';
        recordDiagnostic('score-adjust', { game: 'jigsaw', operation, profile, outcome: 'confirmed' });
    } catch { status.textContent = 'Could not update scores. Please retry.'; }
}

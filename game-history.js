const historyGameKeys = { 'number-guess': 'number', 'word-search': 'ws', sudoku: 'sudoku', battleship: 'battleship', 'connect-four': 'connect', 'tic-tac-toe': 'ttt', rps: 'rps' };
let gameAchievementContext = null;
function restoreGameAchievements() {
    if (!gameAchievementContext) return;
    const { placeholder, content } = gameAchievementContext;
    placeholder.replaceWith(content);
    gameAchievementContext = null;
    achievementSelectedGame = 'all';
}
function openGameAchievements(id) {
    if (id === 'number-guess') openNumberGuessMenu('achievements');
    else openSharedGameMenu(id, 'achievements');
    const host = id === 'number-guess' ? document.getElementById('number-guess-achievements-panel') : document.querySelector(`#${id}-screen .shared-submenu-content`);
    const content = document.querySelector('.achievements-content');
    const placeholder = document.createComment('Achievement screen content');
    content.before(placeholder);
    gameAchievementContext = { placeholder, content, back: () => id === 'number-guess' ? openNumberGuessPause() : openSharedGameMenu(id) };
    host.append(content);
    achievementSelectedGame = historyGameKeys[id];
    achievementSelectedTrack = null;
    renderAchievements();
}
const numberAchievementPanel = document.createElement('div');
numberAchievementPanel.id = 'number-guess-achievements-panel';
numberAchievementPanel.className = 'number-guess-menu-panel hidden';
document.getElementById('number-guess-menu-area').append(numberAchievementPanel);
const numberAchievementButton = document.createElement('button');
numberAchievementButton.className = 'pause-option-btn';
numberAchievementButton.textContent = 'Achievements';
numberAchievementButton.onclick = () => openGameAchievements('number-guess');
document.getElementById('number-guess-pause-panel').append(numberAchievementButton);

function historyDate(value) {
    if (!Number(value)) return 'Date unavailable';
    return new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(Number(value)));
}
function mergeGameHistory(current, record) {
    const records = { ...(current || {}) };
    if (!records[record.id]) records[record.id] = record;
    return Object.fromEntries(Object.entries(records).sort((a, b) => b[1].completedAt - a[1].completedAt || b[0].localeCompare(a[0])).slice(0, 7));
}
const historyWrites = new Map();
function recordGameHistory(game, state, mode, player = localPlayer) {
    if (!state || state.abandonedBy || (!state.completedAt && state.status !== 'finished')) return;
    const started = state.roundId || state.createdAt || state.startedAt;
    if (!started || !state.completedAt) return;
    const ai = mode === 'versus-ai' || mode === 'versusAi';
    const owners = mode === 'solo' || ai ? [player] : ['Peter', 'Jadey'];
    const record = {
        id: `${mode}_${started}`.replace(/[.#$\[\]/]/g, '_'), mode, completedAt: state.completedAt,
        difficulty: state.puzzle?.size || state.puzzle?.difficulty || state.difficulty || '',
        aiDifficulty: ai ? state.aiDifficulty || '' : '',
        winner: state.winner === 'AI' ? 'Jaylin' : state.winner === 'player' ? player : state.winner || '',
        elapsed: game === 'ws' ? Number(ai ? state.aiActiveMs : mode === 'versus' ? state.completedAt - state.startedAt : state.activeMs) || 0
            : game === 'sudoku' ? Math.max(0, Number(ai ? state.aiActiveMs : state.completedAt - state.startedAt - (state.pausedMs || 0)) || 0) : 0,
        players: {}
    };
    if (game === 'ttt') record.board = Array.from({ length: 9 }, (_, i) => state.board?.[i] || '');
    if (game === 'connect') record.moves = Object.values(state.board || {}).filter(Boolean).length;
    const participants = ai ? [player, 'AI'] : owners;
    for (const owner of participants) {
        // Firebase removes empty objects, so retain a real field for every participant.
        const details = { participant: true };
        if (game === 'rps') details.choice = state.choices?.[owner] || state.choices?.Jaylin || '';
        if (game === 'ws') details.words = owner === 'AI' ? (record.winner === 'Jaylin' ? state.puzzle?.words?.length || 0 : null) : mode === 'versus' ? Object.keys(state.foundBy?.[owner] || {}).length : Object.values(state.found || {}).filter(finder => finder === owner).length;
        if (game === 'battleship') {
            const board = state.boards?.[otherPlayer(owner)];
            const shots = Object.values(board?.shotsReceived || {});
            details.shots = shots.length;
            details.hits = shots.filter(shot => shot.hit).length;
            const fleet = state.boards?.[owner];
            details.afloat = (fleet?.ships || []).filter(ship => !ship.cells.every(cell => fleet.shotsReceived?.[cell]?.hit)).length;
        }
        record.players[owner === 'AI' ? 'Jaylin' : owner] = details;
    }
    for (const owner of owners) {
        const key = `${game}/${owner}/${record.id}`;
        if (historyWrites.has(key)) continue;
        historyWrites.set(key, true);
        database.ref(`history/games/${game}/${owner}`).transaction(current => mergeGameHistory(current, record), undefined, false)
            .then(result => { if (typeof recordDiagnostic === 'function') recordDiagnostic('history-save', { profile: owner, game, actionId: record.id, outcome: result?.committed ? 'confirmed' : 'failed' }); })
            .catch(error => {
                historyWrites.delete(key);
                if (typeof recordDiagnostic === 'function') recordDiagnostic('history-save', { profile: owner, game, actionId: record.id, outcome: 'failed', errorCode: error.code });
            });
    }
}
let puzzleHistorySubscriptions = [];
function initialisePuzzleHistory(player) {
    puzzleHistorySubscriptions.forEach(stop => stop());
    puzzleHistorySubscriptions = [];
    for (const [game, root] of [['ws', 'wordSearch'], ['sudoku', 'sudoku']]) {
        for (const [suffix, mode] of [[`solo/${player}`, 'solo'], [`ai/${player}`, 'versus-ai'], ['coop/current', 'coop'], ['versus/current', 'versus']]) {
            const ref = database.ref(`${root}/${suffix}`);
            const visit = value => {
                if (!value || typeof value !== 'object') return;
                if (value.puzzle) { recordGameHistory(game, value, mode, player); return; }
                Object.values(value).forEach(visit);
            };
            const callback = snapshot => { if (localPlayer === player) visit(snapshot.val()); };
            ref.on('value', callback, error => console.warn('History sync unavailable', error));
            puzzleHistorySubscriptions.push(() => ref.off('value', callback));
        }
    }
}
function historyPlayerName(player) { return playerProfiles[player]?.nickname || (player === 'AI' ? 'Jaylin' : player); }
function historyPlayerColour(player) { return themeColorFor(player === 'AI' || player === 'Jaylin' ? otherPlayer(localPlayer) : player); }
function historyPlayerResult(game, record, player, values) {
    if (game === 'rps') return values.choice || 'Unknown';
    if (game === 'ws') return values.words == null ? 'Not finished' : `${values.words} ${values.words === 1 ? 'word' : 'words'}`;
    if (game === 'battleship') return `${values.hits}/${values.shots} hits · ${values.afloat} afloat`;
    return player === record.winner ? 'Winner' : record.winner && record.winner !== 'draw' ? 'Played' : 'Complete';
}
function gameHistoryCard(game, record) {
    const mode = { solo: 'Solo', coop: 'Co-op', versus: 'Player vs Player', versusAi: 'Player vs Jaylin', 'versus-ai': 'Player vs Jaylin' }[record.mode] || record.mode;
    const details = [mode, record.difficulty ? (game === 'ws' ? `${record.difficulty} x ${record.difficulty}` : record.difficulty) : '', record.aiDifficulty ? `Jaylin: ${record.aiDifficulty}` : ''].filter(Boolean).join(' · ');
    const result = record.winner && record.winner !== 'draw' ? `${historyPlayerName(record.winner)} won` : ['ws','sudoku'].includes(game) ? 'Complete' : 'Draw';
    const board = game === 'ttt' ? `<div class="history-ttt-board">${Array.from({ length: 9 }, (_, i) => record.board?.[i] || '').map(owner => `<span style="color:${owner ? historyPlayerColour(owner) : '#8B949E'}">${owner ? owner === localPlayer ? 'X' : 'O' : ''}</span>`).join('')}</div>` : '';
    // Older records lost empty player objects during Firebase serialization.
    const participants = record.mode === 'solo' ? [localPlayer] : ['versus-ai', 'versusAi'].includes(record.mode) ? [localPlayer, 'Jaylin'] : ['Peter', 'Jadey'];
    const players = { ...Object.fromEntries(participants.map(player => [player, {}])), ...(record.players || {}) };
    const rows = Object.entries(players).map(([player, values]) => `<div class="history-score-row"><span style="color:${historyPlayerColour(player)}">${escapeHtml(historyPlayerName(player))}</span><strong>${escapeHtml(historyPlayerResult(game, record, player, values || {}))}</strong></div>`).join('');
    return `<article class="history-card"><time>${historyDate(record.completedAt)}</time><p class="history-mode">${escapeHtml(details)}</p><h3>${escapeHtml(result)}</h3>${board}${record.elapsed ? `<p class="history-duration">${Math.floor(record.elapsed / 60000)}m ${Math.floor(record.elapsed / 1000) % 60}s</p>` : ''}${record.moves ? `<p>${record.moves} moves</p>` : ''}<div class="history-result-table">${rows}</div></article>`;
}
async function loadGameHistory(id, host) {
    const game = historyGameKeys[id];
    const token = {};
    host.historyToken = token;
    host.innerHTML = '<p class="history-empty">Loading history...</p>';
    try {
        const snapshot = await database.ref(`history/games/${game}/${localPlayer}`).once('value');
        if (host.historyToken !== token || sharedPauseSession?.id !== id) return;
        const records = Object.values(snapshot.val() || {}).sort((a,b) => b.completedAt - a.completedAt).slice(0,7);
        host.innerHTML = records.length ? `<div class="history-list">${records.map(record => gameHistoryCard(game, record)).join('')}</div>` : '<p class="history-empty">No completed games recorded yet.</p>';
    } catch {
        if (host.historyToken === token) host.innerHTML = '<p class="history-empty">Could not load history. Go back and retry.</p>';
    }
}
if (localPlayer) initialisePuzzleHistory(localPlayer);

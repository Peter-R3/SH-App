const ACHIEVEMENT_GAMES = {
    number: '1 to 10', ws: 'Word Search', sudoku: 'Sudoku', battleship: 'Battleship',
    connect: 'Connect 4', ttt: 'Tic-Tac-Toe', rps: 'Rock, Paper, Scissors'
};
const ACHIEVEMENT_TRACKS = [];
const achievementNumber = value => Math.max(0, Number(value) || 0);
const achievementTotal = (state, key) => achievementNumber(state.totals?.[key]);
const achievementSum = (state, predicate) => Object.entries(state.totals || {}).reduce((sum, [key, value]) => sum + (predicate(key) ? achievementNumber(value) : 0), 0);

function addAchievementTrack(game, id, title, thresholds, value, requirement, stars = false, checklist = null) {
    // Append long-term milestones without moving or renaming existing unlock IDs.
    if (!stars) {
        const last = thresholds.at(-1);
        const step = last >= 1000 ? 100 : 25;
        thresholds = [...thresholds, ...[1.3,1.7,2.2,2.8,3.5,4.5,5.5,7,8.5,10].map(factor => Math.ceil(last * factor / step) * step)];
    }
    const singular = { 'correct guesses': 'correct guess', 'co-op grids': 'co-op grid', 'co-op puzzles': 'co-op puzzle', grids: 'grid', puzzles: 'puzzle', matches: 'match', rounds: 'round', 'enemy ships': 'enemy ship' };
    const readableRequirement = (goal, index) => requirement(goal, index).replace(/\b1 (correct guesses|co-op grids|co-op puzzles|grids|puzzles|matches|rounds|enemy ships)\b/g, (_, noun) => `1 ${singular[noun]}`);
    ACHIEVEMENT_TRACKS.push({ game, id, title, thresholds, rawValue: value,
        value: (state, index = 0) => Math.max(0, value(state, index) + (Number(state.progressAdjustments?.[stars ? `${id}_${index}` : id]) || 0)),
        requirement: readableRequirement, stars, checklist });
}
const numberSteps = [1,5,10,15,25,40,60,85,115,150,200,275,375,500,750];
addAchievementTrack('number', 'number-total', 'Correct guesses', numberSteps, s => achievementSum(s, k => k.startsWith('number_')), n => `Make ${n} correct guesses across all modes.`);
for (const [mode, name, goals] of [['ten','1 to 10',[5,25,100,250,750]],['hundred','1 to 100',[1,5,20,50,150]],['colours','Colours',[3,15,60,150,450]]]) {
    addAchievementTrack('number', `number-${mode}`, `${name} specialist`, goals, s => achievementTotal(s, `number_${mode}`), n => `Make ${n} correct guesses in ${name}.`, true);
}
for (const [game, sizes, completed, coop] of [
    ['ws', ['5','6','7','8','9'], [1,3,5,10,15,25,40,60,85,115,150,200,275,375,500], [1,3,5,8,12,20,30,45,65,90,120,160,210,275,350]],
    ['sudoku', ['easy','medium','hard'], [1,2,3,5,8,12,18,25,35,50,70,95,125,165,220], [1,2,3,4,6,10,15,20,28,40,55,75,100,130,175]]
]) {
    const noun = game === 'ws' ? 'grids' : 'puzzles';
    addAchievementTrack(game, `${game}-complete`, `${noun === 'grids' ? 'Grids' : 'Puzzles'} completed`, completed,
        s => achievementSum(s, k => k.startsWith(`${game}_`) && k.endsWith('_completed')), n => `Complete ${n} ${noun} across all modes.`);
    addAchievementTrack(game, `${game}-coop`, 'Co-op completions', coop,
        s => achievementSum(s, k => k.startsWith(`${game}_coop_`) && k.endsWith('_completed')), n => `Complete ${n} co-op ${noun} together.`);
    const sizeChecklist = s => sizes.map(size => ({ label: game === 'ws' ? `${size} x ${size}` : size[0].toUpperCase() + size.slice(1),
        value: achievementSum(s, k => k.startsWith(`${game}_`) && k.split('_')[2] === size && k.endsWith('_completed')) }));
    addAchievementTrack(game, `${game}-variety`, game === 'ws' ? 'Every grid size' : 'Every difficulty', [1,5,10,25,50],
        s => Math.min(...sizeChecklist(s).map(item => item.value)), n => `Complete each ${game === 'ws' ? 'grid size' : 'puzzle difficulty'} ${n} ${n === 1 ? 'time' : 'times'}.`, true, sizeChecklist);
    // Each Jaylin star has its own requirement, rather than a cumulative difficulty score.
    const levels = ['easy','medium','hard','hard','hard'];
    addAchievementTrack(game, `${game}-jaylin`, 'Beat Jaylin', [1,1,1,10,50],
        (s, index) => achievementSum(s, k => k.startsWith(`${game}_versusAi_`) && k.endsWith(`_${levels[index]}_wins`)),
        (goal, index) => `Beat ${levels[index][0].toUpperCase() + levels[index].slice(1)} Jaylin ${goal === 1 ? 'once' : `${goal} times`} on any ${game === 'ws' ? 'grid size' : 'puzzle difficulty'}.`, true);
}
addAchievementTrack('ws', 'ws-words', 'Words found', [5,15,30,50,75,125,200,300,450,650,900,1250,1750,2500,3500],
    s => achievementSum(s, k => k.startsWith('ws_') && k.endsWith('_words')), n => `Personally find ${n} words across all modes.`);
addAchievementTrack('battleship', 'battleship-wins', 'Matches won', [1,2,3,5,8,12,18,25,35,50,70,95,125,165,220], s => achievementTotal(s, 'battleship_wins'), n => `Win ${n} completed matches.`);
addAchievementTrack('battleship', 'battleship-ships', 'Ships sunk', [1,5,10,20,35,60,90,130,180,250,350,475,625,825,1100], s => achievementTotal(s, 'battleship_ships'), n => `Sink ${n} enemy ships.`);
addAchievementTrack('battleship', 'battleship-fleet', 'Fleet remaining', [1,3,5,5,20], (s, index) => index < 3 ? achievementTotal(s, 'battleship_fleet') : achievementTotal(s, 'battleship_fullFleetWins'), (n, index) => index < 3 ? `Win with at least ${n} ${n === 1 ? 'ship' : 'ships'} still afloat.` : `Win ${n} matches with all 5 ships still afloat.`, true);
addAchievementTrack('connect', 'connect-wins', 'Matches won', [1,3,5,8,12,18,25,35,50,70,95,125,165,220,300], s => achievementTotal(s, 'connect_wins'), n => `Win ${n} completed matches.`);
addAchievementTrack('connect', 'connect-complete', 'Matches completed', [1,5,10,15,25,40,60,85,115,150,200,275,375,500,650], s => achievementTotal(s, 'connect_complete'), n => `Finish ${n} matches, including draws and losses.`);
const connectChecklist = (s, index = 0) => ['horizontal','vertical','diagonal'].map(name => ({ label: name, value: achievementTotal(s, `connect_${name}${index < 3 ? '' : '_count'}`) }));
addAchievementTrack('connect', 'connect-lines', 'Winning directions', [1,2,3,5,20], (s, index) => index < 3 ? connectChecklist(s).filter(item => item.value).length : Math.min(...connectChecklist(s, index).map(item => item.value)), (n, index) => index < 3 ? `Win using ${n} different line ${n === 1 ? 'type' : 'types'}.` : `Win ${n} times in each direction: horizontal, vertical and diagonal.`, true, connectChecklist);
const ACHIEVEMENT_TTT_LINES = [[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]];
for (const game of ['ttt','rps']) for (const mode of ['versus','versusAi']) {
    const suffix = mode === 'versus' ? 'Player' : 'Jaylin';
    const wins = game === 'ttt' ? [1,3,5,10,15,25,40,60,85,115,150,200,275,375,500] : [1,3,5,10,20,35,55,80,115,160,220,300,400,550,750];
    const completed = game === 'ttt' ? [1,5,10,20,35,55,80,115,160,220,300,400,550,750,1000] : [1,5,15,30,50,80,125,180,250,350,475,650,900,1200,1600];
    addAchievementTrack(game, `${game}-${mode}-wins`, `Wins - ${suffix}`, wins, s => achievementTotal(s, `${game}_${mode}_wins`), n => `Win ${n} ${game === 'ttt' ? 'matches' : 'rounds'} against ${suffix === 'Player' ? 'the other player' : 'Jaylin'}.`);
    addAchievementTrack(game, `${game}-${mode}-complete`, `Completions - ${suffix}`, completed, s => achievementTotal(s, `${game}_${mode}_complete`), n => `Finish ${n} ${game === 'ttt' ? 'matches' : 'rounds'} against ${suffix === 'Player' ? 'the other player' : 'Jaylin'}, including draws and losses.`);
    const labels = game === 'ttt' ? ['Top row','Middle row','Bottom row','Left column','Middle column','Right column','Descending diagonal','Ascending diagonal'] : ['Rock','Paper','Scissors'];
    const checklist = (s, tier = 0) => labels.map((label, index) => ({ label, value: achievementTotal(s, `${game}_${mode}_${game === 'ttt' ? `line${index}${tier < 3 ? '' : '_count'}` : label.toLowerCase()}`) }));
    addAchievementTrack(game, `${game}-${mode}-collection`, `${game === 'ttt' ? 'Winning lines' : 'Every choice'} - ${suffix}`, game === 'ttt' ? [1,4,8,3,10] : [1,5,10,25,75],
        (s, index) => game === 'ttt' && index < 3 ? checklist(s).filter(item => item.value).length : Math.min(...checklist(s, index).map(item => item.value)),
        (n, index) => game === 'ttt' ? (index < 3 ? `Win using ${n} distinct board ${n === 1 ? 'line' : 'lines'}` : `Win ${n} times with each of the 8 board lines`) + ` against ${suffix === 'Player' ? 'the other player' : 'Jaylin'}.` : `Win with Rock, Paper and Scissors ${n} ${n === 1 ? 'time' : 'times'} each against ${suffix === 'Player' ? 'the other player' : 'Jaylin'}.`, true, checklist);
}

function achievementBadge(track, index) {
    const tier = ['Bronze','Silver','Gold','Osmium','Pink'][track.stars ? index : Math.floor(index / 5)];
    const rank = track.stars ? 'Star' : ['I','II','III','IV','V'][index % 5];
    return { name: `${tier === 'Pink' ? 'Morganite' : tier} ${rank}`, path: `./assets/achievements/${tier}_${rank}.svg` };
}
function awardAchievementTiers(state, now) {
    state.unlocked ||= {};
    for (const track of ACHIEVEMENT_TRACKS) track.thresholds.forEach((goal, index) => {
        const key = `${track.id}_${index}`;
        if (state.tierOverrides?.[key] === 'revoked') { delete state.unlocked[key]; return; }
        if (!state.unlocked[key] && (state.tierOverrides?.[key] === 'granted' || track.value(state, index) >= goal)) state.unlocked[key] = { at: now };
    });
    return state;
}

// Only import counters whose old values distinguish genuine progress from forfeits.
function achievementStatSources(stats, player) {
    const sources = {};
    const source = (value, path) => ({ value: achievementNumber(value), epoch: achievementNumber(stats._achievementEpochs?.[path.replaceAll('/', '_')]) });
    for (const mode of ['ten','hundred','colours']) sources[`number_${mode}`] = source(stats[player]?.[mode], `${player}/${mode}`);
    sources.battleship_ships = source(stats.battleship?.[player]?.shipsSunk, `battleship/${player}/shipsSunk`);
    for (const [game, root, completed] of [['ws','wordSearch','completedGrids'],['sudoku','sudoku','completedPuzzles']]) {
        for (const mode of ['solo','coop','versus','versusAi']) {
            for (const difficulty of game === 'ws' ? ['5','6','7','8','9'] : ['easy','medium','hard']) {
                const value = stats[root]?.[player]?.[mode]?.[difficulty] || {};
                for (const level of mode === 'versusAi' ? ['easy','medium','hard'] : ['']) {
                    const entry = level ? value[level] || {} : value;
                    const prefix = `${game}_${mode}_${difficulty}${level ? `_${level}` : ''}`;
                    const path = `${root}/${player}/${mode}/${difficulty}${level ? `/${level}` : ''}`;
                    sources[`${prefix}_completed`] = source(entry[completed], `${path}/${completed}`);
                    if (game === 'ws') sources[`${prefix}_words`] = source(entry.wordsFound, `${path}/wordsFound`);
                    if (level) sources[`${prefix}_wins`] = source(entry.wins, `${path}/wins`);
                }
            }
        }
    }
    return sources;
}
function mergeAchievementStats(state, sources, now) {
    state ||= {};
    state.totals ||= {};
    state.baselines ||= {};
    for (const [key, source] of Object.entries(sources)) {
        const value = achievementNumber(typeof source === 'object' ? source.value : source);
        const epoch = achievementNumber(source?.epoch);
        const previous = state.baselines[key] || { epoch: 0, peak: 0 };
        if (epoch < previous.epoch) continue;
        const difference = epoch > previous.epoch ? value : Math.max(0, value - previous.peak);
        if (difference) state.totals[key] = achievementNumber(state.totals[key]) + difference;
        if (value || epoch || key in state.baselines) state.baselines[key] = { epoch, peak: epoch > previous.epoch ? value : Math.max(value, previous.peak) };
    }
    return awardAchievementTiers(state, now);
}

let achievementState = {};
let achievementPlayer = null;
let achievementUnsubscribe = null;
let achievementSelectedTrack = null;
let achievementSelectedGame = 'all';
let achievementError = '';
let achievementReady = false;
let achievementCompare = false;
let achievementOtherState = {};
let achievementOtherReady = false;
let achievementOtherError = '';
let achievementOtherUnsubscribe = null;
function setAchievementComparison(enabled) {
    achievementOtherUnsubscribe?.();
    achievementOtherUnsubscribe = null;
    achievementCompare = enabled;
    achievementOtherReady = false;
    achievementOtherState = {};
    achievementOtherError = '';
    if (enabled && localPlayer) {
        const player = localPlayer;
        const ref = database.ref(`achievements/${otherPlayer(player)}`);
        const listener = snapshot => {
            if (!achievementCompare || localPlayer !== player) return;
            achievementOtherState = snapshot.val() || {};
            achievementOtherReady = true;
            achievementOtherError = '';
            renderAchievements();
        };
        ref.on('value', listener, () => {
            if (!achievementCompare || localPlayer !== player) return;
            achievementOtherError = 'Could not load comparison. Switch Compare off and on to retry.';
            renderAchievements();
        });
        achievementOtherUnsubscribe = () => ref.off('value', listener);
    }
    renderAchievements();
}
let achievementAutoPause = null;
let achievementRevealKeys = [];
let achievementWordSearchState = null;
function noteAchievementPuzzleState(state) { achievementWordSearchState = state; }
const achievementQueues = new Map();
const achievementSourceSignatures = new Map();
function queueAchievementWrite(player, update) {
    let before = 0;
    const task = (achievementQueues.get(player) || Promise.resolve()).catch(() => {}).then(() =>
        database.ref(`achievements/${player}`).transaction(current => {
            before = Object.keys(current?.unlocked || {}).length;
            return update(current);
        }, undefined, false)).then(result => {
            if (result.committed && typeof recordDiagnostic === 'function') recordDiagnostic('achievement-sync', { profile: player, outcome: 'confirmed', before, after: Object.keys(result.snapshot.val()?.unlocked || {}).length });
            return result;
        }).catch(error => {
            if (typeof recordDiagnostic === 'function') recordDiagnostic('achievement-sync', { profile: player, outcome: 'failed', errorCode: error.code });
            throw error;
        });
    achievementQueues.set(player, task);
    return task;
}
function initialiseAchievements() {
    if (!localPlayer || achievementPlayer === localPlayer) return;
    achievementUnsubscribe?.();
    setAchievementComparison(false);
    document.getElementById('achievement-reveal')?.close();
    achievementAutoPause = null;
    achievementPlayer = localPlayer;
    if (typeof initialisePuzzleHistory === 'function') initialisePuzzleHistory(localPlayer);
    achievementState = {};
    achievementReady = false;
    const ref = database.ref(`achievements/${localPlayer}`);
    const player = localPlayer;
    const listener = snapshot => {
        if (localPlayer !== player) return;
        achievementState = snapshot.val() || {};
        achievementReady = true;
        achievementError = '';
        renderAchievements();
        maybeRevealAchievements();
    };
    ref.on('value', listener, () => {
        achievementError = 'Achievements could not sync. Check your connection and database permissions.';
        renderAchievements();
    });
    achievementUnsubscribe = () => ref.off('value', listener);
    retryAchievementEvents();
    acknowledgeLocalAchievements(localPlayer);
    recoverAchievementMatches();
}
function syncAchievementStats(stats) {
    initialiseAchievements();
    if (!localPlayer) return;
    const player = localPlayer;
    const now = Date.now();
    const sources = achievementStatSources(stats, player);
    const signature = JSON.stringify(sources);
    if (achievementSourceSignatures.get(player) === signature) return;
    achievementSourceSignatures.set(player, signature);
    queueAchievementWrite(player, state => mergeAchievementStats(state, sources, now)).catch(() => {
        if (achievementSourceSignatures.get(player) === signature) achievementSourceSignatures.delete(player);
        achievementError = 'Progress could not sync. Reopen Achievements to retry.';
        renderAchievements();
    });
}

function mergeAchievementEvent(state, event) {
    state ||= {};
    state.events ||= {};
    state.totals ||= {};
    if (state.events[event.id] || event.at < (state.eventFloor || 0)) return state;
    for (const [key, value] of Object.entries(event.add || {})) state.totals[key] = achievementNumber(state.totals[key]) + value;
    for (const [key, value] of Object.entries(event.max || {})) state.totals[key] = Math.max(achievementNumber(state.totals[key]), value);
    state.events[event.id] = event.at;
    const keys = Object.keys(state.events).sort((a,b) => state.events[a] - state.events[b]);
    for (const key of keys.slice(0, Math.max(0, keys.length - 256))) {
        state.eventFloor = Math.max(state.eventFloor || 0, state.events[key]);
        delete state.events[key];
    }
    return awardAchievementTiers(state, event.at);
}
function achievementOutbox() {
    try {
        const value = JSON.parse(localStorage.getItem('achievement-outbox') || '[]');
        return Array.isArray(value) ? value.filter(item => item?.key && item?.event?.id && ['Peter','Jadey'].includes(item.player)) : [];
    } catch { return []; }
}
function saveAchievementOutbox(events) {
    try { localStorage.setItem('achievement-outbox', JSON.stringify(events)); } catch { /* Current-session writes still run. */ }
}
const achievementEventsInFlight = new Set();
function sendAchievementEvent(player, event) {
    if (!['Peter','Jadey'].includes(player)) return Promise.resolve();
    const key = `${player}:${event.id}`;
    if (achievementEventsInFlight.has(key)) return Promise.resolve();
    achievementEventsInFlight.add(key);
    const pending = achievementOutbox();
    if (!pending.some(item => item.key === key)) saveAchievementOutbox([...pending, { key, player, event }]);
    return queueAchievementWrite(player, state => mergeAchievementEvent(state, event)).then(() => {
        saveAchievementOutbox(achievementOutbox().filter(item => item.key !== key));
    }).catch(() => {
        achievementError = 'Some achievement progress is waiting to sync.';
        renderAchievements();
    }).finally(() => achievementEventsInFlight.delete(key));
}
function retryAchievementEvents() {
    if (!localPlayer) return;
    for (const item of achievementOutbox()) sendAchievementEvent(item.player, item.event);
}

function recoverAchievementMatches() {
    const player = localPlayer;
    if (!player) return;
    // Recover a committed result if the app closed before its award callback ran.
    const paths = [['battleship','games/battleship/current','versus'], ['connect','games/connectFour/current','versus'],
        ['ttt','games/ticTacToe/current','versus'], ['rps','games/rps/current','versus'],
        ['ttt',`games/ticTacToe/ai/${player}`,'versusAi'], ['rps',`games/rps/ai/${player}`,'versusAi']];
    for (const [game, path, mode] of paths) {
        const ref = database.ref(path);
        if (!ref.get) continue;
        ref.get().then(snapshot => {
            if (localPlayer === player) recordAchievementMatch(game, snapshot.val(), mode, player);
        }).catch(() => {});
    }
}

function recordAchievementMatch(game, state, mode = 'versus', player = localPlayer) {
    if (!state || state.status !== 'finished' || state.abandonedBy) return;
    if (typeof recordGameHistory === 'function') recordGameHistory(game, state, mode, player);
    const eventId = `${game}_${mode}_${state.roundId || state.createdAt || state.startedAt}`;
    if (eventId.endsWith('_undefined')) return;
    const players = mode === 'versusAi' ? [player] : ['Peter','Jadey'];
    for (const owner of players) {
        const add = {};
        const max = {};
        const prefix = ['ttt','rps'].includes(game) ? `${game}_${mode}` : game;
        if (game !== 'battleship') add[`${prefix}_complete`] = 1;
        if (state.winner === owner) {
            add[`${prefix}_wins`] = 1;
            if (game === 'ttt') ACHIEVEMENT_TTT_LINES.forEach((line, index) => {
                if (line.every(cell => state.board?.[cell] === owner)) { max[`${prefix}_line${index}`] = 1; add[`${prefix}_line${index}_count`] = 1; }
            });
            if (game === 'rps' && ['rock','paper','scissors'].includes(state.choices?.[owner])) add[`${prefix}_${state.choices[owner]}`] = 1;
            if (game === 'connect') {
                const cells = state.winningCells || [];
                if (cells.length) {
                    const direction = cells.every(cell => Math.floor(cell / 7) === Math.floor(cells[0] / 7)) ? 'horizontal' : cells.every(cell => cell % 7 === cells[0] % 7) ? 'vertical' : 'diagonal';
                    max[`connect_${direction}`] = 1;
                    add[`connect_${direction}_count`] = 1;
                }
            }
            if (game === 'battleship') {
                const board = state.boards?.[owner];
                max.battleship_fleet = (board?.ships || []).filter(ship => !ship.cells.every(cell => board.shotsReceived?.[cell]?.hit)).length;
                if (max.battleship_fleet === 5) add.battleship_fullFleetWins = 1;
            }
        }
        if (Object.keys(add).length || Object.keys(max).length) sendAchievementEvent(owner, { id: eventId, at: state.completedAt || Date.now(), add, max });
    }
}

function initialiseAchievementScreen() {
    const screen = document.createElement('section');
    screen.id = 'achievements-screen';
    screen.className = 'screen hidden app-tab-screen';
    const header = document.querySelector('#home-header-shell').cloneNode(true);
    const nav = document.querySelector('#home-nav-shell').cloneNode(true);
    for (const element of [header, ...header.querySelectorAll('[id]'), nav, ...nav.querySelectorAll('[id]')]) if (element.id) element.id = element.id.replace('home-', 'achievements-');
    header.querySelector('.header-title').textContent = 'Achievements';
    const content = document.createElement('div');
    content.className = 'achievements-content';
    content.innerHTML = '<div class="stats-content-heading"><h2 id="achievement-heading">Your achievements</h2><button class="mode-select-btn stats-content-back-btn" id="achievement-back" aria-label="Back to Home" title="Back to Home"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.42-1.41L7.83 13H20v-2z"/></svg></button></div><div id="achievement-filters" class="achievement-filters"></div><p id="achievement-status" role="status"></p><div id="achievement-list"></div>';
    screen.append(header, content, nav);
    const review = document.createElement('button');
    review.id = 'achievement-review';
    review.textContent = 'View unlocked';
    review.onclick = () => { maybeRevealAchievements(true); playUiSound('tap'); };
    const toolbar = document.createElement('div');
    toolbar.className = 'achievement-toolbar';
    const compare = document.createElement('label');
    compare.className = 'achievement-compare-toggle';
    compare.innerHTML = '<input id="achievement-compare" class="app-checkbox" type="checkbox">Compare';
    compare.querySelector('input').onchange = event => { setAchievementComparison(event.target.checked); playUiSound('tap'); };
    toolbar.append(review, compare);
    content.querySelector('#achievement-status').after(toolbar);
    document.getElementById('home-screen').after(screen);
    document.getElementById('achievement-back').onclick = () => {
        if (achievementSelectedTrack) { achievementSelectedTrack = null; renderAchievements(); }
        else if (typeof gameAchievementContext !== 'undefined' && gameAchievementContext) gameAchievementContext.back();
        else switchTab('home');
        playUiSound('tap');
    };
    const dialog = document.createElement('dialog');
    dialog.id = 'achievement-reveal';
    dialog.className = 'achievement-reveal';
    dialog.setAttribute('aria-labelledby', 'achievement-reveal-title');
    dialog.innerHTML = '<div class="achievement-reveal-inner"><p class="achievement-eyebrow">Well played</p><h2 id="achievement-reveal-title">Achievement unlocked</h2><div id="achievement-rewards"></div><p id="achievement-reveal-status" role="status"></p><button id="achievement-continue">Continue</button></div>';
    dialog.addEventListener('cancel', event => { event.preventDefault(); dismissAchievementReveal(); });
    dialog.querySelector('button').onclick = dismissAchievementReveal;
    document.body.append(dialog);
}
function openAchievements() {
    achievementSelectedTrack = null;
    achievementSelectedGame = 'all';
    switchTab('achievements');
    syncAchievementStats(latestStats || {});
    retryAchievementEvents();
    renderAchievements();
}
function achievementProgress(track, index, state) {
    const goal = track.thresholds[index];
    const value = Math.min(goal, achievementNumber(track.value(state, index)));
    return `<div class="achievement-progress-label"><span class="achievement-remaining">${(goal - value).toLocaleString()} left</span><span>${value.toLocaleString()} / ${goal.toLocaleString()}</span></div><progress max="${goal}" value="${value}" aria-label="${escapeHtml(track.title)} progress"></progress>`;
}
function achievementTrackSummary(track, state) {
    const earned = track.thresholds.map((_, index) => index).filter(index => state.unlocked?.[`${track.id}_${index}`]);
    const next = track.thresholds.findIndex((_, index) => !state.unlocked?.[`${track.id}_${index}`]);
    const index = next < 0 ? track.thresholds.length - 1 : next;
    const badge = achievementBadge(track, index);
    const labels = `<span class="achievement-earned">Earned: <strong>${earned.length ? achievementBadge(track, earned.at(-1)).name : 'None yet'}</strong></span><span class="achievement-next">${next < 0 ? 'Track complete' : `Next: <strong>${badge.name}</strong>`}</span>`;
    return { badge, next, index, labels };
}
function achievementComparisonRow(track, player, state, ready, index = null) {
    const name = escapeHtml(playerProfiles[player]?.nickname || player);
    if (!ready) return `<div class="achievement-comparison-player"><strong>${name}</strong><p>${player === localPlayer ? 'Loading progress...' : achievementOtherError || 'Loading progress...'}</p></div>`;
    const summary = achievementTrackSummary(track, state);
    const tier = index ?? summary.index;
    const badge = achievementBadge(track, tier);
    const unlocked = state.unlocked?.[`${track.id}_${tier}`];
    return `<div class="achievement-comparison-player" style="--theme-color:${themeColorFor(player)}"><strong class="achievement-comparison-name">${name}</strong><div class="achievement-comparison-details"><img src="${badge.path}" class="${unlocked ? '' : 'locked'}" alt="${badge.name}"><div>${index === null ? summary.labels : `<span class="achievement-earned">${unlocked ? 'Unlocked' : 'Locked'}</span>`}<p>${escapeHtml(track.requirement(track.thresholds[tier], tier))}</p>${achievementProgress(track, tier, state)}</div></div></div>`;
}
function renderAchievements() {
    const list = document.getElementById('achievement-list');
    if (!list) return;
    const track = ACHIEVEMENT_TRACKS.find(item => item.id === achievementSelectedTrack);
    document.getElementById('achievement-compare').checked = achievementCompare;
    document.getElementById('achievement-heading').textContent = track ? track.title : 'Your achievements';
    const back = document.getElementById('achievement-back');
    const scoped = typeof gameAchievementContext !== 'undefined' && gameAchievementContext;
    back.title = track ? 'Back to achievements' : scoped ? 'Back to pause menu' : 'Back to Home';
    back.setAttribute('aria-label', back.title);
    const status = document.getElementById('achievement-status');
    status.textContent = achievementError || (!achievementReady ? 'Loading achievements...' : '');
    const review = document.getElementById('achievement-review');
    review.hidden = Boolean(track);
    review.disabled = !Object.keys(achievementState.unlocked || {}).length;
    const filters = document.getElementById('achievement-filters');
    filters.hidden = Boolean(track || scoped);
    filters.replaceChildren();
    for (const [key, name] of [['all','All games'], ...Object.entries(ACHIEVEMENT_GAMES)]) {
        const button = document.createElement('button');
        button.textContent = name;
        button.setAttribute('aria-pressed', String(achievementSelectedGame === key));
        button.onclick = () => { achievementSelectedGame = key; renderAchievements(); playUiSound('tap'); };
        filters.append(button);
    }
    if (track) {
        list.innerHTML = `<p class="achievement-game-label">${ACHIEVEMENT_GAMES[track.game]}</p>` + track.thresholds.map((goal, index) => {
            if (achievementCompare) return `<article class="achievement-tier achievement-comparison"><h3>${achievementBadge(track, index).name}</h3>${achievementComparisonRow(track, localPlayer, achievementState, achievementReady, index)}${achievementComparisonRow(track, otherPlayer(localPlayer), achievementOtherState, achievementOtherReady, index)}</article>`;
            const unlocked = achievementState.unlocked?.[`${track.id}_${index}`];
            const badge = achievementBadge(track, index);
            const adjusted = Object.hasOwn(achievementState.progressAdjustments || {}, track.stars ? `${track.id}_${index}` : track.id);
            const checklist = adjusted ? null : track.checklist?.(achievementState, index);
            const target = index < 3 && (track.id.endsWith('lines') || track.id.startsWith('ttt-')) ? 1 : goal;
            return `<article class="achievement-tier"><img src="${badge.path}" alt="${badge.name}" class="${unlocked ? '' : 'locked'}"><div><h3>${badge.name}</h3><p>${escapeHtml(track.requirement(goal, index))}</p><strong class="achievement-earned">${unlocked ? 'Unlocked' : 'Locked'}</strong>${achievementProgress(track, index, achievementState)}${checklist ? `<ul class="achievement-checklist">${checklist.map(item => `<li class="${item.value >= target ? 'done' : ''}">${escapeHtml(item.label)} <span>${Math.min(item.value, target)} / ${target}</span></li>`).join('')}</ul>` : ''}</div></article>`;
        }).join('');
    } else {
        list.innerHTML = ACHIEVEMENT_TRACKS.filter(item => achievementSelectedGame === 'all' || item.game === achievementSelectedGame).map(item => {
            if (achievementCompare) return `<button class="achievement-track achievement-comparison" data-track="${item.id}"><div><span class="achievement-game-label">${ACHIEVEMENT_GAMES[item.game]}</span><h3>${escapeHtml(item.title)}</h3></div>${achievementComparisonRow(item, localPlayer, achievementState, achievementReady)}${achievementComparisonRow(item, otherPlayer(localPlayer), achievementOtherState, achievementOtherReady)}</button>`;
            const { badge, next, index, labels } = achievementTrackSummary(item, achievementState);
            return `<button class="achievement-track" data-track="${item.id}"><img src="${badge.path}" class="${next < 0 ? '' : 'locked'}" alt="${badge.name}"><div><span class="achievement-game-label">${ACHIEVEMENT_GAMES[item.game]}</span><h3>${escapeHtml(item.title)}</h3><p>${next < 0 ? 'Track complete' : escapeHtml(item.requirement(item.thresholds[index], index))}</p>${labels}${achievementProgress(item, index, achievementState)}</div></button>`;
        }).join('');
        list.querySelectorAll('[data-track]').forEach(button => { button.onclick = () => {
            achievementSelectedTrack = button.dataset.track; renderAchievements();
            document.querySelector('.achievements-content').scrollTop = 0; playUiSound('tap');
        }; });
    }
}

function achievementRevealPolicy(view) {
    if (view.startsWith('word-search')) {
        if (wordSearchSettings.mode === 'solo') return view === 'word-search' ? 'pause-word-search' : 'safe';
        const current = achievementWordSearchState;
        return wordSearchCompletedLocally || (current?.startedAt === wordSearchStartedAt && (current?.completedAt || current?.status === 'finished')) ? 'safe' : 'wait';
    }
    if (view.startsWith('sudoku')) {
        if (sudokuSettings.mode === 'solo') return view === 'sudoku' ? 'pause-sudoku' : 'safe';
        return sudokuState?.completedAt || sudokuState?.status === 'finished' ? 'safe' : 'wait';
    }
    if (view.startsWith('number-guess')) return 'wait';
    for (const [id, state] of [['battleship', battleshipState],['connect-four', connectFourState],['tic-tac-toe', ticTacToeState],['rps', rpsState]]) {
        if (view.startsWith(id)) return state?.status === 'finished' ? 'safe' : 'wait';
    }
    return 'safe';
}
function maybeRevealAchievements(review = false) {
    const dialog = document.getElementById('achievement-reveal');
    if (!dialog || dialog.open || !localPlayer || !achievementReady || document.hidden || !auth.currentUser || document.querySelector('dialog[open]') || document.activeElement?.matches('input, textarea') || realmTransitioning) return;
    const seen = localSeenAchievements(localPlayer);
    const pending = Object.keys(achievementState.unlocked || {}).filter(key => review || (!achievementState.unlocked[key].seenAt && !seen.includes(key)));
    if (!pending.length) return;
    const policy = achievementRevealPolicy(activeAppView);
    if (policy === 'wait') return;
    achievementAutoPause = null;
    if (policy.startsWith('pause-') && !sharedPauseSession) {
        achievementAutoPause = policy.slice(6);
        openSharedGameMenu(achievementAutoPause);
    }
    achievementRevealKeys = pending;
    const rewards = document.getElementById('achievement-rewards');
    rewards.innerHTML = Object.entries(ACHIEVEMENT_GAMES).map(([game, name]) => {
        const cards = ACHIEVEMENT_TRACKS.filter(track => track.game === game).flatMap(track => track.thresholds.map((goal, index) => {
        if (!pending.includes(`${track.id}_${index}`)) return '';
        const badge = achievementBadge(track, index);
        return `<article class="achievement-reward"><img src="${badge.path}" alt="${badge.name}"><div><h3>${escapeHtml(track.title)}</h3><strong>${badge.name}</strong><p>${escapeHtml(track.requirement(goal, index))}</p></div></article>`;
        })).filter(Boolean);
        return cards.length ? `<section class="achievement-reward-group" aria-label="${escapeHtml(name)}"><h3>${escapeHtml(name)} <span>(${cards.length})</span></h3><div class="achievement-reward-grid">${cards.join('')}</div></section>` : '';
    }).join('');
    document.getElementById('achievement-reveal-title').textContent = review ? `Your unlocked achievements (${pending.length})` : pending.length === 1 ? 'Achievement unlocked' : `${pending.length} achievements unlocked`;
    dialog.dataset.player = localPlayer;
    dialog.showModal();
    playUiSound('complete');
}
function localSeenAchievements(player) {
    try {
        const value = JSON.parse(localStorage.getItem(`achievement-seen:${player}`) || '[]');
        return Array.isArray(value) ? value : [];
    } catch { return []; }
}
function acknowledgeLocalAchievements(player) {
    const keys = localSeenAchievements(player);
    if (!keys.length) return Promise.resolve();
    return queueAchievementWrite(player, state => {
        if (!state) return state;
        for (const key of keys) if (state.unlocked?.[key] && !state.unlocked[key].seenAt) state.unlocked[key].seenAt = Date.now();
        return state;
    }).catch(() => {});
}
function dismissAchievementReveal() {
    const dialog = document.getElementById('achievement-reveal');
    if (!dialog?.open || dialog.busy) return;
    const player = dialog.dataset.player;
    const keys = [...achievementRevealKeys];
    try { localStorage.setItem(`achievement-seen:${player}`, JSON.stringify([...new Set([...localSeenAchievements(player), ...keys])])); } catch { /* Keep this session usable even without storage. */ }
    for (const key of keys) if (achievementState.unlocked?.[key]) achievementState.unlocked[key].seenAt = Date.now();
    dialog.close();
    if (achievementAutoPause && localPlayer === player && sharedPauseSession?.id === achievementAutoPause) resumeSharedGame();
    achievementAutoPause = null;
    acknowledgeLocalAchievements(player);
}
initialiseAchievementScreen();
window.addEventListener('online', retryAchievementEvents);
window.addEventListener('online', () => { if (localPlayer) { acknowledgeLocalAchievements(localPlayer); syncAchievementStats(latestStats || {}); recoverAchievementMatches(); } });
document.addEventListener('visibilitychange', () => { if (!document.hidden) retryAchievementEvents(); });
setInterval(() => {
    if (!localPlayer) { document.getElementById('achievement-reveal')?.close(); return; }
    maybeRevealAchievements();
}, 800);
if (realtimeFeedsStarted) syncAchievementStats(latestStats || {});

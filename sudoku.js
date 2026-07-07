const SUDOKU_SIZE = 9;
const SUDOKU_CELLS = 81;
const SUDOKU_DIFFICULTIES = {
    easy: { label: 'Easy', givens: 42 },
    medium: { label: 'Medium', givens: 34 },
    hard: { label: 'Hard', givens: 28 }
};
const SUDOKU_AI_NAME = 'Jaylin';
const SUDOKU_AI_LEVELS = {
    easy: { label: 'Easy', baseMs: 420000 },
    medium: { label: 'Medium', baseMs: 260000 },
    hard: { label: 'Hard', baseMs: 150000 }
};

let sudokuSettings = { mode: 'solo', difficulty: 'easy', aiDifficulty: 'medium' };
let sudokuState = null;
let sudokuRef = null;
let sudokuHandler = null;
let sudokuSelectedCell = null;
let sudokuVersusCountdown = null;
let sudokuAiTimer = null;

function sudokuSettingsKey() {
    return `sudoku-settings-${localPlayer || 'unknown'}`;
}

function loadSudokuSettings() {
    try {
        const saved = JSON.parse(localStorage.getItem(sudokuSettingsKey()) || '{}');
        sudokuSettings = {
            mode: ['solo', 'coop', 'versus', 'versus-ai'].includes(saved.mode) ? saved.mode : 'solo',
            difficulty: SUDOKU_DIFFICULTIES[saved.difficulty] ? saved.difficulty : 'easy',
            aiDifficulty: SUDOKU_AI_LEVELS[saved.aiDifficulty] ? saved.aiDifficulty : 'medium'
        };
    } catch {
        sudokuSettings = { mode: 'solo', difficulty: 'easy', aiDifficulty: 'medium' };
    }
}

function saveSudokuSettings() {
    localStorage.setItem(sudokuSettingsKey(), JSON.stringify(sudokuSettings));
}

function launchSudoku() {
    if (!localPlayer) return;
    setActiveAppView('sudoku');
    loadSudokuSettings();
    stopSudokuSubscription();
    sudokuSelectedCell = null;
    document.querySelectorAll('.screen').forEach(screen => screen.classList.add('hidden'));
    document.getElementById('sudoku-screen')?.classList.remove('hidden');
    applyThemeToScreen('sudoku-screen', 'sudoku-header-shell', 'sudoku-nav-shell');
    refreshSharedHeader('sudoku');
    setSudokuStatus('Loading puzzle...');

    if (sudokuSettings.mode === 'solo') loadSoloSudoku();
    if (sudokuSettings.mode === 'coop') loadCoopSudoku();
    if (sudokuSettings.mode === 'versus') loadVersusSudoku(false);
    if (sudokuSettings.mode === 'versus-ai') loadAiSudoku();
}

function openSudokuSettings() {
    setActiveAppView('sudoku');
    document.querySelectorAll('.screen').forEach(screen => screen.classList.add('hidden'));
    document.getElementById('sudoku-settings-screen')?.classList.remove('hidden');
    const header = document.getElementById('sudoku-settings-header');
    if (header) {
        header.classList.remove('header-peter', 'header-jadey');
        header.classList.add(localPlayer === 'Peter' ? 'header-peter' : 'header-jadey');
    }
    document.getElementById('sudoku-mode').value = sudokuSettings.mode;
    document.getElementById('sudoku-difficulty').value = sudokuSettings.difficulty;
    document.getElementById('sudoku-ai-difficulty').value = sudokuSettings.aiDifficulty;
    syncSudokuModeControls();
    updateSudokuSettingsNote();
}

function updateSudokuSetting(key, value) {
    if (key === 'mode') {
        if (sudokuSettings.mode === 'versus' && value !== 'versus') abandonSudokuVersus(true);
        sudokuSettings.mode = value;
    }
    if (key === 'difficulty' && SUDOKU_DIFFICULTIES[value]) sudokuSettings.difficulty = value;
    if (key === 'aiDifficulty' && SUDOKU_AI_LEVELS[value]) sudokuSettings.aiDifficulty = value;
    saveSudokuSettings();
    syncSudokuModeControls();
    updateSudokuSettingsNote();
}

function syncSudokuModeControls() {
    const showAi = sudokuSettings.mode === 'versus-ai';
    document.querySelector('label[for="sudoku-ai-difficulty"]')?.classList.toggle('hidden', !showAi);
    document.getElementById('sudoku-ai-difficulty')?.classList.toggle('hidden', !showAi);
}

function updateSudokuSettingsNote(message) {
    const note = document.getElementById('sudoku-settings-note');
    if (!note) return;
    note.innerText = message || (
        sudokuSettings.mode === 'solo' ? 'Solo progress is saved separately for each profile and difficulty.' :
        sudokuSettings.mode === 'coop' ? 'Co-op uses one shared puzzle and board.' :
        sudokuSettings.mode === 'versus-ai' ? 'Race an AI opponent on your own puzzle.' :
        'Versus gives both players the same puzzle and separate boards.'
    );
}

function requestNewSudokuPuzzle() {
    if (!window.confirm('Replace the current Sudoku puzzle?')) return;
    const state = createSudokuState(createSudokuPuzzle(sudokuSettings.difficulty));
    if (sudokuSettings.mode === 'solo') {
        database.ref(soloSudokuPath()).set(state).then(launchSudoku);
    } else if (sudokuSettings.mode === 'coop') {
        database.ref(coopSudokuPath()).set(state).then(launchSudoku);
    } else if (sudokuSettings.mode === 'versus-ai') {
        database.ref(aiSudokuPath()).set(createAiSudokuState(createSudokuPuzzle(sudokuSettings.difficulty))).then(launchSudoku);
    } else {
        abandonSudokuVersus(false).then(() => loadVersusSudoku(true)).then(launchSudoku);
    }
}

function soloSudokuPath() {
    return `sudoku/solo/${localPlayer}/${sudokuSettings.difficulty}`;
}

function coopSudokuPath() {
    return 'sudoku/coop/current';
}

function aiSudokuPath() {
    return `sudoku/ai/${localPlayer}/${sudokuSettings.difficulty}/${sudokuSettings.aiDifficulty}`;
}

function createSudokuState(puzzle) {
    return {
        puzzle,
        entries: {},
        startedAt: Date.now(),
        completedAt: null
    };
}

function createAiSudokuState(puzzle) {
    const startedAt = Date.now();
    const aiDuration = sudokuAiDuration(puzzle.difficulty, sudokuSettings.aiDifficulty);
    return {
        ...createSudokuState(puzzle),
        startedAt,
        aiDifficulty: sudokuSettings.aiDifficulty,
        aiDuration,
        aiCompletedAt: startedAt + aiDuration,
        aiResolved: false
    };
}

function loadSoloSudoku() {
    const ref = database.ref(soloSudokuPath());
    ref.once('value').then(snapshot => {
        const state = snapshot.val();
        if (state?.puzzle && !state.completedAt) {
            applySudokuState(state);
        } else {
            const fresh = createSudokuState(createSudokuPuzzle(sudokuSettings.difficulty));
            ref.set(fresh);
            applySudokuState(fresh);
        }
    });
}

function loadCoopSudoku() {
    const ref = database.ref(coopSudokuPath());
    ref.transaction(current => current?.puzzle && !current.completedAt
        ? current
        : createSudokuState(createSudokuPuzzle(sudokuSettings.difficulty))
    );
    subscribeSudoku(coopSudokuPath(), state => {
        applySudokuState(state);
        if (state?.completedAt) showSudokuResult('Puzzle complete!', true);
    });
}

function loadAiSudoku() {
    const ref = database.ref(aiSudokuPath());
    ref.once('value').then(snapshot => {
        const state = snapshot.val();
        if (state?.puzzle && !state.completedAt && !state.aiResolved) {
            applySudokuState(state);
            scheduleSudokuAi(state);
        } else {
            const fresh = createAiSudokuState(createSudokuPuzzle(sudokuSettings.difficulty));
            ref.set(fresh);
            applySudokuState(fresh);
            scheduleSudokuAi(fresh);
        }
    });
}

function loadVersusSudoku(forceNew) {
    const ref = database.ref('sudoku/versus/current');
    return ref.transaction(current => {
        if (forceNew || !current || current.status === 'finished') {
            return {
                id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
                difficulty: sudokuSettings.difficulty,
                puzzle: createSudokuPuzzle(sudokuSettings.difficulty),
                status: 'waiting',
                players: { [localPlayer]: true },
                present: { [localPlayer]: Date.now() },
                readyBy: {},
                entriesBy: { Peter: {}, Jadey: {} },
                inviteSent: false,
                createdAt: Date.now()
            };
        }
        current.players = current.players || {};
        current.players[localPlayer] = true;
        current.present = current.present || {};
        current.present[localPlayer] = Date.now();
        current.entriesBy = current.entriesBy || { Peter: {}, Jadey: {} };
        return current;
    }).then(result => {
        const state = result.snapshot?.val?.();
        if (state?.difficulty) {
            sudokuSettings.difficulty = state.difficulty;
            saveSudokuSettings();
        }
        if (
            state?.status === 'waiting' &&
            state.players?.[localPlayer] &&
            !state.players?.[otherPlayer(localPlayer)] &&
            !state.inviteSent
        ) {
            database.ref('sudoku/versus/current/inviteSent').transaction(current => current ? undefined : true, (error, committed) => {
                if (!error && committed) {
                    database.ref('notifications').push({
                        type: 'Sudoku Versus',
                        action: 'join-sudoku-versus',
                        difficulty: state.difficulty,
                        sender: localPlayer,
                        recipient: otherPlayer(localPlayer),
                        body: `${playerProfiles[localPlayer]?.nickname || localPlayer} is waiting for a ${SUDOKU_DIFFICULTIES[state.difficulty]?.label || 'Sudoku'} match`,
                        createdAt: Date.now(),
                        readBy: {}
                    });
                }
            });
        }
        subscribeSudoku('sudoku/versus/current', renderSudokuVersusState);
    });
}

function joinSudokuVersus(difficulty) {
    sudokuSettings = { mode: 'versus', difficulty: SUDOKU_DIFFICULTIES[difficulty] ? difficulty : 'easy' };
    saveSudokuSettings();
    launchSudoku();
}

function subscribeSudoku(path, handler) {
    stopSudokuSubscription();
    sudokuRef = database.ref(path);
    sudokuHandler = snapshot => handler(snapshot.val());
    sudokuRef.on('value', sudokuHandler);
}

function stopSudokuSubscription() {
    if (sudokuRef && sudokuHandler && sudokuRef.off) sudokuRef.off('value', sudokuHandler);
    sudokuRef = null;
    sudokuHandler = null;
    window.clearInterval(sudokuVersusCountdown);
    window.clearInterval(sudokuAiTimer);
    sudokuAiTimer = null;
}

function applySudokuState(state) {
    sudokuState = state;
    renderSudokuBoard(false);
    const label = SUDOKU_DIFFICULTIES[state?.puzzle?.difficulty]?.label || 'Easy';
    setSudokuStatus(`${modeLabel(sudokuSettings.mode)} - ${label}`);
    showSudokuResult('', false);
    if (sudokuSettings.mode === 'versus-ai') scheduleSudokuAi(state);
}

function renderSudokuVersusState(state) {
    sudokuState = state;
    if (!state?.puzzle) {
        setSudokuStatus('Creating match...');
        return;
    }
    renderSudokuBoard(state.status !== 'active' && state.status !== 'finished');
    if (state.status === 'waiting') {
        const ready = state.readyBy?.[localPlayer];
        const bothPresent = playerRecentlyPresent(state.present?.Peter) && playerRecentlyPresent(state.present?.Jadey);
        setSudokuStatus('Versus - Ready room');
        showSudokuResult(
            bothPresent
                ? `<strong>${ready ? 'Ready. Waiting for the other player...' : 'Both players are here.'}</strong><button onclick="readyForSudokuVersus()">Ready</button>`
                : '<strong>Waiting for the other player to join...</strong>',
            true
        );
        return;
    }
    if (state.status === 'countdown') {
        showSudokuResult('', false);
        startSudokuCountdown(state.startsAt);
        return;
    }
    if (state.status === 'active') {
        const label = SUDOKU_DIFFICULTIES[state.difficulty]?.label || 'Easy';
        setSudokuStatus(`Versus - ${label}`);
        showSudokuResult('', false);
        return;
    }
    if (state.status === 'finished') {
        const winner = state.winner;
        setSudokuStatus(winner === localPlayer ? 'You solved it first!' : `${playerProfiles[winner]?.nickname || winner} solved it first.`);
        showSudokuResult(`<strong>${winner === localPlayer ? 'You won!' : `${playerProfiles[winner]?.nickname || winner} won`}</strong>`, true);
    }
}

function modeLabel(mode) {
    if (mode === 'coop') return 'Co-op';
    if (mode === 'versus-ai' || mode === 'versusAi') return `Versus ${SUDOKU_AI_NAME}`;
    return mode === 'versus' ? 'Versus' : 'Solo';
}

function setSudokuStatus(message) {
    const status = document.getElementById('sudoku-status');
    if (status) status.innerText = message;
}

function showSudokuResult(html, visible) {
    const result = document.getElementById('sudoku-result');
    if (!result) return;
    result.innerHTML = html;
    result.classList.toggle('hidden', !visible);
    document.getElementById('sudoku-screen')?.classList.toggle('sudoku-complete', visible && Boolean(html));
}

function sudokuEntriesForLocalPlayer() {
    if (sudokuSettings.mode === 'versus') return sudokuState?.entriesBy?.[localPlayer] || {};
    return sudokuState?.entries || {};
}

function renderSudokuBoard(concealed) {
    const board = document.getElementById('sudoku-board');
    const pad = document.getElementById('sudoku-pad');
    if (!board || !pad || !sudokuState?.puzzle) return;
    const givens = sudokuState.puzzle.givens || [];
    const entries = sudokuEntriesForLocalPlayer();
    board.classList.toggle('concealed', Boolean(concealed));
    board.innerHTML = Array.from({ length: SUDOKU_CELLS }, (_, index) => {
        const given = givens[index];
        const value = given || entries[index] || '';
        const selected = sudokuSelectedCell === index;
        const locked = Boolean(given) || concealed || sudokuState.completedAt || sudokuState.status === 'finished';
        const classes = ['sudoku-cell'];
        if (given) classes.push('given');
        if (selected) classes.push('selected');
        if (index % 3 === 2) classes.push('block-right');
        if (Math.floor(index / 9) % 3 === 2) classes.push('block-bottom');
        return `<button class="${classes.join(' ')}" ${locked ? 'disabled' : `onclick="selectSudokuCell(${index})"`}>${concealed ? '' : value}</button>`;
    }).join('');
    pad.innerHTML = Array.from({ length: 9 }, (_, index) =>
        `<button onclick="setSudokuCell(${index + 1})">${index + 1}</button>`
    ).join('') +
        '<button class="sudoku-erase" onclick="setSudokuCell(null)">Erase</button>' +
        '<button class="sudoku-clear" onclick="clearSudokuGrid()">Clear all</button>';
}

function selectSudokuCell(index) {
    const givens = sudokuState?.puzzle?.givens || [];
    if (sudokuState?.completedAt || sudokuState?.aiResolved || sudokuState?.status === 'finished') return;
    if (givens[index]) return;
    sudokuSelectedCell = index;
    renderSudokuBoard(false);
}

function setSudokuCell(value) {
    if (sudokuSelectedCell === null || !sudokuState?.puzzle) return;
    if (sudokuState.completedAt || sudokuState.aiResolved || sudokuState.status === 'finished') return;
    const index = sudokuSelectedCell;
    const path = sudokuSettings.mode === 'versus'
        ? `sudoku/versus/current/entriesBy/${localPlayer}/${index}`
        : sudokuSettings.mode === 'versus-ai'
            ? `${aiSudokuPath()}/entries/${index}`
        : sudokuSettings.mode === 'coop'
            ? `sudoku/coop/current/entries/${index}`
            : `${soloSudokuPath()}/entries/${index}`;
    database.ref(path).set(value || null).then(() => {
        if (sudokuSettings.mode === 'versus') {
            sudokuState.entriesBy = sudokuState.entriesBy || {};
            sudokuState.entriesBy[localPlayer] = sudokuState.entriesBy[localPlayer] || {};
            if (value) sudokuState.entriesBy[localPlayer][index] = value;
            else delete sudokuState.entriesBy[localPlayer][index];
        } else {
            sudokuState.entries = sudokuState.entries || {};
            if (value) sudokuState.entries[index] = value;
            else delete sudokuState.entries[index];
        }
        renderSudokuBoard(false);
        checkSudokuCompletion();
    });
}

function clearSudokuGrid() {
    if (!sudokuState?.puzzle || !window.confirm('Clear all entries for this Sudoku grid?')) return;
    sudokuSelectedCell = null;
    const updates = { startedAt: Date.now(), completedAt: null };
    if (sudokuSettings.mode === 'versus-ai') {
        updates.aiResolved = false;
        updates.winner = null;
        updates.aiDuration = sudokuAiDuration(sudokuSettings.difficulty, sudokuSettings.aiDifficulty);
        updates.aiCompletedAt = updates.startedAt + updates.aiDuration;
    }
    if (sudokuSettings.mode === 'versus') {
        if (sudokuState.status === 'finished') {
            setSudokuStatus('This Versus match has finished. Start a new match from Modes.');
            return;
        }
        database.ref(`sudoku/versus/current/entriesBy/${localPlayer}`).set({}).then(() => {
            sudokuState.entriesBy = sudokuState.entriesBy || {};
            sudokuState.entriesBy[localPlayer] = {};
            renderSudokuBoard(false);
        });
        return;
    }
    const path = sudokuSettings.mode === 'coop'
        ? coopSudokuPath()
        : sudokuSettings.mode === 'versus-ai'
            ? aiSudokuPath()
            : soloSudokuPath();
    database.ref(path).update({ ...updates, entries: {} }).then(() => {
        sudokuState.entries = {};
        sudokuState.startedAt = updates.startedAt;
        sudokuState.completedAt = null;
        showSudokuResult('', false);
        if (sudokuSettings.mode === 'versus-ai') {
            sudokuState.aiResolved = false;
            sudokuState.winner = null;
            sudokuState.aiDuration = updates.aiDuration;
            sudokuState.aiCompletedAt = updates.aiCompletedAt;
            scheduleSudokuAi(sudokuState);
        }
        renderSudokuBoard(false);
    });
}

function checkSudokuCompletion() {
    const solution = sudokuState?.puzzle?.solution || [];
    const givens = sudokuState?.puzzle?.givens || [];
    const entries = sudokuEntriesForLocalPlayer();
    if (!solution.length) return;
    const solved = solution.every((value, index) => Number(givens[index] || entries[index]) === Number(value));
    if (!solved) return;
    completeSudokuPuzzle();
}

function completeSudokuPuzzle() {
    const elapsed = Math.max(0, Date.now() - Number(sudokuState.startedAt || Date.now()));
    if (sudokuSettings.mode === 'solo') {
        sudokuState.completedAt = Date.now();
        database.ref(soloSudokuPath()).update({ completedAt: sudokuState.completedAt });
        incrementSudokuCompletion(localPlayer, 'solo', sudokuSettings.difficulty, elapsed);
        renderSudokuBoard(false);
        showSudokuResult('<strong>Puzzle complete!</strong><button onclick="requestNewSudokuPuzzle()">New puzzle</button>', true);
    } else if (sudokuSettings.mode === 'coop') {
        database.ref(coopSudokuPath()).transaction(current => {
            if (!current || current.completedAt) return current;
            current.completedAt = Date.now();
            return current;
        }, (error, committed) => {
            if (!error && committed) ['Peter', 'Jadey'].forEach(player => incrementSudokuCompletion(player, 'coop', sudokuSettings.difficulty, elapsed));
        });
    } else if (sudokuSettings.mode === 'versus-ai') {
        finishAiSudoku(elapsed);
    } else {
        database.ref('sudoku/versus/current').transaction(current => {
            if (!current || current.status !== 'active') return current;
            current.status = 'finished';
            current.winner = localPlayer;
            current.completedAt = Date.now();
            return current;
        }, (error, committed) => {
            if (!error && committed) {
                incrementSudokuCompletion(localPlayer, 'versus', sudokuSettings.difficulty, elapsed);
                database.ref(`stats/sudoku/${localPlayer}/versus/${sudokuSettings.difficulty}/wins`).transaction(value => (value || 0) + 1);
                database.ref(`stats/sudoku/${otherPlayer(localPlayer)}/versus/${sudokuSettings.difficulty}/losses`).transaction(value => (value || 0) + 1);
                sendSudokuNotification(otherPlayer(localPlayer), `${playerProfiles[localPlayer]?.nickname || localPlayer} solved the Sudoku first`);
            }
        });
    }
}

function sudokuAiDuration(difficulty, level) {
    const config = SUDOKU_AI_LEVELS[level] || SUDOKU_AI_LEVELS.medium;
    const difficultyBonus = difficulty === 'hard' ? 70000 : difficulty === 'medium' ? 35000 : 0;
    return config.baseMs + difficultyBonus + Math.floor(Math.random() * 30000);
}

function scheduleSudokuAi(state) {
    window.clearInterval(sudokuAiTimer);
    if (!state?.aiCompletedAt || state.completedAt || state.aiResolved) return;
    renderSudokuAiProgress(state);
    sudokuAiTimer = window.setInterval(() => {
        renderSudokuAiProgress(state);
        if (Date.now() >= Number(state.aiCompletedAt)) resolveSudokuAiLoss();
    }, 1000);
}

function renderSudokuAiProgress(state) {
    const duration = Math.max(1, Number(state.aiDuration) || 1);
    const elapsed = Math.max(0, Date.now() - Number(state.startedAt || Date.now()));
    const percent = Math.min(99, Math.floor((elapsed / duration) * 100));
    const level = SUDOKU_AI_LEVELS[state.aiDifficulty]?.label || 'Medium';
    setSudokuStatus(`${modeLabel(sudokuSettings.mode)} - ${SUDOKU_AI_NAME} ${percent}%`);
    showSudokuResult(
        `<strong>${SUDOKU_AI_NAME} is ${percent}% done</strong><div class="ai-progress"><span style="width:${percent}%"></span></div><span class="word-search-result-note">${level} pace</span>`,
        true
    );
}

function resolveSudokuAiLoss() {
    if (sudokuSettings.mode !== 'versus-ai' || sudokuState?.completedAt || sudokuState?.aiResolved) return;
    sudokuState.completedAt = Date.now();
    sudokuState.aiResolved = true;
    enableSudokuBoard(false);
    database.ref(aiSudokuPath()).update({
        aiResolved: true,
        completedAt: sudokuState.completedAt,
        winner: 'AI'
    });
    database.ref(`stats/sudoku/${localPlayer}/versusAi/${sudokuSettings.difficulty}/losses`).transaction(value => (value || 0) + 1);
    showSudokuResult(`<strong>${SUDOKU_AI_NAME} solved it first.</strong><button onclick="requestNewSudokuPuzzle()">New puzzle</button>`, true);
}

function finishAiSudoku(elapsed) {
    window.clearInterval(sudokuAiTimer);
    database.ref(aiSudokuPath()).transaction(current => {
        if (!current || current.completedAt || current.aiResolved) return current;
        current.completedAt = Date.now();
        current.aiResolved = true;
        current.winner = 'player';
        return current;
    }, (error, committed) => {
        if (error || !committed) return;
        sudokuState.completedAt = Date.now();
        sudokuState.aiResolved = true;
        incrementSudokuCompletion(localPlayer, 'versusAi', sudokuSettings.difficulty, elapsed);
        database.ref(`stats/sudoku/${localPlayer}/versusAi/${sudokuSettings.difficulty}/wins`).transaction(value => (value || 0) + 1);
        renderSudokuBoard(false);
        showSudokuResult(`<strong>You beat ${SUDOKU_AI_NAME}!</strong><button onclick="requestNewSudokuPuzzle()">New puzzle</button>`, true);
    });
}

function enableSudokuBoard(enabled) {
    document.getElementById('sudoku-board')?.classList.toggle('disabled', !enabled);
}

function incrementSudokuCompletion(player, mode, difficulty, elapsed) {
    const base = `stats/sudoku/${player}/${mode}/${difficulty}`;
    database.ref(`${base}/completedPuzzles`).transaction(value => (value || 0) + 1);
    database.ref(`${base}/bestTime`).transaction(value => !value || elapsed < value ? elapsed : value);
}

function readyForSudokuVersus() {
    database.ref('sudoku/versus/current').transaction(current => {
        if (!current || current.status !== 'waiting') return current;
        current.readyBy = current.readyBy || {};
        current.present = current.present || {};
        current.readyBy[localPlayer] = true;
        current.present[localPlayer] = Date.now();
        if (current.readyBy.Peter && current.readyBy.Jadey) {
            current.status = 'countdown';
            current.startsAt = Date.now() + 5000;
        }
        return current;
    });
}

function startSudokuCountdown(startsAt) {
    window.clearInterval(sudokuVersusCountdown);
    const tick = () => {
        const remaining = Math.max(0, Math.ceil((startsAt - Date.now()) / 1000));
        setSudokuStatus(remaining ? `Starting in ${remaining}...` : 'Go!');
        if (!remaining) {
            window.clearInterval(sudokuVersusCountdown);
            database.ref('sudoku/versus/current').transaction(current => {
                if (!current || current.status !== 'countdown' || Date.now() < Number(current.startsAt || 0)) return current;
                current.status = 'active';
                return current;
            });
        }
    };
    tick();
    sudokuVersusCountdown = window.setInterval(tick, 250);
}

function refreshSudokuPresence(timestamp = Date.now()) {
    if (sudokuSettings.mode !== 'versus') return;
    database.ref('sudoku/versus/current').transaction(current => {
        if (!current || current.status === 'finished' || !current.players?.[localPlayer]) return current;
        current.present = current.present || {};
        current.present[localPlayer] = timestamp;
        return current;
    });
}

function abandonSudokuVersus(silent = false) {
    return database.ref('sudoku/versus/current').transaction(current => {
        if (!current || current.status === 'finished' || !current.players?.[localPlayer]) return current;
        current.status = 'finished';
        current.abandonedBy = localPlayer;
        current.winner = current.players?.[otherPlayer(localPlayer)] ? otherPlayer(localPlayer) : null;
        current.completedAt = Date.now();
        return current;
    }, (error, committed, snapshot) => {
        const state = snapshot?.val?.();
        if (!silent && committed && state?.winner) sendSudokuNotification(state.winner, `${playerProfiles[localPlayer]?.nickname || localPlayer} left the Sudoku match`);
    });
}

function sendSudokuNotification(recipient, body) {
    sendAppNotification({
        type: 'Sudoku',
        action: 'check-sudoku',
        sender: localPlayer,
        recipient,
        body,
        createdAt: Date.now(),
        readBy: {}
    }, 'sudoku');
}

function createSudokuPuzzle(difficulty = 'easy') {
    const targetGivens = SUDOKU_DIFFICULTIES[difficulty]?.givens || SUDOKU_DIFFICULTIES.easy.givens;
    for (let attempt = 0; attempt < 80; attempt += 1) {
        const solution = generateSolvedSudoku();
        const givens = solution.slice();
        const order = shuffleSudoku(Array.from({ length: SUDOKU_CELLS }, (_, index) => index));
        for (const index of order) {
            if (givens.filter(Boolean).length <= targetGivens) break;
            const previous = givens[index];
            givens[index] = 0;
            if (countSudokuSolutions(givens, 2) !== 1) givens[index] = previous;
        }
        if (givens.filter(Boolean).length <= targetGivens + 2) {
            return { difficulty, givens, solution };
        }
    }
    throw new Error('Could not create a Sudoku puzzle.');
}

function generateSolvedSudoku() {
    const board = Array(SUDOKU_CELLS).fill(0);
    fillSudokuBoard(board);
    return board;
}

function fillSudokuBoard(board) {
    const index = board.findIndex(value => !value);
    if (index < 0) return true;
    for (const value of shuffleSudoku([1, 2, 3, 4, 5, 6, 7, 8, 9])) {
        if (!sudokuCanPlace(board, index, value)) continue;
        board[index] = value;
        if (fillSudokuBoard(board)) return true;
        board[index] = 0;
    }
    return false;
}

function countSudokuSolutions(board, limit = 2) {
    const working = board.slice();
    let count = 0;
    const solve = () => {
        if (count >= limit) return;
        const index = findBestSudokuEmptyCell(working);
        if (index < 0) {
            count += 1;
            return;
        }
        for (let value = 1; value <= 9; value += 1) {
            if (!sudokuCanPlace(working, index, value)) continue;
            working[index] = value;
            solve();
            working[index] = 0;
            if (count >= limit) return;
        }
    };
    solve();
    return count;
}

function findBestSudokuEmptyCell(board) {
    let bestIndex = -1;
    let bestCount = 10;
    for (let index = 0; index < SUDOKU_CELLS; index += 1) {
        if (board[index]) continue;
        let options = 0;
        for (let value = 1; value <= 9; value += 1) {
            if (sudokuCanPlace(board, index, value)) options += 1;
        }
        if (options < bestCount) {
            bestCount = options;
            bestIndex = index;
        }
        if (bestCount === 1) break;
    }
    return bestIndex;
}

function sudokuCanPlace(board, index, value) {
    const row = Math.floor(index / 9);
    const col = index % 9;
    for (let i = 0; i < 9; i += 1) {
        if (board[row * 9 + i] === value || board[i * 9 + col] === value) return false;
    }
    const startRow = Math.floor(row / 3) * 3;
    const startCol = Math.floor(col / 3) * 3;
    for (let r = 0; r < 3; r += 1) {
        for (let c = 0; c < 3; c += 1) {
            if (board[(startRow + r) * 9 + startCol + c] === value) return false;
        }
    }
    return true;
}

function shuffleSudoku(values) {
    const result = values.slice();
    for (let index = result.length - 1; index > 0; index -= 1) {
        const swapIndex = Math.floor(Math.random() * (index + 1));
        [result[index], result[swapIndex]] = [result[swapIndex], result[index]];
    }
    return result;
}

function renderSudokuStats() {
    const container = document.getElementById('sudoku-stats-content');
    if (!container) return;
    const modes = ['solo', 'coop', 'versus', 'versusAi'];
    const difficulties = Object.keys(SUDOKU_DIFFICULTIES);
    container.innerHTML = ['Peter', 'Jadey'].map(player => {
        const rows = modes.flatMap(mode => difficulties.map(difficulty => {
            const values = latestStats?.sudoku?.[player]?.[mode]?.[difficulty] || {};
            const best = values.bestTime ? formatSudokuTime(values.bestTime) : '-';
            const result = mode === 'versus' || mode === 'versusAi' ? ` - ${values.wins || 0}W/${values.losses || 0}L` : '';
            return `<div><span>${modeLabel(mode)} ${SUDOKU_DIFFICULTIES[difficulty].label}</span><strong>${values.completedPuzzles || 0} - ${best}${result}</strong></div>`;
        }));
        return `<section class="sudoku-stat-card ${player.toLowerCase()}">
            <h3>${escapeHtml(playerProfiles[player]?.nickname || player)}</h3>
            ${rows.join('')}
        </section>`;
    }).join('');
}

function formatSudokuTime(milliseconds) {
    if (!milliseconds) return '-';
    const totalSeconds = Math.round(milliseconds / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

function exitSudoku() {
    if (sudokuSettings.mode === 'versus') abandonSudokuVersus(true);
    stopSudokuSubscription();
    switchTab('games');
}

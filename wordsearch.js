// Word Search game logic is kept separate from the existing game engine.
const WORD_SEARCH_DIFFICULTIES = [5, 6, 7, 8, 9];
const WORD_SEARCH_COUNTS = { 5: 4, 6: 5, 7: 6, 8: 7, 9: 8 };
const WORD_SEARCH_COLOURS = ['#58A6FF', '#b685bd', '#2EA44F', '#F2CC60', '#F778BA', '#39C5CF', '#FF8C42', '#A78BFA'];
const WORD_SEARCH_DIRECTIONS = [
    [0, 1], [0, -1], [1, 0], [-1, 0],
    [1, 1], [1, -1], [-1, 1], [-1, -1]
];
const WORD_SEARCH_BANK = [
    'APPLE', 'BEACH', 'BERRY', 'BLOOM', 'BOOK', 'BREAD', 'BRICK', 'CAKE', 'CANDY', 'CLOUD',
    'CORAL', 'DAISY', 'DREAM', 'EARTH', 'FLAME', 'FLOWER', 'FOREST', 'FRUIT', 'GAMES', 'GRAPE',
    'HAPPY', 'HEART', 'HONEY', 'HOUSE', 'JUICE', 'LEMON', 'LIGHT', 'MAGIC', 'MANGO', 'MUSIC',
    'OCEAN', 'PANDA', 'PEACH', 'PEARL', 'PIZZA', 'PLANT', 'RAIN', 'RIVER', 'ROBOT', 'SMILE',
    'SPACE', 'SPARK', 'STAR', 'STONE', 'STORM', 'SUGAR', 'SUNNY', 'SWEET', 'TIGER', 'TRAIN',
    'WATER', 'WHALE', 'WORLD', 'ZEBRA', 'CASTLE', 'COFFEE', 'COOKIE', 'DRAGON', 'GARDEN', 'ISLAND',
    'JUNGLE', 'KITTEN', 'PLANET', 'PURPLE', 'RAINBOW', 'ROCKET', 'SILVER', 'SUMMER', 'TURTLE',
    'WINTER', 'COMPASS', 'DIAMOND', 'FREEDOM', 'MONSTER', 'POPCORN', 'TREASURE'
];

let wordSearchSettings = { mode: 'solo', difficulty: 7 };
let wordSearchPuzzle = null;
let wordSearchFound = {};
let wordSearchSelection = [];
let wordSearchDragging = false;
let wordSearchStartedAt = null;
let wordSearchActiveMs = 0;
let wordSearchLastActivityAt = null;
let wordSearchSessionStartedAt = null;
let wordSearchRealtimeRef = null;
let wordSearchRealtimeHandler = null;
let wordSearchDisconnectHandle = null;
let wordSearchVersusCountdown = null;
let wordSearchCompletedLocally = false;

function wordSearchSettingsKey() {
    return `word-search-settings-${localPlayer || 'unknown'}`;
}

function loadWordSearchSettings() {
    try {
        const saved = JSON.parse(localStorage.getItem(wordSearchSettingsKey()) || '{}');
        wordSearchSettings = {
            mode: ['solo', 'coop', 'versus'].includes(saved.mode) ? saved.mode : 'solo',
            difficulty: WORD_SEARCH_DIFFICULTIES.includes(Number(saved.difficulty)) ? Number(saved.difficulty) : 7
        };
    } catch {
        wordSearchSettings = { mode: 'solo', difficulty: 7 };
    }
}

function saveWordSearchSettings() {
    localStorage.setItem(wordSearchSettingsKey(), JSON.stringify(wordSearchSettings));
}

function launchWordSearch() {
    if (!localPlayer) return;
    setActiveAppView('word-search');
    loadWordSearchSettings();
    document.querySelectorAll('.screen').forEach(screen => screen.classList.add('hidden'));
    const screen = document.getElementById('word-search-screen');
    if (screen) screen.classList.remove('hidden');
    applyThemeToScreen('word-search-screen', 'word-search-header-shell', 'word-search-nav-shell');
    refreshSharedHeader('word-search');
    stopWordSearchRealtime();
    wordSearchCompletedLocally = false;
    wordSearchSessionStartedAt = Date.now();
    setWordSearchStatus('Loading puzzle...');

    if (wordSearchSettings.mode === 'solo') loadSoloWordSearch();
    if (wordSearchSettings.mode === 'coop') loadCoopWordSearch();
    if (wordSearchSettings.mode === 'versus') loadVersusWordSearch();
}

function openWordSearchSettings() {
    setActiveAppView('word-search');
    document.querySelectorAll('.screen').forEach(screen => screen.classList.add('hidden'));
    document.getElementById('word-search-settings-screen')?.classList.remove('hidden');
    const header = document.getElementById('word-search-settings-header');
    if (header) {
        header.classList.remove('header-peter', 'header-jadey');
        header.classList.add(localPlayer === 'Peter' ? 'header-peter' : 'header-jadey');
    }
    document.getElementById('word-search-mode').value = wordSearchSettings.mode;
    document.getElementById('word-search-difficulty').value = String(wordSearchSettings.difficulty);
    updateWordSearchSettingsNote();
}

function updateWordSearchSetting(key, value) {
    if (key === 'mode') {
        const previousMode = wordSearchSettings.mode;
        wordSearchSettings.mode = value;
        if (previousMode === 'versus' && value !== 'versus') abandonVersusMatch(true);
    }
    if (key === 'difficulty') wordSearchSettings.difficulty = Number(value);
    saveWordSearchSettings();
    updateWordSearchSettingsNote();
}

function updateWordSearchSettingsNote(message) {
    const note = document.getElementById('word-search-settings-note');
    if (!note) return;
    note.innerText = message || (
        wordSearchSettings.mode === 'solo' ? 'Solo progress is saved separately for each profile and difficulty.' :
        wordSearchSettings.mode === 'coop' ? 'A new Co-op grid requires approval from the other player.' :
        'Leaving a Versus match abandons it and discards the match.'
    );
}

function requestNewWordSearchGrid() {
    const mode = wordSearchSettings.mode;
    const difficulty = wordSearchSettings.difficulty;
    if (mode === 'coop') {
        const requestRef = database.ref('wordSearch/coopRequests').push();
        const requestId = requestRef.key;
        requestRef.set({
            requester: localPlayer,
            recipient: otherPlayer(localPlayer),
            difficulty,
            status: 'pending',
            createdAt: Date.now()
        });
        database.ref('notifications').push({
            type: 'Word Search',
            action: 'approve-wordsearch-grid',
            requestId,
            sender: localPlayer,
            recipient: otherPlayer(localPlayer),
            body: `${playerProfiles[localPlayer]?.nickname || localPlayer} wants a new ${difficulty}×${difficulty} Co-op grid`,
            createdAt: Date.now(),
            readBy: {}
        });
        updateWordSearchSettingsNote('Request sent to the other player.');
        return;
    }

    if (!window.confirm(`Replace the current ${mode === 'versus' ? 'Versus match' : 'Solo grid'}?`)) return;
    if (mode === 'solo') {
        const puzzle = createWordSearchPuzzle(difficulty);
        database.ref(soloWordSearchPath()).set(createWordSearchState(puzzle));
        launchWordSearch();
    } else {
        abandonVersusMatch(false).then(() => createOrJoinVersusMatch(true)).then(launchWordSearch);
    }
}

function soloWordSearchPath() {
    return `wordSearch/solo/${localPlayer}/${wordSearchSettings.difficulty}`;
}

function coopWordSearchPath() {
    return 'wordSearch/coop/current';
}

function createWordSearchState(puzzle) {
    return {
        puzzle,
        found: {},
        startedAt: Date.now(),
        activeMs: 0,
        lastActivityAt: null,
        completedAt: null
    };
}

function loadSoloWordSearch() {
    const ref = database.ref(soloWordSearchPath());
    ref.once('value').then(snapshot => {
        const state = snapshot.val();
        if (state?.puzzle && !state.completedAt) {
            applyWordSearchState(state);
        } else {
            const fresh = createWordSearchState(createWordSearchPuzzle(wordSearchSettings.difficulty));
            ref.set(fresh);
            applyWordSearchState(fresh);
        }
    });
}

function loadCoopWordSearch() {
    const path = coopWordSearchPath();
    const ref = database.ref(path);
    ref.transaction(current => current?.puzzle && !current.completedAt
        ? current
        : createWordSearchState(createWordSearchPuzzle(wordSearchSettings.difficulty))
    );
    subscribeWordSearch(path, state => {
        applyWordSearchState(state);
        if (!state.completedAt && Object.keys(state.found || {}).length >= state.puzzle.words.length) completeWordSearch();
    });
}

function loadVersusWordSearch() {
    createOrJoinVersusMatch(false).then(() => {
        wordSearchDisconnectHandle?.cancel?.();
        wordSearchDisconnectHandle = database.ref('wordSearch/versus/current').onDisconnect?.() || null;
        wordSearchDisconnectHandle?.remove?.();
        subscribeWordSearch('wordSearch/versus/current', renderVersusState);
    });
}

function createOrJoinVersusMatch(forceNew) {
    const ref = database.ref('wordSearch/versus/current');
    return ref.transaction(current => {
        if (forceNew || !current || current.status === 'finished') {
            return {
                id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
                difficulty: wordSearchSettings.difficulty,
                puzzle: createWordSearchPuzzle(wordSearchSettings.difficulty),
                status: 'waiting',
                players: { [localPlayer]: true },
                readyBy: {},
                foundBy: { Peter: {}, Jadey: {} },
                inviteSent: false,
                createdAt: Date.now()
            };
        }
        current.players = current.players || {};
        current.players[localPlayer] = true;
        return current;
    }).then(result => {
        const state = result.snapshot?.val?.();
        if (state?.difficulty) {
            wordSearchSettings.difficulty = Number(state.difficulty);
            saveWordSearchSettings();
        }
        if (
            state?.status === 'waiting' &&
            state.players?.[localPlayer] &&
            !state.players?.[otherPlayer(localPlayer)] &&
            !state.inviteSent
        ) {
            database.ref('wordSearch/versus/current/inviteSent').transaction(current => {
                if (current) return;
                return true;
            }, (error, committed) => {
                if (!error && committed) {
                    database.ref('notifications').push({
                        type: 'Word Search Versus',
                        action: 'join-wordsearch-versus',
                        difficulty: state.difficulty,
                        sender: localPlayer,
                        recipient: otherPlayer(localPlayer),
                        body: `${playerProfiles[localPlayer]?.nickname || localPlayer} is waiting for a ${state.difficulty}×${state.difficulty} match`,
                        createdAt: Date.now(),
                        readBy: {}
                    });
                }
            });
        }
    });
}

function joinWordSearchVersus(difficulty) {
    wordSearchSettings = { mode: 'versus', difficulty: Number(difficulty) || 7 };
    saveWordSearchSettings();
    launchWordSearch();
}

function renderVersusState(state) {
    if (!state?.puzzle) {
        wordSearchDisconnectHandle?.cancel?.();
        wordSearchDisconnectHandle = null;
        setWordSearchStatus('Creating match...');
        return;
    }
    wordSearchPuzzle = state.puzzle;
    wordSearchFound = state.foundBy?.[localPlayer] || {};
    wordSearchStartedAt = state.startsAt || null;
    renderWordSearchBoard();

    if (state.status === 'waiting') {
        enableWordSearchGrid(false);
        const bothPresent = state.players?.Peter && state.players?.Jadey;
        const ready = state.readyBy?.[localPlayer];
        showWordSearchResult(
            bothPresent
                ? `<strong>${ready ? 'Ready. Waiting for the other player...' : 'Both players are here.'}</strong><button onclick="readyForVersus()">Ready</button>`
                : '<strong>Waiting for the other player to join...</strong>',
            true
        );
        setWordSearchStatus('Versus • Ready room');
        return;
    }

    if (state.status === 'countdown') {
        showWordSearchResult('', false);
        startVersusCountdown(state.startsAt);
        return;
    }

    if (state.status === 'active') {
        showWordSearchResult('', false);
        setWordSearchStatus(`Versus • ${state.difficulty}×${state.difficulty}`);
        enableWordSearchGrid(true);
        if (Object.keys(wordSearchFound).length >= wordSearchPuzzle.words.length) completeWordSearch();
        return;
    }

    if (state.status === 'finished') {
        wordSearchDisconnectHandle?.cancel?.();
        wordSearchDisconnectHandle = null;
        enableWordSearchGrid(false);
        const winner = state.winner;
        showWordSearchResult(`<strong>${winner === localPlayer ? 'You won!' : `${playerProfiles[winner]?.nickname || winner} won`}</strong>`, true);
    }
}

function readyForVersus() {
    const ref = database.ref('wordSearch/versus/current');
    ref.transaction(current => {
        if (!current || current.status !== 'waiting') return current;
        current.readyBy = current.readyBy || {};
        current.readyBy[localPlayer] = true;
        if (current.readyBy.Peter && current.readyBy.Jadey) {
            current.status = 'countdown';
            current.startsAt = Date.now() + 3500;
        }
        return current;
    });
}

function startVersusCountdown(startsAt) {
    window.clearInterval(wordSearchVersusCountdown);
    enableWordSearchGrid(false);
    const tick = () => {
        const remaining = Math.max(0, Math.ceil((startsAt - Date.now()) / 1000));
        setWordSearchStatus(remaining ? `Starting in ${remaining}...` : 'Go!');
        if (!remaining) {
            window.clearInterval(wordSearchVersusCountdown);
            database.ref('wordSearch/versus/current/status').set('active');
        }
    };
    tick();
    wordSearchVersusCountdown = window.setInterval(tick, 250);
}

function subscribeWordSearch(path, handler) {
    stopWordSearchRealtime();
    wordSearchRealtimeRef = database.ref(path);
    wordSearchRealtimeHandler = snapshot => {
        const state = snapshot.val();
        if (state) handler(state);
    };
    wordSearchRealtimeRef.on('value', wordSearchRealtimeHandler);
}

function stopWordSearchRealtime() {
    if (wordSearchRealtimeRef && wordSearchRealtimeHandler && wordSearchRealtimeRef.off) {
        wordSearchRealtimeRef.off('value', wordSearchRealtimeHandler);
    }
    wordSearchRealtimeRef = null;
    wordSearchRealtimeHandler = null;
    window.clearInterval(wordSearchVersusCountdown);
}

function applyWordSearchState(state) {
    if (!state?.puzzle) return;
    if (wordSearchSettings.mode === 'coop' && WORD_SEARCH_DIFFICULTIES.includes(Number(state.puzzle.size))) {
        wordSearchSettings.difficulty = Number(state.puzzle.size);
        saveWordSearchSettings();
    }
    wordSearchPuzzle = state.puzzle;
    wordSearchFound = state.found || {};
    wordSearchStartedAt = state.startedAt || Date.now();
    wordSearchActiveMs = Number(state.activeMs) || 0;
    wordSearchLastActivityAt = state.lastActivityAt || null;
    renderWordSearchBoard();
    setWordSearchStatus(`${modeTitle(wordSearchSettings.mode)} • ${wordSearchPuzzle.size}×${wordSearchPuzzle.size}`);
    showWordSearchResult('', false);
    enableWordSearchGrid(true);
}

function renderWordSearchBoard() {
    if (!wordSearchPuzzle) return;
    const grid = document.getElementById('word-search-grid');
    const words = document.getElementById('word-search-words');
    if (!grid || !words) return;

    grid.style.setProperty('--word-grid-size', wordSearchPuzzle.size);
    grid.innerHTML = wordSearchPuzzle.grid.flatMap((row, rowIndex) =>
        row.map((letter, colIndex) =>
            `<button class="word-search-cell" data-row="${rowIndex}" data-col="${colIndex}" type="button">${letter}</button>`
        )
    ).join('');
    words.innerHTML = wordSearchPuzzle.words.map((word, index) =>
        `<span class="${wordSearchFound[index] ? 'found' : ''}" data-word-index="${index}">${word}</span>`
    ).join('');
    paintFoundWords();
    bindWordSearchPointerEvents();
}

function bindWordSearchPointerEvents() {
    const grid = document.getElementById('word-search-grid');
    if (!grid) return;
    grid.onpointerdown = event => {
        const cell = event.target.closest('.word-search-cell');
        if (!cell || grid.classList.contains('disabled')) return;
        event.preventDefault();
        wordSearchDragging = true;
        grid.setPointerCapture?.(event.pointerId);
        wordSearchSelection = [cellCoordinates(cell)];
        updateWordSearchPreview();
    };
    const updateEndCell = event => {
        const target = document.elementFromPoint(event.clientX, event.clientY);
        const cell = target?.closest?.('.word-search-cell');
        if (!cell || !grid.contains(cell) || !wordSearchSelection.length) return;
        const line = straightLine(wordSearchSelection[0], cellCoordinates(cell));
        if (line.length) {
            wordSearchSelection = line;
            updateWordSearchPreview();
        }
    };
    grid.onpointermove = event => {
        if (!wordSearchDragging) return;
        event.preventDefault();
        updateEndCell(event);
    };
    const finish = event => {
        if (!wordSearchDragging) return;
        if (event?.clientX !== undefined) updateEndCell(event);
        wordSearchDragging = false;
        if (grid.hasPointerCapture?.(event?.pointerId)) grid.releasePointerCapture(event.pointerId);
        submitWordSearchSelection();
    };
    grid.onpointerup = finish;
    grid.onpointercancel = finish;
}

function cellCoordinates(cell) {
    return { row: Number(cell.dataset.row), col: Number(cell.dataset.col) };
}

function straightLine(start, end) {
    const rowDelta = end.row - start.row;
    const colDelta = end.col - start.col;
    if (rowDelta !== 0 && colDelta !== 0 && Math.abs(rowDelta) !== Math.abs(colDelta)) return [];
    const rowStep = Math.sign(rowDelta);
    const colStep = Math.sign(colDelta);
    const length = Math.max(Math.abs(rowDelta), Math.abs(colDelta)) + 1;
    return Array.from({ length }, (_, index) => ({
        row: start.row + rowStep * index,
        col: start.col + colStep * index
    }));
}

function updateWordSearchPreview() {
    document.querySelectorAll('.word-search-cell.preview').forEach(cell => cell.classList.remove('preview'));
    const formed = wordSearchSelection.map(position => {
        const cell = wordSearchCell(position);
        cell?.classList.add('preview');
        return cell?.innerText || '';
    }).join('');
    const label = document.getElementById('word-search-current-word');
    if (label) label.innerText = formed || 'Drag across a word';
}

function submitWordSearchSelection() {
    if (!wordSearchPuzzle || !wordSearchSelection.length) return;
    const selectedWord = wordSearchSelection.map(position =>
        wordSearchPuzzle.grid?.[position.row]?.[position.col] || ''
    ).join('').toUpperCase();
    const reversedWord = [...selectedWord].reverse().join('');
    const selectedKey = coordinateKey(wordSearchSelection);
    const reverseKey = coordinateKey([...wordSearchSelection].reverse());
    let wordIndex = (wordSearchPuzzle.words || []).findIndex((word, index) =>
        !wordSearchFound[index] && (word === selectedWord || word === reversedWord)
    );
    if (wordIndex < 0) wordIndex = (wordSearchPuzzle.paths || []).findIndex(path => {
        const pathKey = coordinateKey(path);
        return pathKey === selectedKey || pathKey === reverseKey;
    });
    document.querySelectorAll('.word-search-cell.preview').forEach(cell => cell.classList.remove('preview'));
    document.getElementById('word-search-current-word').innerText = 'Drag across a word';
    wordSearchSelection = [];
    if (wordIndex < 0 || wordSearchFound[wordIndex]) return;
    recordFoundWord(wordIndex);
}

function coordinateKey(path) {
    return Array.isArray(path)
        ? path.map(position => `${position.row},${position.col}`).join('|')
        : '';
}

function wordSearchCell(position) {
    return document.querySelector(`.word-search-cell[data-row="${position.row}"][data-col="${position.col}"]`);
}

function recordFoundWord(wordIndex) {
    const mode = wordSearchSettings.mode;
    if (mode === 'solo') {
        claimPersistentWord(soloWordSearchPath(), wordIndex, localPlayer);
        return;
    }
    if (mode === 'coop') {
        claimPersistentWord(coopWordSearchPath(), wordIndex, localPlayer);
        return;
    }
    database.ref(`wordSearch/versus/current/foundBy/${localPlayer}/${wordIndex}`).transaction(current => {
        if (current) return;
        return true;
    });
}

function claimPersistentWord(path, wordIndex, finder) {
    database.ref(path).transaction(current => {
        if (!current?.puzzle || current.found?.[wordIndex]) return;
        const now = Date.now();
        const activityStart = Math.max(
            Number(current.lastActivityAt) || wordSearchSessionStartedAt || now,
            wordSearchSessionStartedAt || now
        );
        current.found = current.found || {};
        current.found[wordIndex] = finder;
        current.activeMs = (Number(current.activeMs) || 0) + Math.min(5 * 60 * 1000, Math.max(0, now - activityStart));
        current.lastActivityAt = now;
        return current;
    }, (error, committed, snapshot) => {
        if (error || !committed) return;
        const state = snapshot.val();
        wordSearchFound = state.found || {};
        wordSearchActiveMs = Number(state.activeMs) || 0;
        wordSearchLastActivityAt = state.lastActivityAt || null;
        paintFoundWords();
        incrementWordSearchWordsFound(finder, wordSearchSettings.mode, wordSearchSettings.difficulty);
        if (Object.keys(wordSearchFound).length >= wordSearchPuzzle.words.length) completeWordSearch();
    });
}

function incrementWordSearchWordsFound(player, mode, difficulty) {
    database.ref(`stats/wordSearch/${player}/${mode}/${difficulty}/wordsFound`)
        .transaction(value => (value || 0) + 1);
}

function paintFoundWords() {
    if (!wordSearchPuzzle) return;
    Object.keys(wordSearchFound).forEach(key => {
        const index = Number(key);
        const colour = WORD_SEARCH_COLOURS[index % WORD_SEARCH_COLOURS.length];
        wordSearchPuzzle.paths[index]?.forEach(position => {
            const cell = wordSearchCell(position);
            if (cell) {
                cell.classList.add('found-cell');
                cell.style.setProperty('--found-colour', colour);
            }
        });
        document.querySelector(`[data-word-index="${index}"]`)?.classList.add('found');
    });
}

function completeWordSearch() {
    if (wordSearchCompletedLocally) return;
    wordSearchCompletedLocally = true;
    const mode = wordSearchSettings.mode;
    const difficulty = wordSearchSettings.difficulty;
    const elapsed = mode === 'versus'
        ? Math.max(1, Date.now() - (wordSearchStartedAt || Date.now()))
        : Math.max(1, wordSearchActiveMs);
    enableWordSearchGrid(false);

    if (mode === 'solo') {
        database.ref(`${soloWordSearchPath()}/completedAt`).set(Date.now());
        incrementWordSearchCompletion(localPlayer, mode, difficulty, elapsed);
        showWordSearchResult('<strong>Grid complete!</strong><button onclick="requestNewWordSearchGrid()">New grid</button>', true);
    } else if (mode === 'coop') {
        database.ref(`${coopWordSearchPath()}/completedAt`).transaction(current => {
            if (current) return;
            return Date.now();
        }, (error, committed) => {
            if (!error && committed) {
                ['Peter', 'Jadey'].forEach(player => incrementWordSearchCompletion(player, mode, difficulty, elapsed));
            }
        });
        showWordSearchResult('<strong>Co-op grid complete!</strong>', true);
    } else {
        finishVersusMatch(elapsed);
    }
}

function finishVersusMatch(elapsed) {
    database.ref('wordSearch/versus/current').transaction(current => {
        if (!current || current.status === 'finished') return;
        current.status = 'finished';
        current.winner = localPlayer;
        current.completedAt = Date.now();
        return current;
    }, (error, committed, snapshot) => {
        if (error || !committed) return;
        const finishedMatch = snapshot.val() || {};
        ['Peter', 'Jadey'].forEach(player => {
            const foundCount = Object.keys(finishedMatch.foundBy?.[player] || {}).length;
            if (foundCount) {
                database.ref(`stats/wordSearch/${player}/versus/${wordSearchSettings.difficulty}/wordsFound`)
                    .transaction(value => (value || 0) + foundCount);
            }
        });
        incrementWordSearchCompletion(localPlayer, 'versus', wordSearchSettings.difficulty, elapsed);
        database.ref(`stats/wordSearch/${localPlayer}/versus/${wordSearchSettings.difficulty}/wins`).transaction(value => (value || 0) + 1);
        database.ref(`stats/wordSearch/${otherPlayer(localPlayer)}/versus/${wordSearchSettings.difficulty}/losses`).transaction(value => (value || 0) + 1);
    });
}

function incrementWordSearchCompletion(player, mode, difficulty, elapsed) {
    const base = `stats/wordSearch/${player}/${mode}/${difficulty}`;
    database.ref(`${base}/completedGrids`).transaction(value => (value || 0) + 1);
    database.ref(`${base}/bestTime`).transaction(current => !current || elapsed < current ? elapsed : current);
}

function renderWordSearchStats() {
    const container = document.getElementById('word-search-stats-content');
    if (!container) return;
    const modes = ['solo', 'coop', 'versus'];
    container.innerHTML = ['Peter', 'Jadey'].map(player => {
        const sections = modes.map(mode => {
            const rows = WORD_SEARCH_DIFFICULTIES.map(size => {
                const values = latestStats?.wordSearch?.[player]?.[mode]?.[size] || {};
                const result = mode === 'versus' ? `${values.wins || 0}W / ${values.losses || 0}L` : '—';
                return `<div class="word-stats-row"><strong>${size}×${size}</strong><span>${values.completedGrids || 0} grids</span><span>${values.wordsFound || 0} words</span><span>${formatWordSearchTime(values.bestTime)}</span><span>${result}</span></div>`;
            }).join('');
            return `<div class="word-stats-mode"><h4>${modeTitle(mode)}</h4><div class="word-stats-row word-stats-head"><strong>Grid</strong><span>Done</span><span>Words</span><span>Best</span><span>W/L</span></div>${rows}</div>`;
        }).join('');
        return `<section class="word-stats-player ${player.toLowerCase()}"><h3>${player}</h3>${sections}</section>`;
    }).join('');
}

function formatWordSearchTime(milliseconds) {
    if (!milliseconds) return '—';
    const totalSeconds = Math.round(milliseconds / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

function modeTitle(mode) {
    return mode === 'coop' ? 'Co-op' : mode.charAt(0).toUpperCase() + mode.slice(1);
}

function enableWordSearchGrid(enabled) {
    document.getElementById('word-search-grid')?.classList.toggle('disabled', !enabled);
}

function setWordSearchStatus(message) {
    const status = document.getElementById('word-search-status');
    if (status) status.innerText = message;
}

function showWordSearchResult(html, visible) {
    const result = document.getElementById('word-search-result');
    if (!result) return;
    result.innerHTML = html;
    result.classList.toggle('hidden', !visible);
}

function approveCoopWordSearchRequest(requestId) {
    const requestRef = database.ref(`wordSearch/coopRequests/${requestId}`);
    return requestRef.once('value').then(snapshot => {
        const request = snapshot.val();
        if (!request || request.recipient !== localPlayer || request.status !== 'pending') return;
        const puzzle = createWordSearchState(createWordSearchPuzzle(Number(request.difficulty)));
        return Promise.all([
            database.ref(coopWordSearchPath()).set(puzzle),
            requestRef.update({ status: 'approved', approvedBy: localPlayer, approvedAt: Date.now() })
        ]);
    });
}

function rejectCoopWordSearchRequest(requestId) {
    return database.ref(`wordSearch/coopRequests/${requestId}`).update({
        status: 'rejected',
        rejectedBy: localPlayer,
        rejectedAt: Date.now()
    });
}

function exitWordSearch() {
    const leavingVersus = wordSearchSettings.mode === 'versus';
    stopWordSearchRealtime();
    const finish = leavingVersus ? abandonVersusMatch(true) : Promise.resolve();
    finish.finally(() => switchTab('games'));
}

function abandonVersusMatch(notifyOpponent) {
    return database.ref('wordSearch/versus/current').once('value').then(snapshot => {
        const match = snapshot.val();
        if (!match || !match.players?.[localPlayer] || match.status === 'finished') return;
        const opponent = otherPlayer(localPlayer);
        const notification = {
            type: 'Word Search',
            sender: localPlayer,
            recipient: opponent,
            body: `${playerProfiles[localPlayer]?.nickname || localPlayer} left the Versus match. The match was abandoned.`,
            createdAt: Date.now(),
            readBy: {}
        };
        const updates = { 'wordSearch/versus/current': null };
        if (notifyOpponent && match.players?.[otherPlayer(localPlayer)]) {
            return database.ref().update(updates)
                .then(() => sendAppNotification(notification, 'word-search'));
        }
        return database.ref().update(updates);
    }).finally(() => {
        wordSearchDisconnectHandle?.cancel?.();
        wordSearchDisconnectHandle = null;
    });
}

function createWordSearchPuzzle(size) {
    const count = WORD_SEARCH_COUNTS[size];
    const candidates = shuffle(WORD_SEARCH_BANK.filter(word => word.length <= size));
    for (let attempt = 0; attempt < 80; attempt += 1) {
        const grid = Array.from({ length: size }, () => Array(size).fill(''));
        const words = [];
        const paths = [];
        for (const word of candidates) {
            const path = placeWord(grid, word);
            if (path) {
                words.push(word);
                paths.push(path);
            }
            if (words.length === count) break;
        }
        if (words.length === count) {
            fillGrid(grid);
            return { id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, size, grid, words, paths };
        }
    }
    throw new Error('Could not generate a Word Search grid.');
}

function placeWord(grid, word) {
    const size = grid.length;
    const options = shuffle(WORD_SEARCH_DIRECTIONS.flatMap(([rowStep, colStep]) => {
        const starts = [];
        for (let row = 0; row < size; row += 1) {
            for (let col = 0; col < size; col += 1) {
                const endRow = row + rowStep * (word.length - 1);
                const endCol = col + colStep * (word.length - 1);
                if (endRow < 0 || endRow >= size || endCol < 0 || endCol >= size) continue;
                const path = Array.from({ length: word.length }, (_, index) => ({ row: row + rowStep * index, col: col + colStep * index }));
                const fits = path.every((position, index) => !grid[position.row][position.col] || grid[position.row][position.col] === word[index]);
                if (fits) starts.push(path);
            }
        }
        return starts;
    }));
    const path = options[0];
    if (!path) return null;
    path.forEach((position, index) => {
        grid[position.row][position.col] = word[index];
    });
    return path;
}

function fillGrid(grid) {
    const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    grid.forEach(row => row.forEach((value, index) => {
        if (!value) row[index] = letters[Math.floor(Math.random() * letters.length)];
    }));
}

function shuffle(values) {
    const result = [...values];
    for (let index = result.length - 1; index > 0; index -= 1) {
        const swapIndex = Math.floor(Math.random() * (index + 1));
        [result[index], result[swapIndex]] = [result[swapIndex], result[index]];
    }
    return result;
}

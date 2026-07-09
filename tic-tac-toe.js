const TTT_LINES = [
    [0, 1, 2], [3, 4, 5], [6, 7, 8],
    [0, 3, 6], [1, 4, 7], [2, 5, 8],
    [0, 4, 8], [2, 4, 6]
];

let ticTacToeSettings = { mode: 'versus' };
let ticTacToeState = null;
let ticTacToeRef = null;
let ticTacToeHandler = null;

function ticTacToeSettingsKey() {
    return `tic-tac-toe-settings-${localPlayer || 'unknown'}`;
}

function loadTicTacToeSettings() {
    try {
        const saved = JSON.parse(localStorage.getItem(ticTacToeSettingsKey()) || '{}');
        ticTacToeSettings = { mode: ['versus', 'versus-ai'].includes(saved.mode) ? saved.mode : 'versus' };
    } catch {
        ticTacToeSettings = { mode: 'versus' };
    }
}

function saveTicTacToeSettings() {
    localStorage.setItem(ticTacToeSettingsKey(), JSON.stringify(ticTacToeSettings));
}

function launchTicTacToe() {
    if (!localPlayer) return;
    setActiveAppView('tic-tac-toe');
    loadTicTacToeSettings();
    stopTicTacToeSubscription();
    document.querySelectorAll('.screen').forEach(screen => screen.classList.add('hidden'));
    document.getElementById('tic-tac-toe-screen')?.classList.remove('hidden');
    applyThemeToScreen('tic-tac-toe-screen', 'tic-tac-toe-header-shell', 'tic-tac-toe-nav-shell');
    refreshSharedHeader('tic-tac-toe');
    setTicTacToeStatus('Loading match...');
    if (ticTacToeSettings.mode === 'versus-ai') loadTicTacToeAi();
    else loadTicTacToeVersus();
}

function openTicTacToeSettings() {
    setActiveAppView('tic-tac-toe-settings');
    document.querySelectorAll('.screen').forEach(screen => screen.classList.add('hidden'));
    document.getElementById('tic-tac-toe-settings-screen')?.classList.remove('hidden');
    const header = document.getElementById('tic-tac-toe-settings-header');
    if (header) {
        header.classList.remove('header-peter', 'header-jadey');
        header.classList.add(localPlayer === 'Peter' ? 'header-peter' : 'header-jadey');
    }
    document.getElementById('tic-tac-toe-mode').value = ticTacToeSettings.mode;
}

function updateTicTacToeSetting(key, value) {
    if (key === 'mode' && ['versus', 'versus-ai'].includes(value)) ticTacToeSettings.mode = value;
    saveTicTacToeSettings();
}

function ticTacToeAiPath() {
    return `games/ticTacToe/ai/${localPlayer}`;
}

function createTicTacToeState(mode = 'versus') {
    return {
        mode,
        status: mode === 'versus' ? 'waiting' : 'active',
        players: mode === 'versus' ? { [localPlayer]: true } : { [localPlayer]: true, Jaylin: true },
        board: Array(9).fill(''),
        turn: localPlayer,
        winner: null,
        winningCells: [],
        inviteSent: false,
        createdAt: Date.now()
    };
}

function loadTicTacToeAi() {
    database.ref(ticTacToeAiPath()).once('value').then(snapshot => {
        const state = snapshot.val();
        if (state && state.status !== 'finished') {
            ticTacToeState = state;
            renderTicTacToe();
        } else {
            const fresh = createTicTacToeState('versus-ai');
            database.ref(ticTacToeAiPath()).set(fresh);
            ticTacToeState = fresh;
            renderTicTacToe();
        }
    });
}

function loadTicTacToeVersus() {
    subscribeTicTacToe();
    database.ref('games/ticTacToe/current').transaction(current => {
        if (!current || current.status === 'finished') return createTicTacToeState('versus');
        current.players = current.players || {};
        current.players[localPlayer] = true;
        if (current.status === 'waiting' && current.players.Peter && current.players.Jadey) {
            current.status = 'active';
            current.turn = Math.random() < 0.5 ? 'Peter' : 'Jadey';
            current.startedAt = Date.now();
        }
        return current;
    }).then(result => {
        const state = result.snapshot?.val?.();
        if (state?.status === 'waiting' && !state.inviteSent) sendTicTacToeInvite();
    });
}

function subscribeTicTacToe() {
    stopTicTacToeSubscription();
    ticTacToeRef = database.ref('games/ticTacToe/current');
    ticTacToeHandler = snapshot => {
        ticTacToeState = snapshot.val();
        renderTicTacToe();
    };
    ticTacToeRef.on('value', ticTacToeHandler);
}

function stopTicTacToeSubscription() {
    if (ticTacToeRef && ticTacToeHandler && ticTacToeRef.off) ticTacToeRef.off('value', ticTacToeHandler);
    ticTacToeRef = null;
    ticTacToeHandler = null;
}

function sendTicTacToeInvite() {
    database.ref('games/ticTacToe/current/inviteSent').transaction(current => current ? undefined : true, (error, committed) => {
        if (error || !committed) return;
        sendAppNotification({
            type: 'Tic-Tac-Toe',
            action: 'join-tic-tac-toe',
            sender: localPlayer,
            recipient: otherPlayer(localPlayer),
            body: `${playerProfiles[localPlayer]?.nickname || localPlayer} wants to play Tic-Tac-Toe`,
            createdAt: Date.now(),
            readBy: {}
        }, 'tic-tac-toe');
    });
}

function renderTicTacToe() {
    const board = document.getElementById('tic-tac-toe-board');
    const controls = document.getElementById('tic-tac-toe-controls');
    if (!board || !controls || !ticTacToeState) return;
    const status = ticTacToeState.status;
    const aiMode = ticTacToeSettings.mode === 'versus-ai' || ticTacToeState.mode === 'versus-ai';
    if (status === 'waiting') setTicTacToeStatus('Waiting for the other player...');
    else if (status === 'active') setTicTacToeStatus(ticTacToeState.turn === localPlayer ? 'Your turn' : `Waiting for ${aiMode ? 'Jaylin' : playerProfiles[otherPlayer(localPlayer)]?.nickname || otherPlayer(localPlayer)}...`);
    else if (ticTacToeState.winner === 'draw') setTicTacToeStatus('Draw.');
    else setTicTacToeStatus(ticTacToeState.winner === localPlayer ? 'You won!' : `${ticTacToeState.winner === 'Jaylin' ? 'Jaylin' : 'The other player'} won.`);
    const winningCells = new Set(ticTacToeState.winningCells || []);
    board.innerHTML = (ticTacToeState.board || Array(9).fill('')).map((mark, index) => {
        const canPlay = status === 'active' && ticTacToeState.turn === localPlayer && !mark;
        const symbol = ticTacToeSymbolFor(mark);
        const ownerClass = mark ? (mark === localPlayer ? 'own-mark' : 'opponent-mark') : '';
        return `<button class="ttt-cell ${ownerClass} ${winningCells.has(index) ? 'winning-cell' : ''}" ${canPlay ? `onclick="playTicTacToeCell(${index})"` : 'disabled'}>${symbol}</button>`;
    }).join('');
    controls.innerHTML = status === 'finished'
        ? '<button class="primary" onclick="startNewTicTacToeMatch()">New match</button>'
        : '<button class="danger" onclick="abandonTicTacToeMatch()">Abandon match</button>';
}

function ticTacToeSymbolFor(player) {
    if (!player) return '';
    return player === localPlayer ? 'X' : 'O';
}

function setTicTacToeStatus(message) {
    const status = document.getElementById('tic-tac-toe-status');
    if (status) status.innerText = message;
}

function playTicTacToeCell(index) {
    if (ticTacToeSettings.mode === 'versus-ai') playTicTacToeAiCell(index);
    else playTicTacToeVersusCell(index);
}

function playTicTacToeVersusCell(index) {
    let result = null;
    database.ref('games/ticTacToe/current').transaction(current => {
        if (!current || current.status !== 'active' || current.turn !== localPlayer || current.board?.[index]) return;
        current.board[index] = localPlayer;
        result = finishTicTacToeTurn(current, localPlayer, otherPlayer(localPlayer));
        return current;
    }, (error, committed) => {
        if (error || !committed || !result) return;
        database.ref(`stats/ticTacToe/${localPlayer}/versus/moves`).transaction(value => (value || 0) + 1);
        if (result.finished) recordTicTacToeResult(result.winner, 'versus', localPlayer, otherPlayer(localPlayer));
        sendTicTacToeNotification(otherPlayer(localPlayer), result.finished ? 'Your Tic-Tac-Toe match finished' : `${playerProfiles[localPlayer]?.nickname || localPlayer} finished their turn in Tic-Tac-Toe`);
    });
}

function playTicTacToeAiCell(index) {
    const state = ticTacToeState;
    if (!state || state.status !== 'active' || state.turn !== localPlayer || state.board?.[index]) return;
    state.board[index] = localPlayer;
    let result = finishTicTacToeTurn(state, localPlayer, 'Jaylin');
    if (!result.finished) {
        const aiIndex = chooseTicTacToeAiMove(state.board);
        if (aiIndex !== null) {
            state.board[aiIndex] = 'Jaylin';
            result = finishTicTacToeTurn(state, 'Jaylin', localPlayer);
        }
    }
    database.ref(ticTacToeAiPath()).set(state);
    database.ref(`stats/ticTacToe/${localPlayer}/versusAi/moves`).transaction(value => (value || 0) + 1);
    if (result.finished) recordTicTacToeResult(result.winner, 'versusAi', localPlayer, 'Jaylin');
    renderTicTacToe();
}

function finishTicTacToeTurn(state, player, nextPlayer) {
    const line = findTicTacToeWin(state.board, player);
    if (line.length) {
        state.status = 'finished';
        state.winner = player;
        state.winningCells = line;
        state.completedAt = Date.now();
        return { finished: true, winner: player };
    }
    if (state.board.every(Boolean)) {
        state.status = 'finished';
        state.winner = 'draw';
        state.completedAt = Date.now();
        return { finished: true, winner: 'draw' };
    }
    state.turn = nextPlayer;
    return { finished: false, winner: null };
}

function findTicTacToeWin(board, player) {
    return TTT_LINES.find(line => line.every(index => board[index] === player)) || [];
}

function chooseTicTacToeAiMove(board) {
    const open = board.map((value, index) => value ? null : index).filter(index => index !== null);
    for (const player of ['Jaylin', localPlayer]) {
        const winningMove = open.find(index => findTicTacToeWin(board.map((value, cell) => cell === index ? player : value), player).length);
        if (winningMove !== undefined) return winningMove;
    }
    if (open.includes(4)) return 4;
    const corners = open.filter(index => [0, 2, 6, 8].includes(index));
    if (corners.length) return corners[Math.floor(Math.random() * corners.length)];
    return open.length ? open[Math.floor(Math.random() * open.length)] : null;
}

function sendTicTacToeNotification(recipient, body) {
    sendAppNotification({
        type: 'Tic-Tac-Toe',
        action: 'check-tic-tac-toe',
        sender: localPlayer,
        recipient,
        body,
        createdAt: Date.now(),
        readBy: {}
    }, 'tic-tac-toe');
}

function recordTicTacToeResult(winner, mode, player, opponent) {
    const players = opponent === 'Jaylin' ? [player] : [player, opponent];
    players.forEach(item => database.ref(`stats/ticTacToe/${item}/${mode}/gamesPlayed`).transaction(value => (value || 0) + 1));
    if (winner === 'draw') {
        players.forEach(item => database.ref(`stats/ticTacToe/${item}/${mode}/draws`).transaction(value => (value || 0) + 1));
        return;
    }
    if (winner === player) database.ref(`stats/ticTacToe/${player}/${mode}/wins`).transaction(value => (value || 0) + 1);
    else database.ref(`stats/ticTacToe/${player}/${mode}/losses`).transaction(value => (value || 0) + 1);
    if (opponent !== 'Jaylin') {
        database.ref(`stats/ticTacToe/${opponent}/${mode}/${winner === opponent ? 'wins' : 'losses'}`).transaction(value => (value || 0) + 1);
    }
}

function startNewTicTacToeMatch() {
    if (!window.confirm('Start a new Tic-Tac-Toe match?')) return;
    if (ticTacToeSettings.mode === 'versus-ai') database.ref(ticTacToeAiPath()).set(createTicTacToeState('versus-ai')).then(launchTicTacToe);
    else database.ref('games/ticTacToe/current').set(createTicTacToeState('versus')).then(sendTicTacToeInvite);
}

function abandonTicTacToeMatch() {
    if (!window.confirm('Abandon this Tic-Tac-Toe match?')) return;
    if (ticTacToeSettings.mode === 'versus-ai') {
        database.ref(ticTacToeAiPath()).set({ ...ticTacToeState, status: 'finished', winner: 'Jaylin', abandonedBy: localPlayer, completedAt: Date.now() });
        recordTicTacToeResult('Jaylin', 'versusAi', localPlayer, 'Jaylin');
        launchTicTacToe();
        return;
    }
    database.ref('games/ticTacToe/current').transaction(current => {
        if (!current || current.status === 'finished') return current;
        current.status = 'finished';
        current.winner = otherPlayer(localPlayer);
        current.abandonedBy = localPlayer;
        current.completedAt = Date.now();
        return current;
    }, (error, committed) => {
        if (!error && committed) {
            recordTicTacToeResult(otherPlayer(localPlayer), 'versus', localPlayer, otherPlayer(localPlayer));
            clearGameNotifications(['join-tic-tac-toe', 'check-tic-tac-toe'], ['Peter', 'Jadey']).then(() =>
                sendTicTacToeNotification(otherPlayer(localPlayer), `${playerProfiles[localPlayer]?.nickname || localPlayer} abandoned Tic-Tac-Toe`)
            );
        }
    });
}

function renderTicTacToeStats() {
    const container = document.getElementById('tic-tac-toe-stats-content');
    if (!container) return;
    container.innerHTML = ['Peter', 'Jadey'].map(player => {
        const sections = ['versus', 'versusAi'].map(mode => {
            const values = latestStats?.ticTacToe?.[player]?.[mode] || {};
            return `<div class="duel-stat-mode"><h4>${mode === 'versusAi' ? 'Versus Jaylin' : 'Versus Player'}</h4>
                <div class="stats-row"><span>Wins</span><strong>${values.wins || 0}</strong></div>
                <div class="stats-row"><span>Losses</span><strong>${values.losses || 0}</strong></div>
                <div class="stats-row"><span>Draws</span><strong>${values.draws || 0}</strong></div>
                <div class="stats-row"><span>Games</span><strong>${values.gamesPlayed || 0}</strong></div>
                <div class="stats-row"><span>Moves</span><strong>${values.moves || 0}</strong></div></div>`;
        }).join('');
        return `<section class="duel-stat-card ${player.toLowerCase()}"><h3>${escapeHtml(playerProfiles[player]?.nickname || player)}</h3>${sections}</section>`;
    }).join('');
}

function exitTicTacToe() {
    stopTicTacToeSubscription();
    switchTab('games');
}

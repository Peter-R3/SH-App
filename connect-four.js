const CONNECT_FOUR_ROWS = 6;
const CONNECT_FOUR_COLUMNS = 7;

let connectFourState = null;
let connectFourRef = null;
let connectFourHandler = null;

function launchConnectFour() {
    if (!localPlayer) return;
    setActiveAppView('connect-four');
    document.querySelectorAll('.screen').forEach(screen => screen.classList.add('hidden'));
    document.getElementById('connect-four-screen')?.classList.remove('hidden');
    applyThemeToScreen('connect-four-screen', 'connect-four-header-shell', 'connect-four-nav-shell');
    refreshSharedHeader('connect-four');
    subscribeConnectFour();

    database.ref('games/connectFour/current').transaction(current => {
        if (!current) return createConnectFourMatch();
        if (current.status === 'finished') return current;
        current.players = current.players || {};
        if (!current.players[localPlayer]) current.players[localPlayer] = true;
        if (current.status === 'waiting' && current.players.Peter && current.players.Jadey) {
            current.status = 'active';
            current.turn = Math.random() < 0.5 ? 'Peter' : 'Jadey';
            current.startedAt = Date.now();
        }
        return current;
    }).then(result => {
        const state = result.snapshot?.val?.();
        if (state?.status === 'waiting' && !state.inviteSent) sendConnectFourInvite();
    });
}

function createConnectFourMatch() {
    return {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        status: 'waiting',
        players: { [localPlayer]: true },
        board: Array(CONNECT_FOUR_ROWS * CONNECT_FOUR_COLUMNS).fill(''),
        turn: null,
        winner: null,
        winningCells: [],
        lastMove: null,
        inviteSent: false,
        createdAt: Date.now()
    };
}

function subscribeConnectFour() {
    stopConnectFourSubscription();
    connectFourRef = database.ref('games/connectFour/current');
    connectFourHandler = snapshot => {
        connectFourState = snapshot.val();
        renderConnectFour();
    };
    connectFourRef.on('value', connectFourHandler);
}

function stopConnectFourSubscription() {
    if (connectFourRef && connectFourHandler && connectFourRef.off) {
        connectFourRef.off('value', connectFourHandler);
    }
    connectFourRef = null;
    connectFourHandler = null;
}

function sendConnectFourInvite() {
    database.ref('games/connectFour/current/inviteSent').transaction(current => {
        if (current) return;
        return true;
    }, (error, committed) => {
        if (error || !committed) return;
        database.ref('notifications').push({
            type: 'Connect 4',
            action: 'join-connect-four',
            sender: localPlayer,
            recipient: otherPlayer(localPlayer),
            body: `${playerProfiles[localPlayer]?.nickname || localPlayer} wants to play Connect 4`,
            createdAt: Date.now(),
            readBy: {}
        });
    });
}

function renderConnectFour() {
    const board = document.getElementById('connect-four-board');
    const controls = document.getElementById('connect-four-controls');
    const turns = document.getElementById('connect-four-turns');
    if (!board || !controls || !turns) return;
    if (!connectFourState) {
        setConnectFourStatus('Preparing match...');
        return;
    }

    const status = connectFourState.status;
    if (status === 'waiting') {
        setConnectFourStatus('Waiting for the other player...');
    } else if (status === 'active') {
        setConnectFourStatus(connectFourState.turn === localPlayer
            ? 'Your turn: choose a column'
            : `Waiting for ${playerProfiles[otherPlayer(localPlayer)]?.nickname || otherPlayer(localPlayer)}...`);
    } else if (connectFourState.abandonedBy) {
        setConnectFourStatus(connectFourState.abandonedBy === localPlayer
            ? 'Match abandoned.'
            : `${playerProfiles[connectFourState.abandonedBy]?.nickname || connectFourState.abandonedBy} abandoned the match.`);
    } else if (connectFourState.winner === 'draw') {
        setConnectFourStatus('Draw: the board is full.');
    } else {
        setConnectFourStatus(connectFourState.winner === localPlayer ? 'You connected four!' : 'The other player connected four.');
    }

    turns.innerHTML = ['Peter', 'Jadey'].map(player => `
        <div class="connect-four-player ${connectFourState.turn === player && status === 'active' ? 'active' : ''}">
            <span class="connect-four-token token-${player.toLowerCase()}"></span>
            <strong>${escapeHtml(playerProfiles[player]?.nickname || player)}</strong>
        </div>
    `).join('');

    const winningCells = new Set(connectFourState.winningCells || []);
    const boardValues = connectFourState.board || [];
    board.innerHTML = Array.from({ length: CONNECT_FOUR_ROWS * CONNECT_FOUR_COLUMNS }, (_, index) => {
        const player = boardValues[index];
        const column = index % CONNECT_FOUR_COLUMNS;
        const canDrop = status === 'active' && connectFourState.turn === localPlayer &&
            !boardValues[column];
        const classes = ['connect-four-cell'];
        if (player) classes.push(`token-${player.toLowerCase()}`);
        if (winningCells.has(index)) classes.push('winning-token');
        if (connectFourState.lastMove !== null && connectFourState.lastMove !== undefined &&
            Number(connectFourState.lastMove) === index) classes.push('last-token');
        return `<button class="${classes.join(' ')}" ${canDrop ? `onclick="dropConnectFourToken(${column})"` : 'disabled'} aria-label="Column ${column + 1}"></button>`;
    }).join('');

    controls.innerHTML = status === 'finished'
        ? '<button class="primary" onclick="startNewConnectFourMatch()">New match</button>'
        : '<button class="danger" onclick="abandonConnectFourMatch()">Abandon match</button>';
}

function setConnectFourStatus(message) {
    const status = document.getElementById('connect-four-status');
    if (status) status.innerText = message;
}

function dropConnectFourToken(column) {
    let result = null;
    database.ref('games/connectFour/current').transaction(current => {
        if (!current || current.status !== 'active' || current.turn !== localPlayer) return;
        current.board = current.board || Array(CONNECT_FOUR_ROWS * CONNECT_FOUR_COLUMNS).fill('');
        let targetIndex = -1;
        for (let row = CONNECT_FOUR_ROWS - 1; row >= 0; row -= 1) {
            const index = row * CONNECT_FOUR_COLUMNS + column;
            if (!current.board[index]) {
                targetIndex = index;
                break;
            }
        }
        if (targetIndex < 0) return;
        current.board[targetIndex] = localPlayer;
        current.lastMove = targetIndex;
        const winningCells = findConnectFourWin(current.board, targetIndex, localPlayer);
        const draw = !winningCells.length && current.board.every(Boolean);
        result = { targetIndex, winningCells, draw, opponent: otherPlayer(localPlayer) };
        if (winningCells.length) {
            current.status = 'finished';
            current.winner = localPlayer;
            current.winningCells = winningCells;
            current.completedAt = Date.now();
        } else if (draw) {
            current.status = 'finished';
            current.winner = 'draw';
            current.completedAt = Date.now();
        } else {
            current.turn = result.opponent;
        }
        return current;
    }, (error, committed) => {
        if (error || !committed || !result) return;
        database.ref(`stats/connectFour/${localPlayer}/tokensPlaced`).transaction(value => (value || 0) + 1);
        if (result.winningCells.length) {
            recordConnectFourResult(localPlayer, result.opponent);
            sendConnectFourNotification(result.opponent, `${playerProfiles[localPlayer]?.nickname || localPlayer} won the Connect 4 match`);
        } else if (result.draw) {
            recordConnectFourDraw();
            sendConnectFourNotification(result.opponent, 'Your Connect 4 match ended in a draw');
        } else {
            sendConnectFourNotification(result.opponent, `${playerProfiles[localPlayer]?.nickname || localPlayer} finished their turn in Connect 4`);
        }
    });
}

function findConnectFourWin(board, index, player) {
    const row = Math.floor(index / CONNECT_FOUR_COLUMNS);
    const column = index % CONNECT_FOUR_COLUMNS;
    const directions = [[0, 1], [1, 0], [1, 1], [1, -1]];
    for (const [rowStep, columnStep] of directions) {
        const cells = [index];
        for (const sign of [-1, 1]) {
            for (let distance = 1; distance < 4; distance += 1) {
                const nextRow = row + rowStep * distance * sign;
                const nextColumn = column + columnStep * distance * sign;
                if (
                    nextRow < 0 || nextRow >= CONNECT_FOUR_ROWS ||
                    nextColumn < 0 || nextColumn >= CONNECT_FOUR_COLUMNS
                ) break;
                const nextIndex = nextRow * CONNECT_FOUR_COLUMNS + nextColumn;
                if (board[nextIndex] !== player) break;
                cells.push(nextIndex);
            }
        }
        if (cells.length >= 4) return cells.sort((a, b) => a - b);
    }
    return [];
}

function sendConnectFourNotification(recipient, body) {
    sendAppNotification({
        type: 'Connect 4',
        action: 'check-connect-four',
        sender: localPlayer,
        recipient,
        body,
        createdAt: Date.now(),
        readBy: {}
    }, 'connect-four');
}

function recordConnectFourResult(winner, loser) {
    database.ref(`stats/connectFour/${winner}/wins`).transaction(value => (value || 0) + 1);
    database.ref(`stats/connectFour/${loser}/losses`).transaction(value => (value || 0) + 1);
    [winner, loser].forEach(player => {
        database.ref(`stats/connectFour/${player}/gamesPlayed`).transaction(value => (value || 0) + 1);
    });
}

function recordConnectFourDraw() {
    ['Peter', 'Jadey'].forEach(player => {
        database.ref(`stats/connectFour/${player}/draws`).transaction(value => (value || 0) + 1);
        database.ref(`stats/connectFour/${player}/gamesPlayed`).transaction(value => (value || 0) + 1);
    });
}

function abandonConnectFourMatch() {
    if (!window.confirm('Abandon this Connect 4 match?')) return;
    let result = null;
    database.ref('games/connectFour/current').transaction(current => {
        if (!current || current.status === 'finished' || !current.players?.[localPlayer]) return;
        const opponent = otherPlayer(localPlayer);
        const joined = Boolean(current.players?.[opponent]);
        const counted = current.status === 'active' && joined;
        current.status = 'finished';
        current.winner = counted ? opponent : null;
        current.abandonedBy = localPlayer;
        current.completedAt = Date.now();
        result = { opponent, joined, counted };
        return current;
    }, (error, committed) => {
        if (error || !committed || !result) return;
        if (result.counted) recordConnectFourResult(result.opponent, localPlayer);
        if (result.joined) {
            sendConnectFourNotification(result.opponent, `${playerProfiles[localPlayer]?.nickname || localPlayer} abandoned the Connect 4 match`);
        }
    });
}

function startNewConnectFourMatch() {
    if (!window.confirm('Start a new Connect 4 match?')) return;
    database.ref('games/connectFour/current').set(createConnectFourMatch()).then(sendConnectFourInvite);
}

function renderConnectFourStats() {
    const container = document.getElementById('connect-four-stats-content');
    if (!container) return;
    container.innerHTML = ['Peter', 'Jadey'].map(player => {
        const values = latestStats?.connectFour?.[player] || {};
        return `<section class="connect-four-stat-card ${player.toLowerCase()}">
            <h3>${escapeHtml(playerProfiles[player]?.nickname || player)}</h3>
            <div><span>Wins</span><strong>${values.wins || 0}</strong></div>
            <div><span>Losses</span><strong>${values.losses || 0}</strong></div>
            <div><span>Draws</span><strong>${values.draws || 0}</strong></div>
            <div><span>Games</span><strong>${values.gamesPlayed || 0}</strong></div>
            <div><span>Tokens placed</span><strong>${values.tokensPlaced || 0}</strong></div>
        </section>`;
    }).join('');
}

function exitConnectFour() {
    stopConnectFourSubscription();
    switchTab('games');
}

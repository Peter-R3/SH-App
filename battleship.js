const BATTLESHIP_SIZE = 8;
const BATTLESHIP_FLEET = [
    { id: 'carrier', name: 'Carrier', size: 4 },
    { id: 'cruiser', name: 'Cruiser', size: 3 },
    { id: 'submarine', name: 'Submarine', size: 3 },
    { id: 'destroyer', name: 'Destroyer', size: 2 },
    { id: 'patrol', name: 'Patrol Boat', size: 2 }
];

let battleshipState = null;
let battleshipView = 'enemy';
let battleshipRef = null;
let battleshipHandler = null;
let battleshipLastStatus = null;

function launchBattleship() {
    if (!localPlayer) return;
    document.querySelectorAll('.screen').forEach(screen => screen.classList.add('hidden'));
    document.getElementById('battleship-screen')?.classList.remove('hidden');
    applyThemeToScreen('battleship-screen', 'battleship-header-shell', 'battleship-nav-shell');
    refreshSharedHeader('battleship');
    setBattleshipStatus('Preparing fleet...');
    subscribeBattleship();

    database.ref('games/battleship/current').transaction(current => {
        if (!current) return createBattleshipMatch();
        if (current.status === 'finished') return current;
        current.players = current.players || {};
        current.boards = current.boards || {};
        current.ready = current.ready || {};
        if (!current.players[localPlayer]) {
            current.players[localPlayer] = true;
            current.boards[localPlayer] = createBattleshipBoard();
        }
        return current;
    }).then(result => {
        const state = result.snapshot?.val?.();
        if (
            state?.status === 'placement' &&
            state.players?.[localPlayer] &&
            !state.players?.[otherPlayer(localPlayer)] &&
            !state.inviteSent
        ) {
            sendBattleshipInvite();
        }
    });
}

function createBattleshipMatch() {
    return {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        status: 'placement',
        players: { [localPlayer]: true },
        boards: { [localPlayer]: createBattleshipBoard() },
        ready: {},
        turn: null,
        winner: null,
        inviteSent: false,
        createdAt: Date.now()
    };
}

function createBattleshipBoard() {
    return {
        ships: randomBattleshipFleet(),
        shotsReceived: {}
    };
}

function randomBattleshipFleet() {
    const occupied = new Set();
    return BATTLESHIP_FLEET.map(ship => {
        for (let attempt = 0; attempt < 500; attempt += 1) {
            const horizontal = Math.random() < 0.5;
            const maxRow = horizontal ? BATTLESHIP_SIZE - 1 : BATTLESHIP_SIZE - ship.size;
            const maxCol = horizontal ? BATTLESHIP_SIZE - ship.size : BATTLESHIP_SIZE - 1;
            const row = Math.floor(Math.random() * (maxRow + 1));
            const col = Math.floor(Math.random() * (maxCol + 1));
            const cells = Array.from({ length: ship.size }, (_, index) =>
                (row + (horizontal ? 0 : index)) * BATTLESHIP_SIZE + col + (horizontal ? index : 0)
            );
            if (cells.some(cell => occupied.has(cell))) continue;
            cells.forEach(cell => occupied.add(cell));
            return { ...ship, cells };
        }
        throw new Error('Could not place Battleship fleet.');
    });
}

function subscribeBattleship() {
    stopBattleshipSubscription();
    battleshipRef = database.ref('games/battleship/current');
    battleshipHandler = snapshot => {
        battleshipState = snapshot.val();
        renderBattleship();
    };
    battleshipRef.on('value', battleshipHandler);
}

function stopBattleshipSubscription() {
    if (battleshipRef && battleshipHandler && battleshipRef.off) {
        battleshipRef.off('value', battleshipHandler);
    }
    battleshipRef = null;
    battleshipHandler = null;
    battleshipLastStatus = null;
}

function sendBattleshipInvite() {
    database.ref('games/battleship/current/inviteSent').transaction(current => {
        if (current) return;
        return true;
    }, (error, committed) => {
        if (error || !committed) return;
        database.ref('notifications').push({
            type: 'Battleship',
            action: 'join-battleship',
            sender: localPlayer,
            recipient: otherPlayer(localPlayer),
            body: `${playerProfiles[localPlayer]?.nickname || localPlayer} is preparing a fleet`,
            createdAt: Date.now(),
            readBy: {}
        });
    });
}

function renderBattleship() {
    const board = document.getElementById('battleship-board');
    const controls = document.getElementById('battleship-controls');
    const toggle = document.getElementById('battleship-view-toggle');
    if (!board || !controls || !toggle) return;

    if (!battleshipState?.boards?.[localPlayer]) {
        setBattleshipStatus('Waiting for fleet data...');
        board.innerHTML = '';
        controls.innerHTML = '';
        return;
    }

    const status = battleshipState.status;
    if (status === 'placement') {
        battleshipView = 'own';
        battleshipLastStatus = status;
        toggle.classList.add('hidden');
        setBattleshipStatus(battleshipState.ready?.[localPlayer]
            ? 'Fleet locked. Waiting for the other player...'
            : 'Position your fleet');
        renderBattleshipFleet(localPlayer, true);
        renderBattleshipBoard('own');
        controls.innerHTML = battleshipState.ready?.[localPlayer]
            ? '<button disabled>Fleet ready</button>'
            : '<button onclick="shuffleBattleshipFleet()">Shuffle fleet</button><button class="primary" onclick="readyBattleshipFleet()">Ready</button>';
        return;
    }

    toggle.classList.remove('hidden');
    if (status === 'battle') {
        if (battleshipLastStatus !== 'battle') battleshipView = 'enemy';
        battleshipLastStatus = status;
        syncBattleshipViewToggle();
        const myTurn = battleshipState.turn === localPlayer;
        setBattleshipStatus(myTurn ? 'Your turn: choose a target' : `Waiting for ${playerProfiles[otherPlayer(localPlayer)]?.nickname || otherPlayer(localPlayer)}...`);
        renderBattleshipFleet(battleshipView === 'own' ? localPlayer : otherPlayer(localPlayer), battleshipView === 'own');
        renderBattleshipBoard(battleshipView);
        controls.innerHTML = '';
        return;
    }

    const won = battleshipState.winner === localPlayer;
    setBattleshipStatus(won ? 'Victory! Enemy fleet destroyed.' : 'Defeat. Your fleet was sunk.');
    battleshipView = 'enemy';
    battleshipLastStatus = status;
    syncBattleshipViewToggle();
    renderBattleshipFleet(otherPlayer(localPlayer), false);
    renderBattleshipBoard('enemy');
    controls.innerHTML = `<button class="primary" onclick="startNewBattleshipMatch()">New match</button>`;
}

function setBattleshipStatus(message) {
    const element = document.getElementById('battleship-status');
    if (element) element.innerText = message;
}

function setBattleshipView(view) {
    battleshipView = view;
    syncBattleshipViewToggle();
    renderBattleship();
}

function syncBattleshipViewToggle() {
    document.getElementById('battleship-enemy-tab')?.classList.toggle('active', battleshipView === 'enemy');
    document.getElementById('battleship-own-tab')?.classList.toggle('active', battleshipView === 'own');
}

function renderBattleshipFleet(player, revealNames) {
    const element = document.getElementById('battleship-fleet');
    const board = battleshipState?.boards?.[player];
    if (!element || !board) return;
    element.innerHTML = board.ships.map(ship => {
        const sunk = isBattleshipShipSunk(board, ship);
        return `<span class="${sunk ? 'sunk' : ''}">${revealNames ? ship.name : ship.size} ${'&bull;'.repeat(ship.size)}</span>`;
    }).join('');
}

function renderBattleshipBoard(view) {
    const element = document.getElementById('battleship-board');
    if (!element) return;
    const targetPlayer = view === 'own' ? localPlayer : otherPlayer(localPlayer);
    const board = battleshipState?.boards?.[targetPlayer];
    if (!board) {
        element.innerHTML = '<div class="battleship-waiting">Waiting for opponent...</div>';
        return;
    }

    const shipByCell = {};
    board.ships.forEach(ship => ship.cells.forEach(cell => { shipByCell[cell] = ship; }));
    element.innerHTML = Array.from({ length: BATTLESHIP_SIZE * BATTLESHIP_SIZE }, (_, index) => {
        const shot = board.shotsReceived?.[index];
        const ship = shipByCell[index];
        const classes = ['battleship-cell'];
        if (view === 'own' && ship) classes.push('ship');
        if (shot?.hit) classes.push('hit');
        if (shot && !shot.hit) classes.push('miss');
        if (shot?.hit && ship && isBattleshipShipSunk(board, ship)) classes.push('sunk-cell');
        const canFire = view === 'enemy' && battleshipState.status === 'battle' && battleshipState.turn === localPlayer && !shot;
        return `<button type="button" class="${classes.join(' ')}" ${canFire ? `onclick="fireBattleshipShot(${index})"` : 'disabled'} aria-label="Grid cell ${index + 1}">${shot?.hit ? '&times;' : shot ? '&bull;' : ''}</button>`;
    }).join('');
}

function isBattleshipShipSunk(board, ship) {
    return ship.cells.every(cell => board.shotsReceived?.[cell]?.hit);
}

function shuffleBattleshipFleet() {
    database.ref('games/battleship/current').transaction(current => {
        if (!current || current.status !== 'placement' || current.ready?.[localPlayer]) return;
        current.boards[localPlayer] = createBattleshipBoard();
        return current;
    });
}

function readyBattleshipFleet() {
    database.ref('games/battleship/current').transaction(current => {
        if (!current || current.status !== 'placement' || !current.boards?.[localPlayer]) return;
        current.ready = current.ready || {};
        current.ready[localPlayer] = true;
        if (current.ready.Peter && current.ready.Jadey) {
            current.status = 'battle';
            current.turn = Math.random() < 0.5 ? 'Peter' : 'Jadey';
            current.startedAt = Date.now();
        }
        return current;
    });
}

function fireBattleshipShot(index) {
    let result = null;
    database.ref('games/battleship/current').transaction(current => {
        if (!current || current.status !== 'battle' || current.turn !== localPlayer) return;
        const target = otherPlayer(localPlayer);
        const board = current.boards?.[target];
        if (!board || board.shotsReceived?.[index]) return;
        const ship = board.ships.find(item => item.cells.includes(index));
        board.shotsReceived = board.shotsReceived || {};
        board.shotsReceived[index] = { hit: Boolean(ship), shipId: ship?.id || null, firedBy: localPlayer };
        const sunk = ship ? ship.cells.every(cell => board.shotsReceived?.[cell]?.hit) : false;
        const allSunk = board.ships.every(item => item.cells.every(cell => board.shotsReceived?.[cell]?.hit));
        result = { hit: Boolean(ship), sunk, allSunk, shipName: ship?.name || null, target };
        if (allSunk) {
            current.status = 'finished';
            current.winner = localPlayer;
            current.completedAt = Date.now();
        } else {
            current.turn = target;
        }
        return current;
    }, (error, committed) => {
        if (error || !committed || !result) return;
        database.ref(`stats/battleship/${localPlayer}/shots`).transaction(value => (value || 0) + 1);
        if (result.hit) database.ref(`stats/battleship/${localPlayer}/hits`).transaction(value => (value || 0) + 1);
        if (result.sunk) database.ref(`stats/battleship/${localPlayer}/shipsSunk`).transaction(value => (value || 0) + 1);
        if (result.allSunk) {
            recordBattleshipResult(localPlayer, result.target);
            database.ref('notifications').push({
                type: 'Battleship',
                action: 'check-battleship',
                sender: localPlayer,
                recipient: result.target,
                body: `${playerProfiles[localPlayer]?.nickname || localPlayer} won the Battleship match`,
                createdAt: Date.now(),
                readBy: {}
            });
        }
    });
}

function recordBattleshipResult(winner, loser) {
    database.ref(`stats/battleship/${winner}/wins`).transaction(value => (value || 0) + 1);
    database.ref(`stats/battleship/${loser}/losses`).transaction(value => (value || 0) + 1);
    [winner, loser].forEach(player => {
        database.ref(`stats/battleship/${player}/gamesPlayed`).transaction(value => (value || 0) + 1);
    });
}

function startNewBattleshipMatch() {
    if (!window.confirm('Start a new Battleship match?')) return;
    database.ref('games/battleship/current').set(createBattleshipMatch()).then(sendBattleshipInvite);
}

function renderBattleshipStats() {
    const container = document.getElementById('battleship-stats-content');
    if (!container) return;
    container.innerHTML = ['Peter', 'Jadey'].map(player => {
        const values = latestStats?.battleship?.[player] || {};
        const accuracy = values.shots ? Math.round(((values.hits || 0) / values.shots) * 100) : 0;
        return `<section class="battleship-stat-card ${player.toLowerCase()}">
            <h3>${player}</h3>
            <div><span>Wins</span><strong>${values.wins || 0}</strong></div>
            <div><span>Losses</span><strong>${values.losses || 0}</strong></div>
            <div><span>Games</span><strong>${values.gamesPlayed || 0}</strong></div>
            <div><span>Shots</span><strong>${values.shots || 0}</strong></div>
            <div><span>Hits</span><strong>${values.hits || 0}</strong></div>
            <div><span>Accuracy</span><strong>${accuracy}%</strong></div>
            <div><span>Ships sunk</span><strong>${values.shipsSunk || 0}</strong></div>
        </section>`;
    }).join('');
}

function exitBattleship() {
    stopBattleshipSubscription();
    switchTab('games');
}

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
let selectedBattleshipShipId = null;

function launchBattleship() {
    if (!localPlayer) return;
    setActiveAppView('battleship');
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
        current.present = current.present || {};
        current.present[localPlayer] = Date.now();
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
        present: { [localPlayer]: Date.now() },
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
    selectedBattleshipShipId = null;
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
            : selectedBattleshipShipId
                ? 'Tap a grid cell to move the selected ship'
                : 'Select a ship, then tap the grid to position it');
        renderBattleshipFleet(localPlayer, true);
        renderBattleshipBoard('own');
        controls.innerHTML = battleshipState.ready?.[localPlayer]
            ? '<button disabled>Fleet ready</button><button class="danger" onclick="abandonBattleshipMatch()">Abandon</button>'
            : '<button onclick="shuffleBattleshipFleet()">Shuffle</button><button onclick="rotateSelectedBattleshipShip()" ' +
                `${selectedBattleshipShipId ? '' : 'disabled'}>Rotate</button><button class="primary" onclick="readyBattleshipFleet()">Ready</button>` +
                '<button class="danger" onclick="abandonBattleshipMatch()">Abandon</button>';
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
        controls.innerHTML = '<button class="danger full-width" onclick="abandonBattleshipMatch()">Abandon match</button>';
        return;
    }

    const won = battleshipState.winner === localPlayer;
    const abandoned = battleshipState.abandonedBy;
    setBattleshipStatus(abandoned
        ? abandoned === localPlayer
            ? 'Match abandoned.'
            : `${playerProfiles[abandoned]?.nickname || abandoned} abandoned the match.`
        : won
            ? 'Victory! Enemy fleet destroyed.'
            : 'Defeat. Your fleet was sunk.');
    const finalView = battleshipState.boards?.[otherPlayer(localPlayer)] ? 'enemy' : 'own';
    battleshipView = finalView;
    battleshipLastStatus = status;
    toggle.classList.toggle('hidden', finalView === 'own');
    syncBattleshipViewToggle();
    renderBattleshipFleet(finalView === 'enemy' ? otherPlayer(localPlayer) : localPlayer, finalView === 'own');
    renderBattleshipBoard(finalView);
    controls.innerHTML = '<button class="primary full-width" onclick="startNewBattleshipMatch()">New match</button>';
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
        const selectable = battleshipState.status === 'placement' &&
            player === localPlayer && !battleshipState.ready?.[localPlayer];
        const selected = selectedBattleshipShipId === ship.id;
        const label = `${ship.name} ${'&bull;'.repeat(ship.size)}`;
        return selectable
            ? `<button class="fleet-ship ship-${ship.id} ${selected ? 'selected' : ''}" onclick="selectBattleshipShip('${ship.id}')">${label}</button>`
            : `<span class="fleet-ship ship-${ship.id} ${sunk ? 'sunk' : ''}">${label}</span>`;
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
        if (view === 'own' && ship) classes.push('ship', `ship-${ship.id}`);
        if (view === 'own' && ship?.id === selectedBattleshipShipId) classes.push('selected-ship');
        if (shot?.hit) classes.push('hit');
        if (shot && !shot.hit) classes.push('miss');
        if (shot?.hit && ship && isBattleshipShipSunk(board, ship)) classes.push('sunk-cell');
        const canPlace = view === 'own' && battleshipState.status === 'placement' &&
            !battleshipState.ready?.[localPlayer] && selectedBattleshipShipId;
        const canFire = view === 'enemy' && battleshipState.status === 'battle' &&
            battleshipState.turn === localPlayer && !shot;
        const action = canFire
            ? `onclick="fireBattleshipShot(${index})"`
            : canPlace
                ? `onclick="moveSelectedBattleshipShip(${index})"`
                : 'disabled';
        return `<button type="button" class="${classes.join(' ')}" ${action} aria-label="Grid cell ${index + 1}">${shot?.hit ? '&times;' : shot ? '&bull;' : ''}</button>`;
    }).join('');
}

function isBattleshipShipSunk(board, ship) {
    return ship.cells.every(cell => board.shotsReceived?.[cell]?.hit);
}

function shuffleBattleshipFleet() {
    selectedBattleshipShipId = null;
    database.ref('games/battleship/current').transaction(current => {
        if (!current || current.status !== 'placement' || current.ready?.[localPlayer]) return;
        current.boards[localPlayer] = createBattleshipBoard();
        return current;
    });
}

function selectBattleshipShip(shipId) {
    if (battleshipState?.status !== 'placement' || battleshipState.ready?.[localPlayer]) return;
    selectedBattleshipShipId = selectedBattleshipShipId === shipId ? null : shipId;
    renderBattleship();
}

function battleshipShipOrientation(ship) {
    return ship.cells.length > 1 && ship.cells[1] - ship.cells[0] === 1 ? 'horizontal' : 'vertical';
}

function battleshipCellsFromStart(startIndex, size, orientation) {
    const row = Math.floor(startIndex / BATTLESHIP_SIZE);
    const col = startIndex % BATTLESHIP_SIZE;
    if (orientation === 'horizontal' && col + size > BATTLESHIP_SIZE) return null;
    if (orientation === 'vertical' && row + size > BATTLESHIP_SIZE) return null;
    return Array.from({ length: size }, (_, offset) =>
        startIndex + (orientation === 'horizontal' ? offset : offset * BATTLESHIP_SIZE)
    );
}

function updateSelectedBattleshipShip(startIndex, rotate) {
    let moved = false;
    database.ref('games/battleship/current').transaction(current => {
        if (!current || current.status !== 'placement' || current.ready?.[localPlayer] || !selectedBattleshipShipId) return;
        const board = current.boards?.[localPlayer];
        const ship = board?.ships?.find(item => item.id === selectedBattleshipShipId);
        if (!ship) return;
        const currentOrientation = battleshipShipOrientation(ship);
        const orientation = rotate
            ? (currentOrientation === 'horizontal' ? 'vertical' : 'horizontal')
            : currentOrientation;
        const cells = battleshipCellsFromStart(startIndex, ship.size, orientation);
        if (!cells) return;
        const occupied = new Set(board.ships
            .filter(item => item.id !== ship.id)
            .flatMap(item => item.cells));
        if (cells.some(cell => occupied.has(cell))) return;
        ship.cells = cells;
        moved = true;
        return current;
    }, (error, committed) => {
        if (!error && (!committed || !moved)) setBattleshipStatus('That position is blocked or outside the grid');
    });
}

function moveSelectedBattleshipShip(startIndex) {
    updateSelectedBattleshipShip(startIndex, false);
}

function rotateSelectedBattleshipShip() {
    const ship = battleshipState?.boards?.[localPlayer]?.ships?.find(item => item.id === selectedBattleshipShipId);
    if (!ship) return;
    updateSelectedBattleshipShip(ship.cells[0], true);
}

function readyBattleshipFleet() {
    selectedBattleshipShipId = null;
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
        } else if (!ship) {
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
            sendAppNotification({
                type: 'Battleship',
                action: 'check-battleship',
                sender: localPlayer,
                recipient: result.target,
                body: `${playerProfiles[localPlayer]?.nickname || localPlayer} won the Battleship match`,
                createdAt: Date.now(),
                readBy: {}
            }, 'battleship');
        } else if (!result.hit) {
            sendBattleshipTurnNotification(result.target);
        }
    });
}

function sendBattleshipTurnNotification(recipient) {
    sendAppNotification({
        type: 'Battleship',
        action: 'check-battleship',
        sender: localPlayer,
        recipient,
        body: `${playerProfiles[localPlayer]?.nickname || localPlayer} finished their turn in Battleship`,
        createdAt: Date.now(),
        readBy: {}
    }, 'battleship');
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

function abandonBattleshipMatch() {
    if (!window.confirm('Abandon this Battleship match?')) return;
    let result = null;
    database.ref('games/battleship/current').transaction(current => {
        if (!current || current.status === 'finished' || !current.players?.[localPlayer]) return;
        const opponent = otherPlayer(localPlayer);
        const joined = Boolean(current.players?.[opponent]);
        const counted = current.status === 'battle' && joined;
        current.status = 'finished';
        current.winner = counted ? opponent : null;
        current.abandonedBy = localPlayer;
        current.completedAt = Date.now();
        result = { opponent, counted, joined };
        return current;
    }, (error, committed) => {
        if (error || !committed || !result) return;
        if (result.counted) recordBattleshipResult(result.opponent, localPlayer);
        if (result.joined) {
            sendAppNotification({
                type: 'Battleship',
                action: 'check-battleship',
                sender: localPlayer,
                recipient: result.opponent,
                body: `${playerProfiles[localPlayer]?.nickname || localPlayer} abandoned the Battleship match`,
                createdAt: Date.now(),
                readBy: {}
            }, 'battleship');
        }
    });
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

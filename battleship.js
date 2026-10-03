const BATTLESHIP_SIZE = 8;
const BATTLESHIP_DRAG_CELL = 34;
const BATTLESHIP_DRAG_GAP = 3;
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
let battleshipFeedbackState = null;
let battleshipLatestShot = null;
let battleshipCueTimer = null;
let battleshipAutoView = false;

function openBattleshipSettings() {
    openSharedGameMenu('battleship', 'settings');
    const host = document.querySelector('#battleship-screen .shared-submenu-content');
    host.innerHTML = '<label class="battleship-auto-setting"><input class="app-checkbox" type="checkbox"> Automatically switch waters between turns</label>';
    const input = host.querySelector('input');
    input.checked = battleshipAutoView;
    input.onchange = () => {
        battleshipAutoView = input.checked;
        localStorage.setItem(`battleship-auto-view-${localPlayer}`, String(battleshipAutoView));
        if (battleshipAutoView && battleshipState?.status === 'battle') battleshipView = battleshipState.turn === localPlayer ? 'enemy' : 'own';
        playUiSound('tap');
        renderBattleship();
    };
}

function updateBattleshipFeedback() {
    const state = battleshipState;
    if (!state) return;
    const previous = battleshipFeedbackState;
    const sameMatch = previous?.id === state.id;
    if (!sameMatch) {
        battleshipLatestShot = null;
        const feedback = document.getElementById('battleship-shot-feedback');
        if (feedback) feedback.textContent = '';
    }
    const shots = {};
    for (const [player, board] of Object.entries(state.boards || {})) {
        for (const [cell, shot] of Object.entries(board.shotsReceived || {})) {
            const key = `${player}:${cell}`;
            shots[key] = true;
            if (sameMatch && !previous.shots[key] && activeAppView === 'battleship' && !document.hidden) {
                battleshipLatestShot = { player, cell: Number(cell), until: Date.now() + 1400 };
                const ship = board.ships.find(item => item.id === shot.shipId);
                playUiSound(shot.hit ? ship && isBattleshipShipSunk(board, ship) ? 'ship-sunk' : 'shot-hit' : 'shot-miss');
                const feedback = document.getElementById('battleship-shot-feedback');
                if (feedback) feedback.textContent = `${player === localPlayer ? 'Your fleet' : 'Enemy waters'}: ${String.fromCharCode(65 + Number(cell) % BATTLESHIP_SIZE)}${Math.floor(Number(cell) / BATTLESHIP_SIZE) + 1} - ${shot.hit ? ship && isBattleshipShipSunk(board, ship) ? `${ship.name} sunk!` : 'Hit!' : 'Miss'}`;
            }
        }
    }
    const turnChanged = !sameMatch || previous.turn !== state.turn || previous.status !== state.status;
    if (state.status === 'battle' && turnChanged) {
        if (battleshipAutoView) battleshipView = state.turn === localPlayer ? 'enemy' : 'own';
        if (activeAppView === 'battleship' && !document.hidden) {
            const overlay = document.getElementById('battleship-turn-overlay');
            if (overlay) {
                const text = state.turn === localPlayer ? 'Your turn' : `${playerProfiles[state.turn]?.nickname || state.turn}'s turn`;
                overlay.querySelector('span').textContent = text;
                overlay.querySelector('span').dataset.text = text;
                overlay.style.setProperty('--turn-cue-colour', themeColorFor(state.turn));
                overlay.classList.remove('hidden', 'show-turn-cue');
                void overlay.offsetWidth;
                overlay.classList.add('show-turn-cue');
                clearTimeout(battleshipCueTimer);
                battleshipCueTimer = setTimeout(() => overlay.classList.add('hidden'), 1050);
            }
        }
    }
    battleshipFeedbackState = { id: state.id, turn: state.turn, status: state.status, shots };
}
let selectedBattleshipShipId = null;
let battleshipDragShipId = null;
let battleshipDragPointerId = null;
let battleshipLastTap = { shipId: null, at: 0 };
let battleshipDragOffset = 0;
let battleshipDragGhost = null;
let battleshipDragHoldTimer = null;
let battleshipPendingDrag = null;
let battleshipDragPointer = { clientX: 0, clientY: 0 };

function launchBattleship() {
    if (!localPlayer) return;
    battleshipAutoView = localStorage.getItem(`battleship-auto-view-${localPlayer}`) === 'true';
    const content = document.querySelector('#battleship-screen .battleship-content');
    if (content && !document.getElementById('battleship-turn-overlay')) {
        const overlay = document.createElement('div');
        overlay.id = 'battleship-turn-overlay';
        overlay.className = 'turn-cue-overlay hidden';
        overlay.setAttribute('role', 'status');
        overlay.innerHTML = '<span data-text="Your turn">Your turn</span>';
        content.append(overlay);
        const feedback = document.createElement('p');
        feedback.id = 'battleship-shot-feedback';
        feedback.setAttribute('role', 'status');
        document.getElementById('battleship-board').after(feedback);
    }
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
        ensureBattleshipParticipant(current, localPlayer);
        current.present[localPlayer] = Date.now();
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

function ensureBattleshipParticipant(current, player) {
    current.players = current.players || {};
    current.present = current.present || {};
    current.boards = current.boards || {};
    current.ready = current.ready || {};
    current.players[player] = true;
    if (!current.boards[player]) {
        current.boards[player] = createBattleshipBoard();
        current.ready[player] = false;
    }
    current.boards[player].shotsReceived = current.boards[player].shotsReceived || {};
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
        updateBattleshipFeedback();
        renderBattleship();
        if (['battleship', 'battleship-menu'].includes(activeAppView) && battleshipState?.status === 'placement' && !battleshipState.players?.[localPlayer]) {
            const id = battleshipState.id;
            database.ref('games/battleship/current').transaction(current => {
                if (!current || current.id !== id || current.status !== 'placement') return;
                ensureBattleshipParticipant(current, localPlayer);
                return current;
            }, undefined, false).catch(() => setBattleshipStatus('Could not join. Please retry.'));
        }
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
    battleshipFeedbackState = null;
    battleshipLatestShot = null;
    clearTimeout(battleshipCueTimer);
    document.getElementById('battleship-turn-overlay')?.classList.add('hidden');
    selectedBattleshipShipId = null;
    removeBattleshipDragGhost();
    clearBattleshipPendingDrag();
    battleshipDragShipId = null;
    battleshipDragPointerId = null;
    battleshipDragOffset = 0;
    battleshipLastTap = { shipId: null, at: 0 };
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
    soundForGameResult('battleship', battleshipState);
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
            : 'Hold a ship to move it. Double tap a ship to rotate it.');
        renderBattleshipFleet(localPlayer, true);
        renderBattleshipBoard('own');
        controls.innerHTML = battleshipState.ready?.[localPlayer]
            ? '<button disabled>Fleet ready</button><button class="danger" onclick="abandonBattleshipMatch()">Abandon</button>'
            : '<button onclick="shuffleBattleshipFleet()">Shuffle</button><button class="primary" onclick="readyBattleshipFleet()">Ready</button>' +
                '<button class="danger" onclick="abandonBattleshipMatch()">Abandon</button>';
        return;
    }

    toggle.classList.remove('hidden');
    if (status === 'battle') {
        if (battleshipLastStatus !== 'battle') battleshipView = battleshipAutoView && battleshipState.turn !== localPlayer ? 'own' : 'enemy';
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
    if (battleshipLastStatus !== 'finished') battleshipView = battleshipState.boards?.[otherPlayer(localPlayer)] ? 'enemy' : 'own';
    const finalView = battleshipView;
    battleshipLastStatus = status;
    toggle.classList.toggle('hidden', !battleshipState.boards?.[otherPlayer(localPlayer)]);
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
        const label = `${ship.name} ${'&bull;'.repeat(ship.size)}`;
        return `<span class="fleet-ship ship-${ship.id} ${sunk ? 'sunk' : ''}">${label}</span>`;
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
        if ((view === 'own' || battleshipState.status === 'finished') && ship) classes.push('ship', `ship-${ship.id}`);
        if (battleshipLatestShot?.player === targetPlayer && battleshipLatestShot.cell === index && battleshipLatestShot.until > Date.now()) classes.push('shot-impact');
        if (shot?.hit) classes.push('hit');
        if (shot && !shot.hit) classes.push('miss');
        if (shot?.hit && ship && isBattleshipShipSunk(board, ship)) classes.push('sunk-cell');
        const canFire = view === 'enemy' && battleshipState.status === 'battle' &&
            battleshipState.turn === localPlayer && !shot;
        const placementMode = view === 'own' && battleshipState.status === 'placement' && !battleshipState.ready?.[localPlayer];
        const action = canFire
            ? `onclick="fireBattleshipShot(${index})"`
            : placementMode
                ? ''
                : 'disabled';
        const dragHandlers = placementMode
            ? `data-cell-index="${index}" ${ship ? `data-ship-id="${ship.id}" onpointerdown="startBattleshipBoardDrag(event, '${ship.id}')"` : ''}`
            : '';
        return `<button type="button" class="${classes.join(' ')}" ${dragHandlers} ${action} aria-label="${String.fromCharCode(65 + index % BATTLESHIP_SIZE)}${Math.floor(index / BATTLESHIP_SIZE) + 1}${shot ? shot.hit ? ', hit' : ', miss' : ''}">${shot?.hit ? '&times;' : shot ? '&bull;' : ''}</button>`;
    }).join('');
}

function isBattleshipShipSunk(board, ship) {
    return ship.cells.every(cell => board.shotsReceived?.[cell]?.hit);
}

function shuffleBattleshipFleet() {
    playUiSound('tap');
    selectedBattleshipShipId = null;
    removeBattleshipDragGhost();
    database.ref('games/battleship/current').transaction(current => {
        if (!current || current.status !== 'placement' || current.ready?.[localPlayer]) return;
        current.boards[localPlayer] = createBattleshipBoard();
        return current;
    });
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

function battleshipBuildPlacement(board, ship, startIndex, orientation) {
    const cells = battleshipCellsFromStart(startIndex, ship.size, orientation);
    if (!cells) return null;
    const occupied = new Set(board.ships
        .filter(item => item.id !== ship.id)
        .flatMap(item => item.cells));
    if (cells.some(cell => occupied.has(cell))) return null;
    return cells;
}

function battleshipRotationCandidates(ship, orientation) {
    const cells = ship.cells || [];
    const candidates = new Set([cells[0]]);
    cells.forEach(cell => {
        for (let offset = 0; offset < ship.size; offset += 1) {
            candidates.add(cell - offset * (orientation === 'horizontal' ? 1 : BATTLESHIP_SIZE));
        }
    });
    return Array.from(candidates).filter(index => index >= 0 && index < BATTLESHIP_SIZE * BATTLESHIP_SIZE);
}

function findRotatedBattleshipCells(board, ship) {
    const orientation = battleshipShipOrientation(ship) === 'horizontal' ? 'vertical' : 'horizontal';
    for (const startIndex of battleshipRotationCandidates(ship, orientation)) {
        const cells = battleshipBuildPlacement(board, ship, startIndex, orientation);
        if (cells) return cells;
    }
    return null;
}

function registerBattleshipTap(shipId) {
    const now = Date.now();
    const isDoubleTap = battleshipLastTap.shipId === shipId && now - battleshipLastTap.at < 340;
    battleshipLastTap = { shipId, at: now };
    return isDoubleTap;
}

function startBattleshipBoardDrag(event, shipId) {
    if (battleshipState?.status !== 'placement' || battleshipState.ready?.[localPlayer]) return;
    if (battleshipDragShipId) return;
    if (registerBattleshipTap(shipId)) {
        event.preventDefault();
        clearBattleshipPendingDrag();
        rotateBattleshipShip(shipId);
        return;
    }
    event.preventDefault();
    const board = battleshipState.boards?.[localPlayer];
    const ship = board?.ships?.find(item => item.id === shipId);
    const touchedCell = event.currentTarget?.dataset?.cellIndex;
    if (!ship || touchedCell === undefined) return;
    clearBattleshipPendingDrag();
    battleshipPendingDrag = {
        shipId,
        pointerId: event.pointerId,
        touchedCell: Number(touchedCell),
        clientX: event.clientX,
        clientY: event.clientY,
        target: event.currentTarget
    };
    event.currentTarget?.setPointerCapture?.(event.pointerId);
    battleshipDragHoldTimer = window.setTimeout(() => beginBattleshipShipDrag(), 190);
}

function beginBattleshipShipDrag() {
    if (!battleshipPendingDrag) return;
    const { shipId, pointerId, touchedCell, clientX, clientY } = battleshipPendingDrag;
    const board = battleshipState?.boards?.[localPlayer];
    const ship = board?.ships?.find(item => item.id === shipId);
    if (!ship) {
        clearBattleshipPendingDrag();
        return;
    }
    selectedBattleshipShipId = shipId;
    battleshipDragShipId = shipId;
    battleshipDragPointerId = pointerId;
    battleshipDragOffset = Math.max(0, ship.cells.indexOf(touchedCell));
    createBattleshipDragGhost(ship);
    setBattleshipOriginalVisibility(shipId, false);
    updateBattleshipDragGhost({ clientX, clientY });
}

function handleBattleshipShipDragMove(event) {
    if (battleshipPendingDrag?.pointerId === event.pointerId) {
        battleshipPendingDrag.clientX = event.clientX;
        battleshipPendingDrag.clientY = event.clientY;
    }
    if (!battleshipDragShipId || battleshipDragPointerId !== event.pointerId) return;
    updateBattleshipDragGhost(event);
}

function finishBattleshipShipDrag(event) {
    if (battleshipPendingDrag?.pointerId === event.pointerId && !battleshipDragShipId) {
        clearBattleshipPendingDrag();
        return;
    }
    if (!battleshipDragShipId || battleshipDragPointerId !== event.pointerId) return;
    const shipId = battleshipDragShipId;
    const board = battleshipState?.boards?.[localPlayer];
    const ship = board?.ships?.find(item => item.id === shipId);
    battleshipDragPointer = { clientX: event.clientX, clientY: event.clientY };
    const startIndex = ship ? battleshipDropStartIndex(ship) : null;
    const orientation = ship ? battleshipShipOrientation(ship) : null;
    const cells = Number.isInteger(startIndex) ? battleshipBuildPlacement(board, ship, startIndex, orientation) : null;
    clearBattleshipPendingDrag();
    battleshipDragShipId = null;
    battleshipDragPointerId = null;
    removeBattleshipDragGhost();
    setBattleshipOriginalVisibility(shipId, true);
    if (cells && Number.isInteger(startIndex)) {
        if (ship) ship.cells = cells.slice();
        renderBattleshipBoard('own');
        moveSelectedBattleshipShip(startIndex);
    } else {
        renderBattleshipBoard('own');
        setBattleshipStatus('That position is blocked or outside the grid');
    }
}

function clearBattleshipPendingDrag() {
    if (battleshipDragHoldTimer) window.clearTimeout(battleshipDragHoldTimer);
    battleshipDragHoldTimer = null;
    battleshipPendingDrag = null;
}

function createBattleshipDragGhost(ship) {
    removeBattleshipDragGhost();
    battleshipDragGhost = document.createElement('div');
    battleshipDragGhost.className = `battleship-drag-ghost ${battleshipShipOrientation(ship)}`;
    battleshipDragGhost.setAttribute('aria-hidden', 'true');
    battleshipDragGhost.innerHTML = Array.from({ length: ship.size }, () => `<span class="ship-${ship.id}"></span>`).join('');
    document.body.appendChild(battleshipDragGhost);
}

function updateBattleshipDragGhost(event) {
    if (!battleshipDragGhost) return;
    battleshipDragPointer = { clientX: event.clientX, clientY: event.clientY };
    const ship = battleshipState?.boards?.[localPlayer]?.ships?.find(item => item.id === battleshipDragShipId);
    if (!ship) return;
    const metrics = battleshipDragMetrics(ship, event.clientX, event.clientY, battleshipDragOffset);
    battleshipDragGhost.style.left = `${metrics.centerX}px`;
    battleshipDragGhost.style.top = `${metrics.centerY}px`;
}

function battleshipDragMetrics(ship, pointerX, pointerY, heldSegmentIndex = 0) {
    const orientation = battleshipShipOrientation(ship);
    const step = BATTLESHIP_DRAG_CELL + BATTLESHIP_DRAG_GAP;
    const width = orientation === 'horizontal'
        ? ship.size * BATTLESHIP_DRAG_CELL + (ship.size - 1) * BATTLESHIP_DRAG_GAP
        : BATTLESHIP_DRAG_CELL;
    const height = orientation === 'vertical'
        ? ship.size * BATTLESHIP_DRAG_CELL + (ship.size - 1) * BATTLESHIP_DRAG_GAP
        : BATTLESHIP_DRAG_CELL;
    const heldX = orientation === 'horizontal'
        ? heldSegmentIndex * step + BATTLESHIP_DRAG_CELL / 2
        : BATTLESHIP_DRAG_CELL / 2;
    const heldY = orientation === 'vertical'
        ? heldSegmentIndex * step + BATTLESHIP_DRAG_CELL / 2
        : BATTLESHIP_DRAG_CELL / 2;
    const centerX = pointerX + width / 2 - heldX;
    const centerY = pointerY + height / 2 - heldY;
    return {
        centerX,
        centerY,
        firstSegmentX: centerX - width / 2 + BATTLESHIP_DRAG_CELL / 2,
        firstSegmentY: centerY - height / 2 + BATTLESHIP_DRAG_CELL / 2
    };
}

function battleshipDropStartIndex(ship) {
    if (!ship) return null;
    const metrics = battleshipDragMetrics(ship, battleshipDragPointer.clientX, battleshipDragPointer.clientY, battleshipDragOffset);
    const cell = document.elementFromPoint(metrics.firstSegmentX, metrics.firstSegmentY)?.closest?.('.battleship-cell[data-cell-index]');
    return cell ? Number(cell.dataset.cellIndex) : null;
}

function removeBattleshipDragGhost() {
    battleshipDragGhost?.remove?.();
    battleshipDragGhost = null;
}

function setBattleshipOriginalVisibility(shipId, visible) {
    document.querySelectorAll(`.battleship-cell[data-ship-id="${shipId}"]`).forEach(cell => {
        cell.classList.toggle('dragging-origin', !visible);
    });
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
        const cells = rotate
            ? findRotatedBattleshipCells(board, ship)
            : battleshipBuildPlacement(board, ship, startIndex, orientation);
        if (!cells) return;
        ship.cells = cells;
        moved = true;
        return current;
    }, (error, committed) => {
        if (!error && (!committed || !moved)) setBattleshipStatus('That position is blocked or outside the grid');
        renderBattleshipBoard('own');
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

function rotateBattleshipShip(shipId) {
    if (battleshipState?.status !== 'placement' || battleshipState.ready?.[localPlayer]) return;
    selectedBattleshipShipId = shipId;
    updateSelectedBattleshipShip(0, true);
}

function readyBattleshipFleet() {
    playUiSound('ready');
    selectedBattleshipShipId = null;
    removeBattleshipDragGhost();
    database.ref('games/battleship/current').transaction(current => {
        if (!current || current.status !== 'placement') return;
        ensureBattleshipParticipant(current, localPlayer);
        current.ready = current.ready || {};
        current.ready[localPlayer] = true;
        if (current.ready.Peter && current.ready.Jadey && current.boards?.Peter && current.boards?.Jadey) {
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
    }, (error, committed, snapshot) => {
        if (error || !committed || !result) return;
        database.ref(`stats/battleship/${localPlayer}/shots`).transaction(value => (value || 0) + 1);
        if (result.hit) database.ref(`stats/battleship/${localPlayer}/hits`).transaction(value => (value || 0) + 1);
        if (result.sunk) database.ref(`stats/battleship/${localPlayer}/shipsSunk`).transaction(value => (value || 0) + 1);
        if (result.allSunk) {
            if (typeof recordAchievementMatch === 'function') recordAchievementMatch('battleship', snapshot.val());
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

async function startNewBattleshipMatch() {
    const player = localPlayer;
    const matchKey = JSON.stringify([battleshipState?.id, battleshipState?.roundId, battleshipState?.createdAt, battleshipState?.status]);
    if (!await confirmNewPuzzle('Start a new Battleship match?', 'The current match will end.', 'New match')) return;
    if (localPlayer !== player || matchKey !== JSON.stringify([battleshipState?.id, battleshipState?.roundId, battleshipState?.createdAt, battleshipState?.status])) return;
    database.ref('games/battleship/current').set(createBattleshipMatch()).then(sendBattleshipInvite);
}

async function abandonBattleshipMatch() {
    const player = localPlayer;
    const matchKey = JSON.stringify([battleshipState?.id, battleshipState?.roundId, battleshipState?.createdAt, battleshipState?.status]);
    if (!await confirmNewPuzzle('Abandon this Battleship match?', 'The current match will end.', 'Abandon')) return;
    if (localPlayer !== player || matchKey !== JSON.stringify([battleshipState?.id, battleshipState?.roundId, battleshipState?.createdAt, battleshipState?.status])) return;
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
        clearGameNotifications(['join-battleship', 'check-battleship'], ['Peter', 'Jadey']).then(() => {
            if (!result.joined) return;
            return sendAppNotification({
                type: 'Battleship',
                action: 'check-battleship',
                sender: localPlayer,
                recipient: result.opponent,
                body: `${playerProfiles[localPlayer]?.nickname || localPlayer} abandoned the Battleship match`,
                createdAt: Date.now(),
                readBy: {}
            }, 'battleship');
        });
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

document.addEventListener('pointermove', handleBattleshipShipDragMove);
document.addEventListener('pointerup', finishBattleshipShipDrag);
document.addEventListener('pointercancel', finishBattleshipShipDrag);

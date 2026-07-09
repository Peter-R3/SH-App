const RPS_CHOICES = ['rock', 'paper', 'scissors'];
const RPS_LABELS = { rock: 'Rock', paper: 'Paper', scissors: 'Scissors' };
const RPS_ICONS = { rock: '✊', paper: '✋', scissors: '✌' };

let rpsSettings = { mode: 'versus' };
let rpsState = null;
let rpsRef = null;
let rpsHandler = null;

function rpsSettingsKey() {
    return `rps-settings-${localPlayer || 'unknown'}`;
}

function loadRpsSettings() {
    try {
        const saved = JSON.parse(localStorage.getItem(rpsSettingsKey()) || '{}');
        rpsSettings = { mode: ['versus', 'versus-ai'].includes(saved.mode) ? saved.mode : 'versus' };
    } catch {
        rpsSettings = { mode: 'versus' };
    }
}

function saveRpsSettings() {
    localStorage.setItem(rpsSettingsKey(), JSON.stringify(rpsSettings));
}

function launchRps() {
    if (!localPlayer) return;
    setActiveAppView('rps');
    loadRpsSettings();
    stopRpsSubscription();
    document.querySelectorAll('.screen').forEach(screen => screen.classList.add('hidden'));
    document.getElementById('rps-screen')?.classList.remove('hidden');
    applyThemeToScreen('rps-screen', 'rps-header-shell', 'rps-nav-shell');
    refreshSharedHeader('rps');
    setRpsStatus('Loading round...');
    if (rpsSettings.mode === 'versus-ai') loadRpsAi();
    else loadRpsVersus();
}

function openRpsSettings() {
    setActiveAppView('rps-settings');
    document.querySelectorAll('.screen').forEach(screen => screen.classList.add('hidden'));
    document.getElementById('rps-settings-screen')?.classList.remove('hidden');
    const header = document.getElementById('rps-settings-header');
    if (header) {
        header.classList.remove('header-peter', 'header-jadey');
        header.classList.add(localPlayer === 'Peter' ? 'header-peter' : 'header-jadey');
    }
    document.getElementById('rps-mode').value = rpsSettings.mode;
}

function updateRpsSetting(key, value) {
    if (key === 'mode' && ['versus', 'versus-ai'].includes(value)) rpsSettings.mode = value;
    saveRpsSettings();
}

function createRpsRound(mode = 'versus') {
    return {
        mode,
        status: mode === 'versus' ? 'waiting' : 'active',
        players: mode === 'versus' ? { [localPlayer]: true } : { [localPlayer]: true, Jaylin: true },
        choices: {},
        winner: null,
        inviteSent: false,
        createdAt: Date.now()
    };
}

function rpsAiPath() {
    return `games/rps/ai/${localPlayer}`;
}

function loadRpsAi() {
    database.ref(rpsAiPath()).once('value').then(snapshot => {
        const state = snapshot.val();
        rpsState = state && state.status !== 'finished' ? state : createRpsRound('versus-ai');
        database.ref(rpsAiPath()).set(rpsState);
        renderRps();
    });
}

function loadRpsVersus() {
    subscribeRps();
    database.ref('games/rps/current').transaction(current => {
        if (!current || current.status === 'finished') return createRpsRound('versus');
        current.players = current.players || {};
        current.players[localPlayer] = true;
        if (current.status === 'waiting' && current.players.Peter && current.players.Jadey) {
            current.status = 'active';
            current.startedAt = Date.now();
        }
        return current;
    }).then(result => {
        const state = result.snapshot?.val?.();
        if (state?.status === 'waiting' && !state.inviteSent) sendRpsInvite();
    });
}

function subscribeRps() {
    stopRpsSubscription();
    rpsRef = database.ref('games/rps/current');
    rpsHandler = snapshot => {
        rpsState = snapshot.val();
        renderRps();
    };
    rpsRef.on('value', rpsHandler);
}

function stopRpsSubscription() {
    if (rpsRef && rpsHandler && rpsRef.off) rpsRef.off('value', rpsHandler);
    rpsRef = null;
    rpsHandler = null;
}

function sendRpsInvite() {
    database.ref('games/rps/current/inviteSent').transaction(current => current ? undefined : true, (error, committed) => {
        if (error || !committed) return;
        sendAppNotification({
            type: 'RPS',
            action: 'join-rps',
            sender: localPlayer,
            recipient: otherPlayer(localPlayer),
            body: `${playerProfiles[localPlayer]?.nickname || localPlayer} wants to play RPS`,
            createdAt: Date.now(),
            readBy: {}
        }, 'rps');
    });
}

function renderRps() {
    const choices = document.getElementById('rps-choices');
    const reveal = document.getElementById('rps-reveal');
    const controls = document.getElementById('rps-controls');
    if (!choices || !reveal || !controls || !rpsState) return;
    const aiMode = rpsSettings.mode === 'versus-ai' || rpsState.mode === 'versus-ai';
    if (rpsState.status === 'waiting') setRpsStatus('Waiting for the other player...');
    else if (rpsState.status === 'active') setRpsStatus(rpsState.choices?.[localPlayer] ? `Waiting for ${aiMode ? 'Jaylin' : playerProfiles[otherPlayer(localPlayer)]?.nickname || otherPlayer(localPlayer)}...` : 'Choose your move');
    else if (rpsState.winner === 'draw') setRpsStatus('Draw.');
    else setRpsStatus(rpsState.winner === localPlayer ? 'You won!' : `${aiMode ? 'Jaylin' : 'The other player'} won.`);

    const hasChosen = Boolean(rpsState.choices?.[localPlayer]);
    choices.innerHTML = RPS_CHOICES.map(choice => `
        <button class="rps-choice ${hasChosen && rpsState.choices?.[localPlayer] === choice ? 'selected' : ''}" ${rpsState.status === 'active' && !hasChosen ? `onclick="chooseRps('${choice}')"` : 'disabled'}>
            <span>${RPS_ICONS[choice]}</span><strong>${RPS_LABELS[choice]}</strong>
        </button>
    `).join('');

    const opponent = aiMode ? 'Jaylin' : otherPlayer(localPlayer);
    const showChoices = rpsState.status === 'finished';
    reveal.innerHTML = `
        <div class="rps-reveal-card own-choice ${showChoices ? 'revealed' : ''}"><span>${showChoices ? RPS_ICONS[rpsState.choices?.[localPlayer]] || '?' : hasChosen ? '✓' : '?'}</span><strong>You</strong></div>
        <div class="rps-reveal-card opponent-choice ${showChoices ? 'revealed' : ''}"><span>${showChoices ? RPS_ICONS[rpsState.choices?.[opponent]] || '?' : rpsState.choices?.[opponent] ? '✓' : '?'}</span><strong>${opponent === 'Jaylin' ? 'Jaylin' : playerProfiles[opponent]?.nickname || opponent}</strong></div>
    `;
    controls.innerHTML = rpsState.status === 'finished'
        ? '<button class="primary" onclick="startNewRpsRound()">New round</button>'
        : '<button class="danger" onclick="abandonRpsRound()">Abandon round</button>';
}

function setRpsStatus(message) {
    const status = document.getElementById('rps-status');
    if (status) status.innerText = message;
}

function chooseRps(choice) {
    if (!RPS_CHOICES.includes(choice)) return;
    if (rpsSettings.mode === 'versus-ai') chooseRpsAi(choice);
    else chooseRpsVersus(choice);
}

function chooseRpsAi(choice) {
    const aiChoice = RPS_CHOICES[Math.floor(Math.random() * RPS_CHOICES.length)];
    const winner = resolveRpsWinner(choice, aiChoice, localPlayer, 'Jaylin');
    rpsState = { ...rpsState, status: 'finished', choices: { [localPlayer]: choice, Jaylin: aiChoice }, winner, completedAt: Date.now() };
    database.ref(rpsAiPath()).set(rpsState);
    recordRpsResult(winner, 'versusAi', localPlayer, 'Jaylin');
    renderRps();
}

function chooseRpsVersus(choice) {
    let result = null;
    database.ref('games/rps/current').transaction(current => {
        if (!current || current.status !== 'active' || current.choices?.[localPlayer]) return;
        current.choices = current.choices || {};
        current.choices[localPlayer] = choice;
        const opponent = otherPlayer(localPlayer);
        if (current.choices[opponent]) {
            current.status = 'finished';
            current.winner = resolveRpsWinner(current.choices[localPlayer], current.choices[opponent], localPlayer, opponent);
            current.completedAt = Date.now();
            result = { finished: true, winner: current.winner, opponent };
        } else {
            result = { finished: false, opponent };
        }
        return current;
    }, (error, committed) => {
        if (error || !committed || !result) return;
        if (result.finished) recordRpsResult(result.winner, 'versus', localPlayer, result.opponent);
        sendRpsNotification(result.opponent, result.finished ? 'Your RPS round finished' : `${playerProfiles[localPlayer]?.nickname || localPlayer} chose their RPS move`);
    });
}

function resolveRpsWinner(a, b, playerA, playerB) {
    if (a === b) return 'draw';
    if ((a === 'rock' && b === 'scissors') || (a === 'paper' && b === 'rock') || (a === 'scissors' && b === 'paper')) return playerA;
    return playerB;
}

function sendRpsNotification(recipient, body) {
    sendAppNotification({
        type: 'RPS',
        action: 'check-rps',
        sender: localPlayer,
        recipient,
        body,
        createdAt: Date.now(),
        readBy: {}
    }, 'rps');
}

function recordRpsResult(winner, mode, player, opponent) {
    const players = opponent === 'Jaylin' ? [player] : [player, opponent];
    players.forEach(item => database.ref(`stats/rps/${item}/${mode}/roundsPlayed`).transaction(value => (value || 0) + 1));
    if (winner === 'draw') {
        players.forEach(item => database.ref(`stats/rps/${item}/${mode}/draws`).transaction(value => (value || 0) + 1));
        return;
    }
    if (winner === player) database.ref(`stats/rps/${player}/${mode}/wins`).transaction(value => (value || 0) + 1);
    else database.ref(`stats/rps/${player}/${mode}/losses`).transaction(value => (value || 0) + 1);
    if (opponent !== 'Jaylin') {
        database.ref(`stats/rps/${opponent}/${mode}/${winner === opponent ? 'wins' : 'losses'}`).transaction(value => (value || 0) + 1);
    }
}

function startNewRpsRound() {
    if (!window.confirm('Start a new RPS round?')) return;
    if (rpsSettings.mode === 'versus-ai') database.ref(rpsAiPath()).set(createRpsRound('versus-ai')).then(launchRps);
    else database.ref('games/rps/current').set(createRpsRound('versus')).then(sendRpsInvite);
}

function abandonRpsRound() {
    if (!window.confirm('Abandon this RPS round?')) return;
    if (rpsSettings.mode === 'versus-ai') {
        rpsState = { ...rpsState, status: 'finished', winner: 'Jaylin', abandonedBy: localPlayer, completedAt: Date.now() };
        database.ref(rpsAiPath()).set(rpsState);
        recordRpsResult('Jaylin', 'versusAi', localPlayer, 'Jaylin');
        renderRps();
        return;
    }
    database.ref('games/rps/current').transaction(current => {
        if (!current || current.status === 'finished') return current;
        current.status = 'finished';
        current.winner = otherPlayer(localPlayer);
        current.abandonedBy = localPlayer;
        current.completedAt = Date.now();
        return current;
    }, (error, committed) => {
        if (!error && committed) {
            recordRpsResult(otherPlayer(localPlayer), 'versus', localPlayer, otherPlayer(localPlayer));
            clearGameNotifications(['join-rps', 'check-rps'], ['Peter', 'Jadey']).then(() =>
                sendRpsNotification(otherPlayer(localPlayer), `${playerProfiles[localPlayer]?.nickname || localPlayer} abandoned RPS`)
            );
        }
    });
}

function renderRpsStats() {
    const container = document.getElementById('rps-stats-content');
    if (!container) return;
    container.innerHTML = ['Peter', 'Jadey'].map(player => {
        const sections = ['versus', 'versusAi'].map(mode => {
            const values = latestStats?.rps?.[player]?.[mode] || {};
            return `<div class="duel-stat-mode"><h4>${mode === 'versusAi' ? 'Versus Jaylin' : 'Versus Player'}</h4>
                <div class="stats-row"><span>Wins</span><strong>${values.wins || 0}</strong></div>
                <div class="stats-row"><span>Losses</span><strong>${values.losses || 0}</strong></div>
                <div class="stats-row"><span>Draws</span><strong>${values.draws || 0}</strong></div>
                <div class="stats-row"><span>Rounds</span><strong>${values.roundsPlayed || 0}</strong></div></div>`;
        }).join('');
        return `<section class="duel-stat-card ${player.toLowerCase()}"><h3>${escapeHtml(playerProfiles[player]?.nickname || player)}</h3>${sections}</section>`;
    }).join('');
}

function exitRps() {
    stopRpsSubscription();
    switchTab('games');
}

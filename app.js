// Calculate exact mobile viewport height to fix PWA layout cut-offs
function calculateRealVh() {
  let vh = window.innerHeight * 0.01;
  document.documentElement.style.setProperty('--vh', `${vh}px`);
}

// Run calculations on load and when orientation changes
window.addEventListener('resize', calculateRealVh);
window.addEventListener('orientationchange', calculateRealVh);
calculateRealVh();

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js')
      .then(reg => console.log('Service Worker registered!', reg))
      .catch(err => console.log('Service Worker registration failed: ', err));
  });
}

// =========================================================================
// SECURE FIREBASE INITIALISATION
// =========================================================================
const firebaseConfig = {
    apiKey: "AIzaSyDvfewmCnjtO-rvL_GXObceHjCgwS9XhsQ",
    authDomain: "sh-app-eab7a.firebaseapp.com",
    databaseURL: "https://sh-app-eab7a-default-rtdb.firebaseio.com",
    projectId: "sh-app-eab7a",
    storageBucket: "sh-app-eab7a.firebasestorage.app",
    messagingSenderId: "379853336154",
    appId: "1:379853336154:web:02c17cee850798e0183263",
    measurementId: "G-BRT652Q46Z"
};

firebase.initializeApp(firebaseConfig);
const database = firebase.database();

const userPresenceRef = database.ref('active-profiles');

// =========================================================================
// LOCAL STATE & PROFILE DICTIONARY CONFIGURATION
// =========================================================================
let localPlayer = null; 

const playerProfiles = {
    Peter: {
        initial: 'P',
        nickname: 'Peter'
    },
    Jadey: {
        initial: 'J',
        nickname: 'Sweetheart'
    }
};

const otherPlayer = (player) => player === 'Peter' ? 'Jadey' : 'Peter';
const themeColorFor = (player) => player === 'Peter' ? '#58A6FF' : '#b685bd';

const gameModes = {
    ten: {
        title: '1 to 10',
        valueLabel: 'number',
        inputType: 'grid',
        values: Array.from({ length: 10 }, (_, index) => index + 1)
    },
    hundred: {
        title: '1 to 100',
        valueLabel: 'number',
        inputType: 'number',
        min: 1,
        max: 100
    },
    colours: {
        title: 'Colours',
        valueLabel: 'colour',
        inputType: 'colours',
        values: [
            { name: 'Red', value: 'red', color: '#B02E26' },
            { name: 'Orange', value: 'orange', color: '#F9801D' },
            { name: 'Yellow', value: 'yellow', color: '#FED83D', light: true },
            { name: 'Lime', value: 'lime', color: '#80C71F', light: true },
            { name: 'Green', value: 'green', color: '#5E7C16' },
            { name: 'Light Blue', value: 'light blue', color: '#3AB3DA' },
            { name: 'Cyan', value: 'cyan', color: '#169C9C' },
            { name: 'Blue', value: 'blue', color: '#3C44AA' },
            { name: 'Pink', value: 'pink', color: '#F38BAA' },
            { name: 'Magenta', value: 'magenta', color: '#C74EBD' },
            { name: 'Purple', value: 'purple', color: '#8932B8' },
            { name: 'Brown', value: 'brown', color: '#835432' },
            { name: 'White', value: 'white', color: '#F9FFFE', light: true },
            { name: 'Light Grey', value: 'light grey', color: '#9D9D97', light: true },
            { name: 'Grey', value: 'grey', color: '#474F52' },
            { name: 'Black', value: 'black', color: '#1D1D21' }
        ]
    }
};

const interactionConfig = {
    hearts: { noun: 'heart', label: 'Heart' },
    hugs: { noun: 'hug', label: 'Hug' },
    kisses: { noun: 'kiss', label: 'Kiss' }
};

let gameState1To10 = {
    mode: 'ten',
    phase: 'SETTING_TARGET',
    targetSetter: 'Peter',
    guesser: 'Jadey',
    chosenTargetValue: null,
    currentGuessValue: null,
    isActive: false
};

let currentSelectedGuess = null;
let isRevealingRound = false; // Guard to stop frame collision anomalies
let latestMessages = [];
let latestNotifications = [];
let realtimeFeedsStarted = false;

// =========================================================================
// THE ONBOARDING PROFILE TRANSITION LOOP
// =========================================================================
function selectProfile(playerName) {
    localPlayer = playerName;
    
    const loginScreen = document.getElementById('login-screen');
    const welcomeContainer = document.getElementById('welcome-container');
    const welcomeNameText = document.getElementById('welcome-name');
    const mainDashboard = document.getElementById('main-dashboard');

    if (loginScreen) {
        loginScreen.style.transition = 'opacity 0.3s ease';
        loginScreen.style.opacity = '0';
    }

    setTimeout(() => {
        if (loginScreen) loginScreen.classList.add('hidden');
        
        if (welcomeNameText) {
            welcomeNameText.style.color = localPlayer === 'Peter' ? '#58A6FF' : '#b685bd';
            welcomeNameText.innerText = localPlayer;
        }
        
        if (welcomeContainer) {
            welcomeContainer.classList.remove('hidden');
            welcomeContainer.style.opacity = '1';
        }

        setTimeout(() => {
            if (welcomeContainer) {
                welcomeContainer.style.transition = 'opacity 0.3s ease';
                welcomeContainer.style.opacity = '0';
            }

            setTimeout(() => {
                if (welcomeContainer) welcomeContainer.classList.add('hidden');
                if (mainDashboard) mainDashboard.classList.remove('hidden');
                initialiseMainDashboard();
                initialiseRealtimeFeeds();
            }, 300);
        }, 1500);

    }, 300);
}

// =========================================================================
// MAIN INTERFACE SKELETON LAYER
// =========================================================================
function initialiseMainDashboard() {
    const mainDashboard = document.getElementById('main-dashboard');
    const headerShell = document.getElementById('dashboard-header-shell');
    const navShell = document.getElementById('dashboard-nav-shell');
    
    const nicknameDisplay = document.getElementById('header-nickname');
    const initialCircle = document.getElementById('header-initial-circle');
    const currentProfile = playerProfiles[localPlayer] || { nickname: localPlayer, initial: '?' };

    if (nicknameDisplay) nicknameDisplay.innerText = currentProfile.nickname;
    if (initialCircle) initialCircle.innerText = currentProfile.initial;

    if (mainDashboard) {
        mainDashboard.classList.remove('theme-peter', 'theme-jadey');
        mainDashboard.classList.add(localPlayer === 'Peter' ? 'theme-peter' : 'theme-jadey');
    }
    if (headerShell) {
        headerShell.classList.remove('header-peter', 'header-jadey');
        headerShell.classList.add(localPlayer === 'Peter' ? 'header-peter' : 'header-jadey');
    }
    if (navShell) {
        navShell.classList.remove('nav-peter', 'nav-jadey');
        navShell.classList.add(localPlayer === 'Peter' ? 'nav-peter' : 'nav-jadey');
    }
    refreshSharedHeader('dashboard');
}

function applyThemeToScreen(screenId, headerId, navId) {
    const screen = document.getElementById(screenId);
    const headerShell = document.getElementById(headerId);
    const navShell = document.getElementById(navId);

    if (screen) {
        screen.classList.remove('theme-peter', 'theme-jadey');
        screen.classList.add(localPlayer === 'Peter' ? 'theme-peter' : 'theme-jadey');
    }
    if (headerShell) {
        headerShell.classList.remove('header-peter', 'header-jadey');
        headerShell.classList.add(localPlayer === 'Peter' ? 'header-peter' : 'header-jadey');
    }
    if (navShell) {
        navShell.classList.remove('nav-peter', 'nav-jadey');
        navShell.classList.add(localPlayer === 'Peter' ? 'nav-peter' : 'nav-jadey');
    }
}

function refreshSharedHeader(prefix) {
    const currentProfile = playerProfiles[localPlayer] || { nickname: localPlayer, initial: '?' };
    const nickname = document.getElementById(`${prefix}-top-nickname`);
    const initial = document.getElementById(`${prefix}-top-initial`);

    if (nickname) nickname.innerText = currentProfile.nickname;
    if (initial) initial.innerText = currentProfile.initial;
}

function switchTab(tabName) {
    const screens = document.querySelectorAll('.screen');
    screens.forEach(screen => screen.classList.add('hidden'));

    if (tabName === 'games') {
        const dash = document.getElementById('main-dashboard');
        if (dash) dash.classList.remove('hidden');
        initialiseMainDashboard();
    } else if (tabName === 'profile') {
        openProfileSettings();
    } else if (tabName === 'messages') {
        openMessagesScreen();
    } else if (tabName === 'alerts') {
        openNotificationsScreen();
    } else {
        const dash = document.getElementById('main-dashboard');
        if (dash) dash.classList.remove('hidden');
        initialiseMainDashboard();
    }

    document.querySelectorAll('.nav-tab-btn').forEach(btn => btn.classList.remove('active-tab'));
    document.querySelectorAll(`.nav-tab-btn[onclick*="${tabName}"]`).forEach(btn => btn.classList.add('active-tab'));
}

// =========================================================================
// PROFILE INTERFACE
// =========================================================================
function openProfileSettings() {
    const mainDash = document.getElementById('main-dashboard');
    if (mainDash) mainDash.classList.add('hidden');
    
    const profileScreen = document.getElementById('profile-screen');
    if (!profileScreen) return;

    const currentProfile = playerProfiles[localPlayer] || { nickname: localPlayer, initial: '?' };
    const heartEmojiButton = document.getElementById('btn-emoji-heart');
    
    const setTxt = (id, value) => { const el = document.getElementById(id); if (el) el.innerText = value; };
    setTxt('profile-top-nickname', currentProfile.nickname);
    setTxt('profile-top-initial', currentProfile.initial);
    setTxt('profile-avatar-letter', currentProfile.initial);
    setTxt('profile-label-name', localPlayer);
    setTxt('profile-label-nickname', currentProfile.nickname);
    
    const themeTitle = document.getElementById('profile-theme-title');
    const themeBlock = document.getElementById('profile-theme-block');
    const headerShell = document.getElementById('profile-header-shell');
    const navShell = document.getElementById('profile-nav-shell');

    profileScreen.classList.remove('hidden');
    profileScreen.classList.remove('theme-peter', 'theme-jadey');
    profileScreen.classList.add(localPlayer === 'Peter' ? 'theme-peter' : 'theme-jadey');

    if (headerShell) {
        headerShell.classList.remove('header-peter', 'header-jadey');
        headerShell.classList.add(localPlayer === 'Peter' ? 'header-peter' : 'header-jadey');
    }
    if (navShell) {
        navShell.classList.remove('nav-peter', 'nav-jadey');
        navShell.classList.add(localPlayer === 'Peter' ? 'nav-peter' : 'nav-jadey');
    }

    if (localPlayer === 'Peter') {
        if (themeTitle) themeTitle.innerText = "Blue";
        if (themeBlock) themeBlock.style.backgroundColor = "#58A6FF";
        if (heartEmojiButton) heartEmojiButton.innerText = "🩵";
    } else {
        if (themeTitle) themeTitle.innerText = "Pink";
        if (themeBlock) themeBlock.style.backgroundColor = "#b685bd";
        if (heartEmojiButton) heartEmojiButton.innerText = "🤍";
    }
}

function closeProfileSettings() {
    const prof = document.getElementById('profile-screen');
    if (prof) prof.classList.add('hidden');
    const dash = document.getElementById('main-dashboard');
    if (dash) dash.classList.remove('hidden');
    initialiseMainDashboard();
}

function showMenu() {
    switchTab('games');
}

function promptNicknameChange() {
    const currentProfile = playerProfiles[localPlayer];
    if (!currentProfile) return;

    const nextNickname = window.prompt('Enter nickname', currentProfile.nickname);
    if (!nextNickname || !nextNickname.trim()) return;

    currentProfile.nickname = nextNickname.trim().slice(0, 24);
    initialiseMainDashboard();
    openProfileSettings();
}

function initialiseRealtimeFeeds() {
    if (realtimeFeedsStarted) return;
    realtimeFeedsStarted = true;

    database.ref('messages').limitToLast(80).on('value', (snapshot) => {
        const data = snapshot.val() || {};
        latestMessages = Object.entries(data)
            .map(([id, value]) => ({ id, ...value }))
            .sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
        renderMessages();
    });

    database.ref('notifications').limitToLast(80).on('value', (snapshot) => {
        const data = snapshot.val() || {};
        latestNotifications = Object.entries(data)
            .map(([id, value]) => ({ id, ...value }))
            .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
        renderNotifications();
        updateNotificationBadges();
    });

    database.ref('interactions').on('value', (snapshot) => {
        renderInteractionCounters(snapshot.val() || {});
    });
}

function renderInteractionCounters(counts) {
    Object.keys(interactionConfig).forEach(type => {
        const peterCount = counts?.Peter?.[type] || 0;
        const jadeyCount = counts?.Jadey?.[type] || 0;
        const counter = document.getElementById(`count-${type}`);
        if (counter) {
            counter.innerHTML = `<span style="color: #58A6FF;">${peterCount}</span>:<span style="color: #b685bd;">${jadeyCount}</span>`;
        }
    });
}

function sendInteraction(type) {
    if (!localPlayer || !interactionConfig[type]) return;

    const recipient = otherPlayer(localPlayer);
    const senderNickname = playerProfiles[localPlayer]?.nickname || localPlayer;
    const noun = interactionConfig[type].noun;

    database.ref(`interactions/${localPlayer}/${type}`).transaction(current => (current || 0) + 1);
    database.ref('notifications').push({
        type: 'Interaction',
        action: 'send-back',
        interactionType: type,
        sender: localPlayer,
        recipient,
        body: `${senderNickname} sent you a ${noun}!`,
        createdAt: Date.now(),
        readBy: {}
    });
}

function sendInteractionBack(notificationId, type) {
    sendInteraction(type);
    database.ref(`notifications/${notificationId}/respondedBy/${localPlayer}`).set(true);
}

function openMessagesScreen() {
    const screen = document.getElementById('messages-screen');
    if (screen) screen.classList.remove('hidden');
    applyThemeToScreen('messages-screen', 'messages-header-shell', 'messages-nav-shell');
    refreshSharedHeader('messages');
    renderMessages();
}

function openNotificationsScreen() {
    const screen = document.getElementById('notifications-screen');
    if (screen) screen.classList.remove('hidden');
    applyThemeToScreen('notifications-screen', 'notifications-header-shell', 'notifications-nav-shell');
    refreshSharedHeader('notifications');
    renderNotifications();
    markNotificationsRead();
}

function sendMessage(event) {
    event.preventDefault();
    const input = document.getElementById('message-input');
    const text = input?.value.trim();
    if (!text || !localPlayer) return;

    const recipient = otherPlayer(localPlayer);
    const senderNickname = playerProfiles[localPlayer]?.nickname || localPlayer;

    database.ref('messages').push({
        sender: localPlayer,
        recipient,
        text,
        createdAt: Date.now()
    });
    database.ref('notifications').push({
        type: `Message from ${senderNickname}`,
        action: 'reply',
        sender: localPlayer,
        recipient,
        body: text,
        createdAt: Date.now(),
        readBy: {}
    });

    input.value = '';
}

function renderMessages() {
    const thread = document.getElementById('messages-thread');
    if (!thread || !localPlayer) return;

    if (!latestMessages.length) {
        thread.innerHTML = '<div class="empty-state">No messages yet.</div>';
        return;
    }

    let lastDate = '';
    thread.innerHTML = latestMessages.map(message => {
        const date = new Date(message.createdAt || Date.now());
        const dateLabel = date.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
        const timeLabel = date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
        const senderProfile = playerProfiles[message.sender] || { nickname: message.sender, initial: '?' };
        const mine = message.sender === localPlayer;
        const divider = dateLabel !== lastDate ? `<div class="message-date-divider">${dateLabel}</div>` : '';
        lastDate = dateLabel;

        const avatar = `<div class="message-avatar">${senderProfile.initial}</div>`;
        const bubble = `
            <div class="message-stack">
                <div class="message-meta"><time>${timeLabel}</time><span>${senderProfile.nickname}</span></div>
                <div class="message-bubble" style="background-color: ${themeColorFor(message.sender)};">${escapeHtml(message.text || '')}</div>
            </div>
        `;

        return `${divider}<div class="message-row ${mine ? 'mine' : ''}">${mine ? `${bubble}${avatar}` : `${avatar}${bubble}`}</div>`;
    }).join('');

    thread.scrollTop = thread.scrollHeight;
}

function renderNotifications() {
    const list = document.getElementById('notifications-list');
    if (!list || !localPlayer) return;

    const visibleNotifications = latestNotifications.filter(notification => notification.recipient === localPlayer || notification.sender === localPlayer);
    if (!visibleNotifications.length) {
        list.innerHTML = '<div class="empty-state">No notifications yet.</div>';
        return;
    }

    list.innerHTML = visibleNotifications.map(notification => {
        const date = new Date(notification.createdAt || Date.now());
        const timeLabel = date.toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
        const isRecipient = notification.recipient === localPlayer;
        const responded = notification.respondedBy && notification.respondedBy[localPlayer];
        let action = '';

        if (notification.action === 'send-back' && isRecipient) {
            action = `<button ${responded ? 'disabled' : ''} onclick="sendInteractionBack('${notification.id}', '${notification.interactionType}')">${responded ? 'Sent' : 'Send back'}</button>`;
        } else if (notification.action === 'reply' && isRecipient) {
            action = `<button onclick="switchTab('messages')">Reply</button>`;
        } else if (notification.action === 'check-game' && isRecipient) {
            action = `<button onclick="launchGame('number-guess')">Check</button>`;
        }

        return `
            <div class="notification-card">
                <div>
                    <div class="notification-meta"><span class="notification-type">${escapeHtml(notification.type || 'Update')}</span><time>${timeLabel}</time></div>
                    <div class="notification-body">${escapeHtml(notification.body || '')}</div>
                </div>
                ${action}
            </div>
        `;
    }).join('');
}

function updateNotificationBadges() {
    if (!localPlayer) return;

    const unread = latestNotifications.filter(notification =>
        notification.recipient === localPlayer &&
        !(notification.readBy && notification.readBy[localPlayer])
    ).length;

    document.querySelectorAll('.notification-badge').forEach(badge => {
        badge.innerText = unread > 9 ? '9+' : String(unread);
        badge.classList.toggle('hidden', unread === 0);
    });
}

function markNotificationsRead() {
    latestNotifications.forEach(notification => {
        if (
            notification.recipient === localPlayer &&
            !(notification.readBy && notification.readBy[localPlayer])
        ) {
            database.ref(`notifications/${notification.id}/readBy/${localPlayer}`).set(true);
        }
    });
}

function escapeHtml(value) {
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

// =========================================================================
// 1 TO 10 MULTIPLAYER GAME WORKSPACE
// =========================================================================
function launchGame(gameId) {
    if (gameId !== 'number-guess') return;

    document.querySelectorAll('.screen').forEach(screen => screen.classList.add('hidden'));

    const gameScreen = document.getElementById('game-1-to-10-screen');
    const headerShell = document.getElementById('game-header-shell');
    const navShell = document.getElementById('game-board-nav-shell');
    const currentProfile = playerProfiles[localPlayer] || { nickname: localPlayer, initial: '?' };

    const topNick = document.getElementById('game-top-nickname');
    if (topNick) topNick.innerText = currentProfile.nickname;

    currentSelectedGuess = null;
    isRevealingRound = false;

    resetVisualCards();

    if (gameScreen) {
        gameScreen.classList.remove('theme-peter', 'theme-jadey');
        gameScreen.classList.add(localPlayer === 'Peter' ? 'theme-peter' : 'theme-jadey');
    }
    if (headerShell) {
        headerShell.classList.remove('header-peter', 'header-jadey');
        headerShell.classList.add(localPlayer === 'Peter' ? 'header-peter' : 'header-jadey');
    }
    if (navShell) {
        navShell.classList.remove('nav-peter', 'nav-jadey');
        navShell.classList.add(localPlayer === 'Peter' ? 'nav-peter' : 'nav-jadey');
    }

    database.ref('games/1-to-10').once('value', (snapshot) => {
        const data = snapshot.val();
        if (data && data.isActive) {
            gameState1To10 = normalizeGameState(data);
        } else {
            gameState1To10 = createFreshRound('ten', 'Peter');
            database.ref('games/1-to-10').set(gameState1To10);
        }
        if (gameScreen) gameScreen.classList.remove('hidden');
        renderGameModeControls();
        handleGameStateUpdate();
    });
}

function normalizeGameState(state) {
    return {
        mode: state.mode && gameModes[state.mode] ? state.mode : 'ten',
        phase: state.phase || 'SETTING_TARGET',
        targetSetter: state.targetSetter || 'Peter',
        guesser: state.guesser || 'Jadey',
        chosenTargetValue: state.chosenTargetValue ?? null,
        currentGuessValue: state.currentGuessValue ?? null,
        isActive: state.isActive !== false
    };
}

function createFreshRound(mode, targetSetter) {
    const nextSetter = targetSetter || gameState1To10.targetSetter || 'Peter';
    return {
        mode,
        phase: 'SETTING_TARGET',
        targetSetter: nextSetter,
        guesser: otherPlayer(nextSetter),
        chosenTargetValue: null,
        currentGuessValue: null,
        isActive: true
    };
}

function getCurrentMode() {
    return gameModes[gameState1To10.mode] || gameModes.ten;
}

function renderGameModeControls() {
    const mode = getCurrentMode();
    const title = document.getElementById('game-main-title');
    const pad = document.getElementById('game-choice-pad');
    const yourLabel = document.getElementById('your-value-label');
    const theirLabel = document.getElementById('their-value-label');

    if (title) title.innerText = mode.title;
    if (yourLabel) yourLabel.innerText = `Your ${mode.valueLabel}`;
    if (theirLabel) theirLabel.innerText = `Their ${mode.valueLabel}`;
    if (!pad) return;

    pad.className = 'game-choice-pad';
    if (mode.inputType === 'grid') {
        pad.innerHTML = mode.values.map(value => `<button class="pad-num-btn" onclick="selectGameValue(${value})">${value}</button>`).join('');
    } else if (mode.inputType === 'number') {
        pad.classList.add('keyboard-mode');
        pad.innerHTML = `
            <div class="number-entry">
                <input id="hundred-mode-input" type="number" inputmode="numeric" min="${mode.min}" max="${mode.max}" placeholder="1-100" oninput="selectHundredValue(this.value)">
            </div>
        `;
    } else if (mode.inputType === 'colours') {
        pad.classList.add('colour-mode');
        pad.innerHTML = mode.values.map(colour => `
            <button class="pad-num-btn colour-tile ${colour.light ? 'light-label' : ''}" style="background-color: ${colour.color};" onclick="selectGameValue('${colour.value}')">${colour.name}</button>
        `).join('');
    }
}

function resetVisualCards() {
    ['card-front-your-guess', 'card-front-their-target', 'card-back-your-guess', 'card-back-their-target'].forEach(id => {
        const el = document.getElementById(id); if (el) el.innerText = "?";
    });
    const innerGuess = document.getElementById('flip-inner-guess');
    const innerTarget = document.getElementById('flip-inner-target');
    if (innerGuess) innerGuess.classList.remove('do-flip');
    if (innerTarget) innerTarget.classList.remove('do-flip');
    document.querySelectorAll('.pad-num-btn').forEach(btn => btn.classList.remove('selected-key'));
    const hundredInput = document.getElementById('hundred-mode-input');
    if (hundredInput) hundredInput.value = '';
    const submitStrip = document.getElementById('game-action-submit-strip');
    if (submitStrip) {
        submitStrip.classList.remove('ready-to-submit');
        submitStrip.innerText = "CHOOSE A NUMBER";
    }
}

function updateGameUIFlow() {
    if (isRevealingRound) return;

    const promptLabel = document.getElementById('game-display-turn-prompt');
    if (!promptLabel) return;

    const setterNickname = playerProfiles[gameState1To10.targetSetter]?.nickname || gameState1To10.targetSetter;
    const guesserNickname = playerProfiles[gameState1To10.guesser]?.nickname || gameState1To10.guesser;

    const frontGuess = document.getElementById('card-front-your-guess');
    const frontTarget = document.getElementById('card-front-their-target');

    if (gameState1To10.phase === 'SETTING_TARGET') {
        if (localPlayer === gameState1To10.targetSetter) {
            promptLabel.innerText = `Choose your secret target ${getCurrentMode().valueLabel}`;
            if (frontGuess) frontGuess.innerText = currentSelectedGuess !== null ? currentSelectedGuess : "?";
        } else {
            promptLabel.innerText = `Waiting for ${setterNickname} to set a target...`;
            if (frontGuess) frontGuess.innerText = "?";
        }
        if (frontTarget) frontTarget.innerText = "?";
    } else if (gameState1To10.phase === 'GUESSING') {
        if (localPlayer === gameState1To10.guesser) {
            promptLabel.innerText = `Your turn to guess ${setterNickname}'s ${getCurrentMode().valueLabel}!`;
            if (frontGuess) frontGuess.innerText = currentSelectedGuess !== null ? currentSelectedGuess : "?";
            if (frontTarget) frontTarget.innerText = "?"; // Keep hidden so the guesser cannot peek
        } else {
            promptLabel.innerText = `Waiting for ${guesserNickname} to make a guess...`;
            // Show the setter their own locked choice in the guess box, and mark the opponent's slot as a waiting placeholder
            if (frontGuess) frontGuess.innerText = gameState1To10.chosenTargetValue !== null ? gameState1To10.chosenTargetValue : "?";
            if (frontTarget) frontTarget.innerText = "?";
        }
    } else if (gameState1To10.phase === 'REVEAL') {
        promptLabel.innerText = "Evaluating results...";
    }
}

function selectPadNumber(num) {
    selectGameValue(num);
}

function selectHundredValue(rawValue) {
    const mode = getCurrentMode();
    const value = Number(rawValue);

    if (!Number.isInteger(value) || value < mode.min || value > mode.max) {
        currentSelectedGuess = null;
        const submitStrip = document.getElementById('game-action-submit-strip');
        if (submitStrip) {
            submitStrip.classList.remove('ready-to-submit');
            submitStrip.innerText = "CHOOSE A NUMBER";
        }
        return;
    }

    selectGameValue(value);
}

function selectGameValue(value) {
    if (!gameState1To10.isActive || isRevealingRound || gameState1To10.phase === 'REVEAL') return;

    if (gameState1To10.phase === 'SETTING_TARGET' && localPlayer !== gameState1To10.targetSetter) return;
    if (gameState1To10.phase === 'GUESSING' && localPlayer !== gameState1To10.guesser) return;

    currentSelectedGuess = value;

    const cardFront = document.getElementById('card-front-your-guess');
    if (cardFront) cardFront.innerText = value;

    document.querySelectorAll('.pad-num-btn').forEach(btn => {
        const selectedValue = btn.innerText.trim().toLowerCase();
        if (selectedValue === String(value).toLowerCase()) {
            btn.classList.add('selected-key');
        } else {
            btn.classList.remove('selected-key');
        }
    });

    const submitStrip = document.getElementById('game-action-submit-strip');
    if (submitStrip) {
        submitStrip.classList.add('ready-to-submit');
        submitStrip.innerText = "SUBMIT CHOICE";
    }
}

function processPadSubmission() {
    if (currentSelectedGuess === null || !gameState1To10.isActive || isRevealingRound) return;

    if (gameState1To10.phase === 'SETTING_TARGET') {
        if (localPlayer !== gameState1To10.targetSetter) return;

        gameState1To10.chosenTargetValue = currentSelectedGuess;
        gameState1To10.phase = 'GUESSING';
        currentSelectedGuess = null;
        
        database.ref('games/1-to-10').set(gameState1To10);

    } else if (gameState1To10.phase === 'GUESSING') {
        if (localPlayer !== gameState1To10.guesser) return;

        gameState1To10.currentGuessValue = currentSelectedGuess;
        gameState1To10.phase = 'REVEAL';
        currentSelectedGuess = null;

        database.ref('games/1-to-10').set(gameState1To10);
        database.ref('notifications').push({
            type: 'Game Update',
            action: 'check-game',
            sender: localPlayer,
            recipient: otherPlayer(localPlayer),
            body: `${playerProfiles[localPlayer]?.nickname || localPlayer} has finished their turn in ${getCurrentMode().title}`,
            createdAt: Date.now(),
            readBy: {}
        });
    }
}

function advanceRoundAfterReveal(revealRound) {
    database.ref('games/1-to-10').transaction((current) => {
        if (!current || current.phase !== 'REVEAL') return;

        const isSameRevealRound =
            current.targetSetter === revealRound.targetSetter &&
            current.guesser === revealRound.guesser &&
            current.chosenTargetValue === revealRound.chosenTargetValue &&
            current.currentGuessValue === revealRound.currentGuessValue;

        if (!isSameRevealRound) return;

        const nextSetter = current.targetSetter === 'Peter' ? 'Jadey' : 'Peter';
        const nextGuesser = nextSetter === 'Peter' ? 'Jadey' : 'Peter';

        return {
            mode: current.mode || revealRound.mode || 'ten',
            phase: 'SETTING_TARGET',
            targetSetter: nextSetter,
            guesser: nextGuesser,
            chosenTargetValue: null,
            currentGuessValue: null,
            isActive: true
        };
    }, (error, committed, snapshot) => {
        if (error) {
            console.log('Round advance failed:', error);
            return;
        }

        const latestState = snapshot.val();
        if (latestState) gameState1To10 = normalizeGameState(latestState);

        isRevealingRound = false;
        renderGameModeControls();
        resetVisualCards();
        updateGameUIFlow();
    });
}

function startRevealSequence() {
    isRevealingRound = true;
    const revealRound = { ...gameState1To10 };

    const backGuess = document.getElementById('card-back-your-guess');
    const backTarget = document.getElementById('card-back-their-target');
    const innerGuessCard = document.getElementById('flip-inner-guess');
    const innerTargetCard = document.getElementById('flip-inner-target');
    const promptLabel = document.getElementById('game-display-turn-prompt');

    if (localPlayer === gameState1To10.guesser) {
        if (backGuess) backGuess.innerText = gameState1To10.currentGuessValue ?? "?";
        if (backTarget) backTarget.innerText = gameState1To10.chosenTargetValue ?? "?";
    } else {
        if (backGuess) backGuess.innerText = gameState1To10.chosenTargetValue ?? "?";
        if (backTarget) backTarget.innerText = gameState1To10.currentGuessValue ?? "?";
    }

    if (innerGuessCard) innerGuessCard.classList.add('do-flip');

    setTimeout(() => {
        if (innerTargetCard) innerTargetCard.classList.add('do-flip');

        if (promptLabel) {
            if (
                gameState1To10.currentGuessValue !== null &&
                gameState1To10.currentGuessValue === gameState1To10.chosenTargetValue
            ) {
                promptLabel.innerText = "Correct Match! Point scored!";
            } else {
                promptLabel.innerText = "No Match!";
            }
        }

        setTimeout(() => {
            advanceRoundAfterReveal(revealRound);
        }, 3000);
    }, 700);
}

function handleGameStateUpdate() {
    const gameScreen = document.getElementById('game-1-to-10-screen');
    if (!gameScreen || gameScreen.classList.contains('hidden')) return;

    renderGameModeControls();

    if (gameState1To10.phase === 'REVEAL' && !isRevealingRound) {
        startRevealSequence();
    } else {
        updateGameUIFlow();
    }
}

function openModesSelection() {
    const gameScreen = document.getElementById('game-1-to-10-screen');
    const modesScreen = document.getElementById('modes-screen');
    const headerShell = document.getElementById('modes-header-shell');
    if (gameScreen) gameScreen.classList.add('hidden');
    if (modesScreen) {
        modesScreen.classList.remove('hidden');
        modesScreen.classList.remove('theme-peter', 'theme-jadey');
        modesScreen.classList.add(localPlayer === 'Peter' ? 'theme-peter' : 'theme-jadey');
    }
    if (headerShell) {
        headerShell.classList.remove('header-peter', 'header-jadey');
        headerShell.classList.add(localPlayer === 'Peter' ? 'header-peter' : 'header-jadey');
    }
    updateModeButtons();
}

function updateModeButtons() {
    document.querySelectorAll('.mode-option-btn').forEach(button => button.classList.remove('active-mode'));
    const activeButton = document.querySelector(`.mode-option-btn[onclick*="${gameState1To10.mode || 'ten'}"]`);
    if (activeButton) activeButton.classList.add('active-mode');
}

function selectGameMode(modeKey) {
    if (!gameModes[modeKey]) return;

    const nextState = createFreshRound(modeKey, localPlayer || 'Peter');
    gameState1To10 = nextState;
    currentSelectedGuess = null;
    isRevealingRound = false;

    database.ref('games/1-to-10').set(nextState);
    database.ref('notifications').push({
        type: 'Game Update',
        action: 'check-game',
        sender: localPlayer,
        recipient: otherPlayer(localPlayer),
        body: `${playerProfiles[localPlayer]?.nickname || localPlayer} changed 1 to 10 mode to ${gameModes[modeKey].title}`,
        createdAt: Date.now(),
        readBy: {}
    });

    launchGame('number-guess');
}

// Fixed Synchronization Engine
database.ref('games/1-to-10').on('value', (snapshot) => {
    const data = snapshot.val();
    if (!data) return;

    gameState1To10 = normalizeGameState(data);
    handleGameStateUpdate();
});

function exitGame() {
    const gameScreen = document.getElementById('game-1-to-10-screen');
    if (gameScreen) gameScreen.classList.add('hidden');
    const dash = document.getElementById('main-dashboard');
    if (dash) dash.classList.remove('hidden');
    initialiseMainDashboard();
}

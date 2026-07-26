// Calculate exact mobile viewport height to fix PWA layout cut-offs
let lastViewportWidth = window.innerWidth;
let stableViewportHeight = window.innerHeight;

function calculateRealVh(forceReset = false) {
  const widthChanged = Math.abs(window.innerWidth - lastViewportWidth) > 80;
  if (forceReset || widthChanged) {
    lastViewportWidth = window.innerWidth;
    stableViewportHeight = window.innerHeight;
  } else if (!document.activeElement?.matches?.('input, textarea, select')) {
    stableViewportHeight = Math.max(stableViewportHeight, window.innerHeight);
  }
  document.documentElement.style.setProperty('--vh', `${stableViewportHeight * 0.01}px`);
}

// Run calculations on load and when orientation changes
window.addEventListener('resize', calculateRealVh);
window.addEventListener('orientationchange', () => window.setTimeout(() => calculateRealVh(true), 150));
window.addEventListener('pageshow', () => restoreViewportAfterKeyboard());
window.visualViewport?.addEventListener('resize', calculateRealVh);
calculateRealVh();

function restoreViewportAfterKeyboard() {
    if (document.activeElement?.matches?.('input, textarea, select')) document.activeElement.blur();
    window.scrollTo(0, 0);
    document.getElementById('main-content')?.scrollTo?.(0, 0);
    [50, 250, 600].forEach(delay => window.setTimeout(() => calculateRealVh(true), delay));
}

document.addEventListener('visibilitychange', () => {
    updateAppPresence();
    if (!document.hidden) restoreViewportAfterKeyboard();
});

if (navigator.serviceWorker?.register) {
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
const auth = firebase.auth();
const database = firebase.database();

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

const DEFAULT_THEME_COLOURS = {
    Peter: '#15AFD1',
    Jadey: '#FFD1DC'
};

let playerThemes = { ...DEFAULT_THEME_COLOURS };
let pendingThemeColour = null;

const approvedUsers = {
    r5fWhg92yddJa4KohFM5kaNYyww1: 'Peter',
    HwZHM84ymieoJMnAmCQQkRjd1iI3: 'Jadey'
};

const otherPlayer = (player) => player === 'Peter' ? 'Jadey' : 'Peter';
const themeColorFor = player => playerThemes[player] || DEFAULT_THEME_COLOURS[player] || '#FFFFFF';
const textColorFor = colour => {
    const rgb = hexToRgb(colour);
    if (!rgb) return '#FFFFFF';
    return ((rgb.r * 299 + rgb.g * 587 + rgb.b * 114) / 1000) > 170 ? '#111111' : '#FFFFFF';
};

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

const RETENTION_LIMIT = 50;
const READ_NOTIFICATION_RETENTION_MS = 60 * 60 * 1000;

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
let lastNumberGuessTurnCueKey = null;
let numberGuessSummaryTimer = null;
let latestMessages = [];
let latestNotifications = [];
let latestStats = {};
let profilePhotos = {};
let pendingProfilePhoto = null;
let realtimeFeedsStarted = false;
let retentionCleanupRunning = false;
let authRejectionMessage = '';
let activeAppView = 'signed-out';
let presenceDisconnectHandle = null;
let messageHoldTimer = null;
let selectedMessageActionId = null;
let notificationSwipe = null;
window.setInterval(updateAppPresence, 30 * 1000);
window.setInterval(refreshActiveMultiplayerSession, 10 * 1000);

function setActiveAppView(view) {
    activeAppView = view;
    updateAppPresence();
}

function updateAppPresence() {
    if (!localPlayer || !auth.currentUser) return;
    const ref = database.ref(`presence/${localPlayer}`);
    ref.set({
        view: activeAppView,
        visible: !document.hidden,
        updatedAt: firebase.database.ServerValue.TIMESTAMP
    });
    if (!presenceDisconnectHandle && ref.onDisconnect) {
        presenceDisconnectHandle = ref.onDisconnect();
        presenceDisconnectHandle.remove();
    }
    if (!document.hidden) refreshActiveMultiplayerSession();
}

function refreshActiveMultiplayerSession() {
    if (!localPlayer || !auth.currentUser || document.hidden) return;
    const now = Date.now();
    if (activeAppView === 'word-search' && typeof refreshWordSearchPresence === 'function') {
        refreshWordSearchPresence(now);
    } else if (activeAppView === 'battleship') {
        database.ref('games/battleship/current').transaction(current => {
            if (!current || current.status === 'finished') return current;
            if (typeof ensureBattleshipParticipant === 'function') {
                ensureBattleshipParticipant(current, localPlayer);
            } else {
                current.players = current.players || {};
                current.players[localPlayer] = true;
                current.present = current.present || {};
            }
            current.present[localPlayer] = now;
            return current;
        });
    } else if (activeAppView === 'connect-four') {
        database.ref('games/connectFour/current').transaction(current => {
            if (!current || current.status === 'finished') return current;
            current.players = current.players || {};
            current.players[localPlayer] = true;
            current.present = current.present || {};
            current.present[localPlayer] = now;
            if (current.status === 'waiting' && current.players.Peter && current.players.Jadey) {
                current.status = 'active';
                current.turn = current.turn || (Math.random() < 0.5 ? 'Peter' : 'Jadey');
                current.startedAt = current.startedAt || Date.now();
            }
            return current;
        });
    } else if (activeAppView === 'sudoku' && typeof refreshSudokuPresence === 'function') {
        refreshSudokuPresence(now);
    }
}

function recipientIsViewing(recipient, view) {
    return database.ref(`presence/${recipient}`).once('value').then(snapshot => {
        const presence = snapshot.val() || {};
        const recentlyUpdated = Number(presence.updatedAt) >= Date.now() - (2 * 60 * 1000);
        return presence.visible === true && recentlyUpdated && presence.view === view;
    }).catch(() => false);
}

function sendAppNotification(notification, suppressWhenViewing = null) {
    const send = () => database.ref('notifications').push(notification);
    if (!suppressWhenViewing) return send();
    return recipientIsViewing(notification.recipient, suppressWhenViewing)
        .then(isViewing => isViewing ? null : send());
}

function removeMatchingNotifications(predicate) {
    return database.ref('notifications').once('value').then(snapshot => {
        const updates = {};
        snapshot.forEach(child => {
            const notification = { id: child.key, ...child.val() };
            if (predicate(notification)) updates[`notifications/${child.key}`] = null;
        });
        return Object.keys(updates).length ? database.ref().update(updates) : null;
    });
}

function clearGameNotifications(actions, players = ['Peter', 'Jadey']) {
    const actionSet = new Set(actions);
    return removeMatchingNotifications(notification =>
        actionSet.has(notification.action) &&
        (players.includes(notification.sender) || players.includes(notification.recipient))
    );
}

function removeNotificationsForMessage(message) {
    if (!message) return Promise.resolve();
    return removeMatchingNotifications(notification =>
        notification.action === 'reply' &&
        (
            notification.messageId === message.id ||
            (!notification.messageId &&
                notification.sender === message.sender &&
                notification.recipient === message.recipient &&
                notification.body === message.text)
        )
    );
}

// =========================================================================
// AUTHENTICATION
// =========================================================================
function setAuthStatus(message, isError = false) {
    const status = document.getElementById('auth-status');
    if (!status) return;
    status.innerText = message;
    status.classList.toggle('error', isError);
}

function setAuthBusy(busy) {
    const submit = document.getElementById('auth-submit');
    const reset = document.getElementById('forgot-password-btn');
    const email = document.getElementById('auth-email');
    const password = document.getElementById('auth-password');
    if (submit) {
        submit.disabled = busy;
        submit.innerText = busy ? 'Signing in...' : 'Sign in';
    }
    if (reset) reset.disabled = busy;
    if (email) email.disabled = busy;
    if (password) password.disabled = busy;
}

function showAuthScreen(message = 'Sign in with your approved account.', isError = false) {
    document.querySelectorAll('.screen').forEach(screen => screen.classList.add('hidden'));
    const loginScreen = document.getElementById('login-screen');
    if (loginScreen) loginScreen.classList.remove('hidden');
    localPlayer = null;
    activeAppView = 'signed-out';
    presenceDisconnectHandle = null;
    setAuthBusy(false);
    setAuthStatus(message, isError);
}

function showAuthenticatedApp(playerName) {
    localPlayer = playerName;
    document.querySelectorAll('.screen').forEach(screen => screen.classList.add('hidden'));
    document.getElementById('main-dashboard')?.classList.remove('hidden');
    initialiseMainDashboard();
    initialiseRealtimeFeeds();
    setActiveAppView('games');
}

function authErrorMessage(error) {
    if (error?.code === 'auth/invalid-credential' || error?.code === 'auth/wrong-password' || error?.code === 'auth/user-not-found') {
        return 'The email or password is incorrect.';
    }
    if (error?.code === 'auth/too-many-requests') return 'Too many attempts. Please wait and try again.';
    if (error?.code === 'auth/network-request-failed') return 'Could not connect. Check your internet connection.';
    return 'Sign-in failed. Please try again.';
}

function signIn(event) {
    event.preventDefault();
    const email = document.getElementById('auth-email')?.value.trim();
    const password = document.getElementById('auth-password')?.value;
    if (!email || !password) return;
    setAuthBusy(true);
    setAuthStatus('Signing in...');
    auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL)
        .then(() => auth.signInWithEmailAndPassword(email, password))
        .catch(error => {
            setAuthBusy(false);
            setAuthStatus(authErrorMessage(error), true);
        });
}

function sendPasswordReset() {
    const email = document.getElementById('auth-email')?.value.trim();
    if (!email) {
        setAuthStatus('Enter your email address first.', true);
        document.getElementById('auth-email')?.focus();
        return;
    }

    setAuthBusy(true);
    setAuthStatus('Sending password reset email...');
    auth.sendPasswordResetEmail(email)
        .then(() => {
            setAuthBusy(false);
            setAuthStatus('If this is an approved account, a password reset link has been sent.');
        })
        .catch(error => {
            setAuthBusy(false);
            if (error?.code === 'auth/invalid-email') {
                setAuthStatus('Enter a valid email address.', true);
            } else if (error?.code === 'auth/network-request-failed') {
                setAuthStatus('Could not connect. Check your internet connection.', true);
            } else {
                setAuthStatus('If this is an approved account, a password reset link has been sent.');
            }
        });
}

function signOut() {
    if (!window.confirm("Sign out of Sweetheart's App?")) return;
    auth.signOut().then(() => window.location.reload());
}

// =========================================================================
// MAIN INTERFACE SKELETON LAYER
// =========================================================================
function initialiseMainDashboard() {
    setActiveAppView('games');
    applyThemeVariables();
    const mainDashboard = document.getElementById('main-dashboard');
    const headerShell = document.getElementById('dashboard-header-shell');
    const navShell = document.getElementById('dashboard-nav-shell');
    
    const nicknameDisplay = document.getElementById('header-nickname');
    const initialCircle = document.getElementById('header-initial-circle');
    const currentProfile = playerProfiles[localPlayer] || { nickname: localPlayer, initial: '?' };

    if (nicknameDisplay) nicknameDisplay.innerText = currentProfile.nickname;
    renderProfileAvatar(initialCircle, localPlayer);

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

function applyThemeVariables() {
    document.documentElement.style.setProperty('--peter-theme', themeColorFor('Peter'));
    document.documentElement.style.setProperty('--jadey-theme', themeColorFor('Jadey'));
    document.documentElement.style.setProperty('--peter-theme-text', textColorFor(themeColorFor('Peter')));
    document.documentElement.style.setProperty('--jadey-theme-text', textColorFor(themeColorFor('Jadey')));
    document.documentElement.style.setProperty('--theme-color', themeColorFor(localPlayer));
    document.documentElement.style.setProperty('--theme-text-color', textColorFor(themeColorFor(localPlayer)));
    document.documentElement.style.setProperty('--other-theme-color', themeColorFor(otherPlayer(localPlayer)));
}

function applyThemeToScreen(screenId, headerId, navId) {
    applyThemeVariables();
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
    renderProfileAvatar(initial, localPlayer);
}

function validProfilePhoto(value) {
    return typeof value === 'string' && /^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(value);
}

function profilePhotoFor(player) {
    const value = profilePhotos[player];
    return validProfilePhoto(value) ? value : null;
}

function renderProfileAvatar(element, player) {
    if (!element) return;
    const profile = playerProfiles[player] || { initial: '?' };
    const photo = profilePhotoFor(player);
    element.classList.toggle('has-photo', Boolean(photo));
    element.style.backgroundImage = photo ? `url("${photo}")` : '';
    element.innerText = photo ? '' : profile.initial;
}

function refreshVisibleProfilePhotos() {
    const prefixes = ['dashboard', 'profile', 'stats', 'messages', 'notifications', 'game', 'word-search', 'battleship', 'connect-four', 'sudoku', 'tic-tac-toe', 'rps'];
    prefixes.forEach(prefix => renderProfileAvatar(
        document.getElementById(prefix === 'dashboard' ? 'header-initial-circle' : `${prefix}-top-initial`),
        localPlayer
    ));
    renderProfileAvatar(document.getElementById('profile-main-avatar'), localPlayer);
    renderMessages();
}

function switchTab(tabName) {
    const wordSearchVisible = !document.getElementById('word-search-screen')?.classList.contains('hidden');
    if (wordSearchVisible && typeof wordSearchSettings !== 'undefined' && wordSearchSettings.mode === 'versus') {
        abandonVersusMatch(true);
        stopWordSearchRealtime();
    }
    const battleshipVisible = !document.getElementById('battleship-screen')?.classList.contains('hidden');
    if (battleshipVisible && typeof stopBattleshipSubscription === 'function') stopBattleshipSubscription();
    const connectFourVisible = !document.getElementById('connect-four-screen')?.classList.contains('hidden');
    if (connectFourVisible && typeof stopConnectFourSubscription === 'function') stopConnectFourSubscription();
    const sudokuVisible = !document.getElementById('sudoku-screen')?.classList.contains('hidden');
    if (sudokuVisible && typeof stopSudokuSubscription === 'function') {
        if (typeof sudokuSettings !== 'undefined' && sudokuSettings.mode === 'versus') abandonSudokuVersus(true);
        stopSudokuSubscription();
    }
    const ticTacToeVisible = !document.getElementById('tic-tac-toe-screen')?.classList.contains('hidden');
    if (ticTacToeVisible && typeof stopTicTacToeSubscription === 'function') stopTicTacToeSubscription();
    const rpsVisible = !document.getElementById('rps-screen')?.classList.contains('hidden');
    if (rpsVisible && typeof stopRpsSubscription === 'function') stopRpsSubscription();

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
    } else if (tabName === 'stats') {
        openStatsScreen();
    } else {
        const dash = document.getElementById('main-dashboard');
        if (dash) dash.classList.remove('hidden');
        initialiseMainDashboard();
    }

    document.querySelectorAll('.nav-tab-btn').forEach(btn => btn.classList.remove('active-tab'));
    document.querySelectorAll(`.nav-tab-btn[onclick*="${tabName}"]`).forEach(btn => btn.classList.add('active-tab'));
    setActiveAppView(tabName);
}

// =========================================================================
// PROFILE INTERFACE
// =========================================================================
function openProfileSettings() {
    setActiveAppView('profile');
    const mainDash = document.getElementById('main-dashboard');
    if (mainDash) mainDash.classList.add('hidden');
    
    const profileScreen = document.getElementById('profile-screen');
    if (!profileScreen) return;

    const currentProfile = playerProfiles[localPlayer] || { nickname: localPlayer, initial: '?' };
    const heartEmojiButton = document.getElementById('btn-emoji-heart');
    
    const setTxt = (id, value) => { const el = document.getElementById(id); if (el) el.innerText = value; };
    setTxt('profile-top-nickname', currentProfile.nickname);
    renderProfileAvatar(document.getElementById('profile-top-initial'), localPlayer);
    renderProfileAvatar(document.getElementById('profile-main-avatar'), localPlayer);
    setTxt('profile-label-name', localPlayer);
    setTxt('profile-label-nickname', currentProfile.nickname);
    setTxt('profile-account-email', auth.currentUser?.email || 'Email unavailable');
    
    const themeTitle = document.getElementById('profile-theme-title');
    const themeBlock = document.getElementById('profile-theme-block');
    const managementButton = document.getElementById('app-management-btn');
    const headerShell = document.getElementById('profile-header-shell');
    const navShell = document.getElementById('profile-nav-shell');

    if (managementButton) managementButton.classList.toggle('hidden', localPlayer !== 'Peter');

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

    applyThemeVariables();
    if (localPlayer === 'Peter') {
        if (themeTitle) themeTitle.innerText = themeColorFor('Peter');
        if (themeBlock) themeBlock.style.backgroundColor = themeColorFor('Peter');
        if (heartEmojiButton) heartEmojiButton.innerText = "🩵";
    } else {
        if (themeTitle) themeTitle.innerText = themeColorFor('Jadey');
        if (themeBlock) themeBlock.style.backgroundColor = themeColorFor('Jadey');
        if (heartEmojiButton) heartEmojiButton.innerText = "🤍";
    }
}

function normalizeHexColour(value) {
    const raw = String(value || '').trim().replace(/^#/, '');
    if (/^[0-9a-fA-F]{3}$/.test(raw)) {
        return `#${raw.split('').map(char => char + char).join('').toUpperCase()}`;
    }
    return /^[0-9a-fA-F]{6}$/.test(raw) ? `#${raw.toUpperCase()}` : null;
}

function hexToRgb(hex) {
    const normalized = normalizeHexColour(hex);
    if (!normalized) return null;
    return {
        r: parseInt(normalized.slice(1, 3), 16),
        g: parseInt(normalized.slice(3, 5), 16),
        b: parseInt(normalized.slice(5, 7), 16)
    };
}

function rgbToHex(r, g, b) {
    const values = [r, g, b].map(value => Math.max(0, Math.min(255, Number(value))));
    if (values.some(Number.isNaN)) return null;
    return `#${values.map(value => Math.round(value).toString(16).padStart(2, '0')).join('').toUpperCase()}`;
}

function syncThemePicker(colour) {
    const normalized = normalizeHexColour(colour);
    if (!normalized) return false;
    pendingThemeColour = normalized;
    const rgb = hexToRgb(normalized);
    document.getElementById('theme-colour-picker').value = normalized;
    document.getElementById('theme-hex-input').value = normalized;
    document.getElementById('theme-r-input').value = rgb.r;
    document.getElementById('theme-g-input').value = rgb.g;
    document.getElementById('theme-b-input').value = rgb.b;
    document.getElementById('theme-picker-status').innerText = normalized;
    return true;
}

function openThemePicker() {
    syncThemePicker(themeColorFor(localPlayer));
    document.getElementById('theme-picker-dialog')?.classList.remove('hidden');
}

function closeThemePicker() {
    pendingThemeColour = null;
    document.getElementById('theme-picker-dialog')?.classList.add('hidden');
}

function updateThemePickerFromColour(value) {
    syncThemePicker(value);
}

function updateThemePickerFromHex(value) {
    const normalized = normalizeHexColour(value);
    if (normalized) syncThemePicker(normalized);
}

function updateThemePickerFromRgb() {
    const colour = rgbToHex(
        document.getElementById('theme-r-input')?.value,
        document.getElementById('theme-g-input')?.value,
        document.getElementById('theme-b-input')?.value
    );
    if (colour) syncThemePicker(colour);
}

function saveThemeColour() {
    if (!localPlayer || !pendingThemeColour) return;
    database.ref(`themes/${localPlayer}`).set(pendingThemeColour)
        .then(closeThemePicker)
        .catch(error => {
            document.getElementById('theme-picker-status').innerText = `Could not save: ${error.message}`;
        });
}

function resetThemeColour() {
    if (!localPlayer) return;
    const defaultColour = DEFAULT_THEME_COLOURS[localPlayer];
    syncThemePicker(defaultColour);
    database.ref(`themes/${localPlayer}`).set(defaultColour).then(closeThemePicker);
}

function closeProfileSettings() {
    const prof = document.getElementById('profile-screen');
    if (prof) prof.classList.add('hidden');
    const dash = document.getElementById('main-dashboard');
    if (dash) dash.classList.remove('hidden');
    initialiseMainDashboard();
}

function setAccountSettingsStatus(message, isError = false) {
    const status = document.getElementById('account-settings-status');
    if (!status) return;
    status.innerText = message;
    status.classList.toggle('error', isError);
}

function setAccountSettingsBusy(busy) {
    document.querySelectorAll('#account-settings-screen input, #account-settings-screen button').forEach(control => {
        control.disabled = busy;
    });
}

function refreshAccountEmail() {
    const email = auth.currentUser?.email || 'Email unavailable';
    const currentEmail = document.getElementById('account-current-email');
    const profileEmail = document.getElementById('profile-account-email');
    if (currentEmail) currentEmail.innerText = email;
    if (profileEmail) profileEmail.innerText = email;
}

function openAccountSettings() {
    setActiveAppView('account-settings');
    if (!auth.currentUser) return;
    document.querySelectorAll('.screen').forEach(screen => screen.classList.add('hidden'));
    const screen = document.getElementById('account-settings-screen');
    const header = document.getElementById('account-settings-header-shell');
    if (screen) {
        screen.classList.remove('hidden', 'theme-peter', 'theme-jadey');
        screen.classList.add(localPlayer === 'Peter' ? 'theme-peter' : 'theme-jadey');
    }
    if (header) {
        header.classList.remove('header-peter', 'header-jadey');
        header.classList.add(localPlayer === 'Peter' ? 'header-peter' : 'header-jadey');
    }
    refreshAccountEmail();
    setAccountSettingsBusy(false);
    setAccountSettingsStatus('');
}

function reauthenticateCurrentUser(password) {
    const user = auth.currentUser;
    if (!user?.email) return Promise.reject({ code: 'auth/user-missing' });
    const credential = firebase.auth.EmailAuthProvider.credential(user.email, password);
    return user.reauthenticateWithCredential(credential);
}

function accountUpdateErrorMessage(error) {
    if (error?.code === 'auth/invalid-credential' || error?.code === 'auth/wrong-password') return 'The current password is incorrect.';
    if (error?.code === 'auth/email-already-in-use') return 'That email address is already in use.';
    if (error?.code === 'auth/invalid-email') return 'Enter a valid email address.';
    if (error?.code === 'auth/weak-password') return 'The new password must contain at least 6 characters.';
    if (error?.code === 'auth/too-many-requests') return 'Too many attempts. Please wait and try again.';
    if (error?.code === 'auth/network-request-failed') return 'Could not connect. Check your internet connection.';
    if (error?.code === 'auth/operation-not-allowed') return 'This account change is not enabled in Firebase.';
    return 'The account could not be updated. Please try again.';
}

function changeAccountEmail(event) {
    event.preventDefault();
    const newEmail = document.getElementById('account-new-email')?.value.trim();
    const password = document.getElementById('account-email-password')?.value;
    if (!newEmail || !password || !auth.currentUser) return;
    if (newEmail.toLowerCase() === auth.currentUser.email?.toLowerCase()) {
        setAccountSettingsStatus('Enter a different email address.', true);
        return;
    }

    setAccountSettingsBusy(true);
    setAccountSettingsStatus('Updating email...');
    reauthenticateCurrentUser(password)
        .then(() => {
            if (typeof auth.currentUser.verifyBeforeUpdateEmail === 'function') {
                return auth.currentUser.verifyBeforeUpdateEmail(newEmail).then(() => 'verification');
            }
            return auth.currentUser.updateEmail(newEmail).then(() => 'updated');
        })
        .then(result => {
            event.target.reset();
            refreshAccountEmail();
            setAccountSettingsStatus(
                result === 'verification'
                    ? `Verification sent to ${newEmail}. Open the link to complete the change.`
                    : 'Email address updated.'
            );
        })
        .catch(error => setAccountSettingsStatus(accountUpdateErrorMessage(error), true))
        .finally(() => setAccountSettingsBusy(false));
}

function changeAccountPassword(event) {
    event.preventDefault();
    const currentPassword = document.getElementById('account-current-password')?.value;
    const newPassword = document.getElementById('account-new-password')?.value;
    const confirmation = document.getElementById('account-confirm-password')?.value;
    if (!currentPassword || !newPassword || !confirmation || !auth.currentUser) return;
    if (newPassword.length < 6) {
        setAccountSettingsStatus('The new password must contain at least 6 characters.', true);
        return;
    }
    if (newPassword !== confirmation) {
        setAccountSettingsStatus('The new passwords do not match.', true);
        return;
    }

    setAccountSettingsBusy(true);
    setAccountSettingsStatus('Updating password...');
    reauthenticateCurrentUser(currentPassword)
        .then(() => auth.currentUser.updatePassword(newPassword))
        .then(() => {
            event.target.reset();
            setAccountSettingsStatus('Password updated.');
        })
        .catch(error => setAccountSettingsStatus(accountUpdateErrorMessage(error), true))
        .finally(() => setAccountSettingsBusy(false));
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

function openProfilePhotoPicker() {
    if (!localPlayer) return;
    pendingProfilePhoto = null;
    const dialog = document.getElementById('profile-photo-dialog');
    const preview = document.getElementById('profile-photo-preview');
    const input = document.getElementById('profile-photo-input');
    const confirm = document.getElementById('profile-photo-confirm');
    const reset = document.getElementById('profile-photo-reset');
    const status = document.getElementById('profile-photo-status');
    if (dialog) dialog.classList.remove('hidden');
    if (preview) {
        const current = profilePhotoFor(localPlayer);
        preview.style.backgroundImage = current ? `url("${current}")` : '';
        preview.innerText = current ? '' : playerProfiles[localPlayer]?.initial || '?';
    }
    if (confirm) confirm.disabled = true;
    if (reset) reset.disabled = !profilePhotoFor(localPlayer);
    if (status) status.innerText = 'Choose a photo from your gallery.';
    if (input) {
        input.value = '';
        input.click();
    }
}

function cancelProfilePhotoChange() {
    pendingProfilePhoto = null;
    document.getElementById('profile-photo-dialog')?.classList.add('hidden');
}

function previewProfilePhoto(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    const status = document.getElementById('profile-photo-status');
    if (!file.type.startsWith('image/') || file.size > 12 * 1024 * 1024) {
        if (status) status.innerText = 'Choose an image smaller than 12 MB.';
        return;
    }
    if (status) status.innerText = 'Preparing preview...';
    compressProfilePhoto(file).then(dataUrl => {
        pendingProfilePhoto = dataUrl;
        const preview = document.getElementById('profile-photo-preview');
        if (preview) {
            preview.style.backgroundImage = `url("${dataUrl}")`;
            preview.innerText = '';
        }
        const confirm = document.getElementById('profile-photo-confirm');
        if (confirm) confirm.disabled = false;
        if (status) status.innerText = 'Use this profile picture?';
    }).catch(() => {
        if (status) status.innerText = 'That image could not be processed.';
    });
}

function compressProfilePhoto(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onerror = reject;
        reader.onload = () => {
            const image = new Image();
            image.onerror = reject;
            image.onload = () => {
                const size = 320;
                const canvas = document.createElement('canvas');
                canvas.width = size;
                canvas.height = size;
                const context = canvas.getContext('2d');
                const sourceSize = Math.min(image.naturalWidth, image.naturalHeight);
                const sourceX = (image.naturalWidth - sourceSize) / 2;
                const sourceY = (image.naturalHeight - sourceSize) / 2;
                context.drawImage(image, sourceX, sourceY, sourceSize, sourceSize, 0, 0, size, size);
                let quality = 0.82;
                let dataUrl = canvas.toDataURL('image/jpeg', quality);
                while (dataUrl.length > 180000 && quality > 0.42) {
                    quality -= 0.1;
                    dataUrl = canvas.toDataURL('image/jpeg', quality);
                }
                resolve(dataUrl);
            };
            image.src = reader.result;
        };
        reader.readAsDataURL(file);
    });
}

function confirmProfilePhotoChange() {
    if (!localPlayer || !validProfilePhoto(pendingProfilePhoto)) return;
    const status = document.getElementById('profile-photo-status');
    if (status) status.innerText = 'Saving...';
    database.ref(`profilePhotos/${localPlayer}`).set(pendingProfilePhoto).then(() => {
        cancelProfilePhotoChange();
    }).catch(error => {
        if (status) status.innerText = `Could not save: ${error.message}`;
    });
}

function resetProfilePhoto() {
    if (!localPlayer || !window.confirm('Reset your profile picture to the placeholder?')) return;
    database.ref(`profilePhotos/${localPlayer}`).remove().then(cancelProfilePhotoChange);
}

function initialiseRealtimeFeeds() {
    if (realtimeFeedsStarted || !localPlayer || !auth.currentUser) return;
    realtimeFeedsStarted = true;

    database.ref('messages').limitToLast(RETENTION_LIMIT).on('value', (snapshot) => {
        const data = snapshot.val() || {};
        latestMessages = Object.entries(data)
            .map(([id, value]) => ({ id, ...value }))
            .sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
        renderMessages();
        runRetentionCleanup();
    });

    database.ref('notifications').limitToLast(RETENTION_LIMIT).on('value', (snapshot) => {
        const data = snapshot.val() || {};
        latestNotifications = Object.entries(data)
            .map(([id, value]) => ({ id, ...value }))
            .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
        renderNotifications();
        updateNotificationBadges();
        runRetentionCleanup();
    });

    database.ref('interactions').on('value', (snapshot) => {
        renderInteractionCounters(snapshot.val() || {});
    });

    database.ref('stats').on('value', (snapshot) => {
        latestStats = snapshot.val() || {};
        renderStats();
    });

    database.ref('profilePhotos').on('value', (snapshot) => {
        profilePhotos = snapshot.val() || {};
        refreshVisibleProfilePhotos();
    });

    database.ref('themes').on('value', snapshot => {
        const themes = snapshot.val() || {};
        playerThemes = {
            Peter: normalizeHexColour(themes.Peter) || DEFAULT_THEME_COLOURS.Peter,
            Jadey: normalizeHexColour(themes.Jadey) || DEFAULT_THEME_COLOURS.Jadey
        };
        applyThemeVariables();
        renderMessages();
        renderStats();
        document.querySelectorAll('[id^="count-"] span:first-child').forEach(span => { span.style.color = themeColorFor('Peter'); });
        document.querySelectorAll('[id^="count-"] span:last-child').forEach(span => { span.style.color = themeColorFor('Jadey'); });
        if (!document.getElementById('profile-screen')?.classList.contains('hidden')) openProfileSettings();
    });

    database.ref('games/1-to-10').on('value', (snapshot) => {
        const data = snapshot.val();
        if (!data) return;
        gameState1To10 = normalizeGameState(data);
        handleGameStateUpdate();
    });

    window.setInterval(runRetentionCleanup, 5 * 60 * 1000);
}

function runRetentionCleanup() {
    if (retentionCleanupRunning) return;
    retentionCleanupRunning = true;

    Promise.all([
        pruneCollectionToLimit('messages', RETENTION_LIMIT),
        pruneNotifications()
    ]).catch(error => {
        console.log('Retention cleanup failed:', error);
    }).finally(() => {
        retentionCleanupRunning = false;
    });
}

function pruneCollectionToLimit(path, limit) {
    return database.ref(path).orderByChild('createdAt').once('value').then(snapshot => {
        const entries = [];
        snapshot.forEach(child => {
            entries.push({ id: child.key, ...child.val() });
        });

        if (entries.length <= limit) return null;

        const removals = {};
        entries
            .sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0))
            .slice(0, entries.length - limit)
            .forEach(item => {
                removals[`${path}/${item.id}`] = null;
            });

        return database.ref().update(removals);
    });
}

function pruneNotifications() {
    return database.ref('notifications').orderByChild('createdAt').once('value').then(snapshot => {
        const notifications = [];

        snapshot.forEach(child => {
            notifications.push({ id: child.key, ...child.val() });
        });

        const removals = {};
        const sortedNotifications = notifications
            .sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));

        if (sortedNotifications.length > RETENTION_LIMIT) {
            sortedNotifications
                .slice(0, sortedNotifications.length - RETENTION_LIMIT)
                .forEach(notification => {
                    removals[`notifications/${notification.id}`] = null;
                });
        }

        return Object.keys(removals).length ? database.ref().update(removals) : null;
    });
}

function renderInteractionCounters(counts) {
    Object.keys(interactionConfig).forEach(type => {
        const peterCount = counts?.Peter?.[type] || 0;
        const jadeyCount = counts?.Jadey?.[type] || 0;
        const counter = document.getElementById(`count-${type}`);
        if (counter) {
            counter.innerHTML = `<span style="color: ${themeColorFor('Peter')};">${peterCount}</span>:<span style="color: ${themeColorFor('Jadey')};">${jadeyCount}</span>`;
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
    setActiveAppView('messages');
    const screen = document.getElementById('messages-screen');
    if (screen) screen.classList.remove('hidden');
    applyThemeToScreen('messages-screen', 'messages-header-shell', 'messages-nav-shell');
    refreshSharedHeader('messages');
    renderMessages();
}

function openNotificationsScreen() {
    setActiveAppView('alerts');
    const screen = document.getElementById('notifications-screen');
    if (screen) screen.classList.remove('hidden');
    applyThemeToScreen('notifications-screen', 'notifications-header-shell', 'notifications-nav-shell');
    refreshSharedHeader('notifications');
    renderNotifications();
    markNotificationsRead();
}

function openStatsScreen() {
    setActiveAppView('stats');
    const screen = document.getElementById('stats-screen');
    if (screen) screen.classList.remove('hidden');
    applyThemeToScreen('stats-screen', 'stats-header-shell', 'stats-nav-shell');
    refreshSharedHeader('stats');
    closeStatsCategory();
    renderStats();
}

function openStatsCategory(gameId) {
    document.getElementById('stats-categories')?.classList.add('hidden');
    document.getElementById('stats-number-guess-detail')?.classList.toggle('hidden', gameId !== 'number-guess');
    document.getElementById('stats-word-search-detail')?.classList.toggle('hidden', gameId !== 'word-search');
    document.getElementById('stats-battleship-detail')?.classList.toggle('hidden', gameId !== 'battleship');
    document.getElementById('stats-connect-four-detail')?.classList.toggle('hidden', gameId !== 'connect-four');
    document.getElementById('stats-sudoku-detail')?.classList.toggle('hidden', gameId !== 'sudoku');
    document.getElementById('stats-tic-tac-toe-detail')?.classList.toggle('hidden', gameId !== 'tic-tac-toe');
    document.getElementById('stats-rps-detail')?.classList.toggle('hidden', gameId !== 'rps');
    if (gameId === 'word-search' && typeof renderWordSearchStats === 'function') renderWordSearchStats();
    if (gameId === 'battleship' && typeof renderBattleshipStats === 'function') renderBattleshipStats();
    if (gameId === 'connect-four' && typeof renderConnectFourStats === 'function') renderConnectFourStats();
    if (gameId === 'sudoku' && typeof renderSudokuStats === 'function') renderSudokuStats();
    if (gameId === 'tic-tac-toe' && typeof renderTicTacToeStats === 'function') renderTicTacToeStats();
    if (gameId === 'rps' && typeof renderRpsStats === 'function') renderRpsStats();
}

function closeStatsCategory() {
    document.getElementById('stats-categories')?.classList.remove('hidden');
    document.getElementById('stats-number-guess-detail')?.classList.add('hidden');
    document.getElementById('stats-word-search-detail')?.classList.add('hidden');
    document.getElementById('stats-battleship-detail')?.classList.add('hidden');
    document.getElementById('stats-connect-four-detail')?.classList.add('hidden');
    document.getElementById('stats-sudoku-detail')?.classList.add('hidden');
    document.getElementById('stats-tic-tac-toe-detail')?.classList.add('hidden');
    document.getElementById('stats-rps-detail')?.classList.add('hidden');
}

function renderStats() {
    ['Peter', 'Jadey'].forEach(player => {
        const key = player.toLowerCase();
        const ten = latestStats?.[player]?.ten || 0;
        const hundred = latestStats?.[player]?.hundred || 0;
        const colours = latestStats?.[player]?.colours || 0;
        const total = ten + hundred + colours;

        const values = { ten, hundred, colours, total };
        Object.entries(values).forEach(([mode, value]) => {
            const element = document.getElementById(`stats-${key}-${mode}`);
            if (element) element.innerText = value;
        });
    });
    if (typeof renderWordSearchStats === 'function') renderWordSearchStats();
    if (typeof renderBattleshipStats === 'function') renderBattleshipStats();
    if (typeof renderConnectFourStats === 'function') renderConnectFourStats();
    if (typeof renderSudokuStats === 'function') renderSudokuStats();
    if (typeof renderTicTacToeStats === 'function') renderTicTacToeStats();
    if (typeof renderRpsStats === 'function') renderRpsStats();
}

function sendMessage(event) {
    event.preventDefault();
    const input = document.getElementById('message-input');
    const text = input?.value.trim();
    if (!text || !localPlayer) return;

    const recipient = otherPlayer(localPlayer);
    const senderNickname = playerProfiles[localPlayer]?.nickname || localPlayer;

    const messageRef = database.ref('messages').push();
    messageRef.set({
        sender: localPlayer,
        recipient,
        text,
        createdAt: Date.now()
    });
    sendAppNotification({
        type: `Message from ${senderNickname}`,
        action: 'reply',
        messageId: messageRef.key,
        sender: localPlayer,
        recipient,
        body: text,
        createdAt: Date.now(),
        readBy: {}
    }, 'messages');

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

        const photo = profilePhotoFor(message.sender);
        const avatar = `<div class="message-avatar ${photo ? 'has-photo' : ''}"${photo ? ` style="background-image:url('${photo}')"` : ''}>${photo ? '' : senderProfile.initial}</div>`;
        const meta = mine
            ? `<time>${timeLabel}</time><span>${senderProfile.nickname}</span>`
            : `<span>${senderProfile.nickname}</span><time>${timeLabel}</time>`;
        const bubbleActions = mine
            ? `onpointerdown="startMessageHold(event, '${message.id}')" onpointerup="cancelMessageHold()" onpointercancel="cancelMessageHold()" onpointerleave="cancelMessageHold()"`
            : '';
        const bubble = `
            <div class="message-stack">
                <div class="message-meta">${meta}</div>
                <div class="message-bubble" ${bubbleActions} style="background-color: ${themeColorFor(message.sender)}; color: ${textColorFor(themeColorFor(message.sender))};">${escapeHtml(message.text || '')}</div>
            </div>
        `;

        return `${divider}<div class="message-row ${mine ? 'mine' : ''}">${mine ? `${bubble}${avatar}` : `${avatar}${bubble}`}</div>`;
    }).join('');

    thread.scrollTop = thread.scrollHeight;
}

function renderNotifications() {
    const list = document.getElementById('notifications-list');
    if (!list || !localPlayer) return;

    const visibleNotifications = latestNotifications.filter(notification => notification.recipient === localPlayer);
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

        const navigationButton = (label, actionName, value = '') => responded
            ? `<button disabled>${label}</button>`
            : `<button onclick="handleNotificationAction('${notification.id}', '${actionName}', '${value}')">${label}</button>`;

        if (notification.action === 'send-back' && isRecipient) {
            action = `<button ${responded ? 'disabled' : ''} onclick="sendInteractionBack('${notification.id}', '${notification.interactionType}')">${responded ? 'Sent' : 'Send back'}</button>`;
        } else if (notification.action === 'reply' && isRecipient) {
            action = navigationButton('Reply', 'messages');
        } else if (notification.action === 'check-game' && isRecipient) {
            action = navigationButton('Check', 'game', 'number-guess');
        } else if (notification.action === 'approve-wordsearch-grid' && isRecipient) {
            action = responded
                ? '<button disabled>Answered</button>'
                : `<div class="notification-actions"><button onclick="respondToWordSearchGridRequest('${notification.id}', '${notification.requestId}', true)">Approve</button><button class="secondary-action" onclick="respondToWordSearchGridRequest('${notification.id}', '${notification.requestId}', false)">Decline</button></div>`;
        } else if (notification.action === 'join-wordsearch-versus' && isRecipient) {
            action = navigationButton('Join', 'wordsearch-versus', String(Number(notification.difficulty) || 7));
        } else if (notification.action === 'join-battleship' && isRecipient) {
            action = navigationButton('Join', 'game', 'battleship');
        } else if (notification.action === 'check-battleship' && isRecipient) {
            action = navigationButton('Check', 'game', 'battleship');
        } else if (notification.action === 'join-connect-four' && isRecipient) {
            action = navigationButton('Join', 'game', 'connect-four');
        } else if (notification.action === 'check-connect-four' && isRecipient) {
            action = navigationButton('Check', 'game', 'connect-four');
        } else if (notification.action === 'join-sudoku-versus' && isRecipient) {
            action = navigationButton('Join', 'sudoku-versus', notification.difficulty || 'easy');
        } else if (notification.action === 'check-sudoku' && isRecipient) {
            action = navigationButton('Check', 'game', 'sudoku');
        } else if (notification.action === 'join-tic-tac-toe' && isRecipient) {
            action = navigationButton('Join', 'game', 'tic-tac-toe');
        } else if (notification.action === 'check-tic-tac-toe' && isRecipient) {
            action = navigationButton('Check', 'game', 'tic-tac-toe');
        } else if (notification.action === 'join-rps' && isRecipient) {
            action = navigationButton('Join', 'game', 'rps');
        } else if (notification.action === 'check-rps' && isRecipient) {
            action = navigationButton('Check', 'game', 'rps');
        }

        return `
            <div class="notification-card" onpointerdown="startNotificationSwipe(event, '${notification.id}')" onpointermove="moveNotificationSwipe(event)" onpointerup="finishNotificationSwipe(event)" onpointercancel="cancelNotificationSwipe()">
                <div>
                    <div class="notification-meta"><span class="notification-type">${escapeHtml(notification.type || 'Update')}</span><time>${timeLabel}</time></div>
                    <div class="notification-body">${escapeHtml(notification.body || '')}</div>
                </div>
                ${action}
            </div>
        `;
    }).join('');
}

function startMessageHold(event, messageId) {
    const message = latestMessages.find(item => item.id === messageId);
    if (!message || message.sender !== localPlayer) return;
    event.preventDefault();
    window.getSelection?.()?.removeAllRanges?.();
    cancelMessageHold();
    messageHoldTimer = window.setTimeout(() => {
        window.getSelection?.()?.removeAllRanges?.();
        openMessageActionMenu(messageId, event.clientX, event.clientY);
    }, 520);
}

function cancelMessageHold() {
    if (messageHoldTimer) window.clearTimeout(messageHoldTimer);
    messageHoldTimer = null;
}

function openMessageActionMenu(messageId, x, y) {
    const message = latestMessages.find(item => item.id === messageId);
    if (!message || message.sender !== localPlayer) return;
    selectedMessageActionId = messageId;
    const menu = document.getElementById('message-action-menu');
    if (!menu) return;
    menu.classList.remove('hidden');
    const left = Math.min(Math.max(12, (x || window.innerWidth / 2) - 72), window.innerWidth - 156);
    const preferredTop = (y || window.innerHeight / 2) - 164;
    const fallbackTop = (y || window.innerHeight / 2) + 22;
    const top = preferredTop >= 12
        ? preferredTop
        : Math.min(fallbackTop, window.innerHeight - 154);
    menu.style.left = `${left}px`;
    menu.style.top = `${top}px`;
}

function closeMessageActionMenu() {
    selectedMessageActionId = null;
    document.getElementById('message-action-menu')?.classList.add('hidden');
}

document.addEventListener('pointerdown', event => {
    const menu = document.getElementById('message-action-menu');
    if (!menu || menu.classList.contains('hidden')) return;
    if (menu.contains(event.target)) return;
    closeMessageActionMenu();
});

function editSelectedMessage() {
    const message = latestMessages.find(item => item.id === selectedMessageActionId);
    if (!message || message.sender !== localPlayer) {
        closeMessageActionMenu();
        return;
    }
    const updated = window.prompt('Edit message', message.text || '');
    if (updated !== null) {
        const text = updated.trim();
        if (text) database.ref(`messages/${message.id}/text`).set(text);
    }
    closeMessageActionMenu();
}

function deleteSelectedMessage() {
    const message = latestMessages.find(item => item.id === selectedMessageActionId);
    if (!message || message.sender !== localPlayer) {
        closeMessageActionMenu();
        return;
    }
    if (window.confirm('Delete this message?')) {
        Promise.all([
            database.ref(`messages/${message.id}`).remove(),
            removeNotificationsForMessage(message)
        ]);
    }
    closeMessageActionMenu();
}

function startNotificationSwipe(event, notificationId) {
    if (event.target?.closest?.('button')) return;
    const card = event.currentTarget;
    notificationSwipe = {
        id: notificationId,
        startX: event.clientX,
        startY: event.clientY,
        dx: 0,
        card
    };
    card.setPointerCapture?.(event.pointerId);
}

function moveNotificationSwipe(event) {
    if (!notificationSwipe || notificationSwipe.card !== event.currentTarget) return;
    const dx = event.clientX - notificationSwipe.startX;
    const dy = event.clientY - notificationSwipe.startY;
    if (Math.abs(dy) > Math.abs(dx) && Math.abs(dy) > 12) return;
    notificationSwipe.dx = dx;
    const opacity = Math.max(0.25, 1 - Math.abs(dx) / 180);
    notificationSwipe.card.style.transform = `translateX(${dx}px)`;
    notificationSwipe.card.style.opacity = String(opacity);
}

function finishNotificationSwipe(event) {
    if (!notificationSwipe || notificationSwipe.card !== event.currentTarget) return;
    const { id, dx, card } = notificationSwipe;
    notificationSwipe = null;
    if (Math.abs(dx) > 86) {
        card.style.transform = `translateX(${dx > 0 ? 110 : -110}vw)`;
        card.style.opacity = '0';
        window.setTimeout(() => database.ref(`notifications/${id}`).remove(), 180);
        return;
    }
    card.style.transform = '';
    card.style.opacity = '';
}

function cancelNotificationSwipe() {
    if (notificationSwipe?.card) {
        notificationSwipe.card.style.transform = '';
        notificationSwipe.card.style.opacity = '';
    }
    notificationSwipe = null;
}

function handleNotificationAction(notificationId, actionName, value) {
    database.ref(`notifications/${notificationId}/respondedBy/${localPlayer}`).set(true).then(() => {
        if (actionName === 'messages') switchTab('messages');
        if (actionName === 'game') launchGame(value);
        if (actionName === 'wordsearch-versus') joinWordSearchVersus(Number(value) || 7);
        if (actionName === 'sudoku-versus') joinSudokuVersus(value || 'easy');
    });
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
    const readTimestamp = Date.now();
    const updates = {};

    latestNotifications.forEach(notification => {
        const isRecipient = notification.recipient === localPlayer;
        const isRead = notification.readBy && notification.readBy[localPlayer];
        const hasReadTimestamp = notification.readAt && notification.readAt[localPlayer];

        if (isRecipient && (!isRead || !hasReadTimestamp)) {
            updates[`notifications/${notification.id}/readBy/${localPlayer}`] = true;
            updates[`notifications/${notification.id}/readAt/${localPlayer}`] = readTimestamp;
        }
    });

    if (Object.keys(updates).length) database.ref().update(updates);
}

function escapeHtml(value) {
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function respondToWordSearchGridRequest(notificationId, requestId, approved) {
    const action = approved ? approveCoopWordSearchRequest(requestId) : rejectCoopWordSearchRequest(requestId);
    Promise.resolve(action).then(() => {
        database.ref(`notifications/${notificationId}/respondedBy/${localPlayer}`).set(true);
    });
}

function openManagementScreen() {
    if (localPlayer !== 'Peter') return;

    document.querySelectorAll('.screen').forEach(screen => screen.classList.add('hidden'));
    const screen = document.getElementById('management-screen');
    const header = document.getElementById('management-header-shell');
    if (screen) screen.classList.remove('hidden');
    if (header) {
        header.classList.remove('header-peter', 'header-jadey');
        header.classList.add('header-peter');
    }
    syncManagedScoreControls();
    setManagementStatus('');
}

function getManagedProfile() {
    return document.getElementById('management-profile')?.value || 'Peter';
}

function setManagementStatus(message) {
    const status = document.getElementById('management-status');
    if (status) status.innerText = message;
}

function selectedProfiles(selectId) {
    const selection = document.getElementById(selectId)?.value || 'Peter';
    return selection === 'both' ? ['Peter', 'Jadey'] : [selection];
}

function removeMatchingChildren(path, predicate) {
    return database.ref(path).once('value').then(snapshot => {
        const updates = {};
        snapshot.forEach(child => {
            if (predicate(child.val() || {})) updates[`${path}/${child.key}`] = null;
        });
        return Object.keys(updates).length ? database.ref().update(updates) : null;
    });
}

function clearManagedCommunication(kind) {
    if (localPlayer !== 'Peter') return;
    const profiles = selectedProfiles('management-profile');
    const targetLabel = profiles.length === 2 ? 'both profiles' : profiles[0];
    if (!window.confirm(`Delete ${kind === 'both' ? 'messages and notifications' : kind} for ${targetLabel}?`)) return;

    const tasks = [];
    if (kind === 'notifications' || kind === 'both') {
        tasks.push(removeMatchingChildren('notifications', item => profiles.includes(item.recipient)));
    }
    if (kind === 'messages' || kind === 'both') {
        tasks.push(removeMatchingChildren('messages', item =>
            profiles.includes(item.sender) || profiles.includes(item.recipient)
        ));
    }

    Promise.all(tasks)
        .then(() => setManagementStatus(`Deleted ${kind === 'both' ? 'messages and notifications' : kind} for ${targetLabel}.`))
        .catch(error => setManagementStatus(`Could not delete data: ${error.message}`));
}

function adjustCounter(path, operation) {
    return database.ref(path).transaction(current => {
        const value = Number(current) || 0;
        if (operation === 'reset') return 0;
        if (operation === 'increment-time') return value + 1000;
        if (operation === 'decrement-time') return Math.max(0, value - 1000);
        if (operation === 'increment') return value + 1;
        return Math.max(0, value - 1);
    });
}

function adjustManagedScores(operation) {
    if (localPlayer !== 'Peter') return;
    const profiles = selectedProfiles('score-profile');
    const game = document.getElementById('score-game')?.value || 'number-guess';
    const selectedMode = document.getElementById('score-mode')?.value || 'all';
    const multiplayerPuzzleGame = game === 'word-search' || game === 'sudoku';
    const duelGame = game === 'tic-tac-toe' || game === 'rps';
    const availableModes = multiplayerPuzzleGame
        ? ['solo', 'coop', 'versus', 'versusAi']
        : duelGame
            ? ['versus', 'versusAi']
            : ['ten', 'hundred', 'colours'];
    const modes = selectedMode === 'all' ? availableModes : [selectedMode];
    if (operation === 'reset' && !window.confirm('Reset the selected game scores to zero?')) return;

    let scoreTargets;
    if (game === 'word-search') {
        const selectedDifficulty = document.getElementById('score-difficulty')?.value || 'all';
        const difficulties = selectedDifficulty === 'all' ? [5, 6, 7, 8, 9] : [Number(selectedDifficulty)];
        const selectedAiDifficulty = selectedMode === 'versusAi'
            ? (document.getElementById('score-ai-difficulty')?.value || 'all')
            : 'all';
        const aiDifficulties = selectedAiDifficulty === 'all' ? ['easy', 'medium', 'hard'] : [selectedAiDifficulty];
        const selectedMetric = document.getElementById('score-metric')?.value || 'all';
        const metrics = selectedMetric === 'all'
            ? ['completedGrids', 'wordsFound', 'bestTime', 'wins', 'losses']
            : [selectedMetric];
        scoreTargets = profiles.flatMap(profile => modes.flatMap(mode =>
            difficulties.flatMap(difficulty => metrics.flatMap(metric => {
                const targets = mode === 'versusAi'
                    ? aiDifficulties.map(aiDifficulty => `stats/wordSearch/${profile}/${mode}/${difficulty}/${aiDifficulty}/${metric}`)
                    : [`stats/wordSearch/${profile}/${mode}/${difficulty}/${metric}`];
                return targets.map(path => ({
                    path,
                    isTime: metric === 'bestTime'
                }));
            }))
        ));
    } else if (game === 'battleship') {
        const selectedMetric = document.getElementById('battleship-score-metric')?.value || 'all';
        const metrics = selectedMetric === 'all'
            ? ['wins', 'losses', 'gamesPlayed', 'shots', 'hits', 'shipsSunk']
            : [selectedMetric];
        scoreTargets = profiles.flatMap(profile => metrics.map(metric => ({
            path: `stats/battleship/${profile}/${metric}`,
            isTime: false
        })));
    } else if (game === 'connect-four') {
        const selectedMetric = document.getElementById('connect-four-score-metric')?.value || 'all';
        const metrics = selectedMetric === 'all'
            ? ['wins', 'losses', 'draws', 'gamesPlayed', 'tokensPlaced']
            : [selectedMetric];
        scoreTargets = profiles.flatMap(profile => metrics.map(metric => ({
            path: `stats/connectFour/${profile}/${metric}`,
            isTime: false
        })));
    } else if (game === 'tic-tac-toe') {
        const selectedMetric = document.getElementById('duel-score-metric')?.value || 'all';
        const metrics = selectedMetric === 'all'
            ? ['wins', 'losses', 'draws', 'gamesPlayed', 'moves']
            : [selectedMetric];
        scoreTargets = profiles.flatMap(profile => modes.flatMap(mode => metrics.map(metric => ({
            path: `stats/ticTacToe/${profile}/${mode}/${metric}`,
            isTime: false
        }))));
    } else if (game === 'rps') {
        const selectedMetric = document.getElementById('duel-score-metric')?.value || 'all';
        const metrics = selectedMetric === 'all'
            ? ['wins', 'losses', 'draws', 'roundsPlayed']
            : [selectedMetric];
        scoreTargets = profiles.flatMap(profile => modes.flatMap(mode => metrics.map(metric => ({
            path: `stats/rps/${profile}/${mode}/${metric}`,
            isTime: false
        }))));
    } else if (game === 'sudoku') {
        const selectedDifficulty = document.getElementById('score-difficulty')?.value || 'all';
        const difficulties = selectedDifficulty === 'all' ? ['easy', 'medium', 'hard'] : [selectedDifficulty];
        const selectedAiDifficulty = selectedMode === 'versusAi'
            ? (document.getElementById('score-ai-difficulty')?.value || 'all')
            : 'all';
        const aiDifficulties = selectedAiDifficulty === 'all' ? ['easy', 'medium', 'hard'] : [selectedAiDifficulty];
        const selectedMetric = document.getElementById('sudoku-score-metric')?.value || 'all';
        const metrics = selectedMetric === 'all'
            ? ['completedPuzzles', 'bestTime', 'wins', 'losses']
            : [selectedMetric];
        scoreTargets = profiles.flatMap(profile => modes.flatMap(mode =>
            difficulties.flatMap(difficulty => metrics.flatMap(metric => {
                const targets = mode === 'versusAi'
                    ? aiDifficulties.map(aiDifficulty => `stats/sudoku/${profile}/${mode}/${difficulty}/${aiDifficulty}/${metric}`)
                    : [`stats/sudoku/${profile}/${mode}/${difficulty}/${metric}`];
                return targets.map(path => ({
                    path,
                    isTime: metric === 'bestTime'
                }));
            }))
        ));
    } else {
        scoreTargets = profiles.flatMap(profile => modes.map(mode => ({
            path: `stats/${profile}/${mode}`,
            isTime: false
        })));
    }

    Promise.all(scoreTargets.map(target => {
        const targetOperation = target.isTime
            ? (operation === 'increment' ? 'increment-time' : operation === 'decrement' ? 'decrement-time' : 'reset')
            : operation;
        return adjustCounter(target.path, targetOperation);
    })).then(() => {
        setManagementStatus(`Score operation completed for ${profiles.length === 2 ? 'both profiles' : profiles[0]}.`);
    }).catch(error => setManagementStatus(`Could not adjust scores: ${error.message}`));
}

function syncManagedScoreControls() {
    const isWordSearch = document.getElementById('score-game')?.value === 'word-search';
    const isBattleship = document.getElementById('score-game')?.value === 'battleship';
    const isConnectFour = document.getElementById('score-game')?.value === 'connect-four';
    const isSudoku = document.getElementById('score-game')?.value === 'sudoku';
    const isDuelGame = document.getElementById('score-game')?.value === 'tic-tac-toe' || document.getElementById('score-game')?.value === 'rps';
    const modeSelect = document.getElementById('score-mode');
    const extraOptions = document.getElementById('score-word-search-options');
    const difficultySelect = document.getElementById('score-difficulty');
    const aiDifficultySelect = document.getElementById('score-ai-difficulty');
    const battleshipOptions = document.getElementById('score-battleship-options');
    const connectFourOptions = document.getElementById('score-connect-four-options');
    const sudokuOptions = document.getElementById('score-sudoku-options');
    const duelOptions = document.getElementById('score-duel-options');
    const duelMetricSelect = document.getElementById('duel-score-metric');
    if (!modeSelect || !extraOptions || !difficultySelect || !aiDifficultySelect || !battleshipOptions || !connectFourOptions || !sudokuOptions || !duelOptions || !duelMetricSelect) return;

    const previousMode = modeSelect.value;
    modeSelect.innerHTML = (isWordSearch || isSudoku)
        ? '<option value="all">All modes</option><option value="solo">Solo</option><option value="coop">Co-op</option><option value="versus">Versus: Player</option><option value="versusAi">Versus: Jaylin</option>'
        : isDuelGame
            ? '<option value="all">All modes</option><option value="versus">Versus: Player</option><option value="versusAi">Versus: Jaylin</option>'
            : '<option value="all">All modes</option><option value="ten">1 to 10</option><option value="hundred">1 to 100</option><option value="colours">Colours</option>';
    if (Array.from(modeSelect.options).some(option => option.value === previousMode)) {
        modeSelect.value = previousMode;
    }
    difficultySelect.innerHTML = isSudoku
        ? '<option value="all">All difficulties</option><option value="easy">Easy</option><option value="medium">Medium</option><option value="hard">Hard</option>'
        : '<option value="all">All difficulties</option><option value="5">5 x 5</option><option value="6">6 x 6</option><option value="7">7 x 7</option><option value="8">8 x 8</option><option value="9">9 x 9</option>';
    extraOptions.classList.toggle('hidden', !(isWordSearch || isSudoku));
    const showAiDifficulty = (isWordSearch || isSudoku) && modeSelect.value === 'versusAi';
    document.querySelector('label[for="score-ai-difficulty"]')?.classList.toggle('hidden', !showAiDifficulty);
    aiDifficultySelect.classList.toggle('hidden', !showAiDifficulty);
    document.querySelector('label[for="score-metric"]')?.classList.toggle('hidden', isSudoku);
    document.getElementById('score-metric')?.classList.toggle('hidden', isSudoku);
    battleshipOptions.classList.toggle('hidden', !isBattleship);
    connectFourOptions.classList.toggle('hidden', !isConnectFour);
    sudokuOptions.classList.toggle('hidden', !isSudoku);
    duelOptions.classList.toggle('hidden', !isDuelGame);
    const previousMetric = duelMetricSelect.value;
    duelMetricSelect.innerHTML = document.getElementById('score-game')?.value === 'rps'
        ? '<option value="all">All statistics</option><option value="wins">Wins</option><option value="losses">Losses</option><option value="draws">Draws</option><option value="roundsPlayed">Rounds played</option>'
        : '<option value="all">All statistics</option><option value="wins">Wins</option><option value="losses">Losses</option><option value="draws">Draws</option><option value="gamesPlayed">Games played</option><option value="moves">Moves</option>';
    if (Array.from(duelMetricSelect.options).some(option => option.value === previousMetric)) {
        duelMetricSelect.value = previousMetric;
    }
    modeSelect.classList.toggle('hidden', isBattleship || isConnectFour);
    document.querySelector('label[for="score-mode"]')?.classList.toggle('hidden', isBattleship || isConnectFour);
}

function adjustManagedInteractions(operation) {
    if (localPlayer !== 'Peter') return;
    const profiles = selectedProfiles('interaction-profile');
    const selectedType = document.getElementById('interaction-type')?.value || 'all';
    const types = selectedType === 'all' ? ['hearts', 'hugs', 'kisses'] : [selectedType];
    if (operation === 'reset' && !window.confirm('Reset the selected interaction scores to zero?')) return;

    Promise.all(profiles.flatMap(profile =>
        types.map(type => adjustCounter(`interactions/${profile}/${type}`, operation))
    )).then(() => {
        setManagementStatus(`Interaction operation completed for ${profiles.length === 2 ? 'both profiles' : profiles[0]}.`);
    }).catch(error => setManagementStatus(`Could not adjust interactions: ${error.message}`));
}

// =========================================================================
// 1 TO 10 MULTIPLAYER GAME WORKSPACE
// =========================================================================
function launchGame(gameId) {
    if (gameId === 'word-search') {
        launchWordSearch();
        return;
    }
    if (gameId === 'battleship') {
        launchBattleship();
        return;
    }
    if (gameId === 'connect-four') {
        launchConnectFour();
        return;
    }
    if (gameId === 'sudoku') {
        launchSudoku();
        return;
    }
    if (gameId === 'tic-tac-toe') {
        launchTicTacToe();
        return;
    }
    if (gameId === 'rps') {
        launchRps();
        return;
    }
    if (gameId !== 'number-guess') return;
    setActiveAppView('number-guess');

    document.querySelectorAll('.screen').forEach(screen => screen.classList.add('hidden'));

    const gameScreen = document.getElementById('game-1-to-10-screen');
    const headerShell = document.getElementById('game-header-shell');
    const navShell = document.getElementById('game-board-nav-shell');
    const currentProfile = playerProfiles[localPlayer] || { nickname: localPlayer, initial: '?' };

    const topNick = document.getElementById('game-top-nickname');
    const topInitial = document.getElementById('game-top-initial');
    if (topNick) topNick.innerText = currentProfile.nickname;
    renderProfileAvatar(topInitial, localPlayer);

    currentSelectedGuess = null;
    isRevealingRound = false;
    lastNumberGuessTurnCueKey = null;

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
    showNumberGuessPlayArea();

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
        resetVisualCards();
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

function getNumberGuessActingPlayer(state = gameState1To10) {
    if (state.phase === 'SETTING_TARGET') return state.targetSetter;
    if (state.phase === 'GUESSING') return state.guesser;
    return null;
}

function numberGuessTurnCueKey(state = gameState1To10) {
    const actingPlayer = getNumberGuessActingPlayer(state);
    if (!actingPlayer) return null;
    return `${state.phase}:${actingPlayer}:${state.mode}:${state.targetSetter}:${state.guesser}:${state.chosenTargetValue ?? 'unset'}`;
}

function maybeShowNumberGuessTurnCue() {
    const gameScreen = document.getElementById('game-1-to-10-screen');
    if (!gameScreen || gameScreen.classList.contains('hidden')) return;
    if (isRevealingRound || getNumberGuessActingPlayer() !== localPlayer) return;

    const cueKey = numberGuessTurnCueKey();
    if (!cueKey || cueKey === lastNumberGuessTurnCueKey) return;
    lastNumberGuessTurnCueKey = cueKey;

    const overlay = document.getElementById('number-guess-turn-overlay');
    if (!overlay) return;
    overlay.classList.remove('hidden', 'show-turn-cue');
    void overlay.offsetWidth;
    overlay.classList.add('show-turn-cue');
    window.setTimeout(() => overlay.classList.add('hidden'), 1050);
}

function formatNumberGuessValue(modeKey, value) {
    const mode = gameModes[modeKey] || gameModes.ten;
    if (mode.inputType !== 'colours') return value ?? '?';
    return mode.values.find(colour => colour.value === value)?.name || value || '?';
}

function getNumberGuessColour(modeKey, value) {
    const mode = gameModes[modeKey] || gameModes.ten;
    if (mode.inputType !== 'colours') return null;
    return mode.values.find(colour => colour.value === value) || null;
}

function miniNumberGuessCard(modeKey, value) {
    const colour = getNumberGuessColour(modeKey, value);
    if (!colour) return `<span class="history-mini-card">${escapeHtml(formatNumberGuessValue(modeKey, value))}</span>`;
    return `<span class="history-mini-card colour ${colour.light ? 'light-label' : ''}" style="background-color: ${colour.color};">${escapeHtml(colour.name)}</span>`;
}

function recordNumberGuessHistory(round, wasCorrect) {
    const points = { Peter: 0, Jadey: 0 };
    if (wasCorrect) points[round.guesser] = 1;
    const record = {
        mode: round.mode || 'ten',
        setter: round.targetSetter,
        guesser: round.guesser,
        target: round.chosenTargetValue,
        guess: round.currentGuessValue,
        correct: Boolean(wasCorrect),
        points,
        completedAt: Date.now()
    };

    const historyRef = database.ref('history/numberGuess');
    return historyRef.push(record).then(() =>
        historyRef.orderByChild('completedAt').once('value').then(snapshot => {
            const removals = [];
            snapshot.forEach(child => removals.push(child.key));
            const extra = removals.length - 7;
            if (extra <= 0) return null;
            const updates = {};
            removals.slice(0, extra).forEach(key => { updates[`history/numberGuess/${key}`] = null; });
            return database.ref().update(updates);
        })
    );
}

function showNumberGuessRoundSummary(round, wasCorrect) {
    const summary = document.getElementById('number-guess-round-summary');
    if (!summary) return;
    const guesserName = playerProfiles[round.guesser]?.nickname || round.guesser;
    summary.innerHTML = wasCorrect
        ? `<strong>${escapeHtml(guesserName)} scored!</strong><span>Roles swapped</span>`
        : '<strong>No point this round</strong><span>Roles swapped</span>';
    summary.classList.remove('hidden', 'show-round-summary');
    void summary.offsetWidth;
    summary.classList.add('show-round-summary');
    window.clearTimeout(numberGuessSummaryTimer);
    numberGuessSummaryTimer = window.setTimeout(() => summary.classList.add('hidden'), 1800);
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
        submitStrip.innerText = `CHOOSE A ${getCurrentMode().valueLabel.toUpperCase()}`;
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
            submitStrip.innerText = `CHOOSE A ${getCurrentMode().valueLabel.toUpperCase()}`;
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
        sendAppNotification({
            type: 'Game Update',
            action: 'check-game',
            sender: localPlayer,
            recipient: otherPlayer(localPlayer),
            body: `${playerProfiles[localPlayer]?.nickname || localPlayer} has finished their turn in ${getCurrentMode().title}`,
            createdAt: Date.now(),
            readBy: {}
        }, 'number-guess');
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

        const wasCorrect =
            revealRound.currentGuessValue !== null &&
            revealRound.currentGuessValue === revealRound.chosenTargetValue;
        if (committed && wasCorrect) {
            const scoringPlayer = revealRound.guesser;
            const scoringMode = revealRound.mode || 'ten';
            database.ref(`stats/${scoringPlayer}/${scoringMode}`).transaction(score => (score || 0) + 1);
        }
        if (committed) {
            recordNumberGuessHistory(revealRound, wasCorrect).catch(error => console.log('History save failed:', error));
            showNumberGuessRoundSummary(revealRound, wasCorrect);
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
        maybeShowNumberGuessTurnCue();
    }
}

function showNumberGuessPlayArea() {
    document.getElementById('number-guess-play-area')?.classList.remove('hidden', 'number-guess-blurred-field');
    const menuArea = document.getElementById('number-guess-menu-area');
    if (menuArea) {
        menuArea.classList.add('hidden');
        menuArea.classList.remove('number-guess-pause-view', 'number-guess-submenu-view');
    }
    ['number-guess-pause-panel', 'number-guess-modes-panel', 'number-guess-history-panel'].forEach(id => {
        document.getElementById(id)?.classList.add('hidden');
    });
}

function openNumberGuessMenu(view = 'pause') {
    const viewConfig = {
        pause: { title: 'Paused', activePanel: 'number-guess-pause-panel', screenClass: 'number-guess-pause-view' },
        modes: { title: 'Modes', activePanel: 'number-guess-modes-panel', screenClass: 'number-guess-submenu-view' },
        history: { title: 'History', activePanel: 'number-guess-history-panel', screenClass: 'number-guess-submenu-view' }
    }[view] || { title: 'Paused', activePanel: 'number-guess-pause-panel', screenClass: 'number-guess-pause-view' };

    setActiveAppView(`number-guess-${view}`);
    const gameScreen = document.getElementById('game-1-to-10-screen');
    const menuArea = document.getElementById('number-guess-menu-area');
    const playArea = document.getElementById('number-guess-play-area');
    document.querySelectorAll('.screen').forEach(screen => screen.classList.add('hidden'));
    if (gameScreen) {
        gameScreen.classList.remove('hidden');
        gameScreen.classList.remove('theme-peter', 'theme-jadey');
        gameScreen.classList.add(localPlayer === 'Peter' ? 'theme-peter' : 'theme-jadey');
    }
    if (playArea) {
        playArea.classList.toggle('hidden', view !== 'pause');
        playArea.classList.toggle('number-guess-blurred-field', view === 'pause');
    }
    if (menuArea) {
        menuArea.classList.remove('hidden', 'number-guess-pause-view', 'number-guess-submenu-view');
        menuArea.classList.add(viewConfig.screenClass);
    }
    ['number-guess-pause-panel', 'number-guess-modes-panel', 'number-guess-history-panel'].forEach(id => {
        document.getElementById(id)?.classList.toggle('hidden', id !== viewConfig.activePanel);
    });
    if (view === 'modes') updateModeButtons();
    if (view === 'history') loadNumberGuessHistory();
}

function openNumberGuessPause() {
    openNumberGuessMenu('pause');
}

function openModesSelection() {
    openNumberGuessMenu('modes');
}

function openNumberGuessHistory() {
    openNumberGuessMenu('history');
}

function loadNumberGuessHistory() {
    const list = document.getElementById('number-guess-history-list');
    if (!list) return;
    list.innerHTML = '<p class="history-empty">Loading history...</p>';
    database.ref('history/numberGuess').orderByChild('completedAt').limitToLast(7).once('value')
        .then(snapshot => {
            const records = [];
            snapshot.forEach(child => records.push({ id: child.key, ...child.val() }));
            renderNumberGuessHistory(records.reverse());
        })
        .catch(error => {
            list.innerHTML = `<p class="history-empty">Could not load history: ${escapeHtml(error.message)}</p>`;
        });
}

function renderNumberGuessHistory(records) {
    const list = document.getElementById('number-guess-history-list');
    if (!list) return;
    if (!records.length) {
        list.innerHTML = '<p class="history-empty">No completed rounds yet.</p>';
        return;
    }

    list.innerHTML = records.map(round => {
        const mode = gameModes[round.mode] || gameModes.ten;
        const setter = round.setter || 'Peter';
        const guesser = round.guesser || otherPlayer(setter);
        const setterName = playerProfiles[setter]?.nickname || setter;
        const guesserName = playerProfiles[guesser]?.nickname || guesser;
        const peterPoints = Number(round.points?.Peter) || 0;
        const jadeyPoints = Number(round.points?.Jadey) || 0;
        const resultClass = round.correct ? 'correct' : 'missed';
        return `
            <article class="history-card ${resultClass}">
                <h3>${escapeHtml(mode.title)}</h3>
                <div class="history-match-row">
                    <strong>${escapeHtml(setterName)}</strong>
                    ${miniNumberGuessCard(round.mode, round.target)}
                    <span class="history-divider">:</span>
                    ${miniNumberGuessCard(round.mode, round.guess)}
                    <strong>${escapeHtml(guesserName)}</strong>
                </div>
                <div class="history-role-row">
                    <span>Picked</span>
                    <span>Guessed</span>
                </div>
                <div class="history-score-row ${peterPoints ? 'scored peter' : ''}"><span>${escapeHtml(playerProfiles.Peter?.nickname || 'Peter')}</span><strong>+${peterPoints} pts</strong></div>
                <div class="history-score-row ${jadeyPoints ? 'scored jadey' : ''}"><span>${escapeHtml(playerProfiles.Jadey?.nickname || 'Jadey')}</span><strong>+${jadeyPoints} pts</strong></div>
            </article>
        `;
    }).join('');
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
    sendAppNotification({
        type: 'Game Update',
        action: 'check-game',
        sender: localPlayer,
        recipient: otherPlayer(localPlayer),
        body: `${playerProfiles[localPlayer]?.nickname || localPlayer} changed 1 to 10 mode to ${gameModes[modeKey].title}`,
        createdAt: Date.now(),
        readBy: {}
    }, 'number-guess');

    launchGame('number-guess');
}

function exitGame() {
    const gameScreen = document.getElementById('game-1-to-10-screen');
    if (gameScreen) gameScreen.classList.add('hidden');
    showNumberGuessPlayArea();
    const dash = document.getElementById('main-dashboard');
    if (dash) dash.classList.remove('hidden');
    initialiseMainDashboard();
}

auth.onAuthStateChanged(user => {
    if (!user) {
        const message = authRejectionMessage || 'Sign in with your approved account.';
        const isError = Boolean(authRejectionMessage);
        authRejectionMessage = '';
        showAuthScreen(message, isError);
        return;
    }

    const playerName = approvedUsers[user.uid];
    if (!playerName) {
        authRejectionMessage = 'This account is not authorised to use the app.';
        auth.signOut();
        return;
    }

    setAuthBusy(false);
    setAuthStatus('');
    showAuthenticatedApp(playerName);
});

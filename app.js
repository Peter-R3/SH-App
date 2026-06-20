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

let gameState1To10 = {
    phase: 'SETTING_TARGET', 
    targetSetter: 'Peter',    
    guesser: 'Jadey',         
    chosenTargetValue: null,  
    currentGuessValue: null,  
    isActive: false
};

let currentSelectedGuess = null;
let isRevealingRound = false; // Guard to stop frame collision anomalies

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
}

function switchTab(tabName) {
    const screens = document.querySelectorAll('.screen');
    screens.forEach(screen => screen.classList.add('hidden'));

    if (tabName === 'games') {
        const dash = document.getElementById('main-dashboard');
        if (dash) dash.classList.remove('hidden');
    } else if (tabName === 'profile') {
        openProfileSettings();
    } else {
        const dash = document.getElementById('main-dashboard');
        if (dash) dash.classList.remove('hidden');
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

// =========================================================================
// 1 TO 10 MULTIPLAYER GAME WORKSPACE
// =========================================================================
function launchGame(gameId) {
    if (gameId !== 'number-guess') return;
    
    const dash = document.getElementById('main-dashboard');
    if (dash) dash.classList.add('hidden');
    
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
            gameState1To10 = data;
        } else {
            gameState1To10 = {
                phase: 'SETTING_TARGET',
                targetSetter: 'Peter',
                guesser: 'Jadey',
                chosenTargetValue: null,
                currentGuessValue: null,
                isActive: true
            };
            database.ref('games/1-to-10').set(gameState1To10);
        }
        if (gameScreen) gameScreen.classList.remove('hidden');
        handleGameStateUpdate();
    });
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
            promptLabel.innerText = "Choose your secret target number";
            if (frontGuess) frontGuess.innerText = currentSelectedGuess !== null ? currentSelectedGuess : "?";
        } else {
            promptLabel.innerText = `Waiting for ${setterNickname} to set a target...`;
            if (frontGuess) frontGuess.innerText = "?";
        }
        if (frontTarget) frontTarget.innerText = "?";
    } else if (gameState1To10.phase === 'GUESSING') {
        if (localPlayer === gameState1To10.guesser) {
            promptLabel.innerText = `Your turn to guess ${setterNickname}'s number!`;
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
    if (!gameState1To10.isActive || isRevealingRound || gameState1To10.phase === 'REVEAL') return;

    if (gameState1To10.phase === 'SETTING_TARGET' && localPlayer !== gameState1To10.targetSetter) return;
    if (gameState1To10.phase === 'GUESSING' && localPlayer !== gameState1To10.guesser) return;

    currentSelectedGuess = num;
    
    const cardFront = document.getElementById('card-front-your-guess');
    if (cardFront) cardFront.innerText = num;

    document.querySelectorAll('.pad-num-btn').forEach(btn => {
        if (parseInt(btn.innerText) === num) {
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
        if (latestState) gameState1To10 = latestState;

        isRevealingRound = false;
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

    if (gameState1To10.phase === 'REVEAL' && !isRevealingRound) {
        startRevealSequence();
    } else {
        updateGameUIFlow();
    }
}

function openModesSelection() {
    console.log('Modes selection is not implemented yet.');
}

// Fixed Synchronization Engine
database.ref('games/1-to-10').on('value', (snapshot) => {
    const data = snapshot.val();
    if (!data) return;

    gameState1To10 = data;
    handleGameStateUpdate();
});

function exitGame() {
    const gameScreen = document.getElementById('game-1-to-10-screen');
    if (gameScreen) gameScreen.classList.add('hidden');
    const dash = document.getElementById('main-dashboard');
    if (dash) dash.classList.remove('hidden');
    initialiseMainDashboard();
}

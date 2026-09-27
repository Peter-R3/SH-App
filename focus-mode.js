let focusModeEnabled = false;
const focusGameScreens = {
    'number-guess': 'game-1-to-10-screen',
    'word-search': 'word-search-screen', sudoku: 'sudoku-screen',
    battleship: 'battleship-screen', 'connect-four': 'connect-four-screen',
    'tic-tac-toe': 'tic-tac-toe-screen', rps: 'rps-screen'
};

function loadFocusModePreference(player) {
    try { focusModeEnabled = localStorage.getItem(`sweethearts-app:focus-mode:${player}`) === 'true'; }
    catch { focusModeEnabled = false; }
    updateFocusModeControls();
}

function toggleFocusMode() {
    focusModeEnabled = !focusModeEnabled;
    try { localStorage.setItem(`sweethearts-app:focus-mode:${localPlayer}`, String(focusModeEnabled)); } catch {}
    playUiSound('tap');
    updateFocusModeControls();
}

function updateFocusModeControls() {
    const input = document.getElementById('profile-focus-enabled');
    if (input) input.checked = focusModeEnabled;
    const status = document.getElementById('profile-focus-status');
    if (status) status.textContent = focusModeEnabled ? 'On' : 'Off';
    for (const [game, id] of Object.entries(focusGameScreens)) {
        const screen = document.getElementById(id);
        if (!screen) continue;
        let controls = screen.querySelector('.focus-game-controls');
        if (!controls) {
            controls = document.createElement('nav');
            controls.className = 'focus-game-controls';
            controls.setAttribute('aria-label', 'Game controls');
            controls.innerHTML = '<button type="button" class="focus-exit" aria-label="Exit to Games" title="Exit to Games"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.42-1.41L7.83 13H20v-2z"/></svg></button><button type="button" class="focus-pause"></button>';
            controls.querySelector('.focus-exit').onclick = () => exitFocusGame(game);
            controls.querySelector('.focus-pause').onclick = () => {
                playUiSound('tap');
                if (game === 'number-guess') toggleNumberGuessPause();
                else if (sharedPauseSession?.id === game) resumeSharedGame();
                else openSharedGameMenu(game);
            };
            screen.prepend(controls);
        }
        screen.classList.toggle('focus-game', focusModeEnabled);
        controls.inert = false;
        const paused = game === 'number-guess'
            ? !document.getElementById('number-guess-menu-area').classList.contains('hidden')
            : sharedPauseSession?.id === game;
        const pause = controls.querySelector('.focus-pause');
        setGamePauseTab(pause, paused);
        pause.title = paused ? 'Resume game' : 'Open pause menu';
        const panel = screen.querySelector('.shared-pause-panel, #number-guess-pause-panel');
        if (panel && !panel.querySelector('.focus-mode-toggle')) {
            const toggle = document.createElement('button');
            toggle.type = 'button';
            toggle.className = 'focus-mode-toggle';
            toggle.onclick = toggleFocusMode;
            panel.append(toggle);
        }
        if (typeof sharedPauseGames !== 'undefined') sharedPauseGames[game]?.resize?.();
    }
    document.querySelectorAll('.focus-mode-toggle').forEach(button => {
        const label = focusModeEnabled ? 'Turn off Focus Mode' : 'Turn on Focus Mode';
        button.setAttribute('aria-label', label);
        button.setAttribute('aria-pressed', String(focusModeEnabled));
        button.title = label;
        button.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${focusModeEnabled ? 'M8 3v5H3v2h7V3H8zm8 0h-2v7h7V8h-5V3zM3 14v2h5v5h2v-7H3zm11 0v7h2v-5h5v-2h-7z' : 'M3 3v7h2V5h5V3H3zm11 0v2h5v5h2V3h-7zM3 14v7h7v-2H5v-5H3zm16 0v5h-5v2h7v-7h-2z'}"/></svg>`;
    });
}

async function exitFocusGame(game) {
    const leavingView = activeAppView;
    const competitive = (game === 'word-search' && wordSearchSettings.mode === 'versus') || (game === 'sudoku' && sudokuSettings.mode === 'versus');
    if (competitive && !await confirmNewPuzzle('Leave match?', 'Leaving abandons this player-versus-player match.', 'Leave match')) return;
    if (activeAppView !== leavingView) return;
    playUiSound('tap');
    switchTab('games');
}

window.addEventListener('storage', event => {
    if (event.key === `sweethearts-app:focus-mode:${localPlayer}`) loadFocusModePreference(localPlayer);
});

if (localPlayer) loadFocusModePreference(localPlayer);

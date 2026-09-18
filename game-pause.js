const sharedPauseGames = {
    'word-search': { launch: launchWordSearch, settingsAction: openWordSearchSettings, settingsLabel: 'Game Settings', settings: () => wordSearchSettings, stats: 'word-search-stats-content', render: renderWordSearchStats },
    sudoku: { launch: launchSudoku, settingsAction: openSudokuSettings, settingsLabel: 'Game Settings', settings: () => sudokuSettings, stats: 'sudoku-stats-content', render: renderSudokuStats },
    battleship: { launch: launchBattleship, stats: 'battleship-stats-content', render: renderBattleshipStats },
    'connect-four': { launch: launchConnectFour, stats: 'connect-four-stats-content', render: renderConnectFourStats },
    'tic-tac-toe': { launch: launchTicTacToe, settingsAction: openTicTacToeSettings, settingsLabel: 'Modes', settings: () => ticTacToeSettings, stats: 'tic-tac-toe-stats-content', render: renderTicTacToeStats },
    rps: { launch: launchRps, settingsAction: openRpsSettings, settingsLabel: 'Modes', settings: () => rpsSettings, stats: 'rps-stats-content', render: renderRpsStats }
};
let sharedPauseSession = null;

function confirmNewPuzzle(title, body, confirmLabel) {
    let dialog = document.getElementById('game-confirm-dialog');
    if (!dialog) {
        dialog = document.createElement('dialog');
        dialog.id = 'game-confirm-dialog';
        dialog.className = 'game-confirm-dialog';
        dialog.setAttribute('aria-labelledby', 'game-confirm-title');
        dialog.innerHTML = '<h2 id="game-confirm-title"></h2><p></p><form method="dialog"><button value="cancel" autofocus>Cancel</button><button value="confirm" class="primary"></button></form>';
        document.body.append(dialog);
    }
    if (dialog.open || dialog.confirmationPending) return Promise.resolve(false);
    dialog.confirmationPending = true;
    dialog.querySelector('h2').textContent = title;
    dialog.querySelector('p').textContent = body;
    dialog.querySelector('.primary').textContent = confirmLabel;
    dialog.style.setProperty('--theme-color', themeColorFor(localPlayer));
    dialog.style.setProperty('--theme-text-color', textColorFor(themeColorFor(localPlayer)));
    dialog.returnValue = 'cancel';
    return new Promise(resolve => {
        dialog.addEventListener('close', () => {
            dialog.confirmationPending = false;
            resolve(dialog.returnValue === 'confirm');
        }, { once: true });
        dialog.showModal();
    });
}

function renderDuelModes(id) {
    const select = document.getElementById(`${id}-mode`);
    const container = select.parentElement;
    select.dataset.modeCards = 'true';
    select.classList.add('hidden');
    container.querySelector('label')?.classList.add('hidden');
    container.querySelector(':scope > button')?.remove();
    if (!container.querySelector('.duel-mode-cards')) {
        const cards = document.createElement('div');
        cards.className = 'duel-mode-cards';
        cards.innerHTML = '<p class="menu-prompt">Select mode</p>';
        for (const [value, title, detail] of [['versus', 'Player vs Player', 'Play together'], ['versus-ai', 'Player vs Jaylin', 'Play against Jaylin']]) {
            const button = document.createElement('button');
            button.className = 'mode-option-btn';
            button.dataset.mode = value;
            button.innerHTML = `<span>${title}</span><small>${detail}</small>`;
            button.onclick = () => {
                select.value = value;
                select.dispatchEvent(new Event('change', { bubbles: true }));
                renderDuelModes(id);
                resumeSharedGame();
            };
            cards.append(button);
        }
        container.append(cards);
    }
    container.querySelectorAll('[data-mode]').forEach(button => {
        const selected = button.dataset.mode === select.value;
        button.classList.toggle('active-mode', selected);
        button.setAttribute('aria-pressed', String(selected));
    });
}

function openQuickGameLobby(id, mode, path, begin) {
    const screen = document.getElementById(`${id}-screen`);
    const content = screen.querySelector('.duel-game-content, .connect-four-content');
    let lobby = screen.querySelector('.quick-game-lobby');
    if (!lobby) {
        lobby = document.createElement('div');
        lobby.className = 'word-search-lobby quick-game-lobby';
        lobby.innerHTML = '<div class="word-search-lobby-panel"><span class="word-search-lobby-mode"></span><h2>Ready to play?</h2><div class="word-search-lobby-status" role="status"></div><button class="word-search-lobby-primary" type="button">Play</button></div>';
        content.before(lobby);
        if (id !== 'connect-four') {
            const modes = document.createElement('button');
            modes.className = 'word-search-lobby-settings';
            modes.textContent = 'Modes';
            modes.onclick = () => sharedPauseGames[id].settingsAction();
            lobby.firstElementChild.append(modes);
        }
    }
    lobby.classList.remove('hidden');
    content.classList.add('hidden');
    const button = lobby.querySelector('.word-search-lobby-primary');
    const status = lobby.querySelector('[role="status"]');
    lobby.querySelector('.word-search-lobby-mode').textContent = mode === 'versus-ai' ? 'Player vs Jaylin' : 'Player vs Player';
    button.disabled = true;
    status.textContent = 'Checking for a match...';
    const token = {};
    lobby.sessionToken = token;
    database.ref(path).once('value').then(snapshot => {
        if (lobby.sessionToken !== token || ![`${id}-lobby`, `${id}-menu`].includes(activeAppView)) return;
        const state = snapshot.val();
        const ongoing = state && state.status !== 'finished';
        button.textContent = mode === 'versus-ai' ? (ongoing ? 'Resume' : 'Play') : state?.status === 'finished' && id !== 'tic-tac-toe' ? 'View results' : ongoing ? (state.players?.[localPlayer] ? 'Resume' : 'Join match') : 'Invite player';
        status.textContent = mode === 'versus-ai' ? 'Jaylin is ready when you are.' : ongoing ? 'Continue your shared match.' : 'Start a match together.';
        button.disabled = false;
    }).catch(() => { status.textContent = 'Could not check the match. Tap to retry.'; button.textContent = 'Retry'; button.disabled = false; });
    button.onclick = async () => {
        button.disabled = true;
        playUiSound('ready');
        try {
            await begin();
        } catch {
            status.textContent = 'Could not join. Please try again.';
            button.disabled = false;
        }
    };
}

function updateQuickGameLobby(id, state) {
    const screen = document.getElementById(`${id}-screen`);
    const lobby = screen?.querySelector('.quick-game-lobby');
    if (!lobby || !state) return;
    if (state.status === 'waiting') {
        lobby.classList.remove('hidden');
        screen.querySelector('.duel-game-content, .connect-four-content').classList.add('hidden');
        lobby.querySelector('[role="status"]').textContent = 'Invitation sent. Waiting for the other player...';
        lobby.querySelector('.word-search-lobby-primary').textContent = 'Waiting';
        lobby.querySelector('.word-search-lobby-primary').disabled = true;
        return;
    }
    lobby.classList.add('hidden');
    screen.querySelector('.duel-game-content, .connect-four-content').classList.remove('hidden');
    if (activeAppView === `${id}-lobby`) setActiveAppView(id);
    if (sharedPauseSession?.id === id) sharedPauseSession.returnView = id;
}

function setGamePauseTab(button, paused) {
    if (!button) return;
    button.innerHTML = `<svg class="nav-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="${paused ? 'M8 5v14l11-7z' : 'M6 5h4v14H6V5zm8 0h4v14h-4V5z'}"/></svg><span>${paused ? 'Play' : 'Pause'}</span>`;
    button.setAttribute('aria-label', paused ? 'Resume game' : 'Open pause menu');
}

function initialiseGamePauseMenus() {
    for (const [id, config] of Object.entries(sharedPauseGames)) {
        const screen = document.getElementById(`${id}-screen`);
        if (!screen || screen.querySelector('.shared-game-menu')) continue;
        screen.classList.add('shared-pause-game');
        const nav = screen.querySelector('.bottom-nav-bar');
        nav.classList.add('game-bottom-nav');
        let tab = [...nav.children].find(button => ['Modes', 'Pause'].includes(button.textContent.trim()));
        if (!tab) { tab = document.createElement('button'); tab.className = 'nav-tab-btn'; nav.append(tab); }
        tab.removeAttribute('onclick');
        tab.dataset.pauseGame = id;
        tab.addEventListener('click', () => sharedPauseSession?.id === id ? resumeSharedGame() : openSharedGameMenu(id));
        setGamePauseTab(tab, false);
        const menu = document.createElement('div');
        menu.className = 'shared-game-menu hidden';
        const settingsButton = config.settingsAction
            ? `<button class="pause-option-btn" data-pause-action="settings"><span>${config.settingsLabel}</span><small>Change how this game is played</small></button>`
            : '';
        menu.innerHTML = `<div class="shared-pause-panel"><button class="sound-effects-toggle" onclick="toggleSoundEffects()"></button><h2>Paused</h2><p class="shared-pause-note"></p><button class="pause-option-btn primary" data-pause-action="resume"><span>Resume</span><small>Return to the game</small></button>${settingsButton}<button class="pause-option-btn" data-pause-action="stats"><span>Statistics</span><small>View this game's results</small></button></div><div class="shared-submenu hidden"><div class="number-guess-submenu-heading"><h2></h2><button class="mode-select-btn" data-pause-action="back" aria-label="Back to pause menu" title="Back to pause menu"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.42-1.41L7.83 13H20v-2z"/></svg></button></div><div class="shared-submenu-content"></div></div>`;
        menu.addEventListener('click', event => {
            const action = event.target.closest('[data-pause-action]')?.dataset.pauseAction;
            if (!action) return;
            playUiSound('tap');
            if (action === 'resume') resumeSharedGame();
            else if (action === 'achievements') openGameAchievements(id);
            else if (action === 'history') openSharedGameMenu(id, 'history');
            else if (action === 'settings') config.settingsAction();
            else if (action === 'back' && sharedPauseSession?.directFromLobby) resumeSharedGame();
            else openSharedGameMenu(id, action === 'stats' ? 'stats' : 'pause');
        });
        for (const [action, label] of [['history', 'History'], ['achievements', 'Achievements']]) {
            const button = document.createElement('button');
            button.className = 'pause-option-btn';
            button.dataset.pauseAction = action;
            button.textContent = label;
            menu.querySelector('.shared-pause-panel').append(button);
        }
        screen.insertBefore(menu, nav);
        const resize = () => {
            screen.style.setProperty('--pause-header-height', `${screen.querySelector('.dashboard-header').getBoundingClientRect().height}px`);
            screen.style.setProperty('--pause-nav-height', `${nav.getBoundingClientRect().height}px`);
        };
        new ResizeObserver(resize).observe(screen);
        config.resize = resize;
    }
    updateSoundEffectControls();
}

function restoreSharedMenuContent() {
    if (sharedPauseSession?.placeholder) {
        sharedPauseSession.placeholder.replaceWith(sharedPauseSession.content);
        sharedPauseSession.placeholder = null;
        sharedPauseSession.content = null;
    }
}

function openSharedGameMenu(id, view = 'pause') {
    if (typeof restoreGameAchievements === 'function') restoreGameAchievements();
    initialiseGamePauseMenus();
    const config = sharedPauseGames[id];
    if (!config || !localPlayer) return;
    if (sharedPauseSession && sharedPauseSession.id !== id) closeSharedGameMenu();
    if (!sharedPauseSession) {
        sharedPauseSession = { id, openedAt: Date.now(), returnView: activeAppView, settings: JSON.stringify(config.settings?.()), mode: config.settings?.().mode };
        sharedPauseSession.directFromLobby = view !== 'pause' && activeAppView === `${id}-lobby`;
        if (id === 'sudoku' && activeAppView !== 'sudoku-lobby' && sudokuSettings.mode === 'solo' && sudokuState) {
            sharedPauseSession.sudokuState = sudokuState;
            sharedPauseSession.sudokuPath = soloSudokuPath();
        }
    }
    restoreSharedMenuContent();
    const submenuHost = document.querySelector(`#${id}-screen .shared-submenu-content`);
    if (submenuHost) { submenuHost.historyToken = null; submenuHost.replaceChildren(); }
    setActiveAppView(`${id}-menu`);
    const screen = document.getElementById(`${id}-screen`);
    document.querySelectorAll('.screen').forEach(element => element.classList.add('hidden'));
    screen.classList.remove('hidden');
    applyThemeToScreen(`${id}-screen`, `${id}-header-shell`, `${id}-nav-shell`);
    refreshSharedHeader(id);
    setActiveNavigationTab('games');
    screen.classList.add('shared-game-paused');
    const menu = screen.querySelector('.shared-game-menu');
    const backButton = menu.querySelector('[data-pause-action="back"]');
    const backLabel = sharedPauseSession.directFromLobby ? 'Back to lobby' : 'Back to pause menu';
    backButton.setAttribute('aria-label', backLabel);
    backButton.title = backLabel;
    menu.classList.remove('hidden');
    menu.classList.toggle('shared-menu-solid', view !== 'pause');
    menu.querySelector('.shared-pause-panel').classList.toggle('hidden', view !== 'pause');
    menu.querySelector('.shared-submenu').classList.toggle('hidden', view === 'pause');
    const mode = sharedPauseSession.mode;
    menu.querySelector('.shared-pause-note').textContent = mode === 'solo' ? 'Game paused. Your timer is stopped.' : mode === 'versus-ai' ? 'Game paused. Jaylin waits for you.' : 'Multiplayer keeps syncing while this menu is open.';
    for (const child of screen.children) {
        if (!child.matches('.dashboard-header, .bottom-nav-bar, .shared-game-menu')) child.inert = true;
    }
    if (view !== 'pause') {
        menu.querySelector('.shared-submenu h2').textContent = view === 'stats' ? 'Statistics' : view === 'history' ? 'History' : view === 'achievements' ? 'Achievements' : config.settingsLabel;
        const content = view === 'stats' ? document.getElementById(config.stats) : !['history', 'achievements'].includes(view) ? document.getElementById(`${id}-settings-screen`)?.children[1] : null;
        if (view === 'history') loadGameHistory(id, menu.querySelector('.shared-submenu-content'));
        if (content) {
            const placeholder = document.createComment('Game menu content');
            content.before(placeholder);
            sharedPauseSession.placeholder = placeholder;
            sharedPauseSession.content = content;
            menu.querySelector('.shared-submenu-content').append(content);
        }
        if (view === 'stats') config.render();
        else enhanceGameSettingsSelects(menu.querySelector('.shared-submenu-content'));
    }
    setGamePauseTab(screen.querySelector('[data-pause-game]'), true);
    updateSoundEffectControls();
    config.resize();
}

function enhanceGameSettingsSelects(root = document) {
    root.querySelectorAll('select:not([data-custom-select]):not([data-mode-cards])').forEach(select => {
        select.dataset.customSelect = 'true';
        select.tabIndex = -1;
        select.setAttribute('aria-hidden', 'true');
        const component = document.createElement('div');
        component.className = 'game-custom-select';
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'game-custom-select-button';
        button.id = `${select.id}-custom-button`;
        button.setAttribute('aria-haspopup', 'listbox');
        button.setAttribute('aria-expanded', 'false');
        const label = document.querySelector(`label[for="${select.id}"]`);
        if (label) {
            label.id = label.id || `${select.id}-custom-label`;
            button.setAttribute('aria-labelledby', label.id);
            label.addEventListener('click', event => {
                event.preventDefault();
                button.click();
                button.focus();
            });
        }
        const list = document.createElement('div');
        list.className = 'game-custom-select-options hidden';
        list.setAttribute('role', 'listbox');
        list.id = `${select.id}-custom-options`;
        button.setAttribute('aria-controls', list.id);
        button.addEventListener('click', () => {
            const opening = list.classList.contains('hidden');
            document.querySelectorAll('.game-custom-select.open').forEach(closeGameCustomSelect);
            component.classList.toggle('open', opening);
            list.classList.toggle('hidden', !opening);
            button.setAttribute('aria-expanded', String(opening));
            playUiSound('tap');
        });
        button.addEventListener('keydown', event => handleGameCustomSelectKeys(event, select, component));
        select.after(component);
        component.append(button, list);
        syncGameSettingsSelect(select);
    });
}

function syncGameSettingsSelect(select) {
    if (!select) return;
    const component = select.nextElementSibling;
    if (!component?.classList.contains('game-custom-select')) return;
    const signature = JSON.stringify([...select.options].map(option => [option.value, option.textContent]));
    if (component.optionsSignature !== signature) {
        component.optionsSignature = signature;
        const list = component.querySelector('.game-custom-select-options');
        list.replaceChildren();
        [...select.options].forEach(option => {
            const item = document.createElement('button');
            item.type = 'button';
            item.className = 'game-custom-select-option';
            item.dataset.value = option.value;
            item.textContent = option.textContent;
            item.setAttribute('role', 'option');
            item.addEventListener('click', () => {
                select.value = option.value;
                select.dispatchEvent(new Event('change', { bubbles: true }));
                syncGameSettingsDependencies(select);
                syncGameSettingsSelects();
                closeGameCustomSelect(component);
                playUiSound('tap');
            });
            list.append(item);
        });
    }
    const selected = select.options[select.selectedIndex];
    component.querySelector('.game-custom-select-button').innerHTML = `<span>${selected?.textContent || ''}</span><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m7 10 5 5 5-5z"/></svg>`;
    component.querySelectorAll('.game-custom-select-option').forEach(option => {
        const active = option.dataset.value === select.value;
        option.classList.toggle('selected', active);
        option.setAttribute('aria-selected', String(active));
    });
    component.classList.toggle('hidden', select.classList.contains('hidden'));
}

function syncGameSettingsSelects(root = document) {
    root.querySelectorAll('select[data-custom-select]').forEach(syncGameSettingsSelect);
}

function closeGameCustomSelect(component) {
    component.classList.remove('open');
    component.querySelector('.game-custom-select-options')?.classList.add('hidden');
    component.querySelector('.game-custom-select-button')?.setAttribute('aria-expanded', 'false');
}

function handleGameCustomSelectKeys(event, select, component) {
    const options = [...select.options];
    let index = select.selectedIndex;
    if (event.key === 'Escape') {
        closeGameCustomSelect(component);
        return;
    }
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    if (event.key === 'Home') index = 0;
    else if (event.key === 'End') index = options.length - 1;
    else index = (index + (event.key === 'ArrowDown' ? 1 : -1) + options.length) % options.length;
    select.value = options[index].value;
    select.dispatchEvent(new Event('change', { bubbles: true }));
    syncGameSettingsDependencies(select);
    syncGameSettingsSelects();
}

function syncGameSettingsDependencies(select) {
    if (select.id === 'word-search-mode') syncWordSearchModeControls();
    if (select.id === 'sudoku-mode') syncSudokuModeControls();
}

document.addEventListener('pointerdown', event => {
    document.querySelectorAll('.game-custom-select.open').forEach(component => {
        if (!component.contains(event.target)) closeGameCustomSelect(component);
    });
});

function closeSharedGameMenu() {
    const session = sharedPauseSession;
    if (!session) return;
    restoreSharedMenuContent();
    const duration = Math.max(0, Date.now() - session.openedAt);
    if (session.id === 'word-search' && ['solo', 'versus-ai'].includes(session.mode)) {
        if (wordSearchLastActivityAt) wordSearchLastActivityAt += duration;
        if (wordSearchSessionStartedAt) wordSearchSessionStartedAt += duration;
    }
    if (session.sudokuState && !session.sudokuState.completedAt) {
        session.sudokuState.pausedMs = (Number(session.sudokuState.pausedMs) || 0) + duration;
        const startedAt = session.sudokuState.startedAt;
        database.ref(session.sudokuPath).transaction(current => {
            if (!current || current.startedAt !== startedAt || current.completedAt) return;
            current.pausedMs = (Number(current.pausedMs) || 0) + duration;
            return current;
        }, undefined, false).catch(() => {});
    }
    const screen = document.getElementById(`${session.id}-screen`);
    screen.classList.remove('shared-game-paused');
    screen.querySelector('.shared-game-menu').classList.add('hidden');
    for (const child of screen.children) child.inert = false;
    setGamePauseTab(screen.querySelector('[data-pause-game]'), false);
    sharedPauseSession = null;
}

function resumeSharedGame() {
    if (!sharedPauseSession) return;
    const { id, settings, returnView } = sharedPauseSession;
    const config = sharedPauseGames[id];
    const changed = settings !== JSON.stringify(config.settings?.());
    closeSharedGameMenu();
    if (changed) config.launch();
    else setActiveAppView(returnView || id);
}

function toggleNumberGuessPause() {
    if (!document.getElementById('number-guess-menu-area').classList.contains('hidden')) {
        showNumberGuessPlayArea();
        setActiveAppView('number-guess');
        handleGameStateUpdate();
    } else openNumberGuessPause();
}

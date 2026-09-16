const REALM_DIMENSIONS = { overworld: 'Overworld', nether: 'Nether', end: 'The End' };
let realmLocations = {};
let realmCode = '';
let realmCodeShown = false;
let realmCodeReady = false;
let realmUnsubscribe = [];
let realmReady = false;
let realmEditingId = null;
let realmEditingRevision = null;
let realmBusy = false;
let realmTransitioning = false;

async function transitionRealmHub(changeScreen, entering) {
    if (realmTransitioning) return;
    realmTransitioning = true;
    closeRealmDropdowns();
    const overlay = document.createElement('div');
    overlay.className = 'realm-portal-transition';
    overlay.setAttribute('aria-hidden', 'true');
    document.body.append(overlay);
    try {
        if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
            await overlay.animate([{ opacity: 0, transform: 'scaleX(.04)' }, { opacity: 1, transform: 'scaleX(1)' }], { duration: 180, easing: 'ease-in', fill: 'forwards' }).finished;
        }
        changeScreen();
        if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
            await overlay.animate([{ opacity: 1, transform: 'scale(1)' }, { opacity: 0, transform: entering ? 'scale(1.35)' : 'scaleX(.04)' }], { duration: 230, easing: 'ease-out', fill: 'forwards' }).finished;
        }
    } finally { overlay.remove(); realmTransitioning = false; }
}

function closeRealmDropdowns() {
    document.querySelectorAll('.realm-select-options').forEach(list => { list.hidden = true; });
    document.querySelectorAll('.realm-select-trigger').forEach(button => button.setAttribute('aria-expanded', 'false'));
}

function syncRealmDropdown(select) {
    const wrapper = select.closest('.realm-select');
    wrapper.querySelector('.realm-select-value').textContent = select.selectedOptions[0].textContent;
    wrapper.querySelectorAll('[role=option]').forEach(option => option.setAttribute('aria-selected', String(option.dataset.value === select.value)));
}

function enhanceRealmDropdown(select) {
    const wrapper = document.createElement('div');
    wrapper.className = 'realm-select';
    select.before(wrapper);
    wrapper.append(select);
    select.hidden = true;
    select.tabIndex = -1;
    const trigger = document.createElement('button');
    trigger.type = 'button';
    trigger.id = `${select.id}-trigger`;
    trigger.className = 'realm-select-trigger';
    trigger.setAttribute('aria-haspopup', 'listbox');
    trigger.setAttribute('aria-expanded', 'false');
    trigger.setAttribute('aria-label', select.id === 'realm-dimension-filter' ? 'Filter by dimension' : 'Location dimension');
    trigger.setAttribute('aria-controls', `${select.id}-options`);
    trigger.innerHTML = '<span class="realm-select-value"></span><span aria-hidden="true">&#8964;</span>';
    const list = document.createElement('div');
    list.id = `${select.id}-options`;
    list.className = 'realm-select-options';
    list.setAttribute('role', 'listbox');
    list.setAttribute('aria-label', trigger.getAttribute('aria-label'));
    list.hidden = true;
    for (const item of select.options) {
        const option = document.createElement('button');
        option.type = 'button';
        option.setAttribute('role', 'option');
        option.dataset.value = item.value;
        option.textContent = item.textContent;
        option.tabIndex = -1;
        option.addEventListener('click', () => {
            select.value = item.value;
            syncRealmDropdown(select);
            closeRealmDropdowns();
            trigger.focus();
            select.dispatchEvent(new Event('change', { bubbles: true }));
            select.dispatchEvent(new Event('input', { bubbles: true }));
            playUiSound('tap');
        });
        list.append(option);
    }
    const open = () => {
        closeRealmDropdowns();
        list.hidden = false;
        trigger.setAttribute('aria-expanded', 'true');
        list.querySelector('[aria-selected=true]').focus();
    };
    trigger.addEventListener('click', () => { if (list.hidden) open(); else closeRealmDropdowns(); playUiSound('tap'); });
    trigger.addEventListener('keydown', event => {
        if (['ArrowDown', 'ArrowUp'].includes(event.key)) { event.preventDefault(); open(); }
    });
    wrapper.addEventListener('keydown', event => {
        const options = [...list.children];
        const index = options.indexOf(document.activeElement);
        if (event.key === 'Escape' && !list.hidden) { event.preventDefault(); event.stopPropagation(); closeRealmDropdowns(); trigger.focus(); }
        else if (event.key === 'Tab') closeRealmDropdowns();
        else if (index >= 0 && ['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
            event.preventDefault();
            const next = event.key === 'Home' ? 0 : event.key === 'End' ? options.length - 1 : (index + (event.key === 'ArrowDown' ? 1 : -1) + options.length) % options.length;
            options[next].focus();
        }
    });
    wrapper.append(trigger, list);
    syncRealmDropdown(select);
}

function realmCoordinateKey(location) {
    return `${location.dimension}:${Number(location.x)}:${Number(location.y)}:${Number(location.z)}`;
}

function validateRealmLocation(location) {
    if (!location.name || location.name.length > 80) return 'Enter a location name of up to 80 characters.';
    if (!REALM_DIMENSIONS[location.dimension]) return 'Choose a dimension.';
    if (!['x', 'y', 'z'].every(axis => Number.isSafeInteger(location[axis]) && Math.abs(location[axis]) <= 30000000)) {
        return 'Enter whole-number coordinates between -30,000,000 and 30,000,000.';
    }
    if (location.note.length > 1000) return 'Keep notes to 1,000 characters or fewer.';
    return '';
}

// This runs again on Firebase transaction retries, keeping simultaneous saves unique.
function updateRealmLocations(current, id, location, revision) {
    const locations = current || {};
    if (revision !== null && (!locations[id] || locations[id].revision !== revision)) return;
    if (Object.entries(locations).some(([key, value]) => key !== id && realmCoordinateKey(value) === realmCoordinateKey(location))) return;
    return { ...locations, [id]: location };
}

function mountRealmHub() {
    if (document.getElementById('realm-hub-screen')) return;
    document.getElementById('main-content').insertAdjacentHTML('beforeend', `
        <section id="realm-hub-screen" class="screen hidden realm-hub">
            <div class="realm-header"><div><span class="realm-eyebrow">OUR SHARED WORLD</span><h1>Realm Hub</h1></div>
                <button class="realm-back" data-realm-action="exit" title="Return to Home" aria-label="Return to Home"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.42-1.41L7.83 13H20v-2z"/></svg></button></div>
            <div class="realm-body">
                <section class="realm-code-section"><h2>Realm code</h2>
                    <p id="realm-code-value" class="realm-code-value">Loading...</p>
                    <div class="realm-actions"><button id="realm-reveal" data-realm-action="reveal">Show</button><button id="realm-copy" data-realm-action="copy">Copy</button><button id="realm-code-edit" data-realm-action="edit-code">Edit</button></div>
                </section>
                <section class="realm-locations-section"><div class="realm-section-heading"><h2>Locations <span id="realm-location-count"></span></h2><button id="realm-add" class="realm-primary" data-realm-action="add">Add location</button></div>
                    <label class="realm-search-label" for="realm-search">Search locations</label><input id="realm-search" type="search" placeholder="Search names, notes or coordinates">
                    <label class="realm-search-label" for="realm-dimension-filter">Dimension</label><select id="realm-dimension-filter"><option value="all">All dimensions</option><option value="overworld">Overworld</option><option value="nether">Nether</option><option value="end">The End</option></select>
                    <p id="realm-status" role="status"></p><div id="realm-location-list"></div>
                </section>
            </div>
        </section>
        <dialog id="realm-editor" class="realm-dialog" aria-labelledby="realm-editor-title"><form id="realm-location-form">
            <h2 id="realm-editor-title">Add location</h2>
            <label>Name<input id="realm-name" required maxlength="80" autocomplete="off"></label>
            <label for="realm-dimension-trigger">Dimension</label><select id="realm-dimension"><option value="overworld">Overworld</option><option value="nether">Nether</option><option value="end">The End</option></select>
            <div class="realm-coordinate-inputs">${['x', 'y', 'z'].map(axis => `<label><span class="realm-axis-${axis}">${axis.toUpperCase()}</span><input id="realm-${axis}" type="number" required step="1" min="-30000000" max="30000000"></label>`).join('')}</div>
            <p id="realm-coordinate-helper"></p>
            <label>Notes<textarea id="realm-note" maxlength="1000" rows="3"></textarea></label>
            <p id="realm-editor-status" role="status"></p>
            <div class="realm-dialog-actions"><button type="button" data-realm-action="cancel-edit">Cancel</button><button type="submit" class="realm-primary">Save</button></div>
        </form></dialog>
        <dialog id="realm-code-dialog" class="realm-dialog" aria-labelledby="realm-code-title"><form id="realm-code-form"><h2 id="realm-code-title">Realm code</h2><label>Code<input id="realm-code-input" required maxlength="100" autocomplete="off" autocapitalize="off" spellcheck="false"></label><p id="realm-code-status" role="status"></p><div class="realm-dialog-actions"><button type="button" data-realm-action="cancel-code">Cancel</button><button class="realm-primary" type="submit">Save</button></div></form></dialog>
        <dialog id="app-confirm-dialog" class="realm-dialog" aria-labelledby="app-confirm-title"><h2 id="app-confirm-title"></h2><p id="app-confirm-body"></p><form method="dialog" class="realm-dialog-actions"><button value="cancel" autofocus>Cancel</button><button value="confirm" class="realm-danger">Delete</button></form></dialog>
    `);
    document.querySelector('label[for="realm-dimension-filter"]').htmlFor = 'realm-dimension-filter-trigger';
    document.querySelectorAll('#realm-dimension, #realm-dimension-filter').forEach(enhanceRealmDropdown);
    document.addEventListener('pointerdown', event => { if (!event.target.closest('.realm-select')) closeRealmDropdowns(); });
    document.getElementById('realm-search').addEventListener('input', renderRealmLocations);
    document.getElementById('realm-dimension-filter').addEventListener('change', renderRealmLocations);
    document.getElementById('realm-location-form').addEventListener('submit', saveRealmLocation);
    document.getElementById('realm-location-form').addEventListener('input', renderRealmCoordinateHelper);
    document.getElementById('realm-code-form').addEventListener('submit', saveRealmCode);
    document.addEventListener('click', handleRealmAction);
    for (const id of ['realm-editor', 'realm-code-dialog']) {
        document.getElementById(id).addEventListener('cancel', event => { if (realmBusy) event.preventDefault(); });
    }
}

function openRealmHub() {
    if (!localPlayer) return;
    return transitionRealmHub(showRealmHub, true);
}

function showRealmHub() {
    if (!localPlayer) return;
    mountRealmHub();
    document.querySelectorAll('.screen').forEach(screen => screen.classList.add('hidden'));
    document.getElementById('realm-hub-screen').classList.remove('hidden');
    setActiveAppView('realm-hub');
    applyThemeVariables();
    realmCodeShown = false;
    realmCodeReady = false;
    realmReady = false;
    if (!history.state?.realmHub) history.pushState({ realmHub: true }, '');
    realmUnsubscribe.forEach(unsubscribe => unsubscribe());
    realmUnsubscribe = [];
    document.getElementById('realm-code-edit').classList.toggle('hidden', localPlayer !== 'Peter');
    setRealmStatus('Loading locations...');
    for (const key of ['code', 'locations']) {
        const ref = database.ref(`realmHub/${key}`);
        const handler = snapshot => {
            if (key === 'code') { realmCode = snapshot.val() || ''; realmCodeReady = true; renderRealmCode(); }
            else { realmLocations = snapshot.val() || {}; realmReady = true; setRealmStatus(''); renderRealmLocations(); }
        };
        ref.on('value', handler, () => { setRealmStatus('Could not load Realm Hub. Check your connection and database permissions.'); });
        realmUnsubscribe.push(() => ref.off('value', handler));
    }
    renderRealmCode();
    renderRealmLocations();
}

function closeRealmHub(fromHistory = false) {
    return transitionRealmHub(() => leaveRealmHub(fromHistory), false);
}

function leaveRealmHub(fromHistory = false) {
    realmUnsubscribe.forEach(unsubscribe => unsubscribe());
    realmUnsubscribe = [];
    document.querySelectorAll('.realm-dialog[open]').forEach(dialog => dialog.close());
    realmCodeShown = false;
    switchTab('home');
    if (!fromHistory && history.state?.realmHub) history.back();
}

function setRealmStatus(message) { document.getElementById('realm-status').textContent = message; }

function renderRealmCode() {
    document.getElementById('realm-code-value').textContent = !realmCodeReady ? 'Loading...' : realmCode ? (realmCodeShown ? realmCode : 'Code hidden') : 'No code added yet';
    document.getElementById('realm-reveal').textContent = realmCodeShown ? 'Hide' : 'Show';
    document.getElementById('realm-reveal').disabled = !realmCodeReady || !realmCode;
    document.getElementById('realm-copy').disabled = !realmCodeReady || !realmCode;
    document.getElementById('realm-code-edit').disabled = !realmCodeReady;
}

function renderRealmLocations() {
    const query = document.getElementById('realm-search').value.trim().toLowerCase();
    const dimension = document.getElementById('realm-dimension-filter').value;
    const locations = Object.entries(realmLocations).filter(([, value]) =>
        (dimension === 'all' || dimension === value.dimension) &&
        `${value.name} ${value.note || ''} ${value.x} ${value.y} ${value.z}`.toLowerCase().includes(query)
    ).sort((a, b) => a[1].name.localeCompare(b[1].name));
    document.getElementById('realm-add').disabled = !realmReady;
    document.getElementById('realm-location-count').textContent = realmReady ? `(${locations.length})` : '';
    document.getElementById('realm-location-list').innerHTML = locations.length ? locations.map(([id, value]) => `
        <article class="realm-location"><div class="realm-location-heading"><h3>${escapeHtml(value.name)}</h3><span class="realm-dimension ${Object.hasOwn(REALM_DIMENSIONS, value.dimension) ? value.dimension : ''}">${escapeHtml(REALM_DIMENSIONS[value.dimension] || value.dimension)}</span></div>
            <p class="realm-coordinates">${['x', 'y', 'z'].map(axis => `<span><b class="realm-axis-${axis}">${axis.toUpperCase()}</b> ${escapeHtml(value[axis])}</span>`).join('')}</p>
            ${value.note ? `<p class="realm-note">${escapeHtml(value.note)}</p>` : ''}
            <p class="realm-metadata">Added by ${escapeHtml(playerProfiles[value.createdBy]?.nickname || value.createdBy || 'Unknown')}<br>Updated ${escapeHtml(new Date(value.updatedAt).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }))} by ${escapeHtml(playerProfiles[value.updatedBy]?.nickname || value.updatedBy || 'Unknown')}</p>
            <div class="realm-actions"><button data-realm-action="edit" data-id="${escapeHtml(id)}">Edit</button><button data-realm-action="delete" data-id="${escapeHtml(id)}" class="realm-danger">Delete</button></div>
        </article>`).join('') : `<p class="realm-empty">${realmReady ? (query || dimension !== 'all' ? 'No matching locations.' : 'No locations yet.') : 'Loading...'}</p>`;
}

function openRealmLocationEditor(id = null) {
    if (!realmReady || realmBusy) return;
    const location = id ? realmLocations[id] : null;
    if (id && !location) return;
    realmEditingId = id;
    realmEditingRevision = location?.revision ?? null;
    document.getElementById('realm-editor-title').textContent = id ? 'Edit location' : 'Add location';
    for (const key of ['name', 'dimension', 'x', 'y', 'z', 'note']) {
        document.getElementById(`realm-${key}`).value = location?.[key] ?? (key === 'dimension' ? 'overworld' : '');
    }
    document.getElementById('realm-editor-status').textContent = '';
    syncRealmDropdown(document.getElementById('realm-dimension'));
    closeRealmDropdowns();
    renderRealmCoordinateHelper();
    document.getElementById('realm-editor').showModal();
}

function renderRealmCoordinateHelper() {
    const dimension = document.getElementById('realm-dimension').value;
    const xInput = document.getElementById('realm-x').value;
    const zInput = document.getElementById('realm-z').value;
    const factor = dimension === 'nether' ? 8 : 1 / 8;
    document.getElementById('realm-coordinate-helper').textContent = dimension === 'end' || !xInput || !zInput ? '' :
        `${dimension === 'nether' ? 'Overworld' : 'Nether'} equivalent: X ${Math.floor(Number(xInput) * factor)}, Z ${Math.floor(Number(zInput) * factor)}`;
}

function setRealmBusy(busy) {
    realmBusy = busy;
    document.querySelectorAll('#realm-location-form button, #realm-code-form button').forEach(button => { button.disabled = busy; });
}

async function saveRealmLocation(event) {
    event.preventDefault();
    if (realmBusy || !localPlayer) return;
    const location = { name: document.getElementById('realm-name').value.trim(), dimension: document.getElementById('realm-dimension').value, note: document.getElementById('realm-note').value.trim() };
    for (const axis of ['x', 'y', 'z']) location[axis] = document.getElementById(`realm-${axis}`).value === '' ? NaN : Number(document.getElementById(`realm-${axis}`).value);
    const status = document.getElementById('realm-editor-status');
    const validation = validateRealmLocation(location);
    if (validation) { status.textContent = validation; return; }
    const id = realmEditingId || database.ref('realmHub/locations').push().key;
    Object.assign(location, { createdBy: realmLocations[id]?.createdBy || localPlayer, updatedBy: localPlayer, updatedAt: Date.now(), revision: database.ref('realmHub/locations').push().key });
    setRealmBusy(true);
    status.textContent = 'Saving...';
    try {
        const result = await database.ref('realmHub/locations').transaction(current => updateRealmLocations(current, id, location, realmEditingRevision), undefined, false);
        if (!result.committed) { status.textContent = 'These coordinates already exist in this dimension, or this location changed. Close and reopen it to try again.'; return; }
        document.getElementById('realm-editor').close();
        playUiSound('confirm');
        setRealmStatus('Location saved.');
    } catch { status.textContent = 'Could not save. Check your connection and database permissions, then try again.'; }
    finally { setRealmBusy(false); }
}

function showAppConfirmation(title, body) {
    const dialog = document.getElementById('app-confirm-dialog');
    document.getElementById('app-confirm-title').textContent = title;
    document.getElementById('app-confirm-body').textContent = body;
    dialog.returnValue = 'cancel';
    return new Promise(resolve => {
        dialog.addEventListener('close', () => resolve(dialog.returnValue === 'confirm'), { once: true });
        dialog.showModal();
    });
}

async function deleteRealmLocation(id) {
    const location = realmLocations[id];
    if (!location || realmBusy) return;
    if (!await showAppConfirmation('Delete location?', `Remove "${location.name}" for both players?`)) return;
    try {
        const result = await database.ref(`realmHub/locations/${id}`).transaction(current => {
            if (!current || current.revision !== location.revision) return;
            return null;
        }, undefined, false);
        setRealmStatus(result.committed ? 'Location deleted.' : 'The location changed. Review it before deleting.');
        if (result.committed) playUiSound('confirm');
    } catch { setRealmStatus('Could not delete this location. Please try again.'); }
}

async function saveRealmCode(event) {
    event.preventDefault();
    if (localPlayer !== 'Peter' || realmBusy) return;
    const code = document.getElementById('realm-code-input').value.trim();
    if (!code || code.length > 100) return;
    setRealmBusy(true);
    document.getElementById('realm-code-status').textContent = 'Saving...';
    try {
        await database.ref('realmHub/code').set(code);
        document.getElementById('realm-code-dialog').close();
        realmCodeShown = false;
        renderRealmCode();
        playUiSound('confirm');
    } catch { document.getElementById('realm-code-status').textContent = 'Could not save the code. Please try again.'; }
    finally { setRealmBusy(false); }
}

async function handleRealmAction(event) {
    const button = event.target.closest('[data-realm-action]');
    if (!button || button.disabled) return;
    playUiSound('tap');
    switch (button.dataset.realmAction) {
        case 'exit': closeRealmHub(); break;
        case 'add': openRealmLocationEditor(); break;
        case 'edit': openRealmLocationEditor(button.dataset.id); break;
        case 'delete': await deleteRealmLocation(button.dataset.id); break;
        case 'reveal': realmCodeShown = !realmCodeShown; renderRealmCode(); break;
        case 'copy':
            try { await navigator.clipboard.writeText(realmCode); setRealmStatus('Realm code copied.'); }
            catch { realmCodeShown = true; renderRealmCode(); setRealmStatus('Copy unavailable. Select the displayed code to copy it.'); }
            break;
        case 'edit-code':
            if (localPlayer !== 'Peter') return;
            document.getElementById('realm-code-input').value = realmCode;
            document.getElementById('realm-code-status').textContent = '';
            document.getElementById('realm-code-dialog').showModal();
            break;
        case 'cancel-edit': if (!realmBusy) document.getElementById('realm-editor').close(); break;
        case 'cancel-code': if (!realmBusy) document.getElementById('realm-code-dialog').close(); break;
    }
}

window.addEventListener('popstate', () => {
    if (activeAppView === 'realm-hub') closeRealmHub(true);
    else if (history.state?.realmHub && localPlayer) openRealmHub();
});

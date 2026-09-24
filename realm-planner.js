const REALM_LIMITS = { locations: 300, categories: 30, lists: 30, items: 150 };
const REALM_DEFAULT_CATEGORIES = { bases: 'Bases', farms: 'Farms', villages: 'Villages', biomes: 'Biomes', structures: 'Structures' };
let realmPlannerData = {};
let realmPlannerReady = false;
let realmPlannerBusy = false;
let realmPlannerTab = 'locations';
let realmSelectedList = null;
let realmPlannerEditor = null;
const getRealmCategories = data => data.categoriesInitialized ? data.categories || {} : REALM_DEFAULT_CATEGORIES;

// All shared limits and quantity changes are checked against the same transaction snapshot.
function applyRealmPlannerCommand(current, command) {
    const data = current || {};
    data.categories = { ...getRealmCategories(data) };
    data.categoriesInitialized = true;
    data.lists ||= {};
    data.favourites ||= {};
    const { action, id, player, revision, stamp } = command;
    const title = String(command.title || '').trim();
    const note = String(command.note || '').trim();
    const validateText = () => {
        if (!title || title.length > 80) throw new Error('Enter a title of up to 80 characters.');
        if (note.length > 1000) throw new Error('Keep notes to 1,000 characters or fewer.');
    };
    const checkRevision = value => { if (revision != null && value?.revision !== revision) throw new Error('This entry changed. Reopen it before saving.'); };
    if (action === 'favourite') {
        if (!data.locations?.[id]) throw new Error('This location no longer exists.');
        data.favourites[player] ||= {};
        if (command.selected) data.favourites[player][id] = true;
        else delete data.favourites[player][id];
    } else if (action === 'category-save') {
        validateText();
        if (command.original != null && data.categories[id] !== command.original) throw new Error('This category changed. Reopen it before saving.');
        if (!data.categories[id] && Object.keys(data.categories).length >= REALM_LIMITS.categories) throw new Error('Category limit reached (30). Delete a category to add another.');
        if (Object.entries(data.categories).some(([key, name]) => key !== id && name.toLowerCase() === title.toLowerCase())) throw new Error('A category with this name already exists.');
        data.categories[id] = title;
    } else if (action === 'category-delete') {
        if (data.categories[id] !== command.original) throw new Error('This category changed. Review it before deleting.');
        delete data.categories[id];
        for (const location of Object.values(data.locations || {})) if (location.category === id) delete location.category;
    } else if (action === 'list-save') {
        validateText();
        checkRevision(data.lists[id]);
        if (!data.lists[id] && Object.keys(data.lists).length >= REALM_LIMITS.lists) throw new Error('List limit reached (30, including archived lists). Delete a list to add another.');
        if (command.locationId && !data.locations?.[command.locationId]) throw new Error('The linked location no longer exists.');
        data.lists[id] = { ...(data.lists[id] || { archived: false, createdBy: player }), title, note, locationId: command.locationId || '', revision: stamp };
    } else {
        const list = data.lists[command.listId || id];
        if (!list) throw new Error('This list no longer exists.');
        if (action === 'list-delete') { checkRevision(list); delete data.lists[id]; }
        else if (action === 'list-archive') { list.archived = command.archived; list.revision = stamp; }
        else {
            list.items ||= {};
            const item = list.items[id];
            if (action === 'item-save') {
                validateText();
                checkRevision(item);
                if (!item && Object.keys(list.items).length >= REALM_LIMITS.items) throw new Error('Item limit reached (150). Delete an item to add another.');
                if (!['checkbox', 'quantity'].includes(command.kind)) throw new Error('Choose an item type.');
                const target = Number(command.target);
                const amount = Number(command.amount);
                if (command.kind === 'quantity' && (!Number.isSafeInteger(target) || target < 1 || target > 1000000000 || !Number.isSafeInteger(amount) || amount < 0 || amount > target)) throw new Error('Use whole quantities from 0 up to the target (maximum target: 1,000,000,000).');
                list.items[id] = { title, note, kind: command.kind, target: command.kind === 'quantity' ? target : 1, amount: command.kind === 'quantity' ? amount : (item?.amount || 0) > 0 ? 1 : 0, revision: stamp };
            } else {
                if (!item) throw new Error('This item no longer exists.');
                if (action === 'item-delete') { checkRevision(item); delete list.items[id]; }
                else if (action === 'item-check') { item.amount = command.completed ? item.target : 0; item.revision = stamp; }
                else if (action === 'quantity') {
                    const value = Number(command.amount);
                    if (!Number.isSafeInteger(value) || value < 0 || value > 1000000000) throw new Error('Enter a positive whole amount, or 0.');
                    if (command.operation === 'set') checkRevision(item);
                    item.amount = command.operation === 'complete' ? item.target : command.operation === 'add' ? Math.min(item.target, item.amount + value) : Math.min(item.target, value);
                    item.revision = stamp;
                }
            }
            list.revision = stamp;
        }
    }
    return data;
}
async function commitRealmPlanner(command) {
    const player = localPlayer;
    const stamp = database.ref('realmHub').push().key;
    const result = await database.ref('realmHub').transaction(current => {
        if (localPlayer !== player) return;
        if (!current && (command.revision != null || command.original != null || !['category-save','list-save'].includes(command.action))) return current;
        return applyRealmPlannerCommand(current, { ...command, player, stamp });
    }, undefined, false);
    if (!result.committed) throw new Error('Could not save. Please try again.');
    playUiSound('confirm');
}
function realmLimitLabel(count, limit) { return `<span class="realm-limit ${count >= limit * .9 ? 'realm-near-limit' : ''}">${count} / ${limit}</span>`; }
function realmProgress(amount, target, title) {
    return `<div class="realm-quantity-summary"><div class="achievement-progress-label"><span class="achievement-remaining">${Math.max(0, target - amount)} left</span><span>${amount} / ${target}</span></div><progress class="app-progress" max="${Math.max(1, target)}" value="${amount}" aria-label="${escapeHtml(title)}"></progress></div>`;
}
function realmFavouriteButton(id) {
    const selected = Boolean(realmPlannerData.favourites?.[localPlayer]?.[id]);
    return `<button class="realm-favourite" data-plan-action="favourite" data-id="${escapeHtml(id)}" aria-pressed="${selected}" title="${selected ? 'Remove from favourites' : 'Add to favourites'}" aria-label="${selected ? 'Remove from favourites' : 'Add to favourites'}">${selected ? '&#9733;' : '&#9734;'}</button>`;
}
function realmCategoryLabel(id) { const name = getRealmCategories(realmPlannerData)[id]; return name ? `<p class="realm-category-label">${escapeHtml(name)}</p>` : ''; }
function matchesRealmOrganisation(location, id) {
    const category = document.getElementById('realm-category-filter')?.value || 'all';
    return (category === 'all' || (category === 'none' ? !location.category || !getRealmCategories(realmPlannerData)[location.category] : location.category === category)) &&
        (!document.getElementById('realm-favourites-filter')?.checked || realmPlannerData.favourites?.[localPlayer]?.[id]);
}
function replaceRealmOptions(select, options, selected = select.value) {
    const signature = JSON.stringify(options);
    if (select.dataset.options !== signature) {
        const wrapper = select.closest('.realm-select');
        if (wrapper) { wrapper.before(select); wrapper.remove(); }
        select.replaceChildren(...options.map(([value, label]) => new Option(label, value)));
        select.value = options.some(([value]) => value === selected) ? selected : options[0][0];
        select.dataset.options = signature;
        enhanceRealmDropdown(select);
        select.closest('.realm-select').querySelector('.realm-select-trigger').setAttribute('aria-label', select.getAttribute('aria-label') || 'Category');
    } else { select.value = selected; if (!select.value) select.value = options[0][0]; syncRealmDropdown(select); }
}
function prepareRealmCategoryEditor(location) {
    replaceRealmOptions(document.getElementById('realm-category'), [['','Uncategorised'], ...Object.entries(getRealmCategories(realmPlannerData))], location?.category || '');
    updateRealmCharacterCounts();
}
function updateRealmCharacterCounts() {
    document.querySelectorAll('[data-character-count]').forEach(label => {
        const input = document.getElementById(label.dataset.characterCount);
        label.textContent = `${input.value.length} / ${input.maxLength}`;
        label.classList.toggle('realm-near-limit', input.value.length >= input.maxLength * .9);
    });
}
function mountRealmPlanner() {
    const locations = document.querySelector('.realm-locations-section');
    locations.id = 'realm-locations-panel';
    locations.insertAdjacentHTML('beforebegin', '<div class="realm-tabs" role="tablist"><button role="tab" aria-selected="true" aria-controls="realm-locations-panel" data-plan-action="tab" data-tab="locations">Locations</button><button role="tab" aria-selected="false" aria-controls="realm-lists-panel" data-plan-action="tab" data-tab="lists">Lists</button></div>');
    document.getElementById('realm-dimension-filter').closest('.realm-select').insertAdjacentHTML('afterend', '<div class="realm-organisation"><label><input id="realm-favourites-filter" type="checkbox"> Favourites</label><label for="realm-category-filter">Category</label><select id="realm-category-filter" aria-label="Filter by category"></select><button data-plan-action="categories">Manage categories</button></div>');
    locations.insertAdjacentHTML('afterend', '<section id="realm-lists-panel" hidden><p id="realm-planner-status" role="status"></p><div id="realm-lists-content"></div></section>');
    document.getElementById('realm-favourites-filter').classList.add('app-checkbox');
    document.getElementById('realm-name').parentElement.insertAdjacentHTML('afterend', '<small class="realm-character-count" data-character-count="realm-name"></small><label for="realm-category">Category</label><select id="realm-category" aria-label="Location category"></select>');
    document.getElementById('realm-note').parentElement.insertAdjacentHTML('afterend', '<small class="realm-character-count" data-character-count="realm-note"></small>');
    document.body.insertAdjacentHTML('beforeend', '<dialog id="realm-plan-editor" class="realm-dialog" aria-labelledby="realm-plan-title"><form id="realm-plan-form"></form></dialog><dialog id="realm-categories-dialog" class="realm-dialog" aria-label="Categories"><div id="realm-categories-content"></div></dialog>');
    document.getElementById('realm-favourites-filter').onchange = renderRealmLocations;
    document.getElementById('realm-category-filter').onchange = renderRealmLocations;
    document.addEventListener('input', updateRealmCharacterCounts);
    document.addEventListener('click', handleRealmPlannerAction);
    document.getElementById('realm-plan-form').onsubmit = saveRealmPlannerEditor;
    document.getElementById('realm-plan-editor').addEventListener('cancel', event => { if (realmPlannerBusy) event.preventDefault(); });
    prepareRealmCategoryEditor(null);
}
function startRealmPlanner() {
    realmPlannerReady = false;
    realmPlannerData = {};
    realmSelectedList = null;
    realmPlannerTab = 'locations';
    setRealmPlannerTab('locations');
    document.getElementById('realm-favourites-filter').checked = false;
    const player = localPlayer;
    const ref = database.ref('realmHub');
    const callback = snapshot => {
        if (localPlayer !== player || activeAppView !== 'realm-hub') return;
        realmPlannerData = snapshot.val() || {};
        realmPlannerReady = true;
        renderRealmPlanner();
        renderRealmLocations();
    };
    ref.on('value', callback, () => {
        const message = 'Could not load lists and favourites. Reopen Realm Hub to retry.';
        setRealmStatus(message);
        document.getElementById('realm-planner-status').textContent = message;
    });
    realmUnsubscribe.push(() => ref.off('value', callback));
}
function setRealmPlannerTab(tab) {
    realmPlannerTab = tab;
    document.getElementById('realm-locations-panel').hidden = tab !== 'locations';
    document.getElementById('realm-lists-panel').hidden = tab !== 'lists';
    document.querySelectorAll('[data-plan-action="tab"]').forEach(button => button.setAttribute('aria-selected', String(button.dataset.tab === tab)));
    renderRealmPlanner();
}
function renderRealmPlanner() {
    const categories = getRealmCategories(realmPlannerData);
    replaceRealmOptions(document.getElementById('realm-category-filter'), [['all','All categories'], ['none','Uncategorised'], ...Object.entries(categories)]);
    const categoryHost = document.getElementById('realm-categories-content');
    categoryHost.innerHTML = `<h2>Categories ${realmLimitLabel(Object.keys(categories).length,30)}</h2>${Object.entries(categories).map(([id,name]) => `<div class="realm-category-row"><span>${escapeHtml(name)}</span><button data-plan-action="category-edit" data-id="${id}">Edit</button><button data-plan-action="category-delete" data-id="${id}">Delete</button></div>`).join('')}<div class="realm-dialog-actions"><button data-plan-action="close-categories">Close</button><button data-plan-action="category-add" ${Object.keys(categories).length >= 30 ? 'disabled' : ''}>Add category</button></div>${Object.keys(categories).length >= 30 ? '<p>Category limit reached. Delete a category to add another.</p>' : ''}`;
    const host = document.getElementById('realm-lists-content');
    if (!realmPlannerReady) { host.innerHTML = '<p class="realm-empty">Loading lists...</p>'; return; }
    const lists = realmPlannerData.lists || {};
    const list = lists[realmSelectedList];
    if (realmSelectedList && !list) realmSelectedList = null;
    if (!realmSelectedList) {
        const row = ([id, value]) => `<div class="realm-list-entry"><button data-plan-action="list-open" data-id="${id}"><strong>${escapeHtml(value.title)}</strong><span>${Object.values(value.items || {}).filter(item => item.amount >= item.target).length} / ${Object.keys(value.items || {}).length} complete</span></button><button data-plan-action="list-archive" data-id="${id}">${value.archived ? 'Restore' : 'Archive'}</button></div>`;
        const active = Object.entries(lists).filter(([, value]) => !value.archived);
        const archived = Object.entries(lists).filter(([, value]) => value.archived);
        host.innerHTML = `<div class="realm-section-heading"><h2>Lists ${realmLimitLabel(Object.keys(lists).length,30)}</h2><button class="realm-primary" data-plan-action="list-add" ${Object.keys(lists).length >= 30 ? 'disabled' : ''}>Add list</button></div>${Object.keys(lists).length >= 30 ? '<p>List limit reached, including archived lists. Delete a list to add another.</p>' : ''}${active.length ? active.map(row).join('') : '<p class="realm-empty">No active lists.</p>'}<details class="realm-completed"><summary>Archived (${archived.length})</summary>${archived.map(row).join('')}</details>`;
        return;
    }
    const items = Object.entries(list.items || {});
    const row = ([id,item]) => `<article class="realm-checklist-item"><label><input class="app-checkbox" type="checkbox" data-plan-check="${id}" ${item.amount >= item.target ? 'checked' : ''}><strong>${escapeHtml(item.title)}</strong></label>${item.note ? `<p>${escapeHtml(item.note)}</p>` : ''}${item.kind === 'quantity' ? realmProgress(item.amount, item.target, item.title) : ''}<div class="realm-actions realm-item-actions">${item.kind === 'quantity' ? `<button data-plan-action="quantity" data-id="${id}">Update amount</button>` : ''}<button data-plan-action="item-edit" data-id="${id}">Edit</button><button class="realm-danger" data-plan-action="item-delete" data-id="${id}">Delete</button></div></article>`;
    const complete = items.filter(([,item]) => item.amount >= item.target);
    const location = realmPlannerData.locations?.[list.locationId];
    host.innerHTML = `<div class="realm-section-heading"><h2>${escapeHtml(list.title)}</h2><button data-plan-action="lists-back">Back</button></div>${list.note ? `<p class="realm-note">${escapeHtml(list.note)}</p>` : ''}${location ? `<button data-plan-action="linked-location" data-id="${list.locationId}">${escapeHtml(location.name)}</button>` : ''}<div class="realm-actions"><button data-plan-action="list-edit" data-id="${realmSelectedList}">Edit list</button><button data-plan-action="list-archive" data-id="${realmSelectedList}">${list.archived ? 'Restore' : 'Archive'}</button><button class="realm-danger" data-plan-action="list-delete" data-id="${realmSelectedList}">Delete list</button></div><div class="realm-section-heading"><h3>Items ${realmLimitLabel(items.length,150)}</h3><button class="realm-primary" data-plan-action="item-add" ${items.length >= 150 ? 'disabled' : ''}>Add item</button></div>${items.length >= 150 ? '<p>Item limit reached. Delete an item to add another.</p>' : ''}${items.filter(([,item]) => item.amount < item.target).map(row).join('')}<details class="realm-completed"><summary>Completed (${complete.length})</summary>${complete.map(row).join('')}</details>`;
    host.querySelectorAll('[data-plan-check]').forEach(input => { input.onchange = () => runRealmPlanner({ action: 'item-check', id: input.dataset.planCheck, listId: realmSelectedList, completed: input.checked }); });
    const summary = document.createElement('article');
    summary.className = 'realm-list-summary';
    const heading = host.querySelector('.realm-section-heading');
    host.prepend(summary);
    summary.append(heading);
    while (summary.nextElementSibling && !summary.nextElementSibling.classList.contains('realm-section-heading')) summary.append(summary.nextElementSibling);
    summary.insertAdjacentHTML('beforeend', realmProgress(complete.length, items.length, `${list.title} items complete`));
}
function plannerTextField(id, label, value = '', notes = false) {
    return `<label>${label}${notes ? `<textarea id="${id}" maxlength="1000" rows="3">${escapeHtml(value)}</textarea>` : `<input id="${id}" maxlength="80" required value="${escapeHtml(value)}">`}</label><small class="realm-character-count" data-character-count="${id}"></small>`;
}
function openRealmPlannerEditor(kind, id = null) {
    const list = realmPlannerData.lists?.[realmSelectedList];
    const value = kind === 'category' ? { title: getRealmCategories(realmPlannerData)[id] || '' } : kind === 'list' ? realmPlannerData.lists?.[id] || {} : list?.items?.[id] || {};
    realmPlannerEditor = { kind, id, listId: realmSelectedList, revision: value.revision ?? null, original: id && kind === 'category' ? value.title : null };
    const form = document.getElementById('realm-plan-form');
    const title = kind === 'quantity' ? value.title : `${id ? 'Edit' : 'Add'} ${kind}`;
    let fields = kind === 'quantity' ? `<label>Action<select id="realm-plan-operation"><option value="add">Add amount</option><option value="set">Set collected amount</option><option value="complete">Mark complete</option></select></label><label>Amount<input id="realm-plan-amount" type="number" min="0" max="1000000000" step="1" value="0" required></label><p>${value.amount} / ${value.target} collected</p>` : plannerTextField('realm-plan-name', 'Name', value.title || '') + (kind !== 'category' ? plannerTextField('realm-plan-note', 'Notes', value.note || '', true) : '');
    if (kind === 'item') fields += `<label>Item type<select id="realm-plan-kind"><option value="checkbox">Checkbox</option><option value="quantity">Quantity</option></select></label><div id="realm-plan-quantities"><label>Collected<input id="realm-plan-amount" type="number" min="0" max="1000000000" step="1" value="${value.amount || 0}" required></label><label>Target<input id="realm-plan-target" type="number" min="1" max="1000000000" step="1" value="${value.target || 1}" required></label></div>`;
    if (kind === 'list') fields += `<label>Linked location<select id="realm-plan-location"><option value="">None</option>${Object.entries(realmPlannerData.locations || {}).map(([key,location]) => `<option value="${key}">${escapeHtml(location.name)}</option>`).join('')}</select></label>`;
    form.innerHTML = `<h2 id="realm-plan-title">${escapeHtml(title)}</h2>${fields}<p id="realm-plan-status" role="status"></p><div class="realm-dialog-actions"><button type="button" data-plan-action="cancel-editor">Cancel</button><button type="submit" class="realm-primary">Save</button></div>`;
    if (kind === 'item') {
        const select = document.getElementById('realm-plan-kind'); select.value = value.kind || 'checkbox';
        const update = () => { const hidden = select.value !== 'quantity'; document.getElementById('realm-plan-quantities').hidden = hidden; document.querySelectorAll('#realm-plan-quantities input').forEach(input => { input.disabled = hidden; }); };
        select.onchange = update; update();
    }
    if (kind === 'list') document.getElementById('realm-plan-location').value = value.locationId || '';
    form.querySelectorAll('select').forEach(enhanceRealmDropdown);
    updateRealmCharacterCounts();
    document.getElementById('realm-plan-editor').showModal();
}
async function runRealmPlanner(command) {
    if (realmPlannerBusy || !realmPlannerReady) return false;
    realmPlannerBusy = true;
    try { await commitRealmPlanner(command); setRealmStatus('Saved.'); return true; }
    catch (error) {
        const status = document.getElementById('realm-plan-editor').open ? document.getElementById('realm-plan-status') : document.getElementById(realmPlannerTab === 'lists' ? 'realm-planner-status' : 'realm-status');
        status.textContent = error.message || 'Could not save. Please try again.';
        return false;
    } finally { realmPlannerBusy = false; }
}
async function saveRealmPlannerEditor(event) {
    event.preventDefault();
    const editing = realmPlannerEditor;
    const read = id => document.getElementById(`realm-plan-${id}`)?.value || '';
    const command = { ...editing, id: editing.id || database.ref('realmHub').push().key, action: editing.kind === 'quantity' ? 'quantity' : `${editing.kind}-save`, title: read('name'), note: read('note'), kind: read('kind'), amount: Number(read('amount')), target: Number(read('target')), operation: read('operation'), locationId: read('location') };
    if (await runRealmPlanner(command)) document.getElementById('realm-plan-editor').close();
}
async function handleRealmPlannerAction(event) {
    const button = event.target.closest('[data-plan-action]');
    if (!button || button.disabled || realmPlannerBusy) return;
    const action = button.dataset.planAction;
    const id = button.dataset.id;
    playUiSound('tap');
    if (action === 'tab') setRealmPlannerTab(button.dataset.tab);
    else if (action === 'favourite') await runRealmPlanner({ action, id, selected: !realmPlannerData.favourites?.[localPlayer]?.[id] });
    else if (action === 'categories') document.getElementById('realm-categories-dialog').showModal();
    else if (action === 'close-categories') document.getElementById('realm-categories-dialog').close();
    else if (action === 'cancel-editor') document.getElementById('realm-plan-editor').close();
    else if (['category-add','category-edit','list-add','list-edit','item-add','item-edit'].includes(action)) openRealmPlannerEditor(action.split('-')[0], id || null);
    else if (action === 'quantity') openRealmPlannerEditor('quantity', id);
    else if (action === 'list-open') { realmSelectedList = id; renderRealmPlanner(); }
    else if (action === 'lists-back') { realmSelectedList = null; renderRealmPlanner(); }
    else if (action === 'linked-location') { setRealmPlannerTab('locations'); document.getElementById('realm-search').value = realmPlannerData.locations[id].name; document.getElementById('realm-category-filter').value = 'all'; document.getElementById('realm-dimension-filter').value = 'all'; syncRealmDropdown(document.getElementById('realm-dimension-filter')); document.getElementById('realm-favourites-filter').checked = false; renderRealmPlanner(); renderRealmLocations(); }
    else if (action === 'list-archive') await runRealmPlanner({ action, id, archived: !realmPlannerData.lists[id].archived });
    else if (action.endsWith('-delete')) {
        const original = getRealmCategories(realmPlannerData)[id];
        const revision = action === 'list-delete' ? realmPlannerData.lists?.[id]?.revision : realmPlannerData.lists?.[realmSelectedList]?.items?.[id]?.revision;
        if (await showAppConfirmation('Delete entry?', action === 'category-delete' ? 'Locations in this category will become uncategorised. Delete for both players?' : 'Permanently delete this entry for both players?')) await runRealmPlanner({ action, id, listId: realmSelectedList, revision, original });
    }
}

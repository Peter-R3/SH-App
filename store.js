// Preview catalogue only: no persistence, prices or ownership state.
const storeConcepts = [
    { id: 'sweetheart', name: 'Sweetheart', category: 'frames', style: 'sweetheart' },
    { id: 'pearl', name: 'Pearl Halo', category: 'frames', style: 'pearl' },
    { id: 'love-note', name: 'Love Note', category: 'messages', style: 'love-note' },
    { id: 'cloud', name: 'Cloud Nine', category: 'messages', style: 'cloud' }
];
let storeCategory = 'all';
function storeSample(item) {
    const name = escapeHtml(playerProfiles[localPlayer]?.nickname || localPlayer || 'Player');
    return `<div class="store-sample ${item.style}" aria-hidden="true">${item.category === 'frames'
        ? '<div class="store-frame"><div class="store-avatar"></div><span class="store-charm">&#9825;</span></div>'
        : `<div class="store-message"><span class="store-message-name">${name}</span><div class="store-bubble">Good game! <span>&#9825;</span></div></div>`}</div>`;
}
function mountStore() {
    if (document.getElementById('store-screen')) return;
    const screen = document.createElement('section');
    screen.id = 'store-screen';
    screen.className = 'screen hidden app-tab-screen';
    const header = document.getElementById('home-header-shell').cloneNode(true);
    const nav = document.getElementById('home-nav-shell').cloneNode(true);
    [header, ...header.querySelectorAll('[id]'), nav, ...nav.querySelectorAll('[id]')].forEach(el => { if (el.id) el.id = el.id.replace('home-', 'store-'); });
    header.querySelector('.header-title').textContent = 'Store';
    const content = document.createElement('div');
    content.className = 'store-content';
    content.innerHTML = '<div class="store-heading"><h2>The little collection</h2><span>Preview only</span></div><div class="store-filters" aria-label="Item categories"></div><div class="store-grid"></div>';
    screen.append(header, content, nav);
    document.getElementById('home-screen').after(screen);
    const dialog = document.createElement('dialog');
    dialog.id = 'store-preview';
    dialog.className = 'store-preview';
    dialog.setAttribute('aria-labelledby', 'store-preview-title');
    document.body.append(dialog);
    dialog.addEventListener('click', event => { if (event.target === dialog) dialog.close(); });
    dialog.addEventListener('close', () => playUiSound('tap'));
    content.addEventListener('click', event => {
        const category = event.target.closest('[data-store-category]');
        const item = event.target.closest('[data-store-item]');
        if (category) { storeCategory = category.dataset.storeCategory; renderStore(); playUiSound('tap'); }
        if (item) { previewStoreItem(item.dataset.storeItem); playUiSound('tap'); }
    });
}
function renderStore() {
    const screen = document.getElementById('store-screen');
    screen.querySelector('.store-filters').innerHTML = [['all','All'],['frames','Profile frames'],['messages','Message styles']].map(([id,label]) => `<button data-store-category="${id}" aria-pressed="${storeCategory === id}">${label}</button>`).join('');
    screen.querySelector('.store-grid').innerHTML = storeConcepts.filter(item => storeCategory === 'all' || item.category === storeCategory).map(item => `<button class="store-item" data-store-item="${item.id}" aria-label="Preview ${item.name}">${storeSample(item)}<span class="store-item-info"><strong>${item.name}</strong><small>${item.category === 'frames' ? 'Profile frame' : 'Message style'}</small></span></button>`).join('');
    screen.querySelectorAll('.store-avatar').forEach(el => renderProfileAvatar(el, localPlayer));
}
function openStoreScreen() {
    mountStore();
    document.getElementById('store-screen').classList.remove('hidden');
    applyThemeToScreen('store-screen', 'store-header-shell', 'store-nav-shell');
    refreshSharedHeader('store');
    renderStore();
}
function previewStoreItem(id) {
    const item = storeConcepts.find(item => item.id === id);
    if (!item) return;
    const dialog = document.getElementById('store-preview');
    dialog.innerHTML = `<div class="store-preview-heading"><div><small>Preview only</small><h2 id="store-preview-title">${item.name}</h2></div><form method="dialog"><button aria-label="Close preview" title="Close preview">&times;</button></form></div>${storeSample(item)}`;
    dialog.querySelectorAll('.store-avatar').forEach(el => renderProfileAvatar(el, localPlayer));
    dialog.showModal();
}

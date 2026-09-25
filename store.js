// Preview catalogue only: no persistence, prices or ownership state.
const storeConcepts = [
    { id: 'sweetheart', name: 'Sweetheart', category: 'frames', style: 'sweetheart', adjustment: { type: 'charm', default: 1 } },
    { id: 'pearl', name: 'Pearl Halo', category: 'frames', style: 'pearl', adjustment: { label: 'Ring spacing', min: 1, max: 5, step: 1, default: 3, unit: 'px' } },
    { id: 'double', name: 'Double Outline', category: 'frames', style: 'double', adjustment: { label: 'Line thickness', min: 1, max: 3, step: .5, default: 1.5, unit: 'px' } },
    { id: 'glow', name: 'Soft Glow', category: 'frames', style: 'glow', adjustment: { label: 'Glow intensity', min: 0, max: 100, step: 1, default: 45, unit: '%' } },
    { id: 'stitched', name: 'Stitched', category: 'frames', style: 'stitched', adjustment: { label: 'Stitch weight', min: 1, max: 3, step: .5, default: 1.5, unit: 'px' } },
    { id: 'satin', name: 'Satin', category: 'frames', style: 'satin', adjustment: { label: 'Sheen', min: 0, max: 70, step: 1, default: 35, unit: '%' } },
    { id: 'love-note', name: 'Love Note', category: 'messages', style: 'love-note', adjustment: { label: 'Heart detail', type: 'toggle', default: true } }
];
const storeCategories = [{ id: 'frames', name: 'Profile frames', sample: 'sweetheart' }, { id: 'messages', name: 'Message styles', sample: 'love-note' }];
let storeCategory = null;
let storeAdjustments = {};
let storeActiveItem = null;
let storeExtras = {};
let storeColourSlot = 'primary';
const storeHeartChoices = [['none','No charm','&times;'],['outline','Outline heart','&#9825;'],['filled','Solid heart','&#9829;'],['pair','Double heart','&#9825;&#9825;']];

function resetStorePreviews() {
    storeAdjustments = {};
    storeExtras = {};
    storeActiveItem = null;
    storeCategory = null;
    storeColourSlot = 'primary';
    storePreviewColour = themeColorFor(localPlayer);
    document.getElementById('store-preview')?.close();
}

function storeAdjustmentValue(item) { return storeAdjustments[item.id] ?? item.adjustment.default; }
function applyStoreAdjustments() {
    document.querySelectorAll('[data-store-design]').forEach(sample => {
        const item = storeConcepts.find(item => item.id === sample.dataset.storeDesign);
        const value = storeAdjustmentValue(item);
        const extra = storeExtras[item.id] || {};
        sample.classList.toggle('store-hide-detail', item.adjustment.type === 'toggle' && !value);
        sample.style.setProperty('--frame-weight', `${value}px`);
        sample.style.setProperty('--pearl-gap', `${value}px`);
        sample.style.setProperty('--glow-radius', `${value * .24}px`);
        sample.style.setProperty('--glow-colour', `${storePreviewColour}${Math.round(Number(value) * 2).toString(16).padStart(2, '0')}`);
        sample.style.setProperty('--satin-sheen', Number(value) / 100);
        sample.style.setProperty('--satin-weight', `${extra.thickness ?? 2}px`);
        sample.style.setProperty('--sweet-secondary', extra.secondary || storePalette(storePreviewColour).light);
        const charm = sample.querySelector('.store-charm');
        if (charm) {
            const heart = storeHeartChoices.find(choice => choice[0] === (extra.heart || 'outline'));
            charm.innerHTML = heart[2];
            charm.hidden = heart[0] === 'none';
            charm.classList.toggle('store-pair-charm', heart[0] === 'pair');
        }
        const pearls = sample.querySelector('.store-pearls');
        if (pearls) {
            const count = Number(extra.pearls || 32);
            pearls.innerHTML = Array.from({length: count}, (_, index) => `<i style="--angle:${index * 360 / count}deg"></i>`).join('');
        }
    });
    const item = storeConcepts.find(item => item.id === storeActiveItem);
    const input = document.getElementById('store-adjustment');
    if (item && input) {
        const value = storeAdjustmentValue(item);
        if (item.adjustment.type === 'toggle') input.checked = value;
        else { input.value = value; document.getElementById('store-adjustment-value').textContent = `${value}${item.adjustment.unit}`; }
    }
}

function storeAdjustmentControl(item) {
    if (item.id === 'sweetheart') return '';
    const a = item.adjustment;
    return `<div class="store-adjustment">${a.type === 'toggle'
        ? `<label class="store-detail-toggle"><input id="store-adjustment" class="app-checkbox" type="checkbox">${a.label}</label>`
        : `<div class="store-adjustment-heading"><label for="store-adjustment">${a.label}</label><output id="store-adjustment-value" for="store-adjustment"></output></div><input id="store-adjustment" type="range" min="${a.min}" max="${a.max}" step="${a.step}">`}</div>`;
}
const storeColours = [
    ['Peter blue', DEFAULT_THEME_COLOURS.Peter], ['Jadey pink', DEFAULT_THEME_COLOURS.Jadey],
    ['Mint', '#B7E4CF'], ['Lilac', '#C7B8EA'], ['Peach', '#F3C4A8'], ['Buttercup', '#F3E4A9']
];
let storePreviewColour = null;
let storePreviewPlayer = null;
function storePalette(colour) {
    const rgb = hexToRgb(colour);
    const mix = (target, ratio) => rgbToHex(...['r','g','b'].map((channel, index) => rgb[channel] * (1 - ratio) + target[index] * ratio));
    return { accent: colour, soft: mix([255,255,255], .78), light: mix([255,255,255], .93), border: mix([255,255,255], .3), pattern: mix([255,255,255], .3) + '55', dark: mix([0,0,0], .72), stage: mix([21,18,25], .88) };
}
function storeSwatches(slot = 'primary') {
    return `<div class="store-swatches" data-store-slot="${slot}" role="group" aria-label="${slot} preview colours">${storeColours.map(([name, colour]) => `<button type="button" data-store-colour="${colour}" style="--swatch:${colour}" aria-label="${name}" title="${name}" aria-pressed="false"></button>`).join('')}<button type="button" class="store-custom-swatch" data-store-custom="${slot}" aria-label="Custom ${slot} colour" title="Custom colour"><svg class="lucide lucide-sliders-horizontal" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 4h-7M10 4H3M21 12h-9M8 12H3M21 20h-5M12 20H3M14 2v4M8 10v4M16 18v4"/></svg></button></div>`;
}
function applyStorePreviewColour(colour, syncSliders = true) {
    const normalized = normalizeHexColour(colour);
    if (!normalized) return false;
    storePreviewColour = normalized;
    const palette = storePalette(normalized);
    document.querySelectorAll('#store-screen, #store-preview').forEach(host => {
        Object.entries(palette).forEach(([key, value]) => host.style.setProperty(`--decor-${key}`, value));
        host.querySelectorAll('[data-store-colour]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.storeColour === (button.closest('[data-store-slot]').dataset.storeSlot === 'secondary' ? storeExtras.sweetheart?.secondary || storePalette(normalized).light : normalized))));
    });
    const hex = document.getElementById('store-colour-hex');
    if (hex) { hex.value = normalized; hex.removeAttribute('aria-invalid'); }
    const status = document.getElementById('store-colour-status');
    if (status) status.textContent = '';
    if (syncSliders) {
        const hsv = hexToHsv(normalized);
        for (const key of ['h','s','v']) {
            const slider = document.getElementById(`store-colour-${key}`);
            if (slider) slider.value = Math.round(hsv[key]);
        }
    }
    document.querySelectorAll('.store-colour-readout').forEach(el => { el.textContent = el.dataset.secondary ? storeExtras.sweetheart?.secondary || palette.light : normalized; });
    applyStoreAdjustments();
    return true;
}
function storeSample(item) {
    const name = escapeHtml(playerProfiles[localPlayer]?.nickname || localPlayer || 'Player');
    return `<div class="store-sample ${item.style}" data-store-design="${item.id}" aria-hidden="true">${item.category === 'frames'
        ? `<div class="store-frame">${item.id === 'pearl' ? '<span class="store-pearls"></span>' : ''}<div class="store-avatar"></div>${['sweetheart','pearl'].includes(item.id) ? '<span class="store-charm">&#9825;</span>' : ''}</div>`
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
    content.innerHTML = '<div class="store-heading"><div><h2>Browse the collection</h2><small>Preview only</small></div><div id="store-coin-balance" class="home-coin-balance" aria-label="Coin balance: 0"><img src="./assets/currency/Coin.svg?v=45" alt="" width="22" height="22"><span>0</span></div></div><div class="store-category-heading"></div><div class="store-palette"><span>Colour</span><div id="store-palette-options"></div><output class="store-colour-readout"></output></div><div class="store-grid"></div>';
    screen.append(header, content, nav);
    document.getElementById('home-screen').after(screen);
    const dialog = document.createElement('dialog');
    dialog.id = 'store-preview';
    dialog.className = 'store-preview';
    dialog.setAttribute('aria-labelledby', 'store-preview-title');
    document.body.append(dialog);
    dialog.addEventListener('click', event => { if (event.target === dialog) dialog.close(); });
    dialog.addEventListener('close', () => playUiSound('tap'));
    const chooseColour = event => {
        const custom = event.target.closest('[data-store-custom]');
        if (custom) {
            if (!dialog.open) previewStoreItem('palette');
            storeColourSlot = custom.dataset.storeCustom;
            document.querySelector('.store-custom-colour').hidden = false;
            syncStoreCustomEditor();
            playUiSound('tap');
        }
        const swatch = event.target.closest('[data-store-colour]');
        if (swatch) {
            storeColourSlot = swatch.closest('[data-store-slot]').dataset.storeSlot;
            setStoreSelectedColour(swatch.dataset.storeColour);
            playUiSound('tap');
        }
    };
    content.addEventListener('click', chooseColour);
    dialog.addEventListener('click', chooseColour);
    dialog.addEventListener('input', event => {
        if (event.target.dataset.storeExtra) {
            (storeExtras[storeActiveItem] ||= {})[event.target.dataset.storeExtra] = Number(event.target.value);
            dialog.querySelector('[data-thickness-value]').textContent = `${event.target.value}px`;
            applyStoreAdjustments();
        } else if (event.target.id === 'store-adjustment') {
            const item = storeConcepts.find(item => item.id === storeActiveItem);
            storeAdjustments[item.id] = item.adjustment.type === 'toggle' ? event.target.checked : Math.max(item.adjustment.min, Math.min(item.adjustment.max, Number(event.target.value)));
            applyStoreAdjustments();
        } else if (event.target.id === 'store-colour-hex') {
            if (!normalizeHexColour(event.target.value)) {
                event.target.setAttribute('aria-invalid', 'true');
                document.getElementById('store-colour-status').textContent = 'Enter a hex colour, such as #15AFD1.';
            } else setStoreSelectedColour(event.target.value);
        } else if (event.target.matches('[data-store-channel]')) {
            setStoreSelectedColour(hsvToHex(...['h','s','v'].map(key => document.getElementById(`store-colour-${key}`).value)), false);
        }
    });
    dialog.addEventListener('change', event => { if (event.target.id === 'store-adjustment') playUiSound('tap'); });
    dialog.addEventListener('click', event => {
        const choice = event.target.closest('[data-store-choice]');
        if (choice) {
            (storeExtras[storeActiveItem] ||= {})[choice.dataset.storeChoice] = choice.dataset.value;
            choice.parentElement.querySelectorAll('button').forEach(button => button.setAttribute('aria-pressed', String(button === choice)));
            applyStoreAdjustments();
            playUiSound('tap');
        }
        if (!event.target.closest('[data-store-reset]')) return;
        delete storeAdjustments[storeActiveItem];
        delete storeExtras[storeActiveItem];
        storeColourSlot = 'primary';
        applyStorePreviewColour(themeColorFor(localPlayer));
        previewStoreItem(storeActiveItem);
        playUiSound('confirm');
    });
    content.addEventListener('click', event => {
        const category = event.target.closest('[data-store-category]');
        const item = event.target.closest('[data-store-item]');
        if (category) { storeCategory = category.dataset.storeCategory || null; renderStore(); content.scrollTop = 0; content.querySelector(storeCategory ? '[data-store-category=""]' : '[data-store-category]')?.focus({ preventScroll: true }); playUiSound('tap'); }
        if (item) { previewStoreItem(item.dataset.storeItem); playUiSound('tap'); }
    });
}
function renderStore() {
    const screen = document.getElementById('store-screen');
    const category = storeCategories.find(category => category.id === storeCategory);
    screen.querySelector('.store-category-heading').innerHTML = category ? `<h3>${category.name}</h3><button data-store-category="" aria-label="Back to Store categories" title="Back to Store categories">Back</button>` : '';
    screen.querySelector('.store-palette').hidden = !category;
    screen.querySelector('.store-grid').classList.toggle('store-category-grid', !category);
    screen.querySelector('.store-grid').innerHTML = category
        ? storeConcepts.filter(item => item.category === storeCategory).map(item => `<button class="store-item" data-store-item="${item.id}" aria-label="Preview ${item.name}">${storeSample(item)}<span class="store-item-info"><strong>${item.name}</strong><small>${item.category === 'frames' ? 'Profile frame' : 'Message style'}</small></span></button>`).join('')
        : storeCategories.map(category => `<button class="store-item store-category" data-store-category="${category.id}">${storeSample(storeConcepts.find(item => item.id === category.sample))}<span class="store-item-info"><strong>${category.name}</strong><small>${storeConcepts.filter(item => item.category === category.id).length} ${category.id === 'frames' ? 'designs' : 'design'}</small></span></button>`).join('');
    screen.querySelectorAll('.store-avatar').forEach(el => renderProfileAvatar(el, localPlayer));
    screen.querySelector('#store-palette-options').innerHTML = storeSwatches();
    const balance = document.getElementById('home-coin-preview')?.querySelector('span')?.textContent || '0';
    screen.querySelector('#store-coin-balance span').textContent = balance;
    screen.querySelector('#store-coin-balance').setAttribute('aria-label', `Coin balance: ${balance}`);
    applyStorePreviewColour(storePreviewColour);
}
function openStoreScreen() {
    if (storePreviewPlayer !== localPlayer) {
        storePreviewPlayer = localPlayer;
        resetStorePreviews();
    }
    storeCategory = null;
    mountStore();
    document.getElementById('store-screen').classList.remove('hidden');
    applyThemeToScreen('store-screen', 'store-header-shell', 'store-nav-shell');
    refreshSharedHeader('store');
    renderStore();
    document.querySelector('#store-screen .store-content').scrollTop = 0;
}
function previewStoreItem(id) {
    const item = id === 'palette' ? {id, name: 'Preview colour'} : storeConcepts.find(item => item.id === id);
    if (!item) return;
    storeActiveItem = id;
    const dialog = document.getElementById('store-preview');
    storeColourSlot = 'primary';
    dialog.innerHTML = `<div class="store-preview-heading"><div><small>Preview only</small><h2 id="store-preview-title">${item.name}</h2></div><form method="dialog"><button aria-label="Close preview" title="Close preview">&times;</button></form></div>${id === 'palette' ? '' : storeSample(item)}<div class="store-colour-heading"><h3>${id === 'sweetheart' ? 'Primary Colour' : 'Colour'}</h3><output class="store-colour-readout"></output></div>${storeSwatches()}${id === 'sweetheart' ? '<div class="store-colour-heading"><h3>Secondary Colour</h3><output class="store-colour-readout" data-secondary="true"></output></div>' + storeSwatches('secondary') : ''}<section class="store-custom-colour" ${id === 'palette' ? '' : 'hidden'}><h3 id="store-custom-title">Custom colour</h3><label for="store-colour-hex">Hex</label><input id="store-colour-hex" maxlength="7" spellcheck="false" autocomplete="off" aria-describedby="store-colour-status">${[['h','Hue',360],['s','Saturation',100],['v','Brightness',100]].map(([key,label,max]) => `<label for="store-colour-${key}">${label}</label><input type="range" id="store-colour-${key}" data-store-channel="${key}" min="0" max="${max}" step="1">`).join('')}<p id="store-colour-status" role="status"></p></section>`;
    dialog.querySelectorAll('.store-avatar').forEach(el => renderProfileAvatar(el, localPlayer));
    if (id !== 'palette') dialog.querySelector('.store-sample').insertAdjacentHTML('afterend', storeAdjustmentControl(item) + storeExtraControls(item));
    dialog.insertAdjacentHTML('beforeend', '<button class="store-reset" data-store-reset>Reset preview</button>');
    applyStorePreviewColour(storePreviewColour);
    dialog.showModal();
}

function storeExtraControls(item) {
    const extra = storeExtras[item.id] || {};
    let html = '';
    if (['sweetheart','pearl'].includes(item.id)) html += `<div class="store-adjustment"><h3>Heart charm</h3><div class="store-choices" role="group" aria-label="Heart charm">${storeHeartChoices.map(([value,label,icon]) => `<button data-store-choice="heart" data-value="${value}" title="${label}" aria-label="${label}" aria-pressed="${(extra.heart || 'outline') === value}">${icon}</button>`).join('')}</div></div>`;
    if (item.id === 'pearl') html += `<div class="store-adjustment"><h3>Ring style</h3><div class="store-choices" role="group" aria-label="Ring style">${[[20,'Spaced'],[32,'Classic'],[44,'Fine']].map(([count,label]) => `<button data-store-choice="pearls" data-value="${count}" aria-pressed="${Number(extra.pearls || 32) === count}">${label}</button>`).join('')}</div></div>`;
    if (item.id === 'satin') html += `<div class="store-adjustment"><div class="store-adjustment-heading"><label for="store-thickness">Ring thickness</label><output data-thickness-value>${extra.thickness ?? 2}px</output></div><input id="store-thickness" type="range" min="1" max="5" step="0.5" value="${extra.thickness ?? 2}" data-store-extra="thickness"></div>`;
    return html;
}
function syncStoreCustomEditor() {
    const colour = storeColourSlot === 'secondary' ? storeExtras.sweetheart?.secondary || storePalette(storePreviewColour).light : storePreviewColour;
    const hex = document.getElementById('store-colour-hex');
    if (!hex) return;
    hex.value = colour;
    const hsv = hexToHsv(colour);
    for (const key of ['h','s','v']) document.getElementById(`store-colour-${key}`).value = Math.round(hsv[key]);
    document.getElementById('store-custom-title').textContent = `Custom ${storeColourSlot} colour`;
}
function setStoreSelectedColour(colour, sync = true) {
    if (storeColourSlot === 'secondary') (storeExtras.sweetheart ||= {}).secondary = normalizeHexColour(colour);
    applyStorePreviewColour(storeColourSlot === 'secondary' ? storePreviewColour : colour, sync);
    if (sync) syncStoreCustomEditor();
    else document.getElementById('store-colour-hex').value = colour;
}

// --- Catégories ---
import { STATE, CAT_PRESET_COLORS } from './state.js';
import { escHtml } from './utils.js';
import { hideEmojiPicker } from './emoji-picker.js';

const DEFAULT_EMOJIS = ['📁','💼','🎯','💡','🔧','📌','🚀','🎨','📚','🏠','💬','🔬','🎵','🌍','⚡','🧩','📊','🛠️','✨','🎲'];

// DOM refs
const catSelect = document.getElementById('cat-select');
const catSelectLabel = catSelect ? catSelect.querySelector('.cat-select-label') : null;
const catSelectDropdown = document.getElementById('cat-select-dropdown');
const catModalOverlay = document.getElementById('cat-modal-overlay');
const catModalTitle = document.getElementById('cat-modal-title');
const catModalNom = document.getElementById('cat-modal-nom');
const catModalIcone = document.getElementById('cat-modal-icone');
const catColorGrid = document.getElementById('cat-color-grid');
const catModalSave = document.getElementById('cat-modal-save');
const catModalDelete = document.getElementById('cat-modal-delete');
const catModalBack = document.getElementById('cat-modal-back');
const catModalCancel = document.getElementById('cat-modal-cancel');
const catManageBtn = document.getElementById('cat-manage-btn');
const catManageListView = document.getElementById('cat-manage-list-view');
const catManageEditView = document.getElementById('cat-manage-edit-view');
const catManageList = document.getElementById('cat-manage-list');
const catManageAddBtn = document.getElementById('cat-manage-add-btn');
const catManageClose = document.getElementById('cat-manage-close');
const emojiPreview = document.getElementById('cat-modal-icone-preview');

// DOM refs externes — set via init
let newChatBtn, convSearch, promptInput;

// Générer les pastilles de couleur
CAT_PRESET_COLORS.forEach(c => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'cat-color-swatch';
    btn.dataset.color = c;
    btn.style.background = c;
    btn.title = c;
    catColorGrid.appendChild(btn);
});

catColorGrid.addEventListener('click', (e) => {
    const swatch = e.target.closest('.cat-color-swatch');
    if (!swatch) return;
    selectCatColor(swatch.dataset.color);
});

// Callbacks
let _customConfirm = null;
let _customAlert = null;
let _refreshConvList = null;

export function setCategoriesCallbacks(cbs) {
    _customConfirm = cbs.customConfirm;
    _customAlert = cbs.customAlert;
    _refreshConvList = cbs.refreshConvList;
}

export function initCategories(elements) {
    newChatBtn = elements.newChatBtn;
    convSearch = elements.convSearch;
    promptInput = elements.promptInput;

    // Bordure de recherche = couleur catégorie au focus
    convSearch.addEventListener('focus', () => {
        if (convSearch.dataset.catCouleur) {
            convSearch.style.borderColor = convSearch.dataset.catCouleur;
        }
    });
    convSearch.addEventListener('blur', () => {
        convSearch.style.borderColor = '';
    });

    // Custom dropdown toggle
    catSelect.addEventListener('click', () => {
        const open = catSelectDropdown.style.display !== 'none';
        catSelectDropdown.style.display = open ? 'none' : '';
        catSelect.classList.toggle('open', !open);
    });

    // Sélection d'une option
    catSelectDropdown.addEventListener('click', (e) => {
        const opt = e.target.closest('.cat-select-option');
        if (!opt) return;
        STATE.activeCategoryId = opt.dataset.value || null;
        catSelectDropdown.style.display = 'none';
        catSelect.classList.remove('open');
        refreshCatBar();
        if (_refreshConvList) _refreshConvList();
        if (!STATE.conversationId) {
            STATE.currentConversationCategory = STATE.activeCategoryId;
            updateActiveCatColor();
            if (promptInput) promptInput.focus();
        }
    });

    // Fermer le dropdown au clic extérieur
    document.addEventListener('click', (e) => {
        if (!catSelect.contains(e.target) && !catSelectDropdown.contains(e.target)) {
            catSelectDropdown.style.display = 'none';
            catSelect.classList.remove('open');
        }
    });

    // Gestion des catégories : popup management
    catManageBtn.addEventListener('click', () => {
        openCatManagePopup();
    });

    catManageAddBtn.addEventListener('click', () => {
        openCatModal(null);
    });

    catManageClose.addEventListener('click', () => {
        catModalOverlay.style.display = 'none';
    });

    catModalBack.addEventListener('click', async () => {
        hideEmojiPicker();
        if (STATE._catEditFromManagePopup) {
            catManageEditView.style.display = 'none';
            catManageListView.style.display = '';
            await renderCatManageList();
        } else {
            catModalOverlay.style.display = 'none';
        }
    });

    catModalCancel.addEventListener('click', () => {
        hideEmojiPicker();
        catModalOverlay.style.display = 'none';
    });

    catModalOverlay.addEventListener('click', (e) => {
        if (e.target === catModalOverlay) catModalOverlay.style.display = 'none';
    });

    catModalSave.addEventListener('click', async () => {
        const nom = catModalNom.value.trim();
        if (!nom) return;
        const id = STATE.editingCategoryId || ('cat_' + Date.now());
        writeCategory(id, {
            nom,
            couleur: STATE._selectedCatColor,
            icone: catModalIcone.value || '?'
        });
        hideEmojiPicker();
        if (STATE._catEditFromManagePopup) {
            catManageEditView.style.display = 'none';
            catManageListView.style.display = '';
            await renderCatManageList();
        } else {
            catModalOverlay.style.display = 'none';
        }
        refreshCatBar();
    });

    catModalDelete.addEventListener('click', async () => {
        if (!STATE.editingCategoryId) return;
        if (_customConfirm && !await _customConfirm('Supprimer cette catégorie ? Les conversations seront décatégorisées.', { icon: 'delete', danger: true, okLabel: 'Supprimer' })) return;
        const conversations = await listConversationFiles();
        for (const conv of conversations) {
            if (conv.category === STATE.editingCategoryId) {
                await updateConversationCategory(conv.filename, null);
            }
        }
        if (STATE.currentConversationCategory === STATE.editingCategoryId) {
            STATE.currentConversationCategory = null;
        }
        deleteCategory(STATE.editingCategoryId);
        hideEmojiPicker();
        if (STATE._catEditFromManagePopup) {
            catManageEditView.style.display = 'none';
            catManageListView.style.display = '';
            await renderCatManageList();
        } else {
            catModalOverlay.style.display = 'none';
        }
        if (STATE.activeCategoryId === STATE.editingCategoryId) STATE.activeCategoryId = null;
        refreshCatBar();
        if (_refreshConvList) _refreshConvList();
        updateActiveCatColor();
    });
}

export function refreshCatBar() {
    const cats = listCategories();

    // Mettre à jour le label affiché
    if (STATE.activeCategoryId) {
        const cat = readCategory(STATE.activeCategoryId);
        if (cat) {
            catSelectLabel.textContent = (cat.icone || '') + ' ' + cat.nom;
        } else {
            STATE.activeCategoryId = null;
            catSelectLabel.textContent = 'Toutes les catégories';
        }
    } else {
        catSelectLabel.textContent = 'Toutes les catégories';
    }

    // Reconstruire les options du dropdown
    catSelectDropdown.innerHTML = '';
    const allOpt = document.createElement('div');
    allOpt.className = 'cat-select-option' + (!STATE.activeCategoryId ? ' active' : '');
    allOpt.dataset.value = '';
    allOpt.textContent = 'Toutes les catégories';
    catSelectDropdown.appendChild(allOpt);

    for (const cat of cats) {
        const opt = document.createElement('div');
        opt.className = 'cat-select-option' + (STATE.activeCategoryId === cat.id ? ' active' : '');
        opt.dataset.value = cat.id;
        const dot = document.createElement('span');
        dot.className = 'cat-option-dot';
        dot.style.background = cat.couleur || '#3b82f6';
        opt.appendChild(dot);
        opt.appendChild(document.createTextNode((cat.icone || '') + ' ' + cat.nom));
        catSelectDropdown.appendChild(opt);
    }

    updateNewChatBtnColor();
    updateCatSelectColor();
    updateEmptyChatCategory();
}

export function updateEmptyChatCategory() {
    const el = document.getElementById('empty-chat-category');
    if (!el) return;
    if (STATE.activeCategoryId) {
        const cat = readCategory(STATE.activeCategoryId);
        if (cat) {
            const color = cat.couleur || '#3b82f6';
            el.style.display = '';
            el.style.background = color + '18';
            el.style.borderColor = color + '40';
            el.style.color = color;
            el.textContent = `Cette conversation sera rangée dans la catégorie ${cat.nom}.`;
            return;
        }
    }
    el.style.display = 'none';
}

export function textColorForBg(hex) {
    // Calcul de luminance relative (WCAG)
    const r = parseInt(hex.slice(1, 3), 16) / 255;
    const g = parseInt(hex.slice(3, 5), 16) / 255;
    const b = parseInt(hex.slice(5, 7), 16) / 255;
    const toLinear = c => c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    const L = 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
    return L > 0.4 ? '#000' : '#fff';
}

export function updateCatSelectColor() {
    const row = catSelect.closest('.cat-select-row');
    const manageBtn = row.querySelector('.cat-manage-btn');
    const searchInput = convSearch;
    if (STATE.activeCategoryId) {
        const cat = readCategory(STATE.activeCategoryId);
        if (cat && cat.couleur) {
            row.style.backgroundColor = cat.couleur + '22';
            row.style.borderColor = cat.couleur;
            if (manageBtn) manageBtn.style.borderLeftColor = cat.couleur;
            catSelectLabel.style.color = 'var(--text)';
            if (searchInput) searchInput.dataset.catCouleur = cat.couleur;
            return;
        }
    }
    row.style.backgroundColor = '';
    row.style.borderColor = '';
    if (manageBtn) manageBtn.style.borderLeftColor = '';
    catSelectLabel.style.color = '';
    if (searchInput) {
        searchInput.dataset.catCouleur = '';
        searchInput.style.borderColor = '';
    }
}

export function updateNewChatBtnColor() {
    if (STATE.activeCategoryId) {
        const cat = readCategory(STATE.activeCategoryId);
        if (cat) {
            newChatBtn.style.background = cat.couleur;
            newChatBtn.style.borderColor = cat.couleur;
            newChatBtn.style.color = textColorForBg(cat.couleur);
            updateActiveCatColor();
            return;
        }
    }
    newChatBtn.style.background = '';
    newChatBtn.style.borderColor = '';
    newChatBtn.style.color = '';
    updateActiveCatColor();
}

export function updateActiveCatColor() {
    // Conversation existante → sa propre catégorie ; conversation vierge → catégorie du sidebar
    const catId = STATE.conversationId ? STATE.currentConversationCategory : STATE.activeCategoryId;
    if (catId) {
        const cat = readCategory(catId);
        if (cat && cat.couleur) {
            document.documentElement.style.setProperty('--active-cat-color', cat.couleur);
            return;
        }
    }
    document.documentElement.style.removeProperty('--active-cat-color');
}

export function randomDefaultEmoji() {
    return DEFAULT_EMOJIS[Math.floor(Math.random() * DEFAULT_EMOJIS.length)];
}

export function selectCatColor(color) {
    STATE._selectedCatColor = color;
    catColorGrid.querySelectorAll('.cat-color-swatch').forEach(s => {
        s.classList.toggle('selected', s.dataset.color === color);
    });
}

export function openCatModal(catId, fromManage) {
    STATE.editingCategoryId = catId;
    STATE._catEditFromManagePopup = !!fromManage || (catModalOverlay.style.display !== 'none');
    hideEmojiPicker();
    if (catId) {
        const cat = readCategory(catId);
        if (!cat) return;
        catModalTitle.textContent = 'Modifier la catégorie';
        catModalNom.value = cat.nom;
        catModalIcone.value = cat.icone;
        emojiPreview.textContent = cat.icone || randomDefaultEmoji();
        selectCatColor(cat.couleur || '#3b82f6');
        catModalDelete.style.display = '';
    } else {
        const defaultEmoji = randomDefaultEmoji();
        catModalTitle.textContent = 'Nouvelle catégorie';
        catModalNom.value = '';
        catModalIcone.value = defaultEmoji;
        emojiPreview.textContent = defaultEmoji;
        selectCatColor('#3b82f6');
        catModalDelete.style.display = 'none';
    }
    // Afficher Retour si on vient du popup management, sinon Annuler
    catModalBack.style.display = STATE._catEditFromManagePopup ? '' : 'none';
    catModalCancel.style.display = STATE._catEditFromManagePopup ? 'none' : '';
    catManageListView.style.display = 'none';
    catManageEditView.style.display = '';
    catModalOverlay.style.display = '';
    catModalNom.focus();
}

export async function renderCatManageList() {
    const cats = listCategories();
    catManageList.innerHTML = '';
    if (cats.length === 0) {
        catManageList.innerHTML = '<div class="cat-manage-empty">Aucune catégorie pour le moment.<br>Créez-en une ci-dessous.</div>';
        return;
    }
    // Compter les conversations par catégorie
    const convs = await listConversationFiles();
    const countMap = {};
    for (const c of convs) {
        if (c.category) countMap[c.category] = (countMap[c.category] || 0) + 1;
    }
    for (const cat of cats) {
        const count = countMap[cat.id] || 0;
        const colorRaw = cat.couleur || '#3b82f6';
        const color = /^#[0-9a-fA-F]{3,8}$/.test(colorRaw) ? colorRaw : '#3b82f6';
        const item = document.createElement('div');
        item.className = 'cat-manage-item';
        item.innerHTML =
            `<div class="cat-manage-item-badge" style="background:${color}22;color:${color}">${escHtml(cat.icone || '?')}</div>` +
            `<div class="cat-manage-item-info">` +
                `<span class="cat-manage-item-name">${escHtml(cat.nom || '')}</span>` +
                `<span class="cat-manage-item-meta">${count} conversation${count > 1 ? 's' : ''}</span>` +
            `</div>` +
            `<span class="cat-manage-item-arrow">›</span>`;
        item.addEventListener('click', () => openCatModal(cat.id));
        catManageList.appendChild(item);
    }
}

export async function openCatManagePopup() {
    catManageListView.style.display = '';
    catManageEditView.style.display = 'none';
    await renderCatManageList();
    catModalOverlay.style.display = '';
}

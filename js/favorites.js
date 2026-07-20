// --- Favoris ---
import { escHtml } from './utils.js';

const FAV_KEY = 'cetas-favorites';

function _getFavorites() {
    try { return JSON.parse(localStorage.getItem(FAV_KEY)) || []; }
    catch { return []; }
}

function _saveFavorites(arr) {
    localStorage.setItem(FAV_KEY, JSON.stringify(arr));
}

export function _isFavorite(filename) {
    return _getFavorites().includes(filename);
}

export function _toggleFavorite(filename) {
    const favs = _getFavorites();
    const idx = favs.indexOf(filename);
    if (idx >= 0) favs.splice(idx, 1);
    else favs.push(filename);
    _saveFavorites(favs);
}

// Ces callbacks sont injectés par app.js au démarrage
let _loadConversation = null;
let _refreshConvList = null;

export function setFavoritesCallbacks(loadConv, refreshConv) {
    _loadConversation = loadConv;
    _refreshConvList = refreshConv;
}

export function renderFavList() {
    const favSection = document.getElementById('fav-section');
    const favList = document.getElementById('fav-list');
    if (!favSection || !favList) return;

    const favs = _getFavorites();
    if (favs.length === 0) {
        favSection.style.display = 'none';
        return;
    }
    favSection.style.display = '';

    // Récupérer les métadonnées depuis le manifeste
    const metas = [];
    for (const filename of favs) {
        const meta = typeof getConvMetadata === 'function' ? getConvMetadata(filename) : null;
        if (meta && !meta.deleted) metas.push(meta);
    }

    favList.innerHTML = metas.map(m => {
        const title = m.titre || m.firstMessage || m.id || m.filename;
        return `<div class="fav-item" data-filename="${escHtml(m.filename)}">
            <span class="fav-item-icon">★</span>
            <span class="fav-item-title">${escHtml(title.substring(0, 40))}</span>
            <button class="fav-item-remove" title="Retirer des favoris">×</button>
        </div>`;
    }).join('');

    // Clic sur l'item → ouvrir la conversation
    favList.querySelectorAll('.fav-item').forEach(item => {
        item.addEventListener('click', (e) => {
            if (e.target.closest('.fav-item-remove')) return;
            const filename = item.dataset.filename;
            if (filename && _loadConversation) _loadConversation(filename);
        });
    });

    // Bouton retirer
    favList.querySelectorAll('.fav-item-remove').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const filename = btn.closest('.fav-item').dataset.filename;
            _toggleFavorite(filename);
            renderFavList();
            if (_refreshConvList) _refreshConvList();
        });
    });

    // Nettoyer les favoris orphelins (conversation supprimée)
    const validFiles = new Set(metas.map(m => m.filename));
    const cleaned = favs.filter(f => validFiles.has(f));
    if (cleaned.length !== favs.length) _saveFavorites(cleaned);
}

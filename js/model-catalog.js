// --- Catalogue de modèles (script global) ---
// --- Catalogue de modèles ---
// ============================================================

let _catalogType = 'text'; // onglet actif dans le catalogue
let _catalogPending = null; // { disabled: Set, orEnabled: Set } — état UI en cours d'édition

// Catégories OR (filtre serveur via ?category=…)
const OR_CATEGORIES = [
    { id: 'all',         label: 'Toutes les catégories' },
    { id: 'or-routers',  label: 'OpenRouter' },
    { id: 'programming', label: 'Programmation' },
    { id: 'roleplay',    label: 'Roleplay' },
    { id: 'marketing',   label: 'Marketing' },
    { id: 'technology',  label: 'Technologie' },
    { id: 'science',     label: 'Science' },
    { id: 'translation', label: 'Traduction' },
    { id: 'finance',     label: 'Finance' },
    { id: 'health',      label: 'Santé' },
    { id: 'legal',       label: 'Juridique' },
    { id: 'academia',    label: 'Académique' }
];
let _orCategory = 'all'; // catégorie chip actuellement sélectionnée
let _orSearchTerm = '';
const _orCategoryViews = {}; // cache mémoire par catégorie (sauf 'all' qui est en localStorage)

// Renvoie la liste de modèles pour la (catégorie, type d'onglet) active, ou null si pas chargé
function _getOrModelsForCategory(cat, tabType = 'text') {
    if (cat === 'all') {
        const cache = getOrCache(tabType);
        return cache?.models || null;
    }
    if (cat === 'or-routers') {
        const cache = getOrCache(tabType);
        if (!cache?.models) return null;
        return cache.models.filter(m => typeof m.id === 'string' && m.id.startsWith('openrouter/'));
    }
    return _orCategoryViews[`${tabType}_${cat}`] || null;
}

function _initCatalogPending() {
    const prefs = loadCatalogPrefs();
    _catalogPending = {
        disabled: new Set(prefs.disabled || []),
        orEnabled: new Set(prefs.orEnabled || [])
    };
}

// Parse robuste du prix image OR : `pricing.image` peut être string ou objet,
// avec fallbacks vers image_output / request si la valeur principale est nulle.
function _parseOrImagePrice(pricing) {
    if (!pricing) return 0;
    function toNum(v) {
        if (v == null) return 0;
        if (typeof v === 'object') {
            // Pricing structuré : prendre la première valeur numérique trouvée
            for (const k of ['output', 'standard', 'default', 'high', 'medium']) {
                if (v[k] != null) {
                    const n = parseFloat(v[k]);
                    if (!isNaN(n) && n > 0) return n;
                }
            }
            for (const val of Object.values(v)) {
                const n = parseFloat(val);
                if (!isNaN(n) && n > 0) return n;
            }
            return 0;
        }
        const n = parseFloat(v);
        return isNaN(n) ? 0 : n;
    }
    return toNum(pricing.image) || toNum(pricing.image_output) || toNum(pricing.request) || 0;
}

// Formatte un prix par image avec une précision adaptative
function _formatImagePrice(p) {
    if (!p || p <= 0) return '';
    if (p >= 0.01) return '$' + p.toFixed(p >= 1 ? 2 : 3).replace(/\.?0+$/, '');
    if (p >= 0.001) return '$' + p.toFixed(4).replace(/0+$/, '');
    return '$' + p.toFixed(5).replace(/0+$/, '');
}

function _catalogPriceStr(m, isImage) {
    if (isLocalEditeur(m.editeur)) return 'Gratuit';
    if (isImage) {
        if (m.imageOutput) {
            // Modèle curaté de models.js : valeur déjà en $/img
            if (m.editeur !== 'openrouter') return `${_formatImagePrice(m.imageOutput)} /img`;
            return _formatOrImagePriceStr(m.imageOutput, m.outputModalities);
        }
        // Fallback : afficher le prix par token si présent (modèles vision/hybrides)
        if (m.inputPer1M || m.outputPer1M) return `$${m.inputPer1M} → $${m.outputPer1M} /M`;
        return 'Gratuit';
    }
    const inp = m.inputPer1M, out = m.outputPer1M;
    if (!inp && !out) return 'Gratuit';
    return `$${inp} → $${out} /M`;
}

// Petits badges affichés dans la ligne (NEW, expiration imminente)
function _catalogBadgesHtml(m) {
    let out = '';
    if (_isModelNew(m)) {
        out += '<span class="catalog-row-badge catalog-row-badge--new" title="Modèle ajouté il y a moins de 10 jours">NEW</span>';
    }
    if (_isModelExpiringSoon(m)) {
        out += `<span class="catalog-row-badge catalog-row-badge--warn" title="Sera retiré le ${escHtml(_formatExpirationDateFr(m.expirationDate))}">⚠</span>`;
    }
    return out;
}

// Construit la ligne d'un modèle dans le catalogue (provider standard ou OR)
function _catalogRowHtml(m, isImage, isOr, checked) {
    const tooltip = _buildModelTooltip(m);
    const cbClass = isOr ? 'catalog-cb catalog-or-cb' : 'catalog-cb';
    const editeurAttr = isOr ? '' : ` data-editeur="${escHtml(m.editeur)}"`;
    // Colonnes à position fixe : sorties de <label> pour ne pas être décalées par
    // la présence/absence de l'icône info (qui occupe sinon une largeur variable).
    const makerCol = isOr ? `<span class="catalog-row-maker">${escHtml(_modelMakerLabel(m))}</span>` : '';
    const infoCol = tooltip
        ? `<span class="custom-select-info catalog-row-info" data-tooltip="${escHtml(tooltip)}">i</span>`
        : `<span class="catalog-row-info-spacer" aria-hidden="true"></span>`;
    return `
        <div class="catalog-row${isOr ? ' catalog-row--or' : ''}">
            <label class="catalog-row-main">
                <input type="checkbox" class="${cbClass}" data-id="${escHtml(m.id)}"${editeurAttr} ${checked ? 'checked' : ''}>
                <span class="catalog-row-name">${escHtml(m.label)}${_catalogBadgesHtml(m)}</span>
            </label>
            ${makerCol}
            <span class="catalog-row-price">${escHtml(_catalogPriceStr(m, isImage))}</span>
            ${infoCol}
        </div>
    `;
}

// Compare pending vs saved prefs pour calculer dirty
function _computeCatalogDirty() {
    if (!_catalogPending) return false;
    const saved = loadCatalogPrefs();
    const savedDisabled = new Set(saved.disabled || []);
    const savedOrEnabled = new Set(saved.orEnabled || []);
    if (_catalogPending.disabled.size !== savedDisabled.size) return true;
    for (const id of _catalogPending.disabled) if (!savedDisabled.has(id)) return true;
    if (_catalogPending.orEnabled.size !== savedOrEnabled.size) return true;
    for (const id of _catalogPending.orEnabled) if (!savedOrEnabled.has(id)) return true;
    return false;
}

function _refreshCatalogDirty() {
    _setCatalogDirty(_computeCatalogDirty());
}

function renderCatalogTab() {
    // Le panel « Catalogue » a été fusionné dans « API et Modèles ».
    // On délègue au rendu par fournisseur de l'onglet actif.
    if (typeof renderProviderCatalog === 'function' && _activeProvider) {
        renderProviderCatalog(_activeProvider);
    }
}


// Met à jour le badge X/Y en se basant sur l'état pending (et non sur le DOM filtré)
function _updateSectionBadge(section, total, allModels, disabledSet) {
    const enabled = allModels.filter(m => !disabledSet.has(m.id)).length;
    const badge = section.querySelector('.catalog-section-badge');
    if (badge) badge.textContent = `${enabled}/${total}`;
    const masterCb = section.querySelector('.catalog-section-master-cb');
    if (masterCb) {
        masterCb.checked = enabled === total;
        masterCb.indeterminate = enabled > 0 && enabled < total;
    }
}

function _buildOrModelsHtml(models, orEnabled, isImage) {
    if (!models.length) return '<div class="catalog-or-empty">Aucun modèle trouvé.</div>';
    return models.map(m => _catalogRowHtml(m, isImage, true, orEnabled.has(m.id))).join('');
}

function _attachOrCheckboxListeners(section, orAll) {
    if (!_catalogPending) return;
    const orEnabled = _catalogPending.orEnabled;
    section.querySelectorAll('.catalog-or-cb').forEach(cb => {
        cb.addEventListener('change', () => {
            const id = cb.dataset.id;
            if (cb.checked) orEnabled.add(id);
            else orEnabled.delete(id);
            const enabledCount = orAll.filter(m => orEnabled.has(m.id)).length;
            const badge = section.querySelector('#or-badge');
            if (badge) badge.textContent = `${enabledCount}/${orAll.length}`;
            _refreshCatalogDirty();
        });
    });
}

// Évite plusieurs appels d'enrichissement parallèles pour une MÊME (tabType, catégorie).
// Un Set par clé `${tabType}_${category}` au lieu d'un flag global : sinon, changer
// de catégorie pendant un enrichissement bloque silencieusement le suivant.
const _enrichmentInFlight = new Set();

// Récupère le vrai prix image (image_output par token) depuis /endpoints pour chaque modèle.
// /models renvoie pricing.prompt et pricing.completion mais pas image_output ; il faut taper
// /models/{id}/endpoints pour récupérer le vrai tarif. Met à jour le cache, IMAGE_TARIFS
// (pour les modèles déjà activés dans le sélecteur) et re-render le catalogue.
async function _enrichImagePricesFromEndpoints(models, tabType, category) {
    const CONCURRENCY = 6;
    let i = 0;
    let updated = 0;
    async function worker() {
        while (i < models.length) {
            const m = models[i++];
            try {
                // NE PAS encodeURIComponent : le slash du slug (`author/model`) doit rester un slash dans le path
                const url = proxyUrl('openrouter', `https://openrouter.ai/api/v1/models/${m.id}/endpoints`);
                const res = await fetch(url, {});
                if (!res.ok) continue;
                const json = await res.json();
                const endpoints = json?.data?.endpoints || [];
                let best = 0;
                let bestImg = 0;
                let bestRequest = 0;
                for (const ep of endpoints) {
                    const p = ep?.pricing || {};
                    // image_output (prix par token de sortie image) — la source principale
                    const vImg = parseFloat(p.image_output);
                    if (!isNaN(vImg) && vImg > 0 && (bestImg === 0 || vImg < bestImg)) bestImg = vImg;
                    // image (prix par image complète) — fallback secondaire
                    const vImage = parseFloat(p.image);
                    if (!isNaN(vImage) && vImage > 0 && (best === 0 || vImage < best)) best = vImage;
                    // request (prix par requête) — dernier fallback
                    const vReq = parseFloat(p.request);
                    if (!isNaN(vReq) && vReq > 0 && (bestRequest === 0 || vReq < bestRequest)) bestRequest = vReq;
                }
                const finalPrice = bestImg || best || bestRequest;
                if (finalPrice > 0 && finalPrice !== m.imageOutput) {
                    m.imageOutput = finalPrice;
                    // Mettre à jour IMAGE_TARIFS pour que le dropdown du sélecteur
                    // affiche le bon prix sans attendre un rebuildModelLists.
                    if (typeof IMAGE_TARIFS !== 'undefined' && IMAGE_TARIFS[m.id]) {
                        IMAGE_TARIFS[m.id].imageOutput = finalPrice;
                    }
                    // Persiste dans la cache de prix dédiée → survit aux ré-écritures
                    // du cache /models et permet l'hydratation instantanée au reload.
                    if (typeof setOrImagePrice === 'function') setOrImagePrice(m.id, finalPrice);
                    updated++;
                }
            } catch(e) { /* ignore */ }
        }
    }
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, models.length) }, worker));

    if (updated === 0) return;
    if (!category || category === 'all') {
        // `models` est un sous-ensemble (ceux qui avaient un prix manquant).
        // On merge dans la cache existante par id pour ne pas la tronquer,
        // sinon le prochain reload reperdrait les modèles non enrichis et
        // re-déclencherait l'enrichissement (→ flash "Gratuit").
        const existing = getOrCache(tabType);
        if (existing?.models?.length) {
            const byId = new Map(existing.models.map(em => [em.id, em]));
            for (const m of models) byId.set(m.id, m);
            setOrCache([...byId.values()], tabType);
        } else {
            setOrCache(models, tabType);
        }
    } else {
        // Les vues par catégorie sont en mémoire seule, mais les objets
        // partagent les références avec la cache 'all' en localStorage —
        // on persiste aussi les enrichissements là-bas pour les reloads.
        _orCategoryViews[`${tabType}_${category}`] = models;
        const existing = getOrCache(tabType);
        if (existing?.models?.length) {
            const byId = new Map(existing.models.map(em => [em.id, em]));
            let touched = false;
            for (const m of models) {
                if (byId.has(m.id)) { byId.set(m.id, m); touched = true; }
            }
            if (touched) setOrCache([...byId.values()], tabType);
        }
    }
    // Re-render si le catalogue actif est en mode image. L'état réel est stocké
    // par fournisseur dans _providerCatalogType (le flag global _catalogType
    // n'est plus utilisé par le rendu, donc le tester ici empêchait toujours le refresh).
    const activeIsImage = _activeProvider
        ? (_providerCatalogType[_activeProvider] || 'text') === 'image'
        : false;
    if (activeIsImage) renderCatalogTab();
    // Rafraîchir aussi le sélecteur de modèles si on est en mode image,
    // pour que les prix mis à jour s'affichent dans le dropdown principal.
    if (typeof populateUnifiedSelect === 'function') populateUnifiedSelect();
}

async function _loadOrModels(isImage, category = _orCategory) {
    const btn = document.getElementById('catalog-or-load');
    const modelsEl = document.getElementById('catalog-or-models');
    if (btn) { btn.disabled = true; btn.innerHTML = '<svg class="catalog-spin" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-.07-8.3"/></svg> Chargement…'; }
    if (modelsEl) modelsEl.innerHTML = '<div class="catalog-or-loading"><span class="catalog-spin-wrap"><svg class="catalog-spin" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-.07-8.3"/></svg></span> Récupération des modèles OpenRouter…</div>';

    // « Routeurs OpenRouter » est un filtre client appliqué sur le catalogue 'all'
    const fetchCategory = category === 'or-routers' ? 'all' : category;
    try {
        const params = [];
        if (isImage) params.push('output_modalities=image');
        if (fetchCategory && fetchCategory !== 'all') params.push(`category=${encodeURIComponent(fetchCategory)}`);
        const base = 'https://openrouter.ai/api/v1/models' + (params.length ? '?' + params.join('&') : '');
        const url = proxyUrl('openrouter', base);
        const res = await fetch(url, {});
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();

        const models = (data.data || []).filter(m => m.id && m.name).map(m => {
            const arch = m.architecture || {};
            const inputModalities = Array.isArray(arch.input_modalities) ? arch.input_modalities : [];
            const outputModalities = Array.isArray(arch.output_modalities) ? arch.output_modalities : [];
            // Fallback si les champs structurés sont absents : on retombe sur l'ancienne heuristique
            const modality = arch.modality || '';
            // Classement par modalité primaire (premier élément) : openrouter/auto a
            // outputs=["text","image"] — c'est un routeur principalement textuel, il
            // doit apparaître dans l'onglet Texte. Les générateurs d'images ont
            // outputs=["image",…] et restent classés image.
            const _isImage = outputModalities.length
                ? outputModalities[0] === 'image'
                : modality.includes('->image');
            const inp = Math.round(parseFloat(m.pricing?.prompt || 0) * 1e6 * 100) / 100;
            const out = Math.round(parseFloat(m.pricing?.completion || 0) * 1e6 * 100) / 100;
            const imgOut = _parseOrImagePrice(m.pricing);
            // Pricing détaillé OR : on stocke les champs auxiliaires utiles pour l'affichage
            // (web search, raisonnement, cache) en plus des prompt/completion principaux
            const pricingDetails = {
                request: parseFloat(m.pricing?.request) || 0,
                webSearch: parseFloat(m.pricing?.web_search) || 0,
                internalReasoning: parseFloat(m.pricing?.internal_reasoning) || 0,
                inputCacheRead: parseFloat(m.pricing?.input_cache_read) || 0,
                inputCacheWrite: parseFloat(m.pricing?.input_cache_write) || 0,
                audio: parseFloat(m.pricing?.audio) || 0
            };
            return {
                id: m.id,
                canonicalSlug: m.canonical_slug || null,
                label: m.name,
                editeur: 'openrouter',
                description: m.description || '',
                inputPer1M: inp,
                outputPer1M: out,
                imageOutput: imgOut,
                pricingDetails,
                _isImage,
                contextLength: m.context_length || null,
                created: m.created || null,
                expirationDate: m.expiration_date || null,
                knowledgeCutoff: m.knowledge_cutoff || null,
                inputModalities,
                outputModalities,
                tokenizer: arch.tokenizer || null,
                instructType: arch.instruct_type || null,
                supportedParameters: Array.isArray(m.supported_parameters) ? m.supported_parameters : [],
                defaultParameters: m.default_parameters || null,
                topProvider: m.top_provider || null,
                perRequestLimits: m.per_request_limits || null,
                isModerated: m.top_provider?.is_moderated ?? null,
                huggingFaceId: m.hugging_face_id || null
            };
        });

        // Hydrate les prix image enrichis depuis la cache dédiée AVANT cache + render :
        // /models renvoie pricing=0 sur les modèles image, mais on a peut-être déjà
        // appelé /endpoints en session précédente — pas la peine de re-flasher "Gratuit".
        if (isImage && typeof getOrImagePrices === 'function') {
            const priceMap = getOrImagePrices();
            for (const m of models) {
                if ((!m.imageOutput || m.imageOutput === 0) && priceMap[m.id] > 0) {
                    m.imageOutput = priceMap[m.id];
                }
            }
        }
        // Routage du cache :
        // - 'all' → localStorage (persisté), clé séparée pour image vs text
        // - autres catégories → mémoire seule, clé `${tabType}_${category}`
        const tabType = isImage ? 'image' : 'text';
        if (!fetchCategory || fetchCategory === 'all') {
            setOrCache(models, tabType);
        } else {
            _orCategoryViews[`${tabType}_${fetchCategory}`] = models;
        }
        // Re-render immédiat (les modèles s'affichent, prix image se mettront à jour ensuite)
        renderCatalogTab();

        // Pour les modèles image : /models renvoie pricing 0/0, le vrai image_output
        // n'est exposé que dans /endpoints. On le récupère en parallèle puis on enrichit le cache.
        if (isImage) {
            _enrichImagePricesFromEndpoints(models, tabType, category).catch(() => {});
        }

    } catch(err) {
        if (modelsEl) modelsEl.innerHTML = `<div class="catalog-or-empty" style="color:var(--error,#ef4444)">Erreur lors du chargement : ${escHtml(err.message)}</div>`;
    } finally {
        if (btn) { btn.disabled = false; btn.innerHTML = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-.07-8.3"/></svg> Actualiser'; }
    }
}

function _saveCatalogFromUI() {
    if (!_catalogPending) return;
    saveCatalogPrefs({
        disabled: [..._catalogPending.disabled],
        orEnabled: [..._catalogPending.orEnabled]
    });
    rebuildModelLists();
    populateUnifiedSelect();
    fetchLocalModels().then(() => populateUnifiedSelect());
    _setCatalogDirty(false);
}

// Note : les boutons œil, le bouton « Mettre à jour » du modèle local et le toggle
// Texte/Images sont rendus et écoutés dynamiquement par _initApiModelesPanel().
// Le bouton « Sauvegarder » du panel API et Modèles est géré dans initConfigAutoSave().


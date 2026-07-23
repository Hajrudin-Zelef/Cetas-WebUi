// --- Panneau droit + params (script global) ---
// --- Panneau droit (Rôle) + toolbar latérale (gear + canvas) ---
const rightPanel = document.getElementById('right-panel');
const rightPanelToggle = document.getElementById('right-panel-toggle');
const spTextarea = document.getElementById('sp-textarea');
const sideToggleSettings = document.getElementById('side-toggle-settings');
const sideToggleCanvas = document.getElementById('side-toggle-canvas');

function isRightPanelOpen() {
    // Panneau droit migré dans Configuration → toujours fermé
    return false;
}
function isCanvasPanelOpen() {
    const p = document.getElementById('canvas-panel');
    return !!(p && p.style.display === 'flex');
}

function setRightPanelOpen(open) {
    // Panneau droit migré dans Configuration → no-op
    updateSideToolbarState();
}

function setCanvasPanelOpen(open) {
    if (!window.Canvas) return;
    if (open) {
        if (!window.Canvas.isActive()) return; // ne peut s'ouvrir que si canvas actif
        window.Canvas.showPanel();
    } else {
        window.Canvas.hidePanel();
    }
    // showPanel/hidePanel déclenchent canvas-state-change → toolbar sync automatique
}

function updateSideToolbarState() {
    if (sideToggleSettings) {
        // Le panneau droit est dans Configuration → toujours afficher le bouton
        sideToggleSettings.style.display = '';
        sideToggleSettings.classList.remove('active');
        sideToggleSettings.title = 'Réglages de la conversation';
    }
    if (sideToggleCanvas) {
        const canvasActive = !!(window.Canvas && window.Canvas.isActive());
        sideToggleCanvas.style.display = canvasActive ? '' : 'none';
        sideToggleCanvas.classList.toggle('active', isCanvasPanelOpen());
        sideToggleCanvas.title = isCanvasPanelOpen() ? 'Masquer le canvas' : 'Ouvrir le canvas';
        const countSpan = sideToggleCanvas.querySelector('.side-canvas-count');
        if (countSpan && window.Canvas && window.Canvas._state && window.Canvas._state.files) {
            const n = Object.keys(window.Canvas._state.files).length;
            countSpan.textContent = n > 0 ? String(n) : '';
        }
    }
}

// Toggles mutuellement exclusifs : ouvrir un volet ferme l'autre.
function toggleSettingsPanel() {
    if (isCanvasPanelOpen()) {
        setCanvasPanelOpen(false);
        setRightPanelOpen(true);
    } else if (isRightPanelOpen()) {
        setRightPanelOpen(false);
    } else {
        setRightPanelOpen(true);
    }
}
function toggleCanvasPanel() {
    if (!window.Canvas || !window.Canvas.isActive()) return;
    if (isCanvasPanelOpen()) {
        setCanvasPanelOpen(false);
    } else {
        // S'assurer que le volet réglages est replié avant d'afficher le canvas
        if (isRightPanelOpen()) setRightPanelOpen(false);
        setCanvasPanelOpen(true);
    }
}

// sideToggleSettings → redirigé vers Config (onglet Conversation) dans initConversationPanel()
if (sideToggleCanvas) sideToggleCanvas.addEventListener('click', toggleCanvasPanel);

// Garder toolbar active sur changements du canvas (activation, ouverture, fichiers, resize)
document.addEventListener('canvas-state-change', () => {
    // Dès que le canvas s'ouvre, replier le volet réglages (mutually exclusive)
    if (isCanvasPanelOpen() && isRightPanelOpen()) {
        setRightPanelOpen(false);
    }
    updateSideToolbarState();
    syncSideToolbarCanvasWidth();
});

// Mise à jour de --side-toolbar-right d'après la largeur du canvas
function syncSideToolbarCanvasWidth() {
    const panel = document.getElementById('canvas-panel');
    if (!panel) return;
    if (panel.style.display !== 'flex') return; // canvas pas affiché
    const w = panel.getBoundingClientRect().width;
    if (w > 0) {
        document.body.style.setProperty('--side-toolbar-right', (w - 16) + 'px');
    }
}
if (window.ResizeObserver) {
    const _canvasPanel = document.getElementById('canvas-panel');
    if (_canvasPanel) {
        new ResizeObserver(syncSideToolbarCanvasWidth).observe(_canvasPanel);
    }
}

// chatHeaderSettings → redirigé vers Config (onglet Conversation) dans initConversationPanel()

// Onglets du volet droit
function setRightPanelTab(tabName) {
    const tabs = document.querySelectorAll('.rp-tab');
    let activeTab = null;
    tabs.forEach(t => {
        const isActive = t.dataset.rpTab === tabName;
        t.classList.toggle('active', isActive);
        if (isActive) activeTab = t;
    });
    document.querySelectorAll('.rp-tab-content').forEach(c => c.classList.toggle('active', c.id === 'rp-tab-' + tabName));
    // Animer l'indicateur sous l'onglet actif
    const tabsContainer = document.querySelector('.rp-tabs');
    if (tabsContainer && activeTab) {
        tabsContainer.style.setProperty('--rp-tab-x', activeTab.offsetLeft + 'px');
        tabsContainer.style.setProperty('--rp-tab-w', activeTab.offsetWidth + 'px');
    }
}
document.querySelectorAll('.rp-tab').forEach(tab => {
    tab.addEventListener('click', () => setRightPanelTab(tab.dataset.rpTab));
});
// Positionner l'indicateur au chargement (et quand le volet se redimensionne)
window.addEventListener('load', () => {
    const active = document.querySelector('.rp-tab.active');
    if (active) setRightPanelTab(active.dataset.rpTab);
});

// Boutons format d'image dans le volet droit
const imageFormatSelect = document.getElementById('image-format-select');
document.querySelectorAll('.image-format-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.image-format-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        imageFormatSelect.value = btn.dataset.format;
        // Si un ratio précis était sélectionné, le clear pour rendre la priorité aux boutons format
        const ratioSelect = document.getElementById('rp-gemini-ratio-select');
        if (ratioSelect && ratioSelect.value) {
            ratioSelect.value = '';
            updateFormatBtnsDisabled();
        }
    });
});

// Sliders paramètres image (ranges)
['openai-n', 'openai-compression'].forEach(id => {
    const range = document.getElementById('rp-' + id + '-range');
    const display = document.getElementById('rp-' + id + '-value');
    if (range && display) {
        range.addEventListener('input', () => {
            display.textContent = parseFloat(range.value).toFixed(range.step.includes('.') ? 1 : 0);
        });
    }
});

// Masquer la compression quand le format est PNG
const openaiFormatSelect = document.getElementById('rp-openai-format-select');
const openaiCompressionSection = document.getElementById('rp-openai-compression-section');
function updateOpenAICompressionVisibility() {
    if (!openaiFormatSelect || !openaiCompressionSection) return;
    const format = openaiFormatSelect.value;
    openaiCompressionSection.style.display = (format === 'jpeg' || format === 'webp') ? '' : 'none';
}
openaiFormatSelect?.addEventListener('change', updateOpenAICompressionVisibility);
updateOpenAICompressionVisibility();

// Valeurs par défaut des paramètres image
const IMAGE_PARAMS_DEFAULTS = {
    quality: 'high',
    'openai-n': { value: 1, display: '1' },
    'openai-compression': { value: 100, display: '100' },
    selects: {
        'rp-openai-background-select': 'auto',
        'rp-openai-format-select': 'png',
        'rp-openai-moderation-select': 'auto',
        'rp-gemini-ratio-select': '',
        'rp-gemini-size-select': '1K',
        'rp-gemini-thinking-select': 'minimal'
    }
};

// Toggle pour le seed image (input number, comme le seed texte)
document.getElementById('rp-img-seed-toggle')?.addEventListener('change', (e) => {
    e.target.closest('.right-panel-section')?.classList.toggle('rp-param-disabled', !e.target.checked);
});

// Bouton de réinitialisation des paramètres image
document.getElementById('rp-image-params-reset-btn')?.addEventListener('click', () => {
    const qualitySelect = document.getElementById('rp-quality-select');
    if (qualitySelect) qualitySelect.value = IMAGE_PARAMS_DEFAULTS.quality;
    ['openai-n', 'openai-compression'].forEach(id => {
        const def = IMAGE_PARAMS_DEFAULTS[id];
        const range = document.getElementById('rp-' + id + '-range');
        const display = document.getElementById('rp-' + id + '-value');
        if (range) range.value = def.value;
        if (display) display.textContent = def.display;
    });
    for (const [selId, val] of Object.entries(IMAGE_PARAMS_DEFAULTS.selects)) {
        const sel = document.getElementById(selId);
        if (sel) sel.value = val;
    }
    const seedToggle = document.getElementById('rp-img-seed-toggle');
    const seedInput = document.getElementById('rp-img-seed-input');
    if (seedToggle) {
        seedToggle.checked = false;
        seedToggle.closest('.right-panel-section')?.classList.add('rp-param-disabled');
    }
    if (seedInput) seedInput.value = '';
    updateOpenAICompressionVisibility();
    updateFormatBtnsDisabled();
});

// Coût texte : priorise usage.cost_real (OpenRouter opt-in usage accounting),
// sinon retombe sur l'estimation locale (tokens × tarif/1M).
function _resolveTextCost(tarif, usage) {
    if (!usage) return 0;
    if (usage.cost_real != null && usage.cost_real >= 0) return usage.cost_real;
    if (!tarif) return 0;
    const inTok = usage.input_tokens || 0;
    const outTok = usage.output_tokens || 0;
    return (inTok / 1_000_000) * tarif.inputPer1M
         + (outTok / 1_000_000) * tarif.outputPer1M;
}

// Coût image : priorise usage.cost_real (couvre tokens + image), sinon estimation locale
// (tokens texte + computeImagePrice × imageCount). Renvoie { tokenCost, imageCost, total }.
function _resolveImageCost(tarif, usage, imageCount, format, imageParams) {
    if (usage?.cost_real != null && usage.cost_real >= 0) {
        // OR cost_real est all-in-one : on l'attribue à la ligne "image" pour préserver la sémantique
        // (STATE.totalImageCost garde sa signification de "coût de génération d'images")
        return { tokenCost: 0, imageCost: usage.cost_real, total: usage.cost_real };
    }
    if (!tarif) return { tokenCost: 0, imageCost: 0, total: 0 };
    const inTok = usage?.input_tokens || 0;
    const outTok = usage?.output_tokens || 0;
    const tokenCost = (inTok / 1_000_000) * tarif.inputPer1M
        + (outTok / 1_000_000) * tarif.outputPer1M;
    const imageCost = imageCount > 0
        ? computeImagePrice(tarif, format, imageParams) * imageCount
        : 0;
    return { tokenCost, imageCost, total: tokenCost + imageCost };
}

// Lecture des paramètres image depuis les contrôles
function getImageParams() {
    const val = id => document.getElementById(id)?.value;
    const seedToggle = document.getElementById('rp-img-seed-toggle');
    const seedRaw = (seedToggle?.checked) ? parseInt(val('rp-img-seed-input')) : NaN;
    return {
        quality: val('rp-quality-select') || 'high',
        n: parseInt(val('rp-openai-n-range')) || 1,
        background: val('rp-openai-background-select') || 'auto',
        output_format: val('rp-openai-format-select') || 'png',
        output_compression: parseInt(val('rp-openai-compression-range')) || 100,
        moderation: val('rp-openai-moderation-select') || 'auto',
        geminiAspectRatio: val('rp-gemini-ratio-select') || '',
        imageSize: val('rp-gemini-size-select') || '1K',
        thinkingLevel: val('rp-gemini-thinking-select') || 'minimal',
        seed: isNaN(seedRaw) ? undefined : seedRaw
    };
}

// Activer/désactiver les sections de paramètres image selon l'éditeur du modèle.
// Pour les modèles OpenRouter : filtre additionnel sur `supportedParameters` du modèle
// pour les sections marquées `data-or-img-param` (seed, etc.).
function updateImageParamsVisibility(editeur, modelId) {
    document.querySelectorAll('#rp-tab-image [data-providers]').forEach(el => {
        const providers = el.dataset.providers.split(',').map(p => p.trim());
        if (providers.includes(editeur)) {
            el.classList.remove('disabled');
        } else {
            el.classList.add('disabled');
        }
    });
    // Filtre OR : sections data-or-img-param visibles seulement si le modèle OR les déclare
    const meta = (editeur === 'openrouter' && modelId) ? IMAGE_MODELS.find(m => m.id === modelId) : null;
    const supported = Array.isArray(meta?.supportedParameters) ? meta.supportedParameters : [];
    document.querySelectorAll('#rp-tab-image [data-or-img-param]').forEach(el => {
        const param = el.dataset.orImgParam;
        const allowed = editeur === 'openrouter' && supported.includes(param);
        el.style.display = allowed ? '' : 'none';
    });
    // image_size : honoré par Google natif et par les modèles Gemini hébergés sur OR.
    // En pratique, les autres modèles OR (Flux, Sourceful, Seedream...) ignorent image_size
    // et sortent à leur résolution native — on masque la section pour eux pour éviter la confusion.
    const sizeSection = document.getElementById('rp-gemini-size-section');
    const isOrGeminiFamily = editeur === 'openrouter' && modelId && modelId.toLowerCase().startsWith('google/gemini');
    if (sizeSection && editeur === 'openrouter') {
        sizeSection.classList.toggle('disabled', !isOrGeminiFamily);
    }
    const isOrGemini31Flash = modelId === 'google/gemini-3.1-flash-image-preview';
    // Aspect ratios étendus (1:4, 4:1, 1:8, 8:1) : uniquement Gemini 3.1 Flash via OR.
    const ratioSelect = document.getElementById('rp-gemini-ratio-select');
    if (ratioSelect) {
        const EXTENDED = ['1:4', '4:1', '1:8', '8:1'];
        const hasExtended = !!ratioSelect.querySelector(`option[value="${EXTENDED[0]}"]`);
        if (isOrGemini31Flash && !hasExtended) {
            for (const r of EXTENDED) {
                const opt = document.createElement('option');
                opt.value = r; opt.textContent = r;
                ratioSelect.appendChild(opt);
            }
        } else if (!isOrGemini31Flash && hasExtended) {
            EXTENDED.forEach(r => {
                const o = ratioSelect.querySelector(`option[value="${r}"]`);
                if (o) o.remove();
            });
            if (EXTENDED.includes(ratioSelect.value)) ratioSelect.value = '';
        }
    }
}

// Griser les boutons de format quand un ratio précis Gemini est choisi
const geminiRatioSelect = document.getElementById('rp-gemini-ratio-select');
function updateFormatBtnsDisabled() {
    const disabled = !!geminiRatioSelect?.value;
    document.querySelectorAll('.image-format-btn').forEach(btn => {
        btn.classList.toggle('disabled', disabled);
    });
    // Bascule du label de l'option vide : "Sélectionner un ratio précis" tant que rien n'est
    // choisi (placeholder explicatif), "Aucun" dès qu'un ratio est sélectionné (option de désélection).
    const placeholderOpt = geminiRatioSelect?.querySelector('option[value=""]');
    if (placeholderOpt) {
        placeholderOpt.textContent = disabled ? 'Aucun' : 'Sélectionner un ratio précis';
    }
}
geminiRatioSelect?.addEventListener('change', updateFormatBtnsDisabled);

// Slider « Nombre max d'images à renvoyer » : limite les images des messages
// précédents réinjectées à l'IA à chaque tour. 0 = ne jamais renvoyer.
// Persisté en localStorage pour survivre au reload.
(function _initMaxHistoryImagesSlider() {
    const range = document.getElementById('rp-max-history-images-range');
    const display = document.getElementById('rp-max-history-images-value');
    if (!range || !display) return;
    const KEY = 'minou-max-history-images';
    const stored = parseInt(localStorage.getItem(KEY));
    if (!isNaN(stored) && stored >= 0 && stored <= 12) range.value = String(stored);
    const fmt = (v) => (v === 0 ? 'Ne jamais renvoyer' : String(v));
    display.textContent = fmt(parseInt(range.value));
    range.addEventListener('input', () => {
        const v = parseInt(range.value);
        display.textContent = fmt(v);
        try { localStorage.setItem(KEY, String(v)); } catch(e) {}
    });
})();

function getMaxHistoryImages() {
    const range = document.getElementById('rp-max-history-images-range');
    if (!range) return 4;
    const v = parseInt(range.value);
    return isNaN(v) ? 4 : v;
}

// Renvoie une copie de l'historique avec les images des messages précédents
// limitées à N (les plus récentes conservées). Le DERNIER message utilisateur
// — celui qui déclenche la génération — garde toutes ses images, ce qui permet
// d'envoyer une image fraîche même quand la limite est 0.
function _limitHistoryImages(history, maxImages) {
    if (!Array.isArray(history) || history.length === 0) return history;
    // Index du dernier message user (= message en cours)
    let lastUserIdx = -1;
    for (let i = history.length - 1; i >= 0; i--) {
        if (history[i].role === 'user') { lastUserIdx = i; break; }
    }
    // Comptage des images dans les messages strictement antérieurs (à droite-à-gauche
    // pour conserver les plus récentes en priorité).
    const keepIdx = new Set();
    let kept = 0;
    for (let i = lastUserIdx - 1; i >= 0 && kept < maxImages; i--) {
        const m = history[i];
        if (!Array.isArray(m.content)) continue;
        for (let j = m.content.length - 1; j >= 0 && kept < maxImages; j--) {
            const part = m.content[j];
            if (part && part.type === 'image') {
                keepIdx.add(`${i}:${j}`);
                kept++;
            }
        }
    }
    // Numérotation globale des images retirées (chronologique) pour générer des
    // placeholders identifiables ("image1.png", "image2.png", …).
    let strippedCount = 0;
    const newHistory = history.map((m, i) => {
        if (i === lastUserIdx) return m; // message en cours : intact
        if (!Array.isArray(m.content)) return m;
        const newContent = [];
        for (let j = 0; j < m.content.length; j++) {
            const part = m.content[j];
            if (part && part.type === 'image') {
                if (keepIdx.has(`${i}:${j}`)) {
                    newContent.push(part);
                } else {
                    strippedCount++;
                    const ext = (part.mimeType || 'image/png').split('/')[1] || 'png';
                    const name = `image${strippedCount}.${ext}`;
                    newContent.push({
                        type: 'text',
                        text: `[${name} — cette image existe dans la conversation mais n'a pas été transmise à l'IA pour économiser des tokens. Si tu as besoin de la voir pour répondre, demande à l'utilisateur d'augmenter le réglage « Nombre d'images à renvoyer » dans les Réglages de la conversation de Cetas. Ne tente pas de modifier ce réglage toi-même.]`
                    });
                }
            } else {
                newContent.push(part);
            }
        }
        return { ...m, content: newContent };
    });
    return newHistory;
}

// Sliders réglages LLM (température, top-p, etc.)
['temperature', 'top-p', 'max-tokens', 'freq-penalty', 'presence-penalty', 'top-k', 'min-p', 'top-a', 'rep-penalty'].forEach(id => {
    const range = document.getElementById('rp-' + id + '-range');
    const display = document.getElementById('rp-' + id + '-value');
    if (range && display) {
        range.addEventListener('input', () => {
            display.textContent = parseFloat(range.value).toFixed(range.step.includes('.') ? 1 : 0);
        });
    }
    const toggle = document.getElementById('rp-' + id + '-toggle');
    if (toggle) {
        toggle.addEventListener('change', () => {
            toggle.closest('.right-panel-section')?.classList.toggle('rp-param-disabled', !toggle.checked);
        });
    }
});

// Toggle pour l'effort de raisonnement (select, pas range)
document.getElementById('rp-effort-toggle')?.addEventListener('change', (e) => {
    e.target.closest('.right-panel-section')?.classList.toggle('rp-param-disabled', !e.target.checked);
});

// Toggle pour le seed (input number, pas range)
document.getElementById('rp-seed-toggle')?.addEventListener('change', (e) => {
    e.target.closest('.right-panel-section')?.classList.toggle('rp-param-disabled', !e.target.checked);
});

// Modèles pour lesquels l'effort de raisonnement est obligatoire (pas de checkbox)
// Opus 4.7/4.8, Sonnet 5 et Fable 5 : adaptive thinking toujours actif → effort obligatoire.
// (/^claude-sonnet-5/ ne matche pas 'claude-sonnet-4-5-...' qui garde sa checkbox.)
const MANDATORY_EFFORT_MODELS = [/^claude-opus-4-[78]/, /^claude-sonnet-5/, /^claude-fable-5/];
function isMandatoryEffort(modelId) {
    if (!modelId) return false;
    return MANDATORY_EFFORT_MODELS.some(rx => rx.test(modelId));
}
// Gemma 4 : toggle binaire (l'API Gemini rejette low/medium pour ces modèles)
function isGemma4(modelId) { return !!modelId && modelId.startsWith('gemma-4'); }
// DeepSeek V3.2 : toggle binaire — bascule vers l'endpoint `deepseek-reasoner` si activé
function isDeepSeekBinaryReasoning(modelId) { return modelId === 'deepseek-chat'; }
// GLM-5 / 5.1 / 5.2 / 5-Turbo : toggle binaire — param `thinking: { type: "enabled"|"disabled" }`
function isZaiBinaryReasoning(modelId) { return ['glm-5', 'glm-5.1', 'glm-5.2', 'glm-5-turbo'].includes(modelId); }
// Grok 4.20 : toggle binaire — bascule entre les variantes `-reasoning` et `-non-reasoning`
function isGrokBinaryReasoning(modelId) { return modelId === 'grok-4.20-0309-reasoning'; }
// Grok 4.3 : reasoning ajustable (none / low / medium / high) via `reasoning_effort`
function isGrok43Reasoning(modelId) { return modelId === 'grok-4.3'; }
// Grok 4.5 : reasoning ajustable (low / medium / high) — non désactivable, défaut high côté API
function isGrok45Reasoning(modelId) { return modelId === 'grok-4.5'; }
// Mistral Small 4 / Medium 3.5 : toggle binaire — param `reasoning_effort: "high"|"none"`
function isMistralBinaryReasoning(modelId) { return modelId === 'mistral-small-latest' || modelId === 'mistral-medium-3-5'; }

function supportsReasoningEffort(modelId) {
    if (!modelId) return false;
    const editeur = getModelEditeur(modelId);
    if (editeur === 'openai') return /^(o1|o3|o4)/.test(modelId) || /^gpt-5/.test(modelId);
    if (editeur === 'anthropic') return modelId.includes('opus') || modelId.includes('sonnet') || modelId.includes('fable');
    if (editeur === 'deepseek') return modelId === 'deepseek-chat';
    if (editeur === 'grok') return isGrokBinaryReasoning(modelId) || isGrok43Reasoning(modelId) || isGrok45Reasoning(modelId);
    if (editeur === 'google') return modelId.includes('pro') || modelId.includes('flash') || isGemma4(modelId);
    if (editeur === 'mistral') return isMistralBinaryReasoning(modelId);
    if (editeur === 'zai') return isZaiBinaryReasoning(modelId);
    return false;
}
function getEffortLevels(modelId) {
    if (isGemma4(modelId) || isDeepSeekBinaryReasoning(modelId) || isZaiBinaryReasoning(modelId) || isGrokBinaryReasoning(modelId) || isMistralBinaryReasoning(modelId)) return ['minimal', 'high'];
    // Grok 4.3 : effort ajustable (cf. docs xAI), défaut "low" côté API.
    if (isGrok43Reasoning(modelId)) return ['none', 'low', 'medium', 'high'];
    // Grok 4.5 : low/medium/high uniquement (raisonnement non désactivable).
    if (isGrok45Reasoning(modelId)) return ['low', 'medium', 'high'];
    // GPT-5.2+ : remplace 'minimal' par 'none' et ajoute 'xhigh' (cf. docs OpenAI).
    // GPT-5.6+ ajoute également 'max'.
    // GPT-5 (5.0/5.1) conserve le set historique : minimal/low/medium/high.
    const m = modelId?.match(/^gpt-5\.(\d+)/);
    if (m && parseInt(m[1]) >= 6) return ['none', 'low', 'medium', 'high', 'xhigh', 'max'];
    if (m && parseInt(m[1]) >= 2) return ['none', 'low', 'medium', 'high', 'xhigh'];
    return ['minimal', 'low', 'medium', 'high'];
}
const EFFORT_LEVEL_LABELS = { none: 'Aucun', minimal: 'Minimal', low: 'Faible', medium: 'Moyen', high: 'Élevé', xhigh: 'Très élevé', max: 'Maximum' };
const BINARY_EFFORT_LABELS = { minimal: 'Désactivé', high: 'Activé' };
function populateEffortSelect(modelId) {
    const select = document.getElementById('rp-effort-select');
    if (!select) return;
    const prev = select.value;
    const levels = getEffortLevels(modelId);
    const binary = isGemma4(modelId) || isDeepSeekBinaryReasoning(modelId) || isZaiBinaryReasoning(modelId) || isGrokBinaryReasoning(modelId) || isMistralBinaryReasoning(modelId);
    const labels = binary ? BINARY_EFFORT_LABELS : EFFORT_LEVEL_LABELS;
    select.innerHTML = levels.map(l => `<option value="${l}">${labels[l]}</option>`).join('');
    select.value = levels.includes(prev) ? prev : (binary ? 'high' : 'medium');
}
function updateEffortMandatory(modelId) {
    const section = document.getElementById('rp-effort-section');
    const toggle = document.getElementById('rp-effort-toggle');
    if (!section || !toggle) return;
    // Masquer complètement si le modèle ne prend pas en charge le raisonnement
    if (!supportsReasoningEffort(modelId)) {
        section.style.display = 'none';
        section.classList.remove('rp-param-mandatory');
        toggle.checked = false;
        section.classList.add('rp-param-disabled');
    } else {
        section.style.display = '';
        populateEffortSelect(modelId);
        if (isMandatoryEffort(modelId)) {
            section.classList.add('rp-param-mandatory');
            section.classList.remove('rp-param-disabled');
            toggle.checked = true;
        } else {
            section.classList.remove('rp-param-mandatory');
            if (!toggle.checked) section.classList.add('rp-param-disabled');
        }
    }
    // Filtrage OR : pour les modèles OpenRouter, on ne montre que les params déclarés
    // dans `supported_parameters` du modèle. Pour les autres providers, tout reste visible.
    _applyOrParamVisibility(modelId);
}

// Filtre les sections de paramètres LLM (data-or-param) selon supportedParameters.
// - Sections marquées `data-or-only="true"` : visibles UNIQUEMENT si modèle OR + param déclaré
//   (ex. top_k, min_p, seed — samplers spécifiques OR sans équivalent universel)
// - Sections standard : visibles pour tous les non-OR (comportement par défaut), filtrées pour OR
function _applyOrParamVisibility(modelId) {
    const sections = document.querySelectorAll('#rp-tab-general [data-or-param]');
    const editeur = modelId ? (getModelEditeur(modelId) || getImageModelEditeur(modelId) || getSearchModelEditeur(modelId)) : null;
    const isOr = editeur === 'openrouter';
    const meta = isOr ? (MODELS.find(m => m.id === modelId) || IMAGE_MODELS.find(m => m.id === modelId)) : null;
    const supported = Array.isArray(meta?.supportedParameters) ? meta.supportedParameters : [];
    sections.forEach(s => {
        const param = s.dataset.orParam;
        const orOnly = s.dataset.orOnly === 'true';
        // L'effort de raisonnement est déjà géré par updateEffortMandatory qui peut imposer
        // display:none indépendamment. On ne réécrase pas son état dans ce cas.
        if (param === 'reasoning' && s.style.display === 'none' && !isOr) return;
        if (orOnly) {
            // Caché sauf si OR + param supporté
            s.style.display = (isOr && supported.includes(param)) ? '' : 'none';
        } else {
            // Visible partout, filtré seulement si OR
            s.style.display = (!isOr || supported.includes(param)) ? '' : 'none';
        }
    });
}

// Valeurs par défaut des paramètres LLM
const MODEL_PARAMS_DEFAULTS = {
    temperature: { value: 0.7, display: '0.7' },
    'top-p': { value: 1, display: '1.0' },
    'max-tokens': { value: 4096, display: '4096' },
    'freq-penalty': { value: 0, display: '0.0' },
    'presence-penalty': { value: 0, display: '0.0' }
};

// Bouton de réinitialisation des paramètres
document.getElementById('rp-params-reset-btn')?.addEventListener('click', () => {
    Object.entries(MODEL_PARAMS_DEFAULTS).forEach(([id, def]) => {
        const range = document.getElementById('rp-' + id + '-range');
        const display = document.getElementById('rp-' + id + '-value');
        const toggle = document.getElementById('rp-' + id + '-toggle');
        if (range) range.value = def.value;
        if (display) display.textContent = def.display;
        if (toggle) {
            toggle.checked = false;
            toggle.closest('.right-panel-section')?.classList.add('rp-param-disabled');
        }
    });
    const effortSelect = document.getElementById('rp-effort-select');
    const effortToggle = document.getElementById('rp-effort-toggle');
    const effortSection = document.getElementById('rp-effort-section');
    if (effortSelect) effortSelect.value = 'medium';
    if (effortToggle && effortSection && !effortSection.classList.contains('rp-param-mandatory')) {
        effortToggle.checked = false;
        effortSection.classList.add('rp-param-disabled');
    }
});

// Lecture des paramètres LLM depuis les sliders
function getModelParams() {
    const v = (id, toggleId) => {
        const toggle = document.getElementById(toggleId);
        if (!toggle || !toggle.checked) return undefined;
        const el = document.getElementById(id);
        return el ? parseFloat(el.value) : undefined;
    };
    const intToggled = (id, toggleId) => {
        const toggle = document.getElementById(toggleId);
        if (!toggle || !toggle.checked) return undefined;
        const el = document.getElementById(id);
        return el ? parseInt(el.value) : undefined;
    };
    return {
        temperature: v('rp-temperature-range', 'rp-temperature-toggle'),
        top_p: v('rp-top-p-range', 'rp-top-p-toggle'),
        max_tokens: intToggled('rp-max-tokens-range', 'rp-max-tokens-toggle'),
        frequency_penalty: v('rp-freq-penalty-range', 'rp-freq-penalty-toggle'),
        presence_penalty: v('rp-presence-penalty-range', 'rp-presence-penalty-toggle'),
        top_k: intToggled('rp-top-k-range', 'rp-top-k-toggle'),
        min_p: v('rp-min-p-range', 'rp-min-p-toggle'),
        top_a: v('rp-top-a-range', 'rp-top-a-toggle'),
        repetition_penalty: v('rp-rep-penalty-range', 'rp-rep-penalty-toggle'),
        seed: (() => {
            const toggle = document.getElementById('rp-seed-toggle');
            if (!toggle || !toggle.checked) return undefined;
            const el = document.getElementById('rp-seed-input');
            const v = el ? parseInt(el.value) : NaN;
            return isNaN(v) ? undefined : v;
        })(),
        reasoning_effort: (() => {
            const toggle = document.getElementById('rp-effort-toggle');
            if (!toggle || !toggle.checked) return undefined;
            return document.getElementById('rp-effort-select')?.value || 'medium';
        })(),
        webSearchDepth: STATE.webSearchDepth || 'standard'
    };
}

// Remplir le textarea quand on sélectionne un rôle
let spOriginalContenu = null;
spSelect.addEventListener('change', () => {
    if (spSelect.value) {
        const opt = spSelect.selectedOptions[0];
        spOriginalContenu = opt.dataset.contenu || '';
        spTextarea.value = spOriginalContenu;
        spEditBtn.style.display = 'none';
        rpRoleActions.style.display = 'none';
    } else {
        spOriginalContenu = null;
        spTextarea.value = '';
        spEditBtn.style.display = 'none';
        rpRoleActions.style.display = 'none';
    }
});

// Mettre à jour le system prompt en temps réel quand on édite le textarea
spTextarea.addEventListener('input', () => {
    if (STATE.currentSystemPrompt) {
        STATE.currentSystemPrompt.contenu = spTextarea.value;
    }
    if (spSelect.value && spOriginalContenu !== null) {
        const changed = spTextarea.value !== spOriginalContenu;
        spEditBtn.style.display = changed ? 'inline-flex' : 'none';
        rpRoleActions.style.display = changed ? 'flex' : 'none';
    }
});


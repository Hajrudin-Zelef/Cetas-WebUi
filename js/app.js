// Cetas v3.7 — © Marexsoft Corporation. Fondateur Kouassi Marius.
import { STATE, STREAM_ERROR_CONTENT, TEXT_EXTENSIONS, isStreamActive } from './state.js';
import './dom.js';
import { escHtml, escHtmlAttr, safeUrl, isTextFile, arrayBufferToBase64, isPdf, getModelLabel, fmtTokens, fmtCost } from './utils.js';

// Exposer les utilitaires partagés aux scripts globaux (modules extraits)
import { applyTheme, initTheme, setOnThemeChange } from './theme.js';
import { initLightbox } from './lightbox.js';
import { initAttachments, setAttachStateChange, cancelAllPendingLoads, renderAttachPreview, processAttachedFile } from './attachments.js';
import { initEmojiTabs, showEmojiPicker, hideEmojiPicker, renderEmojiGrid } from './emoji-picker.js';
import { renderFavList, _isFavorite, _toggleFavorite, setFavoritesCallbacks } from './favorites.js';
import { initWhisper, setWhisperCallbacks } from './whisper.js';
import { initUserManagement } from './user-management.js';
import { updateWebSearchBtn, hasBuiltInWebSearch, calcWebSearchCost, setWebSearchAlignCallback } from './web-search.js';
import { initExportHandlers, updateExportMdBtn } from './export-md.js';
import { loadBudgetSettings, toggleBudgetSettings, getCostForPeriod, updateBudgetPreview, checkBudgetAlert, addCostForModel, updateBudgetAmountSuffix, initBudget } from './budget.js';
import { initRoles, setRolesCallbacks, refreshSpList, deleteSpItem, exportSpItem, openSpModal, closeSpModal, autoResizeTextarea } from './roles.js';
import { initPrompts, setPromptsCallbacks, refreshPrList, openPrModal, closePrModal } from './prompts.js';
import { initExportImport, setExportImportCallbacks, exportBackup, importBackup } from './export-import.js';
import { initCategories, setCategoriesCallbacks, refreshCatBar, updateActiveCatColor, updateNewChatBtnColor, updateCatSelectColor, updateEmptyChatCategory, openCatModal, openCatManagePopup, renderCatManageList, selectCatColor, randomDefaultEmoji, textColorForBg } from './categories.js';


const APP_VERSION = '3.2';
const chatContainer = document.getElementById('chat-container');
const promptInput = document.getElementById('prompt-input');
const sendBtn = document.getElementById('send-btn');
const newChatBtn = document.getElementById('new-chat-btn');
const tokenInfo = document.getElementById('token-info');
const costInfo = document.getElementById('cost-info');
const convList = document.getElementById('conv-list');
const modelSelect = document.getElementById('model-select');
const spSelect = document.getElementById('sp-select');
const spListEl = document.getElementById('sp-list');
const spAddBtn = document.getElementById('sp-add-btn');
const spEditBtn = document.getElementById('sp-edit-btn');
const spDeleteBtn = document.getElementById('sp-delete-btn');
const rpRoleActions = document.getElementById('rp-role-actions');
const spModalOverlay = document.getElementById('sp-modal-overlay');
const spModalTitle = document.getElementById('sp-modal-title');
const spModalNom = document.getElementById('sp-modal-nom');
const spModalContenu = document.getElementById('sp-modal-contenu');
const spModalCancel = document.getElementById('sp-modal-cancel');
const spModalSave = document.getElementById('sp-modal-save');
const themeToggle = document.getElementById('theme-toggle');
const convSearch = document.getElementById('conv-search');
const attachBtn = document.getElementById('attach-btn');
const fileInput = document.getElementById('file-input');
const attachPreview = document.getElementById('attach-preview');
const micBtn = document.getElementById('mic-btn');
// webSearchToggle retiré — remplacé par le bouton d'action "Recherche web"
const enhancePromptBtn = document.getElementById('enhance-prompt-btn');
const toolbarInsertBtn = document.getElementById('toolbar-insert-btn');
const toolbarEnhanceBtn = document.getElementById('toolbar-enhance-btn');
const toolbarSaveBtn = document.getElementById('toolbar-save-btn');

// --- Migration localStorage : anciennes clés kiro-* → cetas-* ---
(function _migrateLocalStorage() {
  const OLD_VIEWMODE = 'kiro-storage-media-viewmode';
  const NEW_VIEWMODE = 'cetas-storage-media-viewmode';
  const oldView = localStorage.getItem(OLD_VIEWMODE);
  if (oldView && !localStorage.getItem(NEW_VIEWMODE)) {
    localStorage.setItem(NEW_VIEWMODE, oldView);
  }
  if (oldView) localStorage.removeItem(OLD_VIEWMODE);

  // Migration des clés budget-ack dynamiques
  const BUDGET_PREFIX_OLD = 'kiro-budget-ack-';
  const BUDGET_PREFIX_NEW = 'cetas-budget-ack-';
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && key.startsWith(BUDGET_PREFIX_OLD)) {
      const periodId = key.slice(BUDGET_PREFIX_OLD.length);
      const newKey = BUDGET_PREFIX_NEW + periodId;
      if (!localStorage.getItem(newKey)) {
        localStorage.setItem(newKey, localStorage.getItem(key));
      }
      localStorage.removeItem(key);
    }
  }
})();

const chatHeaderSettings = document.getElementById('chat-header-settings');
const promptPickerDropdownWrapper = document.getElementById('prompt-picker-dropdown-wrapper');
const promptPickerDropdown = document.getElementById('prompt-picker-dropdown');
const prListEl = document.getElementById('pr-list');
const prAddBtn = document.getElementById('pr-add-btn');
const prModalOverlay = document.getElementById('pr-modal-overlay');
const prModalTitle = document.getElementById('pr-modal-title');
const prModalNom = document.getElementById('pr-modal-nom');
const prModalContenu = document.getElementById('pr-modal-contenu');
const prModalCancel = document.getElementById('pr-modal-cancel');
const prModalSave = document.getElementById('pr-modal-save');
const prModalEnhance = document.getElementById('pr-modal-enhance');

const apikeysBtn = document.getElementById('apikeys-btn');
const apikeysModalOverlay = document.getElementById('apikeys-modal-overlay');

// Map<convId, streamCtx> — streams en cours pour permettre le multi-conversations.
// Chaque streamCtx capture STATE.conversationId + history + abortController au démarrage du stream.
// Fichiers en cours de lecture (FileReader / extraction PDF). Tant qu'un fichier
// est ici, le bouton Envoyer est désactivé pour éviter qu'un message parte sans
// son attachement. Chaque entrée : { id, name, reader }.
// `true` entre l'arrêt de l'enregistrement et la fin du STT pour éviter qu'un
// double-clic sur le micro lance un nouvel enregistrement par-dessus.

// Message d'erreur générique poussé dans l'history quand un stream se termine en
// échec (cf. handleApiError + onError des chemins background).
// [→ state.js] STREAM_ERROR_CONTENT importé


// --- Liens dans un nouvel onglet (marked) + sanitisation XSS (DOMPurify) ---


marked.use({
    renderer: {
        link({ href, title, text }) {
            const safeHref = escHtmlAttr(safeUrl(href));
            const t = title ? ` title="${escHtmlAttr(title)}"` : '';
            return `<a href="${safeHref}"${t} target="_blank" rel="noopener noreferrer">${text}</a>`;
        }
    },
    hooks: {
        postprocess(html) {
            // Sécurité : si DOMPurify n'a pas pu charger (CDN bloqué), on refuse de rendre du HTML
            // brut issu d'une réponse IA → on retombe sur du texte échappé pour éviter tout XSS.
            if (typeof DOMPurify === 'undefined') {
                return String(html).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
            }
            return DOMPurify.sanitize(html, { ADD_ATTR: ['target', 'rel'] });
        }
    }
});

// --- Thème clair/sombre/auto (module theme.js) ---
setOnThemeChange(updateThemeOptions);
initTheme();

// --- Recherche de conversations ---

convSearch.addEventListener('input', async () => {
    const query = convSearch.value.toLowerCase();
    const items = convList.querySelectorAll('.conv-item');

    // Charger le fullText à la demande au premier caractère tapé
    if (query && !STATE._fullTextsLoaded) {
        STATE._fullTextsLoaded = true;
        const texts = await loadConvFullTexts();
        for (const item of convList.querySelectorAll('.conv-item')) {
            const fn = item.dataset.filename;
            if (texts[fn]) item.dataset.fulltext = texts[fn];
        }
    }

    for (const item of items) {
        if (!query) {
            item.style.display = '';
            continue;
        }
        const title = (item.querySelector('.conv-item-title')?.textContent || '').toLowerCase();
        const fulltext = item.dataset.fulltext || '';
        const match = title.includes(query) || fulltext.includes(query);
        item.style.display = match ? '' : 'none';
    }
});

// --- Pièces jointes ---
if (typeof pdfjsLib !== 'undefined') {
    pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js';
}

// --- Pièces jointes (module attachments.js) ---
if (typeof pdfjsLib !== 'undefined') {
    pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js';
}
setAttachStateChange(updateSendButton);
initAttachments();

// [→ state.js] TEXT_EXTENSIONS importé

// DOM refs pour export (utilisés par Résumé IA et export-md.js)
const shareBtn = document.getElementById('share-btn');
const shareMenu = document.getElementById('share-menu');
const summaryBtn = document.getElementById('summary-btn');

// --- Marqueur visuel de changement de modèle ---
function addModelSwitchElement(fromLabel, toLabel) {
    const div = document.createElement('div');
    div.className = 'model-switch-marker';
    div.textContent = `${fromLabel} → ${toLabel}`;
    chatContainer.appendChild(div);
    scrollToBottom(true);
}

function addModelSwitch(fromId, toId) {
    if (fromId === toId) return;
    const last = STATE.conversationHistory[STATE.conversationHistory.length - 1];
    if (last && last.type === 'model-switch') {
        if (last.from === toId) {
            // Revenu au modèle d'origine → supprimer le marqueur
            STATE.conversationHistory.pop();
            const markers = chatContainer.querySelectorAll('.model-switch-marker');
            const existing = markers[markers.length - 1];
            if (existing) existing.remove();
            saveConversation();
            return;
        }
        last.to = toId;
        const markers = chatContainer.querySelectorAll('.model-switch-marker');
        const existing = markers[markers.length - 1];
        if (existing) {
            existing.textContent = `${getModelLabel(last.from)} → ${getModelLabel(toId)}`;
            saveConversation();
            return;
        }
    }
    STATE.conversationHistory.push({ role: 'system', type: 'model-switch', from: fromId, to: toId });
    addModelSwitchElement(getModelLabel(fromId), getModelLabel(toId));
    saveConversation();
}

// --- Export Markdown ---
// --- Résumé IA pour nouvelle conversation ---
summaryBtn.addEventListener('click', async () => {
    if (STATE.conversationHistory.length === 0) return;

    if (!AUDIO_SETTINGS.summaryModel) {
        showNoModelAlert('le résumé IA', 'summary-model');
        return;
    }

    let convText = '';
    for (const msg of STATE.conversationHistory) {
        if (msg.type === 'model-switch') continue;
        const role = msg.role === 'user' ? 'Utilisateur' : 'Assistant';
        const text = getTextFromContent(msg.content);
        if (text) convText += `${role} :\n${text}\n\n`;
    }

    const originalHtml = summaryBtn.innerHTML;
    summaryBtn.innerHTML = '<svg class="spin" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>';
    summaryBtn.disabled = true;

    try {
        const modelId = AUDIO_SETTINGS.summaryModel;
        const prompt = `Génère un résumé structuré de cette conversation, optimisé pour servir de contexte initial à une nouvelle conversation. Inclus les points clés, décisions, et le contexte nécessaire. Réponds UNIQUEMENT avec le contenu, sans rien ajouter d'autre. Pas d'introduction, pas de conclusion, pas de commentaire, pas de texte avant ou après. Ne commence pas par "Voici" ou toute autre phrase d'accroche.\n\n---\n\n${convText}`;
        const summary = (await streamText(modelId, prompt)).text;

        if (summary) {
            saveConversation();
            resetConversation();
            promptInput.value = summary;
            promptInput.style.height = 'auto';
            promptInput.style.height = Math.min(promptInput.scrollHeight, 200) + 'px';
            updateSendButton();
            promptInput.focus();
        }
    } catch (e) {
        console.error('Erreur résumé IA:', e);
        customAlert('Erreur lors de la génération du résumé : ' + e.message, 'error');
    } finally {
        summaryBtn.innerHTML = originalHtml;
        summaryBtn.disabled = false;
    }
});



// --- Toggles sections sidebar ---
document.querySelectorAll('.sp-toggle').forEach(toggle => {
    toggle.addEventListener('click', (e) => {
        e.stopPropagation();
        const target = document.getElementById(toggle.dataset.target);
        if (!target) return;
        const collapsed = target.classList.toggle('collapsed');
        toggle.innerHTML = collapsed ? '&#9656;' : '&#9662;';
        localStorage.setItem('minou-collapse-' + toggle.dataset.target, collapsed ? '1' : '0');
    });
    toggle.closest('.sp-header').addEventListener('click', (e) => {
        if (e.target.closest('.sp-add-btn')) return;
        toggle.click();
    });
    const saved = localStorage.getItem('minou-collapse-' + toggle.dataset.target);
    if (saved === '1') {
        document.getElementById(toggle.dataset.target)?.classList.add('collapsed');
        toggle.innerHTML = '&#9656;';
    } else if (saved === '0') {
        document.getElementById(toggle.dataset.target)?.classList.remove('collapsed');
        toggle.innerHTML = '&#9662;';
    }
});

// --- Toggle sidebar ---
const sidebarToggle = document.getElementById('sidebar-toggle');
const sidebar = document.getElementById('sidebar');

function _isMobile() { return window.innerWidth <= 768; }

function _updateSidebarState() {
    const collapsed = sidebar.classList.contains('collapsed');
    sidebarToggle.classList.toggle('collapsed', collapsed);
    sidebarToggle.title = collapsed ? 'Afficher le panneau' : 'Masquer le panneau';
    document.body.classList.toggle('sidebar-open', !collapsed && _isMobile());
}

sidebarToggle.addEventListener('click', () => {
    sidebar.classList.toggle('collapsed');
    _updateSidebarState();
});

// Collapse sidebar on outside click
function _collapseSidebar() {
    if (!sidebar.classList.contains('collapsed')) {
        sidebar.classList.add('collapsed');
        _updateSidebarState();
    }
}
document.addEventListener('click', (e) => {
    // Collapse uniquement sur mobile (overlay)
    if (!_isMobile()) return;
    if (sidebar.contains(e.target)) return;
    if (sidebarToggle.contains(e.target)) return;
    if (e.target.closest('.sp-modal-overlay, .apikeys-modal-overlay, .login-overlay, #lightbox-overlay')) return;
    _collapseSidebar();
});

// Mobile : sidebar fermée par défaut. Desktop : ouverte.
if (_isMobile()) {
    sidebar.classList.add('collapsed');
}
_updateSidebarState();

window.addEventListener('resize', () => {
    if (_isMobile() && !sidebar.classList.contains('collapsed')) {
        sidebar.classList.add('collapsed');
    }
    _updateSidebarState();
});

// --- Panneau droit + params (module right-panel.js) ---
// --- Menu "+" (module plus-menu.js) ---
// --- Bouton Envoyer mobile ---
const mobileSendBtn = document.getElementById('mobile-send-btn');
if (mobileSendBtn) {
    promptInput.addEventListener('input', () => {
        const hasText = promptInput.value.trim().length > 0;
        mobileSendBtn.style.display = hasText ? 'flex' : 'none';
        if (micBtn) micBtn.style.display = hasText ? 'none' : '';
    });
    mobileSendBtn.addEventListener('click', () => {
        if (STATE.isStreaming) return;
        sendMessage();
    });
}

// --- Bouton Canvas ---
// Affiché uniquement pour les modèles texte (pas image, pas search).
// L'état actif/inactif est géré dans canvas.js (persisté par conversation).
const canvasToggleBtn = document.getElementById('canvas-toggle-btn');

function updateCanvasBtn() {
    if (!canvasToggleBtn || !window.Canvas) return;
    // Le canvas n'a de sens que sur un modèle texte
    const activeTextModel = STATE.currentModel;
    const isTextModel = activeTextModel && MODELS.some(m => m.id === activeTextModel);
    if (!isTextModel) {
        canvasToggleBtn.style.display = 'none';
        // Forcer désactivation visuelle du bouton canvas dans la toolbar latérale
        if (typeof updateSideToolbarState === 'function') updateSideToolbarState();
        if (typeof alignInputHint === 'function') alignInputHint();
        return;
    }
    canvasToggleBtn.style.display = '';
    if (typeof window.Canvas._state === 'object') {
        canvasToggleBtn.classList.toggle('active', !!window.Canvas.isActive());
    }
    if (typeof updateSideToolbarState === 'function') updateSideToolbarState();
    if (typeof alignInputHint === 'function') alignInputHint();
}

// Helpers canvas pour les appels streamModel
function buildCanvasParserIfActive() {
    if (window.Canvas && window.Canvas.isActive()) {
        return window.Canvas.createStreamParser({
            onPersist: () => { if (typeof window.saveConversation === 'function') window.saveConversation(); }
        });
    }
    return null;
}

// Prompt système injecté pour les modèles SamAgent (routeur intelligent)
const SAMAGENT_BOOST_PROMPT = `Tu es SamAgent, l'assistant IA flagship de Cetas. Tu es poli, chaleureux et professionnel. Tes règles :

1. ACCUEIL naturel : salue toujours l'utilisateur avec courtoisie. Pour un premier contact ("salut", "bonjour", "hello"), réponds avec une formule brève et chaleureuse : "Salut ! Comment allez-vous ?" ou "Bonjour ! Ravi de vous voir."

2. PROPOSITIONS interactives : après ton salut (et uniquement pour un premier contact), propose exactement 3 exemples de ce que tu peux faire. FORMAT OBLIGATOIRE : chaque option sur sa PROPRE LIGNE (séparées par un saut de ligne \n, jamais sur la même ligne). Les descriptions doivent être COURTES (max 10 mots).
   💬 Chat général : une question de conversation, conseil ou information du quotidien
   💻 Coder : un problème de programmation, script, debug ou algorithme
   🔬 Avancé : une analyse approfondie, maths, science ou rédaction
   FORMAT IMPÉRATIF : chaque option dans son PROPRE paragraphe HTML (<p>...</p>), pas de <br> ni de texte collé. Exemple exact à suivre :
   <p>💬 Chat général : une question de conversation, conseil ou information du quotidien</p>
   <p>💻 Coder : un problème de programmation, script, debug ou algorithme</p>
   <p>🔬 Avancé : une analyse approfondie, maths, science ou rédaction</p>
   L'utilisateur peut cliquer dessus pour choisir un domaine. S'il clique, réponds avec un accusé de réception chaleureux et humain — varie toujours, ne répète jamais. Exemples : "Je t'écoute, vas-y 😊", "OK, je suis prêt. Dis-moi ce que tu as en tête.", "Parfait, je suis tout ouïe. Raconte-moi." Sois court et précis.

3. ÉCOUTE active : après avoir accusé réception d'un choix de domaine (💬 💻 🔬), arrête-toi NET. N'ajoute AUCUNE question, suggestion ou relance. Dis juste « Ok, je vous écoute » ou une variante brève, et attends que l'utilisateur parle. Si ensuite l'utilisateur pose une question vague (sans rapport avec un choix de domaine), alors seulement pose 2 ou 3 questions ciblées.

4. COMPÉTENCE experte : si un rôle système est défini, applique-le avec précision. Réponds de manière experte, structurée et utile.

5. EFFICACITÉ élégante : sois concis sans être sec. Garde un ton agréable et humain. Pas de blabla, pas de répétitions — chaque phrase a un sens.

6. ADAPTATION fluide : l'utilisateur peut répondre à tes questions, changer de sujet, ou sélectionner une compétence — adapte-toi naturellement.`;

function effectiveSystemPrompt(spContent) {
    let sp = spContent || '';
    // Injecter le prompt SamAgent si un modèle SamAgent est actif
    const activeModel = STATE.currentModel || STATE.currentSearchModel || '';
    if (activeModel.indexOf('samagent-') === 0) {
        sp = (sp ? sp + '\n\n' : '') + SAMAGENT_BOOST_PROMPT;
    }
    if (window.Canvas && window.Canvas.isActive()) {
        sp = (sp ? sp + '\n\n' : '') + window.Canvas.buildSystemPromptSuffix();
    }
    return sp;
}

// Affiche un message animé dans la bulle assistant pendant l'analyse.
// L'utilisateur voit une activité sans savoir qu'un routeur LLM tourne.
var ROUTER_THINKING_MESSAGES = [
    '✨ Analyse de votre requête',
    '🔍 Exploration du contexte',
    '💡 Recherche du meilleur angle',
    '🎯 Calibration de la réponse',
    '⚡ Optimisation en cours',
    '🧠 Réflexion approfondie',
    '🌟 Préparation d\'une réponse experte',
    '📐 Structuration de la pensée',
    '🔬 Examen minutieux du sujet',
    '🌊 Plongée dans le contexte',
    '💎 Extraction des points clés',
    '🧩 Assemblage des connaissances',
    '🎨 Façonnage de la réponse',
    '🚀 Accélération neuronale',
    '👁️ Lecture entre les lignes'
];

function _showRouterThinking(assistantDiv) {
    var msg = ROUTER_THINKING_MESSAGES[Math.floor(Math.random() * ROUTER_THINKING_MESSAGES.length)];
    var el = document.createElement('div');
    el.className = 'router-thinking';
    el.innerHTML = '<span class="router-thinking-text">' + msg + '</span><span class="router-thinking-dots"><span>.</span><span>.</span><span>.</span></span>';
    assistantDiv.appendChild(el);
}

function _hideRouterThinking(assistantDiv) {
    var el = assistantDiv.querySelector('.router-thinking');
    if (el) {
        el.classList.add('router-thinking-fade');
        setTimeout(function() { if (el.parentNode) el.parentNode.removeChild(el); }, 400);
    }
}

/**
 * À appeler juste après un `STATE.conversationHistory.push({ role: 'assistant', ... })`
 * dans un flow où le canvas était actif. Attache un snapshot de l'état canvas
 * AVANT ce tour IA au dernier message, pour pouvoir y revenir lors d'une
 * régénération ou d'une édition de message utilisateur.
 */
function attachCanvasBeforeToLastAssistant() {
    if (!window.Canvas || !window.Canvas.isActive()) return;
    const last = STATE.conversationHistory[STATE.conversationHistory.length - 1];
    if (!last || last.role !== 'assistant') return;
    // Ne stocker le snapshot que si le tour a réellement modifié le canvas :
    // sinon on gaspille du stockage pour rien.
    if (typeof window.Canvas.isDirtyVsBaseline === 'function' && !window.Canvas.isDirtyVsBaseline()) return;
    last.canvasBefore = window.Canvas.getBaselineSnapshot();
}


/**
 * Si le canvas a été modifié par un tour IA à régénérer / écraser, demande
 * confirmation et revient à l'état pré-tour. Retourne une promise<boolean> :
 * true = on peut continuer, false = l'utilisateur a annulé.
 * @param {object} snapshot État cible à restaurer (= canvasBefore du message concerné)
 */
async function confirmAndRewindCanvas(snapshot) {
    if (!window.Canvas || !window.Canvas.isActive()) return true;
    if (!snapshot) return true;
    // Si le snapshot est déjà identique à l'état courant, aucun revert nécessaire
    if (typeof window.Canvas.filesEqual === 'function' &&
        window.Canvas.filesEqual(snapshot, window.Canvas.getCurrentSnapshot())) {
        return true;
    }
    const ok = await customConfirm(
        'Cette action va annuler les modifications du canvas apportées par cette réponse de l\'IA et la relancer depuis l\'état précédent. Continuer ?',
        { icon: 'revert', danger: true, okLabel: 'Relancer', cancelLabel: 'Annuler' }
    );
    if (!ok) return false;
    window.Canvas.restoreSnapshot(snapshot);
    if (typeof saveConversation === 'function') saveConversation();
    return true;
}

// --- Améliorer le prompt ---
function updateEnhanceBtn() {
    const hasText = promptInput.value.trim() !== '';
    // Update old hidden button for compatibility
    if (STATE.originalPromptBeforeEnhance !== null) {
        enhancePromptBtn.disabled = STATE.isStreaming;
        enhancePromptBtn.classList.add('revert');
    } else if (hasText || STATE.isEnhancing) {
        enhancePromptBtn.disabled = !hasText || STATE.isEnhancing || STATE.isStreaming;
        enhancePromptBtn.classList.remove('revert');
    }
    updatePromptToolbar();
}

let _toolbarMode = 'hidden'; // 'hidden' | 'insert' | 'enhance' | 'revert'

// --- "Insérer un prompt" flottant (indépendant du mode enhance/save) ---
let _insertBtnVisible = false;

function _insertBtnTargetCoords() {
    const center = toolbarInsertBtn.closest('.input-line-2-center');
    const content = promptInput.closest('.input-content');
    if (!center || !content) return null;
    const centerRect = center.getBoundingClientRect();
    const contentRect = content.getBoundingClientRect();
    if (_lastClickX !== null && _lastClickY !== null) {
        return {
            left: (_lastClickX + contentRect.left - centerRect.left) + 'px',
            top: (_lastClickY + contentRect.top - centerRect.top) + 'px'
        };
    }
    return {
        left: (contentRect.width / 2 + contentRect.left - centerRect.left) + 'px',
        top: (contentRect.height + contentRect.top - centerRect.top) + 'px'
    };
}

function showInsertBtn() {
    const wasVisible = toolbarInsertBtn.style.display !== 'none' && !toolbarInsertBtn.classList.contains('floating');

    if (wasVisible) {
        // Le bouton est visible en bas → capturer sa position de départ, passer en floating, puis animer
        const startRect = toolbarInsertBtn.getBoundingClientRect();
        toolbarInsertBtn.style.transition = 'none';
        toolbarInsertBtn.classList.add('floating');
        // Calculer la destination maintenant que floating est actif
        const target = _insertBtnTargetCoords();
        if (target) {
            // Placer le bouton à sa position de départ (en coordonnées du parent floating)
            const center = toolbarInsertBtn.closest('.input-line-2-center');
            if (center) {
                const centerRect = center.getBoundingClientRect();
                toolbarInsertBtn.style.left = (startRect.left + startRect.width / 2 - centerRect.left) + 'px';
                toolbarInsertBtn.style.top = (startRect.bottom - centerRect.top) + 'px';
            }
            toolbarInsertBtn.offsetTop; // forcer le reflow
            toolbarInsertBtn.style.transition = '';
            toolbarInsertBtn.style.left = target.left;
            toolbarInsertBtn.style.top = target.top;
        }
    } else {
        // Le bouton n'était pas visible → apparition directe sans animation
        toolbarInsertBtn.style.display = 'inline-flex';
        toolbarInsertBtn.style.transition = 'none';
        toolbarInsertBtn.classList.add('floating');
        const target = _insertBtnTargetCoords();
        if (target) {
            toolbarInsertBtn.style.left = target.left;
            toolbarInsertBtn.style.top = target.top;
        }
    }
    _insertBtnVisible = true;
}

function hideInsertBtn() {
    if (toolbarInsertBtn.classList.contains('floating')) {
        toolbarInsertBtn.style.display = 'none';
        toolbarInsertBtn.classList.remove('floating');
        toolbarInsertBtn.style.left = '';
        toolbarInsertBtn.style.top = '';
        _insertBtnVisible = false;
    }
}

function _applyToolbarMode(mode) {
    if (mode === 'insert') {
        // Pas de texte → afficher "Insérer un prompt" statiquement au centre
        toolbarInsertBtn.style.display = 'inline-flex';
        toolbarInsertBtn.classList.remove('floating');
        toolbarInsertBtn.style.left = '';
        toolbarInsertBtn.style.top = '';
        toolbarEnhanceBtn.style.display = 'none';
        toolbarSaveBtn.style.display = 'none';
    } else if (mode === 'hidden') {
        toolbarInsertBtn.style.display = 'none';
        toolbarInsertBtn.classList.remove('floating');
        toolbarEnhanceBtn.style.display = 'none';
        toolbarSaveBtn.style.display = 'none';
    } else if (mode === 'enhance') {
        toolbarInsertBtn.style.display = 'none';
        toolbarInsertBtn.classList.remove('floating');
        toolbarEnhanceBtn.style.display = 'inline-flex';
        toolbarEnhanceBtn.classList.remove('revert');
        toolbarEnhanceBtn.title = 'Améliorer le prompt';
        if (STATE.isEnhancing) {
            toolbarEnhanceBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="spin"><path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z"/><path d="M20 3v4"/><path d="M22 5h-4"/><path d="M4 17v2"/><path d="M5 18H3"/></svg> <span class="btn-label">Améliorer le prompt…</span>';
        } else {
            toolbarEnhanceBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z"/><path d="M20 3v4"/><path d="M22 5h-4"/><path d="M4 17v2"/><path d="M5 18H3"/></svg> <span class="btn-label">Améliorer le prompt</span>';
        }
        toolbarSaveBtn.style.display = 'inline-flex';
    } else if (mode === 'revert') {
        toolbarInsertBtn.style.display = 'none';
        toolbarInsertBtn.classList.remove('floating');
        toolbarEnhanceBtn.style.display = 'inline-flex';
        toolbarEnhanceBtn.classList.add('revert');
        toolbarEnhanceBtn.title = 'Annuler l\u2019amélioration du prompt';
        toolbarEnhanceBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 14L4 9l5-5"/><path d="M20 20v-7a4 4 0 0 0-4-4H4"/></svg> <span class="btn-label">Revenir</span>';
        toolbarSaveBtn.style.display = 'inline-flex';
    }
}

function updatePromptToolbar() {
    const hasText = promptInput.value.trim() !== '';

    let newMode = 'insert';
    if (STATE.originalPromptBeforeEnhance !== null) {
        newMode = 'revert';
    } else if (hasText || STATE.isEnhancing) {
        newMode = 'enhance';
    }

    _toolbarMode = newMode;
    _applyToolbarMode(newMode);
}

enhancePromptBtn.addEventListener('click', async () => {
    if (STATE.isEnhancing) return;

    // Mode retour : restaurer le prompt original
    if (STATE.originalPromptBeforeEnhance !== null) {
        promptInput.value = STATE.originalPromptBeforeEnhance;
        STATE.originalPromptBeforeEnhance = null;
        promptInput.style.height = 'auto';
        promptInput.style.height = Math.min(promptInput.scrollHeight, 200) + 'px';
        updateEnhanceBtn();
        updateSendButton();
        promptInput.focus();
        return;
    }

    // Mode amélioration
    const text = promptInput.value.trim();
    if (!text) return;

    if (!AUDIO_SETTINGS.enhanceModel) {
        showNoModelAlert('l\'amélioration de prompts', 'enhance-provider');
        return;
    }

    STATE.originalPromptBeforeEnhance = null;
    STATE.isEnhancing = true;
    updateEnhanceBtn();
    const savedText = text;

    // Effet shimmer sur le texte existant en attendant la réponse
    promptInput.classList.add('enhancing');
    promptInput.readOnly = true;
    let firstDelta = true;

    enhancePrompt(
        savedText,
        (delta) => {
            if (firstDelta) {
                promptInput.value = '';
                firstDelta = false;
            }
            promptInput.value += delta;
            promptInput.style.height = 'auto';
            promptInput.style.height = Math.min(promptInput.scrollHeight, 200) + 'px';
        },
        () => {
            promptInput.classList.remove('enhancing');
            promptInput.readOnly = false;
            STATE.originalPromptBeforeEnhance = savedText;
            STATE.isEnhancing = false;
            updateEnhanceBtn();
            updateSendButton();
            promptInput.focus();
        },
        (err) => {
            console.error('Erreur amélioration prompt:', err);
            promptInput.classList.remove('enhancing');
            promptInput.readOnly = false;
            promptInput.value = savedText;
            showModelAlert(err.message || 'Erreur lors de l\'amélioration du prompt.');
            STATE.isEnhancing = false;
            updateEnhanceBtn();
            updateSendButton();
            promptInput.focus();
        },
        !!STATE.currentImageModel
    );
});

// --- Toolbar enhance & save buttons ---
toolbarEnhanceBtn.addEventListener('click', () => {
    enhancePromptBtn.click();
});

toolbarSaveBtn.addEventListener('click', () => {
    const text = promptInput.value.trim();
    if (!text) return;
    openPrModal(null, text);
});

function closeAllMenus(except) {
    document.querySelectorAll('.copy-menu.open').forEach(m => { if (m !== except) m.classList.remove('open'); });
    document.querySelectorAll('.menu-open').forEach(b => b.classList.remove('menu-open'));
}

document.addEventListener('click', () => closeAllMenus());

// --- Catégories (module categories.js) ---
setCategoriesCallbacks({
    customConfirm,
    customAlert,
    refreshConvList
});
initCategories({
    newChatBtn,
    convSearch,
    promptInput
});

// --- Sélecteur de modèle personnalisé ---

const EDITEUR_LABELS = {
    openai: 'OpenAI', anthropic: 'Anthropic', google: 'Google',
    mistral: 'Mistral', perplexity: 'Perplexity',
    deepseek: 'DeepSeek', grok: 'Grok (xAI)', zai: 'Z.ai (GLM)',
    openrouter: 'OpenRouter', samagent: 'SamAgent (Fusion)', ollama: 'Ollama', lmstudio: 'LM Studio'
};
// Mapping slug → libellé pour les fournisseurs réels d'OpenRouter (issus de l'id : "editeur/modele").
// Fallback : title-case du slug si absent de la table.
const OR_MAKER_LABELS = {
    'openai': 'OpenAI', 'anthropic': 'Anthropic', 'google': 'Google',
    'meta-llama': 'Meta', 'mistralai': 'Mistral', 'mistral': 'Mistral',
    'deepseek': 'DeepSeek', 'x-ai': 'xAI', 'qwen': 'Qwen',
    'cohere': 'Cohere', 'perplexity': 'Perplexity', 'nvidia': 'NVIDIA',
    'microsoft': 'Microsoft', 'amazon': 'Amazon', 'z-ai': 'Z.ai',
    'thudm': 'THUDM', 'inflection': 'Inflection', 'liquid': 'Liquid',
    'nous': 'Nous', 'gryphe': 'Gryphe', 'moonshotai': 'Moonshot',
    'inception': 'Inception', 'minimax': 'MiniMax', 'baidu': 'Baidu',
    'tencent': 'Tencent', 'bytedance': 'ByteDance', 'alibaba': 'Alibaba'
};
function _modelMakerLabel(m) {
    if (!m) return '';
    if (m.editeur === 'openrouter' && m.id) {
        const slug = m.id.replace(/^~/, '').split('/')[0] || '';
        if (OR_MAKER_LABELS[slug]) return OR_MAKER_LABELS[slug];
        return slug.split('-').map(w => w ? w.charAt(0).toUpperCase() + w.slice(1) : '').join(' ');
    }
    return EDITEUR_LABELS[m.editeur] || m.editeur || '';
}
const EDITEUR_ORDER = ['openai', 'anthropic', 'google', 'mistral', 'perplexity', 'deepseek', 'grok', 'zai', 'openrouter', 'samagent', 'ollama', 'lmstudio'];
const EDITEUR_ICONS = {
    openai: 'OpenAI.svg', anthropic: 'Anthropic.svg', google: 'Google.svg',
    mistral: 'Mistral.svg', perplexity: 'Perplexity.svg',
    deepseek: 'DeepSeek.svg', grok: 'Grok.svg', zai: 'Z.ai.svg',
    openrouter: 'OpenRouter.svg', samagent: 'SamAgent.svg', ollama: 'Ollama.svg', lmstudio: 'LMStudio.svg'
};
function _editeurGroupHeaderHtml(editeur) {
    const icon = EDITEUR_ICONS[editeur];
    const iconHtml = icon ? `<img class="custom-select-group-icon" src="images/${icon}" alt="">` : '';
    return `<span class="custom-select-group-label">${iconHtml}<span>${escHtml(EDITEUR_LABELS[editeur] || editeur)}</span></span>`;
}
// Providers masqués dans les sélecteurs (géré via le Catalogue pour openrouter)
const HIDDEN_EDITEURS = new Set();

// Un provider est considéré disponible s'il a une clé API renseignée.
// 'system' (TTS natif) ne requiert pas de clé.
// Si la modale Config est ouverte, lit la valeur actuelle du champ (non sauvegardée),
// afin que la liste des modèles reflète immédiatement les saisies de l'utilisateur.
function hasProviderKey(editeur) {
    if (!editeur) return false;
    if (editeur === 'system' || editeur === 'samagent') return true;
    const overlay = document.getElementById('apikeys-modal-overlay');
    if (overlay && overlay.style.display && overlay.style.display !== 'none') {
        const input = document.getElementById('apikey-' + editeur);
        if (input) return !!input.value.trim();
    }
    return !!(API_KEYS && API_KEYS[editeur]);
}

// Tooltip partagé pour les infos modèle
const _tooltip = document.createElement('div');
_tooltip.id = 'custom-select-tooltip';
document.body.appendChild(_tooltip);

// Helpers tooltip ----------------------------------------------------------
const _MODALITY_LABELS = {
    text: 'Texte',
    image: 'Images',
    audio: 'Audio',
    video: 'Vidéo',
    file: 'Fichiers'
};
const _PARAM_LABELS = {
    tools: 'Function calling',
    structured_outputs: 'Mode JSON',
    response_format: 'Mode JSON',
    reasoning: 'Raisonnement',
    web_search_options: 'Recherche web'
};

function _formatContextLength(n) {
    if (!n || typeof n !== 'number') return null;
    if (n >= 1_000_000) return (n / 1_000_000).toFixed(n % 1_000_000 === 0 ? 0 : 1) + 'M';
    if (n >= 1_000) return Math.round(n / 1000) + 'K';
    return String(n);
}

function _formatModalities(arr) {
    if (!arr || !arr.length) return null;
    const labels = arr.map(x => _MODALITY_LABELS[x] || x);
    return [...new Set(labels)].join(', ');
}

function _formatSupportedParams(arr) {
    if (!arr || !arr.length) return null;
    const seen = new Set();
    const out = [];
    for (const p of arr) {
        const lbl = _PARAM_LABELS[p];
        if (lbl && !seen.has(lbl)) { seen.add(lbl); out.push(lbl); }
    }
    return out.length ? out.join(', ') : null;
}

function _formatDefaultParams(dp) {
    if (!dp || typeof dp !== 'object') return null;
    const parts = [];
    if (dp.temperature != null) parts.push(`temp ${dp.temperature}`);
    if (dp.top_p != null) parts.push(`top_p ${dp.top_p}`);
    if (dp.top_k != null) parts.push(`top_k ${dp.top_k}`);
    if (dp.frequency_penalty != null) parts.push(`freq ${dp.frequency_penalty}`);
    if (dp.presence_penalty != null) parts.push(`pres ${dp.presence_penalty}`);
    if (dp.repetition_penalty != null) parts.push(`rep ${dp.repetition_penalty}`);
    return parts.length ? parts.join(', ') : null;
}

function _isModelNew(m) {
    if (!m.created) return false;
    const ageMs = Date.now() - m.created * 1000;
    return ageMs >= 0 && ageMs < 7 * 24 * 3600 * 1000;
}

function _isModelExpiringSoon(m) {
    if (!m.expirationDate) return false;
    const exp = Date.parse(m.expirationDate);
    if (isNaN(exp)) return false;
    return exp - Date.now() < 60 * 24 * 3600 * 1000 && exp > Date.now();
}

function _formatExpirationDateFr(dateStr) {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
}

// Tooltip texte enrichi : description + contexte + modalités + features
function _buildModelTooltip(m) {
    const lines = [];
    if (m.description) lines.push(m.description.trim());
    const ctx = _formatContextLength(m.contextLength);
    if (ctx) lines.push(`Contexte : ${ctx} tokens`);
    const inMod = _formatModalities(m.inputModalities);
    if (inMod) lines.push(`Entrée : ${inMod}`);
    const outMod = _formatModalities(m.outputModalities);
    if (outMod) lines.push(`Sortie : ${outMod}`);
    const params = _formatSupportedParams(m.supportedParameters);
    if (params) lines.push(`Capacités : ${params}`);
    const defaults = _formatDefaultParams(m.defaultParameters);
    if (defaults) lines.push(`Recommandé : ${defaults}`);
    if (m.knowledgeCutoff) lines.push(`Connaissances : ${m.knowledgeCutoff}`);
    if (_isModelExpiringSoon(m)) {
        lines.push(`⚠️ Sera retiré le ${_formatExpirationDateFr(m.expirationDate)}`);
    }
    return lines.join('\n\n');
}

document.addEventListener('mouseover', (e) => {
    const info = e.target.closest('.custom-select-info');
    if (!info) return;
    const text = info.dataset.tooltip;
    if (!text) return;
    _tooltip.textContent = text;
    _tooltip.classList.add('visible');
    const rect = info.getBoundingClientRect();
    const ttRect = _tooltip.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    // Position horizontale : à droite par défaut, à gauche si ça déborde
    let left = rect.right + 8;
    if (left + ttRect.width > vw - 8) {
        left = rect.left - ttRect.width - 8;
    }
    // Position verticale : centrée, clampée pour ne pas sortir
    let top = rect.top + rect.height / 2 - ttRect.height / 2;
    top = Math.max(8, Math.min(top, vh - ttRect.height - 8));
    _tooltip.style.left = left + 'px';
    _tooltip.style.top = top + 'px';
    _tooltip.style.transform = 'none';
});

document.addEventListener('mouseout', (e) => {
    const info = e.target.closest('.custom-select-info');
    if (info) _tooltip.classList.remove('visible');
});

function upgradeToCustomSelect(selectEl) {
    // Idempotence : un upgrade par <select>. Sans ça, tout appel répété ajoute
    // de nouveaux listeners 'click' et 'keydown' sur document qui ne sont jamais
    // retirés (fuite mémoire + handlers en double).
    if (selectEl._customUI) return;

    const container = document.createElement('div');
    container.className = 'custom-select';

    const trigger = document.createElement('div');
    trigger.className = 'custom-select-trigger';

    const triggerIcon = document.createElement('img');
    triggerIcon.className = 'custom-select-trigger-icon';
    triggerIcon.alt = '';
    triggerIcon.style.display = 'none';

    const triggerText = document.createElement('span');
    triggerText.className = 'custom-select-text';
    triggerText.textContent = hasAnyProviderKey() ? 'Aucun' : 'Choisir modèle';

    trigger.appendChild(triggerIcon);
    trigger.appendChild(triggerText);

    const dropdown = document.createElement('div');
    dropdown.className = 'custom-select-dropdown';

    container.appendChild(trigger);
    container.appendChild(dropdown);

    // Insérer avant le <select> et le cacher
    selectEl.parentNode.insertBefore(container, selectEl);
    selectEl.style.display = 'none';

    // Stocker les refs
    selectEl._customValue = '';
    selectEl._customDisabled = false;
    selectEl._customUI = { container, trigger, triggerIcon, triggerText, dropdown };
    selectEl._customModels = []; // sera rempli par populateCustomSelect

    // Intercepter .value
    Object.defineProperty(selectEl, 'value', {
        get() { return selectEl._customValue; },
        set(v) {
            selectEl._customValue = v || '';
            updateTriggerDisplay(selectEl);
            updateActiveOption(selectEl);
        },
        configurable: true
    });

    // Intercepter .disabled
    Object.defineProperty(selectEl, 'disabled', {
        get() { return selectEl._customDisabled; },
        set(v) {
            selectEl._customDisabled = !!v;
            container.classList.toggle('disabled', !!v);
        },
        configurable: true
    });

    // Clic sur le trigger → ouvrir/fermer
    trigger.addEventListener('click', () => {
        if (selectEl._customDisabled) return;
        document.querySelectorAll('.custom-select.open').forEach(el => {
            if (el !== container) el.classList.remove('open');
        });
        container.classList.toggle('open');
    });

    // Clic sur une option
    dropdown.addEventListener('click', (e) => {
        // Lien "Configuration" dans l'état vide
        if (e.target.closest('.custom-select-empty-link')) {
            e.preventDefault();
            container.classList.remove('open');
            openApiKeysModal('apimodeles');
            return;
        }
        const option = e.target.closest('.custom-select-option, .custom-select-option--empty');
        if (!option) return;
        const val = option.dataset.value;
        const prevValue = selectEl._customValue;
        selectEl._customValue = val || '';
        selectEl._prevCustomValue = prevValue;
        updateTriggerDisplay(selectEl);
        updateActiveOption(selectEl);
        container.classList.remove('open');
        selectEl.dispatchEvent(new Event('change'));
    });

    document.addEventListener('click', (e) => {
        if (!container.contains(e.target)) {
            container.classList.remove('open');
        }
    });

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            container.classList.remove('open');
        }
    });
}

function hasAnyProviderKey() {
    return Object.values(API_KEYS || {}).some(v => v && String(v).trim());
}

function updateTriggerDisplay(selectEl) {
    if (!selectEl._customUI) {
        // Sélecteur dans le menu "+" — utiliser #input-hint
        if (typeof updateInputHint === 'function') updateInputHint();
        return;
    }
    const { triggerText, triggerIcon } = selectEl._customUI;
    const val = selectEl._customValue;
    if (!val) {
        triggerText.textContent = hasAnyProviderKey() ? 'Aucun' : 'Choisir modèle';
        if (triggerIcon) {
            triggerIcon.style.display = 'none';
            triggerIcon.removeAttribute('src');
        }
        return;
    }
    const model = selectEl._customModels.find(m => m.id === val);
    triggerText.textContent = model ? model.label : val;
    if (triggerIcon) {
        const icon = model && EDITEUR_ICONS[model.editeur];
        if (icon) {
            triggerIcon.src = `images/${icon}`;
            triggerIcon.style.display = '';
        } else {
            triggerIcon.style.display = 'none';
            triggerIcon.removeAttribute('src');
        }
    }
}

function updateActiveOption(selectEl) {
    if (!selectEl._customUI) return; // Sélecteur dans le menu "+"
    const { dropdown } = selectEl._customUI;
    const val = selectEl._customValue;
    dropdown.querySelectorAll('.custom-select-option, .custom-select-option--empty').forEach(el => {
        el.classList.toggle('active', el.dataset.value === val);
    });
}

function formatImagePriceRange(tarif) {
    const pricing = tarif.imagePricing;
    const values = [];
    if (pricing) {
        if (tarif.editeur === 'openai') {
            for (const q of Object.keys(pricing)) for (const s of Object.keys(pricing[q])) values.push(pricing[q][s]);
        } else if (tarif.editeur === 'google') {
            for (const k of Object.keys(pricing)) values.push(pricing[k]);
        }
    }
    if (values.length === 0) return `$${tarif.imageOutput}`;
    const min = Math.min(...values), max = Math.max(...values);
    if (min === max) return `$${min}`;
    return `$${min}–$${max}`;
}

// Convertit un prix image OR (par token) en chaîne formatée. Source unique de
// vérité pour la convention OR utilisée dans le sélecteur ET dans le catalogue :
// - image-only (outputs = ['image'])     → $/Mpx (ratio 256 px/token)
// - hybride (outputs incluant 'text')    → ≈$/img (ratio 1024 tokens/img à 1K)
function _formatOrImagePriceStr(imageOutput, outputModalities) {
    const outMods = Array.isArray(outputModalities) ? outputModalities : [];
    const isImageOnly = outMods.length === 1 && outMods[0] === 'image';
    if (isImageOnly) {
        const perMpx = imageOutput * (1_000_000 / 256);
        return `≈${_formatImagePrice(perMpx)} /Mpx`;
    }
    const perImg = imageOutput * 1024;
    return `≈${_formatImagePrice(perImg)} /img`;
}

// Construit la chaîne de prix d'un modèle pour le dropdown (sélecteur principal).
// Gère : modèles texte standards, modèles image curatés ($/img direct), modèles OR
// (conversion imageOutput par-token → $/Mpx pour image-only, ≈$/img pour hybrides).
function _formatModelPriceString(m, tarif) {
    if (isLocalEditeur(m.editeur)) return 'Gratuit';
    if (!tarif) return '';
    const parts = [];
    const hasTokenPricing = !!(tarif.inputPer1M || tarif.outputPer1M);
    const hasImagePricing = !!(tarif.imageOutput || tarif.imagePricing);
    if (hasTokenPricing) parts.push(`$${tarif.inputPer1M} → $${tarif.outputPer1M} /M`);
    if (hasImagePricing) {
        if (tarif.editeur === 'openrouter') {
            const meta = IMAGE_MODELS.find(im => im.id === m.id);
            parts.push(_formatOrImagePriceStr(tarif.imageOutput, meta?.outputModalities));
        } else {
            parts.push(`${formatImagePriceRange(tarif)} /img`);
        }
    }
    return parts.join(' · ') || 'Gratuit';
}

function populateCustomSelect(selectEl, models, tarifFn) {
    const { dropdown } = selectEl._customUI;
    selectEl._customModels = models;

    // Grouper par editeur (providers masqués exclus du rendu)
    const groups = {};
    for (const m of models) {
        if (HIDDEN_EDITEURS.has(m.editeur)) continue;
        if (!groups[m.editeur]) groups[m.editeur] = [];
        groups[m.editeur].push(m);
    }

    let html = '<div class="custom-select-option--empty" data-value="">Aucun</div>';

    for (const editeur of EDITEUR_ORDER) {
        if (!groups[editeur]) continue;
        html += `<div class="custom-select-provider">`;
        html += `<div class="custom-select-group">${_editeurGroupHeaderHtml(editeur)}</div>`;
        for (const m of groups[editeur]) {
            const tarif = tarifFn(m.id);
            const priceStr = _formatModelPriceString(m, tarif);
            html += `<div class="custom-select-option" data-value="${escHtml(m.id)}">`;
            html += `<div class="custom-select-option-text">`;
            html += `<span class="custom-select-option-name">${escHtml(m.label)}</span>`;
            if (priceStr) html += `<span class="custom-select-option-price">${escHtml(priceStr)}</span>`;
            html += `</div>`;
            const _tooltipText = _buildModelTooltip(m);
            if (_tooltipText) html += `<span class="custom-select-info" data-tooltip="${escHtml(_tooltipText)}">i</span>`;
            html += `</div>`;
        }
        html += `</div>`;
    }

    dropdown.innerHTML = html;
    selectEl._customValue = '';
    updateTriggerDisplay(selectEl);
}

// --- Filet de sécurité : capture toutes les rejetons non gérées ---
window.addEventListener('unhandledrejection', function(e) {
    console.warn('[cetas] Rejeton non gérée :', e.reason);
    // Notification discrète — non bloquante, disparaît après 4s
    var toast = document.getElementById('update-toast') || document.getElementById('dev-toast');
    if (toast) {
        toast.textContent = 'Une erreur est survenue — voir console';
        toast.style.display = '';
        clearTimeout(toast._timer);
        toast._timer = setTimeout(function() { toast.style.display = 'none'; }, 4000);
    }
});

// --- Initialisation ---
Auth.init().then(() => {
    // Stockage persistant : empêche iOS Safari de vider IndexedDB au hard refresh
    if (navigator.storage && navigator.storage.persist) {
        navigator.storage.persist().catch(function(){});
    }
    // Sync silencieuse des paramètres utilisateur depuis le serveur.
    // Si le thème ou d'autres settings sont restaurés, on les applique immédiatement.
    import('./settings-sync.js').then(async function(m) {
        const n = await m.syncPullSettings();
        if (n > 0) {
            // Des paramètres ont été restaurés depuis le serveur → ré-appliquer le thème
            var saved = localStorage.getItem('minou-theme');
            if (saved && saved !== 'light') applyTheme(saved);
            // Recharger les autres settings dans l'UI si déjà affichée
            if (typeof updateBudgetPreview === 'function') updateBudgetPreview();
        }
    }).catch(function(){});
initConfig().then(async () => {
    // upgradeToCustomSelect + populateUnifiedSelect retirés — sélecteur dans le menu "+"
    // updateTriggerDisplay() utilise maintenant #input-hint
    updateInputHint();

    updateTokenDisplay();
    // Notifie le splash dès que la liste des conversations est prête (lecture
    // de la BD potentiellement coûteuse). Le splash ne se masquera réellement
    // qu'une fois la durée minimale atteinte ET ce signal envoyé.
    refreshConvList().finally(() => {
        // Sync conversations depuis le serveur (multi-appareils)
        // IMPORTANT : fait AVANT __kiroSplashReady pour que les conversations
        // du compte utilisateur (autres appareils) soient visibles dès l'affichage.
        var _syncPromise;
        if (typeof startAutoSync === 'function') {
            _syncPromise = syncPullFromServer().then(function(n) {
                if (n > 0) { refreshConvList(); renderFavList(); }
            }).catch(function(){});
            startAutoSync();
        } else if (typeof syncPullFromServer === 'function') {
            _syncPromise = syncPullFromServer().then(function(n) {
                if (n > 0) { refreshConvList(); renderFavList(); }
            }).catch(function(){});
        } else {
            _syncPromise = Promise.resolve();
        }
        _syncPromise.then(function() {
            renderFavList();
            if (typeof window.__kiroSplashReady === 'function') window.__kiroSplashReady();
        });
    });
    refreshCatBar();
    await importDefaultSystemPrompts();
    refreshSpList();
    refreshPrList();

    // Purger les IDs morts dans minou-last-* (modèles retirés de models.js ou indisponibles).
    if (typeof pruneLastSelectionsOrphans === 'function') pruneLastSelectionsOrphans();

    // Appliquer le dernier modèle utilisé au chargement
    const lastModel = localStorage.getItem('minou-last-model');
    if (lastModel && MODELS.some(m => m.id === lastModel)) {
        modelSelect._customValue = lastModel;
        modelSelect._activeCategory = 'text';
        STATE.currentModel = lastModel;
        updateTriggerDisplay(modelSelect);
        updateEffortMandatory(lastModel);
    }
    // Fallback : si aucun modèle sélectionné, prendre SamAgent N4 par défaut
    if (!STATE.currentModel) {
        const firstAvailable = MODELS.find(m => m.id === 'samagent-n4' && hasProviderKey(m.editeur))
                            || MODELS.find(m => hasProviderKey(m.editeur));
        if (firstAvailable) {
            modelSelect._customValue = firstAvailable.id;
            modelSelect._activeCategory = 'text';
            STATE.currentModel = firstAvailable.id;
            updateTriggerDisplay(modelSelect);
            updateEffortMandatory(firstAvailable.id);
        }
    }
    // Filtrer les réglages image selon le dernier modèle image utilisé (même si LLM sélectionné)
    const lastImageModel = localStorage.getItem('minou-last-image-model');
    updateImageParamsVisibility(getImageModelEditeur(lastImageModel) || '', lastImageModel);
    updateWebSearchBtn();
    if (typeof updateCanvasBtn === 'function') updateCanvasBtn();
    // Restaurer la dernière conversation
    const lastConv = localStorage.getItem('cetas-last-conv');
    if (lastConv) {
        try {
            await loadConversation(lastConv);
        } catch(e) { /* conversation corrompue ou absente */ }
    }
    promptInput.focus();

    // --- Modules de développement (grisés) ---
    document.querySelectorAll('.dev-module-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const toast = document.getElementById('dev-toast');
            if (!toast) return;
            toast.style.display = '';
            // Réinitialiser l'animation
            toast.style.animation = 'none';
            void toast.offsetWidth;
            toast.style.animation = '';
            clearTimeout(toast._timeout);
            toast._timeout = setTimeout(() => { toast.style.display = 'none'; }, 2000);
        });
    });

    // --- Avatar utilisateur + menu dropdown ---
    const user = Auth.getCurrentUser();
    const avatarInitials = document.getElementById('user-avatar-initials');
    if (avatarInitials && user) {
        const name = user.username || '';
        avatarInitials.textContent = name.substring(0, 2).toUpperCase();
    }

    const avatarBtn = document.getElementById('user-avatar-btn');
    const userMenuDropdown = document.getElementById('user-menu-dropdown');
    if (avatarBtn && userMenuDropdown) {
        avatarBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            const isOpen = userMenuDropdown.style.display === 'flex';
            if (!isOpen) {
                // Rendre visible temporairement pour mesurer la hauteur
                userMenuDropdown.style.visibility = 'hidden';
                userMenuDropdown.style.display = 'flex';
                const rect = avatarBtn.getBoundingClientRect();
                const h = userMenuDropdown.offsetHeight;
                userMenuDropdown.style.visibility = '';
                userMenuDropdown.style.left = rect.left + 'px';
                userMenuDropdown.style.top = (rect.top - h - 8) + 'px';
            } else {
                userMenuDropdown.style.display = 'none';
            }
        });
        document.addEventListener('click', (e) => {
            if (!avatarBtn.contains(e.target) && !userMenuDropdown.contains(e.target)) {
                userMenuDropdown.style.display = 'none';
            }
        });
    }

    // --- Gestion de la déconnexion ---
    const logoutBtn = document.getElementById('logout-btn');
    if (logoutBtn) {
        logoutBtn.style.display = '';
        logoutBtn.addEventListener('click', () => { Auth.logout(); });
    }

    // --- Gestion des utilisateurs (admin) ---
    initUserManagement();

    // Injection des callbacks pour les modules extraits
    setFavoritesCallbacks(loadConversation, refreshConvList);

    // Injection des callbacks Phase 2
    setWebSearchAlignCallback(alignInputHint);
    initExportHandlers();
    initBudget();

    // --- Migration panneau droit → Configuration (onglet Conversation) ---
    initConversationPanel();

    // --- Menu "+" (Plus d'options) ---
    initPlusMenu();
});
});

// (coffre-fort retiré — sera remplacé par une nouvelle logique)

// --- Remplir le sélecteur de modèles (unifié avec onglets) ---

// Catégorie active dans le sélecteur
modelSelect._activeCategory = 'text';

function _buildModelsHtml(models, tarifFn) {
    const _prefs = loadCatalogPrefs();
    const _disabled = new Set(_prefs.disabled || []);
    const _orEnabled = new Set(_prefs.orEnabled || []);
    const filtered = models.filter(m => {
        if (HIDDEN_EDITEURS.has(m.editeur)) return false;
        if (m.editeur === 'openrouter') return _orEnabled.has(m.id) && hasProviderKey('openrouter');
        return hasProviderKey(m.editeur) && !_disabled.has(m.id);
    });
    if (filtered.length === 0) {
        return `<div class="custom-select-empty-message">Pour voir les modèles disponibles, renseignez vos clés API dans <a href="#" class="custom-select-empty-link" id="custom-select-empty-link">Configuration</a>.</div>`;
    }
    const groups = {};
    for (const m of filtered) {
        if (!groups[m.editeur]) groups[m.editeur] = [];
        groups[m.editeur].push(m);
    }
    let html = '';
    for (const editeur of EDITEUR_ORDER) {
        if (!groups[editeur]) continue;
        html += `<div class="custom-select-provider">`;
        html += `<div class="custom-select-group">${_editeurGroupHeaderHtml(editeur)}</div>`;
        for (const m of groups[editeur]) {
            const tarif = tarifFn(m.id);
            const priceStr = _formatModelPriceString(m, tarif);
            html += `<div class="custom-select-option" data-value="${escHtml(m.id)}">`;
            html += `<div class="custom-select-option-text">`;
            html += `<span class="custom-select-option-name">${escHtml(m.label)}</span>`;
            if (priceStr) html += `<span class="custom-select-option-price">${escHtml(priceStr)}</span>`;
            html += `</div>`;
            const _tooltipText = _buildModelTooltip(m);
            if (_tooltipText) html += `<span class="custom-select-info" data-tooltip="${escHtml(_tooltipText)}">i</span>`;
            html += `</div>`;
        }
        html += `</div>`;
    }
    return html;
}

function _switchTab(tab, autoSelect) {
    modelSelect._activeCategory = tab;

    // Sélecteur dans le menu "+" — pas de _customUI à mettre à jour
    if (modelSelect._customUI) {
        const tabs = modelSelect._customUI.dropdown.querySelectorAll('.custom-select-tab');
        tabs.forEach(t => t.classList.toggle('active', t.dataset.tab === tab));
    }

    let models;
    if (tab === 'text') {
        models = MODELS;
    } else if (tab === 'image') {
        models = IMAGE_MODELS;
    } else {
        models = SEARCH_MODELS;
    }
    modelSelect._customModels = models;

    // Mettre à jour l'UI du dropdown custom si présent
    if (modelSelect._customUI) {
        const content = modelSelect._customUI.dropdown.querySelector('.custom-select-tab-content');
        content.innerHTML = _buildModelsHtml(models, tab === 'text' ? getTarif : tab === 'image' ? getImageTarif : getSearchTarif);
    }

    // Auto-sélectionner le dernier modèle utilisé pour cet onglet
    if (autoSelect) {
        const lsKey = tab === 'text' ? 'minou-last-model' : tab === 'image' ? 'minou-last-image-model' : 'minou-last-search-model';
        let lastVal = localStorage.getItem(lsKey);
        if (lastVal) {
            const modelObj = models.find(m => m.id === lastVal);
            const isValid = tab === 'text' ? true
                : tab === 'image' ? !!getImageModelEditeur(lastVal)
                : !!getSearchModelEditeur(lastVal);
            if (!isValid || !modelObj || !hasProviderKey(modelObj.editeur)) {
                if (!isValid) localStorage.removeItem(lsKey);
                lastVal = null;
            }
        }
        const _sp = loadCatalogPrefs(); const _sd = new Set(_sp.disabled||[]); const _soe = new Set(_sp.orEnabled||[]);
        const available = models.filter(m => {
            if (HIDDEN_EDITEURS.has(m.editeur)) return false;
            if (m.editeur === 'openrouter') return _soe.has(m.id) && hasProviderKey('openrouter');
            return hasProviderKey(m.editeur) && !_sd.has(m.id);
        });
        const modelId = lastVal || (available.length ? available[0].id : '');
        if (modelId) {
            modelSelect._customValue = modelId;
            updateTriggerDisplay(modelSelect);
            updateActiveOption(modelSelect);
            _applyModelSelection(tab, modelId);
        } else {
            modelSelect._customValue = '';
            _applyModelSelection(tab, '');
            updateTriggerDisplay(modelSelect);
            updateActiveOption(modelSelect);
        }
    } else {
        updateActiveOption(modelSelect);
    }
}

function _applyModelSelection(tab, val) {
    // Valider que le modèle appartient bien au type d'onglet sélectionné
    if (val) {
        if (tab === 'image' && !getImageModelEditeur(val)) {
            console.warn(`Modèle "${val}" ignoré : ce n'est pas un modèle image.`);
            return;
        }
        if (tab === 'search' && !getSearchModelEditeur(val)) {
            console.warn(`Modèle "${val}" ignoré : ce n'est pas un modèle de recherche.`);
            return;
        }
    }
    const prevModel = STATE.currentModel || STATE.currentImageModel || STATE.currentSearchModel;
    if (tab === 'text') {
        STATE.currentModel = val || null;
        STATE.currentImageModel = null;
        STATE.currentSearchModel = null;
        if (val) localStorage.setItem('minou-last-model', val);
        updateEffortMandatory(val);
        setRightPanelTab('general');
    } else if (tab === 'image') {
        STATE.currentImageModel = val || null;
        STATE.currentModel = null;
        STATE.currentSearchModel = null;
        if (val) localStorage.setItem('minou-last-image-model', val);
        updateImageParamsVisibility(getImageModelEditeur(val) || '', val);
        setRightPanelTab('image');
    } else if (tab === 'search') {
        STATE.currentSearchModel = val || null;
        STATE.currentModel = null;
        STATE.currentImageModel = null;
        if (val) localStorage.setItem('minou-last-search-model', val);
        setRightPanelTab('general');
    }
    const newModel = STATE.currentModel || STATE.currentImageModel || STATE.currentSearchModel;
    if (STATE.conversationStarted && prevModel && newModel && prevModel !== newModel) {
        addModelSwitch(prevModel, newModel);
    }
    updateTokenDisplay();
    updateWebSearchBtn();
    if (typeof updateCanvasBtn === 'function') updateCanvasBtn();
}

function populateUnifiedSelect() {
    // Sélecteur dans le menu "+" — rafraîchir la liste
    if (modelSelect._customUI) {
        const { dropdown } = modelSelect._customUI;
        const tabsHtml = `
            <div class="custom-select-tabs">
                <div class="custom-select-tab active" data-tab="text">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7V4h16v3"/><path d="M9 20h6"/><path d="M12 4v16"/></svg>
                    Texte
                </div>
                <div class="custom-select-tab" data-tab="image">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg>
                    Image
                </div>
                <div class="custom-select-tab" data-tab="search">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>
                    Recherche
                </div>
            </div>
            <div class="custom-select-tab-content"></div>
        `;
        dropdown.innerHTML = tabsHtml;
        dropdown.querySelectorAll('.custom-select-tab').forEach(tab => {
            tab.addEventListener('click', (e) => {
                e.stopPropagation();
                _switchTab(tab.dataset.tab, true);
            });
        });
        modelSelect._customModels = MODELS;
        const content = dropdown.querySelector('.custom-select-tab-content');
        content.innerHTML = _buildModelsHtml(MODELS, getTarif);
    }
    // Mettre à jour le menu "+" et le hint
    if (typeof populatePlusModels === 'function') populatePlusModels('text');
    updateInputHint();
}

function populateModelSelect() {
    const prevModel = STATE.currentModel || STATE.currentImageModel || STATE.currentSearchModel;
    const prevTab = modelSelect._activeCategory || 'text';

    // Mettre à jour le custom-select (si présent) + le menu "+"
    if (modelSelect._customUI) {
        populateUnifiedSelect();
        if (prevModel) {
            const isImg = IMAGE_MODELS.some(m => m.id === prevModel);
            const isSrch = SEARCH_MODELS.some(m => m.id === prevModel);
            if (isImg) {
                _switchTab('image', false);
            } else if (isSrch) {
                _switchTab('search', false);
            } else {
                _switchTab('text', false);
            }
            modelSelect._customValue = prevModel;
            updateTriggerDisplay(modelSelect);
            updateActiveOption(modelSelect);
        } else {
            modelSelect._customValue = '';
            updateTriggerDisplay(modelSelect);
        }
    } else {
        // Sélecteur dans le menu "+" — rafraîchir l'onglet actif
        const tab = document.querySelector('#plus-model-tabs .plus-model-tab.active');
        if (tab && typeof populatePlusModels === 'function') populatePlusModels(tab.dataset.tab);
        updateInputHint();
    }
}

// --- Sélecteurs mutuellement exclusifs ---
function checkApiKeyForModel(modelId, lookupFn) {
    const editeur = lookupFn(modelId);
    if (editeur && !API_KEYS[editeur] && editeur !== 'samagent') {
        if (isLocalEditeur(editeur)) {
            const name = editeur === 'ollama' ? 'Ollama' : 'LM Studio';
            showModelAlert(`URL du serveur ${name} manquante. Renseignez-la dans Configuration.`);
        } else {
            showModelAlert(`Clé API ${editeur} manquante. Renseignez-la dans Configuration.`);
        }
        return false;
    }
    return true;
}

modelSelect.addEventListener('change', () => {
    const tab = modelSelect._activeCategory || 'text';
    const val = modelSelect.value;

    // Validation clé API
    let lookupFn;
    if (tab === 'text') lookupFn = getModelEditeur;
    else if (tab === 'image') lookupFn = getImageModelEditeur;
    else lookupFn = getSearchModelEditeur;

    if (val && !checkApiKeyForModel(val, lookupFn)) {
        modelSelect._customValue = modelSelect._prevCustomValue || '';
        updateTriggerDisplay(modelSelect);
        updateActiveOption(modelSelect);
        return;
    }

    _applyModelSelection(tab, val);
});


// --- Auto-resize du textarea ---
promptInput.addEventListener('input', () => {
    promptInput.style.height = 'auto';
    promptInput.style.height = Math.min(promptInput.scrollHeight, 200) + 'px';
    updateSendButton();
    // Réinitialiser l'état d'amélioration si l'utilisateur modifie manuellement le texte
    if (STATE.originalPromptBeforeEnhance !== null && !STATE.isEnhancing) {
        STATE.originalPromptBeforeEnhance = null;
        updateEnhanceBtn();
    }
    if (!STATE.isEnhancing) updateEnhanceBtn();
});

// --- Activer/désactiver le bouton OK ---
const micIconDefaultSaved = micBtn.innerHTML;
const micIconStopStreaming = '<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" stroke="none"><rect x="6" y="6" width="12" height="12" rx="2"/></svg>';

function updateSendButton() {
    if (STATE.isStreaming) {
        sendBtn.disabled = false;
        sendBtn.classList.add('stop-mode');
        // Micro → bouton stop pendant le streaming (sauf si en enregistrement)
        if (!micBtn.classList.contains('recording')) {
            micBtn.style.display = '';
            micBtn.innerHTML = micIconStopStreaming;
            micBtn.classList.add('stop-mode');
            micBtn.title = 'Arrêter la génération';
        }
    } else {
        const hasText = promptInput.value.trim() !== '';
        const hasImages = STATE.pendingImages.length > 0;
        const hasFiles = STATE.pendingFiles.length > 0;
        const isLoadingFiles = STATE.pendingLoadingFiles.length > 0;
        sendBtn.disabled = isLoadingFiles || (!hasText && !hasImages && !hasFiles);
        sendBtn.title = isLoadingFiles
            ? 'Patientez : un ou plusieurs fichiers sont en cours de chargement…'
            : 'Envoyer (Entrée)';
        sendBtn.classList.toggle('loading-attachments', isLoadingFiles);
        sendBtn.classList.remove('stop-mode');
        // Restaurer l'icône micro
        if (micBtn.classList.contains('stop-mode')) {
            micBtn.innerHTML = micIconDefaultSaved;
            micBtn.classList.remove('stop-mode');
            micBtn.title = 'Dicter';
        }
    }
    // Mettre à jour l'état visuel du bouton pièce jointe
    attachBtn.classList.toggle('has-files', STATE.pendingImages.length > 0 || STATE.pendingFiles.length > 0);
    updateEnhanceBtn();
}

// --- Entrée pour envoyer ---
sendBtn.title = 'Envoyer (Entrée)';
const inputHint = document.getElementById('input-hint');
if (inputHint) {
    inputHint.textContent = 'MAJ (Shift) + Entrée pour un saut de ligne';
}

// Centrer le hint sur le même axe visuel que les boutons centraux de la ligne 2 :
// le milieu entre le bord droit du groupe gauche (icônes) et le bord gauche du groupe droit (micro).
function alignInputHint() {
    if (!inputHint) return;
    inputHint.style.paddingLeft = '0';
    inputHint.style.paddingRight = '0';
    const row = document.querySelector('.input-row');
    const left = document.querySelector('.input-line-2-left');
    const right = document.querySelector('.input-line-2-right');
    if (!row || !left || !right) return;
    const rowRect = row.getBoundingClientRect();
    const leftRect = left.getBoundingClientRect();
    const rightRect = right.getBoundingClientRect();
    // Padding = écart entre le bord intérieur du groupe et le bord du row,
    // ce qui aligne le centre du hint sur le centre de la zone libre.
    const leftPad = leftRect.right - rowRect.left;
    const rightPad = rowRect.right - rightRect.left;
    inputHint.style.paddingLeft = Math.max(0, leftPad) + 'px';
    inputHint.style.paddingRight = Math.max(0, rightPad) + 'px';
}
setTimeout(alignInputHint, 100);
window.addEventListener('resize', alignInputHint);
updatePromptToolbar();

// Capturer la position du clic pour positionner "Insérer un prompt" au-dessus du curseur
let _lastClickX = null;
let _lastClickY = null;

promptInput.addEventListener('mousedown', (e) => {
    const container = promptInput.closest('.input-content');
    if (container) {
        const rect = container.getBoundingClientRect();
        _lastClickX = e.clientX - rect.left;
        _lastClickY = e.clientY - rect.top;
    }
    // Toujours afficher le bouton "Insérer un prompt" flottant au clic dans le textarea
    setTimeout(() => showInsertBtn(), 0);
});

promptInput.addEventListener('input', () => {
    // Cacher le bouton insert flottant dès que l'utilisateur tape
    if (_insertBtnVisible) hideInsertBtn();
    // Mettre à jour la toolbar (insert statique ↔ enhance/save)
    updatePromptToolbar();
});

promptInput.addEventListener('focus', () => {
    updatePromptToolbar();
    if (window.innerWidth < 768) setTimeout(() => scrollToBottom(true), 300);
});
promptInput.addEventListener('blur', () => {
    // Petit délai pour permettre le clic sur un bouton toolbar / picker avant de masquer
    setTimeout(() => {
        const line2 = document.querySelector('.input-line-2');
        const isOnToolbar = line2 && line2.contains(document.activeElement);
        const isOnInsertBtn = toolbarInsertBtn.contains(document.activeElement);
        const isPickerOpen = promptPickerDropdownWrapper.style.display === '';
        if (isOnToolbar || isOnInsertBtn || isPickerOpen) {
            return;
        }
        hideInsertBtn();
        updatePromptToolbar();
    }, 150);
});

promptInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
        if (e.shiftKey) {
            // Maj+Entrée = saut de ligne
            e.preventDefault();
            const start = promptInput.selectionStart;
            const end = promptInput.selectionEnd;
            promptInput.value = promptInput.value.substring(0, start) + '\n' + promptInput.value.substring(end);
            promptInput.selectionStart = promptInput.selectionEnd = start + 1;
            promptInput.style.height = 'auto';
            promptInput.style.height = Math.min(promptInput.scrollHeight, 200) + 'px';
            promptInput.dispatchEvent(new Event('input'));
        } else {
            // Entrée seule = envoyer
            e.preventDefault();
            if (!STATE.isStreaming && !sendBtn.disabled) sendMessage();
        }
    }
});

// --- Clic sur OK / Stop ---
sendBtn.addEventListener('click', () => {
    if (STATE.isStreaming) {
        if (STATE.currentAbortController) STATE.currentAbortController.abort();
        if (STATE.conversationId) STATE._activeStreams.delete(STATE.conversationId);
        STATE.isStreaming = false;
        if (window.Ocean?.setPaused) window.Ocean.setPaused(false);
        STATE.currentAbortController = null;
        updateSendButton();
    } else {
        if (!sendBtn.disabled) sendMessage();
    }
});

// --- Nouvelle conversation ---
newChatBtn.addEventListener('click', () => {
    // Ne pas abandonner les streams en cours : ils continueront en arrière-plan.
    saveConversation();
    resetConversation();
    refreshConvList();
});

function showEmptyPlaceholder() {
    const existing = document.getElementById('empty-chat-placeholder');
    if (existing) { existing.style.display = ''; updateEmptyChatCategory(); return; }
    const ph = document.createElement('div');
    ph.id = 'empty-chat-placeholder';
    ph.className = 'empty-chat-placeholder';
    ph.innerHTML = '<img src="images/cetas3.png" alt="Cetas" class="empty-chat-logo"><p class="empty-chat-text">Sélectionnez une conversation ou démarrez-en une nouvelle en saisissant votre message ci-dessous.</p><div id="empty-chat-category" class="empty-chat-category" style="display:none"></div>';
    chatContainer.appendChild(ph);
    updateEmptyChatCategory();
}

function hideEmptyPlaceholder() {
    const ph = document.getElementById('empty-chat-placeholder');
    if (ph) ph.style.display = 'none';
}

function resetConversation() {
    STATE.conversationHistory = [];
    chatContainer.innerHTML = '';
    showEmptyPlaceholder();
    promptInput.value = '';
    promptInput.style.height = 'auto';
    // La nouvelle conversation n'a pas de stream — réinitialiser l'état visible.
    STATE.isStreaming = false;
    STATE.currentAbortController = null;
    STATE.totalInputTokens = 0;
    STATE.totalOutputTokens = 0;
    STATE.totalCost = 0;
    STATE.totalImageCost = 0;
    STATE.totalAudioCost = 0;
    STATE.totalTitleCost = 0;
    STATE.costByModel = {};
    STATE.conversationId = null;
    localStorage.removeItem('cetas-last-conv');
    STATE.conversationStartTime = null;
    STATE.conversationLastActivity = null;
    STATE.conversationTitle = null;
    STATE.firstPrompt = null;
    STATE.conversationStarted = false;
    STATE.currentSystemPrompt = null;
    
    // Restaurer le dernier modèle utilisé (uniquement s'il s'agit bien d'un modèle texte)
    const lastModel = localStorage.getItem('minou-last-model');
    const isTextModel = lastModel && MODELS.some(m => m.id === lastModel);
    if (isTextModel) {
        STATE.currentModel = lastModel;
    } else {
        STATE.currentModel = null;
    }

    STATE.currentImageModel = null;
    STATE.currentSearchModel = null;
    STATE.currentConversationCategory = STATE.activeCategoryId || null;
    STATE.pendingImages = [];
    STATE.pendingFiles = [];
    cancelAllPendingLoads();
    STATE.originalPromptBeforeEnhance = null;
    STATE.isEnhancing = false;
    attachPreview.innerHTML = '';
    modelSelect.disabled = false;
    _switchTab('text', false);
    modelSelect._customValue = isTextModel ? lastModel : '';
    updateTriggerDisplay(modelSelect);
    updateActiveOption(modelSelect);
    updateEffortMandatory(isTextModel ? lastModel : null);
    setRightPanelTab('general');
    spSelect.disabled = false;
    spSelect.value = '';
    spTextarea.value = '';
    updateTokenDisplay();
    updateSendButton();
    updateWebSearchBtn();
    if (window.Canvas) window.Canvas.reset();
    updateCanvasBtn();
    updateEnhanceBtn();
    highlightActiveConv();
    updateExportMdBtn();
    updateChatHeader();
    updateActiveCatColor();
    promptInput.focus();
}

// --- Custom Dialog (alert / confirm) ---
const _dlgOverlay = document.getElementById('custom-dialog-overlay');
const _dlgIcon = document.getElementById('custom-dialog-icon');
const _dlgMessage = document.getElementById('custom-dialog-message');
const _dlgActions = document.getElementById('custom-dialog-actions');
const _dlgOk = document.getElementById('custom-dialog-ok');
const _dlgCancel = document.getElementById('custom-dialog-cancel');

// Icônes SVG des popups d'alerte. Clés courtes utilisées dans les call sites
// (`icon: 'warning'`, `icon: 'delete'`, ...) à la place des emojis. Style
// Feather, 28x28, currentColor pour s'adapter au thème.
const _DIALOG_ICONS = {
    warning: '<svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>',
    error: '<svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>',
    delete: '<svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2"/></svg>',
    wait: '<svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>',
    mic: '<svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="2" width="6" height="12" rx="3"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>',
    import: '<svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>',
    revert: '<svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 14 4 9 9 4"/><path d="M20 20v-7a4 4 0 0 0-4-4H4"/></svg>',
    save: '<svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>'
};

function _showDialog(message, { icon = 'warning', confirm = false, danger = false, okLabel = 'OK', cancelLabel = 'Annuler', html = false, checkboxLabel = '', suppressKey = '' } = {}) {
    return new Promise(resolve => {
        // Trois formes acceptées pour `icon` : clé du registre `_DIALOG_ICONS`,
        // SVG inline brut, ou emoji legacy (rétro-compat).
        if (_DIALOG_ICONS[icon]) {
            _dlgIcon.innerHTML = _DIALOG_ICONS[icon];
        } else if (typeof icon === 'string' && icon.trim().startsWith('<')) {
            _dlgIcon.innerHTML = icon;
        } else {
            _dlgIcon.textContent = icon;
        }
        if (html) { _dlgMessage.innerHTML = message; } else { _dlgMessage.textContent = message; }
        _dlgOk.textContent = okLabel;
        _dlgCancel.textContent = cancelLabel;
        _dlgCancel.style.display = confirm ? '' : 'none';
        _dlgOk.className = 'custom-dialog-btn custom-dialog-btn-ok' + (danger ? ' danger' : '');
        _dlgOverlay.style.display = '';

        let cbDiv = null;
        if (checkboxLabel) {
            cbDiv = document.createElement('div');
            cbDiv.className = 'custom-dialog-checkbox';
            const cbLabel = document.createElement('label');
            const cbInput = document.createElement('input');
            cbInput.type = 'checkbox';
            cbInput.id = 'custom-dialog-cb';
            cbLabel.appendChild(cbInput);
            cbLabel.appendChild(document.createTextNode(' ' + checkboxLabel));
            cbDiv.appendChild(cbLabel);
            _dlgActions.parentNode.insertBefore(cbDiv, _dlgActions);
        }

        function cleanup() {
            if (cbDiv) cbDiv.remove();
            _dlgOk.removeEventListener('click', onOk);
            _dlgCancel.removeEventListener('click', onCancel);
            _dlgOverlay.removeEventListener('click', onBg);
            _dlgOverlay.style.display = 'none';
        }
        function onOk() {
            if (cbDiv && suppressKey) {
                const cb = cbDiv.querySelector('input');
                if (cb && cb.checked) localStorage.setItem(suppressKey, Date.now().toString());
            }
            cleanup(); resolve(true);
        }
        function onCancel() { cleanup(); resolve(false); }
        function onBg(e) { if (e.target === _dlgOverlay) { cleanup(); resolve(confirm ? false : true); } }

        _dlgOk.addEventListener('click', onOk);
        _dlgCancel.addEventListener('click', onCancel);
        _dlgOverlay.addEventListener('click', onBg);
    });
}

function customAlert(message, icon = 'warning') {
    return _showDialog(message, { icon, confirm: false });
}

function customConfirm(message, { icon = 'warning', danger = false, okLabel = 'Confirmer', cancelLabel = 'Annuler', checkboxLabel = '', suppressKey = '' } = {}) {
    return _showDialog(message, { icon, confirm: true, danger, okLabel, cancelLabel, checkboxLabel, suppressKey });
}

// Erreurs Cetas déjà rédigées en français, à afficher telles quelles sans préfixe "Erreur :".
function _isFriendlyCetasError(msg) {
    if (!msg) return false;
    return /injoignable|requise\. Renseignez|Modèle introuvable|catalogue, sélectionnez|Connexion à .* impossible/i.test(String(msg));
}

function showErrorAlert(explanation, rawError) {
    if (!explanation) {
        if (_isFriendlyCetasError(rawError)) return customAlert(rawError, 'error');
        return customAlert(`Erreur : ${rawError}`, 'error');
    }
    const escaped = rawError.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
    const parsedExplanation = typeof marked !== 'undefined' ? marked.parse(explanation) : explanation.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/\n/g,'<br>');
    const html = `<div class="error-alert-header"><strong>Une erreur est survenue</strong><br>Analyse de l'erreur par l'IA :</div><div class="error-alert-body">${parsedExplanation}</div><details class="error-raw-details"><summary>Voir les détails de l'erreur</summary><pre class="error-raw-pre">${escaped}</pre></details>`;
    return _showDialog(html, { icon: 'error', confirm: false, html: true });
}

// --- Alerte modèle manquant ---
let modelAlertTimer = null;
function showMissingModelBanner(missingId) {
    const safe = (missingId || '').toString();
    showModelAlert(`Le modèle d'origine "${safe}" n'est plus disponible, sélectionnez-en un autre pour continuer.`);
    console.info(`[Cetas] Modèle "${safe}" introuvable lors du chargement de la conversation, sélection réinitialisée.`);
}

const MODEL_ALERT_DEFAULT = 'Veuillez choisir un modèle (texte ou image) avant d\'envoyer.';

function _hideModelAlert() {
    const el = document.getElementById('model-alert');
    if (!el) return;
    el.style.display = 'none';
    const txt = document.getElementById('model-alert-text');
    if (txt) txt.textContent = MODEL_ALERT_DEFAULT;
}

function showModelAlert(msg, durationMs = 12000) {
    const el = document.getElementById('model-alert');
    const txt = document.getElementById('model-alert-text');
    if (!el || !txt) return;
    if (msg) txt.textContent = msg;
    el.style.display = '';
    if (modelAlertTimer) clearTimeout(modelAlertTimer);
    modelAlertTimer = setTimeout(_hideModelAlert, durationMs);
}

document.getElementById('model-alert-close')?.addEventListener('click', () => {
    if (modelAlertTimer) clearTimeout(modelAlertTimer);
    _hideModelAlert();
});

function showNoModelAlert(feature, fieldId) {
    const overlay = document.getElementById('no-model-alert-overlay');
    const text = document.getElementById('no-model-alert-text');
    const feat = escHtml(feature);
    if (fieldId) {
        text.innerHTML = `Pour utiliser « ${feat} », veuillez sélectionner un modèle dans <a href="#" id="no-model-alert-link" class="no-model-alert-link">Configuration &gt; Modèles</a>.`;
        document.getElementById('no-model-alert-link').addEventListener('click', (e) => {
            e.preventDefault();
            overlay.style.display = 'none';
            openApiKeysModal('models');
            setTimeout(() => {
                const field = document.getElementById(fieldId);
                if (!field) return;
                const row = field.closest('.audio-setting-row') || field;
                row.scrollIntoView({ behavior: 'smooth', block: 'center' });
                row.classList.remove('config-field-highlight');
                void row.offsetWidth;
                row.classList.add('config-field-highlight');
                setTimeout(() => row.classList.remove('config-field-highlight'), 2200);
                try { field.focus({ preventScroll: true }); } catch {}
            }, 120);
        }, { once: true });
    } else {
        text.textContent = `Pour utiliser « ${feature} », veuillez sélectionner un modèle dans Configuration > Modèles.`;
    }
    overlay.style.display = '';
}

document.getElementById('no-model-alert-close').addEventListener('click', () => {
    document.getElementById('no-model-alert-overlay').style.display = 'none';
});
document.getElementById('no-model-alert-overlay').addEventListener('click', (e) => {
    if (e.target === e.currentTarget) e.currentTarget.style.display = 'none';
});

// --- Générer l'identifiant de conversation ---
function generateConversationId(prompt) {
    const now = new Date();
    const date = now.getFullYear() + '-'
        + String(now.getMonth() + 1).padStart(2, '0') + '-'
        + String(now.getDate()).padStart(2, '0') + ' '
        + String(now.getHours()).padStart(2, '0') + '-'
        + String(now.getMinutes()).padStart(2, '0') + '-'
        + String(now.getSeconds()).padStart(2, '0');
    const prefix = prompt.substring(0, 10).replace(/[^a-zA-Z0-9àâéèêëïîôùûüçÀÂÉÈÊËÏÎÔÙÛÜÇ ]/g, '_');
    // Suffixe aléatoire pour éviter toute collision entre deux conversations créées
    // dans la même seconde (ex. multi-streams avec même préfixe de prompt).
    const rand = Math.random().toString(36).slice(2, 6);
    return `${prefix} ${date}-${rand}`;
}

// --- Mettre à jour l'affichage tokens et coût ---
function updateTokenDisplay() {
    const tokenBar = document.getElementById('token-bar');
    const hasMessages = STATE.conversationHistory.length > 0;
    tokenInfo.style.display = hasMessages ? '' : 'none';
    costInfo.style.display = hasMessages ? '' : 'none';

    tokenInfo.textContent = `↑ ${STATE.totalInputTokens.toLocaleString('fr-FR')} ↓ ${STATE.totalOutputTokens.toLocaleString('fr-FR')} Tokens`;

    const displayCost = STATE.totalCost + STATE.totalImageCost + STATE.totalAudioCost + STATE.totalTitleCost;
    if (displayCost > 0) {
        costInfo.textContent = `Coût estimé : $${displayCost.toFixed(4)}`;
    } else {
        costInfo.textContent = 'Coût estimé : —';
    }
}

// --- Sauvegarder la conversation dans un fichier JSON ---
// Réattache un stream texte en cours à un nouvel assistantDiv créé dans le DOM,
// pour que l'utilisateur voie la suite du streaming après être revenu sur la conversation.
function _rebindStreamToVisibleDOM(ctx) {
    if (!ctx) return;
    const newDiv = addMessage('assistant', '');
    newDiv.classList.add('streaming');
    ctx.assistantDiv = newDiv;
    if (ctx.type === 'text') {
        // Seed le renderer avec ce qui a déjà été reçu pour qu'il poursuive l'accumulation
        // sans repartir de zéro (sinon les nouveaux chunks écraseraient le texte pré-rendu).
        ctx.sr = createStreamRenderer(newDiv, () => newDiv.querySelector('.message-text'), ctx.accumulatedText);
        if (ctx.accumulatedText) {
            const textEl = newDiv.querySelector('.message-text');
            if (textEl) textEl.innerHTML = marked.parse(ctx.accumulatedText);
        }
        if (ctx.accumulatedThinking) {
            const details = document.createElement('details');
            details.className = 'thinking-block';
            details.open = true;
            const summary = document.createElement('summary');
            summary.textContent = 'Raisonnement';
            details.appendChild(summary);
            const tc = document.createElement('div');
            tc.className = 'thinking-content';
            tc.innerHTML = marked.parse(ctx.accumulatedThinking);
            details.appendChild(tc);
            newDiv.insertBefore(details, newDiv.firstChild);
            ctx.thinkSr = createStreamRenderer(newDiv, () => newDiv.querySelector('.thinking-content'), ctx.accumulatedThinking);
        } else {
            ctx.thinkSr = null;
        }
    } else if (ctx.type === 'image') {
        // Image : pas de streaming progressif possible — afficher un message d'attente
        const textEl = newDiv.querySelector('.message-text');
        if (textEl) textEl.textContent = 'Génération de l\'image en cours…';
    }
    scrollToBottom(true);
}

// Reconstruit la structure interne attendue par `formatConversationFile` à partir
// du JSON disque (qui utilise les noms publics : `titre`, `tokens_entree`, …) en
// appliquant des overrides (titre/lastActivity) et des deltas additifs (tokens,
// coûts par modèle). Centralisé pour `_saveConvById` et `_applyTitle`.
function _mergeConvData(data, convId, { overrides = {}, deltas = null } = {}) {
    const merged = {
        id: data.id || convId,
        title: data.titre || data.title || null,
        model: data.modele || data.model || null,
        startTime: data.date || data.startTime || null,
        lastActivity: new Date().toISOString(),
        totalInputTokens: (data.tokens_entree || 0) + (deltas?.tokensIn || 0),
        totalOutputTokens: (data.tokens_sortie || 0) + (deltas?.tokensOut || 0),
        totalCost: (data.totalCost || 0) + (deltas?.cost || 0),
        totalImageCost: (data.cout_images || 0) + (deltas?.imageCost || 0),
        totalAudioCost: data.cout_audio || 0,
        totalTitleCost: (data.cout_titre || 0) + (overrides.titleCostDelta || 0),
        costByModel: data.cost_by_model || {},
        systemPrompt: data.system_prompt || data.systemPrompt || null,
        category: data.category || null,
        // `'messages' in overrides` au lieu d'un `||` pour distinguer « pas
        // d'override » d'un « override avec tableau vide » (qui doit écraser
        // les messages disque, pas tomber sur eux).
        messages: ('messages' in overrides) ? overrides.messages : (data.messages || []),
        canvas: data.canvas || undefined
    };
    if (overrides.title) merged.title = overrides.title;
    if (deltas?.modelKey && (deltas.tokensIn || deltas.tokensOut || deltas.cost)) {
        merged.costByModel[deltas.modelKey] = merged.costByModel[deltas.modelKey] || { input: 0, output: 0, cost: 0 };
        merged.costByModel[deltas.modelKey].input += deltas.tokensIn || 0;
        merged.costByModel[deltas.modelKey].output += deltas.tokensOut || 0;
        merged.costByModel[deltas.modelKey].cost += deltas.cost || 0;
    }
    return merged;
}

// Sauvegarde une conversation par ID (sans toucher aux globals).
// Utilisé quand un stream se termine pour une conversation qui n'est plus active.
async function _saveConvById(convId, history, deltas) {
    if (!convId) return;
    const filename = convId.replace(/[<>:"/\\|?*]/g, '_') + '.json';
    let merged = null;
    await updateConversationFile(filename, (data) => {
        if (!data) return null;
        merged = _mergeConvData(data, convId, { overrides: { messages: history }, deltas });
        return formatConversationFile(merged);
    });
    if (!merged) return;
    if (!refreshConvListItem(filename)) refreshConvList();
    // Si la conversation enregistrée est celle actuellement visible (cas où l'utilisateur
    // a quitté puis est revenu pendant le stream), rafraîchir l'affichage.
    // Garde-fou : ne PAS recharger si un stream est encore actif sur cette conversation,
    // sinon `loadConversation` écraserait `conversationHistory` et perdrait les chunks
    // déjà accumulés dans le `_streamCtx` en cours.
    if (convId === STATE.conversationId && !STATE._activeStreams.has(convId)) {
        loadConversation(filename);
    }
    // Premier tour terminé en arrière-plan : déclencher la génération de titre
    // (la branche _isActive de l'onDone l'aurait fait, mais ici l'utilisateur
    // a navigué — sans cet appel, la conversation n'aurait jamais de titre).
    if (history.length === 2 && !merged.title) {
        try { maybeGenerateTitle(convId, history, deltas?.modelKey); } catch {}
    }
}

function saveConversation() {
    if (!STATE.conversationId || STATE.conversationHistory.length === 0) return;

    const data = {
        id: STATE.conversationId,
        title: STATE.conversationTitle,
        model: STATE.currentModel || STATE.currentImageModel || STATE.currentSearchModel,
        startTime: STATE.conversationStartTime,
        lastActivity: STATE.conversationLastActivity,
        totalInputTokens: STATE.totalInputTokens,
        totalOutputTokens: STATE.totalOutputTokens,
        totalCost: STATE.totalCost,
        totalImageCost: STATE.totalImageCost,
        totalAudioCost: STATE.totalAudioCost,
        totalTitleCost: STATE.totalTitleCost,
        costByModel: STATE.costByModel,
        systemPrompt: STATE.currentSystemPrompt ? STATE.currentSystemPrompt.nom : null,
        category: STATE.currentConversationCategory,
        messages: STATE.conversationHistory,
        canvas: (window.Canvas && window.Canvas.isActive) ? window.Canvas.serialize() : undefined
    };
    const filename = STATE.conversationId.replace(/[<>:"/\\|?*]/g, '_') + '.json';
    const content = formatConversationFile(data);
    writeConversationFile(filename, content).then(() => {
        if (!refreshConvListItem(filename)) refreshConvList();
        checkBudgetAlert();
    }).catch(function(e) { console.warn('saveConversation UI update failed:', e); });
    // Sync serveur (multi-appareils) — non bloquant
    if (typeof syncPushToServer === 'function') {
        syncPushToServer(filename, content).catch(function(){});
    }
    updateExportMdBtn();
}

// Exposé pour que canvas.js puisse déclencher une sauvegarde après une mutation
window.saveConversation = saveConversation;

// --- Génération automatique du titre de conversation ---
// Capture STATE.conversationId/history au démarrage : la requête API au modèle de titre est asynchrone,
// donc l'utilisateur peut changer de conversation pendant son exécution. Sans capture, le titre
// généré écraserait le titre de la conversation actuellement visible.
async function maybeGenerateTitle(convIdArg, historyArg, modelHint) {
    const _titleConvId = convIdArg || STATE.conversationId;
    const _titleHistory = historyArg || STATE.conversationHistory;
    // Seulement après le premier échange (1 user + 1 assistant)
    if (!_titleConvId || _titleHistory.length !== 2) return;

    const userMsg = getTextFromContent(_titleHistory[0].content);
    const assistantMsg = getTextFromContent(_titleHistory[1].content);
    if (!userMsg) return;

    // Lire le titre actuel sur disque pour ne pas écraser un titre déjà généré
    const filename = _titleConvId.replace(/[<>:"/\\|?*]/g, '_') + '.json';

    async function _applyTitle(newTitle, costDelta) {
        if (!newTitle) return;
        let applied = false;
        await updateConversationFile(filename, (data) => {
            if (!data) return null;
            if (data.titre || data.title) return null; // titre déjà présent
            const merged = _mergeConvData(data, _titleConvId, {
                overrides: { title: newTitle, titleCostDelta: costDelta || 0 }
            });
            applied = true;
            return formatConversationFile(merged);
        });
        if (!applied) return;
        // Si la conversation visible est celle qu'on vient de titrer, synchroniser globals + UI.
        if (STATE.conversationId === _titleConvId) {
            STATE.conversationTitle = newTitle;
            if (costDelta) STATE.totalTitleCost += costDelta;
            updateChatHeader();
            updateTokenDisplay();
        }
        if (!refreshConvListItem(filename)) refreshConvList();
    }

    // Mode "Aucun" : utiliser les premiers mots du message comme titre
    if (AUDIO_SETTINGS.titleModel === 'none') {
        const words = userMsg.trim().split(/\s+/).slice(0, 6).join(' ');
        if (words) {
            const t = words.length > 40 ? words.substring(0, 37) + '...' : words;
            await _applyTitle(t, 0);
        }
        return;
    }

    // Utiliser le modèle configuré pour les titres, sinon le modèle de chat en cours
    // (modelHint permet aux callers en arrière-plan de fournir le modèle du stream
    // capturé, puisque les globals peuvent appartenir à une autre conversation.)
    let modelId = AUDIO_SETTINGS.titleModel || modelHint || STATE.currentModel || STATE.currentImageModel || STATE.currentSearchModel;
    // Si le modèle n'a pas de clé API valide, chercher le 1er modèle texte dispo
    if (modelId && !hasProviderKey(getModelEditeur(modelId))) {
        modelId = (MODELS || []).find(m => hasProviderKey(m.editeur))?.id || null;
    }
    if (!modelId) return;

    try {
        const prompt = `Donne un titre très court (3 à 6 mots max, en français) pour cette conversation. Réponds UNIQUEMENT avec le titre, sans guillemets, sans markdown, sans ponctuation finale.\n\nUtilisateur : ${userMsg.substring(0, 300)}\n\nAssistant : ${assistantMsg.substring(0, 300)}`;
        const result = await streamText(modelId, prompt);
        let title = result.text?.trim();
        if (title) title = title.replace(/<think>[\s\S]*?<\/think>/g, '').replace(/<\/?think>/g, '').trim();
        if (title) {
            const tarif = getTarif(modelId);
            const cost = result.usage ? _resolveTextCost(tarif, result.usage) : 0;
            await _applyTitle(title, cost);
        }
    } catch (e) {
        console.error('Erreur génération titre:', e);
    }
}

// --- Extraire le texte d'un content (string ou array multimodal) ---
function getTextFromContent(content) {
    if (typeof content === 'string') return content;
    if (Array.isArray(content)) {
        return content.filter(p => p.type === 'text').map(p => p.text).join('');
    }
    return '';
}

// --- Helpers de rendu / construction de messages assistant image ---

const _IMG_DOWNLOAD_SVG = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>';

// Construit la grille `.message-images` à partir d'une liste de pièces-images.
// Chaque entrée doit fournir au moins `mimeType` plus un de :
//   - `dataUrl` (déjà data: URL, utilisé pour les uploads utilisateur)
//   - `data`    (base64 brut, format conversation history)
//   - `b64`     (base64 brut, format renvoyé par les providers d'image)
function buildImagesContainer(images, { altText = 'Image' } = {}) {
    const imagesDiv = document.createElement('div');
    imagesDiv.className = 'message-images';
    for (const img of images) {
        const imgWrap = document.createElement('div');
        imgWrap.className = 'message-image-wrap';

        const b64 = img.dataUrl ? null : (img.data || img.b64);
        const src = img.dataUrl || `data:${img.mimeType};base64,${b64}`;

        const imgEl = document.createElement('img');
        imgEl.src = src;
        imgEl.alt = altText;
        attachLightboxToImg(imgEl);

        const dlBtn = document.createElement('button');
        dlBtn.className = 'image-download-btn';
        dlBtn.innerHTML = _IMG_DOWNLOAD_SVG;
        dlBtn.title = 'Télécharger';
        dlBtn.addEventListener('click', () => {
            const a = document.createElement('a');
            a.href = src;
            const ext = (img.mimeType || 'image/png').split('/')[1] || 'png';
            a.download = `cetas-image.${ext}`;
            a.click();
        });

        imgWrap.appendChild(imgEl);
        imgWrap.appendChild(dlBtn);
        imagesDiv.appendChild(imgWrap);
    }
    return imagesDiv;
}

// Convertit un `result` d'API image (`{ text, images: [{b64, mimeType}] }`)
// en pièces normalisées pour `conversationHistory`.
function imageResultToContent(result) {
    const parts = [];
    if (result.text) parts.push({ type: 'text', text: result.text });
    for (const img of result.images) parts.push({ type: 'image', data: img.b64, mimeType: img.mimeType });
    return parts;
}

// Construit le prompt envoyé au modèle d'image : texte du message + contexte des derniers
// échanges (utile pour les demandes relatives : « rends-la bleue »). Garantit un prompt
// non vide (les API refusent un prompt vide, ex. message ne contenant qu'une image).
function buildImagePrompt(text, history) {
    let imagePrompt = text;
    const textMessages = history.filter(m => m.role === 'user' || m.role === 'assistant');
    // S'il y a du contexte et que le prompt semble relatif (court ou référentiel)
    if (textMessages.length > 1) {
        const contextParts = [];
        // Prendre les derniers messages (hors le dernier, qui est le message en cours)
        const recent = textMessages.slice(-6, -1);
        for (const m of recent) {
            const t = typeof m.content === 'string' ? m.content
                : Array.isArray(m.content) ? m.content.filter(p => p.type === 'text').map(p => p.text).join(' ') : '';
            if (t) contextParts.push(`${m.role === 'user' ? 'User' : 'Assistant'}: ${t.substring(0, 300)}`);
        }
        if (contextParts.length > 0) {
            imagePrompt = `Context of the conversation:\n${contextParts.join('\n')}\n\nImage request: ${text}`;
        }
    }
    if (!imagePrompt || !imagePrompt.trim()) {
        imagePrompt = "Génère une image en t'inspirant des images fournies.";
    }
    return imagePrompt;
}

// Collecte les images de référence à passer au modèle d'image :
//  1) toutes les images jointes au dernier message utilisateur ;
//  2) si le dernier message n'en contient aucune (ou pour compléter), les
//     images du dernier message *précédent* qui en contient (générées ou jointes).
// La déduplication par `data` évite de renvoyer deux fois la même pièce quand
// l'utilisateur réutilise une image déjà présente plus haut dans la conv.
function collectReferenceImages(history) {
    const refs = [];
    const seen = new Set();
    const last = history[history.length - 1];
    if (last && Array.isArray(last.content)) {
        for (const part of last.content) {
            if (part.type === 'image' && part.data) {
                refs.push({ data: part.data, mimeType: part.mimeType });
                seen.add(part.data);
            }
        }
    }
    for (let i = history.length - 2; i >= 0; i--) {
        const msg = history[i];
        if (Array.isArray(msg.content)) {
            const imgs = msg.content.filter(p => p.type === 'image' && p.data && !seen.has(p.data));
            if (imgs.length > 0) {
                for (const img of imgs) refs.push({ data: img.data, mimeType: img.mimeType });
                break;
            }
        }
    }
    return refs;
}

// --- Ajouter un message dans le DOM ---
function addMessage(role, content, citations, generationTime, thinking, outputTokens, model) {
    hideEmptyPlaceholder();
    const div = document.createElement('div');
    div.className = `message message-${role}`;

    // Bloc de raisonnement dépliable (assistant uniquement)
    if (role === 'assistant' && thinking) {
        const details = document.createElement('details');
        details.className = 'thinking-block';
        const summary = document.createElement('summary');
        summary.textContent = 'Raisonnement';
        details.appendChild(summary);
        const thinkContent = document.createElement('div');
        thinkContent.className = 'thinking-content';
        thinkContent.innerHTML = marked.parse(thinking);
        details.appendChild(thinkContent);
        div.appendChild(details);
    }

    // Images (messages multimodaux)
    if (Array.isArray(content)) {
        const images = content.filter(p => p.type === 'image');
        if (images.length > 0) {
            div.appendChild(buildImagesContainer(images));
        }

        // Fichiers joints
        const files = content.filter(p => p.type === 'file');
        if (files.length > 0) {
            const filesDiv = document.createElement('div');
            filesDiv.className = 'message-files';
            for (const file of files) {
                const chip = document.createElement('div');
                chip.className = 'message-file-chip';
                chip.title = file.name;

                const nameSpan = document.createElement('span');
                nameSpan.className = 'message-file-chip-name';
                nameSpan.textContent = '\uD83D\uDCC4 ' + (file.name.length > 25 ? file.name.substring(0, 22) + '...' : file.name);

                // Crée la blob URL à la demande (et la révoque) pour éviter de fuiter
                // de la mémoire à chaque rendu d'historique de conversation.
                const makeBlobUrl = () => {
                    if (!file.data) return null;
                    const blob = new Blob([Uint8Array.from(atob(file.data), c => c.charCodeAt(0))], { type: file.mimeType || 'application/octet-stream' });
                    return URL.createObjectURL(blob);
                };

                // Clic sur le chip → ouvrir dans le file viewer
                nameSpan.style.cursor = 'pointer';
                nameSpan.addEventListener('click', function() {
                    // Révoquer l'URL précédente si l'utilisateur clique plusieurs fois
                    if (this._prevUrl) { URL.revokeObjectURL(this._prevUrl); clearTimeout(this._prevTimer); }
                    const url = makeBlobUrl();
                    if (!url) return;
                    this._prevUrl = url;
                    this._prevTimer = setTimeout(() => { URL.revokeObjectURL(url); this._prevUrl = null; }, 60000);
                    openFileViewer(url, file.name);
                });

                // Bouton télécharger (visible au hover)
                const dlBtn = document.createElement('button');
                dlBtn.className = 'message-file-chip-dl';
                dlBtn.title = 'Télécharger';
                dlBtn.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>';
                dlBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const url = makeBlobUrl();
                    if (!url) return;
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = file.name;
                    a.click();
                    setTimeout(() => URL.revokeObjectURL(url), 1000);
                });

                chip.appendChild(nameSpan);
                chip.appendChild(dlBtn);
                filesDiv.appendChild(chip);
            }
            div.appendChild(filesDiv);
        }
    }

    // Texte
    const textDiv = document.createElement('div');
    textDiv.className = 'message-text';
    const textContent = getTextFromContent(content);
    if (role === 'assistant' && textContent) {
        textDiv.innerHTML = marked.parse(textContent);
        addCodeCopyButtons(textDiv);
    } else if (role === 'assistant' && !textContent) {
        // Bulle assistant vide → placeholder « Génération en cours… » avec
        // shimmer dans la couleur de la catégorie active. Le streaming écrasera
        // ce contenu dès la première frappe.
        // Cas exclu : contenu non-string (array image/fichier-only) — pas de
        // placeholder, l'image/fichier est déjà rendu au-dessus.
        if (typeof content === 'string') {
            const placeholder = document.createElement('span');
            placeholder.className = 'generation-placeholder';
            placeholder.textContent = 'Génération en cours...';
            textDiv.appendChild(placeholder);
        }
    } else {
        textDiv.textContent = textContent;
    }
    div.appendChild(textDiv);
    // Stocker le markdown brut pour la copie (mis à jour après streaming)
    div._rawMarkdown = textContent;

    // Positionner un menu fixed par rapport à un bouton
    function positionMenu(menu, btn) {
        const r = btn.getBoundingClientRect();
        // Par défaut : au-dessus du bouton, aligné à gauche
        let left = r.left;
        let top = r.top - menu.offsetHeight - 4;
        // Débordement à droite → aligner à droite du bouton
        if (left + menu.offsetWidth > window.innerWidth - 4) {
            left = r.right - menu.offsetWidth;
        }
        // Débordement à gauche
        if (left < 4) left = 4;
        // Débordement en haut → ouvrir vers le bas
        if (top < 4) top = r.bottom + 4;
        menu.style.left = left + 'px';
        menu.style.top = top + 'px';
    }

    // Bouton copier (ou enregistrer pour les réponses image) sous la bulle
    const copySvg = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>';
    const checkSvg = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>';
    const downloadSvg = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>';

    const images = Array.isArray(content) ? content.filter(p => p.type === 'image') : [];
    const hasTextContent = (typeof content === 'string' && content.trim()) ||
        (Array.isArray(content) && content.some(p => p.type === 'text' && p.text && p.text.trim()));
    const isImageResponse = role === 'assistant' && images.length > 0 && !hasTextContent;

    const copyBtn = document.createElement('button');
    copyBtn.className = 'message-copy-btn';
    const copyIcon = document.createElement('span');
    copyIcon.className = 'copy-icon';
    copyBtn.appendChild(copyIcon);

    function doCopy(text) {
        navigator.clipboard.writeText(text).then(() => {
            copyIcon.innerHTML = checkSvg;
            setTimeout(() => { copyIcon.innerHTML = copySvg; }, 1500);
        }).catch(function(){});
    }

    if (isImageResponse) {
        copyBtn.title = images.length > 1 ? 'Enregistrer les images' : 'Enregistrer l\u2019image';
        copyIcon.innerHTML = downloadSvg;
        copyBtn.addEventListener('click', () => {
            images.forEach((img, idx) => {
                const src = img.dataUrl || `data:${img.mimeType};base64,${img.data}`;
                const a = document.createElement('a');
                a.href = src;
                const ext = (img.mimeType || 'image/png').split('/')[1] || 'png';
                a.download = images.length > 1 ? `cetas-image-${idx + 1}.${ext}` : `cetas-image.${ext}`;
                a.click();
            });
            copyIcon.innerHTML = checkSvg;
            setTimeout(() => { copyIcon.innerHTML = downloadSvg; }, 1500);
        });
    } else {
        copyBtn.title = 'Copier';
        copyIcon.innerHTML = copySvg;
        if (role === 'assistant') {
            // Menu contextuel avec choix Copier / Copier Markdown
            const copyMenu = document.createElement('div');
            copyMenu.className = 'copy-menu';
            copyMenu.innerHTML = '<div class="copy-menu-item" data-mode="text">Copier</div><div class="copy-menu-item" data-mode="md">Copier au format Markdown</div>';
            div.appendChild(copyMenu);

            copyBtn.addEventListener('click', (e) => {
                if (e.target.closest('.copy-menu-item')) return;
                closeAllMenus(copyMenu);
                copyMenu.classList.toggle('open');
                copyBtn.classList.toggle('menu-open', copyMenu.classList.contains('open'));
                if (copyMenu.classList.contains('open')) positionMenu(copyMenu, copyBtn);
                e.stopPropagation();
            });

            copyMenu.addEventListener('click', (e) => {
                const item = e.target.closest('.copy-menu-item');
                if (!item) return;
                e.stopPropagation();
                copyMenu.classList.remove('open');
                copyBtn.classList.remove('menu-open');
                const mode = item.dataset.mode;
                if (mode === 'md') {
                    doCopy(div._rawMarkdown || getTextFromContent(content));
                } else {
                    const textEl = div.querySelector('.message-text');
                    doCopy(textEl ? textEl.textContent : getTextFromContent(content));
                }
            });
        } else {
            copyBtn.addEventListener('click', () => {
                const textEl = div.querySelector('.message-text');
                doCopy(textEl ? textEl.textContent : getTextFromContent(content));
            });
        }
    }

    // Boutons sous la bulle
    const btnRow = document.createElement('div');
    btnRow.className = 'message-btn-row';

    // Temps de génération (assistant uniquement) — à gauche du bouton copier
    if (role === 'assistant') {
        const genTimeEl = document.createElement('span');
        genTimeEl.className = 'message-gen-time';
        if (generationTime) {
            genTimeEl.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>';
            genTimeEl.dataset.tooltip = formatGenTooltip(generationTime, outputTokens, model);
        }
        btnRow.appendChild(genTimeEl);
    }

    btnRow.appendChild(copyBtn);

    // Bouton sauvegarder prompt (user uniquement)
    if (role === 'user') {
        const savePromptBtn = document.createElement('button');
        savePromptBtn.className = 'message-save-prompt-btn';
        savePromptBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>';
        savePromptBtn.title = 'Enregistrer ce prompt';
        savePromptBtn.addEventListener('click', () => {
            const textEl = div.querySelector('.message-text');
            const text = textEl ? textEl.textContent : getTextFromContent(content);
            if (!text) return;
            openPrModal(null, text);
        });
        btnRow.appendChild(savePromptBtn);

        // Bouton modifier (user uniquement)
        const editBtn = document.createElement('button');
        editBtn.className = 'message-edit-btn';
        editBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"/></svg>';
        editBtn.title = 'Modifier ce message';
        editBtn.addEventListener('click', () => {
            if (STATE.isStreaming) return;
            const wrapper = div.closest('.message-wrapper');
            startEditMessage(wrapper, div);
        });
        btnRow.appendChild(editBtn);
    }

    // Bouton lecture vocale OpenAI TTS (assistant uniquement, pas pour les images)
    const hasImages = Array.isArray(content) && content.some(p => p.type === 'image');
    if (role === 'assistant' && !hasImages) {
        const ttsBtn = document.createElement('button');
        ttsBtn.className = 'message-tts-btn';
        const iconPlay = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/></svg>';
        const iconStop = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="6" y="6" width="12" height="12" rx="1"/></svg>';
        const iconLoading = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="spin"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>';
        const ttsIcon = document.createElement('span');
        ttsIcon.className = 'tts-icon';
        ttsIcon.innerHTML = iconPlay;
        ttsBtn.appendChild(ttsIcon);
        ttsBtn.title = 'Lire à haute voix';

        // Menu contextuel TTS
        const ttsMenu = document.createElement('div');
        ttsMenu.className = 'copy-menu';
        ttsMenu.innerHTML = '<div class="copy-menu-item" data-mode="play">Lire à haute voix</div><div class="copy-menu-item" data-mode="save">Enregistrer au format audio</div>';
        div.appendChild(ttsMenu);

        let ttsIsLoading = false;
        let ttsCachedBlob = null;
        let ttsCachedUrl = null;
        let ttsCachedProvider = null;

        function ttsGetText() {
            const textEl = div.querySelector('.message-text');
            return textEl ? textEl.textContent : '';
        }

        function ttsReset() {
            ttsIcon.innerHTML = iconPlay;
            ttsBtn.title = 'Lire à haute voix';
            ttsIsLoading = false;
        }

        // Lecture dynamique du provider : si l'utilisateur change le provider TTS
        // depuis Configuration, le bouton doit refléter ce changement immédiatement.
        const getIsSystemTts = () => AUDIO_SETTINGS.ttsProvider === 'system-tts';

        function ttsGenerate(callback, silent = false, onPlayingStart = null) {
            if (!AUDIO_SETTINGS.ttsProvider) {
                showNoModelAlert('la synthèse vocale', 'audio-tts-provider');
                return;
            }
            // Invalider le cache si le provider a changé depuis la dernière génération
            if (ttsCachedBlob && ttsCachedProvider !== AUDIO_SETTINGS.ttsProvider) {
                if (ttsCachedUrl) { URL.revokeObjectURL(ttsCachedUrl); ttsCachedUrl = null; }
                ttsCachedBlob = null;
                ttsCachedProvider = null;
            }
            if (ttsCachedBlob) { callback(ttsCachedBlob); return; }
            const text = ttsGetText();
            if (!text) return;
            ttsIsLoading = true;
            ttsIcon.innerHTML = iconLoading;
            ttsBtn.title = 'Chargement...';
            const providerAtStart = AUDIO_SETTINGS.ttsProvider;
            ttsSpeak(text, (blob, charCount, alreadyPlayed) => {
                ttsIsLoading = false;
                ttsCachedBlob = blob;
                ttsCachedProvider = providerAtStart;
                if (blob) {
                    let unitPrice = 30;
                    const ttsModel = MODELS_DATA.tts.find(m => m.id === AUDIO_SETTINGS.ttsProvider);
                    if (ttsModel && ttsModel.prix) {
                        const match = ttsModel.prix.match(/\$([\d.]+)\/1M/);
                        if (match) unitPrice = parseFloat(match[1]);
                    }
                    
                    const ttsCost = (charCount / 1_000_000) * unitPrice;
                    
                    STATE.totalAudioCost += ttsCost;
                    addCostForModel('tts', 0, 0, ttsCost);
                    updateTokenDisplay();
                    saveConversation();
                }
                callback(blob, alreadyPlayed);
            }, (err) => {
                ttsReset();
                console.error('TTS error:', err);
                customAlert('Erreur TTS : ' + err.message, 'error');
            }, silent, onPlayingStart);
        }

        function ttsDoSpeak() {
            if (getIsSystemTts()) {
                const text = ttsGetText();
                if (!text) return;
                ttsIcon.innerHTML = iconStop;
                ttsBtn.title = 'Arrêter la lecture';
                STATE.currentTtsAudio = 'system';
                ttsSpeak(text, () => {
                    STATE.currentTtsAudio = null;
                    ttsReset();
                }, (err) => {
                    STATE.currentTtsAudio = null;
                    ttsReset();
                    console.error('TTS error:', err);
                    customAlert('Erreur TTS : ' + err.message, 'error');
                });
                return;
            }
            ttsGenerate((blob, alreadyPlayed) => {
                if (alreadyPlayed) {
                    STATE.currentTtsAudio = null;
                    ttsReset();
                    return;
                }
                if (ttsCachedUrl) URL.revokeObjectURL(ttsCachedUrl);
                ttsCachedUrl = URL.createObjectURL(blob);
                const audio = new Audio(ttsCachedUrl);
                STATE.currentTtsAudio = audio;
                ttsIcon.innerHTML = iconStop;
                ttsBtn.title = 'Arrêter la lecture';
                audio.onended = () => {
                    STATE.currentTtsAudio = null;
                    ttsReset();
                };
                audio.onerror = () => {
                    STATE.currentTtsAudio = null;
                    ttsReset();
                    customAlert('Erreur de lecture audio', 'error');
                };
                audio.play().catch((err) => {
                    STATE.currentTtsAudio = null;
                    ttsReset();
                    console.error('Audio play error:', err);
                    customAlert('Erreur de lecture audio : ' + err.message, 'error');
                });
            }, false, (stopHandle) => {
                // Provider streaming (Mistral) : la lecture a démarré avant la fin du fetch.
                // On expose le handle stop et on passe en mode « arrêter la lecture ».
                STATE.currentTtsAudio = stopHandle;
                ttsIcon.innerHTML = iconStop;
                ttsBtn.title = 'Arrêter la lecture';
            });
        }

        function ttsSaveBlob(blob) {
            ttsReset();
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'cetas-audio.wav';
            a.click();
            setTimeout(() => URL.revokeObjectURL(url), 1000);
        }

        function ttsDoSave() {
            // Si déjà en cache, télécharger directement sans regénérer
            if (ttsCachedBlob) { ttsSaveBlob(ttsCachedBlob); return; }
            ttsGenerate((blob) => ttsSaveBlob(blob), true);
        }

        ttsBtn.addEventListener('click', (e) => {
            // Si un audio est en cours, l'arrêter
            if (STATE.currentTtsAudio) {
                if (STATE.currentTtsAudio === 'system') {
                    window.speechSynthesis.cancel();
                } else if (typeof STATE.currentTtsAudio === 'function') {
                    try { currentTtsAudio(); } catch (e) {}
                } else {
                    STATE.currentTtsAudio.pause();
                    STATE.currentTtsAudio.currentTime = 0;
                }
                STATE.currentTtsAudio = null;
                document.querySelectorAll('.tts-icon').forEach(function(ic) { ic.innerHTML = iconPlay; });
                document.querySelectorAll('.message-tts-btn').forEach(function(b) { b.title = 'Lire à haute voix'; });
                return;
            }
            if (ttsIsLoading) return;
            if (!AUDIO_SETTINGS.ttsProvider) {
                showNoModelAlert('la synthèse vocale', 'audio-tts-provider');
                return;
            }
            // Lecture directe en un clic — toujours, quel que soit le provider
            ttsDoSpeak();
            e.stopPropagation();
        });

        btnRow.appendChild(ttsBtn);
    }

    // Citations Perplexity
    if (citations && citations.length > 0) {
        appendCitations(div, citations);
    }

    // Wrapper pour positionner les boutons sous la bulle
    const wrapper = document.createElement('div');
    wrapper.className = `message-wrapper message-wrapper-${role} animate-in`;
    wrapper.appendChild(div);
    wrapper.appendChild(btnRow);

    chatContainer.appendChild(wrapper);
    wrapper.addEventListener('animationend', () => wrapper.classList.remove('animate-in'), { once: true });
    scrollToBottom(true);
    // Ajouter les boutons SamAgent si applicable
    if (role === 'assistant') _samAgentMakeClickable(div);
    return div;
}

// --- Fermeture animée du bloc raisonnement ---
function collapseThinkBlock(thinkBlock) {
    if (!thinkBlock || !thinkBlock.open) return;
    const content = thinkBlock.querySelector('.thinking-content');
    if (!content) { thinkBlock.open = false; return; }

    const msgEl = thinkBlock.closest('.message');
    const startW = msgEl ? msgEl.offsetWidth : 0;
    const startH = msgEl ? msgEl.offsetHeight : 0;
    const contentH = content.offsetHeight;

    // Phase 1 : Figer les dimensions et animer la fermeture du contenu
    if (msgEl) {
        msgEl.style.width = startW + 'px';
        msgEl.style.height = startH + 'px';
        msgEl.style.overflow = 'hidden';
    }

    content.style.height = contentH + 'px';
    content.style.overflow = 'hidden';
    void content.offsetHeight;

    content.style.transition = 'height 0.3s ease-out, opacity 0.3s ease-out';
    content.style.height = '0px';
    content.style.opacity = '0';

    if (msgEl) {
        void msgEl.offsetHeight;
        msgEl.style.transition = 'height 0.3s ease-out';
        msgEl.style.height = (startH - contentH) + 'px';
    }

    // Phase 2 : Après fermeture hauteur, fermer <details> et transitionner la largeur
    content.addEventListener('transitionend', function handler(e) {
        if (e.propertyName !== 'height') return;
        content.removeEventListener('transitionend', handler);

        thinkBlock.open = false;
        content.style.height = '';
        content.style.overflow = '';
        content.style.transition = '';
        content.style.opacity = '';

        if (!msgEl) return;

        const isStreaming = msgEl.classList.contains('streaming');

        if (STATE.isStreaming) {
            // Pendant le streaming : garder la largeur acquise, animer seulement la hauteur
            msgEl.style.minWidth = startW + 'px';
            msgEl.style.transition = 'none';
            msgEl.style.width = '';
            msgEl.style.height = '';
            msgEl.style.overflow = '';
        } else {
            // Hors streaming : animer largeur + hauteur vers la taille naturelle
            msgEl.style.transition = 'none';
            msgEl.style.width = '';
            msgEl.style.height = '';
            msgEl.style.overflow = '';
            const targetW = msgEl.offsetWidth;
            const targetH = msgEl.offsetHeight;

            msgEl.style.width = startW + 'px';
            msgEl.style.height = (startH - contentH) + 'px';
            msgEl.style.overflow = 'hidden';
            void msgEl.offsetHeight;

            msgEl.style.transition = 'width 0.3s ease-out, height 0.3s ease-out';
            msgEl.style.width = targetW + 'px';
            msgEl.style.height = targetH + 'px';

            setTimeout(() => {
                msgEl.style.width = '';
                msgEl.style.height = '';
                msgEl.style.overflow = '';
                msgEl.style.transition = '';
            }, 350);
        }
    });
}

// --- Fin de streaming avec transition douce ---
function endStreaming(el) {
    if (window.Ocean?.setPaused) window.Ocean.setPaused(false);
    const currentW = el.offsetWidth;
    el.classList.remove('streaming');
    el.classList.add('streaming-done');
    el.style.minWidth = currentW + 'px';
    el.style.transition = 'min-width 0.4s ease-out';
    requestAnimationFrame(() => { el.style.minWidth = ''; });
    el.addEventListener('animationend', () => el.classList.remove('streaming-done'), { once: true });
    setTimeout(() => { el.style.transition = ''; }, 500);
    // Transformer les propositions SamAgent en boutons cliquables
    _samAgentMakeClickable(el);
}

function _samAgentMakeClickable(el) {
    if (!el) return;
    const model = STATE.currentModel || '';
    if (model.indexOf('samagent-') !== 0) return;
    const domains = [
        { keys: ['chat général', 'chat general', 'question générale', 'conseil'], label: '💬 Chat général' },
        { keys: ['coder', 'programmation', 'script', 'débogage', 'debug'],     label: '💻 Coder' },
        { keys: ['avancé', 'avance', 'raisonnement', 'analyse', 'maths', 'rédaction'], label: '🔬 Avancé' }
    ];
    // Ne pas afficher les boutons si un choix de domaine a déjà été fait
    const wrapper = el.parentElement;
    let prev = wrapper?.previousElementSibling;
    while (prev) {
        const prevMsg = prev.querySelector('.message-user');
        if (prevMsg) {
            const prevText = (prevMsg.querySelector('.message-text')?.textContent || '').trim();
            if (domains.some(d => d.label === prevText)) return;
        }
        prev = prev.previousElementSibling;
    }
    // Vérifier qu'au moins un domaine est mentionné dans la réponse
    const fullText = (el.textContent || '').toLowerCase();
    const mentioned = domains.filter(d => d.keys.some(k => fullText.indexOf(k) !== -1));
    if (mentioned.length === 0) return;
    if (el.querySelector('.samagent-proposals-rendered')) return;
    el.querySelector('.message-text')?.classList.add('samagent-proposals-rendered');

    // Ajouter 3 boutons fixes en bas du message
    const btnContainer = document.createElement('div');
    btnContainer.className = 'samagent-buttons';
    btnContainer.style.cssText = 'margin-top:8px;display:flex;flex-direction:column;gap:4px';
    // Label discret
    const label = document.createElement('div');
    label.textContent = 'Propositions :';
    label.style.cssText = 'font-size:0.75rem;color:var(--text-muted, #888);margin-bottom:2px';
    btnContainer.appendChild(label);
    for (const d of domains) {
        const btn = document.createElement('div');
        btn.textContent = d.label;
        btn.style.cssText = 'cursor:pointer;padding:8px 12px;border:1px solid var(--border-input);border-radius:8px;background:var(--bg-input);font-size:0.9rem;transition:background 0.15s,border-color 0.15s';
        btn.addEventListener('mouseenter', () => { btn.style.background = 'var(--bg-hover)'; btn.style.borderColor = 'var(--accent)'; });
        btn.addEventListener('mouseleave', () => { btn.style.background = 'var(--bg-input)'; btn.style.borderColor = 'var(--border-input)'; });
        btn.addEventListener('click', () => {
            btnContainer.querySelectorAll('div').forEach(b => {
                b.style.pointerEvents = 'none';
                b.style.opacity = '0.5';
            });
            const promptInput = document.getElementById('prompt-input');
            const sendBtn = document.getElementById('mobile-send-btn');
            if (promptInput && sendBtn && !sendBtn.disabled) {
                promptInput.value = d.label;
                sendBtn.click();
            }
        });
        btnContainer.appendChild(btn);
    }
    const textEl = el.querySelector('.message-text');
    if (textEl) textEl.appendChild(btnContainer);
}

// --- Streaming animé : typewriter + expansion douce ---
// Anime les nouveaux caractères qui viennent d'apparaître pendant le streaming.
// Les CSS animations échouaient à être visibles ici parce que (a) marked.parse
// reconstruit la totalité du DOM à chaque tick — donc l'élément précédent est
// jeté et son état final ne persiste pas — et (b) le moteur peut peindre l'état
// final de la keyframe avant la première frame visible. On bascule sur une
// approche par styles inline + transition CSS, déclenchée via double rAF :
//   1) on insère le span avec color = blanc (ou noir en dark mode) en INLINE,
//      ce qui prime sur toute règle .message-text → l'utilisateur voit la
//      teinte de départ dès le 1er paint.
//   2) au paint suivant, on retire l'inline pour laisser color hériter, et la
//      transition CSS interpole vers la couleur normale du texte.
function _wrapNewChars(textEl, newCharsCount) {
    if (!textEl || !(newCharsCount > 0)) return;
    const wrapLen = Math.max(newCharsCount, 8);
    const walker = document.createTreeWalker(textEl, NodeFilter.SHOW_TEXT, null);
    let last = null;
    while (walker.nextNode()) {
        const n = walker.currentNode;
        if (n.nodeValue && n.nodeValue.length > 0) last = n;
    }
    if (!last) return;
    // Ne pas wrapper à l'intérieur d'un bloc/inline code pour préserver la coloration.
    let p = last.parentNode;
    while (p && p !== textEl) {
        if (p.nodeName === 'CODE' || p.nodeName === 'PRE') return;
        p = p.parentNode;
    }
    const text = last.nodeValue;
    const take = Math.min(wrapLen, text.length);
    const span = document.createElement('span');
    span.className = 'char-flash';
    if (take >= text.length) {
        span.textContent = text;
        last.parentNode.replaceChild(span, last);
    } else {
        const head = text.slice(0, text.length - take);
        span.textContent = text.slice(text.length - take);
        const parent = last.parentNode;
        parent.insertBefore(document.createTextNode(head), last);
        parent.insertBefore(span, last);
        parent.removeChild(last);
    }
    // L'animation d'apparition (fade + blur + léger déplacement) est gérée en
    // CSS pur via la classe .char-flash (cf. wordReveal dans chat.css) : pas
    // besoin de rAF ni de manipulation de style inline ici, l'animation se
    // déclenche automatiquement dès l'insertion du span dans le DOM.
}

function createStreamRenderer(resizeEl, getTextEl, seedText) {
    // seedText : texte déjà accumulé (ex. quand on rebind un stream en cours après un retour
    // sur la conversation). Le renderer poursuit l'accumulation à partir de là, sans écraser
    // le contenu déjà affiché à chaque chunk reçu.
    let displayed = seedText || '';
    let buffer = '';
    let timer = null;
    let lastParsedLen = displayed.length;
    let _stickAttached = false;
    let _userScrolledUp = false;

    // Auto-scroll "sticky" : si l'élément textEl est lui-même scrollable (ex. .thinking-content
    // avec max-height + overflow-y), on garde le bas affiché à chaque nouveau chunk — sauf
    // si l'utilisateur a remonté manuellement, auquel cas on respecte sa position.
    function _ensureStickyHandler(textEl) {
        if (_stickAttached) return;
        const scroller = textEl.scrollHeight > textEl.clientHeight ? textEl : null;
        if (!scroller) return;
        scroller.addEventListener('scroll', () => {
            const scrollThreshold = window.innerWidth < 768 ? 120 : 12;
            const atBottom = scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight < scrollThreshold;
            _userScrolledUp = !atBottom;
        });
        _stickAttached = true;
    }

    function render() {
        const textEl = getTextEl();
        if (!textEl) return;
        // Reparse à chaque mot libéré : le débit est déjà lissé en amont par le
        // tick mot-par-mot, donc plus besoin d'attendre un seuil de caractères ici.
        lastParsedLen = displayed.length;
        const prevLen = textEl.textContent.length;
        textEl.innerHTML = marked.parse(displayed);
        _wrapNewChars(textEl, textEl.textContent.length - prevLen);
        scrollToBottom();
        _ensureStickyHandler(textEl);
        // Scroll interne du textEl (pour les blocs scrollables comme .thinking-content)
        if (!_userScrolledUp && textEl.scrollHeight > textEl.clientHeight) {
            textEl.scrollTop = textEl.scrollHeight;
        }
    }

    // Libère le buffer mot par mot à intervalle fixe, plutôt que par paquets de
    // ~20 caractères toutes les 80ms. Le débit d'affichage devient indépendant
    // de la taille des chunks réseau (le LLM peut envoyer 50 caractères d'un
    // coup, l'écran ne montre qu'un mot de plus à la fois) => sensation de
    // vitesse régulière et fluide, façon "machine à écrire ultra rapide".
    const WORD_TICK_MS = 55;

    // Nombre de "mots" libérés à chaque tick. Regrouper plusieurs mots par
    // paquet donne un rendu plus doux avec l'effet de fondu (chaque paquet
    // apparaît comme un petit bloc qui se fond à l'écran) plutôt qu'un
    // clignotement mot par mot trop rapide à l'œil.
    const WORDS_PER_TICK = 4;

    function _tick() {
        timer = null;
        if (buffer.length === 0) return;
        // Cherche jusqu'à WORDS_PER_TICK coupures de mot (espace, saut de ligne)
        // consécutives dans le buffer.
        const re = /\s*\S+\s*/g;
        let count = 0;
        let endIdx = 0;
        let match;
        while (count < WORDS_PER_TICK && (match = re.exec(buffer)) !== null) {
            endIdx = re.lastIndex;
            count++;
        }
        let piece;
        if (endIdx > 0) {
            piece = buffer.slice(0, endIdx);
        } else {
            // Pas de coupure trouvée : le mot courant continue d'arriver dans un futur
            // chunk réseau, ou c'est la fin du flux -> on prend tout ce qu'il reste
            // pour ne pas bloquer l'affichage indéfiniment.
            piece = buffer;
        }
        displayed += piece;
        buffer = buffer.slice(piece.length);
        render();
        if (buffer.length > 0) timer = setTimeout(_tick, WORD_TICK_MS);
    }

    return {
        add(chunk) {
            buffer += chunk;
            if (!timer) timer = setTimeout(_tick, WORD_TICK_MS);
        },
        flush() {
            if (timer) { clearTimeout(timer); timer = null; }
            displayed += buffer;
            buffer = '';
            const textEl = getTextEl();
            if (textEl) { textEl.innerHTML = marked.parse(displayed); addCodeCopyButtons(textEl); }
        }
    };
}

// --- Afficher le temps de génération sur le dernier message assistant ---
function formatGenTime(seconds) {
    let timeStr;
    if (seconds < 1) timeStr = '< 1s';
    else if (seconds < 60) timeStr = `${Math.round(seconds)}s`;
    else {
        const min = Math.floor(seconds / 60);
        const sec = Math.round(seconds % 60);
        timeStr = sec > 0 ? `${min}min ${sec}s` : `${min}min`;
    }
    return timeStr;
}

function formatGenTooltip(seconds, outputTokens, modelId) {
    const parts = [];
    if (modelId) parts.push(getModelLabel(modelId));
    parts.push(formatGenTime(seconds));
    if (outputTokens) {
        const tokPerSec = seconds > 0 ? Math.round(outputTokens / seconds) : 0;
        parts.push(`${outputTokens} tokens (${tokPerSec}/s)`);
    }
    return parts.join(' · ');
}

function setGenTimeOnLastAssistant(seconds, outputTokens, modelId) {
    const wrappers = chatContainer.querySelectorAll('.message-wrapper-assistant');
    if (wrappers.length === 0) return;
    const lastWrapper = wrappers[wrappers.length - 1];
    const el = lastWrapper.querySelector('.message-gen-time');
    if (el) {
        el.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>';
        el.dataset.tooltip = formatGenTooltip(seconds, outputTokens, modelId);
    }
}

// --- Afficher les citations Perplexity sous un message ---
function appendCitations(messageDiv, citations) {
    const existing = messageDiv.querySelector('.citations-block');
    if (existing) existing.remove();
    if (!citations || citations.length === 0) return;

    const block = document.createElement('div');
    block.className = 'citations-block';

    const title = document.createElement('div');
    title.className = 'citations-title';
    title.textContent = 'Sources';
    block.appendChild(title);

    const list = document.createElement('ul');
    list.className = 'citations-list';
    for (let i = 0; i < citations.length; i++) {
        const cit = citations[i];
        // Support format string (Perplexity) ou objet {url, title}
        const url = typeof cit === 'string' ? cit : cit.url;
        const citTitle = typeof cit === 'string' ? '' : (cit.title || '');
        const li = document.createElement('li');
        const a = document.createElement('a');
        a.href = safeUrl(url);
        a.target = '_blank';
        a.rel = 'noopener noreferrer';
        if (citTitle) {
            a.textContent = citTitle.length > 50 ? citTitle.substring(0, 50) + '...' : citTitle;
        } else {
            try {
                a.textContent = new URL(url).hostname.replace(/^www\./, '');
            } catch (e) {
                a.textContent = url;
            }
        }
        a.title = url;
        const num = document.createElement('span');
        num.className = 'citation-num';
        num.textContent = `[${i + 1}]`;
        li.appendChild(num);
        li.appendChild(a);
        list.appendChild(li);
    }
    block.appendChild(list);
    messageDiv.appendChild(block);
}

// --- Bouton régénérer ---
function removeRegenBtn() {
    document.querySelectorAll('.regen-btn').forEach(b => b.remove());
}

function addRegenBtn() {
    removeRegenBtn();
    if (STATE.conversationHistory.length < 2) return;
    const last = STATE.conversationHistory[STATE.conversationHistory.length - 1];
    if (last.role !== 'assistant') return;

    const wrappers = chatContainer.querySelectorAll('.message-wrapper-assistant');
    if (wrappers.length === 0) return;
    const lastWrapper = wrappers[wrappers.length - 1];
    const btnRow = lastWrapper.querySelector('.message-btn-row');
    if (!btnRow) return;

    const btn = document.createElement('button');
    btn.className = 'regen-btn';
    btn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>';
    btn.title = 'Régénérer la réponse';
    btn.addEventListener('click', regenerateLastResponse);
    btnRow.appendChild(btn);
    // Le bouton de régénération ajoute de la hauteur après que scrollToBottom
    // a déjà été appelé, ce qui laissait la conversation légèrement remontée
    // et masquait les boutons sous le dernier message derrière .export-btns-group.
    scrollToBottom();
}

async function regenerateLastResponse() {
    if (STATE.isStreaming) return;
    // Si le dernier tour IA a modifié le canvas, demander confirmation et revenir
    // à l'état pré-tour avant de relancer. Annule la régénération si l'utilisateur refuse.
    const lastAssistantForRewind = STATE.conversationHistory.length > 0
        ? STATE.conversationHistory[STATE.conversationHistory.length - 1]
        : null;
    if (lastAssistantForRewind && lastAssistantForRewind.role === 'assistant' && lastAssistantForRewind.canvasBefore) {
        const ok = await confirmAndRewindCanvas(lastAssistantForRewind.canvasBefore);
        if (!ok) return;
    }
    // Retirer toutes les entrées d'historique qui suivent le dernier message
    // utilisateur : la précédente réponse assistant (à régénérer), mais aussi
    // d'éventuels marqueurs `system / model-switch` ou réponses d'erreur en
    // queue. Sans cette boucle, l'ancienne réponse pouvait rester dans
    // l'historique (et être renvoyée à l'API) si quoi que ce soit la suivait.
    while (STATE.conversationHistory.length > 0) {
        const last = STATE.conversationHistory[STATE.conversationHistory.length - 1];
        if (last.role === 'user') break;
        STATE.conversationHistory.pop();
    }
    // Retirer le wrapper du dernier message assistant + le bouton regen.
    // On supprime également tous les éléments DOM trailing (markers, bulles
    // assistant additionnelles) tant qu'on n'a pas atteint un wrapper user.
    removeRegenBtn();
    while (chatContainer.lastElementChild) {
        const el = chatContainer.lastElementChild;
        if (el.classList.contains('message-wrapper-user')) break;
        if (el.classList.contains('message-wrapper-assistant') ||
            el.classList.contains('model-switch-marker')) {
            el.remove();
        } else {
            break;
        }
    }

    // Persister tout de suite l'historique purgé : si la régénération est
    // interrompue (refresh, fermeture), on ne veut pas que l'ancienne réponse
    // ressuscite au prochain chargement de la conversation.
    saveConversation();

    // Re-générer
    STATE.conversationLastActivity = new Date().toISOString();
    STATE.isStreaming = true;
    if (window.Ocean?.setPaused) window.Ocean.setPaused(true);
    STATE.currentAbortController = new AbortController();
    updateSendButton();

    const _streamConvId = STATE.conversationId;
    const _streamHistory = STATE.conversationHistory;
    STATE._activeStreams.set(_streamConvId, { conversationId: _streamConvId, history: _streamHistory, abortController: STATE.currentAbortController });

    const assistantDiv = addMessage('assistant', '');
    assistantDiv.classList.add('streaming');
    const regenStartTime = Date.now();

    // Vérification de sécurité : s'assurer que le modèle image est valide
    if (STATE.currentImageModel && !getImageModelEditeur(STATE.currentImageModel)) {
        STATE.currentModel = STATE.currentImageModel;
        STATE.currentImageModel = null;
    }

    if (STATE.currentImageModel) {
        const lastUserMsg = STATE.conversationHistory[STATE.conversationHistory.length - 1];
        // Même enrichissement de contexte qu'à l'envoi initial : sans lui, un message
        // ne contenant qu'une image donnait un prompt vide (refusé par l'API).
        const prompt = buildImagePrompt(getTextFromContent(lastUserMsg.content), STATE.conversationHistory);

        const regenRefImages = collectReferenceImages(STATE.conversationHistory);

        const _regenImgFormat = document.getElementById('image-format-select').value;
        const _regenImgParams = getImageParams();
        const _regenImgModel = STATE.currentImageModel;
        generateImage(
            STATE.currentImageModel,
            prompt,
            (result) => {
                if (!STATE._activeStreams.has(_streamConvId)) return;
                STATE._activeStreams.delete(_streamConvId);
                const _isActive = isStreamActive(_streamConvId, _streamHistory);
                // Abort utilisateur : ne pas persister un message assistant vide.
                // `_streamConvId === conversationId` couvre aussi le cas où l'utilisateur
                // est revenu sur la conv après avoir navigué.
                if ((!result.images || result.images.length === 0) && !result.text) {
                    if (_streamConvId === STATE.conversationId) {
                        if (assistantDiv && assistantDiv.parentNode) assistantDiv.parentNode.removeChild(assistantDiv);
                        STATE.isStreaming = false;
                        STATE.currentAbortController = null;
                        updateSendButton();
                        addRegenBtn();
                    }
                    return;
                }
                if (_isActive) {
                    endStreaming(assistantDiv);
                    if (result.images.length > 0) {
                        assistantDiv.insertBefore(buildImagesContainer(result.images, { altText: 'Image générée' }), assistantDiv.firstChild);
                    }
                    const textEl = assistantDiv.querySelector('.message-text');
                    if (textEl && result.text) { textEl.innerHTML = marked.parse(result.text); addCodeCopyButtons(textEl); } else if (textEl) { textEl.remove(); }
                }
                const assistantContent = imageResultToContent(result);
                const regenSeconds = (Date.now() - regenStartTime) / 1000;
                const regenOutTok = result.usage?.output_tokens || 0;
                _streamHistory.push({ role: 'assistant', content: assistantContent.length === 1 && assistantContent[0].type === 'text' ? assistantContent[0].text : assistantContent, generationTime: regenSeconds, outputTokens: regenOutTok, model: _regenImgModel });
                const imgTarif = getImageTarif(_regenImgModel);
                const _resolved = _resolveImageCost(imgTarif, result.usage, result.imageCount, _regenImgFormat, _regenImgParams);
                if (_isActive) {
                    attachCanvasBeforeToLastAssistant();
                    setGenTimeOnLastAssistant(regenSeconds, regenOutTok, _regenImgModel);
                    if (result.usage) { STATE.totalInputTokens += result.usage.input_tokens || 0; STATE.totalOutputTokens += result.usage.output_tokens || 0; }
                    STATE.totalCost += _resolved.tokenCost;
                    STATE.totalImageCost += _resolved.imageCost;
                    addCostForModel(_regenImgModel, result.usage?.input_tokens || 0, result.usage?.output_tokens || 0, _resolved.total);
                    updateTokenDisplay(); saveConversation(); scrollToBottom(true); addRegenBtn();
                    STATE.isStreaming = false; STATE.currentAbortController = null; updateSendButton(); promptInput.focus();
                } else {
                    _saveConvById(_streamConvId, _streamHistory, {
                        tokensIn: result.usage?.input_tokens || 0,
                        tokensOut: result.usage?.output_tokens || 0,
                        cost: _resolved.tokenCost,
                        imageCost: _resolved.imageCost,
                        modelKey: _regenImgModel
                    });
                }
            },
            (err) => {
                STATE._activeStreams.delete(_streamConvId);
                if (_streamConvId !== STATE.conversationId) {
                    _streamHistory.push({ role: 'assistant', content: STREAM_ERROR_CONTENT, error: true });
                    _saveConvById(_streamConvId, _streamHistory, { modelKey: _regenImgModel });
                    return;
                }
                const lastUserMsg = _streamHistory[_streamHistory.length - 1];
                handleApiError(assistantDiv, getTextFromContent(lastUserMsg?.content), [], _regenImgModel || '', err);
            },
            regenRefImages,
            STATE.currentAbortController.signal,
            document.getElementById('image-format-select').value,
            getImageParams()
        );
    } else {
        let fullResponse = '';
        let fullRawResponse = ''; // accumule les chunks bruts de l'IA (avant traitement canvas)
        let fullThinking = '';
        const spContent = STATE.currentSystemPrompt ? STATE.currentSystemPrompt.contenu : null;
        const regenTextModel = STATE.currentModel || STATE.currentSearchModel;
        const sr = createStreamRenderer(assistantDiv, () => assistantDiv.querySelector('.message-text'));
        let thinkSr = null;
        function ensureThinkBlock() {
            let thinkBlock = assistantDiv.querySelector('.thinking-block');
            if (!thinkBlock) {
                const details = document.createElement('details');
                details.className = 'thinking-block'; details.open = true;
                const summary = document.createElement('summary');
                summary.textContent = 'Raisonnement';
                details.appendChild(summary);
                const tc = document.createElement('div');
                tc.className = 'thinking-content';
                details.appendChild(tc);
                assistantDiv.insertBefore(details, assistantDiv.firstChild);
            }
            if (!thinkSr) thinkSr = createStreamRenderer(assistantDiv, () => assistantDiv.querySelector('.thinking-content'));
        }
        const _canvasParser1 = buildCanvasParserIfActive();
        const _effectiveSp1 = effectiveSystemPrompt(spContent);
        streamModel(
            regenTextModel,
            _limitHistoryImages(STATE.conversationHistory, getMaxHistoryImages()),
            (chunk) => {
                fullRawResponse += chunk;
                let visible = chunk;
                if (_canvasParser1) visible = _canvasParser1.feed(chunk).visible;
                const _isActive = isStreamActive(_streamConvId, _streamHistory);
                if (!fullResponse && visible && _isActive) { if (thinkSr) thinkSr.flush(); collapseThinkBlock(assistantDiv.querySelector('.thinking-block')); }
                if (visible) { fullResponse += visible; if (_isActive) sr.add(visible); }
            },
            (usage, citations) => {
                if (!STATE._activeStreams.has(_streamConvId)) return;
                STATE._activeStreams.delete(_streamConvId);
                const _isActive = isStreamActive(_streamConvId, _streamHistory);
                if (_canvasParser1) {
                    const tail = _canvasParser1.flush().visible;
                    if (tail) { fullResponse += tail; if (_isActive) sr.add(tail); }
                }
                // Abort utilisateur sans aucun chunk reçu : ne pas pousser de bulle vide.
                // `_streamConvId === conversationId` couvre aussi le cas où l'utilisateur
                // est revenu sur la conv après avoir navigué (l'STATE.isStreaming global a
                // été remis à true par `loadConversation` et doit être libéré).
                if (!usage && !fullResponse && !fullThinking) {
                    if (_streamConvId === STATE.conversationId) {
                        if (assistantDiv && assistantDiv.parentNode) assistantDiv.parentNode.removeChild(assistantDiv);
                        STATE.isStreaming = false;
                        STATE.currentAbortController = null;
                        updateSendButton();
                        addRegenBtn();
                    }
                    return;
                }
                if (_isActive) {
                    sr.flush();
                    if (thinkSr) thinkSr.flush();
                    endStreaming(assistantDiv);
                    if (!fullThinking.trim()) {
                        const emptyBlock = assistantDiv.querySelector('.thinking-block');
                        if (emptyBlock) emptyBlock.remove();
                    }
                    if (citations && citations.length > 0) appendCitations(assistantDiv, citations);
                }
                const regenSeconds = (Date.now() - regenStartTime) / 1000;
                const regenOutTok2 = usage?.output_tokens || 0;
                _streamHistory.push({ role: 'assistant', content: fullResponse, citations: citations || undefined, generationTime: regenSeconds, thinking: fullThinking || undefined, outputTokens: regenOutTok2, model: regenTextModel });
                let segCost = 0;
                if (usage) {
                    const segTarif = getTarif(regenTextModel) || getSearchTarif(regenTextModel);
                    segCost = _resolveTextCost(segTarif, usage);
                    segCost += calcWebSearchCost(regenTextModel, citations);
                }
                if (_isActive) {
                    attachCanvasBeforeToLastAssistant();
                    assistantDiv._rawMarkdown = fullResponse;
                    setGenTimeOnLastAssistant(regenSeconds, regenOutTok2, regenTextModel);
                    if (usage) {
                        STATE.totalInputTokens += usage.input_tokens || 0; STATE.totalOutputTokens += usage.output_tokens || 0;
                        STATE.totalCost += segCost;
                        addCostForModel(regenTextModel, usage.input_tokens || 0, usage.output_tokens || 0, segCost);
                    }
                    updateTokenDisplay(); saveConversation(); addRegenBtn();
                    STATE.isStreaming = false; STATE.currentAbortController = null; updateSendButton(); promptInput.focus();
                } else {
                    _saveConvById(_streamConvId, _streamHistory, {
                        tokensIn: usage?.input_tokens || 0,
                        tokensOut: usage?.output_tokens || 0,
                        cost: segCost,
                        modelKey: regenTextModel
                    });
                }
            },
            (err) => {
                STATE._activeStreams.delete(_streamConvId);
                if (_streamConvId !== STATE.conversationId) {
                    _streamHistory.push({ role: 'assistant', content: STREAM_ERROR_CONTENT, error: true });
                    _saveConvById(_streamConvId, _streamHistory, { modelKey: regenTextModel });
                    return;
                }
                const lastUserMsg = _streamHistory[_streamHistory.length - 1];
                handleApiError(assistantDiv, getTextFromContent(lastUserMsg?.content), [], regenTextModel || '', err);
            },
            _effectiveSp1,
            STATE.webSearchEnabled && !hasBuiltInWebSearch(regenTextModel),
            (thinkChunk) => {
                fullThinking += thinkChunk;
                if (_streamConvId !== STATE.conversationId) return;
                ensureThinkBlock();
                thinkSr.add(thinkChunk);
            },
            STATE.currentAbortController.signal,
            getModelParams()
        );
    }
}

// --- Modification d'un message utilisateur ---
function startEditMessage(wrapper, msgDiv) {
    // Trouver l'index dans STATE.conversationHistory
    const allWrappers = Array.from(chatContainer.querySelectorAll('.message-wrapper'));
    let histIdx = -1;
    let wIdx = 0;
    for (let i = 0; i < STATE.conversationHistory.length; i++) {
        if (STATE.conversationHistory[i].type === 'model-switch') continue;
        if (allWrappers[wIdx] === wrapper) { histIdx = i; break; }
        wIdx++;
    }
    if (histIdx < 0) return;

    const textEl = msgDiv.querySelector('.message-text');
    if (!textEl) return;
    const originalText = getTextFromContent(STATE.conversationHistory[histIdx].content);
    const btnRow = wrapper.querySelector('.message-btn-row');

    if (btnRow) btnRow.style.display = 'none';

    // Figer la largeur de la bulle avant de vider le contenu
    const bubbleWidth = msgDiv.offsetWidth;
    msgDiv.style.minWidth = bubbleWidth + 'px';

    // Remplacer le contenu par un textarea
    const editArea = document.createElement('textarea');
    editArea.className = 'message-edit-textarea';
    editArea.value = originalText;
    textEl.innerHTML = '';
    textEl.appendChild(editArea);
    // Adapter la hauteur au contenu après rendu
    requestAnimationFrame(() => {
        editArea.style.height = 'auto';
        editArea.style.height = editArea.scrollHeight + 'px';
    });
    editArea.addEventListener('input', () => {
        editArea.style.height = 'auto';
        editArea.style.height = editArea.scrollHeight + 'px';
    });
    editArea.focus();

    // Boutons confirmer / annuler
    const editActions = document.createElement('div');
    editActions.className = 'message-edit-actions';
    const confirmBtn = document.createElement('button');
    confirmBtn.className = 'message-edit-confirm';
    confirmBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg> Envoyer';
    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'message-edit-cancel';
    cancelBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg> Annuler';
    editActions.appendChild(confirmBtn);
    editActions.appendChild(cancelBtn);
    wrapper.insertBefore(editActions, btnRow);

    function cancelEdit() {
        textEl.textContent = originalText;
        editActions.remove();
        msgDiv.style.minWidth = '';
        if (btnRow) btnRow.style.display = '';
    }

    cancelBtn.addEventListener('click', cancelEdit);

    confirmBtn.addEventListener('click', async () => {
        const newText = editArea.value.trim();
        if (!newText) { cancelEdit(); return; }

        // Si un ou plusieurs tours IA postérieurs ont modifié le canvas, demander
        // confirmation et revenir à l'état pré-premier-tour (celui juste avant la
        // première réponse IA qu'on va écraser).
        let canvasSnapForEdit = null;
        for (let i = histIdx + 1; i < STATE.conversationHistory.length; i++) {
            const m = STATE.conversationHistory[i];
            if (m && m.role === 'assistant' && m.canvasBefore) {
                canvasSnapForEdit = m.canvasBefore;
                break;
            }
        }
        if (canvasSnapForEdit) {
            const ok = await confirmAndRewindCanvas(canvasSnapForEdit);
            if (!ok) return; // l'édition reste en cours, l'utilisateur peut Annuler manuellement
        }

        // Mettre à jour le message dans le DOM
        textEl.textContent = newText;
        editActions.remove();
        msgDiv.style.minWidth = '';
        if (btnRow) btnRow.style.display = '';

        // Tronquer l'historique : garder jusqu'à ce message (inclus), supprimer tout ce qui suit
        STATE.conversationHistory[histIdx].content = newText;
        STATE.conversationHistory.splice(histIdx + 1);

        const allElements = Array.from(chatContainer.children);
        const wrapperIndex = allElements.indexOf(wrapper);
        for (let i = allElements.length - 1; i > wrapperIndex; i--) {
            allElements[i].remove();
        }

        // On NE remet PAS à zéro les totaux : la régénération ajoutera son coût
        // par-dessus l'existant. Mettre à 0 ici provoquait un flash visuel des
        // tokens et du coût pendant le stream (gros recul UX) et serait également
        // incorrect — les tours antérieurs au message édité ont bien consommé
        // des tokens qu'il faut conserver dans le total cumulé.
        updateTokenDisplay();
        saveConversation();

        // Régénérer la réponse
        _userHasScrolledUp = false;
        STATE.isStreaming = true;
        if (window.Ocean?.setPaused) window.Ocean.setPaused(true);
        STATE.currentAbortController = new AbortController();
        updateSendButton();

        const _streamConvId = STATE.conversationId;
        const _streamHistory = STATE.conversationHistory;
        STATE._activeStreams.set(_streamConvId, { conversationId: _streamConvId, history: _streamHistory, abortController: STATE.currentAbortController });

        const assistantDiv = addMessage('assistant', '');
        assistantDiv.classList.add('streaming');
        const editGenStart = Date.now();

        var activeTextModel = STATE.currentModel || STATE.currentSearchModel;

        var _routedBy = null;
        var _routerFallback = null;
        if (activeTextModel && activeTextModel.indexOf('samagent-') === 0) {
            _showRouterThinking(assistantDiv);
            var _routeRegen = await routeModel(newText, activeTextModel);
            _hideRouterThinking(assistantDiv);
            _routedBy = _routeRegen.label;
            activeTextModel = _routeRegen.modelId;
            STATE._routerForceThinking = _routeRegen.thinking;
            _routerFallback = _routeRegen._fallback || null;
        }

        const spContent = spTextarea.value.trim() || null;

        // Branche modèle image : re-générer l'image avec generateImage au lieu de streamModel
        if (STATE.currentImageModel) {
            const regenRefImages = collectReferenceImages(STATE.conversationHistory);

            const _editImgFormat = document.getElementById('image-format-select').value;
            const _editImgParams = getImageParams();
            const _editImgModel = STATE.currentImageModel;
            generateImage(
                STATE.currentImageModel,
                newText,
                (result) => {
                    if (!STATE._activeStreams.has(_streamConvId)) return;
                    STATE._activeStreams.delete(_streamConvId);
                    const _isActive = isStreamActive(_streamConvId, _streamHistory);
                    // Abort utilisateur : ne pas persister un message assistant vide.
                    // `_streamConvId === conversationId` couvre aussi le cas où l'utilisateur
                    // est revenu sur la conv après avoir navigué.
                    if ((!result.images || result.images.length === 0) && !result.text) {
                        if (_streamConvId === STATE.conversationId) {
                            if (assistantDiv && assistantDiv.parentNode) assistantDiv.parentNode.removeChild(assistantDiv);
                            STATE.isStreaming = false;
                            STATE.currentAbortController = null;
                            updateSendButton();
                            addRegenBtn();
                        }
                        return;
                    }
                    if (_isActive) {
                        endStreaming(assistantDiv);
                        if (result.images.length > 0) {
                            assistantDiv.insertBefore(buildImagesContainer(result.images, { altText: 'Image générée' }), assistantDiv.firstChild);
                        }
                        const textElImg = assistantDiv.querySelector('.message-text');
                        if (textElImg && result.text) {
                            textElImg.innerHTML = marked.parse(result.text);
                            addCodeCopyButtons(textElImg);
                        } else if (textElImg) {
                            textElImg.remove();
                        }
                    }
                    const assistantContent = imageResultToContent(result);
                    const genSec = (Date.now() - editGenStart) / 1000;
                    const outTok = result.usage?.output_tokens || 0;
                    _streamHistory.push({ role: 'assistant', content: assistantContent.length === 1 && assistantContent[0].type === 'text' ? assistantContent[0].text : assistantContent, generationTime: genSec, outputTokens: outTok, model: _editImgModel });
                    const imgTarif = getImageTarif(_editImgModel);
                    const _resolved = _resolveImageCost(imgTarif, result.usage, result.imageCount, _editImgFormat, _editImgParams);
                    if (_isActive) {
                        attachCanvasBeforeToLastAssistant();
                        setGenTimeOnLastAssistant(genSec, outTok, _editImgModel);
                        if (result.usage) { STATE.totalInputTokens += result.usage.input_tokens || 0; STATE.totalOutputTokens += result.usage.output_tokens || 0; }
                        STATE.totalCost += _resolved.tokenCost;
                        STATE.totalImageCost += _resolved.imageCost;
                        addCostForModel(_editImgModel, result.usage?.input_tokens || 0, result.usage?.output_tokens || 0, _resolved.total);
                        updateTokenDisplay(); saveConversation(); addRegenBtn();
                        STATE.isStreaming = false; STATE.currentAbortController = null; updateSendButton(); promptInput.focus();
                    } else {
                        _saveConvById(_streamConvId, _streamHistory, {
                            tokensIn: result.usage?.input_tokens || 0,
                            tokensOut: result.usage?.output_tokens || 0,
                            cost: _resolved.tokenCost,
                            imageCost: _resolved.imageCost,
                            modelKey: _editImgModel
                        });
                    }
                },
                (err) => {
                    STATE._activeStreams.delete(_streamConvId);
                    if (_streamConvId !== STATE.conversationId) {
                        _streamHistory.push({ role: 'assistant', content: STREAM_ERROR_CONTENT, error: true });
                        _saveConvById(_streamConvId, _streamHistory, { modelKey: _editImgModel });
                        return;
                    }
                    handleApiError(assistantDiv, newText, [], _editImgModel || '', err);
                },
                regenRefImages,
                STATE.currentAbortController.signal,
                _editImgFormat,
                _editImgParams
            );
            return;
        }

        let fullResponse = '';
        let fullRawResponse = ''; // accumule les chunks bruts de l'IA (avant traitement canvas)
        let fullThinking = '';
        const sr = createStreamRenderer(assistantDiv, () => assistantDiv.querySelector('.message-text'));
        let thinkSr = null;
        function ensureThinkBlock() {
            let thinkBlock = assistantDiv.querySelector('.thinking-block');
            if (!thinkBlock) {
                const details = document.createElement('details');
                details.className = 'thinking-block'; details.open = true;
                const summary = document.createElement('summary');
                summary.textContent = 'Raisonnement';
                details.appendChild(summary);
                const tc = document.createElement('div');
                tc.className = 'thinking-content';
                details.appendChild(tc);
                assistantDiv.insertBefore(details, assistantDiv.firstChild);
            }
            if (!thinkSr) thinkSr = createStreamRenderer(assistantDiv, () => assistantDiv.querySelector('.thinking-content'));
        }

        const _canvasParser2 = buildCanvasParserIfActive();
        const _effectiveSp2 = effectiveSystemPrompt(spContent);
        streamModel(
            activeTextModel,
            _limitHistoryImages(STATE.conversationHistory, getMaxHistoryImages()),
            (chunk) => {
                fullRawResponse += chunk;
                let visible = chunk;
                if (_canvasParser2) visible = _canvasParser2.feed(chunk).visible;
                const _isActive = isStreamActive(_streamConvId, _streamHistory);
                if (!fullResponse && visible && _isActive) { if (thinkSr) thinkSr.flush(); collapseThinkBlock(assistantDiv.querySelector('.thinking-block')); }
                if (visible) { fullResponse += visible; if (_isActive) sr.add(visible); }
            },
            (usage, citations) => {
                if (!STATE._activeStreams.has(_streamConvId)) return;
                STATE._activeStreams.delete(_streamConvId);
                const _isActive = isStreamActive(_streamConvId, _streamHistory);
                if (_canvasParser2) {
                    const tail = _canvasParser2.flush().visible;
                    if (tail) { fullResponse += tail; if (_isActive) sr.add(tail); }
                }
                // Abort utilisateur sans aucun chunk reçu : ne pas pousser de bulle vide.
                // `_streamConvId === conversationId` couvre aussi le cas où l'utilisateur
                // est revenu sur la conv après avoir navigué.
                if (!usage && !fullResponse && !fullThinking) {
                    if (_streamConvId === STATE.conversationId) {
                        if (assistantDiv && assistantDiv.parentNode) assistantDiv.parentNode.removeChild(assistantDiv);
                        STATE.isStreaming = false;
                        STATE.currentAbortController = null;
                        updateSendButton();
                        addRegenBtn();
                    }
                    return;
                }
                if (_isActive) {
                    sr.flush();
                    if (thinkSr) thinkSr.flush();
                    endStreaming(assistantDiv);
                    if (!fullThinking.trim()) {
                        const eb = assistantDiv.querySelector('.thinking-block');
                        if (eb) eb.remove();
                    }
                    if (citations && citations.length > 0) appendCitations(assistantDiv, citations);
                }
                const genSec = (Date.now() - editGenStart) / 1000;
                const outTok = usage?.output_tokens || 0;
                _streamHistory.push({ role: 'assistant', content: fullResponse, citations: citations || undefined, generationTime: genSec, thinking: fullThinking || undefined, outputTokens: outTok, model: activeTextModel });
                let segCost = 0;
                if (usage) {
                    const segTarif = getTarif(activeTextModel) || getSearchTarif(activeTextModel);
                    segCost = _resolveTextCost(segTarif, usage);
                    segCost += calcWebSearchCost(activeTextModel, citations);
                }
                if (_isActive) {
                    attachCanvasBeforeToLastAssistant();
                    setGenTimeOnLastAssistant(genSec, outTok, activeTextModel);
                    if (usage) {
                        STATE.totalInputTokens += usage.input_tokens || 0; STATE.totalOutputTokens += usage.output_tokens || 0;
                        STATE.totalCost += segCost;
                        addCostForModel(activeTextModel, usage.input_tokens || 0, usage.output_tokens || 0, segCost);
                    }
                    updateTokenDisplay(); saveConversation(); addRegenBtn();
                    if (_routedBy && assistantDiv) {
                        var _ind2 = document.createElement('div');
                        _ind2.className = 'model-fusion-indicator';
                        _ind2.textContent = _routedBy;
                        assistantDiv.appendChild(_ind2);
                    }
                    STATE.isStreaming = false; STATE.currentAbortController = null; updateSendButton(); promptInput.focus();
                } else {
                    _saveConvById(_streamConvId, _streamHistory, {
                        tokensIn: usage?.input_tokens || 0,
                        tokensOut: usage?.output_tokens || 0,
                        cost: segCost,
                        modelKey: activeTextModel
                    });
                }
            },
            (err) => {
                STATE._activeStreams.delete(_streamConvId);
                if (_streamConvId !== STATE.conversationId) return;
                handleApiError(assistantDiv, newText, [], activeTextModel || '', err);
            },
            _effectiveSp2,
            STATE.webSearchEnabled && !hasBuiltInWebSearch(activeTextModel),
            (thinkChunk) => {
                fullThinking += thinkChunk;
                if (_streamConvId !== STATE.conversationId) return;
                ensureThinkBlock();
                thinkSr.add(thinkChunk);
            },
            STATE.currentAbortController.signal,
            (function() {
                var mp = getModelParams();
                if (STATE._routerForceThinking) {
                    mp = mp || {};
                    mp.reasoning_effort = mp.reasoning_effort || 'medium';
                    STATE._routerForceThinking = false;
                }
                return mp;
            })(),
            _routerFallback
        );
    });
}

// --- Scroll automatique ---
// --- Auto-scroll intelligent : ne pas forcer le scroll si l'utilisateur a remonté ---
let _userHasScrolledUp = false;

chatContainer.addEventListener('scroll', () => {
    // Seuil plus large sur mobile (200px) pour éviter que le clavier ou
    // un léger défilement tactile ne bloque l'auto-scroll vers le bas.
    const threshold = window.innerWidth < 768 ? 200 : 80;
    const atBottom = chatContainer.scrollHeight - chatContainer.scrollTop - chatContainer.clientHeight < threshold;
    _userHasScrolledUp = !atBottom;
});

// Clic sur un badge inline "Modification/Création/Suppression de {fichier}"
// dans une bulle IA → ouvre le canvas et sélectionne le fichier correspondant.
chatContainer.addEventListener('click', (e) => {
    const badge = e.target.closest('.canvas-inline-op');
    if (!badge) return;
    const name = badge.dataset.name;
    if (!name || !window.Canvas) return;
    e.preventDefault();
    // S'assurer que le canvas est actif et visible
    if (typeof window.Canvas.isActive === 'function' && !window.Canvas.isActive()) {
        window.Canvas.setActive(true);
    }
    if (typeof window.Canvas.showPanel === 'function') window.Canvas.showPanel();
    if (typeof window.Canvas.selectFile === 'function') {
        const ok = window.Canvas.selectFile(name);
        // Si le fichier n'existe plus (ex. supprimé plus tard), on ne fait
        // que signaler visuellement le clic (pas de jump).
        if (!ok) badge.classList.add('canvas-inline-op-missing');
    }
});

function scrollToBottom(force) {
    // Sur mobile, toujours forcer pendant le streaming (STATE.isStreaming)
    // car les events scroll du clavier virtuel faussent _userHasScrolledUp
    const isMobile = window.innerWidth < 768;
    if (!force && _userHasScrolledUp && !(isMobile && STATE.isStreaming)) return;
    chatContainer.scroll({ top: chatContainer.scrollHeight, behavior: 'instant' });
}

// --- Gestion centralisée des erreurs API ---
function handleApiError(assistantDiv, userText, fileNames, modelName, err) {
    const errorContent = STREAM_ERROR_CONTENT;
    // Débloquer l'UI immédiatement (saisie + envoi) : explainError est un appel
    // LLM asynchrone qui peut être lent — mais on garde la bulle en état
    // « Génération en cours… » jusqu'à ce que l'analyse arrive (ou timeout 15 s),
    // pour ne pas afficher le message d'erreur AVANT le popup d'analyse.
    STATE.isStreaming = false;
    STATE.currentAbortController = null;
    endStreaming(assistantDiv);
    updateSendButton();
    promptInput.focus();

    let finalized = false;
    const finalize = (explanation) => {
        if (finalized) return;
        finalized = true;
        applyErrorStyle(assistantDiv);
        const last = STATE.conversationHistory[STATE.conversationHistory.length - 1];
        if (last && last.role === 'assistant') {
            last.content = errorContent;
            last.error = true;
        } else {
            STATE.conversationHistory.push({ role: 'assistant', content: errorContent, error: true });
        }
        if (STATE.conversationId) saveConversation();
        addRegenBtn();
        const el = assistantDiv.querySelector('.message-text');
        if (el) el.textContent = errorContent;
        showErrorAlert(explanation, err.message);
    };

    const timeoutId = setTimeout(() => finalize(null), 15000);
    explainError(userText, fileNames, modelName, err.message)
        .then(explanation => { clearTimeout(timeoutId); finalize(explanation); })
        .catch(() => { clearTimeout(timeoutId); finalize(null); });
}

// --- Appliquer le style d'erreur à une bulle assistant (visuel uniquement) ---
function applyErrorStyle(msgDiv) {
    msgDiv.classList.add('message-error');
    const btnRow = msgDiv.parentElement?.querySelector('.message-btn-row');
    if (btnRow) {
        Array.from(btnRow.children).forEach(b => b.style.display = 'none');
    }
}

// --- Envoyer le message ---
async function sendMessage() {
    const text = promptInput.value.trim();
    if ((!text && STATE.pendingImages.length === 0 && STATE.pendingFiles.length === 0) || STATE.isStreaming) return;
    if (STATE.pendingLoadingFiles.length > 0) {
        const names = STATE.pendingLoadingFiles.map(e => e.name).join(', ');
        customAlert(`Patientez quelques instants : ${names} ${STATE.pendingLoadingFiles.length > 1 ? 'sont encore' : 'est encore'} en cours de chargement.`, 'wait');
        return;
    }

    _userHasScrolledUp = false;
    removeRegenBtn();

    // Sur mobile, fermer le clavier et attendre que le viewport se stabilise
    // avant de scroller. Sans ça, le scroll se fait sur un viewport réduit
    // (clavier visible) et après fermeture du clavier on se retrouve trop haut.
    if (window.innerWidth < 768) {
        promptInput.blur();
        let _mobileScrollDone = false;
        const _mobileForceScroll = () => {
            if (_mobileScrollDone) return;
            _mobileScrollDone = true;
            _userHasScrolledUp = false;
            scrollToBottom(true);
        };
        // Tenter après 200ms et 500ms (le clavier met ~300-400ms à se fermer)
        setTimeout(_mobileForceScroll, 200);
        setTimeout(_mobileForceScroll, 500);
        // VisualViewport : détecter quand le clavier est vraiment fermé
        if (window.visualViewport) {
            let _stableTimer;
            const _onResize = () => {
                clearTimeout(_stableTimer);
                _stableTimer = setTimeout(_mobileForceScroll, 150);
            };
            window.visualViewport.addEventListener('resize', _onResize, { once: false });
            setTimeout(() => window.visualViewport.removeEventListener('resize', _onResize), 1500);
        }
    }

    // Vérifier qu'un modèle est sélectionné
    if (!STATE.currentModel && !STATE.currentImageModel && !STATE.currentSearchModel) {
        showModelAlert();
        return;
    }

    if (!STATE.conversationId) {
        let _firstLabel = text;
        if (!_firstLabel) {
            if (STATE.pendingImages.length > 0) {
                _firstLabel = '(image)';
            } else if (STATE.pendingFiles.length > 0) {
                _firstLabel = STATE.pendingFiles.length === 1
                    ? `(${STATE.pendingFiles[0].name})`
                    : '(fichiers joints)';
            } else {
                _firstLabel = '(message)';
            }
        }
        STATE.firstPrompt = _firstLabel;
        STATE.conversationStartTime = new Date().toISOString();
        STATE.conversationId = generateConversationId(STATE.firstPrompt);
        const _newFn = STATE.conversationId.replace(/[<>:"/\\|?*]/g, '_') + '.json';
        localStorage.setItem('cetas-last-conv', _newFn);
    }
    STATE.conversationLastActivity = new Date().toISOString();

    if (!STATE.conversationStarted) {
        STATE.conversationStarted = true;
    }
    // Mettre à jour le system prompt à chaque envoi
    if (spSelect.value) {
        const opt = spSelect.selectedOptions[0];
        STATE.currentSystemPrompt = { nom: opt.textContent, contenu: spTextarea.value || opt.dataset.contenu };
    } else if (spTextarea.value.trim()) {
        STATE.currentSystemPrompt = { nom: 'Personnalisé', contenu: spTextarea.value };
    } else {
        STATE.currentSystemPrompt = null;
    }

    // Construire le contenu du message (texte simple ou multimodal)
    let messageContent;
    if (STATE.pendingImages.length > 0 || STATE.pendingFiles.length > 0) {
        messageContent = [];
        if (text) {
            messageContent.push({ type: 'text', text });
        }
        for (const img of STATE.pendingImages) {
            const base64 = img.dataUrl.split(',')[1];
            messageContent.push({ type: 'image', data: base64, mimeType: img.mimeType, dataUrl: img.dataUrl });
        }
        for (const file of STATE.pendingFiles) {
            messageContent.push({ type: 'file', name: file.name, mimeType: file.mimeType, data: file.data, textContent: file.textContent });
        }
        STATE.pendingImages = [];
        STATE.pendingFiles = [];
        attachPreview.innerHTML = '';
    } else {
        messageContent = text;
    }

    addMessage('user', messageContent);
    STATE.conversationHistory.push({ role: 'user', content: messageContent });

    // Persister tout de suite la conversation sur disque pour qu'elle apparaisse
    // dans la liste même si l'utilisateur change de conversation avant la fin du stream.
    saveConversation();

    // Réinitialiser le champ de saisie
    promptInput.value = '';
    promptInput.style.height = 'auto';
    STATE.originalPromptBeforeEnhance = null;
    STATE.isStreaming = true;
    if (window.Ocean?.setPaused) window.Ocean.setPaused(true);
    STATE.currentAbortController = new AbortController();
    updateSendButton();

    // Capturer le contexte de la conversation pour ce stream :
    // permet la poursuite de la génération même si l'utilisateur change de conversation.
    const _streamConvId = STATE.conversationId;
    const _streamHistory = STATE.conversationHistory;
    const _streamCtx = { conversationId: _streamConvId, history: _streamHistory, abortController: STATE.currentAbortController };
    STATE._activeStreams.set(_streamConvId, _streamCtx);

    const assistantDiv = addMessage('assistant', '');
    assistantDiv.classList.add('streaming');
    const genStartTime = Date.now();

    // Vérification de sécurité : s'assurer que le modèle image est valide.
    // Doit être effectuée AVANT la capture d'`activeTextModel` pour que la bascule
    // d'un modèle image invalide vers le mode texte soit prise en compte.
    if (STATE.currentImageModel && !getImageModelEditeur(STATE.currentImageModel)) {
        STATE.currentModel = STATE.currentImageModel;
        STATE.currentImageModel = null;
    }

    var activeTextModel = STATE.currentModel || STATE.currentSearchModel;

    var _routedBy = null;
    var _routerFallback = null;
    if (activeTextModel && activeTextModel.indexOf('samagent-') === 0) {
        _showRouterThinking(assistantDiv);
        var _route = await routeModel(text, activeTextModel);
        _hideRouterThinking(assistantDiv);
        _routedBy = _route.label;
        activeTextModel = _route.modelId;
        STATE._routerForceThinking = _route.thinking;
        _routerFallback = _route._fallback || null;
    }

    if (STATE.currentImageModel) {
        // --- Mode génération d'image ---
        // Enrichir le prompt avec le contexte conversationnel (helper partagé avec la régénération)
        const imagePrompt = buildImagePrompt(text, STATE.conversationHistory);

        // Images de référence : jointes au message courant + dernier batch précédent.
        const referenceImages = collectReferenceImages(STATE.conversationHistory);

        const _imgFormat = document.getElementById('image-format-select')?.value || 'auto';
        const _imgParams = getImageParams();
        const _imgModelAtStart = STATE.currentImageModel;
        _streamCtx.type = 'image';
        _streamCtx.model = _imgModelAtStart;
        _streamCtx.assistantDiv = assistantDiv;
        generateImage(
            STATE.currentImageModel,
            imagePrompt,
            // onDone
            (result) => {
                const _ctx = STATE._activeStreams.get(_streamConvId);
                if (!_ctx) return;
                STATE._activeStreams.delete(_streamConvId);
                const _isActive = isStreamActive(_streamConvId, _streamHistory);

                // Abort utilisateur (avant tout résultat) : `generateImage` retourne
                // un résultat vide pour signaler l'AbortError. Ne pas persister un
                // message assistant vide dans l'history. On libère l'UI dès que la
                // conv courante correspond au stream (même si l'history a été remplacée
                // par un loadConversation entre-temps).
                if ((!result.images || result.images.length === 0) && !result.text) {
                    if (_streamConvId === STATE.conversationId) {
                        if (assistantDiv && assistantDiv.parentNode) assistantDiv.parentNode.removeChild(assistantDiv);
                        STATE.isStreaming = false;
                        STATE.currentAbortController = null;
                        updateSendButton();
                        addRegenBtn();
                    }
                    return;
                }

                if (_isActive) {
                    endStreaming(assistantDiv);
                    if (result.images.length > 0) {
                        assistantDiv.insertBefore(buildImagesContainer(result.images, { altText: 'Image générée' }), assistantDiv.firstChild);
                    }
                    const textEl = assistantDiv.querySelector('.message-text');
                    if (textEl && result.text) {
                        textEl.innerHTML = marked.parse(result.text);
                        addCodeCopyButtons(textEl);
                    } else if (textEl) {
                        textEl.remove();
                    }
                }

                const assistantContent = imageResultToContent(result);
                const genSeconds = (Date.now() - genStartTime) / 1000;
                const imgOutTok = result.usage?.output_tokens || 0;
                _streamHistory.push({
                    role: 'assistant',
                    content: assistantContent.length === 1 && assistantContent[0].type === 'text' ? assistantContent[0].text : assistantContent,
                    generationTime: genSeconds,
                    outputTokens: imgOutTok,
                    model: _imgModelAtStart
                });

                const imgTarif = getImageTarif(_imgModelAtStart);
                const _resolved = _resolveImageCost(imgTarif, result.usage, result.imageCount, _imgFormat, _imgParams);

                if (_isActive) {
                    attachCanvasBeforeToLastAssistant();
                    setGenTimeOnLastAssistant(genSeconds, imgOutTok, _imgModelAtStart);
                    if (result.usage) {
                        STATE.totalInputTokens += result.usage.input_tokens || 0;
                        STATE.totalOutputTokens += result.usage.output_tokens || 0;
                    }
                    STATE.totalCost += _resolved.tokenCost;
                    STATE.totalImageCost += _resolved.imageCost;
                    addCostForModel(_imgModelAtStart, result.usage?.input_tokens || 0, result.usage?.output_tokens || 0, _resolved.total);
                    updateTokenDisplay();
                    saveConversation();
                    scrollToBottom(true);
                    addRegenBtn();
                    maybeGenerateTitle();
                    STATE.isStreaming = false;
                    STATE.currentAbortController = null;
                    updateSendButton();
                    promptInput.focus();
                } else {
                    _saveConvById(_streamConvId, _streamHistory, {
                        tokensIn: result.usage?.input_tokens || 0,
                        tokensOut: result.usage?.output_tokens || 0,
                        cost: _resolved.tokenCost,
                        imageCost: _resolved.imageCost,
                        modelKey: _imgModelAtStart
                    });
                }
            },
            // onError
            (err) => {
                STATE._activeStreams.delete(_streamConvId);
                if (_streamConvId !== STATE.conversationId) {
                    // Stream en arrière-plan : persister un marqueur d'erreur pour
                    // que l'utilisateur le voie au retour sur la conversation.
                    _streamHistory.push({ role: 'assistant', content: STREAM_ERROR_CONTENT, error: true });
                    _saveConvById(_streamConvId, _streamHistory, { modelKey: _imgModelAtStart });
                    return;
                }
                const userText = typeof messageContent === 'string' ? messageContent : (Array.isArray(messageContent) ? messageContent.filter(p => p.type === 'text').map(p => p.text).join(' ') : '');
                const fileNames = Array.isArray(messageContent) ? messageContent.filter(p => p.type === 'file' || p.type === 'image').map(p => p.name || p.mimeType || 'image') : [];
                handleApiError(assistantDiv, userText, fileNames, _imgModelAtStart || '', err);
            },
            referenceImages,
            STATE.currentAbortController.signal,
            _imgFormat,
            _imgParams
        );
    } else {
        // --- Mode texte / recherche (streaming) ---
        const spContent = STATE.currentSystemPrompt ? STATE.currentSystemPrompt.contenu : null;
        // Enrichir le contexte de stream avec tout ce qui est nécessaire pour rebinder
        // l'affichage live si l'utilisateur revient sur la conversation.
        _streamCtx.type = 'text';
        _streamCtx.model = activeTextModel;
        _streamCtx.assistantDiv = assistantDiv;
        _streamCtx.canvasParser = buildCanvasParserIfActive();
        _streamCtx.sr = createStreamRenderer(assistantDiv, () => assistantDiv.querySelector('.message-text'));
        _streamCtx.thinkSr = null;
        _streamCtx.accumulatedText = '';
        _streamCtx.accumulatedThinking = '';
        _streamCtx.accumulatedRaw = '';
        _streamCtx.genStartTime = genStartTime;

        function ensureThinkBlock() {
            const ad = _streamCtx.assistantDiv;
            if (!ad) return;
            let thinkBlock = ad.querySelector('.thinking-block');
            if (!thinkBlock) {
                const details = document.createElement('details');
                details.className = 'thinking-block';
                details.open = true;
                const summary = document.createElement('summary');
                summary.textContent = 'Raisonnement';
                details.appendChild(summary);
                const thinkContent = document.createElement('div');
                thinkContent.className = 'thinking-content';
                details.appendChild(thinkContent);
                ad.insertBefore(details, ad.firstChild);
            }
            if (!_streamCtx.thinkSr) {
                _streamCtx.thinkSr = createStreamRenderer(_streamCtx.assistantDiv, () => _streamCtx.assistantDiv.querySelector('.thinking-content'));
            }
        }

        const _effectiveSp3 = effectiveSystemPrompt(spContent);
        streamModel(
            activeTextModel,
            _limitHistoryImages(STATE.conversationHistory, getMaxHistoryImages()),
            // onChunk
            (chunk) => {
                _streamCtx.accumulatedRaw += chunk;
                let visible = chunk;
                if (_streamCtx.canvasParser) visible = _streamCtx.canvasParser.feed(chunk).visible;
                const _isVisible = (_streamConvId === STATE.conversationId) && _streamCtx.assistantDiv && _streamCtx.assistantDiv.isConnected;
                if (!_streamCtx.accumulatedText && visible && _isVisible) {
                    if (_streamCtx.thinkSr) _streamCtx.thinkSr.flush();
                    collapseThinkBlock(_streamCtx.assistantDiv.querySelector('.thinking-block'));
                }
                if (visible) {
                    _streamCtx.accumulatedText += visible;
                    if (_isVisible && _streamCtx.sr) _streamCtx.sr.add(visible);
                    // Génération du titre en parallèle dès les premiers tokens
                    // (~40 caractères suffisent comme contexte pour le modèle de
                    // titrage). Sans ça, le titre n'apparaissait dans la sidebar
                    // qu'après la fin complète du stream, parfois plusieurs secondes
                    // après le début de la réponse.
                    if (!_streamCtx.titleEarlyDone
                        && _streamHistory.length === 1
                        && _streamCtx.accumulatedText.length >= 40) {
                        _streamCtx.titleEarlyDone = true;
                        const _synth = [_streamHistory[0], { role: 'assistant', content: _streamCtx.accumulatedText }];
                        try { maybeGenerateTitle(_streamConvId, _synth, activeTextModel); } catch {}
                    }
                }
            },
            // onDone(usage, citations)
            (usage, citations) => {
                const _ctx = STATE._activeStreams.get(_streamConvId);
                if (!_ctx) return; // déjà nettoyé / annulé
                STATE._activeStreams.delete(_streamConvId);
                const _isVisible = (_streamConvId === STATE.conversationId) && _streamCtx.assistantDiv && _streamCtx.assistantDiv.isConnected;
                const _canSaveGlobals = _isVisible && (_streamHistory === STATE.conversationHistory);

                if (_streamCtx.canvasParser) {
                    const tail = _streamCtx.canvasParser.flush().visible;
                    if (tail) { _streamCtx.accumulatedText += tail; if (_isVisible && _streamCtx.sr) _streamCtx.sr.add(tail); }
                }
                const fullResponse = _streamCtx.accumulatedText;
                const fullThinking = _streamCtx.accumulatedThinking;
                const ad = _streamCtx.assistantDiv;

                // Abort utilisateur avant tout chunk : `streamModel` retourne usage=null
                // sur AbortError. Si l'accumulé est vide, ne pas pousser un assistant fantôme.
                // On utilise `_isVisible` (et non `_canSaveGlobals`) pour libérer
                // l'UI : si l'utilisateur a navigué puis est revenu, `conversationHistory`
                // est un nouveau tableau (donc !== _streamHistory), mais l'STATE.isStreaming
                // global a été remis à true par `loadConversation` et doit être libéré.
                if (!usage && !fullResponse && !fullThinking) {
                    if (_isVisible) {
                        if (ad && ad.parentNode) ad.parentNode.removeChild(ad);
                        STATE.isStreaming = false;
                        STATE.currentAbortController = null;
                        updateSendButton();
                        addRegenBtn();
                    }
                    return;
                }
                if (_isVisible) {
                    if (_streamCtx.sr) _streamCtx.sr.flush();
                    if (_streamCtx.thinkSr) _streamCtx.thinkSr.flush();
                    endStreaming(ad);
                    if (!fullThinking.trim()) {
                        const emptyBlock = ad.querySelector('.thinking-block');
                        if (emptyBlock) emptyBlock.remove();
                    }
                    if (citations && citations.length > 0) {
                        appendCitations(ad, citations);
                    }
                }

                const genSeconds = (Date.now() - genStartTime) / 1000;
                const mainOutTok = usage?.output_tokens || 0;
                _streamHistory.push({ role: 'assistant', content: fullResponse, citations: citations || undefined, generationTime: genSeconds, thinking: fullThinking || undefined, outputTokens: mainOutTok, model: activeTextModel });

                let segCost = 0;
                if (usage) {
                    const segTarif = getTarif(activeTextModel) || getSearchTarif(activeTextModel);
                    segCost = _resolveTextCost(segTarif, usage);
                    segCost += calcWebSearchCost(activeTextModel, citations);
                }

                if (_canSaveGlobals) {
                    attachCanvasBeforeToLastAssistant();
                    if (ad) ad._rawMarkdown = fullResponse;
                    setGenTimeOnLastAssistant(genSeconds, mainOutTok, activeTextModel);
                    if (usage) {
                        STATE.totalInputTokens += usage.input_tokens || 0;
                        STATE.totalOutputTokens += usage.output_tokens || 0;
                        STATE.totalCost += segCost;
                        addCostForModel(activeTextModel, usage.input_tokens || 0, usage.output_tokens || 0, segCost);
                    }
                    updateTokenDisplay();
                    saveConversation();
                    addRegenBtn();
                    // Indicateur Model Fusion
                    if (_routedBy && _streamCtx.assistantDiv) {
                        var _ind = document.createElement('div');
                        _ind.className = 'model-fusion-indicator';
                        _ind.textContent = _routedBy;
                        _streamCtx.assistantDiv.appendChild(_ind);
                    }
                    if (!_streamCtx.titleEarlyDone) maybeGenerateTitle();
                    STATE.isStreaming = false;
                    STATE.currentAbortController = null;
                    updateSendButton();
                    promptInput.focus();
                } else {
                    _saveConvById(_streamConvId, _streamHistory, {
                        tokensIn: usage?.input_tokens || 0,
                        tokensOut: usage?.output_tokens || 0,
                        cost: segCost,
                        modelKey: activeTextModel
                    });
                }
            },
            // onError
            (err) => {
                STATE._activeStreams.delete(_streamConvId);
                if (_streamConvId !== STATE.conversationId) {
                    // Stream en arrière-plan : persister un marqueur d'erreur pour
                    // que l'utilisateur le voie au retour sur la conversation.
                    _streamHistory.push({ role: 'assistant', content: STREAM_ERROR_CONTENT, error: true });
                    _saveConvById(_streamConvId, _streamHistory, { modelKey: activeTextModel });
                    return;
                }
                const userText = typeof messageContent === 'string' ? messageContent : (Array.isArray(messageContent) ? messageContent.filter(p => p.type === 'text').map(p => p.text).join(' ') : '');
                const fileNames = Array.isArray(messageContent) ? messageContent.filter(p => p.type === 'file' || p.type === 'image').map(p => p.name || p.mimeType || 'image') : [];
                handleApiError(_streamCtx.assistantDiv, userText, fileNames, activeTextModel || '', err);
            },
            _effectiveSp3,
            STATE.webSearchEnabled && !hasBuiltInWebSearch(activeTextModel),
            // onThinkingChunk
            (thinkChunk) => {
                _streamCtx.accumulatedThinking += thinkChunk;
                if (_streamConvId !== STATE.conversationId || !_streamCtx.assistantDiv || !_streamCtx.assistantDiv.isConnected) return;
                ensureThinkBlock();
                if (_streamCtx.thinkSr) _streamCtx.thinkSr.add(thinkChunk);
            },
            STATE.currentAbortController.signal,
            (function() {
                var mp = getModelParams();
                if (STATE._routerForceThinking) {
                    mp = mp || {};
                    mp.reasoning_effort = mp.reasoning_effort || 'medium';
                    STATE._routerForceThinking = false;
                }
                return mp;
            })(),
            _routerFallback
        );
    }
}

// --- Liste des conversations (module conversations.js) ---

// --- Rôles (System Prompts) (module roles.js) ---
setRolesCallbacks({
    customConfirm,
    showModelAlert,
    showNoModelAlert,
    customAlert,
    openRolesManage
});
initRoles();

// --- Prompts enregistrés (module prompts.js) ---
setPromptsCallbacks({
    customConfirm,
    showNoModelAlert,
    customAlert,
    openPromptsManage
});
initPrompts();

// --- Prompt Picker (dropdown dans la zone de saisie) ---

// Afficher la liste de prompts au focus sur le textarea (si vide)
async function togglePromptPicker() {
    // Si le dropdown est actuellement visible (display === ''), le fermer
    if (promptPickerDropdownWrapper.style.display === '') {
        promptPickerDropdownWrapper.style.display = 'none';
        showInsertBtn();
        return;
    }
    const prompts = await listSavedPrompts();
    promptPickerDropdown.innerHTML = '';

    if (prompts.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'prompt-picker-empty';
        empty.textContent = 'Aucun prompt enregistré';
        promptPickerDropdown.appendChild(empty);
        promptPickerDropdownWrapper.style.display = '';
        hideInsertBtn();
        return;
    }
    for (const pr of prompts) {
        const item = document.createElement('div');
        item.className = 'prompt-picker-item';

        const name = document.createElement('div');
        name.className = 'prompt-picker-item-name';
        name.textContent = pr.nom;

        const preview = document.createElement('div');
        preview.className = 'prompt-picker-item-preview';
        preview.textContent = pr.contenu.substring(0, 80) + (pr.contenu.length > 80 ? '...' : '');

        item.appendChild(name);
        item.appendChild(preview);
        item.addEventListener('mousedown', (e) => {
            e.preventDefault();
            // Insérer à la position du curseur
            const start = promptInput.selectionStart;
            const end = promptInput.selectionEnd;
            const val = promptInput.value;
            const before = val.substring(0, start);
            const after = val.substring(end);
            const sep = before.length > 0 && !before.endsWith(' ') && !before.endsWith('\n') ? ' ' : '';
            const sepAfter = after.length > 0 && !after.startsWith(' ') && !after.startsWith('\n') ? ' ' : '';
            const inserted = sep + pr.contenu + sepAfter;
            promptInput.value = before + inserted + after;
            // Placer le curseur après le texte inséré
            const newPos = start + inserted.length;
            promptInput.setSelectionRange(newPos, newPos);
            promptInput.dispatchEvent(new Event('input'));
            promptPickerDropdownWrapper.style.display = 'none';
            hideInsertBtn();
            promptInput.focus();
        });
        promptPickerDropdown.appendChild(item);
    }
    hideInsertBtn();
    promptPickerDropdownWrapper.style.display = '';
}

// Bouton "Insérer un prompt" dans la toolbar
toolbarInsertBtn.addEventListener('click', () => togglePromptPicker());

document.addEventListener('click', (e) => {
    if (!toolbarInsertBtn.contains(e.target) && !promptPickerDropdownWrapper.contains(e.target)) {
        if (promptPickerDropdownWrapper.style.display !== 'none') {
            promptPickerDropdownWrapper.style.display = 'none';
            if (toolbarInsertBtn.classList.contains('floating')) {
                showInsertBtn();
            }
        }
    }
});

// --- Micro : dictée vocale via Whisper (module whisper.js) ---
setWhisperCallbacks({
    showNoModelAlert,
    customAlert,
    addCostForModel,
    updateTokenDisplay,
    saveConversation
});
initWhisper(micBtn, promptInput);

// --- Popups Gestion Rôles / Prompts (sidebar) ---

const rolesManageOverlay = document.getElementById('roles-manage-overlay');
const rolesManageList = document.getElementById('roles-manage-list');
const rolesManageEmpty = document.getElementById('roles-manage-empty');
const rolesManageClose = document.getElementById('roles-manage-close');
const rolesManageAdd = document.getElementById('roles-manage-add');
const rolesManageImport = document.getElementById('roles-manage-import');
const sidebarRolesBtn = document.getElementById('sidebar-roles-btn');

const promptsManageOverlay = document.getElementById('prompts-manage-overlay');
const promptsManageList = document.getElementById('prompts-manage-list');
const promptsManageEmpty = document.getElementById('prompts-manage-empty');
const promptsManageClose = document.getElementById('prompts-manage-close');
const promptsManageAdd = document.getElementById('prompts-manage-add');
const sidebarPromptsBtn = document.getElementById('sidebar-prompts-btn');

function openRolesManage() {
    renderRolesManageList();
    rolesManageOverlay.style.display = 'flex';
}

function closeRolesManage() {
    rolesManageOverlay.style.display = 'none';
}

async function renderRolesManageList() {
    const prompts = await listSystemPrompts();
    rolesManageList.innerHTML = '';
    rolesManageEmpty.style.display = prompts.length ? 'none' : 'block';
    for (const sp of prompts) {
        const item = document.createElement('div');
        item.className = 'manage-list-item';

        item.innerHTML =
            `<div class="manage-list-item-icon">` +
                `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>` +
            `</div>` +
            `<div class="manage-list-item-info">` +
                `<span class="manage-list-item-name"></span>` +
                `<span class="manage-list-item-preview"></span>` +
            `</div>` +
            `<button class="manage-list-item-share" title="Partager">` +
                `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>` +
            `</button>` +
            `<span class="manage-list-item-arrow">›</span>`;

        var _mName = item.querySelector('.manage-list-item-name');
        var _mPrev = item.querySelector('.manage-list-item-preview');
        if (_mName) _mName.textContent = sp.nom;
        if (_mPrev) _mPrev.textContent = sp.contenu.substring(0, 60) + (sp.contenu.length > 60 ? '…' : '');

        item.querySelector('.manage-list-item-share').addEventListener('click', (e) => {
            e.stopPropagation();
            exportSpItem(sp.filename);
        });

        item.addEventListener('click', () => {
            closeRolesManage();
            openSpModal(sp.filename, true);
        });

        rolesManageList.appendChild(item);
    }
}

sidebarRolesBtn.addEventListener('click', openRolesManage);
rolesManageClose.addEventListener('click', closeRolesManage);
rolesManageOverlay.addEventListener('click', (e) => { if (e.target === rolesManageOverlay) closeRolesManage(); });
rolesManageAdd.addEventListener('click', () => {
    closeRolesManage();
    openSpModal(null, true);
});
rolesManageImport.addEventListener('click', () => spImportFile.click());

function openPromptsManage() {
    renderPromptsManageList();
    promptsManageOverlay.style.display = 'flex';
}

function closePromptsManage() {
    promptsManageOverlay.style.display = 'none';
}

async function renderPromptsManageList() {
    const prompts = await listSavedPrompts();
    promptsManageList.innerHTML = '';
    promptsManageEmpty.style.display = prompts.length ? 'none' : 'block';
    for (const pr of prompts) {
        const item = document.createElement('div');
        item.className = 'manage-list-item';

        item.innerHTML =
            `<div class="manage-list-item-icon">` +
                `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>` +
            `</div>` +
            `<div class="manage-list-item-info">` +
                `<span class="manage-list-item-name"></span>` +
                `<span class="manage-list-item-preview"></span>` +
            `</div>` +
            `<button class="manage-list-item-share" title="Partager">` +
                `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>` +
            `</button>` +
            `<span class="manage-list-item-arrow">›</span>`;

        var _mName2 = item.querySelector('.manage-list-item-name');
        var _mPrev2 = item.querySelector('.manage-list-item-preview');
        if (_mName2) _mName2.textContent = pr.nom;
        if (_mPrev2) _mPrev2.textContent = pr.contenu.substring(0, 60) + (pr.contenu.length > 60 ? '…' : '');

        item.querySelector('.manage-list-item-share').addEventListener('click', (e) => {
            e.stopPropagation();
            exportPrItem(pr.filename);
        });

        item.addEventListener('click', () => {
            closePromptsManage();
            openPrModal(pr.filename, '', true);
        });

        promptsManageList.appendChild(item);
    }
}

sidebarPromptsBtn.addEventListener('click', openPromptsManage);
promptsManageClose.addEventListener('click', closePromptsManage);
promptsManageOverlay.addEventListener('click', (e) => { if (e.target === promptsManageOverlay) closePromptsManage(); });
promptsManageAdd.addEventListener('click', () => {
    closePromptsManage();
    openPrModal(null, '', true);
});

// Export (partage) d'un prompt
async function exportPrItem(filename) {
    const data = await readSavedPrompt(filename);
    if (!data) return;
    const exportData = { _minou_prompt: true, nom: data.nom, contenu: data.contenu };
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const safeName = data.nom.replace(/[^a-zA-Z0-9àâéèêëïîôùûüçÀÂÉÈÊËÏÎÔÙÛÜÇ _-]/g, '_');
    a.download = `prompt-${safeName}.json`;
    a.click();
    URL.revokeObjectURL(url);
}

// Import d'un prompt
const prImportFile = document.getElementById('pr-import-file');
const promptsManageImport = document.getElementById('prompts-manage-import');

promptsManageImport.addEventListener('click', () => prImportFile.click());

prImportFile.addEventListener('change', async () => {
    const file = prImportFile.files[0];
    if (!file) return;
    prImportFile.value = '';
    try {
        const text = await file.text();
        const data = JSON.parse(text);
        if (!data._minou_prompt || !data.nom || !data.contenu) {
            showModelAlert('Ce fichier n\'est pas un prompt Cetas valide.');
            return;
        }
        const filename = data.nom.replace(/[^a-zA-Z0-9àâéèêëïîôùûüçÀÂÉÈÊËÏÎÔÙÛÜÇ _-]/g, '_') + '.json';
        await writeSavedPrompt(filename, { nom: data.nom, contenu: data.contenu });
        refreshPrList();
        renderPromptsManageList();
    } catch (e) {
        console.error('Erreur import prompt:', e);
        showModelAlert('Erreur lors de l\'import du prompt.');
    }
});

// --- Export / Import (module export-import.js) ---
setExportImportCallbacks({
    showModelAlert,
    customConfirm,
    refreshConvList,
    populateUnifiedSelect
});
initExportImport();

// --- Modale Sauvegarde ---
const dashboardBtn = document.getElementById('dashboard-btn');
const saveModalOverlay = document.getElementById('save-modal-overlay');
const saveModalClose = document.getElementById('save-modal-close');
const saveModalExportBtn = document.getElementById('save-modal-export-btn');
const saveModalImportBtn = document.getElementById('save-modal-import-btn');

dashboardBtn.addEventListener('click', () => {
    saveModalOverlay.style.display = 'flex';
});

const sidebarFaqBtn = document.getElementById('sidebar-faq-btn');
if (sidebarFaqBtn) {
    sidebarFaqBtn.addEventListener('click', () => {
        openApiKeysModal('faq');
    });
}

// ── Effacer toutes les conversations ──────────────────────────────
const clearAllBtn = document.getElementById('clear-all-btn');
const clearAllOverlay = document.getElementById('clear-all-overlay');
const clearAllCancel = document.getElementById('clear-all-cancel');
const clearAllConfirm = document.getElementById('clear-all-confirm');
const clearAllCodeInput = document.getElementById('clear-all-code-input');
const clearAllCodeDisplay = document.getElementById('clear-all-code');
let _clearAllExpectedCode = '';

if (clearAllBtn) {
    clearAllBtn.addEventListener('click', () => {
        _clearAllExpectedCode = _generateClearCode();
        clearAllCodeDisplay.textContent = _clearAllExpectedCode;
        clearAllCodeInput.value = '';
        clearAllConfirm.disabled = true;
        clearAllOverlay.style.display = 'flex';
    });
}

clearAllCancel.addEventListener('click', () => {
    clearAllOverlay.style.display = 'none';
});

clearAllOverlay.addEventListener('click', (e) => {
    if (e.target === clearAllOverlay) clearAllOverlay.style.display = 'none';
});

clearAllCodeInput.addEventListener('input', () => {
    clearAllConfirm.disabled = clearAllCodeInput.value.toUpperCase() !== _clearAllExpectedCode;
});

clearAllConfirm.addEventListener('click', async () => {
    if (clearAllCodeInput.value.toUpperCase() !== _clearAllExpectedCode) return;
    clearAllConfirm.textContent = 'Suppression...';
    clearAllConfirm.disabled = true;
    try {
        await _deleteAllConversations();
        clearAllOverlay.style.display = 'none';
        customAlert('Toutes les conversations ont été supprimées.', 'success');
    } catch (e) {
        customAlert('Erreur : ' + (e.message || 'inconnue'), 'error');
    }
    clearAllConfirm.textContent = 'Effacer tout';
    clearAllConfirm.disabled = false;
});

function _generateClearCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
    return code;
}

async function _deleteAllConversations() {
    const convs = await listAllConvStats();
    // Supprimer localement (IndexedDB) + côté serveur en parallèle
    for (const c of convs) {
        if (!c.filename) continue;
        if (typeof deleteConversation === 'function') {
            await deleteConversation(c.filename).catch(() => {});
        }
        if (typeof syncDeleteFromServer === 'function') {
            await syncDeleteFromServer(c.filename).catch(() => {});
        }
    }
    refreshConvList();
    renderFavList();
    refreshCatBar();
}

saveModalClose.addEventListener('click', () => {
    saveModalOverlay.style.display = 'none';
});

saveModalOverlay.addEventListener('click', (e) => {
    if (e.target === saveModalOverlay) saveModalOverlay.style.display = 'none';
});

saveModalExportBtn.addEventListener('click', exportBackup);

saveModalImportBtn.addEventListener('click', () => importFileInput.click());

// --- Dashboard Statistiques (intégré dans la modale config) ---
const dashboardContent = document.getElementById('dashboard-content');
let dashboardData = null;

document.querySelectorAll('.dashboard-tab').forEach(tab => {
    tab.addEventListener('click', () => {
        document.querySelectorAll('.dashboard-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        renderDashboardTab(tab.dataset.tab);
    });
});

async function listAllConvStats() {
    return listConversationFiles(true);
}

// --- Modale Config (clés API) --- (module config-providers.js)
initConfigAutoSave();
// (coffre-fort retiré — sera remplacé par une nouvelle logique)
// --- Catalogue de modèles (module model-catalog.js) ---
// --- FAQ ---
let _faqLoaded = false;
let _faqActiveCategory = null;

function renderFaqItems(categoryId) {
    const container = document.getElementById('faq-container');
    container.innerHTML = '';
    const items = FAQ_DATA.filter(item => item.category === categoryId);
    for (const item of items) {
        const el = document.createElement('div');
        el.className = 'faq-item';
        el.innerHTML =
            `<button class="faq-question">` +
                `<span class="faq-question-arrow">›</span>` +
                `<span></span>` +
            `</button>` +
            `<div class="faq-answer"></div>`;
        el.querySelector('.faq-question span:last-child').textContent = item.question;
        el.querySelector('.faq-answer').innerHTML = item.answer;
        el.querySelector('.faq-question').addEventListener('click', () => {
            const isOpen = el.classList.contains('open');
            container.querySelectorAll('.faq-item.open').forEach(o => {
                if (o !== el) o.classList.remove('open');
            });
            el.classList.toggle('open', !isOpen);
        });
        container.appendChild(el);
    }
}

function loadFaq() {
    if (_faqLoaded) return;
    const tabsContainer = document.getElementById('faq-tabs');
    tabsContainer.innerHTML = '';
    for (const cat of FAQ_CATEGORIES) {
        const btn = document.createElement('button');
        btn.className = 'faq-tab';
        btn.textContent = cat.label;
        btn.dataset.category = cat.id;
        btn.addEventListener('click', () => {
            tabsContainer.querySelectorAll('.faq-tab').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            _faqActiveCategory = cat.id;
            renderFaqItems(cat.id);
        });
        tabsContainer.appendChild(btn);
    }
    // Activate first tab
    const firstTab = tabsContainer.querySelector('.faq-tab');
    if (firstTab) {
        firstTab.classList.add('active');
        _faqActiveCategory = FAQ_CATEGORIES[0].id;
        renderFaqItems(FAQ_CATEGORIES[0].id);
    }
    _faqLoaded = true;
}

// --- Partager ---
const shareCopyBtn = document.getElementById('share-copy-btn');
const shareLinkInput = document.getElementById('share-link-input');

shareCopyBtn.addEventListener('click', () => {
    shareLinkInput.select();
    navigator.clipboard.writeText(shareLinkInput.value).then(() => {
        const originalHTML = shareCopyBtn.innerHTML;
        shareCopyBtn.innerHTML = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg> Copié !';
        setTimeout(() => { shareCopyBtn.innerHTML = originalHTML; }, 2000);
    }).catch(function(){});
});

// Boutons de thème dans le panel Apparence
var themeTogglePanel = document.getElementById('theme-toggle-panel');

function updateThemeOptions() {
    const current = localStorage.getItem('minou-theme') || 'light';
    if (!themeTogglePanel) return;
    themeTogglePanel.querySelectorAll('.theme-toggle-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.theme === current);
    });
    const hint = document.getElementById('theme-auto-hint');
    if (hint) hint.style.display = current === 'auto' ? '' : 'none';
}

if (themeTogglePanel) {
    themeTogglePanel.addEventListener('click', (e) => {
        const btn = e.target.closest('.theme-toggle-btn');
        if (!btn) return;
        const mode = btn.dataset.theme;
        localStorage.setItem('minou-theme', mode);
        applyTheme(mode);
        themeTogglePanel.querySelectorAll('.theme-toggle-btn').forEach(b => {
            b.classList.toggle('active', b === btn);
        });
        const hint = document.getElementById('theme-auto-hint');
        if (hint) hint.style.display = mode === 'auto' ? '' : 'none';
    });
}

// Note : le bouton « Mettre à jour » du modèle local est attaché dynamiquement
// par _initApiModelesPanel() — voir _onLocalRefreshClick().

function populateModelSelects() {
    const fillByEditeur = (selectId, category, currentValue) => {
        const select = document.getElementById(selectId);
        select.innerHTML = '';
        const noneOpt = document.createElement('option');
        noneOpt.value = '';
        noneOpt.textContent = 'Aucun';
        select.appendChild(noneOpt);
        for (const m of MODELS_DATA[category]) {
            if (!hasProviderKey(m.editeur)) continue;
            const opt = document.createElement('option');
            opt.value = m.id;
            const cost = m.prix ? ` — ${m.prix}` : '';
            opt.textContent = m.label + cost;
            select.appendChild(opt);
        }
        select.value = currentValue;
    };
    const fillByModelId = (selectId, category, currentValue) => {
        const select = document.getElementById(selectId);
        select.innerHTML = '';
        const noneOpt = document.createElement('option');
        noneOpt.value = '';
        noneOpt.textContent = 'Aucun';
        select.appendChild(noneOpt);
        // Grouper par éditeur dans l'ordre d'apparition (filtrés par clé API disponible)
        const groups = [];
        const seen = new Set();
        for (const m of MODELS_DATA[category]) {
            if (!hasProviderKey(m.editeur)) continue;
            if (!seen.has(m.editeur)) { seen.add(m.editeur); groups.push(m.editeur); }
        }
        for (const ed of groups) {
            const sep = document.createElement('option');
            sep.disabled = true;
            sep.textContent = `── ${EDITEUR_LABELS[ed] || ed} ──`;
            select.appendChild(sep);
            for (const m of MODELS_DATA[category].filter(m => m.editeur === ed)) {
                const opt = document.createElement('option');
                opt.value = m.id;
                const cost = (m.inputPer1M !== undefined) ? ` — $${m.inputPer1M} / $${m.outputPer1M}` : '';
                opt.textContent = m.label + cost;
                select.appendChild(opt);
            }
        }
        // Options serveurs locaux (Ollama, LM Studio) — respecte les prefs catalogue
        const _localPrefs = loadCatalogPrefs();
        const _localDisabled = new Set(_localPrefs.disabled || []);
        for (const localEd of ['ollama', 'lmstudio']) {
            const localModels = MODELS.filter(m => m.editeur === localEd && !_localDisabled.has(m.id));
            const localIds = new Set(localModels.map(m => m.id));
            const keepOrphan = localEd === 'ollama' && currentValue && !localIds.has(currentValue) &&
                !MODELS_DATA[category].some(m => m.id === currentValue) &&
                !MODELS.some(m => m.id === currentValue && isLocalEditeur(m.editeur)) &&
                currentValue !== '';
            if (API_KEYS[localEd] && (localModels.length > 0 || keepOrphan)) {
                const sep = document.createElement('option');
                sep.disabled = true;
                sep.textContent = `── ${EDITEUR_LABELS[localEd]} ──`;
                select.appendChild(sep);
                if (keepOrphan) {
                    const opt = document.createElement('option');
                    opt.value = currentValue;
                    opt.textContent = currentValue + ' (hors ligne)';
                    select.appendChild(opt);
                }
                for (const m of localModels) {
                    const opt = document.createElement('option');
                    opt.value = m.id;
                    opt.textContent = m.label;
                    select.appendChild(opt);
                }
            }
        }

        // Options OpenRouter (en dernier) — uniquement les modèles cochés dans le catalogue
        const _orPrefs = loadCatalogPrefs();
        const _orEnabled = new Set(_orPrefs.orEnabled || []);
        if (hasProviderKey('openrouter')) {
            const orModels = MODELS.filter(m => m.editeur === 'openrouter' && _orEnabled.has(m.id));
            if (orModels.length > 0) {
                const sep = document.createElement('option');
                sep.disabled = true;
                sep.textContent = `── ${EDITEUR_LABELS.openrouter} ──`;
                select.appendChild(sep);
                const hint = document.createElement('option');
                hint.disabled = true;
                hint.style.color = '#888';
                hint.textContent = 'Modèles sélectionnés uniquement';
                select.appendChild(hint);
                for (const m of orModels) {
                    const tarif = TARIFS[m.id];
                    const opt = document.createElement('option');
                    opt.value = m.id;
                    const cost = (tarif && tarif.inputPer1M !== undefined) ? ` — $${tarif.inputPer1M} / $${tarif.outputPer1M}` : '';
                    opt.textContent = m.label + cost;
                    select.appendChild(opt);
                }
            }
        }

        select.value = currentValue;
    };
    fillByEditeur('audio-tts-provider', 'tts', AUDIO_SETTINGS.ttsProvider || 'system-tts');
    fillByEditeur('audio-stt-provider', 'stt', AUDIO_SETTINGS.sttProvider || '');
    fillByModelId('enhance-provider', 'text', AUDIO_SETTINGS.enhanceModel || '');
    fillByModelId('summary-model', 'text', AUDIO_SETTINGS.summaryModel || '');
    fillByModelId('title-model', 'text', AUDIO_SETTINGS.titleModel || '');
    const titleSelect = document.getElementById('title-model');
    const titleNoneOpt = titleSelect.querySelector('option[value=""]');
    titleNoneOpt.textContent = 'Modèle utilisé dans la conversation';
    const titleOffOpt = document.createElement('option');
    titleOffOpt.value = 'none';
    titleOffOpt.textContent = 'Aucun';
    titleSelect.insertBefore(titleOffOpt, titleNoneOpt.nextSibling);
    titleSelect.value = AUDIO_SETTINGS.titleModel || '';
    fillByModelId('error-explainer-model', 'text', AUDIO_SETTINGS.errorExplainerModel || '');
    // Remplir et afficher/masquer le modèle de secours local
    populateLocalFallback();
    updateLocalFallbackVisibility();
}

function populateLocalFallback() {
    const select = document.getElementById('local-fallback-model');
    const currentValue = AUDIO_SETTINGS.localFallbackModel ?? '';
    select.innerHTML = '';
    const placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.disabled = true;
    placeholder.textContent = 'Sélectionner le modèle de secours';
    select.appendChild(placeholder);
    const noneOpt = document.createElement('option');
    noneOpt.value = 'none';
    noneOpt.textContent = 'Aucun';
    select.appendChild(noneOpt);
    const groups = [];
    const seen = new Set();
    for (const m of MODELS_DATA.text) {
        if (!hasProviderKey(m.editeur)) continue;
        if (!seen.has(m.editeur)) { seen.add(m.editeur); groups.push(m.editeur); }
    }
    for (const ed of groups) {
        const sep = document.createElement('option');
        sep.disabled = true;
        sep.textContent = `── ${EDITEUR_LABELS[ed] || ed} ──`;
        select.appendChild(sep);
        for (const m of MODELS_DATA.text.filter(m => m.editeur === ed)) {
            const opt = document.createElement('option');
            opt.value = m.id;
            const cost = (m.inputPer1M !== undefined) ? ` — $${m.inputPer1M} / $${m.outputPer1M}` : '';
            opt.textContent = m.label + cost;
            select.appendChild(opt);
        }
    }
    select.value = currentValue || '';
    if (!select.value) select.value = '';
}

function updateLocalFallbackVisibility() {
    const localSelects = ['enhance-provider', 'summary-model', 'title-model', 'error-explainer-model'];
    const localIds = new Set(MODELS.filter(m => isLocalEditeur(m.editeur)).map(m => m.id));
    const knownCloudIds = new Set(MODELS_DATA.text.map(m => m.id));
    const anyLocal = localSelects.some(id => {
        const val = document.getElementById(id).value;
        if (!val) return false;
        return localIds.has(val) || (!knownCloudIds.has(val) && val !== 'none');
    });
    document.getElementById('local-fallback-row').style.display = anyLocal ? '' : 'none';
}

function openApiKeysModal(tab = 'apimodeles') {
    document.querySelectorAll('.apikey-eye-btn').forEach(btn => {
        const target = document.getElementById(btn.dataset.target);
        if (target) target.type = 'password';
        btn.classList.remove('shown');
        btn.title = 'Afficher la clé';
        btn.setAttribute('aria-label', 'Afficher la clé');
    });
    _restoreApiKeyInputs();
    for (const localId of ['ollama', 'lmstudio', 'llamacpp']) {
        const status = document.getElementById(`apikey-${localId}-status`);
        if (status) { status.textContent = ''; status.className = 'apikey-local-status'; }
    }
    document.getElementById('models-error').style.display = 'none';
    _setKeysDirty(false);
    _setModelsDirty(false);
    _initCatalogPending();
    _setCatalogDirty(false);
    if (tab === 'apimodeles') renderProviderCatalog(_activeProvider);
    populateModelSelects();
    const budget = loadBudgetSettings();
    document.getElementById('budget-enabled').checked = budget.enabled;
    document.getElementById('budget-period').value = budget.period;
    document.getElementById('budget-amount').value = budget.amount || '';
    document.getElementById('budget-settings').style.display = budget.enabled ? '' : 'none';
    updateBudgetAmountSuffix();
    if (budget.enabled) updateBudgetPreview();
    _setBudgetDirty(false);
    document.querySelectorAll('.apikeys-tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.apikeys-panel').forEach(p => p.classList.remove('active'));
    document.querySelector('.apikeys-tab[data-tab="' + tab + '"]').classList.add('active');
    document.getElementById('panel-' + tab).classList.add('active');
    if (tab === 'faq') loadFaq();
    updateThemeOptions();
    const modalBox = apikeysModalOverlay.querySelector('.sp-modal.apikeys-modal');
    apikeysModalOverlay.classList.remove('closing', 'opening');
    if (modalBox) modalBox.classList.remove('closing', 'opening', 'morphing-from-dock', 'morphing-to-dock');
    apikeysModalOverlay.style.display = 'flex';
    // Forcer un reflow pour que l'ajout de la classe `.opening` redéclenche bien
    // l'animation, même si la modale a déjà été ouverte/fermée précédemment.
    if (modalBox) {
        void modalBox.offsetWidth;
        modalBox.classList.add('opening');
        const cleanup = (e) => {
            if (e.target !== modalBox) return;
            modalBox.classList.remove('opening');
            modalBox.removeEventListener('animationend', cleanup);
        };
        modalBox.addEventListener('animationend', cleanup);
    }
}
window.openApiKeysModal = openApiKeysModal;

function closeApiKeysModal() {
    if (apikeysModalOverlay.style.display === 'none') return;
    const modalBox = apikeysModalOverlay.querySelector('.sp-modal.apikeys-modal');
    // Si une animation de morphing est en cours, on n'interfère pas.
    if (modalBox && (modalBox.classList.contains('morphing-to-dock') || modalBox.classList.contains('morphing-from-dock'))) {
        apikeysModalOverlay.style.display = 'none';
        fetchLocalModels().then(() => populateModelSelect());
        return;
    }
    if (!modalBox) {
        apikeysModalOverlay.style.display = 'none';
        fetchLocalModels().then(() => populateModelSelect());
        return;
    }
    modalBox.classList.remove('opening');
    modalBox.classList.add('closing');
    const onEnd = (e) => {
        if (e.target !== modalBox) return;
        modalBox.removeEventListener('animationend', onEnd);
        apikeysModalOverlay.style.display = 'none';
        modalBox.classList.remove('closing');
        fetchLocalModels().then(() => populateModelSelect());
    };
    modalBox.addEventListener('animationend', onEnd);
}

// --- Bouton copier sur chaque bloc de code ---
function addCodeCopyButtons(container) {
    const pres = container.querySelectorAll('pre');
    for (const pre of pres) {
        if (pre.querySelector('.code-copy-btn')) continue;
        pre.style.position = 'relative';
        const btn = document.createElement('button');
        btn.className = 'code-copy-btn';
        btn.textContent = 'Copier';
        btn.addEventListener('click', () => {
            const code = pre.querySelector('code');
            const text = code ? code.textContent : pre.textContent;
            navigator.clipboard.writeText(text).then(() => {
                btn.textContent = 'Copié !';
                setTimeout(() => { btn.textContent = 'Copier'; }, 1500);
            }).catch(function(){});
        });
        pre.appendChild(btn);
    }
}

// --- Lightbox + File viewer (module lightbox.js) ---
initLightbox();

// --- Easter egg : taper "Cetas" dans la zone de saisie ---
(function () {
    // Le trigger ne doit pas se déclencher sur "moncetas", "acetas", etc.
    // → exiger un début de chaîne ou un caractère non-lettre juste avant.
    const TRIGGER_RE = /(^|[^\p{L}])cetas$/u;
    let easterEggActive = false;

    promptInput.addEventListener('input', () => {
        if (easterEggActive) return;
        const val = promptInput.value.toLowerCase();
        if (TRIGGER_RE.test(val)) {
            triggerCoucou();
        }
    });

    function triggerCoucou() {
        easterEggActive = true;
        const wrapper = document.querySelector('.input-wrapper');
        const wrapperRect = wrapper.getBoundingClientRect();

        // Dimensions du personnage (largeur fixe, hauteurs proportionnelles aux viewBox)
        const charW = 120;
        const bodyH = Math.round(charW * 629 / 620);
        const feetH = Math.round(charW * 119 / 620);
        const centerX = wrapperRect.left + wrapperRect.width / 2;

        // Conteneur masque pour Coucou1 : overflow:hidden
        const mask = document.createElement('div');
        mask.style.cssText = `
            position:fixed;
            width:${charW}px;
            height:${bodyH}px;
            left:${centerX}px;
            bottom:${window.innerHeight - wrapperRect.top}px;
            transform:translateX(-50%);
            overflow:hidden;
            z-index:19;
        `;
        document.body.appendChild(mask);

        // Coucou1 (corps) — à l'intérieur du masque, commence en bas (caché)
        const body = document.createElement('img');
        body.src = _ea;
        body.style.cssText = `
            position:absolute;
            width:100%;
            height:${bodyH}px;
            left:0;
            bottom:0;
            transform:translateY(100%);
            transition:transform 0.45s ease-out;
        `;
        mask.appendChild(body);

        // État hover (uniquement moitié haute de l'image = caresse la tête)
        let hovered = false;
        let reopenTimer = null;
        let exitTimer = null;
        let feetTimer = null;
        let cleanupTimer = null;
        let moveCount = 0;
        let lastHeartTime = 0;

        function isInTopHalf(clientY) {
            const rect = body.getBoundingClientRect();
            return clientY < rect.top + rect.height / 2;
        }

        function spawnHeart(x, y) {
            const heart = document.createElement('div');
            const offsetX = (Math.random() - 0.5) * 30;
            heart.textContent = '❤️';
            heart.style.cssText = `
                position:fixed;
                left:${x + offsetX}px;
                top:${y}px;
                font-size:${14 + Math.random() * 10}px;
                pointer-events:none;
                z-index:21;
                transition:transform 1s ease-out, opacity 1s ease-out;
                transform:translateY(0) scale(1);
                opacity:1;
            `;
            document.body.appendChild(heart);
            requestAnimationFrame(() => {
                requestAnimationFrame(() => {
                    heart.style.transform = `translateY(-${60 + Math.random() * 40}px) scale(0.5)`;
                    heart.style.opacity = '0';
                });
            });
            setTimeout(() => heart.remove(), 1100);
        }

        function handleMove(clientY) {
            const inTop = isInTopHalf(clientY);
            body.style.cursor = inTop ? 'grab' : 'default';
            if (inTop && !hovered) {
                hovered = true;
                if (reopenTimer) { clearTimeout(reopenTimer); reopenTimer = null; }
                body.src = _ec;
            } else if (!inTop && hovered) {
                hovered = false;
                reopenTimer = setTimeout(() => {
                    body.src = _ea;
                    setTimeout(() => { startExit(); }, 3000);
                }, 1000);
            }
            // Coeurs si mouvement dans la moitié haute (partent du haut de l'image)
            if (inTop) {
                moveCount++;
                const now = Date.now();
                if (moveCount >= 4 && now - lastHeartTime > 300) {
                    const rect = body.getBoundingClientRect();
                    const hx = rect.left + rect.width * (0.3 + Math.random() * 0.4);
                    const hy = rect.top + rect.height * 0.1;
                    spawnHeart(hx, hy);
                    lastHeartTime = now;
                    moveCount = 0;
                }
            }
        }
        function handleLeave() {
            body.style.cursor = 'default';
            if (hovered) {
                hovered = false;
                moveCount = 0;
                reopenTimer = setTimeout(() => {
                    body.src = _ea;
                    setTimeout(() => { startExit(); }, 3000);
                }, 1000);
            }
        }
        body.addEventListener('mousemove', (e) => handleMove(e.clientY));
        body.addEventListener('mouseleave', handleLeave);
        body.addEventListener('touchstart', (e) => {
            if (e.touches.length) handleMove(e.touches[0].clientY);
        }, { passive: true });
        body.addEventListener('touchmove', (e) => {
            if (e.touches.length) handleMove(e.touches[0].clientY);
        }, { passive: true });
        body.addEventListener('touchend', handleLeave);
        body.addEventListener('touchcancel', handleLeave);

        // Resize de la fenêtre : la position figée devient invalide → on sort.
        function onResize() {
            hovered = false;
            if (reopenTimer) { clearTimeout(reopenTimer); reopenTimer = null; }
            startExit();
        }
        window.addEventListener('resize', onResize);

        // Coucou2 (pieds) — PAR-DESSUS tout, centré sur la bordure de l'input-wrapper
        const feet = document.createElement('img');
        feet.src = _eb;
        feet.style.cssText = `
            position:fixed;
            width:${charW}px;
            height:${feetH}px;
            left:${centerX}px;
            top:${wrapperRect.top - feetH / 2}px;
            transform:translateX(-50%);
            visibility:hidden;
            z-index:20;
            pointer-events:none;
        `;
        document.body.appendChild(feet);

        // Phase 1 : le corps monte + les pieds apparaissent instantanément
        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                body.style.transform = 'translateY(0)';
                feet.style.visibility = 'visible';
            });
        });

        // Clignement des yeux (sauf si le curseur est dessus)
        const blinkTimer = setTimeout(() => {
            if (!hovered) {
                body.src = _ec;
                setTimeout(() => { if (!hovered) body.src = _ea; }, 150);
            }
        }, 1400);

        // Fonction de sortie (réutilisable)
        let exiting = false;
        function startExit() {
            if (exiting || hovered) return;
            exiting = true;
            window.removeEventListener('resize', onResize);
            body.src = _ec;
            body.style.transition = 'transform 0.5s cubic-bezier(.55,0,.68,.53)';
            body.style.transform = 'translateY(100%)';
            feetTimer = setTimeout(() => { feet.style.visibility = 'hidden'; }, 500);
            cleanupTimer = setTimeout(() => {
                mask.remove();
                feet.remove();
                easterEggActive = false;
            }, 700);
        }

        // Sortie automatique si pas de hover
        exitTimer = setTimeout(() => {
            if (!hovered) startExit();
        }, 3300);
    }
})();

// --- Initialisation du Canvas ---
// canvas.js est chargé avant app.js mais son init() attend que le DOM soit prêt
// et que les handlers soient installés. On l'appelle ici.
if (window.Canvas && typeof window.Canvas.init === 'function') {
    window.Canvas.init();
    updateCanvasBtn();
}

// --- Initialisation du fond océanique (thème premium) ---
if (window.Ocean && typeof window.Ocean.init === 'function') {
    window.Ocean.init();
}

// Vérification de mise à jour au chargement (désactivée)

// Pas de focus initial sur la barre de saisie

// Exposition globale pour les scripts classiques (non-module) :
// config-providers.js, conversations.js, plus-menu.js, right-panel.js, model-catalog.js
Object.assign(window, {
    STATE, STREAM_ERROR_CONTENT, TEXT_EXTENSIONS, isStreamActive, escHtml, escHtmlAttr,
    safeUrl, isTextFile, arrayBufferToBase64, isPdf, getModelLabel, fmtTokens,
    fmtCost, applyTheme, initTheme, setOnThemeChange, initLightbox, initAttachments,
    setAttachStateChange, cancelAllPendingLoads, renderAttachPreview, processAttachedFile, initEmojiTabs, showEmojiPicker,
    hideEmojiPicker, renderEmojiGrid, renderFavList, _isFavorite, _toggleFavorite, setFavoritesCallbacks,
    initWhisper, setWhisperCallbacks, initUserManagement, updateWebSearchBtn, hasBuiltInWebSearch, calcWebSearchCost,
    setWebSearchAlignCallback, initExportHandlers, updateExportMdBtn, loadBudgetSettings, toggleBudgetSettings, getCostForPeriod,
    updateBudgetPreview, checkBudgetAlert, addCostForModel, updateBudgetAmountSuffix, initBudget, initRoles,
    setRolesCallbacks, refreshSpList, deleteSpItem, exportSpItem, openSpModal, closeSpModal,
    autoResizeTextarea, initPrompts, setPromptsCallbacks, refreshPrList, openPrModal, closePrModal,
    initExportImport, setExportImportCallbacks, exportBackup, importBackup, initCategories, setCategoriesCallbacks,
    refreshCatBar, updateActiveCatColor, updateNewChatBtnColor, updateCatSelectColor, updateEmptyChatCategory, openCatModal,
    openCatManagePopup, renderCatManageList, selectCatColor, randomDefaultEmoji, textColorForBg, APP_VERSION,
    chatContainer, promptInput, sendBtn, newChatBtn, tokenInfo, costInfo,
    convList, modelSelect, spSelect, spListEl, spAddBtn, spEditBtn,
    spDeleteBtn, rpRoleActions, spModalOverlay, spModalTitle, spModalNom, spModalContenu,
    spModalCancel, spModalSave, themeToggle, convSearch, attachBtn, fileInput,
    attachPreview, micBtn, enhancePromptBtn, toolbarInsertBtn, toolbarEnhanceBtn, toolbarSaveBtn,
    chatHeaderSettings, promptPickerDropdownWrapper, promptPickerDropdown, prListEl, prAddBtn, prModalOverlay,
    prModalTitle, prModalNom, prModalContenu, prModalCancel, prModalSave, prModalEnhance,
    apikeysBtn, apikeysModalOverlay, shareBtn, shareMenu, summaryBtn, addModelSwitchElement,
    addModelSwitch, sidebarToggle, sidebar, _isMobile, _updateSidebarState, _collapseSidebar,
    mobileSendBtn, canvasToggleBtn, updateCanvasBtn, buildCanvasParserIfActive, SAMAGENT_BOOST_PROMPT, effectiveSystemPrompt,
    _showRouterThinking, _hideRouterThinking, attachCanvasBeforeToLastAssistant, updateEnhanceBtn, _toolbarMode, _insertBtnVisible,
    _insertBtnTargetCoords, showInsertBtn, hideInsertBtn, _applyToolbarMode, updatePromptToolbar, closeAllMenus,
    EDITEUR_LABELS, OR_MAKER_LABELS, _modelMakerLabel, EDITEUR_ORDER, EDITEUR_ICONS, _editeurGroupHeaderHtml,
    HIDDEN_EDITEURS, hasProviderKey, _tooltip, _MODALITY_LABELS, _PARAM_LABELS, _formatContextLength,
    _formatModalities, _formatSupportedParams, _formatDefaultParams, _isModelNew, _isModelExpiringSoon, _formatExpirationDateFr,
    _buildModelTooltip, upgradeToCustomSelect, hasAnyProviderKey, updateTriggerDisplay, updateActiveOption, formatImagePriceRange,
    _formatOrImagePriceStr, _formatModelPriceString, populateCustomSelect, _buildModelsHtml, _switchTab, _applyModelSelection,
    populateUnifiedSelect, populateModelSelect, checkApiKeyForModel, micIconDefaultSaved, micIconStopStreaming, updateSendButton,
    inputHint, alignInputHint, _lastClickX, _lastClickY, showEmptyPlaceholder, hideEmptyPlaceholder,
    resetConversation, _dlgOverlay, _dlgIcon, _dlgMessage, _dlgActions, _dlgOk,
    _dlgCancel, _DIALOG_ICONS, _showDialog, customAlert, customConfirm, _isFriendlyCetasError,
    showErrorAlert, modelAlertTimer, showMissingModelBanner, MODEL_ALERT_DEFAULT, _hideModelAlert, showModelAlert,
    showNoModelAlert, generateConversationId, updateTokenDisplay, _rebindStreamToVisibleDOM, _mergeConvData, saveConversation,
    getTextFromContent, _IMG_DOWNLOAD_SVG, buildImagesContainer, imageResultToContent, buildImagePrompt, collectReferenceImages,
    addMessage, collapseThinkBlock, endStreaming, _wrapNewChars, createStreamRenderer, formatGenTime,
    formatGenTooltip, setGenTimeOnLastAssistant, appendCitations, removeRegenBtn, addRegenBtn, startEditMessage,
    _userHasScrolledUp, scrollToBottom, handleApiError, applyErrorStyle, rolesManageOverlay, rolesManageList,
    rolesManageEmpty, rolesManageClose, rolesManageAdd, rolesManageImport, sidebarRolesBtn, promptsManageOverlay,
    promptsManageList, promptsManageEmpty, promptsManageClose, promptsManageAdd, sidebarPromptsBtn, openRolesManage,
    closeRolesManage, openPromptsManage, closePromptsManage, prImportFile, promptsManageImport, dashboardBtn,
    saveModalOverlay, saveModalClose, saveModalExportBtn, saveModalImportBtn, dashboardContent, dashboardData,
    _faqLoaded, _faqActiveCategory, renderFaqItems, loadFaq, shareCopyBtn, shareLinkInput,
    updateThemeOptions, populateModelSelects, populateLocalFallback, updateLocalFallbackVisibility, openApiKeysModal, closeApiKeysModal,
    addCodeCopyButtons,
});

window.dispatchEvent(new Event('cetas:app-ready'));

import { STATE, STREAM_ERROR_CONTENT, TEXT_EXTENSIONS, isStreamActive } from "./state.js";

import "./dom.js";

import { escHtml, escHtmlAttr, safeUrl, isTextFile, arrayBufferToBase64, isPdf, getModelLabel, fmtTokens, fmtCost } from "./utils.js";

import { applyTheme, initTheme, setOnThemeChange } from "../ui/theme.js";

import { initLightbox } from "../ui/lightbox.js";

import { initAttachments, setAttachStateChange, cancelAllPendingLoads, renderAttachPreview, processAttachedFile } from "../features/attachments.js";

import { initEmojiTabs, showEmojiPicker, hideEmojiPicker, renderEmojiGrid } from "../ui/emoji-picker.js";

import { renderFavList, _isFavorite, _toggleFavorite, setFavoritesCallbacks } from "../features/favorites.js";

import { initWhisper, setWhisperCallbacks } from "../integrations/whisper.js";

import { initUserManagement } from "../services/user-management.js";

import { updateWebSearchBtn, hasBuiltInWebSearch, calcWebSearchCost, setWebSearchAlignCallback, toggleWebSearch, syncWebSearchUI } from "../integrations/web-search.js";

import { initExportHandlers, updateExportMdBtn } from "../services/export-md.js";

import { loadBudgetSettings, toggleBudgetSettings, getCostForPeriod, updateBudgetPreview, checkBudgetAlert, addCostForModel, updateBudgetAmountSuffix, initBudget } from "../services/budget.js";

import { initRoles, setRolesCallbacks, refreshSpList, deleteSpItem, exportSpItem, openSpModal, closeSpModal, autoResizeTextarea } from "../features/roles.js";

import { initPrompts, setPromptsCallbacks, refreshPrList, openPrModal, closePrModal } from "../features/prompts.js";

import { initExportImport, setExportImportCallbacks, exportBackup, importBackup } from "../services/export-import.js";

import { initCategories, setCategoriesCallbacks, refreshCatBar, updateActiveCatColor, updateNewChatBtnColor, updateCatSelectColor, updateEmptyChatCategory, openCatModal, openCatManagePopup, renderCatManageList, selectCatColor, randomDefaultEmoji, textColorForBg } from "../features/categories.js";

import { createModelSelect } from "../features/model-select.js";

import { createCanvas } from "../features/canvas.js";

import { createPromptToolbar } from "../ui/prompt-toolbar.js";

import { createChat } from "../features/chat.js";

import { createMarexcode } from "../features/marexcode.js";

const APP_VERSION = "3.2", chatContainer = document.getElementById("chat-container"), promptInput = document.getElementById("prompt-input"), sendBtn = document.getElementById("send-btn"), newChatBtn = document.getElementById("new-chat-btn"), tokenInfo = document.getElementById("token-info"), costInfo = document.getElementById("cost-info"), convList = document.getElementById("conv-list"), modelSelect = document.getElementById("model-select"), spSelect = document.getElementById("sp-select"), spListEl = document.getElementById("sp-list"), spAddBtn = document.getElementById("sp-add-btn"), spEditBtn = document.getElementById("sp-edit-btn"), spDeleteBtn = document.getElementById("sp-delete-btn"), rpRoleActions = document.getElementById("rp-role-actions"), spModalOverlay = document.getElementById("sp-modal-overlay"), spModalTitle = document.getElementById("sp-modal-title"), spModalNom = document.getElementById("sp-modal-nom"), spModalContenu = document.getElementById("sp-modal-contenu"), spModalCancel = document.getElementById("sp-modal-cancel"), spModalSave = document.getElementById("sp-modal-save"), themeToggle = document.getElementById("theme-toggle"), convSearch = document.getElementById("conv-search"), attachBtn = document.getElementById("attach-btn"), fileInput = document.getElementById("file-input"), attachPreview = document.getElementById("attach-preview"), micBtn = document.getElementById("mic-btn"), enhancePromptBtn = document.getElementById("enhance-prompt-btn"), toolbarInsertBtn = document.getElementById("toolbar-insert-btn"), toolbarEnhanceBtn = document.getElementById("toolbar-enhance-btn"), toolbarSaveBtn = document.getElementById("toolbar-save-btn"), webSearchBtn = document.getElementById("web-search-btn");

!function() {
    const e = "kiro-storage-media-viewmode", t = "cetas-storage-media-viewmode", n = localStorage.getItem(e);
    n && !localStorage.getItem(t) && localStorage.setItem(t, n), n && localStorage.removeItem(e);
    const o = "kiro-budget-ack-";
    for (let e = 0; e < localStorage.length; e++) {
        const t = localStorage.key(e);
        if (t && t.startsWith(o)) {
            const e = "cetas-budget-ack-" + t.slice(16);
            localStorage.getItem(e) || localStorage.setItem(e, localStorage.getItem(t)), localStorage.removeItem(t);
        }
    }
}();

const chatHeaderSettings = document.getElementById("chat-header-settings"), promptPickerDropdownWrapper = document.getElementById("prompt-picker-dropdown-wrapper"), promptPickerDropdown = document.getElementById("prompt-picker-dropdown"), prListEl = document.getElementById("pr-list"), prAddBtn = document.getElementById("pr-add-btn"), prModalOverlay = document.getElementById("pr-modal-overlay"), prModalTitle = document.getElementById("pr-modal-title"), prModalNom = document.getElementById("pr-modal-nom"), prModalContenu = document.getElementById("pr-modal-contenu"), prModalCancel = document.getElementById("pr-modal-cancel"), prModalSave = document.getElementById("pr-modal-save"), prModalEnhance = document.getElementById("pr-modal-enhance"), apikeysBtn = document.getElementById("apikeys-btn"), apikeysModalOverlay = document.getElementById("apikeys-modal-overlay");

marked.use({
    renderer: {
        link: ({href: e, title: t, text: n}) => `<a href="${escHtmlAttr(safeUrl(e))}"${t ? ` title="${escHtmlAttr(t)}"` : ""} target="_blank" rel="noopener noreferrer">${n}</a>`
    },
    hooks: {
        postprocess: e => "undefined" == typeof DOMPurify ? String(e).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;") : DOMPurify.sanitize(e, {
            ADD_ATTR: [ "target", "rel" ]
        })
    }
}), setOnThemeChange(updateThemeOptions), initTheme(), convSearch.addEventListener("input", (async () => {
    const e = convSearch.value.toLowerCase(), t = convList.querySelectorAll(".conv-item");
    if (e && !STATE._fullTextsLoaded) {
        STATE._fullTextsLoaded = !0;
        const e = await loadConvFullTexts();
        for (const t of convList.querySelectorAll(".conv-item")) {
            const n = t.dataset.filename;
            e[n] && (t.dataset.fulltext = e[n]);
        }
    }
    for (const n of t) {
        if (!e) {
            n.style.display = "";
            continue;
        }
        const t = (n.querySelector(".conv-item-title")?.textContent || "").toLowerCase(), o = n.dataset.fulltext || "", a = t.includes(e) || o.includes(e);
        n.style.display = a ? "" : "none";
    }
})), "undefined" != typeof pdfjsLib && (pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js"), 
"undefined" != typeof pdfjsLib && (pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js"), 
setAttachStateChange((() => updateSendButton())), initAttachments();

const shareBtn = document.getElementById("share-btn"), shareMenu = document.getElementById("share-menu"), summaryBtn = document.getElementById("summary-btn");

summaryBtn.addEventListener("click", (async () => {
    if (0 === STATE.conversationHistory.length) return;
    if (!AUDIO_SETTINGS.summaryModel) return void showNoModelAlert("le résumé IA", "summary-model");
    let e = "";
    for (const t of STATE.conversationHistory) {
        if ("model-switch" === t.type) continue;
        const n = "user" === t.role ? "Utilisateur" : "Assistant", o = getTextFromContent(t.content);
        o && (e += `${n} :\n${o}\n\n`);
    }
    const t = summaryBtn.innerHTML;
    summaryBtn.innerHTML = '<svg class="spin" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>', 
    summaryBtn.disabled = !0;
    try {
        const t = AUDIO_SETTINGS.summaryModel, n = `Génère un résumé structuré de cette conversation, optimisé pour servir de contexte initial à une nouvelle conversation. Inclus les points clés, décisions, et le contexte nécessaire. Réponds UNIQUEMENT avec le contenu, sans rien ajouter d'autre. Pas d'introduction, pas de conclusion, pas de commentaire, pas de texte avant ou après. Ne commence pas par "Voici" ou toute autre phrase d'accroche.\n\n---\n\n${e}`, o = (await streamText(t, n)).text;
        o && (saveConversation(), resetConversation(), promptInput.value = o, promptInput.style.height = "auto", 
        promptInput.style.height = Math.min(promptInput.scrollHeight, 200) + "px", updateSendButton(), 
        promptInput.focus());
    } catch (e) {
        console.error("Erreur résumé IA:", e), customAlert("Erreur lors de la génération du résumé : " + e.message, "error");
    } finally {
        summaryBtn.innerHTML = t, summaryBtn.disabled = !1;
    }
})), document.querySelectorAll(".sp-toggle").forEach((e => {
    e.addEventListener("click", (t => {
        t.stopPropagation();
        const n = document.getElementById(e.dataset.target);
        if (!n) return;
        const o = n.classList.toggle("collapsed");
        e.innerHTML = o ? "&#9656;" : "&#9662;", localStorage.setItem("minou-collapse-" + e.dataset.target, o ? "1" : "0");
    })), e.closest(".sp-header").addEventListener("click", (t => {
        t.target.closest(".sp-add-btn") || e.click();
    }));
    const t = localStorage.getItem("minou-collapse-" + e.dataset.target);
    "1" === t ? (document.getElementById(e.dataset.target)?.classList.add("collapsed"), 
    e.innerHTML = "&#9656;") : "0" === t && (document.getElementById(e.dataset.target)?.classList.remove("collapsed"), 
    e.innerHTML = "&#9662;");
}));

const sidebarToggle = document.getElementById("sidebar-toggle"), sidebar = document.getElementById("sidebar");

function _isMobile() {
    return window.innerWidth <= 768;
}

function _updateSidebarState() {
    const e = sidebar.classList.contains("collapsed");
    sidebarToggle.classList.toggle("collapsed", e), sidebarToggle.title = e ? "Afficher le panneau" : "Masquer le panneau", 
    document.body.classList.toggle("sidebar-open", !e && _isMobile());
}

function _collapseSidebar() {
    sidebar.classList.contains("collapsed") || (sidebar.classList.add("collapsed"), 
    _updateSidebarState());
}

sidebarToggle.addEventListener("click", (() => {
    sidebar.classList.toggle("collapsed"), _updateSidebarState();
})), document.addEventListener("click", (e => {
    _isMobile() && (sidebar.contains(e.target) || sidebarToggle.contains(e.target) || e.target.closest(".sp-modal-overlay, .apikeys-modal-overlay, .login-overlay, #lightbox-overlay") || _collapseSidebar());
})), _isMobile() && sidebar.classList.add("collapsed"), _updateSidebarState(), window.addEventListener("resize", (() => {
    _isMobile() && !sidebar.classList.contains("collapsed") && sidebar.classList.add("collapsed"), 
    _updateSidebarState();
}));

const mobileSendBtn = document.getElementById("mobile-send-btn");

mobileSendBtn && (promptInput.addEventListener("input", (() => {
    const e = promptInput.value.trim().length > 0;
    mobileSendBtn.style.display = e ? "flex" : "none", micBtn && (micBtn.style.display = e ? "none" : "");
})), mobileSendBtn.addEventListener("click", (() => {
    STATE.isStreaming || sendMessage();
})));

const canvasToggleBtn = document.getElementById("canvas-toggle-btn");

const {
    updateCanvasBtn,
    buildCanvasParserIfActive,
    attachCanvasBeforeToLastAssistant,
    confirmAndRewindCanvas
} = createCanvas({
    STATE,
    canvasToggleBtn,
    getModels: () => MODELS,
    updateSideToolbarState: () => "function" == typeof window.updateSideToolbarState && window.updateSideToolbarState(),
    alignInputHint,
    customConfirm,
    saveConversation,
    window
});

const SAMAGENT_BOOST_PROMPT = 'Tu es SamAgent, l\'assistant IA flagship de Cetas. Tu es poli, chaleureux et professionnel. Tes règles :\n\n1. ACCUEIL naturel : salue toujours l\'utilisateur avec courtoisie. Pour un premier contact ("salut", "bonjour", "hello"), réponds avec une formule brève et chaleureuse : "Salut ! Comment allez-vous ?" ou "Bonjour ! Ravi de vous voir."\n\n2. PROPOSITIONS interactives : après ton salut (et uniquement pour un premier contact), propose exactement 3 exemples de ce que tu peux faire. FORMAT OBLIGATOIRE : chaque option sur sa PROPRE LIGNE (séparées par un saut de ligne \n, jamais sur la même ligne). Les descriptions doivent être COURTES (max 10 mots).\n   💬 Chat général : une question de conversation, conseil ou information du quotidien\n   💻 Coder : un problème de programmation, script, debug ou algorithme\n   🔬 Avancé : une analyse approfondie, maths, science ou rédaction\n   FORMAT IMPÉRATIF : chaque option dans son PROPRE paragraphe HTML (<p>...</p>), pas de <br> ni de texte collé. Exemple exact à suivre :\n   <p>💬 Chat général : une question de conversation, conseil ou information du quotidien</p>\n   <p>💻 Coder : un problème de programmation, script, debug ou algorithme</p>\n   <p>🔬 Avancé : une analyse approfondie, maths, science ou rédaction</p>\n   L\'utilisateur peut cliquer dessus pour choisir un domaine. S\'il clique, réponds avec un accusé de réception chaleureux et humain — varie toujours, ne répète jamais. Exemples : "Je t\'écoute, vas-y 😊", "OK, je suis prêt. Dis-moi ce que tu as en tête.", "Parfait, je suis tout ouïe. Raconte-moi." Sois court et précis.\n\n3. ÉCOUTE active : après avoir accusé réception d\'un choix de domaine (💬 💻 🔬), arrête-toi NET. N\'ajoute AUCUNE question, suggestion ou relance. Dis juste « Ok, je vous écoute » ou une variante brève, et attends que l\'utilisateur parle. Si ensuite l\'utilisateur pose une question vague (sans rapport avec un choix de domaine), alors seulement pose 2 ou 3 questions ciblées.\n\n4. COMPÉTENCE experte : si un rôle système est défini, applique-le avec précision. Réponds de manière experte, structurée et utile.\n\n5. EFFICACITÉ élégante : sois concis sans être sec. Garde un ton agréable et humain. Pas de blabla, pas de répétitions — chaque phrase a un sens.\n\n6. ADAPTATION fluide : l\'utilisateur peut répondre à tes questions, changer de sujet, ou sélectionner une compétence — adapte-toi naturellement.';

const {
    effectiveSystemPrompt,
    updateEnhanceBtn,
    _insertBtnTargetCoords,
    showInsertBtn,
    hideInsertBtn,
    _applyToolbarMode,
    updatePromptToolbar,
    buildImagePrompt,
    togglePromptPicker,
    _toolbarMode,
    _insertBtnVisible
} = createPromptToolbar({
    STATE,
    window,
    document,
    promptInput,
    enhancePromptBtn,
    toolbarInsertBtn,
    toolbarEnhanceBtn,
    toolbarSaveBtn,
    promptPickerDropdownWrapper,
    promptPickerDropdown,
    getLastClickCoordinates: () => ({ x: _lastClickX, y: _lastClickY }),
    samAgentBoostPrompt: SAMAGENT_BOOST_PROMPT,
    listSavedPrompts,
    openPrModal
});

var ROUTER_THINKING_MESSAGES = [ "✨ Analyse de votre requête", "🔍 Exploration du contexte", "💡 Recherche du meilleur angle", "🎯 Calibration de la réponse", "⚡ Optimisation en cours", "🧠 Réflexion approfondie", "🌟 Préparation d'une réponse experte", "📐 Structuration de la pensée", "🔬 Examen minutieux du sujet", "🌊 Plongée dans le contexte", "💎 Extraction des points clés", "🧩 Assemblage des connaissances", "🎨 Façonnage de la réponse", "🚀 Accélération neuronale", "👁️ Lecture entre les lignes" ];

function _showRouterThinking(e) {
    var t = ROUTER_THINKING_MESSAGES[Math.floor(Math.random() * ROUTER_THINKING_MESSAGES.length)], n = document.createElement("div");
    n.className = "router-thinking", n.innerHTML = '<span class="router-thinking-text">' + t + '</span><span class="router-thinking-dots"><span>.</span><span>.</span><span>.</span></span>', 
    e.appendChild(n);
}

function _hideRouterThinking(e) {
    var t = e.querySelector(".router-thinking");
    t && (t.classList.add("router-thinking-fade"), setTimeout((function() {
        t.parentNode && t.parentNode.removeChild(t);
    }), 400));
}

let closeAllMenus;

enhancePromptBtn.addEventListener("click", (async () => {
    if (STATE.isEnhancing) return;
    if (null !== STATE.originalPromptBeforeEnhance) return promptInput.value = STATE.originalPromptBeforeEnhance, 
    STATE.originalPromptBeforeEnhance = null, promptInput.style.height = "auto", promptInput.style.height = Math.min(promptInput.scrollHeight, 200) + "px", 
    updateEnhanceBtn(), updateSendButton(), void promptInput.focus();
    const e = promptInput.value.trim();
    if (!e) return;
    if (!AUDIO_SETTINGS.enhanceModel) return void showNoModelAlert("l'amélioration de prompts", "enhance-provider");
    STATE.originalPromptBeforeEnhance = null, STATE.isEnhancing = !0, updateEnhanceBtn();
    const t = e;
    promptInput.classList.add("enhancing"), promptInput.readOnly = !0;
    let n = !0;
    enhancePrompt(t, (e => {
        n && (promptInput.value = "", n = !1), promptInput.value += e, promptInput.style.height = "auto", 
        promptInput.style.height = Math.min(promptInput.scrollHeight, 200) + "px";
    }), (() => {
        promptInput.classList.remove("enhancing"), promptInput.readOnly = !1, STATE.originalPromptBeforeEnhance = t, 
        STATE.isEnhancing = !1, updateEnhanceBtn(), updateSendButton(), promptInput.focus();
    }), (e => {
        console.error("Erreur amélioration prompt:", e), promptInput.classList.remove("enhancing"), 
        promptInput.readOnly = !1, promptInput.value = t, showModelAlert(e.message || "Erreur lors de l'amélioration du prompt."), 
        STATE.isEnhancing = !1, updateEnhanceBtn(), updateSendButton(), promptInput.focus();
    }), !!STATE.currentImageModel);
})), toolbarEnhanceBtn.addEventListener("click", (() => {
    enhancePromptBtn.click();
})), toolbarSaveBtn.addEventListener("click", (() => {
    const e = promptInput.value.trim();
    e && openPrModal(null, e);
})), document.addEventListener("click", (() => closeAllMenus())), setCategoriesCallbacks({
    customConfirm: customConfirm,
    customAlert: customAlert,
    refreshConvList: refreshConvList
}), initCategories({
    newChatBtn: newChatBtn,
    convSearch: convSearch,
    promptInput: promptInput
});

const {
    EDITEUR_LABELS,
    OR_MAKER_LABELS,
    _modelMakerLabel,
    EDITEUR_ORDER,
    EDITEUR_ICONS,
    _editeurGroupHeaderHtml,
    HIDDEN_EDITEURS,
    hasProviderKey,
    _tooltip,
    _MODALITY_LABELS,
    _PARAM_LABELS,
    _formatContextLength,
    _formatModalities,
    _formatSupportedParams,
    _formatDefaultParams,
    _isModelNew,
    _isModelExpiringSoon,
    _formatExpirationDateFr,
    _buildModelTooltip,
    upgradeToCustomSelect,
    hasAnyProviderKey,
    updateTriggerDisplay,
    updateActiveOption,
    formatImagePriceRange,
    _formatOrImagePriceStr,
    _formatModelPriceString,
    populateCustomSelect,
    _buildModelsHtml,
    _switchTab,
    _applyModelSelection,
    populateUnifiedSelect,
    populateModelSelect,
    checkApiKeyForModel,
    addModelSwitchElement,
    addModelSwitch
} = createModelSelect({
    STATE,
    chatContainer,
    modelSelect,
    getModelLabel,
    escHtml,
    getApiKeys: () => API_KEYS,
    getModels: () => MODELS,
    getImageModels: () => IMAGE_MODELS,
    getSearchModels: () => SEARCH_MODELS,
    loadCatalogPrefs,
    getTarif,
    getImageTarif,
    getSearchTarif,
    getImageModelEditeur,
    getSearchModelEditeur,
    isLocalEditeur,
    formatImagePrice: _formatImagePrice,
    openApiKeysModal,
    showModelAlert,
    updateInputHint,
    updateEffortMandatory,
    updateImageParamsVisibility,
    setRightPanelTab,
    updateTokenDisplay,
    updateWebSearchBtn,
    updateCanvasBtn,
    populatePlusModels,
    scrollToBottom,
    saveConversation
});

upgradeToCustomSelect(modelSelect);


document.addEventListener("mouseover", (e => {
    const t = e.target.closest(".custom-select-info");
    if (!t) return;
    const n = t.dataset.tooltip;
    if (!n) return;
    _tooltip.textContent = n, _tooltip.classList.add("visible");
    const o = t.getBoundingClientRect(), a = _tooltip.getBoundingClientRect(), r = window.innerWidth, s = window.innerHeight;
    let i = o.right + 8;
    i + a.width > r - 8 && (i = o.left - a.width - 8);
    let l = o.top + o.height / 2 - a.height / 2;
    l = Math.max(8, Math.min(l, s - a.height - 8)), _tooltip.style.left = i + "px", 
    _tooltip.style.top = l + "px", _tooltip.style.transform = "none";
})), document.addEventListener("mouseout", (e => {
    e.target.closest(".custom-select-info") && _tooltip.classList.remove("visible");
})), window.addEventListener("unhandledrejection", (function(e) {
    console.warn("[cetas] Rejeton non gérée :", e.reason);
    var t = document.getElementById("update-toast") || document.getElementById("dev-toast");
    t && (t.textContent = "Une erreur est survenue — voir console", t.style.display = "", 
    clearTimeout(t._timer), t._timer = setTimeout((function() {
        t.style.display = "none";
    }), 4e3));
})), Auth.init().then((() => {
    navigator.storage && navigator.storage.persist && navigator.storage.persist().catch((function() {})), 
    import("../services/settings-sync.js").then((async function(e) {
        if (await e.syncPullSettings() > 0) {
            var t = localStorage.getItem("minou-theme");
            t && "light" !== t && applyTheme(t), "function" == typeof updateBudgetPreview && updateBudgetPreview();
        }
    })).catch((function() {})), initConfig().then((async () => {
        updateInputHint(), updateTokenDisplay(), refreshConvList().finally((() => {
            var e;
            "function" == typeof startAutoSync ? (e = syncPullFromServer().then((function(e) {
                e > 0 && (refreshConvList(), renderFavList());
            })).catch((function() {})), startAutoSync()) : e = "function" == typeof syncPullFromServer ? syncPullFromServer().then((function(e) {
                e > 0 && (refreshConvList(), renderFavList());
            })).catch((function() {})) : Promise.resolve(), e.then((function() {
                renderFavList(), "function" == typeof window.__kiroSplashReady && window.__kiroSplashReady();
            }));
        })), refreshCatBar(), await importDefaultSystemPrompts(), refreshSpList(), refreshPrList(), 
        "function" == typeof pruneLastSelectionsOrphans && pruneLastSelectionsOrphans();
        const e = localStorage.getItem("minou-last-model");
        if (e && MODELS.some((t => t.id === e)) && (modelSelect._customValue = e, modelSelect._activeCategory = "text", 
        STATE.currentModel = e, updateTriggerDisplay(modelSelect), updateEffortMandatory(e)), 
        !STATE.currentModel) {
            const e = MODELS.find((e => "samagent-n4" === e.id && hasProviderKey(e.editeur))) || MODELS.find((e => hasProviderKey(e.editeur)));
            e && (modelSelect._customValue = e.id, modelSelect._activeCategory = "text", STATE.currentModel = e.id, 
            updateTriggerDisplay(modelSelect), updateEffortMandatory(e.id));
        }
        const t = localStorage.getItem("minou-last-image-model");
        updateImageParamsVisibility(getImageModelEditeur(t) || "", t), updateWebSearchBtn(), 
        "function" == typeof updateCanvasBtn && updateCanvasBtn();
        const n = localStorage.getItem("cetas-last-conv");
        if (n) try {
            await loadConversation(n);
        } catch (e) {}
        promptInput.focus(), document.querySelectorAll(".dev-module-btn").forEach((e => {
            e.addEventListener("click", (() => {
                if (e.dataset.module === "marexcode") {
                    window.location.href = "/marexcode/";
                    return;
                }
                const t = document.getElementById("dev-toast");
                t && (t.style.display = "", t.style.animation = "none", t.offsetWidth, t.style.animation = "", 
                clearTimeout(t._timeout), t._timeout = setTimeout((() => {
                    t.style.display = "none";
                }), 2e3));
            }));
        }));
        const o = Auth.getCurrentUser(), a = document.getElementById("user-avatar-initials");
        if (a && o) {
            const e = o.username || "";
            a.textContent = e.substring(0, 2).toUpperCase();
        }
        const r = document.getElementById("user-avatar-btn"), s = document.getElementById("user-menu-dropdown");
        r && s && (r.addEventListener("click", (e => {
            e.stopPropagation();
            if ("flex" === s.style.display) s.style.display = "none"; else {
                s.style.visibility = "hidden", s.style.display = "flex";
                const e = r.getBoundingClientRect(), t = s.offsetHeight;
                s.style.visibility = "", s.style.left = e.left + "px", s.style.top = e.top - t - 8 + "px";
            }
        })), document.addEventListener("click", (e => {
            r.contains(e.target) || s.contains(e.target) || (s.style.display = "none");
        })));
        const i = document.getElementById("logout-btn");
        i && (i.style.display = "", i.addEventListener("click", (() => {
            Auth.logout();
        }))), initUserManagement(), setFavoritesCallbacks(loadConversation, refreshConvList), 
        setWebSearchAlignCallback(alignInputHint), initExportHandlers(), initBudget(), initConversationPanel(), 
        initPlusMenu();
    }));
})), modelSelect._activeCategory = "text", modelSelect.addEventListener("change", (() => {
    const e = modelSelect._activeCategory || "text", t = modelSelect.value;
    let n;
    if (n = "text" === e ? getModelEditeur : "image" === e ? getImageModelEditeur : getSearchModelEditeur, 
    t && !checkApiKeyForModel(t, n)) return modelSelect._customValue = modelSelect._prevCustomValue || "", 
    updateTriggerDisplay(modelSelect), void updateActiveOption(modelSelect);
    _applyModelSelection(e, t);
})), promptInput.addEventListener("input", (() => {
    promptInput.style.height = "auto", promptInput.style.height = Math.min(promptInput.scrollHeight, 200) + "px", 
    updateSendButton(), null === STATE.originalPromptBeforeEnhance || STATE.isEnhancing || (STATE.originalPromptBeforeEnhance = null, 
    updateEnhanceBtn()), STATE.isEnhancing || updateEnhanceBtn();
}));

const micIconDefaultSaved = micBtn.innerHTML, micIconStopStreaming = '<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" stroke="none"><rect x="6" y="6" width="12" height="12" rx="2"/></svg>';

let updateSendButton;

sendBtn.title = "Envoyer (Entrée)";

const inputHint = document.getElementById("input-hint");

function alignInputHint() {
    if (!inputHint) return;
    inputHint.style.paddingLeft = "0", inputHint.style.paddingRight = "0";
    const e = document.querySelector(".input-row"), t = document.querySelector(".input-line-2-left"), n = document.querySelector(".input-line-2-right");
    if (!e || !t || !n) return;
    const o = e.getBoundingClientRect(), a = t.getBoundingClientRect(), r = n.getBoundingClientRect(), s = a.right - o.left, i = o.right - r.left;
    inputHint.style.paddingLeft = Math.max(0, s) + "px", inputHint.style.paddingRight = Math.max(0, i) + "px";
}

inputHint && (inputHint.textContent = "MAJ (Shift) + Entrée pour un saut de ligne"), 
setTimeout(alignInputHint, 100), window.addEventListener("resize", alignInputHint), 
updatePromptToolbar();

let _lastClickX = null, _lastClickY = null;

let hideEmptyPlaceholder, showEmptyPlaceholder;

function resetConversation() {
    STATE.conversationHistory = [], chatContainer.innerHTML = "", showEmptyPlaceholder(), 
    promptInput.value = "", promptInput.style.height = "auto", STATE.isStreaming = !1, 
    STATE._routerForceThinking = !1, STATE.currentAbortController = null, STATE.totalInputTokens = 0, 
    STATE.totalOutputTokens = 0, STATE.totalCost = 0, STATE.totalImageCost = 0, STATE.totalAudioCost = 0, 
    STATE.totalTitleCost = 0, STATE.costByModel = {}, STATE.conversationId = null, localStorage.removeItem("cetas-last-conv"), 
    STATE.conversationStartTime = null, STATE.conversationLastActivity = null, STATE.conversationTitle = null, 
    STATE.firstPrompt = null, STATE.conversationStarted = !1, STATE.currentSystemPrompt = null;
    const e = localStorage.getItem("minou-last-model"), t = e && MODELS.some((t => t.id === e));
    STATE.currentModel = t ? e : null, STATE.currentImageModel = null, STATE.currentSearchModel = null, 
    STATE.currentConversationCategory = STATE.activeCategoryId || null, STATE.pendingImages = [], 
    STATE.pendingFiles = [], cancelAllPendingLoads(), STATE.originalPromptBeforeEnhance = null, 
    STATE.isEnhancing = !1, attachPreview.innerHTML = "", modelSelect.disabled = !1, 
    _switchTab("text", !1), modelSelect._customValue = t ? e : "", updateTriggerDisplay(modelSelect), 
    updateActiveOption(modelSelect), updateEffortMandatory(t ? e : null), setRightPanelTab("general"), 
    spSelect.disabled = !1, spSelect.value = "", spTextarea.value = "", updateTokenDisplay(), 
    updateSendButton(), updateWebSearchBtn(), window.Canvas && window.Canvas.reset(), 
    updateCanvasBtn(), updateEnhanceBtn(), highlightActiveConv(), updateExportMdBtn(), 
    updateChatHeader(), updateActiveCatColor(), promptInput.focus();
}

promptInput.addEventListener("mousedown", (e => {
    const t = promptInput.closest(".input-content");
    if (t) {
        const n = t.getBoundingClientRect();
        _lastClickX = e.clientX - n.left, _lastClickY = e.clientY - n.top;
    }
    setTimeout((() => showInsertBtn()), 0);
})), promptInput.addEventListener("input", (() => {
    _insertBtnVisible && hideInsertBtn(), updatePromptToolbar();
})), promptInput.addEventListener("focus", (() => {
    updatePromptToolbar(), window.innerWidth < 768 && setTimeout((() => scrollToBottom(!0)), 300);
})), promptInput.addEventListener("blur", (() => {
    setTimeout((() => {
        const e = document.querySelector(".input-line-2"), t = e && e.contains(document.activeElement), n = toolbarInsertBtn.contains(document.activeElement), o = "" === promptPickerDropdownWrapper.style.display;
        t || n || o || (hideInsertBtn(), updatePromptToolbar());
    }), 150);
})), promptInput.addEventListener("keydown", (e => {
    if ("Enter" === e.key) if (e.shiftKey) {
        e.preventDefault();
        const t = promptInput.selectionStart, n = promptInput.selectionEnd;
        promptInput.value = promptInput.value.substring(0, t) + "\n" + promptInput.value.substring(n), 
        promptInput.selectionStart = promptInput.selectionEnd = t + 1, promptInput.style.height = "auto", 
        promptInput.style.height = Math.min(promptInput.scrollHeight, 200) + "px", promptInput.dispatchEvent(new Event("input"));
    } else e.preventDefault(), STATE.isStreaming || sendBtn.disabled || sendMessage();
})), sendBtn.addEventListener("click", (() => {
    STATE.isStreaming ? (STATE.currentAbortController && STATE.currentAbortController.abort(), 
    STATE.conversationId && STATE._activeStreams.delete(STATE.conversationId), STATE.isStreaming = !1, 
    STATE._routerForceThinking = !1, window.Ocean?.setPaused && window.Ocean.setPaused(!1), 
    STATE.currentAbortController = null, updateSendButton()) : sendBtn.disabled || sendMessage();
})), newChatBtn.addEventListener("click", (() => {
    saveConversation(), resetConversation(), refreshConvList();
}));

const _dlgOverlay = document.getElementById("custom-dialog-overlay"), _dlgIcon = document.getElementById("custom-dialog-icon"), _dlgMessage = document.getElementById("custom-dialog-message"), _dlgActions = document.getElementById("custom-dialog-actions"), _dlgOk = document.getElementById("custom-dialog-ok"), _dlgCancel = document.getElementById("custom-dialog-cancel"), _DIALOG_ICONS = {
    warning: '<svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>',
    error: '<svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>',
    delete: '<svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2"/></svg>',
    wait: '<svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>',
    mic: '<svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="2" width="6" height="12" rx="3"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>',
    import: '<svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>',
    revert: '<svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 14 4 9 9 4"/><path d="M20 20v-7a4 4 0 0 0-4-4H4"/></svg>',
    save: '<svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>'
};

function _showDialog(e, {icon: t = "warning", confirm: n = !1, danger: o = !1, okLabel: a = "OK", cancelLabel: r = "Annuler", html: s = !1, checkboxLabel: i = "", suppressKey: l = ""} = {}) {
    return new Promise((c => {
        _DIALOG_ICONS[t] ? _dlgIcon.innerHTML = _DIALOG_ICONS[t] : "string" == typeof t && t.trim().startsWith("<") ? _dlgIcon.innerHTML = t : _dlgIcon.textContent = t, 
        s ? _dlgMessage.innerHTML = e : _dlgMessage.textContent = e, _dlgOk.textContent = a, 
        _dlgCancel.textContent = r, _dlgCancel.style.display = n ? "" : "none", _dlgOk.className = "custom-dialog-btn custom-dialog-btn-ok" + (o ? " danger" : ""), 
        _dlgOverlay.style.display = "";
        let d = null;
        if (i) {
            d = document.createElement("div"), d.className = "custom-dialog-checkbox";
            const e = document.createElement("label"), t = document.createElement("input");
            t.type = "checkbox", t.id = "custom-dialog-cb", e.appendChild(t), e.appendChild(document.createTextNode(" " + i)), 
            d.appendChild(e), _dlgActions.parentNode.insertBefore(d, _dlgActions);
        }
        function u() {
            d && d.remove(), _dlgOk.removeEventListener("click", p), _dlgCancel.removeEventListener("click", m), 
            _dlgOverlay.removeEventListener("click", g), _dlgOverlay.style.display = "none";
        }
        function p() {
            if (d && l) {
                const e = d.querySelector("input");
                e && e.checked && localStorage.setItem(l, Date.now().toString());
            }
            u(), c(!0);
        }
        function m() {
            u(), c(!1);
        }
        function g(e) {
            e.target === _dlgOverlay && (u(), c(!n));
        }
        _dlgOk.addEventListener("click", p), _dlgCancel.addEventListener("click", m), _dlgOverlay.addEventListener("click", g);
    }));
}

function customAlert(e, t = "warning") {
    return _showDialog(e, {
        icon: t,
        confirm: !1
    });
}

function customConfirm(e, {icon: t = "warning", danger: n = !1, okLabel: o = "Confirmer", cancelLabel: a = "Annuler", checkboxLabel: r = "", suppressKey: s = ""} = {}) {
    return _showDialog(e, {
        icon: t,
        confirm: !0,
        danger: n,
        okLabel: o,
        cancelLabel: a,
        checkboxLabel: r,
        suppressKey: s
    });
}

function _isFriendlyCetasError(e) {
    return !!e && /injoignable|requise\. Renseignez|Modèle introuvable|catalogue, sélectionnez|Connexion à .* impossible/i.test(String(e));
}

function showErrorAlert(e, t) {
    if (!e) return _isFriendlyCetasError(t) ? customAlert(t, "error") : customAlert(`Erreur : ${t}`, "error");
    const n = t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
    return _showDialog(`<div class="error-alert-header"><strong>Une erreur est survenue</strong><br>Analyse de l'erreur par l'IA :</div><div class="error-alert-body">${"undefined" != typeof marked ? marked.parse(e) : e.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\n/g, "<br>")}</div><details class="error-raw-details"><summary>Voir les détails de l'erreur</summary><pre class="error-raw-pre">${n}</pre></details>`, {
        icon: "error",
        confirm: !1,
        html: !0
    });
}

let modelAlertTimer = null;

function showMissingModelBanner(e) {
    const t = (e || "").toString();
    showModelAlert(`Le modèle d'origine "${t}" n'est plus disponible, sélectionnez-en un autre pour continuer.`), 
    console.info(`[Cetas] Modèle "${t}" introuvable lors du chargement de la conversation, sélection réinitialisée.`);
}

const MODEL_ALERT_DEFAULT = "Veuillez choisir un modèle (texte ou image) avant d'envoyer.";

function _hideModelAlert() {
    const e = document.getElementById("model-alert");
    if (!e) return;
    e.style.display = "none";
    const t = document.getElementById("model-alert-text");
    t && (t.textContent = MODEL_ALERT_DEFAULT);
}

function showModelAlert(e, t = 12e3) {
    const n = document.getElementById("model-alert"), o = document.getElementById("model-alert-text");
    n && o && (e && (o.textContent = e), n.style.display = "", modelAlertTimer && clearTimeout(modelAlertTimer), 
    modelAlertTimer = setTimeout(_hideModelAlert, t));
}

function showNoModelAlert(e, t) {
    const n = document.getElementById("no-model-alert-overlay"), o = document.getElementById("no-model-alert-text"), a = escHtml(e);
    t ? (o.innerHTML = `Pour utiliser « ${a} », veuillez sélectionner un modèle dans <a href="#" id="no-model-alert-link" class="no-model-alert-link">Configuration &gt; Modèles</a>.`, 
    document.getElementById("no-model-alert-link").addEventListener("click", (e => {
        e.preventDefault(), n.style.display = "none", openApiKeysModal("models"), setTimeout((() => {
            const e = document.getElementById(t);
            if (!e) return;
            const n = e.closest(".audio-setting-row") || e;
            n.scrollIntoView({
                behavior: "smooth",
                block: "center"
            }), n.classList.remove("config-field-highlight"), n.offsetWidth, n.classList.add("config-field-highlight"), 
            setTimeout((() => n.classList.remove("config-field-highlight")), 2200);
            try {
                e.focus({
                    preventScroll: !0
                });
            } catch {}
        }), 120);
    }), {
        once: !0
    })) : o.textContent = `Pour utiliser « ${e} », veuillez sélectionner un modèle dans Configuration > Modèles.`, 
    n.style.display = "";
}

function generateConversationId(e) {
    const t = new Date, n = t.getFullYear() + "-" + String(t.getMonth() + 1).padStart(2, "0") + "-" + String(t.getDate()).padStart(2, "0") + " " + String(t.getHours()).padStart(2, "0") + "-" + String(t.getMinutes()).padStart(2, "0") + "-" + String(t.getSeconds()).padStart(2, "0");
    return `${e.substring(0, 10).replace(/[^a-zA-Z0-9àâéèêëïîôùûüçÀÂÉÈÊËÏÎÔÙÛÜÇ ]/g, "_")} ${n}-${Math.random().toString(36).slice(2, 6)}`;
}

function updateTokenDisplay() {
    document.getElementById("token-bar");
    const e = STATE.conversationHistory.length > 0;
    tokenInfo.style.display = e ? "" : "none", costInfo.style.display = e ? "" : "none", 
    tokenInfo.textContent = `↑ ${STATE.totalInputTokens.toLocaleString("fr-FR")} ↓ ${STATE.totalOutputTokens.toLocaleString("fr-FR")} Tokens`;
    const t = STATE.totalCost + STATE.totalImageCost + STATE.totalAudioCost + STATE.totalTitleCost;
    costInfo.textContent = t > 0 ? `Coût estimé : $${t.toFixed(4)}` : "Coût estimé : —";
}

function _rebindStreamToVisibleDOM(e) {
    if (!e) return;
    const t = addMessage("assistant", "");
    if (t.classList.add("streaming"), e.assistantDiv = t, "text" === e.type) {
        if (e.sr = createStreamRenderer(t, (() => t.querySelector(".message-text")), e.accumulatedText), 
        e.accumulatedText) {
            const n = t.querySelector(".message-text");
            n && (n.innerHTML = marked.parse(e.accumulatedText));
        }
        if (e.accumulatedThinking) {
            const n = document.createElement("details");
            n.className = "thinking-block", n.open = !0;
            const o = document.createElement("summary");
            o.textContent = "Raisonnement", (() => {
                const _b = document.createElement("span");
                _b.className = "thinking-bubble";
                _b.style.left = "20%";
                _b.style.animationDelay = "0s";
                o.appendChild(_b);
                const _b2 = document.createElement("span");
                _b2.className = "thinking-bubble";
                _b2.style.left = "45%";
                _b2.style.animationDelay = "0.8s";
                o.appendChild(_b2);
                const _b3 = document.createElement("span");
                _b3.className = "thinking-bubble";
                _b3.style.left = "70%";
                _b3.style.animationDelay = "1.6s";
                o.appendChild(_b3);
            })(), n.appendChild(o);
            const a = document.createElement("div");
            a.className = "thinking-content", a.innerHTML = marked.parse(e.accumulatedThinking), 
            n.appendChild(a), t.insertBefore(n, t.firstChild), e.thinkSr = createStreamRenderer(t, (() => t.querySelector(".thinking-content")), e.accumulatedThinking);
        } else e.thinkSr = null;
    } else if ("image" === e.type) {
        const e = t.querySelector(".message-text");
        e && (e.textContent = "Génération de l'image en cours…");
    }
    scrollToBottom(!0);
}

function _mergeConvData(e, t, {overrides: n = {}, deltas: o = null} = {}) {
    const a = {
        id: e.id || t,
        title: e.titre || e.title || null,
        model: e.modele || e.model || null,
        startTime: e.date || e.startTime || null,
        lastActivity: (new Date).toISOString(),
        totalInputTokens: (e.tokens_entree || 0) + (o?.tokensIn || 0),
        totalOutputTokens: (e.tokens_sortie || 0) + (o?.tokensOut || 0),
        totalCost: (e.totalCost || 0) + (o?.cost || 0),
        totalImageCost: (e.cout_images || 0) + (o?.imageCost || 0),
        totalAudioCost: e.cout_audio || 0,
        totalTitleCost: (e.cout_titre || 0) + (n.titleCostDelta || 0),
        costByModel: e.cost_by_model || {},
        systemPrompt: e.system_prompt || e.systemPrompt || null,
        category: e.category || null,
        messages: "messages" in n ? n.messages : e.messages || [],
        canvas: e.canvas || void 0
    };
    return n.title && (a.title = n.title), o?.modelKey && (o.tokensIn || o.tokensOut || o.cost) && (a.costByModel[o.modelKey] = a.costByModel[o.modelKey] || {
        input: 0,
        output: 0,
        cost: 0
    }, a.costByModel[o.modelKey].input += o.tokensIn || 0, a.costByModel[o.modelKey].output += o.tokensOut || 0, 
    a.costByModel[o.modelKey].cost += o.cost || 0), a;
}

async function _saveConvById(e, t, n) {
    if (!e) return;
    const o = e.replace(/[<>:"/\\|?*]/g, "_") + ".json";
    let a = null;
    if (await updateConversationFile(o, (o => o ? (a = _mergeConvData(o, e, {
        overrides: {
            messages: t
        },
        deltas: n
    }), formatConversationFile(a)) : null)), a && (refreshConvListItem(o) || refreshConvList(), 
    e !== STATE.conversationId || STATE._activeStreams.has(e) || loadConversation(o), 
    2 === t.length && !a.title)) try {
        maybeGenerateTitle(e, t, n?.modelKey);
    } catch {}
}

function saveConversation() {
    if (!STATE.conversationId || 0 === STATE.conversationHistory.length) return;
    const e = {
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
        canvas: window.Canvas && window.Canvas.isActive ? window.Canvas.serialize() : void 0
    }, t = STATE.conversationId.replace(/[<>:"/\\|?*]/g, "_") + ".json", n = formatConversationFile(e);
    writeConversationFile(t, n).then((() => {
        refreshConvListItem(t) || refreshConvList(), checkBudgetAlert();
    })).catch((function(e) {
        console.warn("saveConversation UI update failed:", e);
    })), "function" == typeof syncPushToServer && syncPushToServer(t, n).catch((function() {})), 
    updateExportMdBtn();
}

async function maybeGenerateTitle(e, t, n) {
    const o = e || STATE.conversationId, a = t || STATE.conversationHistory;
    if (!o || 2 !== a.length) return;
    const r = getTextFromContent(a[0].content), s = getTextFromContent(a[1].content);
    if (!r) return;
    const i = o.replace(/[<>:"/\\|?*]/g, "_") + ".json";
    async function l(e, t) {
        if (!e) return;
        let n = !1;
        await updateConversationFile(i, (a => {
            if (!a) return null;
            if (a.titre || a.title) return null;
            const r = _mergeConvData(a, o, {
                overrides: {
                    title: e,
                    titleCostDelta: t || 0
                }
            });
            return n = !0, formatConversationFile(r);
        })), n && (STATE.conversationId === o && (STATE.conversationTitle = e, t && (STATE.totalTitleCost += t), 
        updateChatHeader(), updateTokenDisplay()), refreshConvListItem(i) || refreshConvList());
    }
    if ("none" === AUDIO_SETTINGS.titleModel) {
        const e = r.trim().split(/\s+/).slice(0, 6).join(" ");
        if (e) {
            const t = e.length > 40 ? e.substring(0, 37) + "..." : e;
            await l(t, 0);
        }
        return;
    }
    let c = AUDIO_SETTINGS.titleModel || n || STATE.currentModel || STATE.currentImageModel || STATE.currentSearchModel;
    if (c && !hasProviderKey(getModelEditeur(c)) && (c = (MODELS || []).find((e => hasProviderKey(e.editeur)))?.id || null), 
    c) try {
        const e = `Donne un titre très court (3 à 6 mots max, en français) pour cette conversation. Réponds UNIQUEMENT avec le titre, sans guillemets, sans markdown, sans ponctuation finale.\n\nUtilisateur : ${r.substring(0, 300)}\n\nAssistant : ${s.substring(0, 300)}`, t = await streamText(c, e);
        let n = t.text?.trim();
        if (n && (n = n.replace(/<think>[\s\S]*?<\/think>/g, "").replace(/<\/?think>/g, "").trim()), 
        n) {
            const e = getTarif(c), o = t.usage ? _resolveTextCost(e, t.usage) : 0;
            await l(n, o);
        }
    } catch (e) {
        console.error("Erreur génération titre:", e);
    }
}

function getTextFromContent(e) {
    return "string" == typeof e ? e : Array.isArray(e) ? e.filter((e => "text" === e.type)).map((e => e.text)).join("") : "";
}

document.getElementById("model-alert-close")?.addEventListener("click", (() => {
    modelAlertTimer && clearTimeout(modelAlertTimer), _hideModelAlert();
})), document.getElementById("no-model-alert-close").addEventListener("click", (() => {
    document.getElementById("no-model-alert-overlay").style.display = "none";
})), document.getElementById("no-model-alert-overlay").addEventListener("click", (e => {
    e.target === e.currentTarget && (e.currentTarget.style.display = "none");
})), window.saveConversation = saveConversation;

const _IMG_DOWNLOAD_SVG = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>';

function buildImagesContainer(e, {altText: t = "Image"} = {}) {
    const n = document.createElement("div");
    n.className = "message-images";
    for (const o of e) {
        const e = document.createElement("div");
        e.className = "message-image-wrap";
        const a = o.dataUrl ? null : o.data || o.b64, r = o.dataUrl || `data:${o.mimeType};base64,${a}`, s = document.createElement("img");
        s.src = r, s.alt = t, attachLightboxToImg(s);
        const i = document.createElement("button");
        i.className = "image-download-btn", i.innerHTML = _IMG_DOWNLOAD_SVG, i.title = "Télécharger", 
        i.addEventListener("click", (() => {
            const e = document.createElement("a");
            e.href = r;
            const t = (o.mimeType || "image/png").split("/")[1] || "png";
            e.download = `cetas-image.${t}`, e.click();
        })), e.appendChild(s), e.appendChild(i), n.appendChild(e);
    }
    return n;
}

function imageResultToContent(e) {
    const t = [];
    e.text && t.push({
        type: "text",
        text: e.text
    });
    for (const n of e.images) t.push({
        type: "image",
        data: n.b64,
        mimeType: n.mimeType
    });
    return t;
}

function collectReferenceImages(e) {
    const t = [], n = new Set, o = e[e.length - 1];
    if (o && Array.isArray(o.content)) for (const e of o.content) "image" === e.type && e.data && (t.push({
        data: e.data,
        mimeType: e.mimeType
    }), n.add(e.data));
    for (let o = e.length - 2; o >= 0; o--) {
        const a = e[o];
        if (Array.isArray(a.content)) {
            const e = a.content.filter((e => "image" === e.type && e.data && !n.has(e.data)));
            if (e.length > 0) {
                for (const n of e) t.push({
                    data: n.data,
                    mimeType: n.mimeType
                });
                break;
            }
        }
    }
    return t;
}

function addMessage(e, t, n, o, a, r, s) {
    hideEmptyPlaceholder();
    const i = document.createElement("div");
    if (i.className = `message message-${e}`, "assistant" === e && a) {
        const I = document.createElement("details");
        I.className = "thinking-block";
        const k = document.createElement("summary");
        k.textContent = "Raisonnement", (() => {
            const _b = document.createElement("span");
            _b.className = "thinking-bubble";
            _b.style.left = "20%";
            _b.style.animationDelay = "0s";
            k.appendChild(_b);
            const _b2 = document.createElement("span");
            _b2.className = "thinking-bubble";
            _b2.style.left = "45%";
            _b2.style.animationDelay = "0.8s";
            k.appendChild(_b2);
            const _b3 = document.createElement("span");
            _b3.className = "thinking-bubble";
            _b3.style.left = "70%";
            _b3.style.animationDelay = "1.6s";
            k.appendChild(_b3);
        })(), I.appendChild(k);
        const b = document.createElement("div");
        b.className = "thinking-content", b.innerHTML = marked.parse(a), I.appendChild(b), 
        i.appendChild(I);
    }
    if (Array.isArray(t)) {
        const B = t.filter((e => "image" === e.type));
        B.length > 0 && i.appendChild(buildImagesContainer(B));
        const _ = t.filter((e => "file" === e.type));
        if (_.length > 0) {
            const L = document.createElement("div");
            L.className = "message-files";
            for (const w of _) {
                const x = document.createElement("div");
                x.className = "message-file-chip", x.title = w.name;
                const P = document.createElement("span");
                P.className = "message-file-chip-name", P.textContent = "📄 " + (w.name.length > 25 ? w.name.substring(0, 22) + "..." : w.name);
                const O = () => {
                    if (!w.data) return null;
                    const e = new Blob([ Uint8Array.from(atob(w.data), (e => e.charCodeAt(0))) ], {
                        type: w.mimeType || "application/octet-stream"
                    });
                    return URL.createObjectURL(e);
                };
                P.style.cursor = "pointer", P.addEventListener("click", (function() {
                    this._prevUrl && (URL.revokeObjectURL(this._prevUrl), clearTimeout(this._prevTimer));
                    const e = O();
                    e && (this._prevUrl = e, this._prevTimer = setTimeout((() => {
                        URL.revokeObjectURL(e), this._prevUrl = null;
                    }), 6e4), openFileViewer(e, w.name));
                }));
                const D = document.createElement("button");
                D.className = "message-file-chip-dl", D.title = "Télécharger", D.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>', 
                D.addEventListener("click", (e => {
                    e.stopPropagation();
                    const t = O();
                    if (!t) return;
                    const n = document.createElement("a");
                    n.href = t, n.download = w.name, n.click(), setTimeout((() => URL.revokeObjectURL(t)), 1e3);
                })), x.appendChild(P), x.appendChild(D), L.appendChild(x);
            }
            i.appendChild(L);
        }
    }
    const l = document.createElement("div");
    l.className = "message-text";
    const c = getTextFromContent(t);
    if ("assistant" === e && c) l.innerHTML = marked.parse(c), addCodeCopyButtons(l); else if ("assistant" !== e || c) l.textContent = c; else if ("string" == typeof t) {
        const R = document.createElement("span");
        R.className = "generation-placeholder", R.textContent = "Génération en cours...", 
        l.appendChild(R);
    }
    i.appendChild(l), i._rawMarkdown = c;
    const d = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>', u = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>', p = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>', m = Array.isArray(t) ? t.filter((e => "image" === e.type)) : [], g = "string" == typeof t && t.trim() || Array.isArray(t) && t.some((e => "text" === e.type && e.text && e.text.trim())), h = "assistant" === e && m.length > 0 && !g, v = document.createElement("button");
    v.className = "message-copy-btn";
    const T = document.createElement("span");
    function y(e) {
        navigator.clipboard.writeText(e).then((() => {
            T.innerHTML = u, setTimeout((() => {
                T.innerHTML = d;
            }), 1500);
        })).catch((function() {}));
    }
    if (T.className = "copy-icon", v.appendChild(T), h) v.title = m.length > 1 ? "Enregistrer les images" : "Enregistrer l’image", 
    T.innerHTML = p, v.addEventListener("click", (() => {
        m.forEach(((e, t) => {
            const n = e.dataUrl || `data:${e.mimeType};base64,${e.data}`, o = document.createElement("a");
            o.href = n;
            const a = (e.mimeType || "image/png").split("/")[1] || "png";
            o.download = m.length > 1 ? `cetas-image-${t + 1}.${a}` : `cetas-image.${a}`, o.click();
        })), T.innerHTML = u, setTimeout((() => {
            T.innerHTML = p;
        }), 1500);
    })); else if (v.title = "Copier", T.innerHTML = d, "assistant" === e) {
        const H = document.createElement("div");
        H.className = "copy-menu", H.innerHTML = '<div class="copy-menu-item" data-mode="text">Copier</div><div class="copy-menu-item" data-mode="md">Copier au format Markdown</div>', 
        i.appendChild(H), v.addEventListener("click", (e => {
            e.target.closest(".copy-menu-item") || (closeAllMenus(H), H.classList.toggle("open"), 
            v.classList.toggle("menu-open", H.classList.contains("open")), H.classList.contains("open") && function(e, t) {
                const n = t.getBoundingClientRect();
                let o = n.left, a = n.top - e.offsetHeight - 4;
                o + e.offsetWidth > window.innerWidth - 4 && (o = n.right - e.offsetWidth), o < 4 && (o = 4), 
                a < 4 && (a = n.bottom + 4), e.style.left = o + "px", e.style.top = a + "px";
            }(H, v), e.stopPropagation());
        })), H.addEventListener("click", (e => {
            const n = e.target.closest(".copy-menu-item");
            if (!n) return;
            e.stopPropagation(), H.classList.remove("open"), v.classList.remove("menu-open");
            if ("md" === n.dataset.mode) y(i._rawMarkdown || getTextFromContent(t)); else {
                const e = i.querySelector(".message-text");
                y(e ? e.textContent : getTextFromContent(t));
            }
        }));
    } else v.addEventListener("click", (() => {
        const e = i.querySelector(".message-text");
        y(e ? e.textContent : getTextFromContent(t));
    }));
    const f = document.createElement("div");
    if (f.className = "message-btn-row", "assistant" === e) {
        const N = document.createElement("span");
        N.className = "message-gen-time", o && (N.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>', 
        N.dataset.tooltip = formatGenTooltip(o, r, s)), f.appendChild(N);
    }
    if (f.appendChild(v), "user" === e) {
        const q = document.createElement("button");
        q.className = "message-save-prompt-btn", q.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>', 
        q.title = "Enregistrer ce prompt", q.addEventListener("click", (() => {
            const e = i.querySelector(".message-text"), n = e ? e.textContent : getTextFromContent(t);
            n && openPrModal(null, n);
        })), f.appendChild(q);
        const F = document.createElement("button");
        F.className = "message-edit-btn", F.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"/></svg>', 
        F.title = "Modifier ce message", F.addEventListener("click", (() => {
            if (STATE.isStreaming) return;
            startEditMessage(i.closest(".message-wrapper"), i);
        })), f.appendChild(F);
    }
    const E = Array.isArray(t) && t.some((e => "image" === e.type));
    if ("assistant" === e && !E) {
        const U = document.createElement("button");
        U.className = "message-tts-btn";
        const j = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/></svg>', $ = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="6" y="6" width="12" height="12" rx="1"/></svg>', G = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="spin"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>', W = document.createElement("span");
        W.className = "tts-icon", W.innerHTML = j, U.appendChild(W), U.title = "Lire à haute voix";
        const K = document.createElement("div");
        K.className = "copy-menu", K.innerHTML = '<div class="copy-menu-item" data-mode="play">Lire à haute voix</div><div class="copy-menu-item" data-mode="save">Enregistrer au format audio</div>', 
        i.appendChild(K);
        let V = !1, z = null, Y = null, X = null;
        function S() {
            const e = i.querySelector(".message-text");
            return e ? e.textContent : "";
        }
        function A() {
            W.innerHTML = j, U.title = "Lire à haute voix", V = !1;
        }
        const Q = () => "system-tts" === AUDIO_SETTINGS.ttsProvider;
        function C(e, t = !1, n = null) {
            if (!AUDIO_SETTINGS.ttsProvider) return void showNoModelAlert("la synthèse vocale", "audio-tts-provider");
            if (z && X !== AUDIO_SETTINGS.ttsProvider && (Y && (URL.revokeObjectURL(Y), Y = null), 
            z = null, X = null), z) return void e(z);
            const o = S();
            if (!o) return;
            V = !0, W.innerHTML = G, U.title = "Chargement...";
            const a = AUDIO_SETTINGS.ttsProvider;
            ttsSpeak(o, ((t, n, o) => {
                if (V = !1, z = t, X = a, t) {
                    let e = 30;
                    const t = MODELS_DATA.tts.find((e => e.id === AUDIO_SETTINGS.ttsProvider));
                    if (t && t.prix) {
                        const n = t.prix.match(/\$([\d.]+)\/1M/);
                        n && (e = parseFloat(n[1]));
                    }
                    const o = n / 1e6 * e;
                    STATE.totalAudioCost += o, addCostForModel("tts", 0, 0, o), updateTokenDisplay(), 
                    saveConversation();
                }
                e(t, o);
            }), (e => {
                A(), console.error("TTS error:", e), customAlert("Erreur TTS : " + e.message, "error");
            }), t, n);
        }
        U.addEventListener("click", (e => {
            if (STATE.currentTtsAudio) {
                if ("system" === STATE.currentTtsAudio) window.speechSynthesis.cancel(); else if ("function" == typeof STATE.currentTtsAudio) try {
                    currentTtsAudio();
                } catch (e) {} else STATE.currentTtsAudio.pause(), STATE.currentTtsAudio.currentTime = 0;
                return STATE.currentTtsAudio = null, document.querySelectorAll(".tts-icon").forEach((function(e) {
                    e.innerHTML = j;
                })), void document.querySelectorAll(".message-tts-btn").forEach((function(e) {
                    e.title = "Lire à haute voix";
                }));
            }
            V || (AUDIO_SETTINGS.ttsProvider ? (!function() {
                if (Q()) {
                    const e = S();
                    if (!e) return;
                    return W.innerHTML = $, U.title = "Arrêter la lecture", STATE.currentTtsAudio = "system", 
                    void ttsSpeak(e, (() => {
                        STATE.currentTtsAudio = null, A();
                    }), (e => {
                        STATE.currentTtsAudio = null, A(), console.error("TTS error:", e), customAlert("Erreur TTS : " + e.message, "error");
                    }));
                }
                C(((e, t) => {
                    if (t) return STATE.currentTtsAudio = null, void A();
                    Y && URL.revokeObjectURL(Y), Y = URL.createObjectURL(e);
                    const n = new Audio(Y);
                    STATE.currentTtsAudio = n, W.innerHTML = $, U.title = "Arrêter la lecture", n.onended = () => {
                        STATE.currentTtsAudio = null, A();
                    }, n.onerror = () => {
                        STATE.currentTtsAudio = null, A(), customAlert("Erreur de lecture audio", "error");
                    }, n.play().catch((e => {
                        STATE.currentTtsAudio = null, A(), console.error("Audio play error:", e), customAlert("Erreur de lecture audio : " + e.message, "error");
                    }));
                }), !1, (e => {
                    STATE.currentTtsAudio = e, W.innerHTML = $, U.title = "Arrêter la lecture";
                }));
            }(), e.stopPropagation()) : showNoModelAlert("la synthèse vocale", "audio-tts-provider"));
        })), f.appendChild(U);
    }
    n && n.length > 0 && appendCitations(i, n);
    const M = document.createElement("div");
    return M.className = `message-wrapper message-wrapper-${e} animate-in`, M.appendChild(i), 
    M.appendChild(f), chatContainer.appendChild(M), M.addEventListener("animationend", (() => M.classList.remove("animate-in")), {
        once: !0
    }), scrollToBottom(!0), "assistant" === e && _samAgentMakeClickable(i), i;
}

function collapseThinkBlock(e) {
    if (!e || !e.open) return;
    const t = e.querySelector(".thinking-content");
    if (!t) return void (e.open = !1);
    const n = e.closest(".message"), o = n ? n.offsetWidth : 0, a = n ? n.offsetHeight : 0, r = t.offsetHeight;
    n && (n.style.width = o + "px", n.style.height = a + "px", n.style.overflow = "hidden"), 
    t.style.height = r + "px", t.style.overflow = "hidden", t.offsetHeight, t.style.transition = "height 0.3s ease-out, opacity 0.3s ease-out", 
    t.style.height = "0px", t.style.opacity = "0", n && (n.offsetHeight, n.style.transition = "height 0.3s ease-out", 
    n.style.height = a - r + "px"), t.addEventListener("transitionend", (function s(i) {
        if ("height" !== i.propertyName) return;
        if (t.removeEventListener("transitionend", s), e.open = !1, t.style.height = "", 
        t.style.overflow = "", t.style.transition = "", t.style.opacity = "", !n) return;
        n.classList.contains("streaming");
        if (STATE.isStreaming) n.style.minWidth = o + "px", n.style.transition = "none", 
        n.style.width = "", n.style.height = "", n.style.overflow = ""; else {
            n.style.transition = "none", n.style.width = "", n.style.height = "", n.style.overflow = "";
            const e = n.offsetWidth, t = n.offsetHeight;
            n.style.width = o + "px", n.style.height = a - r + "px", n.style.overflow = "hidden", 
            n.offsetHeight, n.style.transition = "width 0.3s ease-out, height 0.3s ease-out", 
            n.style.width = e + "px", n.style.height = t + "px", setTimeout((() => {
                n.style.width = "", n.style.height = "", n.style.overflow = "", n.style.transition = "";
            }), 350);
        }
    }));
}

function endStreaming(e) {
    window.Ocean?.setPaused && window.Ocean.setPaused(!1);
    const t = e.offsetWidth;
    e.classList.remove("streaming"), e.classList.add("streaming-done"), e.style.minWidth = t + "px", 
    e.style.transition = "min-width 0.4s ease-out", requestAnimationFrame((() => {
        e.style.minWidth = "";
    })), e.addEventListener("animationend", (() => e.classList.remove("streaming-done")), {
        once: !0
    }), setTimeout((() => {
        e.style.transition = "";
    }), 500), _samAgentMakeClickable(e);
}

function _samAgentMakeClickable(e) {
    if (!e) return;
    if (0 !== (STATE.currentModel || "").indexOf("samagent-")) return;
    const t = [ {
        model: "samagent-nano",
        label: "⚡ SamAgent Nano"
    }, {
        model: "samagent-n4",
        label: "🚀 SamAgent N4"
    }, {
        model: "samagent-n8",
        label: "🧠 SamAgent N8"
    } ], n = e.parentElement;
    if (e.querySelector(".samagent-proposals-rendered")) return;
    e.querySelector(".message-text")?.classList.add("samagent-proposals-rendered");
    const r = document.createElement("div");
    r.className = "samagent-buttons", r.style.cssText = "margin-top:8px;display:flex;flex-direction:column;gap:4px";
    const s = document.createElement("div");
    s.textContent = "Relancer sur un autre palier :", s.style.cssText = "font-size:0.75rem;color:var(--text-muted, #888);margin-bottom:2px", 
    r.appendChild(s);
    let lastUser = "";
    {
        let q = n.previousElementSibling;
        for (;q; ) {
            const u = q.querySelector(".message-user .message-text");
            if (u) {
                lastUser = (u.textContent || "").trim();
                break;
            }
            q = q.previousElementSibling;
        }
    }
    for (const e of t) {
        const t = document.createElement("div");
        t.textContent = e.label, t.style.cssText = "cursor:pointer;padding:8px 12px;border:1px solid var(--border-input);border-radius:8px;background:var(--bg-input);font-size:0.9rem;transition:background 0.15s,border-color 0.15s", 
        t.addEventListener("mouseenter", (() => {
            t.style.background = "var(--bg-hover)", t.style.borderColor = "var(--accent)";
        })), t.addEventListener("mouseleave", (() => {
            t.style.background = "var(--bg-input)", t.style.borderColor = "var(--border-input)";
        })), t.addEventListener("click", (() => {
            if (STATE.isStreaming) return;
            r.querySelectorAll("div").forEach((e => {
                e.style.pointerEvents = "none", e.style.opacity = "0.5";
            }));
            STATE.currentModel = e.model;
            try {
                localStorage.setItem("minou-last-model", e.model);
            } catch (_e) {}
            const t = document.getElementById("prompt-input"), b = document.getElementById("send-btn") || document.getElementById("mobile-send-btn");
            if (t && b && !b.disabled) {
                t.value = lastUser || t.value;
                b.click();
            }
        })), r.appendChild(t);
    }
    const i = e.querySelector(".message-text");
    i && i.appendChild(r);
}

function _wrapNewChars(e, t) {
    if (!(e && t > 0)) return;
    const n = Math.max(t, 8), o = document.createTreeWalker(e, NodeFilter.SHOW_TEXT, null);
    let a = null;
    for (;o.nextNode(); ) {
        const e = o.currentNode;
        e.nodeValue && e.nodeValue.length > 0 && (a = e);
    }
    if (!a) return;
    let r = a.parentNode;
    for (;r && r !== e; ) {
        if ("CODE" === r.nodeName || "PRE" === r.nodeName) return;
        r = r.parentNode;
    }
    const s = a.nodeValue, i = Math.min(n, s.length);
    const prevFade = e.querySelector(".char-fade");
    if (prevFade) {
        prevFade.classList.remove("char-fade");
        prevFade.classList.add("char-fade-out");
        setTimeout((() => {
            prevFade.parentNode && prevFade.remove();
        }), 280);
    }
    if (i >= s.length) {
        const newChars = s;
        const words = newChars.trim().split(/\s+/);
        if (words.length > 1) {
            const lastWord = words[words.length - 1];
            const beforeLast = newChars.slice(0, newChars.lastIndexOf(lastWord));
            const t = a.parentNode;
            if (beforeLast) {
                const span1 = document.createElement("span");
                span1.className = "char-flash";
                span1.textContent = beforeLast;
                t.insertBefore(span1, a);
            }
            const span2 = document.createElement("span");
            span2.className = "char-fade";
            span2.textContent = lastWord;
            t.insertBefore(span2, a);
            t.removeChild(a);
        } else {
            const l = document.createElement("span");
            l.className = "char-flash";
            l.textContent = s;
            a.parentNode.replaceChild(l, a);
        }
    } else {
        const e = s.slice(0, s.length - i);
        const newChars = s.slice(s.length - i);
        const words = newChars.trim().split(/\s+/);
        const t = a.parentNode;
        t.insertBefore(document.createTextNode(e), a);
        if (words.length > 1) {
            const lastWord = words[words.length - 1];
            const beforeLast = newChars.slice(0, newChars.lastIndexOf(lastWord));
            if (beforeLast) {
                const span1 = document.createElement("span");
                span1.className = "char-flash";
                span1.textContent = beforeLast;
                t.insertBefore(span1, a);
            }
            const span2 = document.createElement("span");
            span2.className = "char-fade";
            span2.textContent = lastWord;
            t.insertBefore(span2, a);
        } else {
            const l = document.createElement("span");
            l.className = "char-flash";
            l.textContent = newChars;
            t.insertBefore(l, a);
        }
        t.removeChild(a);
    }
}

function _showThinkingIndicator(e) {
    const t = document.createElement("div");
    t.className = "typing-indicator";
    t.id = "thinking-indicator";
    t.innerHTML = '<div class="typing-avatar"><span class="typing-whale">🐳</span></div><div class="typing-body"><div class="typing-content"><div class="typing-steps"><div class="typing-step active" data-step="0"><div class="typing-step-icon"></div><span>Réflexion en cours...</span></div><div class="typing-step" data-step="1"><div class="typing-step-icon"></div><span>Analyse du contexte...</span></div><div class="typing-step" data-step="2"><div class="typing-step-icon"></div><span>Construction de la réponse...</span></div></div><div class="typing-progress"><div class="typing-progress-bar"></div></div></div></div>';
    const n = e.querySelector(".message-text") || e;
    n.appendChild(t);
    const o = [ {
        delay: 0
    }, {
        delay: 1500
    }, {
        delay: 3e3
    } ];
    o.forEach(((e, n) => {
        if (n === 0) return;
        setTimeout((() => {
            const o = t.querySelector(`[data-step="${n}"]`);
            if (o) {
                t.querySelectorAll(".typing-step").forEach((e => e.classList.remove("active")));
                o.classList.add("active");
                const e = t.querySelector(`[data-step="${n - 1}"]`);
                e && (e.classList.remove("active"), e.classList.add("done"));
            }
        }), e.delay);
    }));
}

function _removeThinkingIndicator() {
    const e = document.getElementById("thinking-indicator");
    e && e.remove();
}

function createStreamRenderer(e, t, n) {
    let o = n || "", a = "", f = null, ts = null, s = o.length, i = !1, l = !1, ws = null, wd = null, _firstChunk = !0, _spinnerEl = null, _spinnerInterval = null;
    const _brailleChars = [ "⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏" ];
    function _startSpinner() {
        if (_spinnerEl) return;
        const msgText = t();
        if (!msgText) return;
        _spinnerEl = document.createElement("span");
        _spinnerEl.className = "stream-spinner";
        _spinnerEl.textContent = _brailleChars[0];
        msgText.appendChild(_spinnerEl);
        let _idx = 0;
        _spinnerInterval = setInterval((() => {
            _idx = (_idx + 1) % _brailleChars.length;
            if (_spinnerEl) _spinnerEl.textContent = _brailleChars[_idx];
        }), 80);
    }
    function _stopSpinner() {
        if (_spinnerInterval) {
            clearInterval(_spinnerInterval);
            _spinnerInterval = null;
        }
        if (_spinnerEl) {
            _spinnerEl.remove();
            _spinnerEl = null;
        }
    }
    function c() {
        const e = t();
        if (!e) return;
        s = o.length;
        const n = e.textContent.length;
        e.innerHTML = marked.parse(o), _wrapNewChars(e, e.textContent.length - n), _ensureSpinner(e), 
        scrollToBottom(), function(e) {
            if (i) return;
            const t = e.scrollHeight > e.clientHeight ? e : null;
            t && (t.addEventListener("scroll", (() => {
                const e = window.innerWidth < 768 ? 120 : 12, n = t.scrollHeight - t.scrollTop - t.clientHeight < e;
                l = !n;
            })), i = !0);
        }(e), !l && e.scrollHeight > e.clientHeight && (e.scrollTop = e.scrollHeight);
    }
    function _ensureSpinner(e) {
        if (_spinnerEl && _spinnerEl.parentNode === e) return;
        if (_spinnerEl) _spinnerEl.remove();
        _spinnerEl = document.createElement("span");
        _spinnerEl.className = "stream-spinner";
        _spinnerEl.textContent = _brailleChars[0];
        e.appendChild(_spinnerEl);
        let _idx = 0;
        if (_spinnerInterval) clearInterval(_spinnerInterval);
        _spinnerInterval = setInterval((() => {
            _idx = (_idx + 1) % _brailleChars.length;
            if (_spinnerEl) _spinnerEl.textContent = _brailleChars[_idx];
        }), 80);
    }
    function showWait() {
        return;
        wd = setTimeout((() => {
            const n = t();
            if (!n || !n.parentNode) return;
            ws = document.createElement("span");
            ws.className = "stream-waiting";
            for (let e = 0; e < 3; e++) {
                const t = document.createElement("span");
                t.className = "stream-waiting-dot";
                ws.appendChild(t);
            }
            n.appendChild(ws);
            requestAnimationFrame((() => ws && ws.classList.add("visible")));
            wd = null;
        }), 300);
    }
    function hideWait() {
        wd && (clearTimeout(wd), wd = null);
        if (ws) {
            ws.classList.remove("visible");
            const e = ws;
            setTimeout((() => e.parentNode && e.remove()), 300);
            ws = null;
        }
    }
    function tick(now) {
        if (null === ts) ts = now;
        const dt = now - ts;
        ts = now;
        if (0 === a.length) {
            f = null, ts = null;
            showWait();
            return;
        }
        hideWait();
        const cps = 30, catchup = Math.ceil(a.length / 8), base = Math.max(1, Math.round(cps * dt / 1e3)), take = Math.max(base, Math.min(catchup, a.length));
        o += a.slice(0, take), a = a.slice(take), c(), f = requestAnimationFrame(tick);
    }
    return {
        add(e) {
            if (_firstChunk) {
                _removeThinkingIndicator();
                _firstChunk = !1;
            }
            a += e, hideWait(), f || (f = requestAnimationFrame(tick));
        },
        flush() {
            f && (cancelAnimationFrame(f), f = null), ts = null, hideWait();
            _stopSpinner();
            o += a, a = "";
            const e = t();
            e && (e.innerHTML = marked.parse(o), addCodeCopyButtons(e));
        }
    };
}

function formatGenTime(e) {
    let t;
    if (e < 1) t = "< 1s"; else if (e < 60) t = `${Math.round(e)}s`; else {
        const n = Math.floor(e / 60), o = Math.round(e % 60);
        t = o > 0 ? `${n}min ${o}s` : `${n}min`;
    }
    return t;
}

function formatGenTooltip(e, t, n) {
    const o = [];
    if (n && o.push(getModelLabel(n)), o.push(formatGenTime(e)), t) {
        const n = e > 0 ? Math.round(t / e) : 0;
        o.push(`${t} tokens (${n}/s)`);
    }
    return o.join(" · ");
}

function setGenTimeOnLastAssistant(e, t, n) {
    const o = chatContainer.querySelectorAll(".message-wrapper-assistant");
    if (0 === o.length) return;
    const a = o[o.length - 1].querySelector(".message-gen-time");
    a && (a.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>', 
    a.dataset.tooltip = formatGenTooltip(e, t, n));
}

function appendCitations(e, t) {
    const n = e.querySelector(".citations-block");
    if (n && n.remove(), !t || 0 === t.length) return;
    const o = document.createElement("div");
    o.className = "citations-block";
    const a = document.createElement("div");
    a.className = "citations-title", a.textContent = "Sources", o.appendChild(a);
    const r = document.createElement("ul");
    r.className = "citations-list";
    const VISIBLE = 4;
    for (let e = 0; e < t.length; e++) {
        const n = t[e], c = "string" == typeof n ? n : n.url, d = "string" == typeof n ? "" : n.title || "";
        let h;
        try {
            h = new URL(c).hostname.replace(/^www\./, "");
        } catch (e) {
            h = c;
        }
        const s = document.createElement("li");
        e >= VISIBLE && s.classList.add("citation-hidden");
        const i = document.createElement("a");
        i.className = "citation-card", i.href = safeUrl(c), i.target = "_blank", i.rel = "noopener noreferrer", 
        i.title = c;
        const head = document.createElement("div");
        head.className = "citation-card-head";
        const fav = document.createElement("img");
        fav.className = "citation-favicon", fav.src = `https://www.google.com/s2/favicons?domain=${encodeURIComponent(h)}&sz=32`, 
        fav.alt = "", fav.loading = "lazy", fav.onerror = () => {
            fav.style.display = "none";
        };
        const dom = document.createElement("span");
        dom.className = "citation-domain", dom.textContent = h;
        const num = document.createElement("span");
        num.className = "citation-num", num.textContent = `[${e + 1}]`, head.appendChild(fav), 
        head.appendChild(dom), head.appendChild(num);
        const title = document.createElement("div");
        title.className = "citation-card-title", title.textContent = d || h;
        i.appendChild(head), i.appendChild(title), s.appendChild(i), r.appendChild(s);
    }
    if (t.length > VISIBLE) {
        const more = document.createElement("li");
        const btn = document.createElement("div");
        btn.className = "citation-more", btn.textContent = `+${t.length - VISIBLE} sources`, 
        btn.addEventListener("click", (() => {
            r.querySelectorAll(".citation-hidden").forEach((e => e.classList.remove("citation-hidden"))), 
            more.remove();
        })), more.appendChild(btn), r.appendChild(more);
    }
    o.appendChild(r), e.appendChild(o);
}

function removeRegenBtn() {
    document.querySelectorAll(".regen-btn").forEach((e => e.remove()));
}

function addRegenBtn() {
    if (removeRegenBtn(), STATE.conversationHistory.length < 2) return;
    if ("assistant" !== STATE.conversationHistory[STATE.conversationHistory.length - 1].role) return;
    const e = chatContainer.querySelectorAll(".message-wrapper-assistant");
    if (0 === e.length) return;
    const t = e[e.length - 1].querySelector(".message-btn-row");
    if (!t) return;
    const n = document.createElement("button");
    n.className = "regen-btn", n.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>', 
    n.title = "Régénérer la réponse", n.addEventListener("click", regenerateLastResponse), 
    t.appendChild(n), scrollToBottom();
}

async function regenerateLastResponse() {
    if (STATE.isStreaming) return;
    const e = STATE.conversationHistory.length > 0 ? STATE.conversationHistory[STATE.conversationHistory.length - 1] : null;
    if (e && "assistant" === e.role && e.canvasBefore) {
        if (!await confirmAndRewindCanvas(e.canvasBefore)) return;
    }
    for (;STATE.conversationHistory.length > 0; ) {
        if ("user" === STATE.conversationHistory[STATE.conversationHistory.length - 1].role) break;
        STATE.conversationHistory.pop();
    }
    for (removeRegenBtn(); chatContainer.lastElementChild; ) {
        const e = chatContainer.lastElementChild;
        if (e.classList.contains("message-wrapper-user")) break;
        if (!e.classList.contains("message-wrapper-assistant") && !e.classList.contains("model-switch-marker")) break;
        e.remove();
    }
    saveConversation(), STATE.conversationLastActivity = (new Date).toISOString(), STATE.isStreaming = !0, 
    window.Ocean?.setPaused && window.Ocean.setPaused(!0), STATE.currentAbortController = new AbortController, 
    updateSendButton();
    const t = STATE.conversationId, n = STATE.conversationHistory;
    STATE._activeStreams.set(t, {
        conversationId: t,
        history: n,
        abortController: STATE.currentAbortController
    });
    const o = addMessage("assistant", "");
    o.classList.add("streaming");
    const a = Date.now();
    if (STATE.currentImageModel && !getImageModelEditeur(STATE.currentImageModel) && (STATE.currentModel = STATE.currentImageModel, 
    STATE.currentImageModel = null), STATE.currentImageModel) {
        const e = buildImagePrompt(getTextFromContent(STATE.conversationHistory[STATE.conversationHistory.length - 1].content), STATE.conversationHistory), r = collectReferenceImages(STATE.conversationHistory), s = document.getElementById("image-format-select").value, i = getImageParams(), l = STATE.currentImageModel;
        generateImage(STATE.currentImageModel, e, (e => {
            if (!STATE._activeStreams.has(t)) return;
            STATE._activeStreams.delete(t);
            const r = isStreamActive(t, n);
            if (!(e.images && 0 !== e.images.length || e.text)) return void (t === STATE.conversationId && (o && o.parentNode && o.parentNode.removeChild(o), 
            STATE.isStreaming = !1, STATE.currentAbortController = null, updateSendButton(), 
            addRegenBtn()));
            if (r) {
                endStreaming(o), e.images.length > 0 && o.insertBefore(buildImagesContainer(e.images, {
                    altText: "Image générée"
                }), o.firstChild);
                const t = o.querySelector(".message-text");
                t && e.text ? (t.innerHTML = marked.parse(e.text), addCodeCopyButtons(t)) : t && t.remove();
            }
            const c = imageResultToContent(e), d = (Date.now() - a) / 1e3, u = e.usage?.output_tokens || 0;
            n.push({
                role: "assistant",
                content: 1 === c.length && "text" === c[0].type ? c[0].text : c,
                generationTime: d,
                outputTokens: u,
                model: l
            });
            const p = getImageTarif(l), m = _resolveImageCost(p, e.usage, e.imageCount, s, i);
            r ? (attachCanvasBeforeToLastAssistant(), setGenTimeOnLastAssistant(d, u, l), e.usage && (STATE.totalInputTokens += e.usage.input_tokens || 0, 
            STATE.totalOutputTokens += e.usage.output_tokens || 0), STATE.totalCost += m.tokenCost, 
            STATE.totalImageCost += m.imageCost, addCostForModel(l, e.usage?.input_tokens || 0, e.usage?.output_tokens || 0, m.total), 
            updateTokenDisplay(), saveConversation(), scrollToBottom(!0), addRegenBtn(), STATE.isStreaming = !1, 
            STATE.currentAbortController = null, updateSendButton(), promptInput.focus()) : _saveConvById(t, n, {
                tokensIn: e.usage?.input_tokens || 0,
                tokensOut: e.usage?.output_tokens || 0,
                cost: m.tokenCost,
                imageCost: m.imageCost,
                modelKey: l
            });
        }), (e => {
            if (STATE._activeStreams.delete(t), t !== STATE.conversationId) return n.push({
                role: "assistant",
                content: STREAM_ERROR_CONTENT,
                error: !0
            }), void _saveConvById(t, n, {
                modelKey: l
            });
            const a = n[n.length - 1];
            handleApiError(o, getTextFromContent(a?.content), [], l || "", e);
        }), r, STATE.currentAbortController.signal, document.getElementById("image-format-select").value, getImageParams());
    } else {
        let e = "", r = "", s = "";
        const i = STATE.currentSystemPrompt ? STATE.currentSystemPrompt.contenu : null, l = STATE.currentModel || STATE.currentSearchModel, c = createStreamRenderer(o, (() => o.querySelector(".message-text")));
        let d = null;
        const u = buildCanvasParserIfActive();
        let p = effectiveSystemPrompt(i);
        let _webCtx2 = null;
        if (STATE.webSearchEnabled && typeof hasBuiltInWebSearch === "function" && !hasBuiltInWebSearch(l) && typeof window.buildWebSearchContext === "function") {
            const _lastUser = [ ...n ].reverse().find((m => "user" === m.role));
            const _q = _lastUser ? getTextFromContent(_lastUser.content) : "";
            if (_q) {
                try {
                    _webCtx2 = await window.buildWebSearchContext(_q);
                    if (_webCtx2 && _webCtx2.contextText) {
                        p = (p ? p + "\n\n" : "") + _webCtx2.contextText;
                    }
                } catch (_e) {
                    console.warn("[web-search] échec:", _e);
                }
            }
        }
        streamModel(l, _limitHistoryImages(STATE.conversationHistory, getMaxHistoryImages()), (a => {
            r += a;
            let s = a;
            u && (s = u.feed(a).visible);
            const i = isStreamActive(t, n);
            !e && s && i && (d && d.flush(), collapseThinkBlock(o.querySelector(".thinking-block"))), 
            s && (e += s, i && c.add(s));
        }), ((r, i) => {
            if (!STATE._activeStreams.has(t)) return;
            STATE._activeStreams.delete(t);
            const p = isStreamActive(t, n);
            if (u) {
                const t = u.flush().visible;
                t && (e += t, p && c.add(t));
            }
            if (!r && !e && !s) return void (t === STATE.conversationId && (o && o.parentNode && o.parentNode.removeChild(o), 
            STATE.isStreaming = !1, STATE.currentAbortController = null, updateSendButton(), 
            addRegenBtn()));
            if (p) {
                if (c.flush(), d && d.flush(), endStreaming(o), !s.trim()) {
                    const e = o.querySelector(".thinking-block");
                    e && e.remove();
                }
                const _finalCitations2 = i && i.length > 0 ? i : _webCtx2 && _webCtx2.citations && _webCtx2.citations.length > 0 ? _webCtx2.citations : null;
                _finalCitations2 && appendCitations(o, _finalCitations2);
            }
            const m = (Date.now() - a) / 1e3, g = r?.output_tokens || 0;
            n.push({
                role: "assistant",
                content: e,
                citations: i || void 0,
                generationTime: m,
                thinking: s || void 0,
                outputTokens: g,
                model: l
            });
            let h = 0;
            if (r) {
                const e = getTarif(l) || getSearchTarif(l);
                h = _resolveTextCost(e, r), h += calcWebSearchCost(l, i);
            }
            p ? (attachCanvasBeforeToLastAssistant(), o._rawMarkdown = e, setGenTimeOnLastAssistant(m, g, l), 
            r && (STATE.totalInputTokens += r.input_tokens || 0, STATE.totalOutputTokens += r.output_tokens || 0, 
            STATE.totalCost += h, addCostForModel(l, r.input_tokens || 0, r.output_tokens || 0, h)), 
            updateTokenDisplay(), saveConversation(), addRegenBtn(), STATE.isStreaming = !1, 
            STATE.currentAbortController = null, updateSendButton(), promptInput.focus()) : _saveConvById(t, n, {
                tokensIn: r?.input_tokens || 0,
                tokensOut: r?.output_tokens || 0,
                cost: h,
                modelKey: l
            });
        }), (e => {
            if (STATE._activeStreams.delete(t), t !== STATE.conversationId) return n.push({
                role: "assistant",
                content: STREAM_ERROR_CONTENT,
                error: !0
            }), void _saveConvById(t, n, {
                modelKey: l
            });
            const a = n[n.length - 1];
            handleApiError(o, getTextFromContent(a?.content), [], l || "", e);
        }), p, window.FORCE_WEB_SEARCH = STATE.webSearchEnabled && !hasBuiltInWebSearch(l), STATE.webSearchEnabled && !hasBuiltInWebSearch(l), (e => {
            s += e, t === STATE.conversationId && (!function() {
                if (!o.querySelector(".thinking-block")) {
                    const e = document.createElement("details");
                    e.className = "thinking-block", e.open = !0;
                    const t = document.createElement("summary");
                    t.textContent = "Raisonnement", (() => {
                        const _b = document.createElement("span");
                        _b.className = "thinking-bubble";
                        _b.style.left = "20%";
                        _b.style.animationDelay = "0s";
                        t.appendChild(_b);
                        const _b2 = document.createElement("span");
                        _b2.className = "thinking-bubble";
                        _b2.style.left = "45%";
                        _b2.style.animationDelay = "0.8s";
                        t.appendChild(_b2);
                        const _b3 = document.createElement("span");
                        _b3.className = "thinking-bubble";
                        _b3.style.left = "70%";
                        _b3.style.animationDelay = "1.6s";
                        t.appendChild(_b3);
                    })(), e.appendChild(t);
                    const n = document.createElement("div");
                    n.className = "thinking-content", e.appendChild(n), o.insertBefore(e, o.firstChild);
                }
                d || (d = createStreamRenderer(o, (() => o.querySelector(".thinking-content"))));
            }(), d.add(e));
        }), STATE.currentAbortController.signal, getModelParams(), _routerFallback);
    }
}

function startEditMessage(e, t) {
    const n = Array.from(chatContainer.querySelectorAll(".message-wrapper"));
    let o = -1, a = 0;
    for (let t = 0; t < STATE.conversationHistory.length; t++) if ("model-switch" !== STATE.conversationHistory[t].type) {
        if (n[a] === e) {
            o = t;
            break;
        }
        a++;
    }
    if (o < 0) return;
    const r = t.querySelector(".message-text");
    if (!r) return;
    const s = getTextFromContent(STATE.conversationHistory[o].content), i = e.querySelector(".message-btn-row");
    i && (i.style.display = "none");
    const l = t.offsetWidth;
    t.style.minWidth = l + "px";
    const c = document.createElement("textarea");
    c.className = "message-edit-textarea", c.value = s, r.innerHTML = "", r.appendChild(c), 
    requestAnimationFrame((() => {
        c.style.height = "auto", c.style.height = c.scrollHeight + "px";
    })), c.addEventListener("input", (() => {
        c.style.height = "auto", c.style.height = c.scrollHeight + "px";
    })), c.focus();
    const d = document.createElement("div");
    d.className = "message-edit-actions";
    const u = document.createElement("button");
    u.className = "message-edit-confirm", u.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg> Envoyer';
    const p = document.createElement("button");
    function m() {
        r.textContent = s, d.remove(), t.style.minWidth = "", i && (i.style.display = "");
    }
    p.className = "message-edit-cancel", p.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg> Annuler', 
    d.appendChild(u), d.appendChild(p), e.insertBefore(d, i), p.addEventListener("click", m), 
    u.addEventListener("click", (async () => {
        const n = c.value.trim();
        if (!n) return void m();
        let a = null;
        for (let e = o + 1; e < STATE.conversationHistory.length; e++) {
            const t = STATE.conversationHistory[e];
            if (t && "assistant" === t.role && t.canvasBefore) {
                a = t.canvasBefore;
                break;
            }
        }
        if (a) {
            if (!await confirmAndRewindCanvas(a)) return;
        }
        r.textContent = n, d.remove(), t.style.minWidth = "", i && (i.style.display = ""), 
        STATE.conversationHistory[o].content = n, STATE.conversationHistory.splice(o + 1);
        const s = Array.from(chatContainer.children), l = s.indexOf(e);
        for (let e = s.length - 1; e > l; e--) s[e].remove();
        updateTokenDisplay(), saveConversation(), _userHasScrolledUp = !1, STATE.isStreaming = !0, 
        window.Ocean?.setPaused && window.Ocean.setPaused(!0), STATE.currentAbortController = new AbortController, 
        updateSendButton();
        const u = STATE.conversationId, p = STATE.conversationHistory;
        STATE._activeStreams.set(u, {
            conversationId: u,
            history: p,
            abortController: STATE.currentAbortController
        });
        const g = addMessage("assistant", "");
        g.classList.add("streaming");
        const h = Date.now();
        var v = STATE.currentModel || STATE.currentSearchModel, T = null, y = null, _routerIntent = null, _routerScore = null;
        if (v && 0 === v.indexOf("samagent-") && "function" == typeof routeModel) {
            var _samAbc = STATE.currentAbortController;
            _showRouterThinking(g);
            var f;
            try {
                f = await routeModel(n, v, _samAbc && _samAbc.signal);
            } catch (_samErr) {
                console.error("Erreur routage SamAgent:", _samErr), f = null;
            }
            _hideRouterThinking(g);
            if (_samAbc && _samAbc.signal && _samAbc.signal.aborted) {
                g && g.remove && g.remove();
                return;
            }
            if (!f) {
                if (STATE.currentAbortController) {
                    try {
                        STATE.currentAbortController.abort();
                    } catch (_samE2) {}
                }
                STATE.isStreaming = !1, STATE.currentAbortController = null, STATE.conversationId && STATE._activeStreams && STATE._activeStreams.delete(STATE.conversationId), 
                window.Ocean?.setPaused && window.Ocean.setPaused(!1), typeof updateSendButton === "function" && updateSendButton(), 
                g && g.remove && g.remove();
                if (typeof customAlert === "function") customAlert("Le routeur SamAgent est momentanément indisponible. Réessayez ou changez de modèle.", "error");
                return;
            }
            T = f.label, v = f.modelId, STATE._routerForceThinking = f.thinking && !!document.getElementById("plus-reflection-toggle")?.checked, 
            y = f._fallback || null, _routerIntent = f.intent, _routerScore = f.score, window._samLastRoute = {
                tier: f.tier,
                routedBy: f.routedBy,
                label: f.label,
                intent: f.intent,
                score: f.score
            };
        } else window._samLastRoute && (window._samLastRoute = null);
        const E = spTextarea.value.trim() || null;
        if (STATE.currentImageModel) {
            const e = collectReferenceImages(STATE.conversationHistory), t = document.getElementById("image-format-select").value, o = getImageParams(), a = STATE.currentImageModel;
            return void generateImage(STATE.currentImageModel, n, (e => {
                if (!STATE._activeStreams.has(u)) return;
                STATE._activeStreams.delete(u);
                const n = isStreamActive(u, p);
                if (!(e.images && 0 !== e.images.length || e.text)) return void (u === STATE.conversationId && (g && g.parentNode && g.parentNode.removeChild(g), 
                STATE.isStreaming = !1, STATE.currentAbortController = null, updateSendButton(), 
                addRegenBtn()));
                if (n) {
                    endStreaming(g), e.images.length > 0 && g.insertBefore(buildImagesContainer(e.images, {
                        altText: "Image générée"
                    }), g.firstChild);
                    const t = g.querySelector(".message-text");
                    t && e.text ? (t.innerHTML = marked.parse(e.text), addCodeCopyButtons(t)) : t && t.remove();
                }
                const r = imageResultToContent(e), s = (Date.now() - h) / 1e3, i = e.usage?.output_tokens || 0;
                p.push({
                    role: "assistant",
                    content: 1 === r.length && "text" === r[0].type ? r[0].text : r,
                    generationTime: s,
                    outputTokens: i,
                    model: a
                });
                const l = getImageTarif(a), c = _resolveImageCost(l, e.usage, e.imageCount, t, o);
                n ? (attachCanvasBeforeToLastAssistant(), setGenTimeOnLastAssistant(s, i, a), e.usage && (STATE.totalInputTokens += e.usage.input_tokens || 0, 
                STATE.totalOutputTokens += e.usage.output_tokens || 0), STATE.totalCost += c.tokenCost, 
                STATE.totalImageCost += c.imageCost, addCostForModel(a, e.usage?.input_tokens || 0, e.usage?.output_tokens || 0, c.total), 
                updateTokenDisplay(), saveConversation(), addRegenBtn(), STATE.isStreaming = !1, 
                STATE.currentAbortController = null, updateSendButton(), promptInput.focus()) : _saveConvById(u, p, {
                    tokensIn: e.usage?.input_tokens || 0,
                    tokensOut: e.usage?.output_tokens || 0,
                    cost: c.tokenCost,
                    imageCost: c.imageCost,
                    modelKey: a
                });
            }), (e => {
                if (STATE._activeStreams.delete(u), u !== STATE.conversationId) return p.push({
                    role: "assistant",
                    content: STREAM_ERROR_CONTENT,
                    error: !0
                }), void _saveConvById(u, p, {
                    modelKey: a
                });
                handleApiError(g, n, [], a || "", e);
            }), e, STATE.currentAbortController.signal, t, o);
        }
        let S = "", A = "", C = "";
        const M = createStreamRenderer(g, (() => g.querySelector(".message-text")));
        let I = null;
        const k = buildCanvasParserIfActive();
        let b = effectiveSystemPrompt(E);
        var B;
        let _webCtx3 = null;
        if (STATE.webSearchEnabled && typeof hasBuiltInWebSearch === "function" && !hasBuiltInWebSearch(v) && typeof window.buildWebSearchContext === "function" && n) {
            try {
                _webCtx3 = await window.buildWebSearchContext(n);
                if (_webCtx3 && _webCtx3.contextText) {
                    b = (b ? b + "\n\n" : "") + _webCtx3.contextText;
                }
            } catch (_e) {
                console.warn("[web-search] échec:", _e);
            }
        }
        streamModel(v, _limitHistoryImages(STATE.conversationHistory, getMaxHistoryImages()), (e => {
            A += e;
            let t = e;
            k && (t = k.feed(e).visible);
            const n = isStreamActive(u, p);
            !S && t && n && (I && I.flush(), collapseThinkBlock(g.querySelector(".thinking-block"))), 
            t && (S += t, n && M.add(t));
        }), ((e, t) => {
            if (!STATE._activeStreams.has(u)) return;
            STATE._activeStreams.delete(u);
            const n = isStreamActive(u, p);
            if (k) {
                const e = k.flush().visible;
                e && (S += e, n && M.add(e));
            }
            if (!e && !S && !C) return void (u === STATE.conversationId && (g && g.parentNode && g.parentNode.removeChild(g), 
            STATE.isStreaming = !1, STATE.currentAbortController = null, updateSendButton(), 
            addRegenBtn()));
            if (n) {
                if (M.flush(), I && I.flush(), endStreaming(g), !C.trim()) {
                    const e = g.querySelector(".thinking-block");
                    e && e.remove();
                }
                const _finalCitations3 = t && t.length > 0 ? t : _webCtx3 && _webCtx3.citations && _webCtx3.citations.length > 0 ? _webCtx3.citations : null;
                _finalCitations3 && appendCitations(g, _finalCitations3);
            }
            const o = (Date.now() - h) / 1e3, a = e?.output_tokens || 0;
            p.push({
                role: "assistant",
                content: S,
                citations: t || void 0,
                generationTime: o,
                thinking: C || void 0,
                outputTokens: a,
                model: v
            });
            window._samLastRoute && (recordRouteResult(window._samLastRoute.routedBy, v === window._samLastRoute.routedBy, Math.round(1e3 * o), {
                tier: window._samLastRoute.tier,
                intent: window._samLastRoute.intent,
                score: window._samLastRoute.score,
                label: window._samLastRoute.label
            }), v !== window._samLastRoute.routedBy && recordRouteResult(v, !0, Math.round(1e3 * o), {
                tier: window._samLastRoute.tier,
                intent: window._samLastRoute.intent,
                score: window._samLastRoute.score,
                label: window._samLastRoute.label
            }));
            window._samLastRoute && (Object.assign(p[p.length - 1], window._samLastRoute), window._samLastRoute = null);
            let r = 0;
            if (e) {
                const n = getTarif(v) || getSearchTarif(v);
                r = _resolveTextCost(n, e), r += calcWebSearchCost(v, t);
            }
            if (n) {
                if (attachCanvasBeforeToLastAssistant(), setGenTimeOnLastAssistant(o, a, v), e && (STATE.totalInputTokens += e.input_tokens || 0, 
                STATE.totalOutputTokens += e.output_tokens || 0, STATE.totalCost += r, addCostForModel(v, e.input_tokens || 0, e.output_tokens || 0, r)), 
                updateTokenDisplay(), saveConversation(), addRegenBtn(), T && g) {
                    var s = document.createElement("div");
                    s.className = "model-fusion-indicator", s.textContent = T, g.appendChild(s);
                }
                STATE.isStreaming = !1, STATE.currentAbortController = null, updateSendButton(), 
                promptInput.focus();
            } else _saveConvById(u, p, {
                tokensIn: e?.input_tokens || 0,
                tokensOut: e?.output_tokens || 0,
                cost: r,
                modelKey: v
            });
        }), (e => {
            STATE._activeStreams.delete(u), u === STATE.conversationId && handleApiError(g, n, [], v || "", e);
        }), b, STATE.webSearchEnabled && !hasBuiltInWebSearch(v), (e => {
            C += e, u === STATE.conversationId && (!function() {
                if (!g.querySelector(".thinking-block")) {
                    const e = document.createElement("details");
                    e.className = "thinking-block", e.open = !0;
                    const t = document.createElement("summary");
                    t.textContent = "Raisonnement", (() => {
                        const _b = document.createElement("span");
                        _b.className = "thinking-bubble";
                        _b.style.left = "20%";
                        _b.style.animationDelay = "0s";
                        t.appendChild(_b);
                        const _b2 = document.createElement("span");
                        _b2.className = "thinking-bubble";
                        _b2.style.left = "45%";
                        _b2.style.animationDelay = "0.8s";
                        t.appendChild(_b2);
                        const _b3 = document.createElement("span");
                        _b3.className = "thinking-bubble";
                        _b3.style.left = "70%";
                        _b3.style.animationDelay = "1.6s";
                        t.appendChild(_b3);
                    })(), e.appendChild(t);
                    const n = document.createElement("div");
                    n.className = "thinking-content", e.appendChild(n), g.insertBefore(e, g.firstChild);
                }
                I || (I = createStreamRenderer(g, (() => g.querySelector(".thinking-content"))));
            }(), I.add(e));
        }), STATE.currentAbortController.signal, (B = getModelParams(), STATE._routerForceThinking && ((B = B || {}).reasoning_effort = B.reasoning_effort || "medium", 
        STATE._routerForceThinking = !1), _routerIntent === "chat" && _routerScore < 15 && (B = B || {}, 
        B.reasoning_effort = "low"), B), y);
    }));
}

let _userHasScrolledUp = !1;

function scrollToBottom(e) {
    const t = window.innerWidth < 768;
    (e || !_userHasScrolledUp || t && STATE.isStreaming) && chatContainer.scroll({
        top: chatContainer.scrollHeight,
        behavior: "instant"
    });
}

function handleApiError(e, t, n, o, a) {
    const r = STREAM_ERROR_CONTENT;
    STATE.isStreaming = !1, STATE.currentAbortController = null, endStreaming(e), updateSendButton(), 
    promptInput.focus();
    let s = !1;
    const i = t => {
        if (s) return;
        s = !0, applyErrorStyle(e);
        const n = STATE.conversationHistory[STATE.conversationHistory.length - 1];
        n && "assistant" === n.role ? (n.content = r, n.error = !0) : STATE.conversationHistory.push({
            role: "assistant",
            content: r,
            error: !0
        }), STATE.conversationId && saveConversation(), addRegenBtn();
        const o = e.querySelector(".message-text");
        o && (o.textContent = r), showErrorAlert(t, a.message);
    }, l = setTimeout((() => i(null)), 15e3);
    explainError(t, n, o, a.message).then((e => {
        clearTimeout(l), i(e);
    })).catch((() => {
        clearTimeout(l), i(null);
    }));
}

function applyErrorStyle(e) {
    e.classList.add("message-error");
    const t = e.parentElement?.querySelector(".message-btn-row");
    t && Array.from(t.children).forEach((e => e.style.display = "none"));
}

async function sendMessage() {
    const e = promptInput.value.trim();
    if (!e && 0 === STATE.pendingImages.length && 0 === STATE.pendingFiles.length || STATE.isStreaming) return;
    if (STATE.pendingLoadingFiles.length > 0) {
        return void customAlert(`Patientez quelques instants : ${STATE.pendingLoadingFiles.map((e => e.name)).join(", ")} ${STATE.pendingLoadingFiles.length > 1 ? "sont encore" : "est encore"} en cours de chargement.`, "wait");
    }
    if (_userHasScrolledUp = !1, removeRegenBtn(), window.innerWidth < 768) {
        promptInput.blur();
        let e = !1;
        const t = () => {
            e || (e = !0, _userHasScrolledUp = !1, scrollToBottom(!0));
        };
        if (setTimeout(t, 200), setTimeout(t, 500), window.visualViewport) {
            let e;
            const n = () => {
                clearTimeout(e), e = setTimeout(t, 150);
            };
            window.visualViewport.addEventListener("resize", n, {
                once: !1
            }), setTimeout((() => window.visualViewport.removeEventListener("resize", n)), 1500);
        }
    }
    if (!STATE.currentModel && !STATE.currentImageModel && !STATE.currentSearchModel) return void showModelAlert();
    if (!STATE.conversationId) {
        let t = e;
        t || (t = STATE.pendingImages.length > 0 ? "(image)" : STATE.pendingFiles.length > 0 ? 1 === STATE.pendingFiles.length ? `(${STATE.pendingFiles[0].name})` : "(fichiers joints)" : "(message)"), 
        STATE.firstPrompt = t, STATE.conversationStartTime = (new Date).toISOString(), STATE.conversationId = generateConversationId(STATE.firstPrompt);
        const n = STATE.conversationId.replace(/[<>:"/\\|?*]/g, "_") + ".json";
        localStorage.setItem("cetas-last-conv", n);
    }
    if (STATE.conversationLastActivity = (new Date).toISOString(), STATE.conversationStarted || (STATE.conversationStarted = !0), 
    spSelect.value) {
        const e = spSelect.selectedOptions[0];
        STATE.currentSystemPrompt = {
            nom: e.textContent,
            contenu: spTextarea.value || e.dataset.contenu
        };
    } else spTextarea.value.trim() ? STATE.currentSystemPrompt = {
        nom: "Personnalisé",
        contenu: spTextarea.value
    } : STATE.currentSystemPrompt = null;
    let t;
    if (STATE.pendingImages.length > 0 || STATE.pendingFiles.length > 0) {
        t = [], e && t.push({
            type: "text",
            text: e
        });
        for (const e of STATE.pendingImages) {
            const n = e.dataUrl.split(",")[1];
            t.push({
                type: "image",
                data: n,
                mimeType: e.mimeType,
                dataUrl: e.dataUrl
            });
        }
        for (const e of STATE.pendingFiles) t.push({
            type: "file",
            name: e.name,
            mimeType: e.mimeType,
            data: e.data,
            textContent: e.textContent
        });
        STATE.pendingImages = [], STATE.pendingFiles = [], attachPreview.innerHTML = "";
    } else t = e;
    addMessage("user", t), STATE.conversationHistory.push({
        role: "user",
        content: t
    }), saveConversation(), promptInput.value = "", promptInput.style.height = "auto", 
    STATE.originalPromptBeforeEnhance = null, STATE.isStreaming = !0, window.Ocean?.setPaused && window.Ocean.setPaused(!0), 
    STATE.currentAbortController = new AbortController, updateSendButton();
    const n = STATE.conversationId, o = STATE.conversationHistory, a = {
        conversationId: n,
        history: o,
        abortController: STATE.currentAbortController
    };
    STATE._activeStreams.set(n, a);
    const r = addMessage("assistant", "");
    r.classList.add("streaming");
    _showThinkingIndicator(r);
    const s = Date.now();
    STATE.currentImageModel && !getImageModelEditeur(STATE.currentImageModel) && (STATE.currentModel = STATE.currentImageModel, 
    STATE.currentImageModel = null);
    var i, l = STATE.currentModel || STATE.currentSearchModel, c = null, d = null, _routerIntent = null, _routerScore = null;
    if (l && 0 === l.indexOf("samagent-") && "function" == typeof routeModel) {
        var _samAbc = STATE.currentAbortController;
        _showRouterThinking(r);
        var u;
        try {
            u = await routeModel(e, l, _samAbc && _samAbc.signal);
        } catch (_samErr) {
            console.error("Erreur routage SamAgent:", _samErr), u = null;
        }
        _hideRouterThinking(r);
        if (_samAbc && _samAbc.signal && _samAbc.signal.aborted) {
            r && r.remove && r.remove();
            return;
        }
        if (!u) {
            if (STATE.currentAbortController) {
                try {
                    STATE.currentAbortController.abort();
                } catch (_samE2) {}
            }
            STATE.isStreaming = !1, STATE.currentAbortController = null, STATE.conversationId && STATE._activeStreams && STATE._activeStreams.delete(STATE.conversationId), 
            window.Ocean?.setPaused && window.Ocean.setPaused(!1), typeof updateSendButton === "function" && updateSendButton(), 
            r && r.remove && r.remove();
            if (typeof customAlert === "function") customAlert("Le routeur SamAgent est momentanément indisponible. Réessayez ou changez de modèle.", "error");
            return;
        }
        c = u.label, l = u.modelId, STATE._routerForceThinking = u.thinking && !!document.getElementById("plus-reflection-toggle")?.checked, 
        d = u._fallback || null, _routerIntent = u.intent, _routerScore = u.score, window._samLastRoute = {
            tier: u.tier,
            routedBy: u.routedBy,
            label: u.label,
            intent: u.intent,
            score: u.score
        };
    } else window._samLastRoute && (window._samLastRoute = null);
    if (STATE.currentImageModel) {
        const i = buildImagePrompt(e, STATE.conversationHistory), l = collectReferenceImages(STATE.conversationHistory), c = document.getElementById("image-format-select")?.value || "auto", d = getImageParams(), u = STATE.currentImageModel;
        a.type = "image", a.model = u, a.assistantDiv = r, generateImage(STATE.currentImageModel, i, (e => {
            if (!STATE._activeStreams.get(n)) return;
            STATE._activeStreams.delete(n);
            const t = isStreamActive(n, o);
            if (!(e.images && 0 !== e.images.length || e.text)) return void (n === STATE.conversationId && (r && r.parentNode && r.parentNode.removeChild(r), 
            STATE.isStreaming = !1, STATE.currentAbortController = null, updateSendButton(), 
            addRegenBtn()));
            if (t) {
                endStreaming(r), e.images.length > 0 && r.insertBefore(buildImagesContainer(e.images, {
                    altText: "Image générée"
                }), r.firstChild);
                const t = r.querySelector(".message-text");
                t && e.text ? (t.innerHTML = marked.parse(e.text), addCodeCopyButtons(t)) : t && t.remove();
            }
            const a = imageResultToContent(e), i = (Date.now() - s) / 1e3, l = e.usage?.output_tokens || 0;
            o.push({
                role: "assistant",
                content: 1 === a.length && "text" === a[0].type ? a[0].text : a,
                generationTime: i,
                outputTokens: l,
                model: u
            });
            const p = getImageTarif(u), m = _resolveImageCost(p, e.usage, e.imageCount, c, d);
            t ? (attachCanvasBeforeToLastAssistant(), setGenTimeOnLastAssistant(i, l, u), e.usage && (STATE.totalInputTokens += e.usage.input_tokens || 0, 
            STATE.totalOutputTokens += e.usage.output_tokens || 0), STATE.totalCost += m.tokenCost, 
            STATE.totalImageCost += m.imageCost, addCostForModel(u, e.usage?.input_tokens || 0, e.usage?.output_tokens || 0, m.total), 
            updateTokenDisplay(), saveConversation(), scrollToBottom(!0), addRegenBtn(), maybeGenerateTitle(), 
            STATE.isStreaming = !1, STATE.currentAbortController = null, updateSendButton(), 
            promptInput.focus()) : _saveConvById(n, o, {
                tokensIn: e.usage?.input_tokens || 0,
                tokensOut: e.usage?.output_tokens || 0,
                cost: m.tokenCost,
                imageCost: m.imageCost,
                modelKey: u
            });
        }), (e => {
            if (STATE._activeStreams.delete(n), n !== STATE.conversationId) return o.push({
                role: "assistant",
                content: STREAM_ERROR_CONTENT,
                error: !0
            }), void _saveConvById(n, o, {
                modelKey: u
            });
            const a = "string" == typeof t ? t : Array.isArray(t) ? t.filter((e => "text" === e.type)).map((e => e.text)).join(" ") : "", s = Array.isArray(t) ? t.filter((e => "file" === e.type || "image" === e.type)).map((e => e.name || e.mimeType || "image")) : [];
            handleApiError(r, a, s, u || "", e);
        }), l, STATE.currentAbortController.signal, c, d);
    } else {
        const e = STATE.currentSystemPrompt ? STATE.currentSystemPrompt.contenu : null;
        a.type = "text", a.model = l, a.assistantDiv = r, a.canvasParser = buildCanvasParserIfActive(), 
        a.sr = createStreamRenderer(r, (() => r.querySelector(".message-text"))), a.thinkSr = null, 
        a.accumulatedText = "", a.accumulatedThinking = "", a.accumulatedRaw = "", a.genStartTime = s;
        let u = effectiveSystemPrompt(e);
        let _webCtx = null;
        if (STATE.webSearchEnabled && typeof hasBuiltInWebSearch === "function" && !hasBuiltInWebSearch(l) && typeof window.buildWebSearchContext === "function") {
            try {
                _webCtx = await window.buildWebSearchContext("string" == typeof t ? t : Array.isArray(t) ? t.filter((e => "text" === e.type)).map((e => e.text)).join(" ") : "");
                if (_webCtx && _webCtx.contextText) {
                    u = (u ? u + "\n\n" : "") + _webCtx.contextText;
                }
            } catch (_e) {
                console.warn("[web-search] échec:", _e);
            }
        }
        streamModel(l, _limitHistoryImages(STATE.conversationHistory, getMaxHistoryImages()), (e => {
            a.accumulatedRaw += e;
            let t = e;
            a.canvasParser && (t = a.canvasParser.feed(e).visible);
            const r = n === STATE.conversationId && a.assistantDiv && a.assistantDiv.isConnected;
            if (!a.accumulatedText && t && r && (a.thinkSr && a.thinkSr.flush(), collapseThinkBlock(a.assistantDiv.querySelector(".thinking-block"))), 
            t && (a.accumulatedText += t, r && a.sr && a.sr.add(t), !a.titleEarlyDone && 1 === o.length && a.accumulatedText.length >= 40)) {
                a.titleEarlyDone = !0;
                const e = [ o[0], {
                    role: "assistant",
                    content: a.accumulatedText
                } ];
                try {
                    maybeGenerateTitle(n, e, l);
                } catch {}
            }
        }), ((e, t) => {
            if (!STATE._activeStreams.get(n)) return;
            STATE._activeStreams.delete(n);
            const r = n === STATE.conversationId && a.assistantDiv && a.assistantDiv.isConnected, i = r && o === STATE.conversationHistory;
            if (a.canvasParser) {
                const e = a.canvasParser.flush().visible;
                e && (a.accumulatedText += e, r && a.sr && a.sr.add(e));
            }
            const d = a.accumulatedText, u = a.accumulatedThinking, p = a.assistantDiv;
            if (!e && !d && !u) return void (r && (p && p.parentNode && p.parentNode.removeChild(p), 
            STATE.isStreaming = !1, STATE.currentAbortController = null, updateSendButton(), 
            addRegenBtn()));
            if (r) {
                if (a.sr && a.sr.flush(), a.thinkSr && a.thinkSr.flush(), endStreaming(p), !u.trim()) {
                    const e = p.querySelector(".thinking-block");
                    e && e.remove();
                }
                const _finalCitations = t && t.length > 0 ? t : _webCtx && _webCtx.citations && _webCtx.citations.length > 0 ? _webCtx.citations : null;
                _finalCitations && appendCitations(p, _finalCitations);
            }
            const m = (Date.now() - s) / 1e3, g = e?.output_tokens || 0;
            o.push({
                role: "assistant",
                content: d,
                citations: t || void 0,
                generationTime: m,
                thinking: u || void 0,
                outputTokens: g,
                model: l
            });
            window._samLastRoute && (recordRouteResult(window._samLastRoute.routedBy, l === window._samLastRoute.routedBy, Math.round(1e3 * m), {
                tier: window._samLastRoute.tier,
                intent: window._samLastRoute.intent,
                score: window._samLastRoute.score,
                label: window._samLastRoute.label
            }), l !== window._samLastRoute.routedBy && recordRouteResult(l, !0, Math.round(1e3 * m), {
                tier: window._samLastRoute.tier,
                intent: window._samLastRoute.intent,
                score: window._samLastRoute.score,
                label: window._samLastRoute.label
            }));
            window._samLastRoute && (Object.assign(o[o.length - 1], window._samLastRoute), window._samLastRoute = null);
            let h = 0;
            if (e) {
                const n = getTarif(l) || getSearchTarif(l);
                h = _resolveTextCost(n, e), h += calcWebSearchCost(l, t);
            }
            if (i) {
                if (attachCanvasBeforeToLastAssistant(), p && (p._rawMarkdown = d), setGenTimeOnLastAssistant(m, g, l), 
                e && (STATE.totalInputTokens += e.input_tokens || 0, STATE.totalOutputTokens += e.output_tokens || 0, 
                STATE.totalCost += h, addCostForModel(l, e.input_tokens || 0, e.output_tokens || 0, h)), 
                updateTokenDisplay(), saveConversation(), addRegenBtn(), c && a.assistantDiv) {
                    var v = document.createElement("div");
                    v.className = "model-fusion-indicator", v.textContent = c, a.assistantDiv.appendChild(v);
                }
                a.titleEarlyDone || maybeGenerateTitle(), STATE.isStreaming = !1, STATE.currentAbortController = null, 
                updateSendButton(), promptInput.focus();
            } else _saveConvById(n, o, {
                tokensIn: e?.input_tokens || 0,
                tokensOut: e?.output_tokens || 0,
                cost: h,
                modelKey: l
            });
        }), (e => {
            if (STATE._activeStreams.delete(n), n !== STATE.conversationId) return o.push({
                role: "assistant",
                content: STREAM_ERROR_CONTENT,
                error: !0
            }), void _saveConvById(n, o, {
                modelKey: l
            });
            const r = "string" == typeof t ? t : Array.isArray(t) ? t.filter((e => "text" === e.type)).map((e => e.text)).join(" ") : "", s = Array.isArray(t) ? t.filter((e => "file" === e.type || "image" === e.type)).map((e => e.name || e.mimeType || "image")) : [];
            handleApiError(a.assistantDiv, r, s, l || "", e);
        }), u, STATE.webSearchEnabled && !hasBuiltInWebSearch(l), (e => {
            a.accumulatedThinking += e, n === STATE.conversationId && a.assistantDiv && a.assistantDiv.isConnected && (!function() {
                const e = a.assistantDiv;
                if (!e) return;
                if (!e.querySelector(".thinking-block")) {
                    const t = document.createElement("details");
                    t.className = "thinking-block", t.open = !0;
                    const n = document.createElement("summary");
                    n.textContent = "Raisonnement", (() => {
                        const _b = document.createElement("span");
                        _b.className = "thinking-bubble";
                        _b.style.left = "20%";
                        _b.style.animationDelay = "0s";
                        n.appendChild(_b);
                        const _b2 = document.createElement("span");
                        _b2.className = "thinking-bubble";
                        _b2.style.left = "45%";
                        _b2.style.animationDelay = "0.8s";
                        n.appendChild(_b2);
                        const _b3 = document.createElement("span");
                        _b3.className = "thinking-bubble";
                        _b3.style.left = "70%";
                        _b3.style.animationDelay = "1.6s";
                        n.appendChild(_b3);
                    })(), t.appendChild(n);
                    const o = document.createElement("div");
                    o.className = "thinking-content", t.appendChild(o), e.insertBefore(t, e.firstChild);
                }
                a.thinkSr || (a.thinkSr = createStreamRenderer(a.assistantDiv, (() => a.assistantDiv.querySelector(".thinking-content"))));
            }(), a.thinkSr && a.thinkSr.add(e));
        }), STATE.currentAbortController.signal, (i = getModelParams(), STATE._routerForceThinking && ((i = i || {}).reasoning_effort = i.reasoning_effort || "medium", 
        STATE._routerForceThinking = !1), _routerIntent === "chat" && _routerScore < 15 && (i = i || {}, 
        i.reasoning_effort = "low"), i), d);
    }
}

chatContainer.addEventListener("scroll", (() => {
    const e = window.innerWidth < 768 ? 200 : 80, t = chatContainer.scrollHeight - chatContainer.scrollTop - chatContainer.clientHeight < e;
    _userHasScrolledUp = !t;
})), chatContainer.addEventListener("click", (e => {
    const t = e.target.closest(".canvas-inline-op");
    if (!t) return;
    const n = t.dataset.name;
    if (n && window.Canvas && (e.preventDefault(), "function" != typeof window.Canvas.isActive || window.Canvas.isActive() || window.Canvas.setActive(!0), 
    "function" == typeof window.Canvas.showPanel && window.Canvas.showPanel(), "function" == typeof window.Canvas.selectFile)) {
        window.Canvas.selectFile(n) || t.classList.add("canvas-inline-op-missing");
    }
})), setRolesCallbacks({
    customConfirm: customConfirm,
    showModelAlert: showModelAlert,
    showNoModelAlert: showNoModelAlert,
    customAlert: customAlert,
    openRolesManage: openRolesManage
}), initRoles(), setPromptsCallbacks({
    customConfirm: customConfirm,
    showNoModelAlert: showNoModelAlert,
    customAlert: customAlert,
    openPromptsManage: openPromptsManage
}), initPrompts(), toolbarInsertBtn.addEventListener("click", (() => togglePromptPicker())), 
document.addEventListener("click", (e => {
    toolbarInsertBtn.contains(e.target) || promptPickerDropdownWrapper.contains(e.target) || "none" !== promptPickerDropdownWrapper.style.display && (promptPickerDropdownWrapper.style.display = "none", 
    toolbarInsertBtn.classList.contains("floating") && showInsertBtn());
})), setWhisperCallbacks({
    showNoModelAlert: showNoModelAlert,
    customAlert: customAlert,
    addCostForModel: addCostForModel,
    updateTokenDisplay: updateTokenDisplay,
    saveConversation: saveConversation
}), initWhisper(micBtn, promptInput);

const rolesManageOverlay = document.getElementById("roles-manage-overlay"), rolesManageList = document.getElementById("roles-manage-list"), rolesManageEmpty = document.getElementById("roles-manage-empty"), rolesManageClose = document.getElementById("roles-manage-close"), rolesManageAdd = document.getElementById("roles-manage-add"), rolesManageImport = document.getElementById("roles-manage-import"), sidebarRolesBtn = document.getElementById("sidebar-roles-btn"), promptsManageOverlay = document.getElementById("prompts-manage-overlay"), promptsManageList = document.getElementById("prompts-manage-list"), promptsManageEmpty = document.getElementById("prompts-manage-empty"), promptsManageClose = document.getElementById("prompts-manage-close"), promptsManageAdd = document.getElementById("prompts-manage-add"), sidebarPromptsBtn = document.getElementById("sidebar-prompts-btn");

function openRolesManage() {
    renderRolesManageList(), rolesManageOverlay.style.display = "flex";
}

function closeRolesManage() {
    rolesManageOverlay.style.display = "none";
}

async function renderRolesManageList() {
    const e = await listSystemPrompts();
    rolesManageList.innerHTML = "", rolesManageEmpty.style.display = e.length ? "none" : "block";
    for (const o of e) {
        const e = document.createElement("div");
        e.className = "manage-list-item", e.innerHTML = '<div class="manage-list-item-icon"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg></div><div class="manage-list-item-info"><span class="manage-list-item-name"></span><span class="manage-list-item-preview"></span></div><button class="manage-list-item-share" title="Partager"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg></button><span class="manage-list-item-arrow">›</span>';
        var t = e.querySelector(".manage-list-item-name"), n = e.querySelector(".manage-list-item-preview");
        t && (t.textContent = o.nom), n && (n.textContent = o.contenu.substring(0, 60) + (o.contenu.length > 60 ? "…" : "")), 
        e.querySelector(".manage-list-item-share").addEventListener("click", (e => {
            e.stopPropagation(), exportSpItem(o.filename);
        })), e.addEventListener("click", (() => {
            closeRolesManage(), openSpModal(o.filename, !0);
        })), rolesManageList.appendChild(e);
    }
}

function openPromptsManage() {
    renderPromptsManageList(), promptsManageOverlay.style.display = "flex";
}

function closePromptsManage() {
    promptsManageOverlay.style.display = "none";
}

async function renderPromptsManageList() {
    const e = await listSavedPrompts();
    promptsManageList.innerHTML = "", promptsManageEmpty.style.display = e.length ? "none" : "block";
    for (const o of e) {
        const e = document.createElement("div");
        e.className = "manage-list-item", e.innerHTML = '<div class="manage-list-item-icon"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg></div><div class="manage-list-item-info"><span class="manage-list-item-name"></span><span class="manage-list-item-preview"></span></div><button class="manage-list-item-share" title="Partager"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg></button><span class="manage-list-item-arrow">›</span>';
        var t = e.querySelector(".manage-list-item-name"), n = e.querySelector(".manage-list-item-preview");
        t && (t.textContent = o.nom), n && (n.textContent = o.contenu.substring(0, 60) + (o.contenu.length > 60 ? "…" : "")), 
        e.querySelector(".manage-list-item-share").addEventListener("click", (e => {
            e.stopPropagation(), exportPrItem(o.filename);
        })), e.addEventListener("click", (() => {
            closePromptsManage(), openPrModal(o.filename, "", !0);
        })), promptsManageList.appendChild(e);
    }
}

async function exportPrItem(e) {
    const t = await readSavedPrompt(e);
    if (!t) return;
    const n = {
        _minou_prompt: !0,
        nom: t.nom,
        contenu: t.contenu
    }, o = new Blob([ JSON.stringify(n, null, 2) ], {
        type: "application/json"
    }), a = URL.createObjectURL(o), r = document.createElement("a");
    r.href = a;
    const s = t.nom.replace(/[^a-zA-Z0-9àâéèêëïîôùûüçÀÂÉÈÊËÏÎÔÙÛÜÇ _-]/g, "_");
    r.download = `prompt-${s}.json`, r.click(), URL.revokeObjectURL(a);
}

sidebarRolesBtn.addEventListener("click", openRolesManage), rolesManageClose.addEventListener("click", closeRolesManage), 
rolesManageOverlay.addEventListener("click", (e => {
    e.target === rolesManageOverlay && closeRolesManage();
})), rolesManageAdd.addEventListener("click", (() => {
    closeRolesManage(), openSpModal(null, !0);
})), rolesManageImport.addEventListener("click", (() => spImportFile.click())), 
sidebarPromptsBtn.addEventListener("click", openPromptsManage), promptsManageClose.addEventListener("click", closePromptsManage), 
promptsManageOverlay.addEventListener("click", (e => {
    e.target === promptsManageOverlay && closePromptsManage();
})), promptsManageAdd.addEventListener("click", (() => {
    closePromptsManage(), openPrModal(null, "", !0);
}));

const prImportFile = document.getElementById("pr-import-file"), promptsManageImport = document.getElementById("prompts-manage-import");

promptsManageImport.addEventListener("click", (() => prImportFile.click())), prImportFile.addEventListener("change", (async () => {
    const e = prImportFile.files[0];
    if (e) {
        prImportFile.value = "";
        try {
            const t = await e.text(), n = JSON.parse(t);
            if (!n._minou_prompt || !n.nom || !n.contenu) return void showModelAlert("Ce fichier n'est pas un prompt Cetas valide.");
            const o = n.nom.replace(/[^a-zA-Z0-9àâéèêëïîôùûüçÀÂÉÈÊËÏÎÔÙÛÜÇ _-]/g, "_") + ".json";
            await writeSavedPrompt(o, {
                nom: n.nom,
                contenu: n.contenu
            }), refreshPrList(), renderPromptsManageList();
        } catch (e) {
            console.error("Erreur import prompt:", e), showModelAlert("Erreur lors de l'import du prompt.");
        }
    }
})), setExportImportCallbacks({
    showModelAlert: showModelAlert,
    customConfirm: customConfirm,
    refreshConvList: refreshConvList,
    populateUnifiedSelect: populateUnifiedSelect
}), initExportImport();

const dashboardBtn = document.getElementById("dashboard-btn"), saveModalOverlay = document.getElementById("save-modal-overlay"), saveModalClose = document.getElementById("save-modal-close"), saveModalExportBtn = document.getElementById("save-modal-export-btn"), saveModalImportBtn = document.getElementById("save-modal-import-btn");

dashboardBtn.addEventListener("click", (() => {
    saveModalOverlay.style.display = "flex";
}));

const sidebarFaqBtn = document.getElementById("sidebar-faq-btn");

sidebarFaqBtn && sidebarFaqBtn.addEventListener("click", (() => {
    openApiKeysModal("faq");
}));

const clearAllBtn = document.getElementById("clear-all-btn"), clearAllOverlay = document.getElementById("clear-all-overlay"), clearAllCancel = document.getElementById("clear-all-cancel"), clearAllConfirm = document.getElementById("clear-all-confirm"), clearAllCodeInput = document.getElementById("clear-all-code-input"), clearAllCodeDisplay = document.getElementById("clear-all-code");

let _clearAllExpectedCode = "";

function _generateClearCode() {
    const e = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    let t = "";
    for (let n = 0; n < 6; n++) t += e[Math.floor(32 * Math.random())];
    return t;
}

async function _deleteAllConversations() {
    try {
        const e = Object.assign({
            "Content-Type": "application/json"
        }, _getAuthHeaders());
        fetch("/api/conversations", {
            method: "DELETE",
            headers: e
        }).catch((function() {}));
    } catch (e) {}
    return deleteAllConversationFiles().then((() => {
        refreshConvList(), renderFavList(), refreshCatBar();
    }));
}

clearAllBtn && clearAllBtn.addEventListener("click", (() => {
    _clearAllExpectedCode = _generateClearCode(), clearAllCodeDisplay.textContent = _clearAllExpectedCode, 
    clearAllCodeInput.value = "", clearAllConfirm.disabled = !0, clearAllOverlay.style.display = "flex";
})), clearAllCancel.addEventListener("click", (() => {
    clearAllOverlay.style.display = "none";
})), clearAllOverlay.addEventListener("click", (e => {
    e.target === clearAllOverlay && (clearAllOverlay.style.display = "none");
})), clearAllCodeInput.addEventListener("input", (() => {
    clearAllConfirm.disabled = clearAllCodeInput.value.toUpperCase() !== _clearAllExpectedCode;
})), clearAllConfirm.addEventListener("click", (async () => {
    if (clearAllCodeInput.value.toUpperCase() === _clearAllExpectedCode) {
        clearAllConfirm.textContent = "Suppression...", clearAllConfirm.disabled = !0;
        try {
            await _deleteAllConversations(), clearAllOverlay.style.display = "none", customAlert("Toutes les conversations ont été supprimées.", "success");
        } catch (e) {
            customAlert("Erreur : " + (e.message || "inconnue"), "error");
        }
        clearAllConfirm.textContent = "Effacer tout", clearAllConfirm.disabled = !1;
    }
})), saveModalClose.addEventListener("click", (() => {
    saveModalOverlay.style.display = "none";
})), saveModalOverlay.addEventListener("click", (e => {
    e.target === saveModalOverlay && (saveModalOverlay.style.display = "none");
})), saveModalExportBtn.addEventListener("click", exportBackup), saveModalImportBtn.addEventListener("click", (() => importFileInput.click()));

const dashboardContent = document.getElementById("dashboard-content");

let dashboardData = null;

async function listAllConvStats() {
    return listConversationFiles(!0);
}

document.querySelectorAll(".dashboard-tab").forEach((e => {
    e.addEventListener("click", (() => {
        document.querySelectorAll(".dashboard-tab").forEach((e => e.classList.remove("active"))), 
        e.classList.add("active"), renderDashboardTab(e.dataset.tab);
    }));
})), initConfigAutoSave();

let _faqLoaded = !1, _faqActiveCategory = null;

function renderFaqItems(e) {
    const t = document.getElementById("faq-container");
    t.innerHTML = "";
    const n = FAQ_DATA.filter((t => t.category === e));
    for (const e of n) {
        const n = document.createElement("div");
        n.className = "faq-item", n.innerHTML = '<button class="faq-question"><span class="faq-question-arrow">›</span><span></span></button><div class="faq-answer"></div>', 
        n.querySelector(".faq-question span:last-child").textContent = e.question, n.querySelector(".faq-answer").innerHTML = e.answer, 
        n.querySelector(".faq-question").addEventListener("click", (() => {
            const e = n.classList.contains("open");
            t.querySelectorAll(".faq-item.open").forEach((e => {
                e !== n && e.classList.remove("open");
            })), n.classList.toggle("open", !e);
        })), t.appendChild(n);
    }
}

function loadFaq() {
    if (_faqLoaded) return;
    const e = document.getElementById("faq-tabs");
    e.innerHTML = "";
    for (const t of FAQ_CATEGORIES) {
        const n = document.createElement("button");
        n.className = "faq-tab", n.textContent = t.label, n.dataset.category = t.id, n.addEventListener("click", (() => {
            e.querySelectorAll(".faq-tab").forEach((e => e.classList.remove("active"))), n.classList.add("active"), 
            _faqActiveCategory = t.id, renderFaqItems(t.id);
        })), e.appendChild(n);
    }
    const t = e.querySelector(".faq-tab");
    t && (t.classList.add("active"), _faqActiveCategory = FAQ_CATEGORIES[0].id, renderFaqItems(FAQ_CATEGORIES[0].id)), 
    _faqLoaded = !0;
}

const shareCopyBtn = document.getElementById("share-copy-btn"), shareLinkInput = document.getElementById("share-link-input");

const CETAS_SHARE_URL = "https://cetas.neva-ci.pro/";
if (shareLinkInput && !shareLinkInput.value) shareLinkInput.value = CETAS_SHARE_URL;

shareCopyBtn.addEventListener("click", (() => {
    const url = shareLinkInput.value.trim();
    if (!url) return;
    shareLinkInput.select();
    const onCopied = () => {
        const e = shareCopyBtn.innerHTML;
        shareCopyBtn.innerHTML = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg> Copié !', 
        setTimeout((() => {
            shareCopyBtn.innerHTML = e;
        }), 2e3);
    };
    const onFail = () => {
        try {
            document.execCommand("copy") && onCopied();
        } catch {}
    };
    if (navigator.clipboard && window.isSecureContext) {
        navigator.clipboard.writeText(url).then(onCopied).catch(onFail);
    } else {
        onFail();
    }
}));

var themeTogglePanel = document.getElementById("theme-toggle-panel");

function updateThemeOptions() {
    const e = localStorage.getItem("minou-theme") || "light";
    if (!themeTogglePanel) return;
    themeTogglePanel.querySelectorAll(".theme-toggle-btn").forEach((t => {
        t.classList.toggle("active", t.dataset.theme === e);
    }));
    const t = document.getElementById("theme-auto-hint");
    t && (t.style.display = "auto" === e ? "" : "none");
}

function populateModelSelects() {
    const e = (e, t, n) => {
        const o = document.getElementById(e);
        o.innerHTML = "";
        const a = document.createElement("option");
        a.value = "", a.textContent = "Aucun", o.appendChild(a);
        for (const e of MODELS_DATA[t]) {
            if (!hasProviderKey(e.editeur)) continue;
            const t = document.createElement("option");
            t.value = e.id;
            const n = e.prix ? ` — ${e.prix}` : "";
            t.textContent = e.label + n, o.appendChild(t);
        }
        o.value = n;
    }, t = (e, t, n) => {
        const o = document.getElementById(e);
        o.innerHTML = "";
        const a = document.createElement("option");
        a.value = "", a.textContent = "Aucun", o.appendChild(a);
        const r = [], s = new Set;
        for (const e of MODELS_DATA[t]) hasProviderKey(e.editeur) && (s.has(e.editeur) || (s.add(e.editeur), 
        r.push(e.editeur)));
        for (const e of r) {
            const n = document.createElement("option");
            n.disabled = !0, n.textContent = `── ${EDITEUR_LABELS[e] || e} ──`, o.appendChild(n);
            for (const n of MODELS_DATA[t].filter((t => t.editeur === e))) {
                const e = document.createElement("option");
                e.value = n.id;
                const t = void 0 !== n.inputPer1M ? ` — $${n.inputPer1M} / $${n.outputPer1M}` : "";
                e.textContent = n.label + t, o.appendChild(e);
            }
        }
        const i = loadCatalogPrefs(), l = new Set(i.disabled || []);
        for (const e of [ "ollama", "lmstudio" ]) {
            const a = MODELS.filter((t => t.editeur === e && !l.has(t.id))), r = new Set(a.map((e => e.id))), s = "ollama" === e && n && !r.has(n) && !MODELS_DATA[t].some((e => e.id === n)) && !MODELS.some((e => e.id === n && isLocalEditeur(e.editeur))) && "" !== n;
            if (API_KEYS[e] && (a.length > 0 || s)) {
                const t = document.createElement("option");
                if (t.disabled = !0, t.textContent = `── ${EDITEUR_LABELS[e]} ──`, o.appendChild(t), 
                s) {
                    const e = document.createElement("option");
                    e.value = n, e.textContent = n + " (hors ligne)", o.appendChild(e);
                }
                for (const e of a) {
                    const t = document.createElement("option");
                    t.value = e.id, t.textContent = e.label, o.appendChild(t);
                }
            }
        }
        const c = loadCatalogPrefs(), d = new Set(c.orEnabled || []);
        if (hasProviderKey("openrouter")) {
            const e = MODELS.filter((e => "openrouter" === e.editeur && d.has(e.id)));
            if (e.length > 0) {
                const t = document.createElement("option");
                t.disabled = !0, t.textContent = `── ${EDITEUR_LABELS.openrouter} ──`, o.appendChild(t);
                const n = document.createElement("option");
                n.disabled = !0, n.style.color = "#888", n.textContent = "Modèles sélectionnés uniquement", 
                o.appendChild(n);
                for (const t of e) {
                    const e = TARIFS[t.id], n = document.createElement("option");
                    n.value = t.id;
                    const a = e && void 0 !== e.inputPer1M ? ` — $${e.inputPer1M} / $${e.outputPer1M}` : "";
                    n.textContent = t.label + a, o.appendChild(n);
                }
            }
        }
        o.value = n;
    };
    e("audio-tts-provider", "tts", AUDIO_SETTINGS.ttsProvider || "system-tts"), e("audio-stt-provider", "stt", AUDIO_SETTINGS.sttProvider || ""), 
    t("enhance-provider", "text", AUDIO_SETTINGS.enhanceModel || ""), t("summary-model", "text", AUDIO_SETTINGS.summaryModel || ""), 
    t("title-model", "text", AUDIO_SETTINGS.titleModel || "");
    const n = document.getElementById("title-model"), o = n.querySelector('option[value=""]');
    o.textContent = "Modèle utilisé dans la conversation";
    const a = document.createElement("option");
    a.value = "none", a.textContent = "Aucun", n.insertBefore(a, o.nextSibling), n.value = AUDIO_SETTINGS.titleModel || "", 
    t("error-explainer-model", "text", AUDIO_SETTINGS.errorExplainerModel || ""), populateLocalFallback(), 
    updateLocalFallbackVisibility();
}

function populateLocalFallback() {
    const e = document.getElementById("local-fallback-model"), t = AUDIO_SETTINGS.localFallbackModel ?? "";
    e.innerHTML = "";
    const n = document.createElement("option");
    n.value = "", n.disabled = !0, n.textContent = "Sélectionner le modèle de secours", 
    e.appendChild(n);
    const o = document.createElement("option");
    o.value = "none", o.textContent = "Aucun", e.appendChild(o);
    const a = [], r = new Set;
    for (const e of MODELS_DATA.text) hasProviderKey(e.editeur) && (r.has(e.editeur) || (r.add(e.editeur), 
    a.push(e.editeur)));
    for (const t of a) {
        const n = document.createElement("option");
        n.disabled = !0, n.textContent = `── ${EDITEUR_LABELS[t] || t} ──`, e.appendChild(n);
        for (const n of MODELS_DATA.text.filter((e => e.editeur === t))) {
            const t = document.createElement("option");
            t.value = n.id;
            const o = void 0 !== n.inputPer1M ? ` — $${n.inputPer1M} / $${n.outputPer1M}` : "";
            t.textContent = n.label + o, e.appendChild(t);
        }
    }
    e.value = t || "", e.value || (e.value = "");
}

function updateLocalFallbackVisibility() {
    const e = new Set(MODELS.filter((e => isLocalEditeur(e.editeur))).map((e => e.id))), t = new Set(MODELS_DATA.text.map((e => e.id))), n = [ "enhance-provider", "summary-model", "title-model", "error-explainer-model" ].some((n => {
        const o = document.getElementById(n).value;
        return !!o && (e.has(o) || !t.has(o) && "none" !== o);
    }));
    document.getElementById("local-fallback-row").style.display = n ? "" : "none";
}

const WS_PROVIDERS_CONFIG = [
    { id: "tavily", label: "Tavily", icon: "Tavily.png", color: !0, placeholder: "tvly-...", link: "https://app.tavily.com/home", linkLabel: "Obtenir une clé API Tavily", envVar: "TAVILY_API_KEY" },
    { id: "exa", label: "Exa", icon: "Exa.png", color: !0, placeholder: "...", link: "https://dashboard.exa.ai/api-keys", linkLabel: "Obtenir une clé API Exa", envVar: "EXA_API_KEY" },
    { id: "brave", label: "Brave Search", icon: "Brave.svg", color: !1, placeholder: "BSA...", link: "https://api-dashboard.search.brave.com/app/keys", linkLabel: "Obtenir une clé API Brave Search", envVar: "BRAVE_API_KEY" },
    { id: "jina", label: "Jina", icon: "Jina.webp", color: !0, placeholder: "jina_...", link: "https://jina.ai/api-dashboard/api-keys", linkLabel: "Obtenir une clé API Jina", envVar: "JINA_API_KEY" }
];

const _WS_EYE_SVG = '<svg class="apikey-eye-show" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg><svg class="apikey-eye-hide" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>';

let _wsActiveProvider = "tavily", _wsKeysDirty = !1, _wsInited = !1;

function _setWsKeysDirty(e) {
    _wsKeysDirty = e;
    const t = document.getElementById("websearch-save-btn");
    t && (t.disabled = !e, t.classList.toggle("models-save-btn--dirty", e));
}

function _buildWsTabsHtml() {
    return WS_PROVIDERS_CONFIG.map(((e, t) => `
        <button type="button" class="provider-tab${0 === t ? " active" : ""}" data-ws-provider="${e.id}" title="${escHtml(e.label)}">
            <img src="images/${e.icon}" class="provider-tab-icon${e.color ? " provider-tab-icon--color" : ""}" alt="${escHtml(e.label)}">
            <span class="provider-tab-label">${escHtml(e.label)}</span>
        </button>
    `)).join("");
}

function _buildWsSectionHtml(e, t) {
    return `
        <div class="provider-section${t ? " active" : ""}" data-ws-provider="${e.id}">
            <div class="apikey-label-row">
                <label class="sp-modal-label" for="ws-${e.id}-key">Clé API ${escHtml(e.label)}</label>
                <a class="apikey-get-link" href="${e.link}" target="_blank" rel="noopener noreferrer">${escHtml(e.linkLabel)}</a>
            </div>
            <div class="apikey-field">
                <div class="apikey-input-wrap">
                    <input type="password" id="ws-${e.id}-key" class="sp-modal-input apikey-input" placeholder="${escHtml(e.placeholder)}" autocomplete="off" data-ws-env="${e.envVar}">
                    <button type="button" class="apikey-eye-btn" data-target="ws-${e.id}-key" title="Afficher la clé" aria-label="Afficher la clé">${_WS_EYE_SVG}</button>
                </div>
            </div>
        </div>
    `;
}

function _selectWsProvider(e) {
    _wsActiveProvider = e;
    document.querySelectorAll("#ws-providers-tabs .provider-tab").forEach((t => t.classList.toggle("active", t.dataset.wsProvider === e)));
    document.querySelectorAll("#ws-provider-content .provider-section").forEach((t => t.classList.toggle("active", t.dataset.wsProvider === e)));
}

function _initWebsearchPanel() {
    if (_wsInited) return;
    const tabs = document.getElementById("ws-providers-tabs"), content = document.getElementById("ws-provider-content");
    if (!tabs || !content) return;
    tabs.innerHTML = _buildWsTabsHtml();
    content.innerHTML = WS_PROVIDERS_CONFIG.map(((e, t) => _buildWsSectionHtml(e, 0 === t))).join("");
    tabs.querySelectorAll(".provider-tab").forEach((t => t.addEventListener("click", (() => _selectWsProvider(t.dataset.wsProvider)))));
    content.querySelectorAll(".apikey-input").forEach((e => e.addEventListener("input", (() => _setWsKeysDirty(!0)))));
    content.querySelectorAll(".apikey-eye-btn").forEach((btn => {
        btn.addEventListener("click", (() => {
            const inp = document.getElementById(btn.dataset.target);
            if (!inp) return;
            const show = "password" === inp.type;
            inp.type = show ? "text" : "password", btn.classList.toggle("shown", show),
            btn.title = show ? "Masquer la clé" : "Afficher la clé";
        }));
    }));
    _wsInited = !0;
}

function _loadWebsearchKeys() {
    _initWebsearchPanel();
    const t = "undefined" != typeof Auth && Auth.getToken ? Auth.getToken() : "";
    fetch("/api/websearch/keys", { headers: { Authorization: "Bearer " + t } })
        .then(r => { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); })
        .then(data => {
            for (const p of WS_PROVIDERS_CONFIG) {
                const inp = document.getElementById("ws-" + p.id + "-key");
                if (inp) inp.value = data[p.envVar] || "";
            }
            _setWsKeysDirty(!1);
        }).catch(() => {});
}

window._loadWebsearchKeys = _loadWebsearchKeys;

document.getElementById("ws-providers-tabs") && _initWebsearchPanel();

document.getElementById("websearch-cancel-btn")?.addEventListener("click", _loadWebsearchKeys);

document.getElementById("websearch-save-btn")?.addEventListener("click", () => {
    const payload = {};
    for (const p of WS_PROVIDERS_CONFIG) {
        const inp = document.getElementById("ws-" + p.id + "-key");
        payload[p.envVar] = inp ? inp.value.trim() : "";
    }
    const t = "undefined" != typeof Auth && Auth.getToken ? Auth.getToken() : "";
    fetch("/api/websearch/keys", {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + t },
        body: JSON.stringify(payload)
    }).then(r => r.json()).then(d => {
        if (d.ok) {
            _setWsKeysDirty(!1);
            const btn = document.getElementById("websearch-save-btn");
            btn.textContent = "✓ Sauvegardé";
            setTimeout(() => btn.textContent = "Sauvegarder", 2000);
        }
    }).catch(() => {});
});

function openApiKeysModal(e = "apimodeles") {
    document.querySelectorAll(".apikey-eye-btn").forEach((e => {
        const t = document.getElementById(e.dataset.target);
        t && (t.type = "password"), e.classList.remove("shown"), e.title = "Afficher la clé", 
        e.setAttribute("aria-label", "Afficher la clé");
    })), _restoreApiKeyInputs();
    for (const e of [ "ollama", "lmstudio", "llamacpp" ]) {
        const t = document.getElementById(`apikey-${e}-status`);
        t && (t.textContent = "", t.className = "apikey-local-status");
    }
    document.getElementById("models-error").style.display = "none", _setKeysDirty(!1), 
    _setModelsDirty(!1), _initCatalogPending(), _setCatalogDirty(!1), "apimodeles" === e && renderProviderCatalog(_activeProvider), 
    populateModelSelects();
    const t = loadBudgetSettings();
    document.getElementById("budget-enabled").checked = t.enabled, document.getElementById("budget-period").value = t.period, 
    document.getElementById("budget-amount").value = t.amount || "", document.getElementById("budget-settings").style.display = t.enabled ? "" : "none", 
    updateBudgetAmountSuffix(), t.enabled && updateBudgetPreview(), _setBudgetDirty(!1), 
    document.querySelectorAll(".apikeys-tab").forEach((e => e.classList.remove("active"))), 
    document.querySelectorAll(".apikeys-panel").forEach((e => e.classList.remove("active"))), 
    document.querySelector('.apikeys-tab[data-tab="' + e + '"]').classList.add("active"), 
    document.getElementById("panel-" + e).classList.add("active"), "faq" === e && loadFaq(),
    "websearch" === e && _loadWebsearchKeys(),
    updateThemeOptions();
    const n = apikeysModalOverlay.querySelector(".sp-modal.apikeys-modal");
    if (apikeysModalOverlay.classList.remove("closing", "opening"), n && n.classList.remove("closing", "opening", "morphing-from-dock", "morphing-to-dock"), 
    apikeysModalOverlay.style.display = "flex", n) {
        n.offsetWidth, n.classList.add("opening");
        const e = t => {
            t.target === n && (n.classList.remove("opening"), n.removeEventListener("animationend", e));
        };
        n.addEventListener("animationend", e);
    }
}

function closeApiKeysModal() {
    if ("none" === apikeysModalOverlay.style.display) return;
    const e = apikeysModalOverlay.querySelector(".sp-modal.apikeys-modal");
    if (e && (e.classList.contains("morphing-to-dock") || e.classList.contains("morphing-from-dock"))) return apikeysModalOverlay.style.display = "none", 
    void fetchLocalModels().then((() => populateModelSelect()));
    if (!e) return apikeysModalOverlay.style.display = "none", void fetchLocalModels().then((() => populateModelSelect()));
    e.classList.remove("opening"), e.classList.add("closing");
    const t = n => {
        n.target === e && (e.removeEventListener("animationend", t), apikeysModalOverlay.style.display = "none", 
        e.classList.remove("closing"), fetchLocalModels().then((() => populateModelSelect())));
    };
    e.addEventListener("animationend", t);
}

function addCodeCopyButtons(e) {
    const t = e.querySelectorAll("pre");
    for (const e of t) {
        if (e.querySelector(".code-copy-btn")) continue;
        e.style.position = "relative";
        const t = document.createElement("button");
        t.className = "code-copy-btn", t.textContent = "Copier", t.addEventListener("click", (() => {
            const n = e.querySelector("code"), o = n ? n.textContent : e.textContent;
            navigator.clipboard.writeText(o).then((() => {
                t.textContent = "Copié !", setTimeout((() => {
                    t.textContent = "Copier";
                }), 1500);
            })).catch((function() {}));
        })), e.appendChild(t);
    }
}

const chat = createChat({
    chatContainer,
    promptInput,
    sendBtn,
    spSelect,
    spTextarea,
    micBtn,
    micIconDefaultSaved,
    micIconStopStreaming,
    attachBtn,
    attachPreview,
    updateEnhanceBtn,
    updateEmptyChatCategory,
    generateConversationId,
    safeUrl,
    addCodeCopyButtons,
    saveConversation,
    refreshConvList,
    maybeGenerateTitle,
    _saveConvById,
    _limitHistoryImages,
    getMaxHistoryImages,
    resetConversation,
    getTextFromContent,
    hasBuiltInWebSearch,
    calcWebSearchCost,
    _resolveTextCost,
    _resolveImageCost,
    getImageParams,
    getModelEditeur,
    getImageModelEditeur,
    getSearchModelEditeur,
    getTarif,
    getImageTarif,
    getSearchTarif,
    getModelLabel,
    getModelParams,
    streamModel,
    generateImage,
    buildImagePrompt,
    collectReferenceImages,
    imageResultToContent,
    buildImagesContainer,
    routeModel,
    recordRouteResult,
    explainError,
    addCostForModel,
    updateTokenDisplay,
    customAlert,
    customConfirm,
    showModelAlert,
    showErrorAlert,
    applyErrorStyle,
    openPrModal,
    attachCanvasBeforeToLastAssistant,
    buildCanvasParserIfActive,
    confirmAndRewindCanvas,
    effectiveSystemPrompt,
    _showRouterThinking,
    _hideRouterThinking,
    AUDIO_SETTINGS,
    MODELS_DATA,
    showNoModelAlert,
    ttsSpeak,
});

window._marexcode = createMarexcode({
    streamModelWithTools,
    MAREXCODE_TOOLS,
    MODELS,
    Auth,
    effectiveSystemPrompt,
});

updateSendButton = chat.updateSendButton;
hideEmptyPlaceholder = chat.hideEmptyPlaceholder;
showEmptyPlaceholder = chat.showEmptyPlaceholder;
closeAllMenus = chat.closeAllMenus;

themeTogglePanel && themeTogglePanel.addEventListener("click", (e => {
    const t = e.target.closest(".theme-toggle-btn");
    if (!t) return;
    const n = t.dataset.theme;
    localStorage.setItem("minou-theme", n), applyTheme(n), themeTogglePanel.querySelectorAll(".theme-toggle-btn").forEach((e => {
        e.classList.toggle("active", e === t);
    }));
    const o = document.getElementById("theme-auto-hint");
    o && (o.style.display = "auto" === n ? "" : "none");
})), window.openApiKeysModal = openApiKeysModal, initLightbox(), function() {
    const e = /(^|[^\p{L}])cetas$/u;
    let t = !1;
    promptInput.addEventListener("input", (() => {
        if (t) return;
        const n = promptInput.value.toLowerCase();
        e.test(n) && function() {
            t = !0;
            const e = document.querySelector(".input-wrapper").getBoundingClientRect(), n = 120, o = Math.round(629 * n / 620), a = Math.round(119 * n / 620), r = e.left + e.width / 2, s = document.createElement("div");
            s.style.cssText = `\n            position:fixed;\n            width:${n}px;\n            height:${o}px;\n            left:${r}px;\n            bottom:${window.innerHeight - e.top}px;\n            transform:translateX(-50%);\n            overflow:hidden;\n            z-index:19;\n        `, 
            document.body.appendChild(s);
            const i = document.createElement("img");
            i.src = "images/ee.svg", i.style.cssText = `\n            position:absolute;\n            width:100%;\n            height:${o}px;\n            left:0;\n            bottom:0;\n            transform:translateY(100%);\n            transition:transform 0.45s ease-out;\n        `, 
            s.appendChild(i);
            let l = !1, c = null, d = null, u = null, p = null, m = 0, g = 0;
            function h(e) {
                const t = i.getBoundingClientRect();
                return e < t.top + t.height / 2;
            }
            function v(e, t) {
                const n = document.createElement("div"), o = 30 * (Math.random() - .5);
                n.textContent = "❤️", n.style.cssText = `\n                position:fixed;\n                left:${e + o}px;\n                top:${t}px;\n                font-size:${14 + 10 * Math.random()}px;\n                pointer-events:none;\n                z-index:21;\n                transition:transform 1s ease-out, opacity 1s ease-out;\n                transform:translateY(0) scale(1);\n                opacity:1;\n            `, 
                document.body.appendChild(n), requestAnimationFrame((() => {
                    requestAnimationFrame((() => {
                        n.style.transform = `translateY(-${60 + 40 * Math.random()}px) scale(0.5)`, n.style.opacity = "0";
                    }));
                })), setTimeout((() => n.remove()), 1100);
            }
            function T(e) {
                const t = h(e);
                if (i.style.cursor = t ? "grab" : "default", t && !l ? (l = !0, c && (clearTimeout(c), 
                c = null), i.src = _ec) : !t && l && (l = !1, c = setTimeout((() => {
                    i.src = "images/ee.svg", setTimeout((() => {
                        A();
                    }), 3e3);
                }), 1e3)), t) {
                    m++;
                    const e = Date.now();
                    if (m >= 4 && e - g > 300) {
                        const t = i.getBoundingClientRect();
                        v(t.left + t.width * (.3 + .4 * Math.random()), t.top + .1 * t.height), g = e, m = 0;
                    }
                }
            }
            function y() {
                i.style.cursor = "default", l && (l = !1, m = 0, c = setTimeout((() => {
                    i.src = "images/ee.svg", setTimeout((() => {
                        A();
                    }), 3e3);
                }), 1e3));
            }
            function f() {
                l = !1, c && (clearTimeout(c), c = null), A();
            }
            i.addEventListener("mousemove", (e => T(e.clientY))), i.addEventListener("mouseleave", y), 
            i.addEventListener("touchstart", (e => {
                e.touches.length && T(e.touches[0].clientY);
            }), {
                passive: !0
            }), i.addEventListener("touchmove", (e => {
                e.touches.length && T(e.touches[0].clientY);
            }), {
                passive: !0
            }), i.addEventListener("touchend", y), i.addEventListener("touchcancel", y), window.addEventListener("resize", f);
            const E = document.createElement("img");
            E.src = _eb, E.style.cssText = `\n            position:fixed;\n            width:${n}px;\n            height:${a}px;\n            left:${r}px;\n            top:${e.top - a / 2}px;\n            transform:translateX(-50%);\n            visibility:hidden;\n            z-index:20;\n            pointer-events:none;\n        `, 
            document.body.appendChild(E), requestAnimationFrame((() => {
                requestAnimationFrame((() => {
                    i.style.transform = "translateY(0)", E.style.visibility = "visible";
                }));
            }));
            setTimeout((() => {
                l || (i.src = _ec, setTimeout((() => {
                    l || (i.src = "images/ee.svg");
                }), 150));
            }), 1400);
            let S = !1;
            function A() {
                S || l || (S = !0, window.removeEventListener("resize", f), i.src = _ec, i.style.transition = "transform 0.5s cubic-bezier(.55,0,.68,.53)", 
                i.style.transform = "translateY(100%)", u = setTimeout((() => {
                    E.style.visibility = "hidden";
                }), 500), p = setTimeout((() => {
                    s.remove(), E.remove(), t = !1;
                }), 700));
            }
            d = setTimeout((() => {
                l || A();
            }), 3300);
        }();
    }));
}(), window.Canvas && "function" == typeof window.Canvas.init && (window.Canvas.init(), 
updateCanvasBtn()), window.Ocean && "function" == typeof window.Ocean.init && window.Ocean.init(), 
Object.assign(window, {
    STATE: STATE,
    STREAM_ERROR_CONTENT: STREAM_ERROR_CONTENT,
    TEXT_EXTENSIONS: TEXT_EXTENSIONS,
    isStreamActive: isStreamActive,
    escHtml: escHtml,
    escHtmlAttr: escHtmlAttr,
    safeUrl: safeUrl,
    isTextFile: isTextFile,
    arrayBufferToBase64: arrayBufferToBase64,
    isPdf: isPdf,
    getModelLabel: getModelLabel,
    fmtTokens: fmtTokens,
    fmtCost: fmtCost,
    applyTheme: applyTheme,
    initTheme: initTheme,
    setOnThemeChange: setOnThemeChange,
    initLightbox: initLightbox,
    initAttachments: initAttachments,
    setAttachStateChange: setAttachStateChange,
    cancelAllPendingLoads: cancelAllPendingLoads,
    renderAttachPreview: renderAttachPreview,
    processAttachedFile: processAttachedFile,
    initEmojiTabs: initEmojiTabs,
    showEmojiPicker: showEmojiPicker,
    hideEmojiPicker: hideEmojiPicker,
    renderEmojiGrid: renderEmojiGrid,
    renderFavList: renderFavList,
    _isFavorite: _isFavorite,
    _toggleFavorite: _toggleFavorite,
    setFavoritesCallbacks: setFavoritesCallbacks,
    initWhisper: initWhisper,
    setWhisperCallbacks: setWhisperCallbacks,
    initUserManagement: initUserManagement,
    updateWebSearchBtn: updateWebSearchBtn,
    hasBuiltInWebSearch: hasBuiltInWebSearch,
    calcWebSearchCost: calcWebSearchCost,
    setWebSearchAlignCallback: setWebSearchAlignCallback,
    toggleWebSearch: toggleWebSearch,
    syncWebSearchUI: syncWebSearchUI,
    initExportHandlers: initExportHandlers,
    updateExportMdBtn: updateExportMdBtn,
    loadBudgetSettings: loadBudgetSettings,
    toggleBudgetSettings: toggleBudgetSettings,
    getCostForPeriod: getCostForPeriod,
    updateBudgetPreview: updateBudgetPreview,
    checkBudgetAlert: checkBudgetAlert,
    addCostForModel: addCostForModel,
    updateBudgetAmountSuffix: updateBudgetAmountSuffix,
    initBudget: initBudget,
    initRoles: initRoles,
    setRolesCallbacks: setRolesCallbacks,
    refreshSpList: refreshSpList,
    deleteSpItem: deleteSpItem,
    exportSpItem: exportSpItem,
    openSpModal: openSpModal,
    closeSpModal: closeSpModal,
    autoResizeTextarea: autoResizeTextarea,
    initPrompts: initPrompts,
    setPromptsCallbacks: setPromptsCallbacks,
    refreshPrList: refreshPrList,
    openPrModal: openPrModal,
    closePrModal: closePrModal,
    initExportImport: initExportImport,
    setExportImportCallbacks: setExportImportCallbacks,
    exportBackup: exportBackup,
    importBackup: importBackup,
    initCategories: initCategories,
    setCategoriesCallbacks: setCategoriesCallbacks,
    refreshCatBar: refreshCatBar,
    updateActiveCatColor: updateActiveCatColor,
    updateNewChatBtnColor: updateNewChatBtnColor,
    updateCatSelectColor: updateCatSelectColor,
    updateEmptyChatCategory: updateEmptyChatCategory,
    openCatModal: openCatModal,
    openCatManagePopup: openCatManagePopup,
    renderCatManageList: renderCatManageList,
    selectCatColor: selectCatColor,
    randomDefaultEmoji: randomDefaultEmoji,
    textColorForBg: textColorForBg,
    APP_VERSION: "3.2",
    chatContainer: chatContainer,
    promptInput: promptInput,
    sendBtn: sendBtn,
    newChatBtn: newChatBtn,
    tokenInfo: tokenInfo,
    costInfo: costInfo,
    convList: convList,
    modelSelect: modelSelect,
    spSelect: spSelect,
    spListEl: spListEl,
    spAddBtn: spAddBtn,
    spEditBtn: spEditBtn,
    spDeleteBtn: spDeleteBtn,
    rpRoleActions: rpRoleActions,
    spModalOverlay: spModalOverlay,
    spModalTitle: spModalTitle,
    spModalNom: spModalNom,
    spModalContenu: spModalContenu,
    spModalCancel: spModalCancel,
    spModalSave: spModalSave,
    themeToggle: themeToggle,
    convSearch: convSearch,
    attachBtn: attachBtn,
    fileInput: fileInput,
    attachPreview: attachPreview,
    micBtn: micBtn,
    enhancePromptBtn: enhancePromptBtn,
    toolbarInsertBtn: toolbarInsertBtn,
    toolbarEnhanceBtn: toolbarEnhanceBtn,
    toolbarSaveBtn: toolbarSaveBtn,
    chatHeaderSettings: chatHeaderSettings,
    promptPickerDropdownWrapper: promptPickerDropdownWrapper,
    promptPickerDropdown: promptPickerDropdown,
    prListEl: prListEl,
    prAddBtn: prAddBtn,
    prModalOverlay: prModalOverlay,
    prModalTitle: prModalTitle,
    prModalNom: prModalNom,
    prModalContenu: prModalContenu,
    prModalCancel: prModalCancel,
    prModalSave: prModalSave,
    prModalEnhance: prModalEnhance,
    apikeysBtn: apikeysBtn,
    apikeysModalOverlay: apikeysModalOverlay,
    shareBtn: shareBtn,
    shareMenu: shareMenu,
    summaryBtn: summaryBtn,
    addModelSwitchElement: addModelSwitchElement,
    addModelSwitch: addModelSwitch,
    sidebarToggle: sidebarToggle,
    sidebar: sidebar,
    _isMobile: _isMobile,
    _updateSidebarState: _updateSidebarState,
    _collapseSidebar: _collapseSidebar,
    mobileSendBtn: mobileSendBtn,
    canvasToggleBtn: canvasToggleBtn,
    updateCanvasBtn: updateCanvasBtn,
    buildCanvasParserIfActive: buildCanvasParserIfActive,
    SAMAGENT_BOOST_PROMPT: SAMAGENT_BOOST_PROMPT,
    effectiveSystemPrompt: effectiveSystemPrompt,
    _showRouterThinking: _showRouterThinking,
    _hideRouterThinking: _hideRouterThinking,
    attachCanvasBeforeToLastAssistant: attachCanvasBeforeToLastAssistant,
    updateEnhanceBtn: updateEnhanceBtn,
    _toolbarMode: _toolbarMode,
    _insertBtnVisible: _insertBtnVisible,
    _insertBtnTargetCoords: _insertBtnTargetCoords,
    showInsertBtn: showInsertBtn,
    hideInsertBtn: hideInsertBtn,
    _applyToolbarMode: _applyToolbarMode,
    updatePromptToolbar: updatePromptToolbar,
    closeAllMenus: closeAllMenus,
    EDITEUR_LABELS: EDITEUR_LABELS,
    OR_MAKER_LABELS: OR_MAKER_LABELS,
    _modelMakerLabel: _modelMakerLabel,
    EDITEUR_ORDER: EDITEUR_ORDER,
    EDITEUR_ICONS: EDITEUR_ICONS,
    _editeurGroupHeaderHtml: _editeurGroupHeaderHtml,
    HIDDEN_EDITEURS: HIDDEN_EDITEURS,
    hasProviderKey: hasProviderKey,
    _tooltip: _tooltip,
    _MODALITY_LABELS: _MODALITY_LABELS,
    _PARAM_LABELS: _PARAM_LABELS,
    _formatContextLength: _formatContextLength,
    _formatModalities: _formatModalities,
    _formatSupportedParams: _formatSupportedParams,
    _formatDefaultParams: _formatDefaultParams,
    _isModelNew: _isModelNew,
    _isModelExpiringSoon: _isModelExpiringSoon,
    _formatExpirationDateFr: _formatExpirationDateFr,
    _buildModelTooltip: _buildModelTooltip,
    upgradeToCustomSelect: upgradeToCustomSelect,
    hasAnyProviderKey: hasAnyProviderKey,
    updateTriggerDisplay: updateTriggerDisplay,
    updateActiveOption: updateActiveOption,
    formatImagePriceRange: formatImagePriceRange,
    _formatOrImagePriceStr: _formatOrImagePriceStr,
    _formatModelPriceString: _formatModelPriceString,
    populateCustomSelect: populateCustomSelect,
    _buildModelsHtml: _buildModelsHtml,
    _switchTab: _switchTab,
    _applyModelSelection: _applyModelSelection,
    populateUnifiedSelect: populateUnifiedSelect,
    populateModelSelect: populateModelSelect,
    checkApiKeyForModel: checkApiKeyForModel,
    micIconDefaultSaved: micIconDefaultSaved,
    micIconStopStreaming: micIconStopStreaming,
    updateSendButton: updateSendButton,
    inputHint: inputHint,
    alignInputHint: alignInputHint,
    _lastClickX: _lastClickX,
    _lastClickY: _lastClickY,
    showEmptyPlaceholder: showEmptyPlaceholder,
    hideEmptyPlaceholder: hideEmptyPlaceholder,
    resetConversation: resetConversation,
    _dlgOverlay: _dlgOverlay,
    _dlgIcon: _dlgIcon,
    _dlgMessage: _dlgMessage,
    _dlgActions: _dlgActions,
    _dlgOk: _dlgOk,
    _dlgCancel: _dlgCancel,
    _DIALOG_ICONS: _DIALOG_ICONS,
    _showDialog: _showDialog,
    customAlert: customAlert,
    customConfirm: customConfirm,
    _isFriendlyCetasError: _isFriendlyCetasError,
    showErrorAlert: showErrorAlert,
    modelAlertTimer: modelAlertTimer,
    showMissingModelBanner: showMissingModelBanner,
    MODEL_ALERT_DEFAULT: MODEL_ALERT_DEFAULT,
    _hideModelAlert: _hideModelAlert,
    showModelAlert: showModelAlert,
    showNoModelAlert: showNoModelAlert,
    generateConversationId: generateConversationId,
    updateTokenDisplay: updateTokenDisplay,
    _rebindStreamToVisibleDOM: _rebindStreamToVisibleDOM,
    _mergeConvData: _mergeConvData,
    saveConversation: saveConversation,
    getTextFromContent: getTextFromContent,
    _IMG_DOWNLOAD_SVG: _IMG_DOWNLOAD_SVG,
    buildImagesContainer: buildImagesContainer,
    imageResultToContent: imageResultToContent,
    buildImagePrompt: buildImagePrompt,
    collectReferenceImages: collectReferenceImages,
    addMessage: addMessage,
    collapseThinkBlock: collapseThinkBlock,
    endStreaming: endStreaming,
    _wrapNewChars: _wrapNewChars,
    createStreamRenderer: createStreamRenderer,
    formatGenTime: formatGenTime,
    formatGenTooltip: formatGenTooltip,
    setGenTimeOnLastAssistant: setGenTimeOnLastAssistant,
    appendCitations: appendCitations,
    removeRegenBtn: removeRegenBtn,
    addRegenBtn: addRegenBtn,
    startEditMessage: startEditMessage,
    _userHasScrolledUp: _userHasScrolledUp,
    scrollToBottom: scrollToBottom,
    handleApiError: handleApiError,
    applyErrorStyle: applyErrorStyle,
    rolesManageOverlay: rolesManageOverlay,
    rolesManageList: rolesManageList,
    rolesManageEmpty: rolesManageEmpty,
    rolesManageClose: rolesManageClose,
    rolesManageAdd: rolesManageAdd,
    rolesManageImport: rolesManageImport,
    sidebarRolesBtn: sidebarRolesBtn,
    promptsManageOverlay: promptsManageOverlay,
    promptsManageList: promptsManageList,
    promptsManageEmpty: promptsManageEmpty,
    promptsManageClose: promptsManageClose,
    promptsManageAdd: promptsManageAdd,
    sidebarPromptsBtn: sidebarPromptsBtn,
    openRolesManage: openRolesManage,
    closeRolesManage: closeRolesManage,
    openPromptsManage: openPromptsManage,
    closePromptsManage: closePromptsManage,
    prImportFile: prImportFile,
    promptsManageImport: promptsManageImport,
    dashboardBtn: dashboardBtn,
    saveModalOverlay: saveModalOverlay,
    saveModalClose: saveModalClose,
    saveModalExportBtn: saveModalExportBtn,
    saveModalImportBtn: saveModalImportBtn,
    dashboardContent: dashboardContent,
    dashboardData: dashboardData,
    _faqLoaded: _faqLoaded,
    _faqActiveCategory: _faqActiveCategory,
    renderFaqItems: renderFaqItems,
    loadFaq: loadFaq,
    shareCopyBtn: shareCopyBtn,
    shareLinkInput: shareLinkInput,
    updateThemeOptions: updateThemeOptions,
    populateModelSelects: populateModelSelects,
    populateLocalFallback: populateLocalFallback,
    updateLocalFallbackVisibility: updateLocalFallbackVisibility,
    openApiKeysModal: openApiKeysModal,
    closeApiKeysModal: closeApiKeysModal,
    addCodeCopyButtons: addCodeCopyButtons
}), window.showWebSearchIndicator = function showWebSearchIndicator() {
    var a = document.querySelector(".message-wrapper:last-child .message-text");
    if (!a) return;
    var b = a.parentElement.querySelector(".web-search-indicator");
    if (!b) {
        b = document.createElement("div");
        b.className = "web-search-indicator";
        b.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg><span>Recherche web en cours...</span>';
        a.parentElement.insertBefore(b, a);
    }
    b.style.display = "flex";
};

function hideWebSearchIndicator() {
    var a = document.querySelector(".web-search-indicator");
    if (a) a.style.display = "none";
}

window.addEventListener("websearch-start", showWebSearchIndicator);

window.addEventListener("websearch-end", hideWebSearchIndicator);

window.dispatchEvent(new Event("cetas:app-ready"));

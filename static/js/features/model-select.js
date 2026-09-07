export function createModelSelect({
    STATE,
    chatContainer,
    modelSelect,
    getModelLabel,
    escHtml,
    getApiKeys,
    getModels,
    getImageModels,
    getSearchModels,
    loadCatalogPrefs,
    getTarif,
    getImageTarif,
    getSearchTarif,
    getImageModelEditeur,
    getSearchModelEditeur,
    isLocalEditeur,
    formatImagePrice,
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
}) {
    const EDITEUR_LABELS = {
        openai: "OpenAI",
        anthropic: "Anthropic",
        google: "Google",
        mistral: "Mistral",
        perplexity: "Perplexity",
        deepseek: "DeepSeek",
        grok: "Grok (xAI)",
        zai: "Z.ai (GLM)",
        openrouter: "OpenRouter",
        samagent: "SamAgent (Fusion)",
        ollama: "Ollama",
        lmstudio: "LM Studio",
        llamacpp: "LLaMA.cpp"
    }, OR_MAKER_LABELS = {
        openai: "OpenAI",
        anthropic: "Anthropic",
        google: "Google",
        "meta-llama": "Meta",
        mistralai: "Mistral",
        mistral: "Mistral",
        deepseek: "DeepSeek",
        "x-ai": "xAI",
        qwen: "Qwen",
        cohere: "Cohere",
        perplexity: "Perplexity",
        nvidia: "NVIDIA",
        microsoft: "Microsoft",
        amazon: "Amazon",
        "z-ai": "Z.ai",
        thudm: "THUDM",
        inflection: "Inflection",
        liquid: "Liquid",
        nous: "Nous",
        gryphe: "Gryphe",
        moonshotai: "Moonshot",
        inception: "Inception",
        minimax: "MiniMax",
        baidu: "Baidu",
        tencent: "Tencent",
        bytedance: "ByteDance",
        alibaba: "Alibaba"
    };

    const EDITEUR_ORDER = [
        "openai", "anthropic", "google", "mistral", "perplexity", "deepseek",
        "grok", "zai", "openrouter", "samagent", "ollama", "lmstudio", "llamacpp"
    ], EDITEUR_ICONS = {
        openai: "OpenAI.svg",
        anthropic: "Anthropic.svg",
        google: "Google.svg",
        mistral: "Mistral.svg",
        perplexity: "Perplexity.svg",
        deepseek: "DeepSeek.svg",
        grok: "Grok.svg",
        zai: "Z.ai.svg",
        openrouter: "OpenRouter.svg",
        samagent: "SamAgent.svg",
        ollama: "Ollama.svg",
        lmstudio: "LMStudio.svg",
        llamacpp: "LlamaCpp.svg"
    };

    const HIDDEN_EDITEURS = new Set;
    const _tooltip = document.createElement("div");

    _tooltip.id = "custom-select-tooltip";
    document.body.appendChild(_tooltip);

    const _MODALITY_LABELS = {
        text: "Texte",
        image: "Images",
        audio: "Audio",
        video: "Vidéo",
        file: "Fichiers"
    }, _PARAM_LABELS = {
        tools: "Function calling",
        structured_outputs: "Mode JSON",
        response_format: "Mode JSON",
        reasoning: "Raisonnement",
        web_search_options: "Recherche web"
    };

    const apiKeys = () => getApiKeys() || {};
    const models = () => getModels() || [];
    const imageModels = () => getImageModels() || [];
    const searchModels = () => getSearchModels() || [];

    function _modelMakerLabel(e) {
        if (!e) return "";
        if ("openrouter" === e.editeur && e.id) {
            const t = e.id.replace(/^~/, "").split("/")[0] || "";
            return OR_MAKER_LABELS[t] ? OR_MAKER_LABELS[t] : t.split("-").map((e => e ? e.charAt(0).toUpperCase() + e.slice(1) : "")).join(" ");
        }
        return EDITEUR_LABELS[e.editeur] || e.editeur || "";
    }

    function _editeurGroupHeaderHtml(e) {
        const t = EDITEUR_ICONS[e];
        return `<span class="custom-select-group-label">${t ? `<img class="custom-select-group-icon" src="images/${t}" alt="">` : ""}<span>${escHtml(EDITEUR_LABELS[e] || e)}</span></span>`;
    }

    function hasProviderKey(e) {
        if (!e) return !1;
        if ("system" === e || "samagent" === e) return !0;
        const t = document.getElementById("apikeys-modal-overlay");
        if (t && t.style.display && "none" !== t.style.display) {
            const t = document.getElementById("apikey-" + e);
            if (t) return !!t.value.trim();
        }
        const keys = apiKeys();
        return !(!keys || !keys[e]);
    }

    function _formatContextLength(e) {
        return e && "number" == typeof e ? e >= 1e6 ? (e / 1e6).toFixed(e % 1e6 == 0 ? 0 : 1) + "M" : e >= 1e3 ? Math.round(e / 1e3) + "K" : String(e) : null;
    }

    function _formatModalities(e) {
        if (!e || !e.length) return null;
        const t = e.map((e => _MODALITY_LABELS[e] || e));
        return [ ...new Set(t) ].join(", ");
    }

    function _formatSupportedParams(e) {
        if (!e || !e.length) return null;
        const t = new Set, n = [];
        for (const o of e) {
            const e = _PARAM_LABELS[o];
            e && !t.has(e) && (t.add(e), n.push(e));
        }
        return n.length ? n.join(", ") : null;
    }

    function _formatDefaultParams(e) {
        if (!e || "object" != typeof e) return null;
        const t = [];
        return null != e.temperature && t.push(`temp ${e.temperature}`), null != e.top_p && t.push(`top_p ${e.top_p}`),
        null != e.top_k && t.push(`top_k ${e.top_k}`), null != e.frequency_penalty && t.push(`freq ${e.frequency_penalty}`),
        null != e.presence_penalty && t.push(`pres ${e.presence_penalty}`), null != e.repetition_penalty && t.push(`rep ${e.repetition_penalty}`),
        t.length ? t.join(", ") : null;
    }

    function _isModelNew(e) {
        if (!e.created) return !1;
        const t = Date.now() - 1e3 * e.created;
        return t >= 0 && t < 6048e5;
    }

    function _isModelExpiringSoon(e) {
        if (!e.expirationDate) return !1;
        const t = Date.parse(e.expirationDate);
        return !isNaN(t) && (t - Date.now() < 5184e6 && t > Date.now());
    }

    function _formatExpirationDateFr(e) {
        if (!e) return "";
        const t = new Date(e);
        return isNaN(t.getTime()) ? e : t.toLocaleDateString("fr-FR", {
            day: "numeric",
            month: "long",
            year: "numeric"
        });
    }

    function _buildModelTooltip(e) {
        const t = [];
        e.description && t.push(e.description.trim());
        const n = _formatContextLength(e.contextLength);
        n && t.push(`Contexte : ${n} tokens`);
        const o = _formatModalities(e.inputModalities);
        o && t.push(`Entrée : ${o}`);
        const a = _formatModalities(e.outputModalities);
        a && t.push(`Sortie : ${a}`);
        const r = _formatSupportedParams(e.supportedParameters);
        r && t.push(`Capacités : ${r}`);
        const s = _formatDefaultParams(e.defaultParameters);
        return s && t.push(`Recommandé : ${s}`), e.knowledgeCutoff && t.push(`Connaissances : ${e.knowledgeCutoff}`),
        _isModelExpiringSoon(e) && t.push(`⚠️ Sera retiré le ${_formatExpirationDateFr(e.expirationDate)}`),
        t.join("\n\n");
    }

    function upgradeToCustomSelect(e) {
        if (e._customUI) return;
        const t = document.createElement("div");
        t.className = "custom-select";
        const n = document.createElement("div");
        n.className = "custom-select-trigger";
        const o = document.createElement("img");
        o.className = "custom-select-trigger-icon", o.alt = "", o.style.display = "none";
        const a = document.createElement("span");
        a.className = "custom-select-text", a.textContent = hasAnyProviderKey() ? "Aucun" : "Choisir modèle";
        n.appendChild(o), n.appendChild(a);
        const r = document.createElement("div");
        r.className = "custom-select-dropdown", t.appendChild(n), t.appendChild(r), e.parentNode.insertBefore(t, e),
        e.style.display = "none", e._customValue = "", e._customDisabled = !1, e._customUI = {
            container: t,
            trigger: n,
            triggerIcon: o,
            triggerText: a,
            dropdown: r
        }, e._customModels = [], Object.defineProperty(e, "value", {
            get: () => e._customValue,
            set(t) {
                e._customValue = t || "", updateTriggerDisplay(e), updateActiveOption(e);
            },
            configurable: !0
        }), Object.defineProperty(e, "disabled", {
            get: () => e._customDisabled,
            set(n) {
                e._customDisabled = !!n, t.classList.toggle("disabled", !!n);
            },
            configurable: !0
        }), n.addEventListener("click", (() => {
            e._customDisabled || (document.querySelectorAll(".custom-select.open").forEach((e => {
                e !== t && e.classList.remove("open");
            })), t.classList.toggle("open"));
        })), r.addEventListener("click", (n => {
            if (n.target.closest(".custom-select-empty-link")) return n.preventDefault(), t.classList.remove("open"),
            void openApiKeysModal("apimodeles");
            const o = n.target.closest(".custom-select-option, .custom-select-option--empty");
            if (!o) return;
            const a = o.dataset.value, r = e._customValue;
            e._customValue = a || "", e._prevCustomValue = r, updateTriggerDisplay(e), updateActiveOption(e),
            t.classList.remove("open"), e.dispatchEvent(new Event("change"));
        })), document.addEventListener("click", (e => {
            t.contains(e.target) || t.classList.remove("open");
        })), document.addEventListener("keydown", (e => {
            "Escape" === e.key && t.classList.remove("open");
        }));
    }

    function hasAnyProviderKey() {
        return Object.values(apiKeys()).some((e => e && String(e).trim()));
    }

    function updateTriggerDisplay(e) {
        if (!e._customUI) return void ("function" == typeof updateInputHint && updateInputHint());
        const {triggerText: t, triggerIcon: n} = e._customUI, o = e._customValue;
        if (!o) return t.textContent = hasAnyProviderKey() ? "Aucun" : "Choisir modèle",
        void (n && (n.style.display = "none", n.removeAttribute("src")));
        const a = e._customModels.find((e => e.id === o));
        if (t.textContent = a ? a.label : o, n) {
            const e = a && EDITEUR_ICONS[a.editeur];
            e ? (n.src = `images/${e}`, n.style.display = "") : (n.style.display = "none", n.removeAttribute("src"));
        }
    }

    function updateActiveOption(e) {
        if (!e._customUI) return;
        const {dropdown: t} = e._customUI, n = e._customValue;
        t.querySelectorAll(".custom-select-option, .custom-select-option--empty").forEach((e => {
            e.classList.toggle("active", e.dataset.value === n);
        }));
    }

    function formatImagePriceRange(e) {
        const t = e.imagePricing, n = [];
        if (t) if ("openai" === e.editeur) for (const e of Object.keys(t)) for (const o of Object.keys(t[e])) n.push(t[e][o]); else if ("google" === e.editeur) for (const e of Object.keys(t)) n.push(t[e]);
        if (0 === n.length) return `$${e.imageOutput}`;
        const o = Math.min(...n), a = Math.max(...n);
        return o === a ? `$${o}` : `$${o}–$${a}`;
    }

    function _formatOrImagePriceStr(e, t) {
        const n = Array.isArray(t) ? t : [];
        if (1 === n.length && "image" === n[0]) {
            return `≈${formatImagePrice(3906.25 * e)} /Mpx`;
        }
        return `≈${formatImagePrice(1024 * e)} /img`;
    }

    function _formatModelPriceString(e, t) {
        if (isLocalEditeur(e.editeur)) return "Gratuit";
        if (!t) return "";
        const n = [], o = !(!t.inputPer1M && !t.outputPer1M), a = !(!t.imageOutput && !t.imagePricing);
        if (o && n.push(`$${t.inputPer1M} → $${t.outputPer1M} /M`), a) if ("openrouter" === t.editeur) {
            const o = imageModels().find((t => t.id === e.id));
            n.push(_formatOrImagePriceStr(t.imageOutput, o?.outputModalities));
        } else n.push(`${formatImagePriceRange(t)} /img`);
        return n.join(" · ") || "Gratuit";
    }

    function populateCustomSelect(e, t, n) {
        const {dropdown: o} = e._customUI;
        e._customModels = t;
        const a = {};
        for (const e of t) HIDDEN_EDITEURS.has(e.editeur) || (a[e.editeur] || (a[e.editeur] = []),
        a[e.editeur].push(e));
        let r = '<div class="custom-select-option--empty" data-value="">Aucun</div>';
        for (const e of EDITEUR_ORDER) if (a[e]) {
            r += '<div class="custom-select-provider">', r += `<div class="custom-select-group">${_editeurGroupHeaderHtml(e)}</div>`;
            for (const t of a[e]) {
                const e = _formatModelPriceString(t, n(t.id));
                r += `<div class="custom-select-option" data-value="${escHtml(t.id)}">`, r += '<div class="custom-select-option-text">',
                r += `<span class="custom-select-option-name">${escHtml(t.label)}</span>`, e && (r += `<span class="custom-select-option-price">${escHtml(e)}</span>`),
                r += "</div>";
                const o = _buildModelTooltip(t);
                o && (r += `<span class="custom-select-info" data-tooltip="${escHtml(o)}">i</span>`),
                r += "</div>";
            }
            r += "</div>";
        }
        o.innerHTML = r, e._customValue = "", updateTriggerDisplay(e);
    }

    function _buildModelsHtml(e, t) {
        const n = loadCatalogPrefs(), o = new Set(n.disabled || []), a = new Set(n.orEnabled || []), r = e.filter((e => !HIDDEN_EDITEURS.has(e.editeur) && ("openrouter" === e.editeur ? a.has(e.id) && hasProviderKey("openrouter") : hasProviderKey(e.editeur) && !o.has(e.id))));
        if (0 === r.length) return '<div class="custom-select-empty-message">Pour voir les modèles disponibles, renseignez vos clés API dans <a href="#" class="custom-select-empty-link" id="custom-select-empty-link">Configuration</a>.</div>';
        const s = {};
        for (const e of r) s[e.editeur] || (s[e.editeur] = []), s[e.editeur].push(e);
        let i = "";
        for (const e of EDITEUR_ORDER) if (s[e]) {
            i += '<div class="custom-select-provider">', i += `<div class="custom-select-group">${_editeurGroupHeaderHtml(e)}</div>`;
            for (const n of s[e]) {
                const e = _formatModelPriceString(n, t(n.id));
                i += `<div class="custom-select-option" data-value="${escHtml(n.id)}">`, i += '<div class="custom-select-option-text">',
                i += `<span class="custom-select-option-name">${escHtml(n.label)}</span>`, e && (i += `<span class="custom-select-option-price">${escHtml(e)}</span>`),
                i += "</div>";
                const o = _buildModelTooltip(n);
                o && (i += `<span class="custom-select-info" data-tooltip="${escHtml(o)}">i</span>`),
                i += "</div>";
            }
            i += "</div>";
        }
        return i;
    }

    function _switchTab(e, t) {
        if (modelSelect._activeCategory = e, modelSelect._customUI) {
            modelSelect._customUI.dropdown.querySelectorAll(".custom-select-tab").forEach((t => t.classList.toggle("active", t.dataset.tab === e)));
        }
        let n;
        if (n = "text" === e ? models() : "image" === e ? imageModels() : searchModels(), modelSelect._customModels = n,
        modelSelect._customUI) {
            modelSelect._customUI.dropdown.querySelector(".custom-select-tab-content").innerHTML = _buildModelsHtml(n, "text" === e ? getTarif : "image" === e ? getImageTarif : getSearchTarif);
        }
        if (t) {
            const t = "text" === e ? "minou-last-model" : "image" === e ? "minou-last-image-model" : "minou-last-search-model";
            let o = localStorage.getItem(t);
            if (o) {
                const a = n.find((e => e.id === o)), r = "text" === e || ("image" === e ? !!getImageModelEditeur(o) : !!getSearchModelEditeur(o));
                r && a && hasProviderKey(a.editeur) || (r || localStorage.removeItem(t), o = null);
            }
            const a = loadCatalogPrefs(), r = new Set(a.disabled || []), s = new Set(a.orEnabled || []), i = n.filter((e => !HIDDEN_EDITEURS.has(e.editeur) && ("openrouter" === e.editeur ? s.has(e.id) && hasProviderKey("openrouter") : hasProviderKey(e.editeur) && !r.has(e.id)))), l = o || (i.length ? i[0].id : "");
            l ? (modelSelect._customValue = l, updateTriggerDisplay(modelSelect), updateActiveOption(modelSelect),
            _applyModelSelection(e, l)) : (modelSelect._customValue = "", _applyModelSelection(e, ""),
            updateTriggerDisplay(modelSelect), updateActiveOption(modelSelect));
        } else updateActiveOption(modelSelect);
    }

    function _applyModelSelection(e, t) {
        if (t) {
            if ("image" === e && !getImageModelEditeur(t)) return void console.warn(`Modèle "${t}" ignoré : ce n'est pas un modèle image.`);
            if ("search" === e && !getSearchModelEditeur(t)) return void console.warn(`Modèle "${t}" ignoré : ce n'est pas un modèle de recherche.`);
        }
        const n = STATE.currentModel || STATE.currentImageModel || STATE.currentSearchModel;
        "text" === e ? (STATE.currentModel = t || null, STATE.currentImageModel = null,
        STATE.currentSearchModel = null, t && localStorage.setItem("minou-last-model", t),
        updateEffortMandatory(t), setRightPanelTab("general")) : "image" === e ? (STATE.currentImageModel = t || null,
        STATE.currentModel = null, STATE.currentSearchModel = null, t && localStorage.setItem("minou-last-image-model", t),
        updateImageParamsVisibility(getImageModelEditeur(t) || "", t), setRightPanelTab("image")) : "search" === e && (STATE.currentSearchModel = t || null,
        STATE.currentModel = null, STATE.currentImageModel = null, t && localStorage.setItem("minou-last-search-model", t),
        setRightPanelTab("general"));
        const o = STATE.currentModel || STATE.currentImageModel || STATE.currentSearchModel;
        STATE.conversationStarted && n && o && n !== o && addModelSwitch(n, o), updateTokenDisplay(),
        updateWebSearchBtn(), "function" == typeof updateCanvasBtn && updateCanvasBtn();
    }

    function populateUnifiedSelect() {
        if (modelSelect._customUI) {
            const {dropdown: e} = modelSelect._customUI, t = '\n            <div class="custom-select-tabs">\n                <div class="custom-select-tab active" data-tab="text">\n                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7V4h16v3"/><path d="M9 20h6"/><path d="M12 4v16"/></svg>\n                    Texte\n                </div>\n                <div class="custom-select-tab" data-tab="image">\n                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg>\n                    Image\n                </div>\n                <div class="custom-select-tab" data-tab="search">\n                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>\n                    Recherche\n                </div>\n            </div>\n            <div class="custom-select-tab-content"></div>\n        ';
            e.innerHTML = t, e.querySelectorAll(".custom-select-tab").forEach((e => {
                e.addEventListener("click", (t => {
                    t.stopPropagation(), _switchTab(e.dataset.tab, !0);
                }));
            }));
            const allModels = models();
            modelSelect._customModels = allModels;
            e.querySelector(".custom-select-tab-content").innerHTML = _buildModelsHtml(allModels, getTarif);
        }
        "function" == typeof populatePlusModels && populatePlusModels("text"), updateInputHint();
    }

    function populateModelSelect() {
        const e = STATE.currentModel || STATE.currentImageModel || STATE.currentSearchModel;
        modelSelect._activeCategory;
        if (modelSelect._customUI) if (populateUnifiedSelect(), e) {
            const t = imageModels().some((t => t.id === e)), n = searchModels().some((t => t.id === e));
            _switchTab(t ? "image" : n ? "search" : "text", !1), modelSelect._customValue = e,
            updateTriggerDisplay(modelSelect), updateActiveOption(modelSelect);
        } else modelSelect._customValue = "", updateTriggerDisplay(modelSelect); else {
            const e = document.querySelector("#plus-model-tabs .plus-model-tab.active");
            e && "function" == typeof populatePlusModels && populatePlusModels(e.dataset.tab),
            updateInputHint();
        }
    }

    function checkApiKeyForModel(e, t) {
        const n = t(e);
        if (n && !apiKeys()[n] && "samagent" !== n) {
            if (isLocalEditeur(n)) {
                showModelAlert(`URL du serveur ${"ollama" === n ? "Ollama" : "LM Studio"} manquante. Renseignez-la dans Configuration.`);
            } else showModelAlert(`Clé API ${n} manquante. Renseignez-la dans Configuration.`);
            return !1;
        }
        return !0;
    }

    function addModelSwitchElement(e, t) {
        const n = document.createElement("div");
        n.className = "model-switch-marker", n.textContent = `${e} → ${t}`, chatContainer.appendChild(n),
        scrollToBottom(!0);
    }

    function addModelSwitch(e, t) {
        if (e === t) return;
        const n = STATE.conversationHistory[STATE.conversationHistory.length - 1];
        if (n && "model-switch" === n.type) {
            if (n.from === t) {
                STATE.conversationHistory.pop();
                const e = chatContainer.querySelectorAll(".model-switch-marker"), t = e[e.length - 1];
                return t && t.remove(), void saveConversation();
            }
            n.to = t;
            const e = chatContainer.querySelectorAll(".model-switch-marker"), o = e[e.length - 1];
            if (o) return o.textContent = `${getModelLabel(n.from)} → ${getModelLabel(t)}`,
            void saveConversation();
        }
        STATE.conversationHistory.push({
            role: "system",
            type: "model-switch",
            from: e,
            to: t
        }), addModelSwitchElement(getModelLabel(e), getModelLabel(t)), saveConversation();
    }

    return {
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
    };
}

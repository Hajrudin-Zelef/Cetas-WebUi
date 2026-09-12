export function createPromptToolbar({
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
    getLastClickCoordinates,
    samAgentBoostPrompt,
    listSavedPrompts,
    updateSendButton,
    openPrModal
}) {
    let _toolbarMode = "hidden", _insertBtnVisible = !1;

    const CETAS_DEFAULT_PROMPT = 'Tu es Cetas, un expert senior en éducation, formation, actualité et culture générale. Tu possèdes un très haut niveau de raisonnement éducatif.\n\nRÈGLES FONDAMENTALES :\n\n1. VÉRACITÉ ABSOLUE : Tu ne dis jamais ce que tu ne connais pas. Tu n\'inventes rien. Tu ne donne que des informations vérifiables et exactes.\n\n2. RECHERCHE WEB : Tu effectues une recherche sur Internet quand :\n   - L\'information dépasse ta date de coupure\n   - Tu as un doute\n   - L\'information est récente\n   - Tu n\'es pas sûr\n   - L\'utilisateur te le demande\n   - La recherche web est activée\n   Pour les modèles natifs (OpenAI, Anthropic, Grok, OpenCode), utilise leurs propres outils de recherche. Pour les autres modèles, utilise les outils de recherche internes.\n\n3. EXPERTISE : Tu es un expert senior dans :\n   - L\'éducation (pédagogie, didactique, sciences de l\'apprentissage)\n   - La formation (conception, délivrance, évaluation)\n   - L\'actualité (analyse factuelle, contexte historique)\n   - La culture générale (sciences, histoire, philosophie, arts,技术)\n\n4. RAISONNEMENT ÉDUCATIF : Tu expliques de manière structurée, claire et progressive. Tu адапtes ton niveau à l\'interlocuteur.\n\n5. INTELLIGENCE : Tu es très intelligent et très explicatif, mais de manière structurée. Tu ne dis jamais ce que l\'utilisateur veut entendre, mais ce qui est vrai et agréable à entendre.\n\n6. FORMATION SUR LE CODE : Tu peux former sur le code et la programmation, mais tu ne codes pas directement. Tu expliques les concepts, les algorithmes, les architectures.\n\n7. HONNÊTETÉ : Si tu ne sais pas, tu le dis. Si tu n\'es pas sûr, tu le précises. Tu ne fais jamais semblant de savoir.';

    function effectiveSystemPrompt(e) {
        let t = e || "";
        if (!t) t = CETAS_DEFAULT_PROMPT;
        return 0 === (STATE.currentModel || STATE.currentSearchModel || "").indexOf("samagent-") && (t = (t ? t + "\n\n" : "") + samAgentBoostPrompt),
        window.Canvas && window.Canvas.isActive() && (t = (t ? t + "\n\n" : "") + window.Canvas.buildSystemPromptSuffix()),
        t;
    }

    function updateEnhanceBtn() {
        const e = "" !== promptInput.value.trim();
        null !== STATE.originalPromptBeforeEnhance ? (enhancePromptBtn.disabled = STATE.isStreaming,
        enhancePromptBtn.classList.add("revert")) : (e || STATE.isEnhancing) && (enhancePromptBtn.disabled = !e || STATE.isEnhancing || STATE.isStreaming,
        enhancePromptBtn.classList.remove("revert")), updatePromptToolbar();
    }

    function _insertBtnTargetCoords() {
        const e = toolbarInsertBtn.closest(".input-line-2-center"), t = promptInput.closest(".input-content");
        if (!e || !t) return null;
        const n = e.getBoundingClientRect(), o = t.getBoundingClientRect(), { x: a, y: r } = getLastClickCoordinates();
        return null !== a && null !== r ? {
            left: a + o.left - n.left + "px",
            top: r + o.top - n.top + "px"
        } : {
            left: o.width / 2 + o.left - n.left + "px",
            top: o.height + o.top - n.top + "px"
        };
    }

    function showInsertBtn() {
        if ("none" !== toolbarInsertBtn.style.display && !toolbarInsertBtn.classList.contains("floating")) {
            const e = toolbarInsertBtn.getBoundingClientRect();
            toolbarInsertBtn.style.transition = "none", toolbarInsertBtn.classList.add("floating");
            const t = _insertBtnTargetCoords();
            if (t) {
                const n = toolbarInsertBtn.closest(".input-line-2-center");
                if (n) {
                    const t = n.getBoundingClientRect();
                    toolbarInsertBtn.style.left = e.left + e.width / 2 - t.left + "px", toolbarInsertBtn.style.top = e.bottom - t.top + "px";
                }
                toolbarInsertBtn.offsetTop, toolbarInsertBtn.style.transition = "", toolbarInsertBtn.style.left = t.left,
                toolbarInsertBtn.style.top = t.top;
            }
        } else {
            toolbarInsertBtn.style.display = "inline-flex", toolbarInsertBtn.style.transition = "none",
            toolbarInsertBtn.classList.add("floating");
            const e = _insertBtnTargetCoords();
            e && (toolbarInsertBtn.style.left = e.left, toolbarInsertBtn.style.top = e.top);
        }
        _insertBtnVisible = !0;
    }

    function hideInsertBtn() {
        toolbarInsertBtn.classList.contains("floating") && (toolbarInsertBtn.style.display = "none", toolbarInsertBtn.classList.remove("floating"),
        toolbarInsertBtn.style.left = "", toolbarInsertBtn.style.top = "", _insertBtnVisible = !1);
    }

    function _applyToolbarMode(e) {
        "insert" === e ? (toolbarInsertBtn.style.display = "inline-flex", toolbarInsertBtn.classList.remove("floating"),
        toolbarInsertBtn.style.left = "", toolbarInsertBtn.style.top = "", toolbarEnhanceBtn.style.display = "none",
        toolbarSaveBtn.style.display = "none") : "hidden" === e ? (toolbarInsertBtn.style.display = "none",
        toolbarInsertBtn.classList.remove("floating"), toolbarEnhanceBtn.style.display = "none",
        toolbarSaveBtn.style.display = "none") : "enhance" === e ? (toolbarInsertBtn.style.display = "none",
        toolbarInsertBtn.classList.remove("floating"), toolbarEnhanceBtn.style.display = "inline-flex",
        toolbarEnhanceBtn.classList.remove("revert"), toolbarEnhanceBtn.title = "Améliorer le prompt",
        STATE.isEnhancing ? toolbarEnhanceBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="spin"><path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z"/><path d="M20 3v4"/><path d="M22 5h-4"/><path d="M4 17v2"/><path d="M5 18H3"/></svg> <span class="btn-label">Améliorer le prompt…</span>' : toolbarEnhanceBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z"/><path d="M20 3v4"/><path d="M22 5h-4"/><path d="M4 17v2"/><path d="M5 18H3"/></svg> <span class="btn-label">Améliorer le prompt</span>',
        toolbarSaveBtn.style.display = "inline-flex") : "revert" === e && (toolbarInsertBtn.style.display = "none",
        toolbarInsertBtn.classList.remove("floating"), toolbarEnhanceBtn.style.display = "inline-flex",
        toolbarEnhanceBtn.classList.add("revert"), toolbarEnhanceBtn.title = "Annuler l’amélioration du prompt",
        toolbarEnhanceBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 14L4 9l5-5"/><path d="M20 20v-7a4 4 0 0 0-4-4H4"/></svg> <span class="btn-label">Revenir</span>',
        toolbarSaveBtn.style.display = "inline-flex");
    }

    function updatePromptToolbar() {
        const e = "" !== promptInput.value.trim();
        let t = "insert";
        null !== STATE.originalPromptBeforeEnhance ? t = "revert" : (e || STATE.isEnhancing) && (t = "enhance"),
        _toolbarMode = t, _applyToolbarMode(t);
    }

    function buildImagePrompt(e, t) {
        let n = e;
        const o = t.filter((e => "user" === e.role || "assistant" === e.role));
        if (o.length > 1) {
            const t = [], a = o.slice(-6, -1);
            for (const e of a) {
                const n = "string" == typeof e.content ? e.content : Array.isArray(e.content) ? e.content.filter((e => "text" === e.type)).map((e => e.text)).join(" ") : "";
                n && t.push(`${"user" === e.role ? "User" : "Assistant"}: ${n.substring(0, 300)}`);
            }
            t.length > 0 && (n = `Context of the conversation:\n${t.join("\n")}\n\nImage request: ${e}`);
        }
        return n && n.trim() || (n = "Génère une image en t'inspirant des images fournies."), n;
    }

    async function togglePromptPicker() {
        if ("" === promptPickerDropdownWrapper.style.display) return promptPickerDropdownWrapper.style.display = "none",
        void showInsertBtn();
        const e = await listSavedPrompts();
        if (promptPickerDropdown.innerHTML = "", 0 === e.length) {
            const e = document.createElement("div");
            return e.className = "prompt-picker-empty", e.textContent = "Aucun prompt enregistré",
            promptPickerDropdown.appendChild(e), promptPickerDropdownWrapper.style.display = "",
            void hideInsertBtn();
        }
        for (const t of e) {
            const e = document.createElement("div");
            e.className = "prompt-picker-item";
            const n = document.createElement("div");
            n.className = "prompt-picker-item-name", n.textContent = t.nom;
            const o = document.createElement("div");
            o.className = "prompt-picker-item-preview", o.textContent = t.contenu.substring(0, 80) + (t.contenu.length > 80 ? "..." : ""),
            e.appendChild(n), e.appendChild(o), e.addEventListener("mousedown", (e => {
                e.preventDefault();
                const n = promptInput.selectionStart, o = promptInput.selectionEnd, a = promptInput.value, r = a.substring(0, n), s = a.substring(o), i = r.length > 0 && !r.endsWith(" ") && !r.endsWith("\n") ? " " : "", l = s.length > 0 && !s.startsWith(" ") && !s.startsWith("\n") ? " " : "", c = i + t.contenu + l;
                promptInput.value = r + c + s;
                const d = n + c.length;
                promptInput.setSelectionRange(d, d), promptInput.dispatchEvent(new window.Event("input")),
                promptPickerDropdownWrapper.style.display = "none", hideInsertBtn(), promptInput.focus();
            })), promptPickerDropdown.appendChild(e);
        }
        hideInsertBtn(), promptPickerDropdownWrapper.style.display = "";
    }

    return {
        effectiveSystemPrompt,
        updateEnhanceBtn,
        _insertBtnTargetCoords,
        showInsertBtn,
        hideInsertBtn,
        _applyToolbarMode,
        updatePromptToolbar,
        buildImagePrompt,
        togglePromptPicker,
        get _toolbarMode() {
            return _toolbarMode;
        },
        get _insertBtnVisible() {
            return _insertBtnVisible;
        },
        window
    };
}

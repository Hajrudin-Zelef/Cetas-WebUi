
window.__wrapTables = function(html) {
    return html.replace(/<table>/g, '<div class="table-wrap"><table>').replace(/<\/table>/g, '</table></div>');
};
import { STATE, STREAM_ERROR_CONTENT, isStreamActive } from "../core/state.js";


function _streamModelDispatch(model, history, onChunk, onDone, onError, tools, forceWS, forceWS2, onThinking, signal, extra, fallback) {
    if (window._activeToolset && window._activeToolset.length) {
        return streamModelWithTools(model, history, onChunk, onDone, onError, window._activeToolset, forceWS, onThinking, signal, extra, fallback, 0);
    }
    return streamModel(model, history, onChunk, onDone, onError, tools, forceWS, forceWS2, onThinking, signal, extra, fallback);
}

export function createChat(deps) {
    const {
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
        addCodeCopyButtons: addCodeCopyButtonsFn,
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
        updateSendButton: updateSendButtonFn,
        customAlert,
        customConfirm,
        showModelAlert,
        showErrorAlert,
        applyErrorStyle: applyErrorStyleFn,
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
    } = deps;

    let _userHasScrolledUp = false;

    function _getUserHasScrolledUp() {
        return _userHasScrolledUp;
    }

    function updateSendButton() {
        if (STATE.isStreaming) {
            sendBtn.disabled = false;
            sendBtn.classList.add("stop-mode");
            if (!micBtn.classList.contains("recording")) {
                micBtn.style.display = "";
                micBtn.innerHTML = micIconStopStreaming;
                micBtn.classList.add("stop-mode");
                micBtn.title = "Arrêter la génération";
            }
        } else {
            const e = "" !== promptInput.value.trim(),
                t = STATE.pendingImages.length > 0,
                n = STATE.pendingFiles.length > 0,
                o = STATE.pendingLoadingFiles.length > 0;
            sendBtn.disabled = o || (!e && !t && !n);
            sendBtn.title = o ? "Patientez : un ou plusieurs fichiers sont en cours de chargement…" : "Envoyer (Entrée)",
            sendBtn.classList.toggle("loading-attachments", o);
            sendBtn.classList.remove("stop-mode");
            if (micBtn.classList.contains("stop-mode")) {
                micBtn.innerHTML = micIconDefaultSaved;
                micBtn.classList.remove("stop-mode");
                micBtn.title = "Dicter";
            }
        }
        attachBtn.classList.toggle("has-files", STATE.pendingImages.length > 0 || STATE.pendingFiles.length > 0);
        updateEnhanceBtn();
    }

    function hideEmptyPlaceholder() {
        const e = document.getElementById("empty-chat-placeholder");
        e && (e.style.display = "none");
    }

    function showEmptyPlaceholder() {
        const e = document.getElementById("empty-chat-placeholder");
        if (e) return e.style.display = "", void updateEmptyChatCategory();
        const t = document.createElement("div");
        t.id = "empty-chat-placeholder", t.className = "empty-chat-placeholder",
        t.innerHTML = '<img src="images/cetas3.png" alt="Cetas" class="empty-chat-logo"><p class="empty-chat-text">Sélectionnez une conversation ou démarrez-en une nouvelle en saisissant votre message ci-dessous.</p><div id="empty-chat-category" class="empty-chat-category" style="display:none"></div>',
        chatContainer.appendChild(t), updateEmptyChatCategory();
    }

    function closeAllMenus(e) {
        document.querySelectorAll(".copy-menu.open").forEach((t => {
            t !== e && t.classList.remove("open");
        }));
        document.querySelectorAll(".menu-open").forEach((e => e.classList.remove("menu-open")));
    }

    function scrollToBottom(e) {
        const t = window.innerWidth < 768;
        (e || !_userHasScrolledUp || (t && STATE.isStreaming)) && chatContainer.scroll({
            top: chatContainer.scrollHeight,
            behavior: "instant"
        });
    }

    function _wrapNewChars(e, t) {
        if (!(e && t > 0)) return;
        const n = Math.max(t, 8), o = document.createTreeWalker(e, NodeFilter.SHOW_TEXT, null);
        let a = null;
        for (; o.nextNode(); ) {
            const e = o.currentNode;
            e.nodeValue && e.nodeValue.length > 0 && (a = e);
        }
        if (!a) return;
        let r = a.parentNode;
        for (; r && r !== e; ) {
            if ("CODE" === r.nodeName || "PRE" === r.nodeName) return;
            r = r.parentNode;
        }
        const s = a.nodeValue, i = Math.min(n, s.length);
        const prevFade = e.querySelector(".char-fade");
        if (prevFade) {
            prevFade.classList.remove("char-fade");
            prevFade.classList.add("char-fade-out");
            setTimeout((() => { prevFade.parentNode && prevFade.remove(); }), 280);
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
                    span1.className = "char-flash"; span1.textContent = beforeLast;
                    t.insertBefore(span1, a);
                }
                const span2 = document.createElement("span");
                span2.className = "char-fade"; span2.textContent = lastWord;
                t.insertBefore(span2, a); t.removeChild(a);
            } else {
                const l = document.createElement("span");
                l.className = "char-flash"; l.textContent = s;
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
                    span1.className = "char-flash"; span1.textContent = beforeLast;
                    t.insertBefore(span1, a);
                }
                const span2 = document.createElement("span");
                span2.className = "char-fade"; span2.textContent = lastWord;
                t.insertBefore(span2, a);
            } else {
                const l = document.createElement("span");
                l.className = "char-flash"; l.textContent = newChars;
                t.insertBefore(l, a);
            }
            t.removeChild(a);
        }
    }

    function _showThinkingIndicator(e) {
        const t = document.createElement("div");
        t.className = "typing-indicator"; t.id = "thinking-indicator";
        t.innerHTML = '<div class="typing-avatar"><span class="typing-whale">🐳</span></div><div class="typing-body"><div class="typing-content"><div class="typing-steps"><div class="typing-step active" data-step="0"><div class="typing-step-icon"></div><span>Réflexion en cours...</span></div><div class="typing-step" data-step="1"><div class="typing-step-icon"></div><span>Analyse du contexte...</span></div><div class="typing-step" data-step="2"><div class="typing-step-icon"></div><span>Construction de la réponse...</span></div></div><div class="typing-progress"><div class="typing-progress-bar"></div></div></div></div>';
        const n = e.querySelector(".message-text") || e;
        n.appendChild(t);
        [ { delay: 0 }, { delay: 1500 }, { delay: 3e3 } ].forEach(((e, n) => {
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

    function collapseThinkBlock(e) {
        if (!e || !e.open) return;
        const t = e.querySelector(".thinking-content");
        if (!t) return void (e.open = false);
        const n = e.closest(".message"), o = n ? n.offsetWidth : 0, a = n ? n.offsetHeight : 0, r = t.offsetHeight;
        n && (n.style.width = o + "px", n.style.height = a + "px", n.style.overflow = "hidden"),
        t.style.height = r + "px", t.style.overflow = "hidden", t.offsetHeight, t.style.transition = "height 0.3s ease-out, opacity 0.3s ease-out",
        t.style.height = "0px", t.style.opacity = "0", n && (n.offsetHeight, n.style.transition = "height 0.3s ease-out",
        n.style.height = a - r + "px"), t.addEventListener("transitionend", (function s(i) {
            if ("height" !== i.propertyName) return;
            if (t.removeEventListener("transitionend", s), e.open = false, t.style.height = "",
            t.style.overflow = "", t.style.transition = "", t.style.opacity = "", !n) return;
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
        window.Ocean?.setPaused && window.Ocean.setPaused(false);
        const t = e.offsetWidth;
        e.classList.remove("streaming"), e.classList.add("streaming-done"), e.style.minWidth = t + "px",
        e.style.transition = "min-width 0.4s ease-out", requestAnimationFrame((() => { e.style.minWidth = ""; })),
        e.addEventListener("animationend", (() => e.classList.remove("streaming-done")), { once: true }),
        setTimeout((() => { e.style.transition = ""; }), 500);
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
            try { h = new URL(c).hostname.replace(/^www\./, ""); } catch (e) { h = c; }
            const s = document.createElement("li");
            e >= VISIBLE && s.classList.add("citation-hidden");
            const i = document.createElement("a");
            i.className = "citation-card", i.href = safeUrl(c), i.target = "_blank", i.rel = "noopener noreferrer", i.title = c;
            const head = document.createElement("div"); head.className = "citation-card-head";
            const fav = document.createElement("img");
            fav.className = "citation-favicon", fav.src = `https://www.google.com/s2/favicons?domain=${encodeURIComponent(h)}&sz=32`,
            fav.alt = "", fav.loading = "lazy", fav.onerror = () => { fav.style.display = "none"; };
            const dom = document.createElement("span"); dom.className = "citation-domain", dom.textContent = h;
            const num = document.createElement("span"); num.className = "citation-num", num.textContent = `[${e + 1}]`;
            head.appendChild(fav), head.appendChild(dom), head.appendChild(num);
            const title = document.createElement("div"); title.className = "citation-card-title", title.textContent = d || h;
            i.appendChild(head), i.appendChild(title), s.appendChild(i), r.appendChild(s);
        }
        if (t.length > VISIBLE) {
            const more = document.createElement("li");
            const btn = document.createElement("div");
            btn.className = "citation-more", btn.textContent = `+${t.length - VISIBLE} sources`,
            btn.addEventListener("click", (() => {
                r.querySelectorAll(".citation-hidden").forEach((e => e.classList.remove("citation-hidden"))), more.remove();
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
        t.appendChild(n);
        const genTimeEl = e[e.length - 1].querySelector(".message-gen-time");
        if (genTimeEl && genTimeEl.dataset.tooltip) {
            const statsSpan = document.createElement("span");
            statsSpan.className = "gen-stats-visible";
            statsSpan.textContent = genTimeEl.dataset.tooltip;
            t.appendChild(statsSpan);
        }
        scrollToBottom();
    }

    function _samAgentMakeClickable(e) {
        if (!e) return;
        if (0 !== (STATE.currentModel || "").indexOf("samagent-")) return;
        const t = [ { model: "samagent-nano", label: "⚡ SamAgent Nano" }, { model: "samagent-n4", label: "🚀 SamAgent N4" }, { model: "samagent-n8", label: "🧠 SamAgent N8" } ], n = e.parentElement;
        if (e.querySelector(".samagent-proposals-rendered")) return;
        e.querySelector(".message-text")?.classList.add("samagent-proposals-rendered");
        const r = document.createElement("div");
        r.className = "samagent-buttons", r.style.cssText = "margin-top:8px;display:flex;flex-direction:column;gap:4px";
        const s = document.createElement("div");
        s.textContent = "Relancer sur un autre palier :", s.style.cssText = "font-size:0.75rem;color:var(--text-muted, #888);margin-bottom:2px", r.appendChild(s);
        let lastUser = "";
        { let q = n.previousElementSibling; for (; q; ) { const u = q.querySelector(".message-user .message-text"); if (u) { lastUser = (u.textContent || "").trim(); break; } q = q.previousElementSibling; } }
        for (const e of t) {
            const t = document.createElement("div");
            t.textContent = e.label, t.style.cssText = "cursor:pointer;padding:8px 12px;border:1px solid var(--border-input);border-radius:8px;background:var(--bg-input);font-size:0.9rem;transition:background 0.15s,border-color 0.15s",
            t.addEventListener("mouseenter", (() => { t.style.background = "var(--bg-hover)", t.style.borderColor = "var(--accent)"; })),
            t.addEventListener("mouseleave", (() => { t.style.background = "var(--bg-input)", t.style.borderColor = "var(--border-input)"; })),
            t.addEventListener("click", (() => {
                if (STATE.isStreaming) return;
                r.querySelectorAll("div").forEach((e => { e.style.pointerEvents = "none", e.style.opacity = "0.5"; }));
                STATE.currentModel = e.model;
                try { localStorage.setItem("minou-last-model", e.model); } catch (_e) {}
                const t = document.getElementById("prompt-input"), b = document.getElementById("send-btn") || document.getElementById("mobile-send-btn");
                if (t && b && !b.disabled) { t.value = lastUser || t.value; b.click(); }
            })), r.appendChild(t);
        }
        const i = e.querySelector(".message-text");
        i && i.appendChild(r);
    }

    function createStreamRenderer(e, t, n) {
        let o = n || "", a = "", f = null, ts = null, s = o.length, i = false, l = false, ws = null, wd = null, _firstChunk = true, _spinnerEl = null, _spinnerInterval = null;
        const _brailleChars = [ "⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏" ];
        function _startSpinner() { if (_spinnerEl) return; const msgText = t(); if (!msgText) return; _spinnerEl = document.createElement("span"); _spinnerEl.className = "stream-spinner"; _spinnerEl.textContent = _brailleChars[0]; msgText.appendChild(_spinnerEl); let _idx = 0; _spinnerInterval = setInterval((() => { _idx = (_idx + 1) % _brailleChars.length; if (_spinnerEl) _spinnerEl.textContent = _brailleChars[_idx]; }), 80); }
        function _stopSpinner() { if (_spinnerInterval) { clearInterval(_spinnerInterval); _spinnerInterval = null; } if (_spinnerEl) { _spinnerEl.remove(); _spinnerEl = null; } }
        function c() {
            const e = t(); if (!e) return; s = o.length;
            const n = e.textContent.length; e.innerHTML = window.__wrapTables(marked.parse(o)), _wrapNewChars(e, e.textContent.length - n), _ensureSpinner(e), scrollToBottom(), function(e) { if (i) return; const t = e.scrollHeight > e.clientHeight ? e : null; t && (t.addEventListener("scroll", (() => { const e = window.innerWidth < 768 ? 120 : 12, n = t.scrollHeight - t.scrollTop - t.clientHeight < e; l = !n; })), i = true); }(e), !l && e.scrollHeight > e.clientHeight && (e.scrollTop = e.scrollHeight);
        }
        function _ensureSpinner(e) { if (_spinnerEl && _spinnerEl.parentNode === e) return; if (_spinnerEl) _spinnerEl.remove(); _spinnerEl = document.createElement("span"); _spinnerEl.className = "stream-spinner"; _spinnerEl.textContent = _brailleChars[0]; e.appendChild(_spinnerEl); let _idx = 0; if (_spinnerInterval) clearInterval(_spinnerInterval); _spinnerInterval = setInterval((() => { _idx = (_idx + 1) % _brailleChars.length; if (_spinnerEl) _spinnerEl.textContent = _brailleChars[_idx]; }), 80); }
        function showWait() { return; wd = setTimeout((() => { const n = t(); if (!n || !n.parentNode) return; ws = document.createElement("span"); ws.className = "stream-waiting"; for (let e = 0; e < 3; e++) { const t = document.createElement("span"); t.className = "stream-waiting-dot"; ws.appendChild(t); } n.appendChild(ws); requestAnimationFrame((() => ws && ws.classList.add("visible"))); wd = null; }), 300); }
        function hideWait() { wd && (clearTimeout(wd), wd = null); if (ws) { ws.classList.remove("visible"); const e = ws; setTimeout((() => e.parentNode && e.remove()), 300); ws = null; } }
        function tick(now) { if (null === ts) ts = now; const dt = now - ts; ts = now; if (0 === a.length) { f = null, ts = null; showWait(); return; } hideWait(); const cps = 30, catchup = Math.ceil(a.length / 8), base = Math.max(1, Math.round(cps * dt / 1e3)), take = Math.max(base, Math.min(catchup, a.length)); o += a.slice(0, take), a = a.slice(take), c(), f = requestAnimationFrame(tick); }
        return {
            add(e) { if (_firstChunk) { _removeThinkingIndicator(); _firstChunk = false; } a += e, hideWait(), f || (f = requestAnimationFrame(tick)); },
            flush() { f && (cancelAnimationFrame(f), f = null), ts = null, hideWait(); _stopSpinner(); o += a, a = ""; const e = t(); e && (e.innerHTML = window.__wrapTables(marked.parse(o)), addCodeCopyButtonsFn(e)); }
        };
    }

    function addMessage(e, t, n, o, a, r, s) {
        hideEmptyPlaceholder();
        const i = document.createElement("div");
        if (i.className = `message message-${e}`, "assistant" === e && a) {
            const I = document.createElement("details"); I.className = "thinking-block";
            const k = document.createElement("summary"); k.textContent = "Raisonnement"; (() => {
                const _b = document.createElement("span"); _b.className = "thinking-bubble"; _b.style.left = "20%"; _b.style.animationDelay = "0s"; k.appendChild(_b);
                const _b2 = document.createElement("span"); _b2.className = "thinking-bubble"; _b2.style.left = "45%"; _b2.style.animationDelay = "0.8s"; k.appendChild(_b2);
                const _b3 = document.createElement("span"); _b3.className = "thinking-bubble"; _b3.style.left = "70%"; _b3.style.animationDelay = "1.6s"; k.appendChild(_b3);
            })(), I.appendChild(k);
            const b = document.createElement("div"); b.className = "thinking-content", b.innerHTML = window.__wrapTables(marked.parse(a)), I.appendChild(b), i.appendChild(I);
        }
        if (Array.isArray(t)) {
            const B = t.filter((e => "image" === e.type)); B.length > 0 && i.appendChild(buildImagesContainer(B));
            const _ = t.filter((e => "file" === e.type));
            if (_.length > 0) {
                const L = document.createElement("div"); L.className = "message-files";
                for (const w of _) {
                    const x = document.createElement("div"); x.className = "message-file-chip", x.title = w.name;
                    const P = document.createElement("span"); P.className = "message-file-chip-name", P.textContent = "📄 " + (w.name.length > 25 ? w.name.substring(0, 22) + "..." : w.name);
                    const O = () => { if (!w.data) return null; const e = new Blob([ Uint8Array.from(atob(w.data), (e => e.charCodeAt(0))) ], { type: w.mimeType || "application/octet-stream" }); return URL.createObjectURL(e); };
                    P.style.cursor = "pointer", P.addEventListener("click", (function() { this._prevUrl && (URL.revokeObjectURL(this._prevUrl), clearTimeout(this._prevTimer)); const e = O(); e && (this._prevUrl = e, this._prevTimer = setTimeout((() => { URL.revokeObjectURL(e), this._prevUrl = null; }), 6e4), openFileViewer(e, w.name)); }));
                    const D = document.createElement("button"); D.className = "message-file-chip-dl", D.title = "Télécharger", D.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>',
                    D.addEventListener("click", (e => { e.stopPropagation(); const t = O(); if (!t) return; const n = document.createElement("a"); n.href = t, n.download = w.name, n.click(), setTimeout((() => URL.revokeObjectURL(t)), 1e3); })),
                    x.appendChild(P), x.appendChild(D), L.appendChild(x);
                }
                i.appendChild(L);
            }
        }
        const l = document.createElement("div"); l.className = "message-text";
        const c = getTextFromContent(t);
        if ("assistant" === e && c) l.innerHTML = window.__wrapTables(marked.parse(c)), addCodeCopyButtonsFn(l); else if ("assistant" !== e || c) l.textContent = c; else if ("string" == typeof t) { const R = document.createElement("span"); R.className = "generation-placeholder", R.textContent = "Génération en cours...", l.appendChild(R); }
        i.appendChild(l), i._rawMarkdown = c;
        const d = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>', u = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>', p = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>', m = Array.isArray(t) ? t.filter((e => "image" === e.type)) : [], g = "string" == typeof t && t.trim() || Array.isArray(t) && t.some((e => "text" === e.type && e.text && e.text.trim())), h = "assistant" === e && m.length > 0 && !g, v = document.createElement("button");
        v.className = "message-copy-btn";
        const T = document.createElement("span");
        function y(e) { navigator.clipboard.writeText(e).then((() => { T.innerHTML = u, setTimeout((() => { T.innerHTML = d; }), 1500); })).catch((function() {})); }
        if (T.className = "copy-icon", v.appendChild(T), h) v.title = m.length > 1 ? "Enregistrer les images" : "Enregistrer l'image", T.innerHTML = p, v.addEventListener("click", (() => { m.forEach(((e, t) => { const n = e.dataUrl || `data:${e.mimeType};base64,${e.data}`, o = document.createElement("a"); o.href = n; const a = (e.mimeType || "image/png").split("/")[1] || "png"; o.download = m.length > 1 ? `cetas-image-${t + 1}.${a}` : `cetas-image.${a}`, o.click(); })), T.innerHTML = u, setTimeout((() => { T.innerHTML = p; }), 1500); }));
        else if (v.title = "Copier", T.innerHTML = d, "assistant" === e) {
            const H = document.createElement("div"); H.className = "copy-menu", H.innerHTML = '<div class="copy-menu-item" data-mode="text">Copier</div><div class="copy-menu-item" data-mode="md">Copier au format Markdown</div>', i.appendChild(H), v.addEventListener("click", (e => { e.target.closest(".copy-menu-item") || (closeAllMenus(H), H.classList.toggle("open"), v.classList.toggle("menu-open", H.classList.contains("open")), H.classList.contains("open") && function(e, t) { const n = t.getBoundingClientRect(); let o = n.left, a = n.top - e.offsetHeight - 4; o + e.offsetWidth > window.innerWidth - 4 && (o = n.right - e.offsetWidth), o < 4 && (o = 4), a < 4 && (a = n.bottom + 4), e.style.left = o + "px", e.style.top = a + "px"; }(H, v), e.stopPropagation()); })), H.addEventListener("click", (e => { const n = e.target.closest(".copy-menu-item"); if (!n) return; e.stopPropagation(), H.classList.remove("open"), v.classList.remove("menu-open"); if ("md" === n.dataset.mode) y(i._rawMarkdown || getTextFromContent(t)); else { const e = i.querySelector(".message-text"); y(e ? e.textContent : getTextFromContent(t)); } }));
        } else v.addEventListener("click", (() => { const e = i.querySelector(".message-text"); y(e ? e.textContent : getTextFromContent(t)); }));
        const f = document.createElement("div"); if (f.className = "message-btn-row", "assistant" === e) { const N = document.createElement("span"); N.className = "message-gen-time", o && (N.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>', N.dataset.tooltip = formatGenTooltip(o, r, s)), f.appendChild(N); }
        if (f.appendChild(v), "user" === e) {
            const q = document.createElement("button"); q.className = "message-save-prompt-btn", q.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>', q.title = "Enregistrer ce prompt", q.addEventListener("click", (() => { const e = i.querySelector(".message-text"), n = e ? e.textContent : getTextFromContent(t); n && openPrModal(null, n); })), f.appendChild(q);
            const F = document.createElement("button"); F.className = "message-edit-btn", F.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"/></svg>', F.title = "Modifier ce message", F.addEventListener("click", (() => { if (STATE.isStreaming) return; startEditMessage(i.closest(".message-wrapper"), i); })), f.appendChild(F);
        }
        const E = Array.isArray(t) && t.some((e => "image" === e.type));
        if ("assistant" === e && !E) {
            const U = document.createElement("button"); U.className = "message-tts-btn";
            const j = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/></svg>', $ = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="6" y="6" width="12" height="12" rx="1"/></svg>', G = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="spin"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>', W = document.createElement("span");
            W.className = "tts-icon", W.innerHTML = j, U.appendChild(W), U.title = "Lire à haute voix";
            const K = document.createElement("div"); K.className = "copy-menu", K.innerHTML = '<div class="copy-menu-item" data-mode="play">Lire à haute voix</div><div class="copy-menu-item" data-mode="save">Enregistrer au format audio</div>', i.appendChild(K);
            let V = false, z = null, Y = null, X = null;
            function S() { const e = i.querySelector(".message-text"); return e ? e.textContent : ""; }
            function A() { W.innerHTML = j, U.title = "Lire à haute voix", V = false; }
            const Q = () => "system-tts" === AUDIO_SETTINGS.ttsProvider;
            function C(e, t = false, n = null) {
                if (!AUDIO_SETTINGS.ttsProvider) return void showNoModelAlert("la synthèse vocale", "audio-tts-provider");
                if (z && X !== AUDIO_SETTINGS.ttsProvider && (Y && (URL.revokeObjectURL(Y), Y = null), z = null, X = null), z) return void e(z);
                const o = S(); if (!o) return; V = true, W.innerHTML = G, U.title = "Chargement...";
                const a = AUDIO_SETTINGS.ttsProvider;
                ttsSpeak(o, ((t, n, o) => { if (V = false, z = t, X = a, t) { let e = 30; const t = MODELS_DATA.tts.find((e => e.id === AUDIO_SETTINGS.ttsProvider)); if (t && t.prix) { const n = t.prix.match(/\$([\d.]+)\/1M/); n && (e = parseFloat(n[1])); } const o = n / 1e6 * e; STATE.totalAudioCost += o, addCostForModel("tts", 0, 0, o), updateTokenDisplay(), saveConversation(); } e(t, o); }), (e => { A(), console.error("TTS error:", e), customAlert("Erreur TTS : " + e.message, "error"); }), t, n);
            }
            U.addEventListener("click", (e => {
                if (STATE.currentTtsAudio) { if ("system" === STATE.currentTtsAudio) window.speechSynthesis.cancel(); else if ("function" == typeof STATE.currentTtsAudio) try { currentTtsAudio(); } catch (e) {} else STATE.currentTtsAudio.pause(), STATE.currentTtsAudio.currentTime = 0; return STATE.currentTtsAudio = null, document.querySelectorAll(".tts-icon").forEach((function(e) { e.innerHTML = j; })), void document.querySelectorAll(".message-tts-btn").forEach((function(e) { e.title = "Lire à haute voix"; })); }
                V || (AUDIO_SETTINGS.ttsProvider ? (!function() { if (Q()) { const e = S(); if (!e) return; return W.innerHTML = $, U.title = "Arrêter la lecture", STATE.currentTtsAudio = "system", void ttsSpeak(e, (() => { STATE.currentTtsAudio = null, A(); }), (e => { STATE.currentTtsAudio = null, A(), console.error("TTS error:", e), customAlert("Erreur TTS : " + e.message, "error"); })); } C(((e, t) => { if (t) return STATE.currentTtsAudio = null, void A(); Y && URL.revokeObjectURL(Y), Y = URL.createObjectURL(e); const n = new Audio(Y); STATE.currentTtsAudio = n, W.innerHTML = $, U.title = "Arrêter la lecture", n.onended = () => { STATE.currentTtsAudio = null, A(); }, n.onerror = () => { STATE.currentTtsAudio = null, A(), customAlert("Erreur de lecture audio", "error"); }, n.play().catch((e => { STATE.currentTtsAudio = null, A(), console.error("Audio play error:", e), customAlert("Erreur de lecture audio : " + e.message, "error"); })); }), false, (e => { STATE.currentTtsAudio = e, W.innerHTML = $, U.title = "Arrêter la lecture"; })); }(), e.stopPropagation()) : showNoModelAlert("la synthèse vocale", "audio-tts-provider"));
            })), f.appendChild(U);
        }
        n && n.length > 0 && appendCitations(i, n);
        const M = document.createElement("div"); return M.className = `message-wrapper message-wrapper-${e} animate-in`, M.appendChild(i), M.appendChild(f), chatContainer.appendChild(M), M.addEventListener("animationend", (() => M.classList.remove("animate-in")), { once: true }), scrollToBottom(true), "assistant" === e && _samAgentMakeClickable(i), i;
    }

    function _rebindStreamToVisibleDOM(e) {
        if (!e) return;
        const t = addMessage("assistant", "");
        if (t.classList.add("streaming"), e.assistantDiv = t, "text" === e.type) {
            if (e.sr = createStreamRenderer(t, (() => t.querySelector(".message-text")), e.accumulatedText), e.accumulatedText) { const n = t.querySelector(".message-text"); n && (n.innerHTML = window.__wrapTables(marked.parse(e.accumulatedText))); }
            if (e.accumulatedThinking) { const n = document.createElement("details"); n.className = "thinking-block", n.open = true; const o = document.createElement("summary"); o.textContent = "Raisonnement"; (() => { const _b = document.createElement("span"); _b.className = "thinking-bubble"; _b.style.left = "20%"; _b.style.animationDelay = "0s"; o.appendChild(_b); const _b2 = document.createElement("span"); _b2.className = "thinking-bubble"; _b2.style.left = "45%"; _b2.style.animationDelay = "0.8s"; o.appendChild(_b2); const _b3 = document.createElement("span"); _b3.className = "thinking-bubble"; _b3.style.left = "70%"; _b3.style.animationDelay = "1.6s"; o.appendChild(_b3); })(), n.appendChild(o); const a = document.createElement("div"); a.className = "thinking-content", a.innerHTML = window.__wrapTables(marked.parse(e.accumulatedThinking)), n.appendChild(a), t.insertBefore(n, t.firstChild), e.thinkSr = createStreamRenderer(t, (() => t.querySelector(".thinking-content")), e.accumulatedThinking); } else e.thinkSr = null;
        } else if ("image" === e.type) { const e = t.querySelector(".message-text"); e && (e.textContent = "Génération de l'image en cours…"); }
        scrollToBottom(true);
    }

    function handleApiError(e, t, n, o, a) {
        const r = STREAM_ERROR_CONTENT;
        STATE.isStreaming = false, STATE.currentAbortController = null, endStreaming(e), updateSendButton(), promptInput.focus();
        let s = false;
        const i = t => { if (s) return; s = true, applyErrorStyleFn(e); const n = STATE.conversationHistory[STATE.conversationHistory.length - 1]; n && "assistant" === n.role ? (n.content = r, n.error = true) : STATE.conversationHistory.push({ role: "assistant", content: r, error: true }), STATE.conversationId && saveConversation(), addRegenBtn(); const o = e.querySelector(".message-text"); o && (o.textContent = r), showErrorAlert(t, a.message); };
        const l = setTimeout((() => i(null)), 15e3);
        explainError(t, n, o, a.message).then((e => { clearTimeout(l), i(e); })).catch((() => { clearTimeout(l), i(null); }));
    }

    function applyErrorStyle(e) {
        e.classList.add("message-error");
        const t = e.parentElement?.querySelector(".message-btn-row");
        t && Array.from(t.children).forEach((e => e.style.display = "none"));
    }

    async function regenerateLastResponse() {
        if (STATE.isStreaming) return;
        const e = STATE.conversationHistory.length > 0 ? STATE.conversationHistory[STATE.conversationHistory.length - 1] : null;
        if (e && "assistant" === e.role && e.canvasBefore) { if (!await confirmAndRewindCanvas(e.canvasBefore)) return; }
        for (; STATE.conversationHistory.length > 0; ) { if ("user" === STATE.conversationHistory[STATE.conversationHistory.length - 1].role) break; STATE.conversationHistory.pop(); }
        for (removeRegenBtn(); chatContainer.lastElementChild; ) { const e = chatContainer.lastElementChild; if (e.classList.contains("message-wrapper-user")) break; if (!e.classList.contains("message-wrapper-assistant") && !e.classList.contains("model-switch-marker")) break; e.remove(); }
        saveConversation(), STATE.conversationLastActivity = (new Date).toISOString(), STATE.isStreaming = true, window.Ocean?.setPaused && window.Ocean.setPaused(true), STATE.currentAbortController = new AbortController, updateSendButton();
        const t = STATE.conversationId, n = STATE.conversationHistory;
        STATE._activeStreams.set(t, { conversationId: t, history: n, abortController: STATE.currentAbortController });
        const o = addMessage("assistant", ""); o.classList.add("streaming");
        const a = Date.now();
        if (STATE.currentImageModel && !getImageModelEditeur(STATE.currentImageModel) && (STATE.currentModel = STATE.currentImageModel, STATE.currentImageModel = null), STATE.currentImageModel) {
            const e = buildImagePrompt(getTextFromContent(STATE.conversationHistory[STATE.conversationHistory.length - 1].content), STATE.conversationHistory), r = collectReferenceImages(STATE.conversationHistory), s = document.getElementById("image-format-select").value, i = getImageParams(), l = STATE.currentImageModel;
            generateImage(STATE.currentImageModel, e, (e => { if (!STATE._activeStreams.has(t)) return; STATE._activeStreams.delete(t); const r = isStreamActive(t, n); if (!(e.images && 0 !== e.images.length || e.text)) return void (t === STATE.conversationId && (o && o.parentNode && o.parentNode.removeChild(o), STATE.isStreaming = false, STATE.currentAbortController = null, updateSendButton(), addRegenBtn())); if (r) { endStreaming(o), e.images.length > 0 && o.insertBefore(buildImagesContainer(e.images, { altText: "Image générée" }), o.firstChild); const t = o.querySelector(".message-text"); t && e.text ? (t.innerHTML = window.__wrapTables(marked.parse(e.text)), addCodeCopyButtonsFn(t)) : t && t.remove(); } const c = imageResultToContent(e), d = (Date.now() - a) / 1e3, u = e.usage?.output_tokens || 0; n.push({ role: "assistant", content: 1 === c.length && "text" === c[0].type ? c[0].text : c, generationTime: d, outputTokens: u, model: l }); const p = getImageTarif(l), m = _resolveImageCost(p, e.usage, e.imageCount, s, i); r ? (attachCanvasBeforeToLastAssistant(), setGenTimeOnLastAssistant(d, u, l), e.usage && (STATE.totalInputTokens += e.usage.input_tokens || 0, STATE.totalOutputTokens += e.usage.output_tokens || 0), STATE.totalCost += m.tokenCost, STATE.totalImageCost += m.imageCost, addCostForModel(l, e.usage?.input_tokens || 0, e.usage?.output_tokens || 0, m.total), updateTokenDisplay(), saveConversation(), scrollToBottom(true), addRegenBtn(), STATE.isStreaming = false, STATE.currentAbortController = null, updateSendButton(), promptInput.focus()) : _saveConvById(t, n, { tokensIn: e.usage?.input_tokens || 0, tokensOut: e.usage?.output_tokens || 0, cost: m.tokenCost, imageCost: m.imageCost, modelKey: l }); }), (e => { if (STATE._activeStreams.delete(t), t !== STATE.conversationId) return n.push({ role: "assistant", content: STREAM_ERROR_CONTENT, error: true }), void _saveConvById(t, n, { modelKey: l }); const a = n[n.length - 1]; handleApiError(o, getTextFromContent(a?.content), [], l || "", e); }), r, STATE.currentAbortController.signal, document.getElementById("image-format-select").value, getImageParams());
        } else {
            let e = "", r = "", s = "";
            const i = STATE.currentSystemPrompt ? STATE.currentSystemPrompt.contenu : null, l = STATE.currentModel || STATE.currentSearchModel, c = createStreamRenderer(o, (() => o.querySelector(".message-text")));
            let d = null; const u = buildCanvasParserIfActive(); let p = effectiveSystemPrompt(i); let _webCtx2 = null;
            if (STATE.webSearchEnabled && typeof hasBuiltInWebSearch === "function" && !hasBuiltInWebSearch(l) && typeof window.buildWebSearchContext === "function") { const _lastUser = [...n].reverse().find((m => "user" === m.role)); const _q = _lastUser ? getTextFromContent(_lastUser.content) : ""; if (_q) { try { _webCtx2 = await window.buildWebSearchContext(_q); if (_webCtx2 && _webCtx2.contextText) { p = (p ? p + "\n\n" : "") + _webCtx2.contextText; } } catch (_e) { console.warn("[web-search] échec:", _e); } } }
            _streamModelDispatch(l, _limitHistoryImages(STATE.conversationHistory, getMaxHistoryImages()), (a => { r += a; let s = a; u && (s = u.feed(a).visible); const i = isStreamActive(t, n); !e && s && i && (d && d.flush(), collapseThinkBlock(o.querySelector(".thinking-block"))); s && (e += s, i && c.add(s)); }), ((r, i) => { if (!STATE._activeStreams.has(t)) return; STATE._activeStreams.delete(t); const p = isStreamActive(t, n); if (u) { const t = u.flush().visible; t && (e += t, p && c.add(t)); } if (!r && !e && !s) return void (t === STATE.conversationId && (o && o.parentNode && o.parentNode.removeChild(o), STATE.isStreaming = false, STATE.currentAbortController = null, updateSendButton(), addRegenBtn())); if (p) { if (c.flush(), d && d.flush(), endStreaming(o), !s.trim()) { const e = o.querySelector(".thinking-block"); e && e.remove(); } const _finalCitations2 = i && i.length > 0 ? i : _webCtx2 && _webCtx2.citations && _webCtx2.citations.length > 0 ? _webCtx2.citations : null; _finalCitations2 && appendCitations(o, _finalCitations2); } const m = (Date.now() - a) / 1e3, g = r?.output_tokens || 0; n.push({ role: "assistant", content: e, citations: i || void 0, generationTime: m, thinking: s || void 0, outputTokens: g, model: l }); let h = 0; if (r) { const e = getTarif(l) || getSearchTarif(l); h = _resolveTextCost(e, r), h += calcWebSearchCost(l, i); } p ? (attachCanvasBeforeToLastAssistant(), o._rawMarkdown = e, setGenTimeOnLastAssistant(m, g, l), r && (STATE.totalInputTokens += r.input_tokens || 0, STATE.totalOutputTokens += r.output_tokens || 0, STATE.totalCost += h, addCostForModel(l, r.input_tokens || 0, r.output_tokens || 0, h)), updateTokenDisplay(), saveConversation(), addRegenBtn(), STATE.isStreaming = false, STATE.currentAbortController = null, updateSendButton(), promptInput.focus()) : _saveConvById(t, n, { tokensIn: r?.input_tokens || 0, tokensOut: r?.output_tokens || 0, cost: h, modelKey: l }); }), (e => { if (STATE._activeStreams.delete(t), t !== STATE.conversationId) return n.push({ role: "assistant", content: STREAM_ERROR_CONTENT, error: true }), void _saveConvById(t, n, { modelKey: l }); const a = n[n.length - 1]; handleApiError(o, getTextFromContent(a?.content), [], l || "", e); }), p, window.FORCE_WEB_SEARCH = STATE.webSearchEnabled && !hasBuiltInWebSearch(l), STATE.webSearchEnabled && !hasBuiltInWebSearch(l), (e => { s += e, t === STATE.conversationId && (!function() { if (!o.querySelector(".thinking-block")) { const e = document.createElement("details"); e.className = "thinking-block", e.open = true; const t = document.createElement("summary"); t.textContent = "Raisonnement"; (() => { const _b = document.createElement("span"); _b.className = "thinking-bubble"; _b.style.left = "20%"; _b.style.animationDelay = "0s"; t.appendChild(_b); const _b2 = document.createElement("span"); _b2.className = "thinking-bubble"; _b2.style.left = "45%"; _b2.style.animationDelay = "0.8s"; t.appendChild(_b2); const _b3 = document.createElement("span"); _b3.className = "thinking-bubble"; _b3.style.left = "70%"; _b3.style.animationDelay = "1.6s"; t.appendChild(_b3); })(), e.appendChild(t); const n = document.createElement("div"); n.className = "thinking-content", e.appendChild(n), o.insertBefore(e, o.firstChild); } d || (d = createStreamRenderer(o, (() => o.querySelector(".thinking-content")))); }(), d.add(e)); }), STATE.currentAbortController.signal, getModelParams(), null);
        }
    }

    function startEditMessage(e, t) {
        const n = Array.from(chatContainer.querySelectorAll(".message-wrapper"));
        let o = -1, a = 0;
        for (let t = 0; t < STATE.conversationHistory.length; t++) if ("model-switch" !== STATE.conversationHistory[t].type) { if (n[a] === e) { o = t; break; } a++; }
        if (o < 0) return;
        const r = t.querySelector(".message-text"); if (!r) return;
        const s = getTextFromContent(STATE.conversationHistory[o].content), i = e.querySelector(".message-btn-row"); i && (i.style.display = "none");
        const l = t.offsetWidth; t.style.minWidth = l + "px";
        const c = document.createElement("textarea"); c.className = "message-edit-textarea", c.value = s, r.innerHTML = "", r.appendChild(c), requestAnimationFrame((() => { c.style.height = "auto", c.style.height = c.scrollHeight + "px"; })), c.addEventListener("input", (() => { c.style.height = "auto", c.style.height = c.scrollHeight + "px"; })), c.focus();
        const d = document.createElement("div"); d.className = "message-edit-actions";
        const u = document.createElement("button"); u.className = "message-edit-confirm", u.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg> Envoyer';
        const p = document.createElement("button");
        function m() { r.textContent = s, d.remove(), t.style.minWidth = "", i && (i.style.display = ""); }
        p.className = "message-edit-cancel", p.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg> Annuler', d.appendChild(u), d.appendChild(p), e.insertBefore(d, i), p.addEventListener("click", m), u.addEventListener("click", (async () => {
            const n = c.value.trim(); if (!n) return void m();
            let a = null; for (let e = o + 1; e < STATE.conversationHistory.length; e++) { const t = STATE.conversationHistory[e]; if (t && "assistant" === t.role && t.canvasBefore) { a = t.canvasBefore; break; } }
            if (a) { if (!await confirmAndRewindCanvas(a)) return; }
            r.textContent = n, d.remove(), t.style.minWidth = "", i && (i.style.display = ""), STATE.conversationHistory[o].content = n, STATE.conversationHistory.splice(o + 1);
            const s = Array.from(chatContainer.children), l = s.indexOf(e); for (let e = s.length - 1; e > l; e--) s[e].remove();
            updateTokenDisplay(), saveConversation(), _userHasScrolledUp = false, STATE.isStreaming = true, window.Ocean?.setPaused && window.Ocean.setPaused(true), STATE.currentAbortController = new AbortController, updateSendButton();
            const u = STATE.conversationId, p = STATE.conversationHistory;
            STATE._activeStreams.set(u, { conversationId: u, history: p, abortController: STATE.currentAbortController });
            const g = addMessage("assistant", ""); g.classList.add("streaming");
            const h = Date.now(); var v = STATE.currentModel || STATE.currentSearchModel, T = null, y = null, _routerIntent = null, _routerScore = null;
            if (v && 0 === v.indexOf("samagent-") && "function" == typeof routeModel) { var _samAbc = STATE.currentAbortController; _showRouterThinking(g); var f; try { f = await routeModel(n, v, _samAbc && _samAbc.signal); } catch (_samErr) { console.error("Erreur routage SamAgent:", _samErr), f = null; } _hideRouterThinking(g); if (_samAbc && _samAbc.signal && _samAbc.signal.aborted) { g && g.remove && g.remove(); return; } if (!f) { if (STATE.currentAbortController) { try { STATE.currentAbortController.abort(); } catch (_samE2) {} } STATE.isStreaming = false, STATE.currentAbortController = null, STATE.conversationId && STATE._activeStreams && STATE._activeStreams.delete(STATE.conversationId), window.Ocean?.setPaused && window.Ocean.setPaused(false), typeof updateSendButton === "function" && updateSendButton(), g && g.remove && g.remove(); if (typeof customAlert === "function") customAlert("Le routeur SamAgent est momentanément indisponible. Réessayez ou changez de modèle.", "error"); return; } T = f.label, v = f.modelId, STATE._routerForceThinking = f.thinking && !!document.getElementById("plus-reflection-toggle")?.checked, y = f._fallback || null, _routerIntent = f.intent, _routerScore = f.score, window._samLastRoute = { tier: f.tier, routedBy: f.routedBy, label: f.label, intent: f.intent, score: f.score }; } else window._samLastRoute && (window._samLastRoute = null);
            const E = spTextarea.value.trim() || null;
            if (STATE.currentImageModel) {
                const e = collectReferenceImages(STATE.conversationHistory), t = document.getElementById("image-format-select").value, o = getImageParams(), a = STATE.currentImageModel;
                return void generateImage(STATE.currentImageModel, n, (e => { if (!STATE._activeStreams.has(u)) return; STATE._activeStreams.delete(u); const n = isStreamActive(u, p); if (!(e.images && 0 !== e.images.length || e.text)) return void (u === STATE.conversationId && (g && g.parentNode && g.parentNode.removeChild(g), STATE.isStreaming = false, STATE.currentAbortController = null, updateSendButton(), addRegenBtn())); if (n) { endStreaming(g), e.images.length > 0 && g.insertBefore(buildImagesContainer(e.images, { altText: "Image générée" }), g.firstChild); const t = g.querySelector(".message-text"); t && e.text ? (t.innerHTML = window.__wrapTables(marked.parse(e.text)), addCodeCopyButtonsFn(t)) : t && t.remove(); } const r = imageResultToContent(e), s = (Date.now() - h) / 1e3, i = e.usage?.output_tokens || 0; p.push({ role: "assistant", content: 1 === r.length && "text" === r[0].type ? r[0].text : r, generationTime: s, outputTokens: i, model: a }); const l = getImageTarif(a), c = _resolveImageCost(l, e.usage, e.imageCount, t, o); n ? (attachCanvasBeforeToLastAssistant(), setGenTimeOnLastAssistant(s, i, a), e.usage && (STATE.totalInputTokens += e.usage.input_tokens || 0, STATE.totalOutputTokens += e.usage.output_tokens || 0), STATE.totalCost += c.tokenCost, STATE.totalImageCost += c.imageCost, addCostForModel(a, e.usage?.input_tokens || 0, e.usage?.output_tokens || 0, c.total), updateTokenDisplay(), saveConversation(), addRegenBtn(), STATE.isStreaming = false, STATE.currentAbortController = null, updateSendButton(), promptInput.focus()) : _saveConvById(u, p, { tokensIn: e.usage?.input_tokens || 0, tokensOut: e.usage?.output_tokens || 0, cost: c.tokenCost, imageCost: c.imageCost, modelKey: a }); }), (e => { if (STATE._activeStreams.delete(u), u !== STATE.conversationId) return p.push({ role: "assistant", content: STREAM_ERROR_CONTENT, error: true }), void _saveConvById(u, p, { modelKey: a }); handleApiError(g, n, [], a || "", e); }), e, STATE.currentAbortController.signal, t, o);
            }
            let S = "", A = "", C = ""; const M = createStreamRenderer(g, (() => g.querySelector(".message-text"))); let I = null; const k = buildCanvasParserIfActive(); let b = effectiveSystemPrompt(E); var B; let _webCtx3 = null;
            if (STATE.webSearchEnabled && typeof hasBuiltInWebSearch === "function" && !hasBuiltInWebSearch(v) && typeof window.buildWebSearchContext === "function" && n) { try { _webCtx3 = await window.buildWebSearchContext(n); if (_webCtx3 && _webCtx3.contextText) { b = (b ? b + "\n\n" : "") + _webCtx3.contextText; } } catch (_e) { console.warn("[web-search] échec:", _e); } }
            _streamModelDispatch(v, _limitHistoryImages(STATE.conversationHistory, getMaxHistoryImages()), (e => { A += e; let t = e; k && (t = k.feed(e).visible); const n = isStreamActive(u, p); !S && t && n && (I && I.flush(), collapseThinkBlock(g.querySelector(".thinking-block"))); t && (S += t, n && M.add(t)); }), ((e, t) => { if (!STATE._activeStreams.has(u)) return; STATE._activeStreams.delete(u); const n = isStreamActive(u, p); if (k) { const e = k.flush().visible; e && (S += e, n && M.add(e)); } if (!e && !S && !C) return void (u === STATE.conversationId && (g && g.parentNode && g.parentNode.removeChild(g), STATE.isStreaming = false, STATE.currentAbortController = null, updateSendButton(), addRegenBtn())); if (n) { if (M.flush(), I && I.flush(), endStreaming(g), !C.trim()) { const e = g.querySelector(".thinking-block"); e && e.remove(); } const _finalCitations3 = t && t.length > 0 ? t : _webCtx3 && _webCtx3.citations && _webCtx3.citations.length > 0 ? _webCtx3.citations : null; _finalCitations3 && appendCitations(g, _finalCitations3); } const o = (Date.now() - h) / 1e3, a = e?.output_tokens || 0; p.push({ role: "assistant", content: S, citations: t || void 0, generationTime: o, thinking: C || void 0, outputTokens: a, model: v }); window._samLastRoute && (recordRouteResult(window._samLastRoute.routedBy, v === window._samLastRoute.routedBy, Math.round(1e3 * o), { tier: window._samLastRoute.tier, intent: window._samLastRoute.intent, score: window._samLastRoute.score, label: window._samLastRoute.label }), v !== window._samLastRoute.routedBy && recordRouteResult(v, true, Math.round(1e3 * o), { tier: window._samLastRoute.tier, intent: window._samLastRoute.intent, score: window._samLastRoute.score, label: window._samLastRoute.label })); window._samLastRoute && (Object.assign(p[p.length - 1], window._samLastRoute), window._samLastRoute = null); let r = 0; if (e) { const n = getTarif(v) || getSearchTarif(v); r = _resolveTextCost(n, e), r += calcWebSearchCost(v, t); } if (n) { if (attachCanvasBeforeToLastAssistant(), setGenTimeOnLastAssistant(o, a, v), e && (STATE.totalInputTokens += e.input_tokens || 0, STATE.totalOutputTokens += e.output_tokens || 0, STATE.totalCost += r, addCostForModel(v, e.input_tokens || 0, e.output_tokens || 0, r)), updateTokenDisplay(), saveConversation(), addRegenBtn(), T && g) { var s = document.createElement("div"); s.className = "model-fusion-indicator", s.textContent = T, g.appendChild(s); } STATE.isStreaming = false, STATE.currentAbortController = null, updateSendButton(), promptInput.focus(); } else _saveConvById(u, p, { tokensIn: e?.input_tokens || 0, tokensOut: e?.output_tokens || 0, cost: r, modelKey: v }); }), (e => { STATE._activeStreams.delete(u), u === STATE.conversationId && handleApiError(g, n, [], v || "", e); }), b, STATE.webSearchEnabled && !hasBuiltInWebSearch(v), (e => { C += e, u === STATE.conversationId && (!function() { if (!g.querySelector(".thinking-block")) { const e = document.createElement("details"); e.className = "thinking-block", e.open = true; const t = document.createElement("summary"); t.textContent = "Raisonnement"; (() => { const _b = document.createElement("span"); _b.className = "thinking-bubble"; _b.style.left = "20%"; _b.style.animationDelay = "0s"; t.appendChild(_b); const _b2 = document.createElement("span"); _b2.className = "thinking-bubble"; _b2.style.left = "45%"; _b2.style.animationDelay = "0.8s"; t.appendChild(_b2); const _b3 = document.createElement("span"); _b3.className = "thinking-bubble"; _b3.style.left = "70%"; _b3.style.animationDelay = "1.6s"; t.appendChild(_b3); })(), e.appendChild(t); const n = document.createElement("div"); n.className = "thinking-content", e.appendChild(n), g.insertBefore(e, g.firstChild); } I || (I = createStreamRenderer(g, (() => g.querySelector(".thinking-content")))); }(), I.add(e)); }), STATE.currentAbortController.signal, (B = getModelParams(), STATE._routerForceThinking && ((B = B || {}).reasoning_effort = B.reasoning_effort || "medium", STATE._routerForceThinking = false), _routerIntent === "chat" && _routerScore < 15 && B && B.reasoning_effort && (B.reasoning_effort = "low"), B), y);
        }));
    }

    async function sendMessage() {
        const e = promptInput.value.trim();
        if (!e && 0 === STATE.pendingImages.length && 0 === STATE.pendingFiles.length || STATE.isStreaming) return;
        if (STATE.pendingLoadingFiles.length > 0) return void customAlert(`Patientez quelques instants : ${STATE.pendingLoadingFiles.map((e => e.name)).join(", ")} ${STATE.pendingLoadingFiles.length > 1 ? "sont encore" : "est encore"} en cours de chargement.`, "wait");
        if (_userHasScrolledUp = false, removeRegenBtn(), window.innerWidth < 768) { promptInput.blur(); let e = false; const t = () => { e || (e = true, _userHasScrolledUp = false, scrollToBottom(true)); }; if (setTimeout(t, 200), setTimeout(t, 500), window.visualViewport) { let e; const n = () => { clearTimeout(e), e = setTimeout(t, 150); }; window.visualViewport.addEventListener("resize", n, { once: false }), setTimeout((() => window.visualViewport.removeEventListener("resize", n)), 1500); } }
        if (!STATE.currentModel && !STATE.currentImageModel && !STATE.currentSearchModel) return void showModelAlert();
        if (!STATE.conversationId) { let t = e; t || (t = STATE.pendingImages.length > 0 ? "(image)" : STATE.pendingFiles.length > 0 ? 1 === STATE.pendingFiles.length ? `(${STATE.pendingFiles[0].name})` : "(fichiers joints)" : "(message)"), STATE.firstPrompt = t, STATE.conversationStartTime = (new Date).toISOString(), STATE.conversationId = deps.generateConversationId(STATE.firstPrompt); const n = STATE.conversationId.replace(/[<>:"/\\|?*]/g, "_") + ".json"; localStorage.setItem("cetas-last-conv", n); }
        if (STATE.conversationLastActivity = (new Date).toISOString(), STATE.conversationStarted || (STATE.conversationStarted = true), spSelect.value) { const e = spSelect.selectedOptions[0]; STATE.currentSystemPrompt = { nom: e.textContent, contenu: spTextarea.value || e.dataset.contenu }; } else spTextarea.value.trim() ? STATE.currentSystemPrompt = { nom: "Personnalisé", contenu: spTextarea.value } : STATE.currentSystemPrompt = null;
        let t; if (STATE.pendingImages.length > 0 || STATE.pendingFiles.length > 0) { t = [], e && t.push({ type: "text", text: e }); for (const e of STATE.pendingImages) { const n = e.dataUrl.split(",")[1]; t.push({ type: "image", data: n, mimeType: e.mimeType, dataUrl: e.dataUrl }); } for (const e of STATE.pendingFiles) t.push({ type: "file", name: e.name, mimeType: e.mimeType, data: e.data, textContent: e.textContent }); STATE.pendingImages = [], STATE.pendingFiles = [], attachPreview.innerHTML = ""; } else t = e;
        addMessage("user", t), STATE.conversationHistory.push({ role: "user", content: t }), saveConversation(), promptInput.value = "", promptInput.style.height = "auto", STATE.originalPromptBeforeEnhance = null, STATE.isStreaming = true, window.Ocean?.setPaused && window.Ocean.setPaused(true), STATE.currentAbortController = new AbortController, updateSendButton();
        const n = STATE.conversationId, o = STATE.conversationHistory, a = { conversationId: n, history: o, abortController: STATE.currentAbortController };
        STATE._activeStreams.set(n, a);
        const r = addMessage("assistant", ""); r.classList.add("streaming"); _showThinkingIndicator(r);
        const s = Date.now(); STATE.currentImageModel && !getImageModelEditeur(STATE.currentImageModel) && (STATE.currentModel = STATE.currentImageModel, STATE.currentImageModel = null);
        var i, l = STATE.currentModel || STATE.currentSearchModel, c = null, d = null, _routerIntent = null, _routerScore = null;
        if (l && 0 === l.indexOf("samagent-") && "function" == typeof routeModel) { var _samAbc = STATE.currentAbortController; _showRouterThinking(r); var u; try { u = await routeModel(e, l, _samAbc && _samAbc.signal); } catch (_samErr) { console.error("Erreur routage SamAgent:", _samErr), u = null; } _hideRouterThinking(r); if (_samAbc && _samAbc.signal && _samAbc.signal.aborted) { r && r.remove && r.remove(); return; } if (!u) { if (STATE.currentAbortController) { try { STATE.currentAbortController.abort(); } catch (_samE2) {} } STATE.isStreaming = false, STATE.currentAbortController = null, STATE.conversationId && STATE._activeStreams && STATE._activeStreams.delete(STATE.conversationId), window.Ocean?.setPaused && window.Ocean.setPaused(false), typeof updateSendButton === "function" && updateSendButton(), r && r.remove && r.remove(); if (typeof customAlert === "function") customAlert("Le routeur SamAgent est momentanément indisponible. Réessayez ou changez de modèle.", "error"); return; } c = u.label, l = u.modelId, STATE._routerForceThinking = u.thinking && !!document.getElementById("plus-reflection-toggle")?.checked, d = u._fallback || null, _routerIntent = u.intent, _routerScore = u.score, window._samLastRoute = { tier: u.tier, routedBy: u.routedBy, label: u.label, intent: u.intent, score: u.score }; } else window._samLastRoute && (window._samLastRoute = null);
        if (STATE.currentImageModel) {
            const i = buildImagePrompt(e, STATE.conversationHistory), l = collectReferenceImages(STATE.conversationHistory), c = document.getElementById("image-format-select")?.value || "auto", d = getImageParams(), u = STATE.currentImageModel; a.type = "image", a.model = u, a.assistantDiv = r;
            generateImage(STATE.currentImageModel, i, (e => { if (!STATE._activeStreams.get(n)) return; STATE._activeStreams.delete(n); const t = isStreamActive(n, o); if (!(e.images && 0 !== e.images.length || e.text)) return void (n === STATE.conversationId && (r && r.parentNode && r.parentNode.removeChild(r), STATE.isStreaming = false, STATE.currentAbortController = null, updateSendButton(), addRegenBtn())); if (t) { endStreaming(r), e.images.length > 0 && r.insertBefore(buildImagesContainer(e.images, { altText: "Image générée" }), r.firstChild); const t = r.querySelector(".message-text"); t && e.text ? (t.innerHTML = window.__wrapTables(marked.parse(e.text)), addCodeCopyButtonsFn(t)) : t && t.remove(); } const a = imageResultToContent(e), i = (Date.now() - s) / 1e3, l = e.usage?.output_tokens || 0; o.push({ role: "assistant", content: 1 === a.length && "text" === a[0].type ? a[0].text : a, generationTime: i, outputTokens: l, model: u }); const p = getImageTarif(u), m = _resolveImageCost(p, e.usage, e.imageCount, c, d); t ? (attachCanvasBeforeToLastAssistant(), setGenTimeOnLastAssistant(i, l, u), e.usage && (STATE.totalInputTokens += e.usage.input_tokens || 0, STATE.totalOutputTokens += e.usage.output_tokens || 0), STATE.totalCost += m.tokenCost, STATE.totalImageCost += m.imageCost, addCostForModel(u, e.usage?.input_tokens || 0, e.usage?.output_tokens || 0, m.total), updateTokenDisplay(), saveConversation(), scrollToBottom(true), addRegenBtn(), maybeGenerateTitle(), STATE.isStreaming = false, STATE.currentAbortController = null, updateSendButton(), promptInput.focus()) : _saveConvById(n, o, { tokensIn: e.usage?.input_tokens || 0, tokensOut: e.usage?.output_tokens || 0, cost: m.tokenCost, imageCost: m.imageCost, modelKey: u }); }), (e => { if (STATE._activeStreams.delete(n), n !== STATE.conversationId) return o.push({ role: "assistant", content: STREAM_ERROR_CONTENT, error: true }), void _saveConvById(n, o, { modelKey: u }); const a = "string" == typeof t ? t : Array.isArray(t) ? t.filter((e => "text" === e.type)).map((e => e.text)).join(" ") : "", s = Array.isArray(t) ? t.filter((e => "file" === e.type || "image" === e.type)).map((e => e.name || e.mimeType || "image")) : []; handleApiError(r, a, s, u || "", e); }), l, STATE.currentAbortController.signal, c, d);
        } else {
            const e = STATE.currentSystemPrompt ? STATE.currentSystemPrompt.contenu : null; a.type = "text", a.model = l, a.assistantDiv = r, a.canvasParser = buildCanvasParserIfActive(), a.sr = createStreamRenderer(r, (() => r.querySelector(".message-text"))), a.thinkSr = null, a.accumulatedText = "", a.accumulatedThinking = "", a.accumulatedRaw = "", a.genStartTime = s;
            let u = effectiveSystemPrompt(e); let _webCtx = null;
            if (STATE.webSearchEnabled && typeof hasBuiltInWebSearch === "function" && !hasBuiltInWebSearch(l) && typeof window.buildWebSearchContext === "function") { try { _webCtx = await window.buildWebSearchContext("string" == typeof t ? t : Array.isArray(t) ? t.filter((e => "text" === e.type)).map((e => e.text)).join(" ") : ""); if (_webCtx && _webCtx.contextText) { u = (u ? u + "\n\n" : "") + _webCtx.contextText; } } catch (_e) { console.warn("[web-search] échec:", _e); } }
            _streamModelDispatch(l, _limitHistoryImages(STATE.conversationHistory, getMaxHistoryImages()), (e => { a.accumulatedRaw += e; let t = e; a.canvasParser && (t = a.canvasParser.feed(e).visible); const r = n === STATE.conversationId && a.assistantDiv && a.assistantDiv.isConnected; if (!a.accumulatedText && t && r && (a.thinkSr && a.thinkSr.flush(), collapseThinkBlock(a.assistantDiv.querySelector(".thinking-block"))), t && (a.accumulatedText += t, r && a.sr && a.sr.add(t), !a.titleEarlyDone && 1 === o.length && a.accumulatedText.length >= 40)) { a.titleEarlyDone = true; const e = [o[0], { role: "assistant", content: a.accumulatedText }]; try { maybeGenerateTitle(n, e, l); } catch {} } }), ((e, t) => { if (!STATE._activeStreams.get(n)) return; STATE._activeStreams.delete(n); const r = n === STATE.conversationId && a.assistantDiv && a.assistantDiv.isConnected, i = r && o === STATE.conversationHistory; if (a.canvasParser) { const e = a.canvasParser.flush().visible; e && (a.accumulatedText += e, r && a.sr && a.sr.add(e)); } const d = a.accumulatedText, u = a.accumulatedThinking, p = a.assistantDiv; if (!e && !d && !u) return void (r && (p && p.parentNode && p.parentNode.removeChild(p), STATE.isStreaming = false, STATE.currentAbortController = null, updateSendButton(), addRegenBtn())); if (r) { if (a.sr && a.sr.flush(), a.thinkSr && a.thinkSr.flush(), endStreaming(p), !u.trim()) { const e = p.querySelector(".thinking-block"); e && e.remove(); } const _finalCitations = t && t.length > 0 ? t : _webCtx && _webCtx.citations && _webCtx.citations.length > 0 ? _webCtx.citations : null; _finalCitations && appendCitations(p, _finalCitations); } const m = (Date.now() - s) / 1e3, g = e?.output_tokens || 0; o.push({ role: "assistant", content: d, citations: t || void 0, generationTime: m, thinking: u || void 0, outputTokens: g, model: l }); window._samLastRoute && (recordRouteResult(window._samLastRoute.routedBy, l === window._samLastRoute.routedBy, Math.round(1e3 * m), { tier: window._samLastRoute.tier, intent: window._samLastRoute.intent, score: window._samLastRoute.score, label: window._samLastRoute.label }), l !== window._samLastRoute.routedBy && recordRouteResult(l, true, Math.round(1e3 * m), { tier: window._samLastRoute.tier, intent: window._samLastRoute.intent, score: window._samLastRoute.score, label: window._samLastRoute.label })); window._samLastRoute && (Object.assign(o[o.length - 1], window._samLastRoute), window._samLastRoute = null); let h = 0; if (e) { const n = getTarif(l) || getSearchTarif(l); h = _resolveTextCost(n, e), h += calcWebSearchCost(l, t); } if (i) { if (attachCanvasBeforeToLastAssistant(), p && (p._rawMarkdown = d), setGenTimeOnLastAssistant(m, g, l), e && (STATE.totalInputTokens += e.input_tokens || 0, STATE.totalOutputTokens += e.output_tokens || 0, STATE.totalCost += h, addCostForModel(l, e.input_tokens || 0, e.output_tokens || 0, h)), updateTokenDisplay(), saveConversation(), addRegenBtn(), c && a.assistantDiv) { var v = document.createElement("div"); v.className = "model-fusion-indicator", v.textContent = c, a.assistantDiv.appendChild(v); } a.titleEarlyDone || maybeGenerateTitle(), STATE.isStreaming = false, STATE.currentAbortController = null, updateSendButton(), promptInput.focus(); } else _saveConvById(n, o, { tokensIn: e?.input_tokens || 0, tokensOut: e?.output_tokens || 0, cost: h, modelKey: l }); }), (e => { if (STATE._activeStreams.delete(n), n !== STATE.conversationId) return o.push({ role: "assistant", content: STREAM_ERROR_CONTENT, error: true }), void _saveConvById(n, o, { modelKey: l }); const r = "string" == typeof t ? t : Array.isArray(t) ? t.filter((e => "text" === e.type)).map((e => e.text)).join(" ") : "", s = Array.isArray(t) ? t.filter((e => "file" === e.type || "image" === e.type)).map((e => e.name || e.mimeType || "image")) : []; handleApiError(a.assistantDiv, r, s, l || "", e); }), u, STATE.webSearchEnabled && !hasBuiltInWebSearch(l), (e => { a.accumulatedThinking += e, n === STATE.conversationId && a.assistantDiv && a.assistantDiv.isConnected && (!function() { const e = a.assistantDiv; if (!e) return; if (!e.querySelector(".thinking-block")) { const t = document.createElement("details"); t.className = "thinking-block", t.open = true; const n = document.createElement("summary"); n.textContent = "Raisonnement"; (() => { const _b = document.createElement("span"); _b.className = "thinking-bubble"; _b.style.left = "20%"; _b.style.animationDelay = "0s"; n.appendChild(_b); const _b2 = document.createElement("span"); _b2.className = "thinking-bubble"; _b2.style.left = "45%"; _b2.style.animationDelay = "0.8s"; n.appendChild(_b2); const _b3 = document.createElement("span"); _b3.className = "thinking-bubble"; _b3.style.left = "70%"; _b3.style.animationDelay = "1.6s"; n.appendChild(_b3); })(), t.appendChild(n); const o = document.createElement("div"); o.className = "thinking-content", t.appendChild(o), e.insertBefore(t, e.firstChild); } a.thinkSr || (a.thinkSr = createStreamRenderer(a.assistantDiv, (() => a.assistantDiv.querySelector(".thinking-content")))); }(), a.thinkSr && a.thinkSr.add(e)); }), STATE.currentAbortController.signal, (i = getModelParams(), STATE._routerForceThinking && ((i = i || {}).reasoning_effort = i.reasoning_effort || "medium", STATE._routerForceThinking = false), _routerIntent === "chat" && _routerScore < 15 && i && i.reasoning_effort && (i.reasoning_effort = "low"), i), d);
        }
    }

    return {
        updateSendButton,
        addMessage,
        createStreamRenderer,
        endStreaming,
        startEditMessage,
        sendMessage,
        regenerateLastResponse,
        addRegenBtn,
        removeRegenBtn,
        scrollToBottom,
        _rebindStreamToVisibleDOM,
        handleApiError,
        applyErrorStyle,
        hideEmptyPlaceholder,
        showEmptyPlaceholder,
        closeAllMenus,
        collapseThinkBlock,
        _getUserHasScrolledUp,
        formatGenTime,
        formatGenTooltip,
        setGenTimeOnLastAssistant,
        appendCitations,
        _samAgentMakeClickable,
        _wrapNewChars,
        _showThinkingIndicator,
        _removeThinkingIndicator,
        addCodeCopyButtons: addCodeCopyButtonsFn,
    };
}

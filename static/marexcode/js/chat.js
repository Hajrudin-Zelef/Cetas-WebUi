export const MAREX_TOOLS = (typeof MAREXCODE_TOOLS !== 'undefined') ? MAREXCODE_TOOLS : [];

export function createChat(deps) {
    const { chatLog, chatPanel, ta, sendBtn, stopBtn, onSave, onAuthRequired, getSystemPrompt, getActiveProject,
        sidePanel, sidePanelBody, sidePanelEmpty, sidePanelSpinner, sidePanelClose } = deps;
    let session = null;
    let running = false;
    let pendingEl = null, thinkBadgeEl = null, thinkBlockEl = null, thinkText = '';
    let rawAcc = '';
    let controller = null;
    let userClosedPanel = false;

    // ── Panneau latéral droit : raisonnement + fichiers modifiés ──
    function openSidePanel() {
        if (!sidePanel || userClosedPanel) return;
        sidePanel.classList.add('open');
        if (sidePanelEmpty) sidePanelEmpty.style.display = 'none';
    }
    function closeSidePanel() {
        if (!sidePanel) return;
        sidePanel.classList.remove('open');
    }
    function resetSidePanel() {
        userClosedPanel = false;
        if (sidePanelBody) {
            sidePanelBody.querySelectorAll('.sp-think-block, .sp-file-block').forEach(el => el.remove());
        }
        if (sidePanelEmpty) sidePanelEmpty.style.display = 'block';
        if (sidePanelSpinner) sidePanelSpinner.style.display = 'none';
        closeSidePanel();
    }
    if (sidePanelClose) {
        sidePanelClose.addEventListener('click', () => {
            userClosedPanel = true;
            closeSidePanel();
        });
    }

    function esc(s) {
        const d = document.createElement('div');
        d.textContent = String(s == null ? '' : s);
        return d.innerHTML;
    }

    function renderMarkdown(md) {
        if (typeof window.marked === 'function' || (window.marked && typeof window.marked.parse === 'function')) {
            const parse = typeof window.marked === 'function' ? window.marked : window.marked.parse;
            const html = parse(md || '', { breaks: true, gfm: true });
            return typeof window.DOMPurify === 'function' ? window.DOMPurify.sanitize(html) : html;
        }
        return esc(md);
    }

    function addMsg(cls, text, useMarkdown) {
        const m = document.createElement('div');
        m.className = 'msg ' + cls;
        if (useMarkdown && cls === 'assistant') {
            const inner = document.createElement('div');
            inner.className = 'md';
            inner.innerHTML = renderMarkdown(text || '');
            m.appendChild(inner);
        } else {
            m.textContent = text;
        }
        chatLog.appendChild(m);
        chatLog.scrollTop = chatLog.scrollHeight;
        return m;
    }

    // Bloc fichier/outil : écrit dans le panneau droit, pas dans le fil de chat
    function addToolBlock(name, args, result) {
        openSidePanel();
        const t = document.createElement('div');
        t.className = 'sp-file-block';
        const path = args && (args.path || args.file_path || args.filePath);
        t.innerHTML =
            '<div class="sp-file-block-header">' +
                '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M13 2v7h7"/></svg>' +
                '<span>' + esc(name) + '</span>' +
                (path ? '<span class="sp-file-block-path">' + esc(path) + '</span>' : '') +
                '<span class="sp-file-block-status">' + (result && result.pending ? 'en cours…' : 'terminé') + '</span>' +
            '</div>' +
            '<pre>' + esc(JSON.stringify(args, null, 2)) + '</pre>' +
            (result && !result.pending ? '<pre>' + esc(JSON.stringify(result, null, 2)) + '</pre>' : '');
        if (sidePanelBody) {
            sidePanelBody.appendChild(t);
            sidePanelBody.scrollTop = sidePanelBody.scrollHeight;
        }
        return t;
    }

    // Badge compact "Réflexion" dans le fil de chat — le détail va dans le panneau droit
    function ensureThinkBadge() {
        if (thinkBadgeEl) return thinkBadgeEl;
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'think-badge';
        b.innerHTML = '<span class="think-spinner"></span><span>Réflexion</span>';
        b.addEventListener('click', () => {
            userClosedPanel = false;
            openSidePanel();
        });
        chatLog.appendChild(b);
        chatLog.scrollTop = chatLog.scrollHeight;
        thinkBadgeEl = b;
        return b;
    }

    function onThinking(t) {
        ensureThinkBadge();
        openSidePanel();
        if (sidePanelSpinner) sidePanelSpinner.style.display = 'block';
        if (!thinkBlockEl) {
            thinkBlockEl = document.createElement('div');
            thinkBlockEl.className = 'sp-think-block';
            thinkBlockEl.innerHTML = '<div class="sp-think-block-label">Raisonnement</div><div class="sp-think-text"></div>';
            if (sidePanelBody) sidePanelBody.appendChild(thinkBlockEl);
        }
        const txt = thinkBlockEl.querySelector('.sp-think-text');
        if (txt) txt.textContent += t;
        if (sidePanelBody) sidePanelBody.scrollTop = sidePanelBody.scrollHeight;
    }

    function finishThinking() {
        if (thinkBadgeEl) thinkBadgeEl.classList.add('done');
        if (sidePanelSpinner) sidePanelSpinner.style.display = 'none';
        thinkBlockEl = null;
    }

    function setChatVisible(visible) {
        chatPanel.style.display = visible ? 'flex' : 'none';
        const hero = chatPanel.closest ? chatPanel.closest('.hero') : null;
        if (hero) hero.classList.toggle('has-chat', visible);
    }

    function renderHistory() {
        chatLog.innerHTML = '';
        for (const m of (session.messages || [])) {
            if (m.role === 'user') addMsg('user', m.content || '');
            else if (m.role === 'assistant') addMsg('assistant', m.content || '', true);
        }
    }

    function setRunning(v) {
        running = v;
        sendBtn.disabled = v;
        sendBtn.style.display = v ? 'none' : 'flex';
        stopBtn.classList.toggle('visible', v);
        controller = v ? new AbortController() : null;
    }

    function stop() {
        if (controller) {
            controller.abort();
            setRunning(false);
            finishThinking();
            if (pendingEl) {
                session.messages.push({ role: 'assistant', content: rawAcc });
                pendingEl = null;
            }
            if (onSave) onSave(session);
        }
    }

    function setSession(s) {
        session = s;
        thinkBadgeEl = null; thinkBlockEl = null;
        resetSidePanel();
        renderHistory();
        setChatVisible((session.messages || []).length > 0);
    }

    function getSession() {
        return session;
    }

    function newSession() {
        session = { id: null, title: 'Nouvelle conversation', model: session && session.model ? session.model : null, messages: [] };
        chatLog.innerHTML = '';
        setChatVisible(false);
        pendingEl = null; thinkBadgeEl = null; thinkBlockEl = null; thinkText = '';
        resetSidePanel();
        return session;
    }

    async function send() {
        const text = ta.value.trim();
        if (!text || running) return;
        const model = session && session.model;
        if (!model) { addMsg('error', 'Sélectionnez un modèle.'); return; }
        setRunning(true);
        ta.value = '';
        ta.dispatchEvent(new Event('input'));
        ta.style.height = '44px';
        setChatVisible(true);
        session.model = model;
        session.project = getActiveProject ? getActiveProject() : session.project;
        if (!session.title || session.title === 'Nouvelle conversation') {
            session.title = text.length > 40 ? text.substring(0, 40) + '…' : text;
        }
        session.messages.push({ role: 'user', content: text });
        addMsg('user', text);

        const baseSys = 'Tu es Marexcode, un assistant de codage IA professionnel intégré à Cetas. Tu aides l utilisateur à lire, écrire, éditer et analyser du code dans son workspace. RÈGLES : 1) Utilise les outils (Read, Write, Edit, Grep, Bash) pour accomplir la tâche concrètement, PAS juste expliquer. 2) Lis d abord les fichiers concernés avant de proposer des modifications. 3) Après chaque modification, indique le fichier et la ligne. 4) Si une commande échoue, lis l erreur et corrige. 5) Sois concis et cite les chemins exacts. 6) Ne modifie jamais hors sandbox, ne demande jamais sudo. 7) Pour une tâche complexe : analyse → plan → exécution → vérification.';
        const skill = getSystemPrompt ? getSystemPrompt() : '';
        const sys = (skill ? skill + '\n\n' : '') + baseSys;
        const history = [{ role: 'system', content: sys }].concat(session.messages);
        pendingEl = null; thinkBadgeEl = null; thinkBlockEl = null; thinkText = ''; rawAcc = '';
        pendingEl = addMsg('assistant', '', false);

        const onChunk = (chunk) => {
            rawAcc += chunk;
            if (pendingEl) pendingEl.textContent = rawAcc;
            chatLog.scrollTop = chatLog.scrollHeight;
        };
        const onDone = () => {
            setRunning(false);
            finishThinking();
            if (pendingEl) {
                pendingEl.innerHTML = '<div class="md">' + renderMarkdown(rawAcc) + '</div>';
                session.messages.push({ role: 'assistant', content: rawAcc });
                pendingEl = null;
            }
            if (onSave) onSave(session);
        };
        const onError = (err) => {
            setRunning(false);
            finishThinking();
            pendingEl = null;
            if (err && err.message === 'AUTH_REQUIRED') { if (onAuthRequired) onAuthRequired(); return; }
            addMsg('error', 'Erreur: ' + (err && err.message ? err.message : err));
        };

        try {
            if (typeof streamModelWithTools !== 'function') {
                throw new Error('streamModelWithTools indisponible');
            }
            await streamModelWithTools(
                model,
                history,
                onChunk,
                onDone,
                onError,
                MAREX_TOOLS,
                true,
                (t) => onThinking(t),
                controller.signal,
                null, null, 0
            );
        } catch (err) {
            setRunning(false);
            finishThinking();
            pendingEl = null;
            if (err && err.message === 'AUTH_REQUIRED') { if (onAuthRequired) onAuthRequired(); return; }
            addMsg('error', 'Erreur: ' + (err && err.message ? err.message : err));
        }
    }

    window.addEventListener('marexcode-tool', (e) => {
        const d = e.detail;
        if (!d || !d.phase) return;
        if (d.phase === 'start') {
            addToolBlock(d.name, d.args, { pending: true });
        } else if (d.phase === 'end') {
            if (!sidePanelBody) return;
            const blocks = sidePanelBody.querySelectorAll('.sp-file-block');
            const last = blocks[blocks.length - 1];
            if (last) {
                const path = d.args && (d.args.path || d.args.file_path || d.args.filePath);
                last.innerHTML =
                    '<div class="sp-file-block-header">' +
                        '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M13 2v7h7"/></svg>' +
                        '<span>' + esc(d.name) + '</span>' +
                        (path ? '<span class="sp-file-block-path">' + esc(path) + '</span>' : '') +
                        '<span class="sp-file-block-status">terminé</span>' +
                    '</div>' +
                    '<pre>' + esc(JSON.stringify(d.args, null, 2)) + '</pre>' +
                    '<pre>' + esc(JSON.stringify(d.result, null, 2)) + '</pre>';
            }
            sidePanelBody.scrollTop = sidePanelBody.scrollHeight;
        }
    });

    return {
        send,
        stop,
        setSession,
        getSession,
        newSession,
        renderHistory,
        setRunning,
        isRunning: () => running
    };
}
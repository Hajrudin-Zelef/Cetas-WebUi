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
    let fileContents = {};
    let todoBlockEl = null;
    let statusEl = null;

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
            sidePanelBody.querySelectorAll('.sp-think-block').forEach(el => el.remove());
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

    function computeDiff(oldContent, newContent) {
        const oldLines = (oldContent || '').split('\n');
        const newLines = (newContent || '').split('\n');
        const result = [];
        const maxLen = Math.max(oldLines.length, newLines.length);
        for (let i = 0; i < maxLen; i++) {
            const oldLine = oldLines[i];
            const newLine = newLines[i];
            if (oldLine === undefined) {
                result.push({ type: 'add', content: newLine });
            } else if (newLine === undefined) {
                result.push({ type: 'del', content: oldLine });
            } else if (oldLine !== newLine) {
                result.push({ type: 'del', content: oldLine });
                result.push({ type: 'add', content: newLine });
            } else {
                result.push({ type: 'same', content: newLine });
            }
        }
        return result;
    }

    function renderDiffContent(oldContent, newContent) {
        const diff = computeDiff(oldContent, newContent);
        let html = '';
        for (const line of diff) {
            if (line.type === 'add') {
                html += '<div class="diff-add">+ ' + esc(line.content) + '</div>';
            } else if (line.type === 'del') {
                html += '<div class="diff-del">- ' + esc(line.content) + '</div>';
            } else {
                html += '<div class="diff-same">  ' + esc(line.content) + '</div>';
            }
        }
        return html;
    }

    function addChatToolBlock(name, args, result) {
        const block = document.createElement('div');
        block.className = 'chat-tool-block';
        const path = args && (args.path || args.file_path || args.filePath);
        const isBash = name.toLowerCase() === 'bash';
        const isWrite = name.toLowerCase() === 'write';
        const isEdit = name.toLowerCase() === 'edit';
        const isRead = name.toLowerCase() === 'read';
        const isGrep = name.toLowerCase() === 'grep';

        let badgeClass = 'tool-badge-neutral';
        if (isBash) badgeClass = 'tool-badge-bash';

        let contentHtml = '';
        let previewHtml = '';

        if (isWrite || isEdit) {
            const newContent = args && args.content || '';
            const oldContent = isEdit ? (args && args.old || '') : (fileContents[path] || '');
            contentHtml = renderDiffContent(oldContent, newContent);
            previewHtml = contentHtml.split('\n').slice(0, 4).join('\n');
            if (path) fileContents[path] = newContent;
        } else if (isRead) {
            const content = result && result.content || '';
            contentHtml = esc(content);
            previewHtml = content.split('\n').slice(0, 4).join('\n');
        } else if (isGrep) {
            const content = result && result.matches || JSON.stringify(result, null, 2);
            contentHtml = esc(content);
            previewHtml = content.split('\n').slice(0, 4).join('\n');
        } else if (isBash) {
            const content = result && result.output || JSON.stringify(result, null, 2);
            contentHtml = esc(content);
            previewHtml = content.split('\n').slice(0, 4).join('\n');
        } else {
            contentHtml = esc(JSON.stringify(args, null, 2));
            previewHtml = contentHtml.split('\n').slice(0, 4).join('\n');
        }

        const previewLines = previewHtml.split('\n').slice(0, 4).join('\n');

        block.innerHTML =
            '<div class="chat-tool-block-header">' +
                '<span class="tool-badge ' + badgeClass + '">' + esc(name) + '</span>' +
                (path ? '<span class="chat-tool-block-path">' + esc(path) + '</span>' : '') +
                '<button class="chat-tool-toggle" type="button">Développer</button>' +
            '</div>' +
            '<div class="chat-tool-block-preview"><pre>' + esc(previewLines) + '</pre></div>' +
            '<div class="chat-tool-block-full" style="display:none"><pre>' + (isWrite || isEdit ? contentHtml : esc(contentHtml)) + '</pre></div>';

        const toggleBtn = block.querySelector('.chat-tool-toggle');
        const previewEl = block.querySelector('.chat-tool-block-preview');
        const fullEl = block.querySelector('.chat-tool-block-full');

        toggleBtn.addEventListener('click', () => {
            const isExpanded = fullEl.style.display !== 'none';
            if (isExpanded) {
                fullEl.style.display = 'none';
                previewEl.style.display = 'block';
                toggleBtn.textContent = 'Développer';
            } else {
                fullEl.style.display = 'block';
                previewEl.style.display = 'none';
                toggleBtn.textContent = 'Réduire';
            }
        });

        chatLog.appendChild(block);
        chatLog.scrollTop = chatLog.scrollHeight;
        return block;
    }

    function ensureStatusLine() {
        if (statusEl) return statusEl;
        statusEl = document.createElement('div');
        statusEl.className = 'chat-status-line';
        statusEl.innerHTML = '<span class="status-dot"></span><span class="status-action">Prêt</span><span class="status-model">' + esc(session?.model || '') + '</span>';
        chatLog.appendChild(statusEl);
        chatLog.scrollTop = chatLog.scrollHeight;
        return statusEl;
    }

    function updateStatus(action) {
        ensureStatusLine();
        const actionEl = statusEl.querySelector('.status-action');
        if (actionEl && action) actionEl.textContent = action;
    }

    function renderTodoBlock(todos) {
        if (!Array.isArray(todos) || todos.length === 0) return;
        if (!todoBlockEl) {
            todoBlockEl = document.createElement('div');
            todoBlockEl.className = 'chat-todo-block';
            chatLog.insertBefore(todoBlockEl, statusEl || null);
        }
        let html = '<div class="chat-todo-header"># Todos</div><ul class="chat-todo-list">';
        for (const todo of todos) {
            const status = todo.status || 'pending';
            let icon = '[ ]';
            let cls = 'todo-pending';
            if (status === 'in_progress') { icon = '[•]'; cls = 'todo-in-progress'; }
            else if (status === 'completed') { icon = '[x]'; cls = 'todo-completed'; }
            html += '<li class="chat-todo-item ' + cls + '"><span class="todo-icon">' + icon + '</span><span class="todo-content">' + esc(todo.content || '') + '</span></li>';
        }
        html += '</ul>';
        todoBlockEl.innerHTML = html;
        chatLog.scrollTop = chatLog.scrollHeight;
    }

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
        fileContents = {};
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
                pendingEl.innerHTML = '<div class="md">' + renderMarkdown(rawAcc) + '</div>';
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
        fileContents = {};
        setChatVisible(false);
        pendingEl = null; thinkBadgeEl = null; thinkBlockEl = null; thinkText = '';
        todoBlockEl = null; statusEl = null;
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

        const baseSys = 'Tu es Marexcode, un assistant de codage IA professionnel intégré à Cetas. Tu aides l utilisateur à lire, écrire, éditer et analyser du code dans son workspace. RÈGLES : 1) Utilise les outils (Ls, Read, Write, Edit, Grep, Bash, TodoWrite) pour accomplir la tâche concrètement, PAS juste expliquer. 2) Utilise Ls pour découvrir la structure du workspace avant de lire des fichiers. 3) Lis ensuite les fichiers concernés avant de proposer des modifications. 4) Après chaque modification, indique le fichier et la ligne. 5) Si une commande échoue, lis l erreur et corrige. 6) Sois concis et cite les chemins exacts. 7) Ne modifie jamais hors sandbox, ne demande jamais sudo. 8) Pour toute tâche à plusieurs étapes : utilise TodoWrite AU DÉBUT pour lister le plan, puis rappelle-le après chaque étape complétée pour mettre à jour les statuts (pending → in_progress → completed). 9) Pour une tâche complexe : analyse → plan (TodoWrite) → exécution → vérification.';
        const skill = getSystemPrompt ? getSystemPrompt() : '';
        const sys = (skill ? skill + '\n\n' : '') + baseSys;
        const history = [{ role: 'system', content: sys }].concat(session.messages);
        pendingEl = null; thinkBadgeEl = null; thinkBlockEl = null; thinkText = ''; rawAcc = '';
        todoBlockEl = null; statusEl = null;
        pendingEl = addMsg('assistant', '', false);
        ensureStatusLine();
        updateStatus('Génération…');

        const onChunk = (chunk) => {
            rawAcc += chunk;
            if (pendingEl) pendingEl.textContent = rawAcc;
            chatLog.scrollTop = chatLog.scrollHeight;
        };
        const onDone = () => {
            setRunning(false);
            finishThinking();
            updateStatus('Terminé');
            if (pendingEl) {
                const rendered = renderMarkdown(rawAcc);
                pendingEl.innerHTML = '<div class="md">' + rendered + '</div>';
                session.messages.push({ role: 'assistant', content: rawAcc });
                pendingEl = null;
            }
            if (onSave) onSave(session);
        };
        const onError = (err) => {
            setRunning(false);
            finishThinking();
            if (pendingEl) {
                pendingEl.innerHTML = '<div class="md">' + renderMarkdown(rawAcc) + '</div>';
                if (rawAcc) session.messages.push({ role: 'assistant', content: rawAcc });
                pendingEl = null;
            }
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
            if (pendingEl) {
                pendingEl.innerHTML = '<div class="md">' + renderMarkdown(rawAcc) + '</div>';
                if (rawAcc) session.messages.push({ role: 'assistant', content: rawAcc });
                pendingEl = null;
            }
            if (err && err.message === 'AUTH_REQUIRED') { if (onAuthRequired) onAuthRequired(); return; }
            addMsg('error', 'Erreur: ' + (err && err.message ? err.message : err));
        }
    }

    window.addEventListener('marexcode-todo', (e) => {
        const d = e.detail;
        if (d && Array.isArray(d.todos)) {
            renderTodoBlock(d.todos);
        }
    });

    window.addEventListener('marexcode-tool', (e) => {
        const d = e.detail;
        if (!d || !d.phase) return;
        if (d.phase === 'start') {
            addChatToolBlock(d.name, d.args, { pending: true });
            const actionMap = { Bash: 'Exécution commande…', Read: 'Lecture fichier…', Write: 'Écriture fichier…', Edit: 'Modification fichier…', Grep: 'Recherche…', TodoWrite: 'Mise à jour todos…' };
            updateStatus(actionMap[d.name] || 'Traitement…');
        } else if (d.phase === 'end') {
            const blocks = chatLog.querySelectorAll('.chat-tool-block');
            const last = blocks[blocks.length - 1];
            if (last) {
                const name = d.name;
                const args = d.args;
                const result = d.result;
                const path = args && (args.path || args.file_path || args.filePath);
                const isBash = name.toLowerCase() === 'bash';
                const isWrite = name.toLowerCase() === 'write';
                const isEdit = name.toLowerCase() === 'edit';
                const isRead = name.toLowerCase() === 'read';
                const isGrep = name.toLowerCase() === 'grep';

                let badgeClass = 'tool-badge-neutral';
                if (isBash) badgeClass = 'tool-badge-bash';

                let contentHtml = '';
                if (isWrite || isEdit) {
                    const newContent = args && args.content || '';
                    const oldContent = isEdit ? (args && args.old || '') : (fileContents[path] || '');
                    contentHtml = renderDiffContent(oldContent, newContent);
                    if (path) fileContents[path] = newContent;
                } else if (isRead) {
                    contentHtml = esc(result && result.content || '');
                } else if (isGrep) {
                    contentHtml = esc(result && result.matches || JSON.stringify(result, null, 2));
                } else if (isBash) {
                    contentHtml = esc(result && result.output || JSON.stringify(result, null, 2));
                } else {
                    contentHtml = esc(JSON.stringify(result, null, 2));
                }

                const previewLines = contentHtml.split('\n').slice(0, 4).join('\n');

                last.querySelector('.chat-tool-block-header .chat-tool-block-path')?.remove();
                if (path) {
                    const pathSpan = document.createElement('span');
                    pathSpan.className = 'chat-tool-block-path';
                    pathSpan.textContent = path;
                    last.querySelector('.chat-tool-block-header').insertBefore(pathSpan, last.querySelector('.chat-tool-toggle'));
                }

                const previewEl = last.querySelector('.chat-tool-block-preview pre');
                const fullEl = last.querySelector('.chat-tool-block-full pre');
                if (previewEl) previewEl.textContent = previewLines;
                if (fullEl) {
                    if (isWrite || isEdit) {
                        fullEl.innerHTML = contentHtml;
                    } else {
                        fullEl.textContent = contentHtml;
                    }
                }
            }
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

/* Marexcode — © Marexsoft Corporation. Fondateur Kouassi Marius. */

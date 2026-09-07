export const MAREX_TOOLS = (typeof MAREXCODE_TOOLS !== 'undefined') ? MAREXCODE_TOOLS : [];

import { listSkillsConfig, getGlobalInstructions, getWorkspaceInstructions } from './api.js';

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
    let currentToolGroupEl = null;
    let thinkStepEl = null;

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

    function ensureToolGroup() {
        if (currentToolGroupEl) return currentToolGroupEl;
        const group = document.createElement('div');
        group.className = 'chat-steps';
        chatLog.appendChild(group);
        currentToolGroupEl = group;
        return group;
    }

    function getStepIcon(name) {
        const n = name.toLowerCase();
        if (n === 'grep') return '∗';
        if (n === 'read') return '→';
        if (n === 'bash' || n === 'build') return '▪';
        if (n === 'write' || n === 'edit') return '✎';
        return '•';
    }

    function getStepLabel(name, args, result) {
        const n = name.toLowerCase();
        const path = args && (args.path || args.file_path || args.filePath) || '';
        if (n === 'grep') {
            const count = result && result.matches ? (typeof result.matches === 'string' ? (result.matches.match(/\n/g) || []).length : result.matches.length) : '?';
            return 'Grep "' + (args.pattern || '') + '" in ' + path + ' (' + count + ' matches)';
        }
        if (n === 'read') return 'Read ' + path + (args.offset != null || args.limit != null ? ' [limit=' + (args.limit || '') + ', offset=' + (args.offset || '') + ']' : '');
        if (n === 'bash') return 'Bash: ' + (args.command || '');
        if (n === 'write') return 'Write ' + path;
        if (n === 'edit') return 'Edit ' + path;
        return name;
    }

    function formatBashOutput(stdout) {
        if (!stdout) return '';
        const lines = stdout.split('\n');
        if (lines.length <= 6) return stdout;
        return lines.slice(-6).join('\n');
    }

    function addChatToolBlock(name, args, result) {
        const group = ensureToolGroup();
        const line = document.createElement('div');
        line.className = 'chat-step-line';
        const icon = getStepIcon(name);
        const label = getStepLabel(name, args, result);
        line.innerHTML = '<span class="step-icon">' + icon + '</span><span class="step-label">' + esc(label) + '</span>';
        group.appendChild(line);
        chatLog.scrollTop = chatLog.scrollHeight;
        return line;
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
            const group = ensureToolGroup();
            thinkStepEl = document.createElement('div');
            thinkStepEl.className = 'chat-step-line';
            thinkStepEl.innerHTML = '<span class="step-icon">✦</span><span class="step-label">Thought…</span>';
            group.appendChild(thinkStepEl);
            chatLog.scrollTop = chatLog.scrollHeight;
        }
        if (!thinkStepEl._timerStart) {
            thinkStepEl._timerStart = Date.now();
            thinkStepEl._timerInterval = setInterval(() => {
                const el = thinkStepEl.querySelector('.step-label');
                if (el) el.textContent = 'Thought: ' + (Date.now() - thinkStepEl._timerStart) + 'ms';
            }, 50);
        }
        const txt = thinkBlockEl.querySelector('.sp-think-text');
        if (txt) txt.textContent += t;
        if (sidePanelBody) sidePanelBody.scrollTop = sidePanelBody.scrollHeight;
    }

    function finishThinking() {
        if (thinkBadgeEl) thinkBadgeEl.classList.add('done');
        if (sidePanelSpinner) sidePanelSpinner.style.display = 'none';
        if (thinkStepEl && thinkStepEl._timerInterval) {
            clearInterval(thinkStepEl._timerInterval);
            const el = thinkStepEl.querySelector('.step-label');
            if (el) el.textContent = 'Thought: ' + (Date.now() - thinkStepEl._timerStart) + 'ms';
        }
        thinkBlockEl = null;
        thinkStepEl = null;
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
        thinkBadgeEl = null; thinkBlockEl = null; thinkStepEl = null;
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
        pendingEl = null; thinkBadgeEl = null; thinkBlockEl = null; thinkStepEl = null; thinkText = '';
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

        const baseSys = 'Tu es Marexcode, un assistant de codage IA professionnel intégré à Cetas. RÈGLE PRIORITAIRE : si la question de l\'utilisateur est générale, conceptuelle, ou ne nécessite pas d\'action sur le workspace (ex: "c\'est quoi JSON", "explique-moi X", question de culture générale ou de discussion) — réponds directement en texte, SANS utiliser aucun outil. N\'utilise Ls/Read/Write/Edit/Grep/Bash/TodoWrite QUE si la tâche demande explicitement de lire, créer, modifier ou analyser des fichiers du workspace. Tu aides l utilisateur à lire, écrire, éditer et analyser du code dans son workspace quand c\'est pertinent. RÈGLES POUR LES TÂCHES DE CODE : 1) Utilise les outils (Ls, Read, Write, Edit, Grep, Bash, TodoWrite) pour accomplir la tâche concrètement, PAS juste expliquer. 2) Utilise Ls pour découvrir la structure du workspace avant de lire des fichiers. 3) Lis ensuite les fichiers concernés avant de proposer des modifications. 4) Après chaque modification, indique le fichier et la ligne. 5) Si une commande échoue, lis l erreur et corrige. 6) Sois concis et cite les chemins exacts. 7) Ne modifie jamais hors sandbox, ne demande jamais sudo. 8) Pour toute tâche à plusieurs étapes : utilise TodoWrite AU DÉBUT pour lister le plan, puis rappelle-le après chaque étape complétée pour mettre à jour les statuts (pending → in_progress → completed). 9) Pour une tâche complexe : analyse → plan (TodoWrite) → exécution → vérification. 10) Quand tu dois planifier ou implémenter une tâche complexe, utilise AU MINIMUM un skill pertinent parmi les SKILLS DISPONIBLES ci-dessous pour guider ton approche. 11) RÈGLE DE LECTURE STRICTE, SANS EXCEPTION : chaque appel Read DOIT avoir limit=50 et offset explicites, quelle que soit la taille du fichier, même si l\'utilisateur dit "lis" ou "montre-moi X.md". Ne fais JAMAIS de Read sans limit sur un fichier, peu importe sa taille apparente. 12) INTERDICTION DE RECOPIER : après avoir lu un fichier avec Read, ne recopie JAMAIS son contenu intégral dans ta réponse (pas de bloc de code reproduisant le fichier ligne par ligne). Résume uniquement : le sujet du fichier en 1 phrase, sa structure (titres/sections) en liste courte, et les 2-3 points les plus importants. Si le fichier fait plus de 50 lignes et que l\'utilisateur veut voir le contenu complet, dis-le lui et demande s\'il veut une tranche précise (ex: "il fait 117 lignes, veux-tu voir une section particulière ?") au lieu de tout afficher toi-même.';
        const skill = getSystemPrompt ? getSystemPrompt() : '';

        // Injecter les skills activés
        let skillsPrompt = '';
        try {
            const skillsConfig = await listSkillsConfig();
            if (skillsConfig && skillsConfig.length) {
                const autoSkills = skillsConfig.filter(s => s.enabled && s.mode === 'auto');
                const manualSkills = skillsConfig.filter(s => s.enabled && s.mode === 'manual');
                if (autoSkills.length) {
                    skillsPrompt += '\n\nSKILLS DISPONIBLES (utilise automatiquement celui/ceux pertinent(s) pour la requête, sans demander confirmation) :\n' +
                        autoSkills.map(s => '- ' + s.id + ': ' + s.description).join('\n');
                }
                if (manualSkills.length) {
                    skillsPrompt += '\n\nSKILLS DISPONIBLES SUR DEMANDE (n\'utilise que si l\'utilisateur le mentionne explicitement par son nom) :\n' +
                        manualSkills.map(s => '- ' + s.id + ': ' + s.description).join('\n');
                }
            }
        } catch (e) { /* ignore skills errors */ }

        // Injecter les instructions (globales + workspace)
        let instructionsBlock = '';
        try {
            const [globalInstr, workspaceInstr] = await Promise.all([
                getGlobalInstructions().catch(() => ({ content: '' })),
                window.activeWorkspaceId ? getWorkspaceInstructions(window.activeWorkspaceId).catch(() => ({ content: '' })) : Promise.resolve({ content: '' })
            ]);
            if (globalInstr.content && globalInstr.content.trim()) {
                instructionsBlock += '\n\nINSTRUCTIONS GLOBALES DE L\'UTILISATEUR (à respecter en priorité) :\n' + globalInstr.content.trim();
            }
            if (workspaceInstr.content && workspaceInstr.content.trim()) {
                instructionsBlock += '\n\nINSTRUCTIONS SPÉCIFIQUES À CE PROJET :\n' + workspaceInstr.content.trim();
            }
        } catch (e) { /* ignore instructions errors */ }

        const sys = (skill ? skill + '\n\n' : '') + baseSys + instructionsBlock + skillsPrompt;
        const history = [{ role: 'system', content: sys }].concat(session.messages);
        pendingEl = null; thinkBadgeEl = null; thinkBlockEl = null; thinkStepEl = null; thinkText = ''; rawAcc = '';
        todoBlockEl = null; statusEl = null;
        currentToolGroupEl = null;
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
            const path = d.args && (d.args.path || d.args.file_path || d.args.filePath);
            const actionMap = {
                Bash: 'Exécution commande' + (d.args && d.args.command ? ': ' + d.args.command.substring(0, 40) : '') + '…',
                Read: 'Lecture ' + (path || 'fichier') + '…',
                Write: 'Écriture ' + (path || 'fichier') + '…',
                Edit: 'Modification ' + (path || 'fichier') + '…',
                Grep: 'Recherche' + (d.args && d.args.pattern ? ' «' + d.args.pattern.substring(0, 30) + '»' : '') + '…',
                TodoWrite: 'Mise à jour todos…'
            };
            updateStatus(actionMap[d.name] || 'Traitement…');
        } else if (d.phase === 'end') {
            const lines = currentToolGroupEl ? currentToolGroupEl.querySelectorAll('.chat-step-line') : [];
            const last = lines[lines.length - 1];
            if (last) {
                const label = getStepLabel(d.name, d.args, d.result);
                const labelEl = last.querySelector('.step-label');
                if (labelEl) labelEl.textContent = label;
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

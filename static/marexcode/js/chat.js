export const MAREX_TOOLS = (typeof MAREXCODE_TOOLS !== 'undefined') ? MAREXCODE_TOOLS : [];

import { listSkillsConfig, getGlobalInstructions, getWorkspaceInstructions, trackActivity, getMemory } from './api.js';

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
    let cachedInstructions = { global: '', workspace: '', memory: '' };
    let messageQueue = [];
    let pendingImages = [];

    function setupImageDrop() {
        if (!ta) return;
        ta.addEventListener('dragover', (e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; });
        ta.addEventListener('drop', (e) => {
            e.preventDefault();
            const files = e.dataTransfer.files;
            for (let i = 0; i < files.length; i++) {
                if (files[i].type.startsWith('image/')) addImage(files[i]);
            }
        });
        ta.addEventListener('paste', (e) => {
            const items = e.clipboardData && e.clipboardData.items;
            if (!items) return;
            for (let i = 0; i < items.length; i++) {
                if (items[i].type.startsWith('image/')) {
                    e.preventDefault();
                    addImage(items[i].getAsFile());
                }
            }
        });
    }

    function addImage(file) {
        const reader = new FileReader();
        reader.onload = () => {
            pendingImages.push({ dataUrl: reader.result, mimeType: file.type, name: file.name });
            renderImagePreview();
        };
        reader.readAsDataURL(file);
    }

    function renderImagePreview() {
        const preview = document.getElementById('image-preview');
        if (!preview) return;
        if (pendingImages.length === 0) { preview.style.display = 'none'; preview.innerHTML = ''; return; }
        preview.style.display = 'flex';
        preview.innerHTML = pendingImages.map((img, i) =>
            '<div class="image-preview-item"><img src="' + img.dataUrl + '" alt="' + (img.name || 'image') + '"><button class="image-preview-remove" data-idx="' + i + '">×</button></div>'
        ).join('');
        preview.querySelectorAll('.image-preview-remove').forEach(btn => {
            btn.addEventListener('click', () => {
                pendingImages.splice(parseInt(btn.dataset.idx), 1);
                renderImagePreview();
            });
        });
    }

    async function preloadInstructions() {
        try {
            const [globalInstr, workspaceInstr, memoryInstr] = await Promise.all([
                getGlobalInstructions().catch(() => ({ content: '' })),
                window.activeWorkspaceId ? getWorkspaceInstructions(window.activeWorkspaceId).catch(() => ({ content: '' })) : Promise.resolve({ content: '' }),
                getMemory().catch(() => ({ content: '' }))
            ]);
            cachedInstructions.global = (globalInstr.content || '').trim();
            cachedInstructions.workspace = (workspaceInstr.content || '').trim();
            cachedInstructions.memory = (memoryInstr.content || '').trim();
        } catch (e) { /* ignore */ }
    }

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

    function addMsg(cls, content, useMarkdown) {
        const m = document.createElement('div');
        m.className = 'msg ' + cls;
        if (Array.isArray(content)) {
            const textParts = content.filter(c => c.type === 'text').map(c => c.text).join('\n');
            const imageParts = content.filter(c => c.type === 'image');
            if (useMarkdown && cls === 'assistant' && textParts) {
                const inner = document.createElement('div');
                inner.className = 'md';
                inner.innerHTML = renderMarkdown(textParts);
                m.appendChild(inner);
            } else if (textParts) {
                m.textContent = textParts;
            }
            if (imageParts.length > 0) {
                const imgContainer = document.createElement('div');
                imgContainer.className = 'message-images';
                imageParts.forEach(img => {
                    const src = img.dataUrl || ('data:' + (img.mimeType || 'image/png') + ';base64,' + img.data);
                    const imgEl = document.createElement('img');
                    imgEl.src = src;
                    imgEl.alt = 'Image';
                    imgEl.style.maxWidth = '300px';
                    imgEl.style.borderRadius = '8px';
                    imgEl.style.marginTop = '8px';
                    imgContainer.appendChild(imgEl);
                });
                m.appendChild(imgContainer);
            }
        } else if (useMarkdown && cls === 'assistant') {
            const inner = document.createElement('div');
            inner.className = 'md';
            inner.innerHTML = renderMarkdown(content || '');
            m.appendChild(inner);
        } else {
            m.textContent = content;
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
        if (n === 'glob') return '◎';
        if (n === 'lsp') return '⟡';
        if (n === 'web_search') return '🌐';
        if (n.startsWith('mcp_')) return '⬡';
        if (n.startsWith('custom_')) return '⚙';
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
        if (n === 'glob') return 'Glob "' + (args.pattern || '') + '" (' + (result && result.count != null ? result.count : '?') + ' files)';
        if (n === 'lsp') return 'LSP ' + (args.operation || '') + ' ' + (args.file || '') + ':' + (args.line || 0);
        if (n === 'web_search') return 'Recherche: "' + (args.query || '') + '"';
        if (n.startsWith('mcp_')) {
            var mcpParts = n.split('_');
            return 'MCP ' + (mcpParts[1] || '') + '.' + mcpParts.slice(2).join('_') + '…';
        }
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
        statusEl.innerHTML = '<span class="status-dot"></span><span class="status-action">Ready</span><span class="status-model">' + esc(session?.model || '') + '</span>';
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
        b.innerHTML = '<span class="think-spinner"></span><span>Thinking</span>';
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
        const mode = localStorage.getItem('marex-thinking-mode') || 'all';
        if (mode === 'hidden') return;
        ensureThinkBadge();
        if (mode === 'all') openSidePanel();
        if (sidePanelSpinner) sidePanelSpinner.style.display = 'block';
        if (!thinkBlockEl) {
            thinkBlockEl = document.createElement('div');
            thinkBlockEl.className = 'sp-think-block';
            thinkBlockEl.innerHTML = '<div class="sp-think-block-label">Reasoning</div><div class="sp-think-text"></div>';
            if (sidePanelBody && mode === 'all') sidePanelBody.appendChild(thinkBlockEl);
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
        if (txt && mode === 'all') txt.textContent += t;
        if (sidePanelBody && mode === 'all') sidePanelBody.scrollTop = sidePanelBody.scrollHeight;
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

    function estimateTokens(text) {
        if (!text) return 0;
        return Math.ceil(text.length / 4);
    }

    function updateTokenCounter() {
        const el = document.getElementById('token-counter');
        if (!el) return;
        const show = localStorage.getItem('marex-show-tokens') !== '0';
        el.style.display = show ? '' : 'none';
        if (!show || !session) return;
        let total = 0;
        for (const m of (session.messages || [])) total += estimateTokens(m.content);
        total += estimateTokens(ta.value);
        el.textContent = '~' + total + ' tokens';
    }

    function updateQueueIndicator() {
        const el = document.getElementById('queue-indicator');
        if (!el) return;
        if (messageQueue.length > 0) {
            el.textContent = messageQueue.length + ' message' + (messageQueue.length > 1 ? 's' : '') + ' in queue';
            el.style.display = '';
        } else {
            el.style.display = 'none';
        }
    }

    const BUILTIN_COMMANDS = [
        { name: '/help', description: 'Afficher les commandes disponibles' },
        { name: '/clear', description: 'Effacer le chat' },
        { name: '/model', description: 'Afficher le modèle courant' },
        { name: '/undo', description: 'Annuler la dernière modification' },
        { name: '/redo', description: 'Rétablir la dernière annulation' },
        { name: '/compact', description: 'Compresser l\'historique de conversation' },
        { name: '/init', description: 'Analyser le repo et générer MAREXCODE.md' },
        { name: '/mcp', description: 'Lister les serveurs MCP et leurs tools' },
        { name: '/cost', description: 'Afficher l\'usage tokens de la session' },
        { name: '/workspace', description: 'Lister/switcher les workspaces' },
        { name: '/skills', description: 'Lister les skills actifs' },
        { name: '/diff', description: 'Afficher le dernier patch/diff' },
    ];

    function _authHeaders() {
        const h = { 'Content-Type': 'application/json' };
        if (typeof Auth !== 'undefined' && Auth.getToken) { const tk = Auth.getToken(); if (tk) h.Authorization = 'Bearer ' + tk; }
        return h;
    }

    async function handleSlashCommand(text) {
        const parts = text.split(/\s+/);
        const cmd = parts[0].toLowerCase();
        const args = parts.slice(1).join(' ');

        if (cmd === '/help') {
            let msg = '**Commandes disponibles :**\n\n';
            BUILTIN_COMMANDS.forEach(c => { msg += '- `' + c.name + '` — ' + c.description + '\n'; });
            try {
                const resp = await fetch('/api/marexcode/custom-tools', { headers: _authHeaders(), signal: AbortSignal.timeout(3000) });
                if (resp.ok) {
                    const tools = await resp.json().catch(() => ({}));
                    Object.keys(tools).forEach(name => {
                        msg += '- `/' + name + '` — ' + (tools[name].description || name) + '\n';
                    });
                }
            } catch (e) {}
            addMsg('assistant', msg, true);
            return true;
        }
        if (cmd === '/clear') {
            if (typeof newSession === 'function') newSession();
            else { session.messages = []; chatLog.innerHTML = ''; setChatVisible(false); }
            return true;
        }
        if (cmd === '/model') {
            const m = session && session.model;
            addMsg('assistant', 'Modèle courant : `' + (m || 'aucun') + '`', true);
            return true;
        }
        if (cmd === '/undo') {
            try {
                const resp = await fetch('/api/marexcode/undo', { method: 'POST', headers: _authHeaders(), signal: AbortSignal.timeout(5000) });
                const data = await resp.json().catch(() => ({}));
                addMsg('assistant', data.ok ? '↩ Annulé : ' + data.file : (data.error || 'Erreur undo'));
                if (typeof refreshUndoRedo === 'function') refreshUndoRedo();
            } catch (e) { addMsg('error', 'Erreur undo'); }
            return true;
        }
        if (cmd === '/redo') {
            try {
                const resp = await fetch('/api/marexcode/redo', { method: 'POST', headers: _authHeaders(), signal: AbortSignal.timeout(5000) });
                const data = await resp.json().catch(() => ({}));
                addMsg('assistant', data.ok ? '↪ Rétabli : ' + data.file : (data.error || 'Erreur redo'));
                if (typeof refreshUndoRedo === 'function') refreshUndoRedo();
            } catch (e) { addMsg('error', 'Erreur redo'); }
            return true;
        }
        if (cmd === '/compact') {
            const msgs = session.messages || [];
            if (msgs.length <= 4) { addMsg('assistant', 'Pas assez de messages à compresser (minimum 5).'); return true; }
            const keep = msgs.slice(-4);
            const toSummarize = msgs.slice(0, -4);
            const summary = toSummarize.map(m => {
                const role = m.role === 'user' ? 'User' : 'Assistant';
                const content = typeof m.content === 'string' ? m.content : (Array.isArray(m.content) ? m.content.filter(c => c.type === 'text').map(c => c.text).join(' ') : '');
                return role + ': ' + content.substring(0, 150) + (content.length > 150 ? '…' : '');
            }).join('\n');
            session.messages = [
                { role: 'system', content: '[Historique compressé — ' + toSummarize.length + ' messages résumés]\n' + summary },
                ...keep
            ];
            addMsg('assistant', '✅ Historique compressé : ' + toSummarize.length + ' messages résumés, ' + keep.length + ' messages conservés.');
            if (onSave) onSave(session);
            return true;
        }
        if (cmd === '/init') {
            addMsg('assistant', '🔍 Analyse du workspace en cours…');
            try {
                const treeResp = await fetch('/api/marexcode/tree', { headers: _authHeaders(), signal: AbortSignal.timeout(5000) });
                const tree = await treeResp.json().catch(() => []);
                const files = (Array.isArray(tree) ? tree : []).map(f => f.path || '');
                const exts = {};
                files.forEach(f => { const ext = f.split('.').pop(); exts[ext] = (exts[ext] || 0) + 1; });
                const topExts = Object.entries(exts).sort((a, b) => b[1] - a[1]).slice(0, 10);
                let stack = [];
                if (exts.py) stack.push('Python');
                if (exts.js || exts.mjs) stack.push('JavaScript');
                if (exts.ts) stack.push('TypeScript');
                if (exts.jsx || exts.tsx) stack.push('React');
                if (exts.go) stack.push('Go');
                if (exts.rs) stack.push('Rust');
                if (exts.json && files.some(f => f.endsWith('package.json'))) stack.push('Node.js');
                if (exts.json && files.some(f => f.endsWith('tsconfig.json'))) stack.push('TypeScript (config)');
                if (files.some(f => f.endsWith('requirements.txt') || f.endsWith('pyproject.toml'))) stack.push('Python (pip)');
                if (files.some(f => f.endsWith('Cargo.toml'))) stack.push('Rust (Cargo)');
                if (files.some(f => f.endsWith('go.mod'))) stack.push('Go (modules)');
                let md = '# Instructions du projet\n\n';
                md += '## Structure\n\n';
                md += '- Total fichiers : ' + files.length + '\n';
                md += '- Extensions : ' + topExts.map(e => '.' + e[0] + ' (' + e[1] + ')').join(', ') + '\n\n';
                md += '## Stack détecté\n\n';
                md += (stack.length ? stack.join(', ') : 'Non détecté') + '\n\n';
                md += '## Commandes utiles\n\n';
                if (files.some(f => f.endsWith('package.json'))) md += '- `npm install` — installer les dépendances\n- `npm test` — lancer les tests\n- `npm run build` — builder le projet\n';
                if (files.some(f => f.endsWith('requirements.txt') || f.endsWith('pyproject.toml'))) md += '- `pip install -r requirements.txt` — installer les dépendances\n- `pytest` — lancer les tests\n';
                md += '\n<!-- Décris ici les conventions de code, les contraintes, le contexte du projet -->\n';
                addMsg('assistant', '📝 **MAREXCODE.md généré** (' + files.length + ' fichiers analysés) :\n\n```markdown\n' + md + '```');
            } catch (e) { addMsg('error', 'Erreur analyse workspace : ' + (e.message || e)); }
            return true;
        }
        if (cmd === '/mcp') {
            try {
                const resp = await fetch('/api/mcp/servers', { headers: _authHeaders(), signal: AbortSignal.timeout(5000) });
                const servers = await resp.json().catch(() => []);
                if (!servers.length) { addMsg('assistant', 'Aucun serveur MCP configuré. Créez un fichier `mcp.json` dans le workspace.'); return true; }
                let msg = '**Serveurs MCP :**\n\n';
                for (const srv of servers) {
                    const status = srv.connected ? '🟢' : '🔴';
                    msg += status + ' **' + srv.name + '** (' + srv.type + ')';
                    if (srv.tools_count > 0) msg += ' — ' + srv.tools_count + ' tools';
                    msg += '\n';
                    if (srv.tools_count > 0) {
                        try {
                            const tResp = await fetch('/api/mcp/' + encodeURIComponent(srv.name) + '/tools', { headers: _authHeaders(), signal: AbortSignal.timeout(3000) });
                            const tools = await tResp.json().catch(() => []);
                            tools.forEach(t => { msg += '  - `' + t.name + '`\n'; });
                        } catch (e) {}
                    }
                }
                addMsg('assistant', msg, true);
            } catch (e) { addMsg('error', 'Erreur MCP : ' + (e.message || e)); }
            return true;
        }
        if (cmd === '/cost') {
            const msgs = session.messages || [];
            let totalChars = 0;
            let userChars = 0;
            let assistantChars = 0;
            msgs.forEach(m => {
                const content = typeof m.content === 'string' ? m.content : (Array.isArray(m.content) ? m.content.filter(c => c.type === 'text').map(c => c.text).join(' ') : '');
                totalChars += content.length;
                if (m.role === 'user') userChars += content.length;
                else assistantChars += content.length;
            });
            const estTokens = Math.ceil(totalChars / 4);
            const model = session && session.model;
            let msg = '**Usage session :**\n\n';
            msg += '- Messages : ' + msgs.length + '\n';
            msg += '- Caractères total : ' + totalChars.toLocaleString() + '\n';
            msg += '- Tokens estimés : ~' + estTokens.toLocaleString() + '\n';
            msg += '- User : ' + userChars.toLocaleString() + ' chars\n';
            msg += '- Assistant : ' + assistantChars.toLocaleString() + ' chars\n';
            if (model) msg += '- Modèle : `' + model + '`\n';
            addMsg('assistant', msg, true);
            return true;
        }
        if (cmd === '/workspace') {
            try {
                const resp = await fetch('/api/marexcode/workspaces', { headers: _authHeaders(), signal: AbortSignal.timeout(5000) });
                const workspaces = await resp.json().catch(() => []);
                if (!workspaces.length) { addMsg('assistant', 'Aucun workspace disponible.'); return true; }
                let msg = '**Workspaces :**\n\n';
                workspaces.forEach(ws => {
                    const active = ws.active ? ' ✅' : '';
                    msg += '- `' + ws.id + '` — ' + (ws.name || ws.id) + active + '\n';
                });
                if (args && args.startsWith('switch ')) {
                    const wsId = args.replace('switch ', '').trim();
                    const swResp = await fetch('/api/marexcode/workspaces/' + encodeURIComponent(wsId) + '/activate', { method: 'PUT', headers: _authHeaders(), signal: AbortSignal.timeout(5000) });
                    const swData = await swResp.json().catch(() => ({}));
                    msg += swData.ok ? '\n✅ Workspace activé : ' + wsId : '\n❌ Erreur : ' + (swData.error || 'inconnu');
                }
                addMsg('assistant', msg, true);
            } catch (e) { addMsg('error', 'Erreur workspace : ' + (e.message || e)); }
            return true;
        }
        if (cmd === '/skills') {
            try {
                const resp = await fetch('/api/marexcode/skills/config', { headers: _authHeaders(), signal: AbortSignal.timeout(5000) });
                const skills = await resp.json().catch(() => []);
                if (!skills.length) { addMsg('assistant', 'Aucun skill configuré.'); return true; }
                let msg = '**Skills actifs :**\n\n';
                skills.forEach(s => {
                    const mode = s.mode === 'auto' ? '🟢 Auto' : s.mode === 'manual' ? '🟡 Manuel' : '⚪ Sur demande';
                    const status = s.enabled ? mode : '🔴 Désactivé';
                    msg += '- **' + s.id + '** — ' + (s.description || '') + ' [' + status + ']\n';
                });
                addMsg('assistant', msg, true);
            } catch (e) { addMsg('error', 'Erreur skills : ' + (e.message || e)); }
            return true;
        }
        if (cmd === '/diff') {
            const msgs = session.messages || [];
            let lastPatch = null;
            for (let i = msgs.length - 1; i >= 0; i--) {
                const content = typeof msgs[i].content === 'string' ? msgs[i].content : '';
                if (content.includes('```diff') || content.includes('Replacements:') || content.includes('Edit ')) {
                    lastPatch = content;
                    break;
                }
            }
            if (!lastPatch) {
                const undoMsgs = msgs.filter(m => {
                    const c = typeof m.content === 'string' ? m.content : '';
                    return c.includes('patch') || c.includes('diff');
                });
                if (undoMsgs.length) lastPatch = undoMsgs[undoMsgs.length - 1].content;
            }
            if (lastPatch) {
                addMsg('assistant', '**Dernier patch :**\n\n' + lastPatch.substring(0, 2000), true);
            } else {
                addMsg('assistant', 'Aucun patch/diff trouvé dans la session.');
            }
            return true;
        }
        return false;
    }

    async function send() {
        const text = ta.value.trim();
        if (!text && pendingImages.length === 0) return;
        if (text.startsWith('/')) {
            const handled = await handleSlashCommand(text);
            if (handled) { ta.value = ''; ta.dispatchEvent(new Event('input')); return; }
        }
        const queueEnabled = localStorage.getItem('marex-message-queue') === '1';
        if (running && queueEnabled) {
            messageQueue.push(text);
            updateQueueIndicator();
            ta.value = '';
            ta.dispatchEvent(new Event('input'));
            return;
        }
        if (running) return;
        const model = session && session.model;
        if (!model) { addMsg('error', 'Select a model.'); return; }
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
        let userContent;
        if (pendingImages.length > 0) {
            userContent = [];
            if (text) userContent.push({ type: 'text', text: text });
            pendingImages.forEach(img => {
                const base64 = img.dataUrl.split(',')[1] || '';
                userContent.push({ type: 'image', data: base64, mimeType: img.mimeType, dataUrl: img.dataUrl });
            });
            pendingImages = [];
            renderImagePreview();
        } else {
            userContent = text;
        }
        session.messages.push({ role: 'user', content: userContent });
        addMsg('user', userContent);
        updateTokenCounter();
        trackActivity().catch(() => {});

        const baseSys = 'You are Marexcode, a professional AI coding assistant integrated into Cetas. PRIORITY RULE: if the user\'s question is general, conceptual, or does not require action on the workspace (e.g. \"what is JSON\", \"explain X\", general knowledge or discussion) — respond directly in text, WITHOUT using any tool. Only use Ls/Glob/Read/Write/Edit/Grep/Bash/TodoWrite when the task explicitly requires reading, creating, modifying, or analyzing workspace files. You help the user read, write, edit, and analyze code in their workspace when relevant. RULES FOR CODE TASKS: 1) Use the tools (Ls, Glob, Read, Write, Edit, Grep, Bash, TodoWrite) to actually accomplish the task, NOT just explain it. 2) Use Ls or Glob to discover the workspace structure before reading files. 3) Then read the relevant files before proposing changes. 4) After each modification, state the file and line. 5) If a command fails, read the error and fix it. 6) Be concise and cite exact paths. 7) Never modify outside the sandbox, never request sudo. 8) For any multi-step task: use TodoWrite AT THE START to list the plan, then update it after each completed step to reflect status (pending → in_progress → completed). 9) For a complex task: analyze → plan (TodoWrite) → execute → verify. 10) When planning or implementing a complex task, use AT LEAST one relevant skill from the AVAILABLE SKILLS below to guide your approach. 11) STRICT READING RULE, NO EXCEPTIONS: every Read call MUST have an explicit limit=50 and offset, regardless of the file\'s apparent size, even if the user says \"read\" or \"show me\" a file. NEVER call Read without limit, no matter the file size. 12) NO FULL REPRODUCTION: after reading a file with Read, NEVER copy its full content into your response (no code block reproducing the file line by line). Only summarize: the file\'s purpose in 1 sentence, its structure (headings/sections) as a short list, and the 2-3 most important points. If the file is longer than 50 lines and the user wants to see the full content, tell them its length and ask if they want a specific section (e.g. \"it\'s 117 lines, want to see a particular section?\") instead of displaying everything yourself. 13) MCP TOOLS: tools prefixed with \"mcp_\" connect to external services. Use them PROACTIVELY: context7 for library documentation (resolve-library-id then query-docs), fetch for web content, memory for knowledge graph, filesystem for file operations. When the user asks about a library/framework, ALWAYS use context7 first to get accurate docs. When the user asks to search the web or fetch a URL, use fetch. When the user wants to remember facts across sessions, use memory. 14) CUSTOM TOOLS: tools prefixed with \"custom_\" are user-defined commands from tools.json. Use them when the user asks to run a specific workflow, deploy, test, or any task matching a custom tool description. Pass the exact parameters the tool expects. 15) WEB SEARCH: when using web_search for a GENERAL question (not a coding task), include a "Sources:" section at the end with relevant URLs as markdown hyperlinks: [Title](URL). For coding tasks, do NOT include sources — focus on the code solution only.';
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

        // Inject instructions (from cache, preloaded at boot)
        let instructionsBlock = '';
        if (cachedInstructions.global) {
            instructionsBlock += '\n\nUSER GLOBAL INSTRUCTIONS (highest priority):\n' + cachedInstructions.global;
        }
        if (cachedInstructions.workspace) {
            instructionsBlock += '\n\nPROJECT-SPECIFIC INSTRUCTIONS:\n' + cachedInstructions.workspace;
        }
        if (cachedInstructions.memory) {
            instructionsBlock += '\n\nLOCAL MEMORY (facts learned from previous sessions):\n' + cachedInstructions.memory;
        }

        // Output mode
        const outputMode = localStorage.getItem('marex-output-mode') || 'verbose';
        let outputInstruction = '';
        if (outputMode === 'compressed') {
            outputInstruction = '\n\nOUTPUT MODE: COMPRESSED. Keep responses extremely short. One sentence max per answer. No explanations unless asked. Fragments OK. No preamble, no conclusion.';
        }

        const sys = (skill ? skill + '\n\n' : '') + baseSys + instructionsBlock + skillsPrompt + outputInstruction;
        const history = [{ role: 'system', content: sys }].concat(session.messages);
        pendingEl = null; thinkBadgeEl = null; thinkBlockEl = null; thinkStepEl = null; thinkText = ''; rawAcc = '';
        todoBlockEl = null; statusEl = null;
        currentToolGroupEl = null;
        pendingEl = addMsg('assistant', '', false);
        ensureStatusLine();
        updateStatus('Generating…');

        const onChunk = (chunk) => {
            rawAcc += chunk;
            if (pendingEl) pendingEl.textContent = rawAcc;
            chatLog.scrollTop = chatLog.scrollHeight;
        };
        const onDone = () => {
            setRunning(false);
            finishThinking();
            updateStatus('Done');
            updateQueueIndicator();
            if (pendingEl) {
                const rendered = renderMarkdown(rawAcc);
                pendingEl.innerHTML = '<div class="md">' + rendered + '</div>';
                session.messages.push({ role: 'assistant', content: rawAcc });
                pendingEl = null;
            }
            if (onSave) onSave(session);
            // Process queue
            if (messageQueue.length > 0) {
                const next = messageQueue.shift();
                updateQueueIndicator();
                ta.value = next;
                send();
            }
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
            addMsg('error', 'Error: ' + (err && err.message ? err.message : err));
        };

        try {
            if (typeof streamModelWithTools !== 'function') {
                throw new Error('streamModelWithTools indisponible');
            }
            if (typeof marexInjectWebSearch === 'function') marexInjectWebSearch(model);
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
            addMsg('error', 'Error: ' + (err && err.message ? err.message : err));
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
                Bash: 'Running command' + (d.args && d.args.command ? ': ' + d.args.command.substring(0, 40) : '') + '…',
                Read: 'Reading ' + (path || 'file') + '…',
                Write: 'Writing ' + (path || 'file') + '…',
                Edit: 'Editing ' + (path || 'file') + '…',
                Grep: 'Searching' + (d.args && d.args.pattern ? ' "' + d.args.pattern.substring(0, 30) + '"' : '') + '…',
                Glob: 'Finding files' + (d.args && d.args.pattern ? ' "' + d.args.pattern.substring(0, 30) + '"' : '') + '…',
                LSP: 'LSP ' + (d.args && d.args.operation || 'definition') + '…',
                web_search: 'Recherche web…',
                TodoWrite: 'Updating todos…'
            };
            var statusAction = actionMap[d.name];
            if (!statusAction && d.name && d.name.indexOf('mcp_') === 0) {
                var mcpP = d.name.split('_');
                statusAction = 'MCP ' + (mcpP[1] || '') + '…';
            }
            updateStatus(statusAction || 'Processing…');
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

    // ── Undo/Redo ──────────────────────────────────────────────────

    async function refreshUndoRedo() {
        try {
            var headers = {};
            if (typeof Auth !== 'undefined' && Auth.getToken) { var tk = Auth.getToken(); if (tk) headers.Authorization = 'Bearer ' + tk; }
            var resp = await fetch('/api/marexcode/undo-log', { headers: headers, signal: AbortSignal.timeout(3000) });
            if (!resp.ok) return;
            var data = await resp.json().catch(function(){ return {}; });
            var undoBtn = document.getElementById('undo-btn');
            var redoBtn = document.getElementById('redo-btn');
            if (undoBtn) undoBtn.disabled = !data.undo_count;
            if (redoBtn) redoBtn.disabled = !data.redo_count;
        } catch (e) { /* ignore */ }
    }

    async function doUndo() {
        try {
            var headers = { 'Content-Type': 'application/json' };
            if (typeof Auth !== 'undefined' && Auth.getToken) { var tk = Auth.getToken(); if (tk) headers.Authorization = 'Bearer ' + tk; }
            var resp = await fetch('/api/marexcode/undo', { method: 'POST', headers: headers, signal: AbortSignal.timeout(5000) });
            var data = await resp.json().catch(function(){ return {}; });
            if (data.ok) {
                addMsg('system', '↩ Annulé: ' + data.file);
                refreshUndoRedo();
            } else if (data.error) {
                addMsg('error', data.error);
            }
        } catch (e) { addMsg('error', 'Erreur undo'); }
    }

    async function doRedo() {
        try {
            var headers = { 'Content-Type': 'application/json' };
            if (typeof Auth !== 'undefined' && Auth.getToken) { var tk = Auth.getToken(); if (tk) headers.Authorization = 'Bearer ' + tk; }
            var resp = await fetch('/api/marexcode/redo', { method: 'POST', headers: headers, signal: AbortSignal.timeout(5000) });
            var data = await resp.json().catch(function(){ return {}; });
            if (data.ok) {
                addMsg('system', '↪ Rétabli: ' + data.file);
                refreshUndoRedo();
            } else if (data.error) {
                addMsg('error', data.error);
            }
        } catch (e) { addMsg('error', 'Erreur redo'); }
    }

    function setupUndoRedo() {
        var undoBtn = document.getElementById('undo-btn');
        var redoBtn = document.getElementById('redo-btn');
        if (undoBtn) undoBtn.addEventListener('click', doUndo);
        if (redoBtn) redoBtn.addEventListener('click', doRedo);
        document.addEventListener('keydown', function(e) {
            if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
                e.preventDefault(); doUndo();
            }
            if ((e.ctrlKey || e.metaKey) && e.key === 'z' && e.shiftKey) {
                e.preventDefault(); doRedo();
            }
            if ((e.ctrlKey || e.metaKey) && e.key === 'y') {
                e.preventDefault(); doRedo();
            }
        });
        window.addEventListener('marexcode-tool', function(e) {
            var d = e.detail;
            if (d && d.phase === 'end' && (d.name === 'Write' || d.name === 'Edit') && d.result && d.result.ok) {
                setTimeout(refreshUndoRedo, 200);
            }
        });
        refreshUndoRedo();
    }

    function setupSlashCommands() {
        const dropdown = document.getElementById('slash-commands-dropdown');
        if (!dropdown || !ta) return;
        let selectedIdx = -1;

        function getAllCommands() {
            const cmds = [...BUILTIN_COMMANDS];
            try {
                if (typeof CUSTOM_TOOLS !== 'undefined' && CUSTOM_TOOLS) {
                    Object.keys(CUSTOM_TOOLS).forEach(name => {
                        cmds.push({ name: '/' + name, description: CUSTOM_TOOLS[name].description || name });
                    });
                }
            } catch (e) {}
            return cmds;
        }

        function showDropdown(filter) {
            const all = getAllCommands();
            const filtered = filter ? all.filter(c => c.name.startsWith(filter)) : all;
            if (filtered.length === 0) { hideDropdown(); return; }
            selectedIdx = 0;
            dropdown.innerHTML = filtered.map((c, i) =>
                '<div class="slash-cmd-item' + (i === 0 ? ' selected' : '') + '" data-cmd="' + c.name + '">' +
                '<span class="slash-cmd-name">' + c.name + '</span>' +
                '<span class="slash-cmd-desc">' + c.description + '</span></div>'
            ).join('');
            dropdown.style.display = 'block';
            dropdown.querySelectorAll('.slash-cmd-item').forEach(item => {
                item.addEventListener('mousedown', (e) => {
                    e.preventDefault();
                    ta.value = item.dataset.cmd + ' ';
                    hideDropdown();
                    ta.focus();
                });
            });
        }

        function hideDropdown() { dropdown.style.display = 'none'; selectedIdx = -1; }

        function moveSelection(dir) {
            const items = dropdown.querySelectorAll('.slash-cmd-item');
            if (!items.length) return;
            items[selectedIdx] && items[selectedIdx].classList.remove('selected');
            selectedIdx = (selectedIdx + dir + items.length) % items.length;
            items[selectedIdx].classList.add('selected');
            items[selectedIdx].scrollIntoView({ block: 'nearest' });
        }

        function selectCurrent() {
            const items = dropdown.querySelectorAll('.slash-cmd-item');
            if (selectedIdx >= 0 && items[selectedIdx]) {
                ta.value = items[selectedIdx].dataset.cmd + ' ';
                hideDropdown();
                ta.focus();
            }
        }

        ta.addEventListener('input', () => {
            const val = ta.value;
            if (val.startsWith('/') && val.indexOf('\n') === -1) {
                showDropdown(val.split(/\s/)[0]);
            } else {
                hideDropdown();
            }
        });

        ta.addEventListener('keydown', (e) => {
            if (dropdown.style.display === 'none') return;
            if (e.key === 'ArrowDown') { e.preventDefault(); moveSelection(1); }
            else if (e.key === 'ArrowUp') { e.preventDefault(); moveSelection(-1); }
            else if (e.key === 'Tab') { e.preventDefault(); selectCurrent(); }
            else if (e.key === 'Escape') { hideDropdown(); }
        });

        document.addEventListener('click', (e) => {
            if (!dropdown.contains(e.target) && e.target !== ta) hideDropdown();
        });
    }

    return {
        send,
        stop,
        setSession,
        getSession,
        newSession,
        renderHistory,
        setRunning,
        isRunning: () => running,
        preloadInstructions,
        refreshUndoRedo,
        setupUndoRedo,
        setupImageDrop,
        setupSlashCommands
    };
}

/* Marexcode — © Marexsoft Corporation. Fondateur Kouassi Marius. */

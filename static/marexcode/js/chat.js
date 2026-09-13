export const MAREX_TOOLS = (typeof MAREXCODE_TOOLS !== 'undefined') ? MAREXCODE_TOOLS : [];

const REASONING_TRANSLATE_DELAY_MS = 60000;

// Les modèles lents (DeepSeek) peuvent laisser de longues pauses entre deux
// chunks SSE. Le défaut de tool-search (120 s) coupait alors la réponse en
// plein milieu : on aligne sur le timeout socket upstream du proxy (300 s).
if (typeof window !== 'undefined' && typeof window._streamIdleTimeoutMs !== 'number') {
    window._streamIdleTimeoutMs = 300000;
}

import { getGlobalInstructions, getWorkspaceInstructions } from './api.js';
import { createMarkdownRenderer } from './markdown.js';
import { createAutoScroll } from './auto-scroll.js';
import { createTextShimmer } from './text-shimmer.js';
import { createTextReveal } from './text-reveal.js';
import { translateReasoning as translateReasoningText } from './reasoning-translate.js';
import { getModelContextWindow, formatCtxTokens } from '../../js/data/model-contexts.js';

var _ctxUsed = 0;
var _ctxMax = 32768;

export function createChat(deps) {
    const { chatLog, chatPanel, ta, sendBtn, stopBtn, onSave, onAuthRequired, getSystemPrompt, getActiveProject,
        sidePanel, sidePanelBody, sidePanelEmpty, sidePanelSpinner, sidePanelClose } = deps;
    let session = null;
    let running = false;
    let pendingEl = null, pendingMd = null, thinkBadgeEl = null, thinkBlockEl = null, thinkText = '';
    let _thinkRaf = null, _thinkOpened = false, _thinkTail = '', _thinkRendered = 0;
    let rawAcc = '';
    let controller = null;
    let userClosedPanel = false;
    let fileContents = {};
    let todoBlockEl = null;
    let statusEl = null;
    let currentToolGroupEl = null;
    let thinkStepEl = null;
    let thinkShimmer = null;
    let statusReveal = null;
    let cachedInstructions = { global: '', workspace: '' };
    let messageQueue = [];
    let pendingImages = [];
    let translateTimer = null;
    const md = createMarkdownRenderer();
    const autoScroll = createAutoScroll(chatLog);
    const panelScroll = sidePanelBody ? createAutoScroll(sidePanelBody) : null;

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
            const [globalInstr, workspaceInstr] = await Promise.all([
                getGlobalInstructions().catch(() => ({ content: '' })),
                window.activeWorkspaceId ? getWorkspaceInstructions(window.activeWorkspaceId).catch(() => ({ content: '' })) : Promise.resolve({ content: '' })
            ]);
            cachedInstructions.global = (globalInstr.content || '').trim();
            cachedInstructions.workspace = (workspaceInstr.content || '').trim();
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

    function addMsg(cls, content, useMarkdown) {
        const m = document.createElement('div');
        m.className = 'msg ' + cls;
        if (cls === 'user' || cls === 'assistant') {
            const sender = document.createElement('div');
            sender.className = 'msg-sender';
            sender.textContent = cls === 'user' ? 'Vous' : 'Marexcode';
            m.appendChild(sender);
        }
        if (Array.isArray(content)) {
            const textParts = content.filter(c => c.type === 'text').map(c => c.text).join('\n');
            const imageParts = content.filter(c => c.type === 'image');
            if (useMarkdown && cls === 'assistant' && textParts) {
                const inner = document.createElement('div');
                inner.className = 'md';
                md.render(inner, textParts);
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
            md.render(inner, content || '');
            m.appendChild(inner);
        } else {
            m.textContent = content;
        }
        chatLog.appendChild(m);
        autoScroll.onContentChange();
        return m;
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

    function addChatToolBlock(name, args, result) {
        const group = ensureToolGroup();
        const line = document.createElement('div');
        line.className = 'chat-step-line';
        const icon = getStepIcon(name);
        const label = getStepLabel(name, args, result);
        line.innerHTML = '<span class="step-icon">' + icon + '</span><span class="step-label">' + esc(label) + '</span>';
        group.appendChild(line);
        autoScroll.onContentChange();
        return line;
    }

    function ensureStatusLine() {
        if (statusEl) return statusEl;
        statusEl = document.createElement('div');
        statusEl.className = 'chat-status-line';
        statusEl.innerHTML = '<span class="status-dot"></span><span class="status-action">Ready</span><span class="status-model">' + esc(session?.model || '') + '</span>';
        statusReveal = createTextReveal(statusEl.querySelector('.status-action'));
        chatLog.appendChild(statusEl);
        autoScroll.onContentChange();
        return statusEl;
    }

    function updateStatus(action) {
        ensureStatusLine();
        const actionEl = statusEl.querySelector('.status-action');
        if (actionEl && action) {
            if (statusReveal) statusReveal.setText(action);
            else actionEl.textContent = action;
        }
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
        autoScroll.onContentChange();
    }

    function ensureThinkBadge() {
        if (thinkBadgeEl) return thinkBadgeEl;
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'think-badge';
        b.innerHTML = '<span class="think-spinner"></span><span class="think-label">Thinking</span>';
        b.addEventListener('click', () => {
            userClosedPanel = false;
            openSidePanel();
        });
        chatLog.appendChild(b);
        autoScroll.onContentChange();
        thinkShimmer = createTextShimmer(b.querySelector('.think-label'));
        thinkShimmer.start();
        thinkBadgeEl = b;
        return b;
    }

    function _ensureThinkBlock() {
        if (!thinkBlockEl && thinkText) {
            thinkBlockEl = document.createElement('div');
            thinkBlockEl.className = 'sp-think-block';
            thinkBlockEl.innerHTML = '<div class="sp-think-block-label">Reasoning</div><div class="sp-think-text"></div>';
            if (sidePanelBody) sidePanelBody.appendChild(thinkBlockEl);
        } else if (thinkBlockEl && !thinkBlockEl.isConnected && sidePanelBody) {
            sidePanelBody.appendChild(thinkBlockEl);
        }
    }

    // Rendu incrémental: on n'ajoute QUE le nouveau morceau au nœud texte
    // (appendData). Jamais de slice/textContent sur tout le texte -> pas de
    // O(n) par frame quand le raisonnement est long (lecture workspace).
    function _appendThink(chunk) {
        if (!chunk || !thinkBlockEl) return;
        const el = thinkBlockEl.querySelector('.sp-think-text');
        if (!el) return;
        let node = el.firstChild;
        if (!node || node.nodeType !== 3) {
            el.textContent = '';
            node = document.createTextNode('');
            el.appendChild(node);
        }
        node.appendData(chunk);
    }

    function _flushThinkTail() {
        if (!_thinkTail) return;
        _ensureThinkBlock();
        _appendThink(_thinkTail);
        _thinkRendered += _thinkTail.length;
        _thinkTail = '';
    }

    function _thinkTick() {
        _thinkRaf = null;
        const mode = localStorage.getItem('marex-thinking-mode') || 'all';
        if (mode === 'hidden') return;
        if (!_thinkOpened) {
            _thinkOpened = true;
            ensureThinkBadge();
            openSidePanel();
            if (sidePanelSpinner) sidePanelSpinner.style.display = 'block';
        }
        _ensureThinkBlock();
        const backlog = _thinkTail.length;
        if (backlog) {
            let cut = 0;
            if (backlog > 2000) {
                cut = Math.ceil(backlog / 4);     // rattrapage rapide si très en retard
            } else {
                // Révélation mot par mot, plus rapide si le réseau prend l'avance.
                let words = backlog > 600 ? 8 : backlog > 240 ? 4 : backlog > 80 ? 2 : 1;
                while (words > 0 && cut < backlog) {
                    const sp = _thinkTail.indexOf(' ', cut);
                    if (sp === -1) { cut = backlog; break; }
                    cut = sp + 1;
                    words--;
                }
            }
            _appendThink(_thinkTail.slice(0, cut));
            _thinkTail = _thinkTail.slice(cut);
            _thinkRendered += cut;
        }
        if (sidePanelBody && panelScroll) panelScroll.onContentChange();
        if (_thinkTail) _thinkRaf = requestAnimationFrame(_thinkTick);
    }

    function _resetThinkStream() {
        if (_thinkRaf !== null) { cancelAnimationFrame(_thinkRaf); _thinkRaf = null; }
        _thinkOpened = false;
        _thinkTail = '';
        _thinkRendered = 0;
    }

    function onThinking(t) {
        const mode = localStorage.getItem('marex-thinking-mode') || 'all';
        if (mode === 'hidden') return;
        if (thinkText === '') {           // 1er delta du raisonnement du tour
            userClosedPanel = false;      // ré-autorise l'ouverture automatique
            openSidePanel();              // ouvre le panneau immédiatement
        }
        thinkText += t;
        _thinkTail += t;
        if (_thinkRaf === null) _thinkRaf = requestAnimationFrame(_thinkTick);
    }

    function _callOpenRouterFree(model, prompt) {
        if (typeof proxyUrl !== 'function' || typeof proxyHeaders !== 'function') {
            throw new Error('proxy helpers indisponibles');
        }
        const url = proxyUrl('openrouter', 'https://openrouter.ai/api/v1/chat/completions');
        const headers = Object.assign({ 'Content-Type': 'application/json' }, proxyHeaders('openrouter', {}));
        return fetch(url, {
            method: 'POST',
            headers: headers,
            body: JSON.stringify({ model: model, messages: [{ role: 'user', content: prompt }], stream: false }),
        }).then(function (res) {
            if (!res.ok) { const err = new Error('HTTP ' + res.status); err.status = res.status; throw err; }
            return res.json();
        }).then(function (data) {
            const choice = data && data.choices && data.choices[0];
            const msg = choice && choice.message;
            return { text: (msg && msg.content) || '' };
        });
    }

    function _callTranslationModel(step, prompt) {
        if (step && step.provider === 'openrouter') return _callOpenRouterFree(step.model, prompt);
        if (typeof streamText !== 'function') throw new Error('streamText indisponible');
        return streamText(step.model, prompt);
    }

    async function translateReasoning(raw) {
        return translateReasoningText(raw, _callTranslationModel, function (info) {
            console.debug('[reasoning-translate] ' + info.provider + ' → ' + info.reason + (info.sample ? ' | ' + info.sample : ''));
        });
    }

    // Termine TOUS les badges "Thinking" du fil (y compris ceux des phases
    // précédentes autour d'un appel d'outil) : ajoute .done et retire le
    // shimmer qui ne suit que le dernier badge créé.
    function _markAllThinkDone() {
        if (thinkBadgeEl) thinkBadgeEl.classList.add('done');
        if (chatLog && chatLog.querySelectorAll) {
            chatLog.querySelectorAll('.think-badge').forEach(function (b) {
                b.classList.add('done');
                var label = b.querySelector('.think-label');
                if (label) label.classList.remove('text-shimmer');
            });
        }
        if (thinkShimmer) { thinkShimmer.stop(); thinkShimmer = null; }
        if (sidePanelSpinner) sidePanelSpinner.style.display = 'none';
    }

    function markThinkingDone() {
        // Termine la phase de raisonnement courante dès qu'un outil démarre :
        // flush le reste du buffer (incrémental) puis marque le badge done.
        if (_thinkRaf !== null) { cancelAnimationFrame(_thinkRaf); _thinkRaf = null; }
        _flushThinkTail();
        _markAllThinkDone();
        thinkBadgeEl = null;
        _thinkOpened = false;
    }

    function finishThinking() {
        _resetThinkStream();
        // Garantie: aucun badge "Thinking" ni shimmer ne doit rester actif en fin de tour
        _markAllThinkDone();
        const raw = thinkText;
        thinkText = '';
        const mode = localStorage.getItem('marex-thinking-mode') || 'all';
        if (raw && mode !== 'hidden') {
            if (!thinkBlockEl) {
                thinkBlockEl = document.createElement('div');
                thinkBlockEl.className = 'sp-think-block';
                thinkBlockEl.innerHTML = '<div class="sp-think-block-label">Reasoning</div><div class="sp-think-text"></div>';
                if (sidePanelBody) sidePanelBody.appendChild(thinkBlockEl);
                openSidePanel();
            }
            const txt = thinkBlockEl.querySelector('.sp-think-text');
            if (txt) {
                txt.textContent = raw;
                if (translateTimer) clearTimeout(translateTimer);
                translateTimer = setTimeout(() => {
                    translateTimer = null;
                    if (!txt.isConnected) return;
                    translateReasoning(raw).then((fr) => { if (fr && txt.isConnected) txt.textContent = fr; });
                }, REASONING_TRANSLATE_DELAY_MS);
            }
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
                if (pendingMd) md.finalize(pendingMd, rawAcc);
                session.messages.push({ role: 'assistant', content: rawAcc });
                pendingEl = null;
                pendingMd = null;
            }
            if (onSave) onSave(session);
        }
    }

    function setSession(s) {
        if (translateTimer) { clearTimeout(translateTimer); translateTimer = null; }
        session = s;
        window._marexSessionId = s && s.id ? s.id : '';
        thinkBadgeEl = null; thinkBlockEl = null; thinkStepEl = null;
        _resetThinkStream();
        pendingMd = null;
        resetSidePanel();
        renderHistory();
        setChatVisible((session.messages || []).length > 0);
    }

    function getSession() {
        return session;
    }

    function newSession() {
        if (translateTimer) { clearTimeout(translateTimer); translateTimer = null; }
        session = { id: null, title: 'Nouvelle conversation', model: session && session.model ? session.model : null, messages: [] };
        chatLog.innerHTML = '';
        fileContents = {};
        setChatVisible(false);
        pendingEl = null; pendingMd = null; thinkBadgeEl = null; thinkBlockEl = null; thinkStepEl = null; thinkText = '';
        todoBlockEl = null; statusEl = null;
        _resetThinkStream();
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

    async function fetchMemIndex(sessionId) {
        var headers = _authHeaders();
        var resp = await fetch('/api/marexcode/memory/' + encodeURIComponent(sessionId) + '/index', { headers: headers, signal: AbortSignal.timeout(5000) });
        if (!resp.ok) return null;
        return await resp.json().catch(function() { return null; });
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
        if (translateTimer) { clearTimeout(translateTimer); translateTimer = null; }
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

        const layer1_identity = 'You are Marexcode, a senior coding/software-engineering/agentic-AI expert integrated into Cetas, with very high coding reasoning and technical expertise. Also handles general questions, but core strength is code and agentic tasks.';

        const layer2_rules = 'CORE RULES:\n1. VERACITY: Never invent. Only verifiable info; say so if uncertain.\n2. NO HALLUCINATION: If unsure about a pattern/API/library behavior, say so. Never fabricate functions/syntax.\n3. WEB RESEARCH: Search when info is post-cutoff, doubtful, recent, or requested. Native models (OpenAI, Anthropic, Grok, OpenCode) use built-in search; others use internal tools.\n4. FLOW: PLAN → CODE → VERIFY. Plan first (TodoWrite for multi-step), implement with tools, then verify (read/test/check errors).\n5. TOOLS: Ls/Glob to discover structure first; Read with limit=50+offset for large files; Write/Edit with exact paths/lines; Grep for patterns; Bash for build/test/validate.\n6. PRIVACY: Never reveal infrastructure/backend/server/architecture details.\n7. RIGOR: Professional, no filler, concise, cite exact file paths and line numbers.\n8. CODE QUALITY: Clean, maintainable, best practices, proper error handling, meaningful names.';

        const layer3_date = '\n\nCurrent date: ' + new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }) + '.';
        const skill = getSystemPrompt ? getSystemPrompt() : '';

        let skillsPrompt = ''; // skills déconnectés de Marexcode (économie tokens) — plus d'appel listSkillsConfig()

        let instructionsBlock = '';
        if (cachedInstructions.global) {
            instructionsBlock += '\n\nUSER GLOBAL INSTRUCTIONS (highest priority):\n' + cachedInstructions.global;
        }
        if (cachedInstructions.workspace) {
            instructionsBlock += '\n\nPROJECT-SPECIFIC INSTRUCTIONS:\n' + cachedInstructions.workspace;
        }

        const outputMode = localStorage.getItem('marex-output-mode') || 'verbose';
        let outputInstruction = '';
        if (outputMode === 'compressed') {
            outputInstruction = '\n\nOUTPUT MODE: COMPRESSED. One sentence max.';
        }

        const sys = (skill ? skill + '\n\n' : '') + layer1_identity + '\n\n' + layer2_rules + layer3_date + instructionsBlock + skillsPrompt + outputInstruction;
        const customSys = (typeof window._marexCustomSysPrompt === 'string' && window._marexCustomSysPrompt) ? '\n\nUSER CUSTOM INSTRUCTIONS:\n' + window._marexCustomSysPrompt : '';
        const history = [{ role: 'system', content: sys + customSys }].concat(session.messages);
        pendingEl = null; pendingMd = null; thinkBadgeEl = null; thinkBlockEl = null; thinkStepEl = null; thinkText = ''; rawAcc = '';
        userClosedPanel = false;
        _resetThinkStream();
        todoBlockEl = null; statusEl = null;
        currentToolGroupEl = null;
        pendingEl = addMsg('assistant', '', false);
        pendingMd = document.createElement('div');
        pendingMd.className = 'md';
        pendingEl.appendChild(pendingMd);
        ensureStatusLine();
        updateStatus('Generating…');

        const onChunk = (chunk) => {
            rawAcc += chunk;
            if (pendingMd) md.update(pendingMd, rawAcc);
            else if (pendingEl) pendingEl.textContent = rawAcc;
            autoScroll.onContentChange();
        };
        const onDone = (usage, citations, stats) => {
            setRunning(false);
            finishThinking();
            updateStatus('Done');
            updateQueueIndicator();
            if (pendingEl) {
                if (pendingMd) md.finalize(pendingMd, rawAcc);
                session.messages.push({ role: 'assistant', content: rawAcc });
                pendingEl = null;
                pendingMd = null;
            }
            if (stats && stats.elapsedMs) {
                showTurnStats(stats, rawAcc);
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
                if (pendingMd) md.finalize(pendingMd, rawAcc);
                if (rawAcc) session.messages.push({ role: 'assistant', content: rawAcc });
                pendingEl = null;
                pendingMd = null;
            }
            if (err && err.message === 'AUTH_REQUIRED') { if (onAuthRequired) onAuthRequired(); return; }
            addMsg('error', 'Error: ' + (err && err.message ? err.message : err));
        };

        try {
            if (typeof streamModelWithTools !== 'function') {
                throw new Error('streamModelWithTools indisponible');
            }
            var webSearchEnabled = true;
            try { webSearchEnabled = localStorage.getItem('marex-web-search') !== '0'; } catch (e) {}
            if (typeof marexInjectWebSearch === 'function') marexInjectWebSearch(model, webSearchEnabled);

            var allTools = MAREX_TOOLS.concat(typeof MEM_TOOLS !== 'undefined' ? MEM_TOOLS : []);

            var memMode = 'always';
            try { memMode = localStorage.getItem('marex-mem-mode') || 'always'; } catch (e) {}
            if (memMode === 'off') {
                allTools = allTools.filter(function(t) { return !t.function.name.startsWith('mem_'); });
            }

            if (window._marexSessionId && typeof fetchMemIndex === 'function' && memMode !== 'off') {
                try {
                    var memIdx = await fetchMemIndex(window._marexSessionId);
                    if (memIdx && memIdx.content) {
                        history = [{ role: 'system', content: 'Index memoire de cette session (titres, pas contenu). Utilise mem_read pour lire une page.\n\n' + memIdx.content }].concat(history);
                    }
                } catch (e) { }
            }

            var chatDedup = {};
            await streamModelWithTools(
                model,
                history,
                onChunk,
                onDone,
                onError,
                allTools,
                true,
                (t) => onThinking(t),
                controller.signal,
                null, { _dedup: chatDedup }, 0
            );
        } catch (err) {
            setRunning(false);
            finishThinking();
            if (pendingEl) {
                if (pendingMd) md.finalize(pendingMd, rawAcc);
                if (rawAcc) session.messages.push({ role: 'assistant', content: rawAcc });
                pendingEl = null;
                pendingMd = null;
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
            rawAcc = '';
            markThinkingDone();
            const _line = addChatToolBlock(d.name, d.args, { pending: true });
            if (_line) _line._t0 = Date.now();
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
                if (last._t0) {
                    let durEl = last.querySelector('.step-duration');
                    if (!durEl) {
                        durEl = document.createElement('span');
                        durEl.className = 'step-duration';
                        last.appendChild(durEl);
                    }
                    durEl.textContent = (Date.now() - last._t0) + 'ms';
                    last._t0 = 0;
                }
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

    function showTurnStats(stats, content) {
        const el = document.createElement('div');
        el.className = 'chat-turn-stats';
        const secs = (stats.elapsedMs / 1000).toFixed(1);
        const chars = (content || '').length;
        const estTokens = Math.ceil(chars / 4);
        let txt = secs + 's';
        if (estTokens > 0) txt += ' · ' + estTokens + ' tok';
        if (stats.elapsedMs > 0 && estTokens > 0) {
            const tokPerSec = (estTokens / (stats.elapsedMs / 1000)).toFixed(1);
            txt += ' · ' + tokPerSec + ' tok/s';
        }
        el.textContent = txt;
        chatLog.appendChild(el);
        autoScroll.onContentChange();
        updateCtxCounter(estTokens);
    }

    function updateCtxCounter(newTokens) {
        _ctxUsed += newTokens;
        var ctxEl = document.getElementById('ctx-counter');
        if (!ctxEl) {
            ctxEl = document.createElement('div');
            ctxEl.id = 'ctx-counter';
            ctxEl.className = 'ctx-counter';
            if (sidePanelBody) sidePanelBody.insertBefore(ctxEl, sidePanelBody.firstChild);
        }
        var model = session && session.model;
        if (typeof getModelContextWindow === 'function') {
            _ctxMax = getModelContextWindow(model);
        }
        var pct = Math.min(100, Math.round(_ctxUsed * 100 / _ctxMax));
        var color = pct >= 90 ? '#ef4444' : pct >= 70 ? '#eab308' : '#22c55e';
        ctxEl.innerHTML = '<span style="color:' + color + '">' + formatCtxTokens(_ctxUsed) + ' / ' + formatCtxTokens(_ctxMax) + '</span>';
        ctxEl.title = _ctxUsed.toLocaleString('fr') + ' / ' + _ctxMax.toLocaleString('fr') + ' tokens (' + pct + '%)';
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

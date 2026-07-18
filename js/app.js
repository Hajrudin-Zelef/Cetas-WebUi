// ============================================================
// Cetas v3.2 — Point d'entrée (module ES6)
// ============================================================
import { STATE, STREAM_ERROR_CONTENT, CAT_PRESET_COLORS, TEXT_EXTENSIONS, isStreamActive } from './state.js';
import './dom.js';
import { escHtml, escHtmlAttr, safeUrl, isTextFile, arrayBufferToBase64, isPdf, getModelLabel, fmtTokens, fmtCost } from './utils.js';
import { applyTheme, initTheme, setOnThemeChange } from './theme.js';
import { initLightbox } from './lightbox.js';
import { initAttachments, setAttachStateChange, cancelAllPendingLoads, renderAttachPreview, processAttachedFile } from './attachments.js';

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

const catSelect = document.getElementById('cat-select');
const catSelectLabel = catSelect.querySelector('.cat-select-label');
const catSelectDropdown = document.getElementById('cat-select-dropdown');
const catModalOverlay = document.getElementById('cat-modal-overlay');
const catModalTitle = document.getElementById('cat-modal-title');
const catModalNom = document.getElementById('cat-modal-nom');
const catModalIcone = document.getElementById('cat-modal-icone');
const catColorGrid = document.getElementById('cat-color-grid');
const catModalSave = document.getElementById('cat-modal-save');
const catModalDelete = document.getElementById('cat-modal-delete');
const catModalBack = document.getElementById('cat-modal-back');
const catModalCancel = document.getElementById('cat-modal-cancel');
const catManageBtn = document.getElementById('cat-manage-btn');
const catManageListView = document.getElementById('cat-manage-list-view');
const catManageEditView = document.getElementById('cat-manage-edit-view');
const catManageList = document.getElementById('cat-manage-list');
const catManageAddBtn = document.getElementById('cat-manage-add-btn');
const catManageClose = document.getElementById('cat-manage-close');


// [→ state.js] CAT_PRESET_COLORS, STREAM_ERROR_CONTENT, TEXT_EXTENSIONS importés

// Générer les pastilles de couleur
CAT_PRESET_COLORS.forEach(c => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'cat-color-swatch';
    btn.dataset.color = c;
    btn.style.background = c;
    btn.title = c;
    catColorGrid.appendChild(btn);
});

catColorGrid.addEventListener('click', (e) => {
    const swatch = e.target.closest('.cat-color-swatch');
    if (!swatch) return;
    catColorGrid.querySelectorAll('.cat-color-swatch').forEach(s => s.classList.remove('selected'));
    swatch.classList.add('selected');
    STATE._selectedCatColor = swatch.dataset.color;
});

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
        const title = item.querySelector('.conv-item-title').textContent.toLowerCase();
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

// --- Export Markdown ---
const shareBtn = document.getElementById('share-btn');
const shareMenu = document.getElementById('share-menu');
const summaryBtn = document.getElementById('summary-btn');

function updateExportMdBtn() {
    const show = STATE.conversationHistory.length > 0 ? '' : 'none';
    shareBtn.style.display = show;
    summaryBtn.style.display = show;
}

// [→ utils.js] getModelLabel importé

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

// --- Share button toggle ---
shareBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    shareMenu.classList.toggle('open');
});

document.addEventListener('click', (e) => {
    if (!shareMenu.contains(e.target) && e.target !== shareBtn) {
        shareMenu.classList.remove('open');
    }
});

// --- Export Markdown ---
document.getElementById('share-menu-md').addEventListener('click', () => {
    shareMenu.classList.remove('open');
    if (STATE.conversationHistory.length === 0) return;

    const activeModel = STATE.currentModel || STATE.currentImageModel || STATE.currentSearchModel || 'inconnu';
    const date = STATE.conversationStartTime ? new Date(STATE.conversationStartTime).toLocaleString('fr-FR') : '';

    const displayCost = STATE.totalCost + STATE.totalImageCost + STATE.totalAudioCost;
    const costStr = displayCost > 0 ? `$${displayCost.toFixed(4)}` : '—';

    // Collecter les modèles utilisés dans l'ordre
    function getModelType(modelId) {
        if (IMAGE_MODELS.some(m => m.id === modelId)) return 'Image';
        if (SEARCH_MODELS.some(m => m.id === modelId)) return 'Recherche';
        return 'Texte';
    }
    const switches = STATE.conversationHistory.filter(m => m.type === 'model-switch');
    const usedModels = [];
    const firstModel = switches.length > 0 ? switches[0].from : activeModel;
    usedModels.push(firstModel);
    for (const sw of switches) {
        if (usedModels[usedModels.length - 1] !== sw.to) usedModels.push(sw.to);
    }

    let md = `# Conversation Cetas\n\n`;
    if (usedModels.length === 1) {
        md += `**Modèle** : ${getModelLabel(usedModels[0])} *(${getModelType(usedModels[0])})*  \n`;
    } else {
        md += `**Modèles utilisés** :  \n`;
        for (const mid of usedModels) {
            md += `- ${getModelLabel(mid)} *(${getModelType(mid)})*  \n`;
        }
    }
    if (date) md += `**Date** : ${date}  \n`;
    if (STATE.currentSystemPrompt) md += `**Rôle** : ${STATE.currentSystemPrompt.nom}  \n`;
    md += `**Recherche web** : ${STATE.currentSearchModel ? 'Activée' : 'Désactivée'}  \n`;
    md += `**Tokens** : ${STATE.totalInputTokens.toLocaleString('fr-FR')} entrée / ${STATE.totalOutputTokens.toLocaleString('fr-FR')} sortie  \n`;
    md += `**Coût estimé** : ${costStr}  \n`;
    md += `\n---\n\n`;

    for (const msg of STATE.conversationHistory) {
        if (msg.type === 'model-switch') {
            md += `> **${getModelLabel(msg.from)}** *(${getModelType(msg.from)})* → **${getModelLabel(msg.to)}** *(${getModelType(msg.to)})*\n\n---\n\n`;
            continue;
        }

        const role = msg.role === 'user' ? '🧑 Utilisateur' : '🤖 Assistant';
        md += `## ${role}\n\n`;

        if (typeof msg.content === 'string') {
            md += msg.content + '\n\n';
        } else if (Array.isArray(msg.content)) {
            for (const part of msg.content) {
                if (part.type === 'text') {
                    md += part.text + '\n\n';
                } else if (part.type === 'image') {
                    md += `*[Image jointe]*\n\n`;
                } else if (part.type === 'file') {
                    md += `*[Fichier joint : ${part.name}]*\n\n`;
                }
            }
        }

        if (msg.citations && msg.citations.length > 0) {
            md += `**Sources :**\n`;
            msg.citations.forEach((cit, i) => {
                const url = typeof cit === 'string' ? cit : cit.url;
                const title = typeof cit === 'string' ? url : (cit.title || url);
                md += `${i + 1}. [${title}](${url})\n`;
            });
            md += '\n';
        }

        md += `---\n\n`;
    }

    const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const safeName = (STATE.conversationId || 'conversation').replace(/[^a-zA-Z0-9àâéèêëïîôùûüçÀÂÉÈÊËÏÎÔÙÛÜÇ _-]/g, '_');
    a.download = `${safeName}.md`;
    a.click();
    URL.revokeObjectURL(url);
});

// --- Export HTML autonome ---
document.getElementById('share-menu-html').addEventListener('click', () => {
    shareMenu.classList.remove('open');
    if (STATE.conversationHistory.length === 0) return;

    const activeModel = STATE.currentModel || STATE.currentImageModel || STATE.currentSearchModel || 'inconnu';
    const date = STATE.conversationStartTime ? new Date(STATE.conversationStartTime).toLocaleString('fr-FR') : '';
    const displayCost = STATE.totalCost + STATE.totalImageCost + STATE.totalAudioCost;
    const costStr = displayCost > 0 ? `$${displayCost.toFixed(4)}` : '\u2014';
    const title = STATE.conversationTitle || 'Conversation Cetas';

    // Collecter tous les modèles utilisés dans l'ordre chronologique
    const switches = STATE.conversationHistory.filter(m => m.type === 'model-switch');
    const usedModels = [];
    const firstModel = switches.length > 0 ? switches[0].from : activeModel;
    if (firstModel) usedModels.push(firstModel);
    for (const sw of switches) {
        if (usedModels[usedModels.length - 1] !== sw.to) usedModels.push(sw.to);
    }
    const modelsHtml = usedModels.map(m => `<span class="chip">${escHtml(getModelLabel(m))}</span>`).join('');

    let messagesHtml = '';
    for (const msg of STATE.conversationHistory) {
        if (msg.type === 'model-switch') {
            messagesHtml += `<div class="model-switch">\u2500\u2500\u2500 ${escHtml(getModelLabel(msg.from))} \u2192 ${escHtml(getModelLabel(msg.to))} \u2500\u2500\u2500</div>`;
            continue;
        }
        const role = msg.role;
        let contentHtml = '';
        let imagesHtml = '';
        let filesHtml = '';
        // Helper pour sanitizer le HTML dans l'export
        function _sanitizeExportHtml(raw) {
            if (typeof DOMPurify !== 'undefined') {
                return DOMPurify.sanitize(marked.parse(raw), { ADD_ATTR: ['target', 'rel'] });
            }
            return escHtml(raw);
        }
        if (typeof msg.content === 'string') {
            contentHtml = role === 'assistant' ? _sanitizeExportHtml(msg.content) : `<p>${escHtml(msg.content).replace(/\n/g, '<br>')}</p>`;
        } else if (Array.isArray(msg.content)) {
            for (const part of msg.content) {
                if (part.type === 'text') {
                    contentHtml += role === 'assistant' ? _sanitizeExportHtml(part.text) : `<p>${escHtml(part.text).replace(/\n/g, '<br>')}</p>`;
                } else if (part.type === 'image') {
                    const src = part.dataUrl || (part.data ? `data:${part.mimeType || 'image/png'};base64,${part.data}` : '');
                    if (src) imagesHtml += `<img class="message-image" src="${escHtmlAttr(src)}" alt="Image">`;
                } else if (part.type === 'file') {
                    filesHtml += `<div class="file-chip">\uD83D\uDCC4 ${escHtml(part.name || 'fichier')}</div>`;
                }
            }
        }
        if (msg.citations && msg.citations.length > 0) {
            contentHtml += '<div class="citations"><strong>Sources :</strong><ol>';
            msg.citations.forEach(cit => {
                const url = typeof cit === 'string' ? cit : cit.url;
                const t = typeof cit === 'string' ? url : (cit.title || url);
                contentHtml += `<li><a href="${escHtml(safeUrl(url))}" target="_blank" rel="noopener noreferrer">${escHtml(t)}</a></li>`;
            });
            contentHtml += '</ol></div>';
        }
        const bubbleInner = `${contentHtml}${imagesHtml}${filesHtml}`;
        messagesHtml += `<div class="message-row ${role}"><div class="message ${role}">${bubbleInner}</div></div>`;
    }

    const htmlDoc = `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escHtml(title)}</title>
<style>
:root{--bg:#fff;--text:#1a1a1a;--msg-user:#e8e8ea;--msg-asst:#f4f4f5;--border:#e0e0e0;--secondary:#888}
.dark{--bg:#1a1a1a;--text:#e0e0e0;--msg-user:#2f2f33;--msg-asst:#26262a;--border:#333;--secondary:#999}
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:var(--bg);color:var(--text);padding:24px;max-width:900px;margin:0 auto;line-height:1.6}
.header{margin-bottom:28px;padding-bottom:20px;border-bottom:1px solid var(--border)}
.header h1{font-size:1.5rem;margin-bottom:14px;font-weight:600}
.meta-grid{display:grid;grid-template-columns:auto 1fr;gap:6px 14px;font-size:0.85rem}
.meta-label{color:var(--secondary);font-weight:500}
.meta-value{color:var(--text)}
.chip{display:inline-block;background:var(--msg-asst);border:1px solid var(--border);border-radius:999px;padding:2px 10px;margin:0 4px 4px 0;font-size:0.8rem}
.dark .chip{background:var(--msg-user)}
.theme-btn{position:fixed;top:12px;right:12px;background:var(--msg-user);border:1px solid var(--border);border-radius:8px;padding:6px 10px;cursor:pointer;color:var(--text);font-size:0.8rem}
.message-row{display:flex;margin-bottom:12px}
.message-row.user{justify-content:flex-end}
.message-row.assistant{justify-content:flex-start}
.message{padding:12px 16px;border-radius:18px;max-width:75%;word-wrap:break-word;overflow-wrap:break-word}
.message.user{background:var(--msg-user);border-bottom-right-radius:4px}
.message.assistant{background:var(--msg-asst);border-bottom-left-radius:4px}
.message>p:not(:last-child),.message>ul:not(:last-child),.message>ol:not(:last-child),.message>pre:not(:last-child),.message>h1:not(:last-child),.message>h2:not(:last-child),.message>h3:not(:last-child),.message>blockquote:not(:last-child){margin-bottom:0.5em}
.message-image{max-width:100%;border-radius:10px;margin-top:8px;display:block}
.file-chip{display:inline-block;padding:6px 10px;margin-top:6px;border:1px solid var(--border);border-radius:8px;font-size:0.85em}
.model-switch{text-align:center;font-size:0.8rem;color:var(--secondary);padding:12px 0}
pre{background:rgba(0,0,0,0.06);border-radius:8px;padding:12px;overflow-x:auto;font-size:0.85rem}
.dark pre{background:rgba(255,255,255,0.08)}
code{background:rgba(0,0,0,0.05);border-radius:3px;padding:1px 4px;font-size:0.88em}
.dark code{background:rgba(255,255,255,0.1)}
pre code{background:none;padding:0}
table{border-collapse:collapse;font-size:0.9em}
th,td{border:1px solid var(--border);padding:4px 10px}
blockquote{border-left:3px solid var(--border);padding:0.2em 0 0.2em 12px;color:var(--secondary)}
.citations{margin-top:10px;font-size:0.85em}
.citations ol{padding-left:1.2em}
.citations a{color:var(--text)}
a{color:inherit}
</style>
</head>
<body>
<button class="theme-btn" onclick="document.body.classList.toggle('dark');localStorage.setItem('t',document.body.classList.contains('dark')?'d':'l')">\u263e Th\u00e8me</button>
<div class="header">
<h1>${escHtml(title)}</h1>
<div class="meta-grid">
<div class="meta-label">${usedModels.length > 1 ? 'Mod\u00e8les' : 'Mod\u00e8le'}</div>
<div class="meta-value">${modelsHtml || escHtml(getModelLabel(activeModel))}</div>
${date ? `<div class="meta-label">Date</div><div class="meta-value">${escHtml(date)}</div>` : ''}
<div class="meta-label">Tokens</div>
<div class="meta-value">${STATE.totalInputTokens.toLocaleString('fr-FR')} entr\u00e9e \u00b7 ${STATE.totalOutputTokens.toLocaleString('fr-FR')} sortie</div>
<div class="meta-label">Co\u00fbt estim\u00e9</div>
<div class="meta-value">${escHtml(costStr)}</div>
</div>
</div>
${messagesHtml}
<script>if(localStorage.getItem('t')==='d')document.body.classList.add('dark')</script>
</body>
</html>`;

    const blob = new Blob([htmlDoc], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const safeName = (STATE.conversationId || 'conversation').replace(/[^a-zA-Z0-9àâéèêëïîôùûüçÀÂÉÈÊËÏÎÔÙÛÜÇ _-]/g, '_');
    a.download = `${safeName}.html`;
    a.click();
    URL.revokeObjectURL(url);
});

// [→ utils.js] escHtml importé

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
    // Clic sur le header entier
    toggle.closest('.sp-header').addEventListener('click', (e) => {
        if (e.target.closest('.sp-add-btn')) return;
        toggle.click();
    });
    // Restaurer l'état
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

// Re-vérifier au resize
window.addEventListener('resize', () => {
    if (_isMobile() && !sidebar.classList.contains('collapsed')) {
        sidebar.classList.add('collapsed');
    }
    _updateSidebarState();
});

// --- Panneau droit (Rôle) + toolbar latérale (gear + canvas) ---
const rightPanel = document.getElementById('right-panel');
const rightPanelToggle = document.getElementById('right-panel-toggle');
const spTextarea = document.getElementById('sp-textarea');
const sideToggleSettings = document.getElementById('side-toggle-settings');
const sideToggleCanvas = document.getElementById('side-toggle-canvas');

function isRightPanelOpen() {
    // Panneau droit migré dans Configuration → toujours fermé
    return false;
}
function isCanvasPanelOpen() {
    const p = document.getElementById('canvas-panel');
    return !!(p && p.style.display === 'flex');
}

function setRightPanelOpen(open) {
    // Panneau droit migré dans Configuration → no-op
    updateSideToolbarState();
}

function setCanvasPanelOpen(open) {
    if (!window.Canvas) return;
    if (open) {
        if (!window.Canvas.isActive()) return; // ne peut s'ouvrir que si canvas actif
        window.Canvas.showPanel();
    } else {
        window.Canvas.hidePanel();
    }
    // showPanel/hidePanel déclenchent canvas-state-change → toolbar sync automatique
}

function updateSideToolbarState() {
    if (sideToggleSettings) {
        // Le panneau droit est dans Configuration → toujours afficher le bouton
        sideToggleSettings.style.display = '';
        sideToggleSettings.classList.remove('active');
        sideToggleSettings.title = 'Réglages de la conversation';
    }
    if (sideToggleCanvas) {
        const canvasActive = !!(window.Canvas && window.Canvas.isActive());
        sideToggleCanvas.style.display = canvasActive ? '' : 'none';
        sideToggleCanvas.classList.toggle('active', isCanvasPanelOpen());
        sideToggleCanvas.title = isCanvasPanelOpen() ? 'Masquer le canvas' : 'Ouvrir le canvas';
        const countSpan = sideToggleCanvas.querySelector('.side-canvas-count');
        if (countSpan && window.Canvas && window.Canvas._state && window.Canvas._state.files) {
            const n = Object.keys(window.Canvas._state.files).length;
            countSpan.textContent = n > 0 ? String(n) : '';
        }
    }
}

// Toggles mutuellement exclusifs : ouvrir un volet ferme l'autre.
function toggleSettingsPanel() {
    if (isCanvasPanelOpen()) {
        setCanvasPanelOpen(false);
        setRightPanelOpen(true);
    } else if (isRightPanelOpen()) {
        setRightPanelOpen(false);
    } else {
        setRightPanelOpen(true);
    }
}
function toggleCanvasPanel() {
    if (!window.Canvas || !window.Canvas.isActive()) return;
    if (isCanvasPanelOpen()) {
        setCanvasPanelOpen(false);
    } else {
        // S'assurer que le volet réglages est replié avant d'afficher le canvas
        if (isRightPanelOpen()) setRightPanelOpen(false);
        setCanvasPanelOpen(true);
    }
}

// sideToggleSettings → redirigé vers Config (onglet Conversation) dans initConversationPanel()
if (sideToggleCanvas) sideToggleCanvas.addEventListener('click', toggleCanvasPanel);

// Garder toolbar active sur changements du canvas (activation, ouverture, fichiers, resize)
document.addEventListener('canvas-state-change', () => {
    // Dès que le canvas s'ouvre, replier le volet réglages (mutually exclusive)
    if (isCanvasPanelOpen() && isRightPanelOpen()) {
        setRightPanelOpen(false);
    }
    updateSideToolbarState();
    syncSideToolbarCanvasWidth();
});

// Mise à jour de --side-toolbar-right d'après la largeur du canvas
function syncSideToolbarCanvasWidth() {
    const panel = document.getElementById('canvas-panel');
    if (!panel) return;
    if (panel.style.display !== 'flex') return; // canvas pas affiché
    const w = panel.getBoundingClientRect().width;
    if (w > 0) {
        document.body.style.setProperty('--side-toolbar-right', (w - 16) + 'px');
    }
}
if (window.ResizeObserver) {
    const _canvasPanel = document.getElementById('canvas-panel');
    if (_canvasPanel) {
        new ResizeObserver(syncSideToolbarCanvasWidth).observe(_canvasPanel);
    }
}

// chatHeaderSettings → redirigé vers Config (onglet Conversation) dans initConversationPanel()

// Onglets du volet droit
function setRightPanelTab(tabName) {
    const tabs = document.querySelectorAll('.rp-tab');
    let activeTab = null;
    tabs.forEach(t => {
        const isActive = t.dataset.rpTab === tabName;
        t.classList.toggle('active', isActive);
        if (isActive) activeTab = t;
    });
    document.querySelectorAll('.rp-tab-content').forEach(c => c.classList.toggle('active', c.id === 'rp-tab-' + tabName));
    // Animer l'indicateur sous l'onglet actif
    const tabsContainer = document.querySelector('.rp-tabs');
    if (tabsContainer && activeTab) {
        tabsContainer.style.setProperty('--rp-tab-x', activeTab.offsetLeft + 'px');
        tabsContainer.style.setProperty('--rp-tab-w', activeTab.offsetWidth + 'px');
    }
}
document.querySelectorAll('.rp-tab').forEach(tab => {
    tab.addEventListener('click', () => setRightPanelTab(tab.dataset.rpTab));
});
// Positionner l'indicateur au chargement (et quand le volet se redimensionne)
window.addEventListener('load', () => {
    const active = document.querySelector('.rp-tab.active');
    if (active) setRightPanelTab(active.dataset.rpTab);
});

// Boutons format d'image dans le volet droit
const imageFormatSelect = document.getElementById('image-format-select');
document.querySelectorAll('.image-format-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.image-format-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        imageFormatSelect.value = btn.dataset.format;
        // Si un ratio précis était sélectionné, le clear pour rendre la priorité aux boutons format
        const ratioSelect = document.getElementById('rp-gemini-ratio-select');
        if (ratioSelect && ratioSelect.value) {
            ratioSelect.value = '';
            updateFormatBtnsDisabled();
        }
    });
});

// Sliders paramètres image (ranges)
['openai-n', 'openai-compression'].forEach(id => {
    const range = document.getElementById('rp-' + id + '-range');
    const display = document.getElementById('rp-' + id + '-value');
    if (range && display) {
        range.addEventListener('input', () => {
            display.textContent = parseFloat(range.value).toFixed(range.step.includes('.') ? 1 : 0);
        });
    }
});

// Masquer la compression quand le format est PNG
const openaiFormatSelect = document.getElementById('rp-openai-format-select');
const openaiCompressionSection = document.getElementById('rp-openai-compression-section');
function updateOpenAICompressionVisibility() {
    if (!openaiFormatSelect || !openaiCompressionSection) return;
    const format = openaiFormatSelect.value;
    openaiCompressionSection.style.display = (format === 'jpeg' || format === 'webp') ? '' : 'none';
}
openaiFormatSelect?.addEventListener('change', updateOpenAICompressionVisibility);
updateOpenAICompressionVisibility();

// Valeurs par défaut des paramètres image
const IMAGE_PARAMS_DEFAULTS = {
    quality: 'high',
    'openai-n': { value: 1, display: '1' },
    'openai-compression': { value: 100, display: '100' },
    selects: {
        'rp-openai-background-select': 'auto',
        'rp-openai-format-select': 'png',
        'rp-openai-moderation-select': 'auto',
        'rp-gemini-ratio-select': '',
        'rp-gemini-size-select': '1K',
        'rp-gemini-thinking-select': 'minimal'
    }
};

// Toggle pour le seed image (input number, comme le seed texte)
document.getElementById('rp-img-seed-toggle')?.addEventListener('change', (e) => {
    e.target.closest('.right-panel-section')?.classList.toggle('rp-param-disabled', !e.target.checked);
});

// Bouton de réinitialisation des paramètres image
document.getElementById('rp-image-params-reset-btn')?.addEventListener('click', () => {
    const qualitySelect = document.getElementById('rp-quality-select');
    if (qualitySelect) qualitySelect.value = IMAGE_PARAMS_DEFAULTS.quality;
    ['openai-n', 'openai-compression'].forEach(id => {
        const def = IMAGE_PARAMS_DEFAULTS[id];
        const range = document.getElementById('rp-' + id + '-range');
        const display = document.getElementById('rp-' + id + '-value');
        if (range) range.value = def.value;
        if (display) display.textContent = def.display;
    });
    for (const [selId, val] of Object.entries(IMAGE_PARAMS_DEFAULTS.selects)) {
        const sel = document.getElementById(selId);
        if (sel) sel.value = val;
    }
    const seedToggle = document.getElementById('rp-img-seed-toggle');
    const seedInput = document.getElementById('rp-img-seed-input');
    if (seedToggle) {
        seedToggle.checked = false;
        seedToggle.closest('.right-panel-section')?.classList.add('rp-param-disabled');
    }
    if (seedInput) seedInput.value = '';
    updateOpenAICompressionVisibility();
    updateFormatBtnsDisabled();
});

// Coût texte : priorise usage.cost_real (OpenRouter opt-in usage accounting),
// sinon retombe sur l'estimation locale (tokens × tarif/1M).
function _resolveTextCost(tarif, usage) {
    if (!usage) return 0;
    if (usage.cost_real != null && usage.cost_real >= 0) return usage.cost_real;
    if (!tarif) return 0;
    const inTok = usage.input_tokens || 0;
    const outTok = usage.output_tokens || 0;
    return (inTok / 1_000_000) * tarif.inputPer1M
         + (outTok / 1_000_000) * tarif.outputPer1M;
}

// Coût image : priorise usage.cost_real (couvre tokens + image), sinon estimation locale
// (tokens texte + computeImagePrice × imageCount). Renvoie { tokenCost, imageCost, total }.
function _resolveImageCost(tarif, usage, imageCount, format, imageParams) {
    if (usage?.cost_real != null && usage.cost_real >= 0) {
        // OR cost_real est all-in-one : on l'attribue à la ligne "image" pour préserver la sémantique
        // (STATE.totalImageCost garde sa signification de "coût de génération d'images")
        return { tokenCost: 0, imageCost: usage.cost_real, total: usage.cost_real };
    }
    if (!tarif) return { tokenCost: 0, imageCost: 0, total: 0 };
    const inTok = usage?.input_tokens || 0;
    const outTok = usage?.output_tokens || 0;
    const tokenCost = (inTok / 1_000_000) * tarif.inputPer1M
        + (outTok / 1_000_000) * tarif.outputPer1M;
    const imageCost = imageCount > 0
        ? computeImagePrice(tarif, format, imageParams) * imageCount
        : 0;
    return { tokenCost, imageCost, total: tokenCost + imageCost };
}

// Lecture des paramètres image depuis les contrôles
function getImageParams() {
    const val = id => document.getElementById(id)?.value;
    const seedToggle = document.getElementById('rp-img-seed-toggle');
    const seedRaw = (seedToggle?.checked) ? parseInt(val('rp-img-seed-input')) : NaN;
    return {
        quality: val('rp-quality-select') || 'high',
        n: parseInt(val('rp-openai-n-range')) || 1,
        background: val('rp-openai-background-select') || 'auto',
        output_format: val('rp-openai-format-select') || 'png',
        output_compression: parseInt(val('rp-openai-compression-range')) || 100,
        moderation: val('rp-openai-moderation-select') || 'auto',
        geminiAspectRatio: val('rp-gemini-ratio-select') || '',
        imageSize: val('rp-gemini-size-select') || '1K',
        thinkingLevel: val('rp-gemini-thinking-select') || 'minimal',
        seed: isNaN(seedRaw) ? undefined : seedRaw
    };
}

// Activer/désactiver les sections de paramètres image selon l'éditeur du modèle.
// Pour les modèles OpenRouter : filtre additionnel sur `supportedParameters` du modèle
// pour les sections marquées `data-or-img-param` (seed, etc.).
function updateImageParamsVisibility(editeur, modelId) {
    document.querySelectorAll('#rp-tab-image [data-providers]').forEach(el => {
        const providers = el.dataset.providers.split(',').map(p => p.trim());
        if (providers.includes(editeur)) {
            el.classList.remove('disabled');
        } else {
            el.classList.add('disabled');
        }
    });
    // Filtre OR : sections data-or-img-param visibles seulement si le modèle OR les déclare
    const meta = (editeur === 'openrouter' && modelId) ? IMAGE_MODELS.find(m => m.id === modelId) : null;
    const supported = Array.isArray(meta?.supportedParameters) ? meta.supportedParameters : [];
    document.querySelectorAll('#rp-tab-image [data-or-img-param]').forEach(el => {
        const param = el.dataset.orImgParam;
        const allowed = editeur === 'openrouter' && supported.includes(param);
        el.style.display = allowed ? '' : 'none';
    });
    // image_size : honoré par Google natif et par les modèles Gemini hébergés sur OR.
    // En pratique, les autres modèles OR (Flux, Sourceful, Seedream...) ignorent image_size
    // et sortent à leur résolution native — on masque la section pour eux pour éviter la confusion.
    const sizeSection = document.getElementById('rp-gemini-size-section');
    const isOrGeminiFamily = editeur === 'openrouter' && modelId && modelId.toLowerCase().startsWith('google/gemini');
    if (sizeSection && editeur === 'openrouter') {
        sizeSection.classList.toggle('disabled', !isOrGeminiFamily);
    }
    const isOrGemini31Flash = modelId === 'google/gemini-3.1-flash-image-preview';
    // Aspect ratios étendus (1:4, 4:1, 1:8, 8:1) : uniquement Gemini 3.1 Flash via OR.
    const ratioSelect = document.getElementById('rp-gemini-ratio-select');
    if (ratioSelect) {
        const EXTENDED = ['1:4', '4:1', '1:8', '8:1'];
        const hasExtended = !!ratioSelect.querySelector(`option[value="${EXTENDED[0]}"]`);
        if (isOrGemini31Flash && !hasExtended) {
            for (const r of EXTENDED) {
                const opt = document.createElement('option');
                opt.value = r; opt.textContent = r;
                ratioSelect.appendChild(opt);
            }
        } else if (!isOrGemini31Flash && hasExtended) {
            EXTENDED.forEach(r => {
                const o = ratioSelect.querySelector(`option[value="${r}"]`);
                if (o) o.remove();
            });
            if (EXTENDED.includes(ratioSelect.value)) ratioSelect.value = '';
        }
    }
}

// Griser les boutons de format quand un ratio précis Gemini est choisi
const geminiRatioSelect = document.getElementById('rp-gemini-ratio-select');
function updateFormatBtnsDisabled() {
    const disabled = !!geminiRatioSelect?.value;
    document.querySelectorAll('.image-format-btn').forEach(btn => {
        btn.classList.toggle('disabled', disabled);
    });
    // Bascule du label de l'option vide : "Sélectionner un ratio précis" tant que rien n'est
    // choisi (placeholder explicatif), "Aucun" dès qu'un ratio est sélectionné (option de désélection).
    const placeholderOpt = geminiRatioSelect?.querySelector('option[value=""]');
    if (placeholderOpt) {
        placeholderOpt.textContent = disabled ? 'Aucun' : 'Sélectionner un ratio précis';
    }
}
geminiRatioSelect?.addEventListener('change', updateFormatBtnsDisabled);

// Slider « Nombre max d'images à renvoyer » : limite les images des messages
// précédents réinjectées à l'IA à chaque tour. 0 = ne jamais renvoyer.
// Persisté en localStorage pour survivre au reload.
(function _initMaxHistoryImagesSlider() {
    const range = document.getElementById('rp-max-history-images-range');
    const display = document.getElementById('rp-max-history-images-value');
    if (!range || !display) return;
    const KEY = 'minou-max-history-images';
    const stored = parseInt(localStorage.getItem(KEY));
    if (!isNaN(stored) && stored >= 0 && stored <= 12) range.value = String(stored);
    const fmt = (v) => (v === 0 ? 'Ne jamais renvoyer' : String(v));
    display.textContent = fmt(parseInt(range.value));
    range.addEventListener('input', () => {
        const v = parseInt(range.value);
        display.textContent = fmt(v);
        try { localStorage.setItem(KEY, String(v)); } catch(e) {}
    });
})();

function getMaxHistoryImages() {
    const range = document.getElementById('rp-max-history-images-range');
    if (!range) return 4;
    const v = parseInt(range.value);
    return isNaN(v) ? 4 : v;
}

// Renvoie une copie de l'historique avec les images des messages précédents
// limitées à N (les plus récentes conservées). Le DERNIER message utilisateur
// — celui qui déclenche la génération — garde toutes ses images, ce qui permet
// d'envoyer une image fraîche même quand la limite est 0.
function _limitHistoryImages(history, maxImages) {
    if (!Array.isArray(history) || history.length === 0) return history;
    // Index du dernier message user (= message en cours)
    let lastUserIdx = -1;
    for (let i = history.length - 1; i >= 0; i--) {
        if (history[i].role === 'user') { lastUserIdx = i; break; }
    }
    // Comptage des images dans les messages strictement antérieurs (à droite-à-gauche
    // pour conserver les plus récentes en priorité).
    const keepIdx = new Set();
    let kept = 0;
    for (let i = lastUserIdx - 1; i >= 0 && kept < maxImages; i--) {
        const m = history[i];
        if (!Array.isArray(m.content)) continue;
        for (let j = m.content.length - 1; j >= 0 && kept < maxImages; j--) {
            const part = m.content[j];
            if (part && part.type === 'image') {
                keepIdx.add(`${i}:${j}`);
                kept++;
            }
        }
    }
    // Numérotation globale des images retirées (chronologique) pour générer des
    // placeholders identifiables ("image1.png", "image2.png", …).
    let strippedCount = 0;
    const newHistory = history.map((m, i) => {
        if (i === lastUserIdx) return m; // message en cours : intact
        if (!Array.isArray(m.content)) return m;
        const newContent = [];
        for (let j = 0; j < m.content.length; j++) {
            const part = m.content[j];
            if (part && part.type === 'image') {
                if (keepIdx.has(`${i}:${j}`)) {
                    newContent.push(part);
                } else {
                    strippedCount++;
                    const ext = (part.mimeType || 'image/png').split('/')[1] || 'png';
                    const name = `image${strippedCount}.${ext}`;
                    newContent.push({
                        type: 'text',
                        text: `[${name} — cette image existe dans la conversation mais n'a pas été transmise à l'IA pour économiser des tokens. Si tu as besoin de la voir pour répondre, demande à l'utilisateur d'augmenter le réglage « Nombre d'images à renvoyer » dans les Réglages de la conversation de Cetas. Ne tente pas de modifier ce réglage toi-même.]`
                    });
                }
            } else {
                newContent.push(part);
            }
        }
        return { ...m, content: newContent };
    });
    return newHistory;
}

// Sliders réglages LLM (température, top-p, etc.)
['temperature', 'top-p', 'max-tokens', 'freq-penalty', 'presence-penalty', 'top-k', 'min-p', 'top-a', 'rep-penalty'].forEach(id => {
    const range = document.getElementById('rp-' + id + '-range');
    const display = document.getElementById('rp-' + id + '-value');
    if (range && display) {
        range.addEventListener('input', () => {
            display.textContent = parseFloat(range.value).toFixed(range.step.includes('.') ? 1 : 0);
        });
    }
    const toggle = document.getElementById('rp-' + id + '-toggle');
    if (toggle) {
        toggle.addEventListener('change', () => {
            toggle.closest('.right-panel-section')?.classList.toggle('rp-param-disabled', !toggle.checked);
        });
    }
});

// Toggle pour l'effort de raisonnement (select, pas range)
document.getElementById('rp-effort-toggle')?.addEventListener('change', (e) => {
    e.target.closest('.right-panel-section')?.classList.toggle('rp-param-disabled', !e.target.checked);
});

// Toggle pour le seed (input number, pas range)
document.getElementById('rp-seed-toggle')?.addEventListener('change', (e) => {
    e.target.closest('.right-panel-section')?.classList.toggle('rp-param-disabled', !e.target.checked);
});

// Modèles pour lesquels l'effort de raisonnement est obligatoire (pas de checkbox)
// Opus 4.7/4.8, Sonnet 5 et Fable 5 : adaptive thinking toujours actif → effort obligatoire.
// (/^claude-sonnet-5/ ne matche pas 'claude-sonnet-4-5-...' qui garde sa checkbox.)
const MANDATORY_EFFORT_MODELS = [/^claude-opus-4-[78]/, /^claude-sonnet-5/, /^claude-fable-5/];
function isMandatoryEffort(modelId) {
    if (!modelId) return false;
    return MANDATORY_EFFORT_MODELS.some(rx => rx.test(modelId));
}
// Gemma 4 : toggle binaire (l'API Gemini rejette low/medium pour ces modèles)
function isGemma4(modelId) { return !!modelId && modelId.startsWith('gemma-4'); }
// DeepSeek V3.2 : toggle binaire — bascule vers l'endpoint `deepseek-reasoner` si activé
function isDeepSeekBinaryReasoning(modelId) { return modelId === 'deepseek-chat'; }
// GLM-5 / 5.1 / 5.2 / 5-Turbo : toggle binaire — param `thinking: { type: "enabled"|"disabled" }`
function isZaiBinaryReasoning(modelId) { return ['glm-5', 'glm-5.1', 'glm-5.2', 'glm-5-turbo'].includes(modelId); }
// Grok 4.20 : toggle binaire — bascule entre les variantes `-reasoning` et `-non-reasoning`
function isGrokBinaryReasoning(modelId) { return modelId === 'grok-4.20-0309-reasoning'; }
// Grok 4.3 : reasoning ajustable (none / low / medium / high) via `reasoning_effort`
function isGrok43Reasoning(modelId) { return modelId === 'grok-4.3'; }
// Grok 4.5 : reasoning ajustable (low / medium / high) — non désactivable, défaut high côté API
function isGrok45Reasoning(modelId) { return modelId === 'grok-4.5'; }
// Mistral Small 4 / Medium 3.5 : toggle binaire — param `reasoning_effort: "high"|"none"`
function isMistralBinaryReasoning(modelId) { return modelId === 'mistral-small-latest' || modelId === 'mistral-medium-3-5'; }

function supportsReasoningEffort(modelId) {
    if (!modelId) return false;
    const editeur = getModelEditeur(modelId);
    if (editeur === 'openai') return /^(o1|o3|o4)/.test(modelId) || /^gpt-5/.test(modelId);
    if (editeur === 'anthropic') return modelId.includes('opus') || modelId.includes('sonnet') || modelId.includes('fable');
    if (editeur === 'deepseek') return modelId === 'deepseek-chat';
    if (editeur === 'grok') return isGrokBinaryReasoning(modelId) || isGrok43Reasoning(modelId) || isGrok45Reasoning(modelId);
    if (editeur === 'google') return modelId.includes('pro') || modelId.includes('flash') || isGemma4(modelId);
    if (editeur === 'mistral') return isMistralBinaryReasoning(modelId);
    if (editeur === 'zai') return isZaiBinaryReasoning(modelId);
    return false;
}
function getEffortLevels(modelId) {
    if (isGemma4(modelId) || isDeepSeekBinaryReasoning(modelId) || isZaiBinaryReasoning(modelId) || isGrokBinaryReasoning(modelId) || isMistralBinaryReasoning(modelId)) return ['minimal', 'high'];
    // Grok 4.3 : effort ajustable (cf. docs xAI), défaut "low" côté API.
    if (isGrok43Reasoning(modelId)) return ['none', 'low', 'medium', 'high'];
    // Grok 4.5 : low/medium/high uniquement (raisonnement non désactivable).
    if (isGrok45Reasoning(modelId)) return ['low', 'medium', 'high'];
    // GPT-5.2+ : remplace 'minimal' par 'none' et ajoute 'xhigh' (cf. docs OpenAI).
    // GPT-5.6+ ajoute également 'max'.
    // GPT-5 (5.0/5.1) conserve le set historique : minimal/low/medium/high.
    const m = modelId?.match(/^gpt-5\.(\d+)/);
    if (m && parseInt(m[1]) >= 6) return ['none', 'low', 'medium', 'high', 'xhigh', 'max'];
    if (m && parseInt(m[1]) >= 2) return ['none', 'low', 'medium', 'high', 'xhigh'];
    return ['minimal', 'low', 'medium', 'high'];
}
const EFFORT_LEVEL_LABELS = { none: 'Aucun', minimal: 'Minimal', low: 'Faible', medium: 'Moyen', high: 'Élevé', xhigh: 'Très élevé', max: 'Maximum' };
const BINARY_EFFORT_LABELS = { minimal: 'Désactivé', high: 'Activé' };
function populateEffortSelect(modelId) {
    const select = document.getElementById('rp-effort-select');
    if (!select) return;
    const prev = select.value;
    const levels = getEffortLevels(modelId);
    const binary = isGemma4(modelId) || isDeepSeekBinaryReasoning(modelId) || isZaiBinaryReasoning(modelId) || isGrokBinaryReasoning(modelId) || isMistralBinaryReasoning(modelId);
    const labels = binary ? BINARY_EFFORT_LABELS : EFFORT_LEVEL_LABELS;
    select.innerHTML = levels.map(l => `<option value="${l}">${labels[l]}</option>`).join('');
    select.value = levels.includes(prev) ? prev : (binary ? 'high' : 'medium');
}
function updateEffortMandatory(modelId) {
    const section = document.getElementById('rp-effort-section');
    const toggle = document.getElementById('rp-effort-toggle');
    if (!section || !toggle) return;
    // Masquer complètement si le modèle ne prend pas en charge le raisonnement
    if (!supportsReasoningEffort(modelId)) {
        section.style.display = 'none';
        section.classList.remove('rp-param-mandatory');
        toggle.checked = false;
        section.classList.add('rp-param-disabled');
    } else {
        section.style.display = '';
        populateEffortSelect(modelId);
        if (isMandatoryEffort(modelId)) {
            section.classList.add('rp-param-mandatory');
            section.classList.remove('rp-param-disabled');
            toggle.checked = true;
        } else {
            section.classList.remove('rp-param-mandatory');
            if (!toggle.checked) section.classList.add('rp-param-disabled');
        }
    }
    // Filtrage OR : pour les modèles OpenRouter, on ne montre que les params déclarés
    // dans `supported_parameters` du modèle. Pour les autres providers, tout reste visible.
    _applyOrParamVisibility(modelId);
}

// Filtre les sections de paramètres LLM (data-or-param) selon supportedParameters.
// - Sections marquées `data-or-only="true"` : visibles UNIQUEMENT si modèle OR + param déclaré
//   (ex. top_k, min_p, seed — samplers spécifiques OR sans équivalent universel)
// - Sections standard : visibles pour tous les non-OR (comportement par défaut), filtrées pour OR
function _applyOrParamVisibility(modelId) {
    const sections = document.querySelectorAll('#rp-tab-general [data-or-param]');
    const editeur = modelId ? (getModelEditeur(modelId) || getImageModelEditeur(modelId) || getSearchModelEditeur(modelId)) : null;
    const isOr = editeur === 'openrouter';
    const meta = isOr ? (MODELS.find(m => m.id === modelId) || IMAGE_MODELS.find(m => m.id === modelId)) : null;
    const supported = Array.isArray(meta?.supportedParameters) ? meta.supportedParameters : [];
    sections.forEach(s => {
        const param = s.dataset.orParam;
        const orOnly = s.dataset.orOnly === 'true';
        // L'effort de raisonnement est déjà géré par updateEffortMandatory qui peut imposer
        // display:none indépendamment. On ne réécrase pas son état dans ce cas.
        if (param === 'reasoning' && s.style.display === 'none' && !isOr) return;
        if (orOnly) {
            // Caché sauf si OR + param supporté
            s.style.display = (isOr && supported.includes(param)) ? '' : 'none';
        } else {
            // Visible partout, filtré seulement si OR
            s.style.display = (!isOr || supported.includes(param)) ? '' : 'none';
        }
    });
}

// Valeurs par défaut des paramètres LLM
const MODEL_PARAMS_DEFAULTS = {
    temperature: { value: 0.7, display: '0.7' },
    'top-p': { value: 1, display: '1.0' },
    'max-tokens': { value: 4096, display: '4096' },
    'freq-penalty': { value: 0, display: '0.0' },
    'presence-penalty': { value: 0, display: '0.0' }
};

// Bouton de réinitialisation des paramètres
document.getElementById('rp-params-reset-btn')?.addEventListener('click', () => {
    Object.entries(MODEL_PARAMS_DEFAULTS).forEach(([id, def]) => {
        const range = document.getElementById('rp-' + id + '-range');
        const display = document.getElementById('rp-' + id + '-value');
        const toggle = document.getElementById('rp-' + id + '-toggle');
        if (range) range.value = def.value;
        if (display) display.textContent = def.display;
        if (toggle) {
            toggle.checked = false;
            toggle.closest('.right-panel-section')?.classList.add('rp-param-disabled');
        }
    });
    const effortSelect = document.getElementById('rp-effort-select');
    const effortToggle = document.getElementById('rp-effort-toggle');
    const effortSection = document.getElementById('rp-effort-section');
    if (effortSelect) effortSelect.value = 'medium';
    if (effortToggle && effortSection && !effortSection.classList.contains('rp-param-mandatory')) {
        effortToggle.checked = false;
        effortSection.classList.add('rp-param-disabled');
    }
});

// Lecture des paramètres LLM depuis les sliders
function getModelParams() {
    const v = (id, toggleId) => {
        const toggle = document.getElementById(toggleId);
        if (!toggle || !toggle.checked) return undefined;
        const el = document.getElementById(id);
        return el ? parseFloat(el.value) : undefined;
    };
    const intToggled = (id, toggleId) => {
        const toggle = document.getElementById(toggleId);
        if (!toggle || !toggle.checked) return undefined;
        const el = document.getElementById(id);
        return el ? parseInt(el.value) : undefined;
    };
    return {
        temperature: v('rp-temperature-range', 'rp-temperature-toggle'),
        top_p: v('rp-top-p-range', 'rp-top-p-toggle'),
        max_tokens: intToggled('rp-max-tokens-range', 'rp-max-tokens-toggle'),
        frequency_penalty: v('rp-freq-penalty-range', 'rp-freq-penalty-toggle'),
        presence_penalty: v('rp-presence-penalty-range', 'rp-presence-penalty-toggle'),
        top_k: intToggled('rp-top-k-range', 'rp-top-k-toggle'),
        min_p: v('rp-min-p-range', 'rp-min-p-toggle'),
        top_a: v('rp-top-a-range', 'rp-top-a-toggle'),
        repetition_penalty: v('rp-rep-penalty-range', 'rp-rep-penalty-toggle'),
        seed: (() => {
            const toggle = document.getElementById('rp-seed-toggle');
            if (!toggle || !toggle.checked) return undefined;
            const el = document.getElementById('rp-seed-input');
            const v = el ? parseInt(el.value) : NaN;
            return isNaN(v) ? undefined : v;
        })(),
        reasoning_effort: (() => {
            const toggle = document.getElementById('rp-effort-toggle');
            if (!toggle || !toggle.checked) return undefined;
            return document.getElementById('rp-effort-select')?.value || 'medium';
        })(),
        webSearchDepth: STATE.webSearchDepth || 'standard'
    };
}

// Remplir le textarea quand on sélectionne un rôle
let spOriginalContenu = null;
spSelect.addEventListener('change', () => {
    if (spSelect.value) {
        const opt = spSelect.selectedOptions[0];
        spOriginalContenu = opt.dataset.contenu || '';
        spTextarea.value = spOriginalContenu;
        spEditBtn.style.display = 'none';
        rpRoleActions.style.display = 'none';
    } else {
        spOriginalContenu = null;
        spTextarea.value = '';
        spEditBtn.style.display = 'none';
        rpRoleActions.style.display = 'none';
    }
});

// Mettre à jour le system prompt en temps réel quand on édite le textarea
spTextarea.addEventListener('input', () => {
    if (STATE.currentSystemPrompt) {
        STATE.currentSystemPrompt.contenu = spTextarea.value;
    }
    if (spSelect.value && spOriginalContenu !== null) {
        const changed = spTextarea.value !== spOriginalContenu;
        spEditBtn.style.display = changed ? 'inline-flex' : 'none';
        rpRoleActions.style.display = changed ? 'flex' : 'none';
    }
});

// --- Bouton recherche web (globe) ---
const webSearchBtn = document.getElementById('web-search-btn');
const WEB_SEARCH_EDITEURS = ['openai', 'anthropic', 'google', 'grok', 'openrouter'];
const WEB_SEARCH_TOOLTIPS = {
    openai: 'Prix recherche web OpenAI : 0,01 $ / requête',
    anthropic: 'Prix recherche web Anthropic : 0,01 $ / requête',
    google: 'Prix recherche web Google : 5000 requêtes sans frais supplémentaires',
    grok: 'Prix recherche web Grok : 0,035 $ / source (le prix varie donc en fonction du nombre de sources)',
    openrouter: 'Activer la recherche web et la récupération de pages web sur OpenRouter.\n• Coût recherche web : ~0,02 $/requête\n• Récupération : 0,001 $/page web'
};
// OpenRouter facture les server tools dans `usage.cost`, déjà capturé via `cost_real` — pas d'estimation locale.
const WEB_SEARCH_COST_PER_REQ = { openai: 0.01, anthropic: 0.01, google: 0, grok: 0, openrouter: 0 };
const WEB_SEARCH_COST_PER_CITATION = { grok: 0.035 };

// Modèles OpenRouter avec recherche web intégrée (Perplexity, variantes OpenAI « Search ») :
// l'API renvoie une erreur si on ajoute les server tools web, la recherche étant native au
// modèle. On n'envoie donc jamais webSearch pour eux, mais le bouton reste affiché actif
// et verrouillé pour montrer que la recherche web fonctionne bien.
function hasBuiltInWebSearch(modelId) {
    if (!modelId) return false;
    const model = MODELS.find(m => m.id === modelId);
    if (!model || model.editeur !== 'openrouter') return false;
    return /^perplexity\//i.test(modelId) || (/^openai\//i.test(modelId) && /search/i.test(modelId));
}

function calcWebSearchCost(modelId, citations) {
    if (!STATE.webSearchEnabled) return 0;
    const model = MODELS.find(m => m.id === modelId);
    const editeur = model?.editeur;
    if (!editeur || !WEB_SEARCH_EDITEURS.includes(editeur)) return 0;
    let cost = WEB_SEARCH_COST_PER_REQ[editeur] || 0;
    if (WEB_SEARCH_COST_PER_CITATION[editeur] && citations?.length) {
        cost += citations.length * WEB_SEARCH_COST_PER_CITATION[editeur];
    }
    return cost;
}

function updateWebSearchBtn() {
    if (!webSearchBtn) return;
    // Afficher le bouton uniquement si un modèle texte supportant la recherche est sélectionné
    const activeModel = STATE.currentModel;
    if (activeModel) {
        const model = MODELS.find(m => m.id === activeModel);
        if (model && WEB_SEARCH_EDITEURS.includes(model.editeur)) {
            const builtIn = hasBuiltInWebSearch(activeModel);
            webSearchBtn.style.display = '';
            webSearchBtn.classList.toggle('active', builtIn || STATE.webSearchEnabled);
            webSearchBtn.classList.toggle('web-search-locked', builtIn);
            webSearchBtn.dataset.tooltip = builtIn
                ? 'Recherche web intégrée à ce modèle : toujours active, non désactivable.'
                : (WEB_SEARCH_TOOLTIPS[model.editeur] || '');
            if (typeof alignInputHint === 'function') alignInputHint();
            return;
        }
    }
    // Masquer et désactiver si pas de modèle compatible
    webSearchBtn.style.display = 'none';
    webSearchBtn.classList.remove('active', 'web-search-locked');
    STATE.webSearchEnabled = false;
    webSearchBtn.dataset.tooltip = '';
    if (typeof alignInputHint === 'function') alignInputHint();
}

if (webSearchBtn) {
    webSearchBtn.addEventListener('click', () => {
        // Recherche intégrée au modèle : toujours active, le clic est ignoré
        if (hasBuiltInWebSearch(STATE.currentModel)) return;
        STATE.webSearchEnabled = !STATE.webSearchEnabled;
        webSearchBtn.classList.toggle('active', STATE.webSearchEnabled);
    });
}

// --- Menu "+" (Plus d'options) ---

// Mapping des logos de provider (SVG dans images/)
const PROVIDER_LOGOS = {
    openai: 'images/OpenAI.svg',
    anthropic: 'images/Anthropic.svg',
    google: 'images/Google.svg',
    mistral: 'images/Mistral.svg',
    perplexity: 'images/Perplexity.svg',
    deepseek: 'images/DeepSeek.svg',
    grok: 'images/Grok.svg',
    zai: 'images/Z.ai.svg',
    groq: 'images/Groq.svg',
    nvidia: 'images/Nvidia.svg',
    cabreras: 'images/Cabreras.svg',
    openrouter: 'images/OpenRouter.svg',
    samagent: 'images/SamAgent.svg',
    ollama: 'images/Ollama.svg',
    lmstudio: 'images/LMStudio.svg',
    llamacpp: 'images/LlamaCpp.svg'
};

// 5 compétences réelles (prompts système prédéfinis)
const COMPETENCES = [
    {
        id: 'correcteur',
        name: 'Correcteur orthographique',
        icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>',
        prompt: 'Tu es un correcteur orthographique et grammatical professionnel. Ta tâche est de corriger toutes les fautes d\'orthographe, de grammaire, de conjugaison et de ponctuation dans le texte fourni. Explique brièvement les corrections importantes. Reformule uniquement si nécessaire pour la clarté.'
    },
    {
        id: 'traducteur',
        name: 'Traducteur Français-Anglais',
        icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 8l6 6"/><path d="M4 14l6-6 2-3"/><path d="M2 5h12"/><path d="M7 2h1"/><path d="M22 22l-5-10-5 10"/><path d="M14 18h6"/></svg>',
        prompt: 'Tu es un traducteur professionnel français-anglais. Traduis le texte fourni dans l\'autre langue (français vers anglais, ou anglais vers français selon le cas). Conserve le ton, le style et le registre du texte original. Si le texte contient des termes techniques, utilise la terminologie appropriée.'
    },
    {
        id: 'code-expert',
        name: 'Expert en programmation',
        icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>',
        prompt: 'Tu es un expert en programmation et génie logiciel. Analyse le code fourni, explique son fonctionnement, identifie les bugs potentiels, et propose des améliorations (performance, lisibilité, sécurité). Donne des exemples concrets et référence les bonnes pratiques.'
    },
    {
        id: 'resumeur',
        name: 'Résumé de texte',
        icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="4" y1="6" x2="20" y2="6"/><line x1="4" y1="10" x2="20" y2="10"/><line x1="4" y1="14" x2="14" y2="14"/><line x1="4" y1="18" x2="10" y2="18"/></svg>',
        prompt: 'Tu es un expert en synthèse de documents. Résume le texte fourni de manière concise et structurée. Utilise des puces pour les points clés. Conserve les informations essentielles et le ton du document original. La synthèse doit être environ 3 à 5 fois plus courte que l\'original.'
    },
    {
        id: 'pedagogue',
        name: 'Assistant pédagogique',
        icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>',
        prompt: 'Tu es un professeur patient et pédagogue. Explique le concept ou le sujet fourni de manière simple et accessible, comme si tu t\'adressais à un débutant. Utilise des analogies, des exemples concrets, et progresse du plus simple au plus complexe. Pose des questions pour vérifier la compréhension.'
    }
];

function initConversationPanel() {
    const rightPanel = document.getElementById('right-panel');
    const convPanelBody = document.getElementById('panel-conversation-body');
    if (!rightPanel || !convPanelBody) return;

    // Déplacer tout le contenu du panneau droit dans l'onglet Conversation
    while (rightPanel.firstChild) {
        convPanelBody.appendChild(rightPanel.firstChild);
    }

    // Rediriger le bouton engrenage (barre de saisie) vers l'onglet Conversation
    if (chatHeaderSettings) {
        chatHeaderSettings.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            if (typeof openApiKeysModal === 'function') {
                openApiKeysModal();
                // Activer l'onglet Conversation
                setTimeout(() => {
                    const tab = document.querySelector('.apikeys-tab[data-tab="conversation"]');
                    if (tab) tab.click();
                }, 50);
            }
        });
    }

    // Rediriger le bouton settings de la toolbar latérale
    const sideSettings = document.getElementById('side-toggle-settings');
    if (sideSettings) {
        sideSettings.title = 'Réglages de la conversation';
        sideSettings.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            if (typeof openApiKeysModal === 'function') {
                openApiKeysModal();
                setTimeout(() => {
                    const tab = document.querySelector('.apikeys-tab[data-tab="conversation"]');
                    if (tab) tab.click();
                }, 50);
            }
        });
    }

}

// Peuple la liste des modèles dans le menu "+" pour l'onglet donné
function populatePlusModels(tab) {
    const plusModelList = document.getElementById('plus-model-list');
    if (!plusModelList) return;

    const models = tab === 'text' ? MODELS : tab === 'image' ? IMAGE_MODELS : SEARCH_MODELS;
    const tarifFn = tab === 'text' ? getTarif : tab === 'image' ? getImageTarif : getSearchTarif;

    const prefs = loadCatalogPrefs();
    const _disabled = new Set(prefs.disabled || []);
    const _orEnabled = new Set(prefs.orEnabled || []);
    const filtered = models.filter(m => {
        if (HIDDEN_EDITEURS.has(m.editeur)) return false;
        if (m.editeur === 'openrouter') return _orEnabled.has(m.id) && hasProviderKey('openrouter');
        return hasProviderKey(m.editeur) && !_disabled.has(m.id);
    });

    if (filtered.length === 0) {
        plusModelList.innerHTML = `<div class="plus-model-empty">Aucun modèle disponible.<br><span class="plus-model-empty-link">Configurer →</span></div>`;
        plusModelList.querySelector('.plus-model-empty-link')?.addEventListener('click', () => {
            if (typeof openApiKeysModal === 'function') openApiKeysModal();
        });
        return;
    }

    const groups = {};
    filtered.forEach(m => {
        if (!groups[m.editeur]) groups[m.editeur] = [];
        groups[m.editeur].push(m);
    });

    const sorted = Object.keys(groups).sort((a, b) => {
        const ia = EDITEUR_ORDER.indexOf(a), ib = EDITEUR_ORDER.indexOf(b);
        if (ia === -1 && ib === -1) return a.localeCompare(b);
        if (ia === -1) return 1;
        if (ib === -1) return -1;
        return ia - ib;
    });

    const activeModel = tab === 'text' ? STATE.currentModel :
                       tab === 'image' ? STATE.currentImageModel : STATE.currentSearchModel;

    const plusBtn = document.getElementById('plus-menu-btn');
    const plusDropdown = document.getElementById('plus-menu-dropdown');

    let html = '';
    sorted.forEach(editeur => {
        const models = groups[editeur];
        const logo = PROVIDER_LOGOS[editeur] || '';
        const logoHtml = logo ? `<img src="${logo}" class="plus-model-provider-icon" alt="" onerror="this.style.display='none'">` : '';
        html += `<div class="plus-model-provider">`;
        html += `<div class="plus-model-provider-header">${logoHtml}<span class="plus-model-provider-name">${editeur.charAt(0).toUpperCase() + editeur.slice(1)}</span><span class="plus-model-provider-count">${models.length}</span><svg class="plus-model-chevron" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="9 18 15 12 9 6"/></svg></div>`;
        html += `<div class="plus-model-items">`;
        models.forEach(m => {
            const tarif = tarifFn(m.id);
            const priceStr = _formatModelPriceString(m, tarif);
            const activeClass = m.id === activeModel ? ' active' : '';
            html += `<button type="button" class="plus-model-item${activeClass}" data-model="${escHtmlAttr(m.id)}" data-editeur="${escHtmlAttr(m.editeur)}"><span class="plus-model-item-name">${escHtml(m.label)}</span>${priceStr ? `<span class="plus-model-item-price">${priceStr}</span>` : ''}</button>`;
        });
        html += `</div></div>`;
    });

    plusModelList.innerHTML = html;

    plusModelList.querySelectorAll('.plus-model-provider-header').forEach(header => {
        header.addEventListener('click', () => {
            header.parentElement.classList.toggle('open');
        });
    });

    plusModelList.querySelectorAll('.plus-model-item').forEach(item => {
        item.addEventListener('click', () => {
            const modelId = item.dataset.model;
            const lookupFn = tab === 'text' ? getModelEditeur : tab === 'image' ? getImageModelEditeur : getSearchModelEditeur;
            if (modelId && !checkApiKeyForModel(modelId, lookupFn)) return;

            modelSelect._activeCategory = tab;
            modelSelect._customValue = modelId;
            _applyModelSelection(tab, modelId);
            updateActiveOption(modelSelect);
            updateInputHint();
            updateWebSearchBtn();
            if (typeof updateCanvasBtn === 'function') updateCanvasBtn();
            if (plusDropdown) plusDropdown.style.display = 'none';
            if (plusBtn) plusBtn.classList.remove('open');
        });
    });

    plusModelList.querySelector('.plus-model-empty-link')?.addEventListener('click', () => {
        if (typeof openApiKeysModal === 'function') openApiKeysModal();
    });
}

function initPlusMenu() {
    const plusBtn = document.getElementById('plus-menu-btn');
    const plusDropdown = document.getElementById('plus-menu-dropdown');
    const plusSkills = document.getElementById('plus-menu-skills');
    const plusReflectionToggle = document.getElementById('plus-reflection-toggle');
    const plusWebsearchToggle = document.getElementById('plus-websearch-toggle');
    const plusWebsearchDepth = document.getElementById('plus-websearch-depth');
    const plusModelList = document.getElementById('plus-model-list');
    const plusModelTabs = document.getElementById('plus-model-tabs');

    if (!plusBtn || !plusDropdown) return;

    let _activeTab = 'text';

    // --- Onglets Modèles ---
    if (plusModelTabs) {
        plusModelTabs.querySelectorAll('.plus-model-tab').forEach(tab => {
            tab.addEventListener('click', () => {
                plusModelTabs.querySelectorAll('.plus-model-tab').forEach(t => t.classList.remove('active'));
                tab.classList.add('active');
                populatePlusModels(tab.dataset.tab);
            });
        });
    }

    // Peuplement initial
    populatePlusModels('text');

    // --- Peupler les compétences ---
    if (plusSkills) {
        COMPETENCES.forEach(comp => {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'plus-menu-skill';
            btn.dataset.skillId = comp.id;
            btn.innerHTML = `<span class="plus-menu-skill-icon">${comp.icon}</span>${comp.name}`;
            btn.addEventListener('click', () => {
                applySkillPrompt(comp);
                plusDropdown.style.display = 'none';
                plusBtn.classList.remove('open');
            });
            plusSkills.appendChild(btn);
        });
    }

    // --- Mode Réflexion : sync avec le panneau droit ---
    if (plusReflectionToggle) {
        const rpEffortToggle = document.getElementById('rp-effort-toggle');
        const rpEffortSection = document.getElementById('rp-effort-section');
        // Lecture état initial
        if (rpEffortToggle && rpEffortSection) {
            plusReflectionToggle.checked = rpEffortToggle.checked && !rpEffortSection.classList.contains('rp-param-disabled');
        }
        // Au changement → propager vers le panneau droit
        plusReflectionToggle.addEventListener('change', () => {
            if (rpEffortToggle && rpEffortSection) {
                rpEffortToggle.checked = plusReflectionToggle.checked;
                if (plusReflectionToggle.checked) {
                    rpEffortSection.classList.remove('rp-param-disabled');
                } else {
                    rpEffortSection.classList.add('rp-param-disabled');
                }
                rpEffortToggle.dispatchEvent(new Event('change', { bubbles: true }));
            }
        });
    }

    // --- Effort : sync avec le select du panneau droit ---
    const effortPills = document.querySelectorAll('#plus-effort-pills .plus-menu-pill');
    if (effortPills.length) {
        const rpEffortSelect = document.getElementById('rp-effort-select');
        // Lecture état initial
        if (rpEffortSelect) {
            updateEffortPills(rpEffortSelect.value);
        }
        effortPills.forEach(pill => {
            pill.addEventListener('click', () => {
                const val = pill.dataset.effort;
                updateEffortPills(val);
                if (rpEffortSelect) {
                    rpEffortSelect.value = val;
                    rpEffortSelect.dispatchEvent(new Event('change', { bubbles: true }));
                }
                // Activer la réflexion si elle ne l'est pas déjà
                if (plusReflectionToggle && !plusReflectionToggle.checked) {
                    plusReflectionToggle.checked = true;
                    plusReflectionToggle.dispatchEvent(new Event('change', { bubbles: true }));
                }
            });
        });
    }

    function updateEffortPills(val) {
        effortPills.forEach(p => p.classList.toggle('active', p.dataset.effort === val));
    }

    // --- Recherche web : toggle + profondeur ---
    if (plusWebsearchToggle) {
        // Lecture état initial
        plusWebsearchToggle.checked = STATE.webSearchEnabled;
        if (STATE.webSearchDepth === 'deep') {
            const deepPill = plusWebsearchDepth?.querySelector('[data-depth="deep"]');
            const stdPill = plusWebsearchDepth?.querySelector('[data-depth="standard"]');
            if (deepPill) deepPill.classList.add('active');
            if (stdPill) stdPill.classList.remove('active');
        }
        if (plusWebsearchDepth) {
            plusWebsearchDepth.style.display = plusWebsearchToggle.checked ? 'flex' : 'none';
        }

        plusWebsearchToggle.addEventListener('change', () => {
            STATE.webSearchEnabled = plusWebsearchToggle.checked;
            if (plusWebsearchDepth) {
                plusWebsearchDepth.style.display = plusWebsearchToggle.checked ? 'flex' : 'none';
            }
            // Sync avec le bouton globe
            if (webSearchBtn) {
                webSearchBtn.classList.toggle('active', STATE.webSearchEnabled);
            }
        });

        // Pilules profondeur
        plusWebsearchDepth?.querySelectorAll('.plus-menu-pill').forEach(pill => {
            pill.addEventListener('click', () => {
                plusWebsearchDepth.querySelectorAll('.plus-menu-pill').forEach(p => p.classList.remove('active'));
                pill.classList.add('active');
                STATE.webSearchDepth = pill.dataset.depth;
            });
        });
    }

    // --- Ouverture / fermeture ---
    plusBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const isOpen = plusDropdown.style.display === 'block';
        if (isOpen) {
            plusDropdown.style.display = 'none';
            plusBtn.classList.remove('open');
        } else {
            // Rafraîchir l'état avant ouverture
            refreshPlusMenuState();
            plusDropdown.style.display = 'block';
            plusBtn.classList.add('open');
        }
    });

    // --- Action : Fichiers (attache) ---
    const attachItem = plusDropdown.querySelector('[data-action="attach"]');
    if (attachItem) {
        attachItem.addEventListener('click', () => {
            fileInput.click();
            plusDropdown.style.display = 'none';
            plusBtn.classList.remove('open');
        });
    }

    // Fermeture au clic extérieur
    document.addEventListener('click', (e) => {
        if (plusDropdown.style.display === 'block' &&
            !plusDropdown.contains(e.target) &&
            e.target !== plusBtn &&
            !plusBtn.contains(e.target)) {
            plusDropdown.style.display = 'none';
            plusBtn.classList.remove('open');
        }
    });

    // Fermeture à Échap
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && plusDropdown.style.display === 'block') {
            plusDropdown.style.display = 'none';
            plusBtn.classList.remove('open');
        }
    });
}

function refreshPlusMenuState() {
    // Mode Réflexion
    const rpEffortToggle = document.getElementById('rp-effort-toggle');
    const rpEffortSection = document.getElementById('rp-effort-section');
    const plusReflectionToggle = document.getElementById('plus-reflection-toggle');
    if (plusReflectionToggle && rpEffortToggle && rpEffortSection) {
        plusReflectionToggle.checked = rpEffortToggle.checked && !rpEffortSection.classList.contains('rp-param-disabled');
    }
    // Effort
    const rpEffortSelect = document.getElementById('rp-effort-select');
    if (rpEffortSelect) {
        const pills = document.querySelectorAll('#plus-effort-pills .plus-menu-pill');
        pills.forEach(p => p.classList.toggle('active', p.dataset.effort === rpEffortSelect.value));
    }
    // Recherche web
    const plusWebsearchToggle = document.getElementById('plus-websearch-toggle');
    const plusWebsearchDepth = document.getElementById('plus-websearch-depth');
    if (plusWebsearchToggle) {
        plusWebsearchToggle.checked = STATE.webSearchEnabled;
        if (plusWebsearchDepth) {
            plusWebsearchDepth.style.display = STATE.webSearchEnabled ? 'flex' : 'none';
            plusWebsearchDepth.querySelectorAll('.plus-menu-pill').forEach(p => {
                p.classList.toggle('active', p.dataset.depth === (STATE.webSearchDepth || 'standard'));
            });
        }
    }
    // Rafraîchir la liste des modèles (après changement de clés API ou préférences)
    const activeTab = document.querySelector('#plus-model-tabs .plus-model-tab.active');
    if (activeTab && typeof populatePlusModels === 'function') {
        populatePlusModels(activeTab.dataset.tab);
    }
}

function applySkillPrompt(comp) {
    // Appliquer le prompt système comme un rôle
    const spTextarea = document.getElementById('sp-textarea');
    const spSelect = document.getElementById('sp-select');
    if (spTextarea) {
        spTextarea.value = comp.prompt;
        // Mettre à jour le system prompt courant
        if (STATE.currentSystemPrompt) {
            STATE.currentSystemPrompt.contenu = comp.prompt;
        } else {
            STATE.currentSystemPrompt = { nom: comp.name, contenu: comp.prompt };
        }
        // Déclencher input pour les handlers
        spTextarea.dispatchEvent(new Event('input', { bubbles: true }));
    }
    // Désélectionner le select (le rôle est custom)
    if (spSelect) spSelect.value = '';
    // Afficher le bouton d'enregistrement
    const spEditBtn = document.getElementById('sp-edit-btn');
    const rpRoleActions = document.getElementById('rp-role-actions');
    if (spEditBtn) spEditBtn.style.display = 'inline-flex';
    if (rpRoleActions) rpRoleActions.style.display = 'flex';
}

// Met à jour #input-hint avec le modèle actif (utilisé depuis le sélecteur du menu "+")
function updateInputHint() {
    const hint = document.getElementById('input-hint');
    if (!hint) return;
    const tab = modelSelect._activeCategory || 'text';
    const modelId = modelSelect._customValue;
    if (!modelId) {
        hint.innerHTML = 'Sélectionnez un modèle dans le <b>+</b>';
        return;
    }
    const models = tab === 'text' ? MODELS : tab === 'image' ? IMAGE_MODELS : SEARCH_MODELS;
    const m = models.find(x => x.id === modelId);
    if (m) {
        const logo = PROVIDER_LOGOS[m.editeur];
        hint.innerHTML = logo ? `<img src="${logo}" style="width:14px;height:14px;vertical-align:-2px;margin-right:4px;border-radius:2px" alt=""> ${escHtml(m.label)}` : escHtml(m.label);
    } else {
        hint.textContent = modelId;
    }
}

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
const SAMAGENT_BOOST_PROMPT = `Tu es SamAgent, un assistant IA ultra-efficace et concis. Tes règles :

1. CLARIFICATION proactive : si la demande de l'utilisateur est vague ou incomplète (ex: "salut", "aide-moi", "j'ai un problème"), pose exactement 3 questions courtes et ciblées pour cerner son besoin réel avant de répondre.

2. COMPÉTENCE active : si un rôle système (compétence) est défini ci-dessus, applique-le avec une précision chirurgicale. Tu excelles dans cet exercice — c'est ta signature. Réponds de manière experte, structurée, sans blabla.

3. EFFICACITÉ maximale : va droit au but. Pas de formules de politesse superflues, pas de répétitions. Chaque mot compte.

4. ADAPTATION : l'utilisateur peut soit répondre à tes questions, soit sélectionner une compétence dans le menu "+" — adapte-toi immédiatement.`;

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

// ── Indicateur furtif du routeur SamAgent ──────────────────────────────
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
    // Update toolbar visibility
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

// --- Catégories ---

function refreshCatBar() {
    const cats = listCategories();

    // Mettre à jour le label affiché
    if (STATE.activeCategoryId) {
        const cat = readCategory(STATE.activeCategoryId);
        if (cat) {
            catSelectLabel.textContent = (cat.icone || '') + ' ' + cat.nom;
        } else {
            STATE.activeCategoryId = null;
            catSelectLabel.textContent = 'Toutes les catégories';
        }
    } else {
        catSelectLabel.textContent = 'Toutes les catégories';
    }

    // Reconstruire les options du dropdown
    catSelectDropdown.innerHTML = '';
    const allOpt = document.createElement('div');
    allOpt.className = 'cat-select-option' + (!STATE.activeCategoryId ? ' active' : '');
    allOpt.dataset.value = '';
    allOpt.textContent = 'Toutes les catégories';
    catSelectDropdown.appendChild(allOpt);

    for (const cat of cats) {
        const opt = document.createElement('div');
        opt.className = 'cat-select-option' + (STATE.activeCategoryId === cat.id ? ' active' : '');
        opt.dataset.value = cat.id;
        const dot = document.createElement('span');
        dot.className = 'cat-option-dot';
        dot.style.background = cat.couleur || '#3b82f6';
        opt.appendChild(dot);
        opt.appendChild(document.createTextNode((cat.icone || '') + ' ' + cat.nom));
        catSelectDropdown.appendChild(opt);
    }

    updateNewChatBtnColor();
    updateCatSelectColor();
    updateEmptyChatCategory();
}

function updateEmptyChatCategory() {
    const el = document.getElementById('empty-chat-category');
    if (!el) return;
    if (STATE.activeCategoryId) {
        const cat = readCategory(STATE.activeCategoryId);
        if (cat) {
            const color = cat.couleur || '#3b82f6';
            el.style.display = '';
            el.style.background = color + '18';
            el.style.borderColor = color + '40';
            el.style.color = color;
            el.textContent = `Cette conversation sera rangée dans la catégorie ${cat.nom}.`;
            return;
        }
    }
    el.style.display = 'none';
}

function textColorForBg(hex) {
    // Calcul de luminance relative (WCAG)
    const r = parseInt(hex.slice(1, 3), 16) / 255;
    const g = parseInt(hex.slice(3, 5), 16) / 255;
    const b = parseInt(hex.slice(5, 7), 16) / 255;
    const toLinear = c => c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    const L = 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
    return L > 0.4 ? '#000' : '#fff';
}

function updateCatSelectColor() {
    const row = catSelect.closest('.cat-select-row');
    const manageBtn = row.querySelector('.cat-manage-btn');
    const searchInput = convSearch;
    if (STATE.activeCategoryId) {
        const cat = readCategory(STATE.activeCategoryId);
        if (cat && cat.couleur) {
            row.style.backgroundColor = cat.couleur + '22';
            row.style.borderColor = cat.couleur;
            if (manageBtn) manageBtn.style.borderLeftColor = cat.couleur;
            catSelectLabel.style.color = 'var(--text)';
            if (searchInput) searchInput.dataset.catCouleur = cat.couleur;
            return;
        }
    }
    row.style.backgroundColor = '';
    row.style.borderColor = '';
    if (manageBtn) manageBtn.style.borderLeftColor = '';
    catSelectLabel.style.color = '';
    if (searchInput) {
        searchInput.dataset.catCouleur = '';
        searchInput.style.borderColor = '';
    }
}

function updateNewChatBtnColor() {
    if (STATE.activeCategoryId) {
        const cat = readCategory(STATE.activeCategoryId);
        if (cat) {
            newChatBtn.style.background = cat.couleur;
            newChatBtn.style.borderColor = cat.couleur;
            newChatBtn.style.color = textColorForBg(cat.couleur);
            updateActiveCatColor();
            return;
        }
    }
    newChatBtn.style.background = '';
    newChatBtn.style.borderColor = '';
    newChatBtn.style.color = '';
    updateActiveCatColor();
}

function updateActiveCatColor() {
    // Conversation existante → sa propre catégorie ; conversation vierge → catégorie du sidebar
    const catId = STATE.conversationId ? STATE.currentConversationCategory : STATE.activeCategoryId;
    if (catId) {
        const cat = readCategory(catId);
        if (cat && cat.couleur) {
            document.documentElement.style.setProperty('--active-cat-color', cat.couleur);
            return;
        }
    }
    document.documentElement.style.removeProperty('--active-cat-color');
}

// Bordure de recherche = couleur catégorie au focus
convSearch.addEventListener('focus', () => {
    if (convSearch.dataset.catCouleur) {
        convSearch.style.borderColor = convSearch.dataset.catCouleur;
    }
});
convSearch.addEventListener('blur', () => {
    convSearch.style.borderColor = '';
});

// Custom dropdown toggle
catSelect.addEventListener('click', () => {
    const open = catSelectDropdown.style.display !== 'none';
    catSelectDropdown.style.display = open ? 'none' : '';
    catSelect.classList.toggle('open', !open);
});

// Sélection d'une option
catSelectDropdown.addEventListener('click', (e) => {
    const opt = e.target.closest('.cat-select-option');
    if (!opt) return;
    STATE.activeCategoryId = opt.dataset.value || null;
    catSelectDropdown.style.display = 'none';
    catSelect.classList.remove('open');
    refreshCatBar();
    refreshConvList();
    if (!STATE.conversationId) {
        STATE.currentConversationCategory = STATE.activeCategoryId;
        updateActiveCatColor();
        promptInput.focus();
    }
});

// Fermer le dropdown au clic extérieur
document.addEventListener('click', (e) => {
    if (!catSelect.contains(e.target) && !catSelectDropdown.contains(e.target)) {
        catSelectDropdown.style.display = 'none';
        catSelect.classList.remove('open');
    }
});



// --- Emoji Picker ---
const EMOJI_LIBRARY = {
    'Smileys': ['😀','😃','😄','😁','😆','😅','🤣','😂','🙂','😊','😇','🥰','😍','🤩','😘','😋','😛','🤔','🤗','🤫','🤭','😏','😌','😴','🤓','😎','🥳','😤','😠','🤯','😱','🥺','😢','😭','🫠'],
    'Gestes': ['👍','👎','👏','🙌','🤝','✌️','🤞','🤟','🤘','👌','🫶','💪','👋','✋','🖐️','🤚','👆','👇','👈','👉','☝️','🫵','🙏'],
    'Coeurs': ['❤️','🧡','💛','💚','💙','💜','🖤','🤍','🤎','💔','❤️‍🔥','💕','💞','💓','💗','💖','💘','💝','♥️'],
    'Travail': ['💼','📁','📂','📊','📈','📉','📋','📌','📎','✏️','📝','🗂️','🗃️','🗄️','💻','🖥️','⌨️','🖱️','📱','📧','✉️','📬','🏢','🏠','⏰','📅','🗓️'],
    'Science': ['🔬','🔭','⚗️','🧪','🧫','🧬','💊','💉','🩺','🧮','📐','📏','🔋','⚡','🧲','🌡️','☢️','☣️'],
    'Creative': ['🎨','🎭','🎬','🎤','🎧','🎵','🎶','🎸','🎹','🥁','🎻','📷','📸','🎥','🖌️','🖍️','✒️','🪄','💡','📖','📚','✍️'],
    'Nature': ['🌸','🌺','🌻','🌹','🌷','🌱','🌿','🍀','🌳','🌲','🍃','🍂','🍁','🌍','🌎','🌏','🌙','⭐','🌟','✨','☀️','🌈','🔥','💧','❄️','🌊'],
    'Animaux': ['🐱','🐶','🐭','🐹','🐰','🦊','🐻','🐼','🐨','🐯','🦁','🐮','🐷','🐸','🐵','🐔','🐧','🐦','🦅','🦋','🐝','🐞','🐢','🐍','🐬','🐳','🦄','🐲'],
    'Food': ['🍕','🍔','🍟','🌭','🌮','🌯','🍣','🍜','🍝','🍩','🍪','🎂','🍰','🍫','🍬','☕','🍵','🍺','🍷','🥤','🍎','🍊','🍋','🍇','🍓','🍑','🥑','🥕'],
    'Transport': ['🚗','🚕','🚌','🚎','🏎️','🚓','🚑','🚒','✈️','🚀','🛸','🚁','⛵','🚢','🚲','🛴','🏍️','🚄','🚅','🚇'],
    'Objets': ['🔑','🗝️','🔒','🔓','🛡️','⚔️','🏆','🥇','🥈','🥉','🎯','🎮','🧩','🎲','♟️','🔮','🧿','🎁','🎀','🏷️','💎','👑','🧸','🪩'],
    'Symboles': ['✅','❌','⭕','❗','❓','💯','🔴','🟠','🟡','🟢','🔵','🟣','⚫','⚪','🟤','🔶','🔷','▶️','⏸️','⏹️','🔄','💤','🚫','♻️','⚠️','🏳️','🏴','🚩']
};

const emojiPickerEl = document.getElementById('emoji-picker');
const emojiGridEl = document.getElementById('emoji-grid');
const emojiTabsEl = document.getElementById('emoji-tabs');
const emojiSearchEl = document.getElementById('emoji-search');
const emojiIconeBtn = document.getElementById('cat-modal-icone-btn');
const emojiPreview = document.getElementById('cat-modal-icone-preview');

function initEmojiTabs() {
    emojiTabsEl.innerHTML = '';
    const categories = Object.keys(EMOJI_LIBRARY);
    for (const cat of categories) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'emoji-tab';
        btn.textContent = EMOJI_LIBRARY[cat][0];
        btn.title = cat;
        btn.addEventListener('click', () => {
            emojiSearchEl.value = '';
            renderEmojiGrid(cat);
            emojiTabsEl.querySelectorAll('.emoji-tab').forEach(t => t.classList.remove('active'));
            btn.classList.add('active');
        });
        emojiTabsEl.appendChild(btn);
    }
}

function renderEmojiGrid(activeCategory = null, filter = '') {
    emojiGridEl.innerHTML = '';
    const query = filter.toLowerCase();
    const categories = Object.entries(EMOJI_LIBRARY);

    for (const [catName, emojis] of categories) {
        if (activeCategory && catName !== activeCategory) continue;

        const filtered = query
            ? emojis.filter(e => e.includes(query) || catName.toLowerCase().includes(query))
            : emojis;

        if (filtered.length === 0) continue;

        if (!activeCategory || query) {
            const label = document.createElement('div');
            label.className = 'emoji-cat-label';
            label.textContent = catName;
            emojiGridEl.appendChild(label);
        }

        for (const emoji of filtered) {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'emoji-grid-item';
            btn.textContent = emoji;
            btn.addEventListener('click', () => {
                catModalIcone.value = emoji;
                emojiPreview.textContent = emoji;
                hideEmojiPicker();
            });
            emojiGridEl.appendChild(btn);
        }
    }

    if (emojiGridEl.children.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'emoji-cat-label';
        empty.textContent = 'Aucun résultat';
        emojiGridEl.appendChild(empty);
    }
}

function _getEmojiModal() {
    return emojiPickerEl.closest('.sp-modal');
}

function showEmojiPicker() {
    initEmojiTabs();
    emojiSearchEl.value = '';
    renderEmojiGrid();
    const modal = _getEmojiModal();
    if (modal) {
        let backdrop = modal.querySelector('.emoji-picker-backdrop');
        if (!backdrop) {
            backdrop = document.createElement('div');
            backdrop.className = 'emoji-picker-backdrop';
            backdrop.addEventListener('click', hideEmojiPicker);
            modal.appendChild(backdrop);
        }
        backdrop.style.display = '';
    }
    emojiPickerEl.style.display = '';
    emojiTabsEl.querySelectorAll('.emoji-tab').forEach(t => t.classList.remove('active'));
    emojiSearchEl.focus();
}

function hideEmojiPicker() {
    emojiPickerEl.style.display = 'none';
    const modal = _getEmojiModal();
    if (modal) {
        const backdrop = modal.querySelector('.emoji-picker-backdrop');
        if (backdrop) backdrop.style.display = 'none';
    }
}

emojiIconeBtn.addEventListener('click', () => {
    const visible = emojiPickerEl.style.display !== 'none';
    if (visible) {
        hideEmojiPicker();
    } else {
        showEmojiPicker();
    }
});

emojiSearchEl.addEventListener('input', () => {
    emojiTabsEl.querySelectorAll('.emoji-tab').forEach(t => t.classList.remove('active'));
    renderEmojiGrid(null, emojiSearchEl.value.trim());
});

// Fermer le picker si on clique en dehors
document.addEventListener('click', (e) => {
    if (emojiPickerEl.style.display !== 'none'
        && !emojiPickerEl.contains(e.target)
        && !emojiIconeBtn.contains(e.target)) {
        hideEmojiPicker();
    }
});

// Fermer tous les menus contextuels ouverts
function closeAllMenus(except) {
    document.querySelectorAll('.copy-menu.open').forEach(m => { if (m !== except) m.classList.remove('open'); });
    document.querySelectorAll('.menu-open').forEach(b => b.classList.remove('menu-open'));
}

document.addEventListener('click', () => closeAllMenus());

function selectCatColor(color) {
    STATE._selectedCatColor = color;
    catColorGrid.querySelectorAll('.cat-color-swatch').forEach(s => {
        s.classList.toggle('selected', s.dataset.color === color);
    });
}

const DEFAULT_EMOJIS = ['📁','💼','🎯','💡','🔧','📌','🚀','🎨','📚','🏠','💬','🔬','🎵','🌍','⚡','🧩','📊','🛠️','✨','🎲'];

function randomDefaultEmoji() {
    return DEFAULT_EMOJIS[Math.floor(Math.random() * DEFAULT_EMOJIS.length)];
}

function openCatModal(catId, fromManage) {
    STATE.editingCategoryId = catId;
    STATE._catEditFromManagePopup = !!fromManage || (catModalOverlay.style.display !== 'none');
    hideEmojiPicker();
    if (catId) {
        const cat = readCategory(catId);
        if (!cat) return;
        catModalTitle.textContent = 'Modifier la catégorie';
        catModalNom.value = cat.nom;
        catModalIcone.value = cat.icone;
        emojiPreview.textContent = cat.icone || randomDefaultEmoji();
        selectCatColor(cat.couleur || '#3b82f6');
        catModalDelete.style.display = '';
    } else {
        const defaultEmoji = randomDefaultEmoji();
        catModalTitle.textContent = 'Nouvelle catégorie';
        catModalNom.value = '';
        catModalIcone.value = defaultEmoji;
        emojiPreview.textContent = defaultEmoji;
        selectCatColor('#3b82f6');
        catModalDelete.style.display = 'none';
    }
    // Afficher Retour si on vient du popup management, sinon Annuler
    catModalBack.style.display = STATE._catEditFromManagePopup ? '' : 'none';
    catModalCancel.style.display = STATE._catEditFromManagePopup ? 'none' : '';
    catManageListView.style.display = 'none';
    catManageEditView.style.display = '';
    catModalOverlay.style.display = '';
    catModalNom.focus();
}

// --- Gestion des catégories : popup management ---

async function renderCatManageList() {
    const cats = listCategories();
    catManageList.innerHTML = '';
    if (cats.length === 0) {
        catManageList.innerHTML = '<div class="cat-manage-empty">Aucune catégorie pour le moment.<br>Créez-en une ci-dessous.</div>';
        return;
    }
    // Compter les conversations par catégorie
    const convs = await listConversationFiles();
    const countMap = {};
    for (const c of convs) {
        if (c.category) countMap[c.category] = (countMap[c.category] || 0) + 1;
    }
    for (const cat of cats) {
        const count = countMap[cat.id] || 0;
        const colorRaw = cat.couleur || '#3b82f6';
        const color = /^#[0-9a-fA-F]{3,8}$/.test(colorRaw) ? colorRaw : '#3b82f6';
        // Calculer une couleur de fond plus claire (15% opacité)
        const item = document.createElement('div');
        item.className = 'cat-manage-item';
        item.innerHTML =
            `<div class="cat-manage-item-badge" style="background:${color}22;color:${color}">${escHtml(cat.icone || '?')}</div>` +
            `<div class="cat-manage-item-info">` +
                `<span class="cat-manage-item-name">${escHtml(cat.nom || '')}</span>` +
                `<span class="cat-manage-item-meta">${count} conversation${count > 1 ? 's' : ''}</span>` +
            `</div>` +
            `<span class="cat-manage-item-arrow">›</span>`;
        item.addEventListener('click', () => openCatModal(cat.id));
        catManageList.appendChild(item);
    }
}

async function openCatManagePopup() {
    catManageListView.style.display = '';
    catManageEditView.style.display = 'none';
    await renderCatManageList();
    catModalOverlay.style.display = '';
}

catManageBtn.addEventListener('click', () => {
    openCatManagePopup();
});

catManageAddBtn.addEventListener('click', () => {
    openCatModal(null);
});

catManageClose.addEventListener('click', () => {
    catModalOverlay.style.display = 'none';
});

catModalBack.addEventListener('click', async () => {
    hideEmojiPicker();
    if (STATE._catEditFromManagePopup) {
        catManageEditView.style.display = 'none';
        catManageListView.style.display = '';
        await renderCatManageList();
    } else {
        catModalOverlay.style.display = 'none';
    }
});

catModalCancel.addEventListener('click', () => {
    hideEmojiPicker();
    catModalOverlay.style.display = 'none';
});

catModalOverlay.addEventListener('click', (e) => {
    if (e.target === catModalOverlay) catModalOverlay.style.display = 'none';
});

catModalSave.addEventListener('click', async () => {
    const nom = catModalNom.value.trim();
    if (!nom) return;
    const id = STATE.editingCategoryId || ('cat_' + Date.now());
    writeCategory(id, {
        nom,
        couleur: STATE._selectedCatColor,
        icone: catModalIcone.value || '?'
    });
    hideEmojiPicker();
    if (STATE._catEditFromManagePopup) {
        catManageEditView.style.display = 'none';
        catManageListView.style.display = '';
        await renderCatManageList();
    } else {
        catModalOverlay.style.display = 'none';
    }
    refreshCatBar();
});

catModalDelete.addEventListener('click', async () => {
    if (!STATE.editingCategoryId) return;
    if (!await customConfirm('Supprimer cette catégorie ? Les conversations seront décatégorisées.', { icon: 'delete', danger: true, okLabel: 'Supprimer' })) return;
    const conversations = await listConversationFiles();
    for (const conv of conversations) {
        if (conv.category === STATE.editingCategoryId) {
            await updateConversationCategory(conv.filename, null);
        }
    }
    if (STATE.currentConversationCategory === STATE.editingCategoryId) {
        STATE.currentConversationCategory = null;
    }
    deleteCategory(STATE.editingCategoryId);
    hideEmojiPicker();
    if (STATE._catEditFromManagePopup) {
        catManageEditView.style.display = 'none';
        catManageListView.style.display = '';
        await renderCatManageList();
    } else {
        catModalOverlay.style.display = 'none';
    }
    if (STATE.activeCategoryId === STATE.editingCategoryId) STATE.activeCategoryId = null;
    refreshCatBar();
    refreshConvList();
    updateActiveCatColor();
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

    // Créer le DOM personnalisé
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
        // Fermer les autres dropdowns ouverts
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

    // Fermer au clic extérieur
    document.addEventListener('click', (e) => {
        if (!container.contains(e.target)) {
            container.classList.remove('open');
        }
    });

    // Fermer avec Escape
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

// --- Initialisation ---
Auth.init().then(() => {
    // Stockage persistant : empêche iOS Safari de vider IndexedDB au hard refresh
    if (navigator.storage && navigator.storage.persist) {
        navigator.storage.persist().catch(function(){});
    }
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
        var _syncPromise = typeof syncPullFromServer === 'function'
            ? syncPullFromServer().then(function(n) {
                if (n > 0) { refreshConvList(); renderFavList(); }
              }).catch(function(){})
            : Promise.resolve();
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
    _initUserManagement();

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
    // Forcer l'onglet Texte et synchroniser la valeur affichée
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
    });
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
    const modelId = AUDIO_SETTINGS.titleModel || modelHint || STATE.currentModel || STATE.currentImageModel || STATE.currentSearchModel;
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
                nameSpan.addEventListener('click', () => {
                    const url = makeBlobUrl();
                    if (!url) return;
                    openFileViewer(url, file.name);
                    // Le viewer charge l'URL synchroniquement ; on peut révoquer après un court délai.
                    setTimeout(() => URL.revokeObjectURL(url), 60000);
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
        });
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
            if (e.target.closest('.copy-menu-item')) return;
            // Si un audio est en cours, l'arrêter
            if (STATE.currentTtsAudio) {
                if (STATE.currentTtsAudio === 'system') {
                    window.speechSynthesis.cancel();
                } else if (typeof STATE.currentTtsAudio === 'function') {
                    // Handle de stop exposé par un provider streaming (Mistral)
                    try { currentTtsAudio(); } catch (e) {}
                } else {
                    STATE.currentTtsAudio.pause();
                    STATE.currentTtsAudio.currentTime = 0;
                }
                STATE.currentTtsAudio = null;
                document.querySelectorAll('.tts-icon').forEach(ic => { ic.innerHTML = iconPlay; });
                document.querySelectorAll('.message-tts-btn').forEach(b => { b.title = 'Lire à haute voix'; });
                return;
            }
            if (ttsIsLoading) return;
            // Provider non configuré : afficher l'alerte sans ouvrir le menu
            if (!AUDIO_SETTINGS.ttsProvider) {
                showNoModelAlert('la synthèse vocale', 'audio-tts-provider');
                return;
            }
            // Si provider système, lire directement (pas de menu save — pas de blob à enregistrer)
            if (getIsSystemTts()) {
                ttsDoSpeak();
                return;
            }
            closeAllMenus(ttsMenu);
            ttsMenu.classList.toggle('open');
            ttsBtn.classList.toggle('menu-open', ttsMenu.classList.contains('open'));
            if (ttsMenu.classList.contains('open')) positionMenu(ttsMenu, ttsBtn);
            e.stopPropagation();
        });

        ttsMenu.addEventListener('click', (e) => {
            const item = e.target.closest('.copy-menu-item');
            if (!item) return;
            e.stopPropagation();
            ttsMenu.classList.remove('open');
            ttsBtn.classList.remove('menu-open');
            if (item.dataset.mode === 'save') ttsDoSave();
            else ttsDoSpeak();
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
    // Figer la largeur actuelle (inclut le min-width éventuel du collapseThinkBlock)
    const currentW = el.offsetWidth;
    el.classList.remove('streaming');
    el.classList.add('streaming-done');
    el.style.minWidth = currentW + 'px';
    el.style.transition = 'min-width 0.4s ease-out';
    requestAnimationFrame(() => {
        el.style.minWidth = '';
    });
    el.addEventListener('animationend', () => el.classList.remove('streaming-done'), { once: true });
    setTimeout(() => {
        el.style.transition = '';
    }, 500);
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
    const startColor = document.body.classList.contains('dark') ? '#000000' : '#ffffff';
    const span = document.createElement('span');
    span.className = 'char-flash';
    span.style.color = startColor;
    span.style.transition = 'color 600ms linear';
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
    // Double rAF : la 1re tick force le moteur à peindre l'état initial (color
    // blanc/noir inline) ; la 2e retire l'inline → transition CSS vers la
    // couleur héritée. Sans ce double rAF, certains navigateurs court-circuitent
    // la transition parce que la modification a lieu dans la même frame.
    requestAnimationFrame(() => {
        requestAnimationFrame(() => {
            if (span.isConnected) span.style.color = '';
        });
    });
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
        // Ne reparse que si au moins 20 nouveaux chars ou flush final (buffer vide)
        if (displayed.length - lastParsedLen >= 20 || buffer.length === 0) {
            lastParsedLen = displayed.length;
            textEl.innerHTML = marked.parse(displayed);
            scrollToBottom();
            _ensureStickyHandler(textEl);
            // Scroll interne du textEl (pour les blocs scrollables comme .thinking-content)
            if (!_userScrolledUp && textEl.scrollHeight > textEl.clientHeight) {
                textEl.scrollTop = textEl.scrollHeight;
            }
        }
    }

    function _flush() {
        timer = null;
        if (buffer.length === 0) return;
        displayed += buffer;
        buffer = '';
        render();
    }

    return {
        add(chunk) {
            buffer += chunk;
            if (!timer) timer = setTimeout(_flush, 80);
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
        // Afficher le titre si disponible, sinon le domaine
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

    // Masquer le btnRow existant
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

        // Supprimer tous les wrappers DOM après celui-ci (+ les model-switch markers)
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

        // ── Model Fusion Router (regen) ──────────────────────────
        var _routedBy = null;
        if (activeTextModel && activeTextModel.indexOf('samagent-') === 0) {
            _showRouterThinking(assistantDiv);
            var _routeRegen = await routeModel(newText, activeTextModel);
            _hideRouterThinking(assistantDiv);
            _routedBy = _routeRegen.label;
            activeTextModel = _routeRegen.modelId;
            STATE._routerForceThinking = _routeRegen.thinking;
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
            })()
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

    // Initialiser la conversation si c'est le premier message
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

    // Afficher le message utilisateur
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

    // Créer le bloc de réponse assistant
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

    // ── Model Fusion Router ──────────────────────────────────────
    var _routedBy = null;
    if (activeTextModel && activeTextModel.indexOf('samagent-') === 0) {
        _showRouterThinking(assistantDiv);
        var _route = await routeModel(text, activeTextModel);
        _hideRouterThinking(assistantDiv);
        _routedBy = _route.label;
        activeTextModel = _route.modelId;
        STATE._routerForceThinking = _route.thinking;
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
            })()
        );
    }
}

// --- Liste des conversations dans la sidebar ---
async function refreshConvList() {
    const conversations = await listConversationFiles();
    convList.innerHTML = '';
    STATE._fullTextsLoaded = false;

    // Couleur active selon la catégorie filtrée
    if (STATE.activeCategoryId) {
        const activeCat = readCategory(STATE.activeCategoryId);
        if (activeCat && activeCat.couleur) {
            convList.style.setProperty('--cat-color', activeCat.couleur);
            convList.style.setProperty('--cat-color-light', activeCat.couleur + '18');
        } else {
            convList.style.removeProperty('--cat-color');
            convList.style.removeProperty('--cat-color-light');
        }
    } else {
        convList.style.removeProperty('--cat-color');
        convList.style.removeProperty('--cat-color-light');
    }

    const fragment = document.createDocumentFragment();
    for (const conv of conversations) {
        // Filtre catégorie
        if (STATE.activeCategoryId) {
            if (conv.category !== STATE.activeCategoryId) continue;
        }

        const item = document.createElement('div');
        item.className = 'conv-item';
        item.dataset.filename = conv.filename;
        item.dataset.lastActivity = conv.lastActivity || conv.date || '';

        // Drag & drop
        item.draggable = true;
        item.addEventListener('dragstart', (e) => {
            e.dataTransfer.setData('text/plain', conv.filename);
            item.classList.add('dragging');
        });
        item.addEventListener('dragend', () => {
            item.classList.remove('dragging');
        });

        const itemContent = document.createElement('div');
        itemContent.className = 'conv-item-content';

        const title = document.createElement('div');
        title.className = 'conv-item-title';
        if (conv.titre) {
            title.textContent = conv.titre;
        } else {
            const firstMsg = conv.firstMessage || '';
            const titleText = typeof firstMsg === 'string' ? firstMsg : getTextFromContent(firstMsg);
            title.textContent = titleText
                ? titleText.substring(0, 30) + (titleText.length > 30 ? '...' : '')
                : conv.id;
        }

        const dateLine = document.createElement('div');
        dateLine.className = 'conv-item-date-line';

        const date = document.createElement('span');
        date.className = 'conv-item-date';
        // Cohérent avec refreshConvListItem : on affiche la dernière activité,
        // pas la date de création. Sans ça, le simple fait de quitter une conv
        // (qui déclenche un save → refresh DOM) faisait basculer l'affichage
        // de date de création vers lastActivity et donnait l'impression que
        // l'heure avait changé.
        const ts = conv.lastActivity || conv.date;
        if (ts) {
            const d = new Date(ts);
            date.textContent = d.toLocaleDateString('fr-FR') + ' ' + d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
        }

        const actionsDiv = document.createElement('div');
        actionsDiv.className = 'conv-item-actions';

        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'conv-action-btn danger';
        deleteBtn.innerHTML = '<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M9 6V4h6v2"/></svg>';
        deleteBtn.title = 'Supprimer cette conversation';
        deleteBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            deleteConversation(conv.filename);
        });

        const renameBtn = document.createElement('button');
        renameBtn.className = 'conv-action-btn';
        renameBtn.innerHTML = '<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.83 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/></svg>';
        renameBtn.title = 'Renommer';
        renameBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            renameConversation(conv.filename, title);
        });

        const catBtn = document.createElement('button');
        catBtn.className = 'conv-action-btn';
        catBtn.innerHTML = '<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>';
        catBtn.title = 'Changer de catégorie';
        catBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            const existing = document.getElementById('conv-cat-popup');
            if (existing) {
                const sameConv = existing.dataset.filename === conv.filename;
                existing.remove();
                if (sameConv) return;
            }
            showCatPopup(catBtn, conv.filename, conv.category);
        });

        const favBtn = document.createElement('button');
        favBtn.className = 'conv-action-btn fav-toggle';
        favBtn.innerHTML = '<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>';
        favBtn.title = 'Ajouter aux favoris';
        if (_isFavorite(conv.filename)) {
            favBtn.classList.add('active');
            favBtn.title = 'Retirer des favoris';
        }
        favBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            _toggleFavorite(conv.filename);
            favBtn.classList.toggle('active');
            favBtn.title = favBtn.classList.contains('active') ? 'Retirer des favoris' : 'Ajouter aux favoris';
            renderFavList();
        });

        actionsDiv.appendChild(favBtn);
        actionsDiv.appendChild(deleteBtn);
        actionsDiv.appendChild(renameBtn);
        actionsDiv.appendChild(catBtn);

        dateLine.appendChild(date);
        dateLine.appendChild(actionsDiv);

        itemContent.appendChild(title);
        itemContent.appendChild(dateLine);

        item.appendChild(itemContent);
        item.addEventListener('click', () => {
            loadConversation(conv.filename);
            // Sur mobile, fermer la sidebar après sélection
            if (window.innerWidth < 768) {
                document.body.classList.remove('sidebar-open');
            }
        });
        // Support tactile immédiat (pas de délai 300ms)
        item.style.touchAction = 'manipulation';
        fragment.appendChild(item);
    }
    convList.appendChild(fragment);
    highlightActiveConv();
    renderFavList();

    if (convSearch.value) {
        convSearch.dispatchEvent(new Event('input'));
    }
}

// Mise à jour incrémentale d'un seul item de la sidebar à partir des métadonnées
// fraîchement écrites. Évite un `refreshConvList` complet (lecture totale BD +
// reconstruction du DOM) après chaque save/regen/model-switch.
//   - retourne true si la mise à jour DOM a été appliquée (item présent)
//   - retourne false si l'item n'existe pas (caller doit faire un refresh complet)
function refreshConvListItem(filename) {
    if (typeof getConvMetadata !== 'function') return false;
    const meta = getConvMetadata(filename);
    if (!meta) return false;

    const escapedFn = (typeof CSS !== 'undefined' && CSS.escape)
        ? CSS.escape(filename)
        : filename.replace(/"/g, '\\"');
    const existing = convList.querySelector(`.conv-item[data-filename="${escapedFn}"]`);
    if (!existing) return false;

    // Si la conv ne matche plus la catégorie active, la retirer du DOM. Le filtrage
    // initial de `refreshConvList` aurait fait la même chose après reload complet.
    if (STATE.activeCategoryId && meta.category !== STATE.activeCategoryId) {
        existing.remove();
        return true;
    }

    // Mise à jour du titre — sauf si un input de renommage est actuellement ouvert
    // (sinon on écraserait la saisie en cours).
    const titleEl = existing.querySelector('.conv-item-title');
    if (titleEl && !titleEl.querySelector('input')) {
        if (meta.titre) {
            titleEl.textContent = meta.titre;
        } else {
            const firstMsg = meta.firstMessage || '';
            const titleText = typeof firstMsg === 'string' ? firstMsg : getTextFromContent(firstMsg);
            titleEl.textContent = titleText
                ? titleText.substring(0, 30) + (titleText.length > 30 ? '...' : '')
                : meta.id;
        }
    }

    const dateEl = existing.querySelector('.conv-item-date');
    if (dateEl) {
        const ts = meta.lastActivity || meta.date;
        if (ts) {
            const d = new Date(ts);
            dateEl.textContent = d.toLocaleDateString('fr-FR') + ' ' + d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
        }
    }

    // Déplacer en tête uniquement si lastActivity a réellement avancé.
    // Sinon (ex. simple changement de conv sans nouveau message), on garde
    // l'ordre courant pour ne pas faire remonter la conv inutilement.
    const newTs = meta.lastActivity || meta.date || '';
    const prevTs = existing.dataset.lastActivity || '';
    if (newTs && newTs > prevTs) {
        existing.dataset.lastActivity = newTs;
        if (convList.firstChild !== existing) {
            convList.insertBefore(existing, convList.firstChild);
        }
    }
    // Le contenu textuel de la conv a probablement changé : invalider le cache
    // de recherche full-text (équivalent au reset que faisait `refreshConvList`).
    STATE._fullTextsLoaded = false;
    return true;
}

function showCatPopup(btn, filename, currentCategoryId) {
    const categories = listCategories();

    const popup = document.createElement('div');
    popup.className = 'conv-cat-popup';
    popup.id = 'conv-cat-popup';
    popup.dataset.filename = filename;

    const noCatItem = document.createElement('div');
    noCatItem.className = 'conv-cat-popup-item' + (!currentCategoryId ? ' active' : '');
    noCatItem.innerHTML = '<span style="opacity:0.4;font-size:0.8rem">—</span><span>Sans catégorie</span>';
    noCatItem.addEventListener('click', async () => {
        await updateConversationCategory(filename, null);
        const expectedFn = STATE.conversationId
            ? STATE.conversationId.replace(/[<>:"/\\|?*]/g, '_') + '.json'
            : null;
        if (filename === expectedFn) {
            STATE.currentConversationCategory = null;
            updateActiveCatColor();
        }
        popup.remove();
        refreshConvList();
    });
    popup.appendChild(noCatItem);

    if (categories.length > 0) {
        const sep = document.createElement('div');
        sep.className = 'conv-cat-popup-separator';
        popup.appendChild(sep);

        for (const cat of categories) {
            const catItem = document.createElement('div');
            catItem.className = 'conv-cat-popup-item' + (currentCategoryId === cat.id ? ' active' : '');
            if (currentCategoryId === cat.id && cat.couleur) {
                catItem.style.background = cat.couleur + '22';
            }
            catItem.innerHTML = `<span>${cat.icone || '📁'}</span><span>${cat.nom}</span>`;
            catItem.addEventListener('click', async () => {
                await updateConversationCategory(filename, cat.id);
                const expectedFn = STATE.conversationId
                    ? STATE.conversationId.replace(/[<>:"/\\|?*]/g, '_') + '.json'
                    : null;
                if (filename === expectedFn) {
                    STATE.currentConversationCategory = cat.id;
                    updateActiveCatColor();
                }
                popup.remove();
                refreshConvList();
            });
            popup.appendChild(catItem);
        }
    }

    document.body.appendChild(popup);

    // Positionner à droite de la sidebar, aligné verticalement sur le bouton
    const sidebar = document.querySelector('.sidebar');
    const sidebarRect = sidebar.getBoundingClientRect();
    const btnRect = btn.getBoundingClientRect();
    const popupH = popup.offsetHeight;

    let top = btnRect.top + btnRect.height / 2 - 20;
    const maxTop = window.innerHeight - popupH - 8;
    if (top > maxTop) top = maxTop;
    if (top < 8) top = 8;

    popup.style.left = (sidebarRect.right + 8) + 'px';
    popup.style.top = top + 'px';

    // Fermer au clic extérieur
    const closeHandler = (e) => {
        if (!popup.contains(e.target)) {
            popup.remove();
            document.removeEventListener('click', closeHandler);
        }
    };
    setTimeout(() => document.addEventListener('click', closeHandler), 0);
}

async function renameConversation(filename, titleEl) {
    const currentTitle = titleEl.textContent;
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'conv-rename-input';
    input.value = currentTitle;
    titleEl.textContent = '';
    titleEl.appendChild(input);
    input.addEventListener('click', (e) => e.stopPropagation());
    input.focus();
    input.select();

    const finish = async () => {
        const newTitle = input.value.trim();
        if (newTitle && newTitle !== currentTitle) {
            // Mettre à jour dans IndexedDB
            const data = await readConversationFile(filename);
            if (data) {
                data.titre = newTitle;
                await writeConversationFile(filename, data);
            }
            // Mettre à jour la variable si c'est la conversation active
            const expectedFn = STATE.conversationId
                ? STATE.conversationId.replace(/[<>:"/\\|?*]/g, '_') + '.json'
                : null;
            if (filename === expectedFn) {
                STATE.conversationTitle = newTitle;
                updateChatHeader();
            }
        }
        titleEl.textContent = newTitle || currentTitle;
    };

    input.addEventListener('blur', finish);
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); input.blur(); }
        if (e.key === 'Escape') { input.value = currentTitle; input.blur(); }
    });
}

async function deleteConversation(filename) {
    if (!await customConfirm('Souhaitez-vous supprimer cette conversation ?\nCette action est irréversible.', { icon: 'delete', danger: true, okLabel: 'Supprimer' })) return;
    // Abandonner le stream éventuel pour la conv supprimée
    const _delConvId = filename.replace(/\.json$/i, '');
    for (const [convId, ctx] of STATE._activeStreams.entries()) {
        const fn = convId.replace(/[<>:"/\\|?*]/g, '_');
        if (fn === _delConvId) {
            try { ctx.abortController.abort(); } catch (e) {}
            STATE._activeStreams.delete(convId);
        }
    }
    await deleteConversationFile(filename);
    const expectedFn = STATE.conversationId
        ? STATE.conversationId.replace(/[<>:"/\\|?*]/g, '_') + '.json'
        : null;
    if (filename === expectedFn) {
        resetConversation();
    }
    refreshConvList();
}

async function loadConversation(filename) {
    // Ne pas abandonner les streams en cours : ils continueront en arrière-plan
    // et persisteront leur résultat sur disque via leur STATE.conversationId capturé.
    // Ne sauvegarder que si on change vraiment de conversation : un rafraîchissement
    // de la conversation actuellement affichée (déclenché par _saveConvById après
    // complétion d'un stream) ne doit pas écraser le disque avec un global stale.
    const _currentFilename = STATE.conversationId
        ? STATE.conversationId.replace(/[<>:"/\\|?*]/g, '_') + '.json'
        : null;
    if (filename !== _currentFilename) {
        saveConversation();
    }

    const data = await readConversationFile(filename);
    if (!data) return;

    // Restaurer l'état de la conversation
    STATE.conversationId = data.id;
    localStorage.setItem('cetas-last-conv', filename);
    STATE.conversationTitle = data.titre || null;
    STATE.conversationStartTime = data.date;
    STATE.conversationLastActivity = data.lastActivity || data.date;
    const savedModel = migrateModelId(data.modele);
    STATE.conversationHistory = data.messages || [];
    STATE.totalInputTokens = data.tokens_entree || 0;
    STATE.totalOutputTokens = data.tokens_sortie || 0;
    STATE.totalCost = data.totalCost || 0;
    STATE.totalImageCost = data.cout_images || 0;
    STATE.totalAudioCost = data.cout_audio || 0;
    STATE.totalTitleCost = data.cout_titre || 0;
    STATE.costByModel = data.cost_by_model || {};
    STATE.currentConversationCategory = data.category || null;
    if (STATE.conversationHistory.length > 0) {
        const _firstContent = STATE.conversationHistory[0].content;
        const _firstText = getTextFromContent(_firstContent);
        if (_firstText) {
            STATE.firstPrompt = _firstText;
        } else if (Array.isArray(_firstContent)) {
            const _imgPart = _firstContent.find(p => p.type === 'image');
            const _filePart = _firstContent.find(p => p.type === 'file');
            const _files = _firstContent.filter(p => p.type === 'file');
            if (_imgPart) STATE.firstPrompt = '(image)';
            else if (_files.length === 1 && _filePart?.name) STATE.firstPrompt = `(${_filePart.name})`;
            else if (_files.length > 1) STATE.firstPrompt = '(fichiers joints)';
            else STATE.firstPrompt = '(message)';
        } else {
            STATE.firstPrompt = '(message)';
        }
    } else {
        STATE.firstPrompt = null;
    }
    STATE.conversationStarted = STATE.conversationHistory.length > 0;

    // Déterminer si c'est un modèle texte, image ou recherche et switcher l'onglet
    const isImageModel = IMAGE_MODELS.some(m => m.id === savedModel);
    const isSearchModel = SEARCH_MODELS.some(m => m.id === savedModel);
    const isTextModel = MODELS.some(m => m.id === savedModel);
    const isKnownModel = isImageModel || isSearchModel || isTextModel;
    if (isImageModel) {
        STATE.currentImageModel = savedModel;
        STATE.currentModel = null;
        STATE.currentSearchModel = null;
        _switchTab('image', false);
        modelSelect._customValue = savedModel;
        updateTriggerDisplay(modelSelect);
        updateActiveOption(modelSelect);
        updateImageParamsVisibility(getImageModelEditeur(savedModel) || '', savedModel);
        setRightPanelTab('image');
    } else if (isSearchModel) {
        STATE.currentSearchModel = savedModel;
        STATE.currentModel = null;
        STATE.currentImageModel = null;
        _switchTab('search', false);
        modelSelect._customValue = savedModel;
        updateTriggerDisplay(modelSelect);
        updateActiveOption(modelSelect);
        setRightPanelTab('general');
    } else if (isTextModel) {
        STATE.currentModel = savedModel;
        STATE.currentImageModel = null;
        STATE.currentSearchModel = null;
        _switchTab('text', false);
        modelSelect._customValue = savedModel;
        updateTriggerDisplay(modelSelect);
        updateActiveOption(modelSelect);
        updateEffortMandatory(savedModel);
        setRightPanelTab('general');
    } else {
        // Modèle d'origine indisponible (retiré de models.js, ou modèle local hors ligne).
        // Ne pas l'assigner à STATE.currentModel, l'utilisateur doit en choisir un autre avant d'envoyer.
        STATE.currentModel = null;
        STATE.currentImageModel = null;
        STATE.currentSearchModel = null;
        _switchTab('text', false);
        modelSelect._customValue = '';
        updateTriggerDisplay(modelSelect);
        updateActiveOption(modelSelect);
        setRightPanelTab('general');
        // Ne signaler que si un identifiant non vide est présent : une conversation
        // sauvegardée sans modèle (premier message en cours, file fraîchement créé)
        // n'a pas à déclencher d'alerte.
        if (savedModel) showMissingModelBanner(savedModel);
    }

    // Restaurer le system prompt
    if (data.system_prompt || data.systemPrompt) {
        const spName = data.system_prompt || data.systemPrompt;
        spSelect.value = '';
        for (const opt of spSelect.options) {
            if (opt.textContent === spName) { spSelect.value = opt.value; break; }
        }
        STATE.currentSystemPrompt = spSelect.value
            ? { nom: spName, contenu: spSelect.selectedOptions[0]?.dataset.contenu || '' }
            : { nom: spName, contenu: '' };
        spTextarea.value = STATE.currentSystemPrompt.contenu;
    } else {
        STATE.currentSystemPrompt = null;
        spSelect.value = '';
        spTextarea.value = '';
    }

    // Restaurer l'état du canvas (si présent dans la conversation)
    if (window.Canvas) {
        window.Canvas.loadFromConv(data.canvas || null);
    }
    if (typeof updateCanvasBtn === 'function') updateCanvasBtn();

    // Restaurer le modèle actif depuis le dernier model-switch
    const lastSwitch = [...STATE.conversationHistory].reverse().find(m => m.type === 'model-switch');
    if (lastSwitch) {
        const restoredModel = lastSwitch.to;
        const isImg = IMAGE_MODELS.some(m => m.id === restoredModel);
        const isSrch = SEARCH_MODELS.some(m => m.id === restoredModel);
        const isTxt = MODELS.some(m => m.id === restoredModel);
        if (isImg || isSrch || isTxt) {
            STATE.currentModel = null; STATE.currentImageModel = null; STATE.currentSearchModel = null;
            if (isImg) {
                STATE.currentImageModel = restoredModel;
                _switchTab('image', false);
            } else if (isSrch) {
                STATE.currentSearchModel = restoredModel;
                _switchTab('search', false);
            } else {
                STATE.currentModel = restoredModel;
                _switchTab('text', false);
            }
            modelSelect._customValue = restoredModel;
            updateTriggerDisplay(modelSelect);
            updateActiveOption(modelSelect);
        } else if (isKnownModel && restoredModel) {
            // Le model-switch pointe vers un modèle disparu, mais le modèle initial existe encore.
            // On garde la sélection initiale et on prévient l'utilisateur.
            showMissingModelBanner(restoredModel);
        }
    }

    spSelect.disabled = false;

    // Vider les pièces jointes en attente
    STATE.pendingImages = [];
    STATE.pendingFiles = [];
    cancelAllPendingLoads();
    attachPreview.innerHTML = '';

    // Réafficher les messages avec transition
    chatContainer.classList.remove('fade-in');
    chatContainer.innerHTML = '';
    for (const msg of STATE.conversationHistory) {
        if (msg.type === 'model-switch') {
            addModelSwitchElement(getModelLabel(msg.from), getModelLabel(msg.to));
        } else {
            const msgDiv = addMessage(msg.role === 'user' ? 'user' : 'assistant', msg.content, msg.citations, msg.generationTime, msg.thinking, msg.outputTokens, msg.model);
            if (msg.error) applyErrorStyle(msgDiv);
        }
    }
    void chatContainer.offsetWidth;
    chatContainer.classList.add('fade-in');

    // Si la conversation chargée a un stream en cours, restaurer l'état "streaming"
    // pour que le bouton Stop reste visible et fonctionnel, et réattacher le rendu
    // sur un nouvel assistantDiv pour voir le streaming live (texte) ou un placeholder (image).
    const _liveStream = STATE._activeStreams.get(STATE.conversationId);
    if (_liveStream) {
        STATE.isStreaming = true;
        STATE.currentAbortController = _liveStream.abortController;
        _rebindStreamToVisibleDOM(_liveStream);
    } else {
        STATE.isStreaming = false;
        STATE.currentAbortController = null;
        // Bulles assistant vides issues de l'historique (stream interrompu : onglet
        // fermé, app tuée pendant la génération…). Sans stream actif pour les
        // remplir, le placeholder « Génération en cours… » resterait affiché à vie.
        // On les convertit en message d'erreur standard et on persiste l'état.
        let _patchedStale = false;
        chatContainer.querySelectorAll('.message-assistant .generation-placeholder').forEach(ph => {
            const msgDiv = ph.closest('.message-assistant');
            const textEl = ph.parentElement;
            if (textEl) textEl.textContent = STREAM_ERROR_CONTENT;
            if (msgDiv) applyErrorStyle(msgDiv);
            _patchedStale = true;
        });
        if (_patchedStale) {
            for (const m of STATE.conversationHistory) {
                if (m.role !== 'assistant' || m.error) continue;
                if (getTextFromContent(m.content)) continue;
                // Préserver les messages image-only / fichier-only : un assistant
                // peut légitimement répondre avec une image sans texte.
                const hasMedia = Array.isArray(m.content)
                    && m.content.some(p => p.type === 'image' || p.type === 'file');
                if (hasMedia) continue;
                m.content = STREAM_ERROR_CONTENT;
                m.error = true;
            }
            saveConversation();
        }
    }

    updateTokenDisplay();
    updateSendButton();
    highlightActiveConv();
    updateExportMdBtn();
    addRegenBtn();
    updateChatHeader();
    updateActiveCatColor();
}

function updateChatHeader() {
    // No-op: chat header bar removed, settings button always visible
}

function highlightActiveConv() {
    const items = convList.querySelectorAll('.conv-item');
    for (const item of items) {
        const fn = item.dataset.filename;
        const expectedFn = STATE.conversationId
            ? STATE.conversationId.replace(/[<>:"/\\|?*]/g, '_') + '.json'
            : null;
        item.classList.toggle('active', fn === expectedFn);
    }
}

// --- Rôles (System Prompts) : liste, modale, CRUD ---

async function refreshSpList() {
    const prompts = await listSystemPrompts();

    // Sidebar list
    spListEl.innerHTML = '';
    for (const sp of prompts) {
        const item = document.createElement('div');
        item.className = 'sp-item';

        const name = document.createElement('span');
        name.className = 'sp-item-name';
        name.textContent = sp.nom;

        const actions = document.createElement('div');
        actions.className = 'sp-item-actions';

        const exportBtn = document.createElement('button');
        exportBtn.className = 'sp-item-btn';
        exportBtn.innerHTML = '<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19V5"/><path d="M5 12l7-7 7 7"/></svg>';
        exportBtn.title = 'Exporter';
        exportBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            exportSpItem(sp.filename);
        });

        const editBtn = document.createElement('button');
        editBtn.className = 'sp-item-btn';
        editBtn.textContent = '\u270E';
        editBtn.title = 'Modifier';
        editBtn.addEventListener('click', () => openSpModal(sp.filename));

        const delBtn = document.createElement('button');
        delBtn.className = 'sp-item-btn delete';
        delBtn.textContent = '\u00D7';
        delBtn.title = 'Supprimer';
        delBtn.addEventListener('click', () => deleteSpItem(sp.filename, sp.nom));

        actions.appendChild(exportBtn);
        actions.appendChild(editBtn);
        actions.appendChild(delBtn);
        item.appendChild(name);
        item.appendChild(actions);
        spListEl.appendChild(item);
    }

    // Select dropdown
    const prevValue = spSelect.value;
    spSelect.innerHTML = '<option value="">Sélectionner un rôle enregistré</option>';
    for (const sp of prompts) {
        const opt = document.createElement('option');
        opt.value = sp.filename;
        opt.textContent = sp.nom;
        opt.dataset.contenu = sp.contenu;
        spSelect.appendChild(opt);
    }
    spSelect.value = prevValue || '';
}

async function deleteSpItem(filename, nom) {
    if (!await customConfirm(`Supprimer le rôle "${nom}" ?`, { icon: 'delete', danger: true, okLabel: 'Supprimer' })) return;
    await deleteSystemPromptFile(filename);
    if (spSelect.value === filename) {
        spSelect.value = '';
        STATE.currentSystemPrompt = null;
    }
    refreshSpList();
}

async function exportSpItem(filename) {
    const data = await readSystemPrompt(filename);
    if (!data) return;
    const exportData = { _minou_role: true, nom: data.nom, contenu: data.contenu };
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const safeName = data.nom.replace(/[^a-zA-Z0-9àâéèêëïîôùûüçÀÂÉÈÊËÏÎÔÙÛÜÇ _-]/g, '_');
    a.download = `role-${safeName}.json`;
    a.click();
    URL.revokeObjectURL(url);
}

const spImportBtn = document.getElementById('sp-import-btn');
const spImportFile = document.getElementById('sp-import-file');

if (spImportBtn) spImportBtn.addEventListener('click', () => spImportFile.click());

spImportFile.addEventListener('change', async () => {
    const file = spImportFile.files[0];
    if (!file) return;
    spImportFile.value = '';
    try {
        const text = await file.text();
        const data = JSON.parse(text);
        if (!data._minou_role || !data.nom || !data.contenu) {
            showModelAlert('Ce fichier n\'est pas un rôle Cetas valide.');
            return;
        }
        const filename = data.nom.replace(/[^a-zA-Z0-9àâéèêëïîôùûüçÀÂÉÈÊËÏÎÔÙÛÜÇ _-]/g, '_') + '.json';
        await writeSystemPrompt(filename, { nom: data.nom, contenu: data.contenu });
        refreshSpList();
    } catch (e) {
        console.error('Erreur import rôle:', e);
        showModelAlert('Erreur lors de l\'import du rôle.');
    }
});

const spModalDelete = document.getElementById('sp-modal-delete');
let _spFromManagePopup = false;

function autoResizeTextarea(ta) {
    ta.style.height = 'auto';
    const maxH = window.innerHeight * 0.45;
    ta.style.height = Math.min(maxH, Math.max(120, ta.scrollHeight)) + 'px';
}

spModalContenu.addEventListener('input', () => autoResizeTextarea(spModalContenu));
prModalContenu.addEventListener('input', () => autoResizeTextarea(prModalContenu));

function openSpModal(filename = null, fromManage = false) {
    STATE.spEditingFilename = filename;
    _spFromManagePopup = fromManage;
    if (filename) {
        spModalTitle.textContent = 'Modifier le rôle';
        spModalDelete.style.display = '';
        readSystemPrompt(filename).then(data => {
            if (data) {
                spModalNom.value = data.nom;
                spModalContenu.value = data.contenu;
                autoResizeTextarea(spModalContenu);
            }
        });
    } else {
        spModalTitle.textContent = 'Nouveau rôle';
        spModalDelete.style.display = 'none';
        spModalNom.value = '';
        spModalContenu.value = '';
        spModalContenu.style.height = '';
    }
    spModalOverlay.style.display = 'flex';
    spModalNom.focus();
}

function closeSpModal() {
    spModalOverlay.style.display = 'none';
    STATE.spEditingFilename = null;
    if (_spFromManagePopup) {
        _spFromManagePopup = false;
        openRolesManage();
    }
}

const spModalOptimize = document.getElementById('sp-modal-optimize');

if (spAddBtn) spAddBtn.addEventListener('click', () => openSpModal());
spModalCancel.addEventListener('click', closeSpModal);

spModalDelete.addEventListener('click', async () => {
    if (!STATE.spEditingFilename) return;
    const data = await readSystemPrompt(STATE.spEditingFilename);
    const roleName = data ? data.nom : STATE.spEditingFilename;
    if (!await customConfirm(`Supprimer le rôle « ${roleName} » ?`, { icon: 'delete', danger: true, okLabel: 'Supprimer' })) return;
    await deleteSystemPromptFile(STATE.spEditingFilename);
    if (spSelect.value === STATE.spEditingFilename) {
        spSelect.value = '';
        STATE.currentSystemPrompt = null;
    }
    refreshSpList();
    closeSpModal();
});

spModalOptimize.addEventListener('click', async () => {
    const contenu = spModalContenu.value.trim();
    if (!contenu) return;

    if (!AUDIO_SETTINGS.enhanceModel) {
        showNoModelAlert('l\'amélioration de prompts', 'enhance-provider');
        return;
    }

    const originalHTML = spModalOptimize.innerHTML;
    spModalOptimize.disabled = true;
    spModalOptimize.textContent = 'Optimisation...';
    spModalContenu.classList.add('enhancing');
    spModalContenu.readOnly = true;

    try {
        const modelId = AUDIO_SETTINGS.enhanceModel;
        const prompt = `Tu es un expert en prompt engineering. Voici un system prompt (rôle) brut :\n\n---\n${contenu}\n---\n\nRéécris-le en une version optimisée, claire et structurée en markdown. Améliore la formulation, ajoute de la structure (titres, listes, emphases) pour le rendre plus efficace en tant que rôle/persona pour une IA.\n\nRéponds UNIQUEMENT avec le system prompt amélioré. Pas d'introduction, pas de conclusion, pas de commentaire, pas de texte avant ou après. Ne commence pas par "Voici" ou toute autre phrase d'accroche. Retourne directement le contenu du prompt optimisé, rien d'autre.`;

        let firstChunk = true;
        await streamText(modelId, prompt, (text) => {
            if (firstChunk) { spModalContenu.value = ''; firstChunk = false; }
            spModalContenu.value += text;
            spModalContenu.style.height = 'auto';
            spModalContenu.style.height = spModalContenu.scrollHeight + 'px';
            spModalContenu.scrollTop = spModalContenu.scrollHeight;
        });
    } catch (e) {
        console.error('Erreur optimisation:', e);
        customAlert('Erreur lors de l\'optimisation : ' + e.message, 'error');
    } finally {
        spModalOptimize.disabled = false;
        spModalOptimize.innerHTML = originalHTML;
        spModalContenu.classList.remove('enhancing');
        spModalContenu.readOnly = false;
    }
});
spModalOverlay.addEventListener('click', (e) => {
    if (e.target === spModalOverlay) closeSpModal();
});

spModalSave.addEventListener('click', async () => {
    const nom = spModalNom.value.trim();
    const contenu = spModalContenu.value.trim();
    if (!nom || !contenu) {
        if (!nom) spModalNom.reportValidity();
        else spModalContenu.reportValidity();
        return;
    }

    const data = { nom, contenu };
    const filename = STATE.spEditingFilename || nom.replace(/[^a-zA-Z0-9àâéèêëïîôùûüçÀÂÉÈÊËÏÎÔÙÛÜÇ _-]/g, '_') + '.json';

    if (STATE.spEditingFilename) {
        const oldData = await readSystemPrompt(STATE.spEditingFilename);
        if (oldData && oldData.nom !== nom) {
            const newFilename = nom.replace(/[^a-zA-Z0-9àâéèêëïîôùûüçÀÂÉÈÊËÏÎÔÙÛÜÇ _-]/g, '_') + '.json';
            if (newFilename !== STATE.spEditingFilename) {
                await writeSystemPrompt(newFilename, data);
                await deleteSystemPromptFile(STATE.spEditingFilename);
                closeSpModal();
                refreshSpList();
                return;
            }
        }
    }

    await writeSystemPrompt(filename, data);
    closeSpModal();
    refreshSpList();
});

// --- Boutons d'action du volet droit (modifier, exporter, supprimer le rôle sélectionné) ---

spEditBtn.addEventListener('click', async () => {
    if (!spSelect.value) return;
    const filename = spSelect.value;
    const opt = spSelect.selectedOptions[0];
    const contenu = spTextarea.value;
    await writeSystemPrompt(filename, { nom: opt.textContent, contenu });
    spOriginalContenu = contenu;
    opt.dataset.contenu = contenu;
    spEditBtn.style.display = 'none';
    if (STATE.currentSystemPrompt) STATE.currentSystemPrompt.contenu = contenu;
});

spDeleteBtn?.addEventListener('click', async () => {
    if (!spSelect.value) return;
    const data = await readSystemPrompt(spSelect.value);
    const roleName = data ? data.nom : spSelect.value;
    if (!await customConfirm(`Supprimer le rôle « ${roleName} » ?`, { icon: 'delete', danger: true, okLabel: 'Supprimer' })) return;
    await deleteSystemPromptFile(spSelect.value);
    if (STATE.currentSystemPrompt && STATE.currentSystemPrompt.nom === roleName) {
        STATE.currentSystemPrompt = null;
    }
    spSelect.value = '';
    spTextarea.value = '';
    rpRoleActions.style.display = 'none';
    refreshSpList();
});

// --- Prompts enregistrés : sidebar, modale, picker ---

async function refreshPrList() {
    const prompts = await listSavedPrompts();

    prListEl.innerHTML = '';
    for (const pr of prompts) {
        const item = document.createElement('div');
        item.className = 'sp-item';

        const name = document.createElement('span');
        name.className = 'sp-item-name';
        name.textContent = pr.nom;

        const actions = document.createElement('div');
        actions.className = 'sp-item-actions';

        const editBtn = document.createElement('button');
        editBtn.className = 'sp-item-btn';
        editBtn.textContent = '\u270E';
        editBtn.title = 'Modifier';
        editBtn.addEventListener('click', () => openPrModal(pr.filename));

        const delBtn = document.createElement('button');
        delBtn.className = 'sp-item-btn delete';
        delBtn.textContent = '\u00D7';
        delBtn.title = 'Supprimer';
        delBtn.addEventListener('click', async () => {
            if (!await customConfirm(`Supprimer le prompt "${pr.nom}" ?`, { icon: 'delete', danger: true, okLabel: 'Supprimer' })) return;
            await deleteSavedPrompt(pr.filename);
            refreshPrList();
        });

        actions.appendChild(editBtn);
        actions.appendChild(delBtn);
        item.appendChild(name);
        item.appendChild(actions);
        prListEl.appendChild(item);
    }
}

const prModalDelete = document.getElementById('pr-modal-delete');
let _prFromManagePopup = false;

function openPrModal(filename = null, prefillContenu = '', fromManage = false) {
    STATE.prEditingFilename = filename;
    _prFromManagePopup = fromManage;
    if (filename) {
        prModalTitle.textContent = 'Modifier le Prompt';
        prModalDelete.style.display = '';
        readSavedPrompt(filename).then(data => {
            if (data) {
                prModalNom.value = data.nom;
                prModalContenu.value = data.contenu;
                autoResizeTextarea(prModalContenu);
            }
        });
    } else {
        prModalTitle.textContent = 'Enregistrer un Prompt';
        prModalDelete.style.display = 'none';
        prModalNom.value = '';
        prModalContenu.value = prefillContenu;
        if (prefillContenu) autoResizeTextarea(prModalContenu);
        else prModalContenu.style.height = '';
    }
    prModalOverlay.style.display = 'flex';
    prModalNom.focus();
}

function closePrModal() {
    prModalOverlay.style.display = 'none';
    STATE.prEditingFilename = null;
    if (_prFromManagePopup) {
        _prFromManagePopup = false;
        openPromptsManage();
    }
}

if (prAddBtn) prAddBtn.addEventListener('click', () => openPrModal());
prModalCancel.addEventListener('click', closePrModal);

prModalDelete.addEventListener('click', async () => {
    if (!STATE.prEditingFilename) return;
    const data = await readSavedPrompt(STATE.prEditingFilename);
    const promptName = data ? data.nom : STATE.prEditingFilename;
    if (!await customConfirm(`Supprimer le prompt « ${promptName} » ?`, { icon: 'delete', danger: true, okLabel: 'Supprimer' })) return;
    await deleteSavedPrompt(STATE.prEditingFilename);
    refreshPrList();
    closePrModal();
});
prModalEnhance.addEventListener('click', async () => {
    const contenu = prModalContenu.value.trim();
    if (!contenu) return;

    if (!AUDIO_SETTINGS.enhanceModel) {
        showNoModelAlert('l\'amélioration de prompts', 'enhance-provider');
        return;
    }

    const originalHTML = prModalEnhance.innerHTML;
    prModalEnhance.disabled = true;
    prModalEnhance.textContent = 'Amélioration...';
    prModalContenu.classList.add('enhancing');
    prModalContenu.readOnly = true;

    try {
        const modelId = AUDIO_SETTINGS.enhanceModel;
        const prompt = `Tu es un expert en prompt engineering. Voici un prompt brut :\n\n---\n${contenu}\n---\n\nRéécris-le en une version optimisée, claire et structurée. Améliore la formulation pour le rendre plus efficace et précis.\n\nRéponds UNIQUEMENT avec le prompt amélioré. Pas d'introduction, pas de conclusion, pas de commentaire, pas de texte avant ou après. Ne commence pas par "Voici" ou toute autre phrase d'accroche. Retourne directement le contenu du prompt optimisé, rien d'autre.`;

        let firstChunk = true;
        await streamText(modelId, prompt, (text) => {
            if (firstChunk) { prModalContenu.value = ''; firstChunk = false; }
            prModalContenu.value += text;
            prModalContenu.style.height = 'auto';
            prModalContenu.style.height = prModalContenu.scrollHeight + 'px';
            prModalContenu.scrollTop = prModalContenu.scrollHeight;
        });
    } catch (e) {
        console.error('Erreur amélioration prompt:', e);
        customAlert('Erreur lors de l\'amélioration : ' + e.message, 'error');
    } finally {
        prModalEnhance.disabled = false;
        prModalEnhance.innerHTML = originalHTML;
        prModalContenu.classList.remove('enhancing');
        prModalContenu.readOnly = false;
    }
});
prModalOverlay.addEventListener('click', (e) => {
    if (e.target === prModalOverlay) closePrModal();
});

prModalSave.addEventListener('click', async () => {
    const nom = prModalNom.value.trim();
    const contenu = prModalContenu.value.trim();
    if (!nom || !contenu) {
        if (!nom) prModalNom.reportValidity();
        else prModalContenu.reportValidity();
        return;
    }

    const data = { nom, contenu };
    const filename = STATE.prEditingFilename || nom.replace(/[^a-zA-Z0-9àâéèêëïîôùûüçÀÂÉÈÊËÏÎÔÙÛÜÇ _-]/g, '_') + '.json';

    if (STATE.prEditingFilename) {
        const oldData = await readSavedPrompt(STATE.prEditingFilename);
        if (oldData && oldData.nom !== nom) {
            const newFilename = nom.replace(/[^a-zA-Z0-9àâéèêëïîôùûüçÀÂÉÈÊËÏÎÔÙÛÜÇ _-]/g, '_') + '.json';
            if (newFilename !== STATE.prEditingFilename) {
                await writeSavedPrompt(newFilename, data);
                await deleteSavedPrompt(STATE.prEditingFilename);
                closePrModal();
                refreshPrList();
                return;
            }
        }
    }

    await writeSavedPrompt(filename, data);
    closePrModal();
    refreshPrList();
});

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

// Fermer le picker en cliquant ailleurs
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

// --- Micro : dictée vocale via Whisper ---
const micIconDefault = micBtn.innerHTML;
const micIconStop = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="6" y="6" width="12" height="12" rx="1"/></svg>';
const micIconLoading = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="spin"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>';

let micStream = null;
let _micIdleTimer = null;
const MIC_IDLE_RELEASE_MS = 10 * 60 * 1000;

// Libère les pistes du micro pour éteindre le voyant rouge du navigateur.
// Appelé dès la fin de l'enregistrement et au déchargement de la page.
function _releaseMicStream() {
    if (_micIdleTimer) { clearTimeout(_micIdleTimer); _micIdleTimer = null; }
    if (micStream) {
        try { micStream.getTracks().forEach(t => t.stop()); } catch {}
        micStream = null;
    }
}

// (Re)programme la libération automatique du micStream après 10 min d'inactivité,
// pour éteindre le voyant rouge si l'utilisateur ne dicte plus.
function _scheduleMicRelease() {
    if (_micIdleTimer) clearTimeout(_micIdleTimer);
    _micIdleTimer = setTimeout(_releaseMicStream, MIC_IDLE_RELEASE_MS);
}

window.addEventListener('beforeunload', _releaseMicStream);
window.addEventListener('pagehide', _releaseMicStream);
// Sauvegarde des conversations avant fermeture (mobile : hard refresh tue IndexedDB)
window.addEventListener('beforeunload', function() {
    if (typeof flushPendingWrites === 'function') flushPendingWrites();
});

micBtn.addEventListener('click', async () => {
    // Si streaming en cours (mode stop), arrêter la génération
    if (STATE.isStreaming && micBtn.classList.contains('stop-mode')) {
        if (STATE.currentAbortController) STATE.currentAbortController.abort();
        return;
    }
    // Verrou anti double-clic : pendant la transcription, le STATE.mediaRecorder est déjà
    // inactif — sans cette garde, un clic relancerait l'enregistrement par-dessus
    // le STT en cours (placeholder écrasé, mauvais texte injecté au retour).
    if (STATE.micTranscribing) return;
    // Si en cours d'enregistrement, arrêter
    if (STATE.mediaRecorder && STATE.mediaRecorder.state === 'recording') {
        STATE.mediaRecorder.stop();
        return;
    }

    if (!AUDIO_SETTINGS.sttProvider) {
        showNoModelAlert('la transcription audio', 'audio-stt-provider');
        return;
    }

    // STT navigateur natif (SpeechRecognition API) — gratuit, sans clé
    var _sttModel = MODELS_DATA.stt.find(function(m) { return m.id === AUDIO_SETTINGS.sttProvider; });
    if (_sttModel && _sttModel.editeur === 'system') {
        var SR = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!SR) {
            customAlert('Reconnaissance vocale non supportée par ce navigateur.', 'error');
            return;
        }
        try {
            var sr = new SR();
            sr.lang = 'fr-FR';
            sr.continuous = false;
            sr.interimResults = false;
            micBtn.classList.add('recording');
            promptInput.placeholder = 'Parlez...';
            sr.onresult = function(e) {
                var text = e.results[0][0].transcript;
                promptInput.value += (promptInput.value && !promptInput.value.endsWith(' ') ? ' ' : '') + text;
                promptInput.dispatchEvent(new Event('input'));
                micBtn.classList.remove('recording');
                promptInput.placeholder = 'Écrivez votre message...';
                _scheduleMicRelease();
            };
            sr.onerror = function() {
                micBtn.classList.remove('recording');
                promptInput.placeholder = 'Écrivez votre message...';
                _scheduleMicRelease();
            };
            sr.start();
        } catch(e) {
            micBtn.classList.remove('recording');
            promptInput.placeholder = 'Écrivez votre message...';
            customAlert('Erreur reconnaissance vocale: ' + e.message, 'error');
        }
        return;
    }

    try {
        if (_micIdleTimer) { clearTimeout(_micIdleTimer); _micIdleTimer = null; }
        if (!micStream || !micStream.active) {
            micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        }
        STATE.mediaRecorder = new MediaRecorder(micStream);
        STATE.micChunks = [];
        STATE.micStartTime = Date.now();

        STATE.mediaRecorder.ondataavailable = (e) => {
            if (e.data.size > 0) STATE.micChunks.push(e.data);
        };

        STATE.mediaRecorder.onstop = () => {
            const durationMin = (Date.now() - STATE.micStartTime) / 60000;
            const blob = new Blob(STATE.micChunks, { type: 'audio/webm' });
            // On ne libère plus le micStream ici : sur certains contextes
            // (notamment file://) le navigateur redemande l'autorisation à
            // chaque getUserMedia. Garder le stream vivant évite ce prompt
            // répété entre deux dictées. Le stream est libéré au pagehide /
            // beforeunload et lors d'une erreur d'enregistrement.
            STATE.micTranscribing = true;
            micBtn.innerHTML = micIconLoading;
            micBtn.classList.remove('recording');
            promptInput.placeholder = 'Transcription en cours...';

            transcribeAudio(blob, (text) => {
                STATE.micTranscribing = false;
                micBtn.innerHTML = micIconDefault;
                promptInput.placeholder = 'Écrivez votre message...';
                promptInput.value += (promptInput.value && !promptInput.value.endsWith(' ') ? ' ' : '') + text;
                promptInput.dispatchEvent(new Event('input'));
                // Coût STT
                const sttModel = MODELS_DATA.stt.find(m => m.id === AUDIO_SETTINGS.sttProvider);
                if (sttModel?.prix?.includes('/min')) {
                    const sttCost = durationMin * parseFloat(sttModel.prix.replace('$', ''));
                    STATE.totalAudioCost += sttCost;
                    addCostForModel('stt', 0, 0, sttCost);
                }
                updateTokenDisplay();
                if (STATE.conversationId) saveConversation();
                _scheduleMicRelease();
            }, (err) => {
                STATE.micTranscribing = false;
                micBtn.innerHTML = micIconDefault;
                _scheduleMicRelease();
                promptInput.placeholder = 'Écrivez votre message...';
                console.error('STT error:', err);
                customAlert('Erreur transcription : ' + err.message, 'error');
            });
        };

        STATE.mediaRecorder.start();
        micBtn.innerHTML = micIconStop;
        micBtn.classList.add('recording');
        promptInput.placeholder = 'Écoute en cours...';
    } catch (err) {
        _releaseMicStream();
        console.error('Mic error:', err);
        customAlert('Impossible d\u2019accéder au microphone.', 'mic');
    }
});

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

        item.querySelector('.manage-list-item-name').textContent = sp.nom;
        item.querySelector('.manage-list-item-preview').textContent = sp.contenu.substring(0, 60) + (sp.contenu.length > 60 ? '…' : '');

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

        item.querySelector('.manage-list-item-name').textContent = pr.nom;
        item.querySelector('.manage-list-item-preview').textContent = pr.contenu.substring(0, 60) + (pr.contenu.length > 60 ? '…' : '');

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

// --- Export / Import ---
const importFileInput = document.getElementById('import-file-input');

async function exportBackup() {
    const conversations = {};
    const db = await openConvDB();
    const tx = db.transaction('conversations', 'readonly');
    const store = tx.objectStore('conversations');
    const keys = await new Promise((resolve) => {
        const req = store.getAllKeys();
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => resolve([]);
    });
    for (const key of keys) {
        const val = await new Promise((resolve) => {
            const req = store.get(key);
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => resolve(null);
        });
        if (val) conversations[key] = val;
    }

    const includeKeys = document.getElementById('save-modal-include-keys')?.checked;
    let apiKeysData = {};
    if (includeKeys) {
        try { apiKeysData = JSON.parse(localStorage.getItem('minou-apikeys') || '{}'); }
        catch (e) { /* ignore */ }
    }
    const data = {
        _minou_backup: true,
        date: new Date().toISOString(),
        conversations: conversations,
        systemPrompts: JSON.parse(localStorage.getItem('minou-systemprompts') || '{}'),
        savedPrompts: JSON.parse(localStorage.getItem('minou-savedprompts') || '{}'),
        categories: JSON.parse(localStorage.getItem('minou-categories') || '{}'),
        theme: localStorage.getItem('minou-theme') || 'light',
        apiKeys: apiKeysData,
        audioSettings: JSON.parse(localStorage.getItem('minou-audio-settings') || '{}'),
        budget: JSON.parse(localStorage.getItem('minou-budget') || 'null'),
        catalogPrefs: JSON.parse(localStorage.getItem('minou-catalog-prefs') || '{"disabled":[],"orEnabled":[]}'),
        orCacheText:  JSON.parse(localStorage.getItem('minou-or-cache')       || 'null'),
        orCacheImage: JSON.parse(localStorage.getItem('minou-or-cache-image') || 'null')
    };

    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'cetas-backup-' + new Date().toISOString().slice(0, 10) + '.json';
    a.click();
    URL.revokeObjectURL(url);
}

async function importBackup(file) {
    try {
        const text = await file.text();
        const data = JSON.parse(text);

        if (!data._minou_backup) {
            showModelAlert('Ce fichier n\'est pas une sauvegarde Cetas valide.');
            return;
        }

        const convCount = data.conversations ? Object.keys(data.conversations).length : 0;
        const spCount = data.systemPrompts ? Object.keys(data.systemPrompts).length : 0;
        const prCount = data.savedPrompts ? Object.keys(data.savedPrompts).length : 0;
        const catCount = data.categories ? Object.keys(data.categories).length : 0;

        if (!await customConfirm(`Importer ${convCount} conversation(s), ${spCount} rôle(s), ${prCount} prompt(s) enregistré(s) et ${catCount} catégorie(s) ?\n\nLes données existantes portant les mêmes noms seront écrasées.`, { icon: 'import', okLabel: 'Importer' })) return;

        // Importer les conversations dans IndexedDB
        if (data.conversations) {
            const db = await openConvDB();
            for (const [key, val] of Object.entries(data.conversations)) {
                const tx = db.transaction('conversations', 'readwrite');
                tx.objectStore('conversations').put(val, key);
                await new Promise(r => { tx.oncomplete = r; });
            }
        }

        // Importer les system prompts
        if (data.systemPrompts) {
            const existing = JSON.parse(localStorage.getItem('minou-systemprompts') || '{}');
            Object.assign(existing, data.systemPrompts);
            localStorage.setItem('minou-systemprompts', JSON.stringify(existing));
        }

        // Importer les prompts enregistrés
        if (data.savedPrompts) {
            const existing = JSON.parse(localStorage.getItem('minou-savedprompts') || '{}');
            Object.assign(existing, data.savedPrompts);
            localStorage.setItem('minou-savedprompts', JSON.stringify(existing));
        }

        // Importer les clés API
        if (data.apiKeys && Object.keys(data.apiKeys).length > 0) {
            saveApiKeys(data.apiKeys);
        }

        // Importer les catégories
        if (data.categories) {
            const existing = JSON.parse(localStorage.getItem('minou-categories') || '{}');
            Object.assign(existing, data.categories);
            localStorage.setItem('minou-categories', JSON.stringify(existing));
        }

        // Importer le thème
        if (data.theme) {
            localStorage.setItem('minou-theme', data.theme);
            applyTheme(data.theme);
        }

        // Importer les réglages audio/modèles
        if (data.audioSettings && typeof data.audioSettings === 'object') {
            saveAudioSettings(data.audioSettings);
        }

        // Importer le budget
        if (data.budget && typeof data.budget === 'object') {
            localStorage.setItem('minou-budget', JSON.stringify(data.budget));
        }

        // Importer la sélection de modèles (tous providers + OR) et les caches OR
        if (data.catalogPrefs && typeof data.catalogPrefs === 'object') {
            saveCatalogPrefs({
                disabled: Array.isArray(data.catalogPrefs.disabled) ? data.catalogPrefs.disabled : [],
                orEnabled: Array.isArray(data.catalogPrefs.orEnabled) ? data.catalogPrefs.orEnabled : []
            });
        }
        if (data.orCacheText && Array.isArray(data.orCacheText.models)) {
            setOrCache(data.orCacheText.models, 'text');
        }
        if (data.orCacheImage && Array.isArray(data.orCacheImage.models)) {
            setOrCache(data.orCacheImage.models, 'image');
        }
        rebuildModelLists();
        if (typeof populateUnifiedSelect === 'function') populateUnifiedSelect();

        // Rafraîchir l'interface
        refreshConvList();
        refreshCatBar();
        refreshSpList();
        refreshPrList();
        showModelAlert('Import terminé avec succès !');
    } catch (e) {
        console.error('Erreur import:', e);
        showModelAlert('Erreur lors de l\'import : fichier invalide.');
    }
}

importFileInput.addEventListener('change', async () => {
    const file = importFileInput.files[0];
    if (!file) return;
    importFileInput.value = '';
    await importBackup(file);
});

// --- Modale Sauvegarde ---
const dashboardBtn = document.getElementById('dashboard-btn');
const saveModalOverlay = document.getElementById('save-modal-overlay');
const saveModalClose = document.getElementById('save-modal-close');
const saveModalExportBtn = document.getElementById('save-modal-export-btn');
const saveModalImportBtn = document.getElementById('save-modal-import-btn');

dashboardBtn.addEventListener('click', () => {
    saveModalOverlay.style.display = 'flex';
});

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

// --- Modale Config (clés API) ---
let _modelsDirty = false;
let _keysDirty = false;
let _catalogDirty = false;

function _setModelsDirty(dirty) {
    _modelsDirty = dirty;
    const btn = document.getElementById('models-save-btn');
    if (btn) {
        btn.disabled = !dirty;
        btn.classList.toggle('models-save-btn--dirty', dirty);
    }
}

function _refreshApiModelesSaveBtn() {
    const btn = document.getElementById('apimodeles-save-btn');
    if (!btn) return;
    const dirty = !!(_keysDirty || _catalogDirty);
    btn.disabled = !dirty;
    btn.classList.toggle('models-save-btn--dirty', dirty);
}

function _setKeysDirty(dirty) {
    _keysDirty = dirty;
    _refreshApiModelesSaveBtn();
}

function _setCatalogDirty(dirty) {
    _catalogDirty = dirty;
    _refreshApiModelesSaveBtn();
}

let _budgetDirty = false;
function _setBudgetDirty(dirty) {
    _budgetDirty = dirty;
    const btn = document.getElementById('budget-save-btn');
    if (btn) {
        btn.disabled = !dirty;
        btn.classList.toggle('models-save-btn--dirty', dirty);
    }
}

// Affiche temporairement « Sauvegardé ✓ » sur un bouton de sauvegarde,
// puis le restaure au libellé d'origine.
const _SAVED_CHECK_SVG = '<svg class="models-save-check" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="5 12 10 17 19 7"/></svg>';
function _flashSavedFeedback(btn) {
    if (!btn) return;
    if (btn._savedTimeout) clearTimeout(btn._savedTimeout);
    if (btn._savedExitTimeout) clearTimeout(btn._savedExitTimeout);
    if (!btn._savedOriginalLabel) btn._savedOriginalLabel = btn.textContent;
    btn.classList.remove('models-save-btn--saved-exit');
    btn.classList.add('models-save-btn--saved');
    btn.innerHTML = `<span class="models-save-label">Sauvegardé</span>${_SAVED_CHECK_SVG}`;
    // Phase 1 : on laisse le check visible 1.3s
    btn._savedTimeout = setTimeout(() => {
        // Phase 2 : on déclenche l'animation de sortie (icône qui se replie,
        // fond qui revient à la normale). On change AUSSI le texte tout de
        // suite vers « Sauvegarder » pour qu'il revienne progressivement à
        // sa position centrée (au lieu d'un swap final brutal).
        const label = btn.querySelector('.models-save-label');
        if (label) label.textContent = btn._savedOriginalLabel || 'Sauvegarder';
        btn.classList.add('models-save-btn--saved-exit');
        btn.classList.remove('models-save-btn--saved');
        btn._savedExitTimeout = setTimeout(() => {
            btn.classList.remove('models-save-btn--saved-exit');
            btn.textContent = btn._savedOriginalLabel || 'Sauvegarder';
            btn._savedTimeout = null;
            btn._savedExitTimeout = null;
        }, 320);
    }, 1300);
}

function _maskedKey(value) {
    if (!value) return '';
    if (value.length <= 8) return value.substring(0, 2) + '....';
    return value.substring(0, 6) + '....' + value.slice(-2);
}

function _updateMaskedKeyDisplay(providerId) {
    const row = document.getElementById('apikey-masked-' + providerId);
    const text = document.getElementById('apikey-masked-text-' + providerId);
    if (!row || !text) return;
    const val = API_KEYS[providerId] || '';
    if (val) {
        text.textContent = _maskedKey(val);
        row.style.display = '';
    } else {
        row.style.display = 'none';
    }
}

function _restoreApiKeyInputs() {
    const providers = ['openai','anthropic','google','perplexity','mistral','deepseek','grok','zai','groq','nvidia','cabreras','openrouter'];
    for (const id of providers) {
        const el = document.getElementById('apikey-' + id);
        if (el) el.value = API_KEYS[id] || '';
        _updateMaskedKeyDisplay(id);
    }
    document.getElementById('apikey-ollama').value = API_KEYS.ollama || 'http://localhost:11434';
    document.getElementById('apikey-lmstudio').value = API_KEYS.lmstudio || 'http://localhost:1234';
    document.getElementById('apikey-llamacpp').value = API_KEYS.llamacpp || 'http://localhost:8080';
}

apikeysBtn.addEventListener('click', () => openApiKeysModal());
// Auto-save : chaque champ de configuration s'enregistre automatiquement
(function initConfigAutoSave() {
    // Clés API — listeners attachés dynamiquement par _initApiModelesPanel()
    const apiKeyIds = ['apikey-openai','apikey-anthropic','apikey-google','apikey-perplexity',
        'apikey-mistral','apikey-deepseek','apikey-grok','apikey-zai',
        'apikey-groq','apikey-nvidia','apikey-cabreras',
        'apikey-openrouter','apikey-ollama','apikey-lmstudio','apikey-llamacpp'];
    function saveApiKeysFromInputs() {
        const keys = {};
        for (const id of apiKeyIds) {
            const el = document.getElementById(id);
            keys[id.replace('apikey-','')] = el ? el.value.trim() : '';
        }
        saveApiKeys(keys);
        _setKeysDirty(false);
        // Mettre à jour l'affichage masqué pour tous les providers cloud
        for (const id of ['openai','anthropic','google','perplexity','mistral','deepseek','grok','zai','groq','nvidia','cabreras','openrouter']) {
            _updateMaskedKeyDisplay(id);
        }
    }

    // Bouton « Sauvegarder » du panel API et Modèles — sauve clés + catalogue
    const apimodelesSaveBtn = document.getElementById('apimodeles-save-btn');
    if (apimodelesSaveBtn) {
        apimodelesSaveBtn.addEventListener('click', () => {
            if (_keysDirty) saveApiKeysFromInputs();
            if (_catalogDirty) _saveCatalogFromUI();
            renderProviderCatalog(_activeProvider);
            _flashSavedFeedback(apimodelesSaveBtn);
        });
    }
    const apimodelesCancelBtn = document.getElementById('apimodeles-cancel-btn');
    if (apimodelesCancelBtn) {
        apimodelesCancelBtn.addEventListener('click', () => {
            _restoreApiKeyInputs();
            _setKeysDirty(false);
            _initCatalogPending();
            _setCatalogDirty(false);
            renderProviderCatalog(_activeProvider);
        });
    }

    // Sélecteurs audio/modèles — sauvegarde manuelle via bouton
    const selectIds = ['audio-tts-provider','audio-stt-provider','enhance-provider','summary-model','title-model','error-explainer-model','local-fallback-model'];

    function autoSaveAudioSettings() {
        saveAudioSettings({
            ttsProvider: document.getElementById('audio-tts-provider').value,
            sttProvider: document.getElementById('audio-stt-provider').value,
            enhanceModel: document.getElementById('enhance-provider').value,
            summaryModel: document.getElementById('summary-model').value,
            titleModel: document.getElementById('title-model').value,
            errorExplainerModel: document.getElementById('error-explainer-model').value,
            localFallbackModel: document.getElementById('local-fallback-model').value
        });
        updateLocalFallbackVisibility();
        _setModelsDirty(false);
    }

    for (const id of selectIds) {
        const el = document.getElementById(id);
        if (el) el.addEventListener('change', () => {
            updateLocalFallbackVisibility();
            _setModelsDirty(true);
        });
    }

    document.getElementById('models-save-btn').addEventListener('click', () => {
        autoSaveAudioSettings();
        _flashSavedFeedback(document.getElementById('models-save-btn'));
    });
    const modelsCancelBtn = document.getElementById('models-cancel-btn');
    if (modelsCancelBtn) {
        modelsCancelBtn.addEventListener('click', () => {
            populateModelSelects();
            updateLocalFallbackVisibility();
            _setModelsDirty(false);
        });
    }

    // Budget — sauvegarde manuelle via bouton
    const budgetFields = ['budget-enabled','budget-period','budget-amount'];
    for (const id of budgetFields) {
        const el = document.getElementById(id);
        const evt = id === 'budget-enabled' ? 'change' : 'input';
        if (el) el.addEventListener(evt, () => _setBudgetDirty(true));
    }
    const budgetSaveBtn = document.getElementById('budget-save-btn');
    if (budgetSaveBtn) {
        budgetSaveBtn.addEventListener('click', () => {
            saveBudgetSettings();
            updateBudgetPreview();
            _setBudgetDirty(false);
            _flashSavedFeedback(budgetSaveBtn);
        });
    }
    const budgetCancelBtn = document.getElementById('budget-cancel-btn');
    if (budgetCancelBtn) {
        budgetCancelBtn.addEventListener('click', () => {
            const budget = loadBudgetSettings();
            document.getElementById('budget-enabled').checked = budget.enabled;
            document.getElementById('budget-period').value = budget.period;
            document.getElementById('budget-amount').value = budget.amount || '';
            document.getElementById('budget-settings').style.display = budget.enabled ? '' : 'none';
            _setBudgetDirty(false);
        });
    }
})();

// ============================================================
// --- Sous-onglets fournisseurs (panel API et Modèles) ---
// ============================================================

const PROVIDERS_CONFIG = [
    { id: 'openrouter', label: 'OpenRouter',       icon: 'OpenRouter.svg', placeholder: 'sk-or-...',  link: 'https://openrouter.ai/settings/keys',                        linkLabel: 'Obtenir une clé API OpenRouter', hasImage: true, isOpenRouter: true },
    { id: 'openai',     label: 'OpenAI',           icon: 'OpenAI.svg',     placeholder: 'sk-...',     link: 'https://platform.openai.com/settings/organization/api-keys', linkLabel: 'Obtenir une clé API OpenAI', hasImage: true },
    { id: 'anthropic',  label: 'Anthropic',        icon: 'Anthropic.svg',  placeholder: 'sk-ant-...', link: 'https://platform.claude.com/settings/keys',                  linkLabel: 'Obtenir une clé API Anthropic' },
    { id: 'google',     label: 'Google',           icon: 'Google.svg',     placeholder: 'AIza...',    link: 'https://aistudio.google.com/api-keys',                       linkLabel: 'Obtenir une clé API Google',    hasImage: true },
    { id: 'perplexity', label: 'Perplexity',       icon: 'Perplexity.svg', placeholder: 'pplx-...',   link: 'https://www.perplexity.ai/account/api/keys',                 linkLabel: 'Obtenir une clé API Perplexity' },
    { id: 'mistral',    label: 'Mistral',          icon: 'Mistral.svg',    placeholder: 'z9q6u...',   link: 'https://console.mistral.ai/api-keys',                        linkLabel: 'Obtenir une clé API Mistral' },
    { id: 'deepseek',   label: 'DeepSeek',         icon: 'DeepSeek.svg',   placeholder: 'sk-...',     link: 'https://platform.deepseek.com/api_keys',                     linkLabel: 'Obtenir une clé API DeepSeek' },
    { id: 'grok',       label: 'Grok',             icon: 'Grok.svg',       placeholder: 'xai-...',    link: 'https://console.x.ai/',                                      linkLabel: 'Obtenir une clé API Grok' },
    { id: 'zai',        label: 'Z.ai',             icon: 'Z.ai.svg',       placeholder: '...',        link: 'https://z.ai/manage-apikey/apikey-list',                     linkLabel: 'Obtenir une clé API Z.ai' },
    { id: 'groq',       label: 'Groq',             icon: 'Groq.svg',       placeholder: 'gsk_...',    link: 'https://console.groq.com/keys',                              linkLabel: 'Obtenir une clé API Groq' },
    { id: 'nvidia',     label: 'Nvidia NIM',       icon: 'Nvidia.svg',     placeholder: 'nvapi-...',  link: 'https://build.nvidia.com/explore/discover',                  linkLabel: 'Obtenir une clé API Nvidia' },
    { id: 'cabreras',   label: 'Cabreras',         icon: 'Cabreras.svg',   placeholder: 'ck-...',     link: 'https://cabreras.ai/',                                       linkLabel: 'Obtenir une clé API Cabreras' },
    { id: 'ollama',     label: 'Ollama',           icon: 'Ollama.svg',     placeholder: 'http://localhost:11434',                                                                                                      isLocal: true },
    { id: 'lmstudio',   label: 'LM Studio',        icon: 'LMStudio.svg',   placeholder: 'http://localhost:1234',                                                                                                       isLocal: true },
    { id: 'llamacpp',   label: 'LLaMA.cpp',        icon: 'LlamaCpp.svg',   placeholder: 'http://localhost:8080',                                                                                                       isLocal: true }
];

let _activeProvider = 'openrouter';
const _providerCatalogType = {}; // editeur -> 'text'|'image'

const _EYE_SVG = '<svg class="apikey-eye-show" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg><svg class="apikey-eye-hide" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>';

function _buildProviderTabsHtml() {
    return PROVIDERS_CONFIG.map((p, idx) => `
        <button type="button" class="provider-tab${idx === 0 ? ' active' : ''}" data-provider="${p.id}" title="${escHtml(p.label)}">
            <img src="images/${p.icon}" class="provider-tab-icon" alt="${escHtml(p.label)}">
            <span class="provider-tab-label">${escHtml(p.label)}</span>
        </button>
    `).join('');
}

function _buildProviderSectionHtml(p, isFirst) {
    const inputType = p.isLocal ? 'text' : 'password';
    const labelExtra = p.id === 'openrouter' ? ' <span class="apikey-local-hint">(LLM &amp; Images)</span>' : '';
    const linkHtml = p.link ? `<a class="apikey-get-link" href="${p.link}" target="_blank" rel="noopener noreferrer">${escHtml(p.linkLabel)}</a>` : '';
    const localStatusHtml = p.isLocal ? `<p class="apikey-local-status" id="apikey-${p.id}-status"></p>` : '';
    const refreshBtn = p.isLocal ? `<button id="apikey-${p.id}-refresh" type="button" class="apikey-local-update-btn" data-provider="${p.id}">Mettre à jour</button>` : '';
    const eyeBtn = p.isLocal ? '' : `<button type="button" class="apikey-eye-btn" data-target="apikey-${p.id}" title="Afficher la clé" aria-label="Afficher la clé">${_EYE_SVG}</button>`;
    // Affichage de la clé masquée + bouton Valider (providers cloud uniquement)
    const maskedKeyHtml = p.isLocal ? '' : `<div class="apikey-masked-row" id="apikey-masked-${p.id}" style="display:none">
        <span class="apikey-masked-key" id="apikey-masked-text-${p.id}"></span>
        <button type="button" class="apikey-validate-btn" id="apikey-validate-${p.id}" data-provider="${p.id}">Valider</button>
    </div>`;
    return `
        <div class="provider-section${isFirst ? ' active' : ''}" data-provider="${p.id}">
            <div class="apikey-label-row">
                <label class="sp-modal-label" for="apikey-${p.id}">Clé API ${escHtml(p.label)}${labelExtra}</label>
                ${linkHtml}
            </div>
            ${maskedKeyHtml}
            <div class="apikey-field">
                <div class="apikey-input-wrap">
                    <input type="${inputType}" id="apikey-${p.id}" class="sp-modal-input apikey-input" placeholder="${escHtml(p.placeholder || '')}">
                    ${eyeBtn}
                </div>
                ${refreshBtn}
            </div>
            ${localStatusHtml}
            <div class="catalog-list provider-catalog-list" id="catalog-list-${p.id}" data-provider="${p.id}"></div>
        </div>
    `;
}

function _typeToggleHtml(activeType) {
    return `
        <div class="catalog-type-btns">
            <button type="button" class="catalog-type-btn${activeType === 'text' ? ' active' : ''}" data-type="text">Textes</button>
            <button type="button" class="catalog-type-btn${activeType === 'image' ? ' active' : ''}" data-type="image">Images</button>
        </div>
    `;
}

function _initApiModelesPanel() {
    const tabsContainer = document.getElementById('providers-tabs');
    const contentContainer = document.getElementById('provider-content');
    if (!tabsContainer || !contentContainer) return;
    tabsContainer.innerHTML = _buildProviderTabsHtml();
    contentContainer.innerHTML = PROVIDERS_CONFIG.map((p, idx) => _buildProviderSectionHtml(p, idx === 0)).join('');

    // Sous-onglet fournisseur — clic
    tabsContainer.querySelectorAll('.provider-tab').forEach(btn => {
        btn.addEventListener('click', () => _selectProvider(btn.dataset.provider));
    });

    // Boutons "Valider" — sauvegarde la clé et affiche les modèles
    PROVIDERS_CONFIG.forEach(p => {
        if (p.isLocal) return;
        const btn = document.getElementById('apikey-validate-' + p.id);
        if (btn) btn.addEventListener('click', () => {
            const input = document.getElementById('apikey-' + p.id);
            if (!input) return;
            const key = input.value.trim();
            if (!key) return;
            saveApiKeys({ [p.id]: key });
            _updateMaskedKeyDisplay(p.id);
            _setKeysDirty(false);
            renderProviderCatalog(p.id);
        });
    });

    // Listeners par section
    PROVIDERS_CONFIG.forEach(p => {
        const section = contentContainer.querySelector(`.provider-section[data-provider="${p.id}"]`);
        if (!section) return;
        const input = section.querySelector(`#apikey-${p.id}`);
        if (input) input.addEventListener('input', () => {
            _setKeysDirty(true);
            // Mettre à jour l'affichage masqué
            _updateMaskedKeyDisplay(p.id);
            // Re-render catalog (les modèles deviennent visibles dès qu'une clé est saisie)
            renderProviderCatalog(p.id);
        });
        const eye = section.querySelector('.apikey-eye-btn');
        if (eye) eye.addEventListener('click', () => {
            const target = document.getElementById(eye.dataset.target);
            if (!target) return;
            const show = target.type === 'password';
            target.type = show ? 'text' : 'password';
            eye.classList.toggle('shown', show);
            eye.title = show ? 'Masquer la clé' : 'Afficher la clé';
            eye.setAttribute('aria-label', eye.title);
        });
        if (p.isLocal) {
            const refresh = section.querySelector(`#apikey-${p.id}-refresh`);
            if (refresh) refresh.addEventListener('click', () => _onLocalRefreshClick(p.id));
        }
    });
}

function _detectOS() {
    const ua = navigator.userAgent || '';
    const platform = navigator.platform || '';
    if (/Mac/i.test(platform) || /Mac OS X/i.test(ua)) return 'mac';
    if (/Win/i.test(platform) || /Windows/i.test(ua)) return 'windows';
    if (/Linux/i.test(platform) || /Linux/i.test(ua)) return 'linux';
    return 'other';
}

function _getCorsHelpHtml(providerId) {
    const os = _detectOS();
    const origin = location.origin;
    if (providerId === 'ollama') {
        const blocks = {
            mac: `
<strong>macOS — configuration permanente :</strong>
<ol>
  <li>Ouvrez le <em>Terminal</em>.</li>
  <li>Exécutez :<br><code>launchctl setenv OLLAMA_ORIGINS "*"</code></li>
  <li>Quittez Ollama (icône dans la barre de menu) puis relancez-le.</li>
</ol>
<p>Cette commande persiste après redémarrage tant que la session utilisateur reste configurée. Pour la rendre <em>vraiment</em> définitive, ajoutez la même ligne à un fichier <code>~/Library/LaunchAgents/com.ollama.origins.plist</code> chargé au login (ou ajoutez <code>export OLLAMA_ORIGINS="*"</code> à <code>~/.zshrc</code> si vous lancez Ollama en CLI).</p>`,
            windows: `
<strong>Windows — configuration permanente :</strong>
<ol>
  <li>Quittez Ollama via l'icône dans la barre des tâches.</li>
  <li>Ouvrez <em>Paramètres système avancés</em> → <em>Variables d'environnement</em>.</li>
  <li>Dans <em>Variables utilisateur</em>, cliquez sur <em>Nouvelle…</em></li>
  <li>Nom : <code>OLLAMA_ORIGINS</code> — Valeur : <code>*</code></li>
  <li>Validez, puis relancez Ollama.</li>
</ol>
<p>La variable est conservée après redémarrage du PC.</p>`,
            linux: `
<strong>Linux (systemd) — configuration permanente :</strong>
<ol>
  <li>Éditez l'override du service :<br><code>sudo systemctl edit ollama.service</code></li>
  <li>Ajoutez ces lignes :<br><code>[Service]<br>Environment="OLLAMA_ORIGINS=*"</code></li>
  <li>Rechargez et redémarrez :<br><code>sudo systemctl daemon-reload &amp;&amp; sudo systemctl restart ollama</code></li>
</ol>
<p>L'override survit aux redémarrages et aux mises à jour d'Ollama.</p>`,
            other: `
<strong>Configuration permanente :</strong>
<p>Définissez la variable d'environnement <code>OLLAMA_ORIGINS=*</code> dans la configuration de démarrage de votre système, puis relancez Ollama.</p>`
        };
        return `
<p>Pour autoriser cette page (<code>${escHtml(origin)}</code>) à interroger Ollama, vous devez activer CORS via la variable d'environnement <code>OLLAMA_ORIGINS</code>.</p>
${blocks[os] || blocks.other}
<p style="opacity:0.75">Pour limiter aux origines de confiance, remplacez <code>*</code> par <code>${escHtml(origin)}</code>.</p>`;
    }
    if (providerId === 'lmstudio') {
        return `
<p>Pour autoriser cette page (<code>${escHtml(origin)}</code>) à interroger LM Studio :</p>
<ol>
  <li>Ouvrez <strong>LM Studio</strong>.</li>
  <li>Dans la barre latérale gauche, cliquez sur l'onglet <strong>Developer</strong> (icône <code>&lt;/&gt;</code>, en bas).</li>
  <li>Si le serveur est en cours d'exécution, cliquez sur le bouton <strong>Status: Running</strong> en haut pour l'arrêter.</li>
  <li>À droite du bouton de démarrage, cliquez sur l'icône <strong>Settings</strong> (engrenage) pour ouvrir le panneau <em>Server Settings</em>.</li>
  <li>Dans ce panneau, activez les <u>deux</u> options suivantes :
    <ul>
      <li><strong>Serve on Local Network</strong> (« Servir sur le réseau local ») — sans cela, le serveur n'écoute que sur <code>127.0.0.1</code> et certaines requêtes du navigateur sont rejetées.</li>
      <li><strong>Enable CORS</strong> (« Activer CORS / Cross-Origin Resource Sharing »).</li>
    </ul>
  </li>
  <li>Refermez le panneau et cliquez sur <strong>Start Server</strong> (le bouton redevient vert et indique <em>Status: Running</em>).</li>
</ol>
<p>LM Studio mémorise ces deux réglages : vous n'aurez pas à les refaire au prochain lancement.</p>`;
    }
    return '';
}

const _localCorsBlocked = new Set();

// Délégation : clic sur une miniature d'aide locale → ouvre le lightbox.
document.addEventListener('click', (e) => {
    const img = e.target.closest('img.apikey-local-help-img');
    if (img && typeof openLightbox === 'function') {
        openLightbox(img.dataset.lightboxSrc || img.src);
    }
});

function _serviceName(providerId) {
    return providerId === 'ollama' ? 'Ollama' : 'LM Studio';
}

function _clearLocalProviderModels(providerId) {
    MODELS = MODELS.filter(m => m.editeur !== providerId);
    for (const key of Object.keys(TARIFS)) {
        if (TARIFS[key].editeur === providerId) delete TARIFS[key];
    }
    const catalog = document.getElementById('catalog-list-' + providerId);
    if (catalog) catalog.innerHTML = '';
    if (typeof populateModelSelect === 'function') populateModelSelect();
}

// Affiche l'état du serveur local. `kind` : 'success' | 'error' | 'cors'.
// Pour 'cors', `successPrefix` (optionnel) est affiché en vert au-dessus.
function _renderLocalStatus(providerId, kind, message, successPrefix) {
    const status = document.getElementById(`apikey-${providerId}-status`);
    if (!status) return;
    if (kind === 'cors') {
        _localCorsBlocked.add(providerId);
        _clearLocalProviderModels(providerId);
        status.className = 'apikey-local-status warning';
        const prefixHtml = successPrefix
            ? `<span class="apikey-local-status-msg apikey-local-status-success-line">${escHtml(successPrefix)}</span>`
            : '';
        const screenshotHtml = providerId === 'lmstudio'
            ? `<p class="apikey-local-help-img-caption">Voir la marche à suivre en image :</p>
               <img src="images/LM Studio.webp" alt="Capture LM Studio — Server Settings" class="apikey-local-help-img apikey-local-help-img-small" data-lightbox-src="images/LM Studio.webp">`
            : '';
        status.innerHTML = `${prefixHtml}<span class="apikey-local-status-msg">${escHtml(message)}</span>
            <div class="apikey-local-help apikey-local-help-flat">
                <div class="apikey-local-help-body">${_getCorsHelpHtml(providerId)}${screenshotHtml}</div>
            </div>`;
    } else if (kind === 'error') {
        _localCorsBlocked.delete(providerId);
        _clearLocalProviderModels(providerId);
        status.className = 'apikey-local-status error';
        status.innerHTML = `<span class="apikey-local-status-msg">${message}</span>`;
    } else {
        _localCorsBlocked.delete(providerId);
        status.className = 'apikey-local-status success';
        status.textContent = message;
    }
}

async function _isServerReachable(baseUrl) {
    try {
        await fetch(`${baseUrl}/v1/models`, { mode: 'no-cors', signal: AbortSignal.timeout(3000) });
        return true;
    } catch {
        return false;
    }
}

async function _isCorsAllowedForChat(baseUrl) {
    try {
        await fetch(`${baseUrl}/v1/chat/completions`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: '{}',
            signal: AbortSignal.timeout(4000)
        });
        return true;
    } catch (e) {
        return e?.name === 'AbortError' || e?.name === 'TimeoutError';
    }
}

async function _onLocalRefreshClick(providerId) {
    const status = document.getElementById(`apikey-${providerId}-status`);
    const url = document.getElementById(`apikey-${providerId}`).value.trim();
    const service = _serviceName(providerId);
    const corsMsg = '⚠ CORS désactivé : les requêtes de chat seront bloquées par le navigateur.';

    if (!url) {
        _renderLocalStatus(providerId, 'error', '✗ Entrez une URL.');
        return;
    }
    let baseUrl, hostname;
    try {
        const u = new URL(url);
        baseUrl = (u.origin + u.pathname).replace(/\/+$/, '');
        hostname = u.hostname;
    } catch {
        _renderLocalStatus(providerId, 'error', '✗ URL invalide.');
        return;
    }
    const isLocalhost = hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1';
    const networkHint = providerId === 'ollama'
        ? `Pour autoriser un accès depuis cette adresse réseau, lancez Ollama avec la variable d'environnement <code>OLLAMA_HOST=0.0.0.0</code>, puis relancez-le.`
        : `Dans LM Studio, allez dans <strong>Developer</strong> &rsaquo; <strong>Local Server</strong>, cliquez sur <strong>Server Settings</strong> et activez <strong>Serve on Local Network</strong>, puis relancez le serveur.`;
    const screenshot = providerId === 'lmstudio'
        ? `<br><br><p class="apikey-local-help-img-caption">Voir la marche à suivre en image :</p>
           <img src="images/LM Studio.webp" alt="Capture LM Studio — Server Settings" class="apikey-local-help-img apikey-local-help-img-small" data-lightbox-src="images/LM Studio.webp">`
        : '';
    const unreachableMsg = isLocalhost
        ? `✗ Impossible de joindre ${service} à cette adresse. Assurez-vous que l'application ${service} est ouverte et que son serveur local est démarré.`
        : `✗ Impossible de joindre ${service} à l'adresse <code>${escHtml(hostname)}</code>. Vérifiez que ${service} est lancé sur cette machine, que le port est correct, et que le serveur est configuré pour écouter sur le réseau local.<br><br>${networkHint}${screenshot}`;
    API_KEYS[providerId] = url;
    status.textContent = 'Récupération…';
    status.className = 'apikey-local-status';

    // Étape 1 : essayer de lister les modèles. Échec possible = serveur down ou CORS.
    let response;
    try {
        response = await fetch(`${baseUrl}/v1/models`, { signal: AbortSignal.timeout(4000) });
    } catch (e) {
        if (e?.name === 'AbortError' || e?.name === 'TimeoutError') {
            _renderLocalStatus(providerId, 'error', '✗ Délai d\'attente dépassé. Le serveur ne répond pas.');
        } else if (await _isServerReachable(baseUrl)) {
            _renderLocalStatus(providerId, 'cors', corsMsg);
        } else {
            _renderLocalStatus(providerId, 'error', unreachableMsg);
        }
        return;
    }
    if (!response.ok) {
        _renderLocalStatus(providerId, 'error', `✗ Réponse inattendue du serveur (HTTP ${response.status}).`);
        return;
    }
    let data;
    try { data = await response.json(); }
    catch {
        _renderLocalStatus(providerId, 'error', '✗ Réponse non valide. L\'URL ne pointe pas vers un serveur compatible.');
        return;
    }
    if (!Array.isArray(data?.data || data?.models)) {
        _renderLocalStatus(providerId, 'error', '✗ Format de réponse inattendu. L\'URL ne pointe pas vers un serveur compatible.');
        return;
    }

    await fetchLocalModels(providerId);
    const count = MODELS.filter(m => m.editeur === providerId).length;
    const countMsg = count > 0
        ? `✓ ${count} modèle${count > 1 ? 's' : ''} chargé${count > 1 ? 's' : ''}`
        : '✓ Connecté — aucun modèle chargé';

    // Étape 2 : le listing fonctionne (requête simple, pas de préflight). Tester
    // qu'un POST avec préflight passe aussi, sinon les chats seront bloqués.
    if (!await _isCorsAllowedForChat(baseUrl)) {
        _renderLocalStatus(providerId, 'cors', corsMsg, countMsg);
        renderProviderCatalog(providerId);
        return;
    }

    populateModelSelect();
    _renderLocalStatus(providerId, 'success', countMsg);
    renderProviderCatalog(providerId);
}

function _selectProvider(providerId) {
    _activeProvider = providerId;
    document.querySelectorAll('#providers-tabs .provider-tab').forEach(b => {
        b.classList.toggle('active', b.dataset.provider === providerId);
    });
    document.querySelectorAll('#provider-content .provider-section').forEach(s => {
        s.classList.toggle('active', s.dataset.provider === providerId);
    });
    renderProviderCatalog(providerId);
}

function renderProviderCatalog(providerId) {
    if (!_catalogPending) _initCatalogPending();
    const provider = PROVIDERS_CONFIG.find(p => p.id === providerId);
    if (!provider) return;
    const container = document.getElementById('catalog-list-' + providerId);
    if (!container) return;
    container.innerHTML = '';

    if (provider.isLocal) {
        if (!hasProviderKey(providerId)) {
            container.innerHTML = '<div class="provider-models-empty">Renseignez l\'URL de votre serveur local et cliquez sur « Mettre à jour ».</div>';
            return;
        }
        const localModels = MODELS.filter(m => m.editeur === providerId);
        if (localModels.length === 0) {
            if (!_localCorsBlocked.has(providerId)) {
                container.innerHTML = '<div class="provider-models-empty">Aucun modèle détecté. Vérifiez que votre serveur est lancé et qu\'au moins un modèle est téléchargé.</div>';
            }
            return;
        }
        const disabled = _catalogPending.disabled;
        const enabledCount = localModels.filter(m => !disabled.has(m.id)).length;
        const allChecked = enabledCount === localModels.length;
        const someChecked = enabledCount > 0 && !allChecked;
        const section = document.createElement('div');
        section.className = 'catalog-section';
        section.innerHTML = `
            <div class="catalog-section-header">
                <input type="checkbox" class="catalog-section-master-cb"${allChecked ? ' checked' : ''}>
                <span class="catalog-section-name">Sélectionnez les modèles à utiliser</span>
            </div>
            <div class="catalog-section-models">
                ${localModels.map(m => _catalogRowHtml(m, false, false, !disabled.has(m.id))).join('')}
            </div>`;
        const masterCb = section.querySelector('.catalog-section-master-cb');
        masterCb.indeterminate = someChecked;
        masterCb.addEventListener('change', () => {
            const allEnabled = localModels.every(m => !disabled.has(m.id));
            if (allEnabled) localModels.forEach(m => disabled.add(m.id));
            else localModels.forEach(m => disabled.delete(m.id));
            renderProviderCatalog(providerId);
            _refreshCatalogDirty();
        });
        section.querySelectorAll('.catalog-cb').forEach(cb => {
            cb.addEventListener('change', () => {
                const id = cb.dataset.id;
                if (cb.checked) disabled.delete(id);
                else disabled.add(id);
                _updateSectionBadge(section, localModels.length, localModels, disabled);
                _refreshCatalogDirty();
            });
        });
        container.appendChild(section);
        return;
    }

    if (!hasProviderKey(providerId)) {
        container.innerHTML = '<div class="provider-models-empty">Ajoutez et renseignez votre clé API ci-dessus pour afficher les modèles disponibles.</div>';
        return;
    }

    const isImage = (_providerCatalogType[providerId] || 'text') === 'image';

    if (provider.isOpenRouter) {
        _renderOpenRouterCatalogInto(container, isImage);
        return;
    }

    // En mode texte, on inclut aussi les modèles "search" (ex. Perplexity Sonar)
    // qui sont catégorisés à part dans MODELS_DATA mais restent des modèles texte
    // à activer/désactiver depuis le catalogue.
    const baseModels = isImage
        ? MODELS_DATA.image.filter(m => m.editeur === providerId)
        : [
            ...MODELS_DATA.text.filter(m => m.editeur === providerId),
            ...((MODELS_DATA.search || []).filter(m => m.editeur === providerId))
          ];
    if (baseModels.length === 0) {
        container.innerHTML = `<div class="provider-models-empty">Aucun modèle ${isImage ? 'image' : 'texte'} disponible pour ce fournisseur.</div>`;
        return;
    }
    const disabled = _catalogPending.disabled;
    const enabledCount = baseModels.filter(m => !disabled.has(m.id)).length;
    const allChecked = enabledCount === baseModels.length;
    const someChecked = enabledCount > 0 && !allChecked;
    const typeToggle = provider.hasImage ? _typeToggleHtml(isImage ? 'image' : 'text') : '';
    const section = document.createElement('div');
    section.className = 'catalog-section';
    section.innerHTML = `
        <div class="catalog-section-header">
            <input type="checkbox" class="catalog-section-master-cb"${allChecked ? ' checked' : ''}>
            <span class="catalog-section-name">Sélectionnez les modèles à utiliser</span>
            ${typeToggle}
        </div>
        <div class="catalog-section-models">
            ${baseModels.map(m => _catalogRowHtml(m, isImage, false, !disabled.has(m.id))).join('')}
        </div>
    `;
    const masterCb = section.querySelector('.catalog-section-master-cb');
    masterCb.indeterminate = someChecked;
    masterCb.addEventListener('change', () => {
        const allEnabled = baseModels.every(m => !disabled.has(m.id));
        if (allEnabled) baseModels.forEach(m => disabled.add(m.id));
        else baseModels.forEach(m => disabled.delete(m.id));
        renderProviderCatalog(providerId);
        _refreshCatalogDirty();
    });
    section.querySelectorAll('.catalog-type-btn').forEach(b => {
        b.addEventListener('click', () => {
            if (b.classList.contains('active')) return;
            // Bascule .active immédiatement sur le DOM existant pour que la
            // pastille `::before` puisse glisser via sa transition CSS.
            // Le re-render (qui reconstruit la section) est différé après la
            // fin de la transition pour ne pas couper l'animation.
            section.querySelectorAll('.catalog-type-btn').forEach(o => o.classList.toggle('active', o === b));
            _providerCatalogType[providerId] = b.dataset.type;
            setTimeout(() => renderProviderCatalog(providerId), 260);
        });
    });
    section.querySelectorAll('.catalog-cb').forEach(cb => {
        cb.addEventListener('change', () => {
            const id = cb.dataset.id;
            if (cb.checked) disabled.delete(id);
            else disabled.add(id);
            _updateSectionBadge(section, baseModels.length, baseModels, disabled);
            _refreshCatalogDirty();
        });
    });
    container.appendChild(section);
}

function _renderOpenRouterCatalogInto(container, isImage) {
    if (!_catalogPending) _initCatalogPending();
    const orEnabled = _catalogPending.orEnabled;

    const builtInOrAll = (isImage ? MODELS_DATA.image : MODELS_DATA.text)
        .filter(m => m.editeur === 'openrouter')
        .map(m => ({ ...m, _isImage: isImage }));
    const builtInIds = new Set(builtInOrAll.map(m => m.id));

    const tabType = isImage ? 'image' : 'text';
    const categoryModels = _getOrModelsForCategory(_orCategory, tabType);
    let fetchedOrAll = [];
    if (categoryModels) {
        fetchedOrAll = categoryModels.filter(m => isImage === !!m._isImage && !builtInIds.has(m.id));
        // Hydrate les prix image depuis la cache dédiée AVANT rendu : évite
        // le flash "Gratuit" quand le cache /models a pricing=0 mais qu'on
        // a déjà enrichi /endpoints lors d'une session précédente.
        if (isImage) {
            const priceMap = (typeof getOrImagePrices === 'function') ? getOrImagePrices() : {};
            for (const m of fetchedOrAll) {
                if ((!m.imageOutput || m.imageOutput === 0) && priceMap[m.id] > 0) {
                    m.imageOutput = priceMap[m.id];
                }
            }
        }
    }

    const orAll = [...builtInOrAll, ...fetchedOrAll];
    const orEnabledCount = orAll.filter(m => orEnabled.has(m.id)).length;
    const orTotal = orAll.length;
    const hasLoadedCategory = !!categoryModels;

    // Si on est en image et que des modèles cachés n'ont pas encore de prix
    // (image_output absent du cache car /models ne le retourne pas), déclencher
    // l'enrichissement asynchrone via /endpoints — le rendu se rafraîchira ensuite.
    if (isImage && categoryModels) {
        const _missingPrice = fetchedOrAll.filter(m => !m.imageOutput || m.imageOutput === 0);
        const enrichKey = `${tabType}_${_orCategory}`;
        if (_missingPrice.length > 0 && !_enrichmentInFlight.has(enrichKey)) {
            _enrichmentInFlight.add(enrichKey);
            _enrichImagePricesFromEndpoints(_missingPrice, tabType, _orCategory)
                .catch(() => {})
                .finally(() => { _enrichmentInFlight.delete(enrichKey); });
        }
    }
    const loadBtnLabel = hasLoadedCategory ? 'Actualiser' : 'Charger les modèles';
    const search = _orSearchTerm.trim().toLowerCase();
    const orVisible = search
        ? orAll.filter(m => (m.label || '').toLowerCase().includes(search) || (m.id || '').toLowerCase().includes(search))
        : orAll;
    const categoryOptionsHtml = OR_CATEGORIES.map(cat => `
        <option value="${cat.id}"${cat.id === _orCategory ? ' selected' : ''}>${cat.label}</option>
    `).join('');
    const orSection = document.createElement('div');
    orSection.className = 'catalog-section catalog-or-section';
    orSection.id = 'catalog-or-section';
    const orAllChecked = orTotal > 0 && orEnabledCount === orTotal;
    const orSomeChecked = orEnabledCount > 0 && !orAllChecked;
    orSection.innerHTML = `
        <div class="catalog-section-header">
            <span class="catalog-section-name">Sélectionnez les modèles à utiliser</span>
            ${_typeToggleHtml(isImage ? 'image' : 'text')}
        </div>
        <div class="catalog-or-toolbar">
            <div class="catalog-or-cat-select-wrap">
                <select class="catalog-or-cat-select">${categoryOptionsHtml}</select>
                <svg class="catalog-or-cat-select-caret" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
            </div>
            <div class="catalog-or-search-wrap">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                <input type="text" class="catalog-or-search" placeholder="Rechercher un modèle…" value="${escHtml(_orSearchTerm)}">
            </div>
            <button type="button" class="catalog-or-load-btn" id="catalog-or-load" title="${loadBtnLabel}" aria-label="${loadBtnLabel}">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-.07-8.3"/></svg>
            </button>
        </div>
        <div class="catalog-section-models" id="catalog-or-models">
            ${(hasLoadedCategory || builtInOrAll.length > 0) ? (orVisible.length ? _buildOrModelsHtml(orVisible, orEnabled, isImage) : '<div class="catalog-or-empty">Aucun modèle ne correspond à votre recherche.</div>') : `<div class="catalog-or-empty">Cliquez sur « Charger les modèles » pour accéder au catalogue OpenRouter${_orCategory !== 'all' ? ` (catégorie ${OR_CATEGORIES.find(c => c.id === _orCategory)?.label || _orCategory})` : ''}.</div>`}
        </div>`;
    const orMasterCb = orSection.querySelector('.catalog-section-master-cb');
    if (orMasterCb) {
        orMasterCb.indeterminate = orSomeChecked;
        orMasterCb.addEventListener('change', () => {
            const allEnabled = orAll.every(m => orEnabled.has(m.id));
            if (allEnabled) orAll.forEach(m => orEnabled.delete(m.id));
            else orAll.forEach(m => orEnabled.add(m.id));
            renderProviderCatalog('openrouter');
            _refreshCatalogDirty();
        });
    }
    orSection.querySelector('#catalog-or-load').addEventListener('click', () => _loadOrModels(isImage, _orCategory));
    orSection.querySelectorAll('.catalog-type-btn').forEach(b => {
        b.addEventListener('click', () => {
            if (b.classList.contains('active')) return;
            orSection.querySelectorAll('.catalog-type-btn').forEach(o => o.classList.toggle('active', o === b));
            _providerCatalogType['openrouter'] = b.dataset.type;
            setTimeout(() => renderProviderCatalog('openrouter'), 260);
        });
    });
    const orCatSelect = orSection.querySelector('.catalog-or-cat-select');
    if (orCatSelect) {
        orCatSelect.addEventListener('change', () => {
            if (orCatSelect.value === _orCategory) return;
            _orCategory = orCatSelect.value;
            if (!_getOrModelsForCategory(_orCategory, tabType)) {
                _loadOrModels(isImage, _orCategory);
            } else {
                renderProviderCatalog('openrouter');
            }
        });
    }
    _attachOrCheckboxListeners(orSection, orAll);
    container.appendChild(orSection);
    const searchInput = orSection.querySelector('.catalog-or-search');
    if (searchInput) {
        searchInput.addEventListener('input', () => {
            _orSearchTerm = searchInput.value;
            const modelsEl = orSection.querySelector('#catalog-or-models');
            if (!modelsEl) return;
            const s = _orSearchTerm.trim().toLowerCase();
            const filtered = s
                ? orAll.filter(m => (m.label || '').toLowerCase().includes(s) || (m.id || '').toLowerCase().includes(s))
                : orAll;
            if (hasLoadedCategory || builtInOrAll.length > 0) {
                modelsEl.innerHTML = filtered.length
                    ? _buildOrModelsHtml(filtered, orEnabled, isImage)
                    : '<div class="catalog-or-empty">Aucun modèle ne correspond à votre recherche.</div>';
                _attachOrCheckboxListeners(orSection, orAll);
            }
        });
        if (_orSearchTerm) {
            searchInput.focus();
            const v = searchInput.value;
            searchInput.setSelectionRange(v.length, v.length);
        }
    }
}

// Initialisation immédiate (les écouteurs des champs apikey-* sont attachés ici)
_initApiModelesPanel();

// Onglets de la modale
document.querySelectorAll('.apikeys-tab').forEach(tab => {
    tab.addEventListener('click', async () => {
        const currentActiveTab = document.querySelector('.apikeys-tab.active');
        if (currentActiveTab && currentActiveTab.dataset.tab === 'apimodeles' && tab.dataset.tab !== 'apimodeles' && (_keysDirty || _catalogDirty)) {
            const ok = await customConfirm('Vous avez des modifications non sauvegardées dans l\'onglet API et Modèles.', {
                icon: 'save',
                okLabel: 'Quitter sans sauvegarder',
                cancelLabel: 'Rester',
                danger: true
            });
            if (!ok) return;
            _restoreApiKeyInputs();
            _setKeysDirty(false);
            _initCatalogPending();
            _setCatalogDirty(false);
            renderProviderCatalog(_activeProvider);
        }
        if (currentActiveTab && currentActiveTab.dataset.tab === 'models' && tab.dataset.tab !== 'models' && _modelsDirty) {
            const ok = await customConfirm('Vous avez des modifications non sauvegardées dans l\'onglet Fonctionnalités.', {
                icon: 'save',
                okLabel: 'Quitter sans sauvegarder',
                cancelLabel: 'Rester',
                danger: true
            });
            if (!ok) return;
            _modelsDirty = false;
            populateModelSelects();
        }
        if (currentActiveTab && currentActiveTab.dataset.tab === 'budget' && tab.dataset.tab !== 'budget' && _budgetDirty) {
            const ok = await customConfirm('Vous avez des modifications non sauvegardées dans l\'onglet Budget.', {
                icon: 'save',
                okLabel: 'Quitter sans sauvegarder',
                cancelLabel: 'Rester',
                danger: true
            });
            if (!ok) return;
            const budgetCancelBtn = document.getElementById('budget-cancel-btn');
            if (budgetCancelBtn) budgetCancelBtn.click();
        }
        document.querySelectorAll('.apikeys-tab').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.apikeys-panel').forEach(p => p.classList.remove('active'));
        tab.classList.add('active');
        const targetPanel = document.getElementById('panel-' + tab.dataset.tab);
        targetPanel.classList.add('active');
        // Réinitialise immédiatement la vue du panneau Stockage pour éviter de
        // ré-afficher brièvement l'ancienne vue liste avant le chargement différé.
        if (tab.dataset.tab === 'stockage') {
            targetPanel.dataset.storageView = 'home';
            targetPanel.dataset.storageLoading = 'false';
        }
        // Charge le contenu en différé pour ne pas bloquer la transition visuelle de l'onglet.
        const tabName = tab.dataset.tab;
        setTimeout(async () => {
            if (tabName === 'apimodeles') {
                _setKeysDirty(false);
                _initCatalogPending();
                _setCatalogDirty(false);
                renderProviderCatalog(_activeProvider);
            }
            if (tabName === 'models') {
                populateModelSelects();
                _setModelsDirty(false);
            }
            if (tabName === 'statistiques') {
                dashboardData = await listAllConvStats();
                const activeTab = document.querySelector('.dashboard-tab.active');
                renderDashboardTab(activeTab ? activeTab.dataset.tab : 'periodes');
            }
            if (tabName === 'faq') {
                loadFaq();
            }
            if (tabName === 'stockage') {
                await _initStoragePanel();
            }
        }, 60);
    });
});

// ===================== Panel Stockage =====================

const _STORAGE_VIEWMODE_KEY = 'cetas-storage-media-viewmode';
const _storage = {
    subtab: 'conversations',
    conversations: [],
    medias: [],
    selected: new Set(),
    search: '',
    sort: 'date',
    mediaType: 'all',
    visibleCount: 100,
    pageSize: 100,
    searchDebounce: null,
    totalSize: 0,
    mediaSize: 0,
    mediaViewMode: (function () {
        try {
            const v = localStorage.getItem(_STORAGE_VIEWMODE_KEY);
            return (v === 'list' || v === 'grid') ? v : 'grid';
        } catch (e) { return 'grid'; }
    })(),
    autoLoadObserver: null,
    // Drapeau d'invalidation : `_loadStorageData` n'a besoin de rescanner toute
    // la BD que si une conv a été mutée hors des mutations locales du panneau
    // (saveConversation, regen, titre, etc.). À l'init, on doit charger une fois.
    _dirty: true
};

// Le filemanager appelle ce hook après chaque write/update : on invalide
// le cache du panneau pour qu'il se recharge à la prochaine ouverture.
if (typeof setOnConvMutated === 'function') {
    setOnConvMutated(() => { _storage._dirty = true; });
}

// Icônes SVG (24x24 viewBox, stroke currentColor) — style Feather.
const _STORAGE_ICONS = {
    chat: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>',
    image: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>',
    file: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>',
    pdf: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><text x="7" y="18" font-size="6" font-weight="bold" stroke="none" fill="currentColor">PDF</text></svg>',
    csv: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="8" y1="13" x2="16" y2="13"/><line x1="8" y1="17" x2="16" y2="17"/></svg>',
    code: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><polyline points="9 18 7 16 9 14"/><polyline points="15 14 17 16 15 18"/></svg>',
    search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>',
    trash: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2"/></svg>',
    calendar: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>',
    paperclip: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>',
    msg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3h18v14H7l-4 4z"/></svg>',
    eye: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>',
    download: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>'
};

const _STORAGE_FILE_ICON_MAP = {
    'application/pdf': 'pdf',
    'text/csv': 'csv',
    'application/json': 'code',
    'text/html': 'code',
    'application/javascript': 'code',
    'text/javascript': 'code'
};
function _storageFileIconName(part) {
    if (part.type === 'image') return 'image';
    return _STORAGE_FILE_ICON_MAP[part.mimeType] || 'file';
}

const _STORAGE_CATEGORIES = [
    { key: 'texts',  label: 'Textes' },
    { key: 'images', label: 'Images' },
    { key: 'pdf',    label: 'PDF' },
    { key: 'audio',  label: 'Audio' },
    { key: 'video',  label: 'Vidéo' },
    { key: 'other',  label: 'Autre' }
];
const _STORAGE_MAX_VISIBLE_CATS = 4;

function _categorizeFilePart(part) {
    if (!part) return 'other';
    if (part.type === 'image') return 'images';
    const mt = (part.mimeType || '').toLowerCase();
    if (mt === 'application/pdf') return 'pdf';
    if (mt.startsWith('audio/')) return 'audio';
    if (mt.startsWith('video/')) return 'video';
    if (mt.startsWith('text/')) return 'texts';
    if (mt === 'application/json' || mt === 'application/javascript' ||
        mt === 'application/xml' || mt === 'application/x-yaml' ||
        mt.includes('xml') || mt.includes('script')) return 'texts';
    if (part.textContent && part.textContent.length > 0) return 'texts';
    return 'other';
}

// Estimation rapide de la taille d'une part sans JSON.stringify (qui clone une grosse base64).
function _partApproxSize(part) {
    if (typeof part === 'string') return part.length;
    let s = 50; // marge structure JSON
    if (part.data) s += part.data.length;
    if (part.dataUrl) s += part.dataUrl.length;
    if (part.textContent) s += part.textContent.length;
    if (part.text) s += part.text.length;
    if (part.name) s += part.name.length;
    if (part.mimeType) s += part.mimeType.length;
    return s;
}
function _conversationApproxSize(data) {
    let s = 200;
    if (data.titre) s += data.titre.length;
    if (Array.isArray(data.messages)) {
        for (const msg of data.messages) {
            s += 30;
            if (typeof msg.content === 'string') s += msg.content.length;
            else if (Array.isArray(msg.content)) for (const p of msg.content) s += _partApproxSize(p);
        }
    }
    return s;
}

function _formatBytes(bytes) {
    if (bytes < 1024) return bytes + ' o';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' Ko';
    if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' Mo';
    return (bytes / (1024 * 1024 * 1024)).toFixed(2) + ' Go';
}

function _formatStorageDate(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    return d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });
}

function _extractFullText(messages) {
    let txt = '';
    if (!Array.isArray(messages)) return txt;
    for (const msg of messages) {
        if (typeof msg.content === 'string') txt += msg.content + ' ';
        else if (Array.isArray(msg.content)) {
            for (const p of msg.content) {
                if (p.type === 'text') txt += p.text + ' ';
                else if (p.type === 'file' && p.textContent) txt += p.textContent + ' ';
                else if (p.name) txt += p.name + ' ';
            }
        }
    }
    return txt.toLowerCase();
}

async function _loadStorageData() {
    const db = await openConvDB();
    const tx = db.transaction('conversations', 'readonly');
    const store = tx.objectStore('conversations');
    const [keys, allValues] = await Promise.all([
        new Promise(r => { const q = store.getAllKeys(); q.onsuccess = () => r(q.result); q.onerror = () => r([]); }),
        new Promise(r => { const q = store.getAll(); q.onsuccess = () => r(q.result); q.onerror = () => r([]); })
    ]);
    const conversations = [];
    const medias = [];
    let totalSize = 0;
    let mediaSize = 0;
    const categorySizes = { texts: 0, images: 0, pdf: 0, audio: 0, video: 0, other: 0 };
    for (let i = 0; i < keys.length; i++) {
        const raw = allValues[i];
        if (!raw) continue;
        let data;
        try { data = typeof raw === 'string' ? JSON.parse(raw) : raw; } catch { continue; }
        if (data.deleted) continue;
        const filename = keys[i];
        const date = data.lastActivity || data.date || '';
        const firstMsg = data.messages?.[0]?.content;
        const titre = data.titre || (typeof firstMsg === 'string' ? firstMsg.slice(0, 80) : 'Sans titre');
        const msgCount = Array.isArray(data.messages) ? data.messages.length : 0;
        let convMediaSize = 0;
        let mediaCount = 0;
        if (Array.isArray(data.messages)) {
            for (let m = 0; m < data.messages.length; m++) {
                const content = data.messages[m].content;
                if (!Array.isArray(content)) continue;
                for (let p = 0; p < content.length; p++) {
                    const part = content[p];
                    if (part?.type !== 'image' && part?.type !== 'file') continue;
                    mediaCount++;
                    const partSize = _partApproxSize(part);
                    convMediaSize += partSize;
                    categorySizes[_categorizeFilePart(part)] += partSize;
                    const name = part.name || (part.type === 'image' ? 'Image' : (part.mimeType || 'Fichier'));
                    // Stocker une référence pour matérialiser la dataUrl à la demande (lazy)
                    medias.push({
                        id: `${filename}::${m}::${p}`,
                        convFilename: filename,
                        convTitle: titre,
                        msgIndex: m,
                        partIndex: p,
                        type: part.type,
                        name,
                        mimeType: part.mimeType || '',
                        size: partSize,
                        date,
                        iconName: _storageFileIconName(part),
                        _data: part.data,
                        _dataUrl: part.dataUrl
                    });
                }
            }
        }
        const size = _conversationApproxSize(data);
        totalSize += size;
        mediaSize += convMediaSize;
        categorySizes.texts += Math.max(0, size - convMediaSize);
        conversations.push({
            filename, titre, date, size, msgCount, mediaCount,
            mediaSize: convMediaSize,
            // Texte lower-case uniquement extrait à la première recherche (lazy)
            _data: data,
            _searchText: null
        });
    }
    _storage.conversations = conversations;
    _storage.medias = medias;
    _storage.totalSize = totalSize;
    _storage.mediaSize = mediaSize;
    _storage.categorySizes = categorySizes;
    _storage._dirty = false;
}

function _ensureSearchText(conv) {
    if (conv._searchText !== null) return conv._searchText;
    conv._searchText = ((conv.titre || '') + ' ' + _extractFullText(conv._data?.messages)).toLowerCase();
    return conv._searchText;
}

function _applyStorageControlsLayout() {
    const controls = document.getElementById('storage-controls');
    if (!controls) return;
    if (_storage.subtab === 'medias') {
        controls.classList.remove('controls-conv');
        controls.classList.add('controls-media');
        if (!controls.classList.contains('search-active') && !controls.classList.contains('sort-active')) {
            controls.classList.add('search-active');
        }
    } else {
        controls.classList.remove('controls-media');
        controls.classList.add('controls-conv');
    }
}

function _renderStorageOverview() {
    const total = _storage.totalSize;
    const mediaSize = _storage.mediaSize;
    const fmtTotal = _formatBytes(total);
    const fmtMedia = _formatBytes(mediaSize);

    document.getElementById('storage-total-size').textContent = fmtTotal;

    document.getElementById('storage-count-conv').textContent = _storage.conversations.length;
    document.getElementById('storage-count-media').textContent = _storage.medias.length;

    const sizeConv = document.getElementById('storage-size-conv');
    const sizeMedia = document.getElementById('storage-size-media');
    if (sizeConv) sizeConv.textContent = fmtTotal;
    if (sizeMedia) sizeMedia.textContent = fmtMedia;

    const sizes = _storage.categorySizes || { texts: 0, images: 0, pdf: 0, audio: 0, video: 0, other: 0 };
    let entries = _STORAGE_CATEGORIES
        .map(cat => ({ key: cat.key, label: cat.label, size: sizes[cat.key] || 0 }))
        .filter(e => e.size > 0)
        .sort((a, b) => b.size - a.size);

    if (entries.length > _STORAGE_MAX_VISIBLE_CATS) {
        const visible = entries.slice(0, _STORAGE_MAX_VISIBLE_CATS - 1);
        const overflow = entries.slice(_STORAGE_MAX_VISIBLE_CATS - 1);
        const otherSize = overflow.reduce((s, e) => s + e.size, 0);
        const merged = visible.concat([{ key: 'other', label: 'Autre', size: otherSize }]);
        // Re-tri pour placer "Autre" selon sa taille
        entries = merged.sort((a, b) => b.size - a.size);
    }

    const bar = document.getElementById('storage-overview-bar');
    const legend = document.getElementById('storage-overview-legend');
    if (bar) {
        bar.innerHTML = entries.map(e => {
            const pct = total > 0 ? (e.size / total) * 100 : 0;
            return `<div class="storage-overview-seg storage-overview-seg-${e.key}" style="width:${pct}%"></div>`;
        }).join('');
    }
    if (legend) {
        legend.innerHTML = entries.map(e => `
            <span class="storage-legend-item">
                <span class="storage-legend-dot storage-legend-dot-${e.key}"></span>
                <span class="storage-legend-text">${e.label}</span>
                <span class="storage-legend-size">${_formatBytes(e.size)}</span>
            </span>
        `).join('');
    }
}

function _setStorageView(view) {
    const panel = document.getElementById('panel-stockage');
    if (!panel) return;
    panel.dataset.storageView = view;
    if (view === 'home') {
        _storage.selected.clear();
    }
}

async function _enterStorageListView(subtab) {
    const panel = document.getElementById('panel-stockage');
    if (!panel) return;
    panel.dataset.storageLoading = 'true';
    _storage.subtab = subtab;
    _storage.selected.clear();
    _storage.search = '';
    _storage.mediaType = 'all';
    _storage.visibleCount = _storage.pageSize;
    const searchInput = document.getElementById('storage-search');
    if (searchInput) searchInput.value = '';
    document.querySelectorAll('.storage-filter-chip').forEach(c => {
        c.classList.toggle('active', c.dataset.mediatype === 'all');
    });
    const subEl = document.getElementById('storage-heading-sub');
    if (subEl) subEl.textContent = subtab === 'medias' ? 'Médias' : 'Conversations';
    _applyStorageControlsLayout();
    await new Promise(r => setTimeout(r, 350));
    _renderStorageList();
    _setStorageView('list');
    panel.dataset.storageLoading = 'false';
}

function _filterAndSortStorageItems() {
    const isConv = _storage.subtab === 'conversations';
    const items = isConv ? _storage.conversations : _storage.medias;
    const search = _storage.search.trim().toLowerCase();
    const filtered = [];
    for (const item of items) {
        if (!isConv && _storage.mediaType !== 'all' && item.type !== _storage.mediaType) continue;
        if (search) {
            if (isConv) {
                if (!_ensureSearchText(item).includes(search)) continue;
            } else {
                const hay = ((item.name || '') + ' ' + (item.convTitle || '') + ' ' + (item.mimeType || '')).toLowerCase();
                if (!hay.includes(search)) continue;
            }
        }
        filtered.push(item);
    }
    const sort = _storage.sort;
    if (sort === 'size') filtered.sort((a, b) => b.size - a.size);
    else if (sort === 'size-asc') filtered.sort((a, b) => a.size - b.size);
    else if (sort === 'date-asc') filtered.sort((a, b) => (a.date || '').localeCompare(b.date || ''));
    else filtered.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    return filtered;
}

function _renderStorageList() {
    const list = document.getElementById('storage-list');
    const summary = document.getElementById('storage-summary');
    const masterCb = document.getElementById('storage-select-all');
    const actionBar = document.getElementById('storage-action-bar');
    const actionInfo = document.getElementById('storage-action-info');
    const mediaFilter = document.getElementById('storage-media-filter');
    if (!list) return;

    const isConv = _storage.subtab === 'conversations';
    mediaFilter.style.display = isConv ? 'none' : 'inline-flex';
    const viewToggle = document.getElementById('storage-viewmode-toggle');
    if (viewToggle) viewToggle.style.display = isConv ? 'none' : 'inline-flex';

    const filtered = _filterAndSortStorageItems();
    const visibleIds = new Set();
    for (const i of filtered) visibleIds.add(isConv ? i.filename : i.id);
    for (const id of [..._storage.selected]) if (!visibleIds.has(id)) _storage.selected.delete(id);

    let maxSize = 0;
    let totalSize = 0;
    let selectedSize = 0;
    for (const i of filtered) {
        if (i.size > maxSize) maxSize = i.size;
        totalSize += i.size;
        if (_storage.selected.has(isConv ? i.filename : i.id)) selectedSize += i.size;
    }
    if (maxSize === 0) maxSize = 1;

    const visibleSlice = filtered.slice(0, _storage.visibleCount);

    const galleryMode = !isConv && _storage.mediaViewMode === 'grid';
    list.classList.toggle('storage-list-gallery', galleryMode);

    if (filtered.length === 0) {
        const emptyIcon = isConv ? 'chat' : 'image';
        const emptyText = _storage.search || (!isConv && _storage.mediaType !== 'all')
            ? 'Aucun résultat pour ces critères.'
            : (isConv ? 'Aucune conversation enregistrée.' : 'Aucun média stocké.');
        list.innerHTML = `<div class="storage-empty"><span class="storage-empty-icon">${_STORAGE_ICONS[emptyIcon]}</span>${escHtml(emptyText)}</div>`;
    } else {
        const parts = new Array(visibleSlice.length);
        for (let i = 0; i < visibleSlice.length; i++) {
            const item = visibleSlice[i];
            const id = isConv ? item.filename : item.id;
            const checked = _storage.selected.has(id);
            const sizePct = (item.size / maxSize) * 100;
            if (isConv) {
                const dateStr = _formatStorageDate(item.date);
                let meta = '';
                if (dateStr) meta += `<span class="storage-row-meta-item">${escHtml(dateStr)}</span><span class="storage-row-meta-sep">·</span>`;
                meta += `<span class="storage-row-meta-item">${_STORAGE_ICONS.msg} ${item.msgCount}</span>`;
                if (item.mediaCount > 0) meta += `<span class="storage-row-meta-sep">·</span><span class="storage-row-meta-item">${_STORAGE_ICONS.paperclip} ${item.mediaCount}</span>`;
                parts[i] = `<div class="storage-row storage-row-conv${checked ? ' selected' : ''}" data-id="${escHtmlAttr(id)}" data-filename="${escHtmlAttr(item.filename)}">`
                    + `<input type="checkbox" class="storage-row-cb"${checked ? ' checked' : ''}>`
                    + `<div class="storage-row-main"><div class="storage-row-title">${escHtml(item.titre || 'Sans titre')}</div><div class="storage-row-meta">${meta}</div></div>`
                    + `<div class="storage-row-right"><span class="storage-row-size">${_formatBytes(item.size)}</span>`
                    + `<div class="storage-row-actions">`
                    +   `<button type="button" class="storage-row-action" data-storage-preview-conv="${escHtmlAttr(item.filename)}" title="Aperçu" aria-label="Aperçu">${_STORAGE_ICONS.eye}</button>`
                    +   `<button type="button" class="storage-row-action storage-row-action-danger" data-storage-delete-conv="${escHtmlAttr(item.filename)}" title="Supprimer" aria-label="Supprimer">${_STORAGE_ICONS.trash}</button>`
                    + `</div>`
                    + `<div class="storage-row-bar"><div class="storage-row-bar-fill" style="width:${sizePct}%"></div></div></div></div>`;
                continue;
            }
            const ext = item.mimeType ? item.mimeType.split('/').pop().split('+')[0].toUpperCase().slice(0, 5) : item.type.toUpperCase();
            if (galleryMode) {
                let visual;
                if (item.type === 'image') {
                    if (!item.dataUrl) item.dataUrl = item._dataUrl || (item._data ? `data:${item.mimeType || 'image/png'};base64,${item._data}` : '');
                    visual = item.dataUrl
                        ? `<img loading="lazy" decoding="async" src="${escHtmlAttr(item.dataUrl)}" class="storage-tile-img" alt="">`
                        : `<div class="storage-tile-icon">${_STORAGE_ICONS.image}</div>`;
                } else if (_isSvgMedia(item)) {
                    const url = _svgDataUrl(item);
                    visual = url
                        ? `<img loading="lazy" decoding="async" src="${escHtmlAttr(url)}" class="storage-tile-img storage-tile-img-svg" alt="">`
                        : `<div class="storage-tile-icon">${_STORAGE_ICONS[item.iconName] || _STORAGE_ICONS.file}</div>`;
                } else {
                    visual = `<div class="storage-tile-icon">${_STORAGE_ICONS[item.iconName] || _STORAGE_ICONS.file}</div>`;
                }
                const convFn = item.convFilename || '';
                const convBtn = convFn
                    ? `<button type="button" class="storage-tile-action" data-storage-open-conv="${escHtmlAttr(convFn)}" title="Ouvrir la conversation" aria-label="Ouvrir la conversation">${_STORAGE_ICONS.chat}</button>`
                    : '';
                parts[i] = `<div class="storage-tile${checked ? ' selected' : ''}" data-id="${escHtmlAttr(id)}" title="${escHtmlAttr(item.name)}">`
                    + visual
                    + `<span class="storage-tile-check" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg></span>`
                    + `<span class="storage-tile-badge">${escHtml(ext)}</span>`
                    + `<span class="storage-tile-size">${_formatBytes(item.size)}</span>`
                    + `<div class="storage-tile-overlay">`
                    +   convBtn
                    +   `<button type="button" class="storage-tile-action" data-storage-preview-media="${escHtmlAttr(id)}" title="Aperçu" aria-label="Aperçu">${_STORAGE_ICONS.eye}</button>`
                    +   `<button type="button" class="storage-tile-action" data-storage-download-media="${escHtmlAttr(id)}" title="Télécharger" aria-label="Télécharger">${_STORAGE_ICONS.download}</button>`
                    +   `<button type="button" class="storage-tile-action storage-tile-action-danger" data-storage-delete-media="${escHtmlAttr(id)}" title="Supprimer" aria-label="Supprimer">${_STORAGE_ICONS.trash}</button>`
                    + `</div>`
                    + `</div>`;
                continue;
            }
            // Médias : vue liste
            let thumb;
            if (item.type === 'image') {
                if (!item.dataUrl) item.dataUrl = item._dataUrl || (item._data ? `data:${item.mimeType || 'image/png'};base64,${item._data}` : '');
                thumb = item.dataUrl
                    ? `<img loading="lazy" decoding="async" src="${escHtmlAttr(item.dataUrl)}" class="storage-row-thumb" alt="" data-lightbox-storage="${escHtmlAttr(item.dataUrl)}">`
                    : `<div class="storage-row-icon">${_STORAGE_ICONS.image}</div>`;
            } else if (_isSvgMedia(item)) {
                const url = _svgDataUrl(item);
                thumb = url
                    ? `<img loading="lazy" decoding="async" src="${escHtmlAttr(url)}" class="storage-row-thumb storage-row-thumb-svg" alt="" data-lightbox-storage="${escHtmlAttr(url)}">`
                    : `<div class="storage-row-icon">${_STORAGE_ICONS[item.iconName] || _STORAGE_ICONS.file}</div>`;
            } else {
                thumb = `<div class="storage-row-icon storage-row-file-preview" data-storage-file-id="${escHtmlAttr(id)}" title="Aperçu du fichier" style="cursor:pointer">${_STORAGE_ICONS[item.iconName] || _STORAGE_ICONS.file}</div>`;
            }
            const convT = item.convTitle || 'Sans titre';
            const convShort = convT.length > 28 ? convT.slice(0, 28).trim() + '…' : convT;
            const convFn = item.convFilename || '';
            const convAction = convFn
                ? `<button type="button" class="storage-row-action" data-storage-open-conv="${escHtmlAttr(convFn)}" title="Ouvrir la conversation" aria-label="Ouvrir la conversation">${_STORAGE_ICONS.chat}</button>`
                : '';
            parts[i] = `<div class="storage-row${checked ? ' selected' : ''}" data-id="${escHtmlAttr(id)}">`
                + `<input type="checkbox" class="storage-row-cb"${checked ? ' checked' : ''}>`
                + thumb
                + `<div class="storage-row-main"><div class="storage-row-title"><span class="storage-row-badge">${escHtml(ext)}</span><span class="storage-row-title-text">${escHtml(item.name)}</span></div>`
                + `<div class="storage-row-meta"><span class="storage-row-meta-item">${escHtml(_formatStorageDate(item.date))}</span>`
                + `<span class="storage-row-meta-sep">·</span><span class="storage-row-meta-item" title="${escHtmlAttr(convT)}">${_STORAGE_ICONS.chat} ${escHtml(convShort)}</span></div></div>`
                + `<div class="storage-row-right"><span class="storage-row-size">${_formatBytes(item.size)}</span>`
                + `<div class="storage-row-actions">`
                +   convAction
                +   `<button type="button" class="storage-row-action" data-storage-preview-media="${escHtmlAttr(id)}" title="Aperçu" aria-label="Aperçu">${_STORAGE_ICONS.eye}</button>`
                +   `<button type="button" class="storage-row-action" data-storage-download-media="${escHtmlAttr(id)}" title="Télécharger" aria-label="Télécharger">${_STORAGE_ICONS.download}</button>`
                +   `<button type="button" class="storage-row-action storage-row-action-danger" data-storage-delete-media="${escHtmlAttr(id)}" title="Supprimer" aria-label="Supprimer">${_STORAGE_ICONS.trash}</button>`
                + `</div>`
                + `<div class="storage-row-bar"><div class="storage-row-bar-fill media" style="width:${sizePct}%"></div></div></div></div>`;
        }
        let html = parts.join('');
        if (filtered.length > visibleSlice.length) {
            const remaining = filtered.length - visibleSlice.length;
            html += `<button type="button" id="storage-load-more" class="storage-load-more">Afficher ${Math.min(remaining, _storage.pageSize)} de plus (${remaining} restant${remaining > 1 ? 's' : ''})</button>`;
        }
        list.innerHTML = html;
    }

    _attachStorageAutoLoad();
    summary.textContent = `${filtered.length} élément${filtered.length > 1 ? 's' : ''} • ${_formatBytes(totalSize)}`;
    masterCb.checked = filtered.length > 0 && filtered.every(i => _storage.selected.has(isConv ? i.filename : i.id));
    masterCb.indeterminate = !masterCb.checked && filtered.some(i => _storage.selected.has(isConv ? i.filename : i.id));

    const downloadBtn = document.getElementById('storage-download-btn');
    if (downloadBtn) downloadBtn.style.display = (!isConv && _storage.selected.size > 0) ? '' : 'none';

    if (_storage.selected.size > 0) {
        actionBar.classList.add('visible');
        actionInfo.textContent = `${_storage.selected.size} sélectionné${_storage.selected.size > 1 ? 's' : ''} • ${_formatBytes(selectedSize)}`;
    } else {
        actionBar.classList.remove('visible');
    }
}

function _updateStorageSelectionUI() {
    const isConv = _storage.subtab === 'conversations';
    const filtered = _filterAndSortStorageItems();
    const masterCb = document.getElementById('storage-select-all');
    const actionBar = document.getElementById('storage-action-bar');
    const actionInfo = document.getElementById('storage-action-info');
    let selectedSize = 0;
    let selectedInVisible = 0;
    for (const i of filtered) {
        if (_storage.selected.has(isConv ? i.filename : i.id)) {
            selectedInVisible++;
            selectedSize += i.size;
        }
    }
    if (masterCb) {
        masterCb.checked = filtered.length > 0 && selectedInVisible === filtered.length;
        masterCb.indeterminate = selectedInVisible > 0 && selectedInVisible < filtered.length;
    }
    const downloadBtn = document.getElementById('storage-download-btn');
    if (downloadBtn) downloadBtn.style.display = (!isConv && _storage.selected.size > 0) ? '' : 'none';
    if (_storage.selected.size > 0) {
        actionBar.classList.add('visible');
        actionInfo.textContent = `${_storage.selected.size} sélectionné${_storage.selected.size > 1 ? 's' : ''} • ${_formatBytes(selectedSize)}`;
    } else {
        actionBar.classList.remove('visible');
    }
}

function _isSvgMedia(item) {
    if (!item) return false;
    if ((item.mimeType || '').toLowerCase() === 'image/svg+xml') return true;
    return /\.svg$/i.test(item.name || '');
}

function _svgDataUrl(item) {
    if (item._dataUrl) return item._dataUrl;
    if (item._data) return `data:image/svg+xml;base64,${item._data}`;
    return '';
}

function _attachStorageAutoLoad() {
    if (_storage.autoLoadObserver) {
        _storage.autoLoadObserver.disconnect();
        _storage.autoLoadObserver = null;
    }
    const sentinel = document.getElementById('storage-load-more');
    if (!sentinel || typeof IntersectionObserver === 'undefined') return;
    const root = document.getElementById('storage-list');
    const obs = new IntersectionObserver((entries) => {
        for (const entry of entries) {
            if (entry.isIntersecting) {
                _storage.visibleCount += _storage.pageSize;
                _renderStorageList();
                break;
            }
        }
    }, { root, rootMargin: '200px' });
    obs.observe(sentinel);
    _storage.autoLoadObserver = obs;
}

function _setMediaViewMode(mode) {
    if (mode !== 'list' && mode !== 'grid') return;
    if (_storage.mediaViewMode === mode) return;
    _storage.mediaViewMode = mode;
    try { localStorage.setItem(_STORAGE_VIEWMODE_KEY, mode); } catch (e) {}
    document.querySelectorAll('.storage-viewmode-btn').forEach(b => {
        b.classList.toggle('active', b.dataset.viewmode === mode);
    });
    const panel = document.getElementById('panel-stockage');
    if (panel) panel.dataset.storageLoading = 'true';
    requestAnimationFrame(() => {
        requestAnimationFrame(() => {
            _renderStorageList();
            if (panel) panel.dataset.storageLoading = 'false';
        });
    });
}

function _toggleStorageRow(row) {
    if (!row) return;
    const id = row.dataset.id;
    const cb = row.querySelector('.storage-row-cb');
    if (_storage.selected.has(id)) {
        _storage.selected.delete(id);
        row.classList.remove('selected');
        if (cb) cb.checked = false;
    } else {
        _storage.selected.add(id);
        row.classList.add('selected');
        if (cb) cb.checked = true;
    }
    _updateStorageSelectionUI();
}

function _sanitizeFilename(name) {
    return (name || 'fichier').replace(/[\\/:*?"<>|]+/g, '_').replace(/\s+/g, ' ').trim().slice(0, 180) || 'fichier';
}

function _mediaToBlob(media) {
    if (!media || !media._data) return null;
    try {
        const bin = atob(media._data);
        const len = bin.length;
        const bytes = new Uint8Array(len);
        for (let i = 0; i < len; i++) bytes[i] = bin.charCodeAt(i);
        return new Blob([bytes], { type: media.mimeType || 'application/octet-stream' });
    } catch (e) {
        console.warn('Conversion média -> blob impossible', e);
        return null;
    }
}

function _triggerDownload(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
}

async function _downloadSelectedStorage() {
    if (_storage.subtab !== 'medias') return;
    const ids = [..._storage.selected];
    if (ids.length === 0) return;
    const items = ids
        .map(id => _storage.medias.find(m => m.id === id))
        .filter(Boolean);
    if (items.length === 0) return;

    if (items.length === 1) {
        const blob = _mediaToBlob(items[0]);
        if (!blob) {
            if (typeof customConfirm === 'function') {
                await customConfirm('Impossible de préparer ce fichier au téléchargement.', { icon: 'warning', okLabel: 'OK' });
            }
            return;
        }
        _triggerDownload(blob, _sanitizeFilename(items[0].name));
        return;
    }

    if (typeof JSZip === 'undefined') {
        if (typeof customConfirm === 'function') {
            await customConfirm('La bibliothèque ZIP n\'est pas disponible. Impossible de regrouper les fichiers.', { icon: 'warning', okLabel: 'OK' });
        }
        return;
    }

    const zip = new JSZip();
    const usedNames = new Map();
    for (const item of items) {
        const blob = _mediaToBlob(item);
        if (!blob) continue;
        let name = _sanitizeFilename(item.name);
        const count = usedNames.get(name) || 0;
        usedNames.set(name, count + 1);
        if (count > 0) {
            const dot = name.lastIndexOf('.');
            name = dot > 0
                ? `${name.slice(0, dot)} (${count})${name.slice(dot)}`
                : `${name} (${count})`;
        }
        zip.file(name, blob);
    }
    try {
        const zipBlob = await zip.generateAsync({ type: 'blob' });
        const stamp = new Date().toISOString().slice(0, 10);
        _triggerDownload(zipBlob, `cetas-medias-${stamp}.zip`);
    } catch (e) {
        console.warn('Erreur génération ZIP', e);
        if (typeof customConfirm === 'function') {
            await customConfirm('Une erreur est survenue lors de la création du ZIP.', { icon: 'warning', okLabel: 'OK' });
        }
    }
}

async function _deleteSingleStorageConv(filename) {
    if (!filename) return;
    const conv = (_storage.conversations || []).find(c => c.filename === filename);
    const label = conv && conv.titre ? `« ${conv.titre} »` : 'cette conversation';
    const ok = await customConfirm(`Supprimer définitivement ${label} ?`, {
        icon: 'delete', danger: true, okLabel: 'Supprimer'
    });
    if (!ok) return;
    await deleteConversationFile(filename);
    _storage.selected.delete(filename);
    if (conv) {
        // Mutation locale du cache : on évite un _loadStorageData() complet
        // (relecture + reparse de toute la BD = lent sur grosses bases).
        let removedMediaSize = 0;
        const removedByCat = { texts: 0, images: 0, pdf: 0, audio: 0, video: 0, other: 0 };
        const newMedias = [];
        for (const m of (_storage.medias || [])) {
            if (m.convFilename === filename) {
                removedMediaSize += m.size || 0;
                const cat = _categorizeFilePart({ type: m.type, mimeType: m.mimeType, name: m.name });
                if (removedByCat[cat] != null) removedByCat[cat] += m.size || 0;
            } else newMedias.push(m);
        }
        _storage.medias = newMedias;
        _storage.conversations = (_storage.conversations || []).filter(c => c.filename !== filename);
        _storage.totalSize = Math.max(0, (_storage.totalSize || 0) - (conv.size || 0));
        _storage.mediaSize = Math.max(0, (_storage.mediaSize || 0) - removedMediaSize);
        if (_storage.categorySizes) {
            _storage.categorySizes.texts = Math.max(0, (_storage.categorySizes.texts || 0) - Math.max(0, (conv.size || 0) - removedMediaSize));
            for (const k of Object.keys(removedByCat)) {
                if (k === 'texts') continue;
                _storage.categorySizes[k] = Math.max(0, (_storage.categorySizes[k] || 0) - removedByCat[k]);
            }
        }
        // Le write a flagué dirty mais la mutation locale a tout resynchronisé,
        // donc le cache reste valide jusqu'à la prochaine mutation externe.
        _storage._dirty = false;
    } else {
        await _loadStorageData();
    }
    _renderStorageOverview();
    _renderStorageList();
    if (typeof refreshConvList === 'function') refreshConvList();
}

async function _deleteSingleStorageMedia(mediaId) {
    const media = (_storage.medias || []).find(m => m.id === mediaId);
    if (!media) return;
    const ok = await customConfirm(`Supprimer définitivement « ${media.name || 'ce média'} » ?`, {
        icon: 'delete', danger: true, okLabel: 'Supprimer'
    });
    if (!ok) return;
    const data = await readConversationFile(media.convFilename);
    let writeOk = false;
    if (data && Array.isArray(data.messages)) {
        const msg = data.messages[media.msgIndex];
        if (msg && Array.isArray(msg.content)) {
            msg.content.splice(media.partIndex, 1);
            await writeConversationFile(media.convFilename, data);
            writeOk = true;
        }
    }
    _storage.selected.delete(mediaId);
    if (writeOk) {
        // Mutation locale du cache. Plus rapide qu'un _loadStorageData() qui
        // reparse toute la BD. Pas besoin non plus de refreshConvList :
        // la sidebar n'a pas changé, on a juste retiré une part interne.
        const removedSize = media.size || 0;
        _storage.medias = (_storage.medias || []).filter(m => m.id !== mediaId);
        // Décaler les partIndex des médias suivants dans le même message
        // (splice de l'array content).
        for (const m of _storage.medias) {
            if (m.convFilename === media.convFilename
                && m.msgIndex === media.msgIndex
                && m.partIndex > media.partIndex) {
                m.partIndex -= 1;
                m.id = `${m.convFilename}::${m.msgIndex}::${m.partIndex}`;
            }
        }
        const conv = (_storage.conversations || []).find(c => c.filename === media.convFilename);
        if (conv) {
            conv.size = Math.max(0, (conv.size || 0) - removedSize);
            conv.mediaCount = Math.max(0, (conv.mediaCount || 0) - 1);
            conv.mediaSize = Math.max(0, (conv.mediaSize || 0) - removedSize);
            conv._data = data;
            conv._searchText = null;
        }
        _storage.totalSize = Math.max(0, (_storage.totalSize || 0) - removedSize);
        _storage.mediaSize = Math.max(0, (_storage.mediaSize || 0) - removedSize);
        const cat = _categorizeFilePart({ type: media.type, mimeType: media.mimeType, name: media.name });
        if (_storage.categorySizes && _storage.categorySizes[cat] != null) {
            _storage.categorySizes[cat] = Math.max(0, _storage.categorySizes[cat] - removedSize);
        }
        // Idem _deleteSingleStorageConv : la mutation locale a tout resynchronisé.
        _storage._dirty = false;
    } else {
        await _loadStorageData();
    }
    _renderStorageOverview();
    _renderStorageList();
}

async function _deleteSelectedStorage() {
    const isConv = _storage.subtab === 'conversations';
    const count = _storage.selected.size;
    const label = isConv ? `${count} conversation${count > 1 ? 's' : ''}` : `${count} média${count > 1 ? 's' : ''}`;
    const ok = await customConfirm(`Supprimer définitivement ${label} ?`, {
        icon: 'delete', danger: true, okLabel: 'Supprimer'
    });
    if (!ok) return;

    if (isConv) {
        for (const filename of _storage.selected) {
            await deleteConversationFile(filename);
        }
    } else {
        // Regrouper par conversation, supprimer les parts en partant de la fin pour conserver les indices
        const byConv = {};
        for (const id of _storage.selected) {
            const media = _storage.medias.find(m => m.id === id);
            if (!media) continue;
            (byConv[media.convFilename] = byConv[media.convFilename] || []).push(media);
        }
        for (const [filename, parts] of Object.entries(byConv)) {
            const data = await readConversationFile(filename);
            if (!data || !Array.isArray(data.messages)) continue;
            parts.sort((a, b) => b.msgIndex - a.msgIndex || b.partIndex - a.partIndex);
            for (const p of parts) {
                const msg = data.messages[p.msgIndex];
                if (msg && Array.isArray(msg.content)) {
                    msg.content.splice(p.partIndex, 1);
                }
            }
            await writeConversationFile(filename, data);
        }
    }
    _storage.selected.clear();
    await _loadStorageData();
    _renderStorageOverview();
    _renderStorageList();
    if (typeof refreshConvList === 'function') refreshConvList();
}

// État du dock de prévisualisation (lancé depuis Stockage > Conversations)
let _storagePreviewFilename = null;

function _openStorageFilePreview(id) {
    const item = _storage.medias.find(m => m.id === id);
    if (!item || !item._data) return;
    try {
        const blob = new Blob(
            [Uint8Array.from(atob(item._data), c => c.charCodeAt(0))],
            { type: item.mimeType || 'application/octet-stream' }
        );
        const url = URL.createObjectURL(blob);
        if (typeof openFileViewer === 'function') openFileViewer(url, item.name);
        setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (e) {
        console.warn('Impossible d\'ouvrir l\'aperçu du fichier', e);
    }
}

function _openStoragePreview(filename) {
    if (!filename) return;
    const conv = _storage.conversations.find(c => c.filename === filename);
    _storagePreviewFilename = filename;

    const dock = document.getElementById('storage-preview-dock');
    const titleEl = document.getElementById('storage-preview-dock-title');
    if (titleEl) titleEl.textContent = (conv && conv.titre) ? conv.titre : 'Sans titre';
    document.body.classList.add('storage-preview-mode');

    // Charger la conversation dans la vue principale pour aperçu
    loadConversation(filename);

    // Animer la modale Paramètres vers le dock du bas
    const modalBox = apikeysModalOverlay.querySelector('.sp-modal.apikeys-modal');
    if (modalBox) {
        modalBox.classList.remove('morphing-from-dock');
        modalBox.classList.add('morphing-to-dock');
        // Affiche le dock un peu avant la fin de l'animation pour un enchaînement plus fluide
        setTimeout(() => { if (dock) dock.style.display = 'flex'; }, 230);
        const onEnd = (e) => {
            if (e.target !== modalBox || e.animationName !== 'modal-morph-to-dock') return;
            modalBox.removeEventListener('animationend', onEnd);
            apikeysModalOverlay.style.display = 'none';
            modalBox.classList.remove('morphing-to-dock');
        };
        modalBox.addEventListener('animationend', onEnd);
    } else {
        apikeysModalOverlay.style.display = 'none';
        if (dock) dock.style.display = 'flex';
    }
}

function _closeStoragePreviewDock() {
    const dock = document.getElementById('storage-preview-dock');
    if (dock) dock.style.display = 'none';
    _storagePreviewFilename = null;
    document.body.classList.remove('storage-preview-mode');

    // Animer la modale Paramètres en réapparition depuis le bas
    const modalBox = apikeysModalOverlay.querySelector('.sp-modal.apikeys-modal');
    if (modalBox) {
        // Pose l'état initial de l'animation AVANT d'afficher l'overlay
        // pour éviter le flash à pleine échelle pendant la première frame.
        modalBox.classList.remove('morphing-to-dock');
        modalBox.classList.add('morphing-from-dock');
        apikeysModalOverlay.style.display = 'flex';
        // Force un reflow pour que l'animation reparte de zéro même si la classe
        // était déjà présente d'un cycle précédent.
        void modalBox.offsetWidth;
        const onEnd = (e) => {
            if (e.target !== modalBox || e.animationName !== 'modal-morph-from-dock') return;
            modalBox.removeEventListener('animationend', onEnd);
            modalBox.classList.remove('morphing-from-dock');
        };
        modalBox.addEventListener('animationend', onEnd);
    } else {
        apikeysModalOverlay.style.display = 'flex';
    }
}

async function _deleteStoragePreviewConv() {
    const filename = _storagePreviewFilename;
    if (!filename) return;
    const ok = await customConfirm('Supprimer définitivement cette conversation ?', {
        icon: 'delete', danger: true, okLabel: 'Supprimer'
    });
    if (!ok) return;
    await deleteConversationFile(filename);
    _storage.selected.delete(filename);
    await _loadStorageData();
    _renderStorageOverview();
    _renderStorageList();
    if (typeof refreshConvList === 'function') refreshConvList();
    _closeStoragePreviewDock();
}

function _selectStoragePreviewConv() {
    const filename = _storagePreviewFilename;
    if (!filename) return;
    _storage.selected.add(filename);
    _renderStorageList();
    _closeStoragePreviewDock();
}

let _storageInitialized = false;
async function _initStoragePanel() {
    // Ne relire la BD que si quelque chose a changé depuis la dernière ouverture.
    // Sinon le cache `_storage` reste valide et l'ouverture est quasi-instantanée.
    if (_storage._dirty) await _loadStorageData();
    _storage.selected.clear();
    _storage.visibleCount = _storage.pageSize;
    if (!_storageInitialized) {
        _storageInitialized = true;

        document.querySelectorAll('[data-storage-action]').forEach(btn => {
            btn.addEventListener('click', () => {
                _enterStorageListView(btn.dataset.storageAction);
            });
        });

        const backBtn = document.getElementById('storage-back-btn');
        if (backBtn) {
            backBtn.addEventListener('click', () => {
                _setStorageView('home');
                _renderStorageOverview();
            });
        }

        document.querySelectorAll('.storage-filter-chip').forEach(chip => {
            chip.addEventListener('click', () => {
                document.querySelectorAll('.storage-filter-chip').forEach(c => c.classList.remove('active'));
                chip.classList.add('active');
                _storage.mediaType = chip.dataset.mediatype;
                _storage.visibleCount = _storage.pageSize;
                _renderStorageList();
            });
        });

        document.getElementById('storage-search').addEventListener('input', (e) => {
            const value = e.target.value;
            clearTimeout(_storage.searchDebounce);
            _storage.searchDebounce = setTimeout(() => {
                _storage.search = value;
                _storage.visibleCount = _storage.pageSize;
                _renderStorageList();
            }, 200);
        });

        document.getElementById('storage-sort').addEventListener('change', (e) => {
            _storage.sort = e.target.value;
            _storage.visibleCount = _storage.pageSize;
            _renderStorageList();
        });

        document.getElementById('storage-select-all').addEventListener('change', (e) => {
            const isConv = _storage.subtab === 'conversations';
            const filtered = _filterAndSortStorageItems();
            const list = document.getElementById('storage-list');
            if (e.target.checked) for (const i of filtered) _storage.selected.add(isConv ? i.filename : i.id);
            else for (const i of filtered) _storage.selected.delete(isConv ? i.filename : i.id);
            list.querySelectorAll('.storage-row, .storage-tile').forEach(el => {
                const sel = _storage.selected.has(el.dataset.id);
                el.classList.toggle('selected', sel);
                const cb = el.querySelector('.storage-row-cb');
                if (cb) cb.checked = sel;
            });
            _updateStorageSelectionUI();
        });

        // Click sur la ligne entière → toggle. Clic sur miniature image → lightbox.
        document.getElementById('storage-list').addEventListener('click', (e) => {
            const loadMore = e.target.closest('#storage-load-more');
            if (loadMore) {
                _storage.visibleCount += _storage.pageSize;
                _renderStorageList();
                return;
            }
            const eyeBtn = e.target.closest('[data-storage-preview-conv], [data-storage-preview-media]');
            if (eyeBtn) {
                e.stopPropagation();
                const convFilename = eyeBtn.dataset.storagePreviewConv;
                if (convFilename) { _openStoragePreview(convFilename); return; }
                const mediaId = eyeBtn.dataset.storagePreviewMedia;
                if (mediaId) {
                    const media = (_storage.medias || []).find(m => m.id === mediaId);
                    // Pour toutes les images, on route vers la lightbox (max-width/height
                    // 92vw/92vh). L'iframe du file-viewer n'applique aucune contrainte
                    // sur les images chargées en src direct → la prévisualisation
                    // sortait à taille native. On reconstruit la dataUrl si nécessaire
                    // depuis `_data` (cas des conversations sauvegardées sans `dataUrl`).
                    if (media && media.type === 'image' && typeof openLightbox === 'function') {
                        const url = media._dataUrl
                            || media.dataUrl
                            || (media._data ? `data:${media.mimeType || 'image/png'};base64,${media._data}` : '');
                        if (url) { openLightbox(url); return; }
                    }
                    _openStorageFilePreview(mediaId);
                    return;
                }
                return;
            }
            const thumb = e.target.closest('[data-lightbox-storage]');
            if (thumb) {
                e.stopPropagation();
                if (typeof openLightbox === 'function') openLightbox(thumb.dataset.lightboxStorage);
                return;
            }
            const fileThumb = e.target.closest('[data-storage-file-id]');
            if (fileThumb) {
                e.stopPropagation();
                _openStorageFilePreview(fileThumb.dataset.storageFileId);
                return;
            }
            const convBtn = e.target.closest('[data-storage-open-conv]');
            if (convBtn) {
                e.stopPropagation();
                const fn = convBtn.dataset.storageOpenConv;
                if (fn) _openStoragePreview(fn);
                return;
            }
            const dlBtnTile = e.target.closest('[data-storage-download-media]');
            if (dlBtnTile) {
                e.stopPropagation();
                const mediaId = dlBtnTile.dataset.storageDownloadMedia;
                const media = (_storage.medias || []).find(m => m.id === mediaId);
                if (media) {
                    const blob = _mediaToBlob(media);
                    if (blob) _triggerDownload(blob, _sanitizeFilename(media.name));
                }
                return;
            }
            const delBtnTile = e.target.closest('[data-storage-delete-media]');
            if (delBtnTile) {
                e.stopPropagation();
                const mediaId = delBtnTile.dataset.storageDeleteMedia;
                _deleteSingleStorageMedia(mediaId);
                return;
            }
            const delBtnConv = e.target.closest('[data-storage-delete-conv]');
            if (delBtnConv) {
                e.stopPropagation();
                _deleteSingleStorageConv(delBtnConv.dataset.storageDeleteConv);
                return;
            }
            const tile = e.target.closest('.storage-tile');
            if (tile) { _toggleStorageRow(tile); return; }
            const row = e.target.closest('.storage-row');
            if (!row) return;
            _toggleStorageRow(row);
        });

        document.getElementById('storage-clear-btn').addEventListener('click', () => {
            _storage.selected.clear();
            const list = document.getElementById('storage-list');
            list.querySelectorAll('.storage-row.selected, .storage-tile.selected').forEach(el => {
                el.classList.remove('selected');
                const cb = el.querySelector('.storage-row-cb');
                if (cb) cb.checked = false;
            });
            _updateStorageSelectionUI();
        });

        document.getElementById('storage-delete-btn').addEventListener('click', _deleteSelectedStorage);
        const dlBtn = document.getElementById('storage-download-btn');
        if (dlBtn) dlBtn.addEventListener('click', _downloadSelectedStorage);

        document.querySelectorAll('.storage-viewmode-btn').forEach(btn => {
            btn.addEventListener('click', () => _setMediaViewMode(btn.dataset.viewmode));
            btn.classList.toggle('active', btn.dataset.viewmode === _storage.mediaViewMode);
        });

        // Dock de prévisualisation : Annuler / Sélectionner / Supprimer
        const dockCancel = document.getElementById('storage-preview-cancel');
        const dockSelect = document.getElementById('storage-preview-select');
        const dockDelete = document.getElementById('storage-preview-delete');
        if (dockCancel) dockCancel.addEventListener('click', _closeStoragePreviewDock);
        if (dockSelect) dockSelect.addEventListener('click', _selectStoragePreviewConv);
        if (dockDelete) dockDelete.addEventListener('click', _deleteStoragePreviewConv);

        const controls = document.getElementById('storage-controls');
        document.getElementById('storage-sort-btn').addEventListener('click', () => {
            controls.classList.remove('search-active');
            controls.classList.add('sort-active');
            setTimeout(() => document.getElementById('storage-sort').focus(), 50);
        });
        document.getElementById('storage-search-btn').addEventListener('click', () => {
            controls.classList.remove('sort-active');
            controls.classList.add('search-active');
            setTimeout(() => document.getElementById('storage-search').focus(), 50);
        });
    }
    _applyStorageControlsLayout();
    _renderStorageOverview();
    _renderStorageList();
    _setStorageView('home');
    const panel = document.getElementById('panel-stockage');
    if (panel) panel.dataset.storageLoading = 'false';
}
async function tryCloseApiKeysModal() {
    const currentActiveTab = document.querySelector('.apikeys-tab.active');
    const activeTabName = currentActiveTab ? currentActiveTab.dataset.tab : '';
    if (activeTabName === 'apimodeles' && (_keysDirty || _catalogDirty)) {
        const ok = await customConfirm('Vous avez des modifications non sauvegardées dans l\'onglet API et Modèles.', {
            icon: 'save',
            okLabel: 'Fermer sans sauvegarder',
            cancelLabel: 'Rester',
            danger: true
        });
        if (!ok) return;
        _restoreApiKeyInputs();
        _setKeysDirty(false);
        _initCatalogPending();
        _setCatalogDirty(false);
    }
    if (activeTabName === 'models' && _modelsDirty) {
        const ok = await customConfirm('Vous avez des modifications non sauvegardées dans l\'onglet Fonctionnalités.', {
            icon: 'save',
            okLabel: 'Fermer sans sauvegarder',
            cancelLabel: 'Rester',
            danger: true
        });
        if (!ok) return;
        _modelsDirty = false;
        populateModelSelects();
    }
    if (activeTabName === 'budget' && _budgetDirty) {
        const ok = await customConfirm('Vous avez des modifications non sauvegardées dans l\'onglet Budget.', {
            icon: 'save',
            okLabel: 'Fermer sans sauvegarder',
            cancelLabel: 'Rester',
            danger: true
        });
        if (!ok) return;
        const budgetCancelBtn = document.getElementById('budget-cancel-btn');
        if (budgetCancelBtn) budgetCancelBtn.click();
    }
    closeApiKeysModal();
}
apikeysModalOverlay.addEventListener('click', (e) => {
    if (e.target === apikeysModalOverlay) tryCloseApiKeysModal();
});
document.getElementById('apikeys-close-btn').addEventListener('click', tryCloseApiKeysModal);

// (coffre-fort retiré — sera remplacé par une nouvelle logique)

// ============================================================
// --- Catalogue de modèles ---
// ============================================================

let _catalogType = 'text'; // onglet actif dans le catalogue
let _catalogPending = null; // { disabled: Set, orEnabled: Set } — état UI en cours d'édition

// Catégories OR (filtre serveur via ?category=…)
const OR_CATEGORIES = [
    { id: 'all',         label: 'Toutes les catégories' },
    { id: 'or-routers',  label: 'OpenRouter' },
    { id: 'programming', label: 'Programmation' },
    { id: 'roleplay',    label: 'Roleplay' },
    { id: 'marketing',   label: 'Marketing' },
    { id: 'technology',  label: 'Technologie' },
    { id: 'science',     label: 'Science' },
    { id: 'translation', label: 'Traduction' },
    { id: 'finance',     label: 'Finance' },
    { id: 'health',      label: 'Santé' },
    { id: 'legal',       label: 'Juridique' },
    { id: 'academia',    label: 'Académique' }
];
let _orCategory = 'all'; // catégorie chip actuellement sélectionnée
let _orSearchTerm = '';
const _orCategoryViews = {}; // cache mémoire par catégorie (sauf 'all' qui est en localStorage)

// Renvoie la liste de modèles pour la (catégorie, type d'onglet) active, ou null si pas chargé
function _getOrModelsForCategory(cat, tabType = 'text') {
    if (cat === 'all') {
        const cache = getOrCache(tabType);
        return cache?.models || null;
    }
    if (cat === 'or-routers') {
        const cache = getOrCache(tabType);
        if (!cache?.models) return null;
        return cache.models.filter(m => typeof m.id === 'string' && m.id.startsWith('openrouter/'));
    }
    return _orCategoryViews[`${tabType}_${cat}`] || null;
}

function _initCatalogPending() {
    const prefs = loadCatalogPrefs();
    _catalogPending = {
        disabled: new Set(prefs.disabled || []),
        orEnabled: new Set(prefs.orEnabled || [])
    };
}

// Parse robuste du prix image OR : `pricing.image` peut être string ou objet,
// avec fallbacks vers image_output / request si la valeur principale est nulle.
function _parseOrImagePrice(pricing) {
    if (!pricing) return 0;
    function toNum(v) {
        if (v == null) return 0;
        if (typeof v === 'object') {
            // Pricing structuré : prendre la première valeur numérique trouvée
            for (const k of ['output', 'standard', 'default', 'high', 'medium']) {
                if (v[k] != null) {
                    const n = parseFloat(v[k]);
                    if (!isNaN(n) && n > 0) return n;
                }
            }
            for (const val of Object.values(v)) {
                const n = parseFloat(val);
                if (!isNaN(n) && n > 0) return n;
            }
            return 0;
        }
        const n = parseFloat(v);
        return isNaN(n) ? 0 : n;
    }
    return toNum(pricing.image) || toNum(pricing.image_output) || toNum(pricing.request) || 0;
}

// Formatte un prix par image avec une précision adaptative
function _formatImagePrice(p) {
    if (!p || p <= 0) return '';
    if (p >= 0.01) return '$' + p.toFixed(p >= 1 ? 2 : 3).replace(/\.?0+$/, '');
    if (p >= 0.001) return '$' + p.toFixed(4).replace(/0+$/, '');
    return '$' + p.toFixed(5).replace(/0+$/, '');
}

function _catalogPriceStr(m, isImage) {
    if (isLocalEditeur(m.editeur)) return 'Gratuit';
    if (isImage) {
        if (m.imageOutput) {
            // Modèle curaté de models.js : valeur déjà en $/img
            if (m.editeur !== 'openrouter') return `${_formatImagePrice(m.imageOutput)} /img`;
            return _formatOrImagePriceStr(m.imageOutput, m.outputModalities);
        }
        // Fallback : afficher le prix par token si présent (modèles vision/hybrides)
        if (m.inputPer1M || m.outputPer1M) return `$${m.inputPer1M} → $${m.outputPer1M} /M`;
        return 'Gratuit';
    }
    const inp = m.inputPer1M, out = m.outputPer1M;
    if (!inp && !out) return 'Gratuit';
    return `$${inp} → $${out} /M`;
}

// Petits badges affichés dans la ligne (NEW, expiration imminente)
function _catalogBadgesHtml(m) {
    let out = '';
    if (_isModelNew(m)) {
        out += '<span class="catalog-row-badge catalog-row-badge--new" title="Modèle ajouté il y a moins de 10 jours">NEW</span>';
    }
    if (_isModelExpiringSoon(m)) {
        out += `<span class="catalog-row-badge catalog-row-badge--warn" title="Sera retiré le ${escHtml(_formatExpirationDateFr(m.expirationDate))}">⚠</span>`;
    }
    return out;
}

// Construit la ligne d'un modèle dans le catalogue (provider standard ou OR)
function _catalogRowHtml(m, isImage, isOr, checked) {
    const tooltip = _buildModelTooltip(m);
    const cbClass = isOr ? 'catalog-cb catalog-or-cb' : 'catalog-cb';
    const editeurAttr = isOr ? '' : ` data-editeur="${escHtml(m.editeur)}"`;
    // Colonnes à position fixe : sorties de <label> pour ne pas être décalées par
    // la présence/absence de l'icône info (qui occupe sinon une largeur variable).
    const makerCol = isOr ? `<span class="catalog-row-maker">${escHtml(_modelMakerLabel(m))}</span>` : '';
    const infoCol = tooltip
        ? `<span class="custom-select-info catalog-row-info" data-tooltip="${escHtml(tooltip)}">i</span>`
        : `<span class="catalog-row-info-spacer" aria-hidden="true"></span>`;
    return `
        <div class="catalog-row${isOr ? ' catalog-row--or' : ''}">
            <label class="catalog-row-main">
                <input type="checkbox" class="${cbClass}" data-id="${escHtml(m.id)}"${editeurAttr} ${checked ? 'checked' : ''}>
                <span class="catalog-row-name">${escHtml(m.label)}${_catalogBadgesHtml(m)}</span>
            </label>
            ${makerCol}
            <span class="catalog-row-price">${escHtml(_catalogPriceStr(m, isImage))}</span>
            ${infoCol}
        </div>
    `;
}

// Compare pending vs saved prefs pour calculer dirty
function _computeCatalogDirty() {
    if (!_catalogPending) return false;
    const saved = loadCatalogPrefs();
    const savedDisabled = new Set(saved.disabled || []);
    const savedOrEnabled = new Set(saved.orEnabled || []);
    if (_catalogPending.disabled.size !== savedDisabled.size) return true;
    for (const id of _catalogPending.disabled) if (!savedDisabled.has(id)) return true;
    if (_catalogPending.orEnabled.size !== savedOrEnabled.size) return true;
    for (const id of _catalogPending.orEnabled) if (!savedOrEnabled.has(id)) return true;
    return false;
}

function _refreshCatalogDirty() {
    _setCatalogDirty(_computeCatalogDirty());
}

function renderCatalogTab() {
    // Le panel « Catalogue » a été fusionné dans « API et Modèles ».
    // On délègue au rendu par fournisseur de l'onglet actif.
    if (typeof renderProviderCatalog === 'function' && _activeProvider) {
        renderProviderCatalog(_activeProvider);
    }
}


// Met à jour le badge X/Y en se basant sur l'état pending (et non sur le DOM filtré)
function _updateSectionBadge(section, total, allModels, disabledSet) {
    const enabled = allModels.filter(m => !disabledSet.has(m.id)).length;
    const badge = section.querySelector('.catalog-section-badge');
    if (badge) badge.textContent = `${enabled}/${total}`;
    const masterCb = section.querySelector('.catalog-section-master-cb');
    if (masterCb) {
        masterCb.checked = enabled === total;
        masterCb.indeterminate = enabled > 0 && enabled < total;
    }
}

function _buildOrModelsHtml(models, orEnabled, isImage) {
    if (!models.length) return '<div class="catalog-or-empty">Aucun modèle trouvé.</div>';
    return models.map(m => _catalogRowHtml(m, isImage, true, orEnabled.has(m.id))).join('');
}

function _attachOrCheckboxListeners(section, orAll) {
    if (!_catalogPending) return;
    const orEnabled = _catalogPending.orEnabled;
    section.querySelectorAll('.catalog-or-cb').forEach(cb => {
        cb.addEventListener('change', () => {
            const id = cb.dataset.id;
            if (cb.checked) orEnabled.add(id);
            else orEnabled.delete(id);
            const enabledCount = orAll.filter(m => orEnabled.has(m.id)).length;
            const badge = section.querySelector('#or-badge');
            if (badge) badge.textContent = `${enabledCount}/${orAll.length}`;
            _refreshCatalogDirty();
        });
    });
}

// Évite plusieurs appels d'enrichissement parallèles pour une MÊME (tabType, catégorie).
// Un Set par clé `${tabType}_${category}` au lieu d'un flag global : sinon, changer
// de catégorie pendant un enrichissement bloque silencieusement le suivant.
const _enrichmentInFlight = new Set();

// Récupère le vrai prix image (image_output par token) depuis /endpoints pour chaque modèle.
// /models renvoie pricing.prompt et pricing.completion mais pas image_output ; il faut taper
// /models/{id}/endpoints pour récupérer le vrai tarif. Met à jour le cache, IMAGE_TARIFS
// (pour les modèles déjà activés dans le sélecteur) et re-render le catalogue.
async function _enrichImagePricesFromEndpoints(models, tabType, category) {
    const CONCURRENCY = 6;
    let i = 0;
    let updated = 0;
    async function worker() {
        while (i < models.length) {
            const m = models[i++];
            try {
                // NE PAS encodeURIComponent : le slash du slug (`author/model`) doit rester un slash dans le path
                const url = proxyUrl('openrouter', `https://openrouter.ai/api/v1/models/${m.id}/endpoints`);
                const res = await fetch(url, {});
                if (!res.ok) continue;
                const json = await res.json();
                const endpoints = json?.data?.endpoints || [];
                let best = 0;
                let bestImg = 0;
                let bestRequest = 0;
                for (const ep of endpoints) {
                    const p = ep?.pricing || {};
                    // image_output (prix par token de sortie image) — la source principale
                    const vImg = parseFloat(p.image_output);
                    if (!isNaN(vImg) && vImg > 0 && (bestImg === 0 || vImg < bestImg)) bestImg = vImg;
                    // image (prix par image complète) — fallback secondaire
                    const vImage = parseFloat(p.image);
                    if (!isNaN(vImage) && vImage > 0 && (best === 0 || vImage < best)) best = vImage;
                    // request (prix par requête) — dernier fallback
                    const vReq = parseFloat(p.request);
                    if (!isNaN(vReq) && vReq > 0 && (bestRequest === 0 || vReq < bestRequest)) bestRequest = vReq;
                }
                const finalPrice = bestImg || best || bestRequest;
                if (finalPrice > 0 && finalPrice !== m.imageOutput) {
                    m.imageOutput = finalPrice;
                    // Mettre à jour IMAGE_TARIFS pour que le dropdown du sélecteur
                    // affiche le bon prix sans attendre un rebuildModelLists.
                    if (typeof IMAGE_TARIFS !== 'undefined' && IMAGE_TARIFS[m.id]) {
                        IMAGE_TARIFS[m.id].imageOutput = finalPrice;
                    }
                    // Persiste dans la cache de prix dédiée → survit aux ré-écritures
                    // du cache /models et permet l'hydratation instantanée au reload.
                    if (typeof setOrImagePrice === 'function') setOrImagePrice(m.id, finalPrice);
                    updated++;
                }
            } catch(e) { /* ignore */ }
        }
    }
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, models.length) }, worker));

    if (updated === 0) return;
    if (!category || category === 'all') {
        // `models` est un sous-ensemble (ceux qui avaient un prix manquant).
        // On merge dans la cache existante par id pour ne pas la tronquer,
        // sinon le prochain reload reperdrait les modèles non enrichis et
        // re-déclencherait l'enrichissement (→ flash "Gratuit").
        const existing = getOrCache(tabType);
        if (existing?.models?.length) {
            const byId = new Map(existing.models.map(em => [em.id, em]));
            for (const m of models) byId.set(m.id, m);
            setOrCache([...byId.values()], tabType);
        } else {
            setOrCache(models, tabType);
        }
    } else {
        // Les vues par catégorie sont en mémoire seule, mais les objets
        // partagent les références avec la cache 'all' en localStorage —
        // on persiste aussi les enrichissements là-bas pour les reloads.
        _orCategoryViews[`${tabType}_${category}`] = models;
        const existing = getOrCache(tabType);
        if (existing?.models?.length) {
            const byId = new Map(existing.models.map(em => [em.id, em]));
            let touched = false;
            for (const m of models) {
                if (byId.has(m.id)) { byId.set(m.id, m); touched = true; }
            }
            if (touched) setOrCache([...byId.values()], tabType);
        }
    }
    // Re-render si le catalogue actif est en mode image. L'état réel est stocké
    // par fournisseur dans _providerCatalogType (le flag global _catalogType
    // n'est plus utilisé par le rendu, donc le tester ici empêchait toujours le refresh).
    const activeIsImage = _activeProvider
        ? (_providerCatalogType[_activeProvider] || 'text') === 'image'
        : false;
    if (activeIsImage) renderCatalogTab();
    // Rafraîchir aussi le sélecteur de modèles si on est en mode image,
    // pour que les prix mis à jour s'affichent dans le dropdown principal.
    if (typeof populateUnifiedSelect === 'function') populateUnifiedSelect();
}

async function _loadOrModels(isImage, category = _orCategory) {
    const btn = document.getElementById('catalog-or-load');
    const modelsEl = document.getElementById('catalog-or-models');
    if (btn) { btn.disabled = true; btn.innerHTML = '<svg class="catalog-spin" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-.07-8.3"/></svg> Chargement…'; }
    if (modelsEl) modelsEl.innerHTML = '<div class="catalog-or-loading"><span class="catalog-spin-wrap"><svg class="catalog-spin" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-.07-8.3"/></svg></span> Récupération des modèles OpenRouter…</div>';

    // « Routeurs OpenRouter » est un filtre client appliqué sur le catalogue 'all'
    const fetchCategory = category === 'or-routers' ? 'all' : category;
    try {
        const params = [];
        if (isImage) params.push('output_modalities=image');
        if (fetchCategory && fetchCategory !== 'all') params.push(`category=${encodeURIComponent(fetchCategory)}`);
        const base = 'https://openrouter.ai/api/v1/models' + (params.length ? '?' + params.join('&') : '');
        const url = proxyUrl('openrouter', base);
        const res = await fetch(url, {});
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();

        const models = (data.data || []).filter(m => m.id && m.name).map(m => {
            const arch = m.architecture || {};
            const inputModalities = Array.isArray(arch.input_modalities) ? arch.input_modalities : [];
            const outputModalities = Array.isArray(arch.output_modalities) ? arch.output_modalities : [];
            // Fallback si les champs structurés sont absents : on retombe sur l'ancienne heuristique
            const modality = arch.modality || '';
            // Classement par modalité primaire (premier élément) : openrouter/auto a
            // outputs=["text","image"] — c'est un routeur principalement textuel, il
            // doit apparaître dans l'onglet Texte. Les générateurs d'images ont
            // outputs=["image",…] et restent classés image.
            const _isImage = outputModalities.length
                ? outputModalities[0] === 'image'
                : modality.includes('->image');
            const inp = Math.round(parseFloat(m.pricing?.prompt || 0) * 1e6 * 100) / 100;
            const out = Math.round(parseFloat(m.pricing?.completion || 0) * 1e6 * 100) / 100;
            const imgOut = _parseOrImagePrice(m.pricing);
            // Pricing détaillé OR : on stocke les champs auxiliaires utiles pour l'affichage
            // (web search, raisonnement, cache) en plus des prompt/completion principaux
            const pricingDetails = {
                request: parseFloat(m.pricing?.request) || 0,
                webSearch: parseFloat(m.pricing?.web_search) || 0,
                internalReasoning: parseFloat(m.pricing?.internal_reasoning) || 0,
                inputCacheRead: parseFloat(m.pricing?.input_cache_read) || 0,
                inputCacheWrite: parseFloat(m.pricing?.input_cache_write) || 0,
                audio: parseFloat(m.pricing?.audio) || 0
            };
            return {
                id: m.id,
                canonicalSlug: m.canonical_slug || null,
                label: m.name,
                editeur: 'openrouter',
                description: m.description || '',
                inputPer1M: inp,
                outputPer1M: out,
                imageOutput: imgOut,
                pricingDetails,
                _isImage,
                contextLength: m.context_length || null,
                created: m.created || null,
                expirationDate: m.expiration_date || null,
                knowledgeCutoff: m.knowledge_cutoff || null,
                inputModalities,
                outputModalities,
                tokenizer: arch.tokenizer || null,
                instructType: arch.instruct_type || null,
                supportedParameters: Array.isArray(m.supported_parameters) ? m.supported_parameters : [],
                defaultParameters: m.default_parameters || null,
                topProvider: m.top_provider || null,
                perRequestLimits: m.per_request_limits || null,
                isModerated: m.top_provider?.is_moderated ?? null,
                huggingFaceId: m.hugging_face_id || null
            };
        });

        // Hydrate les prix image enrichis depuis la cache dédiée AVANT cache + render :
        // /models renvoie pricing=0 sur les modèles image, mais on a peut-être déjà
        // appelé /endpoints en session précédente — pas la peine de re-flasher "Gratuit".
        if (isImage && typeof getOrImagePrices === 'function') {
            const priceMap = getOrImagePrices();
            for (const m of models) {
                if ((!m.imageOutput || m.imageOutput === 0) && priceMap[m.id] > 0) {
                    m.imageOutput = priceMap[m.id];
                }
            }
        }
        // Routage du cache :
        // - 'all' → localStorage (persisté), clé séparée pour image vs text
        // - autres catégories → mémoire seule, clé `${tabType}_${category}`
        const tabType = isImage ? 'image' : 'text';
        if (!fetchCategory || fetchCategory === 'all') {
            setOrCache(models, tabType);
        } else {
            _orCategoryViews[`${tabType}_${fetchCategory}`] = models;
        }
        // Re-render immédiat (les modèles s'affichent, prix image se mettront à jour ensuite)
        renderCatalogTab();

        // Pour les modèles image : /models renvoie pricing 0/0, le vrai image_output
        // n'est exposé que dans /endpoints. On le récupère en parallèle puis on enrichit le cache.
        if (isImage) {
            _enrichImagePricesFromEndpoints(models, tabType, category).catch(() => {});
        }

    } catch(err) {
        if (modelsEl) modelsEl.innerHTML = `<div class="catalog-or-empty" style="color:var(--error,#ef4444)">Erreur lors du chargement : ${escHtml(err.message)}</div>`;
    } finally {
        if (btn) { btn.disabled = false; btn.innerHTML = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-.07-8.3"/></svg> Actualiser'; }
    }
}

function _saveCatalogFromUI() {
    if (!_catalogPending) return;
    saveCatalogPrefs({
        disabled: [..._catalogPending.disabled],
        orEnabled: [..._catalogPending.orEnabled]
    });
    rebuildModelLists();
    populateUnifiedSelect();
    fetchLocalModels().then(() => populateUnifiedSelect());
    _setCatalogDirty(false);
}

// Note : les boutons œil, le bouton « Mettre à jour » du modèle local et le toggle
// Texte/Images sont rendus et écoutés dynamiquement par _initApiModelesPanel().
// Le bouton « Sauvegarder » du panel API et Modèles est géré dans initConfigAutoSave().

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
    });
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
    // Reset de la visibilité des champs clés API
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
    // Charger les réglages budget
    const budget = loadBudgetSettings();
    document.getElementById('budget-enabled').checked = budget.enabled;
    document.getElementById('budget-period').value = budget.period;
    document.getElementById('budget-amount').value = budget.amount || '';
    document.getElementById('budget-settings').style.display = budget.enabled ? '' : 'none';
    updateBudgetAmountSuffix();
    if (budget.enabled) updateBudgetPreview();
    _setBudgetDirty(false);
    // Activer l'onglet demandé
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

// --- Budget ---

function loadBudgetSettings() {
    try {
        const stored = localStorage.getItem('minou-budget');
        return stored ? JSON.parse(stored) : { enabled: false, period: 'month', amount: 10 };
    } catch { return { enabled: false, period: 'month', amount: 10 }; }
}

function saveBudgetSettings() {
    const enabled = document.getElementById('budget-enabled').checked;
    const period = document.getElementById('budget-period').value;
    const amount = parseFloat(document.getElementById('budget-amount').value) || 0;
    localStorage.setItem('minou-budget', JSON.stringify({ enabled, period, amount }));
}

function toggleBudgetSettings() {
    const on = document.getElementById('budget-enabled').checked;
    document.getElementById('budget-settings').style.display = on ? '' : 'none';
    if (on) updateBudgetPreview();
}

function getBudgetPeriodBounds(period) {
    const now = new Date();
    let start, end;
    if (period === 'day') {
        start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
        end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
    } else if (period === 'week') {
        // Lundi à dimanche (getDay: 0=dim, 1=lun…)
        const day = now.getDay();
        const diffToMonday = (day === 0 ? -6 : 1 - day);
        start = new Date(now.getFullYear(), now.getMonth(), now.getDate() + diffToMonday, 0, 0, 0, 0);
        end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 6, 23, 59, 59, 999);
    } else {
        // 1er au dernier jour du mois
        start = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
        end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
    }
    return { start, end };
}

function getCostForPeriod(convs, period) {
    const { start, end } = getBudgetPeriodBounds(period);
    return convs.filter(c => {
        if (!c.date) return false;
        const d = new Date(c.date);
        return d >= start && d <= end;
    }).reduce((s, c) => s + (c.cout_estime_usd || 0), 0);
}

function formatPeriodLabel(period) {
    const { start, end } = getBudgetPeriodBounds(period);
    const opts = { day: 'numeric', month: 'short' };
    const optsLong = { day: 'numeric', month: 'short', year: 'numeric' };
    if (period === 'day') {
        return start.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
    } else if (period === 'week') {
        return `${start.toLocaleDateString('fr-FR', opts)} → ${end.toLocaleDateString('fr-FR', opts)}`;
    } else {
        return start.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
    }
}

const PERIOD_LABELS = { day: "aujourd'hui", week: 'cette semaine', month: 'ce mois' };

async function updateBudgetPreview() {
    const budget = loadBudgetSettings();
    const preview = document.getElementById('budget-preview');
    if (!budget.enabled || !budget.amount || budget.amount <= 0) { preview.style.display = 'none'; return; }

    const convs = await listAllConvStats();
    const spent = getCostForPeriod(convs, budget.period);
    const pct = Math.min((spent / budget.amount) * 100, 100);
    const color = pct < 75 ? '#10b981' : pct < 100 ? '#f59e0b' : '#ef4444';

    document.getElementById('budget-period-label').textContent = formatPeriodLabel(budget.period);
    document.getElementById('budget-fill').style.width = pct + '%';
    document.getElementById('budget-fill').style.background = color;
    document.getElementById('budget-text').textContent = `$${spent.toFixed(4)} / $${budget.amount.toFixed(2)} ${PERIOD_LABELS[budget.period]} (${pct.toFixed(0)}%)`;
    preview.style.display = '';
}

function getBudgetPeriodId(period) {
    const { start } = getBudgetPeriodBounds(period);
    const pad = n => String(n).padStart(2, '0');
    const dateStr = `${start.getFullYear()}-${pad(start.getMonth() + 1)}-${pad(start.getDate())}`;
    if (period === 'day') return dateStr;
    if (period === 'month') return dateStr.slice(0, 7);
    if (period === 'week') return 'week-' + dateStr;
    return 'default';
}

async function checkBudgetAlert() {
    const budget = loadBudgetSettings();
    if (!budget.enabled || !budget.amount || budget.amount <= 0) return;

    const periodId = getBudgetPeriodId(budget.period);
    const acknowledged = localStorage.getItem('cetas-budget-ack-' + periodId);
    if (acknowledged === 'true') return;

    const convs = await listAllConvStats();
    const spent = getCostForPeriod(convs, budget.period);
    if (spent >= budget.amount) {
        document.getElementById('budget-alert-text').innerHTML = `Budget dépassé ${PERIOD_LABELS[budget.period]}<br><strong>$${spent.toFixed(2)} / $${budget.amount.toFixed(2)}</strong>`;
        document.getElementById('budget-alert-overlay').style.display = 'flex';
    }
}

document.getElementById('budget-alert-close').addEventListener('click', () => {
    const budget = loadBudgetSettings();
    const periodId = getBudgetPeriodId(budget.period);
    localStorage.setItem('cetas-budget-ack-' + periodId, 'true');
    document.getElementById('budget-alert-overlay').style.display = 'none';
});

document.getElementById('budget-enabled').addEventListener('change', toggleBudgetSettings);
function updateBudgetAmountSuffix() {
    const period = document.getElementById('budget-period').value;
    const suffix = document.getElementById('budget-amount-suffix');
    if (!suffix) return;
    const labels = { day: '/ jour', week: '/ semaine', month: '/ mois' };
    suffix.textContent = labels[period] || '/ mois';
}

document.getElementById('budget-period').addEventListener('change', () => {
    saveBudgetSettings();
    updateBudgetAmountSuffix();
    updateBudgetPreview();
});
document.getElementById('budget-amount').addEventListener('input', () => {
    saveBudgetSettings();
    updateBudgetPreview();
});

function addCostForModel(modelId, inputTokens, outputTokens, cost) {
    if (!modelId) return;
    if (!STATE.costByModel[modelId]) STATE.costByModel[modelId] = { input: 0, output: 0, cost: 0 };
    STATE.costByModel[modelId].input += inputTokens;
    STATE.costByModel[modelId].output += outputTokens;
    STATE.costByModel[modelId].cost += cost;
}

const CHART_COLORS = ['#3b82f6','#ef4444','#10b981','#f59e0b','#8b5cf6','#ec4899','#06b6d4','#f97316','#6366f1','#14b8a6'];

// Sanitise une couleur destinée à un attribut style : seules les valeurs
// hex / rgb(a) / hsl(a) / mots-clés CSS courts sont autorisées. Sinon on
// retombe sur une couleur par défaut, pour empêcher toute évasion d'attribut.
function safeCssColor(c) {
    const s = String(c || '').trim();
    if (/^#[0-9a-fA-F]{3,8}$/.test(s)) return s;
    if (/^rgba?\(\s*[\d.,\s%]+\)$/.test(s)) return s;
    if (/^hsla?\(\s*[\d.,\s%]+\)$/.test(s)) return s;
    if (/^[a-zA-Z]{1,30}$/.test(s)) return s;
    return '#888';
}

function buildBarChart(title, rows, colorFn) {
    // rows: [{ label, value, formatted }]
    if (rows.length === 0) return '';
    const max = Math.max(...rows.map(r => r.value), 0.0001);
    let html = `<div class="dashboard-chart"><div class="dashboard-chart-title">${escHtml(title)}</div><div class="dashboard-bar-chart">`;
    rows.forEach((r, i) => {
        const pct = (r.value / max) * 100;
        const color = safeCssColor(colorFn ? colorFn(r, i) : CHART_COLORS[i % CHART_COLORS.length]);
        const lbl = escHtml(r.label);
        html += `<div class="dashboard-bar-row">
            <span class="dashboard-bar-label" title="${lbl}">${lbl}</span>
            <div class="dashboard-bar-track"><div class="dashboard-bar-fill" style="width:${pct}%;background:${color}"></div></div>
            <span class="dashboard-bar-value">${escHtml(r.formatted)}</span>
        </div>`;
    });
    html += '</div></div>';
    return html;
}

function renderDashboardTab(tab) {
    if (!dashboardData) return;
    const convs = dashboardData;
    if (convs.length === 0) {
        dashboardContent.innerHTML = '<div class="dashboard-empty">Aucune conversation enregistrée.</div>';
        return;
    }
    switch (tab) {
        case 'periodes': renderPeriodes(convs); break;
        case 'conversations': renderConversations(convs.filter(c => !c.deleted)); break;
        case 'modeles': renderModeles(convs); break;
        case 'editeurs': renderEditeurs(convs); break;
        case 'categories': renderDashCategories(convs); break;
    }
}

function renderPeriodes(convs) {
    const now = new Date();
    const todayStr = now.toISOString().slice(0, 10);
    const d7 = new Date(now); d7.setDate(d7.getDate() - 7);
    const d30 = new Date(now); d30.setDate(d30.getDate() - 30);

    const periods = [
        { label: "Aujourd'hui", filter: c => c.date && c.date.slice(0, 10) === todayStr },
        { label: '7 derniers jours', filter: c => c.date && new Date(c.date) >= d7 },
        { label: '30 derniers jours', filter: c => c.date && new Date(c.date) >= d30 },
        { label: 'Total', filter: () => true }
    ];

    let html = '<table class="dashboard-table"><thead><tr><th>Période</th><th class="num">Conv.</th><th class="num">Tokens entrée</th><th class="num">Tokens sortie</th><th class="num">Coût</th></tr></thead><tbody>';
    for (const p of periods) {
        const filtered = convs.filter(p.filter);
        const tin = filtered.reduce((s, c) => s + c.tokens_entree, 0);
        const tout = filtered.reduce((s, c) => s + c.tokens_sortie, 0);
        const cost = filtered.reduce((s, c) => s + c.cout_estime_usd, 0);
        html += `<tr><td>${p.label}</td><td class="num">${filtered.length}</td><td class="num">${fmtTokens(tin)}</td><td class="num">${fmtTokens(tout)}</td><td class="num">${fmtCost(cost)}</td></tr>`;
    }
    html += '</tbody></table>';

    // Graphique par mois
    const months = {};
    for (const c of convs) {
        if (!c.date) continue;
        const key = c.date.slice(0, 7); // YYYY-MM
        if (!months[key]) months[key] = { cost: 0, count: 0 };
        months[key].cost += c.cout_estime_usd;
        months[key].count++;
    }
    const monthRows = Object.entries(months)
        .sort((a, b) => b[0].localeCompare(a[0]))
        .slice(0, 12)
        .reverse()
        .map(([m, d]) => {
            const [y, mo] = m.split('-');
            const label = new Date(y, mo - 1).toLocaleDateString('fr-FR', { month: 'short', year: 'numeric' });
            return { label, value: d.cost, formatted: fmtCost(d.cost) };
        });

    html += '<hr class="dashboard-separator">';
    html += '<div class="dashboard-charts-row">';
    html += buildBarChart('Coût par mois', monthRows);

    const monthConvRows = Object.entries(months)
        .sort((a, b) => b[0].localeCompare(a[0]))
        .slice(0, 12)
        .reverse()
        .map(([m, d]) => {
            const [y, mo] = m.split('-');
            const label = new Date(y, mo - 1).toLocaleDateString('fr-FR', { month: 'short', year: 'numeric' });
            return { label, value: d.count, formatted: String(d.count) };
        });
    html += buildBarChart('Conversations par mois', monthConvRows, () => '#10b981');
    html += '</div>';

    dashboardContent.innerHTML = html;
}

function renderConversations(convs) {
    let html = '<table class="dashboard-table"><thead><tr><th>Titre</th><th>Modèle</th><th>Date</th><th class="num">Tokens</th><th class="num">Coût</th></tr></thead><tbody>';
    for (const c of convs) {
        const titre = c.titre || c.id || '—';
        const modele = (c.cost_by_model && Object.keys(c.cost_by_model).length > 0)
            ? Object.keys(c.cost_by_model).filter(m => m !== 'tts' && m !== 'stt').join(', ') || c.modele || '—'
            : (c.modele || '—');
        const date = c.date ? new Date(c.date).toLocaleDateString('fr-FR') : '—';
        const tokens = c.tokens_entree + c.tokens_sortie;
        const titreFull = escHtml(titre);
        const titreShort = escHtml(titre.length > 40 ? titre.substring(0, 37) + '...' : titre);
        html += `<tr><td title="${titre.length > 40 ? titreFull : ''}">${titreShort}</td><td>${escHtml(modele)}</td><td>${escHtml(date)}</td><td class="num">${fmtTokens(tokens)}</td><td class="num">${fmtCost(c.cout_estime_usd)}</td></tr>`;
    }
    html += '</tbody></table>';

    // Top 10 par coût
    const top = [...convs].sort((a, b) => b.cout_estime_usd - a.cout_estime_usd).slice(0, 10);
    const topRows = top.map(c => ({
        label: (c.titre || c.id || '?').substring(0, 20),
        value: c.cout_estime_usd,
        formatted: fmtCost(c.cout_estime_usd)
    }));

    // Top 10 par tokens
    const topTokens = [...convs].sort((a, b) => (b.tokens_entree + b.tokens_sortie) - (a.tokens_entree + a.tokens_sortie)).slice(0, 10);
    const topTokenRows = topTokens.map(c => ({
        label: (c.titre || c.id || '?').substring(0, 20),
        value: c.tokens_entree + c.tokens_sortie,
        formatted: fmtTokens(c.tokens_entree + c.tokens_sortie)
    }));

    html += '<hr class="dashboard-separator">';
    html += '<div class="dashboard-charts-row">';
    html += buildBarChart('Top 10 — coût', topRows, () => '#ef4444');
    html += buildBarChart('Top 10 — tokens', topTokenRows, () => '#8b5cf6');
    html += '</div>';

    dashboardContent.innerHTML = html;
}

function renderModeles(convs) {
    const map = {};
    for (const c of convs) {
        if (c.cost_by_model && Object.keys(c.cost_by_model).length > 0) {
            for (const [modelId, stats] of Object.entries(c.cost_by_model)) {
                if (!map[modelId]) map[modelId] = { count: 0, tin: 0, tout: 0, cost: 0 };
                map[modelId].count++;
                map[modelId].tin += stats.input || 0;
                map[modelId].tout += stats.output || 0;
                map[modelId].cost += stats.cost || 0;
            }
        } else {
            const m = c.modele || 'inconnu';
            if (!map[m]) map[m] = { count: 0, tin: 0, tout: 0, cost: 0 };
            map[m].count++;
            map[m].tin += c.tokens_entree;
            map[m].tout += c.tokens_sortie;
            map[m].cost += c.cout_estime_usd;
        }
    }
    const rows = Object.entries(map).sort((a, b) => b[1].cost - a[1].cost);
    let html = '<table class="dashboard-table"><thead><tr><th>Modèle</th><th class="num">Conv.</th><th class="num">Tokens entrée</th><th class="num">Tokens sortie</th><th class="num">Coût</th></tr></thead><tbody>';
    for (const [model, d] of rows) {
        html += `<tr><td>${escHtml(model)}</td><td class="num">${d.count}</td><td class="num">${fmtTokens(d.tin)}</td><td class="num">${fmtTokens(d.tout)}</td><td class="num">${fmtCost(d.cost)}</td></tr>`;
    }
    html += '</tbody></table>';

    const costRows = rows.map(([m, d]) => ({ label: m, value: d.cost, formatted: fmtCost(d.cost) }));
    const convRows = rows.sort((a, b) => b[1].count - a[1].count).map(([m, d]) => ({ label: m, value: d.count, formatted: String(d.count) }));

    html += '<hr class="dashboard-separator">';
    html += '<div class="dashboard-charts-row">';
    html += buildBarChart('Coût par modèle', costRows);
    html += buildBarChart('Conversations par modèle', convRows, () => '#10b981');
    html += '</div>';

    dashboardContent.innerHTML = html;
}

function renderEditeurs(convs) {
    const map = {};
    for (const c of convs) {
        if (c.cost_by_model && Object.keys(c.cost_by_model).length > 0) {
            for (const [modelId, stats] of Object.entries(c.cost_by_model)) {
                const editeur = getModelEditeur(modelId) || getImageModelEditeur(modelId) || getSearchModelEditeur(modelId) || 'inconnu';
                if (!map[editeur]) map[editeur] = { count: 0, tin: 0, tout: 0, cost: 0 };
                map[editeur].count++;
                map[editeur].tin += stats.input || 0;
                map[editeur].tout += stats.output || 0;
                map[editeur].cost += stats.cost || 0;
            }
        } else {
            const editeur = getModelEditeur(c.modele) || getImageModelEditeur(c.modele) || getSearchModelEditeur(c.modele) || 'inconnu';
            if (!map[editeur]) map[editeur] = { count: 0, tin: 0, tout: 0, cost: 0 };
            map[editeur].count++;
            map[editeur].tin += c.tokens_entree;
            map[editeur].tout += c.tokens_sortie;
            map[editeur].cost += c.cout_estime_usd;
        }
    }
    const rows = Object.entries(map).sort((a, b) => b[1].cost - a[1].cost);
    let html = '<table class="dashboard-table"><thead><tr><th>Éditeur</th><th class="num">Conv.</th><th class="num">Tokens entrée</th><th class="num">Tokens sortie</th><th class="num">Coût</th></tr></thead><tbody>';
    for (const [editeur, d] of rows) {
        html += `<tr><td>${escHtml(editeur.charAt(0).toUpperCase() + editeur.slice(1))}</td><td class="num">${d.count}</td><td class="num">${fmtTokens(d.tin)}</td><td class="num">${fmtTokens(d.tout)}</td><td class="num">${fmtCost(d.cost)}</td></tr>`;
    }
    html += '</tbody></table>';

    const costRows = rows.map(([e, d]) => ({ label: e.charAt(0).toUpperCase() + e.slice(1), value: d.cost, formatted: fmtCost(d.cost) }));
    const convRows = [...rows].sort((a, b) => b[1].count - a[1].count).map(([e, d]) => ({ label: e.charAt(0).toUpperCase() + e.slice(1), value: d.count, formatted: String(d.count) }));

    html += '<hr class="dashboard-separator">';
    html += '<div class="dashboard-charts-row">';
    html += buildBarChart('Coût par éditeur', costRows);
    html += buildBarChart('Conversations par éditeur', convRows, () => '#f59e0b');
    html += '</div>';

    dashboardContent.innerHTML = html;
}

function renderDashCategories(convs) {
    const cats = listCategories();
    const map = {};
    // Initialiser avec toutes les catégories existantes
    for (const cat of cats) {
        map[cat.id] = { nom: cat.nom, icone: cat.icone, couleur: cat.couleur, count: 0, tin: 0, tout: 0, cost: 0 };
    }
    map['_none'] = { nom: 'Non classées', icone: '—', couleur: '#888', count: 0, tin: 0, tout: 0, cost: 0 };

    for (const c of convs) {
        const key = c.category || '_none';
        if (!map[key]) { map[key] = { nom: key, icone: '?', couleur: '#888', count: 0, tin: 0, tout: 0, cost: 0 }; }
        map[key].count++;
        map[key].tin += c.tokens_entree;
        map[key].tout += c.tokens_sortie;
        map[key].cost += c.cout_estime_usd;
    }

    const rows = Object.entries(map).sort((a, b) => b[1].cost - a[1].cost);
    let html = '<table class="dashboard-table"><thead><tr><th>Catégorie</th><th class="num">Conv.</th><th class="num">Tokens entrée</th><th class="num">Tokens sortie</th><th class="num">Coût</th></tr></thead><tbody>';
    for (const [, d] of rows) {
        html += `<tr><td>${escHtml(d.icone)} ${escHtml(d.nom)}</td><td class="num">${d.count}</td><td class="num">${fmtTokens(d.tin)}</td><td class="num">${fmtTokens(d.tout)}</td><td class="num">${fmtCost(d.cost)}</td></tr>`;
    }
    html += '</tbody></table>';

    const costRows = rows.map(([, d]) => ({ label: d.icone + ' ' + d.nom, value: d.cost, formatted: fmtCost(d.cost), color: d.couleur }));
    const convRows = [...rows].sort((a, b) => b[1].count - a[1].count).map(([, d]) => ({ label: d.icone + ' ' + d.nom, value: d.count, formatted: String(d.count), color: d.couleur }));

    html += '<hr class="dashboard-separator">';
    html += '<div class="dashboard-charts-row">';
    html += buildBarChart('Coût par catégorie', costRows, (r) => r.color);
    html += buildBarChart('Conversations par catégorie', convRows, (r) => r.color);
    html += '</div>';

    dashboardContent.innerHTML = html;
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
            });
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

// --- Favoris ---
const FAV_KEY = 'cetas-favorites';

function _getFavorites() {
    try { return JSON.parse(localStorage.getItem(FAV_KEY)) || []; }
    catch { return []; }
}

function _saveFavorites(arr) {
    localStorage.setItem(FAV_KEY, JSON.stringify(arr));
}

function _isFavorite(filename) {
    return _getFavorites().includes(filename);
}

function _toggleFavorite(filename) {
    const favs = _getFavorites();
    const idx = favs.indexOf(filename);
    if (idx >= 0) favs.splice(idx, 1);
    else favs.push(filename);
    _saveFavorites(favs);
}

function renderFavList() {
    const favSection = document.getElementById('fav-section');
    const favList = document.getElementById('fav-list');
    if (!favSection || !favList) return;

    const favs = _getFavorites();
    if (favs.length === 0) {
        favSection.style.display = 'none';
        return;
    }
    favSection.style.display = '';

    // Récupérer les métadonnées depuis le manifeste
    const metas = [];
    for (const filename of favs) {
        const meta = typeof getConvMetadata === 'function' ? getConvMetadata(filename) : null;
        if (meta && !meta.deleted) metas.push(meta);
    }

    favList.innerHTML = metas.map(m => {
        const title = m.titre || m.firstMessage || m.id || m.filename;
        return `<div class="fav-item" data-filename="${escHtml(m.filename)}">
            <span class="fav-item-icon">★</span>
            <span class="fav-item-title">${escHtml(title.substring(0, 40))}</span>
            <button class="fav-item-remove" title="Retirer des favoris">×</button>
        </div>`;
    }).join('');

    // Clic sur l'item → ouvrir la conversation
    favList.querySelectorAll('.fav-item').forEach(item => {
        item.addEventListener('click', (e) => {
            if (e.target.closest('.fav-item-remove')) return;
            const filename = item.dataset.filename;
            if (filename) loadConversation(filename);
        });
    });

    // Bouton retirer
    favList.querySelectorAll('.fav-item-remove').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const filename = btn.closest('.fav-item').dataset.filename;
            _toggleFavorite(filename);
            renderFavList();
            refreshConvList();
        });
    });

    // Nettoyer les favoris orphelins (conversation supprimée)
    const validFiles = new Set(metas.map(m => m.filename));
    const cleaned = favs.filter(f => validFiles.has(f));
    if (cleaned.length !== favs.length) _saveFavorites(cleaned);
}

// --- Gestion des utilisateurs (admin uniquement) ---
function _initUserManagement() {
    const tabUsers = document.getElementById('tab-users');
    const panelUsers = document.getElementById('panel-users');
    const usersList = document.getElementById('users-list');
    const usersAddBtn = document.getElementById('users-add-btn');
    const userModalOverlay = document.getElementById('user-modal-overlay');
    const userModalTitle = document.getElementById('user-modal-title');
    const userModalUsername = document.getElementById('user-modal-username');
    const userModalEmail = document.getElementById('user-modal-email');
    const userModalPassword = document.getElementById('user-modal-password');
    const userModalRole = document.getElementById('user-modal-role');
    const userModalSave = document.getElementById('user-modal-save');
    const userModalCancel = document.getElementById('user-modal-cancel');
    const userModalDelete = document.getElementById('user-modal-delete');

    if (!tabUsers || !panelUsers) return;

    // Afficher l'onglet Utilisateurs seulement pour les admins
    if (Auth.isAdmin()) {
        tabUsers.style.display = '';
    }

    let _editingUsername = null;

    function _renderUserList() {
        if (!usersList) return;
        const users = Auth.listUsers();
        usersList.innerHTML = users.map(u => {
            const initials = (u.username || '?').substring(0, 2).toUpperCase();
            const roleClass = u.role === 'admin' ? 'admin' : 'user';
            const roleLabel = u.role === 'admin' ? 'Admin' : 'Utilisateur';
            return `<div class="user-card" data-username="${escHtml(u.username)}">
                <div class="user-card-avatar">${escHtml(initials)}</div>
                <div class="user-card-info">
                    <div class="user-card-name">${escHtml(u.username)}</div>
                    <div class="user-card-email">${escHtml(u.email)}</div>
                </div>
                <span class="user-card-badge ${roleClass}">${roleLabel}</span>
            </div>`;
        }).join('');

        // Clic sur une carte → édition
        usersList.querySelectorAll('.user-card').forEach(card => {
            card.addEventListener('click', () => {
                _editingUsername = card.dataset.username;
                const u = users.find(x => x.username === _editingUsername);
                if (!u) return;
                userModalTitle.textContent = 'Modifier l\'utilisateur';
                userModalUsername.value = u.username;
                userModalUsername.disabled = true;
                userModalEmail.value = u.email || '';
                userModalPassword.value = '';
                userModalPassword.placeholder = 'Laisser vide pour ne pas changer';
                userModalRole.value = u.role || 'user';
                userModalDelete.style.display = '';
                userModalOverlay.style.display = 'flex';
            });
        });
    }

    usersAddBtn.addEventListener('click', () => {
        _editingUsername = null;
        userModalTitle.textContent = 'Ajouter un utilisateur';
        userModalUsername.value = '';
        userModalUsername.disabled = false;
        userModalEmail.value = '';
        userModalPassword.value = '';
        userModalPassword.placeholder = 'Mot de passe';
        userModalRole.value = 'user';
        userModalDelete.style.display = 'none';
        userModalOverlay.style.display = 'flex';
    });

    userModalCancel.addEventListener('click', () => {
        userModalOverlay.style.display = 'none';
    });
    userModalOverlay.addEventListener('click', (e) => {
        if (e.target === userModalOverlay) userModalOverlay.style.display = 'none';
    });

    userModalSave.addEventListener('click', async () => {
        const username = userModalUsername.value.trim();
        const email = userModalEmail.value.trim();
        const password = userModalPassword.value;
        const role = userModalRole.value;

        if (!username) { alert('Le nom d\'utilisateur est requis.'); return; }
        if (!email) { alert('L\'email est requis.'); return; }

        try {
            if (_editingUsername) {
                // Mise à jour
                const data = { email, role };
                if (password) data.password = password;
                await Auth.updateUser(_editingUsername, data);
            } else {
                // Création
                if (!password) { alert('Le mot de passe est requis.'); return; }
                await Auth.createUser(username, email, password, role);
            }
            userModalOverlay.style.display = 'none';
            _renderUserList();
        } catch (e) {
            alert(e.message || 'Erreur lors de l\'enregistrement.');
        }
    });

    userModalDelete.addEventListener('click', async () => {
        if (!_editingUsername) return;
        if (!confirm(`Supprimer définitivement l'utilisateur "${_editingUsername}" ?`)) return;
        try {
            await Auth.deleteUser(_editingUsername);
            userModalOverlay.style.display = 'none';
            _renderUserList();
        } catch (e) {
            alert(e.message || 'Erreur lors de la suppression.');
        }
    });

    // Rendu initial
    _renderUserList();
}

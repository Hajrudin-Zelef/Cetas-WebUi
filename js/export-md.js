// --- Export Markdown / HTML ---
import { STATE } from './state.js';
import { escHtml, escHtmlAttr, safeUrl, getModelLabel } from './utils.js';

const shareBtn = document.getElementById('share-btn');
const shareMenu = document.getElementById('share-menu');
const summaryBtn = document.getElementById('summary-btn');

export function initExportHandlers() {
    if (!shareBtn || !shareMenu) return;

    // Share button toggle
    shareBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        shareMenu.classList.toggle('open');
    });

    document.addEventListener('click', (e) => {
        if (!shareMenu.contains(e.target) && e.target !== shareBtn) {
            shareMenu.classList.remove('open');
        }
    });

    // Export Markdown
    document.getElementById('share-menu-md').addEventListener('click', () => {
        shareMenu.classList.remove('open');
        if (STATE.conversationHistory.length === 0) return;

        const activeModel = STATE.currentModel || STATE.currentImageModel || STATE.currentSearchModel || 'inconnu';
        const date = STATE.conversationStartTime ? new Date(STATE.conversationStartTime).toLocaleString('fr-FR') : '';

        const displayCost = STATE.totalCost + STATE.totalImageCost + STATE.totalAudioCost;
        const costStr = displayCost > 0 ? `$${displayCost.toFixed(4)}` : '—';

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

    // Export HTML autonome
    document.getElementById('share-menu-html').addEventListener('click', () => {
        shareMenu.classList.remove('open');
        if (STATE.conversationHistory.length === 0) return;

        const activeModel = STATE.currentModel || STATE.currentImageModel || STATE.currentSearchModel || 'inconnu';
        const date = STATE.conversationStartTime ? new Date(STATE.conversationStartTime).toLocaleString('fr-FR') : '';
        const displayCost = STATE.totalCost + STATE.totalImageCost + STATE.totalAudioCost;
        const costStr = displayCost > 0 ? `$${displayCost.toFixed(4)}` : '—';
        const title = STATE.conversationTitle || 'Conversation Cetas';

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
                messagesHtml += `<div class="model-switch">─── ${escHtml(getModelLabel(msg.from))} → ${escHtml(getModelLabel(msg.to))} ───</div>`;
                continue;
            }
            const role = msg.role;
            let contentHtml = '';
            let imagesHtml = '';
            let filesHtml = '';
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
                        filesHtml += `<div class="file-chip">📄 ${escHtml(part.name || 'fichier')}</div>`;
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
<button class="theme-btn" onclick="document.body.classList.toggle('dark');localStorage.setItem('t',document.body.classList.contains('dark')?'d':'l')">☾ Thème</button>
<div class="header">
<h1>${escHtml(title)}</h1>
<div class="meta-grid">
<div class="meta-label">${usedModels.length > 1 ? 'Modèles' : 'Modèle'}</div>
<div class="meta-value">${modelsHtml || escHtml(getModelLabel(activeModel))}</div>
${date ? `<div class="meta-label">Date</div><div class="meta-value">${escHtml(date)}</div>` : ''}
<div class="meta-label">Tokens</div>
<div class="meta-value">${STATE.totalInputTokens.toLocaleString('fr-FR')} entrée · ${STATE.totalOutputTokens.toLocaleString('fr-FR')} sortie</div>
<div class="meta-label">Coût estimé</div>
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
}

export function updateExportMdBtn() {
    const show = STATE.conversationHistory.length > 0 ? '' : 'none';
    if (shareBtn) shareBtn.style.display = show;
    if (summaryBtn) summaryBtn.style.display = show;
}

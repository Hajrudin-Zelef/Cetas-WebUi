// © Marexsoft Corporation. Fondateur Kouassi Marius.
// ============================================================
// utils.js — Fonctions utilitaires pures (zéro dépendance DOM/état)
// ============================================================

/** Échappe une chaîne pour insertion dans du HTML */
export function escHtml(str) {
    return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
if (typeof window !== 'undefined') { window.escHtml = escHtml; }

/** Échappe une valeur pour un attribut HTML */

export function escHtmlAttr(s) {
    return String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
if (typeof window !== 'undefined') { window.escHtmlAttr = escHtmlAttr; }

/** Bloque les schémas dangereux dans les href */
export function safeUrl(href) {
    const s = String(href || '').trim();
    if (/^(javascript|data|vbscript):/i.test(s)) return '#';
    return s;
}

/** Vérifie si un fichier est de type texte (basé sur l'extension) */
export function isTextFile(file) {
    const TEXT_EXTENSIONS = ['.txt', '.md', '.csv', '.json', '.xml', '.svg', '.log', '.js', '.py', '.html', '.css'];
    const ext = '.' + file.name.split('.').pop().toLowerCase();
    return TEXT_EXTENSIONS.includes(ext) || file.type.startsWith('text/');
}

/** Convertit un ArrayBuffer en base64 */
export function arrayBufferToBase64(buffer) {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.length; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
}

/** Vérifie si un fichier est un PDF */
export function isPdf(file) {
    return file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
}

/** Calcule une couleur de texte (noir ou blanc) pour un fond donné */
export function textColorForBg(hex) {
    if (!hex || hex.length < 7) return '#000';
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    return luminance > 0.5 ? '#1a1a1a' : '#fff';
}

/** Récupère le label d'affichage d'un modèle */
export function getModelLabel(modelId) {
    // Cherche dans MODELS, IMAGE_MODELS, SEARCH_MODELS (globaux)
    const all = [
        ...(typeof MODELS !== 'undefined' ? MODELS : []),
        ...(typeof IMAGE_MODELS !== 'undefined' ? IMAGE_MODELS : []),
        ...(typeof SEARCH_MODELS !== 'undefined' ? SEARCH_MODELS : [])
    ];
    const found = all.find(m => m.id === modelId);
    return found ? found.label : modelId;
}

/** Formate une durée en secondes en texte lisible */
export function formatGenTime(seconds) {
    if (seconds == null || isNaN(seconds)) return '';
    if (seconds < 1) return `${Math.round(seconds * 1000)} ms`;
    if (seconds < 60) return `${seconds.toFixed(1)} s`;
    const mins = Math.floor(seconds / 60);
    const secs = Math.round(seconds % 60);
    return `${mins} min ${secs} s`;
}

/** Formate le tooltip de stats de génération */
export function formatGenTooltip(inputTokens, outputTokens, cost, genTime) {
    const parts = [];
    if (inputTokens != null) parts.push(`${inputTokens.toLocaleString()} tokens in`);
    if (outputTokens != null) parts.push(`${outputTokens.toLocaleString()} tokens out`);
    if (cost != null && cost > 0) parts.push(`$${cost.toFixed(4)}`);
    if (genTime != null) parts.push(formatGenTime(genTime));
    return parts.join(' · ');
}

/** Formate un nombre de tokens */
export function fmtTokens(n) {
    if (n == null || isNaN(n)) return '0';
    if (n < 1000) return String(n);
    if (n < 1000000) return (n / 1000).toFixed(1) + 'k';
    return (n / 1000000).toFixed(1) + 'M';
}

/** Formate un coût en dollars */
export function fmtCost(n) {
    if (n == null || isNaN(n)) return '$0.00';
    if (n < 0.01) return '$' + n.toFixed(4);
    return '$' + n.toFixed(2);
}

/** Sanitize un nom de fichier */
export function sanitizeFilename(name) {
    return String(name).replace(/[^a-zA-Z0-9à-üÀ-Ü _.,;:!?()\[\]{}+=-]/g, '_').slice(0, 200);
}

/** Extrait le texte d'un content (string ou tableau multimodal) */
export function getTextFromContent(content) {
    if (typeof content === 'string') return content;
    if (Array.isArray(content)) {
        return content
            .filter(part => part && part.type === 'text' && part.text)
            .map(part => part.text)
            .join('\n');
    }
    return '';
}

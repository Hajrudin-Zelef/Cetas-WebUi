// Marexcode — gestion de la permission active pour les outils de l'agent.
// Un seul point de vérité, utilisé à la fois par la sidebar/composer (UI)
// et par tool-search.js (point d'interception réel avant /api/exec).

const STORAGE_KEY = 'marex-permission';
const DEFAULT_PERMISSION = 'Espace Write';
const VALID = ['Read only', 'Espace Write', 'Ask permission'];

// Outils considérés comme "lecture seule" (jamais bloqués, jamais confirmés)
const READ_ONLY_TOOLS = new Set(['read', 'grep', 'ls']);
// Outils qui modifient l'état du sandbox (fichiers ou commandes shell)
const MUTATING_TOOLS = new Set(['write', 'edit', 'bash']);

export function getPermission() {
    try {
        const v = localStorage.getItem(STORAGE_KEY);
        if (v && VALID.includes(v)) return v;
    } catch (e) {}
    return DEFAULT_PERMISSION;
}

export function setPermission(value) {
    if (!VALID.includes(value)) return;
    try { localStorage.setItem(STORAGE_KEY, value); } catch (e) {}
}

/**
 * Vérifie si un outil peut s'exécuter selon la permission active.
 * - Read only      : bloque tout ce qui n'est pas Read/Grep.
 * - Espace Write    : autorise tout, sans confirmation.
 * - Ask permission  : demande confirmation avant Write/Edit/Bash.
 *
 * Retourne { allowed: true } ou { allowed: false, reason: string }.
 */
export function checkToolPermission(toolNameRaw, args) {
    const toolName = String(toolNameRaw || '').toLowerCase();
    const permission = getPermission();

    if (READ_ONLY_TOOLS.has(toolName)) {
        return { allowed: true };
    }

    if (permission === 'Read only') {
        return {
            allowed: false,
            reason: "Action bloquée : le mode « Read only » ne permet pas d'écrire, éditer ou exécuter des commandes. Passe en « Espace Write » ou « Ask permission » pour autoriser cette action."
        };
    }

    if (permission === 'Ask permission' && MUTATING_TOOLS.has(toolName)) {
        const detail = describeAction(toolName, args);
        const ok = window.confirm(
            'Marexcode veut effectuer cette action :\n\n' + detail + '\n\nAutoriser ?'
        );
        if (!ok) {
            return {
                allowed: false,
                reason: "Action refusée par l'utilisateur (mode « Ask permission »)."
            };
        }
        return { allowed: true };
    }

    // 'Espace Write' ou action non mutante : autorisé sans confirmation.
    return { allowed: true };
}

function describeAction(toolName, args) {
    args = args || {};
    if (toolName === 'write') {
        return 'Écrire dans le fichier : ' + (args.file_path || '?');
    }
    if (toolName === 'edit') {
        return 'Modifier le fichier : ' + (args.file_path || '?');
    }
    if (toolName === 'bash') {
        return 'Exécuter la commande : ' + (args.command || '?');
    }
    return toolName + ' — ' + JSON.stringify(args);
}

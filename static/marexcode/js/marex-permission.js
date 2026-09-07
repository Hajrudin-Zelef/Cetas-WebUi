// Marexcode — permissions granulaires par outil (allow/ask/deny).
// Backward-compatible avec l'ancien paramètre global 'marex-permission'
// (stocké sous 'marex-permission-rules' en JSON).

const STORAGE_KEY = 'marex-permission';
const DEFAULT_PERMISSION = 'Espace Write';
const VALID = ['Read only', 'Espace Write', 'Ask permission'];

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

const TOOLS = ['read', 'grep', 'ls', 'write', 'edit', 'bash'];
const RULES = ['allow', 'ask', 'deny'];

function legacyToDefaults(permission) {
    if (permission === 'Read only')
        return { read: 'allow', grep: 'allow', ls: 'allow', write: 'deny', edit: 'deny', bash: 'deny' };
    if (permission === 'Ask permission')
        return { read: 'allow', grep: 'allow', ls: 'allow', write: 'ask', edit: 'ask', bash: 'ask' };
    return { read: 'allow', grep: 'allow', ls: 'allow', write: 'allow', edit: 'allow', bash: 'allow' };
}

export function getRules() {
    try {
        const raw = localStorage.getItem('marex-permission-rules');
        if (raw) {
            const parsed = JSON.parse(raw);
            const base = legacyToDefaults(getPermission());
            const merged = {};
            for (const t of TOOLS) merged[t] = RULES.includes(parsed[t]) ? parsed[t] : base[t];
            return merged;
        }
    } catch (e) {}
    return legacyToDefaults(getPermission());
}

export function getRule(tool) {
    const t = String(tool || '').toLowerCase();
    return getRules()[t] || 'allow';
}

export function setRule(tool, rule) {
    const t = String(tool || '').toLowerCase();
    if (!TOOLS.includes(t) || !RULES.includes(rule)) return;
    const rules = getRules();
    rules[t] = rule;
    try { localStorage.setItem('marex-permission-rules', JSON.stringify(rules)); } catch (e) {}
}

export function isAutoAllowWorkspace() {
    try { return localStorage.getItem('marex-auto-allow') === '1'; } catch (e) {}
    return true; // default ON
}

export function setAutoAllowWorkspace(val) {
    try { localStorage.setItem('marex-auto-allow', val ? '1' : '0'); } catch (e) {}
}

export function decidePermission(toolNameRaw, rule) {
    if (rule === 'deny')
        return { allowed: false, reason: "Action bloquée : l'outil « " + String(toolNameRaw) + " » n'est pas autorisé." };
    if (rule === 'ask') return null;
    return { allowed: true };
}

export function checkToolPermission(toolNameRaw, args) {
    const toolName = String(toolNameRaw || '').toLowerCase();
    if (isAutoAllowWorkspace() && ['read', 'write', 'edit'].includes(toolName)) {
        return { allowed: true };
    }
    const decision = decidePermission(toolName, getRule(toolName));
    if (decision) return decision;
    const ok = window.confirm('Marexcode veut effectuer cette action :\n\n' + describeAction(toolName, args) + '\n\nAutoriser ?');
    if (!ok) return { allowed: false, reason: "Action refusée par l'utilisateur." };
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

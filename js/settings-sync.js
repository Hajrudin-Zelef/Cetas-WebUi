// --- Settings Sync ---
// Module ES — synchronise les paramètres utilisateur avec le serveur.
// Chaque paramètre sauvegardé en localStorage est aussi pushé côté serveur
// pour survivre au clear data / hard refresh / changement d'appareil.

// Mapping localStorage → clé settings serveur
const KEY_MAP = {
    'minou-theme':           'theme',
    'minou-budget':          'budget',
    'minou-audio-settings':  'audio',
    'cetas-quotas-alerts':   'quotas_alerts',
    'cetas-quotas-topups':   'quotas_topups',
    'minou-categories':      'categories',
    'minou-savedprompts':    'saved_prompts',
    'minou-systemprompts':   'system_prompts',
    'minou-catalog-prefs':   'catalog_prefs'
};

// Reverse map: serveur → localStorage
const REVERSE_MAP = {};
for (const [ls, srv] of Object.entries(KEY_MAP)) {
    REVERSE_MAP[srv] = ls;
}

// Debounce par clé pour éviter les rafales de requêtes
const _pending = {};
const DEBOUNCE_MS = 1000;

// ── Pull (serveur → localStorage) ──────────────────────────────────

async function syncPullSettings() {
    try {
        const token = _getToken();
        if (!token) return 0;

        const resp = await fetch('/api/settings', {
            headers: { 'Authorization': 'Bearer ' + token }
        });
        if (!resp.ok) return 0;

        const data = await resp.json();
        const settings = data.settings || {};
        if (!settings || Object.keys(settings).length === 0) return 0;

        let merged = 0;
        for (const [srvKey, srvValue] of Object.entries(settings)) {
            const lsKey = REVERSE_MAP[srvKey];
            if (!lsKey) continue;

            // Ne pas écraser si la valeur locale est plus récente
            // (l'utilisateur a peut-être modifié hors-ligne)
            const localRaw = localStorage.getItem(lsKey);
            if (localRaw !== null && localRaw !== undefined) {
                // Les deux existent — le localStorage local gagne
                // (le push planifié synchronisera vers le serveur)
                continue;
            }
            if (srvValue !== null && srvValue !== undefined) {
                localStorage.setItem(lsKey, typeof srvValue === 'string' ? srvValue : JSON.stringify(srvValue));
                merged++;
            }
        }
        return merged;
    } catch {
        // Serveur injoignable — silencieux, l'app fonctionne en local
        return 0;
    }
}

// ── Push (localStorage → serveur) ──────────────────────────────────

function syncPushSetting(lsKey, value) {
    const srvKey = KEY_MAP[lsKey];
    if (!srvKey) return;

    // Annuler le push précédent pour cette clé (debounce)
    if (_pending[lsKey]) {
        clearTimeout(_pending[lsKey]);
    }

    _pending[lsKey] = setTimeout(() => {
        delete _pending[lsKey];
        _doPush(srvKey, value);
    }, DEBOUNCE_MS);
}

async function _doPush(srvKey, value) {
    try {
        const token = _getToken();
        if (!token) return;

        // Parser la valeur si c'est du JSON stringifié
        let parsed = value;
        if (typeof value === 'string') {
            try { parsed = JSON.parse(value); } catch { /* garder tel quel */ }
        }

        const payload = {};
        payload[srvKey] = parsed;

        await fetch('/api/settings', {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + token
            },
            body: JSON.stringify(payload)
        });
    } catch {
        // Silencieux — le localStorage fait office de fallback
    }
}

// ── Push toutes les settings d'un coup ─────────────────────────────

async function syncPushAll() {
    try {
        const token = _getToken();
        if (!token) return;

        const payload = {};
        for (const [lsKey, srvKey] of Object.entries(KEY_MAP)) {
            const raw = localStorage.getItem(lsKey);
            if (raw === null || raw === undefined) continue;
            let parsed = raw;
            try { parsed = JSON.parse(raw); } catch { /* garder tel quel */ }
            payload[srvKey] = parsed;
        }

        if (Object.keys(payload).length === 0) return;

        await fetch('/api/settings', {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + token
            },
            body: JSON.stringify(payload)
        });
    } catch {
        // Silencieux
    }
}

// ── Helpers ─────────────────────────────────────────────────────────

function _getToken() {
    if (typeof Auth !== 'undefined' && Auth.getToken) {
        return Auth.getToken();
    }
    return null;
}

// Exposer sur window pour que les modules ES (budget, quotas, theme…)
// puissent appeler syncPushSetting sans import circulaire.
window._syncPushSetting = syncPushSetting;
window._syncPullSettings = syncPullSettings;
window._syncPushAll = syncPushAll;

export { syncPullSettings, syncPushSetting, syncPushAll };

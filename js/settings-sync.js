// Sync paramètres utilisateur — © Marexsoft Corporation. Fondateur Kouassi Marius.
// Pull au login, push debounced 1s après chaque modif localStorage.

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

const REVERSE_MAP = {};
for (const [ls, srv] of Object.entries(KEY_MAP)) REVERSE_MAP[srv] = ls;

const _pending = {};
const DEBOUNCE_MS = 1000;

async function syncPullSettings() {
    try {
        const token = _getToken();
        if (!token) return 0;

        const resp = await fetch('/api/settings', { headers: { 'Authorization': 'Bearer ' + token } });
        if (!resp.ok) return 0;

        const data = await resp.json();
        const settings = data.settings || {};
        if (!settings || Object.keys(settings).length === 0) return 0;

        let merged = 0;
        for (const [srvKey, srvValue] of Object.entries(settings)) {
            const lsKey = REVERSE_MAP[srvKey];
            if (!lsKey) continue;
            // Ne pas écraser si la valeur locale existe déjà
            if (localStorage.getItem(lsKey) !== null) continue;
            if (srvValue !== null && srvValue !== undefined) {
                localStorage.setItem(lsKey, typeof srvValue === 'string' ? srvValue : JSON.stringify(srvValue));
                merged++;
            }
        }
        return merged;
    } catch { return 0; }
}

function syncPushSetting(lsKey, value) {
    const srvKey = KEY_MAP[lsKey];
    if (!srvKey) return;
    if (_pending[lsKey]) clearTimeout(_pending[lsKey]);
    _pending[lsKey] = setTimeout(() => { delete _pending[lsKey]; _doPush(srvKey, value); }, DEBOUNCE_MS);
}

async function _doPush(srvKey, value) {
    try {
        const token = _getToken();
        if (!token) return;
        let parsed = value;
        if (typeof value === 'string') { try { parsed = JSON.parse(value); } catch {} }
        await fetch('/api/settings', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
            body: JSON.stringify({ [srvKey]: parsed })
        });
    } catch {}
}

async function syncPushAll() {
    try {
        const token = _getToken();
        if (!token) return;
        const payload = {};
        for (const [lsKey, srvKey] of Object.entries(KEY_MAP)) {
            const raw = localStorage.getItem(lsKey);
            if (raw === null) continue;
            let parsed = raw;
            try { parsed = JSON.parse(raw); } catch {}
            payload[srvKey] = parsed;
        }
        if (Object.keys(payload).length === 0) return;
        await fetch('/api/settings', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
            body: JSON.stringify(payload)
        });
    } catch {}
}

function _getToken() {
    if (typeof Auth !== 'undefined' && Auth.getToken) return Auth.getToken();
    return null;
}

window._syncPushSetting = syncPushSetting;
window._syncPullSettings = syncPullSettings;
window._syncPushAll = syncPushAll;

export { syncPullSettings, syncPushSetting, syncPushAll };

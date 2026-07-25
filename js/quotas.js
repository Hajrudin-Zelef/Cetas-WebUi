// Quotas d'utilisation — © Marexsoft Corporation. Fondateur Kouassi Marius.
// Fetch crédits API (OpenRouter, DeepSeek) via proxy + alertes.

const CACHE_KEY = 'cetas-quotas';
const ALERTS_KEY = 'cetas-quotas-alerts';
const TOPUP_KEY = 'cetas-quotas-topups';
const CACHE_TTL_MS = 5 * 60 * 1000;

const DBG = false;
const debugLog = (...args) => { if (DBG) console.log(...args); };

const QUOTA_PROVIDERS = [
    {
        id: 'openrouter',
        name: 'OpenRouter',
        icon: 'images/OpenRouter.svg',
        endpoint: 'https://openrouter.ai/api/v1/auth/key',
        parseResponse: (data) => {
            debugLog('[Quotas] OpenRouter raw:', JSON.stringify(data));
            // OpenRouter: { data: { usage, limit (null si pas de limite) } }
            // Pas de champ "credits" — on dérive credits = limit - usage
            const d = data && data.data ? data.data : null;
            if (!d) return null;
            const usage = typeof d.usage === 'number' ? d.usage : parseFloat(d.usage);
            if (isNaN(usage) && d.usage === undefined) return null;
            const limit = d.limit !== undefined && d.limit !== null ? (typeof d.limit === 'number' ? d.limit : parseFloat(d.limit)) : null;
            const credits = limit !== null ? Math.max(0, limit - usage) : null;
            return { credits, usage: isNaN(usage) ? null : usage, limit };
        },
        hasBalanceApi: true
    },
    {
        id: 'deepseek',
        name: 'DeepSeek',
        icon: 'images/DeepSeek.svg',
        endpoint: 'https://api.deepseek.com/user/balance',
        parseResponse: (data) => {
            debugLog('[Quotas] DeepSeek raw:', JSON.stringify(data));
            const infos = data && data.balance_infos ? data.balance_infos : null;
            if (!infos || !infos.length) {
                // Fallback ancien format { balance, balance_io, total_topup }
                if (data && data.balance !== undefined) {
                    const credits = parseFloat(data.balance);
                    const usage = data.balance_io !== undefined ? parseFloat(data.balance_io) : null;
                    const limit = data.total_topup !== undefined ? parseFloat(data.total_topup) : null;
                    if (!isNaN(credits)) return { credits, usage, limit };
                }
                return null;
            }
            const b = infos[0];
            const total = parseFloat(b.total_balance);
            const toppedUp = parseFloat(b.topped_up_balance) || 0;
            const granted = parseFloat(b.granted_balance) || 0;
            if (isNaN(total)) return null;
            const spent = Math.max(0, toppedUp + granted - total);
            return { credits: total, usage: spent > 0 ? spent : null, limit: (toppedUp + granted) > 0 ? (toppedUp + granted) : null };
        },
        hasBalanceApi: true
    }
];

const NO_API_PROVIDERS = [
    { id: 'google', name: 'Google Gemini', icon: 'images/Google.svg', url: 'https://console.cloud.google.com/billing' },
    { id: 'openai', name: 'OpenAI', icon: 'images/OpenAI.svg', url: 'https://platform.openai.com/usage' },
    { id: 'anthropic', name: 'Anthropic', icon: 'images/Anthropic.svg', url: 'https://console.anthropic.com/' },
    { id: 'mistral', name: 'Mistral', icon: 'images/Mistral.svg', url: 'https://console.mistral.ai/' },
    { id: 'grok', name: 'Grok (xAI)', icon: 'images/Grok.svg', url: 'https://console.x.ai/' },
    { id: 'groq', name: 'Groq', icon: 'images/Groq.svg', url: 'https://console.groq.com/' },
    { id: 'perplexity', name: 'Perplexity', icon: 'images/Perplexity.svg', url: 'https://www.perplexity.ai/settings' },
    { id: 'nvidia', name: 'Nvidia', icon: 'images/Nvidia.svg', url: 'https://build.nvidia.com/' },
    { id: 'zai', name: 'Z.ai', icon: 'images/Zai.svg', url: 'https://platform.z.ai/' },
    { id: 'cabreras', name: 'Cabreras', icon: 'images/Cabreras.svg', url: '#' }
];

function loadCachedQuotas() {
    try { const raw = localStorage.getItem(CACHE_KEY); return raw ? JSON.parse(raw) : {}; }
    catch { return {}; }
}

function saveCachedQuotas(data) {
    try { localStorage.setItem(CACHE_KEY, JSON.stringify(data)); }
    catch { /* quota localStorage dépassé */ }
}

function isCacheFresh(providerId) {
    const cache = loadCachedQuotas();
    const entry = cache[providerId];
    if (!entry || !entry.updatedAt) return false;
    return (Date.now() - entry.updatedAt) < CACHE_TTL_MS;
}

function loadAlertSettings() {
    try {
        const raw = localStorage.getItem(ALERTS_KEY);
        return raw ? JSON.parse(raw) : { openrouter: { enabled: true, threshold: 5 }, deepseek: { enabled: true, threshold: 2 } };
    } catch { return {}; }
}

function saveAlertSettings(settings) {
    try {
        localStorage.setItem(ALERTS_KEY, JSON.stringify(settings));
        if (window._syncPushSetting) window._syncPushSetting(ALERTS_KEY, JSON.stringify(settings));
    } catch {}
}

function loadTopUps() {
    try { const raw = localStorage.getItem(TOPUP_KEY); return raw ? JSON.parse(raw) : {}; }
    catch { return {}; }
}

function saveTopUp(providerId, amount) {
    const tops = loadTopUps();
    if (amount === null || amount === '' || isNaN(amount)) {
        delete tops[providerId];
    } else {
        tops[providerId] = parseFloat(amount);
    }
    try {
        if (Object.keys(tops).length === 0) localStorage.removeItem(TOPUP_KEY);
        else localStorage.setItem(TOPUP_KEY, JSON.stringify(tops));
        if (window._syncPushSetting) window._syncPushSetting(TOPUP_KEY, JSON.stringify(tops));
    } catch {}
}

function deriveCredits(apiData, topUps) {
    if (!apiData) return apiData;
    if (apiData.credits !== null && apiData.credits !== undefined) return apiData;
    const topUp = topUps[apiData._provider] || null;
    const usage = apiData.usage;
    if (topUp !== null && usage !== null) {
        return { ...apiData, credits: Math.max(0, topUp - usage), limit: topUp, _topUp: topUp };
    }
    return { ...apiData, _topUp: topUp };
}

function isAlertAcknowledged(providerId) {
    const today = new Date().toISOString().slice(0, 10);
    return localStorage.getItem(`cetas-quota-ack-${providerId}-${today}`) === 'true';
}

function acknowledgeAlert(providerId) {
    const today = new Date().toISOString().slice(0, 10);
    localStorage.setItem(`cetas-quota-ack-${providerId}-${today}`, 'true');
}

function showToast(message, duration = 6000) {
    let toast = document.getElementById('quota-toast');
    if (!toast) {
        toast = document.createElement('div');
        toast.id = 'quota-toast';
        toast.className = 'quota-toast';
        toast.setAttribute('role', 'status');
        toast.setAttribute('aria-live', 'polite');
        document.body.appendChild(toast);
    }
    toast.textContent = message;
    toast.style.display = '';
    toast.style.animation = 'none';
    void toast.offsetWidth;
    toast.style.animation = '';
    clearTimeout(toast._timeout);
    toast._timeout = setTimeout(() => { toast.style.display = 'none'; }, duration);
}

async function fetchQuota(provider) {
    try {
        const url = window.proxyUrl
            ? window.proxyUrl(provider.id, provider.endpoint)
            : `/api/proxy/${provider.id}${new URL(provider.endpoint).pathname}`;
        const headers = window.proxyHeaders ? window.proxyHeaders(provider.id, {}) : {};

        debugLog(`[Quotas] Fetch ${provider.id}:`, url);
        const resp = await fetch(url, { headers, signal: AbortSignal.timeout(10000) });
        if (!resp.ok) {
            const text = await resp.text().catch(() => '');
            console.warn(`[Quotas] ${provider.id} HTTP ${resp.status} — ${text.slice(0, 100).replace(/sk-[a-zA-Z0-9\-]+/g, 'sk-***')}`);
            throw new Error(`HTTP ${resp.status}`);
        }
        const data = await resp.json();
        debugLog(`[Quotas] ${provider.id} response keys:`, Object.keys(data));
        const parsed = provider.parseResponse(data);
        if (!parsed) {
            console.warn(`[Quotas] ${provider.id} parse failed — expected format mismatch`);
            throw new Error('Format de réponse invalide');
        }
        return { ...parsed, updatedAt: Date.now(), error: null };
    } catch (err) {
        console.warn(`[Quotas] Erreur fetch ${provider.id}:`, err.message);
        return { credits: null, usage: null, limit: null, updatedAt: Date.now(), error: err.message };
    }
}

function formatRelativeTime(timestamp) {
    if (!timestamp) return '';
    const diff = Math.floor((Date.now() - timestamp) / 1000);
    if (diff < 5) return 'À l\'instant';
    if (diff < 60) return `Il y a ${diff}s`;
    if (diff < 3600) return `Il y a ${Math.floor(diff / 60)}min`;
    return `Il y a ${Math.floor(diff / 3600)}h`;
}

function renderQuotaCard(provider, data, alertSettings) {
    const hasData = data && !data.error && (data.credits != null || data.usage != null);
    const credits = hasData ? data.credits : null;
    const usage = hasData ? data.usage : null;
    const limit = hasData ? data.limit : null;

    let pct = null;
    let statusColor = '#10b981';
    let statusLabel = 'OK';
    if (hasData && limit !== null && credits !== null) {
        pct = Math.min(((limit - credits) / limit) * 100, 100);
        if (pct >= 90) { statusColor = '#ef4444'; statusLabel = 'Bas'; }
        else if (pct >= 75) { statusColor = '#f59e0b'; statusLabel = 'Moyen'; }
    } else if (hasData && credits !== null) {
        const threshold = alertSettings[provider.id]?.threshold ?? 5;
        if (credits <= threshold) { statusColor = '#ef4444'; statusLabel = 'Bas'; }
        else if (credits <= threshold * 3) { statusColor = '#f59e0b'; statusLabel = 'Moyen'; }
    }

    const iconSrc = provider.icon || '';
    const iconHtml = iconSrc.endsWith('.svg')
        ? `<img class="quota-provider-icon" src="${iconSrc}" alt="${provider.name}" onerror="this.style.display='none'">`
        : `<span class="quota-provider-icon-fallback">📡</span>`;

    let bodyHtml = '';
    if (data && data.error) {
        bodyHtml = `
            <div class="quota-error">
                <span class="quota-error-icon">⚠️</span>
                <span class="quota-error-text">Erreur: ${window.escHtml ? window.escHtml(data.error) : data.error}</span>
            </div>`;
    } else if (hasData) {
        const statsHtml = [];
        if (credits !== null) {
            statsHtml.push(`<div class="quota-stat">
                <span class="quota-stat-label">Crédits restants</span>
                <span class="quota-stat-value quota-credits" style="color:${statusColor}">$${credits.toFixed(2)}</span>
            </div>`);
        }
        if (usage !== null) {
            statsHtml.push(`<div class="quota-stat">
                <span class="quota-stat-label">${credits === null ? 'Total dépensé' : 'Utilisé'}</span>
                <span class="quota-stat-value">$${usage.toFixed(2)}</span>
            </div>`);
        }
        if (limit !== null) {
            statsHtml.push(`<div class="quota-stat">
                <span class="quota-stat-label">Limite</span>
                <span class="quota-stat-value">$${limit.toFixed(2)}</span>
            </div>`);
        }

        const progressHtml = pct !== null ? `
            <div class="quota-progress-bar">
                <div class="quota-progress-fill" style="width:${pct}%;background:${statusColor}"></div>
            </div>
            <p class="quota-progress-text">${pct.toFixed(0)}% utilisé</p>
        ` : (limit === null && credits === null ? `<p class="quota-progress-text">Aucune limite définie — suivi basé sur l'usage</p>` : `<p class="quota-progress-text">Pas de limite configurée</p>`);

        bodyHtml = `<div class="quota-stats">${statsHtml.join('')}</div>${progressHtml}`;
    } else {
        bodyHtml = `<p class="quota-loading">Chargement...</p>`;
    }

    const alertCfg = alertSettings[provider.id] || { enabled: false, threshold: 5 };
    const isLow = hasData && credits !== null && alertCfg.enabled && credits <= alertCfg.threshold;
    const topUps = loadTopUps();
    const currentTopUp = topUps[provider.id] || '';
    const needsTopUp = hasData && credits === null;

    const footerHtml = `
        <div class="quota-footer-grid">
            <label class="quota-alert-row">
                <span class="quota-alert-label">💰 Recharge</span>
                <input type="number" class="quota-topup-input" data-provider="${provider.id}" value="${currentTopUp}" min="0" step="1" placeholder="Ex: 10" style="width:64px"> $
            </label>
            ${needsTopUp ? `<span class="quota-topup-hint">Recharge − dépensé = crédits</span>` : (currentTopUp ? `<span class="quota-topup-hint">Override manuel actif</span>` : '')}
            <label class="quota-alert-row">
                <input type="checkbox" class="quota-alert-toggle" data-provider="${provider.id}" ${alertCfg.enabled ? 'checked' : ''}>
                <span class="quota-alert-label">Alerte si &lt; </span>
                <input type="number" class="quota-alert-threshold" data-provider="${provider.id}" value="${alertCfg.threshold}" min="0" step="1" style="width:56px"> $
            </label>
        </div>`;

    return `
        <div class="quota-card ${hasData ? '' : 'quota-card--loading'} ${isLow ? 'quota-card--low' : ''}" data-provider="${provider.id}">
            <div class="quota-card-header">
                ${iconHtml}
                <span class="quota-provider-name">${provider.name}</span>
                <span class="quota-status-dot" style="background:${data && !data.error ? statusColor : '#9ca3af'}" title="${statusLabel}"></span>
                <span class="quota-updated">${formatRelativeTime(data?.updatedAt)}</span>
            </div>
            <div class="quota-card-body">${bodyHtml}</div>
            <div class="quota-card-footer">${footerHtml}</div>
        </div>`;
}

function renderNoApiCard(provider) {
    return `
        <div class="quota-card quota-card--unavailable" data-provider="${provider.id}">
            <div class="quota-card-header">
                <img class="quota-provider-icon" src="${provider.icon}" alt="${provider.name}" onerror="this.style.display='none'">
                <span class="quota-provider-name">${provider.name}</span>
                <span class="quota-unavailable-badge">Non disponible</span>
            </div>
            <div class="quota-card-body">
                <p class="quota-unavailable-text">Ce fournisseur n'expose pas d'API publique pour consulter les crédits restants.</p>
                ${provider.url && provider.url !== '#' ? `<a class="quota-dashboard-link" href="${provider.url}" target="_blank" rel="noopener">Voir le dashboard →</a>` : ''}
            </div>
        </div>`;
}

let _renderVersion = 0;

async function fetchAndRenderQuotas() {
    const list = document.getElementById('quotas-list');
    if (!list) return;

    // Anti race-condition : seul le dernier appel écrit dans le DOM
    const myVersion = ++_renderVersion;

    const alertSettings = loadAlertSettings();
    const cache = loadCachedQuotas();
    const topUps = loadTopUps();
    const enriched = (id, d) => d ? deriveCredits({ ...d, _provider: id }, topUps) : null;

    if (myVersion === _renderVersion) {
        list.innerHTML = QUOTA_PROVIDERS.map(p => renderQuotaCard(p, enriched(p.id, cache[p.id]), alertSettings)).join('')
            + NO_API_PROVIDERS.map(p => renderNoApiCard(p)).join('');
        attachListeners();
    }

    const results = await Promise.all(QUOTA_PROVIDERS.map(async (p) => {
        if (isCacheFresh(p.id)) return { provider: p, data: enriched(p.id, cache[p.id]) };
        const data = await fetchQuota(p);
        if (data && !data.error) cache[p.id] = { ...data, _provider: p.id };
        else if (data && data.error && cache[p.id]) cache[p.id] = { ...cache[p.id], error: data.error, updatedAt: Date.now() };
        else if (data && data.error) cache[p.id] = { ...data, _provider: p.id };
        return { provider: p, data: enriched(p.id, cache[p.id]) };
    }));

    saveCachedQuotas(cache);

    if (myVersion === _renderVersion) {
        list.innerHTML = results.map(({ provider, data }) => renderQuotaCard(provider, data, alertSettings)).join('')
            + NO_API_PROVIDERS.map(p => renderNoApiCard(p)).join('');
        attachListeners();
        checkQuotaAlerts(results, alertSettings);
    }
}

function checkQuotaAlerts(results, alertSettings) {
    const globalAlert = document.getElementById('quotas-global-alert');
    const alerts = [];

    for (const { provider, data } of results) {
        if (!data || data.error || data.credits === null) continue;
        const cfg = alertSettings[provider.id];
        if (!cfg || !cfg.enabled) continue;
        if (data.credits <= cfg.threshold) {
            alerts.push({ provider, credits: data.credits, threshold: cfg.threshold });
        }
    }

    for (const alert of alerts) {
        if (!isAlertAcknowledged(alert.provider.id)) {
            showToast(`⚠️ ${alert.provider.name}: crédits bas ($${alert.credits.toFixed(2)} restants, seuil $${alert.threshold.toFixed(2)})`, 6000);
            acknowledgeAlert(alert.provider.id);
        }
    }

    if (globalAlert) {
        if (alerts.length > 0) {
            const names = alerts.map(a => `<strong>${a.provider.name}</strong> ($${a.credits.toFixed(2)})`).join(', ');
            globalAlert.innerHTML = `⚠️ Crédits bas : ${names}. <a class="quota-alert-recharge-link" href="#" id="quota-alert-dismiss">Compris</a>`;
            globalAlert.style.display = '';
            document.getElementById('quota-alert-dismiss')?.addEventListener('click', (e) => {
                e.preventDefault();
                globalAlert.style.display = 'none';
            });
        } else {
            globalAlert.style.display = 'none';
        }
    }
}

function attachListeners() {
    document.querySelectorAll('.quota-alert-toggle').forEach(toggle => {
        toggle.removeEventListener('change', onAlertToggleChange);
        toggle.addEventListener('change', onAlertToggleChange);
    });
    document.querySelectorAll('.quota-alert-threshold').forEach(input => {
        input.removeEventListener('change', onAlertThresholdChange);
        input.addEventListener('change', onAlertThresholdChange);
    });
    document.querySelectorAll('.quota-topup-input').forEach(input => {
        input.removeEventListener('input', onTopUpChange);
        input.addEventListener('input', onTopUpChange);
    });
}

function onTopUpChange(e) {
    const providerId = e.target.dataset.provider;
    const value = e.target.value;
    if (value === '' || value === null) saveTopUp(providerId, null);
    else { const amount = parseFloat(value); if (!isNaN(amount) && amount >= 0) saveTopUp(providerId, amount); }
    fetchAndRenderQuotas();
}

function onAlertToggleChange(e) {
    const providerId = e.target.dataset.provider;
    const settings = loadAlertSettings();
    if (!settings[providerId]) settings[providerId] = { enabled: false, threshold: 5 };
    settings[providerId].enabled = e.target.checked;
    saveAlertSettings(settings);
    refreshAlerts();
}

function onAlertThresholdChange(e) {
    const providerId = e.target.dataset.provider;
    const value = parseFloat(e.target.value);
    if (isNaN(value) || value < 0) return;
    const settings = loadAlertSettings();
    if (!settings[providerId]) settings[providerId] = { enabled: true, threshold: 5 };
    settings[providerId].threshold = value;
    saveAlertSettings(settings);
    refreshAlerts();
}

function refreshAlerts() {
    const cache = loadCachedQuotas();
    const alertSettings = loadAlertSettings();
    const topUps = loadTopUps();
    const enriched = (id, d) => d ? deriveCredits({ ...d, _provider: id }, topUps) : null;
    checkQuotaAlerts(QUOTA_PROVIDERS.map(p => ({ provider: p, data: enriched(p.id, cache[p.id]) })), alertSettings);
}

function initQuotas() {
    const saveBtn = document.getElementById('quotas-save-btn');
    if (saveBtn) {
        saveBtn.addEventListener('click', async () => {
            if (window._syncPushAll) await window._syncPushAll();
            saveBtn.textContent = '✓ Sauvegardé';
            saveBtn.disabled = true;
            setTimeout(() => { saveBtn.textContent = 'Sauvegarder'; saveBtn.disabled = false; }, 1500);
        });
    }
    const refreshBtn = document.getElementById('quotas-refresh-btn');
    if (refreshBtn) {
        refreshBtn.addEventListener('click', () => {
            const cache = loadCachedQuotas();
            for (const key of Object.keys(cache)) { if (cache[key]) cache[key].updatedAt = 0; }
            saveCachedQuotas(cache);
            fetchAndRenderQuotas();
        });
    }
}

export { fetchAndRenderQuotas, initQuotas, checkQuotaAlerts };

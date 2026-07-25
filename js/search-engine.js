// © Marexsoft Corporation. Fondateur Kouassi Marius.
// --- Moteur de recherche web avec fallback ---
// Chaîne : SearXNG → Brave → DuckDuckGo
// Fonctions exposées : executeWebSearch, executeWebFetch

var SEARXNG_URL = '/search';  // proxied via nginx → http://127.0.0.1:8084
var SEARXNG_TIMEOUT = 5000;

// --- web_search (globale) --------------------------------------------------

async function executeWebSearch(query) {
    // 1. SearXNG
    try {
        var results = await _searchSearXNG(query);
        if (results && results.length > 0) return results;
    } catch (e) {
        console.warn('[search-engine] SearXNG échoué:', e.message);
    }

    // 2. Brave Search API (gratuit : 2000 req/mois)
    try {
        var results2 = await _searchBrave(query);
        if (results2 && results2.length > 0) return results2;
    } catch (e) {
        console.warn('[search-engine] Brave échoué:', e.message);
    }

    // 3. DuckDuckGo HTML (dernier recours)
    try {
        var results3 = await _searchDuckDuckGo(query);
        if (results3 && results3.length > 0) return results3;
    } catch (e) {
        console.warn('[search-engine] DuckDuckGo échoué:', e.message);
    }

    return [];
}

// --- web_fetch (globale) ---------------------------------------------------

async function executeWebFetch(url) {
    // Fetch direct avec extraction de texte
    try {
        var resp = await fetch(url, { signal: AbortSignal.timeout(10000) });
        if (resp.ok) {
            var html = await resp.text();
            return { title: '', content: _extractText(html) };
        }
    } catch (e) {
        console.warn('[search-engine] Fetch direct échoué:', e.message);
    }
    return null;
}

// --- Implémentations internes ---------------------------------------------

async function _searchSearXNG(query) {
    var url = SEARXNG_URL + '/?format=json&q=' + encodeURIComponent(query);
    var resp = await fetch(url, { signal: AbortSignal.timeout(SEARXNG_TIMEOUT) });
    if (!resp.ok) throw new Error('SearXNG returned ' + resp.status);
    var json = await resp.json();
    if (!json.results || !Array.isArray(json.results)) return [];
    return json.results.slice(0, 10).map(function(r) {
        return { title: r.title || '', url: r.url || '', snippet: r.content || '' };
    });
}

async function _searchBrave(query) {
    var braveKey = _getBraveKey();
    if (!braveKey) throw new Error('Pas de clé Brave API');

    var url = 'https://api.search.brave.com/res/v1/web/search?q=' + encodeURIComponent(query) + '&count=10';
    var resp = await fetch(url, {
        signal: AbortSignal.timeout(8000),
        headers: {
            'Accept': 'application/json',
            'Accept-Encoding': 'gzip',
            'X-Subscription-Token': braveKey
        }
    });
    if (!resp.ok) throw new Error('Brave returned ' + resp.status);
    var json = await resp.json();
    if (!json.web || !json.web.results) return [];
    return json.web.results.slice(0, 10).map(function(r) {
        return { title: r.title || '', url: r.url || '', snippet: r.description || '' };
    });
}

async function _searchDuckDuckGo(query) {
    // DuckDuckGo HTML — dernier recours. Bloqué CORS depuis le navigateur
    // sauf si un proxy est configuré.
    var ddgProxy = '';
    try { ddgProxy = localStorage.getItem('cetas-ddg-proxy') || ''; } catch (e) {}
    var baseUrl = ddgProxy || 'https://html.duckduckgo.com';
    var url = baseUrl + '/html/?q=' + encodeURIComponent(query);
    var resp = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!resp.ok) throw new Error('DuckDuckGo returned ' + resp.status);
    var html = await resp.text();
    return _parseDdgHtml(html);
}

function _parseDdgHtml(html) {
    var results = [];
    var resultRegex = /<a[^>]*class="result__a"[^>]*href="([^"]*)"[^>]*>([^<]*)<\/a>/gi;
    var snippetRegex = /<a[^>]*class="result__snippet"[^>]*>([\s\S]*?)<\/a>/gi;

    var urlMatches = [];
    var m;
    while ((m = resultRegex.exec(html)) !== null) { urlMatches.push(m); }

    var snippetMatches = [];
    while ((m = snippetRegex.exec(html)) !== null) { snippetMatches.push(m); }

    for (var i = 0; i < Math.min(urlMatches.length, 10); i++) {
        var url = _cleanDdgUrl(urlMatches[i][1]);
        var title = urlMatches[i][2].replace(/<[^>]*>/g, '').trim();
        var snippet = snippetMatches[i]
            ? snippetMatches[i][1].replace(/<[^>]*>/g, '').trim()
            : '';
        if (url && title) {
            results.push({ title: title, url: url, snippet: snippet });
        }
    }
    return results;
}

function _cleanDdgUrl(url) {
    var uddg = url.match(/uddg=([^&]+)/);
    if (uddg) {
        try { return decodeURIComponent(uddg[1]); } catch (e) {}
    }
    if (url.indexOf('//') === 0) return 'https:' + url.split('?')[0];
    return url.split('?')[0];
}

function _extractText(html) {
    try {
        var doc = new DOMParser().parseFromString(html, 'text/html');
        var remove = doc.querySelectorAll('script, style, nav, footer, header, [role="navigation"], .sidebar, #sidebar');
        for (var i = 0; i < remove.length; i++) { remove[i].remove(); }
        var body = doc.body;
        if (!body) return '';
        var text = body.textContent || '';
        return text.replace(/\n{3,}/g, '\n\n').trim().slice(0, 8000);
    } catch (e) {
        return html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 8000);
    }
}

function _getBraveKey() {
    try {
        if (typeof API_KEYS !== 'undefined') {
            if (API_KEYS.brave) return API_KEYS.brave;
            if (API_KEYS.brave_search) return API_KEYS.brave_search;
        }
        var stored = localStorage.getItem('cetas-brave-key');
        if (stored) return stored;
    } catch (e) {}
    return null;
}

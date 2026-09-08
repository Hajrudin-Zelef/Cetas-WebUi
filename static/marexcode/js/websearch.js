/**
 * Marexcode WebSearch — Marexcode-only module.
 *
 * Defines executeWebSearch (called by _executeToolCall in tool-search.js),
 * marexHasNativeSearch (detect if model has native search), and
 * marexInjectWebSearch (add web_search tool to MAREXCODE_TOOLS for non-native models).
 *
 * Loaded ONLY by static/marexcode/index.html — never touches Cetas chat.
 */

var MAREX_NATIVE_SEARCH_EDITORS = ['openrouter', 'opencode'];

function marexHasNativeSearch(modelId) {
    if (!modelId) return false;
    var editor = typeof getModelEditeur === 'function' ? getModelEditeur(modelId) : '';
    if (MAREX_NATIVE_SEARCH_EDITORS.indexOf(editor) >= 0) return true;
    return false;
}

window.executeWebSearch = async function(query) {
    if (!query || !query.trim()) return [];
    try {
        var headers = { 'Content-Type': 'application/json' };
        if (typeof Auth !== 'undefined' && Auth.getToken) {
            var tk = Auth.getToken();
            if (tk) headers['Authorization'] = 'Bearer ' + tk;
        }
        var resp = await fetch('/api/websearch', {
            method: 'POST',
            headers: headers,
            body: JSON.stringify({ query: query.trim(), max_results: 10 }),
            signal: AbortSignal.timeout(15000)
        });
        if (!resp.ok) return [];
        var data = await resp.json().catch(function() { return {}; });
        var results = data.results || [];
        return results.map(function(r) {
            return { title: r.title, url: r.url, description: r.description || r.snippet || '' };
        });
    } catch (e) {
        console.warn('[marex-websearch] failed:', e.message);
        return [];
    }
};

window.marexInjectWebSearch = function(modelId) {
    if (typeof MAREXCODE_TOOLS === 'undefined') return;
    var hasWsTool = MAREXCODE_TOOLS.some(function(t) {
        return t.function && t.function.name === 'web_search';
    });
    if (marexHasNativeSearch(modelId)) {
        if (hasWsTool) {
            for (var i = MAREXCODE_TOOLS.length - 1; i >= 0; i--) {
                if (MAREXCODE_TOOLS[i].function && MAREXCODE_TOOLS[i].function.name === 'web_search') {
                    MAREXCODE_TOOLS.splice(i, 1);
                }
            }
        }
    } else {
        if (!hasWsTool) {
            MAREXCODE_TOOLS.push({
                type: 'function',
                function: {
                    name: 'web_search',
                    description: 'Recherche web pour obtenir des informations actuelles. Utilise Tavily, Exa, Brave, Jina, SearXNG ou DuckDuckGo. TOUJOURS inclure les sources en markdown à la fin de ta réponse.',
                    parameters: {
                        type: 'object',
                        properties: {
                            query: { type: 'string', description: 'La requête de recherche' }
                        },
                        required: ['query']
                    }
                }
            });
        }
    }
};

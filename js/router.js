// SamAgent — Routeur intelligent multi-providers. © Marexsoft Corporation. Fondateur Kouassi Marius.
// N4 Flash : modèles OpenRouter gratuits + opencode gratuits (Rapide)
// N4       : OpenRouter payants ≤ $1.50/M + mistral (Standard)
// N8       : flagship — OpenRouter + DeepSeek direct + mistral + opencode
// Fallback : chaîne multi-fournisseurs (plus jamais 2× DeepSeek d'affilée) :
//           primary → maillon 2 (provider ≠ primary) → maillon 3 (encore différent).
//
// Architecture hybride :
//   Score ≤ 70 → algorithme regex (rapide, déterministe)
//   Score > 70 → mini-LLM (analyse sémantique fine, fallback multi-provider)
//
// Santé : chaque modèle a un score de santé EWMA + latence (localStorage).
//   - 3 échecs consécutifs ou cooldown 60s → modèle écarté temporairement.
//   - Stats présentes → tirage pondéré par la santé.
//   - Aucune stats → rotation déterministe par tier+intent (répartition équilibrée).

var ROUTER_CONFIG = {
    // ── Score 0-33 : requêtes simples, salutations, questions courtes ─
    // Nano = ultra-rapide. Groq + Google uniquement. Pas de DeepSeek.
    // Chaque intent a 2 modèles par provider → fallback cross-provider natif.
    nano: {
        chat: [
            { model: 'openai/gpt-oss-20b',                   provider: 'groq',   thinking: false },
            { model: 'openai/gpt-oss-120b',                  provider: 'groq',   thinking: false },
            { model: 'gemini-3.1-flash-lite',                provider: 'google', thinking: false },
            { model: 'gemini-3.5-flash-lite',                provider: 'google', thinking: false }
        ],
        coder: [
            { model: 'openai/gpt-oss-20b',                   provider: 'groq',   thinking: false },
            { model: 'openai/gpt-oss-120b',                  provider: 'groq',   thinking: false },
            { model: 'gemma-4-26b-a4b-it',                   provider: 'google', thinking: false },
            { model: 'gemma-4-31b-it',                       provider: 'google', thinking: false }
        ],
        raisonnement: [
            { model: 'qwen/qwen3.6-27b',                     provider: 'groq',   thinking: false },
            { model: 'openai/gpt-oss-120b',                  provider: 'groq',   thinking: false },
            { model: 'gemini-3.6-flash',                     provider: 'google', thinking: false },
            { model: 'gemini-3.1-flash-lite',                provider: 'google', thinking: false }
        ]
    },
    // ── Score 34-66 : N4 Flash (gratuit, rapide) ─
    // OpenRouter :free + modèles gratuits opencode (zen) → pas de dépendance unique.
    'n4-flash': {
        chat: [
            { model: 'google/gemma-4-31b-it:free',                   provider: 'openrouter', thinking: false },
            { model: 'nvidia/nemotron-3-super-120b-a12b:free',       provider: 'openrouter', thinking: false },
            { model: 'poolside/laguna-s-2.1:free',                   provider: 'openrouter', thinking: false },
            { model: 'inclusionai/ling-3.0-flash:free',              provider: 'openrouter', thinking: false },
            { model: 'big-pickle-zen',                               provider: 'opencode',  thinking: false },
            { model: 'mimo-v2.5-free-zen',                           provider: 'opencode',  thinking: false },
            { model: 'nemotron-3.5-lightning-free-zen',              provider: 'opencode',  thinking: false }
        ],
        coder: [
            { model: 'poolside/laguna-s-2.1:free',                   provider: 'openrouter', thinking: false },
            { model: 'cohere/north-mini-code:free',                  provider: 'openrouter', thinking: false },
            { model: 'google/gemma-4-26b-a4b-it:free',               provider: 'openrouter', thinking: false },
            { model: 'nvidia/nemotron-3-ultra-550b-a55b:free',       provider: 'openrouter', thinking: false },
            { model: 'openrouter/free',                              provider: 'openrouter', thinking: false },
            { model: 'google/gemma-4-31b-it:free',                   provider: 'openrouter', thinking: false },
            { model: 'nemotron-3-ultra-free-zen',                    provider: 'opencode',  thinking: false },
            { model: 'mimo-v2.5-free-zen',                           provider: 'opencode',  thinking: false }
        ],
        raisonnement: [
            { model: 'nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free', provider: 'openrouter', thinking: true },
            { model: 'google/gemma-4-31b-it:free',                   provider: 'openrouter', thinking: false },
            { model: 'nvidia/nemotron-3-ultra-550b-a55b:free',       provider: 'openrouter', thinking: false },
            { model: 'google/gemma-4-26b-a4b-it:free',               provider: 'openrouter', thinking: false },
            { model: 'nvidia/nemotron-3-super-120b-a12b:free',       provider: 'openrouter', thinking: false },
            { model: 'nemotron-3-ultra-free-zen',                    provider: 'opencode',  thinking: false }
        ]
    },
    // ── Score 34-66 : N4 (payant, standard) ─
    n4: {
        chat: [
            { model: 'deepseek/deepseek-v4-flash',           provider: 'openrouter', thinking: false },
            { model: 'qwen/qwen3.5-flash-02-23',             provider: 'openrouter', thinking: false },
            { model: 'mistralai/mistral-small-2603',          provider: 'openrouter', thinking: false },
            { model: 'google/gemini-2.5-flash-lite',          provider: 'openrouter', thinking: false },
            { model: 'openai/gpt-5.4-nano',                  provider: 'openrouter', thinking: false },
            { model: 'meta-llama/llama-4-maverick',           provider: 'openrouter', thinking: false },
            { model: 'mistral-small-latest',                 provider: 'mistral',   thinking: false },
            { model: 'ministral-8b-latest',                  provider: 'mistral',   thinking: false }
        ],
        coder: [
            { model: 'deepseek/deepseek-v4-pro',             provider: 'openrouter', thinking: false },
            { model: 'qwen/qwen3-coder-next',                provider: 'openrouter', thinking: false },
            { model: 'xiaomi/mimo-v2.5-pro',                 provider: 'openrouter', thinking: false },
            { model: 'qwen/qwen3.6-35b-a3b',                 provider: 'openrouter', thinking: false },
            { model: 'deepseek/deepseek-v4-flash',            provider: 'openrouter', thinking: false },
            { model: 'qwen/qwen3-coder',                     provider: 'openrouter', thinking: false },
            { model: 'mistral-medium-3-5',                   provider: 'mistral',   thinking: false }
        ],
        raisonnement: [
            { model: 'deepseek/deepseek-v4-pro',             provider: 'openrouter', thinking: true },
            { model: 'qwen/qwen3.6-35b-a3b',                 provider: 'openrouter', thinking: false },
            { model: 'nvidia/nemotron-3-super-120b-a12b',     provider: 'openrouter', thinking: false },
            { model: 'xiaomi/mimo-v2.5-pro',                 provider: 'openrouter', thinking: true },
            { model: 'deepseek/deepseek-v3.2',               provider: 'openrouter', thinking: false },
            { model: 'arcee-ai/trinity-large-thinking',      provider: 'openrouter', thinking: true },
            { model: 'mistral-medium-3-5',                   provider: 'mistral',   thinking: true }
        ]
    },
    // ── Score 67-100 : code complexe, raisonnement avancé, tâches expert ─
    // N8 = flagship. 100% 2026 (sauf r1-0528 + qwen3-max, références).
    // Chat : flash/rapide avec code+raison OK. Coder/Raiso : spécialistes.
    // DeepSeek direct + OpenRouter. Fallback croisé DS↔OR.
    n8: {
        chat: [
            { model: 'deepseek/deepseek-v4-flash',       provider: 'openrouter', thinking: false },
            { model: 'qwen/qwen3.6-flash',               provider: 'openrouter', thinking: false },
            { model: 'stepfun/step-3.7-flash',            provider: 'openrouter', thinking: false },
            { model: 'tencent/hy3',                       provider: 'openrouter', thinking: false },
            { model: 'minimax/minimax-m2.5',              provider: 'openrouter', thinking: false },
            { model: 'minimax/minimax-m3',                provider: 'openrouter', thinking: false }
        ],
        coder: [
            { model: 'deepseek-v4-pro',                   provider: 'deepseek',   thinking: false },
            { model: 'kwaipilot/kat-coder-air-v2.5',      provider: 'openrouter', thinking: false },
            { model: 'kwaipilot/kat-coder-pro-v2',        provider: 'openrouter', thinking: false },
            { model: 'qwen/qwen3.7-plus',                 provider: 'openrouter', thinking: false },
            { model: 'qwen/qwen3-max',                    provider: 'openrouter', thinking: false },
            { model: 'meituan/longcat-2.0',               provider: 'openrouter', thinking: false },
            { model: 'mistral-large-latest',              provider: 'mistral',   thinking: false }
        ],
        raisonnement: [
            { model: 'deepseek-v4-pro',                   provider: 'deepseek',   thinking: true  },
            { model: 'deepseek/deepseek-r1-0528',         provider: 'openrouter', thinking: true  },
            { model: 'qwen/qwen3-max-thinking',           provider: 'openrouter', thinking: true  },
            { model: 'inception/mercury-2',               provider: 'openrouter', thinking: true  },
            { model: 'arcee-ai/trinity-large-thinking',   provider: 'openrouter', thinking: true  },
            { model: 'nvidia/nemotron-3-ultra-550b-a55b', provider: 'openrouter', thinking: false },
            { model: 'glm-5-zen',                         provider: 'opencode',  thinking: true  }
        ]
    }
};

// ── Router LLM Pool ──────────────────────────────────────────────────
// 2 routeurs seulement : DeepSeek (crédits dispo) + Google (gratuit).
// Timeout 5s par tentative → max 10s, puis fallback regex.
// Si les 2 échouent → _pickFromPool (rotation aléatoire).
var ROUTER_LLM_POOL = [
    { model: 'deepseek-chat',                       provider: 'deepseek',   label: 'DeepSeek V3.2',           type: 'openai',  path: '/v1/chat/completions' },
    { model: 'gemini-3.1-flash-lite',               provider: 'google',     label: 'Gemini 3.1 Flash Lite (G)', type: 'google', path: '/v1beta/models/gemini-3.1-flash-lite:generateContent' }
];

// ── IA Locale (SamGen) : registre dynamique des moteurs locaux ─────────
// Le pool local n'est JAMAIS codé en dur : il est découvert via /v1/models
// des moteurs up (llamacpp / ollama / lmstudio). Swap de moteur ou de modèle
// = aucun edit de code. Le registre est mis en cache (TTL 30s) et conserve les
// moteurs vivants si un autre tombe.
var LOCAL_ENGINES = [
    { id: 'llamacpp', name: 'llama.cpp',  short: 'LLC' },
    { id: 'ollama',   name: 'Ollama',     short: 'OL'  },
    { id: 'lmstudio', name: 'LM Studio',  short: 'LMS' }
];
var _localCache = null;
var _LOCAL_TTL = 30000;

async function _probeEngineModels(engine) {
    try {
        var resp = await fetch('/api/proxy/' + engine.id + '/v1/models', {
            signal: _routerAbort(null, 2500).signal,
            headers: (typeof proxyHeaders === 'function'
                ? proxyHeaders(engine.id, { 'Content-Type': 'application/json' })
                : { 'Content-Type': 'application/json' })
        });
        if (!resp.ok) return [];
        var data = await resp.json();
        var arr = (data && data.data) || (data && data.models) || [];
        return arr.map(function(m) { return m && (m.id || m.name); }).filter(Boolean);
    } catch (e) {
        return [];
    }
}

async function refreshLocalRegistry(force) {
    if (!force && _localCache && (Date.now() - _localCache.ts) < _LOCAL_TTL) return _localCache;
    var results = await Promise.all(LOCAL_ENGINES.map(async function(engine) {
        var ids = await _probeEngineModels(engine);
        return { engine: engine, ids: ids };
    }));
    var models = [];
    results.forEach(function(r) {
        r.ids.forEach(function(id) { models.push({ model: id, provider: r.engine.id, thinking: false }); });
    });
    _localCache = { ts: Date.now(), models: models };
    return _localCache;
}

async function _localPool() {
    var reg = await refreshLocalRegistry(false);
    var pool = reg.models;
    // Ne garder que les modèles résolvables côté app (MODELS_MAP) si validateur dispo
    if (typeof window !== 'undefined' && typeof window.SAM_ROUTER_CAN_USE === 'function') {
        var resolvable = pool.filter(function(m) {
            try { return window.SAM_ROUTER_CAN_USE(m.model); } catch (e) { return true; }
        });
        if (resolvable.length) pool = resolvable;
    }
    return pool;
}

async function _routeLocal(prompt, intent, score) {
    var pool = await _localPool();
    var route = null;
    if (pool && pool.length) route = _pickFromPool(pool, 'local:' + intent);
    var localMode = !!route;
    if (!route) {
        // Aucun moteur local up/résolvable → filet cloud (réponses continuent)
        route = { model: 'deepseek-chat', provider: 'deepseek', thinking: false };
    }
    return _buildRoute(route, 'local', intent, score, pool, localMode);
}

/**
 * Construit l'objet route (label + fallback) partagé par tous les tiers.
 * @param {Object} route - {model, provider, thinking}
 * @param {string} tier - nano | n4-flash | n4 | n8 | local
 * @param {string} intent - chat | coder | raisonnement
 * @param {number} score
 * @param {Array} sourcePool - Pool effectif (filtré réflexion pour cloud, local pour local)
 * @param {boolean} [localMode] - true si le tier local a trouvé un moteur up
 */
function _buildRoute(route, tier, intent, score, sourcePool, localMode) {
    var realLabel = route.model;
    try {
        var allModels = (typeof MODELS !== 'undefined' ? MODELS : [])
            .concat(typeof IMAGE_MODELS !== 'undefined' ? IMAGE_MODELS : [])
            .concat(typeof SEARCH_MODELS !== 'undefined' ? SEARCH_MODELS : []);
        var found = allModels.find(function(m) { return m.id === route.model; });
        if (found) realLabel = found.label;
    } catch (e) {}

    var provShort = { deepseek: 'DS', google: 'G', groq: 'GQ', nvidia: 'NV', openrouter: 'OR', mistral: 'MST', opencode: 'OC', llamacpp: 'LLC', ollama: 'OL', lmstudio: 'LMS' }[route.provider] || route.provider;
    var tierLabel = { nano: 'Nano', 'n4-flash': 'N4 Flash', n4: 'N4', n8: 'N8', local: 'Local' }[tier];

    var _fallback = null;
    var _fbModelFor = {
        openrouter: 'deepseek/deepseek-v4-flash',
        deepseek: 'deepseek-v4-flash',
        mistral: 'mistral-large-latest',
        opencode: 'qwen3.7-plus-zen',
        groq: 'openai/gpt-oss-20b',
        google: 'gemini-3.1-flash-lite'
    };
    if (tier === 'local') {
        // Local : si un moteur local a servi, filet = cloud ; sinon (déjà cloud)
        // pas de fallback supplémentaire utile.
        if (localMode) {
            _fallback = { model: 'deepseek-chat', provider: 'deepseek' };
        }
    } else {
        var _universe = (tier === 'nano') ? ['groq', 'google'] : ['openrouter', 'deepseek', 'mistral', 'opencode'];
        var _chain = _universe.filter(function(p) { return p !== route.provider; });
        if (Math.random() > 0.5) _chain.reverse(); // varier l'ordre des maillons
        if (_chain.length >= 1) {
            var _p1 = _chain[0];
            var _src = sourcePool || [];
            var _cand1 = (tier !== 'nano' && _p1 === 'openrouter')
                ? _src.filter(function(m) { return m.provider === 'openrouter' && m.model !== route.model; })
                : [];
            _fallback = { model: _fbModelFor[_p1], provider: _p1 };
            if (_p1 === 'openrouter' && _cand1.length) {
                _fallback.model = _cand1[Math.floor(Math.random() * _cand1.length)].model;
            }
            if (_chain.length >= 2) {
                _fallback._nextFallback = { model: _fbModelFor[_chain[1]], provider: _chain[1] };
            }
        }
    }

    return {
        modelId: route.model,
        provider: route.provider,
        thinking: route.thinking,
        intent: intent,
        score: score,
        tier: tier,
        label: 'SamAgent ' + tierLabel + ' [' + provShort + '] → ' + realLabel,
        routedBy: route.model,
        _fallback: _fallback
    };
}

// Prompt système pour le routeur LLM — doit retourner du JSON pur
var ROUTER_LLM_SYSTEM_PROMPT = [
    'Tu es un routeur intelligent. Analyse la requête utilisateur et choisis le meilleur modèle.',
    'Tu dois répondre UNIQUEMENT avec un objet JSON de cette forme (pas de markdown, pas de texte autour) :',
    '{"model":"<id du modèle choisi>","reason":"<1 phrase expliquant le choix>"}',
    '',
    'Critères de choix :',
    '- Complexité : tâche simple → modèle flash/lite, tâche complexe → modèle pro/plus gros',
    '- Domaine : code → modèle spécialisé code, raisonnement → modèle avec thinking, conversation → modèle équilibré',
    '- Longueur : prompt court → modèle rapide, prompt long (>500 car.) → modèle grande fenêtre',
    '- Langue : détecte la langue du prompt et préfère un modèle multilingue si nécessaire'
].join('\n');

/**
 * Combine un signal d'annulation externe (stop utilisateur) avec un timeout
 * interne. Retourne { signal, cleanup }; cleanup() retire listeners + timer.
 * Le signal externe prime : si l'utilisateur annule, la requête est interrompue.
 */
function _routerAbort(externalSignal, ms) {
    var ctrl = new AbortController();
    var done = false;
    function finish() {
        if (done) return;
        done = true;
        clearTimeout(timer);
        if (externalSignal && typeof externalSignal.removeEventListener === 'function') {
            try { externalSignal.removeEventListener('abort', onExternalAbort); } catch (e) {}
        }
    }
    function onExternalAbort() {
        try { ctrl.abort(); } catch (e) {}
    }
    var timer = setTimeout(function() {
        try { ctrl.abort(); } catch (e) {}
    }, ms || 3500);
    if (externalSignal) {
        if (externalSignal.aborted) {
            try { ctrl.abort(); } catch (e) {}
        } else if (typeof externalSignal.addEventListener === 'function') {
            externalSignal.addEventListener('abort', onExternalAbort);
        }
    }
    return { signal: ctrl.signal, cleanup: finish };
}

/**
 * Construit la liste des modèles disponibles pour le routeur LLM.
 * @param {Array} pool - Le pool de modèles du tier+intent actif
 * @returns {string} Description textuelle des modèles disponibles
 */
function _buildModelListForRouter(pool) {
    return pool.map(function(m, i) {
        return (i + 1) + '. ' + m.model + ' (' + m.provider + ')' + (m.thinking ? ' [thinking]' : '');
    }).join('\n');
}

/**
 * Appelle un mini-LLM pour router une requête complexe.
 * Essaie chaque modèle du ROUTER_LLM_POOL en séquence (fallback).
 * @param {string} prompt - La requête utilisateur
 * @param {Array} targetPool - Le pool de modèles cibles (tier+intent)
 * @param {AbortSignal} [externalSignal] - Signal d'annulation (stop utilisateur)
 * @returns {Promise<Object|null>} {modelId, provider, thinking, ...} ou null
 */
async function callRouterLLM(prompt, targetPool, externalSignal) {
    var modelList = _buildModelListForRouter(targetPool);
    var userMessage = [
        '**Modèles disponibles :**',
        modelList,
        '',
        '**Requête utilisateur :**',
        prompt,
        '',
        'Choisis le meilleur modèle. Réponds UNIQUEMENT avec le JSON.'
    ].join('\n');
    // Lance tous les router LLM EN PARALLÈLE (au lieu d'en séquence) et prend
    // la première réponse valide qui arrive. Le perdant est annulé dès le 1er
    // succès (AbortController partagé) → pas de coût/latence pour rien.
    // Avant : pire cas = 5s + 5s = 10s. Maintenant : ≈ timeout d'une tentative.
    var _share = new AbortController();
    var _onUserAbort = function() { try { _share.abort(); } catch (e) {} };
    if (externalSignal) {
        if (externalSignal.aborted) { try { _share.abort(); } catch (e) {} }
        else if (typeof externalSignal.addEventListener === 'function') {
            externalSignal.addEventListener('abort', _onUserAbort);
        }
    }
    function _tryRouter(routerModel) {
        return (async function() {
            console.log('[Router LLM] tentative parallèle avec ' + routerModel.label + ' (' + routerModel.provider + ')');
            var response = await _fetchRouterLLM(routerModel, userMessage, _share.signal);
            var jsonStr = response.trim();
            jsonStr = jsonStr.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
            var parsed = JSON.parse(jsonStr);
            if (!parsed.model) throw new Error('JSON sans champ "model"');
            var chosen = null;
            for (var j = 0; j < targetPool.length; j++) {
                if (targetPool[j].model === parsed.model) {
                    chosen = targetPool[j];
                    break;
                }
            }
            if (!chosen) {
                console.warn('[Router LLM] modèle ' + parsed.model + ' hors pool → fallback 1er du pool');
                chosen = targetPool[0];
            }
            console.log('[Router LLM] ✓ choisi ' + chosen.model + ' (' + chosen.provider + ') via ' + routerModel.label + ' — raison: ' + (parsed.reason || 'N/A'));
            return chosen;
        })();
    }
    try {
        var _won = await Promise.any(ROUTER_LLM_POOL.map(_tryRouter));
        try { _share.abort(); } catch (e) {} // annule les routeurs perdants
        if (externalSignal && typeof externalSignal.removeEventListener === 'function') {
            try { externalSignal.removeEventListener('abort', _onUserAbort); } catch (e) {}
        }
        return _won;
    } catch (aggregateErr) {
        if (externalSignal && typeof externalSignal.removeEventListener === 'function') {
            try { externalSignal.removeEventListener('abort', _onUserAbort); } catch (e) {}
        }
        console.warn("[Router LLM] tous les routeurs LLM ont échoué → fallback rotation");
        return null;
    }
}

/**
 * Appelle un modèle routeur via le proxy (requête non-streaming).
 * Supporte les providers OpenAI-compatible ET Google (Gemini format).
 * @param {Object} routerModel - {model, provider, label, type}
 * @param {string} userMessage - Le message à envoyer
 * @param {AbortSignal} [externalSignal] - Signal d'annulation (stop utilisateur)
 * @returns {Promise<string>} La réponse texte du LLM
 */
async function _fetchRouterLLM(routerModel, userMessage, externalSignal) {
    var isGoogle = routerModel.type === 'google';
    var composed = _routerAbort(externalSignal, 3500);

    var body, upstreamPath;
    if (isGoogle) {
        // Google: format Gemini
        upstreamPath = routerModel.path || ('/v1beta/models/' + routerModel.model + ':generateContent');
        body = {
            systemInstruction: {
                parts: [{ text: ROUTER_LLM_SYSTEM_PROMPT }]
            },
            contents: [{
                role: 'user',
                parts: [{ text: userMessage }]
            }],
            generationConfig: {
                maxOutputTokens: 256,
                temperature: 0.1
            }
        };
    } else {
        // OpenAI-compatible: DeepSeek, Groq, Nvidia, OpenRouter
        upstreamPath = routerModel.path || '/v1/chat/completions';
        body = {
            model: routerModel.model,
            messages: [
                { role: 'system', content: ROUTER_LLM_SYSTEM_PROMPT },
                { role: 'user', content: userMessage }
            ],
            max_tokens: 256,
            temperature: 0.1,
            stream: false
        };
    }

    var proxyPath = '/api/proxy/' + routerModel.provider + upstreamPath;
    try {
        var resp = await fetch(proxyPath, {
            method: 'POST',
            headers: (typeof proxyHeaders === 'function' ? proxyHeaders(routerModel.provider, { 'Content-Type': 'application/json' }) : { 'Content-Type': 'application/json' }),
            body: JSON.stringify(body),
            signal: composed.signal
        });

        if (!resp.ok) {
            var errText = await resp.text().catch(function() { return ''; });
            throw new Error('HTTP ' + resp.status + ': ' + errText.slice(0, 200));
        }

        var data = await resp.json();
        var content;
        if (isGoogle) {
            content = (data.candidates && data.candidates[0] && data.candidates[0].content
                       && data.candidates[0].content.parts && data.candidates[0].content.parts[0].text) || '';
        } else {
            content = (data.choices && data.choices[0] && data.choices[0].message
                       && data.choices[0].message.content) || '';
        }

        if (!content) throw new Error('Réponse vide du routeur LLM');
        return content;
    } finally {
        composed.cleanup();
    }
}


/**
 * Classifie l'intention de la requête.
 * @param {string} prompt
 * @returns {'chat'|'coder'|'raisonnement'}
 */
function classifyIntent(prompt) {
    var text = prompt.toLowerCase();
    // Variante sans accents (AZERTY relâché : "ecris", "reflexion", ...)
    var flat = text;
    try { flat = text.normalize('NFD').replace(/[\u0300-\u036f]/g, ''); } catch (e) {}

    var codeMatches = 0;
    var codePatterns = [
        /```/, /function\s+\w+\s*\(/, /class\s+\w+/, /import\s+.*from/,
        /def\s+\w+\s*\(/, /\b(const|let|var)\s+\w+\s*=/,
        /<script|<div\b/, /SELECT\s+.*FROM/i, /npm\s+(install|run)/,
        /git\s+(clone|commit|push)/, /docker\s+(run|build)/,
        /api\s+(call|endpoint)/, /\bendpoint\b/, /\bregex\b/,
        /\bdebug\b/, /\berror\b/, /\bbug\b/, /\bfix\b/,
        /\bimplement\b/, /\bcreer?\b.*\b(fonction|code|script)\b/,
        /ecris.*\b(code|fonction|script|programme)\b/
    ];
    for (var i = 0; i < codePatterns.length; i++) {
        if (codePatterns[i].test(flat)) codeMatches++;
    }

    var reasoningMatches = 0;
    var reasoningPatterns = [
        /\bexplain\b/, /\bwhy\b/, /\banalyze\b/, /\bcompare\b/, /\breason\b/,
        /\bprove\b/, /\bdemonstrat\b/, /\bevaluat\b/, /\bassess\b/,
        /what is the difference/, /how does.*work/,
        /\bphilosoph/, /\bethical/, /\bimplication\b/,
        /\bexplique\b/, /\bpourquoi\b/, /\banalyse\b/, /\bcompare\b/,
        /\braison\b/, /\breflexion\b/, /\bdeduis\b/
    ];
    for (var j = 0; j < reasoningPatterns.length; j++) {
        if (reasoningPatterns[j].test(flat)) reasoningMatches++;
    }
    if (codeMatches >= 1 && codeMatches >= reasoningMatches) return 'coder';
    if (reasoningMatches >= 1) return 'raisonnement';
    return 'chat';
}

/**
 * Score de complexité 0-100.
 * @param {string} prompt
 * @returns {number}
 */
function scoreComplexity(prompt) {
    var score = 0;
    var text = prompt.toLowerCase();
    var len = prompt.length;

    if (len > 50)  score += 10;
    if (len > 200) score += 10;
    if (len > 500) score += 10;

    if (/```/.test(text)) score += 20;
    if (/\b(function|class|def|import|const|let|var)\b/.test(text)) score += 10;

    var techTerms = ['algorithm', 'database', 'api', 'async', 'thread', 'memory',
        'optimization', 'security', 'encrypt', 'compile', 'deploy', 'container',
        'microservice', 'architecture', 'scalability', 'latency', 'throughput',
        'performance', 'benchmark', 'concurrency', 'parallel'];
    var techCount = 0;
    for (var i = 0; i < techTerms.length; i++) {
        if (text.indexOf(techTerms[i]) !== -1) techCount++;
    }
    score += Math.min(techCount * 4, 20);

    var questions = (prompt.match(/\?/g) || []).length;
    score += Math.min(questions * 3, 10);

    if (/\d+\.\s/.test(prompt)) score += 5;
    if (/\n\n/.test(prompt)) score += 5;

    return Math.min(score, 100);
}

// ── Santé des modèles (health-awareness) ─────────────────────────────
// Statistiques locales par modèle (localStorage). Aucun envoi réseau.
// Un modèle en échec entre en cooldown (60s) ; 3 échecs consécutifs =
// circuit-breaker temporaire. Le tirage est pondéré par la santé (EWMA)
// quand des stats existent, sinon rotation déterministe tier+intent.
var ROUTER_STATS_KEY = 'cetas-samagent-stats';
var _statsCache = null;
var _rotationPointers = {};
var _routeCache = {};  // décisions LLM-router mises en cache (TTL 60s)

function _loadStats() {
    if (_statsCache) return _statsCache;
    var parsed = null;
    try {
        parsed = JSON.parse(localStorage.getItem(ROUTER_STATS_KEY) || 'null');
    } catch (e) {}
    _statsCache = (parsed && parsed.v === 1 && parsed.models) ? parsed : { v: 1, models: {} };
    return _statsCache;
}

function _saveStats() {
    try { localStorage.setItem(ROUTER_STATS_KEY, JSON.stringify(_statsCache)); } catch (e) {}
}

// ── Télémétrie locale (P3) : ring buffer 50 routes — AUCUN envoi réseau ──
var ROUTER_TRACE_KEY = 'cetas-samagent-traces';

function _loadTraces() {
    try {
        var t = JSON.parse(localStorage.getItem(ROUTER_TRACE_KEY) || '[]');
        return Array.isArray(t) ? t : [];
    } catch (e) { return []; }
}

function _saveTraces(traces) {
    try { localStorage.setItem(ROUTER_TRACE_KEY, JSON.stringify(traces)); } catch (e) {}
}

/**
 * Résumé agrégé par modèle (taux de succès) pour observabilité.
 */
function _aggregateTraces(traces) {
    var agg = {};
    traces.forEach(function(x) {
        var k = x.model || '?';
        agg[k] = agg[k] || { ok: 0, ko: 0 };
        x.ok ? agg[k].ok++ : agg[k].ko++;
    });
    return agg;
}

/**
 * Affiche la télémétrie de routage (console.table) et retourne le résumé.
 * Appel : dumpRouteStats() dans la console.
 */
function dumpRouteStats() {
    var traces = _loadTraces();
    var agg = _aggregateTraces(traces);
    if (traces.length) {
        var recent = traces.slice().reverse();
        try { console.table(recent); } catch (e) { console.log(recent); }
    } else {
        console.log('[SamAgent] aucune trace de routage pour l\'instant.');
    }
    try { console.table(agg); } catch (e) { console.log(agg); }
    return { traces: traces, agg: agg };
}

/**
 * Enregistre l'issue d'un appel routé (succès/échec + latence ms) : met à jour
 * la santé (EWMA/cooldown) ET la télémétrie locale (ring buffer 50 routes).
 * @param {string} modelId - Id réel du modèle appelé
 * @param {boolean} ok - true si la réponse est arrivée sans erreur transport
 * @param {number} [latencyMs] - Durée de l'appel en ms
 * @param {Object} [details] - {tier, intent, score, label} si connu (app.js)
 */
function recordRouteResult(modelId, ok, latencyMs, details) {
    if (!modelId) return;
    var stats = _loadStats();
    var m = stats.models[modelId] || (stats.models[modelId] = { ewma: 1, latSum: 0, latN: 0, consecFail: 0, lastFailAt: 0, n: 0, ok: 0, fail: 0 });
    m.n++;
    // EWMA santé : α=0.3, borne 0.05..1
    var alpha = 0.3;
    m.ewma = Math.max(0.05, Math.min(1, (ok ? 1 : 0) * alpha + m.ewma * (1 - alpha)));
    if (ok) { m.ok++; m.consecFail = 0; }
    else { m.fail++; m.consecFail++; m.lastFailAt = Date.now(); }
    if (typeof latencyMs === 'number' && latencyMs >= 0) { m.latSum += latencyMs; m.latN++; }
    // Éviter la croissance infinie de la clé
    var keys = Object.keys(stats.models);
    if (keys.length > 300) {
        keys.slice(0, keys.length - 300).forEach(function(k) { delete stats.models[k]; });
    }
    _saveStats();

    // Télémétrie locale (P3) : ring buffer 50 routes, aucun envoi réseau
    var traces = _loadTraces();
    traces.push({
        ts: Date.now(),
        model: modelId,
        ok: !!ok,
        latencyMs: (typeof latencyMs === 'number' && latencyMs >= 0) ? Math.round(latencyMs) : null,
        tier: (details && details.tier) || null,
        intent: (details && details.intent) || null,
        score: (details && typeof details.score === 'number') ? details.score : null,
        label: (details && details.label) || null
    });
    if (traces.length > 50) traces.splice(0, traces.length - 50);
    _saveTraces(traces);
}

/** Score 0..1 : circuit-breaker + cooldown d'abord, puis EWMA × pénalité latence. */
function _healthScore(modelEntry, stat) {
    if (!stat) return 1;
    var now = Date.now();
    if (stat.consecFail >= 3) return 0;
    if (stat.lastFailAt && (now - stat.lastFailAt) < 60000) return 0;
    var latPenalty = 1;
    if (stat.latN >= 3) {
        var mean = stat.latSum / stat.latN;
        if (mean > 8000) latPenalty = 0.55;
        else if (mean > 4000) latPenalty = 0.8;
        else if (mean > 2000) latPenalty = 0.92;
    }
    return Math.max((typeof stat.ewma === 'number' ? stat.ewma : 1) * latPenalty, 0.15);
}

/** Filtre les entrées non résolvables (si un validateur est injecté par app.js). */
function _resolvableEntries(pool) {
    if (typeof window === 'undefined' || typeof window.SAM_ROUTER_CAN_USE !== 'function') return pool;
    var out = [];
    for (var i = 0; i < pool.length; i++) {
        try { if (window.SAM_ROUTER_CAN_USE(pool[i].model)) out.push(pool[i]); } catch (e) {}
    }
    return out.length ? out : pool;
}

/**
 * Sélectionne un modèle dans le pool.
 * - Stats santé présentes → tirage pondéré par la santé (jamais un mort tant
 *   qu'un vivant reste).
 * - Aucune stats → rotation déterministe par clé tier+intent (répartition
 *   équilibrée garantie, contrairement au pur aléatoire d'avant).
 * @param {Array} pool - Tableau de {model, provider, thinking}
 * @param {string} [key] - Clé unique tier+intent pour la rotation
 * @returns {Object} L'entrée sélectionnée (ou null si pool vide)
 */
function _pickFromPool(pool, key) {
    if (!pool || !pool.length) return null;
    pool = _resolvableEntries(pool);
    var stats = _loadStats().models;
    var scored = pool.map(function(m) { return { m: m, h: _healthScore(m, stats[m.model]) }; });
    var anyData = scored.some(function(x) { var s = stats[x.m.model]; return s && s.n > 0; });

    if (!anyData) {
        // Rotation déterministe tier+intent — répartition équilibrée
        var ptr = _rotationPointers[key || 'default'] || 0;
        var picked = pool[ptr % pool.length];
        _rotationPointers[key || 'default'] = (ptr + 1) % pool.length;
        return picked;
    }

    // Tirage pondéré par la santé
    var sum = 0, i;
    for (i = 0; i < scored.length; i++) sum += scored[i].h;
    if (sum <= 0) return pool[Math.floor(Math.random() * pool.length)];
    var r = Math.random() * sum, acc = 0;
    for (i = 0; i < scored.length; i++) {
        acc += scored[i].h;
        if (r <= acc) return scored[i].m;
    }
    return scored[scored.length - 1].m;
}

/**
 * Route une requête vers le meilleur modèle.
 * Score ≤ 70 → algorithme regex (rapide)
 * Score > 70 → mini-LLM (analyse sémantique fine) avec fallback regex si indisponible
 *
 * @param {string} prompt - Le texte de la requête utilisateur
 * @param {string} samAgentModel - 'samagent-nano' | 'samagent-n4-flash' | 'samagent-n4' | 'samagent-n8'
 * @param {AbortSignal} [externalSignal] - Signal d'annulation (stop utilisateur)
 * @returns {Promise<Object>} { modelId, provider, thinking, label, intent, score, routedBy } — jamais null
 */
async function routeModel(prompt, samAgentModel, externalSignal) {
    var intent = classifyIntent(prompt);
    var score = scoreComplexity(prompt);

    // IA Locale (SamGen) : tier dynamique découvert via /v1/models
    if (samAgentModel === 'samagent-local') {
        return _routeLocal(prompt, intent, score);
    }

    var tier;
    if (samAgentModel === 'samagent-nano') {
        tier = 'nano';
    } else if (samAgentModel === 'samagent-n4-flash') {
        tier = 'n4-flash';
    } else if (samAgentModel === 'samagent-n8') {
        tier = 'n8';
    } else {
        tier = 'n4';
    }

    var pool = ROUTER_CONFIG[tier];
    if (!pool) pool = ROUTER_CONFIG.n4;

    // Mode Réflexion (bouton +) : quand actif, ne retenir que les modèles
    // "thinking" (réflexion garantie) ; quand inactif, exclure tout modèle
    // à réflexion forcée (certains modèles pensent toujours, quel que soit
    // le paramètre reasoning_effort — seul le choix du modèle contrôle ça).
    var _reflectionOn = typeof document !== 'undefined'
        && !!document.getElementById('plus-reflection-toggle')?.checked;
    var _filteredPool = {};
    Object.keys(pool).forEach(function(k) {
        var matching = pool[k].filter(function(m) { return !!m.thinking === _reflectionOn; });
        _filteredPool[k] = matching.length ? matching : pool[k];
    });
    pool = _filteredPool;

    if (!pool[intent]) intent = 'chat';

    var route;

    // ── Score > 70 → Router LLM (analyse sémantique fine) ──
    // Sauter pour Nano : score toujours ≤33, perdre 5s pour rien.
    if (score > 70 && tier !== 'nano') {
        var _ck = tier + ':' + intent + ':' + prompt.slice(0, 300);
        var _hit = _routeCache[_ck];
        if (_hit && (Date.now() - _hit.ts) < 60000) {
            route = _hit.route;
            console.log('[Router] décision en cache → ' + route.model);
        } else {
            console.log('[Router] score=' + score + ' > 70 → LLM router activé (intent=' + intent + ', tier=' + tier + ')');
            try {
                route = await callRouterLLM(prompt, pool[intent], externalSignal);
            } catch (e) {
                console.warn('[Router] LLM router exception: ' + e.message);
                route = null;
            }
            if (route) {
                _routeCache[_ck] = { ts: Date.now(), route: route };
                var _rk = Object.keys(_routeCache);
                if (_rk.length > 100) delete _routeCache[_rk[0]];
            }
        }
    }

    // Fallback : algo regex si score ≤ 70, si LLM router a échoué, ou si le pool
    // d'intention est vide après filtrage → on revient au pool chat complet.
    if (!route) {
        var _poolKey = tier + ':' + intent;
        if (pool[intent] && pool[intent].length) {
            route = _pickFromPool(pool[intent], _poolKey);
        } else if (pool.chat && pool.chat.length) {
            route = _pickFromPool(pool.chat, tier + ':chat');
        } else {
            // Dernier filet : jamais de null — on fabrique un modèle de repli.
            route = { model: 'deepseek-chat', provider: 'deepseek', thinking: false };
        }
    }

    // Résoudre label, chaîne de fallback et objet de retour (source unique)
    return _buildRoute(route, tier, intent, score, pool[intent]);
}

// Export pour utilisation dans app.js / tests
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { classifyIntent, scoreComplexity, routeModel, ROUTER_CONFIG, callRouterLLM, recordRouteResult, _pickFromPool, _loadStats, _routerAbort, refreshLocalRegistry, _localPool, LOCAL_ENGINES, dumpRouteStats, _loadTraces };
}
if (typeof window !== 'undefined') {
    window.dumpRouteStats = dumpRouteStats;
    window.recordRouteResult = recordRouteResult;
}

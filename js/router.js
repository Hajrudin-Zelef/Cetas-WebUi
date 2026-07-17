// ── Model Fusion Router ──────────────────────────────────────────────
// Fusionne TOUS les modèles de TOUS les providers (DeepSeek, Google,
// Groq, Nvidia, OpenRouter) avec rotation de 6+ modèles par tier/intent
// pour éviter tout spoof et garantir diversité maximale.
//
// Architecture hybride :
//   Score ≤ 70 → algorithme regex (rapide, déterministe)
//   Score > 70 → mini-LLM (analyse sémantique fine, fallback multi-provider)
//
// À chaque requête, un modèle est tiré aléatoirement dans le pool
// correspondant au tier (Nano/N4/N8) et à l'intention (chat/coder/raisonnement).

var ROUTER_CONFIG = {
    // ── Score 0-33 : requêtes simples, salutations, questions courtes ─
    nano: {
        chat: [
            { model: 'deepseek-chat',                        provider: 'deepseek', thinking: false },
            { model: 'llama-3.1-8b-instant',                 provider: 'groq',     thinking: false },
            { model: 'gemini-2.5-flash-lite',                provider: 'google',   thinking: false },
            { model: 'stepfun-ai/step-3.7-flash',            provider: 'nvidia',   thinking: false },
            { model: 'qwen/qwen3-32b',                       provider: 'groq',     thinking: false },
            { model: 'gemini-2.5-flash',                     provider: 'google',   thinking: false }
        ],
        coder: [
            { model: 'deepseek-chat',                        provider: 'deepseek', thinking: false },
            { model: 'qwen/qwen3-32b',                       provider: 'groq',     thinking: false },
            { model: 'gemini-2.5-flash',                     provider: 'google',   thinking: false },
            { model: 'z-ai/glm-5.2',                         provider: 'nvidia',   thinking: false },
            { model: 'openai/gpt-oss-20b',                   provider: 'groq',     thinking: false },
            { model: 'deepseek-v4-flash',                    provider: 'deepseek', thinking: false }
        ],
        raisonnement: [
            { model: 'gemini-2.5-flash',                     provider: 'google',   thinking: false },
            { model: 'deepseek-chat',                        provider: 'deepseek', thinking: false },
            { model: 'qwen/qwen3.6-27b',                     provider: 'groq',     thinking: false },
            { model: 'google/gemma-4-31b-it',                provider: 'nvidia',   thinking: false },
            { model: 'gemini-3.1-flash-lite',                provider: 'google',   thinking: false },
            { model: 'meta-llama/llama-4-scout-17b-16e-instruct', provider: 'groq', thinking: false }
        ]
    },
    // ── Score 34-66 : explications, analyse, code intermédiaire ─
    n4: {
        chat: [
            { model: 'gemini-3-flash',                       provider: 'google',   thinking: false },
            { model: 'deepseek-v4-flash',                    provider: 'deepseek', thinking: false },
            { model: 'openai/gpt-oss-120b',                  provider: 'groq',     thinking: false },
            { model: 'mistralai/mistral-medium-3.5-128b',    provider: 'nvidia',   thinking: false },
            { model: 'gemini-3.1-flash-lite',                provider: 'google',   thinking: false },
            { model: 'meta/llama-3.3-70b-instruct',          provider: 'nvidia',   thinking: false }
        ],
        coder: [
            { model: 'gemini-3-flash',                       provider: 'google',   thinking: false },
            { model: 'deepseek-v4-pro',                      provider: 'deepseek', thinking: false },
            { model: 'qwen/qwen3.6-27b',                     provider: 'groq',     thinking: false },
            { model: 'nvidia/nemotron-3-super-120b-a12b',    provider: 'nvidia',   thinking: false },
            { model: 'meta-llama/llama-4-scout-17b-16e-instruct', provider: 'groq', thinking: false },
            { model: 'deepseek-chat',                        provider: 'deepseek', thinking: false }
        ],
        raisonnement: [
            { model: 'gemini-3-flash',                       provider: 'google',   thinking: true  },
            { model: 'deepseek-v4-pro',                      provider: 'deepseek', thinking: true  },
            { model: 'qwen/qwen3.6-27b',                     provider: 'groq',     thinking: false },
            { model: 'nvidia/nemotron-3-nano-omni-30b-a3b-reasoning', provider: 'nvidia', thinking: true },
            { model: 'gemini-3.1-pro',                       provider: 'google',   thinking: true  },
            { model: 'deepseek-chat',                        provider: 'deepseek', thinking: false }
        ]
    },
    // ── Score 67-100 : code complexe, raisonnement avancé, tâches expert ─
    n8: {
        chat: [
            { model: 'gemini-3.5-flash',                     provider: 'google',   thinking: false },
            { model: 'deepseek-v4-pro',                      provider: 'deepseek', thinking: false },
            { model: 'openai/gpt-oss-120b',                  provider: 'groq',     thinking: false },
            { model: 'nvidia/nemotron-3-super-120b-a12b',    provider: 'nvidia',   thinking: false },
            { model: 'gemini-3.1-pro',                       provider: 'google',   thinking: false },
            { model: 'meta-llama/llama-4-scout-17b-16e-instruct', provider: 'groq', thinking: false }
        ],
        coder: [
            { model: 'gemini-3.5-flash',                     provider: 'google',   thinking: false },
            { model: 'deepseek-v4-pro',                      provider: 'deepseek', thinking: false },
            { model: 'nvidia/nemotron-3-super-120b-a12b',    provider: 'nvidia',   thinking: false },
            { model: 'qwen/qwen3.6-27b',                     provider: 'groq',     thinking: false },
            { model: 'gemini-3.1-pro',                       provider: 'google',   thinking: false },
            { model: 'openai/gpt-oss-120b',                  provider: 'groq',     thinking: false }
        ],
        raisonnement: [
            { model: 'gemini-3.5-flash',                     provider: 'google',   thinking: true  },
            { model: 'deepseek-v4-pro',                      provider: 'deepseek', thinking: true  },
            { model: 'nvidia/nemotron-3-nano-omni-30b-a3b-reasoning', provider: 'nvidia', thinking: true },
            { model: 'gemini-3.1-pro',                       provider: 'google',   thinking: true  },
            { model: 'qwen/qwen3.6-27b',                     provider: 'groq',     thinking: false },
            { model: 'z-ai/glm-5.2',                         provider: 'nvidia',   thinking: false }
        ]
    }
};

// ── Router LLM Pool ──────────────────────────────────────────────────
// Un modèle par provider pour fallback automatique.
// Si l'un est down, le suivant prend le relais — Cetas ne bloque jamais.
// C'est l'identité même de SamAgent : Model Fusion sans point de défaillance unique.
var ROUTER_LLM_POOL = [
    { model: 'deepseek-chat',                       provider: 'deepseek',   label: 'DeepSeek V3.2',           type: 'openai',  path: '/v1/chat/completions' },
    { model: 'llama-3.1-8b-instant',                provider: 'groq',       label: 'Llama 3.1 8B (Groq)',     type: 'openai',  path: '/openai/v1/chat/completions' },
    { model: 'nvidia/nemotron-3-nano-30b-a3b',      provider: 'nvidia',     label: 'Nemotron Nano 30B (NV)',  type: 'openai',  path: '/v1/chat/completions' },
    { model: 'google/gemini-2.5-flash-lite',        provider: 'openrouter', label: 'Gemini Flash Lite (OR)',  type: 'openai',  path: '/api/v1/chat/completions' },
    { model: 'gemini-3.1-flash-lite',               provider: 'google',     label: 'Gemini 3.1 Flash Lite (G)', type: 'google', path: '/v1beta/models/gemini-3.1-flash-lite:generateContent' }
];

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
 * @returns {Promise<Object>} {modelId, provider, thinking, ...}
 */
async function callRouterLLM(prompt, targetPool) {
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

    // Essaie chaque router LLM en séquence (fallback multi-provider)
    for (var i = 0; i < ROUTER_LLM_POOL.length; i++) {
        var routerModel = ROUTER_LLM_POOL[i];
        try {
            console.log('[Router LLM] tentative ' + (i + 1) + '/' + ROUTER_LLM_POOL.length + ' avec ' + routerModel.label + ' (' + routerModel.provider + ')');

            var response = await _fetchRouterLLM(routerModel, userMessage);

            // Parse la réponse JSON
            var jsonStr = response.trim();
            // Nettoie les wrappers markdown éventuels
            jsonStr = jsonStr.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
            var parsed = JSON.parse(jsonStr);

            if (!parsed.model) throw new Error('JSON sans champ "model"');

            // Cherche le modèle choisi dans le pool cible
            var chosen = null;
            for (var j = 0; j < targetPool.length; j++) {
                if (targetPool[j].model === parsed.model) {
                    chosen = targetPool[j];
                    break;
                }
            }

            if (!chosen) {
                // Modèle suggéré hors pool → prendre le 1er du pool (safe fallback)
                console.warn('[Router LLM] modèle ' + parsed.model + ' hors pool → fallback 1er du pool');
                chosen = targetPool[0];
            }

            console.log('[Router LLM] ✓ choisi ' + chosen.model + ' (' + chosen.provider + ') raison: ' + (parsed.reason || 'N/A'));
            return chosen;

        } catch (err) {
            console.warn('[Router LLM] échec avec ' + routerModel.label + ': ' + err.message);
            // Continue avec le prochain router LLM
        }
    }

    // Tous les router LLM ont échoué → fallback algo regex (_pickFromPool)
    console.warn('[Router LLM] tous les routeurs LLM ont échoué → fallback rotation');
    return null;
}

/**
 * Appelle un modèle routeur via le proxy (requête non-streaming).
 * Supporte les providers OpenAI-compatible ET Google (Gemini format).
 * @param {Object} routerModel - {model, provider, label, type}
 * @param {string} userMessage - Le message à envoyer
 * @returns {Promise<string>} La réponse texte du LLM
 */
async function _fetchRouterLLM(routerModel, userMessage) {
    var isGoogle = routerModel.type === 'google';

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
    var resp = await fetch(proxyPath, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
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
}

// Compteur de rotation par tier+intent pour équilibrer la distribution
var _routerCounters = {};

/**
 * Classifie l'intention de la requête.
 * @param {string} prompt
 * @returns {'chat'|'coder'|'raisonnement'}
 */
function classifyIntent(prompt) {
    var text = prompt.toLowerCase();

    var codeMatches = 0;
    var codePatterns = [
        /```/, /function\s+\w+\s*\(/, /class\s+\w+/, /import\s+.*from/,
        /def\s+\w+\s*\(/, /\b(const|let|var)\s+\w+\s*=/,
        /<script|<div\b/, /SELECT\s+.*FROM/i, /npm\s+(install|run)/,
        /git\s+(clone|commit|push)/, /docker\s+(run|build)/,
        /api\s+(call|endpoint)/, /\bendpoint\b/, /\bregex\b/,
        /\bdebug\b/, /\berror\b/, /\bbug\b/, /\bfix\b/,
        /\bimplement\b/, /\bcréer?\b.*\b(fonction|code|script)\b/,
        /écris.*\b(code|fonction|script|programme)\b/
    ];
    for (var i = 0; i < codePatterns.length; i++) {
        if (codePatterns[i].test(text)) codeMatches++;
    }

    var reasoningMatches = 0;
    var reasoningPatterns = [
        /\bexplain\b/, /\bwhy\b/, /\banalyze\b/, /\bcompare\b/, /\breason\b/,
        /\bprove\b/, /\bdemonstrat\b/, /\bevaluat\b/, /\bassess\b/,
        /what is the difference/, /how does.*work/,
        /\bphilosoph/, /\bethical/, /\bimplication\b/,
        /\bexplique\b/, /\bpourquoi\b/, /\banalyse\b/, /\bcompare\b/,
        /\braison\b/, /\bréflexion\b/, /\bdéduis\b/
    ];
    for (var j = 0; j < reasoningPatterns.length; j++) {
        if (reasoningPatterns[j].test(text)) reasoningMatches++;
    }

    if (codeMatches > reasoningMatches && codeMatches >= 1) return 'coder';
    if (reasoningMatches > codeMatches && reasoningMatches >= 1) return 'raisonnement';
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

/**
 * Sélectionne un modèle aléatoirement dans le pool avec rotation équilibrée.
 * @param {Array} pool - Tableau de {model, provider, thinking}
 * @param {string} key - Clé unique tier+intent pour le compteur
 * @returns {Object} L'entrée sélectionnée
 */
function _pickFromPool(pool, key) {
    if (!_routerCounters[key]) _routerCounters[key] = 0;
    // Rotation : on incrémente et on prend modulo la taille du pool
    var idx = _routerCounters[key] % pool.length;
    _routerCounters[key]++;
    return pool[idx];
}

/**
 * Route une requête vers le meilleur modèle.
 * Score ≤ 70 → algorithme regex (rapide)
 * Score > 70 → mini-LLM (analyse sémantique fine) avec fallback regex si indisponible
 *
 * @param {string} prompt - Le texte de la requête utilisateur
 * @param {string} samAgentModel - 'samagent-nano' | 'samagent-n4' | 'samagent-n8'
 * @returns {Promise<Object>} { modelId, provider, thinking, label, intent, score, routedBy }
 */
async function routeModel(prompt, samAgentModel) {
    var intent = classifyIntent(prompt);
    var score = scoreComplexity(prompt);

    var tier;
    if (samAgentModel === 'samagent-nano') {
        tier = 'nano';
    } else if (samAgentModel === 'samagent-n8') {
        tier = 'n8';
    } else {
        tier = 'n4';
    }

    var pool = ROUTER_CONFIG[tier];
    if (!pool[intent]) intent = 'chat';

    var route;

    // ── Score > 70 → Router LLM (analyse sémantique fine) ──
    if (score > 70) {
        console.log('[Router] score=' + score + ' > 70 → LLM router activé (intent=' + intent + ', tier=' + tier + ')');
        try {
            route = await callRouterLLM(prompt, pool[intent]);
        } catch (e) {
            console.warn('[Router] LLM router exception: ' + e.message);
            route = null;
        }
    }

    // Fallback : algo regex si score ≤ 70 ou si LLM router a échoué
    if (!route) {
        route = _pickFromPool(pool[intent], tier + '_' + intent);
    }

    // Résoudre le label du modèle réel
    var realLabel = route.model;
    try {
        var allModels = (typeof MODELS !== 'undefined' ? MODELS : [])
            .concat(typeof IMAGE_MODELS !== 'undefined' ? IMAGE_MODELS : [])
            .concat(typeof SEARCH_MODELS !== 'undefined' ? SEARCH_MODELS : []);
        var found = allModels.find(function(m) { return m.id === route.model; });
        if (found) realLabel = found.label;
    } catch(e) {}

    // Abréger le nom du provider pour l'indicateur
    var provShort = { deepseek: 'DS', google: 'G', groq: 'GQ', nvidia: 'NV' }[route.provider] || route.provider;

    var tierLabel = { nano: 'Nano', n4: 'N4', n8: 'N8' }[tier];

    return {
        modelId: route.model,
        provider: route.provider,
        thinking: route.thinking,
        intent: intent,
        score: score,
        label: 'SamAgent ' + tierLabel + ' [' + provShort + '] → ' + realLabel,
        routedBy: route.model
    };
}

// Export pour utilisation dans app.js
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { classifyIntent, scoreComplexity, routeModel, ROUTER_CONFIG, callRouterLLM };
}

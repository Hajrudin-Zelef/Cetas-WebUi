// ═══════════════════════════════════════════════════════════════════
// api.js — Couche d'intégration multi-providers (Provider Pattern)
// ═══════════════════════════════════════════════════════════════════

// --- 1. Configuration & état global ---

let API_KEYS = {
    openai: '',
    anthropic: '',
    google: '',
    mistral: '',
    perplexity: '',
    deepseek: '',
    grok: '',
    zai: '',
    groq: '',
    nvidia: '',
    cabreras: '',
    openrouter: '',     // Clé API OpenRouter (Flux, etc.)
    ollama: '',         // URL du serveur Ollama (ex: http://localhost:11434)
    lmstudio: '',       // URL du serveur LM Studio (ex: http://localhost:1234)
    llamacpp: ''        // URL du serveur LLaMA.cpp (ex: http://localhost:8080)
};

// Helper : un éditeur correspond-il à un fournisseur local (Ollama ou LM Studio) ?
function isLocalEditeur(editeur) {
    return editeur === 'ollama' || editeur === 'lmstudio' || editeur === 'llamacpp';
}

// Préfixe du proxy backend (les providers cloud passent par /api/proxy/{provider}/...)
const PROXY_BASE = '/api/proxy';

// Route une URL provider vers le proxy si c'est un provider cloud.
// Les providers locaux (ollama, lmstudio, llamacpp) gardent leurs URLs directes.
function proxyUrl(provider, url) {
    if (isLocalEditeur(provider)) return url;
    const parsed = new URL(url);
    return `${PROXY_BASE}/${provider}${parsed.pathname}${parsed.search}`;
}

// Nettoie les headers avant envoi au proxy (supprime les clés d'auth que le proxy injectera)
// Ajoute le JWT utilisateur pour authentification proxy
function proxyHeaders(provider, headers) {
    if (isLocalEditeur(provider)) return headers;
    const h = Object.assign({}, headers);
    delete h['Authorization'];
    delete h['x-api-key'];
    delete h['anthropic-dangerous-direct-browser-access'];
    // Injecter le JWT utilisateur (auth proxy)
    if (typeof Auth !== 'undefined' && Auth.getToken) {
        const token = Auth.getToken();
        if (token) h['Authorization'] = 'Bearer ' + token;
    }
    return h;
}

let MODELS = [];
let SEARCH_MODELS = [];
let IMAGE_MODELS = [];
let TARIFS = {};
var MODELS_MAP = {};
var IMAGE_MODELS_MAP = {};
var SEARCH_MODELS_MAP = {};

function _rebuildModelMaps() {
    var m = {}; for (var i = 0; i < MODELS.length; i++) m[MODELS[i].id] = MODELS[i].editeur || '';
    MODELS_MAP = m;
    var im = {}; for (var j = 0; j < IMAGE_MODELS.length; j++) im[IMAGE_MODELS[j].id] = IMAGE_MODELS[j].editeur || '';
    IMAGE_MODELS_MAP = im;
    var sm = {}; for (var k = 0; k < SEARCH_MODELS.length; k++) sm[SEARCH_MODELS[k].id] = SEARCH_MODELS[k].editeur || '';
    SEARCH_MODELS_MAP = sm;
}
let IMAGE_TARIFS = {};
let SEARCH_TARIFS = {};

// --- 2. Fonctions publiques utilitaires ---

async function loadApiKeys() {
    // 1. Coffre chiffré (prioritaire)
    if (typeof Auth !== 'undefined' && Auth.isVaultReady()) {
        try {
            const encrypted = localStorage.getItem('cetas-vault-keys');
            if (encrypted) {
                const plaintext = await Auth.vaultDecrypt(encrypted);
                const parsed = JSON.parse(plaintext);
                if (parsed.local && !parsed.ollama && !parsed.lmstudio) {
                    if (/11434/.test(parsed.local)) parsed.ollama = parsed.local;
                    else if (/1234/.test(parsed.local)) parsed.lmstudio = parsed.local;
                    else parsed.ollama = parsed.local;
                }
                delete parsed.local;
                Object.assign(API_KEYS, parsed);
                return;
            }
        } catch (e) {
            console.warn('Lecture du coffre impossible :', e);
        }
    }
    // 2. Fallback : ancien stockage en clair (pré-migration)
    try {
        const stored = localStorage.getItem('minou-apikeys');
        if (stored) {
            const parsed = JSON.parse(stored);
            if (parsed.local && !parsed.ollama && !parsed.lmstudio) {
                if (/11434/.test(parsed.local)) parsed.ollama = parsed.local;
                else if (/1234/.test(parsed.local)) parsed.lmstudio = parsed.local;
                else parsed.ollama = parsed.local;
            }
            delete parsed.local;
            Object.assign(API_KEYS, parsed);
            // Clés en clair détectées : seront chiffrées au prochain login via _vaultMigrate()
            console.warn('⚠️ Clés API chargées depuis le stockage legacy (minou-apikeys). Elles seront migrées vers le coffre chiffré à la prochaine connexion.');
            // Tenter un nettoyage immédiat si le coffre est disponible (ceinture + bretelles)
            if (typeof Auth !== 'undefined' && Auth.isVaultReady()) {
                try {
                    const encrypted = await Auth.vaultEncrypt(stored);
                    localStorage.setItem('cetas-vault-keys', encrypted);
                    localStorage.removeItem('minou-apikeys');
                    console.log('✅ Clés API migrées avec succès vers le coffre chiffré.');
                } catch (migErr) { /* coffre non prêt, la migration aura lieu au login */ }
            }
        }
    } catch (e) {
        console.warn('Lecture des clés API impossible (localStorage corrompu) :', e);
    }
}

async function saveApiKeys(keys) {
    Object.assign(API_KEYS, keys);
    // Proxy actif → ne pas persister dans le navigateur
    try {
        const h = {};
        if (typeof Auth !== 'undefined' && Auth.getToken) {
            var token = Auth.getToken();
            if (token) h['Authorization'] = 'Bearer ' + token;
        }
        const resp = await fetch('/api/keys', { method: 'HEAD', signal: AbortSignal.timeout(1000), headers: h });
        if (resp.ok || resp.status === 401 || resp.status === 403) return; // Proxy dispo
    } catch (e) { /* Proxy injoignable → coffre chiffré */ }
    // Coffre chiffré uniquement (plus de fallback localStorage en clair)
    if (typeof Auth !== 'undefined' && Auth.isVaultReady()) {
        try {
            const encrypted = await Auth.vaultEncrypt(JSON.stringify(API_KEYS));
            localStorage.setItem('cetas-vault-keys', encrypted);
            localStorage.removeItem('minou-apikeys');
        } catch (e) {
            console.warn('Écriture coffre impossible, les clés ne seront pas persistées.');
        }
    }
}

/** Synchronise les clés depuis le proxy backend au démarrage.
 *  Proxy actif → clés en mémoire seulement, jamais dans localStorage.
 *  Proxy absent → fallback localStorage.
 */
async function syncKeysFromProxy() {
    try {
        const headers = {};
        if (typeof Auth !== 'undefined' && Auth.getToken) {
            const token = Auth.getToken();
            if (token) headers['Authorization'] = 'Bearer ' + token;
        }
        const resp = await fetch('/api/keys', {
            signal: AbortSignal.timeout(3000),
            headers: headers
        });
        if (!resp.ok) return false;
        const keys = await resp.json();
        if (!keys || Object.keys(keys).length === 0) return false;
        // Proxy disponible : garder en mémoire uniquement, pas de localStorage
        Object.assign(API_KEYS, keys);
        console.info('[proxy]', Object.keys(keys).length, 'clés chargées en mémoire');
        return true;
    } catch (e) {
        return false; // Proxy injoignable, fallback localStorage
    }
}

// --- Catalogue de modèles (prefs + cache OpenRouter) ---

function loadCatalogPrefs() {
    try {
        const s = localStorage.getItem('minou-catalog-prefs');
        if (s) return JSON.parse(s);
    } catch(e) {}
    return { disabled: [], orEnabled: [] };
}

function saveCatalogPrefs(prefs) {
    localStorage.setItem('minou-catalog-prefs', JSON.stringify(prefs));
}

// Caches OR séparés par type d'onglet : la requête diffère
// (text → fetch global, image → ?output_modalities=image)
// Le format est évolutif : les champs absents sont gérés gracefully par les helpers.
function getOrCache(tabType = 'text') {
    try {
        const key = tabType === 'image' ? 'minou-or-cache-image' : 'minou-or-cache';
        const s = localStorage.getItem(key);
        if (s) return JSON.parse(s);
    } catch(e) {}
    return null;
}

function setOrCache(models, tabType = 'text') {
    const key = tabType === 'image' ? 'minou-or-cache-image' : 'minou-or-cache';
    localStorage.setItem(key, JSON.stringify({ ts: Date.now(), models }));
}

// Retire le préfixe fournisseur du nom d'un modèle OpenRouter.
// Ex : "OpenAI: GPT-5.1-Codex-Mini" → "GPT-5.1-Codex-Mini"
//      "OpenAI GPT Mini Latest"     → "GPT Mini Latest"
//      "Meta Llama 3.1 70B"         → "Llama 3.1 70B"  (id : meta-llama/...)
// Idempotent : si le préfixe est déjà absent, renvoie le nom inchangé.
function cleanOrModelLabel(name, id) {
    if (!name || !id) return name || '';
    // 1) "Editeur: Modèle" → garder ce qui suit le premier ":"
    const colonIdx = name.indexOf(':');
    if (colonIdx > 0 && colonIdx < 30) {
        const after = name.slice(colonIdx + 1).trim();
        if (after) return after;
    }
    // 2) Préfixe mot-à-mot correspondant exactement au slug fournisseur (id : "[~]editeur/modele")
    const provider = id.replace(/^~/, '').split('/')[0] || '';
    const providerNorm = provider.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (!providerNorm) return name;
    const words = name.split(/\s+/);
    let acc = '';
    let stripCount = 0;
    for (let i = 0; i < words.length; i++) {
        acc += words[i].toLowerCase().replace(/[^a-z0-9]/g, '');
        if (acc === providerNorm) { stripCount = i + 1; break; }
        if (!providerNorm.startsWith(acc)) break;
    }
    if (stripCount > 0) {
        const stripped = words.slice(stripCount).join(' ').trim();
        if (stripped) return stripped;
    }
    return name;
}

// Cache persistante dédiée aux prix image enrichis (issus de /endpoints).
// Indépendante du cache /models : survit aux Actualiser et aux ré-écritures
// du cache principal, donc les prix s'affichent instantanément au reload
// sans flash "Gratuit" même si /models renvoie pricing=0.
//
// Format des entrées : `{ price: number, ts: number }`. Les anciennes entrées
// (valeur = nombre brut) sont tolérées en lecture (compat ascendante) puis
// migrées au prochain `setOrImagePrice`. Un TTL est appliqué en lecture pour
// forcer une re-récupération via /endpoints si OR a baissé un prix.
const OR_IMG_PRICES_KEY = 'minou-or-image-prices';
const OR_IMG_PRICES_TTL_MS = 14 * 24 * 60 * 60 * 1000; // 14 jours
function _readOrImagePricesRaw() {
    try {
        const s = localStorage.getItem(OR_IMG_PRICES_KEY);
        if (s) return JSON.parse(s) || {};
    } catch(e) {}
    return {};
}
function getOrImagePrices() {
    const raw = _readOrImagePricesRaw();
    const now = Date.now();
    const out = {};
    for (const [id, v] of Object.entries(raw)) {
        if (typeof v === 'number') {
            // Format legacy sans timestamp : on garde la valeur (sera migrée à la
            // prochaine écriture). Pas d'expiration possible faute de ts.
            if (v > 0) out[id] = v;
        } else if (v && typeof v === 'object' && typeof v.price === 'number' && v.price > 0) {
            if (!v.ts || (now - v.ts) < OR_IMG_PRICES_TTL_MS) out[id] = v.price;
        }
    }
    return out;
}
function setOrImagePrice(modelId, price) {
    if (!modelId || !(price > 0)) return;
    const raw = _readOrImagePricesRaw();
    const existing = raw[modelId];
    const existingPrice = (typeof existing === 'number')
        ? existing
        : (existing && typeof existing.price === 'number' ? existing.price : null);
    const existingTs = (existing && typeof existing === 'object' && existing.ts) || 0;
    // Skip si même prix ET timestamp encore frais (évite des écritures inutiles).
    if (existingPrice === price && existingTs && (Date.now() - existingTs) < OR_IMG_PRICES_TTL_MS) return;
    raw[modelId] = { price, ts: Date.now() };
    try { localStorage.setItem(OR_IMG_PRICES_KEY, JSON.stringify(raw)); } catch(e) {}
}

function rebuildModelLists() {
    loadModels();
    // Réinjecter les modèles locaux mis en cache (loadModels a réinitialisé MODELS).
    if (typeof loadCachedLocalModels === 'function') loadCachedLocalModels();
    const prefs = loadCatalogPrefs();
    const orEnabled = new Set(prefs.orEnabled || []);

    // Auto-enable des modèles OpenRouter populaires au premier lancement
    // (quand l'utilisateur n'a encore rien sélectionné). Évite d'avoir un
    // menu "+" vide alors que le catalogue OpenRouter est dispo.
    const DEFAULT_OR_MODELS = [
        // N4 Flash (gratuits)
        'google/gemma-4-31b-it:free',
        'nvidia/nemotron-3-super-120b-a12b:free',
        'google/lyria-3-pro-preview',
        'nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free',
        'poolside/laguna-s-2.1:free',
        'inclusionai/ling-3.0-flash:free',
        'google/gemma-4-26b-a4b-it:free',
        'nvidia/nemotron-3-ultra-550b-a55b:free',
        'openrouter/free',
        'cohere/north-mini-code:free',
        // N4 (payants)
        'deepseek/deepseek-v4-flash',
        'qwen/qwen3.5-flash-02-23',
        'mistralai/mistral-small-2603',
        'google/gemini-2.5-flash-lite',
        'openai/gpt-5.4-nano',
        'meta-llama/llama-4-maverick',
        'deepseek/deepseek-v4-pro',
        'qwen/qwen3-coder-next',
        'xiaomi/mimo-v2.5-pro',
        'qwen/qwen3.6-35b-a3b',
        'qwen/qwen3-coder',
        'deepseek/deepseek-v3.2',
        'arcee-ai/trinity-large-thinking',
        // Populaires
        'openrouter/auto',
        'deepseek/deepseek-chat',
        'anthropic/claude-sonnet-4.5',
    ];
    // Toujours compléter avec les modèles par défaut manquants.
    // N'affecte pas les modèles désactivés manuellement (ils sont dans `disabled`).
    const textCache = getOrCache('text');
    const imageCache = getOrCache('image');
    let added = false;
    for (const id of DEFAULT_OR_MODELS) {
        if (orEnabled.has(id)) continue;
        const inText = textCache?.models?.some(m => m.id === id && !m._isImage);
        const inImage = imageCache?.models?.some(m => m.id === id);
        if (inText || inImage) {
            orEnabled.add(id);
            added = true;
        }
    }
    if (added) {
        prefs.orEnabled = [...orEnabled];
        saveCatalogPrefs(prefs);
    }

    if (orEnabled.size === 0) return;

    const buildMeta = (m) => ({
        id: m.id,
        label: cleanOrModelLabel(m.label, m.id),
        editeur: 'openrouter',
        description: m.description || '',
        contextLength: m.contextLength || null,
        created: m.created || null,
        expirationDate: m.expirationDate || null,
        knowledgeCutoff: m.knowledgeCutoff || null,
        inputModalities: m.inputModalities || [],
        outputModalities: m.outputModalities || [],
        supportedParameters: m.supportedParameters || [],
        defaultParameters: m.defaultParameters || null
    });

    // Cache text → MODELS (filtre _isImage par sécurité, le cache text peut contenir des modèles mixtes)
    if (textCache?.models) {
        for (const m of textCache.models) {
            if (m._isImage) continue;
            if (orEnabled.has(m.id) && !MODELS.find(x => x.id === m.id)) {
                MODELS.push(buildMeta(m));
                TARIFS[m.id] = { editeur: 'openrouter', inputPer1M: m.inputPer1M || 0, outputPer1M: m.outputPer1M || 0 };
            }
        }
    }

    // Cache image → IMAGE_MODELS (la fetch ?output_modalities=image garantit que tous sont images)
    if (imageCache?.models) {
        // Filet de sécurité : si le cache a été écrit avant enrichissement /endpoints
        // (ou par une version antérieure sans hydratation), on relit les prix persistés.
        const priceMap = (typeof getOrImagePrices === 'function') ? getOrImagePrices() : {};
        for (const m of imageCache.models) {
            if (orEnabled.has(m.id) && !IMAGE_MODELS.find(x => x.id === m.id)) {
                IMAGE_MODELS.push(buildMeta(m));
                const imageOutput = m.imageOutput || priceMap[m.id] || 0;
                IMAGE_TARIFS[m.id] = { editeur: 'openrouter', inputPer1M: m.inputPer1M || 0, outputPer1M: m.outputPer1M || 0, imageOutput };
            }
        }
    }
    _rebuildModelMaps();
}

function loadModels() {
    const data = MODELS_DATA;
    if (data.text) {
        MODELS = data.text.map(m => ({ id: m.id, label: m.label, editeur: m.editeur, description: m.description || '' }));
        for (const m of data.text) {
            TARIFS[m.id] = { editeur: m.editeur, inputPer1M: m.inputPer1M, outputPer1M: m.outputPer1M };
        }
    }
    if (data.image) {
        IMAGE_MODELS = data.image.map(m => ({ id: m.id, label: m.label, editeur: m.editeur, description: m.description || '' }));
        for (const m of data.image) {
            IMAGE_TARIFS[m.id] = { editeur: m.editeur, inputPer1M: m.inputPer1M, outputPer1M: m.outputPer1M, imageOutput: m.imageOutput, imagePricing: m.imagePricing };
        }
    }
    if (data.search) {
        SEARCH_MODELS = data.search.map(m => ({ id: m.id, label: m.label, editeur: m.editeur, description: m.description || '' }));
        for (const m of data.search) {
            SEARCH_TARIFS[m.id] = { editeur: m.editeur, inputPer1M: m.inputPer1M, outputPer1M: m.outputPer1M };
        }
    }
    _rebuildModelMaps();
}

// IDs renommés côté fournisseur (ex. sortie de preview Gemini) : permet aux conversations
// et réglages enregistrés avec l'ancien ID de retrouver automatiquement le nouveau modèle.
const RENAMED_MODEL_IDS = {
    'gemini-3.1-flash-lite-preview': 'gemini-3.1-flash-lite',
    'gemini-3-pro-image-preview': 'gemini-3-pro-image',
    'gemini-3.1-flash-image-preview': 'gemini-3.1-flash-image'
};
function migrateModelId(id) { return RENAMED_MODEL_IDS[id] || id; }

function getTarif(model) { return TARIFS[model] || null; }
function getImageTarif(model) { return IMAGE_TARIFS[model] || null; }

// Prix par image en fonction de la qualité / taille (OpenAI) ou résolution (Gemini)
// format : 'square' | 'vertical' | 'horizontal' (depuis le bouton de format)
// imageParams : résultat de getImageParams()
function computeImagePrice(tarif, format, imageParams) {
    if (!tarif) return 0;
    const pricing = tarif.imagePricing;
    if (!pricing) return tarif.imageOutput || 0;

    if (tarif.editeur === 'openai') {
        const sizeMap = { square: '1024x1024', vertical: '1024x1536', horizontal: '1536x1024' };
        const sizeKey = sizeMap[format] || '1024x1024';
        let q = imageParams?.quality || 'high';
        if (q === 'auto') q = 'medium';
        return pricing[q]?.[sizeKey] ?? pricing.high?.[sizeKey] ?? tarif.imageOutput ?? 0;
    }
    if (tarif.editeur === 'google') {
        const resKey = imageParams?.imageSize || '1K';
        return pricing[resKey] ?? pricing['1K'] ?? tarif.imageOutput ?? 0;
    }
    return tarif.imageOutput || 0;
}
function getSearchTarif(model) { return SEARCH_TARIFS[model] || null; }

function getModelEditeur(modelId) {
    return MODELS_MAP[modelId] || null;
}

function getImageModelEditeur(modelId) {
    return IMAGE_MODELS_MAP[modelId] || null;
}

function getSearchModelEditeur(modelId) {
    return SEARCH_MODELS_MAP[modelId] || null;
}

// Flag global (gardé pour compatibilité — toujours false sans coffre)
let VAULT_LOCKED = false;

async function initConfig() {
    // Proxy actif ? → clés en mémoire seulement, localStorage ignoré
    const synced = await syncKeysFromProxy();
    if (!synced) {
        // Proxy injoignable → fallback localStorage (coffre ou clair)
        await loadApiKeys();
    }
    // Migration des IDs renommés persistés (dernier modèle utilisé) — AVANT
    // pruneLastSelectionsOrphans() qui purgerait sinon les anciens IDs.
    try {
        for (const key of ['minou-last-model', 'minou-last-image-model', 'minou-last-search-model']) {
            const v = localStorage.getItem(key);
            if (v && RENAMED_MODEL_IDS[v]) localStorage.setItem(key, RENAMED_MODEL_IDS[v]);
        }
    } catch (e) {}
    loadAudioSettings();
    rebuildModelLists(); // loadModels() + cache locaux + OR models from catalog prefs
    // Ne pas bloquer l'init sur la récupération des modèles locaux
    fetchLocalModels().then(() => {
        if (typeof populateUnifiedSelect === 'function') populateUnifiedSelect();
    });
    // Rafraîchissement silencieux du catalogue OpenRouter (non bloquant).
    // Met à jour les caches text+image, purge les IDs orphelins de orEnabled,
    // puis reconstruit MODELS/IMAGE_MODELS et le sélecteur.
    // Le proxy gère l'auth — plus de clé locale nécessaire
    if (typeof refreshOrCacheSilently === 'function') {
        refreshOrCacheSilently().then((ok) => {
            if (!ok) return;
            pruneOrEnabledOrphans();
            rebuildModelLists();
            if (typeof populateUnifiedSelect === 'function') populateUnifiedSelect();
        }).catch(() => {});
    }
}

// Récupère le catalogue OpenRouter (text + image, catégorie 'all') sans toucher l'UI
// du panneau Catalogue. Utilisé au démarrage pour avoir des métadonnées à jour.
async function refreshOrCacheSilently() {
    const headers = {};
    if (typeof Auth !== 'undefined' && Auth.getToken) {
        var token = Auth.getToken();
        if (token) headers['Authorization'] = 'Bearer ' + token;
    }
    async function fetchOne(isImage) {
        const base = 'https://openrouter.ai/api/v1/models' + (isImage ? '?output_modalities=image' : '');
        const url = proxyUrl('openrouter', base);
        const res = await fetch(url, { headers });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        return (data.data || []).filter(m => m.id && m.name).map(m => {
            const arch = m.architecture || {};
            const inputModalities = Array.isArray(arch.input_modalities) ? arch.input_modalities : [];
            const outputModalities = Array.isArray(arch.output_modalities) ? arch.output_modalities : [];
            const modality = arch.modality || '';
            // Classement par modalité primaire (premier élément de output_modalities)
            // plutôt que par simple présence : un modèle hybride comme `openrouter/auto`
            // a outputs=["text","image"] et est avant tout textuel — il doit apparaître
            // dans l'onglet Texte. Les vrais générateurs d'images ont outputs=["image",…].
            const _isImage = outputModalities.length
                ? outputModalities[0] === 'image'
                : modality.includes('->image');
            const inp = Math.round(parseFloat(m.pricing?.prompt || 0) * 1e6 * 100) / 100;
            const out = Math.round(parseFloat(m.pricing?.completion || 0) * 1e6 * 100) / 100;
            const imgOut = (typeof _parseOrImagePrice === 'function') ? _parseOrImagePrice(m.pricing) : 0;
            const pricingDetails = {
                request: parseFloat(m.pricing?.request) || 0,
                webSearch: parseFloat(m.pricing?.web_search) || 0,
                internalReasoning: parseFloat(m.pricing?.internal_reasoning) || 0,
                inputCacheRead: parseFloat(m.pricing?.input_cache_read) || 0,
                inputCacheWrite: parseFloat(m.pricing?.input_cache_write) || 0,
                audio: parseFloat(m.pricing?.audio) || 0
            };
            return {
                id: m.id,
                canonicalSlug: m.canonical_slug || null,
                label: cleanOrModelLabel(m.name, m.id),
                editeur: 'openrouter',
                description: m.description || '',
                inputPer1M: inp,
                outputPer1M: out,
                imageOutput: imgOut,
                pricingDetails,
                _isImage,
                contextLength: m.context_length || null,
                created: m.created || null,
                expirationDate: m.expiration_date || null,
                knowledgeCutoff: m.knowledge_cutoff || null,
                inputModalities,
                outputModalities,
                tokenizer: arch.tokenizer || null,
                instructType: arch.instruct_type || null,
                supportedParameters: Array.isArray(m.supported_parameters) ? m.supported_parameters : [],
                defaultParameters: m.default_parameters || null,
                topProvider: m.top_provider || null,
                perRequestLimits: m.per_request_limits || null,
                isModerated: m.top_provider?.is_moderated ?? null,
                huggingFaceId: m.hugging_face_id || null
            };
        });
    }
    try {
        const [textModels, imageModels] = await Promise.all([fetchOne(false), fetchOne(true)]);
        // /models renvoie souvent pricing=0 sur les modèles image ; le vrai image_output
        // n'est exposé que dans /endpoints et persiste dans OR_IMG_PRICES_KEY. Sans cette
        // hydratation, le silent refresh écraserait le cache enrichi par des zéros et
        // ferait flasher "Gratuit" dans le sélecteur de modèles. Cf. _loadOrModels qui
        // applique la même logique côté UI catalogue.
        if (typeof getOrImagePrices === 'function') {
            const priceMap = getOrImagePrices();
            for (const m of imageModels) {
                if ((!m.imageOutput || m.imageOutput === 0) && priceMap[m.id] > 0) {
                    m.imageOutput = priceMap[m.id];
                }
            }
        }
        setOrCache(textModels, 'text');
        setOrCache(imageModels, 'image');
        return true;
    } catch (e) {
        console.warn('Refresh silencieux OpenRouter échoué :', e);
        return false;
    }
}

// Purge les IDs morts dans les `minou-last-*` (modèles retirés de models.js
// ou de OpenRouter, ou modèles locaux dont le serveur n'a plus le modèle).
// À appeler après initConfig() pour éviter currentModel = id fantôme.
function pruneLastSelectionsOrphans() {
    const purged = [];
    const checks = [
        ['minou-last-model',        (id) => MODELS.some(m => m.id === id)],
        ['minou-last-image-model',  (id) => IMAGE_MODELS.some(m => m.id === id)],
        ['minou-last-search-model', (id) => SEARCH_MODELS.some(m => m.id === id)],
    ];
    for (const [key, isAlive] of checks) {
        const id = localStorage.getItem(key);
        if (id && !isAlive(id)) {
            localStorage.removeItem(key);
            purged.push({ key, id });
        }
    }
    if (purged.length) {
        for (const p of purged) {
            console.info(`[Cetas] Modèle "${p.id}" supprimé du catalogue, sélection ${p.key} réinitialisée.`);
        }
    }
    return purged;
}

// Retire de orEnabled les IDs qui n'existent plus dans les caches OR.
// Conserve la liste des orphelins dans `minou-or-orphans` pour info.
function pruneOrEnabledOrphans() {
    const prefs = loadCatalogPrefs();
    const orEnabled = Array.isArray(prefs.orEnabled) ? prefs.orEnabled : [];
    if (orEnabled.length === 0) return;
    const live = new Set();
    const text = getOrCache('text');
    const image = getOrCache('image');
    if (text?.models) for (const m of text.models) live.add(m.id);
    if (image?.models) for (const m of image.models) live.add(m.id);
    if (live.size === 0) return; // refresh n'a rien rapporté → ne pas purger
    const kept = orEnabled.filter(id => live.has(id));
    const orphans = orEnabled.filter(id => !live.has(id));
    if (orphans.length === 0) return;
    saveCatalogPrefs({ disabled: prefs.disabled || [], orEnabled: kept });
    try {
        const prev = JSON.parse(localStorage.getItem('minou-or-orphans') || '[]');
        const merged = Array.from(new Set([...prev, ...orphans]));
        localStorage.setItem('minou-or-orphans', JSON.stringify(merged));
    } catch (e) {}
    console.info(`[Cetas] ${orphans.length} modèle(s) OpenRouter sélectionné(s) ne sont plus disponibles et ont été retirés :`, orphans);
}

// Cache localStorage pour les modèles locaux, permet d'afficher les modèles
// au démarrage sans devoir relancer Ollama / LM Studio + cliquer sur « Mettre à jour ».
const LOCAL_MODELS_CACHE_KEY = 'minou-local-models';

function _readLocalModelsCache() {
    try {
        const s = localStorage.getItem(LOCAL_MODELS_CACHE_KEY);
        if (s) return JSON.parse(s) || {};
    } catch (e) {}
    return {};
}

function _writeLocalModelsCache(cache) {
    try { localStorage.setItem(LOCAL_MODELS_CACHE_KEY, JSON.stringify(cache)); } catch (e) {}
}

function _applyLocalModels(ed, ids) {
    MODELS = MODELS.filter(m => m.editeur !== ed);
    for (const key of Object.keys(TARIFS)) {
        if (TARIFS[key].editeur === ed) delete TARIFS[key];
    }
    for (const id of ids) {
        MODELS.push({ id, label: id, editeur: ed });
        TARIFS[id] = { editeur: ed, inputPer1M: 0, outputPer1M: 0 };
    }
    _rebuildModelMaps();
}

// Charge les modèles locaux mis en cache (à appeler à l'init avant le fetch réseau).
function loadCachedLocalModels() {
    const cache = _readLocalModelsCache();
    for (const ed of ['ollama', 'lmstudio', 'llamacpp']) {
        const ids = Array.isArray(cache[ed]) ? cache[ed] : [];
        if (ids.length) _applyLocalModels(ed, ids);
    }
}

// Récupérer la liste des modèles depuis les serveurs locaux (Ollama + LM Studio).
// En cas d'échec (serveur éteint), les modèles précédemment mis en cache sont conservés.
async function fetchLocalModels(onlyEditeur = null) {
    const editeurs = onlyEditeur ? [onlyEditeur] : ['ollama', 'lmstudio', 'llamacpp'];
    const cache = _readLocalModelsCache();

    await Promise.all(editeurs.map(async (ed) => {
        const url = API_KEYS[ed];
        if (!url) {
            // URL retirée : on purge les modèles + le cache de cet éditeur
            _applyLocalModels(ed, []);
            delete cache[ed];
            return;
        }
        try {
            const baseUrl = url.replace(/\/+$/, '');
            const response = await fetch(`${baseUrl}/v1/models`, { signal: AbortSignal.timeout(3000) });
            if (!response.ok) return; // serveur joignable mais erreur, on garde le cache
            const data = await response.json();
            const models = data.data || data.models || [];
            const ids = models.map(m => m.id || m.name).filter(Boolean);
            _applyLocalModels(ed, ids);
            cache[ed] = ids;
        } catch (e) {
            // Serveur non lancé ou inaccessible, on garde silencieusement le cache existant
        }
    }));

    _writeLocalModelsCache(cache);
}

// Décharger un modèle local de la RAM (Ollama ou LM Studio selon l'éditeur)
let _lastLocalModel = null;

function unloadLocalModel(modelId, editeur = null) {
    if (!modelId) return;
    const ed = editeur || getModelEditeur(modelId);
    if (!isLocalEditeur(ed)) return;
    const url = API_KEYS[ed];
    if (!url) return;
    const origin = url.replace(/\/+$/, '');

    if (ed === 'ollama') {
        // Ollama : POST /api/generate avec keep_alive: 0
        fetch(`${origin}/api/generate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ model: modelId, keep_alive: 0 }),
            signal: AbortSignal.timeout(2000)
        }).catch(() => {});
    } else if (ed === 'lmstudio' || ed === 'llamacpp') {
        // LM Studio / LLaMA.cpp : POST /api/v1/models/unload (ou équivalent)
        fetch(`${origin}/api/v1/models/unload`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ instance_id: modelId }),
            signal: AbortSignal.timeout(2000)
        }).catch(() => {});
    }
}

// --- 3. Générateur SSE partagé ---

async function* readSSE(response) {
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop();
        for (const line of lines) {
            if (!line.startsWith('data: ')) continue;
            const data = line.slice(6).trim();
            if (data === '[DONE]') return;
            try { yield JSON.parse(data); } catch {}
        }
    }
}

// --- 4. Utilitaires partagés pour Chat Completions ---

// Parser de balises <think>...</think> (DeepSeek, Mistral, Perplexity)
function createThinkTagParser() {
    let inThinkBlock = false, thinkBuffer = '';

    function process(delta) {
        const events = [];
        let text = '';
        thinkBuffer += delta;
        while (thinkBuffer.length > 0) {
            if (inThinkBlock) {
                const endIdx = thinkBuffer.indexOf('</think>');
                if (endIdx !== -1) {
                    events.push({ type: 'thinking', data: thinkBuffer.substring(0, endIdx) });
                    thinkBuffer = thinkBuffer.substring(endIdx + 8);
                    inThinkBlock = false;
                } else {
                    if (thinkBuffer.length > 8) {
                        events.push({ type: 'thinking', data: thinkBuffer.substring(0, thinkBuffer.length - 8) });
                        thinkBuffer = thinkBuffer.substring(thinkBuffer.length - 8);
                    }
                    break;
                }
            } else {
                const startIdx = thinkBuffer.indexOf('<think>');
                if (startIdx !== -1) {
                    if (startIdx > 0) text += thinkBuffer.substring(0, startIdx);
                    thinkBuffer = thinkBuffer.substring(startIdx + 7);
                    inThinkBlock = true;
                } else {
                    if (thinkBuffer.length > 7) {
                        text += thinkBuffer.substring(0, thinkBuffer.length - 7);
                        thinkBuffer = thinkBuffer.substring(thinkBuffer.length - 7);
                    }
                    break;
                }
            }
        }
        return { text, events };
    }

    function flush() {
        const events = [];
        if (thinkBuffer && !inThinkBlock) events.push({ type: 'chunk', data: thinkBuffer });
        thinkBuffer = '';
        return events;
    }

    return { process, flush };
}

// Formatter de messages partagé pour le format Chat Completions
// Options : textOnly (Perplexity), trimTrailingAssistant (Mistral), collapseTextOnly (Local)
function formatChatCompletionsMessages(history, options = {}) {
    const messages = history.filter(m => m.role !== 'system').map(msg => {
        if (typeof msg.content === 'string') {
            return { role: msg.role, content: msg.content };
        }
        if (Array.isArray(msg.content)) {
            if (options.textOnly) {
                const text = msg.content.map(p => {
                    if (p.type === 'text') return p.text;
                    if (p.type === 'file') return `--- Contenu du fichier joint : ${p.name} ---\n${p.textContent || ''}\n--- Fin du fichier ---`;
                    return '';
                }).filter(Boolean).join('\n');
                return { role: msg.role, content: text };
            }
            const parts = [];
            for (const part of msg.content) {
                if (part.type === 'text') {
                    parts.push({ type: 'text', text: part.text });
                } else if (part.type === 'image') {
                    if (msg.role === 'assistant') {
                        parts.push({ type: 'text', text: '[Image générée]' });
                    } else {
                        const dataUrl = part.dataUrl || `data:${part.mimeType};base64,${part.data}`;
                        parts.push({ type: 'image_url', image_url: { url: dataUrl } });
                    }
                } else if (part.type === 'file') {
                    parts.push({ type: 'text', text: `--- Contenu du fichier joint : ${part.name} ---\n${part.textContent || ''}\n--- Fin du fichier ---` });
                }
            }
            if (options.collapseTextOnly && !parts.some(p => p.type === 'image_url')) {
                return { role: msg.role, content: parts.map(p => p.text).filter(Boolean).join('\n') };
            }
            return { role: msg.role, content: parts };
        }
        return { role: msg.role, content: String(msg.content) };
    });
    if (options.trimTrailingAssistant) {
        while (messages.length > 0 && messages[messages.length - 1].role === 'assistant') {
            messages.pop();
        }
    }
    return messages;
}

// Parser SSE partagé pour Chat Completions (choices[0].delta.content + usage)
// `usage.cost_real` est rempli si OpenRouter renvoie le champ `cost` (opt-in via usage:{include:true}).
function createChatCompletionsParser(hasThinkingCallback, options = {}) {
    let usage = { input_tokens: 0, output_tokens: 0, cost_real: null };
    let citations = [];
    const thinkParser = hasThinkingCallback ? createThinkTagParser() : null;

    function parse(parsed) {
        const events = [];

        // Reasoning natif (OpenAI o3/o4/gpt-5 : choices[0].delta.reasoning_content)
        if (hasThinkingCallback && options.extractReasoning) {
            const reasoning = options.extractReasoning(parsed);
            if (reasoning) events.push({ type: 'thinking', data: reasoning });
        }

        let delta = parsed.choices?.[0]?.delta?.content;
        if (delta) {
            // Mistral (Small 4 / Medium 3.5) : `delta.content` peut arriver sous forme d'un
            // tableau de chunks structurés ({type:"thinking", thinking:[{type:"text", text:...}]}
            // ou {type:"text", text:...}) plutôt qu'une simple string.
            if (Array.isArray(delta)) {
                for (const chunk of delta) {
                    if (chunk?.type === 'thinking' && hasThinkingCallback && Array.isArray(chunk.thinking)) {
                        for (const inner of chunk.thinking) {
                            if (inner?.type === 'text' && inner.text) {
                                events.push({ type: 'thinking', data: inner.text });
                            }
                        }
                    } else if (chunk?.type === 'text' && chunk.text) {
                        events.push({ type: 'chunk', data: chunk.text });
                    }
                }
            } else if (thinkParser) {
                const { text, events: thinkEvents } = thinkParser.process(delta);
                events.push(...thinkEvents);
                if (text) events.push({ type: 'chunk', data: text });
            } else {
                events.push({ type: 'chunk', data: delta });
            }
        }

        // Citations (Perplexity: parsed.citations, OpenAI: annotations)
        if (options.extractCitations) {
            const c = options.extractCitations(parsed);
            if (c) {
                if (options.accumulateCitations) {
                    for (const ci of c) {
                        if (!citations.some(x => x.url === ci.url)) citations.push(ci);
                    }
                } else {
                    citations = c;
                }
            }
        }

        if (parsed.usage) {
            usage.input_tokens = parsed.usage.prompt_tokens || 0;
            usage.output_tokens = parsed.usage.completion_tokens || 0;
            // OpenRouter : coût réel en USD si `usage:{include:true}` a été envoyé dans la requête
            const c = parseFloat(parsed.usage.cost);
            if (!isNaN(c) && c >= 0) usage.cost_real = c;
        }
        return events;
    }

    parse.flush = () => thinkParser ? thinkParser.flush() : [];
    parse.getResult = () => ({ usage, citations });
    return parse;
}

// Parser SSE pour l'API Responses d'OpenAI (web search)
function createOpenAIResponsesParser() {
    let usage = { input_tokens: 0, output_tokens: 0 };
    let citations = [];

    function parse(parsed) {
        const events = [];
        if (parsed.type === 'response.output_text.delta' && parsed.delta) {
            events.push({ type: 'chunk', data: parsed.delta });
        }
        if (parsed.type === 'response.output_text.annotation.added') {
            const ann = parsed.annotation;
            if (ann?.type === 'url_citation' && ann.url) {
                if (!citations.some(c => c.url === ann.url)) {
                    citations.push({ url: ann.url, title: ann.title || '' });
                }
            }
        }
        if (parsed.type === 'response.completed' && parsed.response?.usage) {
            usage.input_tokens = parsed.response.usage.input_tokens || 0;
            usage.output_tokens = parsed.response.usage.output_tokens || 0;
        }
        return events;
    }

    parse.flush = () => [];
    parse.getResult = () => ({ usage, citations });
    return parse;
}

// Factory de provider Chat Completions — chaque fournisseur est un simple objet de config
function chatCompletionsProvider(config) {
    return {
        getHeaders: config.getHeaders,
        getUrl: config.getUrl,
        formatMessages(history) {
            return formatChatCompletionsMessages(history, config.formatOptions);
        },
        buildBody(modelId, messages, systemPrompt, webSearch, modelParams) {
            if (systemPrompt) messages = [{ role: 'system', content: systemPrompt }, ...messages];
            const extras = config.bodyExtras ? config.bodyExtras(modelId, webSearch, modelParams) : {};
            // Params standards (toujours envoyés s'ils sont définis)
            const std = modelParams ? {
                temperature: modelParams.temperature,
                top_p: modelParams.top_p,
                max_tokens: modelParams.max_tokens,
                frequency_penalty: modelParams.frequency_penalty,
                presence_penalty: modelParams.presence_penalty
            } : {};
            // Params OR-spécifiques : forwardés uniquement si le modèle les déclare dans supported_parameters.
            // Évite des erreurs 400 quand on bascule entre modèles avec des supports différents.
            const orExtra = {};
            if (modelParams) {
                const meta = (typeof MODELS !== 'undefined') && MODELS.find(m => m.id === modelId);
                const supported = Array.isArray(meta?.supportedParameters) ? meta.supportedParameters : null;
                const allow = (k) => !supported || supported.includes(k);
                if (modelParams.top_k != null && allow('top_k')) orExtra.top_k = modelParams.top_k;
                if (modelParams.min_p != null && allow('min_p')) orExtra.min_p = modelParams.min_p;
                if (modelParams.top_a != null && allow('top_a')) orExtra.top_a = modelParams.top_a;
                if (modelParams.repetition_penalty != null && allow('repetition_penalty')) orExtra.repetition_penalty = modelParams.repetition_penalty;
                if (modelParams.seed != null && allow('seed')) orExtra.seed = modelParams.seed;
            }
            return { model: modelId, messages, stream: true, ...std, ...orExtra, ...extras };
        },
        createParser(hasThinkingCallback) {
            return createChatCompletionsParser(hasThinkingCallback, config.parserOptions);
        }
    };
}

// --- 5. Providers de streaming texte ---

const PROVIDERS = {

    // ===================== OpenAI =====================
    // Chat Completions par défaut ; bascule sur Responses API quand webSearch est actif

    openai: {
        getHeaders() {
            return { 'Content-Type': 'application/json' };
        },
        getUrl(modelId, webSearch) {
            const base = webSearch
                ? 'https://api.openai.com/v1/responses'
                : 'https://api.openai.com/v1/chat/completions';
            return proxyUrl('openai', base);
        },
        formatMessages(history) {
            return formatChatCompletionsMessages(history);
        },
        buildBody(modelId, messages, systemPrompt, webSearch, modelParams) {
            if (webSearch) {
                const tool = { type: 'web_search_preview' };
                if (modelParams?.webSearchDepth === 'deep') tool.search_context_size = 'high';
                const body = { model: modelId, input: messages, tools: [tool], stream: true };
                if (systemPrompt) body.instructions = systemPrompt;
                if (modelParams?.temperature !== undefined) body.temperature = modelParams.temperature;
                if (modelParams?.max_tokens !== undefined) body.max_output_tokens = modelParams.max_tokens;
                return body;
            }
            if (systemPrompt) messages = [{ role: 'system', content: systemPrompt }, ...messages];
            const isReasoning = /^(o3|o4|o1)/.test(modelId) || /^gpt-5/.test(modelId);
            const params = (!isReasoning && modelParams) ? {
                temperature: modelParams.temperature,
                top_p: modelParams.top_p,
                max_tokens: modelParams.max_tokens,
                frequency_penalty: modelParams.frequency_penalty,
                presence_penalty: modelParams.presence_penalty
            } : {};
            return {
                model: modelId, messages, stream: true,
                stream_options: { include_usage: true },
                ...params,
                ...(isReasoning && { reasoning_effort: modelParams?.reasoning_effort || 'medium' }),
                ...(isReasoning && modelParams?.max_tokens && { max_completion_tokens: modelParams.max_tokens })
            };
        },
        createParser(hasThinkingCallback, webSearch) {
            if (webSearch) return createOpenAIResponsesParser();
            return createChatCompletionsParser(hasThinkingCallback, {
                extractCitations: (p) => {
                    const anns = p.choices?.[0]?.delta?.annotations;
                    if (!anns) return null;
                    return anns.filter(a => a.type === 'url_citation' && a.url).map(a => ({ url: a.url, title: a.title || '' }));
                },
                extractReasoning: (p) => p.choices?.[0]?.delta?.reasoning_content || null,
                accumulateCitations: true
            });
        }
    },

    // ===================== Anthropic (Messages API) =====================

    anthropic: {
        getHeaders() {
            return {
                'Content-Type': 'application/json',
                'anthropic-version': '2023-06-01'
            };
        },

        getUrl() {
            return proxyUrl('anthropic', 'https://api.anthropic.com/v1/messages');
        },

        formatMessages(history) {
            return history.filter(m => m.role !== 'system').map(msg => {
                if (typeof msg.content === 'string') {
                    return { role: msg.role, content: msg.content };
                }
                if (Array.isArray(msg.content)) {
                    const content = [];
                    for (const part of msg.content) {
                        if (part.type === 'text') {
                            content.push({ type: 'text', text: part.text });
                        } else if (part.type === 'image') {
                            if (msg.role === 'assistant') {
                                content.push({ type: 'text', text: '[Image générée]' });
                            } else {
                                content.push({
                                    type: 'image',
                                    source: { type: 'base64', media_type: part.mimeType, data: part.data }
                                });
                            }
                        } else if (part.type === 'file') {
                            if (part.mimeType === 'application/pdf') {
                                content.push({
                                    type: 'document',
                                    source: { type: 'base64', media_type: 'application/pdf', data: part.data }
                                });
                            } else {
                                content.push({ type: 'text', text: `--- Contenu du fichier joint : ${part.name} ---\n${part.textContent || ''}\n--- Fin du fichier ---` });
                            }
                        }
                    }
                    return { role: msg.role, content };
                }
                return { role: msg.role, content: msg.content };
            });
        },

        buildBody(modelId, messages, systemPrompt, webSearch, modelParams) {
            const isThinkingModel = modelId.includes('opus') || modelId.includes('sonnet') || modelId.includes('fable');
            // Opus 4.7+, Sonnet 5 et Fable 5 utilisent le mode adaptive avec output_config.effort
            // (extended thinking non supporté sur ces modèles). NB : /claude-sonnet-5/ ne
            // matche pas 'claude-sonnet-4-5-...' qui reste sur le budget de thinking classique.
            const isAdaptiveThinking = /claude-opus-4-[78]|claude-sonnet-5|claude-fable-5/.test(modelId);
            const body = {
                model: modelId,
                max_tokens: modelParams?.max_tokens || (isThinkingModel ? 16000 : 8192),
                messages,
                stream: true
            };
            if (isThinkingModel) {
                if (isAdaptiveThinking) {
                    body.thinking = { type: 'adaptive' };
                    const effortMap = { minimal: 'low', low: 'low', medium: 'medium', high: 'high' };
                    body.output_config = { effort: effortMap[modelParams?.reasoning_effort] || 'medium' };
                } else {
                    const budgetMap = { minimal: 2000, low: 4000, medium: 10000, high: 20000 };
                    const budget = budgetMap[modelParams?.reasoning_effort] || 10000;
                    body.thinking = { type: 'enabled', budget_tokens: budget };
                }
                // temperature doit rester à 1 quand thinking est activé — on ignore le param utilisateur
            } else {
                if (modelParams?.temperature !== undefined) body.temperature = modelParams.temperature;
                if (modelParams?.top_p !== undefined) body.top_p = modelParams.top_p;
            }
            if (systemPrompt) body.system = systemPrompt;
            if (webSearch) body.tools = [{ type: 'web_search_20250305', name: 'web_search' }];
            return body;
        },

        createParser() {
            let usage = { input_tokens: 0, output_tokens: 0 };
            let citations = [];
            let currentBlockType = null;

            function parse(parsed) {
                const events = [];
                if (parsed.type === 'content_block_start') {
                    currentBlockType = parsed.content_block?.type || null;
                    if (parsed.content_block?.type === 'web_search_tool_result') {
                        const results = parsed.content_block.content || [];
                        for (const r of results) {
                            if (r.type === 'web_search_result' && r.url) {
                                citations.push({ url: r.url, title: r.title || '' });
                            }
                        }
                    }
                }
                if (parsed.type === 'content_block_delta') {
                    if (currentBlockType === 'thinking' && parsed.delta?.thinking) {
                        events.push({ type: 'thinking', data: parsed.delta.thinking });
                    } else if (parsed.delta?.text) {
                        events.push({ type: 'chunk', data: parsed.delta.text });
                    }
                }
                if (parsed.type === 'message_start' && parsed.message?.usage) {
                    usage.input_tokens = parsed.message.usage.input_tokens || 0;
                }
                if (parsed.type === 'message_delta' && parsed.usage) {
                    usage.output_tokens = parsed.usage.output_tokens || 0;
                }
                return events;
            }

            parse.flush = () => [];
            parse.getResult = () => ({ usage, citations });
            return parse;
        }
    },

    // ===================== Google Gemini (generateContent SSE) =====================

    google: {
        getHeaders() {
            return { 'Content-Type': 'application/json' };
        },

        getUrl(modelId) {
            const base = `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:streamGenerateContent?alt=sse`;
            return proxyUrl('google', base);
        },

        formatMessages(history) {
            return history.filter(m => m.role !== 'system').map(msg => {
                if (typeof msg.content === 'string') {
                    return {
                        role: msg.role === 'assistant' ? 'model' : 'user',
                        parts: [{ text: msg.content }]
                    };
                }
                if (Array.isArray(msg.content)) {
                    const parts = [];
                    for (const part of msg.content) {
                        if (part.type === 'text') {
                            parts.push({ text: part.text });
                        } else if (part.type === 'image') {
                            if (msg.role === 'assistant') {
                                parts.push({ text: '[Image générée]' });
                            } else {
                                parts.push({ inline_data: { mime_type: part.mimeType, data: part.data } });
                            }
                        } else if (part.type === 'file') {
                            if (part.mimeType === 'application/pdf') {
                                parts.push({ inline_data: { mime_type: 'application/pdf', data: part.data } });
                            } else {
                                parts.push({ text: `--- Contenu du fichier joint : ${part.name} ---\n${part.textContent || ''}\n--- Fin du fichier ---` });
                            }
                        }
                    }
                    return {
                        role: msg.role === 'assistant' ? 'model' : 'user',
                        parts
                    };
                }
                return {
                    role: msg.role === 'assistant' ? 'model' : 'user',
                    parts: [{ text: msg.content }]
                };
            });
        },

        buildBody(modelId, messages, systemPrompt, webSearch, modelParams) {
            const body = { contents: messages };
            if (systemPrompt) body.systemInstruction = { parts: [{ text: systemPrompt }] };
            if (webSearch) body.tools = [{ google_search: {} }];
            body.generationConfig = {};
            const isGemma = modelId.startsWith('gemma-4');
            if (modelId.includes('pro') || modelId.includes('flash') || isGemma) {
                const thinkingConfig = { includeThoughts: true };
                if (modelParams?.reasoning_effort) {
                    if (isGemma) {
                        thinkingConfig.thinkingLevel = modelParams.reasoning_effort === 'high' ? 'high' : 'minimal';
                    } else {
                        const levelMap = { minimal: 'minimal', low: 'minimal', medium: 'medium', high: 'high' };
                        thinkingConfig.thinkingLevel = levelMap[modelParams.reasoning_effort] || 'medium';
                    }
                }
                body.generationConfig.thinkingConfig = thinkingConfig;
            }
            if (modelParams?.temperature !== undefined) body.generationConfig.temperature = modelParams.temperature;
            if (modelParams?.top_p !== undefined) body.generationConfig.topP = modelParams.top_p;
            if (modelParams?.max_tokens !== undefined) body.generationConfig.maxOutputTokens = modelParams.max_tokens;
            return body;
        },

        createParser() {
            let usage = { input_tokens: 0, output_tokens: 0 };
            let citations = [];

            function parse(parsed) {
                const events = [];
                const parts = parsed.candidates?.[0]?.content?.parts || [];
                for (const part of parts) {
                    if (part.thought && part.text) {
                        events.push({ type: 'thinking', data: part.text });
                    } else if (part.text) {
                        events.push({ type: 'chunk', data: part.text });
                    }
                }
                if (parsed.usageMetadata) {
                    if (parsed.usageMetadata.promptTokenCount)
                        usage.input_tokens = parsed.usageMetadata.promptTokenCount;
                    if (parsed.usageMetadata.candidatesTokenCount)
                        usage.output_tokens = parsed.usageMetadata.candidatesTokenCount;
                }
                const grounding = parsed.candidates?.[0]?.groundingMetadata;
                if (grounding?.groundingChunks) {
                    for (const chunk of grounding.groundingChunks) {
                        if (chunk.web?.uri) {
                            if (!citations.some(c => c.url === chunk.web.uri)) {
                                citations.push({ url: chunk.web.uri, title: chunk.web.title || '' });
                            }
                        }
                    }
                }
                return events;
            }

            parse.flush = () => [];
            parse.getResult = () => ({ usage, citations });
            return parse;
        }
    },

    // ===================== Perplexity (Chat Completions) =====================

    perplexity: chatCompletionsProvider({
        getUrl: () => proxyUrl('perplexity', 'https://api.perplexity.ai/chat/completions'),
        getHeaders: () => ({ 'Content-Type': 'application/json' }),
        formatOptions: { textOnly: true },
        bodyExtras: () => ({ return_citations: true }),
        parserOptions: {
            extractCitations: (p) => (p.citations?.length > 0) ? p.citations : null
        }
    }),

    // ===================== Mistral (Chat Completions) =====================

    mistral: chatCompletionsProvider({
        getUrl: () => proxyUrl('mistral', 'https://api.mistral.ai/v1/chat/completions'),
        getHeaders: () => ({ 'Content-Type': 'application/json' }),
        formatOptions: { trimTrailingAssistant: true },
        bodyExtras: (modelId, webSearch, modelParams) => {
            // Mistral Small 4 / Medium 3.5 : toggle binaire `reasoning_effort: "high"|"none"`.
            // En streaming, le contenu de raisonnement arrive sous forme d'un tableau de chunks
            // dans `delta.content` (type "thinking" / "text"), géré par le parser ci-dessous.
            const supportsReasoning = modelId === 'mistral-small-latest' || modelId === 'mistral-medium-3-5';
            const effort = modelParams?.reasoning_effort;
            return {
                stream_options: { include_usage: true },
                ...(supportsReasoning && effort && { reasoning_effort: effort === 'minimal' ? 'none' : 'high' })
            };
        }
    }),

    // ===================== DeepSeek (Chat Completions) =====================

    deepseek: chatCompletionsProvider({
        getUrl: () => proxyUrl('deepseek', 'https://api.deepseek.com/chat/completions'),
        getHeaders: () => ({ 'Content-Type': 'application/json' }),
        bodyExtras: (modelId, webSearch, modelParams) => {
            // `deepseek-chat` expose un toggle binaire ; si activé ('high'), on bascule
            // vers l'endpoint `deepseek-reasoner` (chaîne de pensée).
            const effort = modelParams?.reasoning_effort;
            const useReasoner = modelId === 'deepseek-chat' && effort === 'high';
            return {
                stream_options: { include_usage: true },
                ...(useReasoner && { model: 'deepseek-reasoner' })
            };
        },
        parserOptions: {
            extractReasoning: (p) => p.choices?.[0]?.delta?.reasoning_content || null
        }
    }),

    // ===================== Grok / xAI (Chat Completions) =====================

    grok: chatCompletionsProvider({
        getUrl: () => proxyUrl('grok', 'https://api.x.ai/v1/chat/completions'),
        getHeaders: () => ({ 'Content-Type': 'application/json' }),
        bodyExtras: (modelId, webSearch, modelParams) => {
            // Grok 4.20 : toggle binaire — si désactivé ('minimal'), bascule sur la variante non-reasoning
            const effort = modelParams?.reasoning_effort;
            const useNonReasoning = modelId === 'grok-4.20-0309-reasoning' && effort === 'minimal';
            // Grok 4.3 : reasoning_effort ajustable (none/low/medium/high)
            const isGrok43 = modelId === 'grok-4.3';
            // Grok 4.5 : reasoning_effort low/medium/high (défaut high côté API, non désactivable)
            const isGrok45 = modelId === 'grok-4.5';
            return {
                stream_options: { include_usage: true },
                ...(webSearch && { search_parameters: { mode: 'auto' } }),
                ...(useNonReasoning && { model: 'grok-4.20-0309-non-reasoning' }),
                ...((isGrok43 || isGrok45) && effort && { reasoning_effort: effort })
            };
        },
        parserOptions: {
            extractReasoning: (p) => p.choices?.[0]?.delta?.reasoning_content || null,
            extractCitations: (p) => {
                const anns = p.choices?.[0]?.delta?.annotations;
                if (!anns) return null;
                return anns.filter(a => a.type === 'url_citation' && a.url).map(a => ({ url: a.url, title: a.title || '' }));
            },
            accumulateCitations: true
        }
    }),

    // ===================== Z.ai / Zhipu GLM (Chat Completions) =====================

    zai: chatCompletionsProvider({
        getUrl: () => proxyUrl('zai', 'https://api.z.ai/api/paas/v4/chat/completions'),
        getHeaders: () => ({ 'Content-Type': 'application/json' }),
        bodyExtras: (modelId, webSearch, modelParams) => {
            // GLM-5 / 5.1 / 5.2 / 5-Turbo : toggle binaire via `thinking: { type: "enabled" | "disabled" }`
            const isGlmReasoning = ['glm-5', 'glm-5.1', 'glm-5.2', 'glm-5-turbo'].includes(modelId);
            const effort = modelParams?.reasoning_effort;
            return {
                stream_options: { include_usage: true },
                ...(isGlmReasoning && { thinking: { type: effort === 'high' ? 'enabled' : 'disabled' } })
            };
        },
        parserOptions: {
            extractReasoning: (p) => p.choices?.[0]?.delta?.reasoning_content || null
        }
    }),

    // ===================== Local — Ollama =====================

    ollama: chatCompletionsProvider({
        getUrl: () => `${API_KEYS.ollama.replace(/\/+$/, '')}/v1/chat/completions`,
        getHeaders: () => ({ 'Content-Type': 'application/json' }),
        formatOptions: { collapseTextOnly: true },
        bodyExtras: () => ({ stream_options: { include_usage: true } })
    }),

    // ===================== Local — LM Studio =====================

    lmstudio: chatCompletionsProvider({
        getUrl: () => `${API_KEYS.lmstudio.replace(/\/+$/, '')}/v1/chat/completions`,
        getHeaders: () => ({ 'Content-Type': 'application/json' }),
        formatOptions: { collapseTextOnly: true },
        bodyExtras: () => ({ stream_options: { include_usage: true } })
    }),

    // ===================== Local — LLaMA.cpp =====================

    llamacpp: chatCompletionsProvider({
        getUrl: () => `${API_KEYS.llamacpp.replace(/\/+$/, '')}/v1/chat/completions`,
        getHeaders: () => ({ 'Content-Type': 'application/json' }),
        formatOptions: { collapseTextOnly: true },
        bodyExtras: () => ({ stream_options: { include_usage: true } })
    }),

    // ===================== Groq =====================

    groq: chatCompletionsProvider({
        getUrl: () => proxyUrl('groq', 'https://api.groq.com/openai/v1/chat/completions'),
        getHeaders: () => ({ 'Content-Type': 'application/json' })
    }),

    // ===================== Nvidia NIM =====================

    nvidia: chatCompletionsProvider({
        getUrl: () => proxyUrl('nvidia', 'https://integrate.api.nvidia.com/v1/chat/completions'),
        getHeaders: () => ({ 'Content-Type': 'application/json' })
    }),

    // ===================== Cabreras =====================

    cabreras: chatCompletionsProvider({
        getUrl: () => proxyUrl('cabreras', 'https://api.cabreras.ai/v1/chat/completions'),
        getHeaders: () => ({ 'Content-Type': 'application/json' })
    }),

    // ===================== OpenRouter (LLM & Images) =====================

    openrouter: chatCompletionsProvider({
        getUrl: () => proxyUrl('openrouter', 'https://openrouter.ai/api/v1/chat/completions'),
        getHeaders: () => ({
            'Content-Type': 'application/json'
        }),
        // Opt-in usage accounting : OR ajoute `usage.cost` (USD) dans la dernière chunk SSE
        // https://openrouter.ai/docs/use-cases/usage-accounting
        // webSearch : active les server tools `openrouter:web_search` + `openrouter:web_fetch`
        // (paramètres par défaut). Les coûts sont inclus dans `usage.cost`.
        bodyExtras: (modelId, webSearch) => ({
            stream_options: { include_usage: true },
            usage: { include: true },
            ...(webSearch && {
                tools: [
                    { type: 'openrouter:web_search' },
                    { type: 'openrouter:web_fetch' }
                ]
            })
        }),
        parserOptions: {
            extractCitations: (p) => {
                const anns = p.choices?.[0]?.delta?.annotations;
                if (!anns) return null;
                return anns.filter(a => a.type === 'url_citation' && a.url).map(a => ({ url: a.url, title: a.title || '' }));
            },
            accumulateCitations: true
        }
    })
};

// --- 6. streamModel() — dispatcher générique ---

async function streamModel(modelId, conversationHistory, onChunk, onDone, onError, systemPrompt, webSearch, onThinkingChunk, signal, modelParams, fallbackModel) {
    const editeur = getModelEditeur(modelId) || getSearchModelEditeur(modelId);
    const provider = PROVIDERS[editeur];
    if (!provider) {
        // Si un fallback est fourni, on le tente directement
        if (fallbackModel && fallbackModel.model && fallbackModel.provider) {
            console.warn('[Fallback] éditeur inconnu pour ' + modelId + ' → bascule sur ' + fallbackModel.model + ' (' + fallbackModel.provider + ')');
            return streamModel(fallbackModel.model, conversationHistory, onChunk, onDone, onError, systemPrompt, webSearch, onThinkingChunk, signal, modelParams, null);
        }
        onError(new Error(`Éditeur inconnu pour le modèle ${modelId}`)); return;
    }

    // Décharger le modèle local précédent si on change de modèle
    if (_lastLocalModel && _lastLocalModel.id !== modelId) {
        unloadLocalModel(_lastLocalModel.id, _lastLocalModel.editeur);
        _lastLocalModel = null;
    }
    if (isLocalEditeur(editeur)) _lastLocalModel = { id: modelId, editeur };

    try {
        const messages = provider.formatMessages(conversationHistory);

        // Pour les fournisseurs locaux, vérifier que le serveur répond avant d'envoyer
        // la vraie requête. Sinon, le `TypeError: Failed to fetch` du navigateur (souvent
        // dû à CORS ou serveur éteint) remonterait tel quel et serait incompréhensible.
        if (isLocalEditeur(editeur)) {
            const url = API_KEYS[editeur];
            if (!url) throw new Error(`URL du serveur ${editeur === 'ollama' ? 'Ollama' : 'LM Studio'} requise. Renseignez-la dans Configuration.`);
            const baseUrl = url.replace(/\/+$/, '');
            try {
                const ping = await fetch(`${baseUrl}/v1/models`, { signal: AbortSignal.timeout(3000) });
                if (!ping.ok) throw new Error('ping-failed');
            } catch {
                throw new Error(`Serveur ${editeur === 'ollama' ? 'Ollama' : 'LM Studio'} injoignable. Vérifiez qu'il soit bien lancé et que CORS est activé (voir Configuration).`);
            }
        }

        let response;
        try {
            response = await fetch(provider.getUrl(modelId, webSearch), {
                method: 'POST',
                headers: proxyHeaders(editeur, provider.getHeaders()),
                body: JSON.stringify(provider.buildBody(modelId, messages, systemPrompt, webSearch, modelParams)),
                signal
            });
        } catch (netErr) {
            if (netErr?.name === 'AbortError') throw netErr;
            if (isLocalEditeur(editeur)) {
                throw new Error(`Serveur ${editeur === 'ollama' ? 'Ollama' : 'LM Studio'} injoignable pendant l'envoi du message. Vérifiez qu'il soit toujours lancé et que CORS est activé.`);
            }
            throw new Error(`Connexion à ${editeur} impossible. Vérifiez votre connexion réseau, puis réessayez.`);
        }

        if (!response.ok) {
            const err = await response.text();
            throw new Error(`${editeur} API error ${response.status}: ${err}`);
        }

        const parse = provider.createParser(!!onThinkingChunk, webSearch);

        for await (const raw of readSSE(response)) {
            for (const event of parse(raw)) {
                if (event.type === 'chunk') onChunk(event.data);
                else if (event.type === 'thinking' && onThinkingChunk && event.data) onThinkingChunk(event.data);
            }
        }

        // Vider les buffers résiduels (thinkBuffer)
        for (const event of parse.flush()) {
            if (event.type === 'chunk') onChunk(event.data);
            else if (event.type === 'thinking' && onThinkingChunk && event.data) onThinkingChunk(event.data);
        }

        const { usage, citations } = parse.getResult();
        onDone(usage, citations);
    } catch (err) {
        if (err.name === 'AbortError') { onDone(null, []); return; }
        // Fallback : si le modèle échoue et qu'un fallback est fourni, on retry
        if (fallbackModel && fallbackModel.model && fallbackModel.provider) {
            console.warn('[Fallback] échec ' + modelId + ' (' + (err.message || err) + ') → bascule sur ' + fallbackModel.model + ' (' + fallbackModel.provider + ')');
            return streamModel(fallbackModel.model, conversationHistory, onChunk, onDone, onError, systemPrompt, webSearch, onThinkingChunk, signal, modelParams, null);
        }
        onError(err);
    }
}

// --- 7. Providers de génération d'images ---

// Convertit une chaîne base64 en Blob (uploads multipart des images de référence)
function _b64ToBlob(b64, mime) {
    const raw = atob(b64);
    const bytes = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
    return new Blob([bytes], { type: mime });
}

const IMAGE_PROVIDERS = {

    // ===================== OpenAI Image =====================

    openai: {
        async generate(modelId, prompt, referenceImages, signal, format, imageParams) {
            const sizeMap = { square: '1024x1024', vertical: '1024x1536', horizontal: '1536x1024' };
            const size = sizeMap[format] || '1024x1024';
            const quality = imageParams?.quality || 'high';
            const n = imageParams?.n || 1;
            const background = imageParams?.background || 'auto';
            const output_format = imageParams?.output_format || 'png';
            const output_compression = imageParams?.output_compression;
            const moderation = imageParams?.moderation || 'auto';
            const mimeByFormat = { png: 'image/png', jpeg: 'image/jpeg', webp: 'image/webp' };
            const defaultMime = mimeByFormat[output_format] || 'image/png';

            let response;
            if (referenceImages && referenceImages.length > 0) {
                // Avec images de référence : API Images Edits (multipart).
                // Le tool `image_generation` de l'API Responses n'accepte pas
                // gpt-image-1.5 / gpt-image-2 comme `model` (→ 400), alors que
                // /v1/images/edits supporte toute la famille gpt-image — et honore `n`.
                const form = new FormData();
                form.append('model', modelId);
                form.append('prompt', prompt);
                referenceImages.forEach((img, i) => {
                    const mime = img.mimeType || 'image/png';
                    const ext = (mime.split('/')[1] || 'png').split('+')[0];
                    form.append('image[]', _b64ToBlob(img.data, mime), `reference${i + 1}.${ext}`);
                });
                form.append('n', String(n));
                form.append('size', size);
                form.append('quality', quality);
                form.append('background', background);
                form.append('output_format', output_format);
                if ((output_format === 'jpeg' || output_format === 'webp') && output_compression !== undefined) {
                    form.append('output_compression', String(output_compression));
                }
                // `moderation` n'existe pas sur /v1/images/edits : ne pas l'envoyer.

                response = await fetch(proxyUrl('openai', 'https://api.openai.com/v1/images/edits'), {
                    method: 'POST',
                    body: form,
                    signal
                });
            } else {
                // Sans images de référence : API Images classique
                const body = {
                    model: modelId,
                    prompt: prompt,
                    quality,
                    output_format,
                    size,
                    n,
                    background,
                    moderation
                };
                if ((output_format === 'jpeg' || output_format === 'webp') && output_compression !== undefined) {
                    body.output_compression = output_compression;
                }

                response = await fetch(proxyUrl('openai', 'https://api.openai.com/v1/images/generations'), {
                    method: 'POST',
                    headers: proxyHeaders('openai', { 'Content-Type': 'application/json' }),
                    body: JSON.stringify(body),
                    signal
                });
            }

            if (!response.ok) {
                const err = await response.text();
                throw new Error(`OpenAI Image API error ${response.status}: ${err}`);
            }

            // Les deux endpoints (generations et edits) renvoient le même format
            // de réponse : { data: [{ b64_json, revised_prompt? }, ...] }.
            const data = await response.json();
            const result = { text: '', images: [], usage: null, imageCount: 0 };

            for (const item of (data.data || [])) {
                if (item.revised_prompt && !result.text) result.text = item.revised_prompt;
                if (item.b64_json) {
                    result.images.push({ b64: item.b64_json, mimeType: defaultMime });
                    result.imageCount++;
                }
            }

            return result;
        }
    },

    // ===================== Google Gemini Image =====================

    google: {
        async generate(modelId, prompt, referenceImages, signal, format, imageParams) {
            const aspectMap = { square: '1:1', vertical: '9:16', horizontal: '16:9' };
            const aspectRatio = imageParams?.geminiAspectRatio || aspectMap[format] || '1:1';
            const imageSize = imageParams?.imageSize || '1K';
            const thinkingLevel = imageParams?.thinkingLevel || 'minimal';

            const base = `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:generateContent`;
            const url = proxyUrl('google', base);

            const parts = [];
            if (referenceImages && referenceImages.length > 0) {
                for (const img of referenceImages) {
                    parts.push({
                        inline_data: {
                            mime_type: img.mimeType || 'image/png',
                            data: img.data
                        }
                    });
                }
            }
            parts.push({ text: prompt });

            const generationConfig = {
                responseModalities: ['TEXT', 'IMAGE'],
                imageConfig: { aspectRatio, imageSize },
                thinkingConfig: { thinkingLevel }
            };
            const body = {
                contents: [{ role: 'user', parts }],
                generationConfig
            };

            const response = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
                signal
            });

            if (!response.ok) {
                const err = await response.text();
                throw new Error(`Gemini Image API error ${response.status}: ${err}`);
            }

            const data = await response.json();
            const result = { text: '', images: [], usage: { input_tokens: 0, output_tokens: 0 }, imageCount: 0 };

            const responseParts = data.candidates?.[0]?.content?.parts || [];
            for (const part of responseParts) {
                if (part.text) result.text += part.text;
                const imgData = part.inline_data || part.inlineData;
                if (imgData) {
                    result.images.push({
                        b64: imgData.data,
                        mimeType: imgData.mime_type || imgData.mimeType || 'image/png'
                    });
                    result.imageCount++;
                }
            }

            if (data.usageMetadata) {
                result.usage.input_tokens = data.usageMetadata.promptTokenCount || 0;
                result.usage.output_tokens = data.usageMetadata.candidatesTokenCount || 0;
            }

            return result;
        }
    }
    ,

    // ===================== OpenRouter (image generation) =====================
    // Spec : https://openrouter.ai/docs/guides/overview/multimodal/image-generation

    openrouter: {
        async generate(modelId, prompt, referenceImages, signal, format, imageParams) {
            const aspectMap = { square: '1:1', vertical: '9:16', horizontal: '16:9' };
            // Priorité au ratio précis (rp-gemini-ratio-select) s'il est défini, sinon mapping des boutons format
            const aspectRatio = imageParams?.geminiAspectRatio || aspectMap[format] || '1:1';

            // Construire le contenu du message
            const content = [];
            if (referenceImages && referenceImages.length > 0) {
                for (const img of referenceImages) {
                    content.push({
                        type: 'image_url',
                        image_url: { url: `data:${img.mimeType || 'image/png'};base64,${img.data}` }
                    });
                }
            }
            content.push({ type: 'text', text: prompt });

            // modalities : ['image','text'] pour les modèles hybrides (Gemini), ['image'] sinon (Flux, Sourceful)
            const modelMeta = IMAGE_MODELS.find(x => x.id === modelId);
            const supportsTextOutput = Array.isArray(modelMeta?.outputModalities)
                && modelMeta.outputModalities.includes('text');
            const modalities = supportsTextOutput ? ['image', 'text'] : ['image'];

            const imageConfig = { aspect_ratio: aspectRatio };
            if (imageParams?.imageSize) imageConfig.image_size = imageParams.imageSize;

            const body = {
                model: modelId,
                messages: [{ role: 'user', content }],
                modalities,
                stream: false,
                image_config: imageConfig,
                // Opt-in usage accounting → response.usage.cost en USD
                usage: { include: true }
            };

            // Seed : top-level (pas dans image_config). Forwardé seulement si le modèle le déclare.
            if (imageParams?.seed != null
                && Array.isArray(modelMeta?.supportedParameters)
                && modelMeta.supportedParameters.includes('seed')) {
                body.seed = imageParams.seed;
            }

            const response = await fetch(proxyUrl('openrouter', 'https://openrouter.ai/api/v1/chat/completions'), {
                method: 'POST',
                headers: proxyHeaders('openrouter', { 'Content-Type': 'application/json' }),
                body: JSON.stringify(body),
                signal
            });

            if (!response.ok) {
                const errText = await response.text();
                // Détecter les erreurs de modération (Content Policy Violation)
                try {
                    const errJson = JSON.parse(errText);
                    const meta = errJson?.error?.metadata;
                    if (meta?.raw) {
                        try {
                            const raw = JSON.parse(meta.raw);
                            if (raw?.details?.['Moderation Reasons']?.length) {
                                const reasons = raw.details['Moderation Reasons'].join(', ');
                                throw new Error(`Votre prompt a été refusé par le fournisseur d'images (${meta.provider_name || 'inconnu'}) pour violation de sa politique de contenu.\n\nRaison : ${reasons}\n\nModifiez votre prompt et réessayez.`);
                            }
                            if (raw?.status === 'Request Moderated') {
                                throw new Error(`Votre prompt a été refusé par le fournisseur d'images (${meta.provider_name || 'inconnu'}) pour violation de sa politique de contenu.\n\nModifiez votre prompt et réessayez.`);
                            }
                        } catch (parseErr) {
                            if (parseErr.message.startsWith('Votre prompt')) throw parseErr;
                        }
                    }
                } catch (parseErr) {
                    if (parseErr.message.startsWith('Votre prompt')) throw parseErr;
                }
                throw new Error(`OpenRouter Image API error ${response.status}: ${errText}`);
            }

            const data = await response.json();
            const result = { text: '', images: [], usage: null, imageCount: 0 };

            const msg = data.choices?.[0]?.message;
            if (msg) {
                if (msg.content) result.text = msg.content;
                const imgs = msg.images || [];
                for (const img of imgs) {
                    const url = img.image_url?.url || img.url || '';
                    const match = url.match(/^data:([^;]+);base64,(.+)$/);
                    if (match) {
                        result.images.push({ b64: match[2], mimeType: match[1] });
                    } else if (url) {
                        result.images.push({ b64: url, mimeType: 'image/png' });
                    }
                    result.imageCount++;
                }
            }

            if (data.usage) {
                const c = parseFloat(data.usage.cost);
                result.usage = {
                    input_tokens: data.usage.prompt_tokens || 0,
                    output_tokens: data.usage.completion_tokens || 0,
                    cost_real: (!isNaN(c) && c >= 0) ? c : null
                };
            }

            return result;
        }
    }
};

// --- 8. generateImage() — dispatcher générique ---

async function generateImage(modelId, prompt, onDone, onError, referenceImages, signal, format, imageParams) {
    const editeur = getImageModelEditeur(modelId);
    const imageProvider = IMAGE_PROVIDERS[editeur];
    if (!imageProvider) { onError(new Error(`Éditeur inconnu pour le modèle image ${modelId}`)); return; }

    try {
        const result = await imageProvider.generate(modelId, prompt, referenceImages, signal, format, imageParams);
        onDone(result);
    } catch (err) {
        if (err.name === 'AbortError') { onDone({ text: '', images: [], usage: null, imageCount: 0 }); return; }
        onError(err);
    }
}

// --- 9. Audio (TTS + STT) + Paramètres modèles ---

let AUDIO_SETTINGS = { ttsProvider: 'system-tts', sttProvider: '', enhanceModel: '', summaryModel: '', errorExplainerModel: '', titleModel: '' };

function loadAudioSettings() {
    try {
        const stored = localStorage.getItem('minou-audio-settings');
        if (stored) Object.assign(AUDIO_SETTINGS, JSON.parse(stored));
        // Migration des IDs renommés (ex. sortie de preview Gemini)
        AUDIO_SETTINGS.ttsProvider = migrateModelId(AUDIO_SETTINGS.ttsProvider);
        AUDIO_SETTINGS.sttProvider = migrateModelId(AUDIO_SETTINGS.sttProvider);
        // Migration : ancienne valeur stockée par éditeur → id de modèle
        const migrateByEditeur = (value, category) => {
            if (!value) return value;
            if (MODELS_DATA[category].some(m => m.id === value)) return value;
            if (value === 'system') return 'system-tts';
            const match = MODELS_DATA[category].find(m => m.editeur === value);
            return match ? match.id : value;
        };
        const beforeTts = AUDIO_SETTINGS.ttsProvider;
        const beforeStt = AUDIO_SETTINGS.sttProvider;
        AUDIO_SETTINGS.ttsProvider = migrateByEditeur(AUDIO_SETTINGS.ttsProvider, 'tts');
        AUDIO_SETTINGS.sttProvider = migrateByEditeur(AUDIO_SETTINGS.sttProvider, 'stt');
        // Ne réécrire en localStorage que si la migration a effectivement changé une valeur.
        if (AUDIO_SETTINGS.ttsProvider !== beforeTts || AUDIO_SETTINGS.sttProvider !== beforeStt) {
            localStorage.setItem('minou-audio-settings', JSON.stringify(AUDIO_SETTINGS));
        }
    } catch (e) {
        console.warn('Lecture des paramètres audio impossible (localStorage corrompu) :', e);
    }
}

function saveAudioSettings(settings) {
    Object.assign(AUDIO_SETTINGS, settings);
    localStorage.setItem('minou-audio-settings', JSON.stringify(AUDIO_SETTINGS));
}

// Convertit du PCM brut 16-bit mono en blob WAV (pour Gemini TTS)
function pcmToWavBlob(pcmBase64, sampleRate = 24000) {
    const raw = atob(pcmBase64);
    const pcm = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) pcm[i] = raw.charCodeAt(i);
    const numChannels = 1, bitsPerSample = 16;
    const byteRate = sampleRate * numChannels * bitsPerSample / 8;
    const buf = new ArrayBuffer(44 + pcm.length);
    const v = new DataView(buf);
    const s = (off, str) => { for (let i = 0; i < str.length; i++) v.setUint8(off + i, str.charCodeAt(i)); };
    s(0, 'RIFF'); v.setUint32(4, 36 + pcm.length, true);
    s(8, 'WAVE'); s(12, 'fmt ');
    v.setUint32(16, 16, true); v.setUint16(20, 1, true);
    v.setUint16(22, numChannels, true); v.setUint32(24, sampleRate, true);
    v.setUint32(28, byteRate, true); v.setUint16(32, numChannels * bitsPerSample / 8, true);
    v.setUint16(34, bitsPerSample, true);
    s(36, 'data'); v.setUint32(40, pcm.length, true);
    new Uint8Array(buf).set(pcm, 44);
    return new Blob([buf], { type: 'audio/wav' });
}

async function ttsSpeak(text, onDone, onError, silent = false, onPlayingStart = null, onPlayingEnd = null) {
    const ttsModel = MODELS_DATA.tts.find(m => m.id === AUDIO_SETTINGS.ttsProvider);
    const ttsEditeur = ttsModel?.editeur;
    if (ttsEditeur === 'system') {
        try {
            if (!window.speechSynthesis) throw new Error('La synthèse vocale native n\'est pas supportée par ce navigateur.');
            const utterance = new SpeechSynthesisUtterance(text);
            utterance.lang = 'fr-FR';
            utterance.onend = () => onDone(null, text.length);
            utterance.onerror = (e) => {
                // Une interruption manuelle (cancel) ne doit pas remonter d'erreur
                if (e.error === 'interrupted' || e.error === 'canceled') {
                    onDone(null, text.length);
                    return;
                }
                onError(new Error('Erreur synthèse vocale système : ' + e.error));
            };
            window.speechSynthesis.speak(utterance);
        } catch (err) { onError(err); }
        return;
    }

    if (ttsEditeur === 'google') {
        try {
            const response = await fetch(
                proxyUrl('google', `https://generativelanguage.googleapis.com/v1beta/models/${ttsModel.id}:generateContent`),
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        contents: [{ parts: [{ text }] }],
                        generationConfig: {
                            responseModalities: ['AUDIO'],
                            speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Aoede' } } }
                        }
                    })
                }
            );
            if (!response.ok) {
                const err = await response.text();
                throw new Error(`Google TTS error ${response.status}: ${err}`);
            }
            const data = await response.json();
            const part = data.candidates?.[0]?.content?.parts?.[0]?.inlineData;
            if (!part) throw new Error('Réponse Google TTS invalide');
            const blob = pcmToWavBlob(part.data);
            onDone(blob, text.length);
        } catch (err) { onError(err); }
        return;
    }

    if (ttsEditeur === 'mistral') {
        let stopped = false;
        let reader = null;
        let audioCtx = null;
        const sources = [];
        const stopHandle = () => {
            stopped = true;
            try { reader?.cancel(); } catch (e) {}
            for (const s of sources) { try { s.stop(); } catch (e) {} }
            if (audioCtx) { try { audioCtx.close(); } catch (e) {} audioCtx = null; }
        };
        try {
            const response = await fetch(proxyUrl('mistral', 'https://api.mistral.ai/v1/audio/speech'), {
                method: 'POST',
                headers: proxyHeaders('mistral', { 'Content-Type': 'application/json' }),
                body: JSON.stringify({
                    model: ttsModel.id,
                    input: text,
                    response_format: 'pcm',
                    voice_id: 'fr_marie_neutral',
                    stream: true
                })
            });
            if (!response.ok) {
                const err = await response.text();
                throw new Error(`Mistral TTS error ${response.status}: ${err}`);
            }
            audioCtx = silent ? null : new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 24000 });
            const pcmChunks = [];
            let nextStartTime = audioCtx ? audioCtx.currentTime : 0;
            let playStarted = false;
            reader = response.body.getReader();
            const decoder = new TextDecoder();
            let buffer = '';
            while (!stopped) {
                const { done, value } = await reader.read();
                if (done) break;
                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split('\n');
                buffer = lines.pop();
                for (const line of lines) {
                    if (stopped) break;
                    if (!line.startsWith('data: ')) continue;
                    const json = line.slice(6).trim();
                    if (json === '[DONE]') continue;
                    try {
                        const evt = JSON.parse(json);
                        const b64 = evt.audio_data;
                        if (!b64) continue;
                        const raw = atob(b64);
                        const buf = new ArrayBuffer(raw.length);
                        const pcmBytes = new Uint8Array(buf);
                        for (let i = 0; i < raw.length; i++) pcmBytes[i] = raw.charCodeAt(i);
                        pcmChunks.push(pcmBytes);
                        // Décoder PCM float32 LE mono via DataView pour lecture immédiate
                        if (audioCtx) {
                            const dv = new DataView(buf);
                            const numSamples = buf.byteLength / 4;
                            const samples = new Float32Array(numSamples);
                            for (let i = 0; i < numSamples; i++) samples[i] = dv.getFloat32(i * 4, true);
                            const abuf = audioCtx.createBuffer(1, samples.length, 24000);
                            abuf.getChannelData(0).set(samples);
                            const src = audioCtx.createBufferSource();
                            src.buffer = abuf;
                            src.connect(audioCtx.destination);
                            const when = Math.max(nextStartTime, audioCtx.currentTime);
                            src.start(when);
                            sources.push(src);
                            nextStartTime = when + abuf.duration;
                            if (!playStarted) {
                                playStarted = true;
                                if (onPlayingStart) onPlayingStart(stopHandle);
                            }
                        }
                    } catch (e) {}
                }
            }
            if (stopped) {
                if (onPlayingEnd) onPlayingEnd();
                onDone(null, text.length, true);
                return;
            }
            // Assembler les float32 et convertir en int16 pour le WAV final
            const totalBytes = pcmChunks.reduce((s, c) => s + c.length, 0);
            const allBytes = new Uint8Array(totalBytes);
            let off = 0;
            for (const c of pcmChunks) { allBytes.set(c, off); off += c.length; }
            const allFloats = new Float32Array(allBytes.buffer);
            const int16 = new Int16Array(allFloats.length);
            for (let i = 0; i < allFloats.length; i++) {
                const s = Math.max(-1, Math.min(1, allFloats[i]));
                int16[i] = s < 0 ? s * 32768 : s * 32767;
            }
            const pcmData = new Uint8Array(int16.buffer);
            const numCh = 1, bps = 16, sr = 24000;
            const wavBuf = new ArrayBuffer(44 + pcmData.length);
            const wv = new DataView(wavBuf);
            const ws = (o, s) => { for (let i = 0; i < s.length; i++) wv.setUint8(o + i, s.charCodeAt(i)); };
            ws(0, 'RIFF'); wv.setUint32(4, 36 + pcmData.length, true);
            ws(8, 'WAVE'); ws(12, 'fmt ');
            wv.setUint32(16, 16, true); wv.setUint16(20, 1, true);
            wv.setUint16(22, numCh, true); wv.setUint32(24, sr, true);
            wv.setUint32(28, sr * numCh * bps / 8, true);
            wv.setUint16(32, numCh * bps / 8, true); wv.setUint16(34, bps, true);
            ws(36, 'data'); wv.setUint32(40, pcmData.length, true);
            new Uint8Array(wavBuf).set(pcmData, 44);
            const wavBlob = new Blob([wavBuf], { type: 'audio/wav' });
            // Attendre la fin de la lecture avant de signaler la fin et de fermer le contexte
            if (audioCtx) {
                const endDelay = Math.max(0, (nextStartTime - audioCtx.currentTime) * 1000) + 100;
                setTimeout(() => {
                    try { audioCtx?.close(); } catch (e) {}
                    if (!stopped && onPlayingEnd) onPlayingEnd();
                    onDone(wavBlob, text.length, !silent);
                }, endDelay);
            } else {
                onDone(wavBlob, text.length, !silent);
            }
        } catch (err) {
            if (stopped) return;
            onError(err);
        }
        return;
    }

    // OpenAI TTS (défaut)
    try {
        const openaiModel = ttsEditeur === 'openai' ? ttsModel : MODELS_DATA.tts.find(m => m.editeur === 'openai');
        const response = await fetch(proxyUrl('openai', 'https://api.openai.com/v1/audio/speech'), {
            method: 'POST',
            headers: proxyHeaders('openai', { 'Content-Type': 'application/json' }),
            body: JSON.stringify({
                model: openaiModel.id,
                input: text,
                voice: 'coral',
                instructions: 'Parle en français de France, avec une prononciation native parfaite, sans aucun accent étranger. Ton naturel et fluide.'
            })
        });
        if (!response.ok) {
            const err = await response.text();
            throw new Error(`OpenAI TTS error ${response.status}: ${err}`);
        }
        const blob = await response.blob();
        onDone(blob, text.length);
    } catch (err) { onError(err); }
}

async function transcribeAudio(audioBlob, onDone, onError) {
    const sttModel = MODELS_DATA.stt.find(m => m.id === AUDIO_SETTINGS.sttProvider);
    const sttEditeur = sttModel?.editeur;
    if (sttEditeur === 'google') {
        try {
            const base64 = await new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = () => resolve(reader.result.split(',')[1]);
                reader.onerror = reject;
                reader.readAsDataURL(audioBlob);
            });
            const response = await fetch(
                proxyUrl('google', `https://generativelanguage.googleapis.com/v1beta/models/${sttModel.id}:generateContent`),
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        contents: [{
                            parts: [
                                { inlineData: { mimeType: 'audio/webm', data: base64 } },
                                { text: 'Transcris cet audio en français. Réponds uniquement avec la transcription, sans commentaire.' }
                            ]
                        }]
                    })
                }
            );
            if (!response.ok) {
                const err = await response.text();
                throw new Error(`Google STT error ${response.status}: ${err}`);
            }
            const data = await response.json();
            const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
            onDone(text.trim());
        } catch (err) { onError(err); }
        return;
    }

    if (sttEditeur === 'mistral') {
        try {
            const formData = new FormData();
            formData.append('file', audioBlob, 'audio.webm');
            formData.append('model', sttModel.id);
            formData.append('language', 'fr');
            const response = await fetch(proxyUrl('mistral', 'https://api.mistral.ai/v1/audio/transcriptions'), {
                method: 'POST',
                headers: proxyHeaders('mistral', {}),
                body: formData
            });
            if (!response.ok) {
                const err = await response.text();
                throw new Error(`Mistral STT error ${response.status}: ${err}`);
            }
            const data = await response.json();
            onDone(data.text);
        } catch (err) { onError(err); }
        return;
    }

    // OpenRouter Whisper (via proxy)
    if (sttEditeur === 'openrouter') {
        try {
            const formData = new FormData();
            formData.append('file', audioBlob, 'audio.webm');
            formData.append('model', sttModel.id);
            formData.append('language', 'fr');
            const response = await fetch(proxyUrl('openrouter', 'https://openrouter.ai/api/v1/audio/transcriptions'), {
                method: 'POST',
                headers: proxyHeaders('openrouter', {}),
                body: formData
            });
            if (!response.ok) {
                const err = await response.text();
                throw new Error(`OpenRouter STT error ${response.status}: ${err}`);
            }
            const data = await response.json();
            onDone(data.text);
        } catch (err) { onError(err); }
        return;
    }

    // OpenAI Whisper (défaut)
    try {
        const openaiSttModel = sttEditeur === 'openai' ? sttModel : MODELS_DATA.stt.find(m => m.editeur === 'openai');
        const formData = new FormData();
        formData.append('file', audioBlob, 'audio.webm');
        formData.append('model', openaiSttModel.id);
        formData.append('language', 'fr');
        const response = await fetch(proxyUrl('openai', 'https://api.openai.com/v1/audio/transcriptions'), {
            method: 'POST',
            headers: proxyHeaders('openai', {}),
            body: formData
        });
        if (!response.ok) {
            const err = await response.text();
            throw new Error(`Whisper API error ${response.status}: ${err}`);
        }
        const data = await response.json();
        onDone(data.text);
    } catch (err) { onError(err); }
}

// --- 10. Streaming texte multi-provider (utilitaire partagé) ---

async function streamText(modelId, prompt, onDelta) {
    const localModel = MODELS.find(m => m.id === modelId && isLocalEditeur(m.editeur));
    const isLocal = modelId === '__local__' || !!localModel;
    const model = isLocal ? null : MODELS_DATA.text.find(m => m.id === modelId);
    const editeur = isLocal
        ? (localModel?.editeur || (API_KEYS.ollama ? 'ollama' : 'lmstudio'))
        : (model?.editeur || getModelEditeur(modelId));
    // Modèle introuvable, soit un modèle local (Ollama éteint), soit un modèle déprécié retiré de models.js.
    if (!editeur) {
        if (AUDIO_SETTINGS.localFallbackModel && AUDIO_SETTINGS.localFallbackModel !== 'none') {
            return streamText(AUDIO_SETTINGS.localFallbackModel, prompt, onDelta);
        }
        const looksLocal = /:|^llama|^qwen|^mistral|^gemma|^phi|^deepseek-r1/i.test(modelId);
        if (looksLocal) {
            throw new Error(`Modèle introuvable : "${modelId}". Vérifiez que votre serveur local est bien lancé, ou configurez un modèle de secours dans Configuration > Modèles.`);
        }
        throw new Error(`Modèle introuvable : "${modelId}". Ce modèle n'est plus disponible dans le catalogue, sélectionnez-en un autre dans le menu.`);
    }

    // Vérifier la clé API (locaux uniquement — le proxy gère l'auth pour les cloud)
    if (isLocalEditeur(editeur)) {
        if (!API_KEYS[editeur]) throw new Error(`URL du serveur ${editeur === 'ollama' ? 'Ollama' : editeur === 'lmstudio' ? 'LM Studio' : 'LLaMA.cpp'} requise. Renseignez-la dans Configuration.`);
    }

    const provider = PROVIDERS[editeur];
    const actualModelId = isLocal ? (modelId === '__local__' ? (MODELS.find(m => isLocalEditeur(m.editeur))?.id || '') : modelId) : modelId;
    const messages = provider.formatMessages([{ role: 'user', content: prompt }]);
    const body = provider.buildBody(actualModelId, messages, null, false);

    let response;
    try {
        // Vérifier que le serveur local est joignable avant d'envoyer la requête
        if (isLocal) {
            const baseUrl = API_KEYS[editeur].replace(/\/+$/, '');
            try {
                const ping = await fetch(`${baseUrl}/v1/models`, { signal: AbortSignal.timeout(3000) });
                if (!ping.ok) throw new Error();
            } catch {
                throw new Error(`Serveur ${editeur === 'ollama' ? 'Ollama' : 'LM Studio'} injoignable. Vérifiez qu'il soit bien lancé.`);
            }
        }
        const fetchOpts = { method: 'POST', headers: provider.getHeaders(), body: JSON.stringify(body) };
        response = await fetch(provider.getUrl(actualModelId), fetchOpts);
        if (!response.ok) throw new Error(`Erreur API ${editeur} : ${response.status}`);
    } catch (fetchErr) {
        // Si modèle local indisponible → tenter le modèle de secours
        if (isLocal && AUDIO_SETTINGS.localFallbackModel && AUDIO_SETTINGS.localFallbackModel !== 'none') {
            return streamText(AUDIO_SETTINGS.localFallbackModel, prompt, onDelta);
        }
        throw fetchErr;
    }

    const parse = provider.createParser(false);
    let result = '';
    for await (const raw of readSSE(response)) {
        for (const event of parse(raw)) {
            if (event.type === 'chunk') {
                result += event.data;
                if (onDelta) onDelta(event.data);
            }
        }
    }
    for (const event of parse.flush()) {
        if (event.type === 'chunk') {
            result += event.data;
            if (onDelta) onDelta(event.data);
        }
    }
    const { usage } = parse.getResult();
    return { text: result, usage };
}

// --- 11. Amélioration de prompt ---

const ENHANCE_PROMPT_TEMPLATE = `Tu es un expert en prompt engineering. Voici un prompt écrit par un utilisateur pour une IA conversationnelle :\n\n---\n{TEXT}\n---\n\nAméliore ce prompt pour obtenir un meilleur résultat de l'IA. Tu dois :\n- Conserver fidèlement l'intention et le sens du prompt original\n- Ne pas dénaturer ni changer le sujet ou la demande\n- Compléter, reformuler, structurer et préciser le prompt\n- Ajouter du contexte utile si nécessaire\n- Rendre les instructions plus claires et sans ambiguïté\n\nRéponds UNIQUEMENT avec le prompt amélioré. Pas d'introduction, pas de conclusion, pas de commentaire, pas de texte avant ou après. Ne commence pas par "Voici" ou toute autre phrase d'accroche. Retourne directement le contenu du prompt optimisé, rien d'autre.`;

const ENHANCE_IMAGE_PROMPT_TEMPLATE = `Tu es un expert en génération d'images par IA. Voici un prompt de génération d'image brut :\n\n---\n{TEXT}\n---\n\nAméliore ce prompt pour obtenir une meilleure image générée par IA. Tu dois :\n- Conserver fidèlement l'intention et le sujet de l'image demandée\n- Ajouter des détails visuels précis (éclairage, angle, style, couleurs, composition, ambiance)\n- Préciser le style artistique si pertinent (photoréaliste, illustration, peinture, 3D, etc.)\n- Structurer le prompt de manière optimale pour un modèle de génération d'image\n- Rester en anglais pour une meilleure compatibilité avec les modèles d'image\n- Ne jamais citer de personnages, œuvres, marques, logos ou noms protégés par le droit d'auteur ; reformuler en décrivant les caractéristiques visuelles à la place\n\nRéponds UNIQUEMENT avec le prompt amélioré. Pas d'introduction, pas de conclusion, pas de commentaire, pas de texte avant ou après. Ne commence pas par "Voici" ou toute autre phrase d'accroche. Retourne directement le contenu du prompt optimisé, rien d'autre.`;

async function enhancePrompt(text, onDelta, onDone, onError, isImage = false) {
    const template = isImage ? ENHANCE_IMAGE_PROMPT_TEMPLATE : ENHANCE_PROMPT_TEMPLATE;
    const prompt = template.replace('{TEXT}', text);
    const modelId = AUDIO_SETTINGS.enhanceModel || 'gpt-4.1-2025-04-14';
    try {
        await streamText(modelId, prompt, onDelta);
        onDone();
    } catch (err) { onError(err); }
}

// Erreurs déjà rédigées en français clair côté Cetas, ne pas demander une "explication" au LLM
// qui finirait par halluciner ("vérifiez votre internet" alors que c'est CORS, etc.).
function isSelfExplainedError(errorMessage) {
    if (!errorMessage) return false;
    const m = String(errorMessage);
    return /injoignable|requise\. Renseignez|Modèle introuvable|catalogue, sélectionnez|Connexion à .* impossible|CORS/i.test(m);
}

async function explainError(userMessage, fileNames, modelUsed, errorMessage) {
    if (isSelfExplainedError(errorMessage)) return null;
    const modelId = AUDIO_SETTINGS.errorExplainerModel;
    if (!modelId) return null;
    const prompt = `Tu es un assistant qui aide les utilisateurs d'une application de chat IA. L'utilisateur a envoyé un message et une erreur est survenue. Explique en 1 à 2 phrases simples et claires en français quel est le problème. Ne mentionne pas de détails techniques JSON. Sois concis et utile.

Message de l'utilisateur (extrait) : ${(userMessage || '').slice(0, 300)}
${fileNames.length ? 'Fichiers joints : ' + fileNames.join(', ') : ''}
Modèle utilisé : ${modelUsed || 'inconnu'}
Erreur retournée : ${errorMessage}

Explication :`;
    try {
        return (await streamText(modelId, prompt)).text;
    } catch (e) {
        return null;
    }
}

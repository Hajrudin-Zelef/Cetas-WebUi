// --- Gestion des conversations via IndexedDB ---
// Compteur de writes en cours pour beforeunload
var _pendingWrites = 0;
var _pendingWritesResolve = null;

function _trackWrite(p) {
    _pendingWrites++;
    var tracked = p.finally(function() {
        _pendingWrites--;
        if (_pendingWrites === 0 && _pendingWritesResolve) {
            _pendingWritesResolve();
            _pendingWritesResolve = null;
        }
    });
    return tracked;
}

function flushPendingWrites() {
    if (_pendingWrites === 0) return Promise.resolve();
    return new Promise(function(r) { _pendingWritesResolve = r; });
}

var _dbPromise = null;

function openConvDB() {
    if (_dbPromise) return _dbPromise;
    _dbPromise = new Promise(function(resolve, reject) {
        var req = indexedDB.open('minou_conversations', 1);
        req.onupgradeneeded = function() {
            var db = req.result;
            if (!db.objectStoreNames.contains('conversations')) {
                db.createObjectStore('conversations');
            }
        };
        req.onsuccess = function() {
            var db = req.result;
            db.addEventListener('close', function() { _dbPromise = null; });
            db.addEventListener('error', function() { _dbPromise = null; });
            resolve(db);
        };
        req.onerror = function() {
            _dbPromise = null;
            reject(req.error);
        };
    });
    return _dbPromise;
}

// Sérialise les writes par filename pour éviter les races read-modify-write entre
// `saveConversation` (synchrone, write non-awaité) et `_saveConvById` (read+merge+write).
// Sans cette coordination, deux writes concurrents sur la même clé peuvent perdre
// des updates (deltas tokens, message d'erreur poussé, titre généré).
const _writeQueues = new Map();

// --- Manifeste de métadonnées en mémoire ----------------------------------
// `listConversationFiles` est appelée à chaque sauvegarde (refresh sidebar) :
// scanner toute la BD à chaque appel devient coûteux dès qu'il y a beaucoup
// de conversations. On maintient un cache `filename → metadata` synchronisé
// par les writes ; la lecture devient O(N convs) au lieu de O(taille BD).
const _convMetaManifest = new Map();
let _convMetaSeeded = false;
let _convMetaSeedPromise = null;

// Hook optionnel : le panneau Stockage l'enregistre pour invalider son cache
// quand une conversation est mutée hors de ses propres mutations locales.
let _onConvMutated = null;
function setOnConvMutated(fn) { _onConvMutated = fn; }

function _parseConvRaw(raw) {
    if (raw == null) return null;
    try { return typeof raw === 'string' ? JSON.parse(raw) : raw; }
    catch { return null; }
}

// Extrait juste le texte du premier message (string ou content multimodal),
// borné — la sidebar n'utilise que les ~30 premiers caractères en fallback.
// Évite de garder en mémoire de larges base64 d'images dans le manifeste.
function _extractFirstMessageText(messages) {
    if (!Array.isArray(messages) || messages.length === 0) return '';
    const content = messages[0].content;
    let text = '';
    if (typeof content === 'string') text = content;
    else if (Array.isArray(content)) {
        for (const part of content) {
            if (part && part.type === 'text' && part.text) { text = part.text; break; }
        }
    }
    return text.length > 200 ? text.slice(0, 200) : text;
}

function _extractConvMetadata(filename, data) {
    return {
        filename,
        id: data.id,
        titre: data.titre || null,
        date: data.date,
        lastActivity: data.lastActivity || data.date,
        modele: data.modele,
        firstMessage: _extractFirstMessageText(data.messages),
        tokens_entree: data.tokens_entree || 0,
        tokens_sortie: data.tokens_sortie || 0,
        cout_estime_usd: data.cout_estime_usd || 0,
        cost_by_model: data.cost_by_model || null,
        category: data.category || null,
        deleted: data.deleted || false
    };
}

async function _seedConvMetaManifest() {
    if (_convMetaSeeded) return;
    if (_convMetaSeedPromise) return _convMetaSeedPromise;
    _convMetaSeedPromise = (async () => {
        try {
            const db = await openConvDB();
            const tx = db.transaction('conversations', 'readonly');
            const store = tx.objectStore('conversations');
            const [keys, allValues] = await Promise.all([
                new Promise((resolve) => {
                    const req = store.getAllKeys();
                    req.onsuccess = () => resolve(req.result);
                    req.onerror = () => resolve([]);
                }),
                new Promise((resolve) => {
                    const req = store.getAll();
                    req.onsuccess = () => resolve(req.result);
                    req.onerror = () => resolve([]);
                })
            ]);
            for (let i = 0; i < keys.length; i++) {
                // Ne pas écraser une entrée déjà présente : un write concurrent
                // pendant le seed est plus récent que la lecture du seed.
                if (_convMetaManifest.has(keys[i])) continue;
                const data = _parseConvRaw(allValues[i]);
                if (!data) continue;
                _convMetaManifest.set(keys[i], _extractConvMetadata(keys[i], data));
            }
            _convMetaSeeded = true;
        } catch (e) {
            console.error('Erreur seed manifest:', e);
            _convMetaSeedPromise = null; // permettre une nouvelle tentative
        }
    })();
    return _convMetaSeedPromise;
}

function _updateConvMetaInManifest(filename, content) {
    const data = _parseConvRaw(content);
    if (!data) return;
    _convMetaManifest.set(filename, _extractConvMetadata(filename, data));
}

function _afterConvWrite(filename, content) {
    _updateConvMetaInManifest(filename, content);
    if (_onConvMutated) {
        try { _onConvMutated(filename); } catch (e) { console.warn(e); }
    }
}

async function writeConversationFile(filename, content) {
    const prev = _writeQueues.get(filename) || Promise.resolve();
    const next = prev.then(async () => {
        try {
            const db = await openConvDB();
            const tx = db.transaction('conversations', 'readwrite');
            tx.objectStore('conversations').put(content, filename);
            return new Promise((resolve) => {
                tx.oncomplete = () => {
                    _afterConvWrite(filename, content);
                    resolve(true);
                };
                tx.onerror = () => resolve(false);
            });
        } catch (e) {
            console.error('Erreur écriture conversation:', e);
            return false;
        }
    });
    const guarded = next.catch(() => {});
    _trackWrite(guarded);
    _writeQueues.set(filename, guarded);
    // Nettoyage de la file une fois le write terminé pour éviter une fuite mémoire
    // (les noms de fichiers sont uniques par conversation, donc la map peut grossir).
    guarded.finally(() => {
        if (_writeQueues.get(filename) === guarded) _writeQueues.delete(filename);
    });
    return next;
}

async function listConversationFiles(includeDeleted = false) {
    try {
        await _seedConvMetaManifest();
        const conversations = [];
        for (const meta of _convMetaManifest.values()) {
            if (meta.deleted && !includeDeleted) continue;
            // Copie défensive : les consommateurs ne doivent pas pouvoir muter le cache.
            conversations.push({ ...meta });
        }
        conversations.sort((a, b) => (b.lastActivity || b.date || '').localeCompare(a.lastActivity || a.date || ''));
        return conversations;
    } catch (e) {
        console.error('Erreur lecture conversations:', e);
        return [];
    }
}

// Accès direct au manifeste (lecture seule) — pratique pour les mises à jour
// incrémentales d'UI qui veulent les meta d'un seul fichier.
function getConvMetadata(filename) {
    const meta = _convMetaManifest.get(filename);
    return meta ? { ...meta } : null;
}

async function loadConvFullTexts() {
    try {
        const db = await openConvDB();
        const tx = db.transaction('conversations', 'readonly');
        const store = tx.objectStore('conversations');
        const [keys, allValues] = await Promise.all([
            new Promise((r) => { const req = store.getAllKeys(); req.onsuccess = () => r(req.result); req.onerror = () => r([]); }),
            new Promise((r) => { const req = store.getAll(); req.onsuccess = () => r(req.result); req.onerror = () => r([]); })
        ]);
        const result = {};
        for (let i = 0; i < keys.length; i++) {
            try {
                const raw = allValues[i];
                if (!raw) continue;
                const data = typeof raw === 'string' ? JSON.parse(raw) : raw;
                if (data.deleted) continue;
                let fullText = '';
                if (data.messages) {
                    for (const msg of data.messages) {
                        if (typeof msg.content === 'string') {
                            fullText += msg.content + ' ';
                        } else if (Array.isArray(msg.content)) {
                            for (const p of msg.content) {
                                if (p.type === 'text') fullText += p.text + ' ';
                            }
                        }
                    }
                }
                result[keys[i]] = fullText.toLowerCase();
            } catch (e) { console.warn('Erreur extraction texte conversation:', keys[i], e); }
        }
        return result;
    } catch (e) {
        console.warn('Erreur chargement textes conversations:', e);
        return {};
    }
}

// Atomique : read → merge → write dans la même file de coordination.
// `mergeFn(currentRaw)` reçoit la valeur disque (déjà parsée si JSON) et doit
// retourner la nouvelle valeur à stocker (string ou object). Si elle retourne
// `null`/`undefined`, le write est sauté.
async function updateConversationFile(filename, mergeFn) {
    const prev = _writeQueues.get(filename) || Promise.resolve();
    const next = prev.then(async () => {
        try {
            const db = await openConvDB();
            const txR = db.transaction('conversations', 'readonly');
            const reqR = txR.objectStore('conversations').get(filename);
            const raw = await new Promise((resolve) => {
                reqR.onsuccess = () => resolve(reqR.result);
                reqR.onerror = () => resolve(null);
            });
            const current = raw == null ? null : (typeof raw === 'string' ? JSON.parse(raw) : raw);
            const updated = await mergeFn(current);
            if (updated == null) return false;
            const txW = db.transaction('conversations', 'readwrite');
            txW.objectStore('conversations').put(updated, filename);
            return new Promise((resolve) => {
                txW.oncomplete = () => {
                    _afterConvWrite(filename, updated);
                    resolve(true);
                };
                txW.onerror = () => resolve(false);
            });
        } catch (e) {
            console.error('Erreur update conversation:', e);
            return false;
        }
    });
    const guarded = next.catch(() => {});
    _trackWrite(guarded);
    _writeQueues.set(filename, guarded);
    guarded.finally(() => {
        if (_writeQueues.get(filename) === guarded) _writeQueues.delete(filename);
    });
    return next;
}

async function readConversationFile(filename) {
    try {
        const db = await openConvDB();
        const tx = db.transaction('conversations', 'readonly');
        const req = tx.objectStore('conversations').get(filename);
        return new Promise((resolve) => {
            req.onsuccess = () => {
                const raw = req.result;
                if (!raw) { resolve(null); return; }
                resolve(typeof raw === 'string' ? JSON.parse(raw) : raw);
            };
            req.onerror = () => resolve(null);
        });
    } catch (e) {
        console.error('Erreur lecture conversation:', e);
        return null;
    }
}

async function deleteConversationFile(filename) {
    try {
        // Soft delete : on conserve les métadonnées (coût, tokens) mais on vide les messages
        const existing = await readConversationFile(filename);
        if (existing) {
            const archived = { ...existing, messages: [], deleted: true };
            // Sync serveur (suppression logique)
            syncDeleteFromServer(filename).catch(function(){});
            return writeConversationFile(filename, archived);
        }
        return false;
    } catch (e) {
        console.error('Erreur suppression conversation:', e);
        return false;
    }
}

// --- Gestion des System Prompts (localStorage) ---

const SP_STORAGE_KEY = 'minou-systemprompts';

function _getSpStore() {
    try {
        return JSON.parse(localStorage.getItem(SP_STORAGE_KEY)) || {};
    } catch (e) {
        return {};
    }
}

function _saveSpStore(store) {
    localStorage.setItem(SP_STORAGE_KEY, JSON.stringify(store));
}

async function listSystemPrompts() {
    const store = _getSpStore();
    const prompts = Object.entries(store).map(([filename, data]) => ({
        filename,
        nom: data.nom,
        contenu: data.contenu
    }));
    prompts.sort((a, b) => a.nom.localeCompare(b.nom));
    return prompts;
}

async function readSystemPrompt(filename) {
    const store = _getSpStore();
    return store[filename] || null;
}

async function writeSystemPrompt(filename, data) {
    const store = _getSpStore();
    store[filename] = { nom: data.nom, contenu: data.contenu };
    _saveSpStore(store);
    return true;
}

async function deleteSystemPromptFile(filename) {
    const store = _getSpStore();
    delete store[filename];
    _saveSpStore(store);
    return true;
}

// Importer les system prompts depuis le dossier systemprompts/ au premier lancement
async function importDefaultSystemPrompts() {
    const store = _getSpStore();
    if (Object.keys(store).length > 0) return; // déjà initialisé
    const defaults = [
        { filename: 'sympote.json', nom: 'sympote', contenu: 'tu es mon pote, on s\'écrit un peu en langage sms, cool, friendly, marrant.' }
    ];
    for (const sp of defaults) {
        store[sp.filename] = { nom: sp.nom, contenu: sp.contenu };
    }
    _saveSpStore(store);
}

// --- Gestion des Prompts enregistrés (localStorage) ---

const PROMPT_STORAGE_KEY = 'minou-savedprompts';

function _getPromptStore() {
    try {
        return JSON.parse(localStorage.getItem(PROMPT_STORAGE_KEY)) || {};
    } catch (e) {
        return {};
    }
}

function _savePromptStore(store) {
    localStorage.setItem(PROMPT_STORAGE_KEY, JSON.stringify(store));
}

async function listSavedPrompts() {
    const store = _getPromptStore();
    const prompts = Object.entries(store).map(([filename, data]) => ({
        filename,
        nom: data.nom,
        contenu: data.contenu
    }));
    prompts.sort((a, b) => a.nom.localeCompare(b.nom));
    return prompts;
}

async function readSavedPrompt(filename) {
    const store = _getPromptStore();
    return store[filename] || null;
}

async function writeSavedPrompt(filename, data) {
    const store = _getPromptStore();
    store[filename] = { nom: data.nom, contenu: data.contenu };
    _savePromptStore(store);
    return true;
}

async function deleteSavedPrompt(filename) {
    const store = _getPromptStore();
    delete store[filename];
    _savePromptStore(store);
    return true;
}

// --- Gestion des Catégories (localStorage) ---

const CAT_STORAGE_KEY = 'minou-categories';

function _getCatStore() {
    try {
        return JSON.parse(localStorage.getItem(CAT_STORAGE_KEY)) || {};
    } catch (e) {
        return {};
    }
}

function _saveCatStore(store) {
    localStorage.setItem(CAT_STORAGE_KEY, JSON.stringify(store));
}

function listCategories() {
    const store = _getCatStore();
    return Object.entries(store).map(([id, data]) => ({
        id,
        nom: data.nom,
        couleur: data.couleur,
        icone: data.icone
    }));
}

function readCategory(id) {
    const store = _getCatStore();
    return store[id] || null;
}

function writeCategory(id, data) {
    const store = _getCatStore();
    store[id] = { nom: data.nom, couleur: data.couleur, icone: data.icone };
    _saveCatStore(store);
}

function deleteCategory(id) {
    const store = _getCatStore();
    delete store[id];
    _saveCatStore(store);
}

async function updateConversationCategory(filename, categoryId) {
    const data = await readConversationFile(filename);
    if (!data) return;
    if (categoryId) {
        data.category = categoryId;
    } else {
        delete data.category;
    }
    await writeConversationFile(filename, data);
}

// Formater une conversation en JSON
function formatConversationFile(data) {
    const imgCost = data.totalImageCost || 0;
    const audioCost = data.totalAudioCost || 0;
    const extraCost = imgCost + audioCost;
    let cost = null;
    if (data.totalCost != null) {
        // Coût pré-calculé par segment (multi-modèle)
        cost = Math.round((data.totalCost + extraCost) * 10000) / 10000;
    } else {
        // Fallback : calcul global (rétro-compatibilité)
        const tarif = getTarif(data.model) || getImageTarif(data.model) || getSearchTarif(data.model);
        if (tarif) {
            cost = (data.totalInputTokens / 1_000_000) * tarif.inputPer1M
                 + (data.totalOutputTokens / 1_000_000) * tarif.outputPer1M
                 + extraCost;
            cost = Math.round(cost * 10000) / 10000;
        } else if (extraCost > 0) {
            cost = Math.round(extraCost * 10000) / 10000;
        }
    }
    const obj = {
        id: data.id,
        titre: data.title || null,
        modele: data.model,
        date: data.startTime,
        tokens_entree: data.totalInputTokens,
        tokens_sortie: data.totalOutputTokens,
        totalCost: data.totalCost || 0,
        cout_images: imgCost,
        cout_audio: audioCost,
        cout_estime_usd: cost,
        cost_by_model: data.costByModel || null,
        messages: data.messages
    };
    if (data.lastActivity) obj.lastActivity = data.lastActivity;
    if (data.systemPrompt) obj.system_prompt = data.systemPrompt;
    if (data.category) obj.category = data.category;
    if (data.canvas) obj.canvas = data.canvas;
    return JSON.stringify(obj, null, 2);
}

// ── Sync conversations vers le serveur (multi-appareils) ──────────────

function _getCetasUsername() {
    try {
        // Préférer le token JWT (auth serveur)
        if (typeof Auth !== 'undefined' && Auth.getCurrentUser) {
            var cu = Auth.getCurrentUser();
            if (cu && cu.username) return cu.username;
        }
        // Fallback legacy : localStorage / sessionStorage
        var u = localStorage.getItem('cetas-user') || localStorage.getItem('kiro-user') || '';
        if (!u) {
            var sess = sessionStorage.getItem('cetas-session') || sessionStorage.getItem('kiro-session') || '{}';
            try { var s = JSON.parse(sess); u = s.username || ''; } catch(e) {}
        }
        return u.trim();
    } catch(e) { return ''; }
}

function _getAuthHeaders() {
    var headers = {};
    if (typeof Auth !== 'undefined' && Auth.getToken) {
        var token = Auth.getToken();
        if (token) {
            headers['Authorization'] = 'Bearer ' + token;
        }
    }
    return headers;
}

async function syncPushToServer(filename, content) {
    var headers = Object.assign({'Content-Type': 'application/json'}, _getAuthHeaders());
    try {
        var resp = await fetch('/api/conversations/' + encodeURIComponent(filename), {
            method: 'PUT',
            headers: headers,
            body: content
        });
        return resp.ok;
    } catch(e) {
        console.warn('[Sync] push échoué:', e.message);
        return false;
    }
}

async function _syncPutConv(db, fn, convData) {
    return new Promise(function(r, rj) {
        var tx = db.transaction('conversations', 'readwrite');
        var store = tx.objectStore('conversations');
        var req = store.put(JSON.stringify(convData), fn);
        req.onsuccess = function() { r(); };
        req.onerror = function() { rj(req.error); };
    });
}

async function _syncGetConv(db, fn) {
    return new Promise(function(r) {
        var tx = db.transaction('conversations', 'readonly');
        var store = tx.objectStore('conversations');
        var req = store.get(fn);
        req.onsuccess = function() { r(req.result); };
        req.onerror = function() { r(null); };
    });
}

async function _syncDelConv(db, fn) {
    return new Promise(function(r) {
        var tx = db.transaction('conversations', 'readwrite');
        var store = tx.objectStore('conversations');
        var req = store.delete(fn);
        req.onsuccess = function() { r(); };
        req.onerror = function() { r(); };
    });
}

async function _syncListKeys(db) {
    return new Promise(function(r) {
        var tx = db.transaction('conversations', 'readonly');
        var store = tx.objectStore('conversations');
        var req = store.getAllKeys();
        req.onsuccess = function() { r(req.result || []); };
        req.onerror = function() { r([]); };
    });
}

async function syncPullFromServer() {
    var headers = _getAuthHeaders();
    if (!headers['Authorization']) return 0;
    try {
        var resp = await fetch('/api/conversations', { headers: headers });
        if (!resp.ok) return 0;
        var metaList = await resp.json();
        if (!Array.isArray(metaList)) return 0;

        var db = await openConvDB();
        var imported = 0;
        var serverFns = {};

        for (var i = 0; i < metaList.length; i++) {
            var meta = metaList[i];
            var fn = meta.filename;
            serverFns[fn] = true;
            // Vérifier si on a déjà une version plus récente en local
            try {
                var existing = await _syncGetConv(db, fn);
                if (existing) {
                    var localData = typeof existing === 'string' ? JSON.parse(existing) : existing;
                    var localActivity = localData.lastActivity || localData.date || '';
                    var serverActivity = meta.lastActivity || meta.date || '';
                    if (localActivity >= serverActivity) continue;
                }
            } catch(e) {}

            // Télécharger la conversation complète depuis le serveur
            try {
                var convResp = await fetch('/api/conversations/' + encodeURIComponent(decodeURIComponent(fn)), {
                    headers: _getAuthHeaders()
                });
                if (!convResp.ok) continue;
                var convData = await convResp.json();
                await _syncPutConv(db, fn, convData);
                imported++;
            } catch(e) {
                console.warn('[Sync] pull conversation échoué:', fn, e.message);
            }
        }

        // Réconciliation : supprimer les conversations locales absentes du serveur
        var localKeys = await _syncListKeys(db);
        var deleted = 0;
        for (var k = 0; k < localKeys.length; k++) {
            var key = localKeys[k];
            if (!serverFns[key]) {
                await _syncDelConv(db, key);
                deleted++;
            }
        }
        if (deleted > 0) {
            console.info('[Sync] réconciliation: ' + deleted + ' conversation(s) supprimée(s) localement.');
        }

        return imported;
    } catch(e) {
        console.warn('[Sync] pull échoué:', e.message);
        return 0;
    }
}

async function syncDeleteFromServer(filename) {
    try {
        var resp = await fetch('/api/conversations/' + encodeURIComponent(decodeURIComponent(filename)), {
            method: 'DELETE',
            headers: _getAuthHeaders()
        });
        return resp.ok;
    } catch(e) {
        console.warn('[Sync] delete échoué:', e.message);
        return false;
    }
}

var _syncInterval = null;

function startAutoSync() {
    if (_syncInterval) return;
    _syncInterval = setInterval(function() {
        if (document.hidden) return;
        syncPullFromServer().then(function(n) {
            if (n > 0 && typeof refreshConvList === 'function') refreshConvList();
        }).catch(function(){});
    }, 10000);
}

function stopAutoSync() {
    if (_syncInterval) {
        clearInterval(_syncInterval);
        _syncInterval = null;
    }
}

document.addEventListener('visibilitychange', function() {
    if (!document.hidden) {
        syncPullFromServer().then(function(n) {
            if (n > 0 && typeof refreshConvList === 'function') refreshConvList();
        }).catch(function(){});
    }
});

window.addEventListener('focus', function() {
    syncPullFromServer().then(function(n) {
        if (n > 0 && typeof refreshConvList === 'function') refreshConvList();
    }).catch(function(){});
});

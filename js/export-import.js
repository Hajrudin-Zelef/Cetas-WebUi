// --- Export / Import ---
import { refreshCatBar } from './categories.js';
import { refreshSpList } from './roles.js';
import { refreshPrList } from './prompts.js';
import { applyTheme } from './theme.js';

const importFileInput = document.getElementById('import-file-input');

// Callbacks
let _showModelAlert = null;
let _customConfirm = null;
let _refreshConvList = null;
let _populateUnifiedSelect = null;

export function setExportImportCallbacks(cbs) {
    _showModelAlert = cbs.showModelAlert;
    _customConfirm = cbs.customConfirm;
    _refreshConvList = cbs.refreshConvList;
    _populateUnifiedSelect = cbs.populateUnifiedSelect;
}

export async function exportBackup() {
    const conversations = {};
    const db = await openConvDB();
    const tx = db.transaction('conversations', 'readonly');
    const store = tx.objectStore('conversations');
    const keys = await new Promise((resolve) => {
        const req = store.getAllKeys();
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => resolve([]);
    });
    for (const key of keys) {
        const val = await new Promise((resolve) => {
            const req = store.get(key);
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => resolve(null);
        });
        if (val) conversations[key] = val;
    }

    const includeKeys = document.getElementById('save-modal-include-keys')?.checked;
    let apiKeysData = {};
    if (includeKeys) {
        try { apiKeysData = JSON.parse(localStorage.getItem('minou-apikeys') || '{}'); }
        catch (e) { /* ignore */ }
    }
    const data = {
        _minou_backup: true,
        date: new Date().toISOString(),
        conversations: conversations,
        systemPrompts: JSON.parse(localStorage.getItem('minou-systemprompts') || '{}'),
        savedPrompts: JSON.parse(localStorage.getItem('minou-savedprompts') || '{}'),
        categories: JSON.parse(localStorage.getItem('minou-categories') || '{}'),
        theme: localStorage.getItem('minou-theme') || 'light',
        apiKeys: apiKeysData,
        audioSettings: JSON.parse(localStorage.getItem('minou-audio-settings') || '{}'),
        budget: JSON.parse(localStorage.getItem('minou-budget') || 'null'),
        catalogPrefs: JSON.parse(localStorage.getItem('minou-catalog-prefs') || '{"disabled":[],"orEnabled":[]}'),
        orCacheText:  JSON.parse(localStorage.getItem('minou-or-cache')       || 'null'),
        orCacheImage: JSON.parse(localStorage.getItem('minou-or-cache-image') || 'null')
    };

    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'cetas-backup-' + new Date().toISOString().slice(0, 10) + '.json';
    a.click();
    URL.revokeObjectURL(url);
}

export async function importBackup(file) {
    try {
        const text = await file.text();
        const data = JSON.parse(text);

        if (!data._minou_backup) {
            if (_showModelAlert) _showModelAlert('Ce fichier n\'est pas une sauvegarde Cetas valide.');
            return;
        }

        const convCount = data.conversations ? Object.keys(data.conversations).length : 0;
        const spCount = data.systemPrompts ? Object.keys(data.systemPrompts).length : 0;
        const prCount = data.savedPrompts ? Object.keys(data.savedPrompts).length : 0;
        const catCount = data.categories ? Object.keys(data.categories).length : 0;

        if (_customConfirm && !await _customConfirm(`Importer ${convCount} conversation(s), ${spCount} rôle(s), ${prCount} prompt(s) enregistré(s) et ${catCount} catégorie(s) ?\n\nLes données existantes portant les mêmes noms seront écrasées.`, { icon: 'import', okLabel: 'Importer' })) return;

        // Importer les conversations dans IndexedDB
        if (data.conversations) {
            const db = await openConvDB();
            for (const [key, val] of Object.entries(data.conversations)) {
                const tx = db.transaction('conversations', 'readwrite');
                tx.objectStore('conversations').put(val, key);
                await new Promise(r => { tx.oncomplete = r; });
            }
        }

        // Importer les system prompts
        if (data.systemPrompts) {
            const existing = JSON.parse(localStorage.getItem('minou-systemprompts') || '{}');
            Object.assign(existing, data.systemPrompts);
            localStorage.setItem('minou-systemprompts', JSON.stringify(existing));
        }

        // Importer les prompts enregistrés
        if (data.savedPrompts) {
            const existing = JSON.parse(localStorage.getItem('minou-savedprompts') || '{}');
            Object.assign(existing, data.savedPrompts);
            localStorage.setItem('minou-savedprompts', JSON.stringify(existing));
        }

        // Importer les clés API
        if (data.apiKeys && Object.keys(data.apiKeys).length > 0) {
            saveApiKeys(data.apiKeys);
        }

        // Importer les catégories
        if (data.categories) {
            const existing = JSON.parse(localStorage.getItem('minou-categories') || '{}');
            Object.assign(existing, data.categories);
            localStorage.setItem('minou-categories', JSON.stringify(existing));
        }

        // Importer le thème
        if (data.theme) {
            localStorage.setItem('minou-theme', data.theme);
            applyTheme(data.theme);
        }

        // Importer les réglages audio/modèles
        if (data.audioSettings && typeof data.audioSettings === 'object') {
            saveAudioSettings(data.audioSettings);
        }

        // Importer le budget
        if (data.budget && typeof data.budget === 'object') {
            localStorage.setItem('minou-budget', JSON.stringify(data.budget));
        }

        // Importer la sélection de modèles (tous providers + OR) et les caches OR
        if (data.catalogPrefs && typeof data.catalogPrefs === 'object') {
            saveCatalogPrefs({
                disabled: Array.isArray(data.catalogPrefs.disabled) ? data.catalogPrefs.disabled : [],
                orEnabled: Array.isArray(data.catalogPrefs.orEnabled) ? data.catalogPrefs.orEnabled : []
            });
        }
        if (data.orCacheText && Array.isArray(data.orCacheText.models)) {
            setOrCache(data.orCacheText.models, 'text');
        }
        if (data.orCacheImage && Array.isArray(data.orCacheImage.models)) {
            setOrCache(data.orCacheImage.models, 'image');
        }
        rebuildModelLists();
        if (_populateUnifiedSelect && typeof _populateUnifiedSelect === 'function') _populateUnifiedSelect();

        // Rafraîchir l'interface
        if (_refreshConvList) _refreshConvList();
        refreshCatBar();
        refreshSpList();
        refreshPrList();
        if (_showModelAlert) _showModelAlert('Import terminé avec succès !');
    } catch (e) {
        console.error('Erreur import:', e);
        if (_showModelAlert) _showModelAlert('Erreur lors de l\'import : fichier invalide.');
    }
}

export function initExportImport() {
    importFileInput.addEventListener('change', async () => {
        const file = importFileInput.files[0];
        if (!file) return;
        importFileInput.value = '';
        await importBackup(file);
    });
}

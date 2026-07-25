// © Marexsoft Corporation. Fondateur Kouassi Marius.
// --- Rôles (System Prompts) : liste, modale, CRUD ---
import { STATE } from './state.js';
import { escHtml } from './utils.js';

// DOM refs
const spSelect = document.getElementById('sp-select');
const spListEl = document.getElementById('sp-list');
const spAddBtn = document.getElementById('sp-add-btn');
const spEditBtn = document.getElementById('sp-edit-btn');
const spDeleteBtn = document.getElementById('sp-delete-btn');
const rpRoleActions = document.getElementById('rp-role-actions');
const spModalOverlay = document.getElementById('sp-modal-overlay');
const spModalTitle = document.getElementById('sp-modal-title');
const spModalNom = document.getElementById('sp-modal-nom');
const spModalContenu = document.getElementById('sp-modal-contenu');
const spModalCancel = document.getElementById('sp-modal-cancel');
const spModalSave = document.getElementById('sp-modal-save');
const spModalDelete = document.getElementById('sp-modal-delete');
const spModalOptimize = document.getElementById('sp-modal-optimize');
const spImportBtn = document.getElementById('sp-import-btn');
const spImportFile = document.getElementById('sp-import-file');

// Callbacks
let _customConfirm = null;
let _showModelAlert = null;
let _showNoModelAlert = null;
let _customAlert = null;
let _openRolesManage = null;

export function setRolesCallbacks(cbs) {
    _customConfirm = cbs.customConfirm;
    _showModelAlert = cbs.showModelAlert;
    _showNoModelAlert = cbs.showNoModelAlert;
    _customAlert = cbs.customAlert;
    _openRolesManage = cbs.openRolesManage;
}

export async function refreshSpList() {
    const prompts = await listSystemPrompts();

    // Sidebar list
    spListEl.innerHTML = '';
    for (const sp of prompts) {
        const item = document.createElement('div');
        item.className = 'sp-item';

        const name = document.createElement('span');
        name.className = 'sp-item-name';
        name.textContent = sp.nom;

        const actions = document.createElement('div');
        actions.className = 'sp-item-actions';

        const exportBtn = document.createElement('button');
        exportBtn.className = 'sp-item-btn';
        exportBtn.innerHTML = '<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19V5"/><path d="M5 12l7-7 7 7"/></svg>';
        exportBtn.title = 'Exporter';
        exportBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            exportSpItem(sp.filename);
        });

        const editBtn = document.createElement('button');
        editBtn.className = 'sp-item-btn';
        editBtn.textContent = '✎';
        editBtn.title = 'Modifier';
        editBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            openSpModal(sp.filename);
        });

        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'sp-item-btn danger';
        deleteBtn.textContent = '✕';
        deleteBtn.title = 'Supprimer';
        deleteBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            deleteSpItem(sp.filename, sp.nom);
        });

        actions.appendChild(exportBtn);
        actions.appendChild(editBtn);
        actions.appendChild(deleteBtn);
        item.appendChild(name);
        item.appendChild(actions);

        item.addEventListener('click', () => {
            spSelect.value = sp.filename;
            spSelect.dispatchEvent(new Event('change'));
        });

        spListEl.appendChild(item);
    }

    // Mettre à jour le <select> des rôles
    const currentValue = spSelect.value;
    spSelect.innerHTML = '<option value="">Aucun rôle</option>';
    const defaultOpt = document.createElement('option');
    defaultOpt.value = '__default__';
    defaultOpt.textContent = 'Rôle par défaut (vierge)';
    spSelect.appendChild(defaultOpt);
    for (const sp of prompts) {
        const opt = document.createElement('option');
        opt.value = sp.filename;
        opt.textContent = sp.nom;
        opt.dataset.contenu = sp.contenu;
        spSelect.appendChild(opt);
    }
    spSelect.value = currentValue;
    if (!spSelect.value) spSelect.value = '';
}

export async function deleteSpItem(filename, nom) {
    if (_customConfirm && !await _customConfirm(`Supprimer le rôle "${nom}" ?`, { icon: 'delete', danger: true, okLabel: 'Supprimer' })) return;
    await deleteSystemPromptFile(filename);
    if (spSelect.value === filename) {
        spSelect.value = '';
        STATE.currentSystemPrompt = null;
    }
    refreshSpList();
}

export async function exportSpItem(filename) {
    const data = await readSystemPrompt(filename);
    if (!data) return;
    const exportData = { _minou_role: true, nom: data.nom, contenu: data.contenu };
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const safeName = data.nom.replace(/[^a-zA-Z0-9àâéèêëïîôùûüçÀÂÉÈÊËÏÎÔÙÛÜÇ _-]/g, '_');
    a.download = `role-${safeName}.json`;
    a.click();
    URL.revokeObjectURL(url);
}

export function autoResizeTextarea(ta) {
    ta.style.height = 'auto';
    const maxH = window.innerHeight * 0.45;
    ta.style.height = Math.min(maxH, Math.max(120, ta.scrollHeight)) + 'px';
}

let _spFromManagePopup = false;

export function openSpModal(filename = null, fromManage = false) {
    STATE.spEditingFilename = filename;
    _spFromManagePopup = fromManage;
    if (filename) {
        spModalTitle.textContent = 'Modifier le rôle';
        spModalDelete.style.display = '';
        readSystemPrompt(filename).then(data => {
            if (data) {
                spModalNom.value = data.nom;
                spModalContenu.value = data.contenu;
                autoResizeTextarea(spModalContenu);
            }
        });
    } else {
        spModalTitle.textContent = 'Nouveau rôle';
        spModalDelete.style.display = 'none';
        spModalNom.value = '';
        spModalContenu.value = '';
        spModalContenu.style.height = '';
    }
    spModalOverlay.style.display = 'flex';
    spModalNom.focus();
}

export function closeSpModal() {
    spModalOverlay.style.display = 'none';
    STATE.spEditingFilename = null;
    if (_spFromManagePopup) {
        _spFromManagePopup = false;
        if (_openRolesManage) _openRolesManage();
    }
}

export function initRoles() {
    // Import button
    if (spImportBtn) spImportBtn.addEventListener('click', () => spImportFile.click());

    spImportFile.addEventListener('change', async () => {
        const file = spImportFile.files[0];
        if (!file) return;
        spImportFile.value = '';
        try {
            const text = await file.text();
            const data = JSON.parse(text);
            if (!data._minou_role || !data.nom || !data.contenu) {
                if (_showModelAlert) _showModelAlert('Ce fichier n\'est pas un rôle Cetas valide.');
                return;
            }
            const filename = data.nom.replace(/[^a-zA-Z0-9àâéèêëïîôùûüçÀÂÉÈÊËÏÎÔÙÛÜÇ _-]/g, '_') + '.json';
            await writeSystemPrompt(filename, { nom: data.nom, contenu: data.contenu });
            refreshSpList();
        } catch (e) {
            console.error('Erreur import rôle:', e);
            if (_showModelAlert) _showModelAlert('Erreur lors de l\'import du rôle.');
        }
    });

    // Add button
    if (spAddBtn) spAddBtn.addEventListener('click', () => openSpModal());

    // Cancel
    spModalCancel.addEventListener('click', closeSpModal);

    // Delete from modal
    spModalDelete.addEventListener('click', async () => {
        if (!STATE.spEditingFilename) return;
        const data = await readSystemPrompt(STATE.spEditingFilename);
        const roleName = data ? data.nom : STATE.spEditingFilename;
        if (_customConfirm && !await _customConfirm(`Supprimer le rôle « ${roleName} » ?`, { icon: 'delete', danger: true, okLabel: 'Supprimer' })) return;
        await deleteSystemPromptFile(STATE.spEditingFilename);
        if (spSelect.value === STATE.spEditingFilename) {
            spSelect.value = '';
            STATE.currentSystemPrompt = null;
        }
        refreshSpList();
        closeSpModal();
    });

    // Optimize
    spModalOptimize.addEventListener('click', async () => {
        const contenu = spModalContenu.value.trim();
        if (!contenu) return;

        if (!AUDIO_SETTINGS.enhanceModel) {
            if (_showNoModelAlert) _showNoModelAlert('l\'amélioration de prompts', 'enhance-provider');
            return;
        }

        const originalHTML = spModalOptimize.innerHTML;
        spModalOptimize.disabled = true;
        spModalOptimize.textContent = 'Optimisation...';
        spModalContenu.classList.add('enhancing');
        spModalContenu.readOnly = true;

        try {
            const modelId = AUDIO_SETTINGS.enhanceModel;
            const prompt = `Tu es un expert en prompt engineering. Voici un system prompt (rôle) brut :\n\n---\n${contenu}\n---\n\nRéécris-le en une version optimisée, claire et structurée en markdown. Améliore la formulation, ajoute de la structure (titres, listes, emphases) pour le rendre plus efficace en tant que rôle/persona pour une IA.\n\nRéponds UNIQUEMENT avec le system prompt amélioré. Pas d'introduction, pas de conclusion, pas de commentaire, pas de texte avant ou après. Ne commence pas par "Voici" ou toute autre phrase d'accroche. Retourne directement le contenu du prompt optimisé, rien d'autre.`;

            let firstChunk = true;
            await streamText(modelId, prompt, (text) => {
                if (firstChunk) { spModalContenu.value = ''; firstChunk = false; }
                spModalContenu.value += text;
                spModalContenu.style.height = 'auto';
                spModalContenu.style.height = spModalContenu.scrollHeight + 'px';
                spModalContenu.scrollTop = spModalContenu.scrollHeight;
            });
        } catch (e) {
            console.error('Erreur optimisation:', e);
            if (_customAlert) _customAlert('Erreur lors de l\'optimisation : ' + e.message, 'error');
        } finally {
            spModalOptimize.disabled = false;
            spModalOptimize.innerHTML = originalHTML;
            spModalContenu.classList.remove('enhancing');
            spModalContenu.readOnly = false;
        }
    });

    spModalOverlay.addEventListener('click', (e) => {
        if (e.target === spModalOverlay) closeSpModal();
    });

    // Save
    spModalSave.addEventListener('click', async () => {
        const nom = spModalNom.value.trim();
        const contenu = spModalContenu.value.trim();
        if (!nom || !contenu) {
            if (!nom) spModalNom.reportValidity();
            else spModalContenu.reportValidity();
            return;
        }

        const data = { nom, contenu };
        const filename = STATE.spEditingFilename || nom.replace(/[^a-zA-Z0-9àâéèêëïîôùûüçÀÂÉÈÊËÏÎÔÙÛÜÇ _-]/g, '_') + '.json';

        if (STATE.spEditingFilename) {
            const oldData = await readSystemPrompt(STATE.spEditingFilename);
            if (oldData && oldData.nom !== nom) {
                const newFilename = nom.replace(/[^a-zA-Z0-9àâéèêëïîôùûüçÀÂÉÈÊËÏÎÔÙÛÜÇ _-]/g, '_') + '.json';
                if (newFilename !== STATE.spEditingFilename) {
                    await writeSystemPrompt(newFilename, data);
                    await deleteSystemPromptFile(STATE.spEditingFilename);
                    closeSpModal();
                    refreshSpList();
                    return;
                }
            }
        }

        await writeSystemPrompt(filename, data);
        closeSpModal();
        refreshSpList();
    });

    // Right panel: Edit button
    spEditBtn.addEventListener('click', async () => {
        if (!spSelect.value) return;
        const filename = spSelect.value;
        const opt = spSelect.selectedOptions[0];
        const contenu = document.getElementById('sp-textarea')?.value || '';
        await writeSystemPrompt(filename, { nom: opt.textContent, contenu });
        // Mise à jour du contenu caché
        if (opt) opt.dataset.contenu = contenu;
        spEditBtn.style.display = 'none';
        if (STATE.currentSystemPrompt) STATE.currentSystemPrompt.contenu = contenu;
    });

    // Right panel: Delete button
    spDeleteBtn?.addEventListener('click', async () => {
        if (!spSelect.value) return;
        const data = await readSystemPrompt(spSelect.value);
        const roleName = data ? data.nom : spSelect.value;
        if (_customConfirm && !await _customConfirm(`Supprimer le rôle « ${roleName} » ?`, { icon: 'delete', danger: true, okLabel: 'Supprimer' })) return;
        await deleteSystemPromptFile(spSelect.value);
        if (STATE.currentSystemPrompt && STATE.currentSystemPrompt.nom === roleName) {
            STATE.currentSystemPrompt = null;
        }
        spSelect.value = '';
        const spTextarea = document.getElementById('sp-textarea');
        if (spTextarea) spTextarea.value = '';
        rpRoleActions.style.display = 'none';
        refreshSpList();
    });

    // Textarea auto-resize for sp modal
    spModalContenu.addEventListener('input', () => autoResizeTextarea(spModalContenu));
}

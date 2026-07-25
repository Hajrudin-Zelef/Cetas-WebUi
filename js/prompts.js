// © Marexsoft Corporation. Fondateur Kouassi Marius.
// --- Prompts enregistrés : sidebar, modale, picker ---
import { STATE } from './state.js';
import { escHtml } from './utils.js';
import { autoResizeTextarea } from './roles.js';

// DOM refs
const prListEl = document.getElementById('pr-list');
const prAddBtn = document.getElementById('pr-add-btn');
const prModalOverlay = document.getElementById('pr-modal-overlay');
const prModalTitle = document.getElementById('pr-modal-title');
const prModalNom = document.getElementById('pr-modal-nom');
const prModalContenu = document.getElementById('pr-modal-contenu');
const prModalCancel = document.getElementById('pr-modal-cancel');
const prModalSave = document.getElementById('pr-modal-save');
const prModalDelete = document.getElementById('pr-modal-delete');
const prModalEnhance = document.getElementById('pr-modal-enhance');

// Callbacks
let _customConfirm = null;
let _showNoModelAlert = null;
let _customAlert = null;
let _openPromptsManage = null;

export function setPromptsCallbacks(cbs) {
    _customConfirm = cbs.customConfirm;
    _showNoModelAlert = cbs.showNoModelAlert;
    _customAlert = cbs.customAlert;
    _openPromptsManage = cbs.openPromptsManage;
}

export async function refreshPrList() {
    const prompts = await listSavedPrompts();

    prListEl.innerHTML = '';
    for (const pr of prompts) {
        const item = document.createElement('div');
        item.className = 'sp-item';

        const name = document.createElement('span');
        name.className = 'sp-item-name';
        name.textContent = pr.nom;

        const actions = document.createElement('div');
        actions.className = 'sp-item-actions';

        const editBtn = document.createElement('button');
        editBtn.className = 'sp-item-btn';
        editBtn.textContent = '✎';
        editBtn.title = 'Modifier';
        editBtn.addEventListener('click', () => openPrModal(pr.filename));

        const delBtn = document.createElement('button');
        delBtn.className = 'sp-item-btn delete';
        delBtn.textContent = '×';
        delBtn.title = 'Supprimer';
        delBtn.addEventListener('click', async () => {
            if (_customConfirm && !await _customConfirm(`Supprimer le prompt "${pr.nom}" ?`, { icon: 'delete', danger: true, okLabel: 'Supprimer' })) return;
            await deleteSavedPrompt(pr.filename);
            refreshPrList();
        });

        actions.appendChild(editBtn);
        actions.appendChild(delBtn);
        item.appendChild(name);
        item.appendChild(actions);
        prListEl.appendChild(item);
    }
}

let _prFromManagePopup = false;

export function openPrModal(filename = null, prefillContenu = '', fromManage = false) {
    STATE.prEditingFilename = filename;
    _prFromManagePopup = fromManage;
    if (filename) {
        prModalTitle.textContent = 'Modifier le Prompt';
        prModalDelete.style.display = '';
        readSavedPrompt(filename).then(data => {
            if (data) {
                prModalNom.value = data.nom;
                prModalContenu.value = data.contenu;
                autoResizeTextarea(prModalContenu);
            }
        });
    } else {
        prModalTitle.textContent = 'Enregistrer un Prompt';
        prModalDelete.style.display = 'none';
        prModalNom.value = '';
        prModalContenu.value = prefillContenu;
        if (prefillContenu) autoResizeTextarea(prModalContenu);
        else prModalContenu.style.height = '';
    }
    prModalOverlay.style.display = 'flex';
    prModalNom.focus();
}

export function closePrModal() {
    prModalOverlay.style.display = 'none';
    STATE.prEditingFilename = null;
    if (_prFromManagePopup) {
        _prFromManagePopup = false;
        if (_openPromptsManage) _openPromptsManage();
    }
}

export function initPrompts() {
    if (prAddBtn) prAddBtn.addEventListener('click', () => openPrModal());

    prModalCancel.addEventListener('click', closePrModal);

    prModalDelete.addEventListener('click', async () => {
        if (!STATE.prEditingFilename) return;
        const data = await readSavedPrompt(STATE.prEditingFilename);
        const promptName = data ? data.nom : STATE.prEditingFilename;
        if (_customConfirm && !await _customConfirm(`Supprimer le prompt « ${promptName} » ?`, { icon: 'delete', danger: true, okLabel: 'Supprimer' })) return;
        await deleteSavedPrompt(STATE.prEditingFilename);
        refreshPrList();
        closePrModal();
    });

    prModalEnhance.addEventListener('click', async () => {
        const contenu = prModalContenu.value.trim();
        if (!contenu) return;

        if (!AUDIO_SETTINGS.enhanceModel) {
            if (_showNoModelAlert) _showNoModelAlert('l\'amélioration de prompts', 'enhance-provider');
            return;
        }

        const originalHTML = prModalEnhance.innerHTML;
        prModalEnhance.disabled = true;
        prModalEnhance.textContent = 'Amélioration...';
        prModalContenu.classList.add('enhancing');
        prModalContenu.readOnly = true;

        try {
            const modelId = AUDIO_SETTINGS.enhanceModel;
            const prompt = `Tu es un expert en prompt engineering. Voici un prompt brut :\n\n---\n${contenu}\n---\n\nRéécris-le en une version optimisée, claire et structurée. Améliore la formulation pour le rendre plus efficace et précis.\n\nRéponds UNIQUEMENT avec le prompt amélioré. Pas d'introduction, pas de conclusion, pas de commentaire, pas de texte avant ou après. Ne commence pas par "Voici" ou toute autre phrase d'accroche. Retourne directement le contenu du prompt optimisé, rien d'autre.`;

            let firstChunk = true;
            await streamText(modelId, prompt, (text) => {
                if (firstChunk) { prModalContenu.value = ''; firstChunk = false; }
                prModalContenu.value += text;
                prModalContenu.style.height = 'auto';
                prModalContenu.style.height = prModalContenu.scrollHeight + 'px';
                prModalContenu.scrollTop = prModalContenu.scrollHeight;
            });
        } catch (e) {
            console.error('Erreur amélioration prompt:', e);
            if (_customAlert) _customAlert('Erreur lors de l\'amélioration : ' + e.message, 'error');
        } finally {
            prModalEnhance.disabled = false;
            prModalEnhance.innerHTML = originalHTML;
            prModalContenu.classList.remove('enhancing');
            prModalContenu.readOnly = false;
        }
    });

    prModalOverlay.addEventListener('click', (e) => {
        if (e.target === prModalOverlay) closePrModal();
    });

    prModalSave.addEventListener('click', async () => {
        const nom = prModalNom.value.trim();
        const contenu = prModalContenu.value.trim();
        if (!nom || !contenu) {
            if (!nom) prModalNom.reportValidity();
            else prModalContenu.reportValidity();
            return;
        }

        const data = { nom, contenu };
        const filename = STATE.prEditingFilename || nom.replace(/[^a-zA-Z0-9àâéèêëïîôùûüçÀÂÉÈÊËÏÎÔÙÛÜÇ _-]/g, '_') + '.json';

        if (STATE.prEditingFilename) {
            const oldData = await readSavedPrompt(STATE.prEditingFilename);
            if (oldData && oldData.nom !== nom) {
                const newFilename = nom.replace(/[^a-zA-Z0-9àâéèêëïîôùûüçÀÂÉÈÊËÏÎÔÙÛÜÇ _-]/g, '_') + '.json';
                if (newFilename !== STATE.prEditingFilename) {
                    await writeSavedPrompt(newFilename, data);
                    await deleteSavedPrompt(STATE.prEditingFilename);
                    closePrModal();
                    refreshPrList();
                    return;
                }
            }
        }

        await writeSavedPrompt(filename, data);
        closePrModal();
        refreshPrList();
    });

    prModalContenu.addEventListener('input', () => autoResizeTextarea(prModalContenu));
}

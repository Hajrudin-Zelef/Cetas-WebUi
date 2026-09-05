// © Marexsoft Corporation. Fondateur Kouassi Marius.
// ============================================================
// attachments.js — Pièces jointes : fichiers, drag-drop, presse-papiers
// ============================================================
import { STATE } from '../core/state.js';
import { getAttachBtn, getFileInput, getAttachPreview, getPromptInput, getSendBtn } from '../core/dom.js';
import { isTextFile, arrayBufferToBase64, isPdf, isDocx, isXlsx, isPptx } from '../core/utils.js';
import { openLightbox, openFileViewer } from '../ui/lightbox.js';

// Callback pour updateSendButton (défini dans app.js)
let _onStateChange = null;
export function setAttachStateChange(fn) { _onStateChange = fn; }

function notifyChange() {
    renderAttachPreview();
    if (_onStateChange) _onStateChange();
}

// --- Gestion du chargement des fichiers ---
function _trackLoad(name, reader) {
    const entry = { id: ++STATE._pendingLoadId, name, reader };
    STATE.pendingLoadingFiles.push(entry);
    notifyChange();
    return entry;
}

function _untrackLoad(entry) {
    const idx = STATE.pendingLoadingFiles.indexOf(entry);
    if (idx >= 0) STATE.pendingLoadingFiles.splice(idx, 1);
}

function _isLoadCancelled(entry) {
    return STATE.pendingLoadingFiles.indexOf(entry) === -1;
}

export function cancelAllPendingLoads() {
    for (const entry of STATE.pendingLoadingFiles) {
        try { entry.reader.abort(); } catch {}
    }
    STATE.pendingLoadingFiles = [];
}

// --- Extraction du texte d'un PDF ---
async function extractPdfText(arrayBuffer) {
    if (typeof pdfjsLib === 'undefined') {
        console.warn('pdfjsLib non disponible');
        return '';
    }
    try {
        const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer) }).promise;
        const pages = [];
        const maxPages = Math.min(pdf.numPages, 50);
        for (let i = 1; i <= maxPages; i++) {
            const page = await pdf.getPage(i);
            const tc = await page.getTextContent();
            pages.push(tc.items.map(item => item.str).join(' '));
        }
        if (pdf.numPages > 50) {
            pages.push(`\n[Extraction limitée à 50 pages sur ${pdf.numPages} totales]`);
        }
        return pages.join('\n\n');
    } catch (e) {
        console.error('Erreur extraction PDF:', e);
        return '';
    }
}

// --- Traitement d'un fichier joint ---
export function processAttachedFile(file) {
    const MAX_FILE_SIZE = 20 * 1024 * 1024;
    if (file.size > MAX_FILE_SIZE) {
        if (typeof showModelAlert === 'function') {
            showModelAlert(`Fichier trop volumineux : ${file.name} (${(file.size / 1024 / 1024).toFixed(1)} MB). Limite : 20 MB.`);
        }
        return;
    }
    if (file.type.startsWith('image/') && file.type !== 'image/svg+xml') {
        const reader = new FileReader();
        const entry = _trackLoad(file.name, reader);
        reader.onload = (e) => {
            if (_isLoadCancelled(entry)) return;
            _untrackLoad(entry);
            const dataUrl = e.target.result;
            STATE.pendingImages.push({ dataUrl, mimeType: file.type, name: file.name });
            notifyChange();
        };
        reader.onerror = reader.onabort = () => {
            _untrackLoad(entry);
            notifyChange();
        };
        reader.readAsDataURL(file);
    } else if (isPdf(file)) {
        const reader = new FileReader();
        const entry = _trackLoad(file.name, reader);
        reader.onload = async (e) => {
            if (_isLoadCancelled(entry)) return;
            const arrayBuffer = e.target.result;
            const base64 = arrayBufferToBase64(arrayBuffer);
            const textContent = await extractPdfText(arrayBuffer);
            if (_isLoadCancelled(entry)) return;
            _untrackLoad(entry);
            STATE.pendingFiles.push({ name: file.name, mimeType: 'application/pdf', data: base64, textContent });
            notifyChange();
        };
        reader.onerror = reader.onabort = () => {
            _untrackLoad(entry);
            notifyChange();
        };
        reader.readAsArrayBuffer(file);
    } else if (isTextFile(file)) {
        const reader = new FileReader();
        const entry = _trackLoad(file.name, reader);
        reader.onload = (e) => {
            if (_isLoadCancelled(entry)) return;
            _untrackLoad(entry);
            const textContent = e.target.result;
            const base64 = btoa(unescape(encodeURIComponent(textContent)));
            STATE.pendingFiles.push({ name: file.name, mimeType: file.type || 'text/plain', data: base64, textContent });
            notifyChange();
        };
        reader.onerror = reader.onabort = () => {
            _untrackLoad(entry);
            notifyChange();
        };
        reader.readAsText(file);
    } else if (isDocx(file)) {
        const reader = new FileReader();
        const entry = _trackLoad(file.name, reader);
        reader.onload = async (e) => {
            if (_isLoadCancelled(entry)) return;
            const arrayBuffer = e.target.result;
            let textContent = '';
            try {
                if (typeof mammoth !== 'undefined') {
                    const result = await mammoth.extractRawText({ arrayBuffer });
                    textContent = result.value || '';
                }
            } catch (err) {
                console.error('Erreur extraction DOCX:', err);
            }
            if (_isLoadCancelled(entry)) return;
            _untrackLoad(entry);
            const base64 = arrayBufferToBase64(arrayBuffer);
            if (!textContent) {
                if (typeof showModelAlert === 'function') {
                    showModelAlert(`Impossible d'extraire le texte de ${file.name}. Le fichier est joint mais son contenu ne sera pas lisible par l'IA.`);
                }
            }
            STATE.pendingFiles.push({ name: file.name, mimeType: file.type || 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', data: base64, textContent });
            notifyChange();
        };
        reader.onerror = reader.onabort = () => {
            _untrackLoad(entry);
            notifyChange();
        };
        reader.readAsArrayBuffer(file);
    } else if (isXlsx(file)) {
        const reader = new FileReader();
        const entry = _trackLoad(file.name, reader);
        reader.onload = (e) => {
            if (_isLoadCancelled(entry)) return;
            const arrayBuffer = e.target.result;
            let textContent = '';
            try {
                if (typeof XLSX !== 'undefined') {
                    const wb = XLSX.read(arrayBuffer, { type: 'array' });
                    const parts = [];
                    for (const sheetName of wb.SheetNames) {
                        const csv = XLSX.utils.sheet_to_csv(wb.Sheets[sheetName]);
                        parts.push(`--- Feuille : ${sheetName} ---\n${csv}`);
                    }
                    textContent = parts.join('\n\n');
                }
            } catch (err) {
                console.error('Erreur extraction XLSX:', err);
            }
            _untrackLoad(entry);
            const base64 = arrayBufferToBase64(arrayBuffer);
            if (!textContent) {
                if (typeof showModelAlert === 'function') {
                    showModelAlert(`Impossible d'extraire les données de ${file.name}. Le fichier est joint mais son contenu ne sera pas lisible par l'IA.`);
                }
            }
            STATE.pendingFiles.push({ name: file.name, mimeType: file.type || 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', data: base64, textContent });
            notifyChange();
        };
        reader.onerror = reader.onabort = () => {
            _untrackLoad(entry);
            notifyChange();
        };
        reader.readAsArrayBuffer(file);
    } else if (isPptx(file)) {
        if (typeof showModelAlert === 'function') {
            showModelAlert(`Les fichiers PowerPoint (.pptx) ne sont pas encore pris en charge pour l'extraction de texte : ${file.name}.`);
        }
    } else {
        if (typeof showModelAlert === 'function') {
            showModelAlert(`Format de fichier non pris en charge : ${file.name}. Formats acceptés : images, PDF, DOCX, XLSX, TXT, MD, CSV, JSON.`);
        } else {
            console.warn('Format de fichier non pris en charge :', file.name);
        }
    }
}

// --- Rendu de la prévisualisation ---
export function renderAttachPreview() {
    const attachPreview = getAttachPreview();
    attachPreview.innerHTML = '';
    STATE.pendingImages.forEach((img, idx) => {
        const thumb = document.createElement('div');
        thumb.className = 'attach-thumb';

        const imgEl = document.createElement('img');
        imgEl.src = img.dataUrl;
        imgEl.alt = img.name;
        imgEl.style.cursor = 'zoom-in';
        imgEl.addEventListener('click', () => openLightbox(img.dataUrl));

        const removeBtn = document.createElement('button');
        removeBtn.className = 'attach-thumb-remove';
        removeBtn.textContent = '×';
        removeBtn.addEventListener('click', () => {
            STATE.pendingImages.splice(idx, 1);
            renderAttachPreview();
            if (_onStateChange) _onStateChange();
        });

        thumb.appendChild(imgEl);
        thumb.appendChild(removeBtn);
        attachPreview.appendChild(thumb);
    });
    STATE.pendingFiles.forEach((file, idx) => {
        const card = document.createElement('div');
        card.className = 'attach-file-card';
        card.title = file.name;
        card.addEventListener('click', () => {
            if (file.data) {
                const blob = new Blob([Uint8Array.from(atob(file.data), c => c.charCodeAt(0))], { type: file.mimeType || 'application/octet-stream' });
                openFileViewer(URL.createObjectURL(blob), file.name);
            }
        });

        const preview = document.createElement('div');
        preview.className = 'attach-file-card-preview';
        preview.textContent = (file.textContent || '').slice(0, 400);

        const footer = document.createElement('div');
        footer.className = 'attach-file-card-footer';
        const ext = (file.name.split('.').pop() || 'file').toUpperCase().slice(0, 4);
        const badge = document.createElement('span');
        badge.className = 'attach-file-card-badge';
        badge.textContent = ext;
        const name = document.createElement('span');
        name.className = 'attach-file-card-name';
        name.textContent = file.name;
        footer.appendChild(badge);
        footer.appendChild(name);

        const removeBtn = document.createElement('button');
        removeBtn.className = 'attach-file-card-remove';
        removeBtn.textContent = '×';
        removeBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            STATE.pendingFiles.splice(idx, 1);
            renderAttachPreview();
            if (_onStateChange) _onStateChange();
        });

        card.appendChild(preview);
        card.appendChild(footer);
        card.appendChild(removeBtn);
        attachPreview.appendChild(card);
    });
    STATE.pendingLoadingFiles.forEach((entry) => {
        const chip = document.createElement('div');
        chip.className = 'attach-file-chip attach-file-chip-loading';
        chip.innerHTML = `<span class="attach-file-chip-icon spin">&#8987;</span> ${entry.name}`;
        attachPreview.appendChild(chip);
    });
}

// --- Initialisation des event listeners ---
export function initAttachments() {
    // Bouton pièce jointe
    getAttachBtn().addEventListener('click', () => getFileInput().click());

    // Sélection de fichiers
    getFileInput().addEventListener('change', () => {
        for (const file of getFileInput().files) {
            processAttachedFile(file);
        }
        getFileInput().value = '';
    });

    // Coller depuis le presse-papiers
    getPromptInput().addEventListener('paste', (e) => {
        const items = e.clipboardData && e.clipboardData.items;
        if (!items) return;
        for (const item of items) {
            if (item.type.startsWith('image/')) {
                e.preventDefault();
                const file = item.getAsFile();
                if (file) processAttachedFile(file);
            }
        }
    });

    // Drag & drop sur la zone de saisie
    const inputArea = document.querySelector('.input-area');
    if (inputArea) {
        inputArea.addEventListener('dragover', (e) => {
            e.preventDefault();
            inputArea.classList.add('drag-over');
        });
        inputArea.addEventListener('dragleave', (e) => {
            if (!inputArea.contains(e.relatedTarget)) {
                inputArea.classList.remove('drag-over');
            }
        });
        inputArea.addEventListener('drop', (e) => {
            e.preventDefault();
            inputArea.classList.remove('drag-over');
            const files = e.dataTransfer.files;
            if (!files || files.length === 0) return;
            for (const file of files) {
                processAttachedFile(file);
            }
        });
    }
}

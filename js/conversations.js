// © Marexsoft Corporation. Fondateur Kouassi Marius.
// --- Liste des conversations (script global) ---
const convList = document.getElementById("conv-list");
async function refreshConvList() {
    const conversations = await listConversationFiles();
    convList.innerHTML = '';
    STATE._fullTextsLoaded = false;

    // Couleur active selon la catégorie filtrée
    if (STATE.activeCategoryId) {
        const activeCat = readCategory(STATE.activeCategoryId);
        if (activeCat && activeCat.couleur) {
            convList.style.setProperty('--cat-color', activeCat.couleur);
            convList.style.setProperty('--cat-color-light', activeCat.couleur + '18');
        } else {
            convList.style.removeProperty('--cat-color');
            convList.style.removeProperty('--cat-color-light');
        }
    } else {
        convList.style.removeProperty('--cat-color');
        convList.style.removeProperty('--cat-color-light');
    }

    const fragment = document.createDocumentFragment();
    for (const conv of conversations) {
        // Filtre catégorie
        if (STATE.activeCategoryId) {
            if (conv.category !== STATE.activeCategoryId) continue;
        }

        const item = document.createElement('div');
        item.className = 'conv-item';
        item.dataset.filename = conv.filename;
        item.dataset.lastActivity = conv.lastActivity || conv.date || '';

        // Drag & drop
        item.draggable = true;
        item.addEventListener('dragstart', (e) => {
            e.dataTransfer.setData('text/plain', conv.filename);
            item.classList.add('dragging');
        });
        item.addEventListener('dragend', () => {
            item.classList.remove('dragging');
        });

        const itemContent = document.createElement('div');
        itemContent.className = 'conv-item-content';

        const title = document.createElement('div');
        title.className = 'conv-item-title';
        if (conv.titre) {
            title.textContent = conv.titre;
        } else {
            const firstMsg = conv.firstMessage || '';
            const titleText = typeof firstMsg === 'string' ? firstMsg : getTextFromContent(firstMsg);
            title.textContent = titleText
                ? titleText.substring(0, 30) + (titleText.length > 30 ? '...' : '')
                : conv.id;
        }

        const dateLine = document.createElement('div');
        dateLine.className = 'conv-item-date-line';

        const date = document.createElement('span');
        date.className = 'conv-item-date';
        // Cohérent avec refreshConvListItem : on affiche la dernière activité,
        // pas la date de création. Sans ça, le simple fait de quitter une conv
        // (qui déclenche un save → refresh DOM) faisait basculer l'affichage
        // de date de création vers lastActivity et donnait l'impression que
        // l'heure avait changé.
        const ts = conv.lastActivity || conv.date;
        if (ts) {
            const d = new Date(ts);
            date.textContent = d.toLocaleDateString('fr-FR') + ' ' + d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
        }

        const actionsDiv = document.createElement('div');
        actionsDiv.className = 'conv-item-actions';

        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'conv-action-btn danger';
        deleteBtn.innerHTML = '<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M9 6V4h6v2"/></svg>';
        deleteBtn.title = 'Supprimer cette conversation';
        deleteBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            deleteConversation(conv.filename);
        });

        const renameBtn = document.createElement('button');
        renameBtn.className = 'conv-action-btn';
        renameBtn.innerHTML = '<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.83 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/></svg>';
        renameBtn.title = 'Renommer';
        renameBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            renameConversation(conv.filename, title);
        });

        const catBtn = document.createElement('button');
        catBtn.className = 'conv-action-btn';
        catBtn.innerHTML = '<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>';
        catBtn.title = 'Changer de catégorie';
        catBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            const existing = document.getElementById('conv-cat-popup');
            if (existing) {
                const sameConv = existing.dataset.filename === conv.filename;
                existing.remove();
                if (sameConv) return;
            }
            showCatPopup(catBtn, conv.filename, conv.category);
        });

        const favBtn = document.createElement('button');
        favBtn.className = 'conv-action-btn fav-toggle';
        favBtn.innerHTML = '<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>';
        favBtn.title = 'Ajouter aux favoris';
        if (_isFavorite(conv.filename)) {
            favBtn.classList.add('active');
            favBtn.title = 'Retirer des favoris';
        }
        favBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            _toggleFavorite(conv.filename);
            favBtn.classList.toggle('active');
            favBtn.title = favBtn.classList.contains('active') ? 'Retirer des favoris' : 'Ajouter aux favoris';
            renderFavList();
        });

        actionsDiv.appendChild(favBtn);
        actionsDiv.appendChild(deleteBtn);
        actionsDiv.appendChild(renameBtn);
        actionsDiv.appendChild(catBtn);

        dateLine.appendChild(date);
        dateLine.appendChild(actionsDiv);

        itemContent.appendChild(title);
        itemContent.appendChild(dateLine);

        item.appendChild(itemContent);
        item.addEventListener('click', () => {
            loadConversation(conv.filename);
            // Sur mobile, fermer la sidebar après sélection
            if (window.innerWidth < 768) {
                document.body.classList.remove('sidebar-open');
            }
        });
        // Support tactile immédiat (pas de délai 300ms)
        item.style.touchAction = 'manipulation';
        fragment.appendChild(item);
    }
    convList.appendChild(fragment);
    highlightActiveConv();
    renderFavList();

    if (convSearch.value) {
        convSearch.dispatchEvent(new Event('input'));
    }
}

// Mise à jour incrémentale d'un seul item de la sidebar à partir des métadonnées
// fraîchement écrites. Évite un `refreshConvList` complet (lecture totale BD +
// reconstruction du DOM) après chaque save/regen/model-switch.
//   - retourne true si la mise à jour DOM a été appliquée (item présent)
//   - retourne false si l'item n'existe pas (caller doit faire un refresh complet)
function refreshConvListItem(filename) {
    if (typeof getConvMetadata !== 'function') return false;
    const meta = getConvMetadata(filename);
    if (!meta) return false;

    const escapedFn = (typeof CSS !== 'undefined' && CSS.escape)
        ? CSS.escape(filename)
        : filename.replace(/"/g, '\\"');
    const existing = convList.querySelector(`.conv-item[data-filename="${escapedFn}"]`);
    if (!existing) return false;

    // Si la conv ne matche plus la catégorie active, la retirer du DOM. Le filtrage
    // initial de `refreshConvList` aurait fait la même chose après reload complet.
    if (STATE.activeCategoryId && meta.category !== STATE.activeCategoryId) {
        existing.remove();
        return true;
    }

    // Mise à jour du titre — sauf si un input de renommage est actuellement ouvert
    // (sinon on écraserait la saisie en cours).
    const titleEl = existing.querySelector('.conv-item-title');
    if (titleEl && !titleEl.querySelector('input')) {
        if (meta.titre) {
            titleEl.textContent = meta.titre;
        } else {
            const firstMsg = meta.firstMessage || '';
            const titleText = typeof firstMsg === 'string' ? firstMsg : getTextFromContent(firstMsg);
            titleEl.textContent = titleText
                ? titleText.substring(0, 30) + (titleText.length > 30 ? '...' : '')
                : meta.id;
        }
    }

    const dateEl = existing.querySelector('.conv-item-date');
    if (dateEl) {
        const ts = meta.lastActivity || meta.date;
        if (ts) {
            const d = new Date(ts);
            dateEl.textContent = d.toLocaleDateString('fr-FR') + ' ' + d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
        }
    }

    // Déplacer en tête uniquement si lastActivity a réellement avancé.
    // Sinon (ex. simple changement de conv sans nouveau message), on garde
    // l'ordre courant pour ne pas faire remonter la conv inutilement.
    const newTs = meta.lastActivity || meta.date || '';
    const prevTs = existing.dataset.lastActivity || '';
    if (newTs && newTs > prevTs) {
        existing.dataset.lastActivity = newTs;
        if (convList.firstChild !== existing) {
            convList.insertBefore(existing, convList.firstChild);
        }
    }
    // Le contenu textuel de la conv a probablement changé : invalider le cache
    // de recherche full-text (équivalent au reset que faisait `refreshConvList`).
    STATE._fullTextsLoaded = false;
    return true;
}

function showCatPopup(btn, filename, currentCategoryId) {
    const categories = listCategories();

    const popup = document.createElement('div');
    popup.className = 'conv-cat-popup';
    popup.id = 'conv-cat-popup';
    popup.dataset.filename = filename;

    const noCatItem = document.createElement('div');
    noCatItem.className = 'conv-cat-popup-item' + (!currentCategoryId ? ' active' : '');
    noCatItem.innerHTML = '<span style="opacity:0.4;font-size:0.8rem">—</span><span>Sans catégorie</span>';
    noCatItem.addEventListener('click', async () => {
        await updateConversationCategory(filename, null);
        const expectedFn = STATE.conversationId
            ? STATE.conversationId.replace(/[<>:"/\\|?*]/g, '_') + '.json'
            : null;
        if (filename === expectedFn) {
            STATE.currentConversationCategory = null;
            updateActiveCatColor();
        }
        popup.remove();
        refreshConvList();
    });
    popup.appendChild(noCatItem);

    if (categories.length > 0) {
        const sep = document.createElement('div');
        sep.className = 'conv-cat-popup-separator';
        popup.appendChild(sep);

        for (const cat of categories) {
            const catItem = document.createElement('div');
            catItem.className = 'conv-cat-popup-item' + (currentCategoryId === cat.id ? ' active' : '');
            if (currentCategoryId === cat.id && cat.couleur) {
                catItem.style.background = cat.couleur + '22';
            }
            catItem.innerHTML = `<span>${cat.icone || '📁'}</span><span>${cat.nom}</span>`;
            catItem.addEventListener('click', async () => {
                await updateConversationCategory(filename, cat.id);
                const expectedFn = STATE.conversationId
                    ? STATE.conversationId.replace(/[<>:"/\\|?*]/g, '_') + '.json'
                    : null;
                if (filename === expectedFn) {
                    STATE.currentConversationCategory = cat.id;
                    updateActiveCatColor();
                }
                popup.remove();
                refreshConvList();
            });
            popup.appendChild(catItem);
        }
    }

    document.body.appendChild(popup);

    // Positionner à droite de la sidebar, aligné verticalement sur le bouton
    const sidebar = document.querySelector('.sidebar');
    const sidebarRect = sidebar.getBoundingClientRect();
    const btnRect = btn.getBoundingClientRect();
    const popupH = popup.offsetHeight;

    let top = btnRect.top + btnRect.height / 2 - 20;
    const maxTop = window.innerHeight - popupH - 8;
    if (top > maxTop) top = maxTop;
    if (top < 8) top = 8;

    popup.style.left = (sidebarRect.right + 8) + 'px';
    popup.style.top = top + 'px';

    // Fermer au clic extérieur
    const closeHandler = (e) => {
        if (!popup.contains(e.target)) {
            popup.remove();
            document.removeEventListener('click', closeHandler);
        }
    };
    setTimeout(() => document.addEventListener('click', closeHandler), 0);
}

async function renameConversation(filename, titleEl) {
    const currentTitle = titleEl.textContent;
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'conv-rename-input';
    input.value = currentTitle;
    titleEl.textContent = '';
    titleEl.appendChild(input);
    input.addEventListener('click', (e) => e.stopPropagation());
    input.focus();
    input.select();

    const finish = async () => {
        const newTitle = input.value.trim();
        if (newTitle && newTitle !== currentTitle) {
            // Mettre à jour dans IndexedDB
            const data = await readConversationFile(filename);
            if (data) {
                data.titre = newTitle;
                await writeConversationFile(filename, data);
            }
            // Mettre à jour la variable si c'est la conversation active
            const expectedFn = STATE.conversationId
                ? STATE.conversationId.replace(/[<>:"/\\|?*]/g, '_') + '.json'
                : null;
            if (filename === expectedFn) {
                STATE.conversationTitle = newTitle;
                updateChatHeader();
            }
        }
        titleEl.textContent = newTitle || currentTitle;
    };

    input.addEventListener('blur', finish);
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); input.blur(); }
        if (e.key === 'Escape') { input.value = currentTitle; input.blur(); }
    });
}

async function deleteConversation(filename) {
    if (!await customConfirm('Souhaitez-vous supprimer cette conversation ?\nCette action est irréversible.', { icon: 'delete', danger: true, okLabel: 'Supprimer' })) return;
    // Abandonner le stream éventuel pour la conv supprimée
    const _delConvId = filename.replace(/\.json$/i, '');
    for (const [convId, ctx] of STATE._activeStreams.entries()) {
        const fn = convId.replace(/[<>:"/\\|?*]/g, '_');
        if (fn === _delConvId) {
            try { ctx.abortController.abort(); } catch (e) {}
            STATE._activeStreams.delete(convId);
        }
    }
    await deleteConversationFile(filename);
    const expectedFn = STATE.conversationId
        ? STATE.conversationId.replace(/[<>:"/\\|?*]/g, '_') + '.json'
        : null;
    if (filename === expectedFn) {
        resetConversation();
    }
    refreshConvList();
}

async function loadConversation(filename) {
    // Ne pas abandonner les streams en cours : ils continueront en arrière-plan
    // et persisteront leur résultat sur disque via leur STATE.conversationId capturé.
    // Ne sauvegarder que si on change vraiment de conversation : un rafraîchissement
    // de la conversation actuellement affichée (déclenché par _saveConvById après
    // complétion d'un stream) ne doit pas écraser le disque avec un global stale.
    const _currentFilename = STATE.conversationId
        ? STATE.conversationId.replace(/[<>:"/\\|?*]/g, '_') + '.json'
        : null;
    if (filename !== _currentFilename) {
        saveConversation();
    }

    const data = await readConversationFile(filename);
    if (!data) return;

    // Restaurer l'état de la conversation
    STATE.conversationId = data.id;
    localStorage.setItem('cetas-last-conv', filename);
    STATE.conversationTitle = data.titre || null;
    STATE.conversationStartTime = data.date;
    STATE.conversationLastActivity = data.lastActivity || data.date;
    const savedModel = migrateModelId(data.modele);
    STATE.conversationHistory = data.messages || [];
    STATE.totalInputTokens = data.tokens_entree || 0;
    STATE.totalOutputTokens = data.tokens_sortie || 0;
    STATE.totalCost = data.totalCost || 0;
    STATE.totalImageCost = data.cout_images || 0;
    STATE.totalAudioCost = data.cout_audio || 0;
    STATE.totalTitleCost = data.cout_titre || 0;
    STATE.costByModel = data.cost_by_model || {};
    STATE.currentConversationCategory = data.category || null;
    if (STATE.conversationHistory.length > 0) {
        const _firstContent = STATE.conversationHistory[0].content;
        const _firstText = getTextFromContent(_firstContent);
        if (_firstText) {
            STATE.firstPrompt = _firstText;
        } else if (Array.isArray(_firstContent)) {
            const _imgPart = _firstContent.find(p => p.type === 'image');
            const _filePart = _firstContent.find(p => p.type === 'file');
            const _files = _firstContent.filter(p => p.type === 'file');
            if (_imgPart) STATE.firstPrompt = '(image)';
            else if (_files.length === 1 && _filePart?.name) STATE.firstPrompt = `(${_filePart.name})`;
            else if (_files.length > 1) STATE.firstPrompt = '(fichiers joints)';
            else STATE.firstPrompt = '(message)';
        } else {
            STATE.firstPrompt = '(message)';
        }
    } else {
        STATE.firstPrompt = null;
    }
    STATE.conversationStarted = STATE.conversationHistory.length > 0;

    // Déterminer si c'est un modèle texte, image ou recherche et switcher l'onglet
    const isImageModel = IMAGE_MODELS.some(m => m.id === savedModel);
    const isSearchModel = SEARCH_MODELS.some(m => m.id === savedModel);
    const isTextModel = MODELS.some(m => m.id === savedModel);
    const isKnownModel = isImageModel || isSearchModel || isTextModel;
    if (isImageModel) {
        STATE.currentImageModel = savedModel;
        STATE.currentModel = null;
        STATE.currentSearchModel = null;
        _switchTab('image', false);
        modelSelect._customValue = savedModel;
        updateTriggerDisplay(modelSelect);
        updateActiveOption(modelSelect);
        updateImageParamsVisibility(getImageModelEditeur(savedModel) || '', savedModel);
        setRightPanelTab('image');
    } else if (isSearchModel) {
        STATE.currentSearchModel = savedModel;
        STATE.currentModel = null;
        STATE.currentImageModel = null;
        _switchTab('search', false);
        modelSelect._customValue = savedModel;
        updateTriggerDisplay(modelSelect);
        updateActiveOption(modelSelect);
        setRightPanelTab('general');
    } else if (isTextModel) {
        STATE.currentModel = savedModel;
        STATE.currentImageModel = null;
        STATE.currentSearchModel = null;
        _switchTab('text', false);
        modelSelect._customValue = savedModel;
        updateTriggerDisplay(modelSelect);
        updateActiveOption(modelSelect);
        updateEffortMandatory(savedModel);
        setRightPanelTab('general');
    } else {
        // Modèle d'origine indisponible (retiré de models.js, ou modèle local hors ligne).
        // Ne pas l'assigner à STATE.currentModel, l'utilisateur doit en choisir un autre avant d'envoyer.
        STATE.currentModel = null;
        STATE.currentImageModel = null;
        STATE.currentSearchModel = null;
        _switchTab('text', false);
        modelSelect._customValue = '';
        updateTriggerDisplay(modelSelect);
        updateActiveOption(modelSelect);
        setRightPanelTab('general');
        // Ne signaler que si un identifiant non vide est présent : une conversation
        // sauvegardée sans modèle (premier message en cours, file fraîchement créé)
        // n'a pas à déclencher d'alerte.
        if (savedModel) showMissingModelBanner(savedModel);
    }

    // Restaurer le system prompt
    if (data.system_prompt || data.systemPrompt) {
        const spName = data.system_prompt || data.systemPrompt;
        spSelect.value = '';
        for (const opt of spSelect.options) {
            if (opt.textContent === spName) { spSelect.value = opt.value; break; }
        }
        STATE.currentSystemPrompt = spSelect.value
            ? { nom: spName, contenu: spSelect.selectedOptions[0]?.dataset.contenu || '' }
            : { nom: spName, contenu: '' };
        spTextarea.value = STATE.currentSystemPrompt.contenu;
    } else {
        STATE.currentSystemPrompt = null;
        spSelect.value = '';
        spTextarea.value = '';
    }

    // Restaurer l'état du canvas (si présent dans la conversation)
    if (window.Canvas) {
        window.Canvas.loadFromConv(data.canvas || null);
    }
    if (typeof updateCanvasBtn === 'function') updateCanvasBtn();

    // Restaurer le modèle actif depuis le dernier model-switch
    const lastSwitch = [...STATE.conversationHistory].reverse().find(m => m.type === 'model-switch');
    if (lastSwitch) {
        const restoredModel = lastSwitch.to;
        const isImg = IMAGE_MODELS.some(m => m.id === restoredModel);
        const isSrch = SEARCH_MODELS.some(m => m.id === restoredModel);
        const isTxt = MODELS.some(m => m.id === restoredModel);
        if (isImg || isSrch || isTxt) {
            STATE.currentModel = null; STATE.currentImageModel = null; STATE.currentSearchModel = null;
            if (isImg) {
                STATE.currentImageModel = restoredModel;
                _switchTab('image', false);
            } else if (isSrch) {
                STATE.currentSearchModel = restoredModel;
                _switchTab('search', false);
            } else {
                STATE.currentModel = restoredModel;
                _switchTab('text', false);
            }
            modelSelect._customValue = restoredModel;
            updateTriggerDisplay(modelSelect);
            updateActiveOption(modelSelect);
        } else if (isKnownModel && restoredModel) {
            // Le model-switch pointe vers un modèle disparu, mais le modèle initial existe encore.
            // On garde la sélection initiale et on prévient l'utilisateur.
            showMissingModelBanner(restoredModel);
        }
    }

    spSelect.disabled = false;

    // Vider les pièces jointes en attente
    STATE.pendingImages = [];
    STATE.pendingFiles = [];
    cancelAllPendingLoads();
    attachPreview.innerHTML = '';

    // Réafficher les messages avec transition
    chatContainer.classList.remove('fade-in');
    chatContainer.innerHTML = '';
    for (const msg of STATE.conversationHistory) {
        if (msg.type === 'model-switch') {
            addModelSwitchElement(getModelLabel(msg.from), getModelLabel(msg.to));
        } else {
            const msgDiv = addMessage(msg.role === 'user' ? 'user' : 'assistant', msg.content, msg.citations, msg.generationTime, msg.thinking, msg.outputTokens, msg.model);
            if (msg.error) applyErrorStyle(msgDiv);
        }
    }
    void chatContainer.offsetWidth;
    chatContainer.classList.add('fade-in');

    // Si la conversation chargée a un stream en cours, restaurer l'état "streaming"
    // pour que le bouton Stop reste visible et fonctionnel, et réattacher le rendu
    // sur un nouvel assistantDiv pour voir le streaming live (texte) ou un placeholder (image).
    const _liveStream = STATE._activeStreams.get(STATE.conversationId);
    if (_liveStream) {
        STATE.isStreaming = true;
        STATE.currentAbortController = _liveStream.abortController;
        _rebindStreamToVisibleDOM(_liveStream);
    } else {
        STATE.isStreaming = false;
        STATE.currentAbortController = null;
        // Bulles assistant vides issues de l'historique (stream interrompu : onglet
        // fermé, app tuée pendant la génération…). Sans stream actif pour les
        // remplir, le placeholder « Génération en cours… » resterait affiché à vie.
        // On les convertit en message d'erreur standard et on persiste l'état.
        let _patchedStale = false;
        chatContainer.querySelectorAll('.message-assistant .generation-placeholder').forEach(ph => {
            const msgDiv = ph.closest('.message-assistant');
            const textEl = ph.parentElement;
            if (textEl) textEl.textContent = STREAM_ERROR_CONTENT;
            if (msgDiv) applyErrorStyle(msgDiv);
            _patchedStale = true;
        });
        if (_patchedStale) {
            for (const m of STATE.conversationHistory) {
                if (m.role !== 'assistant' || m.error) continue;
                if (getTextFromContent(m.content)) continue;
                // Préserver les messages image-only / fichier-only : un assistant
                // peut légitimement répondre avec une image sans texte.
                const hasMedia = Array.isArray(m.content)
                    && m.content.some(p => p.type === 'image' || p.type === 'file');
                if (hasMedia) continue;
                m.content = STREAM_ERROR_CONTENT;
                m.error = true;
            }
            saveConversation();
        }
    }

    updateTokenDisplay();
    updateSendButton();
    highlightActiveConv();
    updateExportMdBtn();
    addRegenBtn();
    updateChatHeader();
    updateActiveCatColor();
}

function updateChatHeader() {
    // No-op: chat header bar removed, settings button always visible
}

function highlightActiveConv() {
    const items = convList.querySelectorAll('.conv-item');
    for (const item of items) {
        const fn = item.dataset.filename;
        const expectedFn = STATE.conversationId
            ? STATE.conversationId.replace(/[<>:"/\\|?*]/g, '_') + '.json'
            : null;
        item.classList.toggle('active', fn === expectedFn);
    }
}
window.refreshConvList = refreshConvList;
window.highlightActiveConv = highlightActiveConv;

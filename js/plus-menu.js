// --- Menu "+" (script global) ---
const escHtml = window.escHtml || function(s) { var d = document.createElement("div"); d.textContent = s; return d.innerHTML; };
const modelSelect = document.getElementById("model-select");
function updateActiveOption(selectEl) {
    if (!selectEl._customUI) return;
    const { dropdown } = selectEl._customUI;
    const val = selectEl._customValue;
    dropdown.querySelectorAll(".custom-select-option, .custom-select-option--empty").forEach(el => {
        el.classList.toggle("active", el.dataset.value === val);
    });
}
// --- Menu "+" (Plus d'options) ---

// Mapping des logos de provider (SVG dans images/)
const PROVIDER_LOGOS = {
    openai: 'images/OpenAI.svg',
    anthropic: 'images/Anthropic.svg',
    google: 'images/Google.svg',
    mistral: 'images/Mistral.svg',
    perplexity: 'images/Perplexity.svg',
    deepseek: 'images/DeepSeek.svg',
    grok: 'images/Grok.svg',
    zai: 'images/Z.ai.svg',
    groq: 'images/Groq.svg',
    nvidia: 'images/Nvidia.svg',
    cabreras: 'images/Cabreras.svg',
    openrouter: 'images/OpenRouter.svg',
    samagent: 'images/SamAgent.svg',
    ollama: 'images/Ollama.svg',
    lmstudio: 'images/LMStudio.svg',
    llamacpp: 'images/LlamaCpp.svg'
};

// 5 compétences réelles (prompts système prédéfinis)
const COMPETENCES = [
    {
        id: 'correcteur',
        name: 'Correcteur orthographique',
        icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>',
        prompt: 'Tu es un correcteur orthographique et grammatical professionnel. Ta tâche est de corriger toutes les fautes d\'orthographe, de grammaire, de conjugaison et de ponctuation dans le texte fourni. Explique brièvement les corrections importantes. Reformule uniquement si nécessaire pour la clarté.'
    },
    {
        id: 'traducteur',
        name: 'Traducteur Français-Anglais',
        icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 8l6 6"/><path d="M4 14l6-6 2-3"/><path d="M2 5h12"/><path d="M7 2h1"/><path d="M22 22l-5-10-5 10"/><path d="M14 18h6"/></svg>',
        prompt: 'Tu es un traducteur professionnel français-anglais. Traduis le texte fourni dans l\'autre langue (français vers anglais, ou anglais vers français selon le cas). Conserve le ton, le style et le registre du texte original. Si le texte contient des termes techniques, utilise la terminologie appropriée.'
    },
    {
        id: 'code-expert',
        name: 'Expert en programmation',
        icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>',
        prompt: 'Tu es un expert en programmation et génie logiciel. Analyse le code fourni, explique son fonctionnement, identifie les bugs potentiels, et propose des améliorations (performance, lisibilité, sécurité). Donne des exemples concrets et référence les bonnes pratiques.'
    },
    {
        id: 'resumeur',
        name: 'Résumé de texte',
        icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="4" y1="6" x2="20" y2="6"/><line x1="4" y1="10" x2="20" y2="10"/><line x1="4" y1="14" x2="14" y2="14"/><line x1="4" y1="18" x2="10" y2="18"/></svg>',
        prompt: 'Tu es un expert en synthèse de documents. Résume le texte fourni de manière concise et structurée. Utilise des puces pour les points clés. Conserve les informations essentielles et le ton du document original. La synthèse doit être environ 3 à 5 fois plus courte que l\'original.'
    },
    {
        id: 'pedagogue',
        name: 'Assistant pédagogique',
        icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>',
        prompt: 'Tu es un professeur patient et pédagogue. Explique le concept ou le sujet fourni de manière simple et accessible, comme si tu t\'adressais à un débutant. Utilise des analogies, des exemples concrets, et progresse du plus simple au plus complexe. Pose des questions pour vérifier la compréhension.'
    }
];

function initConversationPanel() {
    const chatHeaderSettings = document.getElementById('chat-header-settings');
    const rightPanel = document.getElementById('right-panel');
    const convPanelBody = document.getElementById('panel-conversation-body');
    if (!rightPanel || !convPanelBody) return;

    // Déplacer tout le contenu du panneau droit dans l'onglet Conversation
    while (rightPanel.firstChild) {
        convPanelBody.appendChild(rightPanel.firstChild);
    }

    // Rediriger le bouton engrenage (barre de saisie) vers l'onglet Conversation
    if (chatHeaderSettings) {
        chatHeaderSettings.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            if (typeof openApiKeysModal === 'function') {
                openApiKeysModal();
                // Activer l'onglet Conversation
                setTimeout(() => {
                    const tab = document.querySelector('.apikeys-tab[data-tab="conversation"]');
                    if (tab) tab.click();
                }, 50);
            }
        });
    }

    // Rediriger le bouton settings de la toolbar latérale
    const sideSettings = document.getElementById('side-toggle-settings');
    if (sideSettings) {
        sideSettings.title = 'Réglages de la conversation';
        sideSettings.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            if (typeof openApiKeysModal === 'function') {
                openApiKeysModal();
                setTimeout(() => {
                    const tab = document.querySelector('.apikeys-tab[data-tab="conversation"]');
                    if (tab) tab.click();
                }, 50);
            }
        });
    }

}

// Peuple la liste des modèles dans le menu "+" pour l'onglet donné
function populatePlusModels(tab) {
    const plusModelList = document.getElementById('plus-model-list');
    if (!plusModelList) return;

    const models = tab === 'text' ? MODELS : tab === 'image' ? IMAGE_MODELS : SEARCH_MODELS;
    const tarifFn = tab === 'text' ? getTarif : tab === 'image' ? getImageTarif : getSearchTarif;

    const prefs = loadCatalogPrefs();
    const _disabled = new Set(prefs.disabled || []);
    const _orEnabled = new Set(prefs.orEnabled || []);
    const filtered = models.filter(m => {
        if (HIDDEN_EDITEURS.has(m.editeur)) return false;
        if (m.editeur === 'openrouter') return _orEnabled.has(m.id) && hasProviderKey('openrouter');
        return hasProviderKey(m.editeur) && !_disabled.has(m.id);
    });

    if (filtered.length === 0) {
        plusModelList.innerHTML = `<div class="plus-model-empty">Aucun modèle disponible.<br><span class="plus-model-empty-link">Configurer →</span></div>`;
        plusModelList.querySelector('.plus-model-empty-link')?.addEventListener('click', () => {
            if (typeof openApiKeysModal === 'function') openApiKeysModal();
        });
        return;
    }

    const groups = {};
    filtered.forEach(m => {
        if (!groups[m.editeur]) groups[m.editeur] = [];
        groups[m.editeur].push(m);
    });

    const sorted = Object.keys(groups).sort((a, b) => {
        const ia = EDITEUR_ORDER.indexOf(a), ib = EDITEUR_ORDER.indexOf(b);
        if (ia === -1 && ib === -1) return a.localeCompare(b);
        if (ia === -1) return 1;
        if (ib === -1) return -1;
        return ia - ib;
    });

    const activeModel = tab === 'text' ? STATE.currentModel :
                       tab === 'image' ? STATE.currentImageModel : STATE.currentSearchModel;

    const plusBtn = document.getElementById('plus-menu-btn');
    const plusDropdown = document.getElementById('plus-menu-dropdown');

    let html = '';
    sorted.forEach(editeur => {
        const models = groups[editeur];
        const logo = PROVIDER_LOGOS[editeur] || '';
        const logoHtml = logo ? `<img src="${logo}" class="plus-model-provider-icon" alt="" onerror="this.style.display='none'">` : '';
        html += `<div class="plus-model-provider">`;
        html += `<div class="plus-model-provider-header">${logoHtml}<span class="plus-model-provider-name">${editeur.charAt(0).toUpperCase() + editeur.slice(1)}</span><span class="plus-model-provider-count">${models.length}</span><svg class="plus-model-chevron" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="9 18 15 12 9 6"/></svg></div>`;
        html += `<div class="plus-model-items">`;
        models.forEach(m => {
            const tarif = tarifFn(m.id);
            const priceStr = _formatModelPriceString(m, tarif);
            const activeClass = m.id === activeModel ? ' active' : '';
            html += `<button type="button" class="plus-model-item${activeClass}" data-model="${escHtmlAttr(m.id)}" data-editeur="${escHtmlAttr(m.editeur)}"><span class="plus-model-item-name">${escHtml(m.label)}</span>${priceStr ? `<span class="plus-model-item-price">${priceStr}</span>` : ''}</button>`;
        });
        html += `</div></div>`;
    });

    plusModelList.innerHTML = html;

    plusModelList.querySelectorAll('.plus-model-provider-header').forEach(header => {
        header.addEventListener('click', () => {
            header.parentElement.classList.toggle('open');
        });
    });

    plusModelList.querySelectorAll('.plus-model-item').forEach(item => {
        item.addEventListener('click', () => {
            const modelId = item.dataset.model;
            const lookupFn = tab === 'text' ? getModelEditeur : tab === 'image' ? getImageModelEditeur : getSearchModelEditeur;
            if (modelId && !checkApiKeyForModel(modelId, lookupFn)) return;

            modelSelect._activeCategory = tab;
            modelSelect._customValue = modelId;
            _applyModelSelection(tab, modelId);
            updateActiveOption(modelSelect);
            updateInputHint();
            updateWebSearchBtn();
            if (typeof updateCanvasBtn === 'function') updateCanvasBtn();
            if (plusDropdown) plusDropdown.style.display = 'none';
            if (plusBtn) plusBtn.classList.remove('open');
        });
    });

    plusModelList.querySelector('.plus-model-empty-link')?.addEventListener('click', () => {
        if (typeof openApiKeysModal === 'function') openApiKeysModal();
    });
}

function initPlusMenu() {
    const plusBtn = document.getElementById('plus-menu-btn');
    const plusDropdown = document.getElementById('plus-menu-dropdown');
    const plusSkills = document.getElementById('plus-menu-skills');
    const plusReflectionToggle = document.getElementById('plus-reflection-toggle');
    const plusWebsearchToggle = document.getElementById('plus-websearch-toggle');
    const plusWebsearchDepth = document.getElementById('plus-websearch-depth');
    const plusModelList = document.getElementById('plus-model-list');
    const plusModelTabs = document.getElementById('plus-model-tabs');

    if (!plusBtn || !plusDropdown) return;

    let _activeTab = 'text';

    // --- Onglets Modèles ---
    if (plusModelTabs) {
        plusModelTabs.querySelectorAll('.plus-model-tab').forEach(tab => {
            tab.addEventListener('click', () => {
                plusModelTabs.querySelectorAll('.plus-model-tab').forEach(t => t.classList.remove('active'));
                tab.classList.add('active');
                populatePlusModels(tab.dataset.tab);
            });
        });
    }

    // Peuplement initial
    populatePlusModels('text');

    // --- Peupler les compétences ---
    if (plusSkills) {
        COMPETENCES.forEach(comp => {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'plus-menu-skill';
            btn.dataset.skillId = comp.id;
            btn.innerHTML = `<span class="plus-menu-skill-icon">${comp.icon}</span>${comp.name}`;
            btn.addEventListener('click', () => {
                applySkillPrompt(comp);
                plusDropdown.style.display = 'none';
                plusBtn.classList.remove('open');
            });
            plusSkills.appendChild(btn);
        });
    }

    // --- Mode Réflexion : sync avec le panneau droit ---
    if (plusReflectionToggle) {
        const rpEffortToggle = document.getElementById('rp-effort-toggle');
        const rpEffortSection = document.getElementById('rp-effort-section');
        // Lecture état initial
        if (rpEffortToggle && rpEffortSection) {
            plusReflectionToggle.checked = rpEffortToggle.checked && !rpEffortSection.classList.contains('rp-param-disabled');
        }
        // Au changement → propager vers le panneau droit
        plusReflectionToggle.addEventListener('change', () => {
            if (rpEffortToggle && rpEffortSection) {
                rpEffortToggle.checked = plusReflectionToggle.checked;
                if (plusReflectionToggle.checked) {
                    rpEffortSection.classList.remove('rp-param-disabled');
                } else {
                    rpEffortSection.classList.add('rp-param-disabled');
                }
                rpEffortToggle.dispatchEvent(new Event('change', { bubbles: true }));
            }
        });
    }

    // --- Effort : sync avec le select du panneau droit ---
    const effortPills = document.querySelectorAll('#plus-effort-pills .plus-menu-pill');
    if (effortPills.length) {
        const rpEffortSelect = document.getElementById('rp-effort-select');
        // Lecture état initial
        if (rpEffortSelect) {
            updateEffortPills(rpEffortSelect.value);
        }
        effortPills.forEach(pill => {
            pill.addEventListener('click', () => {
                const val = pill.dataset.effort;
                updateEffortPills(val);
                if (rpEffortSelect) {
                    rpEffortSelect.value = val;
                    rpEffortSelect.dispatchEvent(new Event('change', { bubbles: true }));
                }
                // Activer la réflexion si elle ne l'est pas déjà
                if (plusReflectionToggle && !plusReflectionToggle.checked) {
                    plusReflectionToggle.checked = true;
                    plusReflectionToggle.dispatchEvent(new Event('change', { bubbles: true }));
                }
            });
        });
    }

    function updateEffortPills(val) {
        effortPills.forEach(p => p.classList.toggle('active', p.dataset.effort === val));
    }

    // --- Recherche web : toggle + profondeur ---
    if (plusWebsearchToggle) {
        // Lecture état initial
        plusWebsearchToggle.checked = STATE.webSearchEnabled;
        if (STATE.webSearchDepth === 'deep') {
            const deepPill = plusWebsearchDepth?.querySelector('[data-depth="deep"]');
            const stdPill = plusWebsearchDepth?.querySelector('[data-depth="standard"]');
            if (deepPill) deepPill.classList.add('active');
            if (stdPill) stdPill.classList.remove('active');
        }
        if (plusWebsearchDepth) {
            plusWebsearchDepth.style.display = plusWebsearchToggle.checked ? 'flex' : 'none';
        }

        plusWebsearchToggle.addEventListener('change', () => {
            STATE.webSearchEnabled = plusWebsearchToggle.checked;
            if (plusWebsearchDepth) {
                plusWebsearchDepth.style.display = plusWebsearchToggle.checked ? 'flex' : 'none';
            }
            // Sync avec le bouton globe
            if (webSearchBtn) {
                webSearchBtn.classList.toggle('active', STATE.webSearchEnabled);
            }
        });

        // Pilules profondeur
        plusWebsearchDepth?.querySelectorAll('.plus-menu-pill').forEach(pill => {
            pill.addEventListener('click', () => {
                plusWebsearchDepth.querySelectorAll('.plus-menu-pill').forEach(p => p.classList.remove('active'));
                pill.classList.add('active');
                STATE.webSearchDepth = pill.dataset.depth;
            });
        });
    }

    // --- Ouverture / fermeture ---
    plusBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const isOpen = plusDropdown.style.display === 'block';
        if (isOpen) {
            plusDropdown.style.display = 'none';
            plusBtn.classList.remove('open');
        } else {
            // Rafraîchir l'état avant ouverture
            refreshPlusMenuState();
            plusDropdown.style.display = 'block';
            plusBtn.classList.add('open');
        }
    });

    // --- Action : Fichiers (attache) ---
    const attachItem = plusDropdown.querySelector('[data-action="attach"]');
    if (attachItem) {
        attachItem.addEventListener('click', () => {
            fileInput.click();
            plusDropdown.style.display = 'none';
            plusBtn.classList.remove('open');
        });
    }

    // Fermeture au clic extérieur
    document.addEventListener('click', (e) => {
        if (plusDropdown.style.display === 'block' &&
            !plusDropdown.contains(e.target) &&
            e.target !== plusBtn &&
            !plusBtn.contains(e.target)) {
            plusDropdown.style.display = 'none';
            plusBtn.classList.remove('open');
        }
    });

    // Fermeture à Échap
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && plusDropdown.style.display === 'block') {
            plusDropdown.style.display = 'none';
            plusBtn.classList.remove('open');
        }
    });
}

function refreshPlusMenuState() {
    // Mode Réflexion
    const rpEffortToggle = document.getElementById('rp-effort-toggle');
    const rpEffortSection = document.getElementById('rp-effort-section');
    const plusReflectionToggle = document.getElementById('plus-reflection-toggle');
    if (plusReflectionToggle && rpEffortToggle && rpEffortSection) {
        plusReflectionToggle.checked = rpEffortToggle.checked && !rpEffortSection.classList.contains('rp-param-disabled');
    }
    // Effort
    const rpEffortSelect = document.getElementById('rp-effort-select');
    if (rpEffortSelect) {
        const pills = document.querySelectorAll('#plus-effort-pills .plus-menu-pill');
        pills.forEach(p => p.classList.toggle('active', p.dataset.effort === rpEffortSelect.value));
    }
    // Recherche web
    const plusWebsearchToggle = document.getElementById('plus-websearch-toggle');
    const plusWebsearchDepth = document.getElementById('plus-websearch-depth');
    if (plusWebsearchToggle) {
        plusWebsearchToggle.checked = STATE.webSearchEnabled;
        if (plusWebsearchDepth) {
            plusWebsearchDepth.style.display = STATE.webSearchEnabled ? 'flex' : 'none';
            plusWebsearchDepth.querySelectorAll('.plus-menu-pill').forEach(p => {
                p.classList.toggle('active', p.dataset.depth === (STATE.webSearchDepth || 'standard'));
            });
        }
    }
    // Rafraîchir la liste des modèles (après changement de clés API ou préférences)
    const activeTab = document.querySelector('#plus-model-tabs .plus-model-tab.active');
    if (activeTab && typeof populatePlusModels === 'function') {
        populatePlusModels(activeTab.dataset.tab);
    }
}

function applySkillPrompt(comp) {
    // Appliquer le prompt système comme un rôle
    const spTextarea = document.getElementById('sp-textarea');
    const spSelect = document.getElementById('sp-select');
    if (spTextarea) {
        spTextarea.value = comp.prompt;
        // Mettre à jour le system prompt courant
        if (STATE.currentSystemPrompt) {
            STATE.currentSystemPrompt.contenu = comp.prompt;
        } else {
            STATE.currentSystemPrompt = { nom: comp.name, contenu: comp.prompt };
        }
        // Déclencher input pour les handlers
        spTextarea.dispatchEvent(new Event('input', { bubbles: true }));
    }
    // Désélectionner le select (le rôle est custom)
    if (spSelect) spSelect.value = '';
    // Afficher le bouton d'enregistrement
    const spEditBtn = document.getElementById('sp-edit-btn');
    const rpRoleActions = document.getElementById('rp-role-actions');
    if (spEditBtn) spEditBtn.style.display = 'inline-flex';
    if (rpRoleActions) rpRoleActions.style.display = 'flex';
}

// Met à jour #input-hint avec le modèle actif (utilisé depuis le sélecteur du menu "+")
function updateInputHint() {
    const hint = document.getElementById('input-hint');
    if (!hint) return;
    const tab = modelSelect._activeCategory || 'text';
    const modelId = modelSelect._customValue;
    if (!modelId) {
        hint.innerHTML = 'Sélectionnez un modèle dans le <b>+</b>';
        return;
    }
    const models = tab === 'text' ? MODELS : tab === 'image' ? IMAGE_MODELS : SEARCH_MODELS;
    const m = models.find(x => x.id === modelId);
    if (m) {
        const logo = PROVIDER_LOGOS[m.editeur];
        hint.innerHTML = logo ? `<img src="${logo}" style="width:14px;height:14px;vertical-align:-2px;margin-right:4px;border-radius:2px" alt=""> ${escHtml(m.label)}` : escHtml(m.label);
    } else {
        hint.textContent = modelId;
    }
}


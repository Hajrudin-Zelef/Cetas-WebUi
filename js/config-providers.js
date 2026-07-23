// --- Config API / Providers (script global) ---

const apikeysBtn = document.getElementById('apikeys-btn');

let _modelsDirty = false;
let _keysDirty = false;
let _catalogDirty = false;

function _setModelsDirty(dirty) {
    _modelsDirty = dirty;
    const btn = document.getElementById('models-save-btn');
    if (btn) {
        btn.disabled = !dirty;
        btn.classList.toggle('models-save-btn--dirty', dirty);
    }
}

function _refreshApiModelesSaveBtn() {
    const btn = document.getElementById('apimodeles-save-btn');
    if (!btn) return;
    const dirty = !!(_keysDirty || _catalogDirty);
    btn.disabled = !dirty;
    btn.classList.toggle('models-save-btn--dirty', dirty);
}

function _setKeysDirty(dirty) {
    _keysDirty = dirty;
    _refreshApiModelesSaveBtn();
}

function _setCatalogDirty(dirty) {
    _catalogDirty = dirty;
    _refreshApiModelesSaveBtn();
}

let _budgetDirty = false;
function _setBudgetDirty(dirty) {
    _budgetDirty = dirty;
    const btn = document.getElementById('budget-save-btn');
    if (btn) {
        btn.disabled = !dirty;
        btn.classList.toggle('models-save-btn--dirty', dirty);
    }
}

// Affiche temporairement « Sauvegardé ✓ » sur un bouton de sauvegarde,
// puis le restaure au libellé d'origine.
const _SAVED_CHECK_SVG = '<svg class="models-save-check" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="5 12 10 17 19 7"/></svg>';
function _flashSavedFeedback(btn) {
    if (!btn) return;
    if (btn._savedTimeout) clearTimeout(btn._savedTimeout);
    if (btn._savedExitTimeout) clearTimeout(btn._savedExitTimeout);
    if (!btn._savedOriginalLabel) btn._savedOriginalLabel = btn.textContent;
    btn.classList.remove('models-save-btn--saved-exit');
    btn.classList.add('models-save-btn--saved');
    btn.innerHTML = `<span class="models-save-label">Sauvegardé</span>${_SAVED_CHECK_SVG}`;
    // Phase 1 : on laisse le check visible 1.3s
    btn._savedTimeout = setTimeout(() => {
        // Phase 2 : on déclenche l'animation de sortie (icône qui se replie,
        // fond qui revient à la normale). On change AUSSI le texte tout de
        // suite vers « Sauvegarder » pour qu'il revienne progressivement à
        // sa position centrée (au lieu d'un swap final brutal).
        const label = btn.querySelector('.models-save-label');
        if (label) label.textContent = btn._savedOriginalLabel || 'Sauvegarder';
        btn.classList.add('models-save-btn--saved-exit');
        btn.classList.remove('models-save-btn--saved');
        btn._savedExitTimeout = setTimeout(() => {
            btn.classList.remove('models-save-btn--saved-exit');
            btn.textContent = btn._savedOriginalLabel || 'Sauvegarder';
            btn._savedTimeout = null;
            btn._savedExitTimeout = null;
        }, 320);
    }, 1300);
}

function _maskedKey(value) {
    if (!value) return '';
    if (value.length <= 8) return value.substring(0, 2) + '....';
    return value.substring(0, 6) + '....' + value.slice(-2);
}

function _updateMaskedKeyDisplay(providerId) {
    const row = document.getElementById('apikey-masked-' + providerId);
    const text = document.getElementById('apikey-masked-text-' + providerId);
    if (!row || !text) return;
    const val = API_KEYS[providerId] || '';
    if (val) {
        text.textContent = _maskedKey(val);
        row.style.display = '';
    } else {
        row.style.display = 'none';
    }
}

function _restoreApiKeyInputs() {
    const providers = ['openai','anthropic','google','perplexity','mistral','deepseek','grok','zai','groq','nvidia','cabreras','openrouter'];
    for (const id of providers) {
        const el = document.getElementById('apikey-' + id);
        if (el) el.value = API_KEYS[id] || '';
        _updateMaskedKeyDisplay(id);
    }
    document.getElementById('apikey-ollama').value = API_KEYS.ollama || 'http://localhost:11434';
    document.getElementById('apikey-lmstudio').value = API_KEYS.lmstudio || 'http://localhost:1234';
    document.getElementById('apikey-llamacpp').value = API_KEYS.llamacpp || 'http://localhost:8080';
}

apikeysBtn.addEventListener('click', function() { window.openApiKeysModal(); });
// Auto-save : chaque champ de configuration s'enregistre automatiquement
function initConfigAutoSave() {
    // Clés API — listeners attachés dynamiquement par _initApiModelesPanel()
    const apiKeyIds = ['apikey-openai','apikey-anthropic','apikey-google','apikey-perplexity',
        'apikey-mistral','apikey-deepseek','apikey-grok','apikey-zai',
        'apikey-groq','apikey-nvidia','apikey-cabreras',
        'apikey-openrouter','apikey-ollama','apikey-lmstudio','apikey-llamacpp'];
    function saveApiKeysFromInputs() {
        const keys = {};
        for (const id of apiKeyIds) {
            const el = document.getElementById(id);
            keys[id.replace('apikey-','')] = el ? el.value.trim() : '';
        }
        saveApiKeys(keys);
        _setKeysDirty(false);
        // Mettre à jour l'affichage masqué pour tous les providers cloud
        for (const id of ['openai','anthropic','google','perplexity','mistral','deepseek','grok','zai','groq','nvidia','cabreras','openrouter']) {
            _updateMaskedKeyDisplay(id);
        }
    }

    // Bouton « Sauvegarder » du panel API et Modèles — sauve clés + catalogue
    const apimodelesSaveBtn = document.getElementById('apimodeles-save-btn');
    if (apimodelesSaveBtn) {
        apimodelesSaveBtn.addEventListener('click', () => {
            if (_keysDirty) saveApiKeysFromInputs();
            if (_catalogDirty) _saveCatalogFromUI();
            renderProviderCatalog(_activeProvider);
            _flashSavedFeedback(apimodelesSaveBtn);
        });
    }
    const apimodelesCancelBtn = document.getElementById('apimodeles-cancel-btn');
    if (apimodelesCancelBtn) {
        apimodelesCancelBtn.addEventListener('click', () => {
            _restoreApiKeyInputs();
            _setKeysDirty(false);
            _initCatalogPending();
            _setCatalogDirty(false);
            renderProviderCatalog(_activeProvider);
        });
    }

    // Sélecteurs audio/modèles — sauvegarde manuelle via bouton
    const selectIds = ['audio-tts-provider','audio-stt-provider','enhance-provider','summary-model','title-model','error-explainer-model','local-fallback-model'];

    function autoSaveAudioSettings() {
        saveAudioSettings({
            ttsProvider: document.getElementById('audio-tts-provider').value,
            sttProvider: document.getElementById('audio-stt-provider').value,
            enhanceModel: document.getElementById('enhance-provider').value,
            summaryModel: document.getElementById('summary-model').value,
            titleModel: document.getElementById('title-model').value,
            errorExplainerModel: document.getElementById('error-explainer-model').value,
            localFallbackModel: document.getElementById('local-fallback-model').value
        });
        updateLocalFallbackVisibility();
        _setModelsDirty(false);
    }

    for (const id of selectIds) {
        const el = document.getElementById(id);
        if (el) el.addEventListener('change', () => {
            updateLocalFallbackVisibility();
            _setModelsDirty(true);
        });
    }

    document.getElementById('models-save-btn').addEventListener('click', () => {
        autoSaveAudioSettings();
        _flashSavedFeedback(document.getElementById('models-save-btn'));
    });
    const modelsCancelBtn = document.getElementById('models-cancel-btn');
    if (modelsCancelBtn) {
        modelsCancelBtn.addEventListener('click', () => {
            populateModelSelects();
            updateLocalFallbackVisibility();
            _setModelsDirty(false);
        });
    }

    // Budget — sauvegarde manuelle via bouton
    const budgetFields = ['budget-enabled','budget-period','budget-amount'];
    for (const id of budgetFields) {
        const el = document.getElementById(id);
        const evt = id === 'budget-enabled' ? 'change' : 'input';
        if (el) el.addEventListener(evt, () => _setBudgetDirty(true));
    }
    const budgetSaveBtn = document.getElementById('budget-save-btn');
    if (budgetSaveBtn) {
        budgetSaveBtn.addEventListener('click', () => {
            saveBudgetSettings();
            updateBudgetPreview();
            _setBudgetDirty(false);
            _flashSavedFeedback(budgetSaveBtn);
        });
    }
    const budgetCancelBtn = document.getElementById('budget-cancel-btn');
    if (budgetCancelBtn) {
        budgetCancelBtn.addEventListener('click', () => {
            const budget = loadBudgetSettings();
            document.getElementById('budget-enabled').checked = budget.enabled;
            document.getElementById('budget-period').value = budget.period;
            document.getElementById('budget-amount').value = budget.amount || '';
            document.getElementById('budget-settings').style.display = budget.enabled ? '' : 'none';
            _setBudgetDirty(false);
        });
    }
}

// ============================================================
// --- Sous-onglets fournisseurs (panel API et Modèles) ---
// ============================================================

const PROVIDERS_CONFIG = [
    { id: 'openrouter', label: 'OpenRouter',       icon: 'OpenRouter.svg', placeholder: 'sk-or-...',  link: 'https://openrouter.ai/settings/keys',                        linkLabel: 'Obtenir une clé API OpenRouter', hasImage: true, isOpenRouter: true },
    { id: 'openai',     label: 'OpenAI',           icon: 'OpenAI.svg',     placeholder: 'sk-...',     link: 'https://platform.openai.com/settings/organization/api-keys', linkLabel: 'Obtenir une clé API OpenAI', hasImage: true },
    { id: 'anthropic',  label: 'Anthropic',        icon: 'Anthropic.svg',  placeholder: 'sk-ant-...', link: 'https://platform.claude.com/settings/keys',                  linkLabel: 'Obtenir une clé API Anthropic' },
    { id: 'google',     label: 'Google',           icon: 'Google.svg',     placeholder: 'AIza...',    link: 'https://aistudio.google.com/api-keys',                       linkLabel: 'Obtenir une clé API Google',    hasImage: true },
    { id: 'perplexity', label: 'Perplexity',       icon: 'Perplexity.svg', placeholder: 'pplx-...',   link: 'https://www.perplexity.ai/account/api/keys',                 linkLabel: 'Obtenir une clé API Perplexity' },
    { id: 'mistral',    label: 'Mistral',          icon: 'Mistral.svg',    placeholder: 'z9q6u...',   link: 'https://console.mistral.ai/api-keys',                        linkLabel: 'Obtenir une clé API Mistral' },
    { id: 'deepseek',   label: 'DeepSeek',         icon: 'DeepSeek.svg',   placeholder: 'sk-...',     link: 'https://platform.deepseek.com/api_keys',                     linkLabel: 'Obtenir une clé API DeepSeek' },
    { id: 'grok',       label: 'Grok',             icon: 'Grok.svg',       placeholder: 'xai-...',    link: 'https://console.x.ai/',                                      linkLabel: 'Obtenir une clé API Grok' },
    { id: 'zai',        label: 'Z.ai',             icon: 'Z.ai.svg',       placeholder: '...',        link: 'https://z.ai/manage-apikey/apikey-list',                     linkLabel: 'Obtenir une clé API Z.ai' },
    { id: 'groq',       label: 'Groq',             icon: 'Groq.svg',       placeholder: 'gsk_...',    link: 'https://console.groq.com/keys',                              linkLabel: 'Obtenir une clé API Groq' },
    { id: 'nvidia',     label: 'Nvidia NIM',       icon: 'Nvidia.svg',     placeholder: 'nvapi-...',  link: 'https://build.nvidia.com/explore/discover',                  linkLabel: 'Obtenir une clé API Nvidia' },
    { id: 'cabreras',   label: 'Cabreras',         icon: 'Cabreras.svg',   placeholder: 'ck-...',     link: 'https://cabreras.ai/',                                       linkLabel: 'Obtenir une clé API Cabreras' },
    { id: 'ollama',     label: 'Ollama',           icon: 'Ollama.svg',     placeholder: 'http://localhost:11434',                                                                                                      isLocal: true },
    { id: 'lmstudio',   label: 'LM Studio',        icon: 'LMStudio.svg',   placeholder: 'http://localhost:1234',                                                                                                       isLocal: true },
    { id: 'llamacpp',   label: 'LLaMA.cpp',        icon: 'LlamaCpp.svg',   placeholder: 'http://localhost:8080',                                                                                                       isLocal: true }
];

let _activeProvider = 'openrouter';
const _providerCatalogType = {}; // editeur -> 'text'|'image'

const _EYE_SVG = '<svg class="apikey-eye-show" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg><svg class="apikey-eye-hide" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>';

function _buildProviderTabsHtml() {
    return PROVIDERS_CONFIG.map((p, idx) => `
        <button type="button" class="provider-tab${idx === 0 ? ' active' : ''}" data-provider="${p.id}" title="${escHtml(p.label)}">
            <img src="images/${p.icon}" class="provider-tab-icon" alt="${escHtml(p.label)}">
            <span class="provider-tab-label">${escHtml(p.label)}</span>
        </button>
    `).join('');
}

function _buildProviderSectionHtml(p, isFirst) {
    const inputType = p.isLocal ? 'text' : 'password';
    const labelExtra = p.id === 'openrouter' ? ' <span class="apikey-local-hint">(LLM &amp; Images)</span>' : '';
    const linkHtml = p.link ? `<a class="apikey-get-link" href="${p.link}" target="_blank" rel="noopener noreferrer">${escHtml(p.linkLabel)}</a>` : '';
    const localStatusHtml = p.isLocal ? `<p class="apikey-local-status" id="apikey-${p.id}-status"></p>` : '';
    const refreshBtn = p.isLocal ? `<button id="apikey-${p.id}-refresh" type="button" class="apikey-local-update-btn" data-provider="${p.id}">Mettre à jour</button>` : '';
    const eyeBtn = p.isLocal ? '' : `<button type="button" class="apikey-eye-btn" data-target="apikey-${p.id}" title="Afficher la clé" aria-label="Afficher la clé">${_EYE_SVG}</button>`;
    // Affichage de la clé masquée + bouton Valider (providers cloud uniquement)
    const maskedKeyHtml = p.isLocal ? '' : `<div class="apikey-masked-row" id="apikey-masked-${p.id}" style="display:none">
        <span class="apikey-masked-key" id="apikey-masked-text-${p.id}"></span>
        <button type="button" class="apikey-validate-btn" id="apikey-validate-${p.id}" data-provider="${p.id}">Valider</button>
    </div>`;
    return `
        <div class="provider-section${isFirst ? ' active' : ''}" data-provider="${p.id}">
            <div class="apikey-label-row">
                <label class="sp-modal-label" for="apikey-${p.id}">Clé API ${escHtml(p.label)}${labelExtra}</label>
                ${linkHtml}
            </div>
            ${maskedKeyHtml}
            <div class="apikey-field">
                <div class="apikey-input-wrap">
                    <input type="${inputType}" id="apikey-${p.id}" class="sp-modal-input apikey-input" placeholder="${escHtml(p.placeholder || '')}">
                    ${eyeBtn}
                </div>
                ${refreshBtn}
            </div>
            ${localStatusHtml}
            <div class="catalog-list provider-catalog-list" id="catalog-list-${p.id}" data-provider="${p.id}"></div>
        </div>
    `;
}

function _typeToggleHtml(activeType) {
    return `
        <div class="catalog-type-btns">
            <button type="button" class="catalog-type-btn${activeType === 'text' ? ' active' : ''}" data-type="text">Textes</button>
            <button type="button" class="catalog-type-btn${activeType === 'image' ? ' active' : ''}" data-type="image">Images</button>
        </div>
    `;
}

function _initApiModelesPanel() {
    const tabsContainer = document.getElementById('providers-tabs');
    const contentContainer = document.getElementById('provider-content');
    if (!tabsContainer || !contentContainer) return;
    tabsContainer.innerHTML = _buildProviderTabsHtml();
    contentContainer.innerHTML = PROVIDERS_CONFIG.map((p, idx) => _buildProviderSectionHtml(p, idx === 0)).join('');

    // Sous-onglet fournisseur — clic
    tabsContainer.querySelectorAll('.provider-tab').forEach(btn => {
        btn.addEventListener('click', () => _selectProvider(btn.dataset.provider));
    });

    // Boutons "Valider" — sauvegarde la clé et affiche les modèles
    PROVIDERS_CONFIG.forEach(p => {
        if (p.isLocal) return;
        const btn = document.getElementById('apikey-validate-' + p.id);
        if (btn) btn.addEventListener('click', () => {
            const input = document.getElementById('apikey-' + p.id);
            if (!input) return;
            const key = input.value.trim();
            if (!key) return;
            saveApiKeys({ [p.id]: key });
            _updateMaskedKeyDisplay(p.id);
            _setKeysDirty(false);
            renderProviderCatalog(p.id);
        });
    });

    // Listeners par section
    PROVIDERS_CONFIG.forEach(p => {
        const section = contentContainer.querySelector(`.provider-section[data-provider="${p.id}"]`);
        if (!section) return;
        const input = section.querySelector(`#apikey-${p.id}`);
        if (input) input.addEventListener('input', () => {
            _setKeysDirty(true);
            // Mettre à jour l'affichage masqué
            _updateMaskedKeyDisplay(p.id);
            // Re-render catalog (les modèles deviennent visibles dès qu'une clé est saisie)
            renderProviderCatalog(p.id);
        });
        const eye = section.querySelector('.apikey-eye-btn');
        if (eye) eye.addEventListener('click', () => {
            const target = document.getElementById(eye.dataset.target);
            if (!target) return;
            const show = target.type === 'password';
            target.type = show ? 'text' : 'password';
            eye.classList.toggle('shown', show);
            eye.title = show ? 'Masquer la clé' : 'Afficher la clé';
            eye.setAttribute('aria-label', eye.title);
        });
        if (p.isLocal) {
            const refresh = section.querySelector(`#apikey-${p.id}-refresh`);
            if (refresh) refresh.addEventListener('click', () => _onLocalRefreshClick(p.id));
        }
    });
}

function _detectOS() {
    const ua = navigator.userAgent || '';
    const platform = navigator.platform || '';
    if (/Mac/i.test(platform) || /Mac OS X/i.test(ua)) return 'mac';
    if (/Win/i.test(platform) || /Windows/i.test(ua)) return 'windows';
    if (/Linux/i.test(platform) || /Linux/i.test(ua)) return 'linux';
    return 'other';
}

function _getCorsHelpHtml(providerId) {
    const os = _detectOS();
    const origin = location.origin;
    if (providerId === 'ollama') {
        const blocks = {
            mac: `
<strong>macOS — configuration permanente :</strong>
<ol>
  <li>Ouvrez le <em>Terminal</em>.</li>
  <li>Exécutez :<br><code>launchctl setenv OLLAMA_ORIGINS "*"</code></li>
  <li>Quittez Ollama (icône dans la barre de menu) puis relancez-le.</li>
</ol>
<p>Cette commande persiste après redémarrage tant que la session utilisateur reste configurée. Pour la rendre <em>vraiment</em> définitive, ajoutez la même ligne à un fichier <code>~/Library/LaunchAgents/com.ollama.origins.plist</code> chargé au login (ou ajoutez <code>export OLLAMA_ORIGINS="*"</code> à <code>~/.zshrc</code> si vous lancez Ollama en CLI).</p>`,
            windows: `
<strong>Windows — configuration permanente :</strong>
<ol>
  <li>Quittez Ollama via l'icône dans la barre des tâches.</li>
  <li>Ouvrez <em>Paramètres système avancés</em> → <em>Variables d'environnement</em>.</li>
  <li>Dans <em>Variables utilisateur</em>, cliquez sur <em>Nouvelle…</em></li>
  <li>Nom : <code>OLLAMA_ORIGINS</code> — Valeur : <code>*</code></li>
  <li>Validez, puis relancez Ollama.</li>
</ol>
<p>La variable est conservée après redémarrage du PC.</p>`,
            linux: `
<strong>Linux (systemd) — configuration permanente :</strong>
<ol>
  <li>Éditez l'override du service :<br><code>sudo systemctl edit ollama.service</code></li>
  <li>Ajoutez ces lignes :<br><code>[Service]<br>Environment="OLLAMA_ORIGINS=*"</code></li>
  <li>Rechargez et redémarrez :<br><code>sudo systemctl daemon-reload &amp;&amp; sudo systemctl restart ollama</code></li>
</ol>
<p>L'override survit aux redémarrages et aux mises à jour d'Ollama.</p>`,
            other: `
<strong>Configuration permanente :</strong>
<p>Définissez la variable d'environnement <code>OLLAMA_ORIGINS=*</code> dans la configuration de démarrage de votre système, puis relancez Ollama.</p>`
        };
        return `
<p>Pour autoriser cette page (<code>${escHtml(origin)}</code>) à interroger Ollama, vous devez activer CORS via la variable d'environnement <code>OLLAMA_ORIGINS</code>.</p>
${blocks[os] || blocks.other}
<p style="opacity:0.75">Pour limiter aux origines de confiance, remplacez <code>*</code> par <code>${escHtml(origin)}</code>.</p>`;
    }
    if (providerId === 'lmstudio') {
        return `
<p>Pour autoriser cette page (<code>${escHtml(origin)}</code>) à interroger LM Studio :</p>
<ol>
  <li>Ouvrez <strong>LM Studio</strong>.</li>
  <li>Dans la barre latérale gauche, cliquez sur l'onglet <strong>Developer</strong> (icône <code>&lt;/&gt;</code>, en bas).</li>
  <li>Si le serveur est en cours d'exécution, cliquez sur le bouton <strong>Status: Running</strong> en haut pour l'arrêter.</li>
  <li>À droite du bouton de démarrage, cliquez sur l'icône <strong>Settings</strong> (engrenage) pour ouvrir le panneau <em>Server Settings</em>.</li>
  <li>Dans ce panneau, activez les <u>deux</u> options suivantes :
    <ul>
      <li><strong>Serve on Local Network</strong> (« Servir sur le réseau local ») — sans cela, le serveur n'écoute que sur <code>127.0.0.1</code> et certaines requêtes du navigateur sont rejetées.</li>
      <li><strong>Enable CORS</strong> (« Activer CORS / Cross-Origin Resource Sharing »).</li>
    </ul>
  </li>
  <li>Refermez le panneau et cliquez sur <strong>Start Server</strong> (le bouton redevient vert et indique <em>Status: Running</em>).</li>
</ol>
<p>LM Studio mémorise ces deux réglages : vous n'aurez pas à les refaire au prochain lancement.</p>`;
    }
    return '';
}

const _localCorsBlocked = new Set();

// Délégation : clic sur une miniature d'aide locale → ouvre le lightbox.
document.addEventListener('click', (e) => {
    const img = e.target.closest('img.apikey-local-help-img');
    if (img && typeof openLightbox === 'function') {
        openLightbox(img.dataset.lightboxSrc || img.src);
    }
});

function _serviceName(providerId) {
    return providerId === 'ollama' ? 'Ollama' : 'LM Studio';
}

function _clearLocalProviderModels(providerId) {
    MODELS = MODELS.filter(m => m.editeur !== providerId);
    for (const key of Object.keys(TARIFS)) {
        if (TARIFS[key].editeur === providerId) delete TARIFS[key];
    }
    const catalog = document.getElementById('catalog-list-' + providerId);
    if (catalog) catalog.innerHTML = '';
    if (typeof populateModelSelect === 'function') populateModelSelect();
}

// Affiche l'état du serveur local. `kind` : 'success' | 'error' | 'cors'.
// Pour 'cors', `successPrefix` (optionnel) est affiché en vert au-dessus.
function _renderLocalStatus(providerId, kind, message, successPrefix) {
    const status = document.getElementById(`apikey-${providerId}-status`);
    if (!status) return;
    if (kind === 'cors') {
        _localCorsBlocked.add(providerId);
        _clearLocalProviderModels(providerId);
        status.className = 'apikey-local-status warning';
        const prefixHtml = successPrefix
            ? `<span class="apikey-local-status-msg apikey-local-status-success-line">${escHtml(successPrefix)}</span>`
            : '';
        const screenshotHtml = providerId === 'lmstudio'
            ? `<p class="apikey-local-help-img-caption">Voir la marche à suivre en image :</p>
               <img src="images/LM Studio.webp" alt="Capture LM Studio — Server Settings" class="apikey-local-help-img apikey-local-help-img-small" data-lightbox-src="images/LM Studio.webp">`
            : '';
        status.innerHTML = `${prefixHtml}<span class="apikey-local-status-msg">${escHtml(message)}</span>
            <div class="apikey-local-help apikey-local-help-flat">
                <div class="apikey-local-help-body">${_getCorsHelpHtml(providerId)}${screenshotHtml}</div>
            </div>`;
    } else if (kind === 'error') {
        _localCorsBlocked.delete(providerId);
        _clearLocalProviderModels(providerId);
        status.className = 'apikey-local-status error';
        status.innerHTML = `<span class="apikey-local-status-msg">${message}</span>`;
    } else {
        _localCorsBlocked.delete(providerId);
        status.className = 'apikey-local-status success';
        status.textContent = message;
    }
}

async function _isServerReachable(baseUrl) {
    try {
        await fetch(`${baseUrl}/v1/models`, { mode: 'no-cors', signal: AbortSignal.timeout(3000) });
        return true;
    } catch {
        return false;
    }
}

async function _isCorsAllowedForChat(baseUrl) {
    try {
        await fetch(`${baseUrl}/v1/chat/completions`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: '{}',
            signal: AbortSignal.timeout(4000)
        });
        return true;
    } catch (e) {
        return e?.name === 'AbortError' || e?.name === 'TimeoutError';
    }
}

async function _onLocalRefreshClick(providerId) {
    const status = document.getElementById(`apikey-${providerId}-status`);
    const url = document.getElementById(`apikey-${providerId}`).value.trim();
    const service = _serviceName(providerId);
    const corsMsg = '⚠ CORS désactivé : les requêtes de chat seront bloquées par le navigateur.';

    if (!url) {
        _renderLocalStatus(providerId, 'error', '✗ Entrez une URL.');
        return;
    }
    let baseUrl, hostname;
    try {
        const u = new URL(url);
        baseUrl = (u.origin + u.pathname).replace(/\/+$/, '');
        hostname = u.hostname;
    } catch {
        _renderLocalStatus(providerId, 'error', '✗ URL invalide.');
        return;
    }
    const isLocalhost = hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1';
    const networkHint = providerId === 'ollama'
        ? `Pour autoriser un accès depuis cette adresse réseau, lancez Ollama avec la variable d'environnement <code>OLLAMA_HOST=0.0.0.0</code>, puis relancez-le.`
        : `Dans LM Studio, allez dans <strong>Developer</strong> &rsaquo; <strong>Local Server</strong>, cliquez sur <strong>Server Settings</strong> et activez <strong>Serve on Local Network</strong>, puis relancez le serveur.`;
    const screenshot = providerId === 'lmstudio'
        ? `<br><br><p class="apikey-local-help-img-caption">Voir la marche à suivre en image :</p>
           <img src="images/LM Studio.webp" alt="Capture LM Studio — Server Settings" class="apikey-local-help-img apikey-local-help-img-small" data-lightbox-src="images/LM Studio.webp">`
        : '';
    const unreachableMsg = isLocalhost
        ? `✗ Impossible de joindre ${service} à cette adresse. Assurez-vous que l'application ${service} est ouverte et que son serveur local est démarré.`
        : `✗ Impossible de joindre ${service} à l'adresse <code>${escHtml(hostname)}</code>. Vérifiez que ${service} est lancé sur cette machine, que le port est correct, et que le serveur est configuré pour écouter sur le réseau local.<br><br>${networkHint}${screenshot}`;
    API_KEYS[providerId] = url;
    status.textContent = 'Récupération…';
    status.className = 'apikey-local-status';

    // Étape 1 : essayer de lister les modèles. Échec possible = serveur down ou CORS.
    let response;
    try {
        response = await fetch(`${baseUrl}/v1/models`, { signal: AbortSignal.timeout(4000) });
    } catch (e) {
        if (e?.name === 'AbortError' || e?.name === 'TimeoutError') {
            _renderLocalStatus(providerId, 'error', '✗ Délai d\'attente dépassé. Le serveur ne répond pas.');
        } else if (await _isServerReachable(baseUrl)) {
            _renderLocalStatus(providerId, 'cors', corsMsg);
        } else {
            _renderLocalStatus(providerId, 'error', unreachableMsg);
        }
        return;
    }
    if (!response.ok) {
        _renderLocalStatus(providerId, 'error', `✗ Réponse inattendue du serveur (HTTP ${response.status}).`);
        return;
    }
    let data;
    try { data = await response.json(); }
    catch {
        _renderLocalStatus(providerId, 'error', '✗ Réponse non valide. L\'URL ne pointe pas vers un serveur compatible.');
        return;
    }
    if (!Array.isArray(data?.data || data?.models)) {
        _renderLocalStatus(providerId, 'error', '✗ Format de réponse inattendu. L\'URL ne pointe pas vers un serveur compatible.');
        return;
    }

    await fetchLocalModels(providerId);
    const count = MODELS.filter(m => m.editeur === providerId).length;
    const countMsg = count > 0
        ? `✓ ${count} modèle${count > 1 ? 's' : ''} chargé${count > 1 ? 's' : ''}`
        : '✓ Connecté — aucun modèle chargé';

    // Étape 2 : le listing fonctionne (requête simple, pas de préflight). Tester
    // qu'un POST avec préflight passe aussi, sinon les chats seront bloqués.
    if (!await _isCorsAllowedForChat(baseUrl)) {
        _renderLocalStatus(providerId, 'cors', corsMsg, countMsg);
        renderProviderCatalog(providerId);
        return;
    }

    populateModelSelect();
    _renderLocalStatus(providerId, 'success', countMsg);
    renderProviderCatalog(providerId);
}

function _selectProvider(providerId) {
    _activeProvider = providerId;
    document.querySelectorAll('#providers-tabs .provider-tab').forEach(b => {
        b.classList.toggle('active', b.dataset.provider === providerId);
    });
    document.querySelectorAll('#provider-content .provider-section').forEach(s => {
        s.classList.toggle('active', s.dataset.provider === providerId);
    });
    renderProviderCatalog(providerId);
}

function renderProviderCatalog(providerId) {
    if (!_catalogPending) _initCatalogPending();
    const provider = PROVIDERS_CONFIG.find(p => p.id === providerId);
    if (!provider) return;
    const container = document.getElementById('catalog-list-' + providerId);
    if (!container) return;
    container.innerHTML = '';

    if (provider.isLocal) {
        if (!hasProviderKey(providerId)) {
            container.innerHTML = '<div class="provider-models-empty">Renseignez l\'URL de votre serveur local et cliquez sur « Mettre à jour ».</div>';
            return;
        }
        const localModels = MODELS.filter(m => m.editeur === providerId);
        if (localModels.length === 0) {
            if (!_localCorsBlocked.has(providerId)) {
                container.innerHTML = '<div class="provider-models-empty">Aucun modèle détecté. Vérifiez que votre serveur est lancé et qu\'au moins un modèle est téléchargé.</div>';
            }
            return;
        }
        const disabled = _catalogPending.disabled;
        const enabledCount = localModels.filter(m => !disabled.has(m.id)).length;
        const allChecked = enabledCount === localModels.length;
        const someChecked = enabledCount > 0 && !allChecked;
        const section = document.createElement('div');
        section.className = 'catalog-section';
        section.innerHTML = `
            <div class="catalog-section-header">
                <input type="checkbox" class="catalog-section-master-cb"${allChecked ? ' checked' : ''}>
                <span class="catalog-section-name">Sélectionnez les modèles à utiliser</span>
            </div>
            <div class="catalog-section-models">
                ${localModels.map(m => _catalogRowHtml(m, false, false, !disabled.has(m.id))).join('')}
            </div>`;
        const masterCb = section.querySelector('.catalog-section-master-cb');
        masterCb.indeterminate = someChecked;
        masterCb.addEventListener('change', () => {
            const allEnabled = localModels.every(m => !disabled.has(m.id));
            if (allEnabled) localModels.forEach(m => disabled.add(m.id));
            else localModels.forEach(m => disabled.delete(m.id));
            renderProviderCatalog(providerId);
            _refreshCatalogDirty();
        });
        section.querySelectorAll('.catalog-cb').forEach(cb => {
            cb.addEventListener('change', () => {
                const id = cb.dataset.id;
                if (cb.checked) disabled.delete(id);
                else disabled.add(id);
                _updateSectionBadge(section, localModels.length, localModels, disabled);
                _refreshCatalogDirty();
            });
        });
        container.appendChild(section);
        return;
    }

    if (!hasProviderKey(providerId)) {
        container.innerHTML = '<div class="provider-models-empty">Ajoutez et renseignez votre clé API ci-dessus pour afficher les modèles disponibles.</div>';
        return;
    }

    const isImage = (_providerCatalogType[providerId] || 'text') === 'image';

    if (provider.isOpenRouter) {
        _renderOpenRouterCatalogInto(container, isImage);
        return;
    }

    // En mode texte, on inclut aussi les modèles "search" (ex. Perplexity Sonar)
    // qui sont catégorisés à part dans MODELS_DATA mais restent des modèles texte
    // à activer/désactiver depuis le catalogue.
    const baseModels = isImage
        ? MODELS_DATA.image.filter(m => m.editeur === providerId)
        : [
            ...MODELS_DATA.text.filter(m => m.editeur === providerId),
            ...((MODELS_DATA.search || []).filter(m => m.editeur === providerId))
          ];
    if (baseModels.length === 0) {
        container.innerHTML = `<div class="provider-models-empty">Aucun modèle ${isImage ? 'image' : 'texte'} disponible pour ce fournisseur.</div>`;
        return;
    }
    const disabled = _catalogPending.disabled;
    const enabledCount = baseModels.filter(m => !disabled.has(m.id)).length;
    const allChecked = enabledCount === baseModels.length;
    const someChecked = enabledCount > 0 && !allChecked;
    const typeToggle = provider.hasImage ? _typeToggleHtml(isImage ? 'image' : 'text') : '';
    const section = document.createElement('div');
    section.className = 'catalog-section';
    section.innerHTML = `
        <div class="catalog-section-header">
            <input type="checkbox" class="catalog-section-master-cb"${allChecked ? ' checked' : ''}>
            <span class="catalog-section-name">Sélectionnez les modèles à utiliser</span>
            ${typeToggle}
        </div>
        <div class="catalog-section-models">
            ${baseModels.map(m => _catalogRowHtml(m, isImage, false, !disabled.has(m.id))).join('')}
        </div>
    `;
    const masterCb = section.querySelector('.catalog-section-master-cb');
    masterCb.indeterminate = someChecked;
    masterCb.addEventListener('change', () => {
        const allEnabled = baseModels.every(m => !disabled.has(m.id));
        if (allEnabled) baseModels.forEach(m => disabled.add(m.id));
        else baseModels.forEach(m => disabled.delete(m.id));
        renderProviderCatalog(providerId);
        _refreshCatalogDirty();
    });
    section.querySelectorAll('.catalog-type-btn').forEach(b => {
        b.addEventListener('click', () => {
            if (b.classList.contains('active')) return;
            // Bascule .active immédiatement sur le DOM existant pour que la
            // pastille `::before` puisse glisser via sa transition CSS.
            // Le re-render (qui reconstruit la section) est différé après la
            // fin de la transition pour ne pas couper l'animation.
            section.querySelectorAll('.catalog-type-btn').forEach(o => o.classList.toggle('active', o === b));
            _providerCatalogType[providerId] = b.dataset.type;
            setTimeout(() => renderProviderCatalog(providerId), 260);
        });
    });
    section.querySelectorAll('.catalog-cb').forEach(cb => {
        cb.addEventListener('change', () => {
            const id = cb.dataset.id;
            if (cb.checked) disabled.delete(id);
            else disabled.add(id);
            _updateSectionBadge(section, baseModels.length, baseModels, disabled);
            _refreshCatalogDirty();
        });
    });
    container.appendChild(section);
}

function _renderOpenRouterCatalogInto(container, isImage) {
    if (!_catalogPending) _initCatalogPending();
    const orEnabled = _catalogPending.orEnabled;

    const builtInOrAll = (isImage ? MODELS_DATA.image : MODELS_DATA.text)
        .filter(m => m.editeur === 'openrouter')
        .map(m => ({ ...m, _isImage: isImage }));
    const builtInIds = new Set(builtInOrAll.map(m => m.id));

    const tabType = isImage ? 'image' : 'text';
    const categoryModels = _getOrModelsForCategory(_orCategory, tabType);
    let fetchedOrAll = [];
    if (categoryModels) {
        fetchedOrAll = categoryModels.filter(m => isImage === !!m._isImage && !builtInIds.has(m.id));
        // Hydrate les prix image depuis la cache dédiée AVANT rendu : évite
        // le flash "Gratuit" quand le cache /models a pricing=0 mais qu'on
        // a déjà enrichi /endpoints lors d'une session précédente.
        if (isImage) {
            const priceMap = (typeof getOrImagePrices === 'function') ? getOrImagePrices() : {};
            for (const m of fetchedOrAll) {
                if ((!m.imageOutput || m.imageOutput === 0) && priceMap[m.id] > 0) {
                    m.imageOutput = priceMap[m.id];
                }
            }
        }
    }

    const orAll = [...builtInOrAll, ...fetchedOrAll];
    const orEnabledCount = orAll.filter(m => orEnabled.has(m.id)).length;
    const orTotal = orAll.length;
    const hasLoadedCategory = !!categoryModels;

    // Si on est en image et que des modèles cachés n'ont pas encore de prix
    // (image_output absent du cache car /models ne le retourne pas), déclencher
    // l'enrichissement asynchrone via /endpoints — le rendu se rafraîchira ensuite.
    if (isImage && categoryModels) {
        const _missingPrice = fetchedOrAll.filter(m => !m.imageOutput || m.imageOutput === 0);
        const enrichKey = `${tabType}_${_orCategory}`;
        if (_missingPrice.length > 0 && !_enrichmentInFlight.has(enrichKey)) {
            _enrichmentInFlight.add(enrichKey);
            _enrichImagePricesFromEndpoints(_missingPrice, tabType, _orCategory)
                .catch(() => {})
                .finally(() => { _enrichmentInFlight.delete(enrichKey); });
        }
    }
    const loadBtnLabel = hasLoadedCategory ? 'Actualiser' : 'Charger les modèles';
    const search = _orSearchTerm.trim().toLowerCase();
    const orVisible = search
        ? orAll.filter(m => (m.label || '').toLowerCase().includes(search) || (m.id || '').toLowerCase().includes(search))
        : orAll;
    const categoryOptionsHtml = OR_CATEGORIES.map(cat => `
        <option value="${cat.id}"${cat.id === _orCategory ? ' selected' : ''}>${cat.label}</option>
    `).join('');
    const orSection = document.createElement('div');
    orSection.className = 'catalog-section catalog-or-section';
    orSection.id = 'catalog-or-section';
    const orAllChecked = orTotal > 0 && orEnabledCount === orTotal;
    const orSomeChecked = orEnabledCount > 0 && !orAllChecked;
    orSection.innerHTML = `
        <div class="catalog-section-header">
            <span class="catalog-section-name">Sélectionnez les modèles à utiliser</span>
            ${_typeToggleHtml(isImage ? 'image' : 'text')}
        </div>
        <div class="catalog-or-toolbar">
            <div class="catalog-or-cat-select-wrap">
                <select class="catalog-or-cat-select">${categoryOptionsHtml}</select>
                <svg class="catalog-or-cat-select-caret" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
            </div>
            <div class="catalog-or-search-wrap">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                <input type="text" class="catalog-or-search" placeholder="Rechercher un modèle…" value="${escHtml(_orSearchTerm)}">
            </div>
            <button type="button" class="catalog-or-load-btn" id="catalog-or-load" title="${loadBtnLabel}" aria-label="${loadBtnLabel}">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-.07-8.3"/></svg>
            </button>
        </div>
        <div class="catalog-section-models" id="catalog-or-models">
            ${(hasLoadedCategory || builtInOrAll.length > 0) ? (orVisible.length ? _buildOrModelsHtml(orVisible, orEnabled, isImage) : '<div class="catalog-or-empty">Aucun modèle ne correspond à votre recherche.</div>') : `<div class="catalog-or-empty">Cliquez sur « Charger les modèles » pour accéder au catalogue OpenRouter${_orCategory !== 'all' ? ` (catégorie ${OR_CATEGORIES.find(c => c.id === _orCategory)?.label || _orCategory})` : ''}.</div>`}
        </div>`;
    const orMasterCb = orSection.querySelector('.catalog-section-master-cb');
    if (orMasterCb) {
        orMasterCb.indeterminate = orSomeChecked;
        orMasterCb.addEventListener('change', () => {
            const allEnabled = orAll.every(m => orEnabled.has(m.id));
            if (allEnabled) orAll.forEach(m => orEnabled.delete(m.id));
            else orAll.forEach(m => orEnabled.add(m.id));
            renderProviderCatalog('openrouter');
            _refreshCatalogDirty();
        });
    }
    orSection.querySelector('#catalog-or-load').addEventListener('click', () => _loadOrModels(isImage, _orCategory));
    orSection.querySelectorAll('.catalog-type-btn').forEach(b => {
        b.addEventListener('click', () => {
            if (b.classList.contains('active')) return;
            orSection.querySelectorAll('.catalog-type-btn').forEach(o => o.classList.toggle('active', o === b));
            _providerCatalogType['openrouter'] = b.dataset.type;
            setTimeout(() => renderProviderCatalog('openrouter'), 260);
        });
    });
    const orCatSelect = orSection.querySelector('.catalog-or-cat-select');
    if (orCatSelect) {
        orCatSelect.addEventListener('change', () => {
            if (orCatSelect.value === _orCategory) return;
            _orCategory = orCatSelect.value;
            if (!_getOrModelsForCategory(_orCategory, tabType)) {
                _loadOrModels(isImage, _orCategory);
            } else {
                renderProviderCatalog('openrouter');
            }
        });
    }
    _attachOrCheckboxListeners(orSection, orAll);
    container.appendChild(orSection);
    const searchInput = orSection.querySelector('.catalog-or-search');
    if (searchInput) {
        searchInput.addEventListener('input', () => {
            _orSearchTerm = searchInput.value;
            const modelsEl = orSection.querySelector('#catalog-or-models');
            if (!modelsEl) return;
            const s = _orSearchTerm.trim().toLowerCase();
            const filtered = s
                ? orAll.filter(m => (m.label || '').toLowerCase().includes(s) || (m.id || '').toLowerCase().includes(s))
                : orAll;
            if (hasLoadedCategory || builtInOrAll.length > 0) {
                modelsEl.innerHTML = filtered.length
                    ? _buildOrModelsHtml(filtered, orEnabled, isImage)
                    : '<div class="catalog-or-empty">Aucun modèle ne correspond à votre recherche.</div>';
                _attachOrCheckboxListeners(orSection, orAll);
            }
        });
        if (_orSearchTerm) {
            searchInput.focus();
            const v = searchInput.value;
            searchInput.setSelectionRange(v.length, v.length);
        }
    }
}

// Initialisation immédiate (les écouteurs des champs apikey-* sont attachés ici)
if (typeof window.escHtml === 'function') {
    _initApiModelesPanel();
} else {
    window.addEventListener('cetas:app-ready', _initApiModelesPanel, { once: true });
}

// Onglets de la modale
document.querySelectorAll('.apikeys-tab').forEach(tab => {
    tab.addEventListener('click', async () => {
        const currentActiveTab = document.querySelector('.apikeys-tab.active');
        if (currentActiveTab && currentActiveTab.dataset.tab === 'apimodeles' && tab.dataset.tab !== 'apimodeles' && (_keysDirty || _catalogDirty)) {
            const ok = await customConfirm('Vous avez des modifications non sauvegardées dans l\'onglet API et Modèles.', {
                icon: 'save',
                okLabel: 'Quitter sans sauvegarder',
                cancelLabel: 'Rester',
                danger: true
            });
            if (!ok) return;
            _restoreApiKeyInputs();
            _setKeysDirty(false);
            _initCatalogPending();
            _setCatalogDirty(false);
            renderProviderCatalog(_activeProvider);
        }
        if (currentActiveTab && currentActiveTab.dataset.tab === 'models' && tab.dataset.tab !== 'models' && _modelsDirty) {
            const ok = await customConfirm('Vous avez des modifications non sauvegardées dans l\'onglet Fonctionnalités.', {
                icon: 'save',
                okLabel: 'Quitter sans sauvegarder',
                cancelLabel: 'Rester',
                danger: true
            });
            if (!ok) return;
            _modelsDirty = false;
            populateModelSelects();
        }
        if (currentActiveTab && currentActiveTab.dataset.tab === 'budget' && tab.dataset.tab !== 'budget' && _budgetDirty) {
            const ok = await customConfirm('Vous avez des modifications non sauvegardées dans l\'onglet Budget.', {
                icon: 'save',
                okLabel: 'Quitter sans sauvegarder',
                cancelLabel: 'Rester',
                danger: true
            });
            if (!ok) return;
            const budgetCancelBtn = document.getElementById('budget-cancel-btn');
            if (budgetCancelBtn) budgetCancelBtn.click();
        }
        document.querySelectorAll('.apikeys-tab').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.apikeys-panel').forEach(p => p.classList.remove('active'));
        tab.classList.add('active');
        const targetPanel = document.getElementById('panel-' + tab.dataset.tab);
        targetPanel.classList.add('active');
        // Réinitialise immédiatement la vue du panneau Stockage pour éviter de
        // ré-afficher brièvement l'ancienne vue liste avant le chargement différé.
        if (tab.dataset.tab === 'stockage') {
            targetPanel.dataset.storageView = 'home';
            targetPanel.dataset.storageLoading = 'false';
        }
        // Charge le contenu en différé pour ne pas bloquer la transition visuelle de l'onglet.
        const tabName = tab.dataset.tab;
        setTimeout(async () => {
            if (tabName === 'apimodeles') {
                _setKeysDirty(false);
                _initCatalogPending();
                _setCatalogDirty(false);
                renderProviderCatalog(_activeProvider);
            }
            if (tabName === 'models') {
                populateModelSelects();
                _setModelsDirty(false);
            }
            if (tabName === 'statistiques') {
                dashboardData = await listAllConvStats();
                const activeTab = document.querySelector('.dashboard-tab.active');
                renderDashboardTab(activeTab ? activeTab.dataset.tab : 'periodes');
            }
            if (tabName === 'faq') {
                loadFaq();
            }
            if (tabName === 'stockage') {
                await _initStoragePanel();
            }
        }, 60);
    });
});

// ===================== Panel Stockage =====================

const _STORAGE_VIEWMODE_KEY = 'cetas-storage-media-viewmode';
const _storage = {
    subtab: 'conversations',
    conversations: [],
    medias: [],
    selected: new Set(),
    search: '',
    sort: 'date',
    mediaType: 'all',
    visibleCount: 100,
    pageSize: 100,
    searchDebounce: null,
    totalSize: 0,
    mediaSize: 0,
    mediaViewMode: (function () {
        try {
            const v = localStorage.getItem(_STORAGE_VIEWMODE_KEY);
            return (v === 'list' || v === 'grid') ? v : 'grid';
        } catch (e) { return 'grid'; }
    })(),
    autoLoadObserver: null,
    // Drapeau d'invalidation : `_loadStorageData` n'a besoin de rescanner toute
    // la BD que si une conv a été mutée hors des mutations locales du panneau
    // (saveConversation, regen, titre, etc.). À l'init, on doit charger une fois.
    _dirty: true
};

// Le filemanager appelle ce hook après chaque write/update : on invalide
// le cache du panneau pour qu'il se recharge à la prochaine ouverture.
if (typeof setOnConvMutated === 'function') {
    setOnConvMutated(() => { _storage._dirty = true; });
}

// Icônes SVG (24x24 viewBox, stroke currentColor) — style Feather.
const _STORAGE_ICONS = {
    chat: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>',
    image: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>',
    file: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>',
    pdf: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><text x="7" y="18" font-size="6" font-weight="bold" stroke="none" fill="currentColor">PDF</text></svg>',
    csv: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="8" y1="13" x2="16" y2="13"/><line x1="8" y1="17" x2="16" y2="17"/></svg>',
    code: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><polyline points="9 18 7 16 9 14"/><polyline points="15 14 17 16 15 18"/></svg>',
    search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>',
    trash: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2"/></svg>',
    calendar: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>',
    paperclip: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>',
    msg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3h18v14H7l-4 4z"/></svg>',
    eye: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>',
    download: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>'
};

const _STORAGE_FILE_ICON_MAP = {
    'application/pdf': 'pdf',
    'text/csv': 'csv',
    'application/json': 'code',
    'text/html': 'code',
    'application/javascript': 'code',
    'text/javascript': 'code'
};
function _storageFileIconName(part) {
    if (part.type === 'image') return 'image';
    return _STORAGE_FILE_ICON_MAP[part.mimeType] || 'file';
}

const _STORAGE_CATEGORIES = [
    { key: 'texts',  label: 'Textes' },
    { key: 'images', label: 'Images' },
    { key: 'pdf',    label: 'PDF' },
    { key: 'audio',  label: 'Audio' },
    { key: 'video',  label: 'Vidéo' },
    { key: 'other',  label: 'Autre' }
];
const _STORAGE_MAX_VISIBLE_CATS = 4;

function _categorizeFilePart(part) {
    if (!part) return 'other';
    if (part.type === 'image') return 'images';
    const mt = (part.mimeType || '').toLowerCase();
    if (mt === 'application/pdf') return 'pdf';
    if (mt.startsWith('audio/')) return 'audio';
    if (mt.startsWith('video/')) return 'video';
    if (mt.startsWith('text/')) return 'texts';
    if (mt === 'application/json' || mt === 'application/javascript' ||
        mt === 'application/xml' || mt === 'application/x-yaml' ||
        mt.includes('xml') || mt.includes('script')) return 'texts';
    if (part.textContent && part.textContent.length > 0) return 'texts';
    return 'other';
}

// Estimation rapide de la taille d'une part sans JSON.stringify (qui clone une grosse base64).
function _partApproxSize(part) {
    if (typeof part === 'string') return part.length;
    let s = 50; // marge structure JSON
    if (part.data) s += part.data.length;
    if (part.dataUrl) s += part.dataUrl.length;
    if (part.textContent) s += part.textContent.length;
    if (part.text) s += part.text.length;
    if (part.name) s += part.name.length;
    if (part.mimeType) s += part.mimeType.length;
    return s;
}
function _conversationApproxSize(data) {
    let s = 200;
    if (data.titre) s += data.titre.length;
    if (Array.isArray(data.messages)) {
        for (const msg of data.messages) {
            s += 30;
            if (typeof msg.content === 'string') s += msg.content.length;
            else if (Array.isArray(msg.content)) for (const p of msg.content) s += _partApproxSize(p);
        }
    }
    return s;
}

function _formatBytes(bytes) {
    if (bytes < 1024) return bytes + ' o';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' Ko';
    if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' Mo';
    return (bytes / (1024 * 1024 * 1024)).toFixed(2) + ' Go';
}

function _formatStorageDate(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    return d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });
}

function _extractFullText(messages) {
    let txt = '';
    if (!Array.isArray(messages)) return txt;
    for (const msg of messages) {
        if (typeof msg.content === 'string') txt += msg.content + ' ';
        else if (Array.isArray(msg.content)) {
            for (const p of msg.content) {
                if (p.type === 'text') txt += p.text + ' ';
                else if (p.type === 'file' && p.textContent) txt += p.textContent + ' ';
                else if (p.name) txt += p.name + ' ';
            }
        }
    }
    return txt.toLowerCase();
}

async function _loadStorageData() {
    const db = await openConvDB();
    const tx = db.transaction('conversations', 'readonly');
    const store = tx.objectStore('conversations');
    const [keys, allValues] = await Promise.all([
        new Promise(r => { const q = store.getAllKeys(); q.onsuccess = () => r(q.result); q.onerror = () => r([]); }),
        new Promise(r => { const q = store.getAll(); q.onsuccess = () => r(q.result); q.onerror = () => r([]); })
    ]);
    const conversations = [];
    const medias = [];
    let totalSize = 0;
    let mediaSize = 0;
    const categorySizes = { texts: 0, images: 0, pdf: 0, audio: 0, video: 0, other: 0 };
    for (let i = 0; i < keys.length; i++) {
        const raw = allValues[i];
        if (!raw) continue;
        let data;
        try { data = typeof raw === 'string' ? JSON.parse(raw) : raw; } catch { continue; }
        if (data.deleted) continue;
        const filename = keys[i];
        const date = data.lastActivity || data.date || '';
        const firstMsg = data.messages?.[0]?.content;
        const titre = data.titre || (typeof firstMsg === 'string' ? firstMsg.slice(0, 80) : 'Sans titre');
        const msgCount = Array.isArray(data.messages) ? data.messages.length : 0;
        let convMediaSize = 0;
        let mediaCount = 0;
        if (Array.isArray(data.messages)) {
            for (let m = 0; m < data.messages.length; m++) {
                const content = data.messages[m].content;
                if (!Array.isArray(content)) continue;
                for (let p = 0; p < content.length; p++) {
                    const part = content[p];
                    if (part?.type !== 'image' && part?.type !== 'file') continue;
                    mediaCount++;
                    const partSize = _partApproxSize(part);
                    convMediaSize += partSize;
                    categorySizes[_categorizeFilePart(part)] += partSize;
                    const name = part.name || (part.type === 'image' ? 'Image' : (part.mimeType || 'Fichier'));
                    // Stocker une référence pour matérialiser la dataUrl à la demande (lazy)
                    medias.push({
                        id: `${filename}::${m}::${p}`,
                        convFilename: filename,
                        convTitle: titre,
                        msgIndex: m,
                        partIndex: p,
                        type: part.type,
                        name,
                        mimeType: part.mimeType || '',
                        size: partSize,
                        date,
                        iconName: _storageFileIconName(part),
                        _data: part.data,
                        _dataUrl: part.dataUrl
                    });
                }
            }
        }
        const size = _conversationApproxSize(data);
        totalSize += size;
        mediaSize += convMediaSize;
        categorySizes.texts += Math.max(0, size - convMediaSize);
        conversations.push({
            filename, titre, date, size, msgCount, mediaCount,
            mediaSize: convMediaSize,
            // Texte lower-case uniquement extrait à la première recherche (lazy)
            _data: data,
            _searchText: null
        });
    }
    _storage.conversations = conversations;
    _storage.medias = medias;
    _storage.totalSize = totalSize;
    _storage.mediaSize = mediaSize;
    _storage.categorySizes = categorySizes;
    _storage._dirty = false;
}

function _ensureSearchText(conv) {
    if (conv._searchText !== null) return conv._searchText;
    conv._searchText = ((conv.titre || '') + ' ' + _extractFullText(conv._data?.messages)).toLowerCase();
    return conv._searchText;
}

function _applyStorageControlsLayout() {
    const controls = document.getElementById('storage-controls');
    if (!controls) return;
    if (_storage.subtab === 'medias') {
        controls.classList.remove('controls-conv');
        controls.classList.add('controls-media');
        if (!controls.classList.contains('search-active') && !controls.classList.contains('sort-active')) {
            controls.classList.add('search-active');
        }
    } else {
        controls.classList.remove('controls-media');
        controls.classList.add('controls-conv');
    }
}

function _renderStorageOverview() {
    const total = _storage.totalSize;
    const mediaSize = _storage.mediaSize;
    const fmtTotal = _formatBytes(total);
    const fmtMedia = _formatBytes(mediaSize);

    document.getElementById('storage-total-size').textContent = fmtTotal;

    document.getElementById('storage-count-conv').textContent = _storage.conversations.length;
    document.getElementById('storage-count-media').textContent = _storage.medias.length;

    const sizeConv = document.getElementById('storage-size-conv');
    const sizeMedia = document.getElementById('storage-size-media');
    if (sizeConv) sizeConv.textContent = fmtTotal;
    if (sizeMedia) sizeMedia.textContent = fmtMedia;

    const sizes = _storage.categorySizes || { texts: 0, images: 0, pdf: 0, audio: 0, video: 0, other: 0 };
    let entries = _STORAGE_CATEGORIES
        .map(cat => ({ key: cat.key, label: cat.label, size: sizes[cat.key] || 0 }))
        .filter(e => e.size > 0)
        .sort((a, b) => b.size - a.size);

    if (entries.length > _STORAGE_MAX_VISIBLE_CATS) {
        const visible = entries.slice(0, _STORAGE_MAX_VISIBLE_CATS - 1);
        const overflow = entries.slice(_STORAGE_MAX_VISIBLE_CATS - 1);
        const otherSize = overflow.reduce((s, e) => s + e.size, 0);
        const merged = visible.concat([{ key: 'other', label: 'Autre', size: otherSize }]);
        // Re-tri pour placer "Autre" selon sa taille
        entries = merged.sort((a, b) => b.size - a.size);
    }

    const bar = document.getElementById('storage-overview-bar');
    const legend = document.getElementById('storage-overview-legend');
    if (bar) {
        bar.innerHTML = entries.map(e => {
            const pct = total > 0 ? (e.size / total) * 100 : 0;
            return `<div class="storage-overview-seg storage-overview-seg-${e.key}" style="width:${pct}%"></div>`;
        }).join('');
    }
    if (legend) {
        legend.innerHTML = entries.map(e => `
            <span class="storage-legend-item">
                <span class="storage-legend-dot storage-legend-dot-${e.key}"></span>
                <span class="storage-legend-text">${e.label}</span>
                <span class="storage-legend-size">${_formatBytes(e.size)}</span>
            </span>
        `).join('');
    }
}

function _setStorageView(view) {
    const panel = document.getElementById('panel-stockage');
    if (!panel) return;
    panel.dataset.storageView = view;
    if (view === 'home') {
        _storage.selected.clear();
    }
}

async function _enterStorageListView(subtab) {
    const panel = document.getElementById('panel-stockage');
    if (!panel) return;
    panel.dataset.storageLoading = 'true';
    _storage.subtab = subtab;
    _storage.selected.clear();
    _storage.search = '';
    _storage.mediaType = 'all';
    _storage.visibleCount = _storage.pageSize;
    const searchInput = document.getElementById('storage-search');
    if (searchInput) searchInput.value = '';
    document.querySelectorAll('.storage-filter-chip').forEach(c => {
        c.classList.toggle('active', c.dataset.mediatype === 'all');
    });
    const subEl = document.getElementById('storage-heading-sub');
    if (subEl) subEl.textContent = subtab === 'medias' ? 'Médias' : 'Conversations';
    _applyStorageControlsLayout();
    await new Promise(r => setTimeout(r, 350));
    _renderStorageList();
    _setStorageView('list');
    panel.dataset.storageLoading = 'false';
}

function _filterAndSortStorageItems() {
    const isConv = _storage.subtab === 'conversations';
    const items = isConv ? _storage.conversations : _storage.medias;
    const search = _storage.search.trim().toLowerCase();
    const filtered = [];
    for (const item of items) {
        if (!isConv && _storage.mediaType !== 'all' && item.type !== _storage.mediaType) continue;
        if (search) {
            if (isConv) {
                if (!_ensureSearchText(item).includes(search)) continue;
            } else {
                const hay = ((item.name || '') + ' ' + (item.convTitle || '') + ' ' + (item.mimeType || '')).toLowerCase();
                if (!hay.includes(search)) continue;
            }
        }
        filtered.push(item);
    }
    const sort = _storage.sort;
    if (sort === 'size') filtered.sort((a, b) => b.size - a.size);
    else if (sort === 'size-asc') filtered.sort((a, b) => a.size - b.size);
    else if (sort === 'date-asc') filtered.sort((a, b) => (a.date || '').localeCompare(b.date || ''));
    else filtered.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    return filtered;
}

function _renderStorageList() {
    const list = document.getElementById('storage-list');
    const summary = document.getElementById('storage-summary');
    const masterCb = document.getElementById('storage-select-all');
    const actionBar = document.getElementById('storage-action-bar');
    const actionInfo = document.getElementById('storage-action-info');
    const mediaFilter = document.getElementById('storage-media-filter');
    if (!list) return;

    const isConv = _storage.subtab === 'conversations';
    mediaFilter.style.display = isConv ? 'none' : 'inline-flex';
    const viewToggle = document.getElementById('storage-viewmode-toggle');
    if (viewToggle) viewToggle.style.display = isConv ? 'none' : 'inline-flex';

    const filtered = _filterAndSortStorageItems();
    const visibleIds = new Set();
    for (const i of filtered) visibleIds.add(isConv ? i.filename : i.id);
    for (const id of [..._storage.selected]) if (!visibleIds.has(id)) _storage.selected.delete(id);

    let maxSize = 0;
    let totalSize = 0;
    let selectedSize = 0;
    for (const i of filtered) {
        if (i.size > maxSize) maxSize = i.size;
        totalSize += i.size;
        if (_storage.selected.has(isConv ? i.filename : i.id)) selectedSize += i.size;
    }
    if (maxSize === 0) maxSize = 1;

    const visibleSlice = filtered.slice(0, _storage.visibleCount);

    const galleryMode = !isConv && _storage.mediaViewMode === 'grid';
    list.classList.toggle('storage-list-gallery', galleryMode);

    if (filtered.length === 0) {
        const emptyIcon = isConv ? 'chat' : 'image';
        const emptyText = _storage.search || (!isConv && _storage.mediaType !== 'all')
            ? 'Aucun résultat pour ces critères.'
            : (isConv ? 'Aucune conversation enregistrée.' : 'Aucun média stocké.');
        list.innerHTML = `<div class="storage-empty"><span class="storage-empty-icon">${_STORAGE_ICONS[emptyIcon]}</span>${escHtml(emptyText)}</div>`;
    } else {
        const parts = new Array(visibleSlice.length);
        for (let i = 0; i < visibleSlice.length; i++) {
            const item = visibleSlice[i];
            const id = isConv ? item.filename : item.id;
            const checked = _storage.selected.has(id);
            const sizePct = (item.size / maxSize) * 100;
            if (isConv) {
                const dateStr = _formatStorageDate(item.date);
                let meta = '';
                if (dateStr) meta += `<span class="storage-row-meta-item">${escHtml(dateStr)}</span><span class="storage-row-meta-sep">·</span>`;
                meta += `<span class="storage-row-meta-item">${_STORAGE_ICONS.msg} ${item.msgCount}</span>`;
                if (item.mediaCount > 0) meta += `<span class="storage-row-meta-sep">·</span><span class="storage-row-meta-item">${_STORAGE_ICONS.paperclip} ${item.mediaCount}</span>`;
                parts[i] = `<div class="storage-row storage-row-conv${checked ? ' selected' : ''}" data-id="${escHtmlAttr(id)}" data-filename="${escHtmlAttr(item.filename)}">`
                    + `<input type="checkbox" class="storage-row-cb"${checked ? ' checked' : ''}>`
                    + `<div class="storage-row-main"><div class="storage-row-title">${escHtml(item.titre || 'Sans titre')}</div><div class="storage-row-meta">${meta}</div></div>`
                    + `<div class="storage-row-right"><span class="storage-row-size">${_formatBytes(item.size)}</span>`
                    + `<div class="storage-row-actions">`
                    +   `<button type="button" class="storage-row-action" data-storage-preview-conv="${escHtmlAttr(item.filename)}" title="Aperçu" aria-label="Aperçu">${_STORAGE_ICONS.eye}</button>`
                    +   `<button type="button" class="storage-row-action storage-row-action-danger" data-storage-delete-conv="${escHtmlAttr(item.filename)}" title="Supprimer" aria-label="Supprimer">${_STORAGE_ICONS.trash}</button>`
                    + `</div>`
                    + `<div class="storage-row-bar"><div class="storage-row-bar-fill" style="width:${sizePct}%"></div></div></div></div>`;
                continue;
            }
            const ext = item.mimeType ? item.mimeType.split('/').pop().split('+')[0].toUpperCase().slice(0, 5) : item.type.toUpperCase();
            if (galleryMode) {
                let visual;
                if (item.type === 'image') {
                    if (!item.dataUrl) item.dataUrl = item._dataUrl || (item._data ? `data:${item.mimeType || 'image/png'};base64,${item._data}` : '');
                    visual = item.dataUrl
                        ? `<img loading="lazy" decoding="async" src="${escHtmlAttr(item.dataUrl)}" class="storage-tile-img" alt="">`
                        : `<div class="storage-tile-icon">${_STORAGE_ICONS.image}</div>`;
                } else if (_isSvgMedia(item)) {
                    const url = _svgDataUrl(item);
                    visual = url
                        ? `<img loading="lazy" decoding="async" src="${escHtmlAttr(url)}" class="storage-tile-img storage-tile-img-svg" alt="">`
                        : `<div class="storage-tile-icon">${_STORAGE_ICONS[item.iconName] || _STORAGE_ICONS.file}</div>`;
                } else {
                    visual = `<div class="storage-tile-icon">${_STORAGE_ICONS[item.iconName] || _STORAGE_ICONS.file}</div>`;
                }
                const convFn = item.convFilename || '';
                const convBtn = convFn
                    ? `<button type="button" class="storage-tile-action" data-storage-open-conv="${escHtmlAttr(convFn)}" title="Ouvrir la conversation" aria-label="Ouvrir la conversation">${_STORAGE_ICONS.chat}</button>`
                    : '';
                parts[i] = `<div class="storage-tile${checked ? ' selected' : ''}" data-id="${escHtmlAttr(id)}" title="${escHtmlAttr(item.name)}">`
                    + visual
                    + `<span class="storage-tile-check" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg></span>`
                    + `<span class="storage-tile-badge">${escHtml(ext)}</span>`
                    + `<span class="storage-tile-size">${_formatBytes(item.size)}</span>`
                    + `<div class="storage-tile-overlay">`
                    +   convBtn
                    +   `<button type="button" class="storage-tile-action" data-storage-preview-media="${escHtmlAttr(id)}" title="Aperçu" aria-label="Aperçu">${_STORAGE_ICONS.eye}</button>`
                    +   `<button type="button" class="storage-tile-action" data-storage-download-media="${escHtmlAttr(id)}" title="Télécharger" aria-label="Télécharger">${_STORAGE_ICONS.download}</button>`
                    +   `<button type="button" class="storage-tile-action storage-tile-action-danger" data-storage-delete-media="${escHtmlAttr(id)}" title="Supprimer" aria-label="Supprimer">${_STORAGE_ICONS.trash}</button>`
                    + `</div>`
                    + `</div>`;
                continue;
            }
            // Médias : vue liste
            let thumb;
            if (item.type === 'image') {
                if (!item.dataUrl) item.dataUrl = item._dataUrl || (item._data ? `data:${item.mimeType || 'image/png'};base64,${item._data}` : '');
                thumb = item.dataUrl
                    ? `<img loading="lazy" decoding="async" src="${escHtmlAttr(item.dataUrl)}" class="storage-row-thumb" alt="" data-lightbox-storage="${escHtmlAttr(item.dataUrl)}">`
                    : `<div class="storage-row-icon">${_STORAGE_ICONS.image}</div>`;
            } else if (_isSvgMedia(item)) {
                const url = _svgDataUrl(item);
                thumb = url
                    ? `<img loading="lazy" decoding="async" src="${escHtmlAttr(url)}" class="storage-row-thumb storage-row-thumb-svg" alt="" data-lightbox-storage="${escHtmlAttr(url)}">`
                    : `<div class="storage-row-icon">${_STORAGE_ICONS[item.iconName] || _STORAGE_ICONS.file}</div>`;
            } else {
                thumb = `<div class="storage-row-icon storage-row-file-preview" data-storage-file-id="${escHtmlAttr(id)}" title="Aperçu du fichier" style="cursor:pointer">${_STORAGE_ICONS[item.iconName] || _STORAGE_ICONS.file}</div>`;
            }
            const convT = item.convTitle || 'Sans titre';
            const convShort = convT.length > 28 ? convT.slice(0, 28).trim() + '…' : convT;
            const convFn = item.convFilename || '';
            const convAction = convFn
                ? `<button type="button" class="storage-row-action" data-storage-open-conv="${escHtmlAttr(convFn)}" title="Ouvrir la conversation" aria-label="Ouvrir la conversation">${_STORAGE_ICONS.chat}</button>`
                : '';
            parts[i] = `<div class="storage-row${checked ? ' selected' : ''}" data-id="${escHtmlAttr(id)}">`
                + `<input type="checkbox" class="storage-row-cb"${checked ? ' checked' : ''}>`
                + thumb
                + `<div class="storage-row-main"><div class="storage-row-title"><span class="storage-row-badge">${escHtml(ext)}</span><span class="storage-row-title-text">${escHtml(item.name)}</span></div>`
                + `<div class="storage-row-meta"><span class="storage-row-meta-item">${escHtml(_formatStorageDate(item.date))}</span>`
                + `<span class="storage-row-meta-sep">·</span><span class="storage-row-meta-item" title="${escHtmlAttr(convT)}">${_STORAGE_ICONS.chat} ${escHtml(convShort)}</span></div></div>`
                + `<div class="storage-row-right"><span class="storage-row-size">${_formatBytes(item.size)}</span>`
                + `<div class="storage-row-actions">`
                +   convAction
                +   `<button type="button" class="storage-row-action" data-storage-preview-media="${escHtmlAttr(id)}" title="Aperçu" aria-label="Aperçu">${_STORAGE_ICONS.eye}</button>`
                +   `<button type="button" class="storage-row-action" data-storage-download-media="${escHtmlAttr(id)}" title="Télécharger" aria-label="Télécharger">${_STORAGE_ICONS.download}</button>`
                +   `<button type="button" class="storage-row-action storage-row-action-danger" data-storage-delete-media="${escHtmlAttr(id)}" title="Supprimer" aria-label="Supprimer">${_STORAGE_ICONS.trash}</button>`
                + `</div>`
                + `<div class="storage-row-bar"><div class="storage-row-bar-fill media" style="width:${sizePct}%"></div></div></div></div>`;
        }
        let html = parts.join('');
        if (filtered.length > visibleSlice.length) {
            const remaining = filtered.length - visibleSlice.length;
            html += `<button type="button" id="storage-load-more" class="storage-load-more">Afficher ${Math.min(remaining, _storage.pageSize)} de plus (${remaining} restant${remaining > 1 ? 's' : ''})</button>`;
        }
        list.innerHTML = html;
    }

    _attachStorageAutoLoad();
    summary.textContent = `${filtered.length} élément${filtered.length > 1 ? 's' : ''} • ${_formatBytes(totalSize)}`;
    masterCb.checked = filtered.length > 0 && filtered.every(i => _storage.selected.has(isConv ? i.filename : i.id));
    masterCb.indeterminate = !masterCb.checked && filtered.some(i => _storage.selected.has(isConv ? i.filename : i.id));

    const downloadBtn = document.getElementById('storage-download-btn');
    if (downloadBtn) downloadBtn.style.display = (!isConv && _storage.selected.size > 0) ? '' : 'none';

    if (_storage.selected.size > 0) {
        actionBar.classList.add('visible');
        actionInfo.textContent = `${_storage.selected.size} sélectionné${_storage.selected.size > 1 ? 's' : ''} • ${_formatBytes(selectedSize)}`;
    } else {
        actionBar.classList.remove('visible');
    }
}

function _updateStorageSelectionUI() {
    const isConv = _storage.subtab === 'conversations';
    const filtered = _filterAndSortStorageItems();
    const masterCb = document.getElementById('storage-select-all');
    const actionBar = document.getElementById('storage-action-bar');
    const actionInfo = document.getElementById('storage-action-info');
    let selectedSize = 0;
    let selectedInVisible = 0;
    for (const i of filtered) {
        if (_storage.selected.has(isConv ? i.filename : i.id)) {
            selectedInVisible++;
            selectedSize += i.size;
        }
    }
    if (masterCb) {
        masterCb.checked = filtered.length > 0 && selectedInVisible === filtered.length;
        masterCb.indeterminate = selectedInVisible > 0 && selectedInVisible < filtered.length;
    }
    const downloadBtn = document.getElementById('storage-download-btn');
    if (downloadBtn) downloadBtn.style.display = (!isConv && _storage.selected.size > 0) ? '' : 'none';
    if (_storage.selected.size > 0) {
        actionBar.classList.add('visible');
        actionInfo.textContent = `${_storage.selected.size} sélectionné${_storage.selected.size > 1 ? 's' : ''} • ${_formatBytes(selectedSize)}`;
    } else {
        actionBar.classList.remove('visible');
    }
}

function _isSvgMedia(item) {
    if (!item) return false;
    if ((item.mimeType || '').toLowerCase() === 'image/svg+xml') return true;
    return /\.svg$/i.test(item.name || '');
}

function _svgDataUrl(item) {
    if (item._dataUrl) return item._dataUrl;
    if (item._data) return `data:image/svg+xml;base64,${item._data}`;
    return '';
}

function _attachStorageAutoLoad() {
    if (_storage.autoLoadObserver) {
        _storage.autoLoadObserver.disconnect();
        _storage.autoLoadObserver = null;
    }
    const sentinel = document.getElementById('storage-load-more');
    if (!sentinel || typeof IntersectionObserver === 'undefined') return;
    const root = document.getElementById('storage-list');
    const obs = new IntersectionObserver((entries) => {
        for (const entry of entries) {
            if (entry.isIntersecting) {
                _storage.visibleCount += _storage.pageSize;
                _renderStorageList();
                break;
            }
        }
    }, { root, rootMargin: '200px' });
    obs.observe(sentinel);
    _storage.autoLoadObserver = obs;
}

function _setMediaViewMode(mode) {
    if (mode !== 'list' && mode !== 'grid') return;
    if (_storage.mediaViewMode === mode) return;
    _storage.mediaViewMode = mode;
    try { localStorage.setItem(_STORAGE_VIEWMODE_KEY, mode); } catch (e) {}
    document.querySelectorAll('.storage-viewmode-btn').forEach(b => {
        b.classList.toggle('active', b.dataset.viewmode === mode);
    });
    const panel = document.getElementById('panel-stockage');
    if (panel) panel.dataset.storageLoading = 'true';
    requestAnimationFrame(() => {
        requestAnimationFrame(() => {
            _renderStorageList();
            if (panel) panel.dataset.storageLoading = 'false';
        });
    });
}

function _toggleStorageRow(row) {
    if (!row) return;
    const id = row.dataset.id;
    const cb = row.querySelector('.storage-row-cb');
    if (_storage.selected.has(id)) {
        _storage.selected.delete(id);
        row.classList.remove('selected');
        if (cb) cb.checked = false;
    } else {
        _storage.selected.add(id);
        row.classList.add('selected');
        if (cb) cb.checked = true;
    }
    _updateStorageSelectionUI();
}

function _sanitizeFilename(name) {
    return (name || 'fichier').replace(/[\\/:*?"<>|]+/g, '_').replace(/\s+/g, ' ').trim().slice(0, 180) || 'fichier';
}

function _mediaToBlob(media) {
    if (!media || !media._data) return null;
    try {
        const bin = atob(media._data);
        const len = bin.length;
        const bytes = new Uint8Array(len);
        for (let i = 0; i < len; i++) bytes[i] = bin.charCodeAt(i);
        return new Blob([bytes], { type: media.mimeType || 'application/octet-stream' });
    } catch (e) {
        console.warn('Conversion média -> blob impossible', e);
        return null;
    }
}

function _triggerDownload(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
}

async function _downloadSelectedStorage() {
    if (_storage.subtab !== 'medias') return;
    const ids = [..._storage.selected];
    if (ids.length === 0) return;
    const items = ids
        .map(id => _storage.medias.find(m => m.id === id))
        .filter(Boolean);
    if (items.length === 0) return;

    if (items.length === 1) {
        const blob = _mediaToBlob(items[0]);
        if (!blob) {
            if (typeof customConfirm === 'function') {
                await customConfirm('Impossible de préparer ce fichier au téléchargement.', { icon: 'warning', okLabel: 'OK' });
            }
            return;
        }
        _triggerDownload(blob, _sanitizeFilename(items[0].name));
        return;
    }

    if (typeof JSZip === 'undefined') {
        if (typeof customConfirm === 'function') {
            await customConfirm('La bibliothèque ZIP n\'est pas disponible. Impossible de regrouper les fichiers.', { icon: 'warning', okLabel: 'OK' });
        }
        return;
    }

    const zip = new JSZip();
    const usedNames = new Map();
    for (const item of items) {
        const blob = _mediaToBlob(item);
        if (!blob) continue;
        let name = _sanitizeFilename(item.name);
        const count = usedNames.get(name) || 0;
        usedNames.set(name, count + 1);
        if (count > 0) {
            const dot = name.lastIndexOf('.');
            name = dot > 0
                ? `${name.slice(0, dot)} (${count})${name.slice(dot)}`
                : `${name} (${count})`;
        }
        zip.file(name, blob);
    }
    try {
        const zipBlob = await zip.generateAsync({ type: 'blob' });
        const stamp = new Date().toISOString().slice(0, 10);
        _triggerDownload(zipBlob, `cetas-medias-${stamp}.zip`);
    } catch (e) {
        console.warn('Erreur génération ZIP', e);
        if (typeof customConfirm === 'function') {
            await customConfirm('Une erreur est survenue lors de la création du ZIP.', { icon: 'warning', okLabel: 'OK' });
        }
    }
}

async function _deleteSingleStorageConv(filename) {
    if (!filename) return;
    const conv = (_storage.conversations || []).find(c => c.filename === filename);
    const label = conv && conv.titre ? `« ${conv.titre} »` : 'cette conversation';
    const ok = await customConfirm(`Supprimer définitivement ${label} ?`, {
        icon: 'delete', danger: true, okLabel: 'Supprimer'
    });
    if (!ok) return;
    await deleteConversationFile(filename);
    _storage.selected.delete(filename);
    if (conv) {
        // Mutation locale du cache : on évite un _loadStorageData() complet
        // (relecture + reparse de toute la BD = lent sur grosses bases).
        let removedMediaSize = 0;
        const removedByCat = { texts: 0, images: 0, pdf: 0, audio: 0, video: 0, other: 0 };
        const newMedias = [];
        for (const m of (_storage.medias || [])) {
            if (m.convFilename === filename) {
                removedMediaSize += m.size || 0;
                const cat = _categorizeFilePart({ type: m.type, mimeType: m.mimeType, name: m.name });
                if (removedByCat[cat] != null) removedByCat[cat] += m.size || 0;
            } else newMedias.push(m);
        }
        _storage.medias = newMedias;
        _storage.conversations = (_storage.conversations || []).filter(c => c.filename !== filename);
        _storage.totalSize = Math.max(0, (_storage.totalSize || 0) - (conv.size || 0));
        _storage.mediaSize = Math.max(0, (_storage.mediaSize || 0) - removedMediaSize);
        if (_storage.categorySizes) {
            _storage.categorySizes.texts = Math.max(0, (_storage.categorySizes.texts || 0) - Math.max(0, (conv.size || 0) - removedMediaSize));
            for (const k of Object.keys(removedByCat)) {
                if (k === 'texts') continue;
                _storage.categorySizes[k] = Math.max(0, (_storage.categorySizes[k] || 0) - removedByCat[k]);
            }
        }
        // Le write a flagué dirty mais la mutation locale a tout resynchronisé,
        // donc le cache reste valide jusqu'à la prochaine mutation externe.
        _storage._dirty = false;
    } else {
        await _loadStorageData();
    }
    _renderStorageOverview();
    _renderStorageList();
    if (typeof refreshConvList === 'function') refreshConvList();
}

async function _deleteSingleStorageMedia(mediaId) {
    const media = (_storage.medias || []).find(m => m.id === mediaId);
    if (!media) return;
    const ok = await customConfirm(`Supprimer définitivement « ${media.name || 'ce média'} » ?`, {
        icon: 'delete', danger: true, okLabel: 'Supprimer'
    });
    if (!ok) return;
    const data = await readConversationFile(media.convFilename);
    let writeOk = false;
    if (data && Array.isArray(data.messages)) {
        const msg = data.messages[media.msgIndex];
        if (msg && Array.isArray(msg.content)) {
            msg.content.splice(media.partIndex, 1);
            await writeConversationFile(media.convFilename, data);
            writeOk = true;
        }
    }
    _storage.selected.delete(mediaId);
    if (writeOk) {
        // Mutation locale du cache. Plus rapide qu'un _loadStorageData() qui
        // reparse toute la BD. Pas besoin non plus de refreshConvList :
        // la sidebar n'a pas changé, on a juste retiré une part interne.
        const removedSize = media.size || 0;
        _storage.medias = (_storage.medias || []).filter(m => m.id !== mediaId);
        // Décaler les partIndex des médias suivants dans le même message
        // (splice de l'array content).
        for (const m of _storage.medias) {
            if (m.convFilename === media.convFilename
                && m.msgIndex === media.msgIndex
                && m.partIndex > media.partIndex) {
                m.partIndex -= 1;
                m.id = `${m.convFilename}::${m.msgIndex}::${m.partIndex}`;
            }
        }
        const conv = (_storage.conversations || []).find(c => c.filename === media.convFilename);
        if (conv) {
            conv.size = Math.max(0, (conv.size || 0) - removedSize);
            conv.mediaCount = Math.max(0, (conv.mediaCount || 0) - 1);
            conv.mediaSize = Math.max(0, (conv.mediaSize || 0) - removedSize);
            conv._data = data;
            conv._searchText = null;
        }
        _storage.totalSize = Math.max(0, (_storage.totalSize || 0) - removedSize);
        _storage.mediaSize = Math.max(0, (_storage.mediaSize || 0) - removedSize);
        const cat = _categorizeFilePart({ type: media.type, mimeType: media.mimeType, name: media.name });
        if (_storage.categorySizes && _storage.categorySizes[cat] != null) {
            _storage.categorySizes[cat] = Math.max(0, _storage.categorySizes[cat] - removedSize);
        }
        // Idem _deleteSingleStorageConv : la mutation locale a tout resynchronisé.
        _storage._dirty = false;
    } else {
        await _loadStorageData();
    }
    _renderStorageOverview();
    _renderStorageList();
}

async function _deleteSelectedStorage() {
    const isConv = _storage.subtab === 'conversations';
    const count = _storage.selected.size;
    const label = isConv ? `${count} conversation${count > 1 ? 's' : ''}` : `${count} média${count > 1 ? 's' : ''}`;
    const ok = await customConfirm(`Supprimer définitivement ${label} ?`, {
        icon: 'delete', danger: true, okLabel: 'Supprimer'
    });
    if (!ok) return;

    if (isConv) {
        for (const filename of _storage.selected) {
            await deleteConversationFile(filename);
        }
    } else {
        // Regrouper par conversation, supprimer les parts en partant de la fin pour conserver les indices
        const byConv = {};
        for (const id of _storage.selected) {
            const media = _storage.medias.find(m => m.id === id);
            if (!media) continue;
            (byConv[media.convFilename] = byConv[media.convFilename] || []).push(media);
        }
        for (const [filename, parts] of Object.entries(byConv)) {
            const data = await readConversationFile(filename);
            if (!data || !Array.isArray(data.messages)) continue;
            parts.sort((a, b) => b.msgIndex - a.msgIndex || b.partIndex - a.partIndex);
            for (const p of parts) {
                const msg = data.messages[p.msgIndex];
                if (msg && Array.isArray(msg.content)) {
                    msg.content.splice(p.partIndex, 1);
                }
            }
            await writeConversationFile(filename, data);
        }
    }
    _storage.selected.clear();
    await _loadStorageData();
    _renderStorageOverview();
    _renderStorageList();
    if (typeof refreshConvList === 'function') refreshConvList();
}

// État du dock de prévisualisation (lancé depuis Stockage > Conversations)
let _storagePreviewFilename = null;

function _openStorageFilePreview(id) {
    const item = _storage.medias.find(m => m.id === id);
    if (!item || !item._data) return;
    try {
        const blob = new Blob(
            [Uint8Array.from(atob(item._data), c => c.charCodeAt(0))],
            { type: item.mimeType || 'application/octet-stream' }
        );
        const url = URL.createObjectURL(blob);
        if (typeof openFileViewer === 'function') openFileViewer(url, item.name);
        setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (e) {
        console.warn('Impossible d\'ouvrir l\'aperçu du fichier', e);
    }
}

function _openStoragePreview(filename) {
    if (!filename) return;
    const conv = _storage.conversations.find(c => c.filename === filename);
    _storagePreviewFilename = filename;

    const dock = document.getElementById('storage-preview-dock');
    const titleEl = document.getElementById('storage-preview-dock-title');
    if (titleEl) titleEl.textContent = (conv && conv.titre) ? conv.titre : 'Sans titre';
    document.body.classList.add('storage-preview-mode');

    // Charger la conversation dans la vue principale pour aperçu
    loadConversation(filename);

    // Animer la modale Paramètres vers le dock du bas
    const modalBox = apikeysModalOverlay.querySelector('.sp-modal.apikeys-modal');
    if (modalBox) {
        modalBox.classList.remove('morphing-from-dock');
        modalBox.classList.add('morphing-to-dock');
        // Affiche le dock un peu avant la fin de l'animation pour un enchaînement plus fluide
        setTimeout(() => { if (dock) dock.style.display = 'flex'; }, 230);
        const onEnd = (e) => {
            if (e.target !== modalBox || e.animationName !== 'modal-morph-to-dock') return;
            modalBox.removeEventListener('animationend', onEnd);
            apikeysModalOverlay.style.display = 'none';
            modalBox.classList.remove('morphing-to-dock');
        };
        modalBox.addEventListener('animationend', onEnd);
    } else {
        apikeysModalOverlay.style.display = 'none';
        if (dock) dock.style.display = 'flex';
    }
}

function _closeStoragePreviewDock() {
    const dock = document.getElementById('storage-preview-dock');
    if (dock) dock.style.display = 'none';
    _storagePreviewFilename = null;
    document.body.classList.remove('storage-preview-mode');

    // Animer la modale Paramètres en réapparition depuis le bas
    const modalBox = apikeysModalOverlay.querySelector('.sp-modal.apikeys-modal');
    if (modalBox) {
        // Pose l'état initial de l'animation AVANT d'afficher l'overlay
        // pour éviter le flash à pleine échelle pendant la première frame.
        modalBox.classList.remove('morphing-to-dock');
        modalBox.classList.add('morphing-from-dock');
        apikeysModalOverlay.style.display = 'flex';
        // Force un reflow pour que l'animation reparte de zéro même si la classe
        // était déjà présente d'un cycle précédent.
        void modalBox.offsetWidth;
        const onEnd = (e) => {
            if (e.target !== modalBox || e.animationName !== 'modal-morph-from-dock') return;
            modalBox.removeEventListener('animationend', onEnd);
            modalBox.classList.remove('morphing-from-dock');
        };
        modalBox.addEventListener('animationend', onEnd);
    } else {
        apikeysModalOverlay.style.display = 'flex';
    }
}

async function _deleteStoragePreviewConv() {
    const filename = _storagePreviewFilename;
    if (!filename) return;
    const ok = await customConfirm('Supprimer définitivement cette conversation ?', {
        icon: 'delete', danger: true, okLabel: 'Supprimer'
    });
    if (!ok) return;
    await deleteConversationFile(filename);
    _storage.selected.delete(filename);
    await _loadStorageData();
    _renderStorageOverview();
    _renderStorageList();
    if (typeof refreshConvList === 'function') refreshConvList();
    _closeStoragePreviewDock();
}

function _selectStoragePreviewConv() {
    const filename = _storagePreviewFilename;
    if (!filename) return;
    _storage.selected.add(filename);
    _renderStorageList();
    _closeStoragePreviewDock();
}

let _storageInitialized = false;
async function _initStoragePanel() {
    // Ne relire la BD que si quelque chose a changé depuis la dernière ouverture.
    // Sinon le cache `_storage` reste valide et l'ouverture est quasi-instantanée.
    if (_storage._dirty) await _loadStorageData();
    _storage.selected.clear();
    _storage.visibleCount = _storage.pageSize;
    if (!_storageInitialized) {
        _storageInitialized = true;

        document.querySelectorAll('[data-storage-action]').forEach(btn => {
            btn.addEventListener('click', () => {
                _enterStorageListView(btn.dataset.storageAction);
            });
        });

        const backBtn = document.getElementById('storage-back-btn');
        if (backBtn) {
            backBtn.addEventListener('click', () => {
                _setStorageView('home');
                _renderStorageOverview();
            });
        }

        document.querySelectorAll('.storage-filter-chip').forEach(chip => {
            chip.addEventListener('click', () => {
                document.querySelectorAll('.storage-filter-chip').forEach(c => c.classList.remove('active'));
                chip.classList.add('active');
                _storage.mediaType = chip.dataset.mediatype;
                _storage.visibleCount = _storage.pageSize;
                _renderStorageList();
            });
        });

        document.getElementById('storage-search').addEventListener('input', (e) => {
            const value = e.target.value;
            clearTimeout(_storage.searchDebounce);
            _storage.searchDebounce = setTimeout(() => {
                _storage.search = value;
                _storage.visibleCount = _storage.pageSize;
                _renderStorageList();
            }, 200);
        });

        document.getElementById('storage-sort').addEventListener('change', (e) => {
            _storage.sort = e.target.value;
            _storage.visibleCount = _storage.pageSize;
            _renderStorageList();
        });

        document.getElementById('storage-select-all').addEventListener('change', (e) => {
            const isConv = _storage.subtab === 'conversations';
            const filtered = _filterAndSortStorageItems();
            const list = document.getElementById('storage-list');
            if (e.target.checked) for (const i of filtered) _storage.selected.add(isConv ? i.filename : i.id);
            else for (const i of filtered) _storage.selected.delete(isConv ? i.filename : i.id);
            list.querySelectorAll('.storage-row, .storage-tile').forEach(el => {
                const sel = _storage.selected.has(el.dataset.id);
                el.classList.toggle('selected', sel);
                const cb = el.querySelector('.storage-row-cb');
                if (cb) cb.checked = sel;
            });
            _updateStorageSelectionUI();
        });

        // Click sur la ligne entière → toggle. Clic sur miniature image → lightbox.
        document.getElementById('storage-list').addEventListener('click', (e) => {
            const loadMore = e.target.closest('#storage-load-more');
            if (loadMore) {
                _storage.visibleCount += _storage.pageSize;
                _renderStorageList();
                return;
            }
            const eyeBtn = e.target.closest('[data-storage-preview-conv], [data-storage-preview-media]');
            if (eyeBtn) {
                e.stopPropagation();
                const convFilename = eyeBtn.dataset.storagePreviewConv;
                if (convFilename) { _openStoragePreview(convFilename); return; }
                const mediaId = eyeBtn.dataset.storagePreviewMedia;
                if (mediaId) {
                    const media = (_storage.medias || []).find(m => m.id === mediaId);
                    // Pour toutes les images, on route vers la lightbox (max-width/height
                    // 92vw/92vh). L'iframe du file-viewer n'applique aucune contrainte
                    // sur les images chargées en src direct → la prévisualisation
                    // sortait à taille native. On reconstruit la dataUrl si nécessaire
                    // depuis `_data` (cas des conversations sauvegardées sans `dataUrl`).
                    if (media && media.type === 'image' && typeof openLightbox === 'function') {
                        const url = media._dataUrl
                            || media.dataUrl
                            || (media._data ? `data:${media.mimeType || 'image/png'};base64,${media._data}` : '');
                        if (url) { openLightbox(url); return; }
                    }
                    _openStorageFilePreview(mediaId);
                    return;
                }
                return;
            }
            const thumb = e.target.closest('[data-lightbox-storage]');
            if (thumb) {
                e.stopPropagation();
                if (typeof openLightbox === 'function') openLightbox(thumb.dataset.lightboxStorage);
                return;
            }
            const fileThumb = e.target.closest('[data-storage-file-id]');
            if (fileThumb) {
                e.stopPropagation();
                _openStorageFilePreview(fileThumb.dataset.storageFileId);
                return;
            }
            const convBtn = e.target.closest('[data-storage-open-conv]');
            if (convBtn) {
                e.stopPropagation();
                const fn = convBtn.dataset.storageOpenConv;
                if (fn) _openStoragePreview(fn);
                return;
            }
            const dlBtnTile = e.target.closest('[data-storage-download-media]');
            if (dlBtnTile) {
                e.stopPropagation();
                const mediaId = dlBtnTile.dataset.storageDownloadMedia;
                const media = (_storage.medias || []).find(m => m.id === mediaId);
                if (media) {
                    const blob = _mediaToBlob(media);
                    if (blob) _triggerDownload(blob, _sanitizeFilename(media.name));
                }
                return;
            }
            const delBtnTile = e.target.closest('[data-storage-delete-media]');
            if (delBtnTile) {
                e.stopPropagation();
                const mediaId = delBtnTile.dataset.storageDeleteMedia;
                _deleteSingleStorageMedia(mediaId);
                return;
            }
            const delBtnConv = e.target.closest('[data-storage-delete-conv]');
            if (delBtnConv) {
                e.stopPropagation();
                _deleteSingleStorageConv(delBtnConv.dataset.storageDeleteConv);
                return;
            }
            const tile = e.target.closest('.storage-tile');
            if (tile) { _toggleStorageRow(tile); return; }
            const row = e.target.closest('.storage-row');
            if (!row) return;
            _toggleStorageRow(row);
        });

        document.getElementById('storage-clear-btn').addEventListener('click', () => {
            _storage.selected.clear();
            const list = document.getElementById('storage-list');
            list.querySelectorAll('.storage-row.selected, .storage-tile.selected').forEach(el => {
                el.classList.remove('selected');
                const cb = el.querySelector('.storage-row-cb');
                if (cb) cb.checked = false;
            });
            _updateStorageSelectionUI();
        });

        document.getElementById('storage-delete-btn').addEventListener('click', _deleteSelectedStorage);
        const dlBtn = document.getElementById('storage-download-btn');
        if (dlBtn) dlBtn.addEventListener('click', _downloadSelectedStorage);

        document.querySelectorAll('.storage-viewmode-btn').forEach(btn => {
            btn.addEventListener('click', () => _setMediaViewMode(btn.dataset.viewmode));
            btn.classList.toggle('active', btn.dataset.viewmode === _storage.mediaViewMode);
        });

        // Dock de prévisualisation : Annuler / Sélectionner / Supprimer
        const dockCancel = document.getElementById('storage-preview-cancel');
        const dockSelect = document.getElementById('storage-preview-select');
        const dockDelete = document.getElementById('storage-preview-delete');
        if (dockCancel) dockCancel.addEventListener('click', _closeStoragePreviewDock);
        if (dockSelect) dockSelect.addEventListener('click', _selectStoragePreviewConv);
        if (dockDelete) dockDelete.addEventListener('click', _deleteStoragePreviewConv);

        const controls = document.getElementById('storage-controls');
        document.getElementById('storage-sort-btn').addEventListener('click', () => {
            controls.classList.remove('search-active');
            controls.classList.add('sort-active');
            setTimeout(() => document.getElementById('storage-sort').focus(), 50);
        });
        document.getElementById('storage-search-btn').addEventListener('click', () => {
            controls.classList.remove('sort-active');
            controls.classList.add('search-active');
            setTimeout(() => document.getElementById('storage-search').focus(), 50);
        });
    }
    _applyStorageControlsLayout();
    _renderStorageOverview();
    _renderStorageList();
    _setStorageView('home');
    const panel = document.getElementById('panel-stockage');
    if (panel) panel.dataset.storageLoading = 'false';
}
async function tryCloseApiKeysModal() {
    const currentActiveTab = document.querySelector('.apikeys-tab.active');
    const activeTabName = currentActiveTab ? currentActiveTab.dataset.tab : '';
    if (activeTabName === 'apimodeles' && (_keysDirty || _catalogDirty)) {
        const ok = await customConfirm('Vous avez des modifications non sauvegardées dans l\'onglet API et Modèles.', {
            icon: 'save',
            okLabel: 'Fermer sans sauvegarder',
            cancelLabel: 'Rester',
            danger: true
        });
        if (!ok) return;
        _restoreApiKeyInputs();
        _setKeysDirty(false);
        _initCatalogPending();
        _setCatalogDirty(false);
    }
    if (activeTabName === 'models' && _modelsDirty) {
        const ok = await customConfirm('Vous avez des modifications non sauvegardées dans l\'onglet Fonctionnalités.', {
            icon: 'save',
            okLabel: 'Fermer sans sauvegarder',
            cancelLabel: 'Rester',
            danger: true
        });
        if (!ok) return;
        _modelsDirty = false;
        populateModelSelects();
    }
    if (activeTabName === 'budget' && _budgetDirty) {
        const ok = await customConfirm('Vous avez des modifications non sauvegardées dans l\'onglet Budget.', {
            icon: 'save',
            okLabel: 'Fermer sans sauvegarder',
            cancelLabel: 'Rester',
            danger: true
        });
        if (!ok) return;
        const budgetCancelBtn = document.getElementById('budget-cancel-btn');
        if (budgetCancelBtn) budgetCancelBtn.click();
    }
    closeApiKeysModal();
}
apikeysModalOverlay.addEventListener('click', (e) => {
    if (e.target === apikeysModalOverlay) tryCloseApiKeysModal();
});
document.getElementById('apikeys-close-btn').addEventListener('click', tryCloseApiKeysModal);

// (coffre-fort retiré — sera remplacé par une nouvelle logique)


window._setModelsDirty = _setModelsDirty;

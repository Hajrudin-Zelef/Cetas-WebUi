function _authHeaders() {
    const h = { 'Content-Type': 'application/json' };
    if (typeof Auth !== 'undefined' && Auth.getToken) { const tk = Auth.getToken(); if (tk) h.Authorization = 'Bearer ' + tk; }
    return h;
}

async function _api(method, path, body) {
    const opts = { method, headers: _authHeaders() };
    if (body) opts.body = JSON.stringify(body);
    const r = await fetch(path, opts);
    return r.json().catch(() => ({}));
}

const $ = id => document.getElementById(id);

let _presets = [];
let _tasks = [];

export function initSettingsFeatures() {
    _bindPresets();
    _bindAgent();
    _bindTasks();
    _bindAPIKey();
    _bindMarexLink();
    _bindEngine();
}

async function _bindPresets() {
    const listEl = $('presets-list');
    const btnNew = $('btn-new-preset');
    if (!listEl) return;

    async function refresh() {
        const data = await _api('GET', '/api/marexcode/presets');
        _presets = data.presets || [];
        render();
    }

    function render() {
        if (!_presets.length) {
            listEl.innerHTML = '<div class="settings-row" style="color:var(--text-secondary);font-size:13px;">Aucun preset. Creez-en un pour sauvegarder vos configurations.</div>';
            return;
        }
        listEl.innerHTML = _presets.map(p =>
            '<div class="settings-row" style="align-items:center;">' +
            '<div class="settings-row-text"><h3>' + esc(p.name || p.id) + '</h3><p>' + esc(p.model || 'Non defini') + ' — ' + esc(p.provider || '') + '</p></div>' +
            '<div style="display:flex;gap:4px;">' +
            '<button class="settings-btn" data-action="apply" data-id="' + esc(p.id) + '">Appliquer</button>' +
            '<button class="settings-btn" data-action="edit" data-id="' + esc(p.id) + '">Editer</button>' +
            '<button class="settings-btn danger" data-action="delete" data-id="' + esc(p.id) + '">X</button>' +
            '</div></div>'
        ).join('');

        listEl.querySelectorAll('[data-action]').forEach(btn => {
            btn.addEventListener('click', () => handlePresetAction(btn.dataset.action, btn.dataset.id));
        });
    }

    async function handlePresetAction(action, id) {
        if (action === 'delete') {
            if (!confirm('Supprimer ce preset ?')) return;
            await _api('DELETE', '/api/marexcode/presets/' + encodeURIComponent(id));
            refresh();
        } else if (action === 'apply') {
            const data = await _api('POST', '/api/marexcode/presets/apply', { id });
            if (data.ok && data.preset) {
                if (data.preset.model && window._marexSelectModel) {
                    window._marexSelectModel(data.preset.model);
                }
                if (data.preset.systemPrompt && window._marexSetSystemPrompt) {
                    window._marexSetSystemPrompt(data.preset.systemPrompt);
                }
                alert('Preset "' + (data.preset.name || id) + '" applique.');
            }
        } else if (action === 'edit') {
            const p = _presets.find(x => x.id === id);
            if (!p) return;
            const name = prompt('Nom du preset:', p.name || p.id);
            if (name === null) return;
            const model = prompt('Modele (id):', p.model || '');
            if (model === null) return;
            const provider = prompt('Provider:', p.provider || '');
            if (provider === null) return;
            const sysprompt = prompt('System prompt (laisser vide pour garder):', p.systemPrompt || '');
            await _api('PUT', '/api/marexcode/presets/' + encodeURIComponent(id), { name, model, provider, systemPrompt: sysprompt || undefined });
            refresh();
        }
    }

    if (btnNew) {
        btnNew.addEventListener('click', async () => {
            const name = prompt('Nom du preset:');
            if (!name) return;
            const curModel = (typeof localStorage !== 'undefined' && localStorage.getItem('marex-last-model')) || '';
            const model = prompt('Modele (id):', curModel);
            if (model === null) return;
            const provider = prompt('Provider:', 'openai');
            if (provider === null) return;
            const sysprompt = prompt('System prompt (laisser vide pour garder le defaut):', '');
            await _api('POST', '/api/marexcode/presets', { name, model: model || '', provider: provider || '', systemPrompt: sysprompt || '' });
            refresh();
        });
    }

    refresh();
}

async function _bindAgent() {
    const toggle = $('agent-toggle');
    const compact = $('agent-compact');
    const memSelect = $('mem-mode-select');
    const memLabel = $('mem-mode-label');
    if (!toggle) return;

    const data = await _api('GET', '/api/marexcode/agent');
    toggle.checked = !!data.enabled;
    if (compact) compact.checked = data.compact !== false;
    if (memSelect && data.mem_mode) {
        memSelect.value = data.mem_mode;
        if (memLabel) memLabel.textContent = data.mem_mode;
    }

    toggle.addEventListener('change', async () => {
        await _api('POST', '/api/marexcode/agent', { enabled: toggle.checked });
    });
    if (compact) {
        compact.addEventListener('change', async () => {
            await _api('POST', '/api/marexcode/agent', { compact: compact.checked });
        });
    }
    if (memSelect) {
        var savedMemMode = localStorage.getItem('marex-mem-mode') || 'always';
        memSelect.value = savedMemMode;
        if (memLabel) memLabel.textContent = savedMemMode;
        memSelect.addEventListener('change', async () => {
            await _api('POST', '/api/marexcode/agent', { mem_mode: memSelect.value });
            localStorage.setItem('marex-mem-mode', memSelect.value);
            if (memLabel) memLabel.textContent = memSelect.value;
        });
    }
}

async function _bindTasks() {
    const listEl = $('tasks-list');
    const btnNew = $('btn-new-task');
    const pauseToggle = $('tasks-pause-toggle');
    if (!listEl) return;

    async function refresh() {
        const data = await _api('GET', '/api/marexcode/tasks');
        _tasks = data.tasks || [];
        if (pauseToggle) pauseToggle.checked = !!data.paused;
        render();
    }

    function render() {
        if (!_tasks.length) {
            listEl.innerHTML = '<div class="settings-row" style="color:var(--text-secondary);font-size:13px;">Aucune tache planifiee.</div>';
            return;
        }
        listEl.innerHTML = _tasks.map(t => {
            const status = !t.enabled ? 'Desactivee' : t.last_ok === false ? 'Erreur' : t.last_run ? 'Dernier: ' + new Date(t.last_run).toLocaleString('fr-FR') : 'Jamais executee';
            return '<div class="settings-row" style="align-items:center;">' +
            '<div class="settings-row-text"><h3>' + esc(t.name) + '</h3><p>' + esc(t.schedule) + ' — ' + status + '</p></div>' +
            '<div style="display:flex;gap:4px;">' +
            '<button class="settings-btn" data-action="run" data-id="' + esc(t.id) + '">Executer</button>' +
            '<button class="settings-btn" data-action="toggle" data-id="' + esc(t.id) + '">' + (t.enabled ? 'Desactiver' : 'Activer') + '</button>' +
            '<button class="settings-btn danger" data-action="delete" data-id="' + esc(t.id) + '">X</button>' +
            '</div></div>';
        }).join('');

        listEl.querySelectorAll('[data-action]').forEach(btn => {
            btn.addEventListener('click', async () => {
                const action = btn.dataset.action, id = btn.dataset.id;
                if (action === 'delete') {
                    if (!confirm('Supprimer cette tache ?')) return;
                    await _api('DELETE', '/api/marexcode/tasks/' + encodeURIComponent(id));
                    refresh();
                } else if (action === 'toggle') {
                    await _api('POST', '/api/marexcode/tasks/' + encodeURIComponent(id) + '/toggle');
                    refresh();
                } else if (action === 'run') {
                    await _api('POST', '/api/marexcode/tasks/' + encodeURIComponent(id) + '/run');
                    alert('Tache lancee.');
                }
            });
        });
    }

    if (btnNew) {
        btnNew.addEventListener('click', async () => {
            const name = prompt('Nom de la tache:');
            if (!name) return;
            const prompt_text = prompt('Consigne pour l\'IA:', '');
            const schedule = prompt('Frequence (ex: @every 1h, @every 1d@09:00):', '@every 1h');
            if (!schedule) return;
            await _api('POST', '/api/marexcode/tasks', { name, prompt: prompt_text || '', schedule, enabled: true });
            refresh();
        });
    }

    if (pauseToggle) {
        pauseToggle.addEventListener('change', async () => {
            await _api('POST', '/api/marexcode/tasks/pause', { paused: pauseToggle.checked });
        });
    }

    refresh();
}

async function _bindAPIKey() {
    const statusEl = $('api-key-status');
    const btnGen = $('btn-gen-api-key');
    const btnClear = $('btn-clear-api-key');
    if (!statusEl) return;

    async function refresh() {
        const data = await _api('GET', '/api/marexcode/apikey');
        statusEl.textContent = data.set ? 'Activee (' + (data.masked || '***') + ')' : 'Non definie';
    }

    if (btnGen) {
        btnGen.addEventListener('click', async () => {
            const data = await _api('POST', '/api/marexcode/apikey', { action: 'generate' });
            if (data.ok && data.key) {
                prompt('Cle generee (copiez-la) :', data.key);
            }
            refresh();
        });
    }
    if (btnClear) {
        btnClear.addEventListener('click', async () => {
            if (!confirm('Retirer la cle API ?')) return;
            await _api('POST', '/api/marexcode/apikey', { action: 'clear' });
            refresh();
        });
    }

    refresh();
}

async function _bindMarexLink() {
    const statusEl = $('marex-link-status');
    const tokenInput = $('marex-link-token');
    const btnConnect = $('btn-marex-link-connect');
    const urlRow = $('marex-link-url-row');
    const urlEl = $('marex-link-url');
    const connectRow = $('marex-link-connect-row');
    if (!statusEl) return;

    async function refresh() {
        const data = await _api('GET', '/api/marexcode/link/status');
        if (data.linked) {
            statusEl.textContent = 'Connecte';
            statusEl.style.color = 'var(--green, #22c55e)';
            if (urlEl) urlEl.textContent = data.machineURL || '—';
            if (urlRow) urlRow.style.display = '';
            if (connectRow) connectRow.style.display = 'none';
        } else {
            statusEl.textContent = 'Non connecte';
            if (urlRow) urlRow.style.display = 'none';
            if (connectRow) connectRow.style.display = '';
        }
    }

    if (btnConnect) {
        btnConnect.addEventListener('click', async () => {
            const token = tokenInput && tokenInput.value.trim();
            if (!token) return alert('Entrez un token.');
            await _api('POST', '/api/marexcode/link/connect', { token });
            refresh();
        });
    }

    refresh();
}

async function _bindEngine() {
    const statusEl = $('engine-status');
    const btnStart = $('btn-engine-start');
    const btnStop = $('btn-engine-stop');
    const btnLogs = $('btn-engine-logs');
    if (!statusEl) return;

    async function refresh() {
        const data = await _api('GET', '/api/marexcode/engine/status');
        if (data.external) {
            statusEl.textContent = 'Externe (preset distant)';
            statusEl.style.color = 'var(--green, #22c55e)';
        } else if (data.active) {
            statusEl.textContent = data.health ? 'Actif' : 'En chargement...';
            statusEl.style.color = data.health ? 'var(--green, #22c55e)' : 'var(--yellow, #eab308)';
        } else {
            statusEl.textContent = 'Arrete';
            statusEl.style.color = 'var(--text-secondary)';
        }
    }

    if (btnStart) {
        btnStart.addEventListener('click', async () => {
            await _api('POST', '/api/marexcode/engine', { action: 'start' });
            refresh();
        });
    }
    if (btnStop) {
        btnStop.addEventListener('click', async () => {
            await _api('POST', '/api/marexcode/engine', { action: 'stop' });
            refresh();
        });
    }
    if (btnLogs) {
        btnLogs.addEventListener('click', async () => {
            const data = await _api('GET', '/api/marexcode/engine/logs');
            alert(data.logs || 'Aucun log disponible.');
        });
    }

    refresh();
}

function esc(s) {
    const d = document.createElement('div');
    d.textContent = String(s == null ? '' : s);
    return d.innerHTML;
}

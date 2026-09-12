import { listSessions, loadSession as apiLoadSession, saveSession as apiSaveSession, deleteSession as apiDeleteSession, listTree, readFile, getProject, setProject, uploadProjectFolder, deleteProject, listSkillsConfig, saveSkillsConfig, listWorkspaces, listWorkspaceTree, activateWorkspace, deleteWorkspace, getWorkspaceInstructions, saveWorkspaceInstructions, getGlobalInstructions, saveGlobalInstructions } from './api.js';
import { initModelSelect, selectModel, getSelectedModelId } from './model-select.js';
import { createChat } from './chat.js';
import { initRouter } from './router.js';
import { COMPETENCES } from './skills.js';
import { getPermission, setPermission, checkToolPermission, getRule, setRule } from './marex-permission.js';
import { initSettingsFeatures } from './settings.js';
import { initMetrics } from './metrics.js';

const $ = id => document.getElementById(id);

const MAX_VIEW_LINES = 4000;

// Préférences du menu "+" (Recherche web) — état UI, persisté dans localStorage.
const marexPrefs = {
    webSearch: (() => { try { return localStorage.getItem("marex-web-search") !== "0"; } catch (e) { return true; } })()
};

const refs = {
    authGate: $('auth-gate'),
    mainFrame: $('main-frame'),
    settingsFrame: $('settings-frame'),
    settingsBackBtn: $('settings-back-btn'),
    settingsContent: document.querySelector('.settings-content'),
    sidebar: document.querySelector('.sidebar'),
    hamburgerBtn: $('hamburger-btn'),
    sbCloseBtn: $('sb-close-btn'),
    mobileNewBtn: $('mobile-new-btn'),
    mobileTitle: $('mobile-title'),
    newSessionBtn: $('new-session-btn'),
    toggleWorkspace: $('toggle-workspace'),
    panelWorkspace: $('panel-workspace'),
    workspaceTree: $('workspace-tree'),
    workspaceEmpty: $('workspace-empty'),
    toggleWorkspaces: $('toggle-workspaces'),
    panelWorkspaces: $('panel-workspaces'),
    workspacesList: $('workspaces-list'),
    workspacesEmpty: $('workspaces-empty'),
    btnNewWorkspace: $('btn-new-workspace'),
    toggleHistory: $('toggle-history'),
    panelHistory: $('panel-history'),
    sessionsList: $('sessions-list'),
    sessionsEmpty: $('sessions-empty'),
    userWrap: $('user-wrap'),
    userBtn: $('user-btn'),
    userMenu: $('user-menu'),
    userEmailText: $('user-email-text'),
    openSettings: $('open-settings'),
    logoutBtn: $('logout-btn'),
    userAvatar: $('user-avatar'),
    userName: $('user-name'),
    btnPermission: $('btn-permission'),
    menuPermission: $('menu-permission'),
    labelPermission: $('label-permission'),
    btnWorkspace: $('btn-workspace'),
    menuWorkspace: $('menu-workspace'),
    labelWorkspace: $('label-workspace'),
    itemUploadedProject: $('item-uploaded-project'),
    uploadedProjectDesc: $('uploaded-project-desc'),
    btnUploadFolder: $('btn-upload-folder'),
    btnDeleteProject: $('btn-delete-project'),
    btnModel: $('btn-model'),
    menuModel: $('menu-model'),
    labelModel: $('label-model'),
    plusBtn: $('plus-btn'),
    menuPlus: $('menu-plus'),
    skillChip: $('skill-chip'),
    skillChipName: $('skill-chip-name'),
    skillChipClear: $('skill-chip-clear'),
    ta: $('marex-input'),
    sendBtn: $('marex-send-btn'),
    stopBtn: $('stop-btn'),
    chatPanel: $('marex-chat-panel'),
    chatLog: $('marex-chat-log'),
    setSessionsCount: $('set-sessions-count'),
    setClearAll: $('set-clear-all'),
    setLogout: $('set-logout'),
    fileViewer: $('file-viewer'),
    fvPath: $('fv-path'),
    fvBody: $('fv-body'),
    fvClose: $('fv-close'),
    authLoginBtn: $('auth-login-btn'),
    sbProjectHeaderName: $('sb-project-header-name'),
    sidePanel: $('side-panel'),
    sidePanelBody: $('side-panel-body'),
    sidePanelEmpty: $('side-panel-empty'),
    sidePanelSpinner: $('side-panel-spinner'),
    sidePanelClose: $('side-panel-close'),
    sidePanelResizer: $('side-panel-resizer'),
    btnArchivedChats: $('btn-archived-chats'),
    btnSuggestions: $('btn-suggestions')
};

let currentSessionId = null;
let showingArchived = false;
let activeProjectName = 'Marexcode (serveur)';

function esc(s) {
    const d = document.createElement('div');
    d.textContent = String(s == null ? '' : s);
    return d.innerHTML;
}

// ── Permission active (Read only / Espace Write / Ask permission) ──
// Point d'entrée unique appelé par tool-search.js (_execMarexcodeTool)
// avant tout appel réseau vers /api/exec, qu'il vienne de l'agent ou
// d'une action manuelle (ex: file viewer).
window._marexCheckPermission = (toolName, args) => checkToolPermission(toolName, args);

function setupPermissionSelector() {
    if (!refs.menuPermission || !refs.labelPermission) return;

    const current = getPermission();
    refs.menuPermission.querySelectorAll('.cdrop-item').forEach(item => {
        const isCurrent = item.getAttribute('data-permission') === current;
        item.classList.toggle('selected', isCurrent);
    });
    refs.labelPermission.textContent = current;

    refs.menuPermission.querySelectorAll('.cdrop-item').forEach(item => {
        item.addEventListener('click', () => {
            const value = item.getAttribute('data-permission');
            refs.menuPermission.querySelectorAll('.cdrop-item').forEach(o => o.classList.remove('selected'));
            item.classList.add('selected');
            refs.labelPermission.textContent = value;
            setPermission(value);
            refs.menuPermission.classList.remove('open');
        });
    });

    const selects = refs.menuPermission.querySelectorAll('select[data-tool]');
    selects.forEach(sel => {
        sel.value = getRule(sel.getAttribute('data-tool'));
        sel.addEventListener('change', () => setRule(sel.getAttribute('data-tool'), sel.value));
    });
}

// ── Projet actif (workspace serveur / dossier importé) ──
function applyProjectUI(name) {
    activeProjectName = name;
    refs.labelWorkspace.textContent = name;
    if (refs.sbProjectHeaderName) refs.sbProjectHeaderName.textContent = name;
    refs.menuWorkspace.querySelectorAll('.cdrop-item[data-project]').forEach(item => {
        item.classList.toggle('selected', item.getAttribute('data-project') === name);
    });
}

async function refreshProjectState() {
    try {
        const data = await getProject();
        applyProjectUI(data.active);
        const uploaded = (data.projects || []).find(p => p.name === 'Projet importé');
        const available = uploaded ? !!uploaded.available : false;
        refs.itemUploadedProject.disabled = !available;
        refs.uploadedProjectDesc.textContent = available
            ? 'Dossier importé disponible'
            : "Aucun dossier importé pour l'instant";
        // Show/hide delete button based on availability
        if (refs.btnDeleteProject) {
            refs.btnDeleteProject.style.display = available ? 'flex' : 'none';
        }
    } catch (e) {
        // silencieux : reste sur l'état par défaut affiché dans le HTML
    }
}

function setupWorkspaceSelector() {
    if (!refs.menuWorkspace || !refs.btnWorkspace) return;

    refs.menuWorkspace.querySelectorAll('.cdrop-item[data-project]').forEach(item => {
        item.addEventListener('click', async () => {
            if (item.disabled) return;
            const name = item.getAttribute('data-project');
            try {
                await setProject(name);
                applyProjectUI(name);
                refs.menuWorkspace.classList.remove('open');
                await refreshTree();
            } catch (e) {
                alert('Erreur lors du changement de projet : ' + (e.message || e));
            }
        });
    });

    // Input file caché en mode dossier, réutilisé à chaque clic sur "Importer un dossier…"
    const folderInput = document.createElement('input');
    folderInput.type = 'file';
    folderInput.webkitdirectory = true;
    folderInput.style.display = 'none';
    document.body.appendChild(folderInput);

    refs.btnUploadFolder.addEventListener('click', (e) => {
        e.stopPropagation();
        folderInput.value = '';
        folderInput.click();
    });

    folderInput.addEventListener('change', async () => {
        if (!folderInput.files || folderInput.files.length === 0) return;
        const originalLabel = refs.btnUploadFolder.textContent;
        refs.btnUploadFolder.textContent = 'Import en cours…';
        refs.btnUploadFolder.disabled = true;
        try {
            await uploadProjectFolder(folderInput.files);
            await refreshWorkspaces();
            await refreshTree();
        } catch (e) {
            alert("Erreur lors de l'import du dossier : " + (e.message || e));
        } finally {
            refs.btnUploadFolder.textContent = originalLabel;
            refs.btnUploadFolder.disabled = false;
        }
    });

    // Nouveau workspace button
    if (refs.btnNewWorkspace) {
        refs.btnNewWorkspace.addEventListener('click', (e) => {
            e.stopPropagation();
            folderInput.value = '';
            folderInput.click();
        });
    }

    // Delete button handler
    if (refs.btnDeleteProject) {
        refs.btnDeleteProject.addEventListener('click', async (e) => {
            e.stopPropagation();
            if (!confirm('Êtes-vous sûr de vouloir supprimer le projet importé ? Cette action est irréversible.')) {
                return;
            }
            const originalLabel = refs.btnDeleteProject.textContent;
            refs.btnDeleteProject.textContent = 'Suppression…';
            refs.btnDeleteProject.disabled = true;
            try {
                await deleteProject();
                await refreshProjectState();
                refs.menuWorkspace.classList.remove('open');
                await refreshTree();
            } catch (e) {
                alert("Erreur lors de la suppression : " + (e.message || e));
            } finally {
                refs.btnDeleteProject.textContent = originalLabel;
                refs.btnDeleteProject.disabled = false;
            }
        });
    }
}

// ── Menu "+" (modèles + compétences) ──
let activeSkill = null;

function applySkill(sk) {
    activeSkill = sk;
    refs.skillChip.style.display = 'inline-flex';
    refs.skillChipName.textContent = sk.name;
}

function clearSkill() {
    activeSkill = null;
    refs.skillChip.style.display = 'none';
    refs.skillChipName.textContent = '';
}

function setupPlusMenu() {
    const menu = refs.menuPlus;
    menu.innerHTML = '';

    if (!refs._plusFileInput) {
        const fileInput = document.createElement('input');
        fileInput.type = 'file';
        fileInput.accept = '.md,.txt,.pdf,.png,.jpg,.jpeg,.webp,.json,.csv,.js,.ts,.py,.html,.css';
        fileInput.style.display = 'none';
        document.body.appendChild(fileInput);
        fileInput.addEventListener('change', async () => {
            if (!fileInput.files || fileInput.files.length === 0) return;
            try {
                await uploadProjectFolder(fileInput.files);
                await refreshProjectState();
                await refreshTree();
            } catch (e) {
                alert("Erreur lors de l'ajout du fichier : " + (e.message || e));
            } finally {
                fileInput.value = '';
            }
        });
        refs._plusFileInput = fileInput;
    }

    const fileLabel = document.createElement('div');
    fileLabel.className = 'cdrop-section-label';
    fileLabel.textContent = 'Fichier';
    menu.appendChild(fileLabel);

    const fileBtn = document.createElement('button');
    fileBtn.className = 'cdrop-item';
    fileBtn.innerHTML = '<span class="cdrop-item-left"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg><span class="cdrop-item-text"><span class="t">Ajouter un fichier</span></span></span>';
    fileBtn.addEventListener('click', () => {
        menu.classList.remove('open');
        refs._plusFileInput.click();
    });
    menu.appendChild(fileBtn);

    const skLabel = document.createElement('div');
    skLabel.className = 'cdrop-section-label';
    skLabel.textContent = 'Compétences';
    menu.appendChild(skLabel);

    if (activeSkill) {
        const noneBtn = document.createElement('button');
        noneBtn.className = 'cdrop-item';
        noneBtn.innerHTML = '<span class="cdrop-item-left"><span class="cdrop-item-text"><span class="t">Aucune compétence</span></span></span>';
        noneBtn.addEventListener('click', () => {
            clearSkill();
            menu.classList.remove('open');
        });
        menu.appendChild(noneBtn);
    }

    for (const sk of COMPETENCES) {
        const b = document.createElement('button');
        b.className = 'cdrop-item' + (activeSkill && activeSkill.id === sk.id ? ' selected' : '');
        b.innerHTML = '<span class="cdrop-item-left"><span class="cdrop-item-text"><span class="t">' + esc(sk.name) + '</span></span></span>' +
            '<svg class="check" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="M20 6L9 17l-5-5"/></svg>';
        b.addEventListener('click', () => {
            applySkill(sk);
            menu.classList.remove('open');
        });
        menu.appendChild(b);
    }

    refs.skillChipClear.addEventListener('click', clearSkill);

    // ── Séparateur + Recherche web ──
    const divider = document.createElement('div');
    divider.className = 'cdrop-divider';
    menu.appendChild(divider);

    const webLabel = document.createElement('div');
    webLabel.className = 'cdrop-section-label';
    webLabel.textContent = 'Recherche web';
    menu.appendChild(webLabel);

    const webRow = document.createElement('div');
    webRow.className = 'cdrop-row';
    webRow.innerHTML = '<span class="cdrop-row-label"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg><span>Recherche web</span></span>' +
        '<label class="cdrop-toggle"><input type="checkbox" id="marex-websearch-toggle"><span class="cdrop-toggle-slider"></span></label>';
    menu.appendChild(webRow);

    const webToggle = webRow.querySelector('#marex-websearch-toggle');
    webToggle.checked = marexPrefs.webSearch;
    webToggle.addEventListener('change', () => {
        marexPrefs.webSearch = webToggle.checked;
        localStorage.setItem('marex-web-search', webToggle.checked ? '1' : '0');
        updateWebSearchGlobe();
    });

    const tokDivider = document.createElement('div');
    tokDivider.className = 'cdrop-divider';
    menu.appendChild(tokDivider);

    const tokLabel = document.createElement('div');
    tokLabel.className = 'cdrop-section-label';
    tokLabel.textContent = 'Tokens max par réponse';
    menu.appendChild(tokLabel);

    const tokRow = document.createElement('div');
    tokRow.className = 'cdrop-row';
    tokRow.style.flexDirection = 'column';
    tokRow.style.gap = '4px';
    tokRow.style.padding = '6px 10px';
    var savedMaxTok = parseInt(localStorage.getItem('marex-max-tokens') || '32768', 10);
    tokRow.innerHTML = '<div style="display:flex;justify-content:space-between;font-size:11px;color:var(--text-secondary,#8b949e)"><span>300</span><span id="max-tok-val" style="font-weight:600;color:var(--text)">' + savedMaxTok.toLocaleString('fr') + '</span><span>32K</span></div>' +
        '<input type="range" id="max-tok-slider" min="300" max="32768" step="100" value="' + savedMaxTok + '" style="width:100%;accent-color:var(--accent,#2563eb)">' +
        '<div style="font-size:10px;color:var(--text-secondary,#8b949e);text-align:center">Tokens max que l\'IA peut générer par réponse</div>';
    menu.appendChild(tokRow);

    const tokSlider = tokRow.querySelector('#max-tok-slider');
    const tokVal = tokRow.querySelector('#max-tok-val');
    tokSlider.addEventListener('input', () => {
        var v = parseInt(tokSlider.value, 10);
        tokVal.textContent = v >= 1000 ? (v / 1000).toFixed(v >= 10000 ? 0 : 1).replace(/\.0$/, '') + 'K' : v;
        localStorage.setItem('marex-max-tokens', String(v));
    });
}

// ── Dropdowns (cdrops) ──
function setupCdrops() {
    const allCdrops = [
        { wrap: 'dd-workspace', btn: 'btn-workspace', menu: 'menu-workspace' },
        { wrap: 'dd-permission', btn: 'btn-permission', menu: 'menu-permission' },
        { wrap: 'dd-model', btn: 'btn-model', menu: 'menu-model' },
        { wrap: 'dd-plus', btn: 'plus-btn', menu: 'menu-plus' }
    ];
    function closeAll(except) {
        for (const c of allCdrops) {
            if (c.menu !== except) $(c.menu).classList.remove('open');
        }
    }
    function positionMenu(btn, menu) {
        const r = btn.getBoundingClientRect();
        menu.style.position = 'fixed';
        menu.style.left = r.left + 'px';
        menu.style.bottom = (window.innerHeight - r.top + 8) + 'px';
        menu.style.top = 'auto';
        requestAnimationFrame(() => {
            const mw = menu.offsetWidth;
            if (r.left + mw > window.innerWidth - 8) {
                menu.style.left = 'auto';
                menu.style.right = (window.innerWidth - r.right) + 'px';
            }
        });
    }
    for (const c of allCdrops) {
        const btn = $(c.btn);
        const menu = $(c.menu);
        if (!btn || !menu) continue;
        document.body.appendChild(menu); // sort du .composer (overflow:hidden) pour flotter librement
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const willOpen = !menu.classList.contains('open');
            closeAll(willOpen ? c.menu : null);
            if (willOpen) positionMenu(btn, menu);
            menu.classList.toggle('open', willOpen);
            if (willOpen) menu.scrollTop = 0;
        });
    }
    document.addEventListener('mousedown', (e) => {
        if (e.target.closest('.tool-perm-select') || e.target.closest('.tool-perm-row') || e.target.closest('#menu-model') || e.target.closest('#menu-plus') || e.target.closest('#menu-workspace')) return;
        const inside = allCdrops.some(c => {
            const wrap = $(c.wrap);
            return wrap && wrap.contains(e.target);
        });
        if (!inside) closeAll(null);
    });
}

// ── Sidebar toggles ──
function setupToggles() {
    function makeToggle(toggleId, panelId) {
        const toggle = $(toggleId);
        const panel = $(panelId);
        if (!toggle || !panel) return;
        const chevron = toggle.querySelector('svg');
        toggle.addEventListener('click', () => {
            const hidden = panel.classList.toggle('hidden');
            if (chevron) chevron.classList.toggle('collapsed', hidden);
        });
    }
    makeToggle('toggle-workspace', 'panel-workspace');
    makeToggle('toggle-workspaces', 'panel-workspaces');
    makeToggle('toggle-history', 'panel-history');

    refs.panelWorkspace.classList.remove('hidden');
    refs.panelWorkspaces.classList.remove('hidden');
    refs.panelHistory.classList.remove('hidden');
    const wChevron = refs.toggleWorkspace.querySelector('svg');
    const wsChevron = refs.toggleWorkspaces.querySelector('svg');
    const hChevron = refs.toggleHistory.querySelector('svg');
    if (wChevron) wChevron.classList.remove('collapsed');
    if (wsChevron) wsChevron.classList.remove('collapsed');
    if (hChevron) hChevron.classList.remove('collapsed');
}

// ── Sidebar mobile drawer ──
function setupSidebar() {
    const closeSidebar = () => refs.sidebar.classList.remove('open');
    const openSidebar = () => refs.sidebar.classList.add('open');
    if (refs.hamburgerBtn) refs.hamburgerBtn.addEventListener('click', openSidebar);
    if (refs.sbCloseBtn) refs.sbCloseBtn.addEventListener('click', closeSidebar);
    const backBtn = document.getElementById('sb-back-btn');
    if (backBtn) backBtn.addEventListener('click', () => { window.location.href = '/'; });
}

function setupSidePanelResize() {
    const resizer = refs.sidePanelResizer;
    const panel = refs.sidePanel;
    if (!resizer || !panel) return;
    let dragging = false;

    resizer.addEventListener('mousedown', (e) => {
        dragging = true;
        resizer.classList.add('dragging');
        document.body.style.userSelect = 'none';
        e.preventDefault();
    });

    document.addEventListener('mousemove', (e) => {
        if (!dragging) return;
        const newWidth = window.innerWidth - e.clientX;
        const clamped = Math.min(Math.max(newWidth, 280), 700);
        panel.style.width = clamped + 'px';
    });

    document.addEventListener('mouseup', () => {
        if (dragging) {
            dragging = false;
            resizer.classList.remove('dragging');
            document.body.style.userSelect = '';
        }
    });
}

function setupUserMenu() {
    if (!refs.userBtn || !refs.userMenu || !refs.userWrap) return;
    refs.userBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        refs.userMenu.classList.toggle('open');
        refs.userBtn.classList.toggle('open');
    });
    document.addEventListener('click', (e) => {
        if (!refs.userWrap.contains(e.target)) {
            refs.userMenu.classList.remove('open');
            refs.userBtn.classList.remove('open');
        }
    });
    refs.btnArchivedChats?.addEventListener('click', () => {
        showingArchived = !showingArchived;
        refs.userMenu.classList.remove('open');
        refs.userBtn.classList.remove('open');
        refreshSessions();
    });
    const SUGGESTED_PROMPTS = [
        "Liste les fichiers du workspace",
        "Explique-moi la structure de ce projet",
        "Crée un fichier README.md pour ce projet",
        "Trouve les bugs potentiels dans mon code",
        "Ajoute des commentaires à mon code"
    ];
    refs.btnSuggestions?.addEventListener('click', () => {
        refs.userMenu.classList.remove('open');
        refs.userBtn.classList.remove('open');
        const idx = Math.floor(Math.random() * SUGGESTED_PROMPTS.length);
        refs.ta.value = SUGGESTED_PROMPTS[idx];
        refs.ta.dispatchEvent(new Event('input'));
        refs.ta.focus();
    });
}

async function loadSkillsPanel() {
    const container = document.getElementById('skills-list');
    if (!container) return;
    try {
        const skills = await listSkillsConfig();
        if (!skills || !skills.length) {
            container.innerHTML = '<div class="settings-row" style="justify-content:center;color:var(--text-secondary);">Aucun skill trouvé</div>';
            return;
        }
        container.innerHTML = '';
        for (const skill of skills) {
            const row = document.createElement('div');
            row.className = 'settings-row';
            row.style.cssText = 'flex-wrap:wrap;gap:8px;';
            row.innerHTML =
                '<div class="settings-row-text" style="flex:1;min-width:200px;">' +
                    '<h3>' + esc(skill.name) + '</h3>' +
                    '<p style="font-size:12px;color:#8b949e;">' + esc(skill.description || '') + '</p>' +
                '</div>' +
                '<label style="display:flex;align-items:center;gap:6px;font-size:13px;">' +
                    '<input type="checkbox" data-skill="' + esc(skill.id) + '" ' + (skill.enabled ? 'checked' : '') + ' style="cursor:pointer;">' +
                    'Activé' +
                '</label>' +
                '<select data-skill-mode="' + esc(skill.id) + '" style="background:var(--bg-input,#1a1d23);color:inherit;border:1px solid rgba(255,255,255,.12);border-radius:6px;padding:4px 8px;font-size:12px;cursor:pointer;">' +
                    '<option value="manual"' + (skill.mode === 'manual' ? ' selected' : '') + '>Manuel</option>' +
                    '<option value="auto"' + (skill.mode === 'auto' ? ' selected' : '') + '>Auto</option>' +
                    '<option value="on_demand"' + (skill.mode === 'on_demand' ? ' selected' : '') + '>À la demande</option>' +
                '</select>';
            container.appendChild(row);
        }
        // Save on change
        container.addEventListener('change', async () => {
            const config = {};
            container.querySelectorAll('[data-skill]').forEach(cb => {
                const id = cb.getAttribute('data-skill');
                const modeSelect = container.querySelector('[data-skill-mode="' + id + '"]');
                config[id] = {
                    enabled: cb.checked,
                    mode: modeSelect ? modeSelect.value : 'manual'
                };
            });
            try { await saveSkillsConfig(config); } catch (e) { console.error('Erreur sauvegarde skills:', e); }
        });
    } catch (e) {
        container.innerHTML = '<div class="settings-row" style="justify-content:center;color:var(--text-secondary);">Erreur de chargement</div>';
    }
}

async function loadInstructionsPanel() {
    const textarea = document.getElementById('global-instructions-textarea');
    const saveBtn = document.getElementById('save-global-instructions');
    if (!textarea) return;
    try {
        const data = await getGlobalInstructions();
        textarea.value = data.content || '';
    } catch (e) {
        textarea.value = '';
    }
    if (saveBtn) {
        saveBtn.addEventListener('click', async () => {
            try {
                await saveGlobalInstructions(textarea.value);
                saveBtn.textContent = '✓ Enregistré';
                setTimeout(() => { saveBtn.textContent = 'Enregistrer'; }, 2000);
            } catch (e) {
                alert('Erreur sauvegarde: ' + (e.message || e));
            }
        });
    }
}

function fillUserInfo() {
    let username = 'Utilisateur';
    try {
        if (typeof Auth !== 'undefined' && Auth.getUsername) username = Auth.getUsername() || username;
    } catch (e) {}
    refs.userName.textContent = username;
    refs.userAvatar.textContent = (username[0] || 'U').toUpperCase();
    refs.userEmailText.textContent = username;
}

// ── Sessions (groupées par projet, façon "Projets" de Codex) ──
function esc2(s) { return esc(s); }

function buildSessionItem(s) {
    const b = document.createElement('button');
    b.className = 'sb-hist-item' + (s.id === currentSessionId ? ' active' : '');
    b.innerHTML = '<span class="sb-hist-label" title="' + esc2(s.title || '') + '">' + esc2(s.title || 'Sans titre') + '</span>' +
        '<span class="sb-hist-favorite' + (s.favorite ? ' active' : '') + '" title="' + (s.favorite ? 'Retirer des favoris' : 'Ajouter aux favoris') + '" role="button">' +
        '<svg width="13" height="13" viewBox="0 0 24 24" fill="' + (s.favorite ? 'currentColor' : 'none') + '" stroke="currentColor" stroke-width="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>' +
        '</span>' +
        '<span class="sb-hist-rename" title="Renommer" role="button">' +
        '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>' +
        '</span>' +
        '<span class="sb-hist-archive" title="' + (showingArchived ? 'Désarchiver' : 'Archiver') + '" role="button">' +
        '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="3" y="4" width="18" height="4" rx="1"/><path d="M5 8v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8"/><path d="M10 13h4"/></svg>' +
        '</span>' +
        '<span class="sb-hist-del" title="Supprimer" role="button">' +
        '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg>' +
        '</span>';
    b.addEventListener('click', (e) => {
        if (e.target.closest('.sb-hist-favorite')) {
            e.stopPropagation();
            s.favorite = !s.favorite;
            apiSaveSession(s).then(() => refreshSessions()).catch(() => refreshSessions());
            return;
        }
        if (e.target.closest('.sb-hist-rename')) {
            e.stopPropagation();
            const newTitle = prompt('Renommer la discussion :', s.title || '');
            if (newTitle && newTitle.trim()) {
                s.title = newTitle.trim();
                apiSaveSession(s).then(() => refreshSessions()).catch(() => refreshSessions());
            }
            return;
        }
        if (e.target.closest('.sb-hist-archive')) {
            e.stopPropagation();
            s.archived = !s.archived;
            apiSaveSession(s).then(() => refreshSessions()).catch(() => refreshSessions());
            return;
        }
        if (e.target.closest('.sb-hist-del')) {
            e.stopPropagation();
            if (confirm('Supprimer cette session ?')) {
                apiDeleteSession(s.id).then(() => {
                    if (currentSessionId === s.id) { currentSessionId = null; chat.newSession(); }
                    refreshSessions();
                }).catch(() => refreshSessions());
            }
            return;
        }
        openSession(s.id);
    });
    return b;
}

window.activeWorkspaceId = null;

function openInstructionsModal(wsName, wsId, initialContent) {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
        <div class="modal-instructions">
            <div class="modal-instructions-header">
                <h2>Project Instructions</h2>
                <p>Define guidelines for the agent when working on <strong>${esc(wsName)}</strong></p>
            </div>
            <textarea class="modal-instructions-textarea" rows="14" placeholder="Describe project context, conventions, constraints...">${esc(initialContent || '')}</textarea>
            <div class="modal-instructions-footer">
                <button class="modal-instructions-save" type="button">Save</button>
            </div>
        </div>
    `;
    document.body.appendChild(overlay);
    requestAnimationFrame(() => overlay.classList.add('open'));

    const textarea = overlay.querySelector('.modal-instructions-textarea');
    const saveBtn = overlay.querySelector('.modal-instructions-save');
    textarea.focus();

    async function save() {
        try {
            await saveWorkspaceInstructions(wsId, textarea.value);
            saveBtn.textContent = 'Saved';
            saveBtn.disabled = true;
            setTimeout(() => {
                overlay.classList.remove('open');
                setTimeout(() => overlay.remove(), 200);
            }, 600);
        } catch (e) {
            saveBtn.textContent = 'Error';
            setTimeout(() => { saveBtn.textContent = 'Save'; }, 1500);
        }
    }

    function close() {
        overlay.classList.remove('open');
        setTimeout(() => overlay.remove(), 200);
    }

    saveBtn.addEventListener('click', save);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
    overlay.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });
}

async function refreshWorkspaces() {
    try {
        const workspaces = await listWorkspaces();
        refs.workspacesList.innerHTML = '';
        if (!workspaces || !workspaces.length) {
            refs.workspacesEmpty.style.display = 'block';
            return;
        }
        refs.workspacesEmpty.style.display = 'none';
        for (const ws of workspaces) {
            const b = document.createElement('button');
            b.className = 'sb-hist-item' + (ws.active ? ' active' : '');
            b.innerHTML = '<span class="sb-hist-chev" title="Afficher les fichiers" role="button">' +
                '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 9l6 6 6-6"/></svg>' +
                '</span>' +
                '<span class="sb-hist-label" title="' + esc(ws.name) + '">' + esc(ws.name) + '</span>' +
                '<span class="sb-hist-rename" title="Instructions" role="button">' +
                '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>' +
                '</span>' +
                '<span class="sb-hist-del" title="Supprimer" role="button">' +
                '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg>' +
                '</span>';
            const treeBox = document.createElement('div');
            treeBox.className = 'sb-ws-tree';
            treeBox.style.display = 'none';

            const toggleTree = async () => {
                if (treeBox.style.display !== 'none') {
                    treeBox.style.display = 'none';
                    b.querySelector('.sb-hist-chev').classList.remove('open');
                    return;
                }
                if (!treeBox.dataset.loaded) {
                    treeBox.innerHTML = '<div class="sb-tree-empty">Chargement…</div>';
                    treeBox.style.display = 'block';
                    try {
                        const files = await listWorkspaceTree(ws.id);
                        treeBox.innerHTML = '';
                        if (!files.length) {
                            treeBox.innerHTML = '<div class="sb-tree-empty">Vide.</div>';
                        }
                        for (const f of files) {
                            const fb = document.createElement('button');
                            fb.className = 'sb-tree-item';
                            fb.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M13 2v7h7"/></svg>' +
                                '<span>' + esc(f.path) + '</span>';
                            fb.title = f.path;
                            fb.addEventListener('click', (e) => { e.stopPropagation(); openFileViewer(f.path); });
                            treeBox.appendChild(fb);
                        }
                        treeBox.dataset.loaded = '1';
                    } catch (e) {
                        treeBox.innerHTML = '<div class="sb-tree-empty">Erreur.</div>';
                    }
                } else {
                    treeBox.style.display = 'block';
                }
                b.querySelector('.sb-hist-chev').classList.add('open');
            };

            b.addEventListener('click', async (e) => {
                if (e.target.closest('.sb-hist-chev')) {
                    e.stopPropagation();
                    await toggleTree();
                    return;
                }
                if (e.target.closest('.sb-hist-rename')) {
                    e.stopPropagation();
                    try {
                        const data = await getWorkspaceInstructions(ws.id);
                        openInstructionsModal(ws.name, ws.id, data.content || '');
                    } catch (err) { console.error(err); }
                    return;
                }
                if (e.target.closest('.sb-hist-del')) {
                    e.stopPropagation();
                    if (confirm('Supprimer le projet "' + ws.name + '" ?')) {
                        await deleteWorkspace(ws.id);
                        if (window.activeWorkspaceId === ws.id) window.activeWorkspaceId = null;
                        await refreshWorkspaces();
                        await refreshTree();
                    }
                    return;
                }
                // Activer ce workspace
                await activateWorkspace(ws.id);
                window.activeWorkspaceId = ws.id;
                applyProjectUI(ws.name);
                await chat.preloadInstructions();
                await refreshWorkspaces();
                await refreshTree();
            });
            refs.workspacesList.appendChild(b);
            refs.workspacesList.appendChild(treeBox);
            if (ws.active) { window.activeWorkspaceId = ws.id; applyProjectUI(ws.name); }
        }
    } catch (e) {
        refs.workspacesList.innerHTML = '';
        refs.workspacesEmpty.style.display = 'block';
    }
}

async function refreshSessions() {
    try {
        const list = await listSessions();
        const sorted = list.slice()
            .filter(s => showingArchived ? s.archived : !s.archived)
            .sort((a, b) => (b.date || '').localeCompare(a.date || ''));
        refs.sessionsList.innerHTML = '';
        refs.sessionsEmpty.style.display = sorted.length ? 'none' : 'block';

        const favorites = sorted.filter(s => s.favorite);
        if (favorites.length) {
            const favLabel = document.createElement('div');
            favLabel.className = 'sb-history-group-label';
            favLabel.textContent = '⭐ Favoris';
            refs.sessionsList.appendChild(favLabel);
            for (const s of favorites) {
                refs.sessionsList.appendChild(buildSessionItem(s));
            }
        }

        const groups = new Map();
        for (const s of sorted) {
            const proj = s.project || 'Marexcode (serveur)';
            if (!groups.has(proj)) groups.set(proj, []);
            groups.get(proj).push(s);
        }

        for (const [proj, items] of groups) {
            const label = document.createElement('div');
            label.className = 'sb-history-group-label';
            label.textContent = proj;
            refs.sessionsList.appendChild(label);

            for (const s of items) {
                refs.sessionsList.appendChild(buildSessionItem(s));
            }
        }
        refs.setSessionsCount.textContent = String(sorted.length);
        return list;
    } catch (e) {
        return [];
    }
}

async function openSession(id) {
    try {
        const data = await apiLoadSession(id);
        currentSessionId = id;
        chat.setSession(data);
        const model = data.model || getSelectedModelId(refs.menuModel);
        if (model) selectModel(refs.menuModel, refs.labelModel, model, (m) => {
            const s = chat.getSession();
            if (s) s.model = m;
        });
        refs.mobileTitle.textContent = data.title || 'Marexcode';
        refreshSessions();
    } catch (e) {}
}

// ── Workspace tree ──
async function refreshTree() {
    try {
        const files = await listTree();
        refs.workspaceTree.innerHTML = '';
        refs.workspaceEmpty.style.display = files.length ? 'none' : 'block';
        refs.workspaceEmpty.textContent = files.length ? '' : 'Aucun fichier dans le workspace.';
        appendTreeLevel(refs.workspaceTree, groupByDir(files), 0);
    } catch (e) {
        console.error('refreshTree error:', e);
        refs.workspaceEmpty.style.display = 'block';
        refs.workspaceEmpty.textContent = 'Erreur chargement du workspace.';
    }
}

function getFileIcon(filename) {
    const ext = filename.includes('.') ? filename.split('.').pop().toLowerCase() : '';
    const base = filename.toLowerCase();
    const map = {
        py: { icon: '🐍', color: '#3776ab' },
        js: { icon: 'JS', color: '#f7df1e' },
        ts: { icon: 'TS', color: '#3178c6' },
        json: { icon: '{}', color: '#f0c040' },
        yml: { icon: '⚙', color: '#cb171e' },
        yaml: { icon: '⚙', color: '#cb171e' },
        md: { icon: '📄', color: '#8b949e' },
        env: { icon: '⚙', color: '#8b949e' },
        sh: { icon: '$', color: '#4eaa25' },
        html: { icon: '</>', color: '#e34c26' },
        css: { icon: '#', color: '#563d7c' },
        log: { icon: '≡', color: '#6a737d' },
        service: { icon: '≡', color: '#6a737d' },
        dockerfile: { icon: '🐳', color: '#2496ed' },
    };
    if (base === 'dockerfile') return map.dockerfile;
    if (base.startsWith('.env')) return map.env;
    if (base === '.gitignore') return { icon: '≡', color: '#f05033' };
    return map[ext] || { icon: '📄', color: '#8b949e' };
}

function groupByDir(files) {
    const dirs = new Map();
    const roots = [];
    let nodes = roots;
    for (const f of files) {
        const parts = String(f.path).split('/');
        nodes = roots;
        let acc = '';
        for (let i = 0; i < parts.length - 1; i++) {
            const name = parts[i];
            acc = acc ? acc + '/' + name : name;
            if (!dirs.has(acc)) {
                const node = { type: 'dir', name, path: acc, children: [] };
                dirs.set(acc, node);
                nodes.push(node);
            }
            nodes = dirs.get(acc).children;
        }
        nodes.push({ type: 'file', name: parts[parts.length - 1], path: f.path, size: f.size });
    }
    return nodes;
}

function appendTreeLevel(container, nodes, depth) {
    nodes.sort((a, b) => (a.type === b.type) ? a.name.localeCompare(b.name) : (a.type === 'dir' ? -1 : 1));
    for (const n of nodes) {
        if (n.type === 'dir') {
            const row = document.createElement('button');
            row.className = 'sb-tree-item sb-tree-dir';
            row.style.paddingLeft = (8 + depth * 12) + 'px';
            row.innerHTML = '<span class="sb-hist-chev open"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 9l6 6 6-6"/></svg></span>' +
                '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7z"/></svg>' +
                '<span>' + esc(n.name) + '</span>';
            const sub = document.createElement('div');
            sub.className = 'sb-tree-sub';
            row.addEventListener('click', (e) => {
                e.stopPropagation();
                const chev = row.querySelector('.sb-hist-chev');
                const collapsed = sub.classList.toggle('collapsed');
                chev.classList.toggle('open', !collapsed);
            });
            container.appendChild(row);
            container.appendChild(sub);
            appendTreeLevel(sub, n.children, depth + 1);
        } else {
            const b = document.createElement('button');
            b.className = 'sb-tree-item';
            b.style.paddingLeft = (8 + depth * 12) + 'px';
            const fi = getFileIcon(n.name);
            b.innerHTML = '<span class="sb-tree-leaf-spacer"></span>' +
                '<span class="sb-tree-file-icon" style="color:' + fi.color + '">' + esc(fi.icon) + '</span>' +
                '<span>' + esc(n.name) + '</span>';
            b.title = n.path;
            b.addEventListener('click', () => openFileViewer(n.path));
            container.appendChild(b);
        }
    }
}

async function openFileViewer(path) {
    refs.fvPath.textContent = path;
    refs.fvBody.textContent = 'Chargement…';
    refs.fvBody.classList.add('loading');
    refs.fileViewer.classList.add('open');
    try {
        const data = await readFile(path);
        const content = (data && data.content != null) ? data.content : (data.error || 'Fichier vide.');
        const lines = content.split('\n');
        refs.fvBody.innerHTML = '';
        refs.fvBody.classList.remove('loading');
        if (lines.length === 1 && !lines[0]) {
            refs.fvBody.textContent = 'Fichier vide.';
            return;
        }
        const shown = lines.length > MAX_VIEW_LINES ? lines.slice(0, MAX_VIEW_LINES) : lines;
        const codeEl = document.createElement('div');
        codeEl.className = 'fv-code';
        for (let i = 0; i < shown.length; i++) {
            const lineEl = document.createElement('div');
            lineEl.className = 'fv-line';
            const numEl = document.createElement('span');
            numEl.className = 'fv-line-num';
            numEl.textContent = String(i + 1);
            const textEl = document.createElement('span');
            textEl.className = 'fv-line-text';
            textEl.textContent = shown[i];
            lineEl.appendChild(numEl);
            lineEl.appendChild(textEl);
            lineEl.dataset.line = i;
            codeEl.appendChild(lineEl);
        }
        refs.fvBody.appendChild(codeEl);
        if (lines.length > MAX_VIEW_LINES) {
            const more = document.createElement('div');
            more.className = 'fv-more';
            more.textContent = 'Affichage limité aux ' + MAX_VIEW_LINES + ' premières lignes (' + lines.length + ' au total).';
            refs.fvBody.appendChild(more);
        }
        setupFileHover(path);
    } catch (e) {
        refs.fvBody.classList.remove('loading');
        refs.fvBody.textContent = 'Erreur : ' + (e.message || e);
    }
}

let _fvHover = null;

function setupFileHover(path) {
    if (_fvHover) _fvHover.dispose();
    const body = refs.fvBody;
    let timer = null;
    let tooltipEl = null;
    let lastLine = null;
    const hide = () => {
        if (timer) { clearTimeout(timer); timer = null; }
        if (tooltipEl) tooltipEl.style.display = 'none';
    };
    const onMove = (e) => {
        const lineEl = e.target instanceof Element ? e.target.closest('.fv-line') : null;
        if (!lineEl || lineEl === lastLine) return;
        lastLine = lineEl;
        hide();
        const line = parseInt(lineEl.dataset.line, 10);
        const textEl = lineEl.querySelector('.fv-line-text');
        const charIdx = textEl ? getHoverCharIndex(e, textEl) : 0;
        timer = setTimeout(async () => {
            try {
                const token = (typeof Auth !== 'undefined' && Auth.getToken) ? Auth.getToken() : null;
                const headers = { 'Content-Type': 'application/json' };
                if (token) headers['Authorization'] = 'Bearer ' + token;
                const resp = await fetch('/api/lsp/hover', {
                    method: 'POST', headers,
                    body: JSON.stringify({ file: path, line: line, character: charIdx }),
                    signal: AbortSignal.timeout(8000)
                });
                if (!resp.ok) return;
                const result = await resp.json();
                const text = (result && result.contents)
                    ? (typeof result.contents === 'string' ? result.contents : (result.contents.value || ''))
                    : '';
                if (!text || lastLine !== lineEl) return;
                if (!tooltipEl) {
                    tooltipEl = document.createElement('div');
                    tooltipEl.className = 'fv-tooltip';
                    body.appendChild(tooltipEl);
                }
                tooltipEl.textContent = text;
                tooltipEl.style.display = 'block';
                const rect = lineEl.getBoundingClientRect();
                const bodyRect = body.getBoundingClientRect();
                tooltipEl.style.top = (rect.top - bodyRect.top + body.scrollTop - 4) + 'px';
                tooltipEl.style.left = '60px';
            } catch (_) { /* ignore hover errors */ }
        }, 400);
    };
    const onLeave = () => { lastLine = null; hide(); };
    body.addEventListener('mousemove', onMove);
    body.addEventListener('mouseleave', onLeave);
    _fvHover = {
        dispose() {
            body.removeEventListener('mousemove', onMove);
            body.removeEventListener('mouseleave', onLeave);
            hide();
        }
    };
}

function getHoverCharIndex(e, textEl) {
    const range = document.caretRangeFromPoint(e.clientX, e.clientY);
    if (range && range.startContainer === textEl.firstChild) {
        return range.startOffset;
    }
    return Math.floor((e.clientX - textEl.getBoundingClientRect().left) / 8);
}

// ── Settings ──
function setupSettings(router) {
    refs.settingsBackBtn.addEventListener('click', () => {
        router.showMain();
        refs.settingsContent.scrollTop = 0;
    });
    document.querySelectorAll('.settings-nav-item[data-panel]').forEach(item => {
        item.addEventListener('click', () => {
            document.querySelectorAll('.settings-nav-item[data-panel]').forEach(o => o.classList.remove('active'));
            item.classList.add('active');
            const target = item.getAttribute('data-panel');
            document.querySelectorAll('.settings-panel').forEach(p => p.classList.remove('active'));
            const panel = document.querySelector('.settings-panel[data-content="' + target + '"]');
            if (panel) panel.classList.add('active');
            refs.settingsContent.scrollTop = 0;
        });
    });
    refs.openSettings.addEventListener('click', () => {
        refs.userMenu.classList.remove('open');
        refs.userBtn.classList.remove('open');
        router.showSettings();
        loadSkillsPanel();
        loadInstructionsPanel();
        initSettingsFeatures();
    });
    refs.setClearAll.addEventListener('click', async () => {
        if (!confirm('Supprimer définitivement toutes vos sessions Marexcode ?')) return;
        try {
            const list = await listSessions();
            for (const s of list) {
                try { await apiDeleteSession(s.id); } catch (e) {}
            }
            currentSessionId = null;
            chat.newSession();
            refreshSessions();
        } catch (e) {}
    });
    refs.setLogout.addEventListener('click', logout);
    refs.logoutBtn.addEventListener('click', logout);
}

function logout() {
    if (typeof Auth !== 'undefined' && Auth.logout) {
        Auth.logout();
        return;
    }
    try { sessionStorage.removeItem('cetas-token'); } catch (e) {}
    window.location.reload();
}

// ── Chat wiring ──
function setupChat() {
    chat = createChat({
        chatLog: refs.chatLog,
        chatPanel: refs.chatPanel,
        ta: refs.ta,
        sendBtn: refs.sendBtn,
        stopBtn: refs.stopBtn,
        onSave: async (s) => {
            try {
                await apiSaveSession(s);
                if (!currentSessionId) currentSessionId = s.id;
                refs.mobileTitle.textContent = s.title || 'Marexcode';
                refreshSessions();
            } catch (e) {
                if (e && e.message === 'AUTH_REQUIRED') { router.checkAuth(); }
            }
        },
        onAuthRequired: () => router.checkAuth(),
        getSystemPrompt: () => (activeSkill ? activeSkill.prompt : ''),
        getActiveProject: () => activeProjectName,
        sidePanel: refs.sidePanel,
        sidePanelBody: refs.sidePanelBody,
        sidePanelEmpty: refs.sidePanelEmpty,
        sidePanelSpinner: refs.sidePanelSpinner,
        sidePanelClose: refs.sidePanelClose
    });

    // Preload instructions at boot
    chat.preloadInstructions();

    refs.sendBtn.addEventListener('click', () => chat.send());
    refs.stopBtn.addEventListener('click', () => chat.stop());
    refs.ta.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey && !e.ctrlKey) {
            e.preventDefault();
            chat.send();
        }
    });
    const TA_MAX_HEIGHT = 200;
    function autoResizeTa() {
        refs.ta.style.height = 'auto';
        const next = Math.min(refs.ta.scrollHeight, TA_MAX_HEIGHT);
        refs.ta.style.height = next + 'px';
        refs.ta.style.overflowY = refs.ta.scrollHeight > TA_MAX_HEIGHT ? 'auto' : 'hidden';
    }
    refs.ta.addEventListener('input', autoResizeTa);
    autoResizeTa();
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && chat.isRunning()) chat.stop();
    });
}

// ── New session ──
function newSession() {
    const s = chat.newSession();
    currentSessionId = null;
    refs.mobileTitle.textContent = 'Marexcode';
    refreshSessions();
    return s;
}

function setupNewSession() {
    const doNew = () => newSession();
    refs.newSessionBtn.addEventListener('click', doNew);
    refs.mobileNewBtn.addEventListener('click', doNew);
    document.querySelectorAll('.sb-row[data-item="recherche"]').forEach(el => {
        el.addEventListener('click', () => {
            // Placeholder : la recherche de conversations n'est pas encore implémentée.
        });
    });
}

// ── Boot ──
let chat;
let router;

function boot() {
    router = initRouter({
        authGate: refs.authGate,
        mainFrame: refs.mainFrame,
        settingsFrame: refs.settingsFrame
    });

    if (!router.checkAuth()) return;

    if (typeof loadModels === 'function') {
        try { loadModels(); } catch (e) {}
    }
    if (typeof loadMcpTools === 'function') {
        try { loadMcpTools(); } catch (e) {}
    }
    if (typeof loadCustomTools === 'function') {
        try { loadCustomTools(); } catch (e) {}
    }

    setupCdrops();
    setupPermissionSelector();
    setupWorkspaceSelector();
    setupToggles();
    setupSidebar();
    setupUserMenu();
    setupSidePanelResize();
    setupPlusMenu();
    fillUserInfo();
    setupChat();
    if (chat.setupUndoRedo) chat.setupUndoRedo();
    if (chat.setupImageDrop) chat.setupImageDrop();
    if (chat.setupSlashCommands) chat.setupSlashCommands();

    chat.newSession();

    function updateWebSearchGlobe() {
        const globe = document.getElementById('web-globe-btn');
        if (!globe) return;
        const model = getSelectedModelId(refs.menuModel);
        const editors = (typeof WEB_SEARCH_EDITEURS !== 'undefined') ? WEB_SEARCH_EDITEURS : [];
        const editor = (typeof getModelEditeur === 'function') ? getModelEditeur(model) : '';
        const canSearch = editors.indexOf(editor) >= 0;
        globe.style.display = canSearch ? '' : 'none';
        if (canSearch) {
            globe.classList.toggle('active', marexPrefs.webSearch);
            globe.title = marexPrefs.webSearch ? 'Recherche web activée' : 'Recherche web désactivée';
        }
    }
    window.updateWebSearchGlobe = updateWebSearchGlobe;

    initModelSelect(refs.menuModel, refs.labelModel, (m) => {
        const s = chat.getSession();
        if (s) s.model = m;
        updateWebSearchGlobe();
    });

    window._marexSelectModel = function(modelId) {
        selectModel(refs.menuModel, refs.labelModel, modelId, (m) => {
            const s = chat.getSession();
            if (s) s.model = m;
        });
    };
    window._marexSetSystemPrompt = function(prompt) {
        window._marexCustomSysPrompt = prompt;
    };

    const webGlobe = document.getElementById('web-globe-btn');
    if (webGlobe) {
        webGlobe.addEventListener('click', () => {
            marexPrefs.webSearch = !marexPrefs.webSearch;
            const toggle = document.getElementById('marex-websearch-toggle');
            if (toggle) toggle.checked = marexPrefs.webSearch;
            localStorage.setItem('marex-web-search', marexPrefs.webSearch ? '1' : '0');
            updateWebSearchGlobe();
        });
    }
    updateWebSearchGlobe();

    setupSettings(router);
    initMetrics();
    setupNewSession();

    refs.fvClose.addEventListener('click', () => refs.fileViewer.classList.remove('open'));
    refs.fileViewer.addEventListener('click', (e) => {
        if (e.target === refs.fileViewer) refs.fileViewer.classList.remove('open');
    });
    if (refs.authLoginBtn) {
        refs.authLoginBtn.addEventListener('click', () => { window.location.href = '/'; });
    }

    refreshSessions();
    refreshProjectState().then(() => refreshWorkspaces());
    refreshTree();
}

document.addEventListener('DOMContentLoaded', boot);

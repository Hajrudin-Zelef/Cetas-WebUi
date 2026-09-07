export function getToken() {
    try {
        const k = sessionStorage.getItem('cetas-token');
        if (k) return k;
    } catch (e) {}
    try {
        const k = Object.keys(localStorage).find(x => /token/i.test(x));
        if (k) return localStorage.getItem(k);
    } catch (e) {}
    return '';
}

export function authHeaders() {
    return { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + getToken() };
}

export async function apiFetch(url, options) {
    const opts = options || {};
    opts.headers = opts.headers || authHeaders();
    const resp = await fetch(url, opts);
    if (resp.status === 401) {
        throw new Error('AUTH_REQUIRED');
    }
    let data = {};
    try { data = await resp.json(); } catch (e) { data = {}; }
    if (!resp.ok) {
        throw new Error(data.error || ('Erreur serveur ' + resp.status));
    }
    return data;
}

export async function listSessions() {
    return apiFetch('/api/marexcode/sessions');
}

export async function loadSession(id) {
    return apiFetch('/api/marexcode/sessions/' + encodeURIComponent(id));
}

export async function saveSession(session) {
    if (!session.id) session.id = 's' + Date.now();
    await apiFetch('/api/marexcode/sessions/' + encodeURIComponent(session.id), {
        method: 'PUT',
        body: JSON.stringify(session)
    });
    return session;
}

export async function deleteSession(id) {
    return apiFetch('/api/marexcode/sessions/' + encodeURIComponent(id), { method: 'DELETE' });
}

export async function listTree() {
    return apiFetch('/api/marexcode/tree');
}

export async function readFile(path) {
    const data = await apiFetch('/api/exec', {
        method: 'POST',
        body: JSON.stringify({ tool: 'Read', args: { file_path: path } }),
        signal: AbortSignal.timeout(20000)
    });
    return data;
}

export async function execTool(tool, args) {
    return apiFetch('/api/exec', {
        method: 'POST',
        body: JSON.stringify({ tool, args }),
        signal: AbortSignal.timeout(20000)
    });
}

// ── Projet actif (workspace serveur / dossier importé) ─────────────────

export async function getProject() {
    return apiFetch('/api/marexcode/project');
}

export async function setProject(name) {
    return apiFetch('/api/marexcode/project', {
        method: 'PUT',
        body: JSON.stringify({ active: name })
    });
}

export async function deleteProject() {
    return apiFetch('/api/marexcode/project', {
        method: 'DELETE'
    });
}

/**
 * Upload réel d'un dossier choisi via <input webkitdirectory>.
 * `fileList` est la FileList native (chaque File porte déjà webkitRelativePath).
 * Remplace entièrement le projet importé côté serveur et l'active.
 */
export async function uploadProjectFolder(fileList) {
    const files = Array.from(fileList || []);
    if (!files.length) throw new Error('Aucun fichier sélectionné');

    const form = new FormData();
    for (const file of files) {
        const relPath = file.webkitRelativePath || file.name;
        form.append('files', file, relPath);
    }

    const resp = await fetch('/api/marexcode/upload', {
        method: 'POST',
        headers: { 'Authorization': 'Bearer ' + getToken() },
        body: form
    });
    if (resp.status === 401) throw new Error('AUTH_REQUIRED');
    let data = {};
    try { data = await resp.json(); } catch (e) { data = {}; }
    if (!resp.ok) {
        throw new Error(data.error || ('Erreur upload ' + resp.status));
    }
    return data;
}

// ── Skills (.opencode/skills/) ──────────────────────────────────────

export async function listSkillsConfig() {
    return apiFetch('/api/marexcode/skills');
}

export async function saveSkillsConfig(config) {
    return apiFetch('/api/marexcode/skills/config', { method: 'PUT', body: JSON.stringify(config) });
}

export async function getSkillContent(id) {
    return apiFetch('/api/marexcode/skills/' + encodeURIComponent(id) + '/content');
}

// ── Workspaces multi-projets ────────────────────────────────────────

export async function listWorkspaces() {
    return apiFetch('/api/marexcode/workspaces');
}

export async function listWorkspaceTree(id) {
    return apiFetch('/api/marexcode/workspaces/' + encodeURIComponent(id) + '/tree');
}

export async function activateWorkspace(id) {
    return apiFetch('/api/marexcode/workspaces/' + encodeURIComponent(id) + '/activate', { method: 'PUT' });
}

export async function deleteWorkspace(id) {
    return apiFetch('/api/marexcode/workspaces/' + encodeURIComponent(id), { method: 'DELETE' });
}

export async function getWorkspaceInstructions(id) {
    return apiFetch('/api/marexcode/workspaces/' + encodeURIComponent(id) + '/instructions');
}

export async function saveWorkspaceInstructions(id, content) {
    return apiFetch('/api/marexcode/workspaces/' + encodeURIComponent(id) + '/instructions', {
        method: 'PUT', body: JSON.stringify({ content })
    });
}

export async function getGlobalInstructions() {
    return apiFetch('/api/marexcode/global-instructions');
}

export async function saveGlobalInstructions(content) {
    return apiFetch('/api/marexcode/global-instructions', { method: 'PUT', body: JSON.stringify({ content }) });
}

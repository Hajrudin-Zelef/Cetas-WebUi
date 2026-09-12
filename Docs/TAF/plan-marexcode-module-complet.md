# Plan — Module Marexcode Complet (DeepSeek Harness-like)

> **Date:** 2026-09-04
> **Statut:** À implémenter
> **Cible:** Faire de Marexcode un **module complet** dans Cetas (vue plein écran dédiée),
> sur le modèle de DeepSeek Harness : workspace projet, agent chat avec outils, trajectoire
> des appels d'outils visible, sessions persistantes. Éditeur en **lecture seule**.
>
> **Pour agentic workers:** TDD obligatoire. Chaque task = test qui échoue → implémentation
> minimale → test qui passe → commit. Steps en syntaxe checkbox (`- [ ]`).

---

## Contexte vérifié

État actuel du dev Marexcode (vérifié le 2026-09-04) :

| Brique | État | Emplacement |
|--------|------|-------------|
| Sandbox `/api/exec` (Bash/Read/Write/Edit/Grep, JWT, whitelist) | ✅ | `server/server.py:689`, `:1164`, `:1581-1623` ; `_exec_*` `:1481-1579` ; tests `server/tests/test_exec.py` (16) |
| Boucle agentic chat | ✅ | `static/js/integrations/tool-search.js` `streamModelWithTools` (max 3 itérations) |
| Dispatch chat → tools | ✅ | `static/js/features/chat.js:4-9` `_streamModelDispatch` |
| Compétence Marexcode (chat) | ✅ | `static/js/ui/plus-menu.js` `{id:"marexcode", tools:"marexcode"}` → `_activeToolset` |
| **Bouton sidebar "Marexcode"** | ❌ **grisé** | `static/partials/sidebar.html:8` ; `storage.css:1398-1415` `opacity:0.45` ; `app.js:395-403` = toast "🚧 Développement" |
| Workspace sandbox | ❌ global | `server.py:691` `EXEC_SANDBOX = CETAS_PROJECT_DIR` |
| Sessions agent | ❌ absentes | — |

Décisions de cadrage validées : moteur = boucle existante renforcée (pas le CLI
`Marexcode.tar.gz`) ; workspace dédié par utilisateur ; sessions persistantes par projet ;
vue plein écran dédiée ; éditeur fichier lecture seule ; livraison d'un bloc.

---

## Architecture

```
body.marexcode-mode  (classe sur <body>)
  ├─ #marexcode-view        (vue plein écran, masque sidebar/main/right-panel)
  │   ├─ topbar: [← retour] [modèle ▾] [sessions ▾] [nouveau]
  │   ├─ panneau gauche: file tree (GET /api/marexcode/tree) + liste sessions
  │   └─ panneau droit: chat agent (streamModelWithTools) + input + trajectoire outils
  └─ (fermer → body class retirée, app normale)

Backend (server.py)
  ├─ /api/exec            → workspace par utilisateur (self._marex_root)
  ├─ GET /api/marexcode/tree              → listing récursif workspace
  ├─ GET/PUT/DELETE /api/marexcode/sessions/{id}  → sessions persistantes
  └─ GET /api/marexcode/sessions          → liste meta sessions

Frontend
  └─ static/js/features/marexcode.js  → factory createMarexcode(deps) (pattern createChat)
```

### Fichiers

| Action | Fichier | Rôle |
|--------|---------|------|
| Modify | `server/server.py` | Workspace per-user, tree, sessions, rate-limit |
| Create | `server/tests/test_marexcode.py` | Tests tree + sessions |
| Modify | `server/tests/test_exec.py` | Tests workspace per-user |
| Create | `static/partials/marexcode.html` | Vue plein écran |
| Create | `static/css/features/marexcode.css` | Styles vue (ajout au cat Dockerfile) |
| Create | `static/js/features/marexcode.js` | Factory createMarexcode |
| Create | `static/tests/marexcode-structure.test.mjs` | Test structurel |
| Modify | `static/index.html` | Include partial marexcode.html |
| Modify | `static/partials/scripts.html` | Script tag marexcode.js |
| Modify | `static/js/core/app.js` | Activation bouton + import factory |
| Modify | `static/css/components/storage.css` | Dés-griser bouton Marexcode |
| Modify | `static/js/integrations/tool-search.js` | Trajectoire CustomEvent + itérations configurables |
| Modify | `Dockerfile` | Terser marexcode.js + cat marexcode.css |
| Modify | `Docs/TAF/integration-marexcode.md` | Statut module |
| Modify | `index.md` | Cartographie module Marexcode |

---

## Phase 1 — Backend : workspace + endpoints

### Task 1: Workspace par utilisateur

**Files:**
- Modify: `server/server.py`
- Test: `server/tests/test_exec.py`

**Interfaces:**
- Produces: `ProxyHandler._marex_root` (str | None), posé par `_exec_tool` ; `_resolve_safe_path`,
  `_exec_bash`, `_exec_read`, `_exec_write`, `_exec_edit`, `_exec_grep` utilisent
  `self._marex_root or EXEC_SANDBOX`.

- [ ] **Step 1:** Écrire les tests qui échouent (workspace per-user)

```python
def test_exec_uses_per_user_workspace(handler):
    handler._marex_root = os.path.join(os.environ["CETAS_DATA_DIR"], "marexcode", "alice")
    res = handler._exec_bash("pwd")
    assert "error" not in res
    assert res["stdout"].strip() == os.path.realpath(handler._marex_root)


def test_exec_write_lands_in_user_workspace(handler):
    handler._marex_root = os.path.join(os.environ["CETAS_DATA_DIR"], "marexcode", "bob")
    os.makedirs(handler._marex_root, exist_ok=True)
    res = handler._exec_write("app.txt", "hello")
    assert res.get("ok") is True
    full = os.path.join(handler._marex_root, "app.txt")
    assert os.path.exists(full)


def test_exec_traversal_blocked_outside_user_workspace(handler):
    handler._marex_root = os.path.join(os.environ["CETAS_DATA_DIR"], "marexcode", "carol")
    os.makedirs(handler._marex_root, exist_ok=True)
    res = handler._exec_read("../../secret.txt")
    assert "error" in res
```

- [ ] **Step 2:** Lancer → vérifier échec (`_exec_bash` ne lit pas `_marex_root`)

Run: `python3 -m pytest server/tests/test_exec.py -q`
Expected: FAIL

- [ ] **Step 3:** Implémenter minimal

```python
def _exec_root(self) -> str:
    return self._marex_root or EXEC_SANDBOX
```

`_resolve_safe_path` : `os.path.join(self._exec_root(), rel_path)` ; `_exec_bash` cwd =
`self._exec_root()`. `_exec_tool` pose `self._marex_root = _marex_workspace(username)`
avant dispatch.

```python
def _marex_workspace(username: str) -> str:
    safe = username.replace("/", "_").replace("\\", "_").strip() or "anon"
    d = os.path.join(os.environ.get("CETAS_DATA_DIR", DATA_DIR), "marexcode", safe)
    os.makedirs(d, exist_ok=True)
    return d
```

- [ ] **Step 4:** Lancer → vérifier passage

Run: `python3 -m pytest server/tests/test_exec.py -q`
Expected: PASS

- [ ] **Step 5:** Commit

```bash
git add server/server.py server/tests/test_exec.py
git commit -m "feat(exec): workspace marexcode par utilisateur"
```

### Task 2: `GET /api/marexcode/tree`

**Files:**
- Modify: `server/server.py`
- Create: `server/tests/test_marexcode.py`

**Interfaces:**
- Produces: `ProxyHandler._marex_tree()` → `list[{path,type,size}]`, trié, exclut
  `.git`, `node_modules`, fichiers/folders cachés (prefix `.`), `.vault`.

- [ ] **Step 1:** Écrire le test qui échoue

```python
def test_marex_tree_lists_workspace(handler):
    handler._marex_root = os.path.join(_test_tmpdir_marex, "tree")
    os.makedirs(os.path.join(handler._marex_root, "src"), exist_ok=True)
    with open(os.path.join(handler._marex_root, "src", "a.py"), "w") as f:
        f.write("x")
    with open(os.path.join(handler._marex_root, ".git", "HEAD"), "w") as f:
        f.write("x")
    tree = handler._marex_tree()
    names = [e["path"] for e in tree]
    assert "src/a.py" in names
    assert not any(".git" in n for n in names)
```

- [ ] **Step 2:** Lancer → vérifier échec (`_marex_tree` inexistant)

- [ ] **Step 3:** Implémenter

```python
def _marex_tree(self) -> list:
    root = self._exec_root()
    out = []
    for dirpath, dirnames, filenames in os.walk(root):
        dirnames[:] = [d for d in dirnames if not d.startswith(".")
                       and d not in ("node_modules", ".git")]
        rel = os.path.relpath(dirpath, root)
        for fn in sorted(filenames):
            if fn.startswith("."):
                continue
            full = os.path.join(dirpath, fn)
            out.append({"path": os.path.join(rel, fn) if rel != "." else fn,
                        "type": "file", "size": os.path.getsize(full)})
    return sorted(out, key=lambda e: e["path"])
```

Route GET : `if self.path == "/api/marexcode/tree": self._marex_tree_get(); return`
(ajouter au bloc do_GET existant). Handler : auth JWT (`_get_authenticated_user`),
pose `self._marex_root = _marex_workspace(username)`, répond `self._respond_json(tree)`.

- [ ] **Step 4:** Lancer → vérifier passage

- [ ] **Step 5:** Commit

### Task 3: Sessions CRUD

**Files:**
- Modify: `server/server.py`
- Create: `server/tests/test_marexcode.py`

**Interfaces:**
- Produces: `_marex_sessions_dir()` ; routes `GET /api/marexcode/sessions`,
  `GET/PUT/DELETE /api/marexcode/sessions/{id}`. Session = dict JSON arbitraire
  (messages, model, project, date). id validé `_marex_session_path` (anti-traversal).

- [ ] **Step 1:** Tests qui échouent

```python
def test_sessions_list_and_save(handler):
    handler._marex_root = _test_tmpdir_marex
    handler._session_root = os.path.join(_test_tmpdir_marex, "sessions")
    ok = handler._marex_session_save("s1", {"messages": [], "title": "T"})
    assert ok.get("ok") is True
    lst = handler._marex_sessions_list()
    assert any(s["id"] == "s1" for s in lst)


def test_sessions_load_roundtrip(handler):
    handler._session_root = os.path.join(_test_tmpdir_marex, "sessions")
    handler._marex_session_save("s2", {"title": "Bonjour", "model": "gpt"})
    data = handler._marex_session_load("s2")
    assert data["title"] == "Bonjour"


def test_sessions_delete(handler):
    handler._session_root = os.path.join(_test_tmpdir_marex, "sessions")
    handler._marex_session_save("s3", {"title": "X"})
    assert handler._marex_session_delete("s3").get("ok") is True
    assert handler._marex_session_load("s3") is None


def test_sessions_path_traversal_blocked(handler):
    handler._session_root = os.path.join(_test_tmpdir_marex, "sessions")
    assert handler._marex_session_save("../../evil", {}) is None
```

- [ ] **Step 2:** Lancer → vérifier échec (méthodes inexistantes)

- [ ] **Step 3:** Implémenter

```python
def _marex_session_path(self, sid: str) -> str | None:
    safe = os.path.basename(sid)
    if not safe or safe.startswith("."):
        return None
    root = os.path.realpath(self._session_root)
    full = os.path.realpath(os.path.join(root, safe + ".json"))
    if full != root and not full.startswith(root + os.sep):
        return None
    return full

def _marex_sessions_list(self):
    root = os.path.realpath(self._session_root)
    os.makedirs(root, exist_ok=True)
    out = []
    for fn in sorted(os.listdir(root)):
        if fn.endswith(".json"):
            try:
                with open(os.path.join(root, fn), "r", encoding="utf-8") as f:
                    d = json.load(f)
                out.append({"id": fn[:-5], "title": d.get("title", ""),
                            "model": d.get("model", ""),
                            "date": d.get("date", "")})
            except Exception:
                pass
    return out
```

`_marex_session_save/_load/_delete` : lecture/écriture JSON via `_marex_session_path`.
`_session_root` posé dans `_marex_session_ensure` : `os.path.join(DATA_DIR, "marexcode",
safe_user, "sessions")` — posé par les routes GET/PUT/DELETE sessions.

Routes : dans `do_GET`/`do_PUT`/`do_DELETE`, brancher avant le fallback 404.

- [ ] **Step 4:** Lancer → vérifier passage

- [ ] **Step 5:** Commit

### Task 4: Rate-limit exec par username

**Files:**
- Modify: `server/server.py`
- Test: `server/tests/test_exec.py` (aucun — comportement couvert par code read)

- [ ] **Step 1:** Implémenter (pas de test unitaire nécessaire, change de clé)

`server.py:1588` : `_rate_check("exec:" + username, 60, 60)` (au lieu de
`"exec:" + ip, 15, 60`).

- [ ] **Step 2:** Vérifier syntaxe + tests backend

- [ ] **Step 3:** Commit

---

## Phase 2 — Vue plein écran (frontend)

### Task 5: Partial `marexcode.html`

**Files:**
- Create: `static/partials/marexcode.html`
- Modify: `static/index.html`

**Interfaces:**
- Produces: `<section id="marexcode-view">` masqué par défaut ; conteneurs
  `#marex-topbar`, `#marex-back-btn`, `#marex-model-select`, `#marex-new-session`,
  `#marex-session-select`, `#marex-tree`, `#marex-sessions`, `#marex-chat`,
  `#marex-chat-log`, `#marex-input`, `#marex-send-btn`, `#marex-file-viewer`.

- [ ] **Step 1:** Créer le partial

```html
<section id="marexcode-view" class="marex-view" style="display:none" hidden>
  <div class="marex-topbar">
    <button id="marex-back-btn" class="marex-btn" title="Retour">←</button>
    <span class="marex-title">Marexcode</span>
    <select id="marex-model-select" class="marex-select"></select>
    <select id="marex-session-select" class="marex-select"></select>
    <button id="marex-new-session" class="marex-btn">Nouveau</button>
  </div>
  <div class="marex-body">
    <aside class="marex-side">
      <div class="marex-pane-title">Fichiers</div>
      <div id="marex-tree" class="marex-tree"></div>
      <div class="marex-pane-title">Sessions</div>
      <div id="marex-sessions" class="marex-sessions"></div>
    </aside>
    <main class="marex-main">
      <div id="marex-chat-log" class="marex-chat-log"></div>
      <div class="marex-input-row">
        <textarea id="marex-input" class="marex-input" rows="1"
                  placeholder="Décrivez la tâche de code..."></textarea>
        <button id="marex-send-btn" class="marex-send-btn">Envoyer</button>
      </div>
    </main>
    <aside class="marex-side">
      <div class="marex-pane-title">Fichier</div>
      <div id="marex-file-viewer" class="marex-file-viewer">
        <pre id="marex-file-content" class="marex-file-content"></pre>
      </div>
    </aside>
  </div>
</section>
```

- [ ] **Step 2:** Ajouter l'include dans `static/index.html` (avant scripts.html)

```html
<!--#include file="partials/marexcode.html" -->
```

- [ ] **Step 3:** Commit

### Task 6: CSS vue

**Files:**
- Create: `static/css/features/marexcode.css`
- Modify: `Dockerfile`

- [ ] **Step 1:** Créer le CSS

```css
/* ============ Module Marexcode (vue plein écran) ============ */
body.marexcode-mode .sidebar,
body.marexcode-mode .main,
body.marexcode-mode .right-panel,
body.marexcode-mode #side-panel-toolbar { display:none !important; }
body.marexcode-mode #marexcode-view { display:flex !important; }

.marex-view {
  position: fixed; inset: 0; z-index: 5000;
  flex-direction: column; background: var(--bg, #f7f9fc); color: var(--text);
}
.marex-topbar {
  display:flex; align-items:center; gap:12px; padding:10px 16px;
  border-bottom:1px solid var(--border); background: var(--panel-bg, #fff);
}
.marex-title { font-weight:700; font-size:1rem; margin-right:8px; }
.marex-btn { padding:6px 12px; border:1px solid var(--border); border-radius:6px;
  background:var(--btn-bg); color:var(--btn-text); cursor:pointer; }
.marex-select { padding:5px 8px; border:1px solid var(--border); border-radius:6px;
  background:var(--btn-bg); color:var(--text); max-width:200px; }
.marex-body { flex:1; display:flex; min-height:0; }
.marex-side { width:260px; min-width:200px; overflow:auto; padding:10px;
  border-right:1px solid var(--border); }
.marex-main { flex:1; display:flex; flex-direction:column; min-width:0; }
.marex-pane-title { font-size:0.75rem; text-transform:uppercase; letter-spacing:0.05em;
  color:var(--text-secondary); margin:10px 0 6px; }
.marex-tree-item { padding:3px 6px; border-radius:4px; cursor:pointer; font-size:0.85rem;
  white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.marex-tree-item:hover { background:var(--hover-bg, rgba(0,0,0,0.05)); }
.marex-chat-log { flex:1; overflow:auto; padding:16px; }
.marex-msg { margin-bottom:12px; max-width:78%; padding:10px 14px; border-radius:10px;
  font-size:0.9rem; white-space:pre-wrap; }
.marex-msg.user { margin-left:auto; background:var(--user-msg-bg, #dbeafe); }
.marex-msg.assistant { background:var(--assistant-msg-bg, #fff); border:1px solid var(--border); }
.marex-tool { margin-bottom:8px; border:1px solid var(--border); border-radius:6px;
  padding:8px 10px; font-size:0.8rem; }
.marex-tool-name { font-weight:600; }
.marex-tool pre { margin:6px 0 0; max-height:160px; overflow:auto; font-size:0.75rem; }
.marex-input-row { display:flex; gap:8px; padding:12px 16px; border-top:1px solid var(--border); }
.marex-input { flex:1; resize:none; border:1px solid var(--border); border-radius:8px;
  padding:10px; font:inherit; }
.marex-send-btn { padding:8px 16px; border:none; border-radius:8px; cursor:pointer;
  background:var(--accent, #2563eb); color:#fff; }
.marex-file-viewer { flex:1; overflow:auto; }
.marex-file-content { padding:12px; font-size:0.8rem; line-height:1.5; white-space:pre; }
```

- [ ] **Step 2:** Ajouter au cat Dockerfile (avant cleancss)

`/usr/share/nginx/html/static/css/features/marexcode.css \`

- [ ] **Step 3:** Commit

### Task 7: Module `marexcode.js`

**Files:**
- Create: `static/js/features/marexcode.js`
- Modify: `static/partials/scripts.html`
- Modify: `static/js/core/app.js`
- Modify: `Dockerfile`
- Create: `static/tests/marexcode-structure.test.mjs`

**Interfaces:**
- Produces: `export function createMarexcode(deps)` avec API
  `{ open(), close(), isOpen() }`. `window._activeToolset = MAREXCODE_TOOLS` à l'ouverture,
  `null` à la fermeture. Dépend de : `streamModelWithTools`, `MAREXCODE_TOOLS`, `Auth`,
  `MODELS`, `hasProviderKey`, `getModelEditeur`.

- [ ] **Step 1:** Test structurel qui échoue

```javascript
// static/tests/marexcode-structure.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const appSource = readFileSync(resolve(ROOT, 'js/core/app.js'), 'utf8');
const moduleSource = readFileSync(resolve(ROOT, 'js/features/marexcode.js'), 'utf8');

test('app.js imports createMarexcode', () => {
  assert.match(appSource, /import \{ createMarexcode \} from "\.\.\/features\/marexcode\.js"/);
});
test('marexcode.js exports createMarexcode factory', () => {
  assert.match(moduleSource, /export function createMarexcode\s*\(/);
});
test('partial marexcode.html present', () => {
  const html = readFileSync(resolve(ROOT, 'partials/marexcode.html'), 'utf8');
  assert.match(html, /id="marexcode-view"/);
});
```

- [ ] **Step 2:** Lancer → vérifier échec (module inexistant)

- [ ] **Step 3:** Implémenter `static/js/features/marexcode.js`

Squelette factory (pattern `createChat`) :

```javascript
export function createMarexcode(deps) {
  const {
    chatContainer, spSelect, spTextarea, streamModelWithTools, MAREXCODE_TOOLS,
    MODELS, hasProviderKey, getModelEditeur, Auth, effectiveSystemPrompt,
  } = deps;

  let session = { id: null, title: "Nouvelle session", model: null, messages: [] };
  let running = false;

  const view = document.getElementById("marexcode-view");
  const log = document.getElementById("marex-chat-log");
  const input = document.getElementById("marex-input");
  const sendBtn = document.getElementById("marex-send-btn");
  const modelSel = document.getElementById("marex-model-select");
  const sessionSel = document.getElementById("marex-session-select");
  const treeEl = document.getElementById("marex-tree");
  const sessionsEl = document.getElementById("marex-sessions");
  const fileViewer = document.getElementById("marex-file-content");

  function apiHeaders() {
    const h = { "Content-Type": "application/json" };
    if (Auth && Auth.getToken) { const t = Auth.getToken(); if (t) h.Authorization = "Bearer " + t; }
    return h;
  }

  async function loadTree() {
    try {
      const r = await fetch("/api/marexcode/tree", { headers: apiHeaders() });
      const list = await r.json();
      treeEl.innerHTML = "";
      list.forEach(f => {
        const d = document.createElement("div");
        d.className = "marex-tree-item";
        d.textContent = f.path;
        d.title = f.path;
        d.addEventListener("click", () => openFile(f.path));
        treeEl.appendChild(d);
      });
    } catch (e) { treeEl.textContent = "Erreur chargement arbre"; }
  }

  async function openFile(path) {
    try {
      const r = await fetch("/api/exec", {
        method: "POST", headers: apiHeaders(),
        body: JSON.stringify({ tool: "Read", args: { file_path: path } }),
        signal: AbortSignal.timeout(20000),
      });
      const d = await r.json();
      document.getElementById("marex-file-content").textContent =
        d.error ? "Erreur: " + d.error : (d.content || "");
    } catch (e) { /* ignore */ }
  }

  function addMsg(role, text) {
    const m = document.createElement("div");
    m.className = "marex-msg " + role;
    m.textContent = text;
    log.appendChild(m); log.scrollTop = log.scrollHeight;
  }

  function addTool(name, args, result) {
    const t = document.createElement("div");
    t.className = "marex-tool";
    t.innerHTML = "<div class=\"marex-tool-name\">🛠 " + esc(name) + "</div>" +
      "<pre>" + esc(JSON.stringify(args)) + "</pre>" +
      "<pre>" + esc(JSON.stringify(result)) + "</pre>";
    log.appendChild(t); log.scrollTop = log.scrollHeight;
  }

  async function send() {
    const text = input.value.trim();
    if (!text || running) return;
    const model = session.model || (modelSel.value) || null;
    if (!model) { addMsg("assistant", "Sélectionnez un modèle."); return; }
    running = true; input.value = ""; sendBtn.disabled = true;
    session.messages.push({ role: "user", content: text });
    addMsg("user", text);
    const history = [
      { role: "system", content: effectiveSystemPrompt ? effectiveSystemPrompt() : "Tu es Marexcode, assistant de codage." },
      ...session.messages,
    ];
    await streamModelWithTools(model, history,
      (chunk) => { /* append to last assistant msg */ },
      (done) => { running = false; sendBtn.disabled = false; saveSession(); },
      (err) => { running = false; sendBtn.disabled = false;
                 addMsg("assistant", "Erreur: " + (err && err.message || err)); },
      MAREXCODE_TOOLS, false, null, null, null, null, 0);
  }

  async function saveSession() { /* PUT /api/marexcode/sessions/{id or new} */ }
  async function loadSessions() { /* GET list → sessionSel + sessionsEl */ }
  async function loadSession(id) { /* GET → session + render log */ }
  function renderMessages() { /* clear log, replay session.messages */ }

  sendBtn.addEventListener("click", send);
  input.addEventListener("keydown", e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } });
  document.getElementById("marex-new-session").addEventListener("click", () => { session = { id: null, title: "Nouvelle session", model: null, messages: [] }; log.innerHTML = ""; input.value = ""; });
  sessionSel.addEventListener("change", () => { if (sessionSel.value) loadSession(sessionSel.value); });

  function populateModels() {
    modelSel.innerHTML = "";
    MODELS.filter(m => !m.hidden && (m.editeur === "samagent" || hasProviderKey(m.editeur)))
      .forEach(m => {
        const o = document.createElement("option");
        o.value = m.id; o.textContent = m.label; modelSel.appendChild(o);
      });
  }

  return {
    open() {
      populateModels(); loadTree(); loadSessions();
      document.body.classList.add("marexcode-mode");
      window._activeToolset = MAREXCODE_TOOLS;
      window.dispatchEvent(new CustomEvent("cetas:toolset-change"));
    },
    close() {
      document.body.classList.remove("marexcode-mode");
      window._activeToolset = null;
      window.dispatchEvent(new CustomEvent("cetas:toolset-change"));
    },
    isOpen() { return document.body.classList.contains("marexcode-mode"); },
  };
}

function esc(s) {
  const div = document.createElement("div");
  div.textContent = String(s);
  return div.innerHTML;
}
```

- [ ] **Step 4:** Script tag dans `scripts.html`

```html
<script type="module" src="js/features/marexcode.js?v=4.1"></script>
```

- [ ] **Step 5:** Import + init dans `app.js`

```javascript
import { createMarexcode } from "../features/marexcode.js";
```

Appeler `createMarexcode({...deps})` dans le bootstrap (mêmes deps que createChat +
`streamModelWithTools`, `MAREXCODE_TOOLS`, `MODELS`, `hasProviderKey`, `getModelEditeur`,
`Auth`, `effectiveSystemPrompt`) et stocker `window._marexcode = factory`.

- [ ] **Step 6:** Terser dans `Dockerfile`

`RUN terser .../features/marexcode.js -o ... -c -m --comments false --module`

- [ ] **Step 7:** Lancer le test structurel → PASS + commit

### Task 8: Activation bouton sidebar

**Files:**
- Modify: `static/js/core/app.js`
- Modify: `static/css/components/storage.css`

- [ ] **Step 1:** Modifier le handler `app.js:395-403`

```javascript
document.querySelectorAll(".dev-module-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    if (btn.dataset.module === "marexcode") {
      if (window._marexcode) {
        if (window._marexcode.isOpen()) window._marexcode.close();
        else window._marexcode.open();
      }
      return;
    }
    const toast = document.getElementById("dev-toast");
    if (toast) { toast.style.display = ""; ... /* toast existant */ }
  });
});
```

Et fermer la vue depuis le topbar : `#marex-back-btn` → `window._marexcode.close()`.

- [ ] **Step 2:** Dés-griser le bouton Marexcode dans `storage.css`

```css
.dev-module-btn[data-module="marexcode"] { opacity: 1; border-style: solid; color: var(--text); }
```

- [ ] **Step 3:** Commit

---

## Phase 3 — Agent intégré

### Task 9: Trajectoire outils visible

**Files:**
- Modify: `static/js/integrations/tool-search.js`

- [ ] **Step 1:** Dans `_execMarexcodeTool`, émettre l'événement avant/après

```javascript
window.dispatchEvent(new CustomEvent("marexcode-tool", {
  detail: { name: name, args: args, result: null, phase: "start" },
}));
// ... après le fetch:
window.dispatchEvent(new CustomEvent("marexcode-tool", {
  detail: { name: name, args: args, result: data, phase: "end" },
}));
```

- [ ] **Step 2:** Dans `marexcode.js`, écouter et rendre dans le log

```javascript
window.addEventListener("marexcode-tool", (e) => {
  if (!document.body.classList.contains("marexcode-mode")) return;
  if (e.detail.phase === "end") addTool(e.detail.name, e.detail.args, e.detail.result);
});
```

- [ ] **Step 3:** Commit

### Task 10: Itérations configurables

**Files:**
- Modify: `static/js/integrations/tool-search.js`
- Modify: `static/js/features/marexcode.js`

- [ ] **Step 1:** `tool-search.js`

`var TOOL_SEARCH_MAX_ITERATIONS=3;` → `var TOOL_SEARCH_MAX_ITERATIONS = window._toolMaxIterations || 3;`
(lu au chargement ; le module pose `window._toolMaxIterations = 10` dans `open()`).

- [ ] **Step 2:** `marexcode.js` `open()` :

```javascript
window._toolMaxIterations = 10;
```
et `close()` : `delete window._toolMaxIterations;`

- [ ] **Step 3:** Commit

### Task 11: Loop session persistante

**Files:**
- Modify: `static/js/features/marexcode.js`

- [ ] **Step 1:** Implémenter `saveSession`/`loadSessions`/`loadSession` réels

```javascript
async function saveSession() {
  if (!session.messages.length) return;
  const id = session.id || "s" + Date.now();
  session.id = id;
  session.date = new Date().toISOString();
  const r = await fetch("/api/marexcode/sessions/" + id, {
    method: "PUT", headers: apiHeaders(), body: JSON.stringify(session),
  });
  if (r.ok) loadSessions();
}

async function loadSessions() {
  try {
    const r = await fetch("/api/marexcode/sessions", { headers: apiHeaders() });
    const list = await r.json();
    sessionSel.innerHTML = "";
    sessionsEl.innerHTML = "";
    list.forEach(s => {
      const o = document.createElement("option");
      o.value = s.id; o.textContent = (s.title || s.id) + (s.model ? " — " + s.model : "");
      sessionSel.appendChild(o);
      const d = document.createElement("div");
      d.className = "marex-tree-item"; d.textContent = o.textContent;
      d.addEventListener("click", () => { sessionSel.value = s.id; loadSession(s.id); });
      sessionsEl.appendChild(d);
    });
  } catch (e) { /* ignore */ }
}

async function loadSession(id) {
  try {
    const r = await fetch("/api/marexcode/sessions/" + id, { headers: apiHeaders() });
    const d = await r.json();
    session = d; session.id = id;
    log.innerHTML = ""; renderMessages();
  } catch (e) { /* ignore */ }
}

function renderMessages() {
  log.innerHTML = "";
  (session.messages || []).forEach(m => addMsg(m.role === "user" ? "user" : "assistant", m.content));
}
```

Remplacer le stream : append des chunks dans un élément assistant temporaire, puis
`saveSession()` à la fin.

- [ ] **Step 2:** Commit

---

## Phase 4 — Éditeur + finalisation

### Task 12: Select modèle + tree → éditeur

**Files:**
- Modify: `static/js/features/marexcode.js`

- [ ] **Step 1:** Appliquer le modèle sélectionné à l'envoi (déjà couvert) + persister
  `session.model` à `modelSel.change` + au send.

- [ ] **Step 2:** Commit (petit)

### Task 13: Docs + vérif finale

**Files:**
- Modify: `Docs/TAF/integration-marexcode.md`
- Modify: `index.md`

- [ ] **Step 1:** Mettre à jour `Docs/TAF/integration-marexcode.md` : ajouter section
  "Module complet (vue plein écran)" — endpoints, module JS, activation.

- [ ] **Step 2:** Mettre à jour `index.md` : cartographie (bouton sidebar, module,
  endpoints `/api/marexcode/*`).

- [ ] **Step 3:** Vérification finale

```bash
python3 -m pytest server/tests -q
node --test static/tests/
node static/tests/validate-pools.mjs
node -c static/js/features/marexcode.js
```

- [ ] **Step 4:** Commit final

---

## Vérification finale (qualité)

```bash
# Backend
python3 -m pytest server/tests/test_exec.py server/tests/test_marexcode.py -v
# Frontend structure
node --test static/tests/marexcode-structure.test.mjs
node --test static/tests/static-paths.test.mjs
# Pools ↔ catalogue
node static/tests/validate-pools.mjs
# Build Docker
docker compose build cetas && docker compose up -d
curl -s http://localhost:8901/api/health
```

## Hors périmètre (proposé plus tard)

- Sous-agents parallèles (DeepSeek Harness multi-agent)
- Sandbox réseau sortant contrôlé
- Portage du CLI `Marexcode.tar.gz` (moteur TS/Ink standalone)
- Édition manuelle des fichiers (éditeur actuellement lecture seule)
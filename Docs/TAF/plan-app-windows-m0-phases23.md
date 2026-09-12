# Plan — App Windows Cetas : M0 + Phases 2/3

> **For agentic workers:** implémentation task par task, TDD obligatoire (test qui échoue d'abord). Steps en checkbox.

**Goal:** Backend local autonome (statique + SSI + workspace local + Bash réel) et alignement OpenCode des sorties outils + permissions granulaires.

**Architecture:** serveur Python stdlib intact ; additions purement additives (nginx web mode intact) ; configs lues à l'appel (évite l'ordre d'import pytest).

**Tech Stack:** Python stdlib (`http.server`), ES modules frontend, pytest (backend), node --test (frontend).

**Spec:** `Docs/TAF/plan-app-windows-cetas.md` (M0 + Phases 2/3). Décisions actées : scope M0 + Phases 2/3 ; coquille pywebview (M2) ; vault local ; données locales ; installer + portable (M4) ; Marexcode local = dossier poste, Bash complet.

## Contraintes globales

- Pas de nouvelle dépendance backend (stdlib only) ; frontend ES modules, pas de nouvelle lib.
- Configs backend lues **lazily** (fonction par env) pour testabilité sans collision d'import pytest.
- Chaînes UI en français (convention repo) ; backward-compat du localStorage `marex-permission`.
- Le mode web (nginx) ne doit pas changer : server.py ne reçoit que `/api/` derrière nginx.
- Pas de commit fait par les agents ; vérification finale + commits gérés par le coordinateur.

---

## Task M0.1 — Static serving + SSI dans server.py

**Files**
- Modify : `server/server.py` (ajout `import re` ; consts après BASE_DIR ~53 ; `_ssi_render`, `_static_dir`, `_static_content_type`, `_serve_static` ; hook dans `_handle_get` ligne 1138)
- Test : Create `server/tests/test_static_serving.py`

**Code — ajouter (après BASE_DIR)**

```python
_SSI_RE = re.compile(r'<!--#include\s+file="([^"]+)"\s*-->')
STATIC_MIME = {
    ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8",
    ".js": "application/javascript; charset=utf-8", ".mjs": "application/javascript; charset=utf-8",
    ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png",
    ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".gif": "image/gif", ".ico": "image/x-icon",
    ".webp": "image/webp", ".woff2": "font/woff2", ".txt": "text/plain; charset=utf-8",
}

def _static_dir() -> str:
    return os.environ.get("CETAS_STATIC_DIR", os.path.join(BASE_DIR, "static"))

def _static_content_type(path: str) -> str:
    return STATIC_MIME.get(os.path.splitext(path)[1].lower(), "application/octet-stream")

def _ssi_render(rel_path: str, _depth: int = 0) -> str:
    """Assemble les directives <!--#include file="...">, relatives au fichier courant."""
    if _depth > 10:
        return ""
    root = os.path.realpath(_static_dir())
    full = os.path.realpath(os.path.join(root, rel_path))
    if not (full == root or full.startswith(root + os.sep)):
        return ""
    try:
        with open(full, "r", encoding="utf-8") as f:
            content = f.read()
    except OSError:
        return ""
    def _sub(m):
        inc = m.group(1)
        inc_rel = os.path.normpath(os.path.join(os.path.dirname(rel_path), inc))
        if inc_rel.startswith(".."):
            return ""
        return _ssi_render(inc_rel, _depth + 1)
    return _SSI_RE.sub(_sub, content)
```

**Code — méthode sur ProxyHandler**

```python
def _serve_static(self) -> bool:
    path = urlparse(self.path).path
    if path.startswith("/api/"):
        return False
    rel = path.lstrip("/")
    if path == "/marexcode/" or rel == "" or path.endswith("/"):
        rel = (rel or "") + "index.html"
    norm = os.path.normpath(rel)
    if norm.startswith(".."):
        return False
    root = os.path.realpath(_static_dir())
    full = os.path.realpath(os.path.join(root, norm))
    if not (full == root or full.startswith(root + os.sep)):
        return False
    if not os.path.isfile(full):
        norm = "index.html"
        full = os.path.join(root, norm)
    try:
        if norm.endswith(".html"):
            data = _ssi_render(norm).encode("utf-8")
        else:
            with open(full, "rb") as f:
                data = f.read()
    except OSError:
        return False
    self.send_response(200)
    self.send_header("Content-Type", _static_content_type(norm))
    self.send_header("Content-Length", str(len(data)))
    self.send_header("Cache-Control", "no-cache")
    self.end_headers()
    if self._write_body:
        self.wfile.write(data)
    return True
```

**Hook** — dans `_handle_get`, avant le 404 final (1138) :
```python
        if self._serve_static():
            return
        self.send_response(404)
```

**Test** (`server/tests/test_static_serving.py`) — env défini dans le test via monkeypatch (lazy) :
```python
import pytest
from pathlib import Path

def _mk_static(tmp_path):
    (tmp_path / "partials").mkdir()
    (tmp_path / "index.html").write_text('<html><!--#include file="partials/head.html" --></html>')
    (tmp_path / "partials" / "head.html").write_text("<head><title>T</title></head>")
    (tmp_path / "js").mkdir()
    (tmp_path / "js" / "app.js").write_text("var x=1;")
    (tmp_path / ".secret").write_text("s")
    return tmp_path

def test_ssi_assemble(monkeypatch, tmp_path):
    monkeypatch.setenv("CETAS_STATIC_DIR", str(_mk_static(tmp_path)))
    from server import _ssi_render
    out = _ssi_render("index.html")
    assert "<head><title>T</title></head>" in out
    assert "#include" not in out

def test_ssi_traversal_bloque(monkeypatch, tmp_path):
    monkeypatch.setenv("CETAS_STATIC_DIR", str(_mk_static(tmp_path)))
    from server import _ssi_render
    assert _ssi_render("partials/head.html") == "<head><title>T</title></head>"
    (tmp_path / "bad.html").write_text('<!--#include file="../.secret" -->')
    assert _ssi_render("bad.html") == ""

def test_content_type():
    from server import _static_content_type
    assert _static_content_type("a.mjs") == "application/javascript; charset=utf-8"
```

Runs : `python -m pytest server/tests/test_static_serving.py -q`.

---

## Task M0.2 — Workspace local + Bash complet (CETAS_PROJECT_DIR actif)

`EXEC_SANDBOX` (marexcode.py:39) est du code mort — on l'active. Configs lazy.

**Files** : Modify `server/marexcode.py` (`_exec_sandbox()`, `_local_bash()`, `marex_server_project_root` ligne 110, `_exec_bash` ligne 171). Test : Create `server/tests/test_local_mode.py`.

```python
def _exec_sandbox() -> str:
    return os.environ.get("CETAS_PROJECT_DIR", DATA_DIR)

def _local_bash() -> bool:
    return os.environ.get("CETAS_LOCAL_MODE", "") == "1"
```

Dans `marex_server_project_root`, au début :
```python
    sandbox = _exec_sandbox()
    if sandbox != DATA_DIR:
        os.makedirs(sandbox, exist_ok=True)
        return sandbox
    # ...logique per-user existante inchangée...
```

Dans `_exec_bash`, en tête de corps :
```python
    root = self._exec_root() or "."
    if _local_bash():
        t = min(timeout or EXEC_TIMEOUT, 60)
        bash_path = os.environ.get("CETAS_BASH_PATH")
        try:
            if bash_path:
                proc = subprocess.run([bash_path, "-c", command], cwd=root,
                                      capture_output=True, text=True, timeout=t)
            else:
                proc = subprocess.run(command, shell=True, cwd=root,
                                      capture_output=True, text=True, timeout=t)
        except subprocess.TimeoutExpired:
            return {"error": "Commande expirée après %ss" % t, "code": 124, "timed_out": True}
        return {"stdout": (proc.stdout or "")[:EXEC_MAX_OUTPUT],
                "stderr": (proc.stderr or "")[:EXEC_MAX_OUTPUT],
                "code": proc.returncode, "timeout_used": False}
    # ...chemin whitelist existant inchangé (mode web)...
```

Note : sur Windows `shell=True` = cmd.exe ; le vrai Bash desktop vient via `CETAS_BASH_PATH` (Git Bash) à M2.

**Test** (`server/tests/test_local_mode.py`, env lazy donc pas d'ordre d'import) :
```python
import pytest

def test_project_root_override(monkeypatch, tmp_path):
    monkeypatch.setenv("CETAS_PROJECT_DIR", str(tmp_path))
    from server import marexcode as m
    assert m.marex_project_root("u") == str(tmp_path)

def test_bash_complet_off(monkeypatch, tmp_path):
    monkeypatch.setenv("CETAS_PROJECT_DIR", str(tmp_path))
    monkeypatch.setenv("CETAS_LOCAL_MODE", "1")
    from server import marexcode as m
    h = object.__new__(m.MarexcodeMixin)
    h._marex_root = str(tmp_path)
    r = h._exec_bash("echo hi && echo bye")
    assert r["code"] == 0 and "hi" in r["stdout"] and "bye" in r["stdout"]
```

---

## Task M0.3 — Portabilité Windows (crypto + chemins)

**Files** : Modify `server/server.py` (`_crypto_path()`, utilisé par `_load_vault` ligne 384) ; Modify `server/marexcode.py` (`_resolve_safe_path` ligne 156).

```python
def _crypto_path() -> str:
    override = os.environ.get("CETAS_CRYPTO_PATH")
    if override:
        return override
    sub = "win" if os.name == "nt" else "linux"
    return os.path.join(BASE_DIR, "core", sub, "crypto_%s.py" % sub)
```
`_load_vault` : remplacer la référence `CRYPTO_PATH` (ligne 56) par `_crypto_path()`.

`_resolve_safe_path` : normaliser les backslashes avant join (comme l'upload, ligne 642) :
```python
        rel = str(rel_path or "").replace("\\", "/")
```

**Test** : dans `server/tests/test_local_mode.py` :
```python
def test_crypto_path_windows(monkeypatch):
    monkeypatch.setattr("os.name", "nt")
    from server import _crypto_path
    assert "core" in _crypto_path() and "win" in _crypto_path()

def test_crypto_path_linux(monkeypatch):
    monkeypatch.setattr("os.name", "posix")
    from server import _crypto_path
    assert "linux" in _crypto_path()

def test_resolve_safe_path_win_backslash(monkeypatch, tmp_path):
    monkeypatch.setenv("CETAS_PROJECT_DIR", str(tmp_path))
    from server import marexcode as m
    h = object.__new__(m.MarexcodeMixin)
    h._marex_root = str(tmp_path)
    assert h._resolve_safe_path("..\\secret") is None
```

---

## Task P2.1 — `format_tool_output` (backend, façon OpenCode)

**Files** : Modify `server/marexcode.py` (fonction module + appel dans `_exec_tool` ligne 368). Test : Create `server/tests/test_format_tool_output.py`.

```python
def format_tool_output(tool: str, args: dict, result: dict) -> str:
    if tool == "read":
        out = "Read %s lines from %s" % (result.get("lines_read", 0), args.get("file_path", "?"))
        if result.get("offset") is not None:
            out += " (offset %s, limit %s)" % (result["offset"], result.get("limit", "all"))
        return out
    if tool == "edit":
        parts = ["Edited file successfully: %s" % result.get("path", args.get("file_path", "?")),
                 "Replacements: %s" % result.get("replacements", 0),
                 "Additions: %s" % result.get("additions", 0),
                 "Deletions: %s" % result.get("deletions", 0)]
        if result.get("patch"):
            parts.append("```diff\n%s\n```" % result["patch"])
        return "\n".join(parts)
    if tool == "write":
        verb = "Wrote" if result.get("existed") else "Created"
        return "%s file: %s" % (verb, result.get("path", args.get("file_path", "?")))
    if tool == "bash":
        out = "Command exited with code %s" % result.get("code", 0)
        if result.get("stdout"):
            out += "\n" + result["stdout"]
        if result.get("stderr"):
            out += "\nstderr:\n" + result["stderr"]
        return out
    if tool == "grep":
        return "Found %s matches\n%s" % (result.get("matches", 0), result.get("stdout", ""))
    if tool == "ls":
        files = result.get("files", [])
        lines = ["Found %s files" % len(files)] + [e.get("path", "") for e in files]
        return "\n".join(lines)
    return ""
```

Dans `_exec_tool`, ligne 368 (chemin succès) :
```python
        result["tool"] = tool
        result["text"] = format_tool_output(tool, args, result)
```
(les champs bruts restent — l'UI en a besoin.)

**Test** (`server/tests/test_format_tool_output.py`) :
```python
def test_read():
    from server.marexcode import format_tool_output
    assert format_tool_output("read", {"file_path": "src/a.py"}, {"lines_read": 42, "total_lines": 100}) \
        == "Read 42 lines from src/a.py"

def test_read_pagination():
    from server.marexcode import format_tool_output
    assert format_tool_output("read", {"file_path": "a.py"}, {"lines_read": 10, "offset": 5, "limit": 10}) \
        == "Read 10 lines from a.py (offset 5, limit 10)"

def test_edit():
    from server.marexcode import format_tool_output
    r = {"path": "a.py", "replacements": 1, "additions": 2, "deletions": 1, "patch": "-x\n+y"}
    out = format_tool_output("edit", {"file_path": "a.py"}, r)
    assert out.startswith("Edited file successfully: a.py")
    assert "Replacements: 1" in out
    assert "```diff" in out and "-x" in out

def test_write_created_vs_wrote():
    from server.marexcode import format_tool_output
    assert format_tool_output("write", {}, {"ok": True, "path": "f.txt", "existed": False}) == "Created file: f.txt"
    assert format_tool_output("write", {}, {"ok": True, "path": "f.txt", "existed": True}) == "Wrote file: f.txt"

def test_bash():
    from server.marexcode import format_tool_output
    assert format_tool_output("bash", {}, {"stdout": "out", "code": 1}) == "Command exited with code 1\nout"

def test_bash_stderr():
    from server.marexcode import format_tool_output
    out = format_tool_output("bash", {}, {"stdout": "out", "stderr": "err", "code": 2})
    assert out == "Command exited with code 2\nout\nstderr:\nerr"

def test_grep():
    from server.marexcode import format_tool_output
    assert format_tool_output("grep", {}, {"matches": 3, "stdout": "a.py:1: x"}) == "Found 3 matches\na.py:1: x"

def test_ls():
    from server.marexcode import format_tool_output
    assert format_tool_output("ls", {}, {"files": [{"path": "a.py"}, {"path": "b.py"}]}) == "Found 2 files\na.py\nb.py"
```

---

## Task P2.2 — Frontend : le modèle reçoit `data.text`

**Files** : Modify `static/js/integrations/tool-search.js` ligne 51 ; Modify `static/js/tests/marexcode-structure.test.mjs`.

Ligne 51 devient :
```js
    return { id: e.id, name: name, result: (data && data.text) ? data.text : data };
```
(Les events `marexcode-tool` gardent `data` complet → UI intacte ; la boucle agentique minifiée ligne 1 passe déjà les strings telles quelles.)

**Test** (structure test, ajout à la fin de `static/js/tests/marexcode-structure.test.mjs`) :
```js
test('tool-search.js : contenu modèle = data.text (format concis)', () => {
    const src = readFileSync(resolve(ROOT, 'js/integrations/tool-search.js'), 'utf8');
    assert.match(src, /result:\s*\(data\s*&&\s*data\.text\)/);
});
```

---

## Task P3.1 — Permissions granulaires (marex-permission.js)

**Files** : Modify `static/marexcode/js/marex-permission.js` (réécriture) ; Create `static/js/tests/marex-permission.test.mjs`.

Modèle : règle par outil (`allow`/`ask`/`deny`), stockage `marex-permission-rules` (JSON), backward-compat : l'ancien `marex-permission` devient les defaults.

```js
const TOOLS = ['read', 'grep', 'ls', 'write', 'edit', 'bash'];
const RULES = ['allow', 'ask', 'deny'];
const LEGACY_DEFAULT = 'Espace Write';

function legacyToDefaults(permission) {
    if (permission === 'Read only')
        return { read: 'allow', grep: 'allow', ls: 'allow', write: 'deny', edit: 'deny', bash: 'deny' };
    if (permission === 'Ask permission')
        return { read: 'allow', grep: 'allow', ls: 'allow', write: 'ask', edit: 'ask', bash: 'ask' };
    return { read: 'allow', grep: 'allow', ls: 'allow', write: 'allow', edit: 'allow', bash: 'allow' };
}

export function getRules() {
    try {
        const raw = localStorage.getItem('marex-permission-rules');
        if (raw) {
            const parsed = JSON.parse(raw);
            const base = legacyToDefaults(getPermission());
            const merged = {};
            for (const t of TOOLS) merged[t] = RULES.includes(parsed[t]) ? parsed[t] : base[t];
            return merged;
        }
    } catch (e) {}
    return legacyToDefaults(getPermission());
}

export function getRule(tool) {
    const t = String(tool || '').toLowerCase();
    return getRules()[t] || 'allow';
}

export function setRule(tool, rule) {
    const t = String(tool || '').toLowerCase();
    if (!TOOLS.includes(t) || !RULES.includes(rule)) return;
    const rules = getRules();
    rules[t] = rule;
    try { localStorage.setItem('marex-permission-rules', JSON.stringify(rules)); } catch (e) {}
}

export function decidePermission(toolNameRaw, rule) {
    if (rule === 'deny')
        return { allowed: false, reason: "Action bloquée : l'outil « " + String(toolNameRaw) + " » n'est pas autorisé." };
    if (rule === 'ask') return null;
    return { allowed: true };
}

export function checkToolPermission(toolNameRaw, args) {
    const toolName = String(toolNameRaw || '').toLowerCase();
    const decision = decidePermission(toolName, getRule(toolName));
    if (decision) return decision;
    const ok = window.confirm('Marexcode veut effectuer cette action :\n\n' + describeAction(toolName, args) + '\n\nAutoriser ?');
    if (!ok) return { allowed: false, reason: "Action refusée par l'utilisateur." };
    return { allowed: true };
}
```
(`getPermission`/`setPermission`/`describeAction` conservés tels quels — `describeAction` toujours utilisé.)

**Test** (`static/js/tests/marex-permission.test.mjs`) :
```js
import { test } from 'node:test';
import assert from 'node:assert';
const store = {};
globalThis.localStorage = {
    getItem: k => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
};
globalThis.window = { confirm: () => true };
const m = await import('../../marexcode/js/marex-permission.js');

test('defaut Espace Write : write allow', () => {
    assert.equal(m.getRule('write'), 'allow');
    assert.ok(m.decidePermission('write', 'allow').allowed);
});
test('setRule + decide deny', () => {
    m.setRule('bash', 'deny');
    assert.equal(m.decidePermission('bash', 'deny').allowed, false);
});
test('ask demande confirmation (confirm true => allowed)', () => {
    m.setRule('write', 'ask');
    assert.ok(m.checkToolPermission('Write', { file_path: 'x' }).allowed);
});
test('read toujours configurable', () => {
    m.setRule('read', 'deny');
    assert.equal(m.decidePermission('read', 'deny').allowed, false);
});
```

---

## Task P3.2 — UI permissions par outil

**Files** : Modify `static/marexcode/components/composer.html` (dans `menu-permission`, après les 3 items globaux) ; Modify `static/marexcode/js/app.js` (`setupPermissionSelector` ligne 104) ; Modify `static/marexcode/css/marexcode.css` ; Modify `static/js/tests/marexcode-structure.test.mjs`.

composer.html — section ajoutée dans `#menu-permission`, après les 3 items globaux :
```html
<div class="cdrop-section-label">Par outil</div>
<div class="tool-perms">
  <label class="tool-perm-row"><span>Read</span><select class="tool-perm-select" data-tool="read">
    <option value="allow">Autoriser</option><option value="ask">Demander</option><option value="deny">Bloquer</option></select></label>
  <label class="tool-perm-row"><span>Grep</span><select class="tool-perm-select" data-tool="grep">
    <option value="allow">Autoriser</option><option value="ask">Demander</option><option value="deny">Bloquer</option></select></label>
  <label class="tool-perm-row"><span>Ls</span><select class="tool-perm-select" data-tool="ls">
    <option value="allow">Autoriser</option><option value="ask">Demander</option><option value="deny">Bloquer</option></select></label>
  <label class="tool-perm-row"><span>Write</span><select class="tool-perm-select" data-tool="write">
    <option value="allow">Autoriser</option><option value="ask">Demander</option><option value="deny">Bloquer</option></select></label>
  <label class="tool-perm-row"><span>Edit</span><select class="tool-perm-select" data-tool="edit">
    <option value="allow">Autoriser</option><option value="ask">Demander</option><option value="deny">Bloquer</option></select></label>
  <label class="tool-perm-row"><span>Bash</span><select class="tool-perm-select" data-tool="bash">
    <option value="allow">Autoriser</option><option value="ask">Demander</option><option value="deny">Bloquer</option></select></label>
</div>
```

app.js — dans `setupPermissionSelector()` (après le câblage global existant) :
```js
    const selects = refs.menuPermission.querySelectorAll('select[data-tool]');
    selects.forEach(sel => {
        sel.value = getRule(sel.getAttribute('data-tool'));
        sel.addEventListener('change', () => setRule(sel.getAttribute('data-tool'), sel.value));
    });
```
Vérifier que `getRule`/`setRule` sont importés dans app.js (ajouter à l'import existant).

css/marexcode.css :
```css
.tool-perms { padding: 6px 10px 10px; display: grid; gap: 6px; }
.tool-perm-row { display: flex; justify-content: space-between; align-items: center; gap: 10px; font-size: 13px; }
.tool-perm-select { background: var(--bg-input, #1a1d23); color: inherit; border: 1px solid rgba(255,255,255,.12); border-radius: 6px; padding: 3px 6px; }
```

**Test** (structure test, ajout dans `static/js/tests/marexcode-structure.test.mjs`) :
```js
test('composer.html : sélecteurs par outil (6)', () => {
    const html = read('components/composer.html');
    for (const t of ['read', 'grep', 'ls', 'write', 'edit', 'bash']) {
        assert.match(html, new RegExp('data-tool="' + t + '"'));
    }
});
test('app.js : câblage setRule par outil', () => {
    const src = readFileSync(resolve(MX, 'js/app.js'), 'utf8');
    assert.match(src, /setRule\(sel\.getAttribute\('data-tool'\)/);
});
```

---

## Task V — Vérification globale

1. `python -m pytest server/tests/ -q` → tout vert (anciens + nouveaux).
2. `node --test static/js/tests/` → tout vert.
3. E2E M0 (browser local) :
   ```bash
   CETAS_BASE_DIR=/home/sam/Cetas-WebUi \
   CETAS_DATA_DIR=/tmp/cetas-local/data \
   CETAS_PROJECT_DIR=/tmp/cetas-local/workspace \
   CETAS_VAULT_PASSWORD=$(grep CETAS_VAULT_PASSWORD /home/sam/Cetas-WebUi/.env.docker | cut -d= -f2) \
   python server/server.py
   ```
   Puis : `curl -s localhost:8080/ | grep -c "#include"` → 0 (SSI assemblé) ; `curl -s localhost:8080/marexcode/ | grep -c "#include"` → 0 ; `curl -sI localhost:8080/js/core/api.js` → 200 + bon Content-Type ; `/api/health` → `{"status":"ok"}` ; navigateur : chat + Marexcode tools sur le dossier local.

**Séquençage** : P2.1 → P2.2 → P3.1 → P3.2 → M0.1 → M0.2 → M0.3 → V (Phases d'abord = bénéfice web immédiat, puis base desktop). Chaque task = cycle test → implé → test → commit.

**Hors scope (M2-M6)** : coquille pywebview, vault local, packaging Inno/portable, sync — plan séparé à venir.
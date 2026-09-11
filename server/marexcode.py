#!/usr/bin/env python3
"""
Marexcode Backend — © Marexsoft Corporation. Fondateur Kouassi Marius.

Backend complet du module Marexcode (assistant de codage intégré à Cetas) :
sandbox d'exécution d'outils (Bash/Read/Write/Edit/Grep), arborescence du
workspace et sessions persistantes par utilisateur.

Ce module expose un mixin (`MarexcodeMixin`) hérité par `ProxyHandler`
(server.py). Toutes les méthodes portent sur `self` (le handler HTTP), ce qui
donne accès à l'auth JWT, à `_respond_json`, aux headers/body de la requête.

Routes couvertes :
  - POST   /api/exec                         → outils sandbox
  - GET    /api/marexcode/tree               → arborescence workspace
  - GET    /api/marexcode/sessions           → liste des sessions
  - GET    /api/marexcode/sessions/{id}      → session complète
  - PUT    /api/marexcode/sessions/{id}      → sauvegarder une session
  - DELETE /api/marexcode/sessions/{id}      → supprimer une session
  - GET    /api/marexcode/project            → projet actif + liste
  - PUT    /api/marexcode/project            → change le projet actif
  - POST   /api/marexcode/upload             → importe un dossier (multipart)

Sécurité : auth JWT obligatoire, sandbox par utilisateur (blocage `../` +
symlinks), whitelist de commandes, interdits anti-bypass, timeout, output
plafonné, rate-limit par utilisateur.
"""

import os
import json
import logging
import subprocess
import fnmatch

try:
    from .lsp import LSPManager
except ImportError:
    from lsp import LSPManager

try:
    from .mcp import MCPManager
except ImportError:
    try:
        from mcp_client import MCPManager
    except ImportError:
        from mcp import MCPManager

log = logging.getLogger(__name__)

DATA_DIR = os.environ.get("CETAS_DATA_DIR", "/app/data")

# ── Sandbox d'exécution (outils Bash + fichiers) ───────────────────────
EXEC_SANDBOX = os.environ.get("CETAS_PROJECT_DIR", DATA_DIR)
EXEC_ALLOWLIST = {
    "ls", "cat", "grep", "git", "node", "python3", "python", "npm", "npx",
    "head", "tail", "wc", "find", "sed", "awk", "echo", "printf", "mkdir",
    "touch", "rm", "cp", "mv", "pwd", "date", "whoami", "basename", "dirname",
}
# Commandes interdites (contournement de whitelist / élévation de privilèges)
EXEC_BANNED_TOKENS = {"sudo", "su", "bash", "sh", "zsh", "curl", "wget"}
# Interdits car exécution de code arbitraire malgré la whitelist du binaire
EXEC_BANNED_FLAGS = {"-c", "--eval", "-e"}
EXEC_TIMEOUT = int(os.environ.get("CETAS_EXEC_TIMEOUT", "10"))
EXEC_MAX_OUTPUT = int(os.environ.get("CETAS_EXEC_MAX_OUTPUT", "200000"))


def _exec_sandbox() -> str:
    return os.environ.get("CETAS_PROJECT_DIR", DATA_DIR)


def _local_bash() -> bool:
    return os.environ.get("CETAS_LOCAL_MODE", "") == "1"


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
    if tool == "glob":
        files = result.get("files", [])
        if not files:
            return "No files matching pattern: %s" % result.get("pattern", "?")
        lines = ["Found %s files matching '%s'" % (len(files), result.get("pattern", "?"))] + [e.get("path", "") for e in files]
        return "\n".join(lines)
    return ""

# ── Upload de projet (dossier importé depuis le navigateur) ────────────
UPLOAD_MAX_FILES = int(os.environ.get("CETAS_UPLOAD_MAX_FILES", "1000"))
UPLOAD_MAX_TOTAL_BYTES = int(os.environ.get("CETAS_UPLOAD_MAX_BYTES", str(150 * 1024 * 1024)))  # 150 Mo
UPLOADED_PROJECT_DIRNAME = "uploaded_project"
SERVER_PROJECT_DIRNAME = "server_project"
WORKSPACES_DIRNAME = "workspaces"
PROJECT_SERVER = "Marexcode (serveur)"
PROJECT_UPLOADED = "Projet importé"

# Entrées techniques à la racine du workspace utilisateur, jamais migrées
# vers server_project/ (métadonnées internes, pas du code utilisateur).
_WORKSPACE_RESERVED_ENTRIES = {"sessions", "active_project.json", UPLOADED_PROJECT_DIRNAME, SERVER_PROJECT_DIRNAME, WORKSPACES_DIRNAME}


def marex_workspace(username: str) -> str:
    """Répertoire de travail Marexcode d'un utilisateur (sandbox dédiée)."""
    safe = username.replace("/", "_").replace("\\", "_").strip() or "anon"
    d = os.path.join(DATA_DIR, "marexcode", safe)
    os.makedirs(d, exist_ok=True)
    return d


def marex_sessions_dir(username: str) -> str:
    """Répertoire des sessions Marexcode d'un utilisateur."""
    safe = username.replace("/", "_").replace("\\", "_").strip() or "anon"
    return os.path.join(DATA_DIR, "marexcode", safe, "sessions")


def marex_active_project_path(username: str) -> str:
    """Fichier stockant le nom du projet actif (serveur / importé) d'un utilisateur."""
    return os.path.join(marex_workspace(username), "active_project.json")


def marex_get_active_project(username: str) -> str:
    """Lit le projet actif ; par défaut le workspace serveur."""
    path = marex_active_project_path(username)
    try:
        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f)
        name = data.get("active")
        if name in (PROJECT_SERVER, PROJECT_UPLOADED):
            return name
    except Exception:
        pass
    return PROJECT_SERVER


def marex_set_active_project(username: str, name: str) -> bool:
    if name not in (PROJECT_SERVER, PROJECT_UPLOADED):
        return False
    path = marex_active_project_path(username)
    try:
        with open(path, "w", encoding="utf-8") as f:
            json.dump({"active": name}, f)
    except Exception:
        return False
    return True


# ── Multi-workspaces ──────────────────────────────────────────────────

def marex_workspaces_dir(username: str) -> str:
    """Répertoire contenant tous les workspaces d'un utilisateur."""
    d = os.path.join(marex_workspace(username), WORKSPACES_DIRNAME)
    os.makedirs(d, exist_ok=True)
    return d


def marex_workspace_dir(username: str, workspace_id: str) -> str:
    """Chemin d'un workspace spécifique."""
    return os.path.join(marex_workspaces_dir(username), workspace_id)


def marex_workspace_meta_path(username: str, workspace_id: str) -> str:
    """Chemin vers meta.json d'un workspace."""
    return os.path.join(marex_workspace_dir(username, workspace_id), "meta.json")


def marex_load_workspace_meta(username: str, workspace_id: str) -> dict:
    """Charge les métadonnées d'un workspace."""
    path = marex_workspace_meta_path(username, workspace_id)
    try:
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return {"id": workspace_id, "name": workspace_id, "created": "", "active": False}


def marex_save_workspace_meta(username: str, workspace_id: str, meta: dict):
    """Sauvegarde les métadonnées d'un workspace."""
    path = marex_workspace_meta_path(username, workspace_id)
    try:
        with open(path, "w", encoding="utf-8") as f:
            json.dump(meta, f, indent=2, ensure_ascii=False)
    except Exception:
        pass


def marex_get_active_workspace(username: str) -> str | None:
    """Retourne l'ID du workspace actif, ou None."""
    path = os.path.join(marex_workspaces_dir(username), "active.json")
    try:
        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f)
        return data.get("id")
    except Exception:
        return None


def marex_set_active_workspace(username: str, workspace_id: str | None):
    """Définit le workspace actif."""
    path = os.path.join(marex_workspaces_dir(username), "active.json")
    try:
        with open(path, "w", encoding="utf-8") as f:
            json.dump({"id": workspace_id}, f)
    except Exception:
        pass


def marex_workspace_instructions_path(username: str, workspace_id: str) -> str:
    """Chemin vers le fichier d'instructions d'un workspace."""
    return os.path.join(marex_workspace_dir(username, workspace_id), "MAREXCODE.md")


def marex_global_instructions_path(username: str) -> str:
    """Chemin vers les instructions globales d'un utilisateur."""
    return os.path.join(marex_workspace(username), "global_instructions.md")


MAREXCODE_INSTRUCTIONS_TEMPLATE = """# Instructions du projet

<!-- Décris ici le contexte du projet, les conventions de code, les contraintes -->
<!-- L'agent lit ce fichier au début de chaque session sur ce workspace -->
"""


def marex_server_project_root(username: str) -> str:
    """Racine isolée du projet 'Marexcode (serveur)', distincte de sessions/
    et des métadonnées internes. Migre automatiquement une seule fois les
    fichiers qui traînaient historiquement à la racine du workspace."""
    sandbox = _exec_sandbox()
    if sandbox != DATA_DIR:
        os.makedirs(sandbox, exist_ok=True)
        return sandbox
    base = marex_workspace(username)
    target = os.path.join(base, SERVER_PROJECT_DIRNAME)
    if not os.path.isdir(target):
        os.makedirs(target, exist_ok=True)
        try:
            for entry in os.listdir(base):
                if entry in _WORKSPACE_RESERVED_ENTRIES or entry.startswith("."):
                    continue
                src = os.path.join(base, entry)
                dst = os.path.join(target, entry)
                if not os.path.exists(dst):
                    os.rename(src, dst)
        except Exception:
            log.exception("migration server_project échouée pour user=%s", username)
    return target


def marex_project_root(username: str, project_name: str | None = None) -> str:
    """Racine sandbox effective selon le workspace actif de l'utilisateur.
    Priorité au multi-workspace (workspaces/<id>/) si un workspace actif existe,
    sinon fallback sur l'ancien modèle (serveur / importé)."""
    ws_id = marex_get_active_workspace(username)
    if ws_id:
        d = marex_workspace_dir(username, ws_id)
        os.makedirs(d, exist_ok=True)
        return d
    if project_name is None:
        project_name = marex_get_active_project(username)
    if project_name == PROJECT_UPLOADED:
        base = marex_workspace(username)
        d = os.path.join(base, UPLOADED_PROJECT_DIRNAME)
        os.makedirs(d, exist_ok=True)
        return d
    return marex_server_project_root(username)


class MarexcodeMixin:
    # ── Résolution de chemins sandbox ──────────────────────────────────

    def _exec_root(self) -> str | None:
        """Retourne la racine sandbox définie par l'appelant. Ne JAMAIS fallback
        silencieusement vers EXEC_SANDBOX — si _marex_root n'est pas défini,
        c'est un bug d'appel et il faut échouer explicitement."""
        root = getattr(self, "_marex_root", None)
        if not root:
            log.error("_exec_root() appelé sans _marex_root défini — refus d'exécution")
            return None
        return root

    def _resolve_safe_path(self, rel_path: str) -> str | None:
        """Résout un chemin dans le sandbox, bloque l'échappement (../, symlinks)."""
        rel = str(rel_path or "").replace("\\", "/")
        if not rel:
            return None
        root = self._exec_root()
        if not root:
            return None
        candidate = os.path.realpath(os.path.join(root, rel))
        real_root = os.path.realpath(root)
        if candidate == real_root or candidate.startswith(real_root + os.sep):
            return candidate
        return None

    # ── Outils Bash ────────────────────────────────────────────────────

    def _exec_bash(self, command: str, timeout: int = None) -> dict:
        """Exécute une commande bash whitelistée avec timeout configurable."""
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
        import shlex
        try:
            tokens = shlex.split(command)
        except ValueError as e:
            return {"error": f"Commande invalide: {e}", "code": -1}
        if not tokens:
            return {"error": "Commande vide", "code": -1}
        binary = os.path.basename(tokens[0])
        if binary not in EXEC_ALLOWLIST:
            return {"error": f"Commande non autorisée: {tokens[0]}", "code": 403}
        for tok in tokens:
            if tok in EXEC_BANNED_TOKENS:
                return {"error": f"Commande interdite: {tok}", "code": 403}
        for tok in tokens[1:]:
            if tok in EXEC_BANNED_FLAGS:
                return {"error": f"Flag interdit: {tok}", "code": 403}
        root = self._exec_root()
        if not root:
            return {"error": "Sandbox non initialisée", "code": 500}
        
        # Timeout configurable (défaut EXEC_TIMEOUT, max 60s)
        exec_timeout = min(timeout if timeout else EXEC_TIMEOUT, 60)
        
        try:
            proc = subprocess.run(
                tokens,
                cwd=root,
                capture_output=True,
                text=True,
                timeout=exec_timeout,
            )
        except subprocess.TimeoutExpired:
            return {"error": f"Timeout dépassé ({exec_timeout}s)", "code": 124, "timed_out": True}
        except FileNotFoundError:
            return {"error": f"Binaire introuvable: {binary}", "code": -1}
        except Exception as e:
            return {"error": f"Erreur exécution: {e}", "code": -1}
        out = proc.stdout[:EXEC_MAX_OUTPUT]
        err = proc.stderr[:EXEC_MAX_OUTPUT]
        return {"stdout": out, "stderr": err, "code": proc.returncode, "timeout_used": exec_timeout}

    # ── RunScript (exécution typée python/node, sans shell) ────────────

    def _exec_runscript(self, language: str, code: str, timeout: int = None) -> dict:
        """Exécution typée d'un script python ou node dans le sandbox.

        Contrairement à _exec_bash (whitelist de binaires), cet outil reçoit un
        langage fermé {python, node}, écrit le code dans un fichier temporaire à
        nom aléatoire sous .runscript_tmp/, et le lance via subprocess.run(liste)
        — JAMAIS shell=True. L'environnement du sous-processus est nettoyé :
        seules PATH, HOME (= racine workspace) et LANG sont transmises, aucun
        secret hérité (vault, JWT, worker token). Timeout borné à 60s (défaut 30s),
        stdout/stderr tronqués à EXEC_MAX_OUTPUT, fichier temporaire supprimé dans
        tous les cas (finally).
        """
        import uuid
        root = self._exec_root()
        if not root:
            return {"error": "Sandbox non initialisée", "code": 500}
        lang = (language or "").strip().lower()
        runners = {"python": "python3", "node": "node"}
        if lang not in runners:
            return {"error": f"Unsupported language: {language}", "code": 400}
        ext = "py" if lang == "python" else "js"
        t = min(timeout if timeout else 30, 60)
        tmp_dir = os.path.join(root, ".runscript_tmp")
        try:
            os.makedirs(tmp_dir, exist_ok=True)
        except OSError as e:
            return {"error": f"Préparation sandbox impossible: {e}", "code": 500}
        fpath = os.path.join(tmp_dir, uuid.uuid4().hex + "." + ext)
        try:
            with open(fpath, "w", encoding="utf-8") as f:
                f.write(code or "")
        except OSError as e:
            return {"error": f"Écriture script impossible: {e}", "code": 500}
        safe_env = {
            "PATH": os.environ.get("PATH", "/usr/local/bin:/usr/bin:/bin"),
            "HOME": root,
            "LANG": "C.UTF-8",
        }
        try:
            proc = subprocess.run(
                [runners[lang], fpath],
                cwd=root,
                env=safe_env,
                capture_output=True,
                text=True,
                timeout=t,
            )
        except subprocess.TimeoutExpired:
            return {"error": f"Timeout dépassé ({t}s)", "code": 124, "timed_out": True}
        except FileNotFoundError:
            return {"error": f"Binaire introuvable: {runners[lang]}", "code": -1}
        except Exception as e:
            return {"error": f"Erreur exécution: {e}", "code": -1}
        finally:
            try:
                os.remove(fpath)
            except OSError:
                pass
        return {"stdout": (proc.stdout or "")[:EXEC_MAX_OUTPUT],
                "stderr": (proc.stderr or "")[:EXEC_MAX_OUTPUT],
                "code": proc.returncode,
                "timed_out": False}

    # ── Outils fichiers ────────────────────────────────────────────────

    def _exec_read(self, rel_path: str, offset=None, limit=None) -> dict:
        path = self._resolve_safe_path(rel_path)
        if not path:
            return {"error": "Chemin hors sandbox", "code": 403}
        try:
            with open(path, "r", encoding="utf-8", errors="replace") as f:
                content = f.read()
        except FileNotFoundError:
            return {"error": f"Fichier introuvable: {rel_path}. Utilise Glob pour trouver le bon chemin.", "code": 404}
        except IsADirectoryError:
            return {"error": f"Est un dossier: {rel_path}", "code": 400}
        except Exception as e:
            return {"error": f"Erreur lecture: {e}", "code": -1}
        
        # Pagination
        lines = content.split('\n')
        total_lines = len(lines)
        
        # Convertir offset/limit en int (peuvent arriver comme strings du JSON)
        try:
            offset = int(offset) if offset is not None else None
        except (TypeError, ValueError):
            offset = None
        try:
            limit = int(limit) if limit is not None else None
        except (TypeError, ValueError):
            limit = None

        if offset is not None or limit is not None:
            start = max(0, (offset - 1)) if offset and offset > 0 else 0
            end = (start + limit) if limit else total_lines
            lines_read = lines[start:end]
            content = '\n'.join(lines_read)
            return {
                "content": content[:EXEC_MAX_OUTPUT],
                "lines_read": len(lines_read),
                "total_lines": total_lines,
                "offset": start + 1,
                "limit": limit
            }
        
        return {"content": content[:EXEC_MAX_OUTPUT], "lines_read": total_lines, "total_lines": total_lines}

    # ── Undo/Redo journal ─────────────────────────────────────────────

    def _undo_log_path(self) -> str | None:
        root = self._exec_root()
        return os.path.join(root, "undo_log.json") if root else None

    def _undo_log_load(self) -> dict:
        path = self._undo_log_path()
        if path and os.path.isfile(path):
            try:
                with open(path, "r", encoding="utf-8") as f:
                    return json.load(f)
            except Exception:
                pass
        return {"undo_stack": [], "redo_stack": []}

    def _undo_log_save(self, data: dict):
        path = self._undo_log_path()
        if not path:
            return
        try:
            with open(path, "w", encoding="utf-8") as f:
                json.dump(data, f, ensure_ascii=False)
        except Exception:
            pass

    def _undo_push(self, file: str, old_content, new_content: str):
        data = self._undo_log_load()
        data["undo_stack"].append({
            "file": file,
            "old": old_content,
            "new": new_content,
            "ts": __import__("time").time(),
        })
        if len(data["undo_stack"]) > 50:
            data["undo_stack"] = data["undo_stack"][-50:]
        data["redo_stack"] = []
        self._undo_log_save(data)

    def _exec_undo(self):
        """POST /api/marexcode/undo — annule la dernière opération."""
        username = self._get_authenticated_user()
        if not username:
            return
        self._marex_root = marex_project_root(username)
        data = self._undo_log_load()
        if not data["undo_stack"]:
            self._respond_json({"error": "Rien à annuler"}, 400)
            return
        entry = data["undo_stack"].pop()
        path = self._resolve_safe_path(entry["file"])
        if path:
            try:
                if entry["old"] is None:
                    if os.path.isfile(path):
                        os.remove(path)
                else:
                    with open(path, "w", encoding="utf-8") as f:
                        f.write(entry["old"])
            except Exception as e:
                self._respond_json({"error": "Erreur undo: %s" % e}, 500)
                return
        data["redo_stack"].append(entry)
        self._undo_log_save(data)
        self._respond_json({"ok": True, "file": entry["file"]})

    def _marex_runscript(self):
        """POST /api/marexcode/runscript — exécution typée python/node (mode Auto).
        Body: {"language": "python|node", "code": "...", "timeout?": int}
        Additif : n'affecte pas /api/exec ni la whitelist Bash.
        """
        from server import _rate_check
        username = self._get_authenticated_user()
        if not username:
            return
        if not _rate_check("runscript:" + username, 30, 60):
            self._respond_json({"error": "Trop de requêtes. Réessayez dans une minute."}, 429)
            return
        self._marex_root = marex_project_root(username)
        content_len = int(self.headers.get("Content-Length", 0))
        body = self.rfile.read(content_len) if content_len > 0 else b"{}"
        try:
            data = json.loads(body)
        except json.JSONDecodeError:
            self._respond_json({"error": "JSON invalide"}, 400)
            return
        language = str(data.get("language", ""))
        code = str(data.get("code", ""))
        log.info("runscript lang=%s user=%s", language, username)
        try:
            result = self._exec_runscript(language, code, data.get("timeout"))
        except Exception as e:
            self._respond_json({"error": f"Erreur interne: {e}"}, 500)
            return
        if "error" in result:
            status = result.get("code")
            if not (isinstance(status, int) and 400 <= status < 600):
                status = 500
            self._respond_json({"error": result["error"], "language": language}, status)
            return
        self._respond_json(result)

    def _exec_redo(self):
        """POST /api/marexcode/redo — rétablit la dernière opération annulée."""
        username = self._get_authenticated_user()
        if not username:
            return
        self._marex_root = marex_project_root(username)
        data = self._undo_log_load()
        if not data["redo_stack"]:
            self._respond_json({"error": "Rien à rétablir"}, 400)
            return
        entry = data["redo_stack"].pop()
        path = self._resolve_safe_path(entry["file"])
        if path:
            try:
                parent = os.path.dirname(path)
                if parent and not os.path.exists(parent):
                    os.makedirs(parent, exist_ok=True)
                with open(path, "w", encoding="utf-8") as f:
                    f.write(entry["new"])
            except Exception as e:
                self._respond_json({"error": "Erreur redo: %s" % e}, 500)
                return
        data["undo_stack"].append(entry)
        self._undo_log_save(data)
        self._respond_json({"ok": True, "file": entry["file"]})

    def _undo_log_get(self):
        """GET /api/marexcode/undo-log — état du journal."""
        username = self._get_authenticated_user()
        if not username:
            return
        self._marex_root = marex_project_root(username)
        data = self._undo_log_load()
        self._respond_json({
            "undo_count": len(data["undo_stack"]),
            "redo_count": len(data["redo_stack"]),
        })

    def _exec_write(self, rel_path: str, content: str) -> dict:
        path = self._resolve_safe_path(rel_path)
        if not path:
            return {"error": "Chemin hors sandbox", "code": 403}
        try:
            existed = os.path.exists(path)
            old_content = None
            if existed:
                with open(path, "r", encoding="utf-8", errors="replace") as f:
                    old_content = f.read()
            parent = os.path.dirname(path)
            if parent and not os.path.exists(parent):
                os.makedirs(parent, exist_ok=True)
            with open(path, "w", encoding="utf-8") as f:
                f.write(content[:EXEC_MAX_OUTPUT])
            self._undo_push(rel_path, old_content, content[:EXEC_MAX_OUTPUT])
        except Exception as e:
            return {"error": f"Erreur écriture: {e}", "code": -1}
        return {"ok": True, "path": rel_path, "existed": existed}

    def _exec_edit(self, rel_path: str, old: str, new: str) -> dict:
        import difflib
        path = self._resolve_safe_path(rel_path)
        if not path:
            return {"error": "Chemin hors sandbox", "code": 403}
        try:
            with open(path, "r", encoding="utf-8", errors="replace") as f:
                content = f.read()
            if old not in content:
                return {"error": "Texte à remplacer introuvable", "code": 400}
            
            old_content = content
            replacements = content.count(old)
            updated = content.replace(old, new, 1)
            
            old_lines = content.splitlines(keepends=True)
            new_lines = updated.splitlines(keepends=True)
            diff = list(difflib.unified_diff(old_lines, new_lines, fromfile=rel_path, tofile=rel_path, lineterm=''))
            patch = ''.join(diff)
            
            additions = sum(1 for line in diff if line.startswith('+') and not line.startswith('+++'))
            deletions = sum(1 for line in diff if line.startswith('-') and not line.startswith('---'))
            
            with open(path, "w", encoding="utf-8") as f:
                f.write(updated)
            self._undo_push(rel_path, old_content, updated)
        except FileNotFoundError:
            return {"error": f"Fichier introuvable: {rel_path}", "code": 404}
        except Exception as e:
            return {"error": f"Erreur édition: {e}", "code": -1}
        return {"ok": True, "path": rel_path, "replacements": replacements, "additions": additions, "deletions": deletions, "patch": patch}

    # ── Formatters (auto-format après write/edit) ──────────────────────

    _FORMATTERS = {
        ".py": ["ruff", "format", "--quiet"],
        ".js": ["prettier", "--write", "--no-error-on-unmatched-pattern"],
        ".mjs": ["prettier", "--write", "--no-error-on-unmatched-pattern"],
        ".ts": ["prettier", "--write"],
        ".jsx": ["prettier", "--write"],
        ".tsx": ["prettier", "--write"],
        ".json": ["prettier", "--write"],
        ".css": ["prettier", "--write"],
        ".html": ["prettier", "--write"],
        ".md": ["prettier", "--write"],
    }

    def _apply_formatter(self, rel_path: str):
        """Exécute le formatter correspondant à l'extension. Silencieux, non-bloquant."""
        ext = os.path.splitext(rel_path)[1].lower()
        cmd = self._FORMATTERS.get(ext)
        if not cmd:
            return
        path = self._resolve_safe_path(rel_path)
        if not path or not os.path.isfile(path):
            return
        try:
            subprocess.run(
                cmd + [path],
                capture_output=True, text=True, timeout=10,
                cwd=self._exec_root() or ".",
            )
        except Exception:
            pass

    def _exec_grep(self, pattern: str, rel_path: str, limit: int = None) -> dict:
        root = self._exec_root()
        if not root:
            return {"error": "Sandbox non initialisée", "code": 500}
        has_glob = bool(rel_path) and any(c in rel_path for c in "*?[")
        if has_glob:
            resolved_paths = []
            for dirpath, dirnames, filenames in os.walk(root):
                dirnames[:] = [d for d in dirnames if not d.startswith(".")
                               and d not in ("node_modules", ".git")]
                for fn in filenames:
                    if fn.startswith("."):
                        continue
                    full = os.path.join(dirpath, fn)
                    rel = os.path.relpath(full, root)
                    if fnmatch.fnmatch(rel, rel_path):
                        resolved_paths.append(full)
            if not resolved_paths:
                return {"stdout": "", "code": 1, "matches": 0, "limit_applied": limit}
            search_paths = resolved_paths
        else:
            path = self._resolve_safe_path(rel_path or ".")
            if not path:
                return {"error": "Chemin hors sandbox", "code": 403}
            search_paths = [path]
        try:
            cmd = ["grep", "-rn", "--color=never", "--binary-files=without-match",
                   "--exclude-dir=__pycache__", "--exclude-dir=.git", pattern] + search_paths
            if limit:
                cmd = ["grep", "-rn", "-m", str(limit), "--color=never",
                       "--binary-files=without-match", "--exclude-dir=__pycache__",
                       "--exclude-dir=.git", pattern] + search_paths
            proc = subprocess.run(
                cmd,
                capture_output=True,
                text=True,
                timeout=EXEC_TIMEOUT,
            )
        except subprocess.TimeoutExpired:
            return {"error": f"Timeout dépassé ({EXEC_TIMEOUT}s)", "code": 124, "timed_out": True}
        except Exception as e:
            return {"error": f"Erreur grep: {e}", "code": -1}
        
        stdout = proc.stdout[:EXEC_MAX_OUTPUT]
        matches = len([line for line in stdout.split('\n') if line.strip()])
        
        return {"stdout": stdout, "code": proc.returncode, "matches": matches, "limit_applied": limit}

    def _exec_glob(self, pattern: str) -> dict:
        root = self._exec_root()
        if not root:
            return {"error": "Sandbox non initialisée", "code": 500}
        if not pattern:
            return {"error": "Pattern vide", "code": 400}
        matches = []
        for dirpath, dirnames, filenames in os.walk(root):
            dirnames[:] = [d for d in dirnames if not d.startswith(".")
                           and d not in ("node_modules", ".git")]
            for fn in filenames:
                if fn.startswith("."):
                    continue
                full = os.path.join(dirpath, fn)
                rel = os.path.relpath(full, root)
                if fnmatch.fnmatch(rel, pattern) or fnmatch.fnmatch(fn, pattern):
                    matches.append({"path": rel, "size": os.path.getsize(full)})
        matches.sort(key=lambda e: e["path"])
        return {"files": matches, "count": len(matches), "pattern": pattern}

    # ── Endpoint POST /api/exec ────────────────────────────────────────

    def _exec_tool(self):
        """POST /api/exec — dispatch outils Marexcode (Bash + fichiers).
        Body: {"tool": "Bash|Read|Write|Edit|Grep", "args": {...}}
        """
        from server import _rate_check
        username = self._get_authenticated_user()
        if not username:
            return
        if not _rate_check("exec:" + username, 60, 60):
            self._respond_json({"error": "Trop de requêtes. Réessayez dans une minute."}, 429)
            return
        self._marex_root = marex_project_root(username)
        content_len = int(self.headers.get("Content-Length", 0))
        body = self.rfile.read(content_len) if content_len > 0 else b"{}"
        try:
            data = json.loads(body)
        except json.JSONDecodeError:
            self._respond_json({"error": "JSON invalide"}, 400)
            return
        tool = (data.get("tool") or "").strip().lower()
        args = data.get("args") or {}
        log.info("exec tool=%s user=%s", tool, username)
        try:
            if tool == "bash":
                result = self._exec_bash(str(args.get("command", "")), args.get("timeout"))
            elif tool == "read":
                result = self._exec_read(str(args.get("file_path", "")), args.get("offset"), args.get("limit"))
            elif tool == "write":
                result = self._exec_write(str(args.get("file_path", "")), str(args.get("content", "")))
            elif tool == "edit":
                result = self._exec_edit(str(args.get("file_path", "")), str(args.get("old", "")), str(args.get("new", "")))
            elif tool == "grep":
                result = self._exec_grep(str(args.get("pattern", "")), str(args.get("path", "")), args.get("limit"))
            elif tool == "ls":
                result = {"files": self._marex_tree()}
            elif tool == "glob":
                result = self._exec_glob(str(args.get("pattern", "")))
            else:
                self._respond_json({"error": f"Outil inconnu: {tool}"}, 400)
                return
        except Exception as e:
            self._respond_json({"error": f"Erreur interne: {e}"}, 500)
            return
        result["tool"] = tool
        result["text"] = format_tool_output(tool, args, result)
        if tool in ("write", "edit") and result.get("ok"):
            self._apply_formatter(str(args.get("file_path", "")))
        if "error" in result:
            status = result.get("code", 500) if result.get("code", 500) >= 400 else 500
            self._respond_json({"error": result["error"], "tool": tool}, status)
            return
        self._respond_json(result)

    # ── LSP (Language Server Protocol) ─────────────────────────────────

    def _lsp_operation(self, operation: str):
        """POST /api/lsp/{operation} — exécute une opération LSP.
        Body: {"file": "path", "line": 0, "character": 0}
        """
        from server import _rate_check
        username = self._get_authenticated_user()
        if not username:
            return
        if not _rate_check("lsp:" + username, 60, 60):
            self._respond_json({"error": "Trop de requêtes. Réessayez dans une minute."}, 429)
            return
        self._marex_root = marex_project_root(username)
        content_len = int(self.headers.get("Content-Length", 0))
        body = self.rfile.read(content_len) if content_len > 0 else b"{}"
        try:
            data = json.loads(body)
        except json.JSONDecodeError:
            self._respond_json({"error": "JSON invalide"}, 400)
            return
        file_path = str(data.get("file", ""))
        line = data.get("line")
        character = data.get("character")
        log.info("lsp operation=%s file=%s user=%s", operation, file_path, username)
        manager = LSPManager(self._marex_root)
        try:
            result = manager.request(operation, file=file_path, line=line, character=character)
        except Exception as e:
            self._respond_json({"error": "Erreur LSP: %s" % e}, 500)
            return
        if "error" in result:
            self._respond_json({"error": result["error"]}, 400)
            return
        self._respond_json(result)

    # ── MCP (Model Context Protocol) ──────────────────────────────────

    def _mcp_servers_get(self):
        """GET /api/mcp/servers — liste les serveurs MCP configurés."""
        username = self._get_authenticated_user()
        if not username:
            return
        root = marex_project_root(username)
        manager = MCPManager(root)
        self._respond_json(manager.list_servers())

    def _mcp_tools_get(self, server_name: str):
        """GET /api/mcp/{server}/tools — liste les tools d'un serveur."""
        username = self._get_authenticated_user()
        if not username:
            return
        root = marex_project_root(username)
        manager = MCPManager(root)
        self._respond_json(manager.list_tools(server_name))

    def _mcp_tool_call(self, server_name: str, tool_name: str):
        """POST /api/mcp/{server}/{tool} — exécute un tool MCP.
        Body: {"args": {...}}
        """
        from server import _rate_check
        username = self._get_authenticated_user()
        if not username:
            return
        if not _rate_check("mcp:" + username, 30, 60):
            self._respond_json({"error": "Trop de requêtes MCP. Réessayez dans une minute."}, 429)
            return
        root = marex_project_root(username)
        content_len = int(self.headers.get("Content-Length", 0))
        body = self.rfile.read(content_len) if content_len > 0 else b"{}"
        try:
            data = json.loads(body)
        except json.JSONDecodeError:
            self._respond_json({"error": "JSON invalide"}, 400)
            return
        args = data.get("args") or {}
        log.info("mcp call server=%s tool=%s user=%s", server_name, tool_name, username)
        manager = MCPManager(root)
        result = manager.call_tool(server_name, tool_name, args)
        if "error" in result:
            self._respond_json({"error": result["error"]}, 400)
            return
        self._respond_json(result)

    def _marex_tree(self) -> list:
        """Listing récursif du workspace, exclut .git/node_modules/fichiers cachés."""
        root = self._exec_root()
        if not root:
            return []
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

    def _marex_tree_get(self):
        username = self._get_authenticated_user()
        if not username:
            return
        self._marex_root = marex_project_root(username)
        self._respond_json(self._marex_tree())

    # ── Custom Tools (user-defined) ────────────────────────────────────

    def _custom_tools_path(self, username: str) -> str:
        return os.path.join(marex_project_root(username), "tools.json")

    def _custom_tools_load(self, username: str) -> dict:
        path = self._custom_tools_path(username)
        if os.path.isfile(path):
            try:
                with open(path, "r", encoding="utf-8") as f:
                    return json.load(f)
            except Exception:
                pass
        return {"tools": {}}

    def _custom_tools_save(self, username: str, data: dict):
        path = self._custom_tools_path(username)
        try:
            with open(path, "w", encoding="utf-8") as f:
                json.dump(data, f, indent=2, ensure_ascii=False)
        except Exception as e:
            log.error("Failed to save custom tools: %s", e)

    def _custom_tools_get(self):
        """GET /api/marexcode/custom-tools — liste les outils custom."""
        username = self._get_authenticated_user()
        if not username:
            return
        data = self._custom_tools_load(username)
        self._respond_json(data.get("tools", {}))

    def _custom_tools_put(self):
        """PUT /api/marexcode/custom-tools — sauvegarde les outils custom.
        Body: {"tools": {"name": {"description": "...", "command": "...", "timeout": 30}}}
        """
        username = self._get_authenticated_user()
        if not username:
            return
        content_len = int(self.headers.get("Content-Length", 0))
        body = self.rfile.read(content_len) if content_len > 0 else b"{}"
        try:
            data = json.loads(body)
        except json.JSONDecodeError:
            self._respond_json({"error": "JSON invalide"}, 400)
            return
        tools = data.get("tools", data)
        for name, cfg in tools.items():
            if not isinstance(cfg, dict) or "command" not in cfg:
                self._respond_json({"error": "Outil '%s' invalide: 'command' requis" % name}, 400)
                return
        self._custom_tools_save(username, {"tools": tools})
        self._respond_json({"ok": True, "count": len(tools)})

    def _exec_custom_tool(self, tool_name: str):
        """POST /api/marexcode/custom-tools/{name} — exécute un outil custom.
        Body: {"args": {...}}
        """
        from server import _rate_check
        username = self._get_authenticated_user()
        if not username:
            return
        if not _rate_check("custom:" + username, 30, 60):
            self._respond_json({"error": "Trop de requêtes. Réessayez dans une minute."}, 429)
            return
        data = self._custom_tools_load(username)
        tools = data.get("tools", {})
        cfg = tools.get(tool_name)
        if not cfg:
            self._respond_json({"error": "Outil inconnu: %s" % tool_name}, 404)
            return
        content_len = int(self.headers.get("Content-Length", 0))
        body = self.rfile.read(content_len) if content_len > 0 else b"{}"
        try:
            req_data = json.loads(body)
        except json.JSONDecodeError:
            req_data = {}
        args = req_data.get("args", {})
        command = cfg["command"]
        for k, v in args.items():
            command = command.replace("{%s}" % k, str(v))
        timeout = min(cfg.get("timeout", 30), 120)
        log.info("custom tool=%s user=%s cmd=%s", tool_name, username, command[:80])
        root = marex_project_root(username)
        try:
            import shlex
            tokens = shlex.split(command)
            proc = subprocess.run(
                tokens, cwd=root, capture_output=True, text=True, timeout=timeout
            )
            result = {
                "stdout": proc.stdout[:EXEC_MAX_OUTPUT],
                "stderr": proc.stderr[:EXEC_MAX_OUTPUT],
                "code": proc.returncode,
            }
            result["text"] = "Command exited with code %s\n%s" % (
                proc.returncode,
                proc.stdout[:500] if proc.stdout else "",
            )
            self._respond_json(result)
        except subprocess.TimeoutExpired:
            self._respond_json({"error": "Timeout (%ds)" % timeout, "code": 124}, 408)
        except Exception as e:
            self._respond_json({"error": "Erreur: %s" % e}, 500)

    # ── Sessions persistantes ──────────────────────────────────────────

    def _marex_session_path(self, sid: str) -> str | None:
        if not sid or os.path.basename(sid) != sid or sid.startswith("."):
            return None
        root = os.path.realpath(self._session_root)
        full = os.path.realpath(os.path.join(root, sid + ".json"))
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
                                "date": d.get("date", ""),
                                "project": d.get("project", PROJECT_SERVER)})
                except Exception:
                    pass
        return out

    def _marex_session_load(self, sid: str):
        path = self._marex_session_path(sid)
        if not path or not os.path.exists(path):
            return None
        try:
            with open(path, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            return None

    def _marex_session_save(self, sid: str, data: dict):
        path = self._marex_session_path(sid)
        if not path:
            return None
        try:
            parent = os.path.dirname(path)
            if parent and not os.path.exists(parent):
                os.makedirs(parent, exist_ok=True)
            with open(path, "w", encoding="utf-8") as f:
                json.dump(data, f, ensure_ascii=False)
        except Exception:
            return None
        return {"ok": True}

    def _marex_session_delete(self, sid: str):
        path = self._marex_session_path(sid)
        if not path or not os.path.exists(path):
            return None
        try:
            os.remove(path)
        except Exception:
            return None
        return {"ok": True}

    def _marex_sessions_list_get(self):
        username = self._get_authenticated_user()
        if not username:
            return
        self._session_root = marex_sessions_dir(username)
        self._respond_json(self._marex_sessions_list())

    def _marex_sessions_item_get(self, sid: str):
        username = self._get_authenticated_user()
        if not username:
            return
        self._session_root = marex_sessions_dir(username)
        data = self._marex_session_load(sid)
        if data is None:
            self._respond_json({"error": "Session introuvable"}, 404)
            return
        self._respond_json(data)

    def _marex_sessions_item_put(self, sid: str):
        username = self._get_authenticated_user()
        if not username:
            return
        try:
            content_len = int(self.headers.get("Content-Length", 0))
            body = self.rfile.read(content_len) if content_len > 0 else b"{}"
            data = json.loads(body)
        except Exception:
            self._respond_json({"error": "JSON invalide"}, 400)
            return
        self._session_root = marex_sessions_dir(username)
        if self._marex_session_save(sid, data) is None:
            self._respond_json({"error": "ID de session invalide"}, 400)
            return
        self._respond_json({"ok": True})

    def _marex_sessions_item_delete(self, sid: str):
        username = self._get_authenticated_user()
        if not username:
            return
        self._session_root = marex_sessions_dir(username)
        if self._marex_session_delete(sid) is None:
            self._respond_json({"error": "Session introuvable"}, 404)
            return
        self._respond_json({"ok": True})

    # ── Projet actif (serveur / importé) ───────────────────────────────

    def _marex_project_get(self):
        """GET /api/marexcode/project — projet actif de l'utilisateur."""
        username = self._get_authenticated_user()
        if not username:
            return
        active = marex_get_active_project(username)
        uploaded_dir = os.path.join(marex_workspace(username), UPLOADED_PROJECT_DIRNAME)
        has_uploaded = os.path.isdir(uploaded_dir) and bool(os.listdir(uploaded_dir))
        self._respond_json({
            "active": active,
            "projects": [
                {"name": PROJECT_SERVER, "available": True},
                {"name": PROJECT_UPLOADED, "available": has_uploaded},
            ],
        })

    def _marex_project_put(self):
        """PUT /api/marexcode/project — change le projet actif.
        Body: {"active": "Marexcode (serveur)" | "Projet importé"}
        """
        username = self._get_authenticated_user()
        if not username:
            return
        try:
            content_len = int(self.headers.get("Content-Length", 0))
            body = self.rfile.read(content_len) if content_len > 0 else b"{}"
            data = json.loads(body)
        except Exception:
            self._respond_json({"error": "JSON invalide"}, 400)
            return
        name = str(data.get("active", ""))
        if name == PROJECT_UPLOADED:
            uploaded_dir = os.path.join(marex_workspace(username), UPLOADED_PROJECT_DIRNAME)
            if not os.path.isdir(uploaded_dir) or not os.listdir(uploaded_dir):
                self._respond_json({"error": "Aucun projet importé pour l'instant. Importez un dossier d'abord."}, 400)
                return
        if not marex_set_active_project(username, name):
            self._respond_json({"error": "Nom de projet invalide"}, 400)
            return
        self._respond_json({"ok": True, "active": name})

    # ── Suppression du projet importé ───────────────────────────────────

    def _marex_project_delete(self):
        """DELETE /api/marexcode/project — supprime le workspace 'Projet importé'.
        Vide entièrement uploaded_project/ et bascule sur PROJECT_SERVER si c'était le projet actif.
        """
        from server import _rate_check
        username = self._get_authenticated_user()
        if not username:
            return
        if not _rate_check("delete_project:" + username, 5, 300):
            self._respond_json({"error": "Trop de suppressions. Réessayez dans quelques minutes."}, 429)
            return
        base = marex_workspace(username)
        target_root = os.path.join(base, UPLOADED_PROJECT_DIRNAME)
        try:
            import shutil
            if os.path.isdir(target_root):
                shutil.rmtree(target_root)
            os.makedirs(target_root, exist_ok=True)
        except Exception as e:
            self._respond_json({"error": f"Erreur suppression: {e}"}, 500)
            return
        # Si le projet actif était "Projet importé", basculer sur "Marexcode (serveur)"
        active = marex_get_active_project(username)
        if active == PROJECT_UPLOADED:
            marex_set_active_project(username, PROJECT_SERVER)
        log.info("delete project user=%s", username)
        self._respond_json({"ok": True, "active": PROJECT_SERVER})

    # ── Upload d'un dossier de projet ───────────────────────────────────

    def _marex_upload_project(self):
        """POST /api/marexcode/upload — importe un dossier (multipart/form-data).
        Crée un nouveau workspace au lieu de remplacer l'existant.
        """
        from server import _rate_check
        import time
        import re
        username = self._get_authenticated_user()
        if not username:
            return
        if not _rate_check("upload:" + username, 5, 300):
            self._respond_json({"error": "Trop d'imports. Réessayez dans quelques minutes."}, 429)
            return

        content_type = self.headers.get("Content-Type", "")
        if "multipart/form-data" not in content_type:
            self._respond_json({"error": "Content-Type multipart/form-data attendu"}, 400)
            return
        boundary = None
        for part in content_type.split(";"):
            part = part.strip()
            if part.startswith("boundary="):
                boundary = part[len("boundary="):].strip('"')
        if not boundary:
            self._respond_json({"error": "Boundary multipart manquant"}, 400)
            return

        content_len = int(self.headers.get("Content-Length", 0))
        if content_len <= 0 or content_len > UPLOAD_MAX_TOTAL_BYTES + (1024 * 1024):
            self._respond_json({"error": f"Upload trop volumineux (max {UPLOAD_MAX_TOTAL_BYTES // (1024*1024)} Mo)"}, 413)
            return
        body = self.rfile.read(content_len)

        try:
            files = _parse_multipart_files(body, boundary.encode("utf-8"))
        except Exception as e:
            self._respond_json({"error": f"Corps multipart invalide: {e}"}, 400)
            return

        if not files:
            self._respond_json({"error": "Aucun fichier reçu"}, 400)
            return
        if len(files) > UPLOAD_MAX_FILES:
            self._respond_json({"error": f"Trop de fichiers (max {UPLOAD_MAX_FILES})"}, 400)
            return
        total_bytes = sum(len(f["content"]) for f in files)
        if total_bytes > UPLOAD_MAX_TOTAL_BYTES:
            self._respond_json({"error": f"Taille totale trop importante (max {UPLOAD_MAX_TOTAL_BYTES // (1024*1024)} Mo)"}, 400)
            return

        base = marex_workspace(username)
        ws_dir = marex_workspaces_dir(username)

        # Extraire le nom du projet depuis le premier fichier (racine du dossier uploadé)
        project_name = "projet"
        if files:
            first = files[0]["filename"].replace("\\", "/").lstrip("/")
            parts = first.split("/")
            if len(parts) > 1:
                project_name = parts[0]
            else:
                project_name = os.path.splitext(first)[0] or "projet"

        # Générer un ID unique (slug + timestamp)
        import re
        import time
        slug = re.sub(r'[^a-z0-9]+', '-', project_name.lower()).strip('-') or "projet"
        ws_id = f"{slug}-{int(time.time())}"
        target_root = os.path.join(ws_dir, ws_id)

        # Valide tous les chemins AVANT d'écrire quoi que ce soit
        resolved = []
        for f in files:
            rel = f["filename"].replace("\\", "/").lstrip("/")
            # Retire un éventuel dossier racine unique ajouté par webkitdirectory
            if len(parts) > 1 and rel.startswith(project_name + "/"):
                rel = rel[len(project_name) + 1:]
            candidate = os.path.realpath(os.path.join(target_root, rel))
            real_root = os.path.realpath(target_root)
            if candidate != real_root and not candidate.startswith(real_root + os.sep):
                self._respond_json({"error": f"Chemin invalide dans l'upload: {rel}"}, 400)
                return
            if os.path.basename(rel).startswith("."):
                continue  # ignore fichiers cachés
            resolved.append((candidate, f["content"]))

        try:
            os.makedirs(target_root, exist_ok=True)
            for path, content in resolved:
                parent = os.path.dirname(path)
                if parent and not os.path.exists(parent):
                    os.makedirs(parent, exist_ok=True)
                with open(path, "wb") as out:
                    out.write(content)
        except Exception as e:
            self._respond_json({"error": f"Erreur écriture upload: {e}"}, 500)
            return

        # Générer MAREXCODE.md automatiquement
        instructions_path = marex_workspace_instructions_path(username, ws_id)
        if not os.path.exists(instructions_path):
            with open(instructions_path, "w", encoding="utf-8") as f:
                f.write(MAREXCODE_INSTRUCTIONS_TEMPLATE)

        # Sauvegarder les métadonnées
        meta = {
            "id": ws_id,
            "name": project_name,
            "created": time.strftime("%Y-%m-%d %H:%M:%S"),
            "active": True,
        }
        marex_save_workspace_meta(username, ws_id, meta)

        # Activer ce workspace
        marex_set_active_workspace(username, ws_id)

        log.info("upload workspace user=%s ws_id=%s files=%d bytes=%d", username, ws_id, len(resolved), total_bytes)
        self._respond_json({"ok": True, "id": ws_id, "name": project_name, "files": len(resolved), "bytes": total_bytes})


def _parse_multipart_files(body: bytes, boundary: bytes) -> list:
    """Parse minimal d'un corps multipart/form-data : renvoie une liste de
    {"filename": str, "content": bytes} pour chaque part porteuse d'un
    `filename` (les champs simples sans filename sont ignorés).
    """
    delimiter = b"--" + boundary
    parts = body.split(delimiter)
    files = []
    for part in parts:
        part = part.strip(b"\r\n")
        if not part or part == b"--":
            continue
        if b"\r\n\r\n" not in part:
            continue
        header_blob, content = part.split(b"\r\n\r\n", 1)
        # Le dernier boundary se termine par "--" ; retire ce suffixe du contenu si présent.
        if content.endswith(b"\r\n"):
            content = content[:-2]
        headers_text = header_blob.decode("utf-8", errors="replace")
        filename = None
        for line in headers_text.split("\r\n"):
            if line.lower().startswith("content-disposition:") and "filename=" in line:
                # Extrait filename="..."
                marker = "filename=\""
                idx = line.find(marker)
                if idx != -1:
                    rest = line[idx + len(marker):]
                    end = rest.find("\"")
                    if end != -1:
                        filename = rest[:end]
        if filename:
            files.append({"filename": filename, "content": content})
    return files
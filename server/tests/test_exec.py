"""Tests for Marexcode tool execution (server/server.py).

Covers: bash whitelist, path sandbox, read/write/edit/grep tools.
Never starts a real HTTP server — handler methods called directly.
"""

import os
import sys
import tempfile

import pytest

# ---------------------------------------------------------------------------
# Set env vars BEFORE importing server (module-level side effects)
# ---------------------------------------------------------------------------
_test_tmpdir = tempfile.mkdtemp(prefix="cetas_test_")
os.environ["CETAS_DATA_DIR"] = os.path.join(_test_tmpdir, "data")
os.makedirs(os.environ["CETAS_DATA_DIR"], exist_ok=True)
os.environ["CETAS_PROJECT_DIR"] = _test_tmpdir

# ---------------------------------------------------------------------------
# Import setup — point at server/ so `import server` resolves
# ---------------------------------------------------------------------------
_PROXY_DIR = os.path.join(os.path.dirname(__file__), "..")
sys.path.insert(0, os.path.abspath(_PROXY_DIR))

import server  # noqa: E402


@pytest.fixture
def handler():
    """Instance légère sans démarrage HTTP."""
    h = server.ProxyHandler.__new__(server.ProxyHandler)
    return h


@pytest.fixture
def sandbox_file():
    path = os.path.join(_test_tmpdir, "hello.txt")
    with open(path, "w", encoding="utf-8") as f:
        f.write("bonjour le monde\nligne deux\n")
    return "hello.txt"


# ── Bash whitelist ─────────────────────────────────────────────────────────

def test_bash_whitelisted_command(handler):
    result = handler._exec_bash("echo hello")
    assert "error" not in result
    assert result["code"] == 0
    assert "hello" in result["stdout"]


def test_bash_banned_command(handler):
    result = handler._exec_bash("sudo rm -rf /")
    assert "error" in result
    assert result["code"] == 403


def test_bash_unknown_command(handler):
    result = handler._exec_bash("totally-unknown-cmd xyz")
    assert "error" in result
    assert result["code"] == 403


def test_bash_flag_bypass_blocked(handler):
    result = handler._exec_bash("python3 -c 'import os; os.system(\"id\")'")
    assert "error" in result
    assert result["code"] == 403


def test_bash_empty_command(handler):
    result = handler._exec_bash("")
    assert "error" in result


# ── Sandbox path ───────────────────────────────────────────────────────────

def test_resolve_safe_path_within_sandbox(handler, sandbox_file):
    resolved = handler._resolve_safe_path(sandbox_file)
    assert resolved == os.path.realpath(os.path.join(_test_tmpdir, sandbox_file))


def test_resolve_safe_path_traversal_blocked(handler):
    resolved = handler._resolve_safe_path("../etc/passwd")
    assert resolved is None


# ── File tools ─────────────────────────────────────────────────────────────

def test_read_existing_file(handler, sandbox_file):
    result = handler._exec_read(sandbox_file)
    assert "error" not in result
    assert "bonjour le monde" in result["content"]


def test_read_missing_file(handler):
    result = handler._exec_read("nope.txt")
    assert "error" in result


def test_read_traversal_blocked(handler):
    result = handler._exec_read("../etc/passwd")
    assert "error" in result


def test_write_and_read_roundtrip(handler):
    result = handler._exec_write("new/foo.txt", "contenu test")
    assert result.get("ok") is True
    read_back = handler._exec_read("new/foo.txt")
    assert read_back["content"] == "contenu test"


def test_write_traversal_blocked(handler):
    result = handler._exec_write("../escape.txt", "x")
    assert "error" in result


def test_edit_existing_text(handler, sandbox_file):
    result = handler._exec_edit(sandbox_file, "bonjour le monde", "salut")
    assert result.get("ok") is True
    content = handler._exec_read(sandbox_file)["content"]
    assert "salut" in content
    assert "bonjour le monde" not in content


def test_edit_missing_text(handler, sandbox_file):
    result = handler._exec_edit(sandbox_file, "introuvable", "x")
    assert "error" in result


def test_grep_finds_pattern(handler, sandbox_file):
    result = handler._exec_grep("bonjour", sandbox_file)
    assert "error" not in result
    assert "bonjour" in result["stdout"]


def test_grep_no_match(handler, sandbox_file):
    result = handler._exec_grep("xyzabc", sandbox_file)
    assert "error" not in result
    assert result["code"] == 1


# ── Workspace par utilisateur (Marexcode) ────────────────────────────────

def test_exec_uses_per_user_workspace(handler):
    root = os.path.join(os.environ["CETAS_DATA_DIR"], "marexcode", "alice")
    os.makedirs(root, exist_ok=True)
    handler._marex_root = root
    res = handler._exec_bash("pwd")
    assert "error" not in res
    assert res["stdout"].strip() == os.path.realpath(root)


def test_exec_write_lands_in_user_workspace(handler):
    root = os.path.join(os.environ["CETAS_DATA_DIR"], "marexcode", "bob")
    os.makedirs(root, exist_ok=True)
    handler._marex_root = root
    res = handler._exec_write("app.txt", "hello")
    assert res.get("ok") is True
    full = os.path.join(root, "app.txt")
    assert os.path.exists(full)


def test_exec_traversal_blocked_outside_user_workspace(handler):
    root = os.path.join(os.environ["CETAS_DATA_DIR"], "marexcode", "carol")
    os.makedirs(root, exist_ok=True)
    handler._marex_root = root
    res = handler._exec_read("../../secret.txt")
    assert "error" in res
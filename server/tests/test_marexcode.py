"""Tests for the Marexcode module (server/server.py).

Covers: per-user workspace tree listing, sessions CRUD.
Never starts a real HTTP server — handler methods called directly.
"""

import os
import sys
import tempfile

import pytest

# ---------------------------------------------------------------------------
# Set env vars BEFORE importing server (module-level side effects)
# ---------------------------------------------------------------------------
_test_tmpdir_marex = tempfile.mkdtemp(prefix="cetas_marex_")
os.environ["CETAS_DATA_DIR"] = os.path.join(_test_tmpdir_marex, "data")
os.makedirs(os.environ["CETAS_DATA_DIR"], exist_ok=True)
os.environ["CETAS_PROJECT_DIR"] = _test_tmpdir_marex

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


# ── Tree ──────────────────────────────────────────────────────────────────

def test_marex_tree_lists_workspace(handler):
    handler._marex_root = os.path.join(_test_tmpdir_marex, "tree")
    os.makedirs(os.path.join(handler._marex_root, "src"), exist_ok=True)
    with open(os.path.join(handler._marex_root, "src", "a.py"), "w") as f:
        f.write("x")
    os.makedirs(os.path.join(handler._marex_root, ".git"), exist_ok=True)
    with open(os.path.join(handler._marex_root, ".git", "HEAD"), "w") as f:
        f.write("x")
    os.makedirs(os.path.join(handler._marex_root, "node_modules"), exist_ok=True)
    with open(os.path.join(handler._marex_root, "node_modules", "pkg"), "w") as f:
        f.write("x")
    with open(os.path.join(handler._marex_root, ".secret"), "w") as f:
        f.write("x")
    tree = handler._marex_tree()
    names = [e["path"] for e in tree]
    assert "src/a.py" in names
    assert not any(".git" in n for n in names)
    assert not any("node_modules" in n for n in names)
    assert not any(n.startswith(".") for n in names)


# ── Sessions CRUD ─────────────────────────────────────────────────────────

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


def test_sessions_delete_missing(handler):
    handler._session_root = os.path.join(_test_tmpdir_marex, "sessions")
    assert handler._marex_session_delete("nope") is None


def test_sessions_path_traversal_blocked(handler):
    handler._session_root = os.path.join(_test_tmpdir_marex, "sessions")
    assert handler._marex_session_save("../../evil", {}) is None
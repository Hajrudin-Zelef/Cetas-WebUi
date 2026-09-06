"""Tests du mode local Windows (Tasks M0.2 + M0.3).

Configs lues lazy (monkeypatch env) — pas d'ordre d'import.
"""

import os
import sys
import tempfile

import pytest

# ---------------------------------------------------------------------------
# Set env vars BEFORE importing server (module-level side effects)
# ---------------------------------------------------------------------------
_test_tmpdir_local = tempfile.mkdtemp(prefix="cetas_local_")
os.environ["CETAS_DATA_DIR"] = os.path.join(_test_tmpdir_local, "data")
os.makedirs(os.environ["CETAS_DATA_DIR"], exist_ok=True)

# ---------------------------------------------------------------------------
# Import setup — point at server/ so `import server` resolves
# ---------------------------------------------------------------------------
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

import server  # noqa: E402


# ── M0.2 Workspace local + Bash complet ────────────────────────────────────

def test_project_root_override(monkeypatch, tmp_path):
    monkeypatch.setenv("CETAS_PROJECT_DIR", str(tmp_path))
    import marexcode as m
    assert m.marex_server_project_root("u") == str(tmp_path)


def test_bash_complet_off(monkeypatch, tmp_path):
    monkeypatch.setenv("CETAS_PROJECT_DIR", str(tmp_path))
    monkeypatch.setenv("CETAS_LOCAL_MODE", "1")
    import marexcode as m
    h = object.__new__(m.MarexcodeMixin)
    h._marex_root = str(tmp_path)
    r = h._exec_bash("false || echo hi")
    assert r["code"] == 0 and "hi" in r["stdout"]


# ── M0.3 Portabilité Windows ───────────────────────────────────────────────

def test_crypto_path_windows(monkeypatch):
    monkeypatch.setattr("os.name", "nt")
    from server import _crypto_path
    assert _crypto_path().endswith("core/win/crypto_windows.py"), _crypto_path()


def test_crypto_path_linux(monkeypatch):
    monkeypatch.setattr("os.name", "posix")
    from server import _crypto_path
    assert _crypto_path().endswith("core/linux/crypto_linux.py"), _crypto_path()


def test_resolve_safe_path_win_backslash(monkeypatch, tmp_path):
    monkeypatch.setenv("CETAS_PROJECT_DIR", str(tmp_path))
    import marexcode as m
    h = object.__new__(m.MarexcodeMixin)
    h._marex_root = str(tmp_path)
    assert h._resolve_safe_path("..\\secret") is None
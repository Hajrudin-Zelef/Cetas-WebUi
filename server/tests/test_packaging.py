"""Tests packaging desktop (Task M4 : PyInstaller + Inno Setup)."""

import os
import sys
import tempfile
from pathlib import Path

import pytest

_test_tmp = tempfile.mkdtemp(prefix="cetas_pkg_")
os.environ["CETAS_DATA_DIR"] = os.path.join(_test_tmp, "data")
os.makedirs(os.environ["CETAS_DATA_DIR"], exist_ok=True)

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

import server  # noqa: E402

REPO_ROOT = Path(__file__).resolve().parent.parent.parent

_CETAS_ENV_KEYS = ("CETAS_BASE_DIR", "CETAS_STATIC_DIR", "CETAS_DATA_DIR",
                   "CETAS_PROJECT_DIR", "CETAS_VAULT_PATH", "CETAS_ENV_PATH",
                   "CETAS_CRYPTO_PATH")


@pytest.fixture(autouse=True)
def _clean_frozen_env():
    """Purge les chemins CETAS_* que apply_frozen_defaults pourrait poser."""
    yield
    for k in _CETAS_ENV_KEYS:
        os.environ.pop(k, None)


def test_frozen_defaults_non_frozen_noop(monkeypatch):
    monkeypatch.setattr(sys, "frozen", False, raising=False)
    monkeypatch.delenv("CETAS_STATIC_DIR", raising=False)
    server.apply_frozen_defaults()
    assert "CETAS_STATIC_DIR" not in os.environ


def test_frozen_defaults_sets_appdata(monkeypatch):
    monkeypatch.setattr(sys, "frozen", True, raising=False)
    monkeypatch.setattr(sys, "_MEIPASS", "C:/bundle/_internal", raising=False)
    monkeypatch.setattr(sys, "executable", "C:/Cetas/Cetas.exe", raising=False)
    monkeypatch.setenv("APPDATA", "C:/Users/T/AppData/Roaming")
    for k in ("CETAS_BASE_DIR", "CETAS_STATIC_DIR", "CETAS_DATA_DIR",
              "CETAS_PROJECT_DIR", "CETAS_VAULT_PATH", "CETAS_ENV_PATH",
              "CETAS_CRYPTO_PATH"):
        monkeypatch.delenv(k, raising=False)
    server.apply_frozen_defaults()
    assert os.environ["CETAS_STATIC_DIR"] == "C:/bundle/_internal/static"
    assert os.environ["CETAS_DATA_DIR"].startswith("C:/Users/T/AppData/Roaming/Cetas")
    assert os.environ["CETAS_CRYPTO_PATH"].endswith(os.path.join("core", "win", "crypto_windows.py"))


def test_frozen_defaults_respects_user_env(monkeypatch):
    monkeypatch.setattr(sys, "frozen", True, raising=False)
    monkeypatch.setattr(sys, "_MEIPASS", "C:/bundle/_internal", raising=False)
    monkeypatch.setattr(sys, "executable", "C:/Cetas/Cetas.exe", raising=False)
    monkeypatch.setenv("APPDATA", "C:/Users/T/AppData/Roaming")
    for k in ("CETAS_BASE_DIR", "CETAS_STATIC_DIR", "CETAS_PROJECT_DIR",
              "CETAS_VAULT_PATH", "CETAS_ENV_PATH", "CETAS_CRYPTO_PATH"):
        monkeypatch.delenv(k, raising=False)
    monkeypatch.setenv("CETAS_DATA_DIR", "D:/my/data")
    server.apply_frozen_defaults()
    assert os.environ["CETAS_DATA_DIR"] == "D:/my/data"


def test_spec_contient_static_et_crypto():
    spec = REPO_ROOT / "cetas.spec"
    assert spec.exists(), "cetas.spec manquant"
    content = spec.read_text(encoding="utf-8")
    assert "'static'" in content, "static datas manquant"
    assert "crypto_windows.py" in content, "crypto_windows.py datas manquant"
    assert "cryptography" in content, "hiddenimport cryptography manquant"
    assert "name='Cetas'" in content, "nom de l'exe manquant"


def test_build_script_existe():
    assert (REPO_ROOT / "build_windows.ps1").exists(), "build_windows.ps1 manquant"


def test_installer_isse_reference_exe():
    iss = REPO_ROOT / "installer.iss"
    assert iss.exists(), "installer.iss manquant"
    content = iss.read_text(encoding="utf-8")
    assert "Cetas.exe" in content, "Cetas.exe non référencé"
    assert "DefaultDirName" in content, "répertoire d'installation manquant"
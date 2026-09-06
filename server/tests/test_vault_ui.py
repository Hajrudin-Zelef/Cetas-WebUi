"""Tests du vault local UI (Task M3)."""

import os
import sys
import tempfile
import json

_test_tmp = tempfile.mkdtemp(prefix="cetas_vault_")
os.environ["CETAS_DATA_DIR"] = os.path.join(_test_tmp, "data")
os.makedirs(os.environ["CETAS_DATA_DIR"], exist_ok=True)

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

import server


def test_vault_exists_false_by_default(monkeypatch, tmp_path):
    monkeypatch.setenv("CETAS_VAULT_PATH", str(tmp_path / ".vault" / ".enc"))
    assert not server.vault_exists()


def test_vault_exists_true_when_created(monkeypatch, tmp_path):
    vault_path = tmp_path / ".vault" / ".enc"
    vault_path.parent.mkdir(parents=True)
    vault_path.write_text("dummy")
    monkeypatch.setenv("CETAS_VAULT_PATH", str(vault_path))
    assert server.vault_exists()


def test_setup_save_creates_vault(monkeypatch, tmp_path):
    vault_path = tmp_path / ".vault" / ".enc"
    monkeypatch.setenv("CETAS_VAULT_PATH", str(vault_path))
    monkeypatch.setenv("CETAS_VAULT_PASSWORD", "testpass123")
    monkeypatch.setattr(server, "load_api_keys", lambda: None)

    data = {"password": "mypass", "keys": {"OpenAI": "sk-test123"}}
    result = server.setup_save_vault(data)
    assert result is True
    assert vault_path.exists()

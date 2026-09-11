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


def test_websearch_keys_roundtrip_after_restart(monkeypatch, tmp_path):
    """Régression : les clés websearch écrites au setup doivent se relire via load_api_keys.

    L'écriture chiffre avec AAD = nom d'env complet ("brave_api_key"), le reader
    dérivait un AAD tronqué ("brave_api") → échec de déchiffrement de toutes les
    clés websearch au redémarrage (sys.exit sur brave_api, première par ordre alpha).
    """
    vault_path = tmp_path / ".vault" / ".enc"
    env_path = tmp_path / ".env"
    monkeypatch.setenv("CETAS_VAULT_PATH", str(vault_path))
    monkeypatch.setenv("CETAS_ENV_PATH", str(env_path))
    monkeypatch.setenv("CETAS_VAULT_PASSWORD", "mypass")

    data = {
        "password": "mypass",
        "keys": {},
        "local": {},
        "websearch": {"brave": "BSA-test123", "tavily": "tvly-test456"},
    }
    assert server.setup_save_vault(data) is True

    server.api_keys.clear()
    for k in list(os.environ):
        if k in ("BRAVE_API_KEY", "TAVILY_API_KEY"):
            os.environ.pop(k)

    server.load_api_keys()

    assert os.environ.get("BRAVE_API_KEY") == "BSA-test123"
    assert os.environ.get("TAVILY_API_KEY") == "tvly-test456"

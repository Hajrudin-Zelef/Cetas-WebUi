"""Tests du launcher desktop (Task M2)."""

import os
import sys
import tempfile

_test_tmp = tempfile.mkdtemp(prefix="cetas_desktop_")
os.environ["CETAS_DATA_DIR"] = os.path.join(_test_tmp, "data")
os.makedirs(os.environ["CETAS_DATA_DIR"], exist_ok=True)

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

import server


def test_create_server_returns_server(monkeypatch):
    monkeypatch.setattr(server, "load_api_keys", lambda: None)
    s = server.create_server()
    assert s is not None
    assert hasattr(s, "server_address")
    assert s.server_address[0] == "127.0.0.1"
    s.server_close()


def test_create_server_port(monkeypatch):
    monkeypatch.setenv("PROXY_PORT", "19999")
    monkeypatch.setattr(server, "load_api_keys", lambda: None)
    s = server.create_server()
    assert s.server_address[1] == 19999
    s.server_close()


def test_main_exists():
    assert callable(server.main)

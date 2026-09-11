"""Tests for Marexcode RunScript sandbox (server/marexcode.py).

Exécution typée python/node sans shell=True, env nettoyé, timeout borné,
cleanup du fichier temporaire. Jamais de serveur HTTP — méthode appelée
directement sur le handler, comme test_exec.py.
"""

import os
import shutil
import tempfile

import pytest

_test_tmpdir = tempfile.mkdtemp(prefix="cetas_runscript_test_")
os.environ["CETAS_DATA_DIR"] = os.path.join(_test_tmpdir, "data")
os.makedirs(os.environ["CETAS_DATA_DIR"], exist_ok=True)
os.environ["CETAS_PROJECT_DIR"] = _test_tmpdir

_PROXY_DIR = os.path.join(os.path.dirname(__file__), "..")
import sys
sys.path.insert(0, os.path.abspath(_PROXY_DIR))

import server  # noqa: E402


@pytest.fixture
def handler():
    h = server.ProxyHandler.__new__(server.ProxyHandler)
    root = tempfile.mkdtemp(prefix="cetas_rs_ws_", dir=_test_tmpdir)
    h._marex_root = root
    return h


def test_runscript_python_executes_and_returns_stdout(handler):
    result = handler._exec_runscript("python", "print('OK-PY', 2 + 2)")
    assert "error" not in result, result
    assert result["code"] == 0
    assert "OK-PY 4" in result["stdout"]


def test_runscript_node_executes_and_returns_stdout(handler):
    if not shutil.which("node"):
        pytest.skip("node absent de l'environnement de test")
    result = handler._exec_runscript("node", "console.log('OK-JS', 2 + 2)")
    assert "error" not in result, result
    assert result["code"] == 0
    assert "OK-JS 4" in result["stdout"]


def test_runscript_unknown_language_returns_error(handler):
    result = handler._exec_runscript("ruby", "puts 1")
    assert "error" in result
    assert "Unsupported language" in result["error"]


def test_runscript_timeout_kills_looping_script(handler):
    result = handler._exec_runscript("python", "while True:\n    pass", timeout=1)
    assert "error" in result
    assert result.get("timed_out") is True
    assert result["code"] == 124


def test_runscript_env_scrubbed_no_inherited_secrets(handler):
    os.environ["FAKE_SECRET"] = "topsecret-12345"
    try:
        code = "import os\n" \
               "print(os.linesep.join(sorted(os.environ.keys())))\n" \
               "print('VAL' + os.environ.get('FAKE_SECRET', 'ABSENT'))"
        result = handler._exec_runscript("python", code)
        assert "error" not in result, result
        out = result["stdout"]
        assert "FAKE_SECRET" not in out, "la variable secrète héritée ne doit pas fuiter dans le subprocess"
        assert "ABSENT" in out, "FAKE_SECRET doit être absente de os.environ du subprocess"
        assert "PATH" in out and "HOME" in out, "PATH/HOME doivent être fournis"
    finally:
        del os.environ["FAKE_SECRET"]


def test_runscript_cetas_secrets_not_inherited(handler):
    code = "import os\nprint(os.linesep.join(sorted(os.environ.keys())))"
    result = handler._exec_runscript("python", code)
    assert "error" not in result, result
    for leaked in ("CETAS_VAULT_PASSWORD", "CETAS_WORKER_TOKEN", "CETAS_ENV_PATH"):
        assert leaked not in result["stdout"], leaked + " ne doit jamais être héritée"


def test_runscript_temp_file_cleaned_up(handler):
    handler._exec_runscript("python", "print('x')")
    tmp_dir = os.path.join(handler._marex_root, ".runscript_tmp")
    assert not os.path.isdir(tmp_dir) or not os.listdir(tmp_dir), \
        "le fichier temporaire doit être supprimé après exécution"

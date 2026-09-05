"""Tests du static serving + rendu SSI local (Task M0.1).

Env défini via monkeypatch (configs lues lazy) — pas d'ordre d'import.
"""

import sys
import os
import tempfile

from pathlib import Path

_test_tmp = tempfile.mkdtemp(prefix="cetas_static_")
os.environ["CETAS_DATA_DIR"] = os.path.join(_test_tmp, "data")
os.makedirs(os.environ["CETAS_DATA_DIR"], exist_ok=True)

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))


def _mk_static(tmp_path: Path) -> Path:
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


def test_ssi_partial_direct(monkeypatch, tmp_path):
    monkeypatch.setenv("CETAS_STATIC_DIR", str(_mk_static(tmp_path)))
    from server import _ssi_render
    assert _ssi_render("partials/head.html") == "<head><title>T</title></head>"


def test_ssi_traversal_bloque(monkeypatch, tmp_path):
    monkeypatch.setenv("CETAS_STATIC_DIR", str(_mk_static(tmp_path)))
    from server import _ssi_render
    (tmp_path / "bad.html").write_text('<!--#include file="../.secret" -->')
    assert _ssi_render("bad.html") == ""


def test_ssi_depth_cap(monkeypatch, tmp_path):
    monkeypatch.setenv("CETAS_STATIC_DIR", str(_mk_static(tmp_path)))
    from server import _ssi_render
    (tmp_path / "a.html").write_text('<!--#include file="a.html" -->')
    out = _ssi_render("a.html")
    assert "#include" not in out


def test_content_type():
    from server import _static_content_type
    assert _static_content_type("a.mjs") == "application/javascript; charset=utf-8"
    assert _static_content_type("a.css") == "text/css; charset=utf-8"
    assert _static_content_type("a.bin") == "application/octet-stream"
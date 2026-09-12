"""Tests du formatage des sorties outils façon OpenCode (Task P2.1).

Env défini avant import (side effects module-level).
"""

import os
import sys
import tempfile

# ---------------------------------------------------------------------------
# Set env vars BEFORE importing server (module-level side effects)
# ---------------------------------------------------------------------------
_test_tmpdir_fmt = tempfile.mkdtemp(prefix="cetas_fmt_")
os.environ["CETAS_DATA_DIR"] = os.path.join(_test_tmpdir_fmt, "data")
os.makedirs(os.environ["CETAS_DATA_DIR"], exist_ok=True)

# ---------------------------------------------------------------------------
# Import setup — point at server/ so `import marexcode` resolves
# ---------------------------------------------------------------------------
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))


def test_read():
    from marexcode import format_tool_output
    assert format_tool_output("read", {"file_path": "src/a.py"}, {"lines_read": 42, "total_lines": 100}) \
        == "Read 42 lines from src/a.py"


def test_read_pagination():
    from marexcode import format_tool_output
    assert format_tool_output("read", {"file_path": "a.py"}, {"lines_read": 10, "offset": 5, "limit": 10}) \
        == "Read 10 lines from a.py (offset 5, limit 10)"


def test_edit():
    from marexcode import format_tool_output
    r = {"path": "a.py", "replacements": 1, "additions": 2, "deletions": 1, "patch": "-x\n+y"}
    out = format_tool_output("edit", {"file_path": "a.py"}, r)
    assert out.startswith("Edited file successfully: a.py")
    assert "Replacements: 1" in out
    assert "```diff" in out and "-x" in out


def test_write_created_vs_wrote():
    from marexcode import format_tool_output
    assert format_tool_output("write", {}, {"ok": True, "path": "f.txt", "existed": False}) == "Created file: f.txt"
    assert format_tool_output("write", {}, {"ok": True, "path": "f.txt", "existed": True}) == "Wrote file: f.txt"


def test_bash():
    from marexcode import format_tool_output
    assert format_tool_output("bash", {}, {"stdout": "out", "code": 1}) == "Command exited with code 1\nout"


def test_bash_stderr():
    from marexcode import format_tool_output
    out = format_tool_output("bash", {}, {"stdout": "out", "stderr": "err", "code": 2})
    assert out == "Command exited with code 2\nout\nstderr:\nerr"


def test_grep():
    from marexcode import format_tool_output
    assert format_tool_output("grep", {}, {"matches": 3, "stdout": "a.py:1: x"}) == "Found 3 matches\na.py:1: x"


def test_ls():
    from marexcode import format_tool_output
    assert format_tool_output("ls", {}, {"files": [{"path": "a.py"}, {"path": "b.py"}]}) == "Found 2 files\na.py\nb.py"
"""
LSP Manager — Language Server Protocol integration for Marexcode.

Manages LSP server processes per workspace, communicates via JSON-RPC
over stdin/stdout. Supports: initialize, definition, references, hover,
documentSymbol, implementation.

Usage from MarexcodeMixin:
    manager = LSPManager(workspace_root)
    result = manager.request("definition", file="src/app.ts", line=10, character=5)
"""

import os
import json
import logging
import subprocess
import threading
import time

log = logging.getLogger(__name__)

# Default LSP server configs by language extension
DEFAULT_LSP_CONFIGS = {
    ".py": {"command": ["pyright-langserver", "--stdio"], "language": "python"},
    ".js": {"command": ["typescript-language-server", "--stdio"], "language": "javascript"},
    ".ts": {"command": ["typescript-language-server", "--stdio"], "language": "typescript"},
    ".jsx": {"command": ["typescript-language-server", "--stdio"], "language": "javascriptreact"},
    ".tsx": {"command": ["typescript-language-server", "--stdio"], "language": "typescriptreact"},
    ".go": {"command": ["gopls"], "language": "go"},
    ".rs": {"command": ["rust-analyzer"], "language": "rust"},
    ".java": {"command": ["jdtls"], "language": "java"},
    ".c": {"command": ["clangd"], "language": "c"},
    ".cpp": {"command": ["clangd"], "language": "cpp"},
    ".h": {"command": ["clangd"], "language": "c"},
    ".rb": {"command": ["solargraph", "stdio"], "language": "ruby"},
}


class LSPServer:
    """Manages a single LSP server process."""

    def __init__(self, command, workspace_root):
        self.command = command
        self.workspace_root = workspace_root
        self.process = None
        self._request_id = 0
        self._lock = threading.Lock()
        self._initialized = False
        self._response_buffer = {}
        self._buffer_lock = threading.Lock()
        self._reader_thread = None

    def start(self):
        if self.process and self.process.poll() is None:
            return True
        try:
            self.process = subprocess.Popen(
                self.command,
                stdin=subprocess.PIPE,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                cwd=self.workspace_root,
                text=True,
                bufsize=1,
            )
            self._reader_thread = threading.Thread(target=self._read_loop, daemon=True)
            self._reader_thread.start()
            self._initialized = False
            return True
        except FileNotFoundError:
            log.error("LSP binary not found: %s", self.command[0])
            return False
        except Exception as e:
            log.error("Failed to start LSP: %s", e)
            return False

    def stop(self):
        if self.process and self.process.poll() is None:
            try:
                self.process.terminate()
                self.process.wait(timeout=5)
            except Exception:
                try:
                    self.process.kill()
                except Exception:
                    pass
        self._initialized = False

    def _read_loop(self):
        """Background thread reading JSON-RPC responses from stdout."""
        try:
            while self.process and self.process.poll() is None:
                header_line = self.process.stdout.readline()
                if not header_line:
                    break
                header_line = header_line.strip()
                if not header_line:
                    continue
                content_length = 0
                while header_line:
                    if header_line.lower().startswith("content-length:"):
                        content_length = int(header_line.split(":", 1)[1].strip())
                    header_line = self.process.stdout.readline().strip()
                if content_length <= 0:
                    continue
                body = self.process.stdout.read(content_length)
                if not body:
                    break
                msg = json.loads(body)
                msg_id = msg.get("id")
                if msg_id is not None:
                    with self._buffer_lock:
                        self._response_buffer[msg_id] = msg
        except Exception as e:
            log.debug("LSP reader stopped: %s", e)

    def _send_request(self, method, params=None, timeout=10):
        if not self.process or self.process.poll() is not None:
            return {"error": "LSP server not running"}
        with self._lock:
            self._request_id += 1
            req_id = self._request_id
        msg = {"jsonrpc": "2.0", "id": req_id, "method": method}
        if params:
            msg["params"] = params
        body = json.dumps(msg)
        header = "Content-Length: %d\r\n\r\n" % len(body)
        try:
            self.process.stdin.write(header + body)
            self.process.stdin.flush()
        except Exception as e:
            return {"error": "Failed to write to LSP: %s" % e}
        deadline = time.time() + timeout
        while time.time() < deadline:
            with self._buffer_lock:
                if req_id in self._response_buffer:
                    resp = self._response_buffer.pop(req_id)
                    if "error" in resp:
                        return {"error": resp["error"].get("message", str(resp["error"]))}
                    return resp.get("result", {})
            time.sleep(0.05)
        return {"error": "LSP request timed out (%ds)" % timeout}

    def _send_notification(self, method, params=None):
        if not self.process or self.process.poll() is not None:
            return
        msg = {"jsonrpc": "2.0", "method": method}
        if params:
            msg["params"] = params
        body = json.dumps(msg)
        header = "Content-Length: %d\r\n\r\n" % len(body)
        try:
            self.process.stdin.write(header + body)
            self.process.stdin.flush()
        except Exception:
            pass

    def initialize(self):
        if self._initialized:
            return {"ok": True}
        params = {
            "processId": os.getpid(),
            "capabilities": {
                "textDocument": {
                    "hover": {"contentFormat": ["markdown", "plaintext"]},
                    "definition": {"dynamicRegistration": False},
                    "references": {"dynamicRegistration": False},
                    "documentSymbol": {"dynamicRegistration": False},
                }
            },
            "rootUri": "file://%s" % self.workspace_root,
            "workspaceFolders": [{"uri": "file://%s" % self.workspace_root, "name": "workspace"}],
        }
        result = self._send_request("initialize", params, timeout=15)
        if "error" not in result:
            self._send_notification("initialized")
            self._initialized = True
        return result

    def _uri_for_file(self, file_path):
        abs_path = os.path.join(self.workspace_root, file_path)
        return "file://%s" % os.path.realpath(abs_path)

    def definition(self, file, line, character):
        params = {
            "textDocument": {"uri": self._uri_for_file(file)},
            "position": {"line": line, "character": character},
        }
        return self._send_request("textDocument/definition", params)

    def references(self, file, line, character):
        params = {
            "textDocument": {"uri": self._uri_for_file(file)},
            "position": {"line": line, "character": character},
            "context": {"includeDeclaration": True},
        }
        return self._send_request("textDocument/references", params)

    def hover(self, file, line, character):
        params = {
            "textDocument": {"uri": self._uri_for_file(file)},
            "position": {"line": line, "character": character},
        }
        return self._send_request("textDocument/hover", params, timeout=15)

    def document_symbol(self, file):
        params = {"textDocument": {"uri": self._uri_for_file(file)}}
        return self._send_request("textDocument/documentSymbol", params)

    def did_open(self, file, content, language="text"):
        params = {
            "textDocument": {
                "uri": self._uri_for_file(file),
                "languageId": language,
                "version": 1,
                "text": content,
            }
        }
        self._send_notification("textDocument/didOpen", params)

    def did_change(self, file, content, version=1):
        params = {
            "textDocument": {"uri": self._uri_for_file(file), "version": version},
            "contentChanges": [{"text": content}],
        }
        self._send_notification("textDocument/didChange", params)


class LSPManager:
    """Manages LSP server instances per workspace."""

    def __init__(self, workspace_root, config=None):
        self.workspace_root = workspace_root
        self.config = config or {}
        self._servers = {}

    def _detect_language(self, file_path):
        ext = os.path.splitext(file_path)[1].lower()
        return DEFAULT_LSP_CONFIGS.get(ext)

    def _get_server(self, file_path):
        lang_config = self._detect_language(file_path)
        if not lang_config:
            return None
        cmd_key = tuple(lang_config["command"])
        if cmd_key not in self._servers:
            server = LSPServer(lang_config["command"], self.workspace_root)
            if server.start():
                server.initialize()
                self._servers[cmd_key] = server
            else:
                return None
        return self._servers[cmd_key]

    def request(self, operation, file=None, line=None, character=None, query=None):
        if not file:
            return {"error": "file parameter required"}
        server = self._get_server(file)
        if not server:
            return {"error": "No LSP server available for this file type"}
        try:
            if operation == "definition":
                return server.definition(file, line or 0, character or 0)
            elif operation == "references":
                return server.references(file, line or 0, character or 0)
            elif operation == "hover":
                return server.hover(file, line or 0, character or 0)
            elif operation == "symbol":
                return server.document_symbol(file)
            else:
                return {"error": "Unknown LSP operation: %s" % operation}
        except Exception as e:
            return {"error": "LSP error: %s" % e}

    def shutdown(self):
        for server in self._servers.values():
            server.stop()
        self._servers.clear()

"""
MCP Client Manager — Model Context Protocol integration for Marexcode.

Connects to external MCP servers (stdio local or HTTP remote), discovers
their tools, and executes tool calls. Acts as an MCP client, not server.

Usage from MarexcodeMixin:
    manager = MCPManager(workspace_root)
    servers = manager.list_servers()
    tools = manager.list_tools("context7")
    result = manager.call_tool("context7", "resolve_library_id", {"library": "react"})
"""

import os
import json
import logging
import asyncio
from contextlib import AsyncExitStack

log = logging.getLogger(__name__)


def _load_mcp_config(workspace_root: str) -> dict:
    """Charge mcp.json depuis le workspace."""
    path = os.path.join(workspace_root, "mcp.json")
    if os.path.isfile(path):
        try:
            with open(path, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception as e:
            log.warning("Failed to load mcp.json: %s", e)
    return {"mcp": {}}


class MCPServerConnection:
    """Manages a single MCP server connection (stdio or HTTP)."""

    def __init__(self, name: str, config: dict):
        self.name = name
        self.config = config
        self.session = None
        self._stack = None
        self._tools = []
        self.connected = False

    def _transport_type(self) -> str:
        cfg = self.config
        if cfg.get("type") == "stdio" or "command" in cfg:
            return "stdio"
        if cfg.get("type") == "sse":
            return "sse"
        return "http"

    async def connect(self):
        if self.connected:
            return True
        try:
            self._stack = AsyncExitStack()
            await self._stack.__aenter__()

            transport = self._transport_type()

            if transport == "stdio":
                from mcp import StdioServerParameters
                from mcp.client.stdio import stdio_client
                command = self.config.get("command", "")
                args = self.config.get("args", [])
                env = self.config.get("env")
                params = StdioServerParameters(command=command, args=args, env=env)
                result = await self._stack.enter_async_context(stdio_client(params))
            elif transport == "sse":
                from mcp.client.sse import sse_client
                url = self.config.get("url", "")
                headers = self.config.get("headers", {})
                result = await self._stack.enter_async_context(sse_client(url=url, headers=headers))
            else:
                from mcp.client.streamable_http import streamablehttp_client
                url = self.config.get("url", "")
                headers = self.config.get("headers", {})
                result = await self._stack.enter_async_context(streamablehttp_client(url=url, headers=headers))

            if len(result) == 2:
                read, write = result
            elif len(result) == 3:
                read, write, _ = result
            else:
                raise ValueError("Unexpected connection result")

            from mcp import ClientSession
            session_ctx = ClientSession(read, write)
            self.session = await self._stack.enter_async_context(session_ctx)
            await self.session.initialize()
            self.connected = True

            response = await self.session.list_tools()
            self._tools = [
                {
                    "name": tool.name,
                    "description": tool.description or "",
                    "inputSchema": tool.inputSchema if hasattr(tool, 'inputSchema') else {},
                }
                for tool in response.tools
            ]
            log.info("MCP connected: %s (%d tools)", self.name, len(self._tools))
            return True
        except Exception as e:
            log.error("MCP connect failed for %s: %s", self.name, e)
            await self.disconnect()
            return False

    async def disconnect(self):
        if self._stack:
            try:
                await self._stack.__aexit__(None, None, None)
            except Exception:
                pass
        self.session = None
        self._stack = None
        self._tools = []
        self.connected = False

    async def list_tools(self) -> list:
        if not self.connected:
            await self.connect()
        return self._tools

    async def call_tool(self, tool_name: str, arguments: dict) -> dict:
        if not self.connected:
            ok = await self.connect()
            if not ok:
                return {"error": "Failed to connect to MCP server: %s" % self.name}
        try:
            result = await self.session.call_tool(tool_name, arguments=arguments)
            contents = []
            for item in (result.content or []):
                if hasattr(item, 'text'):
                    contents.append({"type": "text", "text": item.text})
                elif hasattr(item, 'data'):
                    contents.append({"type": "image", "data": item.data, "mimeType": getattr(item, 'mimeType', "")})
                else:
                    contents.append({"type": "text", "text": str(item)})
            return {"content": contents, "isError": getattr(result, 'isError', False)}
        except Exception as e:
            return {"error": "MCP tool call failed: %s" % e}


class MCPManager:
    """Manages MCP server connections for a workspace."""

    _instances = {}

    def __new__(cls, workspace_root):
        key = os.path.realpath(workspace_root)
        if key not in cls._instances:
            inst = super().__new__(cls)
            inst.workspace_root = workspace_root
            inst._connections = {}
            inst._config = {}
            cls._instances[key] = inst
        return cls._instances[key]

    def _load_config(self):
        self._config = _load_mcp_config(self.workspace_root)
        return self._config

    def _ensure_config(self):
        if not self._config:
            self._load_config()

    def list_servers(self) -> list:
        self._ensure_config()
        servers = []
        for name, cfg in self._config.get("mcp", {}).items():
            conn = self._connections.get(name)
            servers.append({
                "name": name,
                "type": cfg.get("type", "http" if "url" in cfg else "stdio"),
                "command": cfg.get("command"),
                "url": cfg.get("url"),
                "connected": conn.connected if conn else False,
                "tools_count": len(conn._tools) if conn else 0,
            })
        return servers

    def list_tools(self, server_name: str) -> list:
        self._ensure_config()
        cfg = self._config.get("mcp", {}).get(server_name)
        if not cfg:
            return []
        conn = self._get_connection(server_name, cfg)
        try:
            tools = asyncio.run(conn.list_tools())
            return tools
        except Exception as e:
            log.error("MCP list_tools failed for %s: %s", server_name, e)
            return []

    def call_tool(self, server_name: str, tool_name: str, arguments: dict) -> dict:
        self._ensure_config()
        cfg = self._config.get("mcp", {}).get(server_name)
        if not cfg:
            return {"error": "Server not found: %s" % server_name}
        conn = self._get_connection(server_name, cfg)
        try:
            return asyncio.run(conn.call_tool(tool_name, arguments))
        except Exception as e:
            return {"error": "MCP call failed: %s" % e}

    def get_all_tools(self) -> list:
        """Returns all tools from all connected MCP servers (for agent injection)."""
        self._ensure_config()
        all_tools = []
        for name, cfg in self._config.get("mcp", {}).items():
            conn = self._get_connection(name, cfg)
            try:
                tools = asyncio.run(conn.list_tools())
                for tool in tools:
                    all_tools.append({
                        "server": name,
                        "name": tool["name"],
                        "description": tool["description"],
                        "inputSchema": tool.get("inputSchema", {}),
                    })
            except Exception as e:
                log.warning("MCP get_all_tools failed for %s: %s", name, e)
        return all_tools

    def _get_connection(self, name: str, cfg: dict) -> MCPServerConnection:
        if name not in self._connections:
            self._connections[name] = MCPServerConnection(name, cfg)
        return self._connections[name]

    def shutdown(self):
        for conn in self._connections.values():
            try:
                asyncio.run(conn.disconnect())
            except Exception:
                pass
        self._connections.clear()

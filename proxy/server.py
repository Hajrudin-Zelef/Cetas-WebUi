#!/usr/bin/env python3
"""
Cetas API Proxy Server
Déchiffre les clés API depuis .env (via proxy_key du vault .enc),
forwarde les requêtes aux providers en injectant l'authentification.

Utilise uniquement stdlib + cryptography (déjà installé).
"""

import os
import sys
import json
import http.client
import logging
import importlib.util
from http.server import HTTPServer, BaseHTTPRequestHandler
from urllib.parse import urlparse

from cryptography.hazmat.primitives.ciphers.aead import AESGCM

logging.basicConfig(level=logging.INFO, format="[proxy] %(message)s")
log = logging.getLogger(__name__)

# ── Chemins (local dev ou Docker) ──────────────────────────────────
BASE_DIR = os.environ.get("CETAS_BASE_DIR", os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
VAULT_PATH = os.environ.get("CETAS_VAULT_PATH", os.path.join(BASE_DIR, ".vault", ".enc"))
ENV_PATH = os.environ.get("CETAS_ENV_PATH", os.path.join(BASE_DIR, ".env"))
CRYPTO_PATH = os.environ.get("CETAS_CRYPTO_PATH", os.path.join(BASE_DIR, "core", "linux", "crypto_linux.py"))

# ── Configuration providers ──────────────────────────────────────────
PROVIDER_CONFIG = {
    "openai": {
        "base_url": "https://api.openai.com",
        "auth": {"type": "header", "header": "Authorization", "prefix": "Bearer "},
    },
    "anthropic": {
        "base_url": "https://api.anthropic.com",
        "auth": {"type": "header", "header": "x-api-key"},
        "extra_headers": {"anthropic-version": "2023-06-01"},
    },
    "google": {
        "base_url": "https://generativelanguage.googleapis.com",
        "auth": {"type": "query", "param": "key"},
    },
    "deepseek": {
        "base_url": "https://api.deepseek.com",
        "auth": {"type": "header", "header": "Authorization", "prefix": "Bearer "},
    },
    "openrouter": {
        "base_url": "https://openrouter.ai",
        "auth": {"type": "header", "header": "Authorization", "prefix": "Bearer "},
        "extra_headers": {"HTTP-Referer": "https://cetas.local/", "X-Title": "Cetas"},
    },
    "groq": {
        "base_url": "https://api.groq.com",
        "auth": {"type": "header", "header": "Authorization", "prefix": "Bearer "},
    },
    "nvidia": {
        "base_url": "https://integrate.api.nvidia.com",
        "auth": {"type": "header", "header": "Authorization", "prefix": "Bearer "},
    },
    "mistral": {
        "base_url": "https://api.mistral.ai",
        "auth": {"type": "header", "header": "Authorization", "prefix": "Bearer "},
    },
    "perplexity": {
        "base_url": "https://api.perplexity.ai",
        "auth": {"type": "header", "header": "Authorization", "prefix": "Bearer "},
    },
    "grok": {
        "base_url": "https://api.x.ai",
        "auth": {"type": "header", "header": "Authorization", "prefix": "Bearer "},
    },
    "zai": {
        "base_url": "https://api.z.ai",
        "auth": {"type": "header", "header": "Authorization", "prefix": "Bearer "},
    },
    "cabreras": {
        "base_url": "https://api.cabreras.ai",
        "auth": {"type": "header", "header": "Authorization", "prefix": "Bearer "},
    },
}

# ── État global ──────────────────────────────────────────────────────
api_keys: dict[str, str] = {}


def _load_vault():
    """Charge le module crypto_linux.py dynamiquement et retourne SecureVault."""
    if not os.path.exists(CRYPTO_PATH):
        log.error("Module crypto introuvable: %s", CRYPTO_PATH)
        sys.exit(1)
    spec = importlib.util.spec_from_file_location("crypto_linux", CRYPTO_PATH)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod.SecureVault


def load_api_keys():
    """Déchiffre les clés API depuis .env en utilisant le proxy_key du vault."""
    password = os.environ.get("CETAS_VAULT_PASSWORD", "").strip()
    if not password:
        log.error("CETAS_VAULT_PASSWORD non défini — arrêt.")
        sys.exit(1)

    if not os.path.exists(VAULT_PATH):
        log.error("Vault introuvable: %s", VAULT_PATH)
        sys.exit(1)

    if not os.path.exists(ENV_PATH):
        log.error(".env introuvable: %s — lancez setup.py d'abord.", ENV_PATH)
        sys.exit(1)

    SecureVault = _load_vault()
    vault = SecureVault(VAULT_PATH)

    try:
        data = vault.load(password)
    except Exception as e:
        log.error("Échec ouverture vault: %s", e)
        sys.exit(1)

    if not data or "proxy_key" not in data:
        log.error("proxy_key absent du vault — relancez setup.py.")
        sys.exit(1)

    proxy_key = bytes.fromhex(data["proxy_key"])

    loaded = 0
    with open(ENV_PATH, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, val = line.split("=", 1)
            provider = key.lower().replace("_key", "").replace(" ", "_")

            if ":" not in val:
                log.warning("Entrée .env ignorée (format invalide): %s", key)
                continue

            iv_hex, ct_hex = val.split(":", 1)
            try:
                iv = bytes.fromhex(iv_hex)
                ct = bytes.fromhex(ct_hex)
            except ValueError:
                log.warning("Décodage hex échoué pour %s", key)
                continue

            try:
                aesgcm = AESGCM(proxy_key)
                plaintext = aesgcm.decrypt(iv, ct, provider.encode("utf-8"))
                api_keys[provider] = plaintext.decode("utf-8")
                loaded += 1
            except Exception as e:
                log.error("Échec déchiffrement %s: %s", provider, e)
                sys.exit(1)

    log.info("%d clés API chargées en mémoire.", loaded)
    if loaded == 0:
        log.error("Aucune clé chargée — vérifiez .env et le vault.")
        sys.exit(1)


def _build_upstream(method: str, provider: str, path: str, body: bytes, content_type: str | None):
    """Construit et envoie la requête upstream.
    Retourne (status, resp_headers, response, conn)."""
    config = PROVIDER_CONFIG[provider]
    api_key = api_keys[provider]
    base_url = config["base_url"]
    auth = config["auth"]

    # URL complète
    if auth["type"] == "query":
        sep = "&" if "?" in path else "?"
        url_path = f"{path}{sep}{auth['param']}={api_key}"
    else:
        url_path = path

    # Headers upstream
    headers = {}
    if content_type:
        headers["Content-Type"] = content_type
    if auth["type"] == "header":
        prefix = auth.get("prefix", "")
        headers[auth["header"]] = f"{prefix}{api_key}"
    for h, v in config.get("extra_headers", {}).items():
        headers[h] = v

    parsed = urlparse(base_url)
    host = parsed.hostname
    port = parsed.port or (443 if parsed.scheme == "https" else 80)

    # Préfixer avec le chemin du base_url (ex: /openai pour Groq)
    base_path = parsed.path.rstrip("/")
    if base_path:
        url_path = base_path + url_path

    conn = http.client.HTTPSConnection(host, port, timeout=300)
    try:
        conn.request(method, url_path, body=body, headers=headers)
        response = conn.getresponse()

        # Forward response headers (sauf ceux gérés par nginx/http)
        resp_headers = {}
        for h, v in response.getheaders():
            hl = h.lower()
            if hl not in ("transfer-encoding", "content-encoding", "content-length", "connection"):
                resp_headers[h] = v

        return response.status, resp_headers, response, conn
    except Exception:
        conn.close()
        raise


class ProxyHandler(BaseHTTPRequestHandler):
    # Mapping provider names .env → frontend API_KEYS
    _KEY_MAP = {
        'nvidia_nim': 'nvidia',
        'nvidia': 'nvidia',
    }

    def _respond_json(self, data: dict, status: int = 200):
        body = json.dumps(data).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        if self.path in ("/health", "/api/health"):
            self._respond_json({"status": "ok", "keys_loaded": len(api_keys)})
            return

        # Endpoint : renvoie les clés API déchiffrées au frontend
        # (uniquement accessible depuis localhost)
        if self.path == "/api/keys":
            mapped = {}
            for k, v in api_keys.items():
                frontend_key = self._KEY_MAP.get(k, k)
                mapped[frontend_key] = v
            self._respond_json(mapped)
            return

        # Support GET proxy pour catalogue OpenRouter
        if self.path.startswith("/api/proxy/"):
            self._proxy_request("GET")
            return

        self.send_response(404)
        self.end_headers()

    def do_POST(self):
        if self.path.startswith("/api/proxy/"):
            self._proxy_request("POST")
            return
        self.send_response(404)
        self.end_headers()

    def _proxy_request(self, method: str):
        # Parse /api/proxy/{provider}/...
        path_parts = self.path[len("/api/proxy/"):]
        if "/" not in path_parts:
            self._error(400, "Chemin proxy invalide")
            return

        provider, upstream_path = path_parts.split("/", 1)
        provider = provider.lower()

        if provider not in PROVIDER_CONFIG:
            self._error(400, f"Provider inconnu: {provider}")
            return
        if provider not in api_keys:
            self._error(400, f"Pas de clé pour: {provider}")
            return

        upstream_path = "/" + upstream_path

        # Lire le body
        content_length = int(self.headers.get("Content-Length", 0))
        body = self.rfile.read(content_length) if content_length > 0 else b""
        content_type = self.headers.get("Content-Type")

        try:
            status, resp_headers, response, conn = _build_upstream(
                method, provider, upstream_path, body, content_type
            )
        except http.client.HTTPException as e:
            self._error(502, f"Erreur connexion upstream: {e}")
            log.warning("POST /api/proxy/%s/... -> 502 (%s)", provider, e)
            return
        except Exception as e:
            self._error(502, f"Erreur proxy: {e}")
            log.warning("POST /api/proxy/%s/... -> 502 (%s)", provider, e)
            return

        try:
            self.send_response(status)
            for h, v in resp_headers.items():
                self.send_header(h, v)
            self.end_headers()

            # Streamer la réponse (chunked → SSE ou JSON)
            while True:
                try:
                    chunk = response.read(4096)
                except Exception:
                    break
                if not chunk:
                    break
                try:
                    self.wfile.write(chunk)
                    self.wfile.flush()
                except (BrokenPipeError, ConnectionResetError):
                    break

            log.info("%s /api/proxy/%s/... -> %d", method, provider, status)
        finally:
            try:
                response.close()
            except Exception:
                pass
            try:
                conn.close()
            except Exception:
                pass

    def _error(self, code: int, msg: str):
        body = json.dumps({"error": msg}).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, fmt, *args):
        pass  # On logue nous-mêmes dans _proxy_request


def main():
    port = int(os.environ.get("PROXY_PORT", "8080"))
    load_api_keys()
    server = HTTPServer(("127.0.0.1", port), ProxyHandler)
    log.info("Proxy prêt sur 127.0.0.1:%d", port)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        log.info("Arrêt proxy.")
        server.shutdown()


if __name__ == "__main__":
    main()

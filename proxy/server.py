#!/usr/bin/env python3
"""
Cetas API Proxy Server — © Marexsoft Corporation. Fondateur Kouassi Marius.
Déchiffre les clés API depuis .env (via proxy_key du vault .enc),
forwarde les requêtes aux providers en injectant l'authentification.

Utilise uniquement stdlib + cryptography (déjà installé).
"""

import os
import sys
import json
import hashlib
import http.client
import logging
import importlib.util
import datetime
import time
from http.server import HTTPServer, BaseHTTPRequestHandler
from urllib.parse import urlparse, unquote

import jwt
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

# ── Paths autorisés par provider (évite l'abus du proxy) ─────────────
PROXY_ALLOWED_PATHS: dict[str, list[str]] = {
    "openai":     ["/v1/chat/completions", "/v1/models", "/v1/images/"],
    "anthropic":  ["/v1/messages"],
    "google":     ["/v1beta/models/"],
    "deepseek":   ["/chat/completions", "/v1/chat/completions"],
    "openrouter": ["/api/v1/chat/completions", "/api/v1/models"],
    "groq":       ["/openai/v1/chat/completions", "/openai/v1/models", "/openai/v1/audio/"],
    "nvidia":     ["/v1/chat/completions", "/v1/models"],
    "mistral":    ["/v1/chat/completions"],
    "perplexity": ["/chat/completions"],
    "grok":       ["/v1/chat/completions"],
    "zai":        ["/api/paas/v4/chat/completions"],
    "cabreras":   ["/v1/chat/completions"],
}

def _is_path_allowed(provider: str, path: str) -> bool:
    allowed = PROXY_ALLOWED_PATHS.get(provider, [])
    if not allowed:
        return False
    for prefix in allowed:
        if path.startswith(prefix):
            return True
    return False

# ── État global ──────────────────────────────────────────────────────
api_keys: dict[str, str] = {}

# ── Configuration CORS ────────────────────────────────────────────────
ALLOWED_ORIGINS = os.environ.get("CETAS_CORS_ORIGINS", "https://samui.neva-ci.pro").split(",")

def _cors_origin(requested_origin: str | None) -> str:
    """Retourne l'origine si autorisée, sinon la première origine de la liste."""
    if not requested_origin:
        return ALLOWED_ORIGINS[0]
    for allowed in ALLOWED_ORIGINS:
        if allowed == "*" or allowed == requested_origin:
            return requested_origin
    return ALLOWED_ORIGINS[0]  # fallback safe
_rate_buckets: dict[str, list] = {}

def _rate_check(key: str, max_req: int = 10, window: int = 60) -> bool:
    now = time.time()
    bucket = _rate_buckets.get(key, [])
    bucket = [t for t in bucket if now - t < window]
    if len(bucket) >= max_req:
        _rate_buckets[key] = bucket
        return False
    bucket.append(now)
    _rate_buckets[key] = bucket
    return True

# ── Stockage utilisateurs ────────────────────────────────────────────
USERS_SEED_PATH = os.path.join(BASE_DIR, "core", "users-seed.json")

_jwt_secret: str = ""
_users: dict[str, dict] = {}

# Paramètres scrypt — N=65536 = 64 MB RAM (compromis sécurité/conteneur)
_SCRYPT_N = 65536
_SCRYPT_R = 8
_SCRYPT_P = 1

def _hash_password(password: str) -> str:
    salt = os.urandom(16)
    h = hashlib.scrypt(password.encode("utf-8"), salt=salt, n=_SCRYPT_N, r=_SCRYPT_R, p=_SCRYPT_P)
    return f"scrypt${_SCRYPT_N}${_SCRYPT_R}${_SCRYPT_P}${salt.hex()}${h.hex()}"

def _verify_password(password: str, stored: str) -> bool:
    if "$" not in stored:
        # Ancien format sans préfixe = SHA-256 brut
        return hashlib.sha256(password.encode("utf-8")).hexdigest() == stored
    algo, rest = stored.split("$", 1)
    if algo == "sha256":
        return hashlib.sha256(password.encode("utf-8")).hexdigest() == rest
    if algo == "scrypt":
        parts = rest.split("$")
        if len(parts) == 2:
            # Legacy: scrypt$salt$hash (n=16384, r=8, p=1)
            salt_hex, hash_hex = parts
            n, r, p = 16384, 8, 1
        elif len(parts) == 5:
            # Nouveau: scrypt$n$r$p$salt$hash
            try:
                n, r, p = int(parts[0]), int(parts[1]), int(parts[2])
                salt_hex, hash_hex = parts[3], parts[4]
            except (ValueError, IndexError):
                return False
        else:
            return False
        try:
            salt = bytes.fromhex(salt_hex)
            h = hashlib.scrypt(password.encode("utf-8"), salt=salt, n=n, r=r, p=p)
            return h.hex() == hash_hex
        except Exception:
            return False
    return False

def _needs_password_upgrade(stored: str) -> bool:
    """Retourne True si le hash est faible (SHA-256 ou scrypt N<131072)."""
    if not stored.startswith("scrypt$"):
        return True  # SHA-256 → migrer vers scrypt
    parts = stored.count("$")
    if parts == 2:
        return True  # Legacy scrypt sans params → N=16384 trop faible
    if parts == 4:
        try:
            n = int(stored.split("$")[1])
            return n < _SCRYPT_N
        except (ValueError, IndexError):
            return True
    return False

def _load_users() -> dict[str, dict]:
    global _users
    if _users:
        return _users
    # Migration: déplacer l'ancien _users.json vers le nouveau emplacement
    old_path = os.path.join(CONV_DIR, "_users.json")
    if not os.path.exists(USERS_PATH) and os.path.exists(old_path):
        try:
            import shutil
            shutil.move(old_path, USERS_PATH)
            log.info("users.json migré vers %s", USERS_PATH)
        except Exception:
            pass
    if os.path.exists(USERS_PATH):
        try:
            with open(USERS_PATH, "r", encoding="utf-8") as f:
                data = json.load(f)
            _users = data.get("users", {}) if isinstance(data, dict) else {}
        except Exception:
            _users = {}
    if not _users and os.path.exists(USERS_SEED_PATH):
        try:
            with open(USERS_SEED_PATH, "r", encoding="utf-8") as f:
                seed = json.load(f)
            if isinstance(seed, list):
                for su in seed:
                    uname = su.get("username", "").strip()
                    if uname and uname not in _users:
                        _users[uname] = {
                            "username": uname,
                            "email": su.get("email", ""),
                            "password_hash": su.get("password_hash", ""),
                            "role": "admin",
                            "created_at": su.get("created_at", datetime.datetime.utcnow().isoformat())
                        }
                _save_users()
                log.info("%d utilisateur(s) importés du seed.", len(_users))
        except Exception as e:
            log.warning("Seed users ignoré: %s", e)
    return _users

def _save_users() -> None:
    data = {"version": 2, "users": _users}
    with open(USERS_PATH, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

def _get_jwt_secret() -> str:
    global _jwt_secret
    if _jwt_secret:
        return _jwt_secret
    # 1) Nouvel emplacement : .jwt_secret (fichier dédié, 0o600)
    if os.path.exists(JWT_SECRET_PATH):
        try:
            with open(JWT_SECRET_PATH, "r", encoding="utf-8") as f:
                _jwt_secret = f.read().strip()
            if _jwt_secret:
                return _jwt_secret
        except Exception:
            pass
    # 2) Migration depuis l'ancien users.json (v1)
    if os.path.exists(USERS_PATH):
        try:
            with open(USERS_PATH, "r", encoding="utf-8") as f:
                meta = json.load(f)
            legacy = meta.get("jwt_secret", "")
            if legacy:
                _jwt_secret = legacy
                _persist_jwt_secret()
                _save_users()  # nettoie jwt_secret du users.json
                log.info("JWT secret migré vers .jwt_secret")
                return _jwt_secret
        except Exception:
            pass
    # 3) Générer un nouveau secret
    import secrets
    _jwt_secret = secrets.token_hex(32)
    _persist_jwt_secret()
    log.info("Nouveau secret JWT généré.")
    return _jwt_secret

def _persist_jwt_secret() -> None:
    os.makedirs(os.path.dirname(JWT_SECRET_PATH), exist_ok=True)
    with open(JWT_SECRET_PATH, "w", encoding="utf-8") as f:
        f.write(_jwt_secret)
    os.chmod(JWT_SECRET_PATH, 0o600)

def _create_jwt(username: str, role: str) -> str:
    now = int(time.time())
    payload = {
        "sub": username,
        "role": role,
        "iat": now,
        "exp": now + 86400  # 24 heures
    }
    return jwt.encode(payload, _get_jwt_secret(), algorithm="HS256")

def _validate_jwt(token: str) -> dict | None:
    try:
        return jwt.decode(token, _get_jwt_secret(), algorithms=["HS256"])
    except Exception:
        return None


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

# ── Stockage conversations (sync multi-appareils) ──────────────────
DATA_DIR = os.environ.get("CETAS_DATA_DIR", "/app/data")
JWT_SECRET_PATH = os.path.join(DATA_DIR, ".jwt_secret")
CONV_DIR = os.path.join(BASE_DIR, "conversations")
os.makedirs(CONV_DIR, exist_ok=True)
os.makedirs(DATA_DIR, exist_ok=True)
USERS_PATH = os.path.join(DATA_DIR, "users.json")

# Cache RAM : {username: {filename: data_json}} pour accès rapide
_conv_cache: dict[str, dict[str, dict]] = {}
_conv_cache_ts: dict[str, float] = {}  # timestamp du dernier chargement par user
_CACHE_TTL = 3600  # 1 heure

def _conv_cache_get(username: str) -> dict[str, dict]:
    """Retourne le cache utilisateur, l'invalide si TTL dépassé."""
    now = time.time()
    if username in _conv_cache and username in _conv_cache_ts:
        if now - _conv_cache_ts[username] < _CACHE_TTL:
            return _conv_cache[username]
        # TTL expiré → vider le cache
        del _conv_cache[username]
        del _conv_cache_ts[username]
    if username not in _conv_cache:
        _conv_cache[username] = {}
        _conv_cache_ts[username] = now
    return _conv_cache[username]

def _conv_user_dir(username: str) -> str:
    """Répertoire des conversations d'un utilisateur."""
    safe = username.replace("/", "_").replace("\\", "_").strip()
    if not safe:
        raise ValueError("username invalide")
    d = os.path.join(CONV_DIR, safe)
    os.makedirs(d, exist_ok=True)
    return d

def _conv_file_path(username: str, filename: str) -> str:
    safe_fn = os.path.basename(filename)
    if not safe_fn or safe_fn.startswith('.'):
        raise ValueError("Nom de fichier invalide")
    full = os.path.realpath(os.path.join(_conv_user_dir(username), safe_fn))
    expected = os.path.realpath(_conv_user_dir(username))
    if not full.startswith(expected + os.sep) and full != expected:
        raise ValueError("Path traversal détecté")
    return full

def load_user_conversations(username: str) -> dict[str, dict]:
    """Charge toutes les conversations d'un utilisateur (depuis disque ou cache)."""
    cache = _conv_cache_get(username)
    if cache:
        return cache
    user_dir = _conv_user_dir(username)
    for fn in os.listdir(user_dir):
        if fn.endswith(".json"):
            try:
                with open(os.path.join(user_dir, fn), "r", encoding="utf-8") as f:
                    data = json.load(f)
                cache[fn] = data
            except Exception:
                pass
    return cache

def save_user_conversation(username: str, filename: str, data: dict) -> None:
    """Sauvegarde une conversation (disque + cache RAM)."""
    cache = _conv_cache_get(username)
    cache[filename] = data
    fp = _conv_file_path(username, filename)
    with open(fp, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False)

def delete_user_conversation(username: str, filename: str) -> bool:
    """Supprime une conversation. Retourne True si supprimée."""
    cache = _conv_cache_get(username)
    cache.pop(filename, None)
    fp = _conv_file_path(username, filename)
    if os.path.exists(fp):
        os.unlink(fp)
        return True
    return False


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

    def _get_authenticated_user(self):
        """Extrait et valide le JWT depuis le header Authorization Bearer."""
        auth = self.headers.get("Authorization", "").strip()
        if not auth.startswith("Bearer "):
            self._respond_json({"error": "Non authentifié"}, 401)
            return None
        token = auth[7:]
        payload = _validate_jwt(token)
        if not payload:
            self._respond_json({"error": "Token invalide ou expiré"}, 401)
            return None
        return payload.get("sub", "").strip()

    def _get_username(self):
        """Retourne le username depuis le JWT (plus de fallback X-Cetas-User)."""
        return ""

    def _require_admin(self) -> str | None:
        """Vérifie JWT + rôle admin. Retourne le username ou None."""
        auth = self.headers.get("Authorization", "").strip()
        if not auth.startswith("Bearer "):
            self._respond_json({"error": "Non authentifié"}, 401)
            return None
        token = auth[7:]
        payload = _validate_jwt(token)
        if not payload:
            self._respond_json({"error": "Token invalide ou expiré"}, 401)
            return None
        if payload.get("role") != "admin":
            self._respond_json({"error": "Permission refusée"}, 403)
            return None
        return payload.get("sub", "").strip()

    # ── Endpoints conversations ───────────────────────────────────────

    def _conv_list(self):
        username = self._get_authenticated_user()
        if not username:
            return
        try:
            convs = load_user_conversations(username)
            meta = []
            for fn, data in convs.items():
                meta.append({
                    "filename": fn,
                    "id": data.get("id", ""),
                    "title": data.get("title") or data.get("titre") or "",
                    "date": data.get("date", ""),
                    "lastActivity": data.get("lastActivity", data.get("date", "")),
                    "model": data.get("model") or data.get("modele", ""),
                    "category": data.get("category", None),
                    "tokens_entree": data.get("tokens_entree", 0),
                    "tokens_sortie": data.get("tokens_sortie", 0),
                    "cout_estime_usd": data.get("cout_estime_usd", 0)
                })
            meta.sort(key=lambda m: m.get("lastActivity") or m.get("date") or "", reverse=True)
            self._respond_json(meta)
        except Exception as e:
            self._respond_json({"error": str(e)}, 500)

    def _conv_get(self, filename: str):
        username = self._get_authenticated_user()
        if not username:
            return
        try:
            convs = load_user_conversations(username)
            data = convs.get(filename)
            if not data:
                self._respond_json({"error": "Conversation introuvable"}, 404)
                return
            self._respond_json(data)
        except Exception as e:
            self._respond_json({"error": str(e)}, 500)

    def _conv_save(self, filename: str):
        if not _rate_check("conv:" + self.client_address[0], 30, 60):
            self._respond_json({"error": "Trop de requêtes. Réessayez dans une minute."}, 429)
            return
        username = self._get_authenticated_user()
        if not username:
            return
        try:
            content_len = int(self.headers.get("Content-Length", 0))
            body = self.rfile.read(content_len) if content_len > 0 else b"{}"
            data = json.loads(body)
            save_user_conversation(username, filename, data)
            self._respond_json({"ok": True, "filename": filename})
        except Exception as e:
            self._respond_json({"error": str(e)}, 500)

    def _conv_delete(self, filename: str):
        username = self._get_authenticated_user()
        if not username:
            return
        try:
            deleted = delete_user_conversation(username, filename)
            if deleted:
                self._respond_json({"ok": True})
            else:
                self._respond_json({"error": "Conversation introuvable"}, 404)
        except Exception as e:
            self._respond_json({"error": str(e)}, 500)

    # ── Endpoints auth / utilisateurs ─────────────────────────────────

    def _auth_login(self):
        ip = self.client_address[0]
        if not _rate_check("login:" + ip, 10, 60):
            self._respond_json({"error": "Trop de tentatives. Réessayez dans une minute."}, 429)
            return
        content_len = int(self.headers.get("Content-Length", 0))
        body = self.rfile.read(content_len) if content_len > 0 else b"{}"
        try:
            data = json.loads(body)
        except json.JSONDecodeError:
            self._respond_json({"error": "JSON invalide"}, 400)
            return
        uname = data.get("username", "").strip()
        password = data.get("password", "").strip()
        if not uname or not password:
            self._respond_json({"error": "Identifiants requis."}, 400)
            return
        users = _load_users()
        u = users.get(uname)
        if not u or not _verify_password(password, u.get("password_hash", "")):
            self._respond_json({"error": "Identifiants incorrects."}, 401)
            return
        # Migration automatique SHA-256 → scrypt
        if _needs_password_upgrade(u.get("password_hash", "")):
            u["password_hash"] = _hash_password(password)
            _save_users()
            log.debug("Hash du compte %s migré vers scrypt.", uname)
        token = _create_jwt(uname, u.get("role", "user"))
        self._respond_json({
            "token": token,
            "user": {
                "username": u["username"],
                "email": u.get("email", ""),
                "role": u.get("role", "user"),
                "created_at": u.get("created_at", "")
            }
        })

    def _auth_register(self):
        ip = self.client_address[0]
        if not _rate_check("register:" + ip, 5, 60):
            self._respond_json({"error": "Trop de tentatives. Réessayez dans une minute."}, 429)
            return
        content_len = int(self.headers.get("Content-Length", 0))
        body = self.rfile.read(content_len) if content_len > 0 else b"{}"
        try:
            data = json.loads(body)
        except json.JSONDecodeError:
            self._respond_json({"error": "JSON invalide"}, 400)
            return
        uname = data.get("username", "").strip()
        email = data.get("email", "").strip()
        password = data.get("password", "").strip()
        if not uname or not password:
            self._respond_json({"error": "Username et mot de passe requis."}, 400)
            return
        if len(password) < 8:
            self._respond_json({"error": "Mot de passe trop court (minimum 8 caractères)."}, 400)
            return
        users = _load_users()
        if len(users) == 0:
            self._respond_json({"error": "Aucun admin configuré. Lancez setup.py d'abord."}, 403)
            return
        if uname in users:
            self._respond_json({"error": "Cet utilisateur existe déjà."}, 409)
            return
        role = "user"
        users[uname] = {
            "username": uname,
            "email": email,
            "password_hash": _hash_password(password),
            "role": role,
            "created_at": datetime.datetime.utcnow().isoformat()
        }
        _save_users()
        token = _create_jwt(uname, role)
        log.debug("Utilisateur créé: %s (role=%s)", uname, role)
        self._respond_json({
            "token": token,
            "user": {
                "username": uname,
                "email": email,
                "role": role,
                "created_at": users[uname]["created_at"]
            }
        }, 201)

    def _users_list(self):
        username = self._require_admin()
        if not username:
            return
        users = _load_users()
        result = []
        for name, u in users.items():
            result.append({
                "username": name,
                "email": u.get("email", ""),
                "role": u.get("role", "user"),
                "created_at": u.get("created_at", "")
            })
        self._respond_json(result)

    def _users_update(self, target: str):
        username = self._get_authenticated_user()
        if not username:
            return
        users = _load_users()
        if target not in users:
            self._respond_json({"error": "Utilisateur introuvable"}, 404)
            return
        # Seul l'admin ou l'utilisateur lui-même peut modifier
        is_admin = False
        auth = self.headers.get("Authorization", "").strip()
        if auth.startswith("Bearer "):
            payload = _validate_jwt(auth[7:])
            is_admin = payload and payload.get("role") == "admin"
        if not is_admin and username != target:
            self._respond_json({"error": "Permission refusée"}, 403)
            return
        content_len = int(self.headers.get("Content-Length", 0))
        body = self.rfile.read(content_len) if content_len > 0 else b"{}"
        try:
            data = json.loads(body)
        except json.JSONDecodeError:
            self._respond_json({"error": "JSON invalide"}, 400)
            return
        u = users[target]
        if is_admin:
            if "email" in data:
                u["email"] = data["email"]
            if "role" in data:
                u["role"] = data["role"]
        if "password" in data and data["password"]:
            u["password_hash"] = _hash_password(data["password"])
        _save_users()
        self._respond_json({"ok": True})

    def _users_delete(self, target: str):
        username = self._require_admin()
        if not username:
            return
        if target == username:
            self._respond_json({"error": "Impossible de supprimer votre propre compte."}, 400)
            return
        users = _load_users()
        if target not in users:
            self._respond_json({"error": "Utilisateur introuvable"}, 404)
            return
        del users[target]
        _save_users()
        log.debug("Utilisateur supprimé: %s", target)
        self._respond_json({"ok": True})

    # ── Helpers HTTP ──────────────────────────────────────────────────

    def _respond_json(self, data: dict, status: int = 200):
        body = json.dumps(data).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        origin = self.headers.get("Origin", "")
        self.send_header("Access-Control-Allow-Origin", _cors_origin(origin))
        self.send_header("Vary", "Origin")
        self.send_header("X-Frame-Options", "DENY")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self):
        self.send_response(204)
        origin = self.headers.get("Origin", "")
        self.send_header("Access-Control-Allow-Origin", _cors_origin(origin))
        self.send_header("Vary", "Origin")
        self.send_header("Access-Control-Allow-Methods", "GET, PUT, POST, DELETE, OPTIONS, HEAD")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization")
        self.send_header("X-Frame-Options", "DENY")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.end_headers()

    # ── Endpoints settings ──────────────────────────────────────────

    def _settings_get(self):
        username = self._get_authenticated_user()
        if not username:
            return
        users = _load_users()
        user = users.get(username, {})
        self._respond_json({"settings": user.get("settings", {})})

    def _settings_put(self):
        username = self._get_authenticated_user()
        if not username:
            return
        try:
            length = int(self.headers.get("Content-Length", "0") or "0")
            body = self.rfile.read(length) if length > 0 else b"{}"
            data = json.loads(body.decode("utf-8"))
        except Exception:
            self._respond_json({"error": "JSON invalide"}, 400)
            return
        users = _load_users()
        if username not in users:
            self._respond_json({"error": "Utilisateur introuvable"}, 404)
            return
        # Merge partiel : chaque clé envoyée remplace la clé existante
        current = users[username].get("settings", {})
        if isinstance(current, dict):
            current.update(data)
        else:
            current = data
        users[username]["settings"] = current
        _save_users()
        self._respond_json({"ok": True})

    def do_HEAD(self):
        # Déléguer au GET mais sans renvoyer le body (géré par le handler)
        self.do_GET()

    def do_GET(self):
        if self.path in ("/health", "/api/health"):
            self._respond_json({"status": "ok", "keys_loaded": len(api_keys)})
            return
        if self.path == "/api/keys":
            username = self._require_admin()
            if not username:
                return
            mapped = {}
            for k, v in api_keys.items():
                frontend_key = self._KEY_MAP.get(k, k)
                mapped[frontend_key] = v
            self._respond_json(mapped)
            return
        # Auth / Users
        if self.path == "/api/users":
            self._users_list()
            return
        if self.path.startswith("/api/users/"):
            # GET /api/users/<username> not needed for MVP
            self.send_response(404)
            self.end_headers()
            return
        # Conversations
        if self.path == "/api/conversations":
            self._conv_list()
            return
        if self.path.startswith("/api/conversations/"):
            filename = self.path[len("/api/conversations/"):]
            self._conv_get(filename)
            return
        # Settings utilisateur
        if self.path == "/api/settings":
            self._settings_get()
            return
        # Proxy
        if self.path.startswith("/api/proxy/"):
            self._proxy_request("GET")
            return
        self.send_response(404)
        self.end_headers()

    def do_POST(self):
        if self.path == "/api/auth/login":
            self._auth_login()
            return
        if self.path == "/api/auth/register":
            self._auth_register()
            return
        if self.path.startswith("/api/proxy/"):
            self._proxy_request("POST")
            return
        self.send_response(404)
        self.end_headers()

    def do_PUT(self):
        if self.path.startswith("/api/users/"):
            target = self.path[len("/api/users/"):]
            self._users_update(target)
            return
        if self.path.startswith("/api/conversations/"):
            filename = self.path[len("/api/conversations/"):]
            self._conv_save(filename)
            return
        # Settings utilisateur
        if self.path == "/api/settings":
            self._settings_put()
            return
        self.send_response(404)
        self.end_headers()

    def do_DELETE(self):
        if self.path.startswith("/api/users/"):
            target = self.path[len("/api/users/"):]
            self._users_delete(target)
            return
        if self.path.startswith("/api/conversations/"):
            filename = self.path[len("/api/conversations/"):]
            self._conv_delete(filename)
            return
        self.send_response(404)
        self.end_headers()

    def _proxy_request(self, method: str):
        if not _rate_check("proxy:" + self.client_address[0], 30, 60):
            self._respond_json({"error": "Trop de requêtes. Réessayez dans une minute."}, 429)
            return
        username = self._get_authenticated_user()
        if not username:
            return
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
        if not _is_path_allowed(provider, upstream_path):
            self._error(403, f"Path non autorisé pour {provider}: {upstream_path}")
            return

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
        origin = self.headers.get("Origin", "")
        self.send_header("Access-Control-Allow-Origin", _cors_origin(origin))
        self.send_header("Vary", "Origin")
        self.send_header("X-Frame-Options", "DENY")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, fmt, *args):
        pass  # On logue nous-mêmes dans _proxy_request


def main():
    port = int(os.environ.get("PROXY_PORT", "8080"))
    load_api_keys()
    _load_users()
    _get_jwt_secret()
    log.info("%d utilisateur(s) chargés, JWT prêt.", len(_users))
    server = HTTPServer(("127.0.0.1", port), ProxyHandler)
    log.info("Proxy prêt sur 127.0.0.1:%d", port)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        log.info("Arrêt proxy.")
        server.shutdown()


if __name__ == "__main__":
    main()

"""Tests for the authentication system in proxy/server.py.

Covers: password hashing (scrypt), JWT create/validate, user management.
All file I/O uses tmp_path — never touches real data files.
"""

import os
import sys
import json
import time
import tempfile

import pytest

# ---------------------------------------------------------------------------
# Set env vars BEFORE importing server (module-level side effects)
# ---------------------------------------------------------------------------
_test_tmpdir = tempfile.mkdtemp(prefix="cetas_test_")
os.environ["CETAS_DATA_DIR"] = os.path.join(_test_tmpdir, "data")
os.makedirs(os.environ["CETAS_DATA_DIR"], exist_ok=True)

# ---------------------------------------------------------------------------
# Import setup — point at proxy/ so `import server` resolves
# ---------------------------------------------------------------------------
_PROXY_DIR = os.path.join(os.path.dirname(__file__), "..", "..", "proxy")
sys.path.insert(0, os.path.abspath(_PROXY_DIR))

import server  # noqa: E402  (module-level, after path fix)
from server import (  # noqa: E402
    _hash_password,
    _verify_password,
    _needs_password_upgrade,
    _create_jwt,
    _validate_jwt,
    _load_users,
)


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture(autouse=True)
def _reset_module_caches():
    """Clear global caches before and after every test."""
    server._users = {}
    server._jwt_secret = ""
    yield
    server._users = {}
    server._jwt_secret = ""


@pytest.fixture()
def data_dir(tmp_path):
    """Redirect DATA_DIR / USERS_PATH / JWT_SECRET_PATH / USERS_SEED_PATH to tmp_path."""
    orig_data = server.DATA_DIR
    orig_users = server.USERS_PATH
    orig_jwt = server.JWT_SECRET_PATH
    orig_seed = server.USERS_SEED_PATH

    server.DATA_DIR = str(tmp_path)
    server.USERS_PATH = str(tmp_path / "users.json")
    server.JWT_SECRET_PATH = str(tmp_path / ".jwt_secret")
    server.USERS_SEED_PATH = str(tmp_path / "nonexistent-seed.json")

    yield tmp_path

    server.DATA_DIR = orig_data
    server.USERS_PATH = orig_users
    server.JWT_SECRET_PATH = orig_jwt
    server.USERS_SEED_PATH = orig_seed


# ===================================================================
# 1. Password hashing (scrypt)
# ===================================================================

class TestPasswordHashing:

    def test_hash_password_produces_scrypt_format(self):
        h = _hash_password("my-secret")
        assert h.startswith("scrypt$")
        parts = h.split("$")
        # scrypt$N$r$p$salt_hex$hash_hex  → 6 parts, 5 dollar signs
        assert len(parts) == 6
        n, r, p = int(parts[1]), int(parts[2]), int(parts[3])
        assert n == 16384
        assert r == 8
        assert p == 1
        # salt and hash are valid hex
        bytes.fromhex(parts[4])
        bytes.fromhex(parts[5])

    def test_hash_password_unique_salts(self):
        h1 = _hash_password("pw")
        h2 = _hash_password("pw")
        assert h1 != h2

    def test_verify_password_with_scrypt_hash(self):
        h = _hash_password("correct-horse-battery-staple")
        assert _verify_password("correct-horse-battery-staple", h) is True

    def test_verify_password_wrong_password(self):
        h = _hash_password("real-password")
        assert _verify_password("wrong-password", h) is False

    def test_verify_password_legacy_scrypt(self):
        """Legacy format: scrypt$salt$hash (implicit N=16384, r=8, p=1)."""
        import hashlib as _hl
        salt = os.urandom(16)
        h = _hl.scrypt(b"legacy-pw", salt=salt, n=16384, r=8, p=1)
        legacy_hash = f"scrypt${salt.hex()}${h.hex()}"
        assert legacy_hash.count("$") == 2
        assert _verify_password("legacy-pw", legacy_hash) is True
        assert _verify_password("wrong", legacy_hash) is False

    def test_verify_password_sha256_bare_hex(self):
        """Raw SHA-256 hex (no prefix)."""
        import hashlib as _hl
        pw = "sha256-pw"
        stored = _hl.sha256(pw.encode()).hexdigest()
        assert "$" not in stored
        assert _verify_password(pw, stored) is True

    def test_verify_password_sha256_prefixed(self):
        """Prefixed format: sha256$hex."""
        import hashlib as _hl
        pw = "prefixed-pw"
        stored = f"sha256${_hl.sha256(pw.encode()).hexdigest()}"
        assert _verify_password(pw, stored) is True
        assert _verify_password("nope", stored) is False

    def test_verify_password_unknown_algo_returns_false(self):
        assert _verify_password("pw", "argon2$abcdef") is False

    def test_verify_password_malformed_scrypt_returns_false(self):
        # scrypt with wrong number of parts (neither 2 nor 5 after split)
        assert _verify_password("pw", "scrypt$a$b$c") is False

    def test_verify_password_invalid_hex_returns_false(self):
        assert _verify_password("pw", "scrypt$zzzz$8$1$nothex$nothex") is False


# ===================================================================
# 2. _needs_password_upgrade
# ===================================================================

class TestNeedsPasswordUpgrade:

    def test_sha256_bare_returns_true(self):
        import hashlib as _hl
        stored = _hl.sha256(b"pw").hexdigest()
        assert _needs_password_upgrade(stored) is True

    def test_sha256_prefixed_returns_true(self):
        import hashlib as _hl
        stored = f"sha256${_hl.sha256(b'pw').hexdigest()}"
        assert _needs_password_upgrade(stored) is True

    def test_legacy_scrypt_returns_true(self):
        """Legacy scrypt (2 dollar signs, implicit N=16384) → needs upgrade."""
        h = _hash_password("pw")
        # Convert to legacy format: strip N$r$p parts
        parts = h.split("$")
        # parts: [scrypt, N, r, p, salt, hash]
        legacy = f"scrypt${parts[4]}${parts[5]}"
        assert legacy.count("$") == 2
        assert _needs_password_upgrade(legacy) is True

    def test_new_scrypt_n131072_returns_false(self):
        """New format with N=131072 → does not need upgrade."""
        h = _hash_password("pw")
        # Rewrite with N=131072
        parts = h.split("$")
        upgraded = f"scrypt$131072$8$1${parts[4]}${parts[5]}"
        assert _needs_password_upgrade(upgraded) is False


# ===================================================================
# 3. JWT
# ===================================================================

class TestJWT:

    def test_create_jwt_returns_string(self, data_dir):
        token = _create_jwt("alice", "admin")
        assert isinstance(token, str)
        # JWTs have exactly 2 dots
        assert token.count(".") == 2

    def test_validate_jwt_valid_token(self, data_dir):
        token = _create_jwt("bob", "user")
        payload = _validate_jwt(token)
        assert payload is not None
        assert payload["sub"] == "bob"
        assert payload["role"] == "user"
        assert "iat" in payload
        assert "exp" in payload

    def test_validate_jwt_expired_token(self, data_dir):
        """Token issued 48h ago (exp = now - 48h, default TTL is 24h)."""
        import jwt as _jwt

        secret = server._get_jwt_secret()
        now = int(time.time())
        payload = {
            "sub": "eve",
            "role": "admin",
            "iat": now - 172800,
            "exp": now - 86400,  # expired 24h ago
        }
        token = _jwt.encode(payload, secret, algorithm="HS256")
        assert _validate_jwt(token) is None

    def test_validate_jwt_tampered_payload(self, data_dir):
        """Flip a character in the payload → invalid signature."""
        token = _create_jwt("frank", "user")
        # Tamper with the payload (second segment)
        parts = token.split(".")
        payload_bytes = parts[1]
        # Change last char (base64) to something else
        tampered = payload_bytes[:-1] + ("A" if payload_bytes[-1] != "A" else "B")
        bad_token = f"{parts[0]}.{tampered}.{parts[2]}"
        assert _validate_jwt(bad_token) is None

    def test_validate_jwt_wrong_secret(self, data_dir):
        """Token signed with a different secret."""
        import jwt as _jwt

        payload = {"sub": "grace", "role": "user", "iat": 0, "exp": 9999999999}
        token = _jwt.encode(payload, "wrong-secret", algorithm="HS256")
        assert _validate_jwt(token) is None

    def test_validate_jwt_empty_string(self, data_dir):
        assert _validate_jwt("") is None

    def test_validate_jwt_garbage(self, data_dir):
        assert _validate_jwt("not.a.jwt") is None


# ===================================================================
# 4. User management
# ===================================================================

class TestUserManagement:

    def test_load_users_returns_dict(self, data_dir):
        users = _load_users()
        assert isinstance(users, dict)

    def test_load_users_empty_when_no_file(self, data_dir):
        users = _load_users()
        assert users == {}

    def test_load_users_reads_json_file(self, data_dir):
        users_file = data_dir / "users.json"
        seed = {"version": 2, "users": {"admin": {"username": "admin", "role": "admin"}}}
        users_file.write_text(json.dumps(seed))

        users = _load_users()
        assert "admin" in users
        assert users["admin"]["role"] == "admin"

    def test_load_users_caches_result(self, data_dir):
        """Second call returns same dict object (in-memory cache)."""
        u1 = _load_users()
        u2 = _load_users()
        assert u1 is u2

    def test_user_password_roundtrip(self, data_dir):
        """Create user, persist, reload, verify password."""
        pw_hash = _hash_password("s3cret")
        user = {
            "username": "testuser",
            "email": "test@example.com",
            "password_hash": pw_hash,
            "role": "user",
        }

        # Write directly (simulates _save_users)
        users_data = {"version": 2, "users": {"testuser": user}}
        with open(server.USERS_PATH, "w") as f:
            json.dump(users_data, f)

        # Reload
        server._users = {}
        users = _load_users()
        assert "testuser" in users
        assert _verify_password("s3cret", users["testuser"]["password_hash"])
        assert not _verify_password("wrong", users["testuser"]["password_hash"])

    def test_save_and_reload_preserves_data(self, data_dir):
        """Write users via _save_users, clear cache, reload — data persists."""
        server._users = {
            "alice": {"username": "alice", "role": "admin", "password_hash": _hash_password("pw1")},
            "bob": {"username": "bob", "role": "user", "password_hash": _hash_password("pw2")},
        }
        server._save_users()

        # Clear and reload
        server._users = {}
        users = _load_users()
        assert set(users.keys()) == {"alice", "bob"}

    def test_load_users_with_invalid_json(self, data_dir):
        """Corrupted file → empty dict, no crash."""
        (data_dir / "users.json").write_text("{{{not json")
        users = _load_users()
        assert users == {}

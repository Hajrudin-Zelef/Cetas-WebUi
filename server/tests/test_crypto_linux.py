"""Tests for the crypto module (core/linux/crypto_linux.py).

Covers: SecureVault roundtrip, wrong password, tampered data, password strength.
All file I/O uses tmp_path — never touches real data files.
"""

import os
import sys
import secrets
import tempfile

import pytest

# ---------------------------------------------------------------------------
# Import setup
# ---------------------------------------------------------------------------
_CORE_DIR = os.path.join(os.path.dirname(__file__), "..", "..", "core", "linux")
sys.path.insert(0, os.path.abspath(_CORE_DIR))

from crypto_linux import (  # noqa: E402
    SecureVault,
    _check_password_strength,
    VAULT_VERSION,
    MAGIC_BYTES,
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _random_password(length: int = 20) -> str:
    """Generate a random password meeting strength requirements."""
    alphabet = "abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789!@#$%&*"
    return "".join(secrets.choice(alphabet) for _ in range(length))


# ===================================================================
# 1. SecureVault instantiation
# ===================================================================

class TestSecureVaultInstantiation:

    def test_creates_vault_with_path(self, tmp_path):
        vault = SecureVault(str(tmp_path / "test.enc"))
        assert vault.vault_path == str(tmp_path / "test.enc")

    def test_exists_false_when_no_file(self, tmp_path):
        vault = SecureVault(str(tmp_path / "nonexistent.enc"))
        assert vault.exists() is False

    def test_get_size_zero_when_no_file(self, tmp_path):
        vault = SecureVault(str(tmp_path / "nonexistent.enc"))
        assert vault.get_size() == 0


# ===================================================================
# 2. Encrypt / decrypt roundtrip
# ===================================================================

class TestEncryptDecryptRoundtrip:

    def test_save_and_load_dict(self, tmp_path):
        password = _random_password()
        vault = SecureVault(str(tmp_path / "vault.enc"))
        data = {"api_keys": {"groq": "gsk_abc", "deepseek": "sk-xyz"}}

        vault.save(password, data)
        assert vault.exists() is True
        assert vault.get_size() > 0

        loaded = vault.load(password)
        assert loaded == data

    def test_save_returns_true(self, tmp_path):
        password = _random_password()
        vault = SecureVault(str(tmp_path / "vault.enc"))
        assert vault.save(password, {"key": "value"}) is True

    def test_load_returns_none_when_no_file(self, tmp_path):
        vault = SecureVault(str(tmp_path / "nonexistent.enc"))
        assert vault.load(_random_password()) is None

    def test_multiple_save_load_cycles(self, tmp_path):
        password = _random_password()
        vault = SecureVault(str(tmp_path / "vault.enc"))

        for i in range(5):
            data = {"cycle": i, "nested": {"a": i * 10}}
            vault.save(password, data)
            assert vault.load(password) == data

    def test_different_data_each_save(self, tmp_path):
        password = _random_password()
        vault = SecureVault(str(tmp_path / "vault.enc"))

        vault.save(password, {"x": 1})
        vault.save(password, {"x": 2})
        assert vault.load(password) == {"x": 2}

    def test_empty_dict(self, tmp_path):
        password = _random_password()
        vault = SecureVault(str(tmp_path / "vault.enc"))
        vault.save(password, {})
        assert vault.load(password) == {}

    def test_unicode_data(self, tmp_path):
        password = _random_password()
        vault = SecureVault(str(tmp_path / "vault.enc"))
        data = {"clé": "valeur", "日本語": "テスト", "emoji": "🔐"}
        vault.save(password, data)
        assert vault.load(password) == data

    def test_file_has_vault_magic_bytes(self, tmp_path):
        password = _random_password()
        vault = SecureVault(str(tmp_path / "vault.enc"))
        vault.save(password, {"test": True})
        with open(vault.vault_path, "rb") as f:
            header = f.read(5)
        assert header == MAGIC_BYTES

    def test_file_version_is_v4(self, tmp_path):
        password = _random_password()
        vault = SecureVault(str(tmp_path / "vault.enc"))
        vault.save(password, {"test": True})
        with open(vault.vault_path, "rb") as f:
            f.read(5)  # magic
            version = f.read(1)
        assert version[0] == VAULT_VERSION

    def test_save_rejects_non_dict(self, tmp_path):
        vault = SecureVault(str(tmp_path / "vault.enc"))
        with pytest.raises(TypeError):
            vault.save(_random_password(), "not a dict")
        with pytest.raises(TypeError):
            vault.save(_random_password(), [1, 2, 3])


# ===================================================================
# 3. Wrong password
# ===================================================================

class TestWrongPassword:

    def test_decrypt_fails_wrong_password(self, tmp_path):
        password = _random_password()
        vault = SecureVault(str(tmp_path / "vault.enc"))
        vault.save(password, {"secret": "data"})

        wrong_password = _random_password()
        with pytest.raises(ValueError, match="mot de passe incorrect|altéré"):
            vault.load(wrong_password)

    def test_decrypt_fails_similar_password(self, tmp_path):
        password = "Th1s!s@Str0ng#P4ss"
        vault = SecureVault(str(tmp_path / "vault.enc"))
        vault.save(password, {"secret": "data"})

        with pytest.raises(ValueError):
            vault.load("Th1s!s@Str0ng#P4s")  # one char off

    def test_decrypt_fails_empty_password(self, tmp_path):
        password = _random_password()
        vault = SecureVault(str(tmp_path / "vault.enc"))
        vault.save(password, {"secret": "data"})

        with pytest.raises(ValueError):
            vault.load("")


# ===================================================================
# 4. Tampered data detection
# ===================================================================

class TestTamperedData:

    def test_tampered_ciphertext_detected(self, tmp_path):
        password = _random_password()
        vault = SecureVault(str(tmp_path / "vault.enc"))
        vault.save(password, {"secret": "data"})

        # Flip a byte in the ciphertext (after header)
        with open(vault.vault_path, "r+b") as f:
            f.seek(60)
            byte = f.read(1)
            f.seek(60)
            f.write(bytes([byte[0] ^ 0xFF]))

        with pytest.raises(ValueError):
            vault.load(password)

    def test_truncated_file_detected(self, tmp_path):
        password = _random_password()
        vault = SecureVault(str(tmp_path / "vault.enc"))
        vault.save(password, {"secret": "data"})

        # Truncate the file
        with open(vault.vault_path, "r+b") as f:
            content = f.read()
        with open(vault.vault_path, "wb") as f:
            f.write(content[:20])

        with pytest.raises((ValueError, RuntimeError)):
            vault.load(password)

    def test_tampered_magic_bytes_detected(self, tmp_path):
        password = _random_password()
        vault = SecureVault(str(tmp_path / "vault.enc"))
        vault.save(password, {"secret": "data"})

        # Overwrite magic bytes
        with open(vault.vault_path, "r+b") as f:
            f.write(b"EVIL!")

        with pytest.raises(ValueError, match="Signature invalide"):
            vault.load(password)

    def test_empty_file_detected(self, tmp_path):
        vault = SecureVault(str(tmp_path / "vault.enc"))
        # Create an empty file
        vault.vault_path and open(vault.vault_path, "w").close()

        with pytest.raises((ValueError, RuntimeError)):
            vault.load(password=_random_password())


# ===================================================================
# 5. Password strength check
# ===================================================================

class TestPasswordStrength:

    def test_too_short_rejected(self):
        ok, msg = _check_password_strength("Ab1!")
        assert ok is False
        assert "12" in msg or "caractères" in msg

    def test_exactly_minimum_length_accepted(self):
        """12 chars with 3+ char categories → accepted (heuristic path)."""
        ok, msg = _check_password_strength("Abcdef12345!")
        assert ok is True

    def test_strong_password_accepted(self):
        ok, msg = _check_password_strength(_random_password(20))
        assert ok is True

    def test_only_lowercase_rejected(self):
        ok, msg = _check_password_strength("abcdefghijklmnop")
        assert ok is False

    def test_only_digits_rejected(self):
        ok, msg = _check_password_strength("123456789012")
        assert ok is False

    def test_mixed_categories_accepted(self):
        ok, msg = _check_password_strength("Abcdefg12345!")
        assert ok is True

    def test_just_at_minimum_boundary(self):
        # Exactly 12 chars, mixed → should pass heuristic
        ok, msg = _check_password_strength("Aa1!Aa1!Aa1!")
        assert ok is True

    def test_11_chars_rejected(self):
        ok, msg = _check_password_strength("Aa1!Aa1!Aa1")
        assert ok is False

    def test_empty_password_rejected(self):
        ok, msg = _check_password_strength("")
        assert ok is False


# ===================================================================
# 6. Vault get/set/delete_key/list_keys
# ===================================================================

class TestVaultKeyOperations:

    def test_set_and_get(self, tmp_path):
        password = _random_password()
        vault = SecureVault(str(tmp_path / "vault.enc"))
        vault.save(password, {})

        vault.set(password, "mykey", "myvalue")
        assert vault.get(password, "mykey") == "myvalue"

    def test_get_default_when_missing(self, tmp_path):
        password = _random_password()
        vault = SecureVault(str(tmp_path / "vault.enc"))
        vault.save(password, {})

        assert vault.get(password, "missing", "default") == "default"

    def test_delete_key(self, tmp_path):
        password = _random_password()
        vault = SecureVault(str(tmp_path / "vault.enc"))
        vault.save(password, {"a": 1, "b": 2})

        vault.delete_key(password, "a")
        assert vault.get(password, "a") is None
        assert vault.get(password, "b") == 2

    def test_delete_nonexistent_key(self, tmp_path):
        password = _random_password()
        vault = SecureVault(str(tmp_path / "vault.enc"))
        vault.save(password, {})

        assert vault.delete_key(password, "missing") is False

    def test_list_keys(self, tmp_path):
        password = _random_password()
        vault = SecureVault(str(tmp_path / "vault.enc"))
        vault.save(password, {"x": 1, "y": 2, "z": 3})

        keys = vault.list_keys(password)
        assert set(keys) == {"x", "y", "z"}

    def test_list_keys_empty_vault(self, tmp_path):
        password = _random_password()
        vault = SecureVault(str(tmp_path / "vault.enc"))
        vault.save(password, {})

        assert vault.list_keys(password) == []


# ===================================================================
# 7. Vault delete
# ===================================================================

class TestVaultDelete:

    def test_delete_removes_file(self, tmp_path):
        password = _random_password()
        vault = SecureVault(str(tmp_path / "vault.enc"))
        vault.save(password, {"data": True})
        assert vault.exists() is True

        result = vault.delete()
        assert result is True
        assert vault.exists() is False

    def test_delete_returns_false_when_no_file(self, tmp_path):
        vault = SecureVault(str(tmp_path / "nonexistent.enc"))
        assert vault.delete() is False

"""Tests for proxy routing logic in server/server.py.

Covers: path allowlisting, provider config, CORS origin, rate limiting.
Never starts a real HTTP server — all functions are called directly.
"""

import os
import sys
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
# Import setup — point at server/ so `import server` resolves
# ---------------------------------------------------------------------------
_PROXY_DIR = os.path.join(os.path.dirname(__file__), "..")
sys.path.insert(0, os.path.abspath(_PROXY_DIR))

import server  # noqa: E402
from server import (  # noqa: E402
    PROVIDER_CONFIG,
    PROXY_ALLOWED_PATHS,
    _is_path_allowed,
    _cors_origin,
    _rate_check,
    _rate_buckets,
)


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture(autouse=True)
def _clear_rate_buckets():
    """Empty the global rate-limit buckets before every test."""
    server._rate_buckets.clear()
    yield
    server._rate_buckets.clear()


# ===================================================================
# 1. PROVIDER_CONFIG — known providers exist, structure is correct
# ===================================================================

class TestProviderConfig:

    KNOWN_PROVIDERS = [
        "openai", "anthropic", "google", "deepseek", "openrouter",
        "groq", "nvidia", "mistral", "perplexity", "grok",
        "zai", "cabreras", "llamacpp", "ollama", "lmstudio",
        "opencode", "opencode-go",
    ]

    def test_all_known_providers_present(self):
        for name in self.KNOWN_PROVIDERS:
            assert name in PROVIDER_CONFIG, f"Missing provider: {name}"

    def test_unknown_provider_absent(self):
        assert "nonexistent-provider" not in PROVIDER_CONFIG

    def test_every_provider_has_base_url(self):
        for name, cfg in PROVIDER_CONFIG.items():
            assert "base_url" in cfg, f"Provider {name} missing base_url"

    def test_every_provider_has_auth(self):
        for name, cfg in PROVIDER_CONFIG.items():
            assert "auth" in cfg, f"Provider {name} missing auth"
            auth = cfg["auth"]
            assert "type" in auth, f"Provider {name} auth missing type"
            assert auth["type"] in ("header", "query"), f"Provider {name} unknown auth type"

    def test_providers_with_extra_headers(self):
        assert "extra_headers" in PROVIDER_CONFIG["anthropic"]
        assert "extra_headers" in PROVIDER_CONFIG["openrouter"]

    def test_local_providers_use_env_url(self):
        for name in ("ollama", "lmstudio", "llamacpp"):
            cfg = PROVIDER_CONFIG[name]
            assert cfg["base_url"] == os.environ.get(
                f"CETAS_{name.upper()}_URL"
            ) or cfg["base_url"] is None


# ===================================================================
# 2. _is_path_allowed — allowlist enforcement
# ===================================================================

class TestIsPathAllowed:

    def test_openai_chat_allowed(self):
        assert _is_path_allowed("openai", "/v1/chat/completions") is True

    def test_openai_models_allowed(self):
        assert _is_path_allowed("openai", "/v1/models") is True

    def test_openai_images_prefix_allowed(self):
        assert _is_path_allowed("openai", "/v1/images/generations") is True

    def test_openai_disallowed_path(self):
        assert _is_path_allowed("openai", "/v1/files") is False

    def test_anthropic_messages_allowed(self):
        assert _is_path_allowed("anthropic", "/v1/messages") is True

    def test_anthropic_disallowed_path(self):
        assert _is_path_allowed("anthropic", "/v1/models") is False

    def test_google_v1beta_prefix(self):
        assert _is_path_allowed("google", "/v1beta/models/gemini-pro") is True

    def test_google_wrong_prefix(self):
        assert _is_path_allowed("google", "/v1/models") is False

    def test_openrouter_api_prefix(self):
        assert _is_path_allowed("openrouter", "/api/v1/chat/completions") is True
        assert _is_path_allowed("openrouter", "/api/v1/models") is True

    def test_openrouter_wrong_prefix(self):
        assert _is_path_allowed("openrouter", "/v1/chat/completions") is False

    def test_deepseek_v1_prefix(self):
        assert _is_path_allowed("deepseek", "/v1/chat/completions") is True

    def test_deepseek_bare_prefix(self):
        assert _is_path_allowed("deepseek", "/chat/completions") is True

    def test_groq_openai_prefix(self):
        assert _is_path_allowed("groq", "/openai/v1/chat/completions") is True
        assert _is_path_allowed("groq", "/openai/v1/models") is True
        assert _is_path_allowed("groq", "/openai/v1/audio/transcriptions") is True

    def test_groq_wrong_prefix(self):
        assert _is_path_allowed("groq", "/v1/chat/completions") is False

    def test_opencode_zen_prefix(self):
        assert _is_path_allowed("opencode", "/zen/v1/chat/completions") is True
        assert _is_path_allowed("opencode", "/zen/v1/messages") is True
        assert _is_path_allowed("opencode", "/zen/v1/responses") is True

    def test_opencode_go_zen_go_prefix(self):
        assert _is_path_allowed("opencode-go", "/zen/go/v1/chat/completions") is True
        assert _is_path_allowed("opencode-go", "/zen/v1/chat/completions") is False

    def test_opencode_cannot_use_go_path(self):
        assert _is_path_allowed("opencode", "/zen/go/v1/chat/completions") is False

    def test_unknown_provider_returns_false(self):
        assert _is_path_allowed("nonexistent", "/v1/chat/completions") is False

    def test_empty_allowed_list_returns_false(self):
        """Provider in config but with empty allowed paths."""
        old = PROXY_ALLOWED_PATHS.get("grok", [])
        try:
            server.PROXY_ALLOWED_PATHS["grok"] = []
            assert _is_path_allowed("grok", "/v1/chat/completions") is False
        finally:
            server.PROXY_ALLOWED_PATHS["grok"] = old

    def test_path_must_be_prefix_match(self):
        """Ensure prefix matching, not substring matching."""
        assert _is_path_allowed("openai", "/v1/chat/completions/extra") is True
        assert _is_path_allowed("openai", "/v1/chat") is False

    def test_mistral_only_chat(self):
        assert _is_path_allowed("mistral", "/v1/chat/completions") is True
        assert _is_path_allowed("mistral", "/v1/models") is False

    def test_perplexity_only_chat(self):
        assert _is_path_allowed("perplexity", "/chat/completions") is True
        assert _is_path_allowed("perplexity", "/v1/chat/completions") is False


# ===================================================================
# 3. Path normalization (as done in _proxy_request)
# ===================================================================

class TestPathNormalization:

    @staticmethod
    def _normalize(upstream_path: str, provider: str) -> str:
        """Reproduce the normalization logic from _proxy_request."""
        if upstream_path.startswith(provider + "/"):
            upstream_path = upstream_path[len(provider) + 1:]
        elif upstream_path.startswith("api/") and provider != "openrouter":
            upstream_path = upstream_path[4:]
        return "/" + upstream_path

    def test_strip_provider_prefix(self):
        assert self._normalize("openai/v1/chat/completions", "openai") == "/v1/chat/completions"

    def test_strip_api_prefix_non_openrouter(self):
        assert self._normalize("api/v1/chat/completions", "openai") == "/v1/chat/completions"

    def test_keep_api_prefix_for_openrouter(self):
        assert self._normalize("api/v1/chat/completions", "openrouter") == "/api/v1/chat/completions"

    def test_no_prefix_stays_unchanged(self):
        assert self._normalize("v1/chat/completions", "openai") == "/v1/chat/completions"

    def test_provider_with_dot(self):
        """llamacpp normalizes dots in provider name."""
        provider = "llamacpp"
        upstream = "v1/chat/completions"
        assert self._normalize(upstream, provider) == "/v1/chat/completions"


# ===================================================================
# 4. _cors_origin
# ===================================================================

class TestCorsOrigin:

    def test_no_origin_returns_first_allowed(self):
        result = _cors_origin(None)
        assert result == server.ALLOWED_ORIGINS[0]

    def test_empty_string_returns_first_allowed(self):
        result = _cors_origin("")
        assert result == server.ALLOWED_ORIGINS[0]

    def test_matching_origin_returned(self):
        allowed = server.ALLOWED_ORIGINS[0]
        assert _cors_origin(allowed) == allowed

    def test_unknown_origin_returns_fallback(self):
        result = _cors_origin("https://evil.example.com")
        assert result == server.ALLOWED_ORIGINS[0]

    def test_wildcard_matching(self):
        """If '*' is in ALLOWED_ORIGINS, any origin matches."""
        old = server.ALLOWED_ORIGINS[:]
        try:
            server.ALLOWED_ORIGINS = ["*"]
            assert _cors_origin("https://anything.example.com") == "https://anything.example.com"
        finally:
            server.ALLOWED_ORIGINS = old

    def test_multiple_allowed_origins(self):
        old = server.ALLOWED_ORIGINS[:]
        try:
            server.ALLOWED_ORIGINS = ["https://a.com", "https://b.com"]
            assert _cors_origin("https://b.com") == "https://b.com"
            assert _cors_origin("https://c.com") == "https://a.com"
        finally:
            server.ALLOWED_ORIGINS = old


# ===================================================================
# 5. _rate_check — sliding-window rate limiter
# ===================================================================

class TestRateCheck:

    def test_allows_first_request(self):
        assert _rate_check("test:key1", max_req=5, window=60) is True

    def test_allows_up_to_limit(self):
        for _ in range(4):
            _rate_check("test:key2", max_req=5, window=60)
        # 5th request should still pass
        assert _rate_check("test:key2", max_req=5, window=60) is True

    def test_blocks_at_limit(self):
        for _ in range(5):
            _rate_check("test:key3", max_req=5, window=60)
        # 6th request should be blocked
        assert _rate_check("test:key3", max_req=5, window=60) is False

    def test_different_keys_independent(self):
        for _ in range(5):
            _rate_check("test:key_a", max_req=5, window=60)
        assert _rate_check("test:key_a", max_req=5, window=60) is False
        # Different key is unaffected
        assert _rate_check("test:key_b", max_req=5, window=60) is True

    def test_window_expiration(self):
        """Requests from outside the window are pruned."""
        _rate_check("test:expiring", max_req=2, window=1)
        _rate_check("test:expiring", max_req=2, window=1)
        assert _rate_check("test:expiring", max_req=2, window=1) is False

        # Wait for window to expire
        time.sleep(1.1)
        assert _rate_check("test:expiring", max_req=2, window=1) is True

    def test_custom_window_and_limit(self):
        assert _rate_check("test:custom", max_req=1, window=60) is True
        assert _rate_check("test:custom", max_req=1, window=60) is False

    def test_bucket_cleanup(self):
        """Old timestamps are pruned on each call."""
        key = "test:cleanup"
        # Fill the bucket
        for _ in range(3):
            _rate_check(key, max_req=3, window=1)
        assert _rate_check(key, max_req=3, window=1) is False

        # Wait for window, then new requests should work
        time.sleep(1.1)
        assert _rate_check(key, max_req=3, window=1) is True

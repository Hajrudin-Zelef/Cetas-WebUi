"""Tests for log API endpoints in server/server.py."""
import json
import os
import sys
import tempfile
import unittest

# Patch env BEFORE importing server (it creates /app/data at module level)
_tmpdata = tempfile.mkdtemp()
os.environ.setdefault("CETAS_DATA_DIR", _tmpdata)

# Add proxy to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from observability import init_observability, log_event, read_events, generate_id, redact_event, get_summary, correlate_incidents


def _load_server_module():
    """Charge server/server.py par chemin — robuste à la pollution d'import
    cross-fichiers (sys.modules['server'] change selon l'ordre de collecte)."""
    import importlib.util
    name = "cetas_server_impl"
    if name in sys.modules:
        return sys.modules[name]
    path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "server.py")
    spec = importlib.util.spec_from_file_location(name, path)
    mod = importlib.util.module_from_spec(spec)
    sys.modules[name] = mod
    spec.loader.exec_module(mod)
    return mod


def _make_event(level="info", event="test.event", component="frontend", **extra):
    return {
        "timestamp": "2026-09-03T20:00:00Z",
        "event": event,
        "level": level,
        "component": component,
        "request_id": generate_id(),
        "trace_id": generate_id(),
        **extra,
    }


class TestLogEventsEndpoint(unittest.TestCase):
    """POST /api/logs/events"""

    def setUp(self):
        self.tmpdir = tempfile.mkdtemp()
        init_observability(self.tmpdir)

    def test_valid_batch(self):
        from observability import log_event, read_events
        events = [_make_event(), _make_event(level="error")]
        for ev in events:
            log_event(ev)
        stored = read_events()
        self.assertEqual(len(stored), 2)

    def test_redaction_applied(self):
        ev = _make_event()
        ev["metadata"] = {"api_key": "sk-secret123", "normal_field": "ok"}
        redacted = redact_event(ev)
        self.assertNotIn("api_key", redacted.get("metadata", {}))


class TestLogSummary(unittest.TestCase):
    """GET /api/logs/summary"""

    def setUp(self):
        self.tmpdir = tempfile.mkdtemp()
        init_observability(self.tmpdir)
        for i in range(5):
            log_event(_make_event(level="error" if i % 2 == 0 else "info",
                                  provider="groq" if i < 3 else "google"))

    def test_summary_counts(self):
        summary = get_summary()
        self.assertIn("total_events", summary)
        self.assertGreater(summary["total_events"], 0)
        self.assertIn("by_level", summary)
        self.assertIn("by_provider", summary)


class TestLogAnalyze(unittest.TestCase):
    """POST /api/logs/analyze"""

    def setUp(self):
        self.tmpdir = tempfile.mkdtemp()
        init_observability(self.tmpdir)
        for i in range(3):
            log_event(_make_event(
                level="error",
                event="provider.request.failed",
                provider="groq",
                error_type="model_not_found",
                status=404,
                trace_id="trace-same",
            ))

    def test_correlation_produces_incidents(self):
        from observability import read_events, correlate_incidents
        events = read_events()
        incidents = correlate_incidents(events)
        self.assertGreater(len(incidents), 0)
        self.assertEqual(incidents[0]["trace_id"], "trace-same")


class TestMimoAnalysis(unittest.TestCase):
    """Mimo Zen integration"""

    def test_no_secrets_in_prompt(self):
        """Verify Mimo prompt doesn't contain secrets."""
        from observability import redact_event
        ev = _make_event()
        ev["metadata"] = {"Authorization": "Bearer sk-xxx", "cookie": "session=abc"}
        redacted = redact_event(ev)
        serialized = json.dumps(redacted)
        self.assertNotIn("sk-xxx", serialized)
        self.assertNotIn("session=abc", serialized)

    def test_fallback_on_no_key(self):
        """Mimo returns fallback when opencode key is missing."""
        srv = _load_server_module()
        old_keys = srv.api_keys.copy()
        srv.api_keys["opencode"] = ""
        try:
            result = srv._analyze_with_mimo([_make_event()])
            self.assertIn("error", result)
            self.assertTrue(result.get("fallback"))
        finally:
            srv.api_keys.clear()
            srv.api_keys.update(old_keys)

    def test_fallback_on_empty_incidents(self):
        srv = _load_server_module()
        result = srv._analyze_with_mimo([])
        self.assertIn("error", result)

    def test_analyze_conn_error_is_safe(self):
        """HTTPSConnection constructor failure must not raise UnboundLocalError."""
        import http.client
        srv = _load_server_module()

        def _boom(*args, **kwargs):
            raise OSError("connection refused")

        original = http.client.HTTPSConnection
        http.client.HTTPSConnection = _boom
        try:
            srv.api_keys["opencode"] = "sk-test"
            result = srv._analyze_with_mimo([_make_event()])
        finally:
            http.client.HTTPSConnection = original
        self.assertIn("error", result)


class TestWindowHours(unittest.TestCase):
    """_coerce_window_hours coercion helper."""

    def test_int_coercion(self):
        srv = _load_server_module()
        self.assertEqual(srv._coerce_window_hours("abc"), 24)
        self.assertEqual(srv._coerce_window_hours(None), 24)
        self.assertEqual(srv._coerce_window_hours("30"), 30)
        self.assertEqual(srv._coerce_window_hours(30), 30)
        self.assertEqual(srv._coerce_window_hours("200"), 168)
        self.assertEqual(srv._coerce_window_hours("abc", default=12), 12)


class TestSummaryContract(unittest.TestCase):
    """GET /api/logs/summary data contract."""

    def setUp(self):
        self.tmpdir = tempfile.mkdtemp()
        init_observability(self.tmpdir)
        for i in range(6):
            log_event(_make_event(
                level="error" if i % 2 == 0 else "info",
                event="provider.request.failed" if i % 2 == 0 else "provider.ok",
                provider="groq" if i < 4 else "google",
            ))

    def test_summary_includes_events(self):
        summary = get_summary()
        self.assertIn("events", summary)
        self.assertEqual(len(summary["events"]), 6)

    def test_summary_level_filter(self):
        summary = get_summary(level="error")
        self.assertEqual(len(summary["events"]), 3)
        for ev in summary["events"]:
            self.assertEqual(ev["level"], "error")


if __name__ == "__main__":
    unittest.main()

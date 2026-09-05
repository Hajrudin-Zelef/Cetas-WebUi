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
        import importlib
        # Patch api_keys to be empty
        import server
        old_keys = server.api_keys.copy()
        server.api_keys["opencode"] = ""
        try:
            result = server._analyze_with_mimo([_make_event()])
            self.assertIn("error", result)
            self.assertTrue(result.get("fallback"))
        finally:
            server.api_keys.clear()
            server.api_keys.update(old_keys)

    def test_fallback_on_empty_incidents(self):
        import server
        result = server._analyze_with_mimo([])
        self.assertIn("error", result)


if __name__ == "__main__":
    unittest.main()

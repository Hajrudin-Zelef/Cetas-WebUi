"""Tests for proxy/observability.py — structured event logging.

All file I/O uses tmp_path — never touches real log files.
"""

import json
import os
import sys
import threading
import time

import pytest

# ---------------------------------------------------------------------------
# Import setup
# ---------------------------------------------------------------------------
_PROXY_DIR = os.path.join(os.path.dirname(__file__), "..", "..", "proxy")
sys.path.insert(0, os.path.abspath(_PROXY_DIR))

from observability import (
    generate_id,
    init_observability,
    log_event,
    read_events,
    correlate_incidents,
    get_summary,
    redact_event,
    rotate_logs,
    _active_path,
    _archive_path,
    _lock,
    _log_dir,
)


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture(autouse=True)
def _fresh_observability(tmp_path):
    """Re-initialise observability to a temp dir before every test."""
    log_dir = str(tmp_path / "logs")
    init_observability(log_dir, max_file_bytes=500, max_archives=3, retention_days=0)
    yield


# ---------------------------------------------------------------------------
# 1. generate_id
# ---------------------------------------------------------------------------

class TestGenerateId:
    def test_returns_uuid_format(self):
        sid = generate_id()
        parts = sid.split("-")
        assert len(parts) == 5
        assert len(sid) == 36

    def test_unique(self):
        ids = {generate_id() for _ in range(100)}
        assert len(ids) == 100


# ---------------------------------------------------------------------------
# 2. Event writing and reading
# ---------------------------------------------------------------------------

class TestWriteRead:
    def test_write_and_read_back(self, tmp_path):
        init_observability(str(tmp_path / "logs"))
        ev = {"event": "startup", "level": "info", "component": "proxy"}
        log_event(ev)
        results = read_events()
        assert len(results) == 1
        assert results[0]["event"] == "startup"
        assert results[0]["level"] == "info"
        assert "timestamp" in results[0]

    def test_read_filters_by_level(self, tmp_path):
        init_observability(str(tmp_path / "logs"))
        log_event({"event": "a", "level": "info"})
        log_event({"event": "b", "level": "error"})
        log_event({"event": "c", "level": "info"})
        assert len(read_events(level="info")) == 2
        assert len(read_events(level="error")) == 1

    def test_read_filters_by_provider(self, tmp_path):
        init_observability(str(tmp_path / "logs"))
        log_event({"event": "a", "provider": "openai"})
        log_event({"event": "b", "provider": "google"})
        assert len(read_events(provider="openai")) == 1

    def test_read_filters_by_component(self, tmp_path):
        init_observability(str(tmp_path / "logs"))
        log_event({"event": "a", "component": "proxy"})
        log_event({"event": "b", "component": "auth"})
        assert len(read_events(component="proxy")) == 1

    def test_multiple_events(self, tmp_path):
        init_observability(str(tmp_path / "logs"))
        for i in range(10):
            log_event({"event": f"ev_{i}", "level": "info"})
        assert len(read_events()) == 10

    def test_read_across_archive_files(self, tmp_path):
        """When active file rotates, read_events still returns everything."""
        log_dir = tmp_path / "logs"
        init_observability(str(log_dir), max_file_bytes=120, max_archives=5)
        for i in range(10):
            log_event({"event": f"ev_{i}", "level": "info"})
        results = read_events()
        assert len(results) == 10


# ---------------------------------------------------------------------------
# 3. Schema validation
# ---------------------------------------------------------------------------

class TestSchema:
    def test_event_has_timestamp(self, tmp_path):
        init_observability(str(tmp_path / "logs"))
        log_event({"event": "test"})
        ev = read_events()[0]
        assert "timestamp" in ev
        # ISO 8601 check
        ts = ev["timestamp"]
        assert "T" in ts
        assert ts.endswith("Z")

    def test_event_preserves_extra_fields(self, tmp_path):
        init_observability(str(tmp_path / "logs"))
        log_event({
            "event": "provider.request",
            "level": "info",
            "provider": "openai",
            "model": "gpt-4",
            "status": 200,
            "duration_ms": 150,
            "retryable": False,
            "fingerprint": "abc123",
        })
        ev = read_events()[0]
        assert ev["provider"] == "openai"
        assert ev["model"] == "gpt-4"
        assert ev["status"] == 200
        assert ev["duration_ms"] == 150
        assert ev["retryable"] is False
        assert ev["fingerprint"] == "abc123"

    def test_auto_generates_timestamp_if_missing(self, tmp_path):
        init_observability(str(tmp_path / "logs"))
        log_event({"event": "no_ts"})
        ev = read_events()[0]
        assert ev["timestamp"]

    def test_valid_json_per_line(self, tmp_path):
        """Each line in the file is valid JSON."""
        init_observability(str(tmp_path / "logs"))
        log_event({"event": "a"})
        log_event({"event": "b"})
        fp = _active_path()
        with open(fp) as f:
            for line in f:
                json.loads(line.strip())


# ---------------------------------------------------------------------------
# 4. Redaction
# ---------------------------------------------------------------------------

class TestRedaction:
    def test_strips_api_key_field(self):
        ev = {"event": "test", "api_key": "sk-12345", "other": "keep"}
        redacted = redact_event(ev)
        assert "api_key" not in redacted
        assert redacted["other"] == "keep"
        assert redacted["event"] == "test"

    def test_strips_token_field(self):
        ev = {"event": "test", "access_token": "tok_xxx"}
        redacted = redact_event(ev)
        assert "access_token" not in redacted

    def test_strips_secret_field(self):
        ev = {"event": "test", "client_secret": "secret_val"}
        redacted = redact_event(ev)
        assert "client_secret" not in redacted

    def test_strips_password_field(self):
        ev = {"event": "test", "password": "hunter2"}
        redacted = redact_event(ev)
        assert "password" not in redacted

    def test_strips_auth_field(self):
        ev = {"event": "test", "authorization": "Bearer sk-xxx"}
        redacted = redact_event(ev)
        assert "authorization" not in redacted

    def test_strips_credential_field(self):
        ev = {"event": "test", "credential_id": "abc"}
        redacted = redact_event(ev)
        assert "credential_id" not in redacted

    def test_strips_cookie_field(self):
        ev = {"event": "test", "cookie_header": "session=abc"}
        redacted = redact_event(ev)
        assert "cookie_header" not in redacted

    def test_strips_bearer_in_string_values(self):
        ev = {"event": "test", "header": "Bearer sk-real-key-12345"}
        redacted = redact_event(ev)
        assert "sk-real-key" not in redacted["header"]
        assert "[REDACTED]" in redacted["header"]

    def test_strips_url_query_params(self):
        ev = {"event": "test", "url": "https://api.com/v1?key=sk-abc&other=keep"}
        redacted = redact_event(ev)
        assert "sk-abc" not in redacted["url"]
        assert "other=keep" in redacted["url"]

    def test_strips_api_key_query_param(self):
        ev = {"event": "test", "url": "https://api.com/v1?api_key=secret123"}
        redacted = redact_event(ev)
        assert "secret123" not in redacted["url"]

    def test_metadata_whitelisted_keys_only(self):
        ev = {
            "event": "test",
            "metadata": {
                "attempt": 1,
                "total_providers": 3,
                "fallback_chain": ["groq", "google"],
                "user_prompt": "secret prompt",
                "internal_debug": "nope",
            },
        }
        redacted = redact_event(ev)
        meta = redacted["metadata"]
        assert meta["attempt"] == 1
        assert meta["total_providers"] == 3
        assert meta["fallback_chain"] == ["groq", "google"]
        assert "user_prompt" not in meta
        assert "internal_debug" not in meta

    def test_non_mutating(self):
        ev = {"event": "test", "api_key": "sk-xxx", "metadata": {"prompt": "hi"}}
        original_keys = set(ev.keys())
        redact_event(ev)
        assert set(ev.keys()) == original_keys
        assert ev["api_key"] == "sk-xxx"

    def test_preserves_safe_fields(self):
        ev = {"event": "test", "status": 200, "duration_ms": 100, "level": "info"}
        redacted = redact_event(ev)
        assert redacted == ev


# ---------------------------------------------------------------------------
# 5. Correlation — fallback chain detection
# ---------------------------------------------------------------------------

class TestCorrelation:
    def _make_events(self, trace_id: str, chain: list[tuple[str, str, int | None]]) -> list[dict]:
        """Helper: chain = [(provider, event_type, duration_ms), ...]"""
        base_ts = 1700000000
        events = []
        for i, (provider, event_type, dur) in enumerate(chain):
            events.append({
                "trace_id": trace_id,
                "event": event_type,
                "provider": provider,
                "level": "error" if "failed" in event_type else "info",
                "timestamp": f"2024-01-01T00:{i:02d}:00Z",
                "duration_ms": dur,
            })
        return events

    def test_fallback_chain_detected(self, tmp_path):
        init_observability(str(tmp_path / "logs"))
        events = self._make_events("trace-1", [
            ("groq", "provider.request.failed", 200),
            ("google", "provider.request", 150),
        ])
        incidents = correlate_incidents(events)
        assert len(incidents) == 1
        inc = incidents[0]
        assert inc["trace_id"] == "trace-1"
        assert inc["is_fallback"] is True
        assert inc["providers"] == ["groq", "google"]
        assert inc["count"] == 2

    def test_single_provider_not_fallback(self, tmp_path):
        init_observability(str(tmp_path / "logs"))
        events = self._make_events("trace-2", [
            ("openai", "provider.request", 100),
            ("openai", "provider.request", 120),
        ])
        incidents = correlate_incidents(events)
        assert len(incidents) == 1
        assert incidents[0]["is_fallback"] is False
        assert incidents[0]["providers"] == ["openai"]

    def test_multiple_traces(self, tmp_path):
        init_observability(str(tmp_path / "logs"))
        events = (
            self._make_events("t1", [("groq", "provider.request.failed", 200), ("google", "provider.request", 150)])
            + self._make_events("t2", [("openai", "provider.request", 100)])
        )
        incidents = correlate_incidents(events)
        assert len(incidents) == 2
        ids = {i["trace_id"] for i in incidents}
        assert ids == {"t1", "t2"}

    def test_avg_duration(self, tmp_path):
        init_observability(str(tmp_path / "logs"))
        events = self._make_events("t1", [
            ("a", "provider.request", 100),
            ("b", "provider.request", 200),
        ])
        inc = correlate_incidents(events)[0]
        assert inc["avg_duration_ms"] == 150

    def test_p95_duration(self, tmp_path):
        init_observability(str(tmp_path / "logs"))
        events = self._make_events("t1", [
            ("a", "provider.request", 10),
            ("a", "provider.request", 20),
            ("a", "provider.request", 30),
            ("a", "provider.request", 40),
            ("a", "provider.request", 100),
        ])
        inc = correlate_incidents(events)[0]
        assert inc["p95_duration_ms"] == 100

    def test_error_rate(self, tmp_path):
        init_observability(str(tmp_path / "logs"))
        events = self._make_events("t1", [
            ("a", "provider.request", 100),
            ("a", "provider.request.failed", 200),
            ("a", "provider.request", 100),
        ])
        inc = correlate_incidents(events)[0]
        assert inc["error_rate"] == pytest.approx(1 / 3, abs=0.01)

    def test_events_sorted_by_timestamp(self, tmp_path):
        init_observability(str(tmp_path / "logs"))
        events = self._make_events("t1", [
            ("b", "provider.request", 100),
            ("a", "provider.request", 50),
        ])
        inc = correlate_incidents(events)[0]
        assert inc["events"][0]["provider"] == "b"
        assert inc["events"][1]["provider"] == "a"

    def test_incidents_sorted_by_error_rate_desc(self, tmp_path):
        init_observability(str(tmp_path / "logs"))
        events = (
            self._make_events("clean", [("a", "provider.request", 10)])
            + self._make_events("dirty", [("b", "provider.request.failed", 10)])
        )
        incidents = correlate_incidents(events)
        assert incidents[0]["trace_id"] == "dirty"
        assert incidents[1]["trace_id"] == "clean"

    def test_empty_events(self, tmp_path):
        init_observability(str(tmp_path / "logs"))
        assert correlate_incidents([]) == []


# ---------------------------------------------------------------------------
# 6. Summary
# ---------------------------------------------------------------------------

class TestSummary:
    def test_summary_counts_by_level(self, tmp_path):
        init_observability(str(tmp_path / "logs"))
        log_event({"event": "a", "level": "info"})
        log_event({"event": "b", "level": "error"})
        log_event({"event": "c", "level": "info"})
        log_event({"event": "d", "level": "warning"})
        s = get_summary()
        assert s["by_level"]["info"] == 2
        assert s["by_level"]["error"] == 1
        assert s["by_level"]["warning"] == 1
        assert s["total_events"] == 4

    def test_summary_counts_by_provider(self, tmp_path):
        init_observability(str(tmp_path / "logs"))
        log_event({"event": "a", "provider": "openai"})
        log_event({"event": "b", "provider": "openai"})
        log_event({"event": "c", "provider": "google"})
        s = get_summary()
        assert s["by_provider"]["openai"] == 2
        assert s["by_provider"]["google"] == 1

    def test_summary_counts_by_error_type(self, tmp_path):
        init_observability(str(tmp_path / "logs"))
        log_event({"event": "a", "error_type": "timeout", "level": "error"})
        log_event({"event": "b", "error_type": "timeout", "level": "error"})
        log_event({"event": "c", "error_type": "ssl_error", "level": "error"})
        s = get_summary()
        assert s["by_error_type"]["timeout"] == 2
        assert s["by_error_type"]["ssl_error"] == 1

    def test_summary_top_incidents(self, tmp_path):
        init_observability(str(tmp_path / "logs"))
        # One incident with errors
        log_event({"event": "a", "trace_id": "t1", "level": "error", "provider": "groq"})
        log_event({"event": "b", "trace_id": "t1", "level": "error", "provider": "google"})
        # One clean incident
        log_event({"event": "c", "trace_id": "t2", "level": "info", "provider": "openai"})
        s = get_summary()
        top = s["top_incidents"]
        assert len(top) >= 1
        assert top[0]["trace_id"] == "t1"
        assert top[0]["error_rate"] == 1.0

    def test_summary_since_filter(self, tmp_path):
        init_observability(str(tmp_path / "logs"))
        log_event({"event": "old", "level": "info"})
        # future timestamp — should be filtered out
        s = get_summary(since_iso="2099-01-01T00:00:00Z")
        assert s["total_events"] == 0

    def test_empty_summary(self, tmp_path):
        init_observability(str(tmp_path / "logs"))
        s = get_summary()
        assert s["total_events"] == 0
        assert s["by_level"] == {}
        assert s["by_provider"] == {}


# ---------------------------------------------------------------------------
# 7. Rotation
# ---------------------------------------------------------------------------

class TestRotation:
    def test_rotation_creates_archive(self, tmp_path):
        log_dir = tmp_path / "logs"
        # max_file_bytes=50 means ~2-3 events will trigger rotation
        init_observability(str(log_dir), max_file_bytes=50, max_archives=3)
        for i in range(20):
            log_event({"event": f"ev_{i}", "level": "info", "metadata": {"x": "y" * 20}})
        # Should have archives now
        archives = [f for f in log_dir.iterdir() if f.name.startswith("events.") and f.name.endswith(".jsonl")]
        assert len(archives) >= 1

    def test_rotation_max_archives_respected(self, tmp_path):
        log_dir = tmp_path / "logs"
        init_observability(str(log_dir), max_file_bytes=50, max_archives=2)
        for i in range(30):
            log_event({"event": f"ev_{i}", "level": "info", "metadata": {"z": "w" * 30}})
        archives = [f for f in log_dir.iterdir() if f.name.startswith("events.") and f.name.endswith(".jsonl")]
        assert len(archives) <= 2

    def test_rotate_logs_removes_old_files(self, tmp_path):
        log_dir = tmp_path / "logs"
        init_observability(str(log_dir), retention_days=0)
        # Create an old archive file
        old_file = log_dir / "events.1.jsonl"
        old_file.write_text('{"old":true}\n')
        # Set mtime to the past
        os.utime(str(old_file), (0, 0))
        result = rotate_logs()
        assert result["removed"] >= 1
        assert not old_file.exists()


# ---------------------------------------------------------------------------
# 8. Thread safety
# ---------------------------------------------------------------------------

class TestThreadSafety:
    def test_concurrent_writes(self, tmp_path):
        init_observability(str(tmp_path / "logs"))
        n_threads = 8
        events_per_thread = 50
        barrier = threading.Barrier(n_threads)

        def writer(thread_idx: int):
            barrier.wait()
            for i in range(events_per_thread):
                log_event({
                    "event": f"thread_{thread_idx}_ev_{i}",
                    "level": "info",
                    "thread": thread_idx,
                })

        threads = [threading.Thread(target=writer, args=(t,)) for t in range(n_threads)]
        for t in threads:
            t.start()
        for t in threads:
            t.join(timeout=10)

        results = read_events()
        assert len(results) == n_threads * events_per_thread

    def test_no_corrupted_json(self, tmp_path):
        """Concurrent writes never produce partial/corrupt JSON lines."""
        init_observability(str(tmp_path / "logs"))
        barrier = threading.Barrier(4)

        def writer(tid: int):
            barrier.wait()
            for i in range(30):
                log_event({"event": f"t{tid}_{i}", "metadata": {"data": "x" * 50}})

        threads = [threading.Thread(target=writer, args=(t,)) for t in range(4)]
        for t in threads:
            t.start()
        for t in threads:
            t.join(timeout=10)

        fp = _active_path()
        with open(fp) as f:
            for line in f:
                line = line.strip()
                if line:
                    json.loads(line)  # raises on corruption


# ---------------------------------------------------------------------------
# 9. Integration — end-to-end with real events
# ---------------------------------------------------------------------------

class TestIntegration:
    def test_full_workflow(self, tmp_path):
        """Simulate a realistic proxy session: startup, requests, fallback, errors."""
        init_observability(str(tmp_path / "logs"))
        tid = generate_id()

        # Startup
        log_event({"event": "startup", "level": "info", "component": "proxy"})

        # Auth success — separate trace
        log_event({"event": "auth.success", "level": "info", "component": "auth", "trace_id": generate_id()})

        # Request with fallback
        log_event({
            "event": "provider.request",
            "level": "info",
            "provider": "groq",
            "trace_id": tid,
            "status": 429,
            "duration_ms": 150,
            "retryable": True,
            "error_type": "rate_limited",
        })
        log_event({
            "event": "provider.request",
            "level": "info",
            "provider": "google",
            "trace_id": tid,
            "status": 200,
            "duration_ms": 320,
        })

        s = get_summary()
        assert s["total_events"] == 4
        assert s["by_level"]["info"] == 4
        assert s["by_provider"]["groq"] == 1
        assert s["by_provider"]["google"] == 1

        incidents = correlate_incidents(read_events())
        fallback = [i for i in incidents if i["is_fallback"]]
        assert len(fallback) == 1
        inc = fallback[0]
        assert inc["is_fallback"] is True
        assert inc["providers"] == ["groq", "google"]
        assert inc["count"] == 2
        assert inc["avg_duration_ms"] == 235

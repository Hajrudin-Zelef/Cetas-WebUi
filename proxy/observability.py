"""Cetas Observability — structured event logging for the proxy.

Writes JSONL events to disk with rotation, redaction, correlation, and
summary capabilities.  Zero external dependencies (stdlib only).

Usage:
    from proxy.observability import init_observability, log_event, read_events

    init_observability("/app/data/logs")
    log_event({"event": "provider.request", "provider": "openai", ...})
"""

from __future__ import annotations

import datetime
import json
import os
import re
import threading
import time
import uuid
from pathlib import Path
from typing import Any

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

_VALID_LEVELS = frozenset({"info", "warning", "error"})
_VALID_COMPONENTS = frozenset({"proxy", "auth", "frontend"})
_WHITELISTED_META_KEYS = frozenset({
    "attempt", "total_providers", "fallback_chain", "upstream_path",
    "status_text", "retry_after", "model_alias", "stream",
    "query_length", "client_ip",
})

_REDACT_KEY_PATTERNS = re.compile(
    r"(key|token|secret|password|auth|credential|cookie)",
    re.IGNORECASE,
)
_REDACT_URL_PARAMS = re.compile(r"[?&](?:key|token|secret|password|api_key)=[^&]*", re.IGNORECASE)
_REDACT_BEARER = re.compile(r"Bearer\s+\S+", re.IGNORECASE)

_FILE_SUFFIX = ".jsonl"


# ---------------------------------------------------------------------------
# Module-level state
# ---------------------------------------------------------------------------

_lock: threading.Lock = threading.Lock()
_log_dir: Path = Path("/app/data/logs")
_max_file_bytes: int = 10_000_000
_max_archives: int = 3
_retention_days: int = 7
_initialized: bool = False


# ---------------------------------------------------------------------------
# Public helpers
# ---------------------------------------------------------------------------

def generate_id() -> str:
    """Return a fresh UUID4 string."""
    return str(uuid.uuid4())


def _now_iso() -> str:
    return datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")


# ---------------------------------------------------------------------------
# Initialisation
# ---------------------------------------------------------------------------

def init_observability(
    log_dir: str = "/app/data/logs",
    *,
    max_file_bytes: int = 10_000_000,
    max_archives: int = 3,
    retention_days: int = 7,
) -> None:
    """Configure the observability subsystem.  Safe to call multiple times."""
    global _log_dir, _max_file_bytes, _max_archives, _retention_days, _initialized
    with _lock:
        _log_dir = Path(log_dir)
        _max_file_bytes = max_file_bytes
        _max_archives = max_archives
        _retention_days = retention_days
        _log_dir.mkdir(parents=True, exist_ok=True)
        _initialized = True


# ---------------------------------------------------------------------------
# Redaction
# ---------------------------------------------------------------------------

def redact_event(event: dict[str, Any]) -> dict[str, Any]:
    """Return a sanitised *copy* of *event* — never mutates the original."""
    out: dict[str, Any] = {}
    for k, v in event.items():
        kl = k.lower()
        if _REDACT_KEY_PATTERNS.search(kl):
            continue  # strip the entire key
        if isinstance(v, str):
            v = _REDACT_URL_PARAMS.sub("", v)
            v = _REDACT_BEARER.sub("Bearer [REDACTED]", v)
        if k == "metadata" and isinstance(v, dict):
            v = {mk: mv for mk, mv in v.items() if mk in _WHITELISTED_META_KEYS}
        out[k] = v
    return out


# ---------------------------------------------------------------------------
# Event store — JSONL write / read
# ---------------------------------------------------------------------------

def _active_path() -> Path:
    return _log_dir / f"events{_FILE_SUFFIX}"


def _archive_path(n: int) -> Path:
    return _log_dir / f"events.{n}{_FILE_SUFFIX}"


def _rotate_if_needed() -> None:
    """Rotate the active file when it exceeds _max_file_bytes."""
    p = _active_path()
    if not p.exists() or p.stat().st_size < _max_file_bytes:
        return
    # Shift archives: .3 → delete, .2 → .3, .1 → .2, active → .1
    for i in range(_max_archives, 0, -1):
        dst = _archive_path(i)
        if i == _max_archives and dst.exists():
            dst.unlink()
        elif i > 1:
            src = _archive_path(i - 1)
            if src.exists():
                src.rename(dst)
        else:
            src = _active_path()
            if src.exists():
                src.rename(dst)


def log_event(event: dict[str, Any]) -> None:
    """Append a single event to the active JSONL log file (thread-safe)."""
    if not _initialized:
        init_observability()
    redacted = redact_event(event)
    redacted.setdefault("timestamp", _now_iso())
    line = json.dumps(redacted, ensure_ascii=False, separators=(",", ":")) + "\n"
    with _lock:
        _rotate_if_needed()
        with open(_active_path(), "a", encoding="utf-8") as f:
            f.write(line)


def read_events(
    *,
    since_iso: str | None = None,
    level: str | None = None,
    provider: str | None = None,
    component: str | None = None,
) -> list[dict[str, Any]]:
    """Read events from all JSONL files, applying optional filters."""
    if not _initialized:
        init_observability()
    since_dt: datetime.datetime | None = None
    if since_iso:
        since_dt = datetime.datetime.fromisoformat(since_iso.replace("Z", "+00:00"))

    files: list[Path] = []
    for i in range(_max_archives, 0, -1):
        p = _archive_path(i)
        if p.exists():
            files.append(p)
    active = _active_path()
    if active.exists():
        files.append(active)

    results: list[dict[str, Any]] = []
    for fp in files:
        try:
            with open(fp, "r", encoding="utf-8") as f:
                for raw_line in f:
                    raw_line = raw_line.strip()
                    if not raw_line:
                        continue
                    try:
                        ev = json.loads(raw_line)
                    except json.JSONDecodeError:
                        continue
                    if since_dt:
                        ts = ev.get("timestamp", "")
                        try:
                            ev_dt = datetime.datetime.fromisoformat(ts.replace("Z", "+00:00"))
                            if ev_dt < since_dt:
                                continue
                        except (ValueError, TypeError):
                            continue
                    if level and ev.get("level") != level:
                        continue
                    if provider and ev.get("provider") != provider:
                        continue
                    if component and ev.get("component") != component:
                        continue
                    results.append(ev)
        except OSError:
            continue
    return results


# ---------------------------------------------------------------------------
# Log rotation / cleanup
# ---------------------------------------------------------------------------

def rotate_logs() -> dict[str, Any]:
    """Remove archives older than retention_days.  Returns cleanup stats."""
    if not _initialized:
        init_observability()
    cutoff = time.time() - (_retention_days * 86400)
    removed = 0
    with _lock:
        for fp in _log_dir.iterdir():
            if fp.suffix == _FILE_SUFFIX and fp.name != f"events{_FILE_SUFFIX}":
                try:
                    if fp.stat().st_mtime < cutoff:
                        fp.unlink()
                        removed += 1
                except OSError:
                    pass
    return {"removed": removed, "cutoff_days": _retention_days}


# ---------------------------------------------------------------------------
# Correlation — detect fallback chains and build incidents
# ---------------------------------------------------------------------------

def _group_by_trace(events: list[dict[str, Any]]) -> dict[str, list[dict[str, Any]]]:
    groups: dict[str, list[dict[str, Any]]] = {}
    for ev in events:
        tid = ev.get("trace_id", "")
        if not tid:
            continue
        groups.setdefault(tid, []).append(ev)
    for tid in groups:
        groups[tid].sort(key=lambda e: e.get("timestamp", ""))
    return groups


def _percentile(values: list[int], pct: float) -> int:
    if not values:
        return 0
    s = sorted(values)
    idx = int(len(s) * pct / 100)
    idx = min(idx, len(s) - 1)
    return s[idx]


def correlate_incidents(events: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Group events by trace_id and produce incident summaries."""
    groups = _group_by_trace(events)
    incidents: list[dict[str, Any]] = []
    for tid, evs in groups.items():
        durations = [e.get("duration_ms", 0) for e in evs if isinstance(e.get("duration_ms"), (int, float))]
        errors = [e for e in evs if e.get("level") == "error"]
        providers = []
        seen = set()
        for e in evs:
            p = e.get("provider", "")
            if p and p not in seen:
                providers.append(p)
                seen.add(p)
        first_ev = evs[0] if evs else {}
        incidents.append({
            "trace_id": tid,
            "first_occurrence": first_ev.get("timestamp", ""),
            "last_occurrence": evs[-1].get("timestamp", "") if evs else "",
            "count": len(evs),
            "avg_duration_ms": round(sum(durations) / len(durations)) if durations else 0,
            "p95_duration_ms": _percentile(durations, 95),
            "error_rate": round(len(errors) / len(evs), 4) if evs else 0,
            "providers": providers,
            "is_fallback": len(providers) > 1,
            "events": evs,
        })
    incidents.sort(key=lambda i: (-i["error_rate"], -i["count"]))
    return incidents


# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------

def get_summary(since_iso: str | None = None) -> dict[str, Any]:
    """Aggregate event counts by level, provider, and error_type."""
    events = read_events(since_iso=since_iso)
    by_level: dict[str, int] = {}
    by_provider: dict[str, int] = {}
    by_error: dict[str, int] = {}
    for ev in events:
        lvl = ev.get("level", "info")
        by_level[lvl] = by_level.get(lvl, 0) + 1
        prov = ev.get("provider")
        if prov:
            by_provider[prov] = by_provider.get(prov, 0) + 1
        etype = ev.get("error_type")
        if etype:
            by_error[etype] = by_error.get(etype, 0) + 1
    # top incidents sorted by severity (errors first, then count)
    incidents = correlate_incidents(events)
    top = [
        {
            "trace_id": i["trace_id"],
            "error_rate": i["error_rate"],
            "count": i["count"],
            "providers": i["providers"],
            "is_fallback": i["is_fallback"],
        }
        for i in incidents
        if i["error_rate"] > 0 or i["count"] > 1
    ][:10]
    return {
        "total_events": len(events),
        "by_level": by_level,
        "by_provider": by_provider,
        "by_error_type": by_error,
        "top_incidents": top,
    }

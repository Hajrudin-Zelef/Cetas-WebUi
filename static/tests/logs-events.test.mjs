import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
    parsePeriod,
    filterByLevel,
    renderTimeline,
    renderReport,
    formatTimestamp,
    levelBadge,
    renderCounters,
    renderIncidents
} from "../js/features/logs-events.js";

// --- parsePeriod ---
describe("parsePeriod", () => {
    it("returns a valid ISO string", () => {
        assert.ok(!isNaN(Date.parse(parsePeriod("1h"))));
    });
    it("15m is ~15 minutes before now", () => {
        const diff = Date.now() - Date.parse(parsePeriod("15m"));
        assert.ok(diff >= 14 * 60_000 && diff <= 16 * 60_000);
    });
    it("24h is ~24 hours before now", () => {
        const diff = Date.now() - Date.parse(parsePeriod("24h"));
        assert.ok(diff >= 23 * 60 * 60_000 && diff <= 25 * 60 * 60_000);
    });
    it("7d is ~7 days before now", () => {
        const diff = Date.now() - Date.parse(parsePeriod("7d"));
        assert.ok(diff >= 6 * 24 * 60 * 60_000 && diff <= 8 * 24 * 60 * 60_000);
    });
    it("defaults to 1h for unknown period", () => {
        const diff = Date.now() - Date.parse(parsePeriod("unknown"));
        assert.ok(diff >= 55 * 60_000 && diff <= 65 * 60_000);
    });
});

// --- filterByLevel ---
describe("filterByLevel", () => {
    const events = [
        { level: "error", message: "a" },
        { level: "warning", message: "b" },
        { level: "info", message: "c" },
        { level: "error", message: "d" },
    ];
    it("returns all when level is 'all'", () => {
        assert.equal(filterByLevel(events, "all").length, 4);
    });
    it("returns all when level is null/undefined", () => {
        assert.equal(filterByLevel(events, null).length, 4);
        assert.equal(filterByLevel(events).length, 4);
    });
    it("filters by error", () => {
        const result = filterByLevel(events, "error");
        assert.equal(result.length, 2);
        assert.ok(result.every(e => e.level === "error"));
    });
    it("filters by warning", () => {
        assert.equal(filterByLevel(events, "warning").length, 1);
    });
    it("returns empty for non-existent level", () => {
        assert.equal(filterByLevel(events, "critical").length, 0);
    });
});

// --- formatTimestamp ---
describe("formatTimestamp", () => {
    it("formats ISO string correctly", () => {
        const result = formatTimestamp("2025-03-15T09:05:30.000Z");
        assert.equal(typeof result, "string");
        assert.match(result, /\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/);
    });
});

// --- levelBadge ---
describe("levelBadge", () => {
    it("returns badge for error", () => {
        const html = levelBadge("error");
        assert.ok(html.includes("logs-badge-error"));
        assert.ok(html.includes("error"));
    });
    it("returns badge for warning", () => {
        assert.ok(levelBadge("warning").includes("logs-badge-warning"));
    });
    it("returns badge for info", () => {
        assert.ok(levelBadge("info").includes("logs-badge-info"));
    });
    it("defaults to info for unknown level", () => {
        assert.ok(levelBadge("unknown").includes("logs-badge-info"));
    });
});

// --- Minimal DOM mock for Node.js ---
if (typeof globalThis.document === "undefined") {
    const _store = {};
    function _el(id) {
        if (!_store[id]) {
            _store[id] = {
                _innerHTML: "",
                _textContent: "",
                _style: {},
                get innerHTML() { return this._innerHTML; },
                set innerHTML(v) { this._innerHTML = v; },
                get textContent() { return this._textContent; },
                set textContent(v) { this._textContent = v; },
                get style() { return this._style; },
                querySelectorAll(sel) { return []; },
                addEventListener() {}
            };
        }
        return _store[id];
    }
    globalThis.document = {
        _store,
        _reset() { for (const k of Object.keys(this._store)) delete this._store[k]; },
        getElementById: _el,
        querySelectorAll() { return []; },
        createElement(t) {
            return { href: "", download: "", click() {} };
        },
        createObjectURL() { return ""; },
        revokeObjectURL() {}
    };
    globalThis.document.body = globalThis.document;
}

function _reset() {
    globalThis.document._reset();
}

// --- renderTimeline ---
describe("renderTimeline", () => {
    it("renders empty state when no events", () => {
        _reset();
        renderTimeline([]);
        assert.ok(globalThis.document.getElementById("logs-timeline").innerHTML.includes("Aucun événement"));
    });
    it("renders events with badges", () => {
        _reset();
        const events = [{ level: "error", message: "Test error", timestamp: "2025-01-01T00:00:00Z", source: "api" }];
        renderTimeline(events);
        const html = globalThis.document.getElementById("logs-timeline").innerHTML;
        assert.ok(html.includes("logs-badge-error"));
        assert.ok(html.includes("Test error"));
        assert.ok(html.includes("api"));
    });
    it("renders multiple events", () => {
        _reset();
        renderTimeline([
            { level: "error", message: "e1", timestamp: "2025-01-01T00:00:00Z" },
            { level: "info", message: "e2", timestamp: "2025-01-01T00:01:00Z" },
        ]);
        const html = globalThis.document.getElementById("logs-timeline").innerHTML;
        assert.ok(html.includes("e1") && html.includes("e2"));
        // Each event creates a data-index div
        assert.ok(html.includes('data-index="0"'));
        assert.ok(html.includes('data-index="1"'));
    });
});

// --- renderCounters ---
describe("renderCounters", () => {
    it("sets counter values", () => {
        _reset();
        renderCounters({ errors: 5, warnings: 3, incidents: 1, p95_latency_ms: 420 });
        assert.equal(globalThis.document.getElementById("logs-errors-count").textContent, 5);
        assert.equal(globalThis.document.getElementById("logs-warnings-count").textContent, 3);
        assert.equal(globalThis.document.getElementById("logs-incidents-count").textContent, 1);
        assert.equal(globalThis.document.getElementById("logs-p95-count").textContent, "420 ms");
    });
    it("handles missing data gracefully", () => {
        _reset();
        renderCounters({});
        assert.equal(globalThis.document.getElementById("logs-errors-count").textContent, 0);
        assert.equal(globalThis.document.getElementById("logs-p95-count").textContent, "—");
    });
});

// --- renderIncidents ---
describe("renderIncidents", () => {
    it("hides section when no incidents", () => {
        _reset();
        const el = globalThis.document.getElementById("logs-incidents");
        el._style.display = "block";
        renderIncidents(null);
        assert.equal(el.style.display, "none");
    });
    it("renders incident cards", () => {
        _reset();
        const el = globalThis.document.getElementById("logs-incidents");
        const list = globalThis.document.getElementById("logs-incidents-list");
        renderIncidents([
            { title: "Timeout spike", count: 12, first_at: "2025-01-01T00:00:00Z", last_at: "2025-01-01T01:00:00Z" },
        ]);
        assert.ok(list.innerHTML.includes("Timeout spike"));
        assert.ok(list.innerHTML.includes("12 occurrence"));
    });
});

// --- renderReport ---
describe("renderReport", () => {
    it("renders severity badge and summary", () => {
        _reset();
        renderReport({ severity: "high", summary: "Test summary", recommendations: ["Fix A", "Fix B"] });
        const html = globalThis.document.getElementById("logs-report-content").innerHTML;
        assert.ok(html.includes("logs-badge-high"));
        assert.ok(html.includes("Test summary"));
        assert.ok(html.includes("Fix A"));
    });
    it("falls back to JSON when no structured fields", () => {
        _reset();
        renderReport({ foo: "bar" });
        assert.ok(globalThis.document.getElementById("logs-report-content").innerHTML.includes("foo"));
    });
});

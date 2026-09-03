const LOGS_BASE = "/api/logs";

function _getToken() {
    return typeof Auth !== "undefined" && Auth.getToken ? Auth.getToken() : null;
}

function parsePeriod(period) {
    const now = new Date();
    const ms = { "15m": 15 * 60_000, "1h": 60 * 60_000, "24h": 24 * 60 * 60_000, "7d": 7 * 24 * 60 * 60_000 };
    return new Date(now.getTime() - (ms[period] || ms["1h"])).toISOString();
}

function formatTimestamp(iso) {
    const d = new Date(iso);
    const pad = n => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function levelBadge(level) {
    const cls = { error: "logs-badge-error", warning: "logs-badge-warning", info: "logs-badge-info" };
    return `<span class="logs-badge ${cls[level] || "logs-badge-info"}">${level}</span>`;
}

function filterByLevel(events, level) {
    if (!level || level === "all") return events;
    return events.filter(e => e.level === level);
}

function renderTimeline(events) {
    const el = document.getElementById("logs-timeline");
    if (!events.length) {
        el.innerHTML = '<div class="logs-empty">Aucun événement pour cette période.</div>';
        return;
    }
    el.innerHTML = events.map((e, i) => `
        <div class="logs-event" data-index="${i}">
            <div class="logs-event-header">
                ${levelBadge(e.level)}
                <span class="logs-event-time">${formatTimestamp(e.timestamp)}</span>
                <span class="logs-event-source">${e.source || ""}</span>
            </div>
            <div class="logs-event-message">${e.message}</div>
        </div>
    `).join("");
    el.querySelectorAll(".logs-event").forEach((div, i) => {
        div.addEventListener("click", () => showDetail(events[i]));
    });
}

function showDetail(event) {
    const el = document.getElementById("logs-detail");
    const pre = document.getElementById("logs-detail-content");
    el.style.display = "block";
    pre.textContent = JSON.stringify(event, null, 2);
}

function renderCounters(summary) {
    const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
    set("logs-errors-count", summary.errors ?? 0);
    set("logs-warnings-count", summary.warnings ?? 0);
    set("logs-incidents-count", summary.incidents ?? 0);
    set("logs-p95-count", summary.p95_latency_ms != null ? summary.p95_latency_ms + " ms" : "—");
}

function renderIncidents(incidents) {
    const el = document.getElementById("logs-incidents");
    const list = document.getElementById("logs-incidents-list");
    if (!incidents || !incidents.length) { el.style.display = "none"; return; }
    el.style.display = "block";
    list.innerHTML = incidents.map(inc => `
        <div class="logs-incident-card">
            <div class="logs-incident-title">${inc.title || "Incident"}</div>
            <div class="logs-incident-meta">${inc.count ?? 0} occurrence${(inc.count ?? 0) > 1 ? "s" : ""} — première: ${formatTimestamp(inc.first_at)}, dernière: ${formatTimestamp(inc.last_at)}</div>
        </div>
    `).join("");
}

function renderReport(report) {
    const el = document.getElementById("logs-report");
    const content = document.getElementById("logs-report-content");
    el.style.display = "block";
    let html = "";
    if (report.severity) html += `<div class="logs-report-severity"><span class="logs-badge logs-badge-${report.severity}">${report.severity}</span></div>`;
    if (report.summary) html += `<div class="logs-report-field"><strong>Résumé:</strong> ${report.summary}</div>`;
    if (report.recommendations && report.recommendations.length) {
        html += `<div class="logs-report-field"><strong>Recommandations:</strong><ul>${report.recommendations.map(r => `<li>${r}</li>`).join("")}</ul></div>`;
    }
    if (report.analysis) html += `<div class="logs-report-field"><strong>Analyse:</strong> ${report.analysis}</div>`;
    content.innerHTML = html || `<pre>${JSON.stringify(report, null, 2)}</pre>`;
}

function exportJson(events) {
    const blob = new Blob([JSON.stringify(events, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `cetas-logs-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
}

let _logsEvents = [];

async function fetchLogs() {
    const token = _getToken();
    const periodEl = document.getElementById("logs-period");
    const levelEl = document.getElementById("logs-level");
    const since = parsePeriod(periodEl ? periodEl.value : "1h");
    const level = levelEl ? levelEl.value : "all";

    try {
        const url = `${LOGS_BASE}/summary?since=${encodeURIComponent(since)}&level=${level}`;
        const headers = {};
        if (token) headers["Authorization"] = "Bearer " + token;
        const resp = await fetch(url, { headers });
        if (!resp.ok) throw new Error(resp.status);
        const data = await resp.json();
        _logsEvents = data.events || [];
        renderCounters(data);
        renderIncidents(data.incidents);
        renderTimeline(_logsEvents);
    } catch {
        const el = document.getElementById("logs-timeline");
        if (el) el.innerHTML = '<div class="logs-empty">Impossible de charger les logs.</div>';
    }
}

async function analyzeLogs() {
    const token = _getToken();
    const btn = document.getElementById("logs-analyze-btn");
    if (btn) { btn.disabled = true; btn.textContent = "Analyse en cours…"; }
    try {
        const headers = { "Content-Type": "application/json" };
        if (token) headers["Authorization"] = "Bearer " + token;
        const resp = await fetch(`${LOGS_BASE}/analyze`, { method: "POST", headers, body: JSON.stringify({ events: _logsEvents }) });
        if (!resp.ok) throw new Error(resp.status);
        const report = await resp.json();
        renderReport(report);
    } catch {
        const el = document.getElementById("logs-report");
        const content = document.getElementById("logs-report-content");
        el.style.display = "block";
        content.innerHTML = '<div class="logs-empty">Échec de l\'analyse IA.</div>';
    } finally {
        if (btn) { btn.disabled = false; btn.textContent = "🤖 Analyser avec Mimo 2.5"; }
    }
}

export function initLogsPanel() {
    const refreshBtn = document.getElementById("logs-refresh-btn");
    const analyzeBtn = document.getElementById("logs-analyze-btn");
    const exportBtn = document.getElementById("logs-export-btn");

    if (refreshBtn) refreshBtn.addEventListener("click", fetchLogs);
    if (analyzeBtn) analyzeBtn.addEventListener("click", analyzeLogs);
    if (exportBtn) exportBtn.addEventListener("click", () => exportJson(_logsEvents));

    document.getElementById("logs-period")?.addEventListener("change", fetchLogs);
    document.getElementById("logs-level")?.addEventListener("change", fetchLogs);

    fetchLogs();
}

export { parsePeriod, filterByLevel, renderTimeline, renderReport, formatTimestamp, levelBadge, renderCounters, renderIncidents, showDetail, exportJson, fetchLogs, analyzeLogs };

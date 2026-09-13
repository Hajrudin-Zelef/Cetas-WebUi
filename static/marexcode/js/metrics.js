function _authHeaders() {
    const h = { 'Content-Type': 'application/json' };
    if (typeof Auth !== 'undefined' && Auth.getToken) { const tk = Auth.getToken(); if (tk) h.Authorization = 'Bearer ' + tk; }
    return h;
}

let _interval = null;
let _prevNet = null;

export function initMetrics() {
    fetchAndUpdate();
    _interval = setInterval(fetchAndUpdate, 10000);
}

export function stopMetrics() {
    if (_interval) { clearInterval(_interval); _interval = null; }
}

async function fetchAndUpdate() {
    try {
        const r = await fetch('/api/marexcode/metrics', { headers: _authHeaders(), signal: AbortSignal.timeout(5000) });
        if (!r.ok) return;
        const m = await r.json();
        updateCPU(m.cpu);
        updateRAM(m.ram);
        updateDisk(m.disk);
        updateNet(m.net);
        updateVRAM(m.vram);
    } catch (e) { }
}

function _dotClass(pct) {
    return pct >= 90 ? 'crit' : pct >= 70 ? 'warn' : 'ok';
}

function _setDot(id, cls) {
    const dot = document.getElementById(id);
    if (!dot) return;
    dot.className = 'sb-metric-dot pulse' + (cls ? ' ' + cls : '');
}

function _fmtBytes(n) {
    if (!isFinite(n) || n < 0) n = 0;
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    let i = 0;
    while (n >= 1024 && i < units.length - 1) { n /= 1024; i++; }
    return (i === 0 ? Math.round(n) : n.toFixed(n < 10 ? 1 : 0)) + ' ' + units[i];
}

function updateCPU(pct) {
    const val = document.getElementById('metric-cpu-val');
    if (val) val.textContent = (pct == null ? '—' : pct + '%');
    _setDot('metric-cpu-dot', pct == null ? '' : _dotClass(pct));
}

function updateRAM(ram) {
    if (!ram || !ram.total) return;
    const pct = Math.round(ram.used * 100 / ram.total);
    const usedGB = (ram.used / 1024).toFixed(1);
    const totalGB = (ram.total / 1024).toFixed(1);
    const val = document.getElementById('metric-ram-val');
    if (val) val.textContent = usedGB + ' / ' + totalGB + ' GiB';
    _setDot('metric-ram-dot', _dotClass(pct));
}

function updateDisk(disk) {
    if (!disk || !disk.total) return;
    const pct = Math.round(disk.used * 100 / disk.total);
    const usedGB = (disk.used / 1024).toFixed(0);
    const totalGB = (disk.total / 1024).toFixed(0);
    const val = document.getElementById('metric-disk-val');
    if (val) val.textContent = usedGB + ' / ' + totalGB + ' GB';
    _setDot('metric-disk-dot', _dotClass(pct));
}

function updateNet(net) {
    const val = document.getElementById('metric-net-val');
    if (!net || net.rx == null || net.tx == null) {
        if (val) val.textContent = '—';
        _setDot('metric-net-dot', '');
        return;
    }
    const now = Date.now();
    if (_prevNet) {
        const dt = (now - _prevNet.t) / 1000;
        const rx = dt > 0 ? Math.max(0, (net.rx - _prevNet.rx) / dt) : 0;
        const tx = dt > 0 ? Math.max(0, (net.tx - _prevNet.tx) / dt) : 0;
        if (val) val.textContent = '↓ ' + _fmtBytes(rx) + '/s · ↑ ' + _fmtBytes(tx) + '/s';
        _setDot('metric-net-dot', (rx + tx) > 0 ? 'ok' : '');
    } else if (val) {
        val.textContent = '↓ 0 B/s · ↑ 0 B/s';
    }
    _prevNet = { rx: net.rx, tx: net.tx, t: now };
}

function updateVRAM(vram) {
    const listEl = document.getElementById('metric-vram-list');
    if (!listEl) return;
    if (!vram || !vram.length) { listEl.innerHTML = ''; return; }
    listEl.innerHTML = vram.map(g => {
        const pct = g.total > 0 ? Math.round(g.used * 100 / g.total) : 0;
        const usedGB = (g.used / 1024).toFixed(1);
        const totalGB = (g.total / 1024).toFixed(1);
        return '<div class="sb-metric-line"><span class="sb-metric-dot pulse ' + _dotClass(pct) + '"></span><span class="sb-metric-label">' + esc(g.name) + ' :</span><span class="sb-metric-value">' + usedGB + ' / ' + totalGB + ' GiB</span></div>' +
            '<div class="sb-metric-sub">GPU ' + g.util + '% · ' + g.temp + '°C</div>';
    }).join('');
}

function esc(s) {
    const d = document.createElement('div');
    d.textContent = String(s == null ? '' : s);
    return d.innerHTML;
}

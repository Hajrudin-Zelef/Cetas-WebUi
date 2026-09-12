function _authHeaders() {
    const h = { 'Content-Type': 'application/json' };
    if (typeof Auth !== 'undefined' && Auth.getToken) { const tk = Auth.getToken(); if (tk) h.Authorization = 'Bearer ' + tk; }
    return h;
}

let _interval = null;

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
        updateVRAM(m.vram);
    } catch (e) { }
}

function updateCPU(pct) {
    const fill = document.getElementById('metric-cpu-fill');
    const val = document.getElementById('metric-cpu-val');
    if (fill) fill.style.width = pct + '%';
    if (val) val.textContent = pct + '%';
}

function updateRAM(ram) {
    if (!ram || !ram.total) return;
    const pct = Math.round(ram.used * 100 / ram.total);
    const usedGB = (ram.used / 1024).toFixed(1);
    const totalGB = (ram.total / 1024).toFixed(1);
    const fill = document.getElementById('metric-ram-fill');
    const val = document.getElementById('metric-ram-val');
    if (fill) fill.style.width = pct + '%';
    if (val) val.textContent = usedGB + ' / ' + totalGB + ' GiB';
}

function updateDisk(disk) {
    if (!disk || !disk.total) return;
    const pct = Math.round(disk.used * 100 / disk.total);
    const usedGB = (disk.used / 1024).toFixed(0);
    const totalGB = (disk.total / 1024).toFixed(0);
    const fill = document.getElementById('metric-disk-fill');
    const val = document.getElementById('metric-disk-val');
    if (fill) fill.style.width = pct + '%';
    if (val) val.textContent = usedGB + ' / ' + totalGB + ' GB';
}

function updateVRAM(vram) {
    const listEl = document.getElementById('metric-vram-list');
    if (!listEl) return;
    if (!vram || !vram.length) {
        listEl.innerHTML = '';
        return;
    }
    listEl.innerHTML = vram.map(g => {
        const pct = g.total > 0 ? Math.round(g.used * 100 / g.total) : 0;
        const usedGB = (g.used / 1024).toFixed(1);
        const totalGB = (g.total / 1024).toFixed(1);
        return '<div class="sb-metric-row"><span class="sb-metric-label">' + esc(g.name) + '</span><div class="sb-metric-bar"><div class="sb-metric-fill gpu" style="width:' + pct + '%"></div></div><span class="sb-metric-value">' + usedGB + ' / ' + totalGB + ' GiB</span></div>' +
            '<div class="sb-metric-sub">GPU ' + g.util + '% · ' + g.temp + '°C</div>';
    }).join('');
}

function esc(s) {
    const d = document.createElement('div');
    d.textContent = String(s == null ? '' : s);
    return d.innerHTML;
}

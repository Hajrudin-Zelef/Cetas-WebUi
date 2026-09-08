#!/usr/bin/env python3
"""Vision Agent — Assistant IA visuel autonome pour Windows.

Prend des screenshots, les envoie à un VLM (OpenRouter/DeepSeek), exécute
les actions retournées (souris, clavier, terminal, fichiers) en boucle
autonome ou avec validation manuelle.

Usage:
    python vision-agent.py
"""
import os
import sys
import json
import logging
import subprocess
import threading
import http.server
import socketserver
from urllib.parse import urlparse

try:
    import webview
except ImportError:
    print("Erreur: pywebview non installé. pip install pywebview")
    sys.exit(1)

try:
    import mss
    import pyautogui
    import requests
    from PIL import Image
except ImportError as e:
    print(f"Dépendance manquante: {e.name}. "
          "pip install mss pyautogui requests Pillow")
    sys.exit(1)

logging.basicConfig(level=logging.INFO, format="[agent] %(message)s")
log = logging.getLogger(__name__)

_NO_WINDOW = getattr(subprocess, "CREATE_NO_WINDOW", 0) if os.name == "nt" else 0

APP_TITLE = "Vision Agent"
APP_VERSION = "1.0.0"
CONFIG_FILE = "config.json"

PROVIDERS = {
    "openrouter": {"base_url": "https://openrouter.ai/api/v1",
                   "models": ["google/gemini-2.5-flash", "google/gemini-2.5-pro",
                              "openai/gpt-4o", "anthropic/claude-sonnet-4.5",
                              "qwen/qwen2.5-vl-72b-instruct"]},
    "deepseek": {"base_url": "https://api.deepseek.com/v1",
                 "models": ["deepseek-chat"]},
}

HTML_TEMPLATE = r"""<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>""" + APP_TITLE + r"""</title>
<style>
:root{--bg:#F7F8FA;--bg2:#FFFFFF;--bg3:#FFFFFF;--bg4:#E4E7EC;--text:#111827;--text2:#6B7280;--primary:#2563EB;--primary2:#1D4ED8;--green:#16A34A;--red:#DC2626;--orange:#D97706;--radius:16px;--radius-sm:12px}
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:var(--bg);color:var(--text);height:100vh;overflow:hidden;user-select:none}
.screen{display:none;flex-direction:column;height:100vh;width:100%}
.screen.active{display:flex}
.topbar{display:flex;align-items:center;justify-content:space-between;padding:14px 20px;background:var(--bg2);border-bottom:1px solid var(--bg4);box-shadow:0 1px 3px rgba(16,24,40,0.04)}
.topbar-btn{width:38px;height:38px;display:flex;align-items:center;justify-content:center;border:none;background:transparent;color:var(--text2);cursor:pointer;border-radius:10px;font-size:18px}
.topbar-btn:hover{background:var(--bg);color:var(--text)}
.topbar-title{font-size:16px;font-weight:700;color:var(--text)}
.badge{font-size:11px;padding:3px 10px;border-radius:20px;font-weight:600}
.badge.idle{background:rgba(107,114,128,0.12);color:var(--text2)}
.badge.run{background:rgba(22,163,74,0.12);color:var(--green)}
.badge.pause{background:rgba(217,119,6,0.15);color:var(--orange)}
.badge.err{background:rgba(220,38,38,0.12);color:var(--red)}

/* Main screen */
.main{flex:1;display:flex;flex-direction:column;padding:20px;gap:16px;overflow:hidden}
.instruction-box{display:flex;flex-direction:column;gap:10px}
.instruction-box textarea{width:100%;min-height:70px;background:var(--bg2);border:1px solid var(--bg4);border-radius:var(--radius-sm);padding:12px 16px;color:var(--text);font-size:14px;outline:none;resize:vertical;font-family:inherit;box-shadow:0 1px 2px rgba(16,24,40,0.06)}
.instruction-box textarea:focus{border-color:var(--primary);box-shadow:0 0 0 3px rgba(37,99,235,0.1)}
.controls-row{display:flex;gap:10px;align-items:center}
.btn-primary{flex:1;padding:13px;background:var(--primary);color:#fff;border:none;border-radius:var(--radius-sm);font-size:14px;font-weight:600;cursor:pointer;transition:all .2s;box-shadow:0 2px 8px rgba(37,99,235,0.25)}
.btn-primary:hover{background:var(--primary2)}
.btn-danger{flex:1;padding:13px;background:var(--red);color:#fff;border:none;border-radius:var(--radius-sm);font-size:14px;font-weight:600;cursor:pointer;box-shadow:0 2px 8px rgba(220,38,38,0.25)}
.btn-danger:hover{background:#B91C1C}
.btn-approve{flex:1;padding:13px;background:var(--green);color:#fff;border:none;border-radius:var(--radius-sm);font-size:14px;font-weight:600;cursor:pointer;box-shadow:0 2px 8px rgba(22,163,74,0.25)}
.mode-select{padding:11px 12px;background:var(--bg2);border:1px solid var(--bg4);border-radius:var(--radius-sm);color:var(--text);font-size:13px;outline:none;cursor:pointer}
.split{flex:1;display:flex;gap:16px;min-height:0}
.shot-panel{flex:1.2;display:flex;flex-direction:column;background:var(--bg2);border:1px solid var(--bg4);border-radius:var(--radius-sm);box-shadow:0 1px 2px rgba(16,24,40,0.06);overflow:hidden}
.shot-head{display:flex;justify-content:space-between;align-items:center;padding:10px 14px;border-bottom:1px solid var(--bg4);font-size:12px;color:var(--text2);font-weight:600}
.shot-body{flex:1;display:flex;align-items:center;justify-content:center;overflow:hidden;background:#FAFBFC}
.shot-body img{max-width:100%;max-height:100%;object-fit:contain}
.shot-empty{color:#9CA3AF;font-size:13px}
.logs-panel{flex:1;display:flex;flex-direction:column;background:var(--bg2);border:1px solid var(--bg4);border-radius:var(--radius-sm);box-shadow:0 1px 2px rgba(16,24,40,0.06);overflow:hidden}
.logs-scroll{flex:1;overflow-y:auto;padding:12px 14px;font-family:'SF Mono',Consolas,monospace;font-size:11.5px;line-height:1.7}
.log-line{white-space:pre-wrap;word-break:break-word}
.log-line.info{color:var(--text2)}
.log-line.ok{color:var(--green)}
.log-line.error{color:var(--red)}
.log-line.cmd{color:var(--primary)}
.log-line.separator{color:#9CA3AF;margin:6px 0}
.status-bar{display:flex;justify-content:space-between;padding:9px 16px;background:var(--bg2);border:1px solid var(--bg4);border-radius:var(--radius-sm);font-size:12px;color:var(--text2);box-shadow:0 1px 2px rgba(16,24,40,0.06)}
.status-bar b{color:var(--text)}

/* Settings */
.settings-content{flex:1;padding:24px;overflow-y:auto}
.field{margin-bottom:18px}
.field-label{display:block;font-size:13px;color:var(--text2);margin-bottom:8px;font-weight:500}
.field-input{width:100%;background:var(--bg2);border:1px solid var(--bg4);border-radius:var(--radius-sm);padding:12px 16px;color:var(--text);font-size:14px;outline:none;box-shadow:0 1px 2px rgba(16,24,40,0.06)}
.field-input:focus{border-color:var(--primary);box-shadow:0 0 0 3px rgba(37,99,235,0.1)}
.field-hint{font-size:11px;color:var(--text2);margin-top:6px}
.btn-primary.full{width:100%}
.about{margin-top:24px;text-align:center;color:var(--text2);font-size:11px}
::-webkit-scrollbar{width:6px}
::-webkit-scrollbar-track{background:transparent}
::-webkit-scrollbar-thumb{background:#D1D5DB;border-radius:3px}
</style>
</head>
<body>

<!-- Main -->
<div class="screen active" id="screen-main">
  <div class="topbar">
    <span class="topbar-title">""" + APP_TITLE + r"""</span>
    <div style="display:flex;align-items:center;gap:10px">
      <span class="badge idle" id="stateBadge">Inactif</span>
      <button class="topbar-btn" onclick="showScreen('settings')" title="Paramètres">⚙</button>
    </div>
  </div>
  <div class="main">
    <div class="instruction-box">
      <textarea id="instruction" placeholder="Décris la tâche à accomplir… ex: Ouvre Chrome et cherche 'pizza près de moi'"></textarea>
      <div class="controls-row">
        <button class="btn-primary" id="startBtn" onclick="startAgent()">▶ Lancer</button>
        <button class="btn-danger" id="stopBtn" onclick="stopAgent()" style="display:none">⏹ Stop</button>
        <button class="btn-approve" id="approveBtn" onclick="approveAction()" style="display:none">✓ Valider l'action</button>
        <select class="mode-select" id="modeSelect">
          <option value="auto">Mode Auto</option>
          <option value="manual">Mode Manuel</option>
        </select>
      </div>
    </div>
    <div class="split">
      <div class="shot-panel">
        <div class="shot-head"><span>📸 Écran</span><span id="shotMeta"></span></div>
        <div class="shot-body" id="shotBody"><div class="shot-empty">Aucun screenshot</div></div>
      </div>
      <div class="logs-panel">
        <div class="shot-head"><span>📝 Actions</span></div>
        <div class="logs-scroll" id="logsScroll"></div>
      </div>
    </div>
    <div class="status-bar">
      <span>Itération: <b id="iterNum">0</b></span>
      <span id="currentAction">—</span>
    </div>
  </div>
</div>

<!-- Settings -->
<div class="screen" id="screen-settings">
  <div class="topbar">
    <button class="topbar-btn" onclick="showScreen('main')">&larr;</button>
    <span class="topbar-title">Paramètres</span>
    <span></span>
  </div>
  <div class="settings-content">
    <div class="field">
      <label class="field-label">Provider</label>
      <select class="field-input" id="setProvider" onchange="onProviderChange()">
        <option value="openrouter">OpenRouter</option>
        <option value="deepseek">DeepSeek</option>
      </select>
    </div>
    <div class="field">
      <label class="field-label">Clé API</label>
      <input class="field-input" id="setApiKey" type="password" placeholder="sk-...">
    </div>
    <div class="field">
      <label class="field-label">Modèle</label>
      <select class="field-input" id="setModel"></select>
      <div class="field-hint">Le modèle doit supporter la vision (image input)</div>
    </div>
    <div class="field">
      <label class="field-label">URL API (optionnel — proxy Cetas)</label>
      <input class="field-input" id="setBaseUrl" placeholder="Laisser vide pour défaut">
      <div class="field-hint">ex: http://localhost:8901/api/proxy/openrouter/v1</div>
    </div>
    <div class="field">
      <label class="field-label">Itérations max</label>
      <input class="field-input" id="setMaxIter" type="number" value="50" min="5" max="200">
    </div>
    <div class="field">
      <label class="field-label">Délai entre tours (secondes)</label>
      <input class="field-input" id="setDelay" type="number" value="1.5" min="0.5" max="10" step="0.5">
    </div>
    <button class="btn-primary full" onclick="saveSettings()">Enregistrer</button>
    <div class="about">""" + APP_TITLE + r""" v""" + APP_VERSION + r"""</div>
  </div>
</div>

<script>
let cfg = {};
let lastShot = "";
let pollTimer = null;

async function api(path, body) {
  const opts = body ? {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)} : {};
  const r = await fetch('/api/' + path, opts);
  return r.json();
}

function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById('screen-' + id).classList.add('active');
  if (id === 'settings') loadSettingsForm();
}

function setBadge(state, text) {
  const b = document.getElementById('stateBadge');
  b.className = 'badge ' + state;
  b.textContent = text;
}

function updateControls(st) {
  const running = st.running;
  document.getElementById('startBtn').style.display = running ? 'none' : '';
  document.getElementById('stopBtn').style.display = running ? '' : 'none';
  const needsApproval = running && st.paused && cfg.autonomy_mode === 'manual';
  document.getElementById('approveBtn').style.display = needsApproval ? '' : 'none';
  if (running) setBadge(st.paused ? 'pause' : 'run', st.paused ? 'En pause — valide' : 'En cours…');
  else if (st.error) setBadge('err', 'Erreur');
  else setBadge('idle', 'Inactif');
  document.getElementById('iterNum').textContent = st.iteration || 0;
  document.getElementById('currentAction').textContent = st.current_action || '—';
  if (st.error) document.getElementById('currentAction').textContent = st.error;
}

function renderLogs(logs) {
  const el = document.getElementById('logsScroll');
  el.innerHTML = logs.map(l => '<div class="log-line ' + l.level + '">' + escHtml(l.text) + '</div>').join('');
  el.scrollTop = el.scrollHeight;
}

function renderShot(b64) {
  if (!b64) return;
  const body = document.getElementById('shotBody');
  body.innerHTML = '<img src="data:image/png;base64,' + b64 + '">';
}

function escHtml(s) { return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

async function poll() {
  try {
    const st = await api('state');
    updateControls(st);
    renderLogs(st.logs || []);
    if (st.screenshot && st.screenshot !== lastShot) {
      lastShot = st.screenshot;
      renderShot(lastShot);
      const d = new Date();
      document.getElementById('shotMeta').textContent = d.toLocaleTimeString();
    }
  } catch(e) {}
}

async function startAgent() {
  const instruction = document.getElementById('instruction').value.trim();
  if (!instruction) { alert('Décris d\'abord la tâche.'); return; }
  cfg.autonomy_mode = document.getElementById('modeSelect').value;
  await api('config', {autonomy_mode: cfg.autonomy_mode});
  const r = await api('start', {instruction});
  if (!r.ok) alert(r.error || 'Impossible de démarrer');
  startPolling();
}

async function stopAgent() { await api('stop'); }

async function approveAction() { await api('approve'); }

function startPolling() {
  if (pollTimer) return;
  pollTimer = setInterval(poll, 700);
}

async function loadSettingsForm() {
  document.getElementById('setProvider').value = cfg.api_provider || 'openrouter';
  document.getElementById('setApiKey').value = cfg.api_key_masked || '';
  document.getElementById('setBaseUrl').value = cfg.base_url_custom || '';
  document.getElementById('setMaxIter').value = cfg.max_iterations || 50;
  document.getElementById('setDelay').value = cfg.screenshot_delay || 1.5;
  fillModels();
  document.getElementById('setModel').value = cfg.model || '';
}

function fillModels() {
  const p = document.getElementById('setProvider').value;
  const sel = document.getElementById('setModel');
  sel.innerHTML = '';
  (MODELS[p] || []).forEach(m => {
    const o = document.createElement('option');
    o.value = m; o.textContent = m;
    sel.appendChild(o);
  });
  if (cfg.model && (MODELS[p] || []).includes(cfg.model)) sel.value = cfg.model;
}

function onProviderChange() {
  cfg.api_provider = document.getElementById('setProvider').value;
  fillModels();
}

async function saveSettings() {
  const data = {
    api_provider: document.getElementById('setProvider').value,
    api_key: document.getElementById('setApiKey').value.trim(),
    model: document.getElementById('setModel').value,
    base_url_custom: document.getElementById('setBaseUrl').value.trim(),
    max_iterations: parseInt(document.getElementById('setMaxIter').value) || 50,
    screenshot_delay: parseFloat(document.getElementById('setDelay').value) || 1.5,
  };
  const r = await api('config', data);
  if (r.ok) { cfg = Object.assign(cfg, data); showScreen('main'); }
  else alert(r.error || 'Erreur sauvegarde');
}

const MODELS = """ + json.dumps(PROVIDERS) + r""";

(async () => {
  const r = await api('config');
  cfg = r;
  document.getElementById('modeSelect').value = cfg.autonomy_mode || 'auto';
  startPolling();
})();
</script>
</body>
</html>"""


class AgentServer:
    def __init__(self):
        self.config = {
            "api_provider": "openrouter",
            "api_key": "",
            "model": "google/gemini-2.5-flash",
            "base_url_custom": "",
            "autonomy_mode": "auto",
            "max_iterations": 50,
            "screenshot_delay": 1.5,
        }
        self._loop = None
        self._config_lock = threading.Lock()
        self._load_config()

    @property
    def loop(self):
        if self._loop is None or self._loop.config.get("_gen") != self._config_gen():
            from agent.loop import AgentLoop
            cfg = self._resolved_config()
            cfg["_gen"] = self._config_gen()
            self._loop = AgentLoop(cfg)
        return self._loop

    def _config_gen(self):
        c = self.config
        return (c["api_provider"], c["api_key"], c["model"],
                c["base_url_custom"], c["autonomy_mode"],
                c["max_iterations"], c["screenshot_delay"])

    def _resolved_config(self):
        c = dict(self.config)
        if c.get("base_url_custom"):
            c["base_url"] = c["base_url_custom"]
        else:
            c["base_url"] = PROVIDERS[c["api_provider"]]["base_url"]
        return c

    def _config_path(self):
        return os.path.join(os.path.dirname(os.path.abspath(sys.argv[0])), CONFIG_FILE)

    def _load_config(self):
        p = self._config_path()
        if os.path.isfile(p):
            try:
                with open(p, "r", encoding="utf-8") as f:
                    self.config.update(json.load(f))
            except Exception as e:
                log.warning("Config corrompue, défauts utilisés: %s", e)

    def get_config(self):
        out = dict(self.config)
        key = out.get("api_key", "")
        out["api_key_masked"] = (key[:4] + "****" + key[-4:]) if len(key) > 8 else ("***" if key else "")
        return out

    def save_config(self, data):
        with self._config_lock:
            for k in ("api_provider", "autonomy_mode", "base_url_custom"):
                if k in data:
                    self.config[k] = data[k]
            if "api_key" in data and data["api_key"] and not data["api_key"].endswith("****"):
                self.config["api_key"] = data["api_key"]
            if "model" in data and data["model"]:
                self.config["model"] = data["model"]
            if "max_iterations" in data:
                self.config["max_iterations"] = max(5, min(200, int(data["max_iterations"])))
            if "screenshot_delay" in data:
                self.config["screenshot_delay"] = max(0.5, min(10, float(data["screenshot_delay"])))
            try:
                with open(self._config_path(), "w", encoding="utf-8") as f:
                    json.dump(self.config, f, indent=2, ensure_ascii=False)
            except Exception as e:
                return {"ok": False, "error": str(e)}
        return {"ok": True}

    def get_state(self):
        return self.loop.get_state()

    def start(self, instruction):
        if not self.config.get("api_key"):
            return {"ok": False, "error": "Clé API manquante — ouvre les Paramètres"}
        return self.loop.start(instruction)

    def stop(self):
        return self.loop.stop() if self._loop else {"ok": True}

    def approve(self):
        return self.loop.approve() if self._loop else {"ok": True}


class Handler(http.server.BaseHTTPRequestHandler):
    server_ref = None

    def log_message(self, *a):
        pass

    def do_GET(self):
        path = urlparse(self.path).path
        srv = self.server_ref
        if path in ("/", ""):
            self._html()
        elif path == "/api/config":
            self._json(srv.get_config())
        elif path == "/api/state":
            self._json(srv.get_state())
        else:
            self.send_response(404)
            self.end_headers()

    def do_POST(self):
        path = urlparse(self.path).path
        srv = self.server_ref
        cl = int(self.headers.get("Content-Length", 0))
        body = json.loads(self.rfile.read(cl)) if cl else {}
        if path == "/api/config":
            self._json(srv.save_config(body))
        elif path == "/api/start":
            self._json(srv.start(body.get("instruction", "")))
        elif path == "/api/stop":
            self._json(srv.stop())
        elif path == "/api/pause":
            self._json(srv.loop.pause())
        elif path == "/api/resume":
            self._json(srv.loop.resume())
        elif path == "/api/approve":
            self._json(srv.approve())
        else:
            self.send_response(404)
            self.end_headers()

    def _html(self):
        out = HTML_TEMPLATE.encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Content-Length", str(len(out)))
        self.end_headers()
        self.wfile.write(out)

    def _json(self, data):
        out = json.dumps(data, ensure_ascii=False).encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(out)))
        self.end_headers()
        self.wfile.write(out)


def main():
    srv = AgentServer()
    Handler.server_ref = srv

    with socketserver.TCPServer(("127.0.0.1", 0), Handler) as httpd:
        port = httpd.server_address[1]
        threading.Thread(target=httpd.serve_forever, daemon=True).start()
        log.info("Serveur UI sur http://127.0.0.1:%d", port)

        window = webview.create_window(
            APP_TITLE, f"http://127.0.0.1:{port}",
            width=1100, height=760,
            min_size=(820, 560),
            resizable=True, text_select=True,
        )
        webview.start(debug=False)


if __name__ == "__main__":
    main()

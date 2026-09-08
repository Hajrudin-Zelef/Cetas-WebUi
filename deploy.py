#!/usr/bin/env python3
"""Cetas Deploy — Outil de déploiement local pour CETAS (Windows).

Fichier unique : backend Python + frontend HTML/CSS/JS inline.
Utilise pywebview pour la fenêtre native, HTTP server stdlib pour servir l'UI.
Config sauvegardée en JSON local (config.json).

Usage:
    python deploy.py
"""
import os
import sys
import json
import time
import shutil
import logging
import datetime
import threading
import subprocess
import http.server
import socketserver
from pathlib import Path
from urllib.parse import urlparse

try:
    import webview
except ImportError:
    print("Erreur: pywebview non installé. pip install pywebview")
    sys.exit(1)

logging.basicConfig(level=logging.INFO, format="[deploy] %(message)s")
log = logging.getLogger(__name__)

APP_TITLE = "CETAS Deploy"
APP_VERSION = "1.0.0"
CONFIG_FILE = "config.json"
LOGO_SVG = """<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z"/><path d="m12 15-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z"/><path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0"/><path d="M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5"/></svg>"""

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

/* Top bar */
.topbar{display:flex;align-items:center;justify-content:space-between;padding:16px 20px;background:var(--bg2);border-bottom:1px solid var(--bg4);box-shadow:0 1px 3px rgba(16,24,40,0.04)}
.topbar-btn{width:40px;height:40px;display:flex;align-items:center;justify-content:center;border:none;background:transparent;color:var(--text2);cursor:pointer;border-radius:10px;font-size:20px}
.topbar-btn:hover{background:var(--bg);color:var(--text)}
.topbar-title{font-size:16px;font-weight:700;color:var(--text)}

/* Main deploy screen */
.deploy-main{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:24px;padding:32px 24px}
.rocket-circle{width:140px;height:140px;border-radius:50%;background:#F7F8FA;border:none;box-shadow:8px 8px 16px rgba(163,177,198,0.5),-8px -8px 16px rgba(255,255,255,0.9),inset 0 0 0 1px rgba(37,99,235,0.15);display:flex;align-items:center;justify-content:center;cursor:pointer;transition:all 0.3s ease;position:relative}
.rocket-circle:hover{transform:scale(1.03);box-shadow:6px 6px 12px rgba(163,177,198,0.5),-6px -6px 12px rgba(255,255,255,0.9),inset 0 0 0 1px rgba(37,99,235,0.3)}
.rocket-circle.deploying{animation:pulse 1.5s ease-in-out infinite}
@keyframes pulse{0%,100%{box-shadow:8px 8px 16px rgba(163,177,198,0.5),-8px -8px 16px rgba(255,255,255,0.9),inset 0 0 0 1px rgba(37,99,235,0.15)}50%{box-shadow:8px 8px 16px rgba(163,177,198,0.5),-8px -8px 16px rgba(255,255,255,0.9),inset 0 0 0 2px rgba(37,99,235,0.3)}}
.rocket-circle svg{width:60px;height:60px;color:var(--primary)}
.deploy-status{font-size:18px;font-weight:600;color:var(--primary)}
.deploy-divider{width:80%;height:1px;background:linear-gradient(90deg,transparent,var(--bg4),transparent)}
.exe-info{display:flex;flex-direction:column;align-items:center;gap:8px}
.exe-label{font-size:13px;color:var(--text2);font-weight:500}
.exe-path-box{display:flex;align-items:center;gap:8px;background:var(--bg3);border:1px solid var(--bg4);border-radius:var(--radius-sm);padding:8px 16px;box-shadow:0 1px 2px rgba(16,24,40,0.06)}
.exe-path{font-size:13px;color:var(--text);font-family:'SF Mono',Consolas,monospace}
.exe-edit-btn{width:32px;height:32px;border-radius:8px;border:1px solid var(--primary);background:transparent;color:var(--primary);cursor:pointer;display:flex;align-items:center;justify-content:center;transition:all 0.2s}
.exe-edit-btn:hover{background:var(--primary);color:#fff}
.last-deploy{font-size:12px;color:var(--text2);margin-top:8px}
.error-text{color:var(--red);font-size:13px;text-align:center;padding:0 24px}

/* Setup screen */
.setup-content{flex:1;padding:24px;overflow-y:auto}
.setup-title{font-size:20px;font-weight:700;margin-bottom:4px;color:var(--text)}
.setup-subtitle{font-size:13px;color:var(--text2);margin-bottom:24px}
.field{margin-bottom:20px}
.field-label{display:block;font-size:13px;color:var(--text2);margin-bottom:8px;font-weight:500}
.field-input{width:100%;background:var(--bg3);border:1px solid var(--bg4);border-radius:var(--radius-sm);padding:12px 16px;color:var(--text);font-size:14px;outline:none;transition:border-color 0.2s;box-shadow:0 1px 2px rgba(16,24,40,0.06)}
.field-input:focus{border-color:var(--primary);box-shadow:0 0 0 3px rgba(37,99,235,0.1)}
.field-input::placeholder{color:#9CA3AF}
.field-row{display:flex;gap:8px;align-items:stretch}
.field-row .field-input{flex:1}
.browse-btn{padding:12px 16px;background:var(--bg3);border:1px solid var(--bg4);border-radius:var(--radius-sm);color:var(--primary);cursor:pointer;font-size:13px;font-weight:600;white-space:nowrap;display:flex;align-items:center;gap:6px;transition:all 0.2s;box-shadow:0 1px 2px rgba(16,24,40,0.06)}
.browse-btn:hover{background:var(--primary);color:#fff;border-color:var(--primary);box-shadow:0 2px 8px rgba(37,99,235,0.25)}
.field-hint{font-size:11px;color:var(--text2);margin-top:6px}
.btn-primary{width:100%;padding:14px;background:var(--primary);color:#fff;border:none;border-radius:var(--radius-sm);font-size:15px;font-weight:600;cursor:pointer;transition:all 0.2s;box-shadow:0 2px 8px rgba(37,99,235,0.25)}
.btn-primary:hover{background:var(--primary2);box-shadow:0 4px 12px rgba(37,99,235,0.35)}
.btn-primary:disabled{opacity:0.5;cursor:not-allowed}

/* Detection screen */
.detect-content{flex:1;padding:24px;overflow-y:auto}
.detect-item{display:flex;align-items:center;gap:14px;padding:16px;background:var(--bg3);border:1px solid var(--bg4);border-radius:var(--radius-sm);margin-bottom:12px;box-shadow:0 1px 2px rgba(16,24,40,0.06)}
.detect-icon{width:40px;height:40px;border-radius:10px;display:flex;align-items:center;justify-content:center;font-size:18px;flex-shrink:0}
.detect-icon.ok{background:rgba(22,163,74,0.1);color:var(--green)}
.detect-icon.fail{background:rgba(220,38,38,0.1);color:var(--red)}
.detect-icon.pending{background:rgba(107,114,128,0.08);color:var(--text2)}
.detect-info{flex:1}
.detect-name{font-size:14px;font-weight:600;color:var(--text)}
.detect-detail{font-size:12px;color:var(--text2);margin-top:2px}
.detect-actions{display:flex;gap:12px;padding:0 24px 24px}
.detect-actions .btn-primary{flex:1}

/* Action screen */
.action-content{flex:1;padding:24px;overflow-y:auto}
.action-option{display:flex;align-items:center;gap:14px;padding:16px;background:var(--bg3);border:2px solid var(--bg4);border-radius:var(--radius-sm);margin-bottom:12px;cursor:pointer;transition:all 0.2s;box-shadow:0 1px 2px rgba(16,24,40,0.06)}
.action-option:hover{border-color:#93C5FD}
.action-option.selected{border-color:var(--primary);background:rgba(37,99,235,0.04);box-shadow:0 0 0 3px rgba(37,99,235,0.08)}
.action-radio{width:20px;height:20px;border-radius:50%;border:2px solid var(--bg4);display:flex;align-items:center;justify-content:center;flex-shrink:0;transition:all 0.2s}
.action-option.selected .action-radio{border-color:var(--primary);background:var(--primary)}
.action-option.selected .action-radio::after{content:'';width:8px;height:8px;border-radius:50%;background:#fff}
.action-label{font-size:14px;font-weight:600;color:var(--text)}
.action-desc{font-size:12px;color:var(--text2);margin-top:2px}
.branch-select{margin:16px 0;padding:12px;background:var(--bg3);border:1px solid var(--bg4);border-radius:var(--radius-sm);color:var(--text);font-size:14px;width:100%;outline:none;display:none;box-shadow:0 1px 2px rgba(16,24,40,0.06)}
.branch-select.visible{display:block}

/* Logs screen */
.logs-content{flex:1;display:flex;flex-direction:column;padding:0;overflow:hidden}
.logs-header{display:flex;align-items:center;justify-content:space-between;padding:12px 20px;background:var(--bg2);border-bottom:1px solid var(--bg4);flex-shrink:0;box-shadow:0 1px 3px rgba(16,24,40,0.04)}
.logs-title{font-size:14px;font-weight:600;color:var(--text)}
.logs-status{font-size:12px;display:flex;align-items:center;gap:6px;color:var(--text2)}
.logs-status .dot{width:8px;height:8px;border-radius:50%}
.logs-status .dot.running{background:var(--orange);animation:blink 1s infinite}
.logs-status .dot.ok{background:var(--green)}
.logs-status .dot.error{background:var(--red)}
@keyframes blink{0%,100%{opacity:1}50%{opacity:0.4}}
.logs-scroll{flex:1;overflow-y:auto;padding:16px 20px;font-family:'SF Mono',Consolas,monospace;font-size:12px;line-height:1.8;min-height:0;background:var(--bg2)}
.log-line{white-space:pre-wrap;word-break:break-all}
.log-line.info{color:var(--text2)}
.log-line.ok{color:var(--green)}
.log-line.error{color:var(--red)}
.log-line.cmd{color:var(--primary)}
.log-line.separator{color:#9CA3AF;margin:8px 0}
.logs-footer{padding:12px 20px;border-top:1px solid var(--bg4);display:flex;gap:12px;flex-shrink:0;background:var(--bg2)}
.logs-footer .btn-primary{flex:1}
.btn-secondary{padding:12px 20px;background:var(--bg2);color:var(--text);border:1px solid var(--bg4);border-radius:var(--radius-sm);font-size:14px;font-weight:600;cursor:pointer;flex:1;box-shadow:0 1px 2px rgba(16,24,40,0.06);transition:all 0.2s}
.btn-secondary:hover{background:var(--bg);border-color:#D1D5DB}
.btn-success{padding:12px 20px;background:var(--green);color:#fff;border:none;border-radius:var(--radius-sm);font-size:14px;font-weight:600;cursor:pointer;flex:1;box-shadow:0 2px 8px rgba(22,163,74,0.25);transition:all 0.2s}
.btn-success:hover{background:#15803D;box-shadow:0 4px 12px rgba(22,163,74,0.35)}

/* Sidebar */
.sidebar-overlay{position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.3);z-index:90;display:none;opacity:0;transition:opacity 0.3s}
.sidebar-overlay.open{display:block;opacity:1}
.sidebar{position:fixed;top:0;left:0;width:280px;height:100%;background:var(--bg2);z-index:100;transform:translateX(-100%);transition:transform 0.3s ease;display:flex;flex-direction:column;box-shadow:4px 0 16px rgba(0,0,0,0.08)}
.sidebar.open{transform:translateX(0)}
.sidebar-header{padding:20px;border-bottom:1px solid var(--bg4);box-shadow:0 1px 3px rgba(16,24,40,0.04)}
.sidebar-header h3{font-size:18px;font-weight:700;color:var(--text)}
.sidebar-header p{font-size:12px;color:var(--text2);margin-top:4px}
.sidebar-nav{flex:1;padding:12px}
.sidebar-item{display:flex;align-items:center;gap:12px;padding:12px 16px;border-radius:var(--radius-sm);cursor:pointer;transition:all 0.2s;color:var(--text2);font-size:14px}
.sidebar-item:hover{background:var(--bg);color:var(--text)}
.sidebar-item.active{background:rgba(37,99,235,0.08);color:var(--primary);font-weight:600}
.sidebar-item svg{width:20px;height:20px;flex-shrink:0}

/* Progress */
.progress-bar{width:100%;height:4px;background:var(--bg4);border-radius:2px;overflow:hidden;display:none}
.progress-bar.active{display:block}
.progress-fill{height:100%;background:linear-gradient(90deg,var(--primary),#60A5FA);border-radius:2px;transition:width 0.3s;width:0%}

/* Scrollbar */
::-webkit-scrollbar{width:6px}
::-webkit-scrollbar-track{background:transparent}
::-webkit-scrollbar-thumb{background:#D1D5DB;border-radius:3px}
::-webkit-scrollbar-thumb:hover{background:#9CA3AF}
</style>
</head>
<body>

<!-- Sidebar -->
<div class="sidebar-overlay" id="sidebarOverlay" onclick="closeSidebar()"></div>
<div class="sidebar" id="sidebar">
  <div class="sidebar-header">
    <h3>CETAS Deploy</h3>
    <p>Outil de déploiement</p>
  </div>
  <div class="sidebar-nav">
    <div class="sidebar-item active" onclick="showScreen('main')">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>
      Accueil
    </div>
    <div class="sidebar-item" onclick="showScreen('setup')">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>
      Configuration
    </div>
    <div class="sidebar-item" onclick="showScreen('detect')">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>
      Détection
    </div>
    <div class="sidebar-item" onclick="showScreen('action')">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
      Déployer
    </div>
    <div class="sidebar-item" onclick="showScreen('logs')">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
      Logs
    </div>
    <div class="sidebar-item" onclick="showScreen('settings')">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
      Paramètres
    </div>
  </div>
</div>

<!-- Screen: Main -->
<div class="screen active" id="screen-main">
  <div class="topbar">
    <button class="topbar-btn" onclick="openSidebar()">&#9776;</button>
    <span class="topbar-title">""" + APP_TITLE + r"""</span>
    <button class="topbar-btn" onclick="copyLogs()"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg></button>
  </div>
  <div class="progress-bar" id="mainProgress"><div class="progress-fill" id="mainProgressFill"></div></div>
  <div class="deploy-main">
    <div class="rocket-circle" id="rocketBtn" onclick="onRocketClick()">
      """ + LOGO_SVG + r"""
    </div>
    <div class="deploy-status" id="deployStatus">Prêt à déployer</div>
    <div class="error-text" id="deployError" style="display:none"></div>
    <div class="deploy-divider"></div>
    <div class="exe-info">
      <div class="exe-label">Exécutable</div>
      <div class="exe-path-box">
        <span class="exe-path" id="exePathDisplay">Non configuré</span>
        <button class="exe-edit-btn" onclick="showScreen('setup')"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button>
      </div>
      <div class="last-deploy" id="lastDeploy">Dernier déploiement : jamais</div>
    </div>
  </div>
</div>

<!-- Screen: Setup -->
<div class="screen" id="screen-setup">
  <div class="topbar">
    <button class="topbar-btn" onclick="showScreen('main')">&larr;</button>
    <span class="topbar-title">Configuration</span>
    <span></span>
  </div>
  <div class="setup-content">
    <div class="setup-title">Configurer le déploiement</div>
    <div class="setup-subtitle">Indique le chemin du repository CETAS et de l'exécutable.</div>
    <div class="field">
      <label class="field-label">Chemin du repository</label>
      <div class="field-row">
        <input class="field-input" id="inputRepo" placeholder="Coller le chemin ou cliquer Parcourir...">
        <button class="browse-btn" onclick="browseFolder()"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg> Parcourir</button>
      </div>
      <div class="field-hint">Sélectionne le dossier racine du projet CETAS</div>
    </div>
    <div class="field">
      <label class="field-label">Chemin de l'exécutable</label>
      <input class="field-input" id="inputExe" placeholder="Auto-détecté après sélection du dossier">
      <div class="field-hint">Rempli automatiquement si dist\Cetas\Cetas.exe existe</div>
    </div>
    <button class="btn-primary" id="setupSaveBtn" onclick="saveSetup()">Suivant</button>
  </div>
</div>

<!-- Screen: Detect -->
<div class="screen" id="screen-detect">
  <div class="topbar">
    <button class="topbar-btn" onclick="showScreen('main')">&larr;</button>
    <span class="topbar-title">Détection</span>
    <span></span>
  </div>
  <div class="detect-content" id="detectList">
    <div class="detect-item">
      <div class="detect-icon pending" id="detectGitIcon">⏳</div>
      <div class="detect-info">
        <div class="detect-name">Git</div>
        <div class="detect-detail" id="detectGitDetail">Vérification...</div>
      </div>
    </div>
    <div class="detect-item">
      <div class="detect-icon pending" id="detectPyIcon">⏳</div>
      <div class="detect-info">
        <div class="detect-name">Python</div>
        <div class="detect-detail" id="detectPyDetail">Vérification...</div>
      </div>
    </div>
    <div class="detect-item">
      <div class="detect-icon pending" id="detectPuiIcon">⏳</div>
      <div class="detect-info">
        <div class="detect-name">PyInstaller</div>
        <div class="detect-detail" id="detectPuiDetail">Vérification...</div>
      </div>
    </div>
    <div class="detect-item">
      <div class="detect-icon pending" id="detectRepoIcon">⏳</div>
      <div class="detect-info">
        <div class="detect-name">Repository</div>
        <div class="detect-detail" id="detectRepoDetail">Vérification...</div>
      </div>
    </div>
  </div>
  <div class="detect-actions">
    <button class="btn-primary" id="detectRetryBtn" onclick="runDetection()" style="display:none">Réessayer</button>
    <button class="btn-primary" id="detectNextBtn" onclick="showScreen('action')" style="display:none">Continuer</button>
  </div>
</div>

<!-- Screen: Action -->
<div class="screen" id="screen-action">
  <div class="topbar">
    <button class="topbar-btn" onclick="showScreen('main')">&larr;</button>
    <span class="topbar-title">Action</span>
    <span></span>
  </div>
  <div class="action-content">
    <div class="setup-title">Choisir l'action</div>
    <div class="setup-subtitle" style="margin-bottom:20px">Sélectionne ce que tu veux faire.</div>
    <div class="action-option selected" data-action="auto" onclick="selectAction(this)">
      <div class="action-radio"></div>
      <div>
        <div class="action-label">🚀 Auto</div>
        <div class="action-desc">Pull → Clean → Build (enchaîné)</div>
      </div>
    </div>
    <div class="action-option" data-action="pull" onclick="selectAction(this)">
      <div class="action-radio"></div>
      <div>
        <div class="action-label">📥 Git Pull</div>
        <div class="action-desc">Récupérer les dernières modifications</div>
      </div>
    </div>
    <div class="action-option" data-action="clean" onclick="selectAction(this)">
      <div class="action-radio"></div>
      <div>
        <div class="action-label">🧹 Nettoyer</div>
        <div class="action-desc">Supprimer le dossier dist/</div>
      </div>
    </div>
    <div class="action-option" data-action="build" onclick="selectAction(this)">
      <div class="action-radio"></div>
      <div>
        <div class="action-label">🔨 Build</div>
        <div class="action-desc">PyInstaller cetas.spec</div>
      </div>
    </div>
    <select class="branch-select" id="branchSelect">
      <option value="">Chargement des branches...</option>
    </select>
    <div style="padding:0 0 24px;margin-top:8px">
      <button class="btn-primary" onclick="startDeploy()">Exécuter</button>
    </div>
  </div>
</div>

<!-- Screen: Logs -->
<div class="screen" id="screen-logs">
  <div class="topbar">
    <button class="topbar-btn" onclick="showScreen('main')">&larr;</button>
    <span class="topbar-title">Logs</span>
    <button class="topbar-btn" onclick="copyLogs()"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg></button>
  </div>
  <div class="logs-content">
    <div class="logs-header">
      <span class="logs-title">Console</span>
      <div class="logs-status">
        <div class="dot" id="logsDot"></div>
        <span id="logsStatusText">Inactif</span>
      </div>
    </div>
    <div class="logs-scroll" id="logsScroll"></div>
    <div class="logs-footer" id="logsFooter">
      <button class="btn-secondary" onclick="clearLogs()">Effacer</button>
      <button class="btn-primary" onclick="showScreen('main')">Retour</button>
    </div>
  </div>
</div>

<!-- Screen: Settings -->
<div class="screen" id="screen-settings">
  <div class="topbar">
    <button class="topbar-btn" onclick="showScreen('main')">&larr;</button>
    <span class="topbar-title">Paramètres</span>
    <span></span>
  </div>
  <div class="setup-content" style="overflow-y:auto">
    <div class="setup-title">Paramètres</div>
    <div class="setup-subtitle">Configuration de l'outil de déploiement.</div>

    <div class="field">
      <label class="field-label">Chemin du repository</label>
      <div class="field-row">
        <input class="field-input" id="settingsRepo" placeholder="Chemin du dossier...">
        <button class="browse-btn" onclick="browseFolderSettings()"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg> Parcourir</button>
      </div>
    </div>

    <div class="field">
      <label class="field-label">Chemin de l'exécutable</label>
      <input class="field-input" id="settingsExe" placeholder=".\dist\Cetas\Cetas.exe">
    </div>

    <div class="field">
      <label class="field-label">Branche par défaut</label>
      <select class="field-input" id="settingsBranch" style="padding:12px 16px;cursor:pointer">
        <option value="">Chargement...</option>
      </select>
      <div class="field-hint">Branche utilisée pour l'action Auto si aucune sélection explicite</div>
    </div>

    <button class="btn-primary" onclick="saveSettings()" style="margin-bottom:24px">Enregistrer</button>

    <div class="deploy-divider" style="margin-bottom:20px"></div>

    <div class="setup-title" style="font-size:16px">Historique</div>
    <div id="historyList" style="margin-bottom:24px">
      <div style="color:var(--text2);font-size:13px;padding:12px 0">Aucun déploiement</div>
    </div>

    <div class="deploy-divider" style="margin-bottom:20px"></div>

    <div style="text-align:center;padding:12px 0">
      <div style="color:var(--text2);font-size:12px;margin-bottom:4px">CETAS Deploy v""" + APP_VERSION + r"""</div>
      <div style="color:var(--text2);font-size:11px;word-break:break-all">Config : <span id="configPathDisplay"></span></div>
    </div>
  </div>
</div>

<script>
let config = {};
let logs = [];
let isDeploying = false;
let selectedAction = 'auto';
let pollTimer = null;

async function api(path, body) {
  const opts = body ? {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)} : {};
  const r = await fetch('/api/' + path, opts);
  return r.json();
}

function openSidebar() {
  document.getElementById('sidebar').classList.add('open');
  document.getElementById('sidebarOverlay').classList.add('open');
}
function closeSidebar() {
  document.getElementById('sidebar').classList.remove('open');
  document.getElementById('sidebarOverlay').classList.remove('open');
}

function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById('screen-' + id).classList.add('active');
  document.querySelectorAll('.sidebar-item').forEach(s => s.classList.remove('active'));
  closeSidebar();
  if (id === 'detect') runDetection();
  if (id === 'logs') scrollLogs();
  if (id === 'action') { loadBranches(); document.getElementById('branchSelect').classList.toggle('visible', selectedAction === 'pull' || selectedAction === 'auto'); }
  if (id === 'settings') loadSettings();
}

function selectAction(el) {
  document.querySelectorAll('.action-option').forEach(o => o.classList.remove('selected'));
  el.classList.add('selected');
  selectedAction = el.dataset.action;
  const bs = document.getElementById('branchSelect');
  bs.classList.toggle('visible', selectedAction === 'pull' || selectedAction === 'auto');
}

async function loadBranches() {
  if (!config.repo_path) return;
  const r = await api('branches');
  const sel = document.getElementById('branchSelect');
  sel.innerHTML = '';
  (r.branches || []).forEach(b => {
    const o = document.createElement('option');
    o.value = b; o.textContent = b;
    if (r.current && b === r.current) { o.textContent = b + ' (courante)'; o.selected = true; }
    sel.appendChild(o);
  });
}

function updateMainUI() {
  document.getElementById('exePathDisplay').textContent = config.exe_path || 'Non configuré';
  if (config.last_deploy) {
    const d = new Date(config.last_deploy);
    const diff = Math.floor((Date.now() - d.getTime()) / 1000);
    let t = 'à l\'instant';
    if (diff > 86400) t = 'il y a ' + Math.floor(diff/86400) + ' jour(s)';
    else if (diff > 3600) t = 'il y a ' + Math.floor(diff/3600) + ' heure(s)';
    else if (diff > 60) t = 'il y a ' + Math.floor(diff/60) + ' minute(s)';
    document.getElementById('lastDeploy').textContent = 'Dernier déploiement : ' + t;
  } else {
    document.getElementById('lastDeploy').textContent = 'Dernier déploiement : jamais';
  }
}

async function onRocketClick() {
  if (isDeploying) return;
  if (!config.repo_path || !config.exe_path) { showScreen('setup'); return; }
  await runDetection();
  showScreen('detect');
}

async function browseFolder() {
  const r = await api('browse');
  if (r.path) {
    document.getElementById('inputRepo').value = r.path;
    document.getElementById('inputRepo').style.color = 'var(--text)';
    document.getElementById('inputExe').value = '.\\dist\\Cetas\\Cetas.exe';
  }
}

async function saveSetup() {
  const repo = document.getElementById('inputRepo').value.trim();
  const exe = document.getElementById('inputExe').value.trim();
  if (!repo || !exe) return;
  const r = await api('config', {repo_path: repo, exe_path: exe});
  if (r.ok) { config.repo_path = repo; config.exe_path = exe; updateMainUI(); showScreen('detect'); }
}

async function runDetection() {
  const items = [
    {id:'Git', icon:'detectGitIcon', detail:'detectGitDetail'},
    {id:'Python', icon:'detectPyIcon', detail:'detectPyDetail'},
    {id:'PyInstaller', icon:'detectPuiIcon', detail:'detectPuiDetail'},
    {id:'Repository', icon:'detectRepoIcon', detail:'detectRepoDetail'},
  ];
  items.forEach(i => {
    document.getElementById(i.icon).className = 'detect-icon pending';
    document.getElementById(i.icon).textContent = '⏳';
    document.getElementById(i.detail).textContent = 'Vérification...';
  });
  document.getElementById('detectRetryBtn').style.display = 'none';
  document.getElementById('detectNextBtn').style.display = 'none';

  const r = await api('detect');
  let allOk = true;
  for (const i of items) {
    const ok = r[i.id.toLowerCase()];
    document.getElementById(i.icon).className = 'detect-icon ' + (ok ? 'ok' : 'fail');
    document.getElementById(i.icon).textContent = ok ? '✓' : '✗';
    document.getElementById(i.detail).textContent = ok ? r[i.id.toLowerCase() + '_version'] || 'OK' : (r[i.id.toLowerCase() + '_error'] || 'Manquant');
    if (!ok) allOk = false;
  }
  document.getElementById('detectRetryBtn').style.display = allOk ? 'none' : '';
  document.getElementById('detectNextBtn').style.display = allOk ? '' : 'none';
}

async function startDeploy() {
  if (isDeploying) return;
  isDeploying = true;
  logs = [];
  renderLogs();
  showLogsFooter('running');
  showScreen('logs');
  setLogsStatus('running', 'En cours...');
  document.getElementById('rocketBtn').classList.add('deploying');
  document.getElementById('deployStatus').textContent = 'Déploiement en cours...';
  document.getElementById('deployError').style.display = 'none';
  document.getElementById('mainProgress').classList.add('active');
  document.getElementById('mainProgressFill').style.width = '0%';

  const branch = (selectedAction === 'pull' || selectedAction === 'auto') ? document.getElementById('branchSelect').value : undefined;
  const r = await api('deploy', {action: selectedAction, branch: branch});
  const deployId = r.id;

  pollTimer = setInterval(async () => {
    const lr = await api('logs?id=' + deployId);
    logs = lr.logs || [];
    renderLogs();
    if (lr.done) {
      clearInterval(pollTimer);
      pollTimer = null;
      isDeploying = false;
      document.getElementById('rocketBtn').classList.remove('deploying');
      document.getElementById('mainProgress').classList.remove('active');
      if (lr.error) {
        setLogsStatus('error', 'Échec');
        document.getElementById('deployStatus').textContent = 'Échec du déploiement';
        document.getElementById('deployError').textContent = lr.error;
        document.getElementById('deployError').style.display = '';
        showLogsFooter('error');
      } else {
        setLogsStatus('ok', 'Terminé');
        document.getElementById('deployStatus').textContent = 'Déploiement terminé';
        config.last_deploy = new Date().toISOString();
        updateMainUI();
        showLogsFooter('ok');
      }
    }
  }, 500);
}

function renderLogs() {
  const el = document.getElementById('logsScroll');
  el.innerHTML = logs.map(l => '<div class="log-line ' + l.level + '">' + escHtml(l.text) + '</div>').join('');
  el.scrollTop = el.scrollHeight;
}

function escHtml(s) { return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
function scrollLogs() { const el = document.getElementById('logsScroll'); el.scrollTop = el.scrollHeight; }

function showLogsFooter(state) {
  const footer = document.getElementById('logsFooter');
  if (state === 'ok') {
    footer.innerHTML = '<button class="btn-secondary" onclick="showScreen(\'main\')">Accueil</button><button class="btn-success" onclick="launchApp()">Lancer l\'app</button>';
  } else if (state === 'error') {
    footer.innerHTML = '<button class="btn-secondary" onclick="showScreen(\'main\')">Accueil</button><button class="btn-primary" onclick="startDeploy()">Réessayer</button>';
  } else {
    footer.innerHTML = '<button class="btn-secondary" onclick="clearLogs()">Effacer</button><button class="btn-primary" onclick="showScreen(\'main\')">Retour</button>';
  }
}

async function launchApp() {
  const r = await api('launch');
  if (!r.ok) alert(r.error || 'Impossible de lancer l\'app');
}

async function loadSettings() {
  document.getElementById('settingsRepo').value = config.repo_path || '';
  document.getElementById('settingsExe').value = config.exe_path || '';
  document.getElementById('configPathDisplay').textContent = config._config_path || '';
  const r = await api('branches');
  const sel = document.getElementById('settingsBranch');
  sel.innerHTML = '';
  (r.branches || []).forEach(b => {
    const o = document.createElement('option');
    o.value = b; o.textContent = b;
    if (b === (config.default_branch || r.current)) { o.selected = true; }
    sel.appendChild(o);
  });
  renderHistory();
}

async function saveSettings() {
  const repo = document.getElementById('settingsRepo').value.trim();
  const exe = document.getElementById('settingsExe').value.trim();
  const branch = document.getElementById('settingsBranch').value;
  if (!repo || !exe) return;
  const r = await api('config', {repo_path: repo, exe_path: exe, default_branch: branch});
  if (r.ok) { config.repo_path = repo; config.exe_path = exe; config.default_branch = branch; updateMainUI(); alert('Enregistré !'); }
}

async function browseFolderSettings() {
  const r = await api('browse');
  if (r.path) {
    document.getElementById('settingsRepo').value = r.path;
    document.getElementById('settingsExe').value = '.\\dist\\Cetas\\Cetas.exe';
  }
}

function renderHistory() {
  const el = document.getElementById('historyList');
  const h = config.history || [];
  if (!h.length) { el.innerHTML = '<div style="color:var(--text2);font-size:13px;padding:12px 0">Aucun déploiement</div>'; return; }
  el.innerHTML = h.slice(-10).reverse().map(item => {
    const d = new Date(item.date);
    const diff = Math.floor((Date.now() - d.getTime()) / 1000);
    let t = 'à l\'instant';
    if (diff > 86400) t = 'il y a ' + Math.floor(diff/86400) + 'j';
    else if (diff > 3600) t = 'il y a ' + Math.floor(diff/3600) + 'h';
    else if (diff > 60) t = 'il y a ' + Math.floor(diff/60) + 'min';
    const icon = item.ok ? '✓' : '✗';
    const color = item.ok ? 'var(--green)' : 'var(--red)';
    const actions = {auto:'Auto',pull:'Git Pull',clean:'Nettoyer',build:'Build'};
    return '<div style="display:flex;align-items:center;gap:10px;padding:10px 0;border-bottom:1px solid var(--bg4)"><span style="color:'+color+';font-size:16px;font-weight:700;width:20px">'+icon+'</span><div style="flex:1"><div style="font-size:13px">'+(actions[item.action]||item.action)+'</div><div style="font-size:11px;color:var(--text2)">'+t+'</div></div></div>';
  }).join('');
}

function setLogsStatus(state, text) {
  document.getElementById('logsDot').className = 'dot ' + state;
  document.getElementById('logsStatusText').textContent = text;
}

function clearLogs() { logs = []; renderLogs(); }

async function copyLogs() {
  const text = logs.map(l => l.text).join('\n');
  try { await navigator.clipboard.writeText(text); } catch(e) {}
}

(async () => {
  const r = await api('config');
  if (r.repo_path) {
    config = r;
    updateMainUI();
  } else {
    showScreen('setup');
    document.getElementById('inputRepo').placeholder = process.cwd ? process.cwd() : '';
  }
})();
</script>
</body>
</html>"""


class DeployAPI:
    def __init__(self):
        self.config = {"repo_path": "", "exe_path": ".\\dist\\Cetas\\Cetas.exe"}
        self._deploys = {}
        self._window = None
        self._load_config()

    def set_window(self, window):
        self._window = window

    def _config_path(self):
        base = os.path.dirname(os.path.abspath(sys.argv[0]))
        return os.path.join(base, CONFIG_FILE)

    def _load_config(self):
        p = self._config_path()
        if os.path.isfile(p):
            try:
                with open(p, "r", encoding="utf-8") as f:
                    self.config.update(json.load(f))
            except Exception as e:
                log.warning("Config corrompue, utilisation des défauts: %s", e)

    def get_config(self):
        cfg = dict(self.config)
        cfg["_config_path"] = self._config_path()
        return cfg

    def browse_folder(self):
        if not self._window:
            return {"path": ""}
        try:
            result = self._window.create_file_dialog(webview.FOLDER_DIALOG)
            if result and len(result) > 0:
                return {"path": result[0]}
        except Exception as e:
            log.debug("Dialogue dossier annulé ou erreur: %s", e)
        return {"path": ""}

    def save_config(self, data):
        self.config["repo_path"] = data.get("repo_path", self.config["repo_path"])
        self.config["exe_path"] = data.get("exe_path", self.config["exe_path"])
        if "default_branch" in data:
            self.config["default_branch"] = data["default_branch"]
        self.config["first_run"] = False
        try:
            with open(self._config_path(), "w", encoding="utf-8") as f:
                json.dump(self.config, f, indent=2, ensure_ascii=False)
        except Exception as e:
            return {"ok": False, "error": str(e)}
        return {"ok": True}

    def detect(self):
        result = {}
        r = shutil.which("git")
        if r:
            try:
                v = subprocess.check_output(["git", "--version"], text=True, timeout=5).strip()
                result["git"] = True
                result["git_version"] = v
            except Exception:
                result["git"] = False
                result["git_error"] = "git trouvé mais ne répond pas"
        else:
            result["git"] = False
            result["git_error"] = "Git non installé ou non dans le PATH"

        r = shutil.which("python") or shutil.which("python3")
        if r:
            try:
                v = subprocess.check_output([r, "--version"], text=True, timeout=5).strip()
                result["python"] = True
                result["python_version"] = v
            except Exception:
                result["python"] = False
                result["python_error"] = "Python trouvé mais ne répond pas"
        else:
            result["python"] = False
            result["python_error"] = "Python non installé ou non dans le PATH"

        try:
            v = subprocess.check_output([r or "python", "-m", "PyInstaller", "--version"],
                                        text=True, timeout=10).strip()
            result["pyinstaller"] = True
            result["pyinstaller_version"] = "PyInstaller " + v
        except Exception:
            result["pyinstaller"] = False
            result["pyinstaller_error"] = "PyInstaller non installé (pip install pyinstaller)"

        repo = self.config.get("repo_path", "")
        if repo and os.path.isdir(os.path.join(repo, ".git")):
            result["repository"] = True
            result["repository_version"] = repo
        elif repo:
            result["repository"] = False
            result["repository_error"] = "Pas un repository Git valide : " + repo
        else:
            result["repository"] = False
            result["repository_error"] = "Chemin du repository non configuré"
        return result

    def get_branches(self):
        repo = self.config.get("repo_path", "")
        if not repo:
            return {"branches": [], "current": ""}
        current = ""
        try:
            out = subprocess.check_output(
                ["git", "-C", repo, "rev-parse", "--abbrev-ref", "HEAD"],
                text=True, timeout=5
            ).strip()
            current = out
        except Exception:
            pass
        try:
            out = subprocess.check_output(
                ["git", "-C", repo, "branch", "-a", "--format=%(refname:short)"],
                text=True, timeout=10
            )
            branches = [b.strip() for b in out.strip().split("\n") if b.strip() and "HEAD" not in b]
            return {"branches": branches, "current": current}
        except Exception as e:
            log.warning("Erreur lors de la récupération des branches: %s", e)
            return {"branches": [], "current": current}

    def deploy(self, action, branch=None):
        deploy_id = str(int(time.time() * 1000))
        self._deploys[deploy_id] = {"logs": [], "done": False, "error": None}
        t = threading.Thread(target=self._run_deploy, args=(deploy_id, action, branch), daemon=True)
        t.start()
        return {"id": deploy_id}

    def get_logs(self, deploy_id):
        d = self._deploys.get(deploy_id, {"logs": [], "done": False, "error": None})
        return {"logs": d["logs"], "done": d["done"], "error": d["error"]}

    def launch_app(self):
        repo = self.config.get("repo_path", "")
        exe = self.config.get("exe_path", "")
        if not repo or not exe:
            return {"ok": False, "error": "Configuration manquante"}
        exe_full = exe if os.path.isabs(exe) else os.path.join(repo, exe)
        if not os.path.isfile(exe_full):
            return {"ok": False, "error": "Exécutable non trouvé : " + exe_full}
        try:
            subprocess.Popen([exe_full], cwd=os.path.dirname(exe_full))
            return {"ok": True}
        except Exception as e:
            return {"ok": False, "error": str(e)}

    def _log(self, deploy_id, text, level="info"):
        self._deploys[deploy_id]["logs"].append({"text": text, "level": level})

    def _rmtree_retry(self, path, deploy_id, attempts=5, delay=1.0):
        last_err = None
        for i in range(attempts):
            try:
                shutil.rmtree(path)
                return True, None
            except Exception as e:
                last_err = e
                if i < attempts - 1:
                    self._log(deploy_id, f"Fichier verrouillé, nouvelle tentative dans {delay}s... ({i+1}/{attempts})", "info")
                    time.sleep(delay)
        return False, last_err

    def _run_cmd(self, deploy_id, cmd, cwd=None):
        self._log(deploy_id, "$ " + " ".join(cmd), "cmd")
        output_lines = []
        try:
            proc = subprocess.Popen(
                cmd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                cwd=cwd, text=True, bufsize=1
            )
            for line in iter(proc.stdout.readline, ""):
                clean = line.rstrip("\n")
                output_lines.append(clean)
                self._log(deploy_id, clean)
            proc.wait()
            if proc.returncode != 0:
                self._log(deploy_id, f"Erreur (code {proc.returncode})", "error")
                full_output = "\n".join(output_lines)
                if "Could not resolve host" in full_output or "Temporary failure in name resolution" in full_output:
                    self._log(deploy_id, "⚠ Problème réseau/DNS : impossible de joindre GitHub. Vérifie ta connexion internet, ton DNS, ou si un VPN/proxy bloque l'accès.", "error")
                elif "Permission denied" in full_output or "publickey" in full_output:
                    self._log(deploy_id, "⚠ Problème d'authentification Git (clé SSH ou identifiants). Vérifie ta configuration Git.", "error")
                elif "Could not read from remote repository" in full_output:
                    self._log(deploy_id, "⚠ Dépôt distant inaccessible. Vérifie l'URL du repository et tes droits d'accès.", "error")
                return False
            self._log(deploy_id, "OK", "ok")
            return True
        except Exception as e:
            self._log(deploy_id, f"Exception: {e}", "error")
            return False

    def _current_branch(self, repo):
        try:
            out = subprocess.check_output(
                ["git", "-C", repo, "rev-parse", "--abbrev-ref", "HEAD"],
                text=True, timeout=5
            ).strip()
            return out
        except Exception as e:
            log.warning("Impossible de détecter la branche courante: %s", e)
            return "main"

    def _run_deploy(self, deploy_id, action, branch):
        repo = self.config.get("repo_path", "")
        exe = self.config.get("exe_path", "")
        if not branch:
            branch = self._current_branch(repo)
        try:
            if action == "auto":
                self._log(deploy_id, "═══ Auto: Pull → Clean → Build ═══", "separator")
                if not self._run_cmd(deploy_id, ["git", "pull", "origin", branch or "main"], cwd=repo):
                    self._deploys[deploy_id]["done"] = True
                    self._deploys[deploy_id]["error"] = "Git pull échoué"
                    self._save_history(action, False)
                    return
                self._log(deploy_id, "", "separator")
                self._log(deploy_id, "═══ Fermeture Cetas.exe ═══", "separator")
                result = subprocess.run(["taskkill", "/F", "/IM", "Cetas.exe"],
                                         capture_output=True, text=True)
                if result.returncode == 0:
                    self._log(deploy_id, "✓ Cetas.exe fermé", "ok")
                else:
                    self._log(deploy_id, "Aucun process Cetas.exe actif", "info")
                self._log(deploy_id, "", "separator")
                dist = os.path.join(repo, "dist")
                if os.path.isdir(dist):
                    ok, err = self._rmtree_retry(dist, deploy_id)
                    if ok:
                        self._log(deploy_id, "✓ dist/ supprimé", "ok")
                    else:
                        self._log(deploy_id, f"✗ Erreur suppression dist/: {err}", "error")
                        self._log(deploy_id, "⚠ Un fichier de dist/ est probablement encore verrouillé par un process. Ferme tout programme lié (antivirus en scan, explorateur ouvert sur ce dossier) et réessaie.", "error")
                        self._deploys[deploy_id]["done"] = True
                        self._deploys[deploy_id]["error"] = f"Impossible de supprimer dist/: {err}"
                        self._save_history(action, False)
                        return
                self._log(deploy_id, "", "separator")
                py = shutil.which("python") or "python"
                if not self._run_cmd(deploy_id, [py, "-m", "PyInstaller", "--clean", "--noconfirm", "cetas.spec"], cwd=repo):
                    self._deploys[deploy_id]["done"] = True
                    self._deploys[deploy_id]["error"] = "Build PyInstaller échoué"
                    self._save_history(action, False)
                    return
            elif action == "pull":
                self._log(deploy_id, "═══ Git Pull ═══", "separator")
                if not self._run_cmd(deploy_id, ["git", "pull", "origin", branch or "main"], cwd=repo):
                    self._deploys[deploy_id]["done"] = True
                    self._deploys[deploy_id]["error"] = "Git pull échoué"
                    self._save_history(action, False)
                    return
            elif action == "clean":
                self._log(deploy_id, "═══ Nettoyage ═══", "separator")
                self._log(deploy_id, "═══ Fermeture Cetas.exe ═══", "separator")
                result = subprocess.run(["taskkill", "/F", "/IM", "Cetas.exe"],
                                         capture_output=True, text=True)
                if result.returncode == 0:
                    self._log(deploy_id, "✓ Cetas.exe fermé", "ok")
                else:
                    self._log(deploy_id, "Aucun process Cetas.exe actif", "info")
                self._log(deploy_id, "", "separator")
                dist = os.path.join(repo, "dist")
                if os.path.isdir(dist):
                    ok, err = self._rmtree_retry(dist, deploy_id)
                    if ok:
                        self._log(deploy_id, "✓ dist/ supprimé", "ok")
                    else:
                        self._log(deploy_id, f"✗ Erreur suppression dist/: {err}", "error")
                        self._log(deploy_id, "⚠ Un fichier de dist/ est probablement encore verrouillé par un process. Ferme tout programme lié (antivirus en scan, explorateur ouvert sur ce dossier) et réessaie.", "error")
                        self._deploys[deploy_id]["done"] = True
                        self._deploys[deploy_id]["error"] = f"Impossible de supprimer dist/: {err}"
                        self._save_history(action, False)
                        return
                else:
                    self._log(deploy_id, "dist/ n'existe pas, rien à faire")
            elif action == "build":
                self._log(deploy_id, "═══ Build PyInstaller ═══", "separator")
                py = shutil.which("python") or "python"
                if not self._run_cmd(deploy_id, [py, "-m", "PyInstaller", "--clean", "--noconfirm", "cetas.spec"], cwd=repo):
                    self._deploys[deploy_id]["done"] = True
                    self._deploys[deploy_id]["error"] = "Build PyInstaller échoué"
                    self._save_history(action, False)
                    return

            if action in ("auto", "build"):
                exe_full = exe if os.path.isabs(exe) else os.path.join(repo, exe)
                if os.path.isfile(exe_full):
                    self._log(deploy_id, "", "separator")
                    self._log(deploy_id, f"✓ Exécutable trouvé: {exe_full}", "ok")
                else:
                    self._log(deploy_id, "", "separator")
                    self._log(deploy_id, f"⚠ Exécutable non trouvé: {exe_full}", "error")
                    self._deploys[deploy_id]["done"] = True
                    self._deploys[deploy_id]["error"] = f"Exécutable introuvable après {action}: {exe_full}"
                    self._save_history(action, False)
                    return

            self._deploys[deploy_id]["done"] = True
            self._save_history(action, True)
        except Exception as e:
            self._deploys[deploy_id]["done"] = True
            self._deploys[deploy_id]["error"] = str(e)
            self._log(deploy_id, f"Exception: {e}", "error")
            self._save_history(action, False)

    def _save_history(self, action, ok):
        if "history" not in self.config:
            self.config["history"] = []
        self.config["history"].append({
            "date": datetime.datetime.now().isoformat(),
            "action": action,
            "ok": ok
        })
        self.config["history"] = self.config["history"][-10:]
        try:
            with open(self._config_path(), "w", encoding="utf-8") as f:
                json.dump(self.config, f, indent=2, ensure_ascii=False)
        except Exception as e:
            log.warning("Impossible de sauvegarder l'historique: %s", e)


class DeployHTTPHandler(http.server.BaseHTTPRequestHandler):
    api = None

    def log_message(self, *a):
        pass

    def do_GET(self):
        path = urlparse(self.path).path
        if path == "/" or path == "":
            self.send_response(200)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.end_headers()
            self.wfile.write(HTML_TEMPLATE.encode("utf-8"))
        elif path == "/api/config":
            self._json(self.api.get_config())
        elif path == "/api/detect":
            self._json(self.api.detect())
        elif path == "/api/branches":
            self._json(self.api.get_branches())
        elif path == "/api/browse":
            self._json(self.api.browse_folder())
        elif path == "/api/logs":
            qs = urlparse(self.path).query
            did = ""
            for p in qs.split("&"):
                if p.startswith("id="):
                    did = p[3:]
            self._json(self.api.get_logs(did))
        else:
            self.send_response(404)
            self.end_headers()

    def do_POST(self):
        path = urlparse(self.path).path
        cl = int(self.headers.get("Content-Length", 0))
        body = json.loads(self.rfile.read(cl)) if cl else {}
        if path == "/api/config":
            self._json(self.api.save_config(body))
        elif path == "/api/deploy":
            self._json(self.api.deploy(body.get("action", "auto"), body.get("branch")))
        elif path == "/api/launch":
            self._json(self.api.launch_app())
        else:
            self.send_response(404)
            self.end_headers()

    def _json(self, data):
        out = json.dumps(data, ensure_ascii=False).encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(out)))
        self.end_headers()
        self.wfile.write(out)


def main():
    api = DeployAPI()
    DeployHTTPHandler.api = api

    port = 0
    with socketserver.TCPServer(("127.0.0.1", port), DeployHTTPHandler) as httpd:
        port = httpd.server_address[1]
        t = threading.Thread(target=httpd.serve_forever, daemon=True)
        t.start()

        start_url = f"http://127.0.0.1:{port}"
        if not api.config.get("repo_path"):
            start_url += "#setup"

        window = webview.create_window(
            APP_TITLE, start_url,
            width=420, height=780,
            min_size=(360, 600),
            resizable=True, text_select=True
        )
        api.set_window(window)
        webview.start(debug=False)


if __name__ == "__main__":
    main()

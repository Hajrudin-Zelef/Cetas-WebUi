# CETAS — Index Complet de l'Application

> Application web IA multi-modèles — SPA frontend + proxy Python backend.
> © Marexsoft Corporation. Fondateur: Kouassi Marius.

---

## Table des matières

1. [Architecture globale](#1-architecture-globale)
2. [Arborescence des fichiers](#2-arborescence-des-fichiers)
3. [Backend — Proxy Python](#3-backend--proxy-python)
4. [Frontend — Modules JS](#4-frontend--modules-js)
5. [Cartographie UI complète](#5-cartographie-ui-complète)
6. [CSS — Feuilles de style](#6-css--feuilles-de-style)
7. [Modèles IA — Catalogue](#7-modèles-ia--catalogue)
8. [Providers supportés](#8-providers-supportés)
9. [Configuration & Déploiement](#9-configuration--déploiement)
10. [Firewall PVE — Modèle Tailscale-Only](#10-firewall-pve--modèle-tailscale-only)
11. [Sécurité & Vault](#11-sécurité--vault)
12. [Guide de dépannage — 52 scénarios](#12-guide-de-dépannage--52-scénarios)

### Index de recherche rapide (ce que je cherche → où)

| Je cherche… | Aller à |
|-------------|---------|
| Erreur / bug / dépannage | §12 (scénarios numérotés par domaine) |
| Modification d'un composant UI (bouton, modale, panneau) | §5.10 « Je veux modifier X » |
| Clé API, provider, ajout de clé | §3 Authentification, §8, §11, §9 |
| Configurer un modèle / catalogue | §7 Modèles IA |
| Marexcode (outils, sandbox, upload, workspace) | §3 `/api/exec`, §7 Marexcode |
| LSP (intelligence code) | §3 `/api/lsp`, §7 Phase 2 |
| MCP (serveurs externes) | §3 `/api/mcp`, §7 Phase 3 |
| Custom Tools (outils user) | §3 `/api/marexcode/custom-tools`, §7 Phase 4 |
| Formatters (auto-format) | §3 `/api/exec` (hook), §7 Phase 5 |
| Undo/Redo | §3 `/api/marexcode/undo`, §7 Phase 6 |
| Ports, déploiement, Docker | §9 |
| Sécurité, vault, chiffrement | §11 |
| Firewall PVE | §10 |
| Variables d'environnement | §3 Variables d'environnement |
| OpenCode Zen / Go, double forfait | §8, §3 Routes proxy |
| Conversations / sync / export | §5, §12.4, §12.8 |
| Recherche web / SearXNG | §12.6, §4 web-search |
| Observabilité / logs | §3 logs, §12.10 |
| Ajouter un provider | §8 Ajout d'un provider |
| Modifier un fichier frontend précis | §4 Description des modules critiques |

---

## 1. Architecture globale

```
┌─────────────────────────────────────────────────────────┐
│                    UTILISATEUR                          │
│                    (navigateur)                         │
└────────────────────────┬────────────────────────────────┘
                         │ HTTPS (port 8901)
                         ▼
┌─────────────────────────────────────────────────────────┐
│                    NGINX                                │
│  - Sert le frontend : root /usr/share/nginx/html/static │
│  - SSI on (assemble les partials/ → index.html)         │
│  - Reverse proxy /api/ → 127.0.0.1:8080 (proxy Python)  │
│  - Rate-limit DDG: 10 req/min/IP                        │
│  - Gzip compression                                     │
└────────────────────────┬────────────────────────────────┘
                         │ HTTP interne
                         ▼
┌─────────────────────────────────────────────────────────┐
│              PROXY PYTHON (server.py)                    │
│  - Port: 127.0.0.1:8080                                 │
│  - Auth: JWT (24h)                                      │
│  - Déchiffre les clés API depuis .env + vault           │
│  - Forward les requêtes vers les providers IA           │
│  - Stocke les conversations par utilisateur             │
│  - POST /api/exec : sandbox Marexcode (outils codage)   │
│  - Rate-limit: 30 req/min/IP (proxy), 10/min (login)   │
└──────────────────────┬──────────────────────────────────┘
                       │ HTTPS
                       ▼
┌──────────────────────────────────────────────────────────┐
│              PROVIDERS IA (externes)                      │
│  OpenAI | Anthropic | Google | DeepSeek | Groq | ...     │
└──────────────────────────────────────────────────────────┘
```

**Infrastructure:**
- **Serveur**: LXC 100 (`10.10.10.100`)
- **Domaine**: `cetas.neva-ci.pro`
- **Port**: 8901
- **Container Docker**: `cetas-webui-cetas-1`
- **SearXNG**: `cetas-webui-searxng-1` (port interne 8904)
- **MTU**: 1300 (fixe les timeouts Docker Hub)

### Accès au LXC 100

| Info | Valeur |
|------|--------|
| IP | `10.10.10.100` |
| Hostname | `CETAS` |
| User | `sam` |
| Mot de passe SSH | `Popo112.` |
| Sudo | `Popo112.` (même mot de passe) |
| User root | `root` (même mot de passe) |
| Port SSH | `22` (défaut) |

**Connexion depuis la machine locale:**
```bash
# SSH interactif
ssh sam@10.10.10.100
# → Mot de passe: Popo112.

# Avec expect (script non-interactif)
expect -c '
spawn ssh -o StrictHostKeyChecking=no sam@10.10.10.100 "COMMANDE"
expect "password:"
send "Popo112.\r"
expect eof
'

# SCP (copier un fichier)
expect -c '
spawn scp -o StrictHostKeyChecking=no FICHIER.sam@10.10.10.100:/chemin/dest
expect "password:"
send "Popo112.\r"
expect eof
'

# sudo (depuis sam)
echo "Popo112." | sudo -S COMMANDE
```

---

## 2. Arborescence des fichiers

```
Cetas-WebUi/
├── README.md
├── cetas.py                    # Launcher desktop (pywebview + tray icon) — M2/M5
├── cetas.spec                  # Config PyInstaller (build Windows) — M4
├── build_windows.ps1           # Script build portable Windows — M4
├── installer.iss               # Script Inno Setup (installeur Windows) — M4
├── requirements.txt            # Dépendances Python (cryptography, PyJWT, pywebview, pystray, Pillow)
├── static/                     # ── FRONTEND ──
│   ├── index.html                 # Point d'entrée SPA (SSI shell)
│   ├── marexcode/                 # Module Marexcode — page standalone refactorée (SSI + ES modules)
│   │   ├── index.html             # Shell SSI (partials + globals CETAS + module app.js)
│   │   ├── css/
│   │   │   └── marexcode.css      # Styles extraits de l'ancien marexcode-ui.html
│   │   ├── js/
│   │   │   ├── app.js             # Entry module (boot, loadModels, sidebar, tree, sessions, cdrops)
│   │   │   ├── api.js             # Token JWT, CRUD sessions, tree, exec tools
│   │   │   ├── chat.js            # Chat → streamModelWithTools (CETAS), markdown rendu partout, blocs outils collapsibles + diff, todo live, ligne de statut
│   │   │   ├── model-select.js    # Sélecteur modèle (81 modèles, 4 groupes) + getCatalog
│   │   │   ├── marex-permission.js# Permissions outils (P3) : règles par outil allow/ask/deny, backward-compat ancien mode
│   │   │   ├── router.js          # Auth gate + bascule vue main ↔ réglages
│   │   │   ├── skills.js          # Compétences CETAS (prompts, extraits de plus-menu.js)
│   │   │   └── profile.js         # Page profil (stats, heatmap, top skills, token counter)
│   │   ├── components/
│   │   │   ├── sidebar.html       # SSI : sidebar (sessions, workspace tree, user menu)
│   │   │   ├── composer.html      # SSI : composer (workspace/permission/modèle) + chat panel
│   │   │   └── settings.html      # SSI : réglages allégés fonctionnels
│   │   └── assets/                # icônes inline SVG (0 dépendance externe)
│   ├── setup.html              # Page configuration initiale (vault local) — M3
│   ├── manifest.json              # PWA manifest
│   ├── sw.js                      # Service worker (v7 : network-first HTML + CSS/JS app code)
│   ├── partials/                  # HTML partials (SSI includes)
│   │   ├── head.html              # Meta, CSP, CSS
│   │   ├── splash.html            # Splash screen
│   │   ├── sidebar.html           # Navigation, conversations
│   │   ├── main.html              # Chat, input, toolbar
│   │   ├── right-panel.html       # Settings sliders
│   │   ├── modals.html            # 7 modals + lightbox
│   │   ├── canvas.html            # Code editor
│   │   └── scripts.html           # Script tags + SW + login
│   ├── js/
│   │   ├── init/                  # Init scripts (inline → external)
│   │   │   ├── css-error.js       # CSS load error handler
│   │   │   ├── theme-init.js      # Theme application before render
│   │   │   └── splash.js          # Splash screen coordination
│   │   ├── core/                  # Core modules
│   │   │   ├── app.js             # Application principale (coeur SPA)
│   │   │   ├── state.js           # État global (STATE object)
│   │   │   ├── api.js             # Communication proxy / API providers
│   │   │   ├── dom.js             # Références DOM
│   │   │   ├── utils.js           # Fonctions utilitaires
│   │   │   ├── router.js          # Routeur SamAgent
│   │   │   └── config.js          # Config runtime (généré au démarrage)
│   │   ├── ui/                    # UI modules
│   │   │   ├── ocean.js           # Effets visuels / animations
│   │   │   ├── plus-menu.js       # Menu "+"
│   │   │   ├── right-panel.js     # Panneau config
│   │   │   ├── emoji-picker.js    # Sélecteur d'emojis
│   │   │   ├── theme.js           # Thème (light/dark/auto)
│   │   │   └── lightbox.js        # Lightbox pour images
│   │   ├── features/              # Feature modules
│   │   │   ├── model-select.js    # Sélection modèle / custom select (factory)
│   │   │   ├── canvas.js          # Canvas (update, snapshots, parser)
│   │   │   ├── chat.js            # Messages, streaming, envoi (factory + tool loop)
│   │   │   ├── marexcode.js       # Vue plein écran Marexcode (legacy, non ouverte par le bouton)
│   │   │   ├── model-catalog.js   # Catalogue modèles (tarifs, fallback)
│   │   │   ├── conversations.js   # Gestion des conversations
│   │   │   ├── categories.js      # Catégories
│   │   │   ├── favorites.js       # Favoris
│   │   │   ├── roles.js           # Système de rôles/prompts
│   │   │   ├── prompts.js         # Prompts personnalisés
│   │   │   ├── attachments.js     # Gestion des pièces jointes
│   │   │   └── faq.js             # FAQ intégrée
│   │   ├── services/              # Service modules
│   │   │   ├── auth.js            # Authentification JWT
│   │   │   ├── budget.js          # Suivi budgétaire
│   │   │   ├── quotas.js          # Gestion des quotas
│   │   │   ├── config-providers.js # Configuration des providers
│   │   │   ├── filemanager.js     # Sync conversations serveur
│   │   │   ├── export-import.js   # Export/Import conversations
│   │   │   ├── export-md.js       # Export Markdown
│   │   │   ├── user-management.js # Gestion utilisateurs
│   │   │   └── settings-sync.js   # Sync paramètres
│   │   ├── integrations/          # Third-party integrations
│   │   │   ├── web-search.js      # Recherche web intégrée
│   │   │   ├── search-engine.js   # Moteur de recherche (SearXNG)
│   │   │   ├── tool-search.js     # Recherche web + outils Marexcode (Ls/Read/Write/Edit/Grep/Bash/TodoWrite/Glob/LSP/MCP/Custom) + streamModelWithTools + loadMcpTools + loadCustomTools
│   │   │   └── whisper.js         # Reconnaissance vocale
│   │   ├── ui/                    # UI modules
│   │   │   ├── prompt-toolbar.js  # Toolbar prompt (enhance, insert, save) — factory
│   │   │   └── (ocean.js, plus-menu.js, right-panel.js, … voir ci-dessous)
│   │   ├── data/                  # Data files
│   │   │   └── models.js          # Catalogue complet des modèles IA
│   │   ├── vendor/                # Third-party libraries
│   │   │   ├── pdf.min.js         # Lib PDF.js
│   │   │   ├── marked.umd.min.js  # Lib Markdown → HTML
│   │   │   ├── purify.min.js      # Lib DOMPurify
│   │   │   ├── jszip.min.js       # Lib ZIP
│   │   │   ├── mammoth.browser.min.js # Lib Word → HTML
│   │   │   └── xlsx.full.min.js   # Lib Excel
│   │   └── tests/                 # Frontend tests
│   │       ├── router.test.mjs
│   │       ├── static-paths.test.mjs
│   │       ├── validate-pools.mjs
│   │       ├── logs-events.test.mjs
│   │       ├── faq-structure.test.mjs
│   │       ├── html-css-structure.test.mjs
│   │       ├── model-select-structure.test.mjs
│   │       ├── canvas-structure.test.mjs
│   │       ├── chat-structure.test.mjs
│   │       ├── prompt-toolbar-structure.test.mjs
│   │       ├── marexcode-structure.test.mjs   # Structure page standalone /marexcode/ (SSI, modules, compétences)
│   │       └── marex-permission.test.mjs      # Tests permissions granulaires par outil (allow/ask/deny)
│   ├── css/
│   │   ├── base/                  # Variables, layout
│   │   ├── features/              # Chat, logs-events, marexcode
│   │   ├── components/            # Components, canvas, catalog, storage, menu
│   │   ├── themes/                # Ocean theme
│   │   ├── style.css              # ← CONCATÉNÉ (build)
│   │   └── ocean.css              # Thème océan
│   └── images/                    # Images
│       ├── Cetas42.png            # Logo principal
│       ├── Cetas42.ico            # Icône Windows (pour PyInstaller .exe) — M4
│       ├── icons.svg              # Sprite SVG (28 icônes)
│       ├── *.svg                  # Icônes providers
│       ├── Brave.svg            # Icône Brave Search
│       ├── Tavily.png           # Icône Tavily
│       ├── Exa.png              # Icône Exa
│       ├── Jina.webp            # Icône Jina
│       └── icon-*.png             # Icons PWA
│
├── server/                        # ── BACKEND ──
│   ├── server.py                  # Proxy API Python (principal)
│   ├── marexcode.py               # Backend Marexcode : sandbox exec + sessions + tree + LSP + MCP + custom tools + formatters + undo/redo (mixin MarexcodeMixin)
│   ├── lsp.py                     # LSP Manager : JSON-RPC over stdio (pyright, tsserver, etc.)
│   ├── mcp.py                     # MCP Manager : client MCP (stdio + HTTP/SSE) — alias mcp_client.py dans container
│   ├── observability.py           # Observabilité structurée
│   ├── cloudflare-worker.js       # Worker Cloudflare (backup/sync)
│   └── tests/                     # Tests backend
│       ├── test_server_auth.py
│       ├── test_server_proxy.py
│       ├── test_observability.py
│       ├── test_log_endpoints.py
│       ├── test_crypto_linux.py
│       ├── test_exec.py           # Sandbox Marexcode (/api/exec)
│       ├── test_marexcode.py      # Workspace + endpoints /api/marexcode/*
│       ├── test_static_serving.py # Static serving + SSI local (M0.1)
│       ├── test_local_mode.py     # Workspace local + Bash complet + portabilité Windows (M0.2/M0.3)
│       ├── test_format_tool_output.py # Formatage concis des sorties outils (P2.1)
│       ├── test_desktop.py        # create_server() (M2)
│       ├── test_vault_ui.py       # Vault local UI (M3)
│       └── test_packaging.py      # Packaging Windows (M4)
│
│   └── __init__.py               # Package Python (pour PyInstaller)
│
├── scripts/                       # ── OUTILS ──
│   └── setup.py                   # Configuration vault + clés API
│
├── core/                          # ── CŒUR CRYPTO ──
│   ├── users-seed.json            # Utilisateurs initiaux (admin)
│   ├── api-keys-seed.json         # Clés API seed (supprimé au build)
│   └── linux/
│       ├── crypto_linux.py        # Module chiffrement AES-256-GCM
│       └── vault_guard.py         # Daemon immutabilité vault
│
├── .vault/                        # Vault (secrets)
├── conversations/                 # Données utilisateur
│
├── Docs/                          # Documentation
│   ├── index.md
│   ├── AGENTS.md
│   ├── DEPLOY.md
│   ├── FIREWALL_PVE_PLAN.md
│   ├── Rapport/
│   └── TAF/                       # Plans (refactor app.js, intégration Marexcode, app Windows Cetas, …)
│
├── Dockerfile
├── docker-compose.yml
├── nginx.conf                     # Config nginx (SSI activé, root static/)
├── start.sh                       # Génère static/js/config.js + lance proxy + nginx
├── .env / .env.docker
```

---

## 3. Backend — Proxy Python

### Fichier principal: `server/server.py`

Le proxy est un serveur HTTP Python (stdlib) qui :
1. Déchiffre les clés API depuis `.env` via le vault `.enc`
2. Authentifie les requêtes via JWT
3. Forward les requêtes vers les providers IA en injectant les clés

> **Backend Marexcode** : implémenté dans **`server/marexcode.py`** (mixin `MarexcodeMixin`
> hérité par `ProxyHandler`). Il contient tout le backend du module Marexcode :
> sandbox d'exécution (`/api/exec` : Bash/Read/Write/Edit/Grep, whitelist, timeout,
> blocage `../`+symlinks), arborescence workspace (`/api/marexcode/tree`) et sessions
> CRUD (`/api/marexcode/sessions[/{id}]`). Importé par `server/server.py` via
> `from .marexcode import MarexcodeMixin` (relative, fallback absolu pour standalone).
> Copié dans le container par le `Dockerfile`.

> **Static serving local (M0)** : en mode desktop (sans nginx), `server.py` sert directement
> les fichiers `static/` via `_serve_static()` avec rendu SSI (`_ssi_render`).
> Le mode web (Docker) continue d'utiliser nginx.
>
> **Desktop local-only** : `IS_DESKTOP` (hostname === 127.0.0.1) désactive la sync serveur.
> Conversations (IndexedDB) et settings (localStorage) restent sur le PC. Le serveur sert uniquement au proxy API.
> `_reinit_data_paths()` corrige `DATA_DIR` après `apply_frozen_defaults()` pour résoudre le path `/app/data` sur Windows.

> **`create_server()`** (M2) : extrait de `main()` pour réutilisation par `cetas.py` (launcher desktop).
> Configure le serveur sans le démarrer, permet un lancement en thread daemon.

> **Vault local UI (M3)** : endpoints `/setup` (page config initiale) et `/setup/save` (enregistrement
> clés API). Fonctions `vault_exists()`, `setup_save_vault()`, `save_vault_password()`,
> `load_vault_password()`. `CETAS_SETUP_MODE` : mode sans vault requis (pour le 1er lancement).

> **Fix Windows SSE** : `ConnectionAbortedError` attrapée dans `_proxy_request` (lorsque le
> client déconnecte pendant le streaming SSE). Évite les traceback dans les logs Windows.

### Routes API

| Méthode | Route | Rôle | Auth |
|---------|-------|------|------|
| GET | `/api/health` | Status proxy + nombre de clés | Non |
| GET | `/api/keys` | Liste des clés API (admin) | Admin |
| POST | `/api/auth/login` | Connexion → JWT | Non |
| POST | `/api/auth/register` | Inscription | Non |
| GET | `/api/conversations` | Liste conversations | JWT |
| GET | `/api/conversations/{file}` | Détail conversation | JWT |
| PUT | `/api/conversations/{file}` | Sauvegarder conversation | JWT |
| DELETE | `/api/conversations/{file}` | Supprimer conversation | JWT |
| GET | `/api/settings` | Paramètres utilisateur | JWT |
| PUT | `/api/settings` | Sauvegarder paramètres | JWT |
| GET | `/api/users` | Liste utilisateurs | Admin |
| PUT | `/api/users/{target}` | Modifier utilisateur | JWT |
| DELETE | `/api/users/{target}` | Supprimer utilisateur | Admin |
| GET | `/api/proxy/{provider}/...` | Proxy GET vers provider | JWT |
| POST | `/api/proxy/{provider}/...` | Proxy POST vers provider | JWT |
| POST | `/api/exec` | Outils Marexcode (Ls/Bash/Read/Write/Edit/Grep) — sandbox | JWT |
| GET | `/api/marexcode/tree` | Listing workspace utilisateur | JWT |
| GET | `/api/marexcode/sessions` | Liste sessions Marexcode | JWT |
| GET/PUT/DELETE | `/api/marexcode/sessions/{id}` | Session Marexcode CRUD | JWT |
| GET/PUT/DELETE | `/api/marexcode/project` | Projet actif + liste / changer / **supprimer le projet importé** | JWT |
| POST | `/api/marexcode/upload` | Import dossier (multipart webkitdirectory) → `uploaded_project/` | JWT |
| GET | `/api/logs/summary` | Résumé logs (admin) | Admin |
| POST | `/api/logs/events` | Batch événements frontend | JWT |
| POST | `/api/logs/analyze` | Analyse IA incidents (Mimo Zen) | Admin |
| GET | `/api/tavily/search` | Proxy recherche Tavily | JWT |
| GET | `/api/marexcode/workspaces` | Liste workspaces utilisateur | JWT |
| PUT | `/api/marexcode/workspaces/:id/activate` | Activer un workspace | JWT |
| DELETE | `/api/marexcode/workspaces/:id` | Supprimer un workspace | JWT |
| GET | `/api/marexcode/workspaces/:id/tree` | Arborescence d'un workspace | JWT |
| GET | `/api/marexcode/workspaces/:id/instructions` | Instructions par projet (MAREXCODE.md) | JWT |
| PUT | `/api/marexcode/workspaces/:id/instructions` | Sauvegarder instructions projet | JWT |
| GET | `/api/marexcode/global-instructions` | Instructions globales utilisateur | JWT |
| PUT | `/api/marexcode/global-instructions` | Sauvegarder instructions globales | JWT |
| GET | `/api/marexcode/profile/stats` | Statistiques profil (tokens, chats, streak, skills) | JWT |
| GET | `/api/marexcode/profile/activity` | Données heatmap activité | JWT |
| POST | `/api/marexcode/profile/activity` | Tracker activité (appelé à chaque envoi) | JWT |
| GET | `/api/marexcode/memory` | Lire mémoire locale | JWT |
| PUT | `/api/marexcode/memory` | Sauvegarder mémoire locale | JWT |
| DELETE | `/api/marexcode/memory` | Supprimer mémoire locale | JWT |
| POST | `/api/lsp/{operation}` | Opération LSP (definition, references, hover, symbol) | JWT |
| GET | `/api/mcp/servers` | Liste serveurs MCP configurés | JWT |
| GET | `/api/mcp/{server}/tools` | Liste tools d'un serveur MCP | JWT |
| POST | `/api/mcp/{server}/{tool}` | Exécuter un tool MCP | JWT |
| GET | `/api/marexcode/custom-tools` | Liste outils custom (tools.json) | JWT |
| PUT | `/api/marexcode/custom-tools` | Sauvegarder outils custom | JWT |
| POST | `/api/marexcode/custom-tools/{name}` | Exécuter un outil custom | JWT |
| POST | `/api/marexcode/undo` | Annuler la dernière opération Write/Edit | JWT |
| POST | `/api/marexcode/redo` | Rétablir la dernière opération annulée | JWT |
| GET | `/api/marexcode/undo-log` | État du journal undo/redo | JWT |
| GET | `/setup` | Page configuration initiale (vault local) | Non |
| POST | `/setup/save` | Enregistrement clés API + création vault | Non |
| GET | `/api/vault/exists` | Vérifie si le vault existe | Non |

### Routes proxy par provider

| Provider | Base URL | Paths autorisés |
|----------|----------|-----------------|
| openai | `api.openai.com` | `/v1/chat/completions`, `/v1/models`, `/v1/images/` |
| anthropic | `api.anthropic.com` | `/v1/messages` |
| google | `generativelanguage.googleapis.com` | `/v1beta/models/` |
| deepseek | `api.deepseek.com` | `/chat/completions`, `/v1/chat/completions` |
| openrouter | `openrouter.ai` | `/api/v1/chat/completions`, `/api/v1/models` |
| groq | `api.groq.com` | `/openai/v1/chat/completions`, `/openai/v1/models`, `/openai/v1/audio/` |
| nvidia | `integrate.api.nvidia.com` | `/v1/chat/completions`, `/v1/models` |
| mistral | `api.mistral.ai` | `/v1/chat/completions` |
| perplexity | `api.perplexity.ai` | `/chat/completions` |
| grok | `api.x.ai` | `/v1/chat/completions` |
| zai | `api.z.ai` | `/api/paas/v4/chat/completions` |
| cabreras | `api.cabreras.ai` | `/v1/chat/completions` |
| opencode | `opencode.ai` | `/zen/v1/chat/completions`, + messages/responses (forfait Zen) |
| opencode-go | `opencode.ai` | `/zen/go/v1/chat/completions`, + messages/responses (forfait Go, clé distincte) |
| llamacpp | `$CETAS_LLAMACPP_URL` | `/v1/chat/completions`, `/v1/models` |
| ollama | `$CETAS_OLLAMA_URL` | `/v1/chat/completions`, `/v1/models` |
| lmstudio | `$CETAS_LMSTUDIO_URL` | `/v1/chat/completions`, `/v1/models` |

### Endpoint `/api/exec` — Sandbox Marexcode

Endpoint de la **Compétence Marexcode** et du **Module Marexcode (UI standalone)** :
exécution d'outils d'assistant de codage côté serveur. Sécurité stricte (sandbox) :

| Garantie | Valeur |
|----------|--------|
| Auth | JWT obligatoire (401 sans token) |
| Sandbox racine | Workspace par utilisateur `DATA_DIR/marexcode/<user>/` — blocage `../` + symlinks |
| Whitelist Bash | `ls cat grep git node python3 python npm npx head tail wc find sed awk echo printf mkdir touch rm cp mv pwd date whoami basename dirname` |
| Interdits | `sudo su bash sh zsh curl wget` + flags `-c --eval -e` (anti-bypass `python -c`) |
| Timeout | `CETAS_EXEC_TIMEOUT` (10s défaut) |
| Output max | `CETAS_EXEC_MAX_OUTPUT` (200 Ko défaut) |
| Rate-limit | 60 req/min par utilisateur |
| Format concis | Champ `text` ajouté (P2.1) : format OpenCode pour chaque outil |

**Body** : `{"tool": "Ls|Bash|Read|Write|Edit|Grep|Glob", "args": {...}}` — `TodoWrite` est **virtuel côté client** (CustomEvent `marexcode-todo`, pas de `/api/exec`).

**Auto-formatters (Phase 5)** : après chaque Write/Edit, le backend exécute automatiquement le
formatter correspondant à l'extension (`.py`→ruff, `.js/.ts/.json/.css/.html/.md`→prettier).
Silencieux, non-bloquant (les erreurs de formatage n'affectent pas le résultat du write/edit).

**Undo/Redo (Phase 6)** : chaque Write/Edit sauvegarde l'ancien contenu dans `undo_log.json`.
Endpoints : `POST /api/marexcode/undo`, `POST /api/marexcode/redo`, `GET /api/marexcode/undo-log`.

**Formatage concis (P2.1)** : `format_tool_output()` dans `marexcode.py` génère un champ `text` lisible par le modèle :
- `Read` → "Read X lines from path"
- `Edit` → "Edited file successfully: path\nReplacements: N\n```diff\n...\n```"
- `Write` → "Created/Wrote file: path"
- `Bash` → "Command exited with code X\n{output}"
- `Grep` → "Found N matches\npath:line: preview"
- `Ls` → "Found N files\nfile1\nfile2\n…"

Le frontend (`tool-search.js`) utilise `data.text` pour le contenu vu par le modèle (pas le JSON brut).

### Endpoints Module Marexcode

| Méthode | Route | Rôle |
|---------|-------|------|
| GET | `/api/marexcode/tree` | Listing récursif du workspace (exclut `.git`, `node_modules`, cachés) |
| GET | `/api/marexcode/sessions` | Liste meta des sessions |
| GET | `/api/marexcode/sessions/{id}` | Session complète |
| PUT | `/api/marexcode/sessions/{id}` | Sauvegarder une session |
| DELETE | `/api/marexcode/sessions/{id}` | Supprimer une session |

> **Backend** : tous les endpoints `/api/exec` + `/api/marexcode/*` sont implémentés dans
> **`server/marexcode.py`** (mixin `MarexcodeMixin` hérité par `ProxyHandler` de `server/server.py`).

Module frontend : **`static/marexcode/`** (page standalone refactorée, SSI + ES modules) —
l'ancien monolithique `static/marexcode-ui.html` a été **supprimé**. Le **bouton sidebar**
`data-module="marexcode"` (actif) ouvre `/marexcode/`.

La page `static/marexcode/index.html` charge les globals CETAS (`models.js`, `auth.js`,
`api.js`, `tool-search.js` + marked/purify) et un module d'entrée `js/app.js`. Elle réutilise
directement le pipeline CETAS :
- **`streamModelWithTools`** (`js/integrations/tool-search.js`) — boucle agentic SSE + tool calls
  (Bash/Read/Write/Edit/Grep via `/api/exec`), auth JWT via `proxyHeaders` (`js/core/api.js`)
- **`loadModels()`** (`js/core/api.js`) — peuple `MODELS_MAP` au boot (obligatoire pour que
  `getModelEditeur` résolve l'éditeur du modèle)
- **`MAREXCODE_TOOLS`** + `_execMarexcodeTool` (`js/integrations/tool-search.js`)
- Sélecteur modèle : 4 groupes (OpenCode Go, OpenCode Zen, DeepSeek, OpenRouter),
  modèles persistés (`marex-last-model`), **109 modèles** depuis `MODELS_DATA` + icônes providers (SVG).
  OpenRouter : 28 modèles coding payants (tool calling ≥256k) avec prix dynamiques.

Fonctionnalités : sessions CRUD (list/load/save/delete, titre auto, suppression par session
et "tout supprimer"), explorateur workspace (tree + lecture fichier), menu « + » (Modèles +
Compétences CETAS), bouton Stop (AbortController), rendu Markdown (marked + DOMPurify),
bloc raisonnement repliable, réglages allégés (profil Auth, déconnexion, raccourcis), auth gate.

> **P3 — Permissions granulaires** : règles par outil (`allow`/`ask`/`deny`) au lieu du trio
> Read only / Espace Write / Ask. UI dans `composer.html` (6 sélecteurs). Backward-compat :
> l'ancien `marex-permission` localStorage devient les defaults.

> **Bouton Retour** : sidebar Marexcode avec bouton "← Retour à Cetas" (icône Cetas42.png + lien vers `/`).
| Outil | Args | Retour |
|-------|------|--------|
| `Ls` | `{}` | `files` (arborescence via `_marex_tree`) |
| `Bash` | `command`, `timeout?` | `stdout`, `stderr`, `code`, `timeout_used` |
| `Read` | `file_path`, `offset?`, `limit?` | `content`, `lines_read`, `total_lines` (pagination) |
| `Write` | `file_path`, `content` | `ok`, `path`, `existed` |
| `Edit` | `file_path`, `old`, `new` | `ok`, `path`, `replacements`, `additions`, `deletions`, `patch` (diff unifié) |
| `Grep` | `pattern`, `path?`, `limit?` | `stdout`, `code`, `matches`, `limit_applied` (ignore binaires/`__pycache__`/`.git`) |
| `Glob` | `pattern` | `files`, `count`, `pattern` (fnmatch + os.walk) |
| `LSP` | `operation`, `file`, `line`, `character` | definition/references/hover/symbol (pyright, tsserver, etc.) |
| `TodoWrite` | `todos[]` | virtuel client → `CustomEvent('marexcode-todo')`, `{ok:true}` |
| `mcp_{server}_{tool}` | `args` du tool MCP | Résultat du tool MCP (context7, fetch, memory, filesystem) |
| `custom_{name}` | `args` du tool custom | Résultat de la commande shell (tools.json) |

### Authentification

- **JWT**: HS256, expiration 24h
- **Secret stocké**: `/app/data/.jwt_secret`
- **Password hashing**: scrypt (N=16384, r=8, p=1) ou SHA-256 legacy
- **Migration auto**: SHA-256 → scrypt au login
- **Desktop** : mot de passe vault sauvé dans `%APPDATA%\Cetas\data\.password` (M3)
- **Login amélioré** : autofocus password, auto-fill username (depuis localStorage), lien "Mot de passe oublié ?"

### Variables d'environnement

| Variable | Rôle | Exemple |
|----------|------|---------|
| `CETAS_BASE_DIR` | Répertoire racine | `/usr/share/nginx/html` |
| `CETAS_VAULT_PATH` | Chemin vault | `$BASE_DIR/.vault/.enc` |
| `CETAS_ENV_PATH` | Chemin .env | `$BASE_DIR/.env` |
| `CETAS_CRYPTO_PATH` | Module crypto | `/app/core/linux/crypto_linux.py` |
| `CETAS_VAULT_PASSWORD` | Mot de passe vault | (dans .env.docker) |
| `CETAS_WORKER_TOKEN` | Token Cloudflare | (dans .env.docker) |
| `CETAS_CORS_ORIGINS` | Origines CORS | `https://cetas.neva-ci.pro` |
| `CETAS_LLAMACPP_URL` | URL LLaMA.cpp | `http://10.10.10.102:8080` |
| `CETAS_OLLAMA_URL` | URL Ollama (IA Locale) | `http://127.0.0.1:11434` |
| `CETAS_LMSTUDIO_URL` | URL LM Studio (IA Locale) | `http://127.0.0.1:1234` |
| `CETAS_LLAMACPP_KEY` | Clé LLaMA.cpp | (chiffrée) |
| `CETAS_DATA_DIR` | Données utilisateur | `/app/data` |
| `CETAS_REGISTRATION_OPEN` | Inscription self-service (`false` en prod) | `false` |
| `CETAS_PROJECT_DIR` | Sandbox racine outils Marexcode — **fallback uniquement** (défaut `DATA_DIR`, jamais `CETAS_BASE_DIR`) | `/app/data` |
| `CETAS_EXEC_TIMEOUT` | Timeout commande `/api/exec` | `10` |
| `CETAS_EXEC_MAX_OUTPUT` | Output max `/api/exec` (octets) | `200000` |
| `CETAS_UPLOAD_MAX_BYTES` | Taille max upload projet importé (octets) | `157286400` (150 Mo) |
| `CETAS_UPLOAD_MAX_FILES` | Nb max fichiers upload projet importé | `1000` |
| `PROXY_PORT` | Port proxy | `8080` |
| `CETAS_SETUP_MODE` | Mode setup (pas de vault requis) | `1` (desktop, 1er lancement) |
| `CETAS_LOCAL_MODE` | Bash complet local (subprocess) | `1` (desktop) |
| `CETAS_BASH_PATH` | Chemin vers bash.exe (Windows) | `C:\Program Files\Git\bin\bash.exe` |
| `CETAS_STATIC_DIR` | Dossier statique (auto en mode frozen) | `%MEIPASS%\static` |
| `CETAS_LLAMACPP_KEY` | Clé LLaMA.cpp (non chiffrée, en env) | `c52b7bca...` |

---

## 4. Frontend — Modules JS

### Architecture modulaire (ES Modules)

> **Page standalone Marexcode** (`/marexcode/`) : ne fait PAS partie de la SPA —
> c'est un dossier séparé `static/marexcode/` (index SSI + `css/` + `js/` + `components/`)
> qui charge les globals CETAS (`models.js`, `auth.js`, `api.js`, `tool-search.js`) et
> un module d'entrée `js/app.js`. Voir §3 « Endpoints Module Marexcode ».

```
index.html
  └── js/init/
  │   ├── css-error.js      ← CSS load error handler
  │   ├── theme-init.js     ← Theme application before render
  │   └── splash.js         ← Splash screen coordination
  └── js/core/
  │   ├── state.js          ← État global (STATE)
  │   ├── app.js            ← Coeur SPA (imports tous les modules)
  │   ├── dom.js            ← Références DOM
  │   ├── api.js            ← Communication proxy
  │   ├── utils.js          ← Utilitaires
  │   ├── router.js         ← Routeur SamAgent (classique, chargé avant app.js)
  │   └── config.js         ← Config runtime (généré au démarrage)
  └── js/ui/
  │   ├── ocean.js          ← Animations
  │   ├── plus-menu.js      ← Menu "+"
  │   ├── right-panel.js    ← Panneau config
  │   ├── emoji-picker.js   ← Emojis
  │   ├── theme.js          ← Thème
  │   └── lightbox.js       ← Zoom images
  └── js/features/
  │   ├── model-select.js   ← Sélection modèle / custom select (factory `createModelSelect`)
  │   ├── canvas.js         ← Canvas (factory `createCanvas`)
  │   ├── chat.js           ← Messages/streaming/envoi (factory `createChat` + dispatch outils)
  │   ├── model-catalog.js  ← Tarifs, fallback, catalog prefs
  │   ├── conversations.js  ← CRUD conversations
  │   ├── categories.js     ← Catégories
  │   ├── favorites.js      ← Favoris
  │   ├── roles.js          ← Rôles/prompts système
  │   ├── prompts.js        ← Prompts personnalisés
  │   ├── attachments.js    ← Pièces jointes
  │   └── faq.js            ← FAQ intégrée
  └── js/services/
  │   ├── auth.js           ← Login/logout JWT
  │   ├── budget.js         ← Budget/tarifs
  │   ├── quotas.js         ← Quotas
  │   ├── config-providers.js ← Configuration providers
  │   ├── filemanager.js    ← Sync multi-appareils
  │   ├── export-import.js  ← Backup/restore
  │   ├── export-md.js      ← Export MD
  │   ├── user-management.js ← Gestion users
  │   └── settings-sync.js  ← Sync settings
  └── js/ui/
  │   ├── prompt-toolbar.js ← Toolbar prompt (factory `createPromptToolbar`)
  │   └── (ocean, plus-menu, right-panel, emoji-picker, theme, lightbox)
  └── js/integrations/
  │   ├── web-search.js     ← Bouton recherche web
  │   ├── search-engine.js  ← Recherche SearXNG
  │   ├── tool-search.js    ← Outils web + **outils Marexcode** (MAREXCODE_TOOLS, _execMarexcodeTool, streamModelWithTools)
  │   │                        **P2.2** : contenu modèle utilise `data.text` (format concis au lieu de JSON brut)
  │   └── whisper.js        ← Dictée vocale
  └── js/data/
  │   └── models.js         ← Catalogue complet des modèles IA
  └── js/vendor/            ← Libs tierces (pdf.min.js, marked, purify, jszip, mammoth, xlsx)
  └── js/tests/
      ├── router.test.mjs   ← Tests SamAgent (node --test)
      ├── static-paths.test.mjs
      ├── validate-pools.mjs
      ├── logs-events.test.mjs
      ├── model-select-structure.test.mjs
      ├── canvas-structure.test.mjs
      ├── chat-structure.test.mjs
      ├── prompt-toolbar-structure.test.mjs
      ├── marexcode-structure.test.mjs  ← Structure page /marexcode/
      └── marex-permission.test.mjs     ← Tests permissions granulaires (allow/ask/deny)
```

### Modules Marexcode (page standalone `/marexcode/`)

```
static/marexcode/
├── index.html             # Shell SSI
├── components/
│   ├── sidebar.html       # Sidebar (sessions, workspaces, user menu)
│   ├── composer.html      # Composer (workspace/permission/modèle) + chat panel
│   └── settings.html      # Settings (Profil, Raccourcis, Sessions, Général, Comportement, Skills, Instructions)
├── css/
│   └── marexcode.css      # Styles Marexcode
├── js/
│   ├── app.js             # Boot + orchestration + refreshWorkspaces/refreshSessions
│   ├── api.js             # API calls (sessions, tree, exec, skills, workspaces, profile, memory)
│   ├── chat.js            # Chat streaming + tool loop + system prompt + skills injection
│   ├── model-select.js    # Sélecteur modèle (4 groupes)
│   ├── marex-permission.js# Permissions outils (allow/ask/deny) + autoAllowWorkspace
│   ├── router.js          # Auth gate + showMain/showSettings/showProfile
│   ├── skills.js          # Compétences (code-expert, pedagogue, marexcode)
│   └── profile.js         # Page profil (stats, heatmap, top skills)
└── assets/                # Icônes SVG
```

### Description des modules critiques

| Module | Rôle | Quand le modifier |
|--------|------|-------------------|
| `js/core/state.js` | Objet STATE global (webSearchEnabled, modèles, etc.) | Defaults, flags |
| `js/core/api.js` | Appels proxy, fallback modèles, streaming SSE, moteurs locaux (proxy→direct), providers opencode Zen/Go | Providers, erreurs API, catalogs dynamiques |
| `js/core/app.js` | Coeur SPA, orchestration, gestion erreurs, intégration SamAgent (routeModel, provenance, chips palier) | Fonctionnalités principales |
| `js/core/router.js` | **Routeur SamAgent** (pools, santé, rotation, fallback, IA locale, télémétrie) | Routage, pools, santé |
| `js/features/model-select.js` | **Factory `createModelSelect`** — custom select, onglets texte/image/recherche, pricing | Sélection modèle |
| `js/features/canvas.js` | **Factory `createCanvas`** — bouton canvas, snapshots, rewind | Canvas |
| `js/features/chat.js` | **Factory `createChat`** — messages, streaming, envoi, `_streamModelDispatch` (bascule outils si `window._activeToolset`) | Chat, streaming |
| `js/ui/prompt-toolbar.js` | **Factory `createPromptToolbar`** — toolbar enhance/insert/save, `effectiveSystemPrompt` | Toolbar prompt |
| `js/features/model-catalog.js` | Tarifs, fallback chaîne, prefs catalogue | Nouveau modèle, pricing |
| `js/features/conversations.js` | CRUD conversations, rendu messages | Structure conversation |
| `js/services/filemanager.js` | Sync serveur (PUT/GET conversations) | Sync multi-appareils |
| `js/integrations/web-search.js` | Toggle recherche web, bouton web-search | Recherche web |
| `js/integrations/tool-search.js` | **Outils web + Marexcode** — `MAREXCODE_TOOLS` (Ls/Read/Write/Edit/Grep/Bash/TodoWrite), `_execMarexcodeTool` (POST /api/exec), boucle agentic `streamModelWithTools` (extrait le system prompt de l'historique avant `buildBody` ; **tools injectés dans tous les providers** — openai/anthropic/google/opencode-go chat/messages/responses — priorité sur le fallback web_search ; itérations via `window._toolMaxIterations \|\| 3`) | Outils IA |
| `js/ui/plus-menu.js` | Menu "+": modèles, effort, websearch, **Compétences** (dont Marexcode via `applySkillPrompt`) | UI menu "+" |
| `js/services/auth.js` | Login, register, gestion JWT | Auth |
| `js/services/config-providers.js` | Config des providers (clés, URLs, onglets) | Nouveau provider, clé UI |
| `js/services/quotas.js` | Cartes quotas/solde providers (balance ou lien dashboard) | Providers à solde |
| `js/services/budget.js` | Suivi coûts, alertes budget | Tarification |
| `js/features/roles.js` | Rôles system prompt | Prompts système |
| `js/services/settings-sync.js` | Sync paramètres multi-appareils | Settings |
| `js/tests/router.test.mjs` | Tests SamAgent (`node --test`) | Règles de routage/classifieur |
| `js/tests/validate-pools.mjs` | Validateur pools ↔ catalogue (`node js/tests/validate-pools.mjs`) | Pools SamAgent |

---

## 5. Cartographie UI complète

> Chaque composant visuel de l'application, son ID HTML, le module JS qui le gère, et le fichier CSS concerné.

### 5.1 Layout global

```
┌─────────────────────────────────────────────────────────────────┐
│ [sidebar-toggle]  ┌──────────────────────────────────────────┐  │
│                   │              MAIN                         │  │
│  ┌──SIDEBAR──┐   │  ┌──CHAT CONTAINER──┐  ┌─SIDE PANEL──┐  │  │
│  │           │   │  │                  │  │  (réglages)  │  │  │
│  │           │   │  │  chat messages   │  │              │  │  │
│  │           │   │  │                  │  │              │  │  │
│  │           │   │  ├──────────────────┤  │              │  │  │
│  │           │   │  │  input area      │  │              │  │  │
│  │           │   │  └──────────────────┘  └──────────────┘  │  │
│  └───────────┘   └──────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

### 5.2 SIDEBAR (`<aside id="sidebar">`)

| Composant | ID/Button | Module JS | Rôle |
|-----------|-----------|-----------|------|
| Logo + titre | `.sidebar-title` | - | Branding Cetas v3.2 |
| Credit | `.sidebar-credit` | - | "By Marexsoft" |
| Dev modules | `.dev-modules` > `.dev-module-btn[data-module]` | `app.js` | Boutons Marexcode (**actif** → ouvre `/marexcode/`), Agent Code, Plugins, Compétences (toast "🚧 Développement") |
| Dev toast | `#dev-toast` | `app.js` | Notification "🚧 Développement" |
| **Nouvelle conversation** | `#new-chat-btn` | `app.js` | Réinitialise STATE, affiche placeholder |
| **Favoris** | `#fav-section` > `#fav-list` | `favorites.js` | Liste des modèles favoris (caché si vide) |
| **Catégories** | `#cat-select` > `.cat-select-label` | `categories.js` | Dropdown filtre par catégorie |
| Bouton gérer cats | `#cat-manage-btn` | `categories.js` | Ouvre modale gestion catégories |
| Dropdown cats | `#cat-select-dropdown` | `categories.js` | Liste déroulante des catégories |
| **Recherche conversations** | `#conv-search` | `conversations.js` | Filtre la liste des conversations |
| **Liste conversations** | `#conv-list` | `conversations.js` | Liste scrollable des conversations |
| **Avatar utilisateur** | `#user-avatar-btn` > `#user-avatar-initials` | `auth.js` | Initiales de l'utilisateur |
| **Menu utilisateur** | `#user-menu-dropdown` | `auth.js` | Dropdown: Rôles, Prompts, Sauvegardes, FAQ, Thème, Déconnexion |
| → Rôles | `#sidebar-roles-btn` | `roles.js` | Ouvre modale gestion rôles |
| → Prompts | `#sidebar-prompts-btn` | `prompts.js` | Ouvre modale gestion prompts |
| → Sauvegardes | `#dashboard-btn` | `export-import.js` | Ouvre modale sauvegarde/import |
| → FAQ | `#sidebar-faq-btn` | `faq.js` | Ouvre panel FAQ dans config (4 catégories, recherche, 34 items) |
| → Logs et événements | onglet `data-tab="logs"` | `logs-events.js` | Timeline + compteurs + analyse IA Mimo 2.5 |
| → Thème | `#theme-toggle` | `theme.js` | Bascule light/dark/auto (caché) |
| → Déconnexion | `#logout-btn` | `auth.js` | Déconnecte (caché si non loggé) |
| **Config (roue)** | `#apikeys-btn` | `config-providers.js` | Ouvre modale Configuration |
| **Supprimer tout** | `#clear-all-btn` | `conversations.js` | Supprime toutes les conversations (avec confirmation) |
| Import fichier | `#import-file-input` | `export-import.js` | Input fichier caché pour import |

### 5.3 MAIN — Zone Chat

| Composant | ID/Button | Module JS | Rôle |
|-----------|-----------|-----------|------|
| **Container chat** | `#chat-container` | `conversations.js` | Conteneur principal des messages |
| Placeholder vide | `#empty-chat-placeholder` | `conversations.js` | Logo + texte d'accueil |
| Catégorie placeholder | `#empty-chat-category` | `categories.js` | Affiche la catégorie active |
| **Alerte modèle** | `#model-alert` > `#model-alert-text` | `app.js` | "Veuillez choisir un modèle" |
| Fermer alerte | `#model-alert-close` | `app.js` | Ferme l'alerte |
| **Barre tokens** | `#token-bar` | `budget.js` | Affiche tokens/coût de la conversation |
| → Info tokens | `#token-info` | `budget.js` | Nombre de tokens |
| → Info coût | `#cost-info` | `budget.js` | Coût estimé |
| **Bouton export** | `#share-btn` | `export-md.js` | Menu export (caché si pas de conv) |
| Menu export | `#share-menu` | `export-md.js` | Options Markdown / HTML |
| → Export MD | `#share-menu-md` | `export-md.js` | Télécharge .md |
| → Export HTML | `#share-menu-html` | `export-md.js` | Télécharge .html |
| **Résumé IA** | `#summary-btn` | `app.js` | Résumé de conversation |

### 5.4 MAIN — Zone d'input

| Composant | ID/Button | Module JS | Rôle |
|-----------|-----------|-----------|------|
| **Zone input** | `.input-area` | `app.js` | Conteneur global |
| Aperçu pièces jointes | `#attach-preview` | `attachments.js` | Aperçu des fichiers joints |
| **Input row** | `.input-row` | `app.js` | Ligne principale: input + boutons |
| **Wrapper input** | `.input-wrapper` | `app.js` | Conteneur du textarea |
| Input fichier | `#file-input` | `attachments.js` | Input caché pour fichiers |
| Sélecteur modèle (caché) | `#model-select` | `model-catalog.js` | Sélecteur natif caché (compat) |
| **Contenu input** | `.input-content` | `app.js` | Zone principale (textarea + ligne 2) |
| **Textarea** | `#prompt-input` | `app.js` | Zone de saisie du message |
| **Ligne 2** | `.input-line-2` | `app.js` | Barre d'outils sous le textarea |

#### Ligne 2 — Gauche (`.input-line-2-left`)

| Bouton | ID | Module JS | Rôle |
|--------|----|-----------|------|
| **Plus (+)** | `#plus-menu-btn` | `plus-menu.js` | Ouvre le menu "+" (modèle, effort, websearch) |
| **Joindre** | `#attach-btn` | `attachments.js` | Attacher un fichier (caché par défaut) |
| **Recherche web** | `#web-search-btn` | `web-search.js` | Toggle recherche web (caché par défaut) |
| **Canvas** | `#canvas-toggle-btn` | `app.js` | Active le canvas pour la conversation |

#### Ligne 2 — Centre (`.input-line-2-center`)

| Bouton | ID | Module JS | Rôle |
|--------|----|-----------|------|
| **Insérer prompt** | `#toolbar-insert-btn` | `prompts.js` | Insère un prompt enregistré (caché) |
| **Améliorer prompt** | `#toolbar-enhance-btn` | `app.js` | Enrichit le prompt via IA (caché) |
| **Sauvegarder prompt** | `#toolbar-save-btn` | `prompts.js` | Enregistre le prompt (caché) |

#### Ligne 2 — Droite (`.input-line-2-right`)

| Bouton | ID | Module JS | Rôle |
|--------|----|-----------|------|
| **Envoyer mobile** | `#mobile-send-btn` | `app.js` | Envoie le message (mobile, caché desktop) |
| **Micro** | `#mic-btn` | `whisper.js` | Dictée vocale (STT) |

#### Boutons cachés (compatibilité JS)

| ID | Rôle |
|----|------|
| `#enhance-prompt-btn` | Ancien bouton amélioration (caché) |
| `#prompt-picker-btn` | Ancien bouton prompt (caché) |
| `#send-btn` | Ancien bouton envoyer (caché) |
| `#prompt-toolbar` | Ancienne toolbar (cachée) |

### 5.5 Menu "+" (`#plus-menu-dropdown`)

| Section | Composant | Module JS | Rôle |
|---------|-----------|-----------|------|
| **Fichiers** | `data-action="attach"` | `attachments.js` | "Ajouter des fichiers" |
| **Modèles** | `#plus-model-section` | `plus-menu.js` | Section sélection modèle |
| → Onglets | `#plus-model-tabs` > `.plus-model-tab[data-tab]` | `plus-menu.js` | Texte / Image / Recherche |
| → Liste | `#plus-model-list` | `plus-menu.js` | Liste des modèles disponibles |
| **Mode Réflexion** | `#plus-reflection-toggle` | `plus-menu.js` | Toggle raisonnement |
| **Effort** | `#plus-effort-pills` > `.plus-menu-pill[data-effort]` | `plus-menu.js` | Faible / Moyen / Max |
| **Compétences** | `#plus-menu-skills` | `plus-menu.js` | Compétences/skills |
| **Recherche web** | `#plus-websearch-toggle` | `web-search.js` | Toggle recherche web |
| → Profondeur | `#plus-websearch-depth` > `[data-depth]` | `web-search.js` | Standard / Approfondi |

### 5.6 Panneau latéral droit (Settings)

#### Toolbar (`#side-panel-toolbar`)

| Bouton | ID | Module JS | Rôle |
|--------|----|-----------|------|
| Réglages | `#side-toggle-settings` | `right-panel.js` | Ouvre/ferme le panneau |
| Canvas | `#side-toggle-canvas` | `app.js` | Ouvre le canvas |

#### Panneau (`<aside id="right-panel">`)

| Section | ID | Module JS | Rôle |
|---------|----|-----------|------|
| **Onglets** | `.rp-tab[data-rp-tab]` | `right-panel.js` | Général / Image |
| **Tab Général** | `#rp-tab-general` | `right-panel.js` | Paramètres texte |
| → Rôle (system prompt) | `#sp-select` + `#sp-textarea` | `roles.js` | Sélection/édition du rôle |
| → Actions rôle | `#rp-role-actions` > `#sp-edit-btn` | `roles.js` | Enregistrer les modifications |
| → Images à renvoyer | `#rp-max-history-images-range` | `right-panel.js` | Slider 0-12 (défaut: 4) |
| → Effort raisonnement | `#rp-effort-toggle` + `#rp-effort-select` | `right-panel.js` | Toggle + select (minimal→high) |
| → Température | `#rp-temperature-toggle` + `#rp-temperature-range` | `right-panel.js` | Slider 0-2 (défaut: 0.7) |
| → Top P | `#rp-top-p-toggle` + `#rp-top-p-range` | `right-panel.js` | Slider 0-1 (défaut: 1.0) |
| → Tokens max | `#rp-max-tokens-toggle` + `#rp-max-tokens-range` | `right-panel.js` | Slider 256-16384 (défaut: 4096) |
| → Pénalité fréquence | `#rp-freq-penalty-toggle` + range | `right-panel.js` | Slider 0-2 (défaut: 0) |
| → Pénalité présence | `#rp-presence-penalty-toggle` + range | `right-panel.js` | Slider 0-2 (défaut: 0) |
| → Top K (OR only) | `#rp-top-k-toggle` + range | `right-panel.js` | Slider 0-100 (caché par défaut) |
| → Min P (OR only) | `#rp-min-p-toggle` + range | `right-panel.js` | Slider 0-1 (caché par défaut) |
| → Top A (OR only) | `#rp-top-a-toggle` + range | `right-panel.js` | Slider 0-1 (caché par défaut) |
| → Répétition (OR only) | `#rp-rep-penalty-toggle` + range | `right-panel.js` | Slider 1-2 (caché par défaut) |
| → Seed (OR only) | `#rp-seed-toggle` + input | `right-panel.js` | Input number (caché par défaut) |
| → Reset params | `#rp-params-reset-btn` | `right-panel.js` | Réinitialise tous les paramètres |
| **Tab Image** | `#rp-tab-image` | `right-panel.js` | Paramètres génération image |
| → Format image | `.image-format-btn[data-format]` | `right-panel.js` | Carré / Portrait / Paysage |
| → Ratio Gemini | `#rp-gemini-ratio-select` | `right-panel.js` | Ratio précis (Google/OpenRouter) |
| → Qualité (OpenAI) | `#rp-quality-select` | `right-panel.js` | Auto/Low/Medium/High |
| → Nb images (OpenAI) | `#rp-openai-n-range` | `right-panel.js` | Slider 1-4 |
| → Fond (OpenAI) | `#rp-openai-background-select` | `right-panel.js` | Auto/Opaque/Transparent |
| → Format sortie (OpenAI) | `#rp-openai-format-select` | `right-panel.js` | PNG/JPEG/WebP |
| → Compression (OpenAI) | `#rp-openai-compression-range` | `right-panel.js` | Slider 0-100 |
| → Modération (OpenAI) | `#rp-openai-moderation-select` | `right-panel.js` | Auto/Low |
| → Taille (Google) | `#rp-gemini-size-select` | `right-panel.js` | 1K/2K/4K |
| → Raisonnement (Google) | `#rp-gemini-thinking-select` | `right-panel.js` | Minimal/High |
| → Seed image (OR) | `#rp-img-seed-toggle` + input | `right-panel.js` | Input number (caché) |
| → Reset image | `#rp-image-params-reset-btn` | `right-panel.js` | Réinitialise paramètres image |

### 5.7 Modales

#### Modale Rôle (`#sp-modal-overlay`)

| Composant | ID | Module JS | Rôle |
|-----------|----|-----------|------|
| Titre | `#sp-modal-title` | `roles.js` | "Nouveau rôle" / "Modifier le rôle" |
| Nom | `#sp-modal-nom` | `roles.js` | Input nom du rôle |
| Contenu | `#sp-modal-contenu` | `roles.js` | Textarea du prompt système |
| Améliorer IA | `#sp-modal-optimize` | `roles.js` | Enrichit le rôle via IA |
| Supprimer | `#sp-modal-delete` | `roles.js` | Supprime le rôle (caché si nouveau) |
| Retour | `#sp-modal-cancel` | `roles.js` | Ferme la modale |
| Enregistrer | `#sp-modal-save` | `roles.js` | Sauvegarde le rôle |

#### Modale Prompt (`#pr-modal-overlay`)

| Composant | ID | Module JS | Rôle |
|-----------|----|-----------|------|
| Titre | `#pr-modal-title` | `prompts.js` | "Nouveau Prompt" |
| Nom | `#pr-modal-nom` | `prompts.js` | Input nom du prompt |
| Contenu | `#pr-modal-contenu` | `prompts.js` | Textarea du prompt |
| Améliorer IA | `#pr-modal-enhance` | `prompts.js` | Enrichit via IA |
| Supprimer | `#pr-modal-delete` | `prompts.js` | Supprime (caché si nouveau) |
| Retour | `#pr-modal-cancel` | `prompts.js` | Ferme |
| Enregistrer | `#pr-modal-save` | `prompts.js` | Sauvegarde |

#### Modale Configuration (`#apikeys-modal-overlay`)

| Onglet | data-tab | Module JS | Contenu |
|--------|----------|-----------|---------|
| **API et Modèles** | `apimodeles` | `config-providers.js` | Clés API par provider, toggle modèles |
| **Fonctionnalités** | `models` | `config-providers.js` | TTS, STT, Amélioration, Résumé, Titre, Erreur |
| **Budget** | `budget` | `budget.js` | Suivi dépenses (période, montant max) |
| **Quotas** | `quotas` | `quotas.js` | Crédits restants providers |
| **Apparence** | `appearance` | `theme.js` | Thème Clair/Sombre/Auto |
| **Stockage** | `stockage` | `settings-sync.js` | Gestion espace conversations/médias |
| **Utilisateurs** | `users` | `user-management.js` | CRUD utilisateurs (admin only) |
| **Conversation** | `conversation` | `right-panel.js` | Réglages conversation (migré depuis sidebar) |
| **FAQ** | `faq` | `faq.js` | Questions fréquentes |
| **Statistiques** | `statistiques` | `budget.js` | Dashboard (périodes, conv, modèles, éditeurs, catégories) |
| **Partager** | `share` | - | Lien de partage Cetas |

##### Panel API et Modèles — Détails

| Composant | ID | Module JS | Rôle |
|-----------|----|-----------|------|
| Tabs providers | `#providers-tabs` | `config-providers.js` | Onglets par provider |
| Contenu provider | `#provider-content` | `config-providers.js` | Input clé API + toggle modèles |
| Sauvegarder | `#apimodeles-save-btn` | `config-providers.js` | Sauvegarde les changements |
| Annuler | `#apimodeles-cancel-btn` | `config-providers.js` | Annule |

##### Panel Fonctionnalités — Détails

| Composant | ID | Module JS | Rôle |
|-----------|----|-----------|------|
| TTS provider | `#audio-tts-provider` | `config-providers.js` | Select: synthèse vocale |
| STT provider | `#audio-stt-provider` | `config-providers.js` | Select: transcription |
| Enhance provider | `#enhance-provider` | `config-providers.js` | Select: amélioration prompts |
| Summary model | `#summary-model` | `config-providers.js` | Select: résumé IA |
| Title model | `#title-model` | `config-providers.js` | Select: génération titre |
| Error explainer | `#error-explainer-model` | `config-providers.js` | Select: analyse erreurs |
| Local fallback | `#local-fallback-model` | `config-providers.js` | Select: fallback modèle local |

##### Panel Budget — Détails

| Composant | ID | Module JS | Rôle |
|-----------|----|-----------|------|
| Toggle activer | `#budget-enabled` | `budget.js` | Activer/désactiver suivi |
| Période | `#budget-period` | `budget.js` | Jour/Semaine/Mois |
| Montant max | `#budget-amount` | `budget.js` | Input montant ($) |
| Barre progression | `#budget-fill` | `budget.js` | Visualisation consommation |
| Texte progression | `#budget-text` | `budget.js` | Montant consommé / total |

##### Panel Stockage — Détails

| Composant | ID | Module JS | Rôle |
|-----------|----|-----------|------|
| Vue accueil | `#storage-home` | `settings-sync.js` | Total + barre + actions |
| Conversations | `data-storage-action="conversations"` | `settings-sync.js` | Liste conversations |
| Médias | `data-storage-action="medias"` | `settings-sync.js` | Liste médias |
| Recherche | `#storage-search` | `settings-sync.js` | Filtre par titre/contenu |
| Tri | `#storage-sort` | `settings-sync.js` | Date/ taille (asc/desc) |
| Tout sélectionner | `#storage-select-all` | `settings-sync.js` | Checkbox globale |
| Télécharger | `#storage-download-btn` | `settings-sync.js` | Export ZIP sélection |
| Supprimer | `#storage-delete-btn` | `settings-sync.js` | Supprime sélection |

#### Modale Catégories (`#cat-modal-overlay`)

| Composant | ID | Module JS | Rôle |
|-----------|----|-----------|------|
| Liste cats | `#cat-manage-list` | `categories.js` | Liste des catégories |
| Ajouter | `#cat-manage-add-btn` | `categories.js` | Nouvelle catégorie |
| Emoji | `#cat-modal-icone-btn` + `#emoji-picker` | `emoji-picker.js` | Sélecteur emoji |
| Nom | `#cat-modal-nom` | `categories.js` | Input nom |
| Couleur | `#cat-color-grid` | `categories.js` | Grille de couleurs |
| Supprimer | `#cat-modal-delete` | `categories.js` | Supprime (caché si nouveau) |

#### Modale Sauvegarde (`#save-modal-overlay`)

| Composant | ID | Module JS | Rôle |
|-----------|----|-----------|------|
| Inclure clés | `#save-modal-include-keys` | `export-import.js` | Checkbox inclure clés API |
| Exporter | `#save-modal-export-btn` | `export-import.js` | Télécharge backup .json |
| Importer | `#save-modal-import-btn` | `export-import.js` | Importe backup .json |

#### Modale Rôles (`#roles-manage-overlay`)

| Composant | ID | Module JS | Rôle |
|-----------|----|-----------|------|
| Liste | `#roles-manage-list` | `roles.js` | Liste des rôles |
| Ajouter | `#roles-manage-add` | `roles.js` | Nouveau rôle |
| Importer | `#roles-manage-import` | `roles.js` | Import JSON |

#### Modale Prompts (`#prompts-manage-overlay`)

| Composant | ID | Module JS | Rôle |
|-----------|----|-----------|------|
| Liste | `#prompts-manage-list` | `prompts.js` | Liste des prompts |
| Ajouter | `#prompts-manage-add` | `prompts.js` | Nouveau prompt |
| Importer | `#prompts-manage-import` | `prompts.js` | Import JSON |

#### Modale Effacer tout (`#clear-all-overlay`)

| Composant | ID | Module JS | Rôle |
|-----------|----|-----------|------|
| Code confirmation | `#clear-all-code` | `conversations.js` | Code à 6 caractères |
| Input code | `#clear-all-code-input` | `conversations.js` | Saisie du code |
| Confirmer | `#clear-all-confirm` | `conversations.js` | Supprime tout |
| Annuler | `#clear-all-cancel` | `conversations.js` | Ferme |

#### Modale Custom Dialog (`#custom-dialog-overlay`)

| Composant | ID | Module JS | Rôle |
|-----------|----|-----------|------|
| Icône | `#custom-dialog-icon` | `app.js` | Icône du dialogue |
| Message | `#custom-dialog-message` | `app.js` | Texte |
| Annuler | `#custom-dialog-cancel` | `app.js` | Bouton annuler |
| OK | `#custom-dialog-ok` | `app.js` | Bouton confirmer |

### 5.7a Settings Marexcode (`static/marexcode/components/settings.html`)

> Panel de settings Marexcode (accessible via menu utilisateur → Paramètres).
> 7 panneaux : Profil, Raccourcis, Sessions, Général, Comportement, Skills, Instructions.

#### Panneau Profil (`data-content="profil"`)

| Composant | ID | Module JS | Rôle |
|-----------|----|-----------|------|
| Avatar initiales | `#profile-avatar` | `profile.js` | Initiales de l'utilisateur |
| Nom utilisateur | `#profile-username` | `profile.js` | Affichage nom |
| Total tokens | `#stat-tokens` | `profile.js` | Nombre total de tokens utilisés |
| Total chats | `#stat-chats` | `profile.js` | Nombre total de conversations |
| Série active | `#stat-streak` | `profile.js` | Jours consécutifs d'utilisation |
| Modèle favori | `#stat-model` | `profile.js` | Modèle le plus utilisé |
| Heatmap | `#profile-heatmap` | `profile.js` | Canvas 30 jours d'activité |
| Top skills | `#profile-top-skills` | `profile.js` | 5 skills auto les plus utilisés |

#### Panneau Général (`data-content="general"`)

| Composant | ID | Module JS | Rôle |
|-----------|----|-----------|------|
| Police de discussion | `#gen-font-size` | `app.js` | Taille du texte chat (12/14/16px) |
| Réduire animations | `#gen-reduce-motion` | `app.js` | Toggle animations désactivées |
| Auto-autoriser workspace | `#gen-auto-allow` | `app.js` | Read/Write/Edit sans confirmation |
| Éditeur texte brut | `#gen-plain-text` | `app.js` | Toggle texte brut |
| Tokens visibles | `#gen-show-tokens` | `app.js` | Afficher compteur tokens |
| Mode envoi | `#gen-send-mode` | `app.js` | Entrée envoie / Ctrl+Entrée |
| Instructions globales | `#gen-global-instructions` | `app.js` | Textarea instructions |
| Licences | `#gen-licenses` | `app.js` | Modale licences open source |

#### Panneau Comportement (`data-content="comportement"`)

| Composant | ID | Module JS | Rôle |
|-----------|----|-----------|------|
| File d'attente | `#gen-message-queue` | `app.js` | Toggle file d'attente messages |
| Bash permission | `#gen-perm-bash` | `app.js` | Autoriser/Demander/Bloquer |
| Write permission | `#gen-perm-write` | `app.js` | Autoriser/Demander/Bloquer |
| Edit permission | `#gen-perm-edit` | `app.js` | Autoriser/Demander/Bloquer |
| Sandbox strict | `#gen-sandbox-strict` | `app.js` | Toggle workspace-only |
| Recherche web | `#gen-web-search` | `app.js` | Toggle SearXNG |
| Mode sortie | `#gen-output-mode` | `app.js` | Verbeux/Compressé |
| Raisonnement | `#gen-thinking-mode` | `app.js` | Tout/Résumé/Masqué |

#### Panneau Skills (`data-content="skills"`)

| Composant | ID | Module JS | Rôle |
|-----------|----|-----------|------|
| Liste skills | `#skills-list` | `app.js` | Toggle + mode par skill |

#### Panneau Instructions (`data-content="instructions"`)

| Composant | ID | Module JS | Rôle |
|-----------|----|-----------|------|
| Instructions globales | `#global-instructions-textarea` | `app.js` | Textarea instructions globales |
| Mémoire locale | toggle + bouton | `app.js` | Active/génère/supprime mémoire |
| Mémoire depuis outils | `#gen-memory-capture` | `app.js` | Toggle capture patterns |

### 5.8 Overlays

| Overlay | ID | Module JS | Rôle |
|---------|----|-----------|------|
| Alerte budget | `#budget-alert-overlay` | `budget.js` | Alerte depassement budget |
| Alerte pas de modèle | `#no-model-alert-overlay` | `app.js` | Alerte modèle manquant |
| Lightbox image | `#lightbox-overlay` | `lightbox.js` | Zoom image plein écran |
| Visionneuse fichier | `#file-viewer-overlay` | `lightbox.js` | Aperçu fichier |

### 5.9 Splash / Loading

| Composant | ID | Module JS | Rôle |
|-----------|----|-----------|------|
| Splash | `#kiro-splash` | `app.js` (inline) | Écran de bienvenue animé |
| Logo splash | `.kiro-splash-logo` | - | Logo animé |
| Texte splash | `.kiro-splash-text` | - | "Bienvenue sur Cetas !" |
| Spinner | `.kiro-splash-spinner` | - | Spinner si >2.5s |

### 5.10 Mapping rapide: "Je veux modifier X"

| Je veux modifier... | Fichier JS | Fichier CSS | ID/Clé HTML |
|---------------------|------------|-------------|-------------|
| Bulle message utilisateur | `conversations.js` | `chat.css` | `.message-user` |
| Bulle message assistant | `conversations.js` | `chat.css` | `.message-assistant` |
| Streaming texte | `api.js` | `chat.css` | `.streaming-text` |
| Bloc raisonnement (thinking) | `api.js` | `chat.css` | `.thinking-block` |
| Sélecteur modèle (dropdown) | `model-catalog.js` | `catalog.css` | `#plus-model-list` |
| Bouton envoyer | `app.js` | `components.css` | `#send-btn` / `#mobile-send-btn` |
| Zone de saisie | `app.js` | `layout.css` | `#prompt-input` |
| Sidebar | `app.js` | `layout.css` | `#sidebar` |
| Barre de recherche conv | `conversations.js` | `layout.css` | `#conv-search` |
| Liste des conversations | `conversations.js` | `layout.css` | `#conv-list` |
| Menu utilisateur dropdown | `auth.js` | `menu.css` | `#user-menu-dropdown` |
| Modale config (onglets) | `config-providers.js` | `components.css` | `.apikeys-tabs` |
| Toggle thème | `theme.js` | `components.css` | `.theme-toggle` |
| Barre de budget | `budget.js` | `storage.css` | `#token-bar` |
| Alerte budget | `budget.js` | `components.css` | `#budget-alert-overlay` |
| Panneau réglages | `right-panel.js` | `layout.css` | `#right-panel` |
| Bouton micro | `whisper.js` | `components.css` | `#mic-btn` |
| Input + toolbar | `app.js` | `layout.css` | `.input-area` |
| Emoji picker | `emoji-picker.js` | `components.css` | `#emoji-picker` |
| Lightbox | `lightbox.js` | `components.css` | `#lightbox-overlay` |
| Catégories (barre) | `categories.js` | `menu.css` | `#cat-select` |
| Canvas | `app.js` | `canvas.css` | `#side-toggle-canvas` |

---

## 6. CSS — Feuilles de style

**Build**: `style.css` est généré par concatenation:
```
variables.css + layout.css + chat.css + marexcode.css + components.css + canvas.css + catalog.css + storage.css + menu.css
→ minifié → style.css
```

**Thème**: `ocean.css` (séparé, thème océan)

| Fichier | Rôle |
|---------|------|
| `variables.css` | Variables CSS (couleurs, tailles, breakpoints) |
| `layout.css` | Mise en page sidebar/chat/input |
| `chat.css` | Bulles messages, streaming, markdown |
| `marexcode.css` | Module Marexcode — vue plein écran (legacy SPA) |
| `components.css` | Boutons, modals, inputs, toggle |
| `canvas.css` | Éditeur, canvas, images |
| `catalog.css` | Catalogue modèles, select personnalisé |
| `storage.css` | Sync, stockage, budget |
| `menu.css` | Menus contextuels, dropdowns |
| `ocean.css` | Thème océan (animations, couleurs) |

> **Page standalone Marexcode** : `static/marexcode/css/marexcode.css` est **séparé** —
> il n'entre pas dans la concaténation `style.css` (chargé uniquement par `/marexcode/index.html`).
> Classes dédiées ajoutées : `.chat-tool-block` (bloc outil collapsible, badge `tool-badge-bash`
> jaune, diff `diff-add`/`diff-del`), `.chat-todo-block` (todo live : `todo-pending`,
> `todo-in-progress` avec pulse, `todo-completed` barré), `.chat-status-line` (action + modèle),
> `.cdrop-delete-btn` (suppression projet). **Permissions P3** : `.tool-perms`, `.tool-perm-row`,
> `.tool-perm-select` (grille 6 outils allow/ask/deny). **Responsive** : `.composer{width:100%;max-width:620px}`
> (fix footer coupé sur mobile), side-panel en **bottom sheet** (<1024px), media queries
> 600/400px touch-friendly (min-height 44px), safe-area iPhone (`env(safe-area-inset-*)`).
> **Login** : `.login-footer`, `.login-forgot` (lien "Mot de passe oublié ?").

---

## 7. Modèles IA — Catalogue

### Fichier: `models.js`

Structure: `MODELS_DATA` avec 5 catégories:

| Catégorie | Clé | Usage |
|-----------|-----|-------|
| Texte | `MODELS_DATA.text[]` | Chat, code, raisonnement |
| Image | `MODELS_DATA.image[]` | Génération d'images |
| Recherche | `MODELS_DATA.search[]` | Recherche web (Perplexity) |
| TTS | `MODELS_DATA.tts[]` | Synthèse vocale |
| STT | `MODELS_DATA.stt[]` | Transcription vocale |

### Champs d'un modèle texte

```javascript
{
  id: "gpt-5.6-sol",           // ID technique (API)
  label: "GPT-5.6 Sol",        // Affichage
  editeur: "openai",            // Provider
  inputPer1M: 5,                // Prix input $/1M tokens
  outputPer1M: 30,              // Prix output $/1M tokens
  description: "...",           // Description
  endpoint: "responses",        // (opencode) type endpoint
  ocBase: "v1",                 // (opencode) base path
}
```

### Providers et modèles (catalogue texte)

| Provider | nb | Exemples |
|----------|-----|----------|
| openai | 9 | GPT-5.6 Sol/Terra/Luna, GPT-5.5, GPT-4.1, Mini, Nano |
| anthropic | 7 | Claude Fable 5, Opus 4.8, Sonnet 5, Haiku 4.5 |
| google | 9 | Gemini 3.6 Flash, 3.5 Flash, 3.5 Flash-Lite, 3 Flash, 3.1 Flash-Lite, 2.5 Flash, 2.5 Flash-Lite, Gemma 4 31B/26B |
| deepseek | 3 | V3.2, V4 Pro, V4 Flash |
| grok | 4 | 4.5, 4.3, 4.20, 4.1 Fast |
| mistral | 4 | Medium 3.5, Large 3, Small 4, Ministral 8B |
| groq | 6 | GPT-OSS 20B/120B, Llama 4 Scout, Qwen 3 32B |
| nvidia | 13 | Nemotron 3, GLM-5.2, MiniMax M3, Kimi K2.6 |
| zai | 5 | GLM-5.2, GLM-5 Turbo, GLM-5.1, GLM-5 |
| opencode (Zen) | 12 | GPT 5.6 Luna, GLM 5, Qwen3.7 Plus, MiniMax M3, MiMo Free, Big Pickle… |
| opencode-go (Go) | 8 | GLM-5.3 Flash, LongCat 2.0, MiMo V2.5, MiniMax M3, Hy3… |
| openrouter | 28 | Qwen3.7 Flash, Laguna S 2.1, Hy3, MiMo-V2.5-Pro, LongCat 2.0, Claude Sonnet 4.5, Gemini 2.5 Flash, Codestral, Llama 4 Maverick… (tool calling ≥256k, coding) |
| llamacpp | 1 | Qwen3.5 4B (local, via moteur) |
| samagent | 5 | Nano, N4 Flash, N4, N8, Local (routeur) |

> Image (google) : Nano Banana 2 / 2 Lite (le **Pro a été retiré** du catalogue) ; OpenAI : GPT Image 2 / 1.5 / 1 Mini.
> Les modèles Gemini 3.1 Pro et 2.5 Pro ont été retirés du catalogue (seuls `lite` et `flash` sont conservés).

### SamAgent (Routeur intelligent)

| Modèle virtuel | Tier | Providers utilisés | Usage type |
|----------------|------|--------------------|-----------|
| samagent-nano | `nano` | Groq + Google | Requêtes simples, salutations — ultra-rapide |
| samagent-n4-flash | `n4-flash` | OpenRouter `:free` + opencode gratuit (zen) | Standard rapide, gratuit |
| samagent-n4 | `n4` | OpenRouter payants + Mistral | Standard payant |
| samagent-n8 | `n8` | OpenRouter + DeepSeek + Mistral + opencode | Codage, raisonnement avancé |
| samagent-local | `local` | Moteurs locaux (llama.cpp / Ollama / LM Studio) | IA locale, pool découvert dynamiquement |

> **Le palier est choisi par l'utilisateur** (le modèle sélectionné dans le menu « + ») : il n'est PAS déduit du
> score. Le score de complexité (heuristique 0-100) ne sert qu'à (a) activer le mini-LLM de sélection
> quand `score > 70`, et (b) abaisser `reasoning_effort` quand `score < 15`.

#### Architecture & garanties (volet « Premium »)

- **Pools tier × intention** (`chat` / `coder` / `raisonnement`), détectés par `classifyIntent`
  (accents insensibles : « ecris » → coder). Chaque requête pioche un modèle du pool du tier choisi.
- **Mini-LLM de sélection** (score > 70) : DeepSeek + Google en parallèle (`Promise.any`), le perdant
  est **annulé** dès le 1er succès ; décisions mises en cache (TTL 60 s).
- **Santé (health-awareness)** : EWMA succès/échec + latence par modèle (localStorage
  `cetas-samagent-stats`) → tirage **pondéré par la santé** ; cooldown 60 s après échec ;
  circuit-breaker après 3 échecs consécutifs. Sans stats : **rotation déterministe** par tier+intention.
- **Fallback 3 niveaux** multi-fournisseurs (plus jamais 2× DeepSeek) : chaque maillon est un provider
  différent (OR → DeepSeek → Mistral → opencode ; nano : Groq ↔ Google).
- **Provenance** : le message assistant stocke `tier`, `routedBy`, `label`, `intent`, `score`
  (badge « SamAgent N8 [OR] → … » affiché en session).
- **Chips de palier** : sous la réponse, « Relancer sur un autre palier » (⚡ Nano / 🚀 N4 / 🧠 N8)
  rejoue le dernier message avec le tier choisi.
- **Télémétrie locale** : ring buffer 50 routes (`cetas-samagent-traces`), aucun envoi réseau.
  Console : `dumpRouteStats()` (tableaux traces + agrégat par modèle).
- **IA Locale (SamGen)** : moteurs OpenAI-compat découverts via `/v1/models` (proxy), pool 100 %
  dynamique (aucun id en dur) → **changer de moteur/modèle = changer l'URL, zéro edit de code**.
  Moteur down → retiré automatiquement ; tout down → repli cloud (deepseek) avec label.
- **Robustesse** : garde `typeof routeModel`, abort de bout en bout (stop utilisateur), reset d'état
  (`_routerForceThinking`), route jamais nulle.

#### Vérification (qualité)

```bash
node --test static/tests/router.test.mjs      # SamAgent (classifieur, score, pools, fallback, santé, télémétrie, local, abort)
node static/tests/validate-pools.mjs          # pools ↔ static/js/data/models.js (exit 1 si écart)
node --test static/tests/static-paths.test.mjs # chemins statiques (index + partials)
node --test static/tests/html-css-structure.test.mjs  # HTML div-balance + CSS brace-balance (29 tests)
node --test static/tests/faq-structure.test.mjs        # Structure données FAQ (9 tests)
node --test static/tests/logs-events.test.mjs          # Logs & Events module (6 tests)
# Observabilité en navigateur (console) :
dumpRouteStats()
```

#### Configuration des moteurs locaux (`.env.docker`, lignes commentées)

```bash
#CETAS_OLLAMA_URL=http://127.0.0.1:11434
#CETAS_LMSTUDIO_URL=http://127.0.0.1:1234
# llamacpp déjà actif : CETAS_LLAMACPP_URL (10.10.10.102:8080)
```

### Marexcode — Assistant de codage

Marexcode existe sous deux formes :

1. **Compétence** dans le menu « + » → Compétences → **"Marexcode — Assistant Code"** —
   l'IA agit directement dans le chat courant (comme Codex/Zcode) avec des outils
   exécutés côté serveur.
2. **Module standalone** — bouton sidebar **Marexcode** (actif) ouvre **`/marexcode/`** :
   page `static/marexcode/` refactorée (SSI + ES modules), UI dédiée (sidebar sessions
   + workspace tree, composer, sélecteur modèle 4 providers, chat streaming +
   raisonnement + tool calls + markdown + stop).

| Élément | Détail |
|---------|--------|
| Frontend (compétence) | `js/ui/plus-menu.js` (entrée COMPETENCES, `applySkillPrompt` → `window._activeToolset`) |
| Frontend (module) | `static/marexcode/` (index SSI + components + js modules), `static/js/features/marexcode.js` (legacy SPA, non ouverte) |
| Globals CETAS réutilisés | `js/data/models.js`, `js/services/auth.js`, `js/core/api.js`, `js/integrations/tool-search.js` (chargés par `marexcode/index.html`) |
| Modules Marexcode | `js/app.js` (boot + `loadModels()`), `js/api.js`, `js/chat.js`, `js/model-select.js`, `js/marex-permission.js`, `js/router.js`, `js/skills.js` |
| Outils | `js/integrations/tool-search.js` → `MAREXCODE_TOOLS` (Ls/Read/Write/Edit/Grep/Bash/TodoWrite) + `_execMarexcodeTool` |
| Boucle agentic | `streamModelWithTools` (CETAS, itérations limitées à `window._toolMaxIterations \|\| 3` — Valeur Marexcode = **5**) — auth JWT via `proxyHeaders` |
| Backend | `server/marexcode.py` (mixin `MarexcodeMixin` hérité par `ProxyHandler`) → `POST /api/exec` (sandbox) + `/api/marexcode/*` (tree, sessions, project, upload) |
| Tests | `server/tests/test_exec.py`, `server/tests/test_marexcode.py`, `static/js/tests/marexcode-structure.test.mjs` |

**Utilisation (module) :** bouton sidebar Marexcode → `/marexcode/` → choisir le modèle
(OpenCode Go / Zen, DeepSeek, OpenRouter) → décrire la tâche de code.

**Nouveautés de la session (alignement OpenCode) :**
- **Outil `Ls`** : arborescence complète du workspace actif (branché sur `_marex_tree`, lecture pure
  autorisée en mode « Read only » — `marex-permission.js`).
- **Outil `TodoWrite`** : planification multi-étapes, **virtuel côté client** (CustomEvent
  `marexcode-todo`, pas de `/api/exec`). Le prompt système impose : TodoWrite au début du plan puis
  rappels après chaque étape (pending → in_progress → completed).
- **Sorties enrichies** : Read paginé (`offset/limit`), Write (`existed`), Edit (diff unifié +
  additions/deletions), Bash (`timeout` configurable, défaut 10s max 60s), Grep (`limit`,
  ignore binaires/`__pycache__`/`.git`).
- **Rendu chat** : blocs d'outils **collapsibles dans le fil de chat** (`.chat-tool-block`),
  badge Bash jaune, **diff vert/rouge** pour Write/Edit ; **todo-list live** (`.chat-todo-block`) ;
  **ligne de statut** en bas (`.chat-status-line` : action en cours + modèle) ; panneau droit =
  raisonnement seul ; **Markdown rendu dans tous les chemins** (onDone/onError/stop/catch).
- **Garde-fou boucle** : `_toolMaxIterations = 5` (`static/js/features/marexcode.js`) + prompt
  adouci (suppression des TOUJOURS/JAMAIS qui poussaient le modèle à relancer Ls/Read en boucle).
- **Responsive mobile** : `.composer` passe en `width:100%;max-width:620px` (corrige le footer
  coupé : sélecteur modèle / bouton + / envoi invisibles sur portable), **side-panel en bottom
  sheet** (<1024px), media queries 600/400px touch-friendly, safe-area iPhone. Cache statique
  nginx repassé en **no-cache** (le cache 30j `immutable` gelait un JS périmé sur mobile → 401
  opencode-go car routé vers le worker Cloudflare).
- **Gestion projet** : `GET/PUT/DELETE /api/marexcode/project` + `POST /api/marexcode/upload`.
  Suppression du « Projet importé » (bascule auto sur « Marexcode (serveur) »), upload multipart
  (limites `CETAS_UPLOAD_MAX_BYTES` 150 Mo / `CETAS_UPLOAD_MAX_FILES` 1000).

- **Nettoyage** : logs de debug temporaires retirés (`[tool-loop]`, `[MAREXCODE DEBUG]`, `log.debug exec_read`).

**Nouveautés du jour (session 8 sept 2026) :**

- **Multi-workspaces** : chaque upload crée un workspace séparé dans `workspaces/<id>/`. Activation
  via sidebar "Ma création". Chaque workspace a ses propres instructions (MAREXCODE.md).
- **Skills system** : 54 skills OpenCode (`.opencode/skills/`) avec modes auto/manual/on_demand.
  Les skills auto sont injectés dans le system prompt. Gérés via Settings → Skills.
- **Profile/stats** : page profil avec token counts, chats, série active, top model, heatmap 30 jours,
  top 5 skills. Stats calculées depuis les sessions Marexcode.
- **Memory system** : mémoire locale persistante (`memory.md`), toggle activation/capture, injection
  dans le system prompt. Settings → Instructions.
- **Instructions** : instructions globales + par projet (MAREXCODE.md). Modale custom pour édition.
- **Settings panels** : Général (préférences, autorisations, éditeur, raccourci envoi, instructions),
  Comportement (file d'attente, approbation, sandbox, recherche web, détail, raisonnement),
  Skills (54 skills auto/manual/on_demand), Instructions (globales + mémoire).
- **Token counter** : compteur "~N tokens" au-dessus du textarea, mis à jour à chaque message.
- **Thinking mode** : toggle Afficher tout/Résumé/Masqué pour le panneau raisonnement.
- **Activity tracking** : chaque envoi de message track l'activité (heatmap quotidiennne).
- **File d'attente messages** : toggle pour mettre les suivis en file pendant le streaming.
- **Mode sortie** : Verbeux/Compressé (injecte instruction caveman dans le system prompt).
- **Raccourci d'envoi** : Entrée envoie / Ctrl+Entrée envoie (configurable).
- **File icons** : icônes colorées par extension (🐍 py, JS jaune, TS bleu, {} json, ⚙ yml, etc.).
- **Compact step lines** : outils affichés en lignes compactes (→ Read, ✎ Edit, ▪ Bash, ∗ Grep).
- **Thought timer** : chronomètre en live pendant le raisonnement (ms).
- **System prompt amélioré** : règles 11-12 (pagination Read, pas de copie intégrale), en anglais.
- **Upload** : limites portées à 150 Mo / 1000 fichiers.
- **Plan intégration OpenCode** : `Docs/TAF/plan-integration-opencode-complete.md` — 10 phases
  (Glob, LSP, MCP, Custom Tools, Formatters, Undo/Redo, Share, Multi-session, Images, Commands).

**Phases 1-6 implémentées (9 sept 2026) :**

- **Phase 1 — Glob tool** : `server/marexcode.py` → `_exec_glob(pattern)` (`fnmatch` + `os.walk`).
  Frontend : tool `Glob` dans `MAREXCODE_TOOLS` (icône `◎`). Read amélioré : erreur suggère Glob.
  Grep amélioré : support glob patterns dans `path`.
- **Phase 2 — LSP Servers** : `server/lsp.py` — `LSPManager` + `LSPServer` (JSON-RPC over stdio).
  6 serveurs : pyright, typescript-language-server, bash-language-server, vscode-html/css/json-language-server.
  Endpoints : `POST /api/lsp/{operation}` (definition, references, hover, symbol).
  File viewer : lignes numérotées + hover tooltips LSP. Singleton par workspace.
  Dockerfile : `pyright`, `typescript@5`, `bash-language-server`, `vscode-langservers-extracted`.
- **Phase 3 — MCP Servers** : `server/mcp.py` — `MCPManager` + `MCPServerConnection` (stdio + HTTP/SSE).
  Event loop persistant (background thread). 4 serveurs actifs : context7 (2 tools), fetch (1 tool),
  memory (9 tools), filesystem (14 tools) = **26 tools MCP**. Config via `mcp.json` dans le workspace.
  Injection dynamique dans `MAREXCODE_TOOLS` au boot (`loadMcpTools()`). System prompt : règle 13.
  Dockerfile : `pip3 install mcp mcp-server-fetch httpx2`.
- **Phase 4 — Custom Tools** : `server/marexcode.py` → `_exec_custom_tool()`. Config via `tools.json`.
  Auto-extraction des `{params}` pour le schema LLM. Endpoints : GET/PUT `/api/marexcode/custom-tools`,
  POST `/api/marexcode/custom-tools/{name}`. Injection `custom_*` au boot (`loadCustomTools()`).
  System prompt : règle 14. Icône `⚙`.
- **Phase 5 — Formatters** : Auto-format après Write/Edit. Hook dans `_exec_tool`.
  `.py` → ruff, `.js/.ts/.jsx/.tsx/.json/.css/.html/.md` → prettier. Non-bloquant, silencieux.
  Dockerfile : `pip3 install ruff`, `npm install -g prettier`.
- **Phase 6 — Undo/Redo** : Journal `undo_log.json` (max 50 entries). Hooks dans `_exec_write`/`_exec_edit`.
  Endpoints : POST undo/redo, GET undo-log. Boutons ↩ ↪ dans composer footer.
  Raccourcis : Ctrl+Z (undo), Ctrl+Shift+Z / Ctrl+Y (redo). Auto-refresh après Write/Edit.
  System prompt : règle 13 (MCP) + 14 (Custom Tools).
- **Phase 9 — Image Support** : Drag & drop + Ctrl+V paste d'images dans le textarea.
  Preview avec bouton ✕. `send()` construit un content array `[{type:"text"}, {type:"image", data, mimeType}]`.
  `addMsg()` rend les images avec `.message-images`. Pas de backend — inline base64.
  `streamModelWithTools` formate déjà pour OpenAI/Anthropic/Gemini.
- **Phase 10 — Slash Commands** : 12 commandes built-in + autocomplete dropdown.
  `/help` `/clear` `/model` `/undo` `/redo` `/compact` `/init` `/mcp` `/cost` `/workspace` `/skills` `/diff`.
  Auto-complétion avec Arrow/Tab/Escape/mousedown. Intercept dans `send()` avant le flow normal.
  Custom commands depuis `tools.json` (réutilise Phase 4).

**Slash Commands détaillées :**

| Commande | Action |
|----------|--------|
| `/help` | Liste les commandes built-in + custom tools |
| `/clear` | Efface le chat (newSession) |
| `/model` | Affiche le modèle courant |
| `/undo` | Annule la dernière modification (POST /api/marexcode/undo) |
| `/redo` | Rétablit la dernière annulation (POST /api/marexcode/redo) |
| `/compact` | Compresse l'historique (garde 4 derniers messages, résume le reste) |
| `/init` | Analyse le workspace (tree API), détecte la stack, génère MAREXCODE.md |
| `/mcp` | Liste les serveurs MCP et leurs tools |
| `/cost` | Affiche l'usage tokens (user vs assistant, tokens estimés) |
| `/workspace` | Liste les workspaces, `/workspace switch {id}` pour activer |
| `/skills` | Liste les skills actifs avec mode (Auto/Manuel/Sur demande) |
| `/diff` | Affiche le dernier patch/diff dans la session |

**WebSearch Tool (Marexcode) :**
- **Backend `server/websearch.py`** : chaîne de 6 providers avec fallback auto : Tavily → Exa → Brave API → Jina → SearXNG → DuckDuckGo.
  `normalizeHit` (alias champs), `applyDomainFilters` (allowed/blocked domains), timeout par provider.
- **Endpoint** : `POST /api/websearch` (JWT, rate-limit 30/min, body `{query, allowed_domains?, blocked_domains?, max_results?}`).
- **Frontend `static/marexcode/js/websearch.js`** : module Marexcode-only. Override `executeWebSearch` → `/api/websearch`.
  `marexHasNativeSearch(modelId)` : openrouter/opencode = natif, deepseek/mistral/groq = adapter.
  `marexInjectWebSearch(modelId)` : ajoute/retire `web_search` dans `MAREXCODE_TOOLS` via `splice()` (pas `filter()`).
- **Icône globe** 🌐 à côté du bouton `+` : visible si modèle supporte search, allumé (accent) si activé, cliquable pour toggle.
- **System prompt règle 15** : Sources obligatoires pour questions générales, pas pour le code.
- **System prompt règle 16** : Réponds toujours dans la langue de l'utilisateur.
- **Bug fix** : `rawAcc` reset au démarrage de chaque tool call — élimine les doublons/contradictions dans les réponses Read.
- Cetas (chat général) utilise la même chaîne backend via `search-engine.js` modifié.

**Améliorations UI chat :**
- **Bulles utilisateur/assistant** : `max-width: 75%`, s'ajustent au contenu (pas 100%).
- **Labels émetteur** : "Vous" / "Marexcode" en petit texte gris au-dessus de chaque bulle.
- **Espacement** : `margin-bottom: 14px` entre chaque message.
- **Tableaux markdown** : bordures arrondies, fond alterné (nth-child even), padding 8-10px, hover subtil.

**Sécurité (durcie) :**
- `EXEC_SANDBOX` ne prend **plus** `CETAS_BASE_DIR` en fallback (défaut = `DATA_DIR`) — élimine le
  risque d'exposer la racine applicative au sandbox.
- `_exec_root()` **strict** : retourne `None` si `_marex_root` absent (log.error) — plus aucun
  fallback silencieux vers `EXEC_SANDBOX`. `_resolve_safe_path`, `_exec_bash`, `_exec_grep`,
  `_marex_tree` vérifient tous `root is not None` avant d'exécuter.
- Workspace par projet : `uploaded_project/` (importé) ou `server_project/` (serveur), jamais la
  racine app. Rate-limit : exec 60/min, upload 5/5min, delete 5/5min.

**Point critique (déjà rencontré) :** la page standalone doit appeler **`loadModels()`**
(`js/core/api.js`) au boot pour peupler `MODELS_MAP` — sinon `getModelEditeur` retourne
`null` et `streamModelWithTools` échoue (« Éditeur inconnu » / `r is not a function`).
**Piège debug :** la page mobile doit recharger le JS après redéploiement — le cache statique
nginx est passé en **no-cache** (`nginx.conf`) pour éviter les versions périmées.

---

## 8. Providers supportés

### Ajout d'un provider

1. **server/server.py** → `PROVIDER_CONFIG` + `PROXY_ALLOWED_PATHS`
2. **static/js/data/models.js** → Ajouter les modèles dans `MODELS_DATA`
3. **.env** → Ajouter la clé chiffrée avec `scripts/setup.py`
4. **static/partials/head.html** → CSP `connect-src` si domaine différent
5. **static/images/** → Icône SVG du provider
6. **static/js/services/config-providers.js** → Mapping provider/frontend

### Ajout d'une clé API

```bash
# Depuis la racine du projet
sudo python3 scripts/setup.py
# → Menu numéroté des providers
# → Chiffre et ajoute à .env
# → Redémarrer: docker compose restart cetas
```

> **OpenCode — double forfait** : deux sections distinctes dans `scripts/setup.py`, **« OpenCode Zen »** (n°15,
> `/zen/v1/...`) et **« OpenCode Go »** (n°16, `/zen/go/v1/...`), chacune avec sa propre clé. Le nom
> d'env (AAD de chiffrement) est stable via `NORMALIZE_MAP` : `opencode` (Zen) / `opencode-go` (Go).
> Séparation stricte côté proxy : la clé Zen ne peut appeler que `/zen/v1`, la clé Go que `/zen/go/v1`.
> Modèles : suffixe `-zen` (clé Zen) / `-go` (clé Go) dans `models.js`. Migration vault automatique
> (`OpenCode` → `OpenCode Zen`) à l'ouverture du coffre — aucune re-saisie requise.

---

## 9. Configuration & Déploiement

### Mode Desktop (M2-M5) — App Windows

> **Architecture** : backend Python embarqué (PyInstaller one-folder) + frontend `static/`
> réutilisé + coquille pywebview (fenêtre native). Le serveur tourne en thread daemon,
> la fenêtre WebView charge `http://127.0.0.1:PORT`. Tray icon (pystray) : fermer → minimize
> au tray, double-clic → restaurer. Auto-start optionnel via registry Windows.

**Lancement** :
```powershell
# Depuis la source
python cetas.py

# Depuis le portable
dist\Cetas\Cetas.exe
```

**Build** :
```powershell
python -m PyInstaller --clean --noconfirm cetas.spec
# Résultat : dist\Cetas\Cetas.exe (one-folder)
```

**Installer** : compiler `installer.iss` avec Inno Setup → `installer\Cetas-Setup.exe`.

**Variables clés pour le desktop** :
| Variable | Rôle | Défaut |
|----------|------|--------|
| `CETAS_VAULT_PASSWORD` | Mot de passe vault | (depuis `%APPDATA%\Cetas\data\.password`) |
| `CETAS_DATA_DIR` | Données utilisateur | `%APPDATA%\Cetas\data` |
| `CETAS_PROJECT_DIR` | Workspace Marexcode | `%APPDATA%\Cetas\workspace` |
| `CETAS_LOCAL_MODE` | Bash complet | `1` |
| `CETAS_CRYPTO_PATH` | Module crypto | automatique (win/linux) |

> **Vault local UI (M3)** : au 1er lancement, si pas de vault → `/setup` (formulaire 13 providers).
> Après enregistrement, vault + .env chiffrés dans `%APPDATA%\Cetas\.vault\.enc` + `.env`.
> Mot de passe sauvé dans `%APPDATA%\Cetas\data\.password` (desktop uniquement).

### Fichiers de configuration

| Fichier | Rôle |
|---------|------|
| `.env.docker` | Variables Docker (vault password, worker token, CORS, exec sandbox) |
| `.env` | Clés API chiffrées (iv:ct par provider) |
| `.vault/.enc` | Coffre-fort chiffré (proxy_key, secrets) |
| `docker-compose.yml` | Stack Docker (cetas + searxng) |
| `nginx.conf` | Config nginx (SSI on, root `static/`, proxy `/api/`, **cache statique no-cache en dev**, `client_max_body_size 25m`) |
| `Dockerfile` | Image Docker (terser JS, concat CSS) |
| `start.sh` | Génère `static/js/config.js`, lance proxy + nginx |
| `scripts/setup.py` | Config vault + clés API |
| `manifest.json` | PWA manifest |

### Secrets & identifiants

| Secret | Valeur | Emplacement |
|--------|--------|-------------|
| Vault password | `Yoroboul!26+` | `.env.docker` → `CETAS_VAULT_PASSWORD` |
| Worker token | `103c897f1c11f5f4eead1d8c97e242255fdedcbfaac6780a94dcd064536c75aa` | `.env.docker` → `CETAS_WORKER_TOKEN` |
| CORS origins | `http://10.10.10.100:8901,http://localhost:8901,https://cetas.neva-ci.pro` | `.env.docker` → `CETAS_CORS_ORIGINS` |
| LLaMA.cpp URL | `http://10.10.10.102:8080` | `.env.docker` → `CETAS_LLAMACPP_URL` |
| LLaMA.cpp key | `c52b7bca4954a3aa6832a580cfa01506f17b6c88493a514e` | `.env.docker` → `CETAS_LLAMACPP_KEY` |
| SearXNG secret | `e0cd34f7be10c207b9c87f477ac5129a54831cb62016aeaedb72d6a8fee5a7ff` | `.env.docker` → `SEARXNG_SECRET_KEY` |

### Ports

| Service | Port | Visibilité |
|---------|------|------------|
| Cetas (nginx) | 8901 | Public |
| Proxy Python | 8080 | Interne (nginx) |
| SearXNG | 8904 | Interne (localhost) |

### Build Docker

```bash
cd ~/Cetas-WebUi
docker compose build cetas        # Build avec cache
docker compose build --no-cache cetas  # Build sans cache
docker compose up -d              # Redémarrer
docker compose restart cetas      # Redémarrer sans rebuild
```

### Déploiement complet

```bash
# Depuis le serveur (LXC 100), répertoire ~/Cetas-WebUi
docker compose build cetas          # Rebuild image
docker compose up -d                # Start stack (cetas + searxng)

# Diagnostic
docker compose logs --tail=20 cetas
curl -s http://localhost:8901/api/health
```

---

## 10. Firewall PVE — Modèle Tailscale-Only

> **Statut** : ACTIF ✅
> **Fichiers** : `/etc/pve/firewall/cluster.fw` + `/etc/pve/firewall/host.fw`
> **Plan complet** : `FIREWALL_PVE_PLAN.md`

### Matrice de sécurité

| Port | Service | Internet | Tailscale | LAN | Containers |
|------|---------|----------|-----------|-----|------------|
| :22 | SSH | ❌ | ✅ | ✅ | ✅ |
| :80 | nginx router | ✅ | ✅ | ✅ | ✅ |
| :443 | nginx router | ✅ | ✅ | ✅ | ✅ |
| :3128 | SPICE proxy | ❌ | ✅ | ✅ | ✅ |
| :8006 | Proxmox UI | ❌ | ✅ | ✅ | ✅ |
| :41641 | Tailscale | ✅ | ✅ | ✅ | ✅ |
| :111 | rpcbind | ❌ | ❌ | ❌ | ❌ |

### Commandes utiles

```bash
# Status
sudo pve-firewall status

# Management ipset
sudo ipset list PVEFW-0-management-v4

# Règles iptables
sudo iptables -L PVEFW-HOST-IN -n

# Rollback
sudo pve-firewall stop
```

---

## 11. Sécurité & Vault

### Flux de déchiffrement

```
.vault/.enc → (CETAS_VAULT_PASSWORD) → proxy_key (hex)
     ↓
.env → (proxy_key) → AES-256-GCM decrypt → clés API en clair (mémoire)
     ↓
server/server.py → injecte clés dans headers upstream
```

### Sécurité

- **Vault**: AES-256-GCM + Scrypt KDF (N=65536)
- **Passwords**: scrypt (N=16384) avec migration automatique
- **JWT**: HS256, 24h expiration
- **CORS**: Origines restreintes (`.env.docker`)
- **Rate-limiting**: 30 req/min proxy, 10/min login, 30/min conversations
- **CSP**: Content-Security-Policy strict dans `index.html`
- **.env**: chmod 600 dans le container
- **Vault guard**: Protection immutabilité vault
- **Inscription**: contrôlée par `CETAS_REGISTRATION_OPEN` (`false` en prod via `.env.docker`) — le 1er admin vient de `users-seed.json`, pas de `/api/auth/register`

### Ajout d'une clé (manuel)

```python
import secrets
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

proxy_key = bytes.fromhex(data["proxy_key"])  # depuis vault
iv = secrets.token_bytes(12)
ct = AESGCM(proxy_key).encrypt(iv, api_key.encode(), provider.encode())
print(f"{provider}_key={iv.hex()}:{ct.hex()}")
```

---

## 12. Guide de dépannage — 52 scénarios

### 12.1 Authentification & Login (scénarios 1-8)

| # | Erreur | Cause | Solution |
|---|--------|-------|----------|
| 1 | `401 Unauthorized` sur toutes les routes API | JWT invalide/expiré ou `.jwt_secret` supprimé | Se reconnecter. Si ça persiste : supprimer `/app/data/.jwt_secret` dans le conteneur pour régénérer un secret |
| 2 | `Identifiants incorrects` au login | Mot de passe erroné ou compte inexistant | Vérifier `users.json` dans `/app/data/`. Réinitialiser via `users-seed.json` si admin perdu |
| 3 | `Aucun admin configuré` | `users-seed.json` vide ou absent | Recréer `core/users-seed.json` avec un admin et redémarrer le conteneur |
| 4 | `Cet utilisateur existe déjà` (409) | Tentative de réinscription avec un username existant | Choisir un autre username ou supprimer l'ancien compte |
| 5 | `Mot de passe trop court` (400) | Password < 8 caractères | Utiliser un mot de passe de 8+ caractères |
| 6 | `Trop de tentatives` (429) | Rate-limit login (10 req/min) | Attendre 1 minute |
| 7 | Token JWT expiré après 24h | Session trop longue | Se reconnecter. Le token expire après 24h |
| 8 | `Permission refusée` (403) | Action admin tentée par un user normal | Se connecter avec un compte admin |

### 12.2 Proxy & Providers API (scénarios 9-18)

| # | Erreur | Cause | Solution |
|---|--------|-------|----------|
| 9 | `401 Non authentifié` sur tous les providers | Clés API absentes du `.env` ou vault non déchiffré | Vérifier que les clés sont dans `.env` (chiffrées). Relancer `scripts/setup.py` |
| 10 | `proxy_key absent du vault` | Vault `.enc` corrompu ou pas de `setup.py` | Relancer `scripts/setup.py` pour recréer le vault |
| 11 | `CETAS_VAULT_PASSWORD non défini` | Variable d'env manquante dans `.env.docker` | Ajouter `CETAS_VAULT_PASSWORD=...` dans `.env.docker` |
| 12 | `Échec déchiffrement proxy_key` | Mauvais mot de passe vault | Vérifier `CETAS_VAULT_PASSWORD` dans `.env.docker` |
| 13 | `URL invalide: /api/proxy/opencode/...` | Provider non configuré dans `PROVIDER_CONFIG` | Ajouter le provider dans `server/server.py` + `PROXY_ALLOWED_PATHS` |
| 14 | `Provider inconnu` (400) | Provider non reconnu par le proxy | Ajouter dans `PROVIDER_CONFIG` de `server/server.py` |
| 15 | `Pas de clé pour: xxx` (400) | Clé API manquante pour ce provider | Ajouter la clé via `scripts/setup.py` |
| 16 | `Path non autorisé pour xxx` (403) | Endpoint non whitelisté dans `PROXY_ALLOWED_PATHS` | Ajouter le path dans `PROXY_ALLOWED_PATHS` |
| 17 | `Trop de requêtes` (429) proxy | Rate-limit proxy (30 req/min) | Attendre 1 minute |
| 18 | `Erreur connexion upstream` (502) | Le provider IA est injoignable | Vérifier la connectivité internet. Changer de provider |

### 12.3 Modèles IA & Routing (scénarios 19-26)

| # | Erreur | Cause | Solution |
|---|--------|-------|----------|
| 19 | `Veuillez choisir un modèle` | Aucun modèle sélectionné avant l'envoi | Sélectionner un modèle dans le menu "+" |
| 20 | `Réponse vide du routeur LLM` | Le routeur local n'a pas retourné de modèle | Vérifier le service SamAgent ou choisir un modèle manuellement |
| 21 | Fallback chaîne épuisée | Tous les providers de fallback ont échoué | Vérifier les clés API de chaque provider. Tester un provider individuellement |
| 22 | `Ce modèle n'est pas un modèle image` | Modèle texte sélectionné pour générer une image | Sélectionner un modèle image dans le menu "+" |
| 23 | Streaming interrompu mid-response | Timeout ou erreur réseau pendant le streaming | Réessayer. Vérifier la stabilité de la connexion |
| 24 | `HTTP 429` depuis le provider | Rate-limit du provider IA externe | Attendre ou changer de provider |
| 25 | `HTTP 401` depuis le provider | Clé API invalide ou expirée chez le provider | Vérifier/renouveler la clé API du provider |
| 26 | Modèle `longcat-2.0-go` supprimé | Modèle retiré du catalogue par le provider | Le système réinitialise automatiquement. Choisir un autre modèle |
| 27 | `opencode-go/zai 401` alors que la clé fonctionne (test direct) | Le navigateur route vers le **worker Cloudflare** (`_proxyDown=true`) qui ne possède pas ces clés, ou JS **périmé en cache** (cache statique 30j avant passage en no-cache) | Vider le cache navigateur + recharger (JS rechargé → `_proxyDown` réinitialisé via `/api/health`). Vérifier `/api/proxy/opencode-go/...` dans les logs nginx (présence = proxy local OK) |
| 28 | Upload projet bloqué à 20 Mo / 25 Mo | Backend `UPLOAD_MAX_TOTAL_BYTES` (20 Mo défaut) + nginx `client_max_body_size 25m` | Relever `CETAS_UPLOAD_MAX_BYTES` + `client_max_body_size` (voir §7, décision workspace local à venir) |

### 12.4 Conversations & Messages (scénarios 29-35)

| # | Erreur | Cause | Solution |
|---|--------|-------|----------|
| 29 | `PUT ... 401 (Unauthorized)` sync | Token JWT expiré pendant la sync | Se reconnecter. Le sync push échoue silencieusement |
| 30 | `Conversation introuvable` (404) | Fichier conversation supprimé du serveur | La conversation existe en local mais plus sur le serveur. Sync manuelle |
| 31 | Messages affichés mais vides | Erreur de parsing du markdown | Vérifier `marked.umd.min.js` et `purify.min.js` |
| 32 | Bulle erreur rouge après envoi | Le provider a retourné une erreur | Lire le message d'erreur dans la bulle. Changer de modèle |
| 33 | Bloc "Raisonnement" vide | Le modèle n'a pas généré de thinking | Normal pour les modèles sans raisonnement |
| 34 | conversations non synchronisées | Connexion serveur perdue | Vérifier la connexion réseau. La sync reprendra automatiquement |
| 35 | `Path traversal détecté` | Tentative d'accès à un fichier hors du répertoire conversations | Vérifier le nom du fichier de conversation |

### 12.5 Pièces jointes & Fichiers (scénarios 36-40)

| # | Erreur | Cause | Solution |
|---|--------|-------|----------|
| 36 | `Impossible d'accéder au microphone` | Permission micro refusée par le navigateur | Autoriser le micro dans les paramètres du navigateur |
| 37 | Fichier non affiché dans l'aperçu | Format non supporté ou fichier corrompu | Vérifier l'extension : `.txt,.md,.csv,.json,.xml,.pdf,.js,.py,.html,.css` |
| 38 | Image non rendue dans le message | URL de l'image inaccessible ou CSP bloquant | Vérifier le CSP dans `index.html` (img-src) |
| 39 | PDF non affiché | `pdf.min.js` non chargé | Vérifier que le fichier JS est présent et accessible |
| 40 | `Patientez : fichier encore en cours de chargement` | Fichier pas encore téléchargé en mémoire | Attendre la fin du chargement avant d'envoyer |

### 12.6 Recherche Web (scénarios 41-44)

| # | Erreur | Cause | Solution |
|---|--------|-------|----------|
| 41 | `Recherche web indisponible` | Tous les moteurs ont échoué (SearXNG, Brave, DDG) | Vérifier SearXNG (`docker compose logs searxng`). Vérifier la clé Brave si configurée |
| 42 | `Quota Brave mensuel atteint` | Quota Brave Search épuisé | Attendre le mois prochain ou utiliser SearXNG/DuckDuckGo |
| 43 | Résultats de recherche vides | SearXNG ne retourne rien | Vérifier que SearXNG tourne : `docker compose ps searxng` |
| 44 | Toggle recherche web ne s'active pas | `webSearchEnabled` est à `false` dans `js/core/state.js` | Changer `webSearchEnabled:!1` en `!0` dans `js/core/state.js` + rebuild |

### 12.7 Budget & Quotas (scénarios 45-47)

| # | Erreur | Cause | Solution |
|---|--------|-------|----------|
| 45 | Alerte budget s'affiche | Montant max atteint pour la période | Fermer l'alerte. Aucun blocage appliqué. Augmenter le budget ou attendre la prochaine période |
| 46 | Quotas affichent "N/A" | Le provider n'expose pas d'API de consultation de crédits | Normal. Ce provider ne supporte pas la consultation de quotas |
| 47 | Coût affiché à $0.00 | Modèle gratuit ou pas de pricing configuré | Normal pour les modèles gratuits (Groq, Nvidia free, etc.) |

### 12.8 Import/Export & Sauvegarde (scénarios 48-50)

| # | Erreur | Cause | Solution |
|---|--------|-------|----------|
| 48 | `Ce fichier n'est pas un prompt/rolé Cetas valide` | Format JSON incorrect lors de l'import | Vérifier que le fichier est au format Cetas (champs `name`, `content`) |
| 49 | Import backup échoue | Fichier .json corrompu ou version incompatible | Récupérer un backup antérieur. Vérifier l'extension `.json` |
| 50 | Export vide | Aucune conversation à exporter | Créer au moins une conversation avant d'exporter |

### 12.9 UI & Affichage (scénarios 51-52)

| # | Erreur | Cause | Solution |
|---|--------|-------|----------|
| 51 | Overlay erreur CSS "Oh, on dirait que Cetas a un petit souci" | `style.css` manquant ou corrompu (build incomplet) | Rebuild Docker : `docker compose build cetas && docker compose up -d` |
| 52 | Sidebar masquée ou layout cassé | CSS non chargé ou conflit de thème | Vérifier `css/style.css` et `css/ocean.css`. Rafraîchir avec Ctrl+Shift+R |

### 12.10 Commandes de diagnostic rapides

```bash
# Status du proxy
curl -s http://localhost:8901/api/health

# Logs du conteneur
docker compose logs -f cetas | tail -50

# Redémarrer le conteneur
docker compose restart cetas

# Rebuild complet
docker compose build cetas && docker compose up -d

# Vérifier les clés chargées
curl -s http://localhost:8901/api/health | python3 -m json.tool

# Vérifier le vault
docker exec cetas-webui-cetas-1 python3 -c "
import sys; sys.path.insert(0,'/app/core/linux')
from crypto_linux import SecureVault
v = SecureVault('/app/data/.vault/.enc')
print(v.load('MOT_DE_PASSE').keys())
"

# Vérifier SearXNG
curl -s http://localhost:8904/?format=json&q=test | head -c 200

# Vérifier les.users
docker exec cetas-webui-cetas-1 cat /app/data/users.json

# Réinitialiser le JWT secret
docker exec cetas-webui-cetas-1 rm /app/data/.jwt_secret
docker compose restart cetas

# Vérifier l'espace disque
df -h /var/lib/docker
```

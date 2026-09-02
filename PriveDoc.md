# Cetas — Documentation Privée

> **Version :** v3.9 | **Branche :** `neva-pve`
> **Guide déploiement :** [DEPLOY.md](./DEPLOY.md)
> **Guide public :** [README.md](./README.md)

---

## Table des matières

1. [Accès & credentials](#1-accès--credentials)
2. [Architecture](#2-architecture)
3. [Providers & Modèles](#3-providers--modèles)
4. [Proxy Backend](#4-proxy-backend)
5. [Vault & Sécurité](#5-vault--sécurité)
6. [Authentification](#6-authentification)
7. [Stockage données](#7-stockage-données)
8. [SamAgent (Routeur)](#8-samagent-routeur)
9. [Modules JS](#9-modules-js)
10. [CSS & Thème](#10-css--thème)
11. [Script Loading Order](#11-script-loading-order)
12. [Boot Order](#12-boot-order)
13. [Firewall PVE](#13-firewall-pve)
14. [Infrastructure](#14-infrastructure)
15. [Troubleshooting](#15-troubleshooting)
16. [Historique versions](#16-historique-versions)

---

## 1. Accès & credentials

| Info | Valeur |
|------|--------|
| Login admin | `admin` |
| Mot de passe setup | `yoroboul88` |
| Vault password | `<VAULT_PASSWORD>` |
| User SSH LXC 100 | `sam` / `<LXC_PASSWORD>` |
| Sudo LXC 100 | `<LXC_PASSWORD>` |
| User SSH host PVE | `sam` / `Popo!26+` |
| Sudo host PVE | `Popo!26+` |
| URL app | `https://cetas.neva-ci.pro` |
| IP LXC 100 | `10.10.10.100` |
| IP host PVE | `192.168.10.75` (vmbr0), `10.10.10.1` (vmbr1) |
| IP Tailscale | `100.65.108.122` |

---

## 2. Architecture

```
Internet (160.120.139.203)
    │
    ▼
Host PVE (NEVA) — vmbr0
    ├── :22 SSH (Tailscale + LAN)
    ├── :80/:443 nginx router → LXC 105
    ├── :8006 Proxmox UI (Tailscale + LAN)
    ├── :41641 Tailscale DERP
    │
    ├── vmbr1 (10.10.10.0/24) → Containers LXC
    │   ├── LXC 100 — CETAS (app + proxy Python)
    │   ├── LXC 102 — (autre service)
    │   ├── LXC 103 — (autre service)
    │   └── LXC 105 — nginx reverse proxy
    │
    ├── vmbr2 (10.10.99.0/24) → Réseau interne
    └── tailscale0 (100.65.108.122) → VPN
```

### Container CETAS (LXC 100)

```
Docker Compose
├── cetas (container)
│   ├── nginx :80 (exposé :8901 sur hôte)
│   │   ├── /api/* → proxy Python (127.0.0.1:8080)
│   │   ├── / → SPA statique
│   │   └── /search → SearXNG
│   ├── proxy Python :8080 (interne)
│   │   ├── Déchiffre .env via vault
│   │   ├── Auth JWT
│   │   ├── Forward vers providers
│   │   └── Sync conversations
│   └── static files (/usr/share/nginx/html)
│
└── searxng (container)
    └── SearXNG :8080 (interne, localhost:8904)
```

---

## 3. Providers & Modèles

### Providers supportés

| Provider | Base URL | Auth | Paths proxy |
|----------|----------|------|-------------|
| openai | api.openai.com | Bearer | /v1/chat/completions, /v1/models, /v1/images/ |
| anthropic | api.anthropic.com | x-api-key | /v1/messages |
| google | generativelanguage.googleapis.com | query ?key= | /v1beta/models/ |
| deepseek | api.deepseek.com | Bearer | /chat/completions, /v1/chat/completions |
| openrouter | openrouter.ai | Bearer | /api/v1/chat/completions, /api/v1/models |
| groq | api.groq.com | Bearer | /openai/v1/chat/completions, /openai/v1/models |
| nvidia | integrate.api.nvidia.com | Bearer | /v1/chat/completions, /v1/models |
| mistral | api.mistral.ai | Bearer | /v1/chat/completions |
| perplexity | api.perplexity.ai | Bearer | /chat/completions |
| grok | api.x.ai | Bearer | /v1/chat/completions |
| zai | api.z.ai | Bearer | /api/paas/v4/chat/completions |
| opencode | opencode.ai | Bearer | /zen/go/v1/*, /zen/v1/* |
| llamacpp | CETAS_LLAMACPP_URL | Bearer | /v1/chat/completions, /v1/models |

### Ajout d'un provider

1. `proxy/server.py` → `PROVIDER_CONFIG` + `PROXY_ALLOWED_PATHS`
2. `models.js` → Ajouter dans `MODELS_DATA`
3. `.env` → Clé chiffrée via `add_api_key.py`
4. `index.html` → CSP `connect-src` si domaine différent
5. `images/` → Icône SVG
6. `config-providers.js` → Mapping

### Modèles par catégorie

| Catégorie | nb | Exemples |
|-----------|-----|----------|
| Texte | ~65 | GPT-5.6, Claude Fable 5, Gemini 3.5, DeepSeek V4, Grok 4.5 |
| Image | 6 | GPT Image 2, Nano Banana Pro/2/Lite |
| Recherche | 3 | Sonar, Sonar Pro, Sonar Reasoning Pro |
| TTS | 6 | OpenAI, Google, Mistral, Nvidia, système |
| STT | 5 | Navigateur, Whisper, Google, Mistral |
| SamAgent | 4 | Nano, N4 Flash, N4, N8 (routeur intelligent) |

---

## 4. Proxy Backend

### Fichier : `proxy/server.py` (~1077 lignes)

| Fonction | Rôle |
|----------|------|
| `load_api_keys()` | Déchiffre les clés depuis .env via vault |
| `_build_upstream()` | Construit et envoie la requête upstream |
| `ProxyHandler` | Gère toutes les routes HTTP |
| `_proxy_request()` | Route vers le bon provider |
| `_conv_*()` | CRUD conversations |
| `_auth_*()` | Login/register JWT |
| `_users_*()` | CRUD utilisateurs |

### Routes API

| Méthode | Route | Auth | Description |
|---------|-------|------|-------------|
| GET | /api/health | Non | Status proxy |
| GET | /api/keys | Admin | Clés déchiffrées |
| POST | /api/auth/login | Non | Login → JWT |
| POST | /api/auth/register | Non | Inscription |
| GET | /api/conversations | JWT | Liste conversations |
| GET | /api/conversations/{file} | JWT | Détail |
| PUT | /api/conversations/{file} | JWT | Sauvegarde |
| DELETE | /api/conversations/{file} | JWT | Suppression |
| GET/PUT | /api/settings | JWT | Paramètres |
| GET/PUT/DELETE | /api/users/{name} | JWT/Admin | Users |
| GET/POST | /api/proxy/{provider}/... | JWT | Proxy IA |

### Variables d'environnement

| Variable | Rôle |
|----------|------|
| CETAS_VAULT_PASSWORD | Mot de passe vault |
| CETAS_WORKER_TOKEN | Token Cloudflare |
| CETAS_CORS_ORIGINS | Origines CORS |
| CETAS_LLAMACPP_URL | URL LLaMA.cpp |
| CETAS_LLAMACPP_KEY | Clé LLaMA.cpp |
| CETAS_DATA_DIR | Données users |
| PROXY_PORT | Port proxy (défaut: 8080) |

---

## 5. Vault & Sécurité

### Chaîne de chiffrement

```
Clé API (clair)
    → AES-256-GCM encrypt (proxy_key, associated_data=provider_name)
    → .env: provider_key=iv_hex:ct_hex

.vault/.enc:
    → Scrypt KDF (N=65536) + CETAS_VAULT_PASSWORD → proxy_key
    → proxy_key stocké dans le vault

proxy/server.py au démarrage:
    → CETAS_VAULT_PASSWORD → Scrypt → proxy_key
    → proxy_key → déchiffre .env → clés en mémoire
```

### Fichiers sensibles

| Fichier | Contenu | Permissions |
|---------|---------|-------------|
| `.vault/.enc` | Coffre-fort (proxy_key, secrets) | 644 |
| `.env` | Clés API chiffrées | 644 |
| `.env.docker` | Vault password, tokens | 600 |
| `/app/data/.jwt_secret` | Secret JWT | 600 |
| `/app/data/users.json` | Utilisateurs | 644 |

### Ajout d'une clé

```bash
# Script interactif
sudo python3 add_api_key.py
# → Menu numéroté des providers
# → Chiffre et ajoute à .env
# → Redémarrer: docker compose restart cetas
```

---

## 6. Authentification

| Paramètre | Valeur |
|-----------|--------|
| Algorithme password | scrypt (N=16384, r=8, p=1) |
| JWT algorithme | HS256 |
| JWT expiry | 24h |
| Secret JWT | Généré aléatoirement, persisté dans .jwt_secret |
| Migration | SHA-256 → scrypt automatique au login |
| Rate limiting | 10 login/min, 30 proxy/min, 30 conversations/min |

---

## 7. Stockage données

| Donnée | Technologie | Emplacement |
|--------|-------------|-------------|
| Conversations | Fichiers JSON | `/usr/share/nginx/html/conversations/{user}/` |
| Cache conversations | RAM (dict) | Mémoire Python (TTL 1h) |
| Users | JSON | `/app/data/users.json` |
| JWT secret | Fichier | `/app/data/.jwt_secret` |
| Conversations côté client | IndexedDB | `minou_conversations` |
| JWT token | sessionStorage | `cetas-token` |
| Thème | localStorage | `minou-theme` |
| Settings | Serveur | `/api/settings` (merge) |

---

## 8. SamAgent (Routeur)

Routeur intelligent intégré dans `js/router.js`. 4 tiers, chacun avec pools de modèles et fallback.

| Modèle | Score | Providers | Usage |
|--------|-------|-----------|-------|
| samagent-nano | 0-33 | Groq, Nvidia, Google | Ultra-rapide |
| samagent-n4-flash | 34-66 | OpenRouter (gratuits) | Rapide |
| samagent-n4 | 34-66 | OpenRouter (payants) | Standard |
| samagent-n8 | 67-100 | DeepSeek + OpenRouter | Premium |

**Routing :**
- Score ≤70 → algorithme regex (rapide)
- Score >70 → mini-LLM routeur (timeout 5s)
- Fallback 3 niveaux : primary → fallback → nextFallback

---

## 9. Modules JS

### Architecture

```
app.js (~5300 lignes) — point d'entrée
├── state.js — STATE singleton
├── api.js — communication proxy
├── auth.js — JWT
├── model-catalog.js — tarifs, fallback
├── conversations.js — CRUD conversations
├── filemanager.js — sync serveur
├── web-search.js — toggle recherche
├── search-engine.js — moteur recherche
├── tool-search.js — recherche outils
├── plus-menu.js — menu "+"
├── right-panel.js — panneau settings
├── budget.js — suivi coûts
├── quotas.js — crédits providers
├── categories.js — catégories
├── favorites.js — favoris
├── roles.js — rôles système
├── prompts.js — prompts enregistrés
├── user-management.js — gestion users
├── attachments.js — pièces jointes
├── export-import.js — backup/restore
├── export-md.js — export MD
├── emoji-picker.js — emojis
├── whisper.js — dictée vocale
├── theme.js — thème
├── lightbox.js — zoom images
├── router.js — SamAgent
├── settings-sync.js — sync settings
├── config-providers.js — config providers
├── dom.js — références DOM
├── utils.js — utilitaires
├── ocean.js — animations
└── faq.js — FAQ
```

---

## 10. CSS & Thème

### Build CSS

`style.css` est généré par concatenation :
```
variables.css + layout.css + chat.css + components.css + canvas.css + catalog.css + storage.css + menu.css
→ cleancss → style.css
```

### Thème océanique

`ocean.css` — séparé, chargé en overlay. Glassmorphism, canvas bulles + plancton.

---

## 11. Script Loading Order

1. Libs locales : pdf.min.js, marked.umd.min.js, purify.min.js, jszip.min.js
2. Globals synchrones : models.js → api.js → filemanager.js → faq.js → auth.js → router.js
3. Globals defer : right-panel.js, model-catalog.js
4. Modules ES (deferred) : ocean.js → app.js
5. Globals post-module : config-providers.js, conversations.js, plus-menu.js

---

## 12. Boot Order

```
1. Auth.init()                   — vérifie sessionStorage, sinon login overlay
2. initConfig()                  — syncKeysFromProxy() → clés en mémoire
3. rebuildModelLists()           — catalogue modèles
4. refreshConvList()             — IndexedDB → sidebar
5. syncPullFromServer()          — sync multi-appareils
6. __kiroSplashReady()           — masque splash
7. refreshCatBar()               — catégories
8. Restaure dernier modèle      — depuis localStorage
9. Restaure dernière conversation — depuis IndexedDB
10. window.Ocean.init()          — canvas bulles + plancton
```

---

## 13. Firewall PVE

### Statut : ACTIF ✅

| Port | Service | Internet | Tailscale | LAN | Containers |
|------|---------|----------|-----------|-----|------------|
| :22 | SSH | ❌ | ✅ | ✅ | ✅ |
| :80 | nginx router | ✅ | ✅ | ✅ | ✅ |
| :443 | nginx router | ✅ | ✅ | ✅ | ✅ |
| :3128 | SPICE proxy | ❌ | ✅ | ✅ | ✅ |
| :8006 | Proxmox UI | ❌ | ✅ | ✅ | ✅ |
| :41641 | Tailscale | ✅ | ✅ | ✅ | ✅ |
| :111 | rpcbind | ❌ | ❌ | ❌ | ❌ |

### Fichiers

| Fichier | Rôle |
|---------|------|
| `/etc/pve/firewall/cluster.fw` | Activation + management ipset |
| `/etc/pve/firewall/host.fw` | Règles host (ports ouverts/bloqués) |

### Commandes

```bash
sudo pve-firewall status
sudo ipset list PVEFW-0-management-v4
sudo iptables -L PVEFW-HOST-IN -n
sudo pve-firewall stop  # rollback
```

---

## 14. Infrastructure

### LXC 100 (CETAS)

| Info | Valeur |
|------|--------|
| IP | 10.10.10.100 |
| Hostname | CETAS |
| User | sam / <LXC_PASSWORD> |
| Docker | cetas-webui-cetas-1 |
| SearXNG | cetas-webui-searxng-1 |
| Port app | 8901 (exposé sur hôte) |
| Port SearXNG | 8904 (interne) |

### Host PVE (NEVA)

| Info | Valeur |
|------|--------|
| IP vmbr0 | 192.168.10.75 |
| IP vmbr1 | 10.10.10.1 |
| IP vmbr2 | 10.10.99.1 |
| IP Tailscale | 100.65.108.122 |
| IP publique | 160.120.139.203 |
| PVE version | 9.2.11 |
| Kernel | 7.0.2-6-pve |

---

## 15. Troubleshooting

### Erreurs courantes

| Erreur | Cause | Solution |
|--------|-------|----------|
| 401 sur toutes les routes | JWT expiré | Se reconnecter |
| URL invalide provider | Provider non configuré | Ajouter dans PROVIDER_CONFIG |
| proxy_key absent du vault | Vault corrompu | Relancer setup.py |
| 401 API providers | Clé API invalide | Ajouter via add_api_key.py |
| CSS error overlay | style.css manquant | Rebuild Docker |
| Docker Hub timeout | MTU trop élevé | sudo ip link set dev eth0 mtu 1300 |
| Sync conversations échoue | Vault password incorrect | Vérifier .env.docker |
| Container non démarré | Erreur startup | docker compose logs cetas |
| webSearchEnabled:false | Default dans state.js | Changer !1 en !0 + rebuild |
| server.py doublons opencode | Ajouts sed multiples | Nettoyer PROVIDER_CONFIG |

### Commandes diagnostic

```bash
# Health check
curl -s http://localhost:8901/api/health

# Logs
docker compose logs -f cetas | tail -50

# Redémarrer
docker compose restart cetas

# Rebuild
docker compose build cetas && docker compose up -d

# Clés chargées
curl -s http://localhost:8901/api/health | python3 -m json.tool

# Vault test
docker exec cetas-webui-cetas-1 python3 -c "
import sys; sys.path.insert(0,'/app/core/linux')
from crypto_linux import SecureVault
v = SecureVault('/app/data/.vault/.enc')
print(v.load('MOT_DE_PASSE').keys())
"

# SearXNG
curl -s http://localhost:8904/?format=json&q=test | head -c 200

# Users
docker exec cetas-webui-cetas-1 cat /app/data/users.json

# Reset JWT secret
docker exec cetas-webui-cetas-1 rm /app/data/.jwt_secret
docker compose restart cetas
```

### Emplacements conteneur vs hôte

| Hôte | Conteneur |
|------|-----------|
| ~/Cetas-WebUi/js/ | /usr/share/nginx/html/js/ |
| ~/Cetas-WebUi/css/ | /usr/share/nginx/html/css/ |
| ~/Cetas-WebUi/.vault/ | /usr/share/nginx/html/.vault/ |
| ~/Cetas-WebUi/.env | /usr/share/nginx/html/.env |
| ~/Cetas-WebUi/proxy/ | /app/server.py |
| ~/Cetas-WebUi/core/ | /app/core/linux/ |
| - | /app/data/ (users.json, .jwt_secret) |

---

## 16. Historique versions

| Version | Date | Changements |
|---------|------|-------------|
| v3.9 | 01/09/2026 | Provider OpenCode, websearch default off, firewall PVE, 50 troubleshooting |
| v3.8 | 26/07/2026 | SamAgent boutons cliquables, recherche web |
| v3.7 | 25/07/2026 | Quotas, sync settings, FAQ, effacer tout |
| v3.6 | 24/07/2026 | SamAgent 4 tiers, Cloudflare Worker anti-SPOF |
| v3.5 | 23/07/2026 | CSS modulaire, PBKDF2, refactor modules |
| v3.4 | 20/07/2026 | Refactor modulaire app.js |
| v3.2 | 18/07/2026 | Thème océanique, perf streaming, UX mobile |

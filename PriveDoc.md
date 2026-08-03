# Cetas — Documentation privée

> **Version :** v3.8 | **Branche :** `feat/auth-server-side`  
> **Guide déploiement :** [DEPLOY.md](./DEPLOY.md)  
> **Guide public :** [README.md](./README.md)

## Login par défaut
- **Utilisateur** : `admin`
- **Mot de passe** : `admin`
⚠️ Le flag `must_change_password` est activé automatiquement au premier bootstrap. L'admin sera forcé de changer son mot de passe. Le hash est en PBKDF2 (600k itérations, sel 128-bit) — plus de SHA-256 nu.

## Setup administrateur (setup.py)
```bash
python3 setup.py
```
Mot de passe setup : `yoroboul88`

Le setup permet de :
- Créer/modifier/supprimer des comptes administrateurs
- Configurer les clés API (OpenAI, Anthropic, Google, Mistral, DeepSeek, Grok, etc.)
- Configurer l'email SMTP
- Exporter les comptes dans `core/users-seed.json` (importé par le frontend au 1er lancement)

## Architecture détaillée

```
index.html              SPA unique (~1300 lignes)
css/
  style.css             Point d'entrée @import → 8 modules (variables, layout, chat, components, canvas, catalog, storage, menu)
  ocean.css             Thème aquatique premium (~400 lignes)
models.js               Catalogue modèles texte/image/search/tts/stt (12 éditeurs, 79+ modèles)
js/
  app.js                Point d'entrée module ES6 (~5304 lignes) — refactor v3.5
  config-providers.js   Configuration providers & API keys (~2126 lignes, script global)
  api.js                Providers streaming (15 providers, ~2263 lignes)
  auth.js               Authentification JWT + PBKDF2 + vault AES-GCM (~664 lignes)
  filemanager.js        IndexedDB conversations + system prompts (~720 lignes)
  conversations.js      Liste conversations sidebar (~605 lignes, script global)
  right-panel.js        Panneau paramètres conversation (~658 lignes, script global, defer)
  plus-menu.js          Menu "+" sélecteur modèles (~459 lignes, script global)
  model-catalog.js      Catalogue modèles OpenRouter (~415 lignes, script global, defer)
  categories.js         Catégories + popup management (~389 lignes)
  roles.js              Rôles/personas CRUD + modale (~330 lignes)
  prompts.js            Prompts enregistrés CRUD + modale (~195 lignes)
  export-import.js      Export/import sauvegardes JSON (~176 lignes)
  budget.js             Suivi budget + alertes (~143 lignes)
  emoji-picker.js       Sélecteur d'emojis (~142 lignes)
  export-md.js          Export Markdown / HTML (~250 lignes)
  favorites.js          Conversations favorites (~88 lignes)
  user-management.js    Gestion utilisateurs admin (~125 lignes)
  web-search.js         Bouton recherche web (~78 lignes)
  whisper.js            Dictée vocale Whisper (~172 lignes)
  router.js             SamAgent — routeur hybride multi-providers (~509 lignes)
  cloudflare-worker.js  Worker Cloudflare — backup proxy anti-SPOF (~140 lignes)
  state.js              STATE singleton partagé
  dom.js                Getters DOM centralisés (300+ éléments)
  theme.js              Thème clair/sombre/auto
  ocean.js              Canvas bulles + plancton bioluminescent (rAF, ~215 lignes)
  lightbox.js           Lightbox images + file viewer
  attachments.js        Pièces jointes, drag-drop, PDF
  utils.js              Fonctions pures
  faq.js                Données FAQ
css/
  style.css             Point d'entrée @import → 8 modules CSS
  ocean.css             Thème aquatique premium — glassmorphism, animations, splash (~400 lignes)
images/                 Logos, icônes, assets (dont SamAgent.svg)
core/
  linux/
    crypto_linux.py     SecureVault Python V4 (AES-256-GCM + Scrypt N=2¹⁶)
    vault_guard.py      Daemon systemd (chattr +i immutability)
  users-seed.json       Export comptes admin (généré par setup.py)
proxy/
  server.py             Proxy backend Python (~514 lignes) — déchiffre .env, injecte auth, sync conversations
  encrypt_keys.py       Chiffre les clés du vault vers .env
.vault/
  .enc                  Coffre-fort chiffré (Scrypt + AES-256-GCM + pepper)
  .guard_config         Chemin du vault pour vault_guard.py
  .system               Type de système + chemin du vault
.env                    Clés API chiffrées avec proxy_key (AES-256-GCM)
                        Permissions 600 — lisible par le proxy uniquement
manifest.json           PWA manifest
sw.js                   Service Worker (offline)
nginx.conf              nginx → proxy Python (port 80 → 8080)
Dockerfile              nginx:alpine → port 80 (exposé :8080)
start.sh                Démarre proxy puis nginx
```

## Providers supportés

| Provider | Auth | API |
|----------|------|-----|
| OpenAI | `sk-...` | Chat, Images, TTS, STT |
| Anthropic | `sk-ant-...` | Chat, Thinking |
| Google | `AIza...` | Chat, Images, TTS, STT |
| Mistral | `sk-...` | Chat, TTS, STT |
| DeepSeek | `sk-...` | Chat, Reasoning |
| Grok/xAI | `xai-...` | Chat, Web search |
| Z.ai/GLM | `sk-...` | Chat |
| Perplexity | `pplx-...` | Web search |
| OpenRouter | `sk-or-...` | Chat, Images, Web search, Catalogue |
| **Groq** | `gsk_...` | Chat (GPT-OSS, Llama 4, Qwen 3) |
| **Nvidia NIM** | `nvapi-...` | Chat (Nemotron, GLM-5.2, Kimi K2.6, Gemma 4) |
| **SamAgent** | — | Routeur intelligent multi-providers (pas de clé requise) |
| Cabreras | `sk-...` | Chat |
| Ollama | URL locale | Chat (localhost:11434) |
| LM Studio | URL locale | Chat (localhost:1234) |
| LLaMA.cpp | URL locale | Chat (localhost:8080) |

## Proxy backend

### Architecture

```
Navigateur → nginx (port 80) → proxy Python (port 8080)
         │                        ↓
         │                     .env déchiffré (AES-256-GCM)
         │                        ↓
         │                     api.openai.com, api.anthropic.com, etc.
         │
         └─── si proxy down ──→ Cloudflare Worker (cetas-backup.angeoulai2015.workers.dev)
                                  ↓
                               Secrets Cloudflare (AES-256-GCM)
                                  ↓
                               api.deepseek.com, openrouter.ai, etc.

Navigateur → nginx (port 80) → proxy Python (port 8080)
                                 ↓
                              conversations/{user}/*.json (sync multi-appareils)
```

Le navigateur appelle `/api/proxy/{provider}/...` — il n'a jamais les clés.
Les conversations sont synchronisées automatiquement via `/api/conversations` (GET liste, PUT sauvegarde, DELETE).

### Cloudflare Worker (v3.6 — anti-SPOF)

**URL** : `cetas-backup.angeoulai2015.workers.dev`
**Fichier** : `proxy/cloudflare-worker.js`

Worker de backup déployé sur Cloudflare Workers (gratuit). Prend le relais automatiquement si le proxy Python primaire est injoignable.

- **Détection** : health check `/api/health` toutes les 30s
- **Bascule** : automatique, transparente pour l'utilisateur
- **Protection** : token partagé `x-cetas-token` (Cloudflare Secret)
- **Providers supportés** : DeepSeek, OpenRouter, Google, Groq, Nvidia, OpenAI, Anthropic, Mistral, Grok, Z.AI, Cabreras, Perplexity
- **Secrets** : `DEEPSEEK_API_KEY`, `OPENROUTER_API_KEY`, `CETAS_TOKEN` (chiffrés AES-256-GCM par Cloudflare)
- **Limites gratuites** : 100K req/jour, CPU 10ms, streaming illimité

### Endpoints du proxy (v3.3 JWT)

| Endpoint | Méthode | Auth | Description |
|----------|---------|------|-------------|
| `/api/health` | GET | — | Status du proxy + nombre de clés chargées |
| `/api/keys` | GET | **Admin JWT** | Renvoie les clés déchiffrées (admin only) |
| `/api/keys` | HEAD | JWT | Détection proxy actif (accepte 401/403) |
| `/api/conversations` | GET | **JWT** | Liste conversations de l'utilisateur (sync multi-appareils) |
| `/api/conversations/{filename}` | GET | **JWT** | Récupère une conversation |
| `/api/conversations/{filename}` | PUT | **JWT** | Sauvegarde une conversation |
| `/api/conversations/{filename}` | DELETE | **JWT** | Supprime une conversation |
| `/api/proxy/{provider}/...` | GET/POST | **JWT** | Proxy vers les API des providers |
| `/api/auth/login` | POST | — | Authentification, retourne JWT |
| `/api/auth/register` | POST | — | Création compte |
| `/api/users` | GET | **Admin JWT** | Liste utilisateurs |
| `/api/users/{name}` | PUT | **Admin/Self JWT** | Modifier utilisateur |
| `/api/users/{name}` | DELETE | **Admin JWT** | Supprimer utilisateur |

Tous les endpoints sauf `/api/health`, `/api/auth/login` et `/api/auth/register` exigent un JWT valide dans `Authorization: Bearer <token>`.

### Chaîne de chiffrement

1. `setup.py` → chiffre les clés dans `.vault/.enc` (Scrypt N=2¹⁶ + AES-256-GCM + pepper)
2. `proxy/encrypt_keys.py` → déchiffre le vault, génère une `proxy_key`, chiffre les clés dans `.env`
3. `proxy/server.py` au démarrage → déchiffre `.env` avec `proxy_key` via `CETAS_VAULT_PASSWORD`
4. Les clés restent en mémoire dans le processus Python, jamais écrites sur le disque en clair

### Service systemd (actif)

```
~/.config/systemd/user/cetas-proxy.service
Port : 8081
Redémarrage : always (RestartSec=3)
Env : CETAS_VAULT_PASSWORD, PROXY_PORT
```

### Vault Guard (Linux)

`core/linux/vault_guard.py` — monte la garde avec `chattr +i` (immutabilité noyau) :
- Empêche la suppression/modification du vault même par root
- Service systemd root qui surveille et rétablit l'immutabilité
- Commandes : `install`, `remove`, `stop` (déverrouiller), `start` (verrouiller)

## Stockage des données navigateur (v3.3)

| Donnée | Technologie | Clé | Proxy actif |
|--------|-------------|-----|-------------|
| Conversations | IndexedDB | `minou_conversations` | inchangé |
| JWT Token | sessionStorage | `cetas-token` | — |
| Session utilisateur | sessionStorage | `cetas-session` | compatibility |
| Clés API | **mémoire seulement** | — | **aucune persistence** |
| Clés API (proxy absent) | localStorage | `cetas-vault-keys` (chiffré) | fallback vault |
| Thème | localStorage | `minou-theme` | inchangé |
| Prompts / Rôles | localStorage | `minou-systemprompts`, `minou-savedprompts` | inchangé |
| Catégories | localStorage | `minou-categories` | inchangé |
| Budget | localStorage | `minou-budget` | inchangé |

### Sécurité renforcée (v3.3)

Quand le proxy répond :
- `syncKeysFromProxy()` charge les clés en mémoire → localStorage ignoré
- `saveApiKeys()` détecte le proxy (HEAD `/api/keys`) → ne persiste PAS
- **Plus de fallback localStorage en clair** (`minou-apikeys` supprimé)
- Effacement des données navigateur = pas de perte, les clés reviennent du proxy

Sans proxy (fallback) :
- Auth active → coffre AES-256-GCM (`cetas-vault-keys`) uniquement

## Authentification (v3.5 — feat/auth-server-side)

- **Algorithme serveur** : scrypt (N=16384, r=8, p=1), AES-256-GCM (vault côté client)
- **Algorithme client (fallback)** : PBKDF2 (600k itérations, sel 128-bit aléatoire) — remplace SHA-256
- **JWT** : PyJWT 2.7.0, HS256, secret 256-bit aléatoire persisté dans `_users.json`
- **Dérivation clé vault** : PBKDF2, 600 000 itérations (côté client)
- **Session** : sessionStorage (`cetas-token` pour JWT, `cetas-session` pour compatibilité)
- **Migration auto** : SHA-256 → scrypt (serveur) + SHA-256 → PBKDF2 (client) au login réussi — transparent
- **Détection admin faible** : flag `must_change_password` activé si le mot de passe est `admin`
- **Rétrocompatibilité** : fallback localStorage si serveur injoignable, upgrade auto des anciens hashs
- **Multi-utilisateurs** : rôles `user` / `admin`, CRUD via API serveur
- **Rate limiting** : 10 login/min/IP, 5 register/min/IP
- **Login overlay** : bloque l'accès à l'app tant que l'utilisateur n'est pas authentifié

### Nouveaux endpoints auth

| Endpoint | Méthode | Auth | Description |
|----------|---------|------|-------------|
| `/api/auth/login` | POST | — | Login, retourne `{token, user}` |
| `/api/auth/register` | POST | — | Création compte (1er user = admin auto) |
| `/api/users` | GET | Admin JWT | Liste utilisateurs |
| `/api/users/<name>` | PUT | Admin/Self JWT | Modifier utilisateur |
| `/api/users/<name>` | DELETE | Admin JWT | Supprimer utilisateur |

## Nom de version

**v3.6** (24/07/2026) — SamAgent tiers complet (Nano/N4/N4-Flash/N8) + routeur 3 niveaux fallback + Cloudflare Worker anti-SPOF.

**v3.5** (23/07/2026) — CSS modulaire (8 fichiers @import) + PBKDF2 + headers sécurité + extraction 5 modules de app.js (config-providers, conversations, right-panel, plus-menu, model-catalog).

**v3.4** (20/07/2026) — Refactor modulaire : `app.js` split en 14 modules ES indépendants.

## Script loading order (v3.5 — modules ES + scripts globaux)

1. Libs locales : pdf.min.js, marked.umd.min.js, purify.min.js, jszip.min.js
2. Globals synchrones : models.js → js/api.js → js/filemanager.js → js/faq.js → js/auth.js → js/router.js
3. Globals defer : right-panel.js, model-catalog.js
4. Globals post-defer : images/ee.js
5. Modules ES (deferred) : js/ocean.js → js/app.js
6. Globals post-module : config-providers.js, conversations.js, plus-menu.js

**Note :** Les scripts globaux (4-6) ne peuvent pas accéder aux `const`/`let` des modules ES (scope isolé).
Les fonctions partagées (escHtml, escHtmlAttr, openApiKeysModal, refreshConvList, etc.) sont exposées sur `window` par app.js.

## Initialisation (boot order v3.5)

```
Auth.init()                   1. vérifie sessionStorage, sinon login overlay
  ↓
initConfig()                  2. syncKeysFromProxy() ? proxy répond :
                                  → clés en mémoire, localStorage ignoré
                                  : proxy absent → loadApiKeys() (coffre/fallback)
  ↓
rebuildModelLists()            3. + fetchLocalModels() + refreshOrCacheSilently()
  ↓
refreshConvList()              4. IndexedDB → sidebar
  ↓
syncPullFromServer()           5. sync multi-appareils (GET /api/conversations) — skip si pas de token
  ↓
__kiroSplashReady()            6. masque splash (min 1.8s)
  ↓
refreshCatBar()                7. catégories (categories.js)
importDefaultSystemPrompts()
refreshSpList()                (roles.js)
refreshPrList()                (prompts.js)
  ↓
Restaure dernier modèle        8. depuis localStorage
  ↓
Restaure dernière conversation  9. depuis IndexedDB
  ↓
window.Ocean.init()            10. canvas bulles + plancton (dernier)
```

## Modèles

### Catalogue
- **Statique** : `models.js` (MODELS_DATA) — 79+ modèles, 12 éditeurs
- **SamAgent** : 4 modèles virtuels (`samagent-nano`, `samagent-n4-flash`, `samagent-n4`, `samagent-n8`) — routeur intelligent, pas de clé requise
- **Dynamique** : OpenRouter models récupérés via `/api/proxy/openrouter/...` (proxy requis)
- **Local** : Ollama/LM Studio/LLaMA.cpp modèles détectés via `/v1/models`

### SamAgent (Model Fusion Router) — v3.6

Routeur hybride intégré dans `js/router.js` (~509 lignes). 4 tiers indépendants, chacun avec ses propres pools de modèles et sa propre stratégie de fallback.

**Architecture :**
- **Score ≤70** → algorithme regex (rapide, déterministe) : classifie l'intention (chat/coder/raisonnement) et choisit aléatoirement dans le pool
- **Score >70** → mini-LLM (sauf Nano) : 2 routeurs LLM avec timeout 5s (DeepSeek Chat + Gemini Flash Lite), max 10s, puis fallback regex
- **Fallback 3 niveaux** : primary → fallback → \_nextFallback (streamModel propage la chaîne)
- **Timeout anti-hang** : AbortSignal.timeout(5000) sur chaque appel routeur LLM

**Tiers (v3.6) :**

| Modèle | Tier | Score | Providers | Spécialité |
|--------|------|-------|-----------|------------|
| `samagent-nano` | Nano | 0-33 | Groq, Nvidia, Google | Ultra-rapide, 18 modèles flash/lite/nano, pas de DeepSeek |
| `samagent-n4-flash` | N4 Flash | 34-66 | OpenRouter | Gratuits OR, 10 modèles |
| `samagent-n4` | N4 | 34-66 | OpenRouter | Payants ≤$1.50/M, 13 modèles |
| `samagent-n8` | N8 | 67-100 | DeepSeek direct + OpenRouter | Flagship 100% 2026, 17 modèles uniques |

**Pools détaillés :**

**Nano** (18 modèles, 6 par intent, 2 par provider) :
| Intent | Groq | Nvidia | Google |
|--------|------|--------|--------|
| chat | `llama-3.1-8b-instant`, `qwen/qwen3-32b` | `step-3.7-flash`, `nemotron-nano-30b` | `gemini-3.1-flash-lite`, `gemini-2.5-flash` |
| coder | `openai/gpt-oss-20b`, `qwen/qwen3-32b` | `step-3.7-flash`, `nemotron-nano-30b` | `gemma-4-26b`, `gemini-2.5-flash` |
| raison. | `qwen/qwen3.6-27b`, `llama-4-scout-17b` | `nemotron-nano-omni`†, `gemma-4-31b` | `gemini-2.5-flash`, `gemini-3.1-flash-lite` |

**N8** (18 modèles, 6 par intent, DS direct + OR) :
| Intent | DeepSeek | OpenRouter (5 modèles/intent) |
|--------|----------|-------------------------------|
| chat | — | `deepseek-v4-flash`, `qwen3.6-flash`, `step-3.7-flash`, `hy3`, `minimax-m2.5`, `minimax-m3` |
| coder | `deepseek-v4-pro` | `kat-coder-air`, `kat-coder-pro`, `qwen3.7-plus`, `qwen3-max`, `longcat-2.0` |
| raison. | `deepseek-v4-pro`† | `deepseek-r1-0528`†, `qwen3-max-thinking`†, `mercury-2`†, `trinity-large`†, `nemotron-ultra-550b` |

**Fallback par tier :**
| Tier | Niveau 1 | Niveau 2 | Niveau 3 |
|------|----------|----------|----------|
| Nano | Provider 1 | Provider 2 (différent) | Provider 3 (3ème) |
| N4/N4-Flash | OpenRouter | DeepSeek random | DeepSeek random (autre) |
| N8 | OR/DS | DS/OR (croisé) | OR (autre modèle) |

**Stabilité :** 99.99% Nano, 99.75% N4/N8 (uptime 95%) — pire cas 80% uptime : 99.2% Nano, 96% N4/N8.

### Groq (6 modèles)
| id | Libellé |
|----|---------|
| `openai/gpt-oss-20b` | GPT-OSS 20B |
| `openai/gpt-oss-120b` | GPT-OSS 120B |
| `meta-llama/llama-4-scout-17b-16e-instruct` | Llama 4 Scout 17B |
| `qwen/qwen3-32b` | Qwen 3 32B |
| `llama-3.1-8b-instant` | Llama 3.1 8B |
| `qwen/qwen3.6-27b` | Qwen 3.6 27B |

### Nvidia NIM (13 modèles)
| id | Libellé |
|----|---------|
| `z-ai/glm-5.2` | GLM-5.2 |
| `minimaxai/minimax-m3` | MiniMax M3 |
| `google/diffusiongemma-26b-a4b-it` | DiffusionGemma 26B |
| `stepfun-ai/step-3.7-flash` | Step 3.7 Flash |
| `mistralai/mistral-medium-3.5-128b` | Mistral Medium 3.5 128B |
| `google/gemma-4-31b-it` | Gemma 4 31B |
| `nvidia/nemotron-3-super-120b-a12b` | Nemotron 3 Super 120B |
| `nvidia/nemotron-3-nano-30b-a3b` | Nemotron 3 Nano 30B |
| `openai/gpt-oss-120b` | GPT-OSS 120B |
| `meta/llama-3.3-70b-instruct` | Llama 3.3 70B |
| `moonshotai/kimi-k2.6` | Kimi K2.6 |
| `nvidia/nemotron-3-nano-omni-30b-a3b-reasoning` | Nemotron 3 Nano Omni 30B |
| `nvidia/nemotron-nano-12b-v2-vl` | Nemotron Nano 12B VL |

### Image (6 modèles)
| id | Libellé | Éditeur | Tarif |
|----|---------|---------|-------|
| `gemini-3-pro-image` | Nano Banana Pro | Google | ~$0.134/image 1K |
| `gemini-3.1-flash-image` | Nano Banana 2 | Google | ~$0.067/image 1K |
| `gemini-3.1-flash-lite-image` | Nano Banana 2 Lite | Google | ~$0.034/image 1K |
| `gpt-image-2` | GPT Image 2 | OpenAI | $0.006–$0.211/image |
| `gpt-image-1.5` | GPT Image 1.5 | OpenAI | $0.009–$0.200/image |
| `gpt-image-1-mini` | GPT Image 1 Mini | OpenAI | $0.005–$0.052/image |

### Search (3 modèles)
| id | Libellé | Éditeur | Tarif |
|----|---------|---------|-------|
| `sonar` | Sonar | Perplexity | $1/1M tokens + $5/1k recherches |
| `sonar-pro` | Sonar Pro | Perplexity | $3/1M tokens + $5/1k recherches |
| `sonar-reasoning-pro` | Sonar Reasoning Pro | Perplexity | $2/1M tokens + $5/1k recherches |

### TTS — Synthèse vocale (6 modèles)
| id | Libellé | Éditeur | Tarif |
|----|---------|---------|-------|
| `gpt-4o-mini-tts` | OpenAI (GPT-4o-mini TTS) | OpenAI | $12/1M car. |
| `gemini-3.1-flash-tts` | Google (Gemini 3.1 Flash TTS) | Google | $1 / $20 |
| `gemini-2.5-flash-tts` | Google (Gemini 2.5 Flash TTS) | Google | $0.50 / $10 |
| `voxtral-mini-tts-2603` | Mistral (Voxtral Mini TTS) | Mistral | $16/1M car. |
| `system-tts` | Système (navigateur) | Système | Gratuit |
| `nvidia/nemotron-voicechat` | Nvidia (Nemotron VoiceChat) | Nvidia | — |

### STT — Transcription audio (5 modèles)
| id | Libellé | Éditeur | Tarif |
|----|---------|---------|-------|
| `system-stt` | Navigateur (reconnaissance vocale) | Système | Gratuit |
| `whisper-1` | OpenAI (Whisper) | OpenAI | $0.006/min |
| `openai/whisper-1` | OpenRouter (Whisper) | OpenRouter | ~$0.006/min |
| `gemini-3.1-flash-lite` | Google (Gemini 3.1 Flash Lite) | Google | $0.50 / $1.5 |
| `voxtral-mini-latest` | Mistral (Voxtral Mini 2) | Mistral | $0.003/min |

## Fonctionnalités avancées

- **SamAgent (Model Fusion)** : routeur hybride 3 tiers (Nano/N4/N8) × 3 intents (chat/code/raisonnement). Score ≤70 → algorithme regex, >70 → mini-LLM avec fallback multi-provider. Rotation aléatoire dans des pools de 6+ modèles par tier — aucun point de défaillance unique.
- **Sync conversations multi-appareils** : le proxy stocke les conversations sur disque (JSON par utilisateur) et les synchronise automatiquement. Après effacement navigateur, l'historique est restauré depuis le backend.
- **Canvas** : panneau latéral pour contexte long (bouton dans l'input)
- **Web search** : bouton bascule, utilise Perplexity Sonar et OpenRouter
- **Dev modules** : Marexcode, Agent Code, Plugins, Compétences (grisés, dev)
- **Amélioration IA** : optimisation des prompts et rôles via un modèle dédié
- **Titres automatiques** : générés après le 1er échange
- **Stockage** : panneau de gestion visuelle (taille par conv/média, recherche, tri, suppression)
- **Budget** : suivi par jour/semaine/mois, alerte configurable (non-bloquante)
- **Sauvegardes** : export JSON complet (conversations + config + clés), import
- **Raisonnement** : thinking blocks visibles pour Anthropic, DeepSeek, OpenRouter
- **Sync auto** : les clés API et conversations se restaurent depuis le proxy après effacement navigateur
- **Avatar utilisateur** : menu dropdown avec avatar, gestion du compte
- **UI transparente** : thème glassmorphism, messages pleine largeur
- **Favoris** : conversations épinglées dans la sidebar
- **Thème océanique (v3.2+)** : surcharge additive sous `body.ocean-theme`. Canvas bulles + plancton (rAF), glassmorphism (backdrop-filter), animations (baleine breathing, ripple, wave transitions). Fichiers : `ocean.js`, `ocean.css`.
- **Performance streaming (v3.2+)** : rendu markdown avec debounce 80ms + seuil 20 chars. Canvas suspendu pendant le streaming. Redondances `marked.parse()` supprimées. Gain ~89% d'appels à `marked.parse()`. Fichier : `js/app.js` → `createStreamRenderer()`.
- **UX mobile (v3.2+)** : animations fadeIn sur tous les dropdowns, états `:active` avec scale sur tous les boutons, tailles tactiles augmentées (44px recommandé), overflow-wrap + hyphens sur les messages, contrastes corrigés, z-index harmonisés.

## Déploiement

### Architecture de déploiement (VPS)

```
Internet (HTTPS :443)
    │
    ▼
Caddy (reverse proxy, Let's Encrypt auto)
    │  reverse_proxy localhost:8080
    ▼
Docker Compose
┌─────────────────────────────────┐
│ cetas (container)               │
│   nginx :80 ← /api/* → proxy   │
│   Python :8080 (interne)        │
│   static files                  │
├─────────────────────────────────┤
│ searxng (container)             │
│   SearXNG :8080                 │
│   (127.0.0.1:8084 sur l'hôte)   │
└─────────────────────────────────┘
```

### docker-compose.yml

```yaml
# Cetas + SearXNG — © Marexsoft Corporation
services:
  cetas:
    build: .
    ports:
      - "8080:80"
    restart: unless-stopped
    env_file:
      - .env.docker
    volumes:
      - ./.vault:/usr/share/nginx/html/.vault:ro
      - ./.env:/usr/share/nginx/html/.env:ro
      - cetas-data:/usr/share/nginx/html/conversations
      - cetas-data:/app/data

  searxng:
    image: searxng/searxng:latest
    ports:
      - "127.0.0.1:8084:8080"
    environment:
      - SEARXNG_BASE_URL=http://localhost:8084/
      - SEARXNG_SECRET_KEY=${SEARXNG_SECRET_KEY:?SEARXNG_SECRET_KEY requis}
    volumes:
      - ./searxng-data:/etc/searxng
    cap_drop: [ALL]
    cap_add: [CHOWN, SETGID, SETUID]

volumes:
  cetas-data:
```

### Déploiement rapide

```bash
# Build + démarrage
export SEARXNG_SECRET_KEY="$(python3 -c 'import secrets; print(secrets.token_hex(32))')"
docker compose build --no-cache
docker compose up -d
```

### .env.docker

```bash
CETAS_VAULT_PASSWORD=mot_de_passe_vault
CETAS_WORKER_TOKEN=token_cloudflare_worker
CETAS_CORS_ORIGINS=https://mon.domaine.com,http://localhost:8080
```

### Volumes Docker

| Volume / Bind | Container | Contenu |
|---------------|-----------|---------|
| `./.vault` (ro) | `/usr/share/nginx/html/.vault` | Coffre-fort chiffré `.enc` |
| `./.env` (ro) | `/usr/share/nginx/html/.env` | Clés API chiffrées (AES-256-GCM) |
| `cetas-data` | `/usr/share/nginx/html/conversations` | Conversations JSON par utilisateur |
| `cetas-data` | `/app/data` | `users.json` + `.jwt_secret` |

### Caddy (reverse proxy HTTPS)

```caddyfile
cetas.mondomaine.com {
    reverse_proxy localhost:8080 {
        transport http {
            read_timeout 300s
            write_timeout 300s
        }
    }
}
```

### Rebuild après modification

```bash
docker compose build --no-cache
docker compose down && docker compose up -d
```

### Proxy seul (sans Docker)

```bash
CETAS_VAULT_PASSWORD="motdepasse" PROXY_PORT=8081 python3 proxy/server.py
# Conversations : conversations/{user}/*.json
# Users : /app/data/users.json
```

### Guide complet

Voir **[DEPLOY.md](./DEPLOY.md)** — guide pas-à-pas complet pour installer sur un VPS vierge (Debian 13 + Docker + Caddy + SearXNG).

### Variables d'environnement

| Variable | Défaut | Description |
|----------|--------|-------------|
| `CETAS_VAULT_PASSWORD` | — | Mot de passe du coffre-fort **(obligatoire)** |
| `CETAS_WORKER_TOKEN` | — | Token partagé Cloudflare Worker (optionnel) |
| `CETAS_CORS_ORIGINS` | `https://samui.neva-ci.pro` | Origines CORS autorisées |
| `CETAS_PEPPER` | — | Secret anti-bruteforce offline (optionnel) |
| `PROXY_PORT` | 8080 | Port d'écoute du proxy Python |
| `CETAS_BASE_DIR` | auto-détecté | Racine de l'application |
| `CETAS_DATA_DIR` | `/app/data` | Répertoire données (users.json, JWT secret) |
| `CETAS_VAULT_PATH` | `{BASE_DIR}/.vault/.enc` | Chemin du vault chiffré |
| `CETAS_ENV_PATH` | `{BASE_DIR}/.env` | Chemin du .env |
| `CETAS_CRYPTO_PATH` | `{BASE_DIR}/core/linux/crypto_linux.py` | Module crypto |
| `SEARXNG_SECRET_KEY` | — | Clé secrète SearXNG **(obligatoire)** |

## Fichiers divers

| Fichier | Rôle |
|---------|------|
| `images/ee.js` (109K) | Contient une image SVG encodée en base64 dans une constante JS. Chargé avant `app.js`, utilisé comme illustration/placeholder. |
| `core/index.html.28` (103K) | Backup d'une ancienne version de `index.html`. Conservé pour référence, non chargé par l'application. |
| `Cetas42.png` (342K) | Logo principal utilisé dans le splash screen. |
| `images/icon-*.png` | Icônes PWA multi-résolutions (192, 512, maskable). |
| `images/*.svg` | Logos vectoriels des providers (15 fichiers). |

## Fichiers sensibles — checklist sécurité

| Fichier | État | Action |
|---------|------|--------|
| `core/api-keys-seed.json` | ✅ Supprimé | Contenait les clés en clair |
| `.env` | ✅ Permissions 600 | Chiffré AES-256-GCM |
| `.vault/.enc` | ✅ Permissions 600 | Chiffré Scrypt + AES-256 |
| `core/users-seed.json` | ⚠️ Permissions 664 | Hashs SHA-256 seulement, mais resserrer à 600 recommandé |

## Problèmes connus

- **Classifieur sécurité indisponible** : le modèle deepseek-v4-pro/flash (classifieur) est parfois down. Les commandes Bash destructives (docker, git commit) sont bloquées. Solution : l'utilisateur tape `! <commande>` pour exécuter directement.
- **clean-css warning** : le Dockerfile concatène les 8 modules CSS avant minification. Pas d'erreur.

## Audit stabilité (23/07/2026)

5 bugs corrigés (risque faible) + handler global `unhandledrejection` :
- `passwordInput` null check (`auth.js`)
- Fuite Object URL clics multiples (`app.js`)
- `pagehide` flush IndexedDB iOS (`whisper.js`)
- `.catch()` sur `saveConversation()` (`app.js`)
- `_writeUsers()` try/catch QuotaExceededError (`auth.js`)
- Handler `unhandledrejection` global → toast 4s non-bloquant (`app.js`)

Aucune régression. L'app est stable.
- **canvas.js commenté** : la feature Canvas (code preview) est désactivée. Garder le placeholder `window.Canvas` pour compatibilité.
- **Préfixe `minou-`** : vestige Kiro dans localStorage (`minou-theme`, `cetas-last-conv`). Ne pas renommer.

## Refactor v3.5 — Extraction des modules de app.js (23/07/2026)

> **Commits** : `1c528b8` → `9f9df47` | **Status** : Déployé | **Fichiers** : 9

### Résumé

`app.js` est passé de ~9,458 à ~5,304 lignes (−4,154, −44%). 5 blocs extraits comme scripts globaux indépendants. Les modules ES ont un scope isolé → les fonctions partagées sont exposées sur `window`.

### Modules extraits

| Module | Lignes | Type | Description |
|---|---|---|---|
| `config-providers.js` | 2,126 | Script global | Configuration providers, clés API, modèles, budget |
| `conversations.js` | 605 | Script global | Liste conversations sidebar, favoris, recherche |
| `right-panel.js` | 658 | Script global (defer) | Panneau paramètres conversation (général, image) |
| `plus-menu.js` | 459 | Script global | Menu "+" : sélecteur modèles, réflexion, effort, compétences |
| `model-catalog.js` | 415 | Script global (defer) | Catalogue modèles OpenRouter, recherche, filtres |

### Correctifs post-extraction

| Commit | Description |
|---|---|
| `8d814e9` | Références DOM manquantes dans modules extraits |
| `dbc51ad` | window.escHtml, window.escHtmlAttr, window.openApiKeysModal pour scripts globaux |
| `90fbf19` | Résolution ReferenceError (STATE, escHtml, HIDDEN_EDITEURS) |
| `d5d2b8c` | apikeysModalOverlay redéfini dans config-providers.js |
| `9f9df47` | syncPullFromServer skip si pas de token (évite 401 avant login) |

### Pattern d'exposition window

```js
// app.js (module ES)
window.escHtml = escHtml;
window.openApiKeysModal = openApiKeysModal;
window.refreshConvList = refreshConvList;

// config-providers.js (script global)
// Utilise window.escHtml, window.openApiKeysModal directement
```

Les variables `const`/`let` des modules ES ne sont pas visibles des scripts globaux.
Les fonctions partagées passent par `window`.

## Détails thème océanique (v3.2+)

### Glassmorphism
| Élément | Opacité | Blur |
|---------|---------|------|
| Sidebar + right panel | 82% | 14px |
| Input area | 78% | 14px |
| Modales | 90% | 20px |
| Dropdowns | 92% | 16px |
| Overlays | rgba(0,0,0,0.18) | 4px |
| Thinking block | 55% | 14px |

### Animations
- **Whale breathing** : `ocean-whale-breathe` 4s sur tous les logos
- **Ripple** : `ocean-ripple-out` 0.7s au clic sur input-wrapper, buttons
- **Wave transitions** : `cubic-bezier(0.23, 1, 0.32, 1)` sur panels

### Canvas particules (`ocean.js`)
- **Bulles** : 12, r=6-20px, alpha très faible, montent avec wobble sinusoïdal
- **Plancton** : 25, r=0.5-2.7px, glow radial, drift lent
- **Fond** : gradient radial — dark: bleu profond, light: bleu ciel très clair
- **Perf** : rAF continu, suspendu pendant le streaming (v3.2+)

## Variable CSS thème

| Variable | Light | Dark | Rôle |
|----------|-------|------|------|
| `--bg` | `#ffffff` | `#1a1a1a` | Fond principal |
| `--bg-sidebar` | `#fafafa` | `#212121` | Fond sidebar |
| `--bg-msg-user` | `#f0f0f0` | `#2a2a2a` | Bulle user |
| `--bg-msg-assistant` | `#f9f9f9` | `#323232` | Zone assistant |
| `--text` | `#1a1a1a` | `#e0e0e0` | Texte |
| `--accent` | `#2196F3` | `#2196F3` | Accent (override ocean) |
| `--border` | `#eaeaea` | `#2e2e2e` | Bordures |
| `--danger` | `#dc2626` | `#dc2626` | Destructif |

## Audit v3.2+ (18/07/2026)

### Correction stabilité
- `catSelect` null guard (bloquait app.js si élément DOM absent)
- `conv-item-title`, `manage-list-item-name` : optional chaining ajouté
- `clipboard.writeText()` : `.catch()` sur 3 appels pour éviter les rejetons non rattrapées

### Optimisations performance
- **IndexedDB** : connexion singleton (plus d'ouverture/fermeture par appel)
- **getModelEditeur()** : lookup O(1) via Map (remplace MODELS.find() O(N) appelé ~30x/action)
- **Animations** : `will-change: background-position` sur les shimmer (génération, streaming, enhance)
- **send-btn:active** : doublon `transform` supprimé

### CSS mobile refondu
- 3 niveaux de police cohérents (0.88/0.78/0.72rem) au lieu de 12 font-sizes disparates
- Variables CSS mobiles (`--m-font-primary`, `--m-space-md`, `--m-touch-min`)
- Touch targets 40px minimum normalisés partout

### SamAgent
- Sélection aléatoire (`Math.random()`) au lieu du round-robin
- Nouveau modèle STT OpenRouter Whisper

## À faire

- [x] **Auth serveur JWT** — migration localStorage → serveur (feat/auth-server-side)
- [x] **Hash scrypt** — SHA-256 → scrypt avec migration auto
- [x] **Audit sécurité** — 13 corrections (proxy JWT, rate limiting, CDN locaux, Docker non-root, /api/keys admin-only, JWT secret indépendant, X-Cetas-User retiré, cache TTL, users.json hors web, fallback clair retiré, proxyHeaders universel)
- [x] **Sync réconciliation** — delete propagé entre appareils (comparaison liste locale vs serveur)
- [x] **Fix IndexedDB transaction** — transactions séparées par opération
- [ ] Configurer le remote git en SSH pour push/pull sans mot de passe
- [ ] Resserer les permissions de `core/users-seed.json` (664 → 600)
- [ ] Mettre en place le `vault_guard.py` (chattr +i) sur le vault
- [ ] Ajouter `cetas-proxy.service` dans le repo pour déploiement plus simple
- [ ] CSP strict sans `'unsafe-inline'` (déplacer scripts inline → externes)
- [ ] HTTPS/TLS avec Let's Encrypt
- [ ] Virtual scroller pour refreshConvList (utile si 200+ conversations)
- [x] **SamAgent v3.6** — 4 tiers complets (Nano/N4-Flash/N4/N8) + routeur 3 niveaux fallback
- [x] **Cloudflare Worker anti-SPOF** — backup proxy avec bascule auto 30s

## Commits v3.6 (23-24/07/2026)

Depuis le 23/07 20h :

```
14d6e2f feat: Cloudflare Worker fallback — anti-SPOF proxy
0fe357f perf: routeur ultra-stable — timeout 5s, fallback 3 niveaux, 96-99.9% stabilité
4685264 feat: SamAgent N8 flagship — 100% 2026, DeepSeek↔OpenRouter cross-fallback
fc16749 fix: désactive cache agressif assets (SPA, déploiements fréquents)
236f425 feat: SamAgent Nano ultra-rapide — Groq+Nvidia+Google, fallback cross-provider
a99ad9d fix: utilise var + fonctions nommées pour éviter collisions terser
3e3ac4f fix: streamText utilise proxyUrl + proxyHeaders (évite 401)
b9b66a3 fix: corrige double déclaration const textCache/imageCache
95d42fd fix: auto-enable tous les modèles des pools N4 Flash + N4
cd5eac9 feat: SamAgent N4 Flash (free OR) + N4 (paid OR) + fallback DeepSeek
```

## v3.7 — Quotas d'utilisation (25/07/2026)

> **Commit** : `3bcbb7a` | **Status** : Déployé | **Fichiers** : 5 (quotas.js, components.css, index.html, config-providers.js, Dockerfile)

### Résumé

Nouvel onglet "Quotas" dans la modale Configuration pour visualiser les crédits API restants et recevoir des alertes quand ils sont presque épuisés.

### Module `js/quotas.js` (~530 lignes)

Module ES chargé dynamiquement (`import('./quotas.js')`) quand l'utilisateur clique sur l'onglet Quotas.

**Providers avec API de crédits :**
| Provider | Endpoint | Réponse parsée |
|----------|----------|----------------|
| OpenRouter | `/api/v1/auth/key` | `usage` (dépensé), `limit` (null si pas de limite) |
| DeepSeek | `/user/balance` | `balance_infos[{total_balance, topped_up_balance, granted_balance}]` |

**Providers sans API (10) :** Google, OpenAI, Anthropic, Mistral, Grok, Perplexity, Nvidia, Z.ai, Cabreras, Groq — affichés en grisé avec lien dashboard.

### Fonctionnalités

- **Fetch via proxy** : utilise `proxyUrl()`/`proxyHeaders()` existants → zéro modification backend
- **Cache 5min** : localStorage (`cetas-quotas`), TTL 300s
- **Recharge manuelle** : champ `💰 Recharge` pour saisir le montant (ex: 10€) → calcul `recharge − dépensé = restant`
- **Barre de progression** : % utilisé avec couleur (vert <75%, jaune <90%, rouge ≥90%)
- **Alertes seuil** : configurables par provider, toast non-bloquant 6s, ack quotidien
- **Actualisation** : bouton manuel, invalidation du cache

### Fichiers modifiés

| Fichier | Changement |
|---------|-----------|
| `js/quotas.js` | Nouveau module ES (530 lignes) |
| `index.html` | Onglet + panel HTML (15 lignes) |
| `css/components.css` | Styles quotas (300 lignes) |
| `js/config-providers.js` | Lazy-load panel (+4 lignes) |
| `Dockerfile` | Terser quotas.js (+1 ligne) |

### Endpoints via proxy

```
GET /api/proxy/openrouter/api/v1/auth/key  → OpenRouter
GET /api/proxy/deepseek/user/balance       → DeepSeek
```

## v3.7 — Sync paramètres serveur (25/07/2026)

> **Commit** : `c45dfe8` | **Status** : Déployé | **Fichiers** : 8 (server.py, settings-sync.js, app.js, quotas.js, budget.js, theme.js, api.js, Dockerfile)

### Endpoint /api/settings

- GET : retourne les settings de l'utilisateur authentifié
- PUT : merge partiel des settings (une ou plusieurs clés)
- Stockage dans `_users.json` → `users[username].settings`

### Module settings-sync.js (~100 lignes)

- Pull au login (syncPullSettings) — merge localStorage uniquement si absent localement
- Push debounce 1s (syncPushSetting) — appelé par chaque module après sauvegarde
- Exposé sur `window._syncPushSetting`, `_syncPushAll`
- Clés sync : theme, budget, audio, quotas_alerts, quotas_topups, categories, saved_prompts, system_prompts, catalog_prefs

## v3.7 — SamAgent personnalité + propositions cliquables (25/07/2026)

> **Commit** : `40f7696` | **Fichier** : app.js

### SAMAGENT_BOOST_PROMPT réécrit

6 règles : accueil poli, 3 propositions interactives (💬 Chat / 💻 Coder / 🔬 Avancé), écoute active, compétence experte, efficacité élégante, adaptation fluide.

### Propositions cliquables

- `_samAgentMakeClickable()` : détecte les `<p>` commençant par 💬 💻 🔬 → boutons CSS
- Au clic : remplit l'input + déclenche l'envoi → SamAgent accuse réception
- Accusé de réception aléatoire et adapté au domaine

## v3.7 — Effacer toutes les conversations (25/07/2026)

> **Commit** : `91e7c82` | **Fichiers** : index.html, app.js

- Bouton 🗑️ rouge dans la sidebar (sous l'engrenage Configuration)
- Dialogue de confirmation avec code aléatoire 6 caractères
- Suppression locale (IndexedDB) + serveur (sync) en parallèle

## v3.7 — FAQ dans sidebar + mise à jour complète (25/07/2026)

> **Commits** : `088887f` → `2922aba` | **Fichiers** : faq.js, index.html, app.js

- Bouton FAQ dans le menu utilisateur (sidebar, avatar)
- 30 entrées couvrant Général, Usage, Problèmes
- Alignée README : 18 providers, SamAgent, quotas, sync, mode réflexion

## v3.7 — Nettoyage code + crédits (25/07/2026)

> **Commits** : `8345f78` → `b130d35` | **Fichiers** : 33

- Commentaires décoratifs et évidences supprimés (−388 lignes)
- `© Marexsoft Corporation. Fondateur Kouassi Marius.` dans tous les fichiers
- quotas.js 568→460, settings-sync.js 161→100, api.js 2406→2328, config-providers 2147→2118

## v3.7 — Corrections (25/07/2026)

- **Dockerfile** : ajout bash (Alpine n'a pas /bin/bash → start.sh échouait)
- **proxyUrl** : try/catch sur `new URL()` — évite crash si URL mal formée
- **SW** : `.catch(() => {})` sur `cache.put()` — silence les erreurs réseau
- **Credits** : retrait `Co-Authored-By` des 87 commits — réécriture historique
- **start.sh** : crédit après shebang, pas avant

## v3.8 — SamAgent boutons cliquables + recherche web (26/07/2026)

> **Commits** : `e148605` → `2938381` (7 commits) | **Status** : Déployé | **Fichier** : js/app.js

### SamAgent — Corrections frontend

**4 bugs résolus dans `_samAgentMakeClickable()` :**
1. `keys` élargis pour matcher le vocabulaire réel du modèle (question générale, programmation, raisonnement...)
2. `.msg-text` → `.message-text` (la classe CSS du DOM)
3. `#send-btn` → `#mobile-send-btn` (le bouton desktop est `display:none`)
4. Appel ajouté dans `addMessage()` pour les conversations chargées depuis l'historique

**Boutons masqués après choix :** scan DOM via `previousElementSibling` — si un message user précédent est un label de domaine, pas de boutons.

### SamAgent — Prompt système (SAMAGENT_BOOST_PROMPT)

**Règle #3** : après accusé réception → stop net, 0 question, 0 relance.
**Règle #2** : formatage strict — chaque option dans son propre `<p>`, pas de inline.
**Label « Propositions : »** : ajouté en gris discret (`0.75rem`, `--text-muted`) au-dessus des boutons.

### Architecture recherche web

**Principe :** pas de moteur externe (Google CSE, Bing, SerpAPI). Utilise les outils natifs des providers LLM.

| Provider | Mécanisme | Coût |
|----------|-----------|------|
| OpenAI | `web_search_preview` (Responses API) | $0.01/req |
| Anthropic | `web_search_20250305` | $0.01/req |
| Google | `google_search` (Gemini grounding) | Gratuit (5k req) |
| Grok | `search_parameters` auto | $0.035/source |
| OpenRouter | `openrouter:web_search` + `web_fetch` | Variable |

**Fichiers :** `js/web-search.js` (78 lignes), `js/api.js` (parsers citations), `js/app.js` (appendCitations)
**Whitelist providers :** `['openai', 'anthropic', 'google', 'grok', 'openrouter']`
**Pas de recherche pour :** Mistral, DeepSeek, Groq, Nvidia, locaux (Ollama/LM Studio)

**Limites :**
- Dépendance totale aux providers — pas de fallback RAG/local
- Pas de cache des résultats de recherche
- Citations extraites du stream, non indexées



# Cetas — Session Memory (tout ce qu'il faut savoir)

> Fichier de mémoire exhaustive. À lire en début de session pour reprendre sans exploration.

---

## IDENTITÉ DE L'APP

- **Nom :** Cetas (cétacés — cachalot)
- **Version :** 3.6 (24/07/2026)
- **Éditeur :** Marexsoft Corporation
- **Tagline :** "Assistant IA multi-modèles"
- **Langue :** Français
- **Logo :** `images/Cetas42.png` (illustration de cachalot)
- **Ancien nom :** Kiro (certaines clés localStorage commencent encore par `minou-` et `kiro-`)
- **Déploiement :** Docker sur VPS Linux, port 8080
- **Domaine public :** `samui.neva-ci.pro` (reverse proxy → Docker port 8080)
- **Setup.py password :** `yoroboul88`

---

## ARCHITECTURE TECHNIQUE

### Stack
- **Frontend :** Vanilla JS (ES modules), CSS custom properties, HTML5 Canvas
- **Architecture :** `app.js` (~5,300 lignes) point d'entrée module ES, importe 14 sous-modules. CSS modulaire : `style.css` point d'entrée → 8 modules @import (variables, layout, chat, components, canvas, catalog, storage, menu) — concaténés + minifiés au build Docker.
- **Backend proxy :** Python (`proxy/server.py`) — déchiffre les clés API depuis `.env` via vault AES-GCM, JWT auth
- **Serveur :** Nginx alpine, Docker
- **Pas de framework frontend** — DOM manipulation directe, mix scripts globaux + modules ES

### Déploiement Docker
- **Image :** `cetas:latest` (feat/auth-server-side), anciennement `cetas-webui:latest`
- **Container :** `cetas-webui`
- **Port :** 8080 → 80 (nginx), proxy Python sur 127.0.0.1:8080
- **Vault :** `CETAS_VAULT_PASSWORD=Yoroboul2026!+`
- **User container :** `cetas` (uid 1001, non-root), aligné avec l'hôte
- **Volumes :**
  - `cetas-data` → `/usr/share/nginx/html/conversations` (conversations JSON + répertoires utilisateurs)
  - `cetas-data` → `/app/data` (users.json + JWT secret)
  - `/home/sam/kiro/.vault` → `/usr/share/nginx/html/.vault` (coffre .enc)
  - `/home/sam/kiro/.env` → `/usr/share/nginx/html/.env` (clés API chiffrées)
- **Build :** `docker build -t cetas:latest .` (ajouter `--no-cache` si fichiers JS changent mais Docker cache)
- **Dockerfile :** minifie JS avec terser (`-c -m`), CSS : concatène les 8 modules puis cleancss
- **Terser cache :** Docker peut cacher les couches COPY même si fichiers modifiés → `--no-cache` requis parfois

### Structure fichiers
```
/kiro/
├── index.html              # 1301 lignes — toute l'UI
├── css/
│   ├── style.css           # Point d'entrée @import → 8 modules (dev) / bundle minifié (prod Docker)
│   ├── variables.css       # Splash + variables thème
│   ├── layout.css          # Sidebar + modales + conversations
│   ├── chat.css            # Messages + zone de saisie
│   ├── components.css      # Config, prompts, emoji, raisonnement, lightbox
│   ├── canvas.css          # Canvas + vues
│   ├── catalog.css         # Catalogue modèles
│   ├── storage.css         # Stockage + auth
│   ├── menu.css            # Menu "+" + compact mode
│   └── ocean.css           # ~400 lignes — thème aquatique premium
├── js/
│   ├── app.js              # ~5304 lignes — ES module, logique principale
│   ├── config-providers.js # ~2126 lignes — config providers & API keys (script global)
│   ├── api.js              # appels API aux 18 providers
│   ├── auth.js             # authentification JWT + vault
│   ├── conversations.js    # ~605 lignes — liste conversations sidebar (script global)
│   ├── right-panel.js      # ~658 lignes — panneau paramètres (script global, defer)
│   ├── plus-menu.js        # ~459 lignes — menu "+" sélecteur modèles (script global)
│   ├── model-catalog.js    # ~415 lignes — catalogue OpenRouter (script global, defer)
│   ├── state.js            # état global
│   ├── dom.js              # getters DOM lazy
│   ├── theme.js            # thème light/dark/auto
│   ├── ocean.js            # canvas bulles + plancton (rAF)
│   ├── router.js           # routing SamAgent
│   ├── utils.js            # utilitaires généraux
│   ├── filemanager.js      # IndexedDB conversations + sync serveur
│   ├── attachments.js      # pièces jointes
│   ├── faq.js              # FAQ
│   ├── lightbox.js         # visualiseur d'images
│   ├── categories.js       # ★ catégories + popup management
│   ├── roles.js            # ★ rôles/personas CRUD
│   ├── prompts.js          # ★ prompts enregistrés CRUD
│   ├── export-import.js    # ★ export/import sauvegardes
│   ├── budget.js           # ★ suivi budget
│   ├── emoji-picker.js     # ★ sélecteur emojis
│   ├── export-md.js        # ★ export Markdown/HTML
│   ├── favorites.js        # ★ conversations favorites
│   ├── user-management.js  # ★ gestion utilisateurs admin
│   ├── web-search.js       # ★ bouton recherche web
│   └── whisper.js          # ★ dictée vocale
├── images/                 # 30 fichiers — logos providers + icônes app
├── proxy/
│   ├── server.py           # proxy API Python
│   └── encrypt_keys.py     # chiffrement AES-GCM
├── core/                   # (gitignored)
├── .vault/                 # (gitignored)
├── .env                    # (gitignored)
├── Dockerfile
├── nginx.conf
├── start.sh
├── memory_session.md       # CE FICHIER
├── PriveDoc.md             # Documentation privée (gitignored, versionné -f)
└── README.md               # Documentation publique
```

### Providers API (18)
Anthropic, DeepSeek, Google Gemini, Grok (xAI), Groq, Mistral, Nvidia, Ollama, OpenAI, OpenRouter, Perplexity, Z.ai, LM Studio, Cabreras, LlamaCpp, SamAgent, + compatible OpenAI

---

## SYSTÈME DE THÈME

### Fonctionnement
- **3 modes :** light, dark, auto
- **Clé localStorage :** `minou-theme`
- **Application synchrone :** script inline dans `<head>` avant rendu body (évite le flash)
- **Module :** `theme.js` — exporte `applyTheme(mode)`, `initTheme()`, `setOnThemeChange(fn)`
- **CSS variables :** 32 vars dans `:root`, surchargées dans `body.dark` et `body.theme-auto`

### Variables CSS clés
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

---

## THÈME OCÉANIQUE — Vue d'ensemble

### Principe
Surcharge additive sous `body.ocean-theme`. Aucun sélecteur existant modifié. Classe `ocean-theme` sur `<body>` par défaut.

### Palette
- **Accent :** `#2196F3` (bleu Material pur)
- **Accent profond :** `#1976D2`
- **Glow :** `rgba(33, 150, 243, ...)` — box-shadow et backgrounds

### 1. Canvas particules (`js/ocean.js`)
- Module ES, s'enregistre sur `window.Ocean` (pattern `window.Canvas`)
- Crée `<canvas id="ocean-canvas">` inséré comme premier enfant de `<body>`
- **Bulles :** 12, r=6-20px, alpha très faible, montent avec wobble sinusoïdal
- **Plancton :** 25, r=0.5-2.7px, glow radial, drift lent
- **Fond :** gradient radial — dark: bleu profond, light: bleu ciel très clair
- **Thème :** détecte dark/light/auto via `setOnThemeChange()`
- **Perf :** rAF continu, resize handler, pas d'opérations lourdes
- **v3.2+ :** suspendu pendant le streaming (setPaused) pour libérer le CPU

### 2. Glassmorphism (`css/ocean.css`)
- Sidebar + right-panel : 82% opaque + blur 14px
- Input area : 78% opaque + blur 14px
- Modales : 90% opaque + blur 20px
- Dropdowns : 92% opaque + blur 16px
- Overlays : rgba(0,0,0,0.18) + blur 4px
- Thinking block : 55% opaque + blur 14px

### 3. Animations
- **Whale breathing :** `ocean-whale-breathe` 4s sur tous les logos
- **Ripple :** `ocean-ripple-out` 0.7s au clic sur input-wrapper, buttons
- **Wave transitions :** `cubic-bezier(0.23, 1, 0.32, 1)` sur panels

### 4. Splash screen
- Fond gradient abysses profond
- Halos bioluminescents `::before`
- 4 gouttes d'eau animées `::after` + box-shadow
- Logo breathing + texte bleu clair

---

## UI LAYOUT

### 3 panneaux flex
```
[Sidebar 240px] | [Main flex:1] | [Right Panel 280px]
```

### Sidebar (gauche)
Logo Cetas + titre + version + crédit → Dev modules → Nouvelle conversation → Favoris ★ → Catégories → Recherche → Liste conversations → Avatar user + dropdown (Rôles, Prompts, Sauvegardes, Déconnexion) → Config

### Main content
Chat container (messages centrés max 800px) → Token bar (export MD/HTML, résumé, tokens, coût) → Input area (textarea + boutons + menu "+")

### Menu "+" (plus-menu-dropdown)
Modèles (texte/image/search), Réflexion toggle, Effort (Faible/Moyen/Max), Compétences, Recherche web

### Right panel (paramètres conversation)
Onglet Général : rôle, images, effort, température, top_p, max_tokens, pénalités, params avancés
Onglet Image : format, qualité, nombre, fond, format sortie, compression, modération, taille, raisonnement

### Modales
Configuration (API, Fonctionnalités, Budget, Apparence, Stockage, Utilisateurs, Conversation, FAQ, Statistiques, Partager)
Rôles, Prompts, Catégories, Alertes budget/no-model, Lightbox, Login, User management

---

## INITIALISATION JS (app.js)

### Ordre de boot (v3.5)
1. `Auth.init()` → authentification
2. `initConfig()` → charge stores + providers (syncKeysFromProxy si proxy actif)
3. `rebuildModelLists()` + fetchLocalModels()
4. `refreshConvList()` → charge conversations depuis IndexedDB (conversations.js)
5. `syncPullFromServer()` → sync inter-appareils (GET /api/conversations) — skip si pas de token
6. `window.__kiroSplashReady()` → cache le splash screen (min 1.8s)
7. `refreshCatBar()` (categories.js), `importDefaultSystemPrompts()`, `refreshSpList()` (roles.js), `refreshPrList()` (prompts.js)
8. Restaure dernier modèle + dernière conversation
9. Init Ocean (`window.Ocean.init()`)

### Points d'injection (v3.5)
- **Scripts globaux** : chargés après `app.js` (module ES). Les `const`/`let` modules sont inaccessibles → fonctions partagées sur `window` (escHtml, escHtmlAttr, openApiKeysModal, refreshConvList, highlightActiveConv)
- **Defer** : `right-panel.js`, `model-catalog.js` s'exécutent après le parse DOM mais avant `app.js`
- **Theme callback :** `setOnThemeChange()` (theme.js) — dans app.js section thème
- **Ocean init :** après initCanvas, dans app.js section fond océanique
- **Splash signal :** `window.__kiroSplashReady()` défini dans index.html, appelé après refreshConvList
- **Modules callback pattern :** `setXxxCallbacks({...})` puis `initXxx()` — utilisé par categories, roles, prompts, export-import


---

## OPTIMISATIONS PERFORMANCE (v3.2+)

### createStreamRenderer (app.js)
- **Debounce 80ms** : le buffer accumulate les chunks, rendu toutes les 80ms max
- **Seuil 20 chars** : pas de rendu pour des micro-chunks (<20)
- **Pacing supprimé** : fini le découpage char-par-char avec délais 5-40ms
- **Gain :** ~89% d'appels à `marked.parse()` en moins

### Redondances supprimées (app.js onDone)
- `sr.flush()` et `thinkSr.flush()` font déjà le rendu markdown → les `marked.parse(fullResponse)` et `marked.parse(fullThinking)` qui suivaient étaient dupliqués
- 3 endroits nettoyés (sendMessage, regen text, regen text edit)

### Canvas Ocean suspendu
- `ocean.js` : flag `_paused`, le rAF continue mais ne dessine pas
- Pause au début du stream, reprise dans `endStreaming()` et bouton Stop

---

## AMÉLIORATIONS UX (v3.2+)

### Animations dropdown
- Menu `+`, menu utilisateur, selects, partage, copie : **fadeIn** (0.1s à 0.15s)
- Avant : snap instantané. Maintenant : apparition progressive

### Feedback tactile
- États `:active` avec `scale(0.92-0.98)` sur tous les boutons interactifs
- Sensation de pression au touché (mobile)

### Tailles tactiles (mobile)
- Bouton `+` : 28px → **36px**
- Bouton d'envoi mobile : 32px → **40px**
- Actions conversation : padding augmenté
- Toggle sidebar : padding 8px 10px

### Scroll au focus (mobile)
- Quand l'utilisateur tape dans l'input sur mobile → scrollToBottom différé 300ms
- Permet de voir le dernier message de l'assistant pendant la saisie

### Polices mobiles
- Messages : `0.88rem` (<768px), `0.82rem` (<380px)
- Champ saisie : `15px` (mobile)
- Problème corrigé : les règles mobiles étaient écrasées par les règles de base dans le CSS

### Autres
- `overflow-wrap: break-word` + `hyphens: auto` sur les messages (pas de débordement)
- Contrastes corrigés (recherche conversations, hint input)
- Z-index harmonisés (lightbox 9000→10002, menu utilisateur conflit résolu)
- Bouton TTS simplifié : lecture directe en un clic (plus de menu contextuel)
- Micro : ajout du support STT OpenRouter (Whisper) + reconnaissance vocale navigateur (SpeechRecognition API, gratuit sans clé)

---

## AUDIT & OPTIMISATIONS (v3.2+)

### Audit complet (33 findings)
Lancé le 18/07/2026 : 3 critiques, 14 hautes, 15 moyennes, 1 basse.

### Stabilité (crash fixes)
- `catSelect` null guard → bloquait tout app.js si élément DOM absent
- `conv-item-title` optional chaining → TypeError dans la recherche
- `manage-list-item-name` null guards → TypeError dans rôles/prompts
- `clipboard.writeText()` → `.catch()` ajouté sur 3 appels (rejections non rattrapées)

### Performance
- **IndexedDB** : connexion mise en cache (singleton au lieu d'ouvrir/fermer à chaque appel)
- **getModelEditeur()** : lookup O(1) via Map au lieu de MODELS.find() O(N) appelé ~30× par action
- **Shimmer animations** : `will-change: background-position` sur les 3 animations (generation-placeholder, streaming, enhance)
- **send-btn:active** : double `transform` supprimé (scale(0.92) écrasé par scale(1.05))

### CSS mobile — refonte complète
- 12 font-sizes différentes → 3 niveaux cohérents (primaire 0.88rem, secondaire 0.78rem, petit 0.72rem)
- Touch targets normalisés à 40px minimum (sidebar, modales, boutons d'action)
- Sidebar, messages, input, modales, panneaux de config : mêmes espacements, mêmes ratios
- Variables CSS mobiles (`--m-font-primary`, `--m-space-md`, `--m-touch-min`)

### SamAgent
- Sélection aléatoire des modèles (`Math.random()` au lieu de round-robin)
- Nouveau modèle OpenRouter Whisper pour le micro (STT)
- Routeur LLM : fallback automatique si DeepSeek classifieur down

---

## SÉCURITÉ

- **Clés API :** `.env` gitignoré, chiffré AES-GCM via vault
- **Vault :** `.vault/.enc` gitignoré, déchiffré avec `CETAS_VAULT_PASSWORD`
- **Proxy :** Python decrypte et relaye — le navigateur ne reçoit jamais les clés si proxy actif
- **Hash mots de passe :** PBKDF2 (600k itérations, sel 128-bit) pour le fallback client-side + scrypt (N=16384) côté serveur
- **Upgrade auto :** SHA-256 → PBKDF2 (client) et SHA-256 → scrypt (serveur) au login — transparent
- **Admin par défaut :** flag `must_change_password` détecté automatiquement si mot de passe = `admin`
- **Headers sécurité :** X-Frame-Options DENY, X-Content-Type-Options nosniff (proxy)
- **iframe sandbox :** file-viewer isolé (`sandbox="allow-scripts"`)
- **Sync auto :** `syncKeysFromProxy()` dans api.js → clés en mémoire, localStorage ignoré
- **Legacy keys cleanup :** `minou-apikeys` supprimé automatiquement après migration vault
- **Seed users :** `core/users-seed.json` gitignoré
- **Git :** zéro fichier sensible commité (vérifié par scan regex)
- **CSP :** Content-Security-Policy dans index.html

### Clés API chargées
- Au démarrage du proxy : 5 clés déchiffrées du vault et chargées en mémoire Python
- Providers disponibles : DeepSeek, Google (Gemini), + 3 autres
- DeepSeek testé : TTFB ~300ms, 60 tokens/s
- Google Gemini testé : TTFB ~14s (latence API Google, pas lié à l'app)

---

## .gitignore

| Fichier | Raison |
|---------|--------|
| `.env` | Clés API chiffrées |
| `.vault/` | Coffre-fort chiffré |
| `core/` | Code natif + users-seed |
| `proxy/*.bak` | Backups |
| `js/*.bak` | Backups |
| `PriveDoc.md` | Docs privée (mots de passe, chemins) |
| `memory_session.md` | **NON gitignoré** (commitable) |

---

## MÉMOIRE CLAUDE

Les mémoires persistent de session en session :
- **Fichier mémoire :** `/home/sam/.claude/projects/-home-sam-kiro/memory/session-proxy-security.md`
- **Index :** `MEMORY.md` dans le même dossier
- Contient : état du proxy, sync auto, modèles Groq/Nvidia, nettoyage seed

---

## GIT

- **Branche :** `feat/auth-server-side` → origin/feat/auth-server-side
- **Main branch :** `main`
- **Remote :** `git@github.com:Hajrudin-Zelef/Cetas-WebUi.git` (SSH)
- **Conventions :** feat:/fix:/refactor:/chore: en français + `Co-Authored-By: Claude <noreply@anthropic.com>`
- **Auteur :** `sam` — `sam@cetas.local`

---

## PROXY BACKEND (server.py)

- **Port :** 8080 (Python http.server, pas de framework)
- **Démarrage :** déchiffre les clés du vault → les garde en mémoire (AESGCM, dict `api_keys`)
- **Streaming :** lit la réponse upstream en chunks de 4KB → flush immédiat vers le client
- **Pas de décryptage par requête** : les clés sont en mémoire dès le démarrage
- **Endpoints :** `/api/proxy/{provider}/...` (POST/GET), `/api/conversations/...` (CRUD), `/api/keys` (GET/HEAD), `/api/health` (GET)
- **CORS :** `Access-Control-Allow-Origin: *` sur toutes les réponses
- **Connection upstream :** nouvelle connexion HTTPS par requête (pas de connection pooling)

---

## BACKUPS

- **Répertoire :** `/home/sam/backups/`
- **Format :** `cetas-YYYY-MM-DD_HHhMM`
- Dernier backup : 15/07/2026

---

## PROBLÈMES CONNUS ET SOLUTIONS

### Classifieur sécurité indisponible
Le modèle deepseek-v4-pro/flash (classifieur) est parfois down. Les commandes Bash destructives (docker, git commit) sont bloquées. **Solution :** l'utilisateur tape `! <commande>` ou lance directement dans le terminal.

### Rebuild change JWT secret
Chaque rebuild Docker régénère le secret JWT (sauf si `_users.json` est sur le volume). Les tokens en sessionStorage deviennent invalides. **Solution :** clear sessionStorage + re-login après chaque rebuild.

### Vault uid mismatch
Le vault sur l'hôte appartient à uid 1001. Le container doit avoir un user avec uid 1001 (Dockerfile `-u 1001`). Si pas aligné → "Vault introuvable" ou "Permission denied".

### Terser cache Docker
Docker peut cacher les couches COPY même si les fichiers JS sont modifiés. **Solution :** `docker build --no-cache` quand les changements JS ne sont pas reflétés.

### Double encodage URL conversations
Les noms de fichiers avec espaces sont URL-encodés (`%20`) sur le serveur. Le frontend les ré-encode en `%2520`. **Fix :** `encodeURIComponent(decodeURIComponent(fn))` dans syncPullFromServer et syncDeleteFromServer.

### clean-css warning
style.css ligne 4774 a `@starting-style` non supporté par clean-css. Non bloquant.

### Scope isolation ES modules vs scripts globaux
Les `const`/`let` définis dans `app.js` (module ES) sont invisibles des scripts globaux (config-providers.js, conversations.js, etc.). **Règle :** toute fonction/variable partagée doit être exposée sur `window` par app.js. Les scripts globaux peuvent définir leurs propres variables locales (ex: `apikeysModalOverlay` dans config-providers.js).

### 401 avant login
`syncPullFromServer()` peut être appelé avant `Auth.init()` (event listeners focus/visibilitychange). Un guard `if (!headers['Authorization']) return 0;` évite les 401 inutiles dans la console.

### canvas.js commenté
La feature Canvas (code preview) est désactivée. Garder le placeholder `window.Canvas` pour compatibilité.

### Préfixe `minou-`
Vestige Kiro dans localStorage (`minou-theme`, `cetas-last-conv`). Ne pas renommer.

---

## COMMANDES RAPIDES

```bash
# Build + déploiement
docker build -t cetas:latest . && docker rm -f cetas-webui && docker run -d --name cetas-webui --restart unless-stopped -p 8080:80 -v cetas-data:/usr/share/nginx/html/conversations -v cetas-data:/app/data -e CETAS_VAULT_PASSWORD='Yoroboul2026!+' cetas:latest

# Commit + push
git add -A && git commit -m "feat: message" && git push

# Pull
git pull
```

---

## REFACTOR v3.4 — SPLIT `app.js` EN MODULES (20/07/2026)

> **Commit** : `8e472d6` | **Status** : Déployé | **Fichiers** : 13 (4 nouveaux modules + 7 modules existants réintégrés + Dockerfile + app.js)

### Résumé

`app.js` dépassait 11,000 lignes. Split en 14 modules ES indépendants via un pattern callback (`setXxxCallbacks()` → `initXxx()`). Aucune casse — build Docker OK, zéro erreur console.

### Modules extraits (session 20/07)

| Module | Lignes | Contenu |
|---|---|---|
| `categories.js` | 389 | Catégories + popup management (refreshCatBar, openCatModal, renderCatManageList...) |
| `roles.js` | 330 | Rôles/personas CRUD (refreshSpList, openSpModal, deleteSpItem...) |
| `prompts.js` | 195 | Prompts enregistrés CRUD (refreshPrList, openPrModal...) |
| `export-import.js` | 176 | Export/import sauvegardes JSON (exportBackup, importBackup) |

### Modules existants (réintégrés après crash)

| Module | Lignes | Contenu |
|---|---|---|
| `budget.js` | 143 | Suivi budget + alertes |
| `emoji-picker.js` | 142 | Sélecteur d'emojis |
| `export-md.js` | 250 | Export Markdown / HTML |
| `favorites.js` | 88 | Conversations favorites |
| `user-management.js` | 125 | Gestion utilisateurs admin |
| `web-search.js` | 78 | Bouton recherche web |
| `whisper.js` | 172 | Dictée vocale (Whisper) |

### Résultat

- `app.js` : 10,381 → **9,458 lignes** (−923, −8.9%)
- Pattern d'extraction : chaque module exporte `setXxxCallbacks(cbs)` + `initXxx(...)` + fonctions métier
- Dépendances globales (api.js, filemanager.js) restent accessibles sans import
- Dépendances app.js → callback (customConfirm, customAlert, showModelAlert...)

### Dockerfile

4 nouvelles entrées `terser` ajoutées pour les nouveaux modules (categories, roles, prompts, export-import).

### Plan

Le plan complet est archivé dans `split-appjs-plan.md` (racine). Sections non extraites car trop couplées : config providers (~1,900 lignes), model selector (~646 lignes), conversations list (~600 lignes).

---

## v3.5 — EXTRACTION MODULES DE app.js (23/07/2026)

> **Commits** : `1c528b8` → `9f9df47` | **Status** : Déployé | **Fichiers** : 9

### Résumé

`app.js` passé de ~9,458 à ~5,304 lignes (−44%). 5 blocs majeurs extraits comme scripts globaux.
Les modules ES ont un scope isolé → fonctions partagées exposées sur `window`.

### Modules extraits

| Module | Lignes | Type | Description |
|---|---|---|---|
| `config-providers.js` | 2,126 | Script global | Providers, clés API, modèles, budget |
| `conversations.js` | 605 | Script global | Liste conversations, favoris, recherche |
| `right-panel.js` | 658 | Script global (defer) | Paramètres conversation |
| `plus-menu.js` | 459 | Script global | Menu "+" sélecteur modèles |
| `model-catalog.js` | 415 | Script global (defer) | Catalogue OpenRouter |

### Script loading order (v3.5)

1. Libs : pdf.min.js, marked.umd.min.js, purify.min.js, jszip.min.js
2. Globals : models.js → api.js → filemanager.js → faq.js → auth.js → router.js
3. Globals defer : right-panel.js, model-catalog.js
4. Globals post-defer : images/ee.js
5. Modules ES (deferred) : ocean.js → app.js
6. Globals post-module : config-providers.js, conversations.js, plus-menu.js

### Correctifs

| Commit | Fix |
|---|---|
| `8d814e9` | Références DOM manquantes dans modules extraits |
| `dbc51ad` | window.escHtml, window.escHtmlAttr, window.openApiKeysModal |
| `90fbf19` | ReferenceError (STATE, escHtml, HIDDEN_EDITEURS) |
| `d5d2b8c` | apikeysModalOverlay dans config-providers.js |
| `9f9df47` | syncPullFromServer skip si pas de token (évite 401) |

### Pattern window

Les `const`/`let` des modules ES sont invisibles des scripts globaux.
app.js expose sur `window` : escHtml, escHtmlAttr, openApiKeysModal, refreshConvList, highlightActiveConv.

---
## v3.5 — CSS MODULAIRE + SÉCURITÉ RENFORCÉE (23/07/2026)

> **Commit** : `53229ba` | **Status** : Déployé | **Fichiers** : 14 (8 CSS modules + 5 modifiés + Dockerfile)

### Résumé

1. **CSS modulaire** : `style.css` (9823 lignes) découpé en 8 modules via `@import`. Cascade préservée, diff exact. Au build Docker, les modules sont concaténés puis minifiés (cleancss). En dev, le navigateur charge les 8 fichiers via `@import`.

2. **Sécurité renforcée** :
   - **PBKDF2** : remplace SHA-256 pour le hash des mots de passe (fallback client-side). 600k itérations, sel 128-bit aléatoire. Upgrade auto des anciens hashs SHA-256 au premier login.
   - **must_change_password** : détection automatique du mot de passe admin par défaut. Flag propagé via `_createSession` et `_propagateFlags`. Nettoyé après `changePassword`.
   - **Headers sécurité** : `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff` sur toutes les réponses du proxy.
   - **iframe sandbox** : `sandbox="allow-scripts"` sur le file-viewer.
   - **Legacy keys** : warning + tentative de migration immédiate dans `loadApiKeys()` si le coffre est prêt.

### Fichiers créés
| Fichier | Lignes | Contenu |
|---|---|---|
| `css/variables.css` | 301 | Splash + variables thème (:root) |
| `css/layout.css` | 1709 | Sidebar, panneau rôle, modales, conversations |
| `css/chat.css` | 1745 | Main, chat, messages, streaming, saisie |
| `css/components.css` | 3001 | Config, prompts, emoji, raisonnement, lightbox, budget, FAQ |
| `css/canvas.css` | 610 | Canvas + vues + prévisualisation |
| `css/catalog.css` | 507 | Catalogue modèles + OpenRouter |
| `css/storage.css` | 1489 | Toast, panel stockage, auth, onboarding |
| `css/menu.css` | 461 | Menu "+" + rendu compact |

### Fichiers modifiés
| Fichier | Changement |
|---|---|
| `index.html` | iframe sandbox, pas de frame-ancestors dans `<meta>` (ignoré) |
| `js/auth.js` | PBKDF2, _verifyPassword rétrocompatible, must_change_password, _bootstrapUsers appelé |
| `js/api.js` | Warning + tentative migration legacy keys |
| `proxy/server.py` | X-Frame-Options, X-Content-Type-Options |
| `Dockerfile` | Concat CSS modules avant cleancss |

### Points d'attention
- **Docker build** : les modules CSS sont concaténés dans l'ordre de cascade. Ne pas changer l'ordre sans vérifier les dépendances.
- **Rétrocompatibilité** : `_verifyPassword` gère les anciens hashs SHA-256 (détection : pas de `:` dans le hash). Upgrade automatique et transparent.
- **must_change_password** : le flag est stocké dans `cetas-users` (localStorage) et propagé au login. `needsPasswordChange()` expose l'état dans l'API publique Auth.

### Correction stabilité (23/07/2026 — post-audit)

> **Commit** : `6a53f7b` → `90b364e` | **Fichiers** : 4

5 bugs corrigés (risque faible/moyen) :
- `passwordInput` null check manquant → crash si DOM incomplet
- Fuite Object URL sur clics multiples des fichiers joints
- `pagehide` sans `flushPendingWrites()` → perte écriture IndexedDB sur iOS Safari
- `.catch()` manquant sur `writeConversationFile().then()`
- `_writeUsers()` sans try/catch → `QuotaExceededError` bloquait l'app

Handler global `unhandledrejection` : capture toute rejeton non gérée → `console.warn` + toast 4s non-bloquant. Filet de sécurité — pas de crash silencieux.

---

## BRANCHE `feat/auth-server-side` — MIGRATION AUTH SERVEUR + AUDIT SÉCURITÉ (18/07/2026)

> **Commit** : `824fee3` | **Status** : Mergé et déployé | **Fichiers modifiés** : 7 (+ `Dockerfile`, `.dockerignore`, 4 libs CDN locales)

### Résumé

Migration complète de l'authentification côté serveur (JWT) + 13 corrections de sécurité issues d'un audit complet.
Avant : auth 100% client-side dans localStorage. Après : auth JWT serveur avec fallback localStorage pour migration transparente.

### Auth serveur — Architecture

```
Navigateur → POST /api/auth/login {username, password} → Proxy Python
             ← {token: "jwt...", user: {...}}

Navigateur → GET /api/conversations + Authorization: Bearer <jwt> → Proxy Python
             ← Validation JWT → extraction username → accès données
```

- **JWT** : PyJWT 2.7.0, algorithme HS256, secret aléatoire 256-bit persisté dans `_users.json`
- **Hash mots de passe** : scrypt (N=16384, r=8, p=1) avec sel aléatoire 16 bytes, format `scrypt$<salt_hex>$<hash_hex>`
- **Migration auto** : SHA-256 → scrypt au login réussi (hachage transparent sans intervention utilisateur)
- **Token** : 7 jours, stocké dans `sessionStorage` (clé `cetas-token`)
- **Fallback** : si serveur injoignable, fallback localStorage pour migration transparente

### Nouveaux endpoints API

| Endpoint | Méthode | Auth | Description |
|----------|---------|------|-------------|
| `/api/auth/login` | POST | Aucune | Login, retourne JWT |
| `/api/auth/register` | POST | Aucune | Création compte (1er user = admin auto) |
| `/api/users` | GET | Admin JWT | Liste utilisateurs |
| `/api/users/<name>` | PUT | Admin/Self JWT | Modifier utilisateur |
| `/api/users/<name>` | DELETE | Admin JWT | Supprimer utilisateur |
| `/api/proxy/*` | GET/POST | **JWT requis** | Proxy LLM protégé |

### Modifications clés

#### proxy/server.py (+306 lignes)
- Imports : `hashlib`, `jwt`, `datetime`, `urllib.parse.unquote`
- Rate limiting : max 10 login/min/IP, 5 register/min/IP (fenêtre glissante 60s)
- Auth middleware : `_get_authenticated_user()` (JWT), `_require_admin()` (JWT + role)
- Headers JWT : `_getAuthHeaders()` → `Authorization: Bearer <token>`
- Protection : `/api/keys` admin-only, `/api/proxy/*` JWT required
- Cache : TTL 1h sur `_conv_cache`, éviction automatique
- Stockage : `_users.json` dans `/app/data/` (hors racine web nginx)
- HEAD : `do_HEAD()` délégué à `do_GET()` (HEAD `/api/keys` retournait 501)
- Suppression header legacy `X-Cetas-User`

#### js/auth.js (réécriture ~373 lignes)
- `login()` → POST serveur, fallback localStorage pour migration
- `getToken()` → expose le JWT aux autres modules
- `init()` → restaure token JWT, vérifie expiration
- `createUser/updateUser/deleteUser/listUsers` → API serveur avec fallback localStorage
- Token helpers : `_getToken()`, `_setToken()`, `_clearToken()`, `_decodeJwtPayload()`
- `_fetchJSON()` → helper fetch avec JWT automatique
- Vault inchangé (PBKDF2 + AES-256-GCM)

#### js/filemanager.js (sync réécrite)
- `_getAuthHeaders()` → JWT Bearer, plus de fallback X-Cetas-User
- `syncPushToServer/syncPullFromServer/syncDeleteFromServer` → JWT dans headers
- **Réconciliation delete** : compare liste locale vs serveur, supprime les conversations locales absentes
- Fix double encodage : `encodeURIComponent(decodeURIComponent(fn))` sur pull/delete
- Fix transaction IndexedDB : transactions séparées par opération (`_syncPutConv`, `_syncGetConv`, `_syncDelConv`)
- `_syncListKeys()` → liste toutes les clés IndexedDB pour réconciliation

#### js/api.js (JWT proxy)
- `proxyHeaders()` → injecte JWT après avoir strippé l'Authorization provider
- `syncKeysFromProxy()` → JWT dans le header Authorization
- `refreshOrCacheSilently()` → JWT pour catalogue OpenRouter
- Tous les appels proxy (streamModel, images, TTS, transcriptions) → `proxyHeaders()`
- HEAD `/api/keys` accepte 401/403 comme "proxy disponible"
- Suppression fallback localStorage en clair (`minou-apikeys`)

#### Docker
- **Dockerfile** : user non-root `cetas` (uid 1001), PyJWT via pip, répertoire `/app/data`
- **start.sh** : proxy lancé sous user `cetas`, chown automatique, chmod vault
- **.dockerignore** : exclut `.git`, `node_modules`, backups, logs, captures
- **Volumes** : `cetas-data` monté sur `/usr/share/nginx/html/conversations` ET `/app/data`
- **Vault** : monté depuis hôte `-v /home/sam/kiro/.vault:/usr/share/nginx/html/.vault`
- **.env** : monté depuis hôte `-v /home/sam/kiro/.env:/usr/share/nginx/html/.env`

#### CDN → bundles locaux
- DOMPurify 3.4.1 → `js/purify.min.js` (24KB)
- marked 18.0.2 → `js/marked.umd.min.js`
- JSZip 3.10.1 → `js/jszip.min.js`
- pdfjs-dist 3.11.174 → `js/pdf.min.js`
- CSP nettoyé : retrait `cdn.jsdelivr.net`

### Commandes Docker (branche feat/auth-server-side)

```bash
# Build
docker build -t cetas:latest .

# Déploiement complet avec volumes
docker rm -f cetas-webui
docker run -d --name cetas-webui --restart unless-stopped \
  -p 8080:80 \
  -v /home/sam/kiro/.vault:/usr/share/nginx/html/.vault \
  -v /home/sam/kiro/.env:/usr/share/nginx/html/.env \
  -v cetas-data:/usr/share/nginx/html/conversations \
  -v cetas-data:/app/data \
  -e CETAS_VAULT_PASSWORD='Yoroboul2026!+' \
  cetas:latest
```

### Problèmes connus (branche)

- **Rebuild change JWT secret** → tokens périmés → clear sessionStorage + re-login obligatoire
- **Vault uid mismatch** : hôte uid 1001, container cetas uid 1001 (aligné via Dockerfile `-u 1001`)
- **Terser cache Docker** : `--no-cache` nécessaire si les fichiers JS ont changé mais Docker utilise le cache

### Comptes (production)

| Utilisateur | Rôle | Hash |
|-------------|------|------|
| `admin` | admin | scrypt (voir PriveDoc.md pour creds) |
| `sam` | admin | scrypt |

> **Note sécurité** : Les mots de passe en clair sont dans `PriveDoc.md` (gitignoré).

### Corrections d'audit (13 fixes)

| # | Fix | Niveau | Fichier |
|---|-----|--------|---------|
| 1 | Proxy LLM protégé par JWT | SAFE | server.py |
| 2 | Rate limiting login/register | SAFE | server.py |
| 3 | `/api/keys` admin-only | SAFE | server.py |
| 4 | JWT secret indépendant (pas dérivé de proxy_key) | SAFE | server.py |
| 5 | Suppression header X-Cetas-User legacy | SAFE | server.py + filemanager.js |
| 6 | .dockerignore | SAFE | .dockerignore |
| 7 | Cache conversations TTL 1h | SAFE | server.py |
| 8 | SHA-256 → scrypt + migration auto | MODÉRÉ | server.py |
| 9 | users.json dans /app/data/ (hors web) | MODÉRÉ | server.py + Dockerfile |
| 10 | Suppression fallback localStorage clés en clair | MODÉRÉ | api.js |
| 11 | Docker non-root (user cetas) | MODÉRÉ | Dockerfile + start.sh |
| 12 | CDN → bundles locaux (DOMPurify, marked, jszip, pdfjs) | MODÉRÉ | index.html + js/*.min.js |
| 13 | JWT sur tous les appels proxy (fix streamModel etc.) | HOTFIX | api.js |


---

## v3.6 — SAMAGENT 4 TIERS + CLOUDFLARE WORKER ANTI-SPOF (24/07/2026)

> **Commits** : `cd5eac9` → `14d6e2f` | **Status** : Déployé | **Fichiers** : 4 majeurs (router.js, api.js, cloudflare-worker.js, wrangler.toml)

### SamAgent — Routeur intelligent

`js/router.js` (~509 lignes). 4 tiers, 3 niveaux de fallback.

| Modèle | Tier | Score | Providers | Spécialité |
|--------|------|-------|-----------|------------|
| `samagent-nano` | Nano | 0-33 | Groq, Nvidia, Google | 18 modèles flash/lite, ultra-rapide |
| `samagent-n4-flash` | N4 Flash | 34-66 | OpenRouter | Gratuits OR, 10 modèles |
| `samagent-n4` | N4 | 34-66 | OpenRouter | Payants ≤$1.50/M, 13 modèles |
| `samagent-n8` | N8 | 67-100 | DeepSeek direct + OpenRouter | Flagship 2026, 17 modèles uniques |

**Nano** : 100% flash/nano/lite. Groq+Nvidia+Google. Pas de DeepSeek.
**N8** : 100% 2026 (sauf r1-0528+qwen3-max). Chat: flashs OR. Coder: kat-coder+grok-build+DS pro. Raiso: r1+mercury+trinity+nemotron-ultra.

**Fallback 3 niveaux :** primary → fallback → _nextFallback. streamModel propage la chaîne.
- Nano : Groq → Nvidia → Google (3 providers)
- N8 : OR → DS → autre OR (cross-provider loop)
- N4 : OR → DS₁ → DS₂ (3 DS différents)

**Stabilité :** 99.99% Nano, 99.75% N4/N8 (uptime 95%). Pire cas (80%): 99.2% Nano, 96% N4/N8.

### Routeur — Optimisations stabilité

- ROUTER_LLM_POOL réduit 5→2 (DeepSeek Chat + Gemini Flash Lite)
- Timeout 5s sur _fetchRouterLLM (AbortSignal)
- Skip LLM router pour Nano (score toujours ≤33)
- Stabilité pire cas : 96%-99.9%

### Cloudflare Worker — Backup anti-SPOF

**Fichier :** `proxy/cloudflare-worker.js`
**URL :** `cetas-backup.angeoulai2015.workers.dev`
**Config :** `proxy/wrangler.toml`

Worker de backup sur Cloudflare Workers (gratuit). Prend le relais si le proxy Python est down.

- **Détection :** health check `/api/health` toutes les 30s (api.js)
- **Bascule :** automatique via `proxyUrl()` / `proxyHeaders()` adaptatifs
- **Protection :** token partagé `x-cetas-token` (Cloudflare Secret CETAS_TOKEN)
- **Secrets :** DEEPSEEK_API_KEY, OPENROUTER_API_KEY, CETAS_TOKEN
- **Limites :** 100K req/jour, CPU 10ms, streaming illimité

### nginx.conf

Cache assets passé en `no-cache` + `expires -1` (SPA, déploiements fréquents).

### Commits v3.6

```
14d6e2f feat: Cloudflare Worker fallback — anti-SPOF proxy
0fe357f perf: routeur ultra-stable — timeout 5s, fallback 3 niveaux, 96-99.9%
4685264 feat: SamAgent N8 flagship — 100% 2026, DeepSeek↔OpenRouter
fc16749 fix: désactive cache agressif assets (SPA)
236f425 feat: SamAgent Nano ultra-rapide — Groq+Nvidia+Google
a99ad9d fix: utilise var + fonctions nommées pour éviter collisions terser
3e3ac4f fix: streamText utilise proxyUrl + proxyHeaders (évite 401)
b9b66a3 fix: corrige double déclaration const textCache/imageCache
95d42fd fix: auto-enable tous les modèles des pools N4 Flash + N4
cd5eac9 feat: SamAgent N4 Flash (free OR) + N4 (paid OR) + fallback DeepSeek
```

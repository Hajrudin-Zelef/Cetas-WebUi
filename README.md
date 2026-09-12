# Cetas

*Assistant IA multi-modèles* — Interface de chat privée, sécurisée et gratuite. Interface en français.

By **Marexsoft Corporation** — Fondateur : **Kouassi Marius**

---

## Aperçu

Cetas est une alternative aux assistants IA propriétaires. Les clés API restent sous votre contrôle — le proxy backend ne les expose jamais au frontend.

## Fonctionnalités

### Chat & Modèles
- **SamAgent** — routeur intelligent multi-tiers : accueil chaleureux avec propositions cliquables, fallback 3 niveaux, rotation aléatoire dans des pools de modèles — aucun point de défaillance unique
- **17 providers supportés** : OpenAI, Anthropic, Google, Mistral, DeepSeek, Grok/xAI, Z.ai/GLM, Perplexity, OpenRouter, Groq, Nvidia, Cabreras, OpenCode (Zen + Go) + modèles locaux (Ollama, LM Studio, LlamaCpp)
- **~80 modèles IA** : GPT-5.6, Claude Fable 5, Gemini 3.6, DeepSeek V4, Grok 4.5, etc.
- **Génération d'images** : GPT Image 2, Gemini (Nano Banana)
- **Synthèse vocale (TTS)** : OpenAI, Google, Mistral, Nvidia, système
- **Transcription audio (STT)** : Navigateur natif, OpenAI Whisper, OpenRouter, Google, Mistral
- **Recherche web** : Perplexity Sonar + outils natifs des providers — citations cliquables
- **Raisonnement visible** : thinking blocks pour Anthropic, DeepSeek, OpenRouter
- **Mode réflexion** : toggle pour activer/désactiver le mode reasoning

### Expérience utilisateur
- **Thème océanique** : canvas animé (bulles montantes + planctons bioluminescents), glassmorphism
- **Splash screen** : fond gradient abysses, halos bioluminescents
- Interface modulaire (sidebar, chat, panneau configuration)
- Thème clair / sombre / automatique, sans flash au chargement
- Messages en markdown avec coloration syntaxique, blocs de code
- **Bulles de chat améliorées** : max-width 75%, labels "Vous" / "Marexcode", espacement 14px
- **Tableaux markdown** : bordures arrondies, fond alterné, padding généreux
- Streaming temps réel — rendu optimisé
- PWA installable, mode hors-ligne via service worker

### Marexcode — Assistant de code
- **Outils complets** : `Ls` (arborescence), `Read` (pagination offset/limit), `Write` (avec détection existed), `Edit` (diff unifié), `Grep` (limite configurable, ignore binaires), `Bash` (timeout configurable), `Glob` (recherche par pattern)
- **Tool loop refactoré** : boucle sans cap d'itérations, déduplication des tool calls (Bash exclu), nudge si modèle bloque (max 2), overflow retry avec tools désactivés, `parallel_tool_calls=false`
- **Mémoire persistante** : 5 outils (`mem_search`, `mem_read`, `mem_add`, `mem_edit`, `mem_delete`), stockage par session dans `{workspace}/memory/{session_id}/`, index `MEMORY.md` auto-maintenu
- **LSP** : intelligence code via Language Server Protocol (pyright, typescript-language-server, bash-ls, html/css/json-ls) — hover tooltips dans le file viewer
- **MCP** : 4 serveurs connectés (context7, fetch, memory, filesystem = 26 tools) — injection dynamique au boot
- **Custom Tools** : outils user-defined via `tools.json` — auto-extraction des paramètres `{name}`
- **Formatters** : auto-format après Write/Edit (ruff pour Python, prettier pour JS/TS/JSON/CSS/HTML/MD)
- **Undo/Redo** : journal `undo_log.json` (max 50 entries), boutons ↩ ↪, Ctrl+Z/Y
- **WebSearch** : backend `websearch.py` — 6 providers en cascade (Tavily → Exa → Brave API → Jina → SearXNG → DuckDuckGo), icône globe toggle, native pour OpenRouter
- **Skills system** : 54 skills OpenCode avec modes auto/manual/on_demand, injection dans le system prompt
- **Multi-workspaces** : chaque upload crée un workspace séparé, activation via sidebar
- **Profile/stats** : page profil avec token counts, chats, série active, top model, heatmap 30 jours
- **Memory system** : mémoire locale persistante (`memory.md`), toggle activation/capture
- **Instructions** : instructions globales + par projet (MAREXCODE.md)
- **Slash Commands** : 12 commandes built-in (`/help`, `/clear`, `/model`, `/undo`, `/redo`, `/compact`, `/init`, `/mcp`, `/cost`, `/workspace`, `/skills`, `/diff`) + autocomplete dropdown
- **TodoWrite** : planification multi-étapes live dans le fil de chat (statuts pending/in_progress/completed)
- **Images** : drag & drop + Ctrl+V paste, preview avec bouton ✕, content array pour vision models
- **Blocs d'outils collapsibles** dans le fil de chat : badge Bash jaune, diff vert/rouge pour Write/Edit
- **Todo-list live** + ligne de statut (action en cours + modèle actif)
- **Panneau raisonnement** : rôle séparé côté droit (thinking/reasoning)
- **Transmission des tools à tous les providers** : opencode-go (chat/messages/responses), openai, anthropic, google — priorité sur le fallback web_search
- **Sécurité sandbox** : workspace par utilisateur, `_exec_root()` strict (pas de fallback silencieux), whitelist Bash, timeout, bloque `../` + symlinks
- **Responsive mobile** : panneau raisonnement en bottom sheet, composer fluide, touch-friendly
- **Mode delete** : suppression du workspace « Projet importé » (DELETE `/api/marexcode/project`)
- **Paramètres → Features** : Presets (CRUD + switch), Agent (toggle + mémoire), Tasks (schedulées), API Key, Engine (status/start/stop), Marex Link (tunnel distant)
- **Métriques sidebar** : VRAM (GPU), RAM, Disk, CPU — barres en temps réel (polling 10s)
- **Stats fin de tour** : `8s · 94 tok · 13.7 tok/s` — temps de génération, tokens, vitesse
- **Compteur contexte** : `10.2K / 131K` — tokens utilisés / contexte max du modèle (78 modèles référencés)
- **Slider max tokens** : réglage 300 → 32K dans le menu `+`

### Productivité
- **Canvas intégré** : panneau latéral pour contexte long
- **Favoris** : conversations épinglées dans la sidebar
- **Catégories** : organisez vos conversations par thème (codes couleur)
- **Prompts enregistrés** : templates réutilisables
- **Rôles personnalisés** : instructions système pré-définies
- **Amélioration IA** : optimisation des prompts par modèle dédié
- **Titres automatiques** : générés après le premier échange
- **Export** : Markdown, HTML, sauvegarde JSON complète
- **Recherche web intégrée** : toggle activable par conversation
- **Mode effort** : Faible / Moyen / Max — contrôle la qualité de réponse
- **Réflexion** : toggle pour activer le raisonnement
- **System prompts intelligent** : CETAS = expert éducation/formation (jamais d'invention, web search auto). Marexcode = expert coding (PLAN → CODE → VERIFY)
- **Recherche web native vs interne** : modèles natifs (OpenAI/Anthropic/Grok/OpenCode) utilisent leurs outils, les autres utilisent la recherche interne

### Administration & Sécurité
- **Authentification serveur JWT** : scrypt, tokens HS256, expiry 24h
- **Proxy backend** : les clés API restent côté serveur, jamais dans le navigateur
- Authentification multi-utilisateurs avec rôles (user / admin)
- Rate limiting configurables
- **Synchronisation multi-appareils** : conversations + paramètres sauvegardés côté serveur
- **Headers sécurité** : Referrer-Policy, Permissions-Policy, CSP
- **Sandbox Marexcode durcie** : `_exec_root()` strict (pas de fallback vers `CETAS_BASE_DIR`), workspace par projet, `../` et symlinks bloqués
- Suivi de coûts en temps réel, alertes budget configurables
- **Quotas d'utilisation** : crédits API restants, alertes seuil
- **Sauvegardes** : export/import complet

## Démarrage rapide

### Docker Compose (recommandé)

```bash
# Cloner
git clone git@github.com:Hajrudin-Zelef/Cetas-WebUi.git
cd Cetas-WebUi
git checkout Cetasui-vps

# Créer .env.docker
cat > .env.docker << EOF
CETAS_VAULT_PASSWORD=votre_mot_de_passe_vault
CETAS_WORKER_TOKEN=$(python3 -c 'import secrets; print(secrets.token_hex(32))')
CETAS_CORS_ORIGINS=https://votre-domaine.com
SEARXNG_SECRET_KEY=$(python3 -c 'import secrets; print(secrets.token_hex(32))')
EOF

# Configurer le coffre-fort et les clés API
python3 scripts/setup.py

# Démarrer
docker compose build --no-cache
docker compose up -d
```

### Sans Docker (usage local)

```bash
python3 -m http.server 8080
```

Ouvrir `http://localhost:8080` dans le navigateur.

## Déploiement

Voir **[DEPLOY.md](./Docs/DEPLOY.md)** — guide complet pour installer sur un VPS.

## Stack technique

- **Frontend** : Vanilla JS (ES modules), CSS custom properties, HTML5 Canvas
- **Backend proxy** : Python stdlib, AES-256-GCM, JWT, scrypt, subprocess (sandbox Marexcode), duckduckgo-search, google-auth
- **Outils IA** : Ls, Glob, Read (pagination), Write, Edit (diff unifié), Grep, Bash (sandbox), TodoWrite (virtuel client-side), LSP (6 serveurs), MCP (4 serveurs), Custom Tools, Formatters, Undo/Redo, Images, Slash Commands
- **Recherche web** : backend `websearch.py` — 6 providers (Tavily, Exa, Brave API, Jina, SearXNG, DuckDuckGo) — chaîne auto avec fallback
- **Serveur** : Nginx Alpine, Docker
- **Recherche** : SearXNG (méta-moteur auto-hébergé)

## Branches

| Branche | Usage |
|---------|-------|
| `Cetas-Full` | Branche principale (full features) |
| `Cetasui-vps` | Déploiement VPS (fichiers sensibles exclus du git) |

## Providers supportés

| Provider | Types supportés |
|----------|----------------|
| OpenAI | Chat, Images, TTS, STT |
| Anthropic | Chat, Thinking |
| Google | Chat, Images, TTS, STT |
| Mistral | Chat, TTS, STT |
| DeepSeek | Chat, Reasoning |
| Grok/xAI | Chat, Web search |
| Z.ai/GLM | Chat |
| Perplexity | Web search |
| OpenRouter | Chat, Images, Web search |
| Groq | Chat (GPT-OSS, Llama, Qwen) |
| Nvidia NIM | Chat (Nemotron, GLM, Kimi) |
| OpenCode | Chat (Go, Zen) |
| Cabreras | Chat |
| Ollama | Chat (local) |
| LM Studio | Chat (local) |
| LlamaCpp | Chat (local) |
| SamAgent | Routeur intelligent (pas de clé) |

## Licence

Tous droits réservés © Marexsoft Corporation.

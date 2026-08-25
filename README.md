
# Cetas

*Assistant IA multi-modèles* — Interface de chat privée, sécurisée et gratuite. Entièrement exécutée dans le navigateur (Vanilla JS), avec proxy backend pour la sécurité des clés API. Interface en français.

By **Marexsoft Corporation** — Fondateur : **Kouassi Marius**

## Aperçu

Cetas est une alternative open-source aux assistants IA propriétaires. Les clés API restent sous votre contrôle — côté serveur via le proxy backend qui ne les expose jamais au frontend.

## Fonctionnalités

### Chat & Modèles
- **SamAgent v3.8** — routeur intelligent 4 tiers (Nano/N4 Flash/N4/N8) : accueil chaleureux avec 3 propositions cliquables (💬 Chat général / 💻 Coder / 🔬 Avancé), fallback 3 niveaux, stabilité 99.9%
- **18 providers supportés** : OpenAI, Anthropic, Google, Mistral, DeepSeek, Grok/xAI, Z.ai/GLM, Perplexity, OpenRouter, Groq, Nvidia, Cabreras + modèles locaux (Ollama, LM Studio, LlamaCpp)
- **Génération d'images** : GPT Image, Gemini (Nano Banana)
- **Synthèse vocale (TTS)** : OpenAI, Google, Mistral, Nvidia, synthèse système
- **Transcription audio (STT)** : Navigateur natif (gratuit), OpenAI Whisper, OpenRouter Whisper, Google Gemini, Mistral Voxtral
- **Recherche web intégrée** : 5 providers (OpenAI, Anthropic, Google, Grok, OpenRouter) via outils natifs — citations cliquables, coûts tracés
- **Raisonnement visible** : blocks de réflexion (thinking) pour Anthropic, DeepSeek, OpenRouter
- **Mode réflexion** : toggle pour activer/désactiver le mode reasoning

### Expérience utilisateur
- **Thème océanique** : canvas animé (bulles montantes + planctons bioluminescents), effet glassmorphism
- **Splash screen** : fond gradient abysses, halos bioluminescents, gouttes d'eau animées
- Interface 3 panneaux (sidebar 240px, chat centré max 800px, panneau configuration 280px)
- Thème clair / sombre / automatique, sans flash au chargement
- Messages en markdown avec coloration syntaxique, blocs de code
- Streaming temps réel — rendu optimisé (debounce 80ms)
- PWA installable, mode hors-ligne via service worker

### Productivité
- **Canvas intégré** : panneau latéral pour contexte long
- **Favoris** : conversations épinglées dans la sidebar
- **Catégories** : organisez vos conversations par thème (avec codes couleur)
- **Prompts enregistrés** : templates réutilisables
- **Rôles personnalisés** : instructions système pré-définies
- **Amélioration IA** : optimisation des prompts par modèle dédié
- **Titres automatiques** : générés après le premier échange
- **Export** : Markdown, HTML, sauvegarde JSON complète

### Administration & Sécurité
- **Authentification serveur JWT** : scrypt (N=16384), tokens HS256, expiry 24h
- **Hash client-side** : PBKDF2 (600k itérations, sel 128-bit) pour le mode dégradé
- Authentification multi-utilisateurs avec rôles (user / admin), CRUD via API
- Détection automatique du mot de passe admin par défaut — changement forcé
- **Proxy backend** : les clés API restent côté serveur, jamais dans le navigateur
- **Worker Cloudflare** : backup anti-SPOF avec bascule automatique si le proxy est down
- Protection JWT sur tous les endpoints proxy (LLM, images, TTS, transcriptions)
- Rate limiting : 10 login/min, 5 register/min par IP
- **Synchronisation multi-appareils** : conversations + paramètres sauvegardés côté serveur
- **Sécurité renforcée** : suppression auto des clés legacy en clair, plus de fallback localStorage
- **Headers sécurité** : Referrer-Policy, Permissions-Policy, CSP dans index.html
- **Résilience** : handler global de rejetons non gérées, fallback 4 niveaux auth
- Suivi de coûts en temps réel, alertes budget configurables
- **Quotas d'utilisation** : crédits API restants (OpenRouter, DeepSeek), recharge manuelle, alertes seuil
- **Synchronisation des paramètres** : thème, budget, quotas, audio sauvegardés côté serveur
- **Effacement sécurisé** : bouton dédié avec code de confirmation

## Démarrage rapide

### Docker Compose (recommandé — proxy backend + SearXNG inclus)

```bash
# Cloner
git clone git@github.com:Hajrudin-Zelef/Cetas-WebUi.git
cd Cetas-WebUi
git checkout feat/auth-server-side

# Configurer le coffre-fort et les clés API
python3 setup.py

# Chiffrer les clés pour le proxy
CETAS_VAULT_PASSWORD="votre_mdp" python3 proxy/encrypt_keys.py

# Configurer les variables d'environnement (inclut SEARXNG_SECRET_KEY)
cat > .env.docker << EOF
CETAS_VAULT_PASSWORD=votre_mdp
CETAS_WORKER_TOKEN=$(python3 -c 'import secrets; print(secrets.token_hex(32))')
CETAS_CORS_ORIGINS=https://votre-domaine.com,http://localhost:8080
SEARXNG_SECRET_KEY=$(python3 -c 'import secrets; print(secrets.token_hex(32))')
EOF

# Démarrer (plus besoin d'export SEARXNG_SECRET_KEY)
docker compose build --no-cache
docker compose up -d

# Ajouter un reverse proxy HTTPS (Caddy)
# Voir DEPLOY.md pour le guide complet
```

Le proxy backend déchiffre les clés API côté serveur : le navigateur **ne les reçoit jamais**.  
Même après un effacement des données navigateur, les clés se resynchronisent automatiquement.

### Sans Docker (usage local)

```bash
python3 -m http.server 8080
```

Ouvrir `http://localhost:8080` dans le navigateur (les modules ES6 ne fonctionnent pas en `file://`).

Sans le proxy, les clés sont chargées depuis le navigateur (chiffrées au repos si l'authentification est activée).

## Déploiement complet sur VPS

Voir **[DEPLOY.md](./DEPLOY.md)** — guide pas-à-pas complet pour installer sur un VPS vierge :

- ✅ Debian 13 + Docker + docker-compose
- ✅ Caddy (reverse proxy HTTPS avec Let's Encrypt)
- ✅ SearXNG (recherche web auto-hébergée)
- ✅ Cloudflare Worker (backup anti-SPOF)
- ✅ Vault Guard (immutabilité noyau)
- ✅ Migration vers un autre serveur
- ✅ Maintenance, backups, troubleshooting

## Stack technique

- **Frontend** : Vanilla JS (ES modules), CSS custom properties (design system modulaire), HTML5 Canvas
- **CSS modulaire** : `style.css` point d'entrée → 8 modules (@import) : variables, layout, chat, components, canvas, catalog, storage, menu
- **Architecture modulaire** : `app.js` (~5,300 lignes) + 15 modules ES + 5 scripts globaux extraits
- **Backend proxy** : Python stdlib `http.server`, AES-256-GCM, JWT (PyJWT), scrypt
- **Serveur** : Nginx Alpine, Docker
- **Recherche** : SearXNG (méta-moteur auto-hébergé)
- **Reverse proxy** : Caddy (SSL Let's Encrypt automatique)

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
| **Nvidia NIM** | `nvapi-...` | Chat (Nemotron, GLM-5.2, Kimi K2.6) |
| **SamAgent** | — | Routeur intelligent multi-providers |
| Cabreras | `ck-...` | Chat |
| Ollama | URL locale | Chat (localhost:11434) |
| LM Studio | URL locale | Chat (localhost:1234) |
| LLaMA.cpp | URL locale | Chat (localhost:8080) |

## Documentation

- **Guide de déploiement** : [DEPLOY.md](./DEPLOY.md)
- **Documentation technique** : [PriveDoc.md](./PriveDoc.md) (accès restreint)
- **FAQ** : intégrée dans l'application (Configuration → FAQ, 30 entrées)

## Licence

Tous droits réservés © Marexsoft Corporation.

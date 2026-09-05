# Cetas

*Assistant IA multi-modèles* — Interface de chat privée, sécurisée et gratuite. Interface en français.

By **Marexsoft Corporation** — Fondateur : **Kouassi Marius**

---

## Aperçu

Cetas est une alternative aux assistants IA propriétaires. Les clés API restent sous votre contrôle — le proxy backend ne les expose jamais au frontend.

## Fonctionnalités

### Chat & Modèles
- **SamAgent** — routeur intelligent multi-tiers : accueil chaleureux avec propositions cliquables, fallback 3 niveaux, rotation aléatoire dans des pools de modèles — aucun point de défaillance unique
- **18 providers supportés** : OpenAI, Anthropic, Google, Mistral, DeepSeek, Grok/xAI, Z.ai/GLM, Perplexity, OpenRouter, Groq, Nvidia, Cabreras, OpenCode + modèles locaux (Ollama, LM Studio, LlamaCpp)
- **~70 modèles IA** : GPT-5.6, Claude Fable 5, Gemini 3.5, DeepSeek V4, Grok 4.5, etc.
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
- Streaming temps réel — rendu optimisé
- PWA installable, mode hors-ligne via service worker

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

### Administration & Sécurité
- **Authentification serveur JWT** : scrypt, tokens HS256, expiry 24h
- **Proxy backend** : les clés API restent côté serveur, jamais dans le navigateur
- Authentification multi-utilisateurs avec rôles (user / admin)
- Rate limiting configurables
- **Synchronisation multi-appareils** : conversations + paramètres sauvegardés côté serveur
- **Headers sécurité** : Referrer-Policy, Permissions-Policy, CSP
- Suivi de coûts en temps réel, alertes budget configurables
- **Quotas d'utilisation** : crédits API restants, alertes seuil
- **Sauvegardes** : export/import complet

## Démarrage rapide

### Docker Compose (recommandé)

```bash
# Cloner
git clone git@github.com:Hajrudin-Zelef/Cetas-WebUi.git
cd Cetas-WebUi
git checkout neva-pve

# Configurer le coffre-fort et les clés API
python3 setup.py

# Chiffrer les clés pour le proxy
CETAS_VAULT_PASSWORD="votre_mdp" python3 server/encrypt_keys.py

# Configurer les variables d'environnement
cat > .env.docker << EOF
CETAS_VAULT_PASSWORD=votre_mdp
CETAS_WORKER_TOKEN=$(python3 -c 'import secrets; print(secrets.token_hex(32))')
CETAS_CORS_ORIGINS=https://votre-domaine.com
SEARXNG_SECRET_KEY=$(python3 -c 'import secrets; print(secrets.token_hex(32))')
EOF

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

Voir **[DEPLOY.md](./DEPLOY.md)** — guide complet pour installer sur un VPS.

## Stack technique

- **Frontend** : Vanilla JS (ES modules), CSS custom properties, HTML5 Canvas
- **Backend proxy** : Python stdlib, AES-256-GCM, JWT, scrypt
- **Serveur** : Nginx Alpine, Docker
- **Recherche** : SearXNG (méta-moteur auto-hébergé)

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

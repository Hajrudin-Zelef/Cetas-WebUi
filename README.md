

# Cetas

*Assistant IA multi-modèles* — Interface de chat privée, sécurisée et gratuite. Entièrement exécutée dans le navigateur (Vanilla JS), avec un proxy backend optionnel pour la sécurité des clés API. Interface en français.

By **Marexsoft Corporation**

## Aperçu

Cetas est une alternative open-source aux assistants IA propriétaires. Les clés API restent sous votre contrôle — soit dans le navigateur (chiffrées), soit sur votre serveur via le proxy backend qui ne les expose jamais au frontend.

## Fonctionnalités

### Chat & Modèles
- **SamAgent v3.6** — routeur intelligent 4 tiers (Nano/N4 Flash/N4/N8) : fusionne automatiquement les modèles de 5+ providers avec fallback 3 niveaux et stabilité 99.9%
- **18 providers supportés** : OpenAI, Anthropic, Google, Mistral, DeepSeek, Grok/xAI, Z.ai/GLM, Perplexity, OpenRouter, Groq, Nvidia, Cabreras + modèles locaux (Ollama, LM Studio, LlamaCpp)
- **Génération d'images** : GPT Image, Gemini (Nano Banana)
- **Synthèse vocale (TTS)** : OpenAI, Google, Mistral, Nvidia, synthèse système
- **Transcription audio (STT)** : Navigateur natif (gratuit), OpenAI Whisper, OpenRouter Whisper, Google Gemini, Mistral Voxtral
- **Recherche web intégrée** : Perplexity Sonar + OpenRouter
- **Raisonnement visible** : blocks de réflexion (thinking) pour Anthropic, DeepSeek, OpenRouter
- **Mode réflexion** : toggle pour activer/désactiver le mode reasoning

### Expérience utilisateur
- **Thème océanique** : canvas animé (12 bulles montantes + 25 planctons bioluminescents en rAF), effet glassmorphism (sidebar 82% opaque + blur 14px, input 78%, modales 90%)
- **Splash screen** : fond gradient abysses, halos bioluminescents, 4 gouttes d'eau animées
- **Animations** : whale breathing 4s sur les logos, ripple 0.7s au clic, transitions vagues `cubic-bezier(0.23, 1, 0.32, 1)`
- Interface 3 panneaux (sidebar 240px, chat centré max 800px, panneau configuration 280px)
- Thème clair / sombre / automatique, sans flash au chargement (script inline `<head>`)
- Messages en markdown avec coloration syntaxique, blocs de code
- Streaming temps réel — rendu optimisé (debounce 80ms)
- PWA installable, mode hors-ligne via service worker
- Animations fluides, transitions douces, retours tactiles sur mobile

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
- **Authentification serveur JWT** : scrypt (N=16384), tokens HS256
- **Hash client-side** : PBKDF2 (600k itérations, sel 128-bit) pour le mode dégradé — upgrade auto depuis SHA-256
- Authentification multi-utilisateurs avec rôles (user / admin), CRUD via API
- Détection automatique du mot de passe admin par défaut — changement forcé
- **Proxy backend** : les clés API restent côté serveur, jamais dans le navigateur
- **Worker Cloudflare** : backup anti-SPOF avec bascule automatique si le proxy est down
- Protection JWT sur tous les endpoints proxy (LLM, images, TTS, transcriptions)
- Rate limiting : 10 login/min, 5 register/min par IP
- Synchronisation automatique des clés depuis le proxy au démarrage
- Synchronisation des conversations multi-appareils avec réconciliation delete
- Chiffrement AES-256-GCM des clés au repos (coffre vault)
- **Sécurité renforcée** : suppression auto des clés legacy en clair, plus de fallback localStorage
- **Headers sécurité** : X-Frame-Options DENY, X-Content-Type-Options nosniff
- **Résilience** : handler global de rejetons non gérées (toast non-bloquant), fallback 4 niveaux auth
- Suivi de coûts en temps réel, alertes budget configurables
- **Quotas d'utilisation** : crédits API restants (OpenRouter, DeepSeek), recharge manuelle, alertes seuil
- Panneau de stockage : gestion des conversations et médias (taille, tri, recherche, suppression)

## Démarrage rapide

### Docker (recommandé — proxy backend inclus)

```bash
docker build -t cetas:latest .
docker run -d --name cetas-webui --restart unless-stopped \
  -p 8080:80 \
  -v /chemin/vers/.vault:/usr/share/nginx/html/.vault \
  -v /chemin/vers/.env:/usr/share/nginx/html/.env \
  -v cetas-data:/usr/share/nginx/html/conversations \
  -v cetas-data:/app/data \
  -e CETAS_VAULT_PASSWORD=votre_motdepasse \
  cetas:latest
```

Le proxy backend déchiffre les clés API côté serveur : le navigateur ne les reçoit jamais.
Même après un effacement des données navigateur, les clés se resynchronisent automatiquement depuis le backend.
Authentification JWT serveur — un seul compte, tous vos appareils synchronisés.

### Sans Docker (usage local)

```bash
python3 -m http.server 8080
```

Ouvrir `http://localhost:8080` dans le navigateur (les modules ES6 ne fonctionnent pas en `file://`).

Sans le proxy, les clés sont chargées depuis le navigateur (chiffrées au repos si l'authentification est activée).

## Configuration initiale

1. Lancer `python3 setup.py` (mot de passe demandé à l'exécution)
2. Créer un compte administrateur
3. Configurer les clés API dans l'interface (Configuration → API)
4. Optionnel : configurer le proxy avec `proxy/encrypt_keys.py`

## Personnalisation

- **Thème océanique** activé par défaut — désactivable en retirant la classe `ocean-theme` sur `<body>`
- **Canvas de bulles** : animations fluides en arrière-plan, ajustables dans `js/ocean.js`
- **Glassmorphism** : transparence et flou sur les panneaux, configurable dans `css/ocean.css`

## Documentation

La documentation complète est disponible dans l'onglet **FAQ** de l'application (Configuration → FAQ).

La documentation technique détaillée se trouve dans le fichier `PriveDoc.md`.

## Stack technique

- **Frontend** : Vanilla JS (ES modules), CSS custom properties (design system modulaire), HTML5 Canvas
- **CSS modulaire** : `style.css` point d'entrée → 8 modules (@import) : variables, layout, chat, components, canvas, catalog, storage, menu
- **Architecture modulaire** : `app.js` (~5,300 lignes) + 15 modules ES + 5 scripts globaux extraits (config-providers, conversations, right-panel, plus-menu, model-catalog)
- **Backend proxy** : Python, AES-GCM, JWT (PyJWT)
- **Serveur** : Nginx alpine, Docker

## Licence

Tous droits réservés © Marexsoft Corporation.

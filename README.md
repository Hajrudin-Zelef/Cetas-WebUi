# Cetas

*Assistant IA multi-modèles* — Interface de chat privée, sécurisée et gratuite. Entièrement exécutée dans le navigateur (Vanilla JS), avec un proxy backend optionnel pour la sécurité des clés API. Interface en français.

By **Marexsoft Corporation**

## Aperçu

Cetas est une alternative open-source aux assistants IA propriétaires. Les clés API restent sous votre contrôle — soit dans le navigateur (chiffrées), soit sur votre serveur via le proxy backend qui ne les expose jamais au frontend.

## Fonctionnalités

### Chat & Modèles
- **SamAgent** — routeur intelligent multi-modèles : fusionne automatiquement les modèles de 5+ providers (DeepSeek, Google, Groq, Nvidia, OpenRouter) avec fallback automatique et rotation de modèles
- **18 providers supportés** : OpenAI, Anthropic, Google, Mistral, DeepSeek, Grok/xAI, Z.ai/GLM, Perplexity, OpenRouter, Groq, Nvidia, Cabreras + modèles locaux (Ollama, LM Studio, LlamaCpp)
- **Génération d'images** : GPT Image, Gemini (Nano Banana)
- **Synthèse vocale (TTS)** : OpenAI, Google, Mistral, Nvidia, synthèse système
- **Transcription audio (STT)** : OpenAI Whisper, Google Gemini, Mistral Voxtral
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
- Authentification multi-utilisateurs avec rôles (user / admin)
- **Proxy backend** : les clés API restent côté serveur, jamais dans le navigateur
- Synchronisation automatique des clés depuis le proxy au démarrage
- Synchronisation des conversations multi-appareils via le proxy
- Chiffrement AES-256-GCM des clés au repos
- Suivi de coûts en temps réel, alertes budget configurables
- Panneau de stockage : gestion des conversations et médias (taille, tri, recherche, suppression)

## Démarrage rapide

### Docker (recommandé — proxy backend inclus)

```bash
docker build -t cetas .
docker run -d \
  --name cetas \
  -p 8080:80 \
  -e CETAS_VAULT_PASSWORD=votre_motdepasse \
  --restart unless-stopped \
  cetas
```

Le proxy backend déchiffre les clés API côté serveur : le navigateur ne les reçoit jamais.
Même après un effacement des données navigateur, les clés se resynchronisent automatiquement depuis le backend.

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

- **Frontend** : Vanilla JS (ES modules), CSS custom properties, HTML5 Canvas
- **Backend proxy** : Python, AES-GCM
- **Serveur** : Nginx alpine, Docker

## Licence

Tous droits réservés © Marexsoft Corporation.

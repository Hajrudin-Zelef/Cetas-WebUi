# Cetas v3.2

Assistant IA multi-modèles — interface de chat unifiée pour tous les fournisseurs d'IA.

**By Marexsoft Corporation**

## Fonctionnalités

- **Chat multi-providers** — OpenAI, Anthropic, Google, Mistral, DeepSeek, Grok, Z.ai, Perplexity, OpenRouter + Ollama/LM Studio
- **Génération d'images** — OpenAI, Gemini, OpenRouter (Flux)
- **Synthèse vocale** (TTS) + **Transcription** (STT) multi-providers
- **Recherche web** intégrée
- **Raisonnement visible** (thinking blocks) pour les modèles compatibles
- **Streaming SSE** temps réel
- **Favoris** — épinglez vos conversations
- **Authentification** — login/mot de passe, rôles admin/utilisateur
- **Coffre API** — clés chiffrées AES-256-GCM au repos
- **Catégories** — organisation par thème avec filtrage
- **Prompts & Rôles** — prompts enregistrés et system prompts personnalisés
- **Suivi de coûts** — tokens et coûts estimés en temps réel, budget alertes
- **Export** Markdown / HTML / sauvegarde JSON complète
- **PWA** — installable, offline, icônes adaptatives
- **Thème** clair / sombre / auto

## Déploiement

### Docker

```bash
docker build -t cetas .
docker run -d --name cetas -p 8080:80 --restart unless-stopped cetas
```

### Manuel

Ouvrir `index.html` dans un navigateur (les modules ES6 nécessitent un serveur HTTP — pas de `file://`).

## Architecture

```
index.html              SPA unique
css/style.css           Thème responsive
models.js               Catalogue modèles
js/
  app.js                Point d'entrée (module ES6, ~10k lignes)
  api.js                Providers streaming (11 providers)
  auth.js               Authentification + gestion utilisateurs
  filemanager.js        IndexedDB conversations
  state.js              STATE singleton partagé
  dom.js                Getters DOM centralisés
  theme.js              Thème clair/sombre/auto
  lightbox.js           Lightbox images + file viewer
  attachments.js        Pièces jointes, drag-drop, PDF
  utils.js              Fonctions pures
  faq.js                Données FAQ
images/                 Logos, icônes, assets
manifest.json           PWA manifest
sw.js                   Service Worker (offline)
Dockerfile              nginx:alpine
```

## Setup administrateur

```bash
python3 setup.py
```

Crée les comptes administrateurs, configure les clés API, l'email SMTP.
Les comptes sont exportés dans `core/users-seed.json` pour le frontend.

## Login par défaut

- **Utilisateur** : `admin`
- **Mot de passe** : `admin`

À changer immédiatement après la première connexion.

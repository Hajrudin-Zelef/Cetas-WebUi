# Cetas

Interface de chat IA multi-modèles. Gratuite, open-source, exécutée entièrement dans le navigateur.

By **Marexsoft Corporation**

## Fonctionnalités

- Chat avec les principaux fournisseurs d'IA (OpenAI, Anthropic, Google, Mistral, DeepSeek, etc.)
- Modèles locaux (Ollama, LM Studio) et agrégateur OpenRouter
- Génération d'images, synthèse vocale (TTS), transcription audio (STT)
- Recherche web intégrée
- Raisonnement visible (thinking blocks)
- Favoris, catégories, prompts enregistrés, rôles personnalisés
- Authentification multi-utilisateurs avec rôles
- Chiffrement des clés API au repos
- Suivi de coûts en temps réel, budget alertes
- Export Markdown / HTML, sauvegarde JSON
- PWA installable, mode hors-ligne
- Thème clair / sombre / automatique

## Démarrage rapide

### Docker

```bash
docker build -t cetas .
docker run -d -p 8080:80 cetas
```

### Sans Docker

Ouvrir `index.html` via un serveur HTTP local (les modules ES6 ne fonctionnent pas en `file://`).

## Documentation

La documentation complète est disponible dans l'onglet **FAQ** de l'application (Configuration → FAQ).

## Licence

Tous droits réservés © Marexsoft Corporation.

# Cetas

Interface de chat IA multi-modèles. Gratuite, open-source, exécutée entièrement dans le navigateur.

By **Marexsoft Corporation**

## Fonctionnalités

- **SamAgent** — routeur intelligent multi-modèles : fusionne automatiquement les modèles de 5+ providers (DeepSeek, Google, Groq, Nvidia, OpenRouter) avec fallback automatique et rotation de modèles
- Chat avec 15 fournisseurs d'IA (OpenAI, Anthropic, Google, Mistral, DeepSeek, Grok/xAI, Z.ai/GLM, Perplexity, OpenRouter, Groq, Nvidia, Cabreras + locaux Ollama, LM Studio, LLaMA.cpp)
- Génération d'images, synthèse vocale (TTS), transcription audio (STT)
- Recherche web intégrée (Perplexity Sonar + OpenRouter)
- Raisonnement visible (thinking blocks)
- Favoris, catégories, prompts enregistrés, rôles personnalisés
- Canvas intégré
- Authentification multi-utilisateurs avec rôles
- Proxy backend : les clés API restent côté serveur, jamais dans le navigateur
- Synchronisation automatique des clés depuis le proxy au démarrage
- Synchronisation des conversations multi-appareils via le proxy
- Chiffrement des clés API au repos (AES-256-GCM) et coffre-fort Scrypt
- Suivi de coûts en temps réel, budget alertes
- Export Markdown / HTML, sauvegarde JSON
- PWA installable, mode hors-ligne
- Thème clair / sombre / automatique
- Panneau de stockage : gestion des conversations et médias

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

### Proxy autonome (systemd)

```bash
# Copier le service systemd
cp cetas-proxy.service ~/.config/systemd/user/
systemctl --user enable cetas-proxy
systemctl --user start cetas-proxy
```

### Sans Docker (usage local)

Ouvrir `index.html` via un serveur HTTP local (les modules ES6 ne fonctionnent pas en `file://`).

```bash
python3 -m http.server 8080
```

Sans le proxy, les clés sont chargées depuis le navigateur (chiffrées au repos si l'authentification est activée).

## Configuration initiale

1. Lancer `python3 setup.py` (mot de passe demandé à l'exécution)
2. Créer un compte administrateur
3. Configurer les clés API
4. Optionnel : chiffrer les clés pour le proxy avec `proxy/encrypt_keys.py`

## Documentation

La documentation complète est disponible dans l'onglet **FAQ** de l'application (Configuration → FAQ).

## Licence

Tous droits réservés © Marexsoft Corporation.

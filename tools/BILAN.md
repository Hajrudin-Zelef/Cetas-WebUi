# Cetas — Bilan d'installation

© Marexsoft Corporation — Fondateur Kouassi Marius

---

## Récapitulatif de l'installation

Cetas (Assistant IA multi-modèles) installé avec Docker + docker-compose + SearXNG.

| Élément | Valeur |
|---------|--------|
| URL | `http://192.168.10.75:8901` |
| Dossier | `/home/sam/Cetas-WebUi` |
| Docker | v29.6.1 |
| Docker Compose | v5.3.0 |
| Port Cetas | `8901` |
| Port SearXNG | `8904` (interne) |
| Login | `sam` / *(voir .env.docker ou users.json)* |
| Login (alt) | `admin` / *(voir .env.docker ou users.json)* |
| Email | *(voir core/users-seed.json)* |
| Vault password | *(voir .env.docker — fichier gitignoré)* |
| Clés API chargées | 4 |

---

## Étapes réalisées

1. **Prérequis** — Docker + docker-compose vérifiés
2. **Fichiers secrets** — copiés manuellement (gitignorés) :
   - `setup.py`
   - `core/linux/crypto_linux.py`
   - `core/linux/vault_guard.py`
   - `.vault/`
   - `.env`
   - `core/users-seed.json`
3. **docker-compose.yml** — chemins relatifs `./.vault` / `./.env` + volumes `:ro`
4. **Ports** — modifiés à cause de conflits : `8901:80`, `127.0.0.1:8904:8080`
5. **.env.docker** — créé avec vault password, worker token, CORS
6. **SearXNG** — `searxng-data/settings.yml` + `limiter.yml`
7. **users.json** — créé dans le container (format `{"users": {...}}`)
8. **Permissions** — corrigées pour le container (uid 1001)
9. **start.sh** — modifié pour auto-fixer les permissions au démarrage
10. **Build Docker** — image construite avec succès
11. **Systemd** — service `/etc/systemd/system/cetas.service` activé

---

## Problèmes rencontrés & solutions

| Problème | Cause | Solution |
|----------|-------|----------|
| Build npm ECONNRESET | MTU réseau trop élevé (1500) | Passer le MTU à 1300 |
| Port 8080 occupé | Conflit | Port Cetas → 8901 |
| Port 8084 occupé | Conflit | Port SearXNG → 8904 |
| Vault introuvable dans container | Permissions `.vault` (700) | `chmod 755 .vault` + `chmod 644 .enc` |
| Déchiffrement vault échoué | Mauvais mot de passe | Corriger `CETAS_VAULT_PASSWORD` dans `.env.docker` |
| Login 401 / "Aucun compte" | Pas de `users.json` | Créer `/app/data/users.json` (format `{"users": {...}}`) |
| Rate limiting (429) | Trop de tentatives | Attendre 1 minute |
| Permissions remises à 600 par setup.py | setup.py sécurise les fichiers | `start.sh` corrige les perms au démarrage |

---

## Commandes utiles

```bash
# Démarrage / arrêt
sudo systemctl start cetas
sudo systemctl stop cetas
sudo systemctl restart cetas
sudo systemctl status cetas

# Docker
docker compose up -d
docker compose down
docker compose logs -f cetas
docker compose logs -f searxng

# Proxy santé
curl http://localhost:8901/api/health
# → {"status":"ok","keys_loaded":4}

# Fix permissions (si setup.py les a remises)
chmod 755 .vault
chmod 644 .vault/.enc .vault/.guard_config .vault/.system .env
```

---

## Script d'installation (tools/install.py)

Script interactif complet pour installer Cetas sur n'importe quel VPS.

```bash
# Installation complète
sudo python3 tools/install.py

# Diagnostic + auto-fix
sudo python3 tools/install.py --troubleshoot

# Audit complet (20 niveaux, 80+ tests)
sudo python3 tools/install.py --test
```

**20 niveaux de test couverts :**
1. Système (OS, root, Python, curl, disque, RAM)
2. Docker (install, compose, service, images, containers)
3. Réseau (ports, Internet, DNS, MTU)
4. Fichiers (tous les fichiers critiques)
5. Vault (permissions, déchiffrement, .env)
6. API (health, login, register, rate limiting)
7. Recherche (SearXNG, JSON API, /search)
8. Systemd (service créé, enabled, actif)
9. Frontend (page, CSS, JS, login-overlay, headers)
10. Logs (erreurs proxy, erreurs SearXNG)
11. Docker Compose (config, volumes, variables)
12. Dépendances (docker, curl, python, PyJWT, cryptography)
13. Ports & conflits (80, 443, 8901, 8904)
14. CORS & sécurité (headers, rate limiting, .env exposé)
15. Users & auth (seed, hash, login, register, JWT)
16. Proxy API (endpoints, streaming)
17. Ressources (disque, images Docker, volumes)
18. Networking avancé (container→Internet, container→SearXNG)
19. Persistance (volumes, données, conversations)
20. Sécurité (setup.py, .or, __pycache__, .git exposés)

---

## Avertissements sécurité

- **Supprimer** `setup.py` du serveur après configuration :
  `rm /opt/cetas/setup.py`
- Fichiers `.vault/` et `.env` contiennent des secrets — ne jamais committer
- Ne pas exposer SearXNG (port 8904 bindé sur `127.0.0.1` uniquement)
- Après un `docker compose restart`, les permissions vault sont auto-corrigées par `start.sh`

---

© Marexsoft Corporation — Tous droits réservés

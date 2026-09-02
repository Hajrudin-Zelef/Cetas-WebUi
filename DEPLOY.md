# Cetas — Guide de Déploiement

> **Stack :** Debian 13 + Docker + Caddy + SearXNG
> **Application :** Cetas v3.9 — Assistant IA multi-modèles
> **Éditeur :** Marexsoft Corporation — Fondateur Kouassi Marius

---

## Table des matières

1. [Prérequis](#1-prérequis)
2. [Architecture](#2-architecture)
3. [Cloner le dépôt](#3-cloner-le-dépôt)
4. [Setup vault + clés API](#4-setup-vault--clés-api)
5. [Chiffrer les clés](#5-chiffrer-les-clés)
6. [Configurer Docker](#6-configurer-docker)
7. [Build & démarrer](#7-build--démarrer)
8. [Configurer Caddy (HTTPS)](#8-configurer-caddy-https)
9. [Vérification](#9-vérification)
10. [Maintenance](#10-maintenance)
11. [Backup & restauration](#11-backup--restauration)
12. [Migration](#12-migration)
13. [Ajouter un provider](#13-ajouter-un-provider)
14. [Variables d'environnement](#14-variables-denvironnement)
15. [Troubleshooting](#15-troubleshooting)

---

## 1. Prérequis

### VPS minimum

| Ressource | Minimum | Recommandé |
|-----------|---------|------------|
| CPU | 1 vCPU | 2+ vCPU |
| RAM | 1 Go | 2+ Go |
| Disque | 10 Go | 20+ Go |
| OS | Debian 13 | Debian 13 |

### Logiciels

```bash
sudo apt update && sudo apt install -y docker.io docker-compose-v2
docker --version          # ≥ 24.0
docker compose version    # ≥ 2.0
sudo usermod -aG docker $USER
newgrp docker
```

### Domaine

- Un nom de domaine DNS A → IP du VPS
- Vérifier : `dig +short cetas.mondomaine.com`

---

## 2. Architecture

```
Internet (HTTPS :443)
    │
    ▼
Caddy (reverse proxy, Let's Encrypt)
    │
    ▼
Docker Compose
┌─────────────────────────────────┐
│ cetas (container)               │
│   nginx :80 ← /api/* → proxy   │
│   Python :8080 (interne)        │
├─────────────────────────────────┤
│ searxng (container)             │
│   SearXNG :8080 (interne)       │
└─────────────────────────────────┘
```

---

## 3. Cloner le dépôt

```bash
mkdir -p /opt/cetas && cd /opt/cetas
git clone git@github.com:Hajrudin-Zelef/Cetas-WebUi.git .
git checkout neva-pve
```

### Fichiers non inclus dans le dépôt

Ces fichiers sont exclus pour des raisons de sécurité. Transférez-les depuis votre installation existante :

```bash
# Fichiers requis
scp votre-chemin/setup.py                    root@VPS:/opt/cetas/
scp votre-chemin/core/linux/crypto_linux.py  root@VPS:/opt/cetas/core/linux/
scp votre-chemin/core/linux/vault_guard.py   root@VPS:/opt/cetas/core/linux/
scp -r votre-chemin/.vault                   root@VPS:/opt/cetas/
scp votre-chemin/.env                        root@VPS:/opt/cetas/
```

**Fichiers requis pour le build :**
- `setup.py` — configuration initiale vault
- `core/linux/crypto_linux.py` — module chiffrement (AES-256-GCM + Scrypt)
- `core/linux/vault_guard.py` — daemon immutabilité vault

---

## 4. Setup vault + clés API

```bash
cd /opt/cetas
pip3 install --break-system-packages cryptography requests psutil platformdirs
python3 setup.py
```

Le setup :
1. Crée le coffre `.vault/.enc` (AES-256-GCM + Scrypt)
2. Configure les clés API (testées automatiquement)
3. Crée les comptes admin
4. Exporte `core/users-seed.json`

---

## 5. Chiffrer les clés

```bash
cd /opt/cetas
export CETAS_VAULT_PASSWORD="votre_mot_de_passe_fort"
python3 proxy/encrypt_keys.py
```

Vérifier :
```bash
cat /opt/cetas/.env  # Doit contenir provider_key=iv_hex:ct_hex
chmod 600 /opt/cetas/.env
```

---

## 6. Configurer Docker

### docker-compose.yml

```yaml
services:
  cetas:
    build: .
    ports:
      - "8080:80"
    restart: unless-stopped
    env_file:
      - .env.docker
    volumes:
      - ./.vault:/usr/share/nginx/html/.vault:ro
      - ./.env:/usr/share/nginx/html/.env:ro
      - cetas-data:/usr/share/nginx/html/conversations
      - cetas-data:/app/data

  searxng:
    image: searxng/searxng:latest
    ports:
      - "127.0.0.1:8084:8080"
    env_file:
      - .env.docker
    environment:
      - SEARXNG_BASE_URL=http://localhost:8084/
    volumes:
      - ./searxng-data:/etc/searxng
    cap_drop: [ALL]
    cap_add: [CHOWN, SETGID, SETUID]

volumes:
  cetas-data:
```

### .env.docker

```bash
# Remplacez les valeurs par les vôtres
CETAS_VAULT_PASSWORD=votre_mot_de_passe_vault
CETAS_WORKER_TOKEN=$(python3 -c 'import secrets; print(secrets.token_hex(32))')
CETAS_CORS_ORIGINS=https://votre-domaine.com,http://localhost:8080
SEARXNG_SECRET_KEY=$(python3 -c 'import secrets; print(secrets.token_hex(32))')
```

```bash
chmod 600 /opt/cetas/.env.docker
```

### SearXNG config

```bash
mkdir -p searxng-data

cat > searxng-data/settings.yml << 'EOF'
use_default_settings: true
general:
  instance_name: "Cetas Search"
  debug: false
search:
  safe_search: 0
  formats: [html, json]
server:
  secret_key: "changez-ceci-par-une-valeur-aleatoire"
  bind_address: "0.0.0.0"
  port: 8080
EOF

cat > searxng-data/limiter.yml << 'EOF'
botdetection:
  ip_limit:
    link_token: false
    filter_match: false
  ip_lists:
    pass_ip: [0.0.0.0/0]
EOF
```

---

## 7. Build & démarrer

```bash
cd /opt/cetas
docker compose build --no-cache
docker compose up -d
```

### Vérifier

```bash
docker compose ps
# cetas-cetas-1    Up
# cetas-searxng-1  Up

curl http://localhost:8080/api/health
# {"status":"ok","keys_loaded":N}
```

---

## 8. Configurer Caddy (HTTPS)

### Installer Caddy

```bash
sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt update && sudo apt install -y caddy
```

### Caddyfile

```bash
sudo nano /etc/caddy/Caddyfile
```

```caddyfile
# Remplacez cetas.mondomaine.com par votre domaine
votre-domaine.com {
    reverse_proxy localhost:8080 {
        transport http {
            read_timeout 300s
            write_timeout 300s
        }
    }
    log {
        output file /var/log/caddy/cetas.log
    }
}
```

```bash
caddy validate --config /etc/caddy/Caddyfile
sudo systemctl restart caddy
```

---

## 9. Vérification

```bash
# 1. Services
docker compose ps

# 2. Proxy
curl http://localhost:8080/api/health

# 3. HTTPS
curl -sI https://votre-domaine.com | head -1

# 4. Application
# Ouvrir https://votre-domaine.com → Login → Chat
```

---

## 10. Maintenance

### Mise à jour

```bash
cd /opt/cetas
git pull origin neva-pve
docker compose build --no-cache
docker compose down && docker compose up -d
```

### Logs

```bash
docker compose logs -f cetas
docker compose logs -f searxng
sudo journalctl -u caddy -f
```

---

## 11. Backup & restauration

### Backup

```bash
mkdir -p /root/backups/cetas-$(date +%Y%m%d)
cp -r /opt/cetas/.vault /root/backups/cetas-$(date +%Y%m%d)/
cp /opt/cetas/.env /root/backups/cetas-$(date +%Y%m%d)/
cp /opt/cetas/.env.docker /root/backups/cetas-$(date +%Y%m%d)/

docker run --rm -v cetas-data:/data -v /root/backups:/backup alpine \
  tar czf /backup/cetas-data-$(date +%Y%m%d).tar.gz -C /data .
```

### Restauration

```bash
docker run --rm -v cetas-data:/data -v /root/backups:/backup alpine \
  tar xzf /backup/cetas-data-YYYYMMDD.tar.gz -C /data
cp /root/backups/cetas-YYYYMMDD/.vault/.enc /opt/cetas/.vault/.enc
cp /root/backups/cetas-YYYYMMDD/.env /opt/cetas/.env
```

---

## 12. Migration

### Depuis un serveur existant

```bash
rsync -avz --exclude='node_modules' --exclude='.git' \
  /opt/cetas/ user@NOUVEAU_VPS:/opt/cetas/
```

### Sur le nouveau serveur

```bash
docker run --rm -v cetas-data:/data -v /tmp:/backup alpine \
  tar xzf /backup/cetas-data-YYYYMMDD.tar.gz -C /data

chmod 755 .vault
chmod 644 .vault/.enc .env

docker compose build --no-cache
docker compose up -d
```

### Fichiers critiques

| Fichier | Conséquence si manquant |
|---------|------------------------|
| `.vault/.enc` | Aucune clé API chargée |
| `.env` | Proxy ne démarre pas |
| `.env.docker` | Container ne démarre pas |
| `core/users-seed.json` | Pas de compte admin |
| Volume `cetas-data` | Données perdues |

---

## 13. Ajouter un provider

### Étapes

1. **proxy/server.py** → Ajouter dans `PROVIDER_CONFIG` :
```python
"monprovider": {
    "base_url": "https://api.monprovider.com",
    "auth": {"type": "header", "header": "Authorization", "prefix": "Bearer "},
},
```

2. **proxy/server.py** → Ajouter dans `PROXY_ALLOWED_PATHS` :
```python
"monprovider": ["/v1/chat/completions"],
```

3. **models.js** → Ajouter les modèles dans `MODELS_DATA` :
```javascript
{ id: "mon-modele", label: "Mon Modèle", editeur: "monprovider", inputPer1M: 1, outputPer1M: 5 }
```

4. **index.html** → Si domaine unique, ajouter au CSP `connect-src`

5. **images/** → Ajouter l'icône SVG du provider

6. **.env** → Chiffrer la clé API avec `add_api_key.py`

---

## 14. Variables d'environnement

| Variable | Défaut | Description |
|----------|--------|-------------|
| `CETAS_VAULT_PASSWORD` | — | Mot de passe du coffre-fort **(obligatoire)** |
| `CETAS_WORKER_TOKEN` | — | Token Cloudflare Worker (optionnel) |
| `CETAS_CORS_ORIGINS` | `https://samui.neva-ci.pro` | Origines CORS autorisées |
| `CETAS_PEPPER` | — | Secret anti-bruteforce offline (optionnel) |
| `PROXY_PORT` | 8080 | Port d'écoute du proxy Python |
| `CETAS_BASE_DIR` | auto-détecté | Racine de l'application |
| `CETAS_DATA_DIR` | `/app/data` | Répertoire données users |
| `CETAS_VAULT_PATH` | `{BASE_DIR}/.vault/.enc` | Chemin du vault |
| `CETAS_ENV_PATH` | `{BASE_DIR}/.env` | Chemin du .env |
| `CETAS_CRYPTO_PATH` | `{BASE_DIR}/core/linux/crypto_linux.py` | Module crypto |
| `SEARXNG_SECRET_KEY` | — | Clé secrète SearXNG **(obligatoire)** |

---

## 15. Troubleshooting

| Problème | Solution |
|----------|----------|
| Container ne démarre pas | `docker compose logs cetas` — vérifier .env.docker |
| keys_loaded: 0 | Vault ou .env mal configuré — vérifier .env |
| 502 Bad Gateway | Container pas sur port 8080 — vérifier docker-compose.yml |
| JWT invalide après rebuild | Se déconnecter/reconnecter (clear sessionStorage) |
| Module crypto introuvable | Vérifier crypto_linux.py présent dans core/linux/ |
| Permission denied .vault | `chmod 755 .vault && chmod 644 .vault/.enc` |
| SearXNG ne démarre pas | `docker compose logs searxng` — vérifier SEARXNG_SECRET_KEY |
| Docker Hub timeout | `sudo ip link set dev eth0 mtu 1300` |
| 401 sur toutes les routes | JWT expiré — se reconnecter ou reset .jwt_secret |
| webSearchEnabled:false | Changer !1 en !0 dans js/state.js + rebuild |
| Provider non reconnu | Ajouter dans PROVIDER_CONFIG + PROXY_ALLOWED_PATHS |

---

**Déploiement terminé.** © Marexsoft Corporation

# Cetas — Guide de déploiement complet sur VPS

> **Stack :** Debian 13 + Docker + Caddy + SearXNG  
> **Application :** Cetas v3.8 — Assistant IA multi-modèles  
> **Éditeur :** Marexsoft Corporation — Fondateur Kouassi Marius

---

## Table des matières

1. [Prérequis](#1-prérequis)
2. [Architecture cible](#2-architecture-cible)
3. [Étape 1 — Cloner le dépôt](#3-étape-1--cloner-le-dépôt)
4. [Étape 2 — Générer les secrets](#4-étape-2--générer-les-secrets)
5. [Étape 3 — Setup vault + clés API](#5-étape-3--setup-vault--clés-api)
6. [Étape 4 — Chiffrer les clés pour le proxy](#6-étape-4--chiffrer-les-clés-pour-le-proxy)
7. [Étape 5 — Configurer docker-compose.yml](#7-étape-5--configurer-docker-composeyml)
8. [Étape 6 — Créer .env.docker](#8-étape-6--créer-envdocker)
9. [Étape 7 — Build Docker](#9-étape-7--build-docker)
10. [Étape 8 — Configurer Caddy](#10-étape-8--configurer-caddy)
11. [Étape 9 — Démarrer les services](#11-étape-9--démarrer-les-services)
12. [Étape 10 — Premier accès & configuration admin](#12-étape-10--premier-accès--configuration-admin)
13. [Optionnel — Cloudflare Worker (backup anti-SPOF)](#13-optionnel--cloudflare-worker-backup-anti-spof)
14. [Optionnel — Vault Guard (immutabilité noyau)](#14-optionnel--vault-guard-immutabilité-noyau)
15. [Maintenance](#15-maintenance)
16. [Troubleshooting](#16-troubleshooting)

---

## 1. Prérequis

### VPS minimum

| Ressource | Minimum | Recommandé |
|-----------|---------|------------|
| CPU | 1 vCPU | 2+ vCPU |
| RAM | 1 Go | 2+ Go |
| Disque | 10 Go | 20+ Go |
| OS | **Debian 13** | Debian 13 |

### Logiciels requis

```bash
# Installer Docker + docker-compose
sudo apt update && sudo apt install -y docker.io docker-compose-v2

# Vérifier
docker --version          # ≥ 24.0
docker compose version    # ≥ 2.0

# Ajouter votre utilisateur au groupe docker (évite sudo)
sudo usermod -aG docker $USER

# Déconnectez-vous/reconnectez-vous pour que le groupe prenne effet
# ou lancez : newgrp docker
```

### Domaine

- Un nom de domaine pointant vers l'IP publique du VPS (ex: `cetas.mondomaine.com`)
- Type d'enregistrement DNS : **A** → `<IP_VPS>`
- Vérifier que le domaine résout :
  ```bash
  dig +short cetas.mondomaine.com
  # Doit retourner l'IP du VPS
  ```

---

## 2. Architecture cible

```
Internet (HTTPS)
    │
    ▼
Caddy (port 443 → reverse proxy → port 8080)
    │                              ↑
    │  SSL Let's Encrypt auto      │
    │                              │
    ▼                              │
Docker Compose                     │
┌──────────────────────────────┐   │
│ cetas (container)            │   │
│   nginx :80 ← Caddy          │───┘
│   ├─ /api/* → proxy Python   │
│   ├─ /search → SearXNG       │
│   └─ / → SPA statique        │
│                              │
│ searxng (container)          │
│   SearXNG :8080              │
│   (interne, pas exposé)      │
└──────────────────────────────┘
```

**Points clés :**
- Caddy gère HTTPS (Let's Encrypt automatique)
- Le container `cetas` expose le port `8080` sur l'hôte
- SearXNG est joignable uniquement en interne (`127.0.0.1:8084`)
- Le proxy Python tourne dans le même container que Nginx (`127.0.0.1:8080`)

---

## 3. Étape 1 — Cloner le dépôt

```bash
# Créer le répertoire de l'application
mkdir -p /opt/cetas
cd /opt/cetas

# Cloner le dépôt
git clone git@github.com:Hajrudin-Zelef/Cetas-WebUi.git .

# Passer sur la branche stable
git checkout feat/auth-server-side
```

### ⚠️ Fichiers confidentiels à transférer manuellement

**Les fichiers suivants sont exclus du dépôt Git (gitignored) pour des raisons de sécurité.**  
Vous devez les copier **depuis votre installation existante** vers le VPS :

```bash
# Depuis le serveur source (ex: votre machine actuelle)
scp /home/sam/kiro/setup.py                    root@VPS_IP:/opt/cetas/
scp /home/sam/kiro/core/linux/crypto_linux.py  root@VPS_IP:/opt/cetas/core/linux/
scp /home/sam/kiro/core/linux/vault_guard.py   root@VPS_IP:/opt/cetas/core/linux/

# Si vous avez déjà un vault + .env configuré, transférez-les aussi :
scp -r /home/sam/kiro/.vault                   root@VPS_IP:/opt/cetas/
scp /home/sam/kiro/.env                        root@VPS_IP:/opt/cetas/
```

> 🔒 **Pourquoi ces fichiers sont exclus :**  
> `setup.py` contient le hash du mot de passe setup, `crypto_linux.py` contient l'implémentation du SecureVault (AES-256-GCM + Scrypt), et `vault_guard.py` est le daemon d'immutabilité. Ces fichiers font partie du module de sécurité propriétaire Marexsoft.

**Après transfert, vérifiez :**
```bash
ls -la /opt/cetas/setup.py                      # Doit exister
ls -la /opt/cetas/core/linux/crypto_linux.py    # Doit exister
ls -la /opt/cetas/core/linux/vault_guard.py     # Doit exister

# Corriger les permissions
chmod 755 /opt/cetas/setup.py
chmod 755 /opt/cetas/core/linux/crypto_linux.py
chmod 755 /opt/cetas/core/linux/vault_guard.py
mkdir -p /opt/cetas/core/linux/__pycache__
```

### Structure après clonage + transfert

```
/opt/cetas/
├── index.html              # SPA principale
├── js/                     # Modules JavaScript (~22 fichiers)
├── css/                    # Modules CSS (8 fichiers)
├── images/                 # Logos, icônes
├── models.js               # Catalogue de modèles
├── proxy/
│   ├── server.py           # Backend Python (proxy API + auth JWT)
│   ├── encrypt_keys.py     # Chiffre les clés vault → .env
│   └── cloudflare-worker.js
├── core/
│   └── linux/
│       ├── crypto_linux.py # SecureVault (AES-256-GCM + Scrypt) ← TRANSFÉRÉ
│       └── vault_guard.py  # Daemon immutabilité vault ← TRANSFÉRÉ
├── setup.py                # Configuration initiale ← TRANSFÉRÉ
├── nginx.conf              # Configuration Nginx
├── Dockerfile              # Build image Docker
├── docker-compose.yml      # Stack Docker
├── start.sh                # Script d'entrée container
├── .vault/                 # (créé par setup.py ou transféré)
└── .env                    # (créé par encrypt_keys.py ou transféré)
```

---

## 4. Étape 2 — Générer les secrets

Vous avez besoin de **4 secrets** :

| Secret | Usage | Taille recommandée |
|--------|-------|-------------------|
| `CETAS_VAULT_PASSWORD` | Déchiffre le coffre `.vault/.enc` | 20+ caractères |
| `CETAS_WORKER_TOKEN` | Token partagé avec le Worker Cloudflare | 32 caractères hex |
| `SEARXNG_SECRET_KEY` | Clé secrète SearXNG | 32 caractères hex |
| Mot de passe setup.py | Accès à la configuration | 12+ caractères |

### Générer les secrets

```bash
# Générer des valeurs fortes
python3 -c "import secrets; print('VAULT_PASSWORD:', secrets.token_urlsafe(24))"
python3 -c "import secrets; print('WORKER_TOKEN:', secrets.token_hex(32))"
python3 -c "import secrets; print('SEARXNG_KEY:', secrets.token_hex(32))"
```

**Notez ces valeurs dans un fichier temporaire** (vous les utiliserez aux étapes 5, 6 et 8) :

```bash
# /opt/cetas/secrets.txt — STOCKEZ EN LIEU SÛR, SUPPRIMEZ APRÈS CONFIG
# sudo chmod 600 /opt/cetas/secrets.txt
```

---

## 5. Étape 3 — Setup vault + clés API

Le `setup.py` crée le coffre-fort chiffré (`.vault/.enc`) et configure les clés API.

```bash
cd /opt/cetas

# Installer les dépendances Python pour le setup
pip3 install --break-system-packages cryptography requests psutil platformdirs

# Lancer le setup
python3 setup.py
```

### Déroulement interactif

1. **Dépendances** — vérification/installation automatique
2. **Mot de passe setup** — le mot de passe par défaut est `yoroboul88`
3. **Création du coffre** — entrez un mot de passe fort pour le vault (générez avec `python3 -c "import secrets; print(secrets.token_urlsafe(24))"`)
4. **Configuration des providers** — entrez vos clés API :
   - Chaque clé est **testée automatiquement** avant enregistrement
   - Appuyez sur **Entrée** pour passer un provider
   - Providers disponibles : NVIDIA NIM, Groq, OpenRouter, DeepSeek, Anthropic, OpenAI, Grok, Perplexity, Google, Mistral, etc.
5. **Comptes administrateurs** — créez au moins un compte admin :
   ```
   Username : admin
   Email    : votre@email.com
   Mot de passe : ************
   ```
6. **Email SMTP** — optionnel (pour envoi emails de vérification)

### Résultat

```
/opt/cetas/.vault/
├── .enc          # Coffre chiffré (AES-256-GCM + Scrypt N=2^16)
├── .system       # Type de système (linux)
└── .guard_config # Chemin du vault (pour vault_guard)

/opt/cetas/core/
└── users-seed.json  # Export des comptes admin (importé au 1er lancement)
```

---

## 6. Étape 4 — Chiffrer les clés pour le proxy

Le proxy Python ne lit pas directement le vault — il utilise un fichier `.env` avec les clés chiffrées via une `proxy_key`.

```bash
cd /opt/cetas

# Exportez le mot de passe du vault
export CETAS_VAULT_PASSWORD="votre_mot_de_passe_vault"

# Chiffrer les clés → .env
python3 proxy/encrypt_keys.py
```

### Vérification

```bash
# Le fichier .env doit exister avec les clés chiffrées
cat /opt/cetas/.env
# Exemple de sortie :
# anthropic_key=a1b2c3d4...:e5f6g7h8...
# deepseek_key=...
# google_key=...
# ...

# Permissions : 600 (lecture seule par le propriétaire)
ls -la /opt/cetas/.env
# -rw------- 1 root root 1234 Aug  3 14:00 .env
```

---

## 7. Étape 5 — Configurer docker-compose.yml

Éditez `docker-compose.yml` pour utiliser des chemins relatifs (pas de `/home/sam/kiro/`) :

```bash
cd /opt/cetas
```

Créer/modifier `docker-compose.yml` :

```yaml
# Cetas + SearXNG — © Marexsoft Corporation. Fondateur Kouassi Marius.

services:
  cetas:
    build: .
    ports:
      - "8080:80"
    restart: unless-stopped
    env_file:
      - .env.docker
    volumes:
      - ./.vault:/usr/share/nginx/html/.vault
      - ./.env:/usr/share/nginx/html/.env
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
    cap_drop:
      - ALL
    cap_add:
      - CHOWN
      - SETGID
      - SETUID

volumes:
  cetas-data:
```

**Modifications par rapport à l'original :**
- `./.vault` et `./.env` en chemins relatifs (pas de `:ro` — `start.sh` gère les permissions au démarrage)
- `SEARXNG_SECRET_KEY` est dans `.env.docker` via `env_file` (plus besoin d'export manuel)

---

## 8. Étape 6 — Créer .env.docker

```bash
cd /opt/cetas
nano .env.docker
```

Contenu :

```bash
# Cetas — Variables d'environnement Docker
# Généré le <DATE> pour le VPS <HOSTNAME>

# Mot de passe du coffre-fort (obligatoire)
CETAS_VAULT_PASSWORD=votre_mot_de_passe_vault

# Token partagé avec le Worker Cloudflare (optionnel si pas de worker)
CETAS_WORKER_TOKEN=token_hex_32_caracteres

# Origines CORS autorisées — remplacez par votre domaine
CETAS_CORS_ORIGINS=https://cetas.mondomaine.com,http://localhost:8080

# Clé secrète SearXNG (générée à l'étape 2)
SEARXNG_SECRET_KEY=searxng_secret_key_hex
```

```bash
# Sécuriser
chmod 600 /opt/cetas/.env.docker
```

---

## 9. Étape 7 — Build Docker

> ⚠️ **Prérequis :** `core/linux/crypto_linux.py` doit être présent (transféré à l'étape 1).  
> Sans ce fichier, le `docker build` échoue à l'instruction `COPY core/linux/crypto_linux.py /app/core/linux/crypto_linux.py`.

```bash
cd /opt/cetas

# Build (première fois : ~3-5 minutes)
docker compose build --no-cache

# Vérifier l'image
docker images | grep cetas
# cetas  latest  <ID>  <SIZE>
```

### Ce que fait le build

1. Installe Python + PyJWT + cryptography + terser + cleancss
2. Copie les fichiers dans `/usr/share/nginx/html`
3. Compresse les PNGs (pngquant)
4. Minifie tous les JS (terser), concatène + minifie le CSS (cleancss)
5. Crée l'utilisateur non-root `cetas` (uid 1001)
6. Configure Nginx (rate limiting, headers sécurité)
7. Supprime les clés API en clair (api-keys-seed.json) mais garde users-seed.json

---

## 10. Étape 8 — Configurer Caddy

Caddy servira de reverse proxy HTTPS avec certificat Let's Encrypt automatique.

### Installer Caddy

```bash
sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt update && sudo apt install -y caddy
```

### Configurer le reverse proxy

```bash
sudo nano /etc/caddy/Caddyfile
```

```caddyfile
# Cetas — © Marexsoft Corporation

cetas.mondomaine.com {
    reverse_proxy localhost:8080 {
        transport http {
            read_timeout 300s
            write_timeout 300s
        }
    }

    # Logs
    log {
        output file /var/log/caddy/cetas.log
    }
}
```

```bash
# Valider la configuration
caddy validate --config /etc/caddy/Caddyfile

# Redémarrer Caddy
sudo systemctl restart caddy
sudo systemctl status caddy
```

### Vérifier le certificat SSL

```bash
# Après le redémarrage, Caddy obtient le certificat automatiquement
sudo journalctl -u caddy --follow | grep -E "certificate|acme|error"
```

---

## 11. Étape 9 — Démarrer les services

### Configurer SearXNG

```bash
cd /opt/cetas

# Créer le répertoire de config SearXNG (s'il n'existe pas)
mkdir -p searxng-data
```

Créez `searxng-data/settings.yml` :

```yaml
use_default_settings: true
general:
  instance_name: "Cetas Search"
  debug: false
search:
  safe_search: 0
  formats:
    - html
    - json
server:
  secret_key: "cetas-searxng-2026"
  bind_address: "0.0.0.0"
  port: 8080
```

Créez `searxng-data/limiter.yml` :

```yaml
botdetection:
  ip_limit:
    link_token: false
    filter_match: false
  ip_lists:
    pass_ip:
      - 0.0.0.0/0
```

### Démarrer avec docker compose

```bash
cd /opt/cetas

# Démarrer (SEARXNG_SECRET_KEY est dans .env.docker, pas besoin d'export)
docker compose up -d
```

### Vérifier que tout tourne

```bash
# Les deux containers doivent être "Up"
docker compose ps
# NAME                  STATUS
# cetas-cetas-1         Up
# cetas-searxng-1       Up

# Vérifier le proxy Python
curl http://localhost:8080/api/health
# {"status":"ok","keys_loaded":5,"version":"3.8"}

# Vérifier SearXNG
curl http://localhost:8080/search
# (réponse HTML de SearXNG)

# Vérifier l'accès HTTPS via Caddy
curl -I https://cetas.mondomaine.com
# HTTP/2 200
```

---

## 12. Étape 10 — Premier accès & configuration admin

### Se connecter

1. Ouvrir `https://cetas.mondomaine.com`
2. Login avec le compte admin créé à l'étape 3
3. Si c'est votre premier accès, le flag `must_change_password` vous forcera à changer le mot de passe

### Configurer les clés API (alternative à setup.py)

Si vous n'avez pas configuré toutes vos clés via `setup.py`, vous pouvez le faire depuis l'interface :

1. Cliquer sur ⚙️ **Configuration** dans la sidebar
2. Onglet **API**
3. Ajouter vos clés pour chaque provider
4. Les clés sont envoyées au proxy Python et **ne sont jamais stockées dans le navigateur**

### Synchronisation multi-appareils

- Les conversations sont synchronisées automatiquement via le proxy
- Les paramètres (thème, budget, quotas) sont sauvegardés côté serveur
- Après un `clear data` navigateur, tout est restauré automatiquement

---

## 13. Optionnel — Cloudflare Worker (backup anti-SPOF)

Si le VPS est down, le Worker Cloudflare prend le relais automatiquement.

### Prérequis

- Compte Cloudflare (gratuit)
- [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/) installé

### Déploiement

```bash
cd /opt/cetas/proxy

# Installer Wrangler
npm install -g wrangler

# Authentifier
wrangler login

# Configurer le fichier wrangler.toml (déjà existant)
# name = "cetas-backup"
# compatibility_date = "2026-07-24"
```

### Configurer les secrets Cloudflare

```bash
# Ajouter les clés API comme secrets chiffrés
wrangler secret put DEEPSEEK_API_KEY
wrangler secret put OPENROUTER_API_KEY
wrangler secret put CETAS_TOKEN
# ... ajoutez tous les providers que vous voulez en backup
```

### Déployer

```bash
wrangler deploy
# URL : https://cetas-backup.<votre-subdomain>.workers.dev
```

### Mettre à jour la config

Dans `js/config.js` (généré automatiquement au démarrage du container), le token worker est injecté. Le fallback est automatique — le frontend détecte si le proxy primaire est down et bascule vers le Worker.

---

## 14. Optionnel — Vault Guard (immutabilité noyau)

Le Vault Guard utilise `chattr +i` pour rendre le fichier `.vault/.enc` immuable — même root ne peut pas le supprimer ou le modifier.

```bash
cd /opt/cetas

# Installer (nécessite sudo)
sudo python3 core/linux/vault_guard.py install /opt/cetas/.vault/.enc

# Vérifier
lsattr /opt/cetas/.vault/.enc
# ----i--------- /opt/cetas/.vault/.enc

# Commandes disponibles :
#   sudo python3 core/linux/vault_guard.py remove   # Désinstaller
#   sudo python3 core/linux/vault_guard.py stop     # Déverrouiller (pour mise à jour)
#   sudo python3 core/linux/vault_guard.py start    # Verrouiller
#   sudo python3 core/linux/vault_guard.py status   # État
```

> ⚠️ **Important :** avant de relancer `setup.py` ou `encrypt_keys.py`, il faut d'abord désactiver le guard (`stop`), puis le réactiver après (`start`).

---

## 15. Maintenance

### Mise à jour de l'application

```bash
cd /opt/cetas

# Pull les derniers changements
git pull origin feat/auth-server-side

# Rebuild (--no-cache obligatoire si JS modifié)
docker compose build --no-cache

# Redémarrage
docker compose down
docker compose up -d
```

### Logs

```bash
# Logs de l'application
docker compose logs -f cetas

# Logs de SearXNG
docker compose logs -f searxng

# Logs Caddy
sudo journalctl -u caddy -f
```

### Backup

```bash
# Backup du vault + .env + users
mkdir -p /root/backups/cetas-$(date +%Y%m%d)
cp -r /opt/cetas/.vault /root/backups/cetas-$(date +%Y%m%d)/
cp /opt/cetas/.env /root/backups/cetas-$(date +%Y%m%d)/
cp /opt/cetas/.env.docker /root/backups/cetas-$(date +%Y%m%d)/

# Backup du volume Docker (conversations + users.json + JWT secret)
docker run --rm -v cetas-data:/data -v /root/backups:/backup alpine \
  tar czf /backup/cetas-data-$(date +%Y%m%d).tar.gz -C /data .
```

### Restauration

```bash
# Restaurer le volume
docker run --rm -v cetas-data:/data -v /root/backups:/backup alpine \
  tar xzf /backup/cetas-data-20260101.tar.gz -C /data

# Restaurer le vault + .env
cp /root/backups/cetas-20260101/.vault/.enc /opt/cetas/.vault/.enc
cp /root/backups/cetas-20260101/.env /opt/cetas/.env
```

---

## 16b. Migration vers un autre serveur

### Depuis un serveur existant

```bash
# 1. Sauvegarder sur l'ancien serveur
cd /opt/cetas
tar czf /tmp/cetas-migration.tar.gz \
  .vault/ .env .env.docker core/users-seed.json \
  docker-compose.yml Dockerfile start.sh nginx.conf \
  proxy/ css/ js/ images/ index.html models.js manifest.json sw.js

# OU copie directe via rsync (recommandé)
rsync -avz --exclude='node_modules' --exclude='.git' --exclude='searxng-data' \
  /opt/cetas/ user@NOUVEAU_VPS:/opt/cetas/

# 2. Backup du volume Docker (conversations + users.json)
docker run --rm -v cetas-data:/data -v /tmp:/backup alpine \
  tar czf /backup/cetas-data-$(date +%Y%m%d).tar.gz -C /data .
# Copier cetas-data-*.tar.gz vers le nouveau serveur
```

### Sur le nouveau serveur

```bash
# 1. Prérequis
sudo apt update && sudo apt install -y docker.io docker-compose-v2
sudo usermod -aG docker $USER
newgrp docker

# 2. Restaurer les fichiers
# (copier le tar.gz ou utiliser rsync depuis l'ancien serveur)
cd /opt/cetas
tar xzf /tmp/cetas-migration.tar.gz

# 3. Restaurer le volume Docker
docker run --rm -v cetas-data:/data -v /tmp:/backup alpine \
  tar xzf /backup/cetas-data-YYYYMMDD.tar.gz -C /data

# 4. Corriger les permissions
chmod 755 .vault
chmod 644 .vault/.enc .vault/.guard_config .vault/.system
chmod 644 .env

# 5. Build + démarrer
docker compose build --no-cache
docker compose up -d

# 6. Vérifier
docker compose ps          # cetas Up, searxng Up
curl http://localhost:8080/api/health  # {"status":"ok","keys_loaded":N}
```

### Fichiers critiques (NE PAS OUBLIER)

| Fichier | Contenu | Conséquence si manquant |
|---------|---------|------------------------|
| `.vault/.enc` | Clés API chiffrées (AES-256-GCM) | Aucune clé API chargée |
| `.env` | Clés chiffrées pour le proxy | Proxy ne démarre pas |
| `.env.docker` | Mots de passe vault + SearXNG | Container ne démarre pas |
| `core/users-seed.json` | Users seed (importés au 1er lancement) | Pas de compte admin |
| `docker-compose.yml` | Config Docker | Docker ne fonctionne pas |
| Volume `cetas-data` | conversations + users.json + JWT secret | Données perdues |

---

## 16. Troubleshooting

### Le container ne démarre pas

```bash
# Voir les logs
docker compose logs cetas

# Erreurs courantes :
# "CETAS_VAULT_PASSWORD non défini" → vérifier .env.docker
# "Vault introuvable" → vérifier le montage ./.vault
# "Permission denied" → vérifier les permissions du .vault
```

### Le proxy répond "keys_loaded: 0"

```bash
# Le vault ou .env est mal configuré
docker compose exec cetas cat /usr/share/nginx/html/.env | head
# Doit contenir des clés chiffrées (provider_key=iv:ct)
```

### Erreur "502 Bad Gateway" via Caddy

```bash
# Le container cetas est-il bien sur le port 8080 ?
docker compose ps
# Doit montrer 0.0.0.0:8080->80/tcp

# Caddy pointe-t-il vers localhost:8080 ?
grep reverse_proxy /etc/caddy/Caddyfile
```

### JWT invalide après rebuild

Chaque rebuild régénère le secret JWT (sauf si le volume est conservé).

**Solution :** déconnectez-vous et reconnectez-vous (clear sessionStorage).

### Module crypto introuvable

```bash
# Vérifier que le module existe
ls -la /opt/cetas/core/linux/crypto_linux.py

# S'il est absent (gitignoré), contactez l'administrateur Marexsoft
```

### "Permission denied" sur .vault/.enc

```bash
# Les permissions sont gérées par start.sh au démarrage du container
# Si le problème persiste, vérifiez les permissions sur l'hôte
sudo chmod 755 /opt/cetas/.vault
sudo chmod 644 /opt/cetas/.vault/.enc
sudo chmod 644 /opt/cetas/.env
```

### SearXNG ne démarre pas

```bash
# Vérifier les logs SearXNG
docker compose logs searxng

# Vérifier que SEARXNG_SECRET_KEY est dans .env.docker
grep SEARXNG_SECRET_KEY .env.docker
```

---

## Vérification finale

Après déploiement complet, vérifiez tous les points :

```bash
# 1. Services Docker
docker compose ps
# ✓ cetas Up, searxng Up

# 2. Proxy Python
curl http://localhost:8080/api/health
# ✓ {"status":"ok","keys_loaded":≥1}

# 3. SearXNG
curl -s http://localhost:8080/search | head -1
# ✓ <!DOCTYPE html>

# 4. Caddy HTTPS
curl -sI https://cetas.mondomaine.com | head -1
# ✓ HTTP/2 200

# 5. Application
# Ouvrir https://cetas.mondomaine.com dans un navigateur
# ✓ Splash screen → Login → Chat fonctionnel
```

---

**Déploiement terminé.** 🐋

© Marexsoft Corporation — Tous droits réservés.

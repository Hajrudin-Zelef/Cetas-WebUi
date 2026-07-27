# 🔒 CETAS — Audit de sécurité

**Date** : 2026-07-27
**Scope** : Codebase complet (frontend JS, proxy Python, Docker, Nginx, Cloudflare Worker)
**Méthodologie** : OWASP Top 10 + STRIDE + analyse manuelle
**Outils disponibles** : npm (gitleaks, semgrep, trivy, bandit absents)

---

## Synthèse exécutive

| Sévérité | Nombre |
|----------|--------|
| 🔴 CRITICAL | 2 |
| 🟠 HIGH | 5 |
| 🟡 MEDIUM | 8 |
| 🟢 LOW | 5 |
| **Total** | **20** |

**CETAS a un bon niveau de sécurité sur le chiffrement des données** (AES-256-GCM, vault avec pepper, PBKDF2/scrypt, écriture atomique). Les vulnérabilités CRITICAL concernent des **secrets hardcodés dans le code source**, exposant les clés API de tous les providers.

**Top 3 à corriger immédiatement :**
1. Token Cloudflare Worker en clair dans `js/api.js:26` → compromet toutes les clés API
2. Mot de passe vault par défaut dans `docker-compose.yml:12` → désactive le chiffrement des clés
3. Pas de HTTPS → mots de passe et JWT en clair sur le réseau

---

## 🔴 CRITICAL (2)

### CRIT-01 : Token Worker Cloudflare en clair dans le code source

**Fichier** : `js/api.js:26`
**Effort** : S (< 1 jour)

```js
const PROXY_WORKER_TOKEN = 'aa7217a90bcf2a786d80720b4355d70e3fdca07c758dc7ea2d49ec96f619ee88';
```

Ce token partagé est commité dans Git. Toute personne ayant accès au repo peut :
- Appeler le Worker Cloudflare et proxyfier des requêtes vers **tous les providers AI** (OpenAI, Anthropic, DeepSeek, Groq, etc.)
- Consommer le quota API sans limite
- Potentiellement exfiltrer les clés API si le worker a des endpoints de debug

**Correction** :
```js
// Remplacer par :
const PROXY_WORKER_TOKEN = window.CETAS_CONFIG?.workerToken || '';
```
Injecter le token via une variable d'environnement au build ou au runtime.

**Rotation immédiate** : changer le token sur Cloudflare Worker ET dans le code.

---

### CRIT-02 : Mot de passe vault par défaut dans docker-compose.yml

**Fichier** : `docker-compose.yml:12`
**Effort** : S (< 1 jour)

```yaml
- CETAS_VAULT_PASSWORD=${CETAS_VAULT_PASSWORD:-Yoroboul2026!+}
```

Si `CETAS_VAULT_PASSWORD` n'est pas défini dans l'environnement, le vault entier se déchiffre avec `Yoroboul2026!+`. Toutes les clés API de tous les providers sont alors exposées.

**Correction** : Supprimer la valeur par défaut et faire échouer le démarrage si la variable est absente :
```yaml
- CETAS_VAULT_PASSWORD=${CETAS_VAULT_PASSWORD:?CETAS_VAULT_PASSWORD requis}
```

---

## 🟠 HIGH (5)

### HIGH-01 : JWT secret stocké dans le même fichier que les données utilisateur

**Fichier** : `proxy/server.py:183-186`
**Effort** : S (< 1 jour)

```python
data = {"version": 1, "users": _users, "jwt_secret": _jwt_secret}
with open(USERS_PATH, "w", encoding="utf-8") as f:
    json.dump(data, f, ensure_ascii=False, indent=2)
```

Le secret JWT est persisté dans `/app/data/users.json` aux côtés des hashs de mot de passe. Quiconque lit ce fichier peut :
- Forger des tokens JWT pour n'importe quel utilisateur
- S'authentifier en tant qu'admin

**Correction** : Stocker le secret JWT dans un fichier séparé avec permissions `0o600`, hors de l'arborescence web :
```python
JWT_SECRET_PATH = os.path.join(DATA_DIR, ".jwt_secret")
```

---

### HIGH-02 : Compte admin par défaut admin/admin

**Fichier** : `js/auth.js:205-213`
**Effort** : S (< 1 jour)

```js
const defaultHash = await _hashPassword('admin');
users = [{
  username: 'admin',
  email: 'admin@cetas.local',
  password_hash: defaultHash,
  role: 'admin',
  must_change_password: true
}];
```

Le flag `must_change_password` force un changement au login, mais :
- Un attaquant avec accès au localStorage peut supprimer ce flag
- Le fallback localStorage (mode hors-ligne) contourne complètement la vérification
- L'email `admin@cetas.local` est prédictible

**Correction** : Exiger un mot de passe admin fort au premier lancement (via `setup.py`), ne jamais créer de compte par défaut.

---

### HIGH-03 : Pas de HTTPS/TLS

**Fichier** : `nginx.conf:3`, `docker-compose.yml:9`
**Effort** : M (1-5 jours)

```nginx
server {
    listen 80;
```

Nginx écoute uniquement en HTTP. Les mots de passe et tokens JWT transitent en clair sur le réseau.

**Correction** : Ajouter TLS (Let's Encrypt / mkcert pour le dev) :
```nginx
server {
    listen 443 ssl;
    ssl_certificate /etc/nginx/certs/fullchain.pem;
    ssl_certificate_key /etc/nginx/certs/privkey.pem;
}
server {
    listen 80;
    return 301 https://$host$request_uri;
}
```

---

### HIGH-04 : Permier utilisateur à s'enregistrer devient admin

**Fichier** : `proxy/server.py:601`
**Effort** : S (< 1 jour)

```python
role = "admin" if len(users) == 0 else "user"
```

Si `users.json` est supprimé ou corrompu (crash, attaque, erreur de déploiement), le prochain utilisateur qui s'enregistre devient admin.

**Correction** : L'admin doit être créé uniquement via `setup.py` ou une procédure manuelle. Bloquer `/api/auth/register` si aucun admin n'existe :
```python
if len(users) == 0:
    self._respond_json({"error": "Aucun admin. Lancez setup.py."}, 403)
    return
```

---

### HIGH-05 : CORS wildcard + pas de protection CSRF

**Fichier** : `proxy/server.py:695,703`
**Effort** : M (1-5 jours)

```python
self.send_header("Access-Control-Allow-Origin", "*")
```

Toutes les réponses API ont `Access-Control-Allow-Origin: *`. N'importe quel site web peut :
- Faire des requêtes authentifiées vers l'API CETAS
- Modifier/supprimer des conversations
- Consommer les clés API via le proxy

**Correction** : Restreindre à l'origine connue :
```python
origin = self.headers.get("Origin", "")
if origin in allowed_origins:
    self.send_header("Access-Control-Allow-Origin", origin)
    self.send_header("Vary", "Origin")
```
Ajouter un token CSRF (double-submit cookie pattern) pour les mutations.

---

## 🟡 MEDIUM (8)

### MED-01 : .env lisible par tous les processus du conteneur

**Fichier** : `Dockerfile:21`
**Effort** : S (< 1 jour)

```dockerfile
RUN chmod 644 /usr/share/nginx/html/.env 2>/dev/null || true
```

Le fichier `.env` contient les clés API chiffrées (AES-256-GCM avec proxy_key). Un accès en lecture facilite une attaque par brute force hors ligne.

**Correction** : `chmod 600` et `chown cetas:cetas`.

---

### MED-02 : Répertoire vault accessible en lecture

**Fichier** : `start.sh:10`
**Effort** : S (< 1 jour)

```bash
chmod -R 755 /usr/share/nginx/html/.vault 2>/dev/null || true
```

Le vault est monté en volume Docker et readable par tous les processus.

**Correction** : `chmod 700` et `chown cetas:cetas`.

---

### MED-03 : Hashage serveur plus faible que le client

**Fichiers** : `proxy/server.py:111` vs `js/auth.js:33`
**Effort** : S (< 1 jour)

| Côté | Algo | Paramètres |
|------|------|-----------|
| Client (JS) | PBKDF2 | 600 000 itérations SHA-256 |
| Serveur (Python) | Scrypt | N=16 384 (OWASP min = 2¹⁷) |

Le serveur utilise Scrypt N=16384, sous le minimum OWASP recommandé (131 072). Le hash client est plus résistant que le hash serveur.

**Correction** : Augmenter Scrypt à N=2¹⁷ (131 072) côté serveur :
```python
SCRYPT_N = 2**17  # 131 072 — conforme OWASP 2025
```

---

### MED-04 : JWT expire en 7 jours sans refresh

**Fichier** : `proxy/server.py:219`
**Effort** : S (< 1 jour)

```python
"exp": now + 604800  # 7 jours
```

Un token volé reste valide 7 jours. Pas de mécanisme de révocation.

**Correction** : Réduire à 1h + implémenter un refresh token :
```python
"exp": now + 3600  # 1 heure
```

---

### MED-05 : Proxy API permet de faire des requêtes arbitraires

**Fichier** : `proxy/server.py:832-901`
**Effort** : M (1-5 jours)

```python
# Tout utilisateur authentifié peut faire :
GET /api/proxy/anthropic/v1/messages   # avec les clés du serveur
POST /api/proxy/openai/v1/chat/completions  # idem
```

Le proxy forwarde n'importe quel path vers n'importe quel provider configuré. Un utilisateur malveillant peut :
- Consommer le quota API de façon illimitée
- Accéder à des endpoints non prévus (ex: `/admin`, `/billing`)
- Utiliser les clés pour son propre usage

**Correction** : Restreindre les paths autorisés par provider (allowlist) :
```python
ALLOWED_PATHS = {
    "openai": ["/v1/chat/completions", "/v1/models"],
    "anthropic": ["/v1/messages"],
    # ...
}
```

---

### MED-06 : Path traversal potentiel dans les noms de fichier

**Fichier** : `proxy/server.py:341-343`
**Effort** : S (< 1 jour)

```python
def _conv_file_path(username: str, filename: str) -> str:
    safe_fn = filename.replace("/", "_").replace("\\", "_")
    return os.path.join(_conv_user_dir(username), safe_fn)
```

Seuls `/` et `\` sont filtrés. Un nom comme `../../etc/passwd` n'est pas bloqué car il n'y a pas de `/` simple mais `..` qui reste valide.

**Correction** : Utiliser `os.path.basename()` ou vérifier que le résultat est bien dans le répertoire attendu :
```python
safe_fn = os.path.basename(filename)
full_path = os.path.realpath(os.path.join(_conv_user_dir(username), safe_fn))
if not full_path.startswith(os.path.realpath(CONV_DIR)):
    raise ValueError("Path traversal détecté")
```

---

### MED-07 : innerHTML utilisé sans vérification systématique

**Fichiers** : `js/user-management.js:32`, `js/quotas.js:329,346`, `js/conversations.js:6,82`
**Effort** : M (1-5 jours)

```js
usersList.innerHTML = users.map(u => { ... }).join('')  // user-management.js:32
list.innerHTML = QUOTA_PROVIDERS.map(p => ...).join('')  // quotas.js:329
```

Utilisation d'`innerHTML` avec des données potentiellement non échappées. Si une réponse API contient du HTML, XSS possible.

**Vérification** : Le projet inclut `purify.min.js` (DOMPurify). Vérifier qu'il est utilisé avant chaque `innerHTML` sur des données non fiables.

**Correction** : `usersList.innerHTML = DOMPurify.sanitize(users.map(...).join(''));`

---

### MED-08 : Rate limiting absent sur la plupart des endpoints

**Fichier** : `proxy/server.py:92-103`
**Effort** : S (< 1 jour)

Le rate limiter n'est appliqué qu'à `/api/auth/login` et `/api/auth/register`. Les endpoints suivants ne sont pas protégés :
- `POST /api/conversations/*` — sauvegarde de conversations
- `PUT /api/settings` — modification des paramètres utilisateur
- `GET /api/proxy/*` — proxy API (consommation de tokens)

**Correction** : Étendre le rate limiting à tous les endpoints modifiants.

---

## 🟢 LOW (5)

### LOW-01 : Pas de minimum de longueur de mot de passe côté serveur

**Fichier** : `proxy/server.py:593`
**Effort** : S (< 1 jour)

Le client valide 12 caractères minimum, mais le serveur accepte n'importe quelle longueur.

---

### LOW-02 : Répertoire .vault potentiellement exposé via nginx

**Fichier** : `nginx.conf:4,15-17`

```nginx
root /usr/share/nginx/html;
location / { try_files $uri $uri/ /index.html; }
```

Nginx peut théoriquement servir `.vault/.enc` si le fichier existe à la racine web. Heureusement, `vault_guard.py` avec `chattr +i` protège contre ça.

**Correction** : Ajouter une règle explicite :
```nginx
location ~ /\. { deny all; return 404; }
```

---

### LOW-03 : SEARXNG_SECRET_KEY par défaut faible

**Fichier** : `docker-compose.yml:25`

```yaml
SEARXNG_SECRET_KEY=${SEARXNG_SECRET_KEY:-changeme}
```

---

### LOW-04 : Logging d'informations utilisateur

**Fichier** : `proxy/server.py:611`

```python
log.info("Utilisateur créé: %s (role=%s)", uname, role)
```

Les noms d'utilisateur et rôles sont loggés en clair.

---

### LOW-05 : Headers de sécurité HTTP manquants

**Fichier** : `proxy/server.py:690-698`, `nginx.conf`

Headers manquants :
- `Strict-Transport-Security` (HSTS)
- `Content-Security-Policy`
- `X-XSS-Protection`
- `Referrer-Policy`
- `Permissions-Policy`

---

## Modélisation des menaces (STRIDE)

| Catégorie | Menace | Sévérité |
|-----------|--------|----------|
| **Spoofing** | JWT forgé si users.json lu (HIGH-01) | HIGH |
| **Tampering** | Modification localStorage → contourne `must_change_password` (HIGH-02) | HIGH |
| **Repudiation** | Pas d'audit log pour les actions admin | LOW |
| **Info Disclosure** | Token worker en clair → toutes les clés API (CRIT-01) | CRITICAL |
| **Info Disclosure** | Mots de passe/JWT en clair HTTP (HIGH-03) | HIGH |
| **DoS** | Pas de rate limit sur proxy API (MED-08) | MEDIUM |
| **Elevation** | Premier registrant = admin (HIGH-04) | HIGH |
| **CSRF** | CORS wildcard + pas de token CSRF (HIGH-05) | HIGH |

---

## Plan d'action priorisé

| Priorité | Finding | Action | Effort |
|----------|---------|--------|--------|
| 🔴 P0 | CRIT-01 | Rotation immédiate du token Worker + suppression du code | S |
| 🔴 P0 | CRIT-02 | Supprimer le mot de passe vault par défaut | S |
| 🟠 P1 | HIGH-03 | Activer HTTPS/TLS | M |
| 🟠 P1 | HIGH-01 | Séparer le secret JWT de users.json | S |
| 🟠 P1 | HIGH-04 | Bloquer l'auto-registration si pas d'admin | S |
| 🟠 P2 | HIGH-02 | Supprimer le compte admin par défaut | S |
| 🟠 P2 | HIGH-05 | Restreindre CORS + ajouter CSRF | M |
| 🟡 P3 | MED-05 | Restreindre les paths du proxy API | M |
| 🟡 P3 | MED-03 | Augmenter scrypt N à 2¹⁷ | S |
| 🟡 P3 | MED-07 | Vérifier DOMPurify avant chaque innerHTML | M |
| 🟡 P4 | MED-01,02,04,06,08 | Corrections mineures groupées | S |
| 🟢 P5 | LOW-01 à 05 | Améliorations de confort sécurité | S |

---

## Notes positives ✅

- 🔐 **Chiffrement des clés API** : AES-256-GCM avec AAD, nonce HKDF, pepper, scrypt — conception solide
- 🔐 **Vault Guard** : `chattr +i` (immutabilité kernel-level) + service systemd de monitoring
- 🔐 **Écriture atomique** : `mkstemp` + `os.replace` + `fsync` — pas de corruption possible
- 🔐 **Migration automatique** : V2 → V3 → V4 des formats de vault
- 🔐 **Rate limiting** : Présent sur les endpoints d'authentification
- 🔐 **Headers de sécurité basiques** : `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`
- 🔐 **DOMPurify inclus** : Librairie de sanitization HTML présente
- 🔐 **Migration SHA-256 → PBKDF2/Scrypt** : Les anciens hashs faibles sont automatiquement migrés

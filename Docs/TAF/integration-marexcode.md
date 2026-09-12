# Intégration Marexcode dans CETAS

> Date: 2026-09-04
> Statut: **Implémenté — Compétence (chat) + Module complet (vue plein écran)** ✅

---

## Module complet — Vue plein écran (DeepSeek Harness-like)

Ajouté le 2026-09-04. Le bouton sidebar **Marexcode** (plus grisé) ouvre une vue
plein écran dédiée : file tree du workspace, chat agent avec trajectoire des appels
d'outils, sessions persistantes par projet, éditeur fichier en lecture seule.

### Endpoints backend

| Méthode | Route | Rôle |
|---------|-------|------|
| POST | `/api/exec` | Exécution outils (workspace par utilisateur, rate-limit 60/min/user) |
| GET | `/api/marexcode/tree` | Listing récursif du workspace (exclut `.git`, `node_modules`, cachés) |
| GET | `/api/marexcode/sessions` | Liste meta des sessions |
| GET | `/api/marexcode/sessions/{id}` | Session complète |
| PUT | `/api/marexcode/sessions/{id}` | Sauvegarder une session |
| DELETE | `/api/marexcode/sessions/{id}` | Supprimer une session |

### Workspace & sessions

- Workspace par utilisateur : `DATA_DIR/marexcode/<user>/` (`_marex_workspace`), sandbox
  des outils `_exec_*` (anti `../`, symlinks).
- Sessions : `DATA_DIR/marexcode/<user>/sessions/*.json` (`_marex_sessions_*`),
  anti-traversal sur l'id.

### Frontend

| Élément | Fichier |
|---------|---------|
| Vue plein écran | `static/partials/marexcode.html` |
| Styles | `static/css/features/marexcode.css` (concaté dans style.css) |
| Factory | `static/js/features/marexcode.js` (`createMarexcode`, API open/close/isOpen) |
| Activation | `static/js/core/app.js` (bouton `data-module="marexcode"` + import factory) |
| Trajectoire | `static/js/integrations/tool-search.js` (`marexcode-tool` CustomEvent start/end) |
| Itérations | `window._toolMaxIterations` (10 en module, défaut 3) |
| Test structurel | `static/tests/marexcode-structure.test.mjs` |

### Vérification

```bash
python3 -m pytest server/tests/test_exec.py server/tests/test_marexcode.py -v
node --test static/tests/marexcode-structure.test.mjs
```

## Objectif

Intégrer Marexcode (assistant de codage IA terminal) comme **Compétence** dans CETAS.
Marexcode s'ouvre directement dans le chat courant (comme Codex/Zcode), avec outils
(file read/write, bash, grep) exécutés côté serveur via un sandbox sécurisé.

## Architecture existante (prête à brancher)

| Composant | Fichier | État |
|-----------|---------|------|
| Tool definitions (OpenAI format) | `static/js/core/api.js` | ✅ `WEB_SEARCH_TOOLS` |
| Tool dispatcher | `static/js/integrations/tool-search.js` | ✅ `_executeToolCall()` |
| Boucle agentic multi-tours | `static/js/integrations/tool-search.js` | ✅ `streamModelWithTools()` max 3 itérations |
| SSE parser avec tool_calls | `static/js/core/api.js` | ✅ `createChatCompletionsParser({accumulateToolCalls:true})` |
| Provider body builder | `static/js/core/api.js` | ✅ Injecte `tools[]` |
| Compétences (prompt-only) | `static/js/ui/plus-menu.js` | ⚠️ Pas de support tools/handler |
| Chat principal utilise tool loop | `static/js/features/chat.js` + `core/app.js` | ❌ Appelle `streamModel()` |
| Backend exec/sandbox | `server/server.py` | ❌ Pas d'endpoint `/api/exec` |

## Étapes d'implémentation

### Backend (prioritaire — sécurité critique)

1. **Endpoint `/api/exec`** dans `server/server.py`
   - Auth JWT requise
   - Whitelist de commandes autorisées (git, ls, cat, grep, node, python, npm…)
   - Timeout par commande (10s max)
   - Pas de sudo/root — exécution en user `cetas`
   - Pas d'accès réseau sortant
   - Logging de toutes les commandes

2. **Tests backend** pour `/api/exec`
   - Commandes whitelistées OK
   - Commandes non-whitelistées refusées (403)
   - Timeout géré
   - Auth requise

### Frontend

3. **Outils Marexcode** dans `static/js/core/api.js`
   - `Read(file_path)` — lire fichier
   - `Write(file_path, content)` — écrire fichier
   - `Edit(file_path, old, new)` — éditer
   - `Bash(command)` — exécuter commande whitelistée
   - `Grep(pattern, path)` — rechercher

4. **Étendre `_executeToolCall()`** dans `static/js/integrations/tool-search.js`
   - Dispatch des nouveaux outils vers `/api/exec`
   - Limite de taille de réponse

5. **Ajouter Marexcode aux COMPETENCES** dans `static/js/ui/plus-menu.js`
   - Nouvelle entrée avec `id: "marexcode"`, `name`, `icon`, `prompt`, `tools[]`
   - `applySkillPrompt()` étendu pour activer les tools

6. **Brancher chat sur `streamModelWithTools()`**
   - Quand une compétence avec tools est active, utiliser la boucle agentic

## Sécurité (bloquante)

- Whitelist de commandes bash
- Timeout 10s par commande
- Pas de sudo/root
- Pas d'accès réseau sortant (sauf commandes explicites)
- Logging complet
- Sandbox répertoire projet uniquement

## Vérification

```bash
# Backend
python3 -m pytest server/tests/test_exec.py -v

# Frontend
node --test static/tests/router.test.mjs
node --test static/tests/static-paths.test.mjs

# Build
docker compose build cetas && docker compose up -d
curl -s https://cetas.neva-ci.pro/api/health
```

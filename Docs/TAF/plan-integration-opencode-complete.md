# Plan d'intégration complète OpenCode → Marexcode

## Vue d'ensemble

| Phase | Features | Complexité | Durée estimée | Statut |
|-------|----------|------------|---------------|--------|
| **Phase 1** | Glob tool + améliorations Read/Grep | Facile | 30 min | ✅ Implémenté |
| **Phase 2** | LSP Servers (définitions, refs, hover) | Moyenne | 2h | ✅ Implémenté |
| **Phase 3** | MCP Servers (outils externes) | Moyenne | 2h | ✅ Implémenté |
| **Phase 4** | Custom Tools (outils user) | Facile | 45 min | ✅ Implémenté |
| **Phase 5** | Formatters (auto-format après edit) | Facile | 30 min | ✅ Implémenté |
| **Phase 6** | Undo/Redo (annuler changements agent) | Difficile | 2h | ✅ Implémenté |
| **Phase 7** | Share Links (partager session) | Moyenne | 1h | ⏭️ Skip |
| **Phase 8** | Multi-session (agents parallèles) | Difficile | 3h | ⏭️ Skip |
| **Phase 9** | Image support (drag & drop) | Moyenne | 1h | ✅ Implémenté |
| **Phase 10** | Commands slash personnalisées | Facile | 30 min | ✅ Implémenté |

---

## Phase 1 — Glob tool + améliorations Read/Grep

**Objectif** : Ajouter `glob` et améliorer `Read`/`Grep` pour matcher les capacités OpenCode.

### 1.1 Tool `glob`

**Backend (`marexcode.py`) :**
- Ajouter `_exec_glob(pattern: str) -> dict` : utilise `fnmatch` + `os.walk` pour matcher des patterns comme `**/*.ts`, `src/**/*.js`
- Ajouter dispatch dans `_exec_tool` : `elif tool == "glob":`
- Ajouter format输出 : `"Found N files matching pattern"`

**Frontend (`tool-search.js`) :**
- Ajouter dans `MAREXCODE_TOOLS` :
  ```js
  {type:"function",function:{name:"Glob",description:"Find files by pattern (e.g. **/*.ts, src/**/*.js)",parameters:{type:"object",properties:{pattern:{type:"string",description:"Glob pattern to match"}},required:["pattern"]}}}
  ```

**Sécurité :** Même sandbox que Read, pas de `..` traversal.

### 1.2 Amélioration Read

- Ajouter support `glob` comme alternative à `file_path` : si `args.pattern` est fourni, retourner la liste des fichiers matchés
- Améliorer le message d'erreur quand le fichier n'existe pas : suggérer `Glob` pour trouver le bon chemin

### 1.3 Amélioration Grep

- Ajouter support `glob` pattern dans le champ `path` (ex: `src/**/*.ts`)
- Améliorer le format输出 avec `line:col` au lieu de juste `line`

**Fichiers à modifier :**
- `server/marexcode.py` : `_exec_glob`, `_exec_read` amélioré, `_exec_grep` amélioré
- `static/marexcode/js/integrations/tool-search.js` : ajout Glob tool
- `static/marexcode/css/marexcode.css` : icône glob (📁)

---

## Phase 2 — LSP Servers

**Objectif** : Connecter des serveurs LSP pour l'intelligence code (définitions, références, hover, callHierarchy).

### 2.1 Architecture

```
Marexcode → POST /api/lsp/{operation} → LSP Server (stdio) → Résultat
```

Chaque workspace peut avoir son propre LSP (typescript-language-server, pyright, etc.).

### 2.2 Backend

**Nouveau fichier `server/lsp.py` :**
- Classe `LSPManager` qui gère les processus LSP par workspace
- Communication via `subprocess.Popen` (stdin/stdout JSON-RPC)
- Opérations supportées : `initialize`, `textDocument/definition`, `textDocument/references`, `textDocument/hover`, `textDocument/documentSymbol`, `textDocument/workspaceSymbol`, `textDocument/implementation`, `textDocument/prepareCallHierarchy`, `callHierarchy/incomingCalls`, `callHierarchy/outgoingCalls`

**Nouvel endpoint dans `server.py` :**
- `POST /api/lsp/{operation}` avec body `{workspace, file, position?, query?}`

**Config (`opencode.json` ou `.lsp.json`) :**
```json
{
  "lsp": {
    "typescript": { "command": ["typescript-language-server", "--stdio"] },
    "python": { "command": ["pyright-langserver", "--stdio"] }
  }
}
```

### 2.3 Frontend

**Nouveau tool dans `tool-search.js` :**
```js
{type:"function",function:{name:"LSP",description:"Code intelligence: definitions, references, hover, symbols",parameters:{type:"object",properties:{operation:{type:"string",enum:["definition","references","hover","symbol","implementation"]},file:{type:"string"},line:{type:"integer"},character:{type:"integer"}},required:["operation","file","line","character"]}}}
```

**UI :** Tooltip hover sur les symboles dans le file viewer.

**Fichiers :**
- `server/lsp.py` : nouveau
- `server/marexcode.py` : dispatch LSP
- `static/marexcode/js/integrations/tool-search.js` : LSP tool
- `static/marexcode/js/file-viewer.js` : hover tooltips

---

## Phase 3 — MCP Servers

**Objectif** : Intégrer des serveurs MCP externes (Sentry, Context7, GitHub, DB).

### 3.1 Architecture

```
Marexcode → POST /api/mcp/{server}/{tool} → MCP Server (stdio/HTTP) → Résultat
```

### 3.2 Backend

**Nouveau fichier `server/mcp.py` :**
- Classe `MCPManager` qui gère les connexions MCP (local: subprocess, remote: HTTP)
- Découverte automatique des tools via `tools/list`
- Exécution via `tools/call`

**Config (`mcp.json` dans le workspace) :**
```json
{
  "mcp": {
    "sentry": { "type": "remote", "url": "https://mcp.sentry.dev/mcp" },
    "context7": { "type": "remote", "url": "https://mcp.context7.com/mcp" },
    "github": { "type": "local", "command": ["npx", "-y", "@modelcontextprotocol/server-github"] }
  }
}
```

**Nouveaux endpoints :**
- `GET /api/mcp/servers` — liste les serveurs MCP configurés
- `GET /api/mcp/{server}/tools` — liste les tools d'un serveur
- `POST /api/mcp/{server}/{tool}` — exécute un tool MCP

### 3.3 Frontend

**Settings → Général → MCP Servers :**
- Liste des serveurs configurés
- Toggle enable/disable par serveur
- Bouton "Tester la connexion"

**Nouveau tool dans `tool-search.js` :**
- Injection dynamique des tools MCP dans `MAREXCODE_TOOLS`
- Chaque tool MCP devient un tool callable par l'agent

**Fichiers :**
- `server/mcp.py` : nouveau
- `server/marexcode.py` : dispatch MCP
- `static/marexcode/js/integrations/tool-search.js` : MCP tools injection
- `static/marexcode/components/settings.html` : panel MCP

---

## Phase 4 — Custom Tools

**Objectif** : Permettre aux users de définir leurs propres outils via un fichier de config.

### 4.1 Backend

**Config (`tools.json` dans le workspace) :**
```json
{
  "tools": {
    "deploy": {
      "description": "Deploy the project to production",
      "command": "npm run deploy",
      "timeout": 60
    },
    "test": {
      "description": "Run all tests",
      "command": "npm test",
      "timeout": 30
    }
  }
}
```

**Nouveaux endpoints :**
- `GET /api/marexcode/custom-tools` — liste les outils custom
- `PUT /api/marexcode/custom-tools` — sauvegarde les outils

**Backend :** `MAREXCODE_TOOLS` étendu dynamiquement avec les tools custom au chargement.

### 4.2 Frontend

**Settings → Général → Custom Tools :**
- Éditeur JSON pour définir les outils
- Toggle enable/disable par outil
- Test button pour chaque outil

**Fichiers :**
- `server/marexcode.py` : `_exec_custom_tool`, endpoints CRUD
- `static/marexcode/js/integrations/tool-search.js` : injection custom tools
- `static/marexcode/components/settings.html` : panel Custom Tools

---

## Phase 5 — Formatters

**Objectif** : Auto-format après chaque modification de fichier.

### 5.1 Backend

**Config (`formatters.json`) :**
```json
{
  "formatters": {
    "*.js": "prettier --write",
    "*.ts": "prettier --write",
    "*.py": "black",
    "*.json": "prettier --write"
  }
}
```

**Hook dans `_exec_write` et `_exec_edit` :**
- Après l'écriture/modification, vérifier si un formatter correspond au pattern
- Exécuter le formatter silencieusement
- Retourner le résultat avec mention du formatage

### 5.2 Frontend

**Settings → Général → Formatters :**
- Toggle "Auto-formatter" on/off
- Liste des formatters configurés

**Fichiers :**
- `server/marexcode.py` : hook formatter dans `_exec_write`/`_exec_edit`
- `static/marexcode/components/settings.html` : panel Formatters

---

## Phase 6 — Undo/Redo

**Objectif** : Annuler/rétablir les changements de l'agent.

### 6.1 Backend

**Stockage :** Pour chaque fichier modifié, sauvegarder l'ancien contenu dans un journal `undo_log.json` :
```json
{
  "operations": [
    {"file": "src/app.js", "old": "...", "new": "...", "timestamp": "..."},
    ...
  ]
}
```

**Nouveaux endpoints :**
- `POST /api/marexcode/undo` — annule la dernière opération
- `POST /api/marexcode/redo` — rétablit la dernière opération annulée
- `GET /api/marexcode/undo-log` — liste les opérations

**Hook dans `_exec_write` et `_exec_edit` :** sauvegarder l'ancien contenu avant modification.

### 6.2 Frontend

**Boutons Undo/Redo** dans la toolbar du chat :
- Icône ↩️ pour undo, ↪️ pour redo
- Raccourci clavier : Ctrl+Z pour undo, Ctrl+Shift+Z pour redo

**Fichiers :**
- `server/marexcode.py` : `_exec_undo`, `_exec_redo`, hooks write/edit
- `static/marexcode/js/chat.js` : boutons undo/redo
- `static/marexcode/css/marexcode.css` : styles boutons

---

## Phase 7 — Share Links

**Objectif** : Partager une session via URL publique.

### 7.1 Backend

**Nouveaux endpoints :**
- `POST /api/marexcode/share` — génère un ID de partage, stocke la session
- `GET /api/share/{id}` — retourne la session partagée (publique, pas d'auth)

**Stockage :** Fichiers dans `DATA_DIR/marexcode/shared/{id}.json` avec TTL de 30 jours.

### 7.2 Frontend

**Bouton "Partager"** dans la toolbar du chat :
- Copie le lien dans le presse-papier
- Affiche une notification "Lien copié !"

**Fichiers :**
- `server/marexcode.py` : `_share_create`, `_share_get`
- `static/marexcode/js/chat.js` : bouton share
- `static/marexcode/css/marexcode.css` : styles notification

---

## Phase 8 — Multi-session

**Objectif** : Plusieurs agents en parallèle sur un même projet.

### 8.1 Architecture

```
Session 1 (chat) ──→ Agent 1 (streaming) ──→ Workspace
Session 2 (chat) ──→ Agent 2 (streaming) ──→ Workspace
```

Chaque session a son propre `streamModelWithTools` et son propre controller.

### 8.2 Frontend

**Onglets de sessions** dans la sidebar :
- Chaque session est un onglet cliquable
- L'onglet actif affiche un indicateur de streaming
- Possibilité de lancer une session pendant qu'une autre tourne

**Fichiers :**
- `static/marexcode/js/chat.js` : multi-session manager
- `static/marexcode/components/sidebar.html` : onglets sessions
- `static/marexcode/css/marexcode.css` : styles onglets

---

## Phase 9 — Image Support

**Objectif** : Drag & drop d'images dans le prompt.

### 9.1 Backend

**Upload endpoint :**
- `POST /api/marexcode/upload-image` — upload une image, retourne une URL
- Stockage dans `DATA_DIR/marexcode/images/{id}.png`

### 9.2 Frontend

**Drag & drop dans le textarea :**
- Détecter les fichiers image droppés
- Upload via l'endpoint
- Insérer `![image](/api/marexcode/images/{id}.png)` dans le textarea

**Fichiers :**
- `server/marexcode.py` : `_upload_image`
- `static/marexcode/js/chat.js` : drag & drop handler
- `static/marexcode/css/marexcode.css` : preview image

---

## Phase 10 — Commands slash personnalisées

**Objectif** : Commandes `/test`, `/deploy`, `/format`, etc.

### 10.1 Backend

**Config (`commands.json`) :**
```json
{
  "commands": {
    "/test": { "tool": "Bash", "args": {"command": "npm test"}, "description": "Run tests" },
    "/deploy": { "tool": "Bash", "args": {"command": "npm run deploy"}, "description": "Deploy" },
    "/format": { "tool": "Bash", "args": {"command": "prettier --write ."}, "description": "Format code" }
  }
}
```

**Parsing côté frontend :** détecter `/commande` au début du message, mapper vers l'outil correspondant.

### 10.2 Frontend

**Auto-complétion** dans le textarea :
- Quand l'utilisateur tape `/`, afficher la liste des commandes disponibles
- Sélection avec Tab ou clic

**Fichiers :**
- `static/marexcode/js/chat.js` : parsing commandes slash
- `static/marexcode/components/composer.html` : auto-complétion
- `static/marexcode/css/marexcode.css` : styles auto-complétion

---

## Ordre d'implémentation recommandé

```
Phase 1 (30 min)  →  Phase 4 (45 min)  →  Phase 5 (30 min)  →  Phase 10 (30 min)
Phase 2 (2h)      →  Phase 3 (2h)      →  Phase 7 (1h)      →  Phase 9 (1h)
Phase 6 (2h)      →  Phase 8 (3h)
```

Les phases 1, 4, 5, 10 sont les plus simples et rapides. Les phases 2, 3, 6, 8 sont les plus complexes mais aussi les plus impactantes.

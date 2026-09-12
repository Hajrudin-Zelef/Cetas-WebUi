# Plan — App Windows Cetas + Phases 2/3 (alignement OpenCode)

> Statut : plan approuvé, en attente des décisions finales (sections "Questions ouvertes").
> Contexte : réutilise la cartographie du module Marexcode et l'analyse de la logique OpenCode (tool-inspect).

---

## Objectif — "Une pierre 2 coups"

1. **App Windows complète** pour tout Cetas (chat, images, search, observabilité, Marexcode, utilisateurs, settings, favoris, prompts, catégories, rôles, export).
2. **Marexcode sans upload ni limite** : le workspace devient un dossier local du poste, les outils exécutent en local (Bash réel via subprocess) → fini le problème 20/25 Mo et le stockage serveur (modèle Claude Code / Codex / OpenCode).

---

## Ce qu'est "tout Cetas" (surface à couvrir)

- **Chat** (3 onglets : text / image / search) — `static/partials/main.html`
- **Multi-modèles via proxy** (`/api/proxy`, clés chiffrées dans le vault)
- **Marexcode** (assistant code : sessions, workspace, outils Bash/Read/Write/Edit/Grep/Ls/TodoWrite, upload)
- **Observabilité / logs** (`server/observability.py`)
- **Conversations sync, utilisateurs, settings, favoris, prompts, catégories, rôles, export**

Backend = un seul process Python (`server.py` + `marexcode.py` + `observability.py`), JWT, proxy, écoute sur `127.0.0.1:8080`, ne sert QUE `/api` (le statique est servi par nginx aujourd'hui).

---

## Architecture proposée

Embarquer le backend Python existant en local (sidecar) + réutiliser le frontend existant + coquille Windows.

```
┌────────────────────────────────────────────────┐
│  App Windows (coquille : WebView)              │
│  ┌──────────────────────────────────────────┐  │
│  │ Frontend static/ (réutilisé tel quel)     │  │
│  │   → /api → backend local 127.0.0.1:PORT  │  │
│  └──────────────────────────────────────────┘  │
│  ┌──────────────────────────────────────────┐  │
│  │ Backend Python local (PyInstaller)        │  │
│  │  → serve statique + /api (à ajouter)      │  │
│  │  → Marexcode workspace = DOSSIER LOCAL    │  │
│  │  → Bash réel (subprocess) sans upload     │  │
│  │  → vault local pour les clés              │  │
│  └──────────────────────────────────────────┘  │
└────────────────────────────────────────────────┘
```

**Réutilisation maximale** : frontend `static/` intact, backend `server.py/marexcode.py/observability.py` intact, `_exec_bash/_exec_read/...` marchent déjà en local.

**Changement backend minimal** : servir les fichiers statiques (aujourd'hui nginx) + config dossier workspace + data-dir local.

---

## Milestones

### Milestone 0 — Backend local autonome *(prérequis Windows)*
- `server.py` : servir le statique `static/` en local en plus de `/api`.
- Config `DATA_DIR` + dossier workspace local via fichier config / env.
- Marexcode : "Projet local" = dossier du poste (Bash réel, zéro upload).
- **Test** : `python server.py` sur Windows → chat + Marexcode + tools fonctionnent dans un navigateur local.

### Milestone 1 — Phases 2 & 3 (alignement OpenCode) *(d'abord : bénéficie web + desktop)*

#### Phase 2 — Formatage concis des sorties (`toModelOutput`) *(backend, 1 j)*
- `_format_tool_output(tool, result)` dans `marexcode.py`, appelé dans `_exec_tool` avant renvoi du résultat.
- Templates par outil, façon OpenCode :
  - `Read` → "Read X lines from path" (au lieu du JSON brut)
  - `Edit` → "Edited file successfully: path\nReplacements: N\n```diff\n...\n```"
  - `Write` → "Created/Wrote file: path"
  - `Bash` → "Command exited with code X\n{output}"
  - `Grep` → "Found N matches\npath:line: preview"
  - `Ls` → "Found N files\nfile1\nfile2\n…"
- **Bénéfice** : moins de tokens, meilleure compréhension modèle, réduit les relances en boucle.

#### Phase 3 — Permissions granulaires par outil *(frontend, 2-3 j, optionnel)*
- Refactor `marex-permission.js` : règles par outil (`read`/`write`/`edit`/`bash`/`grep`/`ls`) au lieu du trio Read only / Espace Write / Ask permission.
- UI de configuration dans `composer.html` (ex. "autoriser read/grep/ls, demander pour write/edit/bash").
- Vérification serveur des permissions en plus du client (optionnel).

- **Test** : requête "lis + édite + ls" → sorties concises lisibles, permissions configurables, moins de boucles.

### Milestone 2 — Coquille Windows
- **pywebview** (reco, 100% Python) ou **Tauri** (si Rust accepté).
- Embarquer backend (PyInstaller) + frontend.
- WebView sur `127.0.0.1:PORT`, arrêt propre, logs fichier local.

### Milestone 3 — Vault de clés local
- Réutiliser `load_api_keys()` ; premier lancement = écran de config des clés (l'UI settings existe déjà).
- *(Option)* mode "connecté au serveur Cetas" pour clés centralisées / sync.

### Milestone 4 — Packaging
- PyInstaller one-folder + **Inno Setup** ; test sur VM Windows propre.

### Milestone 5 — Polissage
- Tray icon, auto-start (option), mise à jour, signature.

### Milestone 6 — (Option) Mode connecté + sync
- Bascule app ↔ serveur Cetas distant ; sync conversations multi-appareils.

---

## Comparatif coquille Windows

| Option | Effort | Résultat | Adapté au stack actuel |
|---|---|---|---|
| **pywebview** (Python natif) | faible | ~50 Mo, propre, WebView2 Windows | ✅ le plus simple — backend Python packagé, pas de Rust/Node |
| **Electron** | moyen | ~150 Mo, très robuste | ✅ Node déjà présent |
| **Tauri v2** | élevé (Rust) | ~10 Mo, le plus léger/modern | ⚠️ nouveau langage |

**Reco** : pywebview pour démarrer (100% réutilisation Python), ou Tauri si produit le plus léger.

---

## Questions ouvertes (déterminent la reco finale)

1. Coquille : **pywebview** (reco) ou **Tauri** ?
2. Clés : **vault local** (app autonome) ou proxy vers le serveur Cetas ?
3. Données : **locales** ou **locales + sync serveur** ?
4. Distribution : **installer** (Inno Setup) ou **portable** ?
5. Marexcode local = **dossier du poste avec Bash complet**, OK ?
6. Phases 2 & 3 : à faire **avant le desktop** dans le même plan (reco), ou en parallèle ?

---

## Liens utiles

- `Docs/TAF/plan-marexcode-module-complet.md` — module Marexcode
- `Docs/TAF/integration-marexcode.md` — intégration
- Analyse OpenCode : `tool-inspect.tar.gz` (racine repo, non versionné)
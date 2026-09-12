# Plan — Marexcode Lite : allègement & stabilisation

> Statut : **implémenté, tests verts**
> Branche : `marexcode-lite`
> Cible : `static/marexcode/` (page standalone `/marexcode/`)
> Backend : **non touché** (`server/marexcode.py` intact)

---

## 1. Objectifs

1. Rendre le module Marexcode aussi léger que possible sans dégrader sa fonction
   première : **assistant de codage** (chat streamé + outils workspace).
2. Supprimer tout le code mort (fichiers, imports, réglages write-only, CSS orphelin,
   vendor orphelin).
3. Rendre le rendu Markdown compact et stable.
4. Supprimer le Mode Auto (pipeline multi-agents Plan → Code → Audit).
5. Conserver la traduction FR du raisonnement, mais **différée ~60 s après la fin du
   tour** — jamais pendant le stream ni pendant l'implémentation.

## 2. Décisions verrouillées

| Sujet | Décision |
|-------|----------|
| Rendu Markdown | **Remplacé** par un renderer compact (`js/markdown.js`). Suppression de `markdown/` (7 fichiers) + `remend` + `morphdom` + Web Worker. |
| Coloration syntaxique | **hljs conservé**, chargé à la demande (import dynamique au 1er bloc de code), thread principal, blocs **complets** uniquement. |
| Mode Auto | **Supprimé intégralement** (backend + UI + bouton composer). |
| Traduction FR raisonnement | **Conservée mais différée** (~60 s après le tour), timer annulé au tour/session suivant. |
| Profil & mémoire locale | **Supprimés** (page inaccessible + toggles inopérants). |
| Backend | **Intact** (périmètre frontend uniquement). |
| File-viewer LSP | Hover **simplifié** : délégation `mousemove` debouncée sur le conteneur, plus de listener/rendu par ligne. |

## 3. Audit — sur quoi repose l'allègement

| Élément | Poids |
|---------|-------|
| `js/app.js` | 1992 l. / 87 Ko |
| `js/chat.js` | 1365 l. / 66 Ko |
| `css/marexcode.css` | 1734 l. / 53 Ko |
| `markdown/` (7 fichiers) | ~780 l. |
| Vendor | `highlight.esm` 164 Ko + `remend` 13 Ko + `morphdom` 6 Ko |

### Code mort identifié
- `js/task-classifier.js` — jamais importé par l'app.
- `js/markdown/inline-code-kind.js` — 1915 l. / 22 Ko, sortie non stylée par aucun CSS.
- `js/profile.js` + `components/profile.html` — frame jamais inclus en SSI → inaccessible.
- Imports morts `app.js` : `getToken`, `getSkillContent`, `saveMemory`, `trackActivity`,
  `getMemory` (+ wrappers `api.js` associés).
- Réglages write-only : `marex-plain-text`, `marex-sandbox-strict`, `marex-web-search`
  (toggle Réglages), `marex-memory-enabled`, `marex-memory-capture`, `marex-perm-<tool>`.
- Instructions globales en double (`gen-global-instructions` + `global-instructions-textarea`).
- ~25 classes CSS orphelines (bloc profil, sidebar legacy, `tool-block`, `sp-file-block`).
- Pills « Réflexion / Effort / profondeur recherche » : écrites, jamais relues.
- `remend` / `morphdom` : usage unique dans le pipeline markdown supprimé.

## 4. Inventaire des changements

### Fichiers supprimés
```
js/task-classifier.js
js/runtime.js
js/agents.js
js/prompt-composer.js
js/context-store.js
js/auto-mode-config.js
js/model-diagnostics.js
js/profile.js
components/profile.html
js/markdown/inline-code-kind.js
js/markdown/render.js
js/markdown/stream.js
js/markdown/cache.js
js/markdown/queue.js
js/markdown/worker-client.js
js/markdown/worker.js
js/tests/auto-mode.test.mjs
js/tests/markdown-queue.test.mjs
js/tests/markdown-stream.test.mjs
js/vendor/remend.esm.min.js
js/vendor/morphdom.esm.min.js
```

### Fichiers ajoutés
- `js/markdown.js` — renderer compact : `marked` + `DOMPurify`, découpage en blocs
  stables (cache par bloc) + tail « live » re-rendu en `requestAnimationFrame`,
  highlight hljs à la demande sur blocs complets, bouton copier par délégation.
- `js/tests/markdown.test.mjs` — test unitaire du découpage.

### Fichiers modifiés
- `index.html` — retrait des `modulepreload` remend/morphdom.
- `js/app.js` — retrait Mode Auto + Profil + mémoire + réglages morts + hover LSP par ligne.
- `js/chat.js` — retrait `sendAuto`, import renderer compact, traduction différée.
- `js/api.js` — retrait wrappers sans appelant.
- `js/router.js` — retrait `showProfile`.
- `components/settings.html` — retrait panneaux Profil/Automatisation, mémoire, morts.
- `components/composer.html` — retrait bouton `#auto-mode-btn`.
- `css/marexcode.css` — retrait `.profile-*`, `.auto-*`, classes orphelines.
- `static/js/tests/marexcode-structure.test.mjs` — skills `>= 3`, assertion traduction différée.

## 4bis. Paramètres (décision explicite)

La vue Paramètres a été réduite à **Compte + contenu uniquement** :
- Conservé : **Sessions** (compteur, tout supprimer, déconnexion), **Skills**, **Instructions**.
- Supprimé : tous les réglages modifiant le comportement du chat (mode d'envoi Entrée,
  affichage du raisonnement, mode de sortie, file d'attente, compteur de tokens,
  réduire animations, raccourcis clavier, police morte `--chat-font-size`),
  les politiques d'approbation (doublon du composer), la recherche web en réglages
  (doublon du menu « + » / globe) et la modale de licences.

## 5. Comportements morts corrigés

- **Recherche web** : `marexPrefs.webSearch` initialisé depuis `localStorage`
  (`marex-web-search`, défaut actif) et l'injection du tool web devient conditionnée par
  ce flag — le toggle Réglages redevient réel.
- Pills « Réflexion / Effort / profondeur » supprimées (aucun effet réel).
- `marex-perm-<tool>` : écriture en doublon de `marex-permission-rules` supprimée.

## 6. Phases

1. **Nettoyage mort sans changement de comportement** — suppression fichiers/imports/toggles/CSS.
2. **Suppression Mode Auto** — runtime + panneau + bouton + `sendAuto`.
3. **Renderer Markdown compact** — `markdown.js`, branchement, test unitaire.
4. **Traduction différée + réglages consolidés** — 60 s, `webSearch` câblé, instructions uniques.
5. **Vérification finale** — `node --test`, `pytest server/tests/`, smoke Docker.

## 7. Vérification

```bash
node --test static/marexcode/js/tests/
node --test static/js/tests/marexcode-structure.test.mjs static/js/tests/marex-permission.test.mjs
pytest server/tests/
```

Smoke manuel/Docker : auth gate, sélection modèle, stream long (fluidité), outils
Read/Write/Edit, arbre workspace, sessions CRUD, permissions, copier bloc de code,
raisonnement brut immédiat puis traduction FR différée.

## 8. Gain attendu

- ~3 400 lignes JS supprimées ; `app.js` −~450 l., `chat.js` −~130 l., CSS −~350 l.
- 2 libs vendor supprimées (−19 Ko) ; plus aucun Web Worker.
- Une seule voie de rendu markdown, un seul chemin de chat (`send`).

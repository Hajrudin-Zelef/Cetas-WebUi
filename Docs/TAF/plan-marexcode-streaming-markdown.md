# Plan — Port de la logique chat OpenCode vers Marexcode standalone

> Statut : **plan validé, en attente de signal d'implémentation**
> Cible : `static/marexcode/` (page standalone `/marexcode/`)
> Source de référence : `Docs/chat-ui-files/chat-ui-files/` (dump des internes OpenCode session UI)

---

## 1. Contexte

Le dossier `Docs/chat-ui-files/chat-ui-files/` contient un dump des internes de l'UI de session
OpenCode (SolidJS + TypeScript + Web Worker). L'objectif est de porter cette **logique chat**
vers la page Marexcode standalone de Cetas, qui est en **vanilla JS ES modules** sans bundler.

Périmètre retenu : **Phases 1-4** (rendu markdown streaming, highlight code, auto-scroll,
indicateur thinking). La refonte en "parts" (Phase 5) et le backend sont **hors périmètre**.

## 2. Décisions verrouillées

| Sujet | Décision |
|-------|----------|
| Dépendances | **3 libs vendorées** : `remend`, `morphdom`, `highlight.js`. `marked` + `DOMPurify` déjà vendorés. Pas de build step. |
| Look & feel | **Conserver le style visuel actuel de Marexcode** (pas de port de `markdown.css` / `message-part.css` OpenCode). |
| Périmètre | **Phases 1-4** uniquement. |
| Backend | **Non touché.** `server/` intact. |

### Pourquoi pas shiki

OpenCode utilise `shiki` (wasm + grammaires, plusieurs Mo) qui exige un bundler. Cetas n'a
**pas de bundler** : le `Dockerfile` minifie via `terser` fichier par fichier et concatène le
CSS via `cat`. `highlight.js` offre un vrai highlight sans changer la chaîne de build.
Compromis assumé : thèmes VS Code / fidélité shiki non conservés.

## 3. Inventaire de la source OpenCode

### Pipeline markdown streaming (cœur)

| Fichier source | Rôle |
|----------------|------|
| `markdown-stream.ts` | Projette une string croissante en blocs stables (`full` / `live` / `code`). `marked.lexer` + `remend` (heal du markdown partiel). Seul le dernier bloc est `live`. |
| `markdown.worker.ts` | Web Worker : `shiki` `ShikiStreamTokenizer` (highlight incrémental) + parse marked, queue latest-wins. |
| `markdown-worker.ts` | Client worker : transport, supersede, dispose, fusion d'état tokens stable/unstable. |
| `markdown-worker-protocol.ts` | Types requêtes/réponses + `applyMarkdownWorkerResponse`, `markdownBlockKey`. |
| `markdown-worker-queue.ts` | File "latest-wins" par clé (`createLatestWorkerQueue`). |
| `markdown-worker-transport.ts` | Transport actif/queued par clé (`createWorkerTransport`). |
| `markdown.tsx` | Composant Solid : update DOM par bloc via `morphdom`, diff des tokens de code, boutons copie, cache LRU DOMPurify, inline-code-kind, liens externes. |
| `markdown-cache.tsx` | Cache LRU (200) + `sanitizeMarkdown` + hook DOMPurify (rel noopener/noreferrer). |
| `markdown-code-state.ts` | `shouldResetCodeTokens` (reset des tokens de code streaming). |
| `markdown-projection.ts` | `completedProjection`, `canReusePendingBlock`. |
| `markdown-inline-code-kind.ts` | Détection inline code path/url (`inlineCodeKind`, ~22 Ko). |

### Messages / turn / animations

| Fichier source | Rôle |
|----------------|------|
| `message-part.tsx` | Parts (`text` / `reasoning` / `tool`), `PART_MAPPING`, `PacedMarkdown`, UI outils. |
| `session-turn.tsx` | Composant de tour, `TextShimmer`, `TextReveal`, auto-scroll. |
| `create-auto-scroll.tsx` | Auto-follow bas + détection scroll user + `ResizeObserver` + `overflow-anchor` dynamique. |
| `text-shimmer.tsx` / `.css` | Animation "thinking". |
| `text-reveal.tsx` / `.css` | Transition de texte (swap). |
| `message-part.css` (34 Ko), `markdown.css` (8 Ko), `session-turn.css` | Styles (non portés, cf. décision look & feel). |

### Backend (non portable)

| Fichier source | Contenu | Équivalent Cetas |
|----------------|---------|------------------|
| `session_prompt.ts` (1631 l.) | orchestration LLM, boucle outils, AI SDK, Effect | `streamModelWithTools` (`tool-search.js`) |
| `session_session.ts` (1016 l.) | persistance sessions, Drizzle ORM, Effect | `server/marexcode.py` |
| `handlers_event.ts` / `handlers_session.ts` | endpoints HTTP + SSE (Effect) | proxy Python `/api/*` |
| `server-sdk.tsx` (444 l.) | client SolidJS consommant les events SSE | `static/marexcode/js/api.js` |

Ces fichiers dépendent d'Effect, Drizzle, AI SDK et SolidJS : **non portables** vers le backend
Python stdlib de Cetas. Cetas possède déjà l'équivalent. Seule valeur exploitable : les noms
d'événements SSE (`session.text.delta`, `session.reasoning.delta`, `session.tool.input.delta`),
utiles uniquement si un modèle "parts" est adopté plus tard (Phase 5, hors périmètre).

## 4. État actuel de Marexcode (points d'intégration)

- `chat.js` est un **ES module** (`export function createChat`, `export const MAREX_TOOLS`),
  chargé par `app.js` (module). Les nouveaux modules peuvent donc être `import`és.
- Rendu actuel : streaming en `pendingEl.textContent = rawAcc` (texte brut), puis rendu markdown
  complet à la fin via `renderMarkdown` (`marked` + `DOMPurify`), remplacement `innerHTML`.
- Aucun highlight de code, aucun rendu incrémental, pas d'auto-scroll intelligent.
- CSS : fichier unique `static/marexcode/css/marexcode.css` (1705 l.), hors concaténation
  `style.css`. Variables disponibles : `--accent`, `--accent-hover`, `--bg-app`, `--bg-elevated`,
  `--bg-input-btn`, `--bg-sidebar`, `--border`, `--danger`, `--text-primary`, `--text-secondary`,
  `--text-tertiary`.
- Tests : convention `static/marexcode/js/tests/*.test.mjs` (ex. `auto-mode.test.mjs`).

### Points d'intégration précis dans `chat.js`

| Ligne | Actuel | Cible |
|-------|--------|-------|
| `:782` (`onChunk`) | `pendingEl.textContent = rawAcc` | `renderer.update(pendingEl, rawAcc, true)` |
| `:791` (`onDone`) | `renderMarkdown(rawAcc)` + `innerHTML` | `renderer.finalize(pendingEl, rawAcc)` |
| `:809` (`onError`) | `renderMarkdown(rawAcc)` + `innerHTML` | `renderer.finalize(pendingEl, rawAcc)` |
| `:396` (`stop`) | `renderMarkdown(rawAcc)` + `innerHTML` | `renderer.finalize(pendingEl, rawAcc)` |
| `:838` (`catch`) | `renderMarkdown(rawAcc)` + `innerHTML` | `renderer.finalize(pendingEl, rawAcc)` |
| `:124` (`addMsg`) / `:373` (`renderHistory`) | `renderMarkdown` | `renderer.render` |
| `:168`, `:783` | `chatLog.scrollTop = chatLog.scrollHeight` | `autoScroll` |

## 5. Fichiers

### Vendorés — `static/js/vendor/` (exclus du `terser`)

- `remend.min.js` — heal du markdown partiel.
- `morphdom.min.js` — diff DOM par bloc (UMD ~20 Ko).
- `highlight.min.js` — highlight de code (+ langages communs).

### Nouveaux — `static/marexcode/js/`

- `markdown/stream.js` — port de `markdown-stream.ts` : `stream()`, `project()`,
  `completedProjection()`, `heal()`.
- `markdown/render.js` — port du cœur de `markdown.tsx` : rendu par bloc, update `morphdom`,
  tokens de code, sanitize `DOMPurify`, cache LRU, boutons copie.
- `markdown/cache.js` — port de `markdown-cache.tsx` (LRU 200 + hook DOMPurify).
- `markdown/code-state.js` — port de `markdown-code-state.ts`.
- `markdown/inline-code-kind.js` — port de `markdown-inline-code-kind.ts`.
- `markdown/worker.js` + `markdown/worker-client.js` — highlight `highlight.js`, sémantique
  latest-wins / supersede / dispose (port `-queue.ts` / `-transport.ts` / `-protocol.ts`),
  fallback `<pre>` brut si Worker indisponible.
- `auto-scroll.js` — port de `create-auto-scroll.tsx` (sans Solid).
- `text-shimmer.js`, `text-reveal.js` — équivalents vanilla.
- `tests/markdown-stream.test.mjs`, `tests/markdown-queue.test.mjs` — logique pure.

### Modifiés

- `static/marexcode/js/chat.js` — intégration (cf. §4).
- `static/marexcode/index.html` — balises vendor + câblage.
- `static/marexcode/css/marexcode.css` — CSS scopé (bloc markdown, wrapper code + bouton copie,
  `text-shimmer`, `text-reveal`), réutilisant les variables existantes.
- `Dockerfile` — lignes `terser --module` pour les nouveaux modules ; vendor laissé intact.

## 6. Séquençage

### Phase 0 — Vendor + harnais

1. Vérifier les builds navigateur de `remend`, `morphdom`, `highlight.js` (gate ci-dessous).
2. Déposer les fichiers dans `static/js/vendor/`.
3. Câbler `index.html` (vendor + modules).
4. Test unitaire pur `markdown-stream` (sans DOM) : blocs `full` / `live` / `code`, heal,
   fermeture de fence.

**Gate** : si `remend` n'a pas de build navigateur utilisable sans bundler, fallback sur un heal
maison (~30 l. fermant fences et backticks ouverts). `highlight.js` a un build browser/worker,
à confirmer. Toute impasse est signalée avant d'écrire la suite.

### Phase 1 — Moteur markdown streaming (cœur)

- `markdown/stream.js`, `markdown/render.js`, `markdown/cache.js`, `markdown/code-state.js`,
  `markdown/inline-code-kind.js`.
- Intégration `chat.js` : `onChunk` → rendu incrémental ; `onDone` / `onError` / `stop` / `catch`
  → finalize ; `addMsg` / `renderHistory` → render.
- Test `tests/markdown-stream.test.mjs`.

### Phase 2 — Highlight code

- `markdown/worker.js` + `markdown/worker-client.js` : highlight des blocs complets, re-highlight
  du bloc streaming *debounced*, latest-wins.
- Fallback `<pre>` si Worker indisponible.
- Test `tests/markdown-queue.test.mjs` (supersede / dispose).

### Phase 3 — Auto-scroll

- `auto-scroll.js` : `scrollRef` / `contentRef`, `wheel`, `scroll`, `ResizeObserver`, `working`,
  `userScrolled`, `overflow-anchor` dynamique.
- Branchement `chat.js` (`:168`, `:783`).

### Phase 4 — Indicateur thinking + animations

- Porter `text-shimmer.css` + `text-reveal.css` dans `marexcode.css` (scopé, style Marexcode).
- `text-shimmer.js`, `text-reveal.js`.
- Brancher `onThinking` (`:325`) et `ensureThinkBadge` / ligne de statut (`:282`).

## 7. Vérification

- `node --test static/marexcode/js/tests/*.test.mjs` — logique pure (stream, queue, cache).
- `node --check` sur chaque nouveau module.
- `docker compose build cetas` — valide `terser` et le CSS.
- Smoke test navigateur `/marexcode/` : streaming, highlight, bouton copie, auto-scroll, Stop.

## 8. Hors périmètre

- Backend (`server/`) — non portable, non touché.
- Look OpenCode (`markdown.css`, `message-part.css`) — style Marexcode conservé.
- Phase 5 — refonte du rendu messages en "parts" (`message-part.tsx`, `session-turn.tsx`).

## 9. Risques

| Risque | Mitigation |
|--------|------------|
| `remend` sans build navigateur | Gate Phase 0 → heal maison. |
| `highlight.js` indisponible en worker sans bundler | Fallback `<pre>` brut. |
| `morphdom` casse la sélection utilisateur | Fallback remplacement `innerHTML` par bloc. |
| Highlight `highlight.js` sur bloc streaming = re-highlight complet (pas incrémental) | Exécution en Worker + debounce ; coût hors thread principal. |
| Phase 5 tentante pendant le port | Strictement hors périmètre de cette itération. |

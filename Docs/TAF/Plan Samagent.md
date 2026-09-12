# Plan SamAgent Premium + IA Locale (SamGen)

> Objectif : faire de SamAgent le fleuron de Cetas — stabilité exemplaire, robustesse
> du routage, volet IA locale interchangeable, UX premium, observabilité locale, tests.
> © Marexsoft Corporation. Fondateur Kouassi Marius.

Statut : **PHASES 0-5 IMPLÉMENTÉES ET DÉPLOYÉES**. Restent : validation navigateur (utilisateur),
clé Google via setup.py, et 2 items cosmétiques reportés (badge historique P2b, onglet Stats GUI P3b).

---

## Contexte & verdict d'audit

SamAgent = routeur multi-providers hybride (regex ≤70 / mini-LLM >70) avec pools
tier×intention (nano, n4-flash, n4, n8), fallback 3 niveaux, `Promise.any` parallèle
sur les routeurs LLM.

Points forts : architecture hybride, pools multi-providers, fallback 3 niveaux,
UX de routing (labels, spinner).

Défauts bloquants identifiés (preuves `app.js`/`router.js`) :
1. Aucun garde-fou `typeof routeModel` → `ReferenceError` non attrapé si `router.js` échoue.
2. Routage non annulable ; après cancel → `streamModel(..., signal null)` TypeError, ou ghost stream.
3. Fuite `STATE._routerForceThinking` (pas reset par stop/reset).
4. Routeur amnésique : aucun health-awareness, tirage aléatoire pur, pas de cooldown.
5. « Rotation équilibrée » annoncée dans le JSDoc mais compteur supprimé (pur random).
6. Résolution d'id OpenRouter fragile (cache `minou-or-cache` + `orEnabled`).
7. Provenance SamAgent perdue au rechargement (label DOM-only, jamais persisté).
8. SPOF DeepSeek dans tous les fallbacks non-nano.
9. Zéro télémétrie, zéro test, doc ≠ code (mythe « le score choisit le palier »).

---

## Décisions verrouillées

- Périmètre complet P0→P4 + volet IA Locale (P5), phase par phase.
- Télémétrie locale : buffer localStorage 50 routes, aucun envoi réseau.
- Chips « Propositions » → vrais switches de palier (Nano/N4/N8).
- Google : clé fournie via `setup.py` (provider 10), aucun edit de code (B1).
- nvidia : retiré des pools SamAgent (clé stockée `nvidia_nim`, proxy cherche `nvidia`).
  Caveat : nvidia hors SamAgent reste cassé tant que le nom n'est pas corrigé — hors périmètre.
- mistral → n4/n8, opencode free → n4-flash, opencode premium → n8, `provShort` MST/OC.
- Fallback diversifié : DS→mistral→opencode (SPOF cassé).
- Local : proxy + fallback direct navigateur ; `samagent-local` dédié (5e modèle virtuel) ;
  sélection par santé globale sur tous les modèles locaux up.

---

## Phase 0 — Stabilité (anti-crash) · `js/app.js` + `js/router.js`

- [x] 1. Garde `typeof routeModel === "function"` sur les 2 chemins d'envoi (main + edit).
- [x] 2. `try/catch` autour du routage → repli propre (customAlert) au lieu de rejection nue.
- [x] 3. Abort de bout en bout : `routeModel(prompt, model, signal)` via `_routerAbort` ;
       re-vérif abort après routage avant `streamModel` (tue ghost stream + TypeError signal null).
- [x] 4. Reset `STATE._routerForceThinking` dans stop handler + `resetConversation`.
- [x] 5. Garde route vide : `routeModel` retourne toujours objet + label sain (filet deepseek).
- [ ] P4 backlog : `classifyIntent` FR sans accent (« ecris » → chat au lieu de coder). Pré-existant.

## Phase 1 — Robustesse du routage · `js/router.js` + `app.js`

- [x] 6. Health-awareness : store EWMA santé + latence par modèle (`recordRouteResult`, localStorage),
       cooldown 60s, circuit-breaker 3 échecs consécutifs — implémenté + testé hors-ligne.
       ⚠️ Le FEED prod (appeler `recordRouteResult` à la fin réelle des streams) est câblé en **P2**
       (mêmes régions de code que la provenance) — jusqu'à P2, le cooldown est inerte en prod.
- [x] 7. Rotation déterministe par clé tier+intent (le JSDoc redevient vrai) ; pondérée santé si stats.
- [x] 8. Validation pools au pick via `window.SAM_ROUTER_CAN_USE` (exposé par `api.js` à côté de
       `getModelEditeur`) ; pool vide → filet deepseek.
- [x] 9. Pools/fallback : retrait nvidia (3 intents nano) ; opencode free → n4-flash ;
       mistral small/medium → n4 ; mistral-large → n8 ; opencode premium (glm-5-zen) → n8 ;
       `provShort` MST/OC ; nano = groq+google ; fallback multi-fournisseurs OR→opencode→mistral
       (SPOF DS cassé, testé : 3 maillons ≠).
- [ ] 10. Clé Google via `setup.py` (côté utilisateur — en attente).

## Phase 5 — Volet IA Locale « SamGen » · `proxy/server.py`, `api.js`, `router.js`, `models.js`

- [x] 11. Serveur : providers `ollama` + `lmstudio` (OpenAI-compat, `CETAS_OLLAMA_URL`/
       `CETAS_LMSTUDIO_URL`), mêmes `PROXY_ALLOWED_PATHS` que llamacpp ; gate restreint aux
       moteurs locaux ; en-tête auth conditionné à une clé non vide. Probes : llamacpp 200,
       ollama sans env → 400 « pas de clé » (→ fallback direct navigateur).
- [x] 12. `.env.docker` : lignes `CETAS_OLLAMA_URL`/`CETAS_LMSTUDIO_URL` commentées
       (rétro-compat, swap = décommenter + restart).
- [x] 13. `api.js` : `fetchLocalModels` hybride **proxy d'abord → direct navigateur ensuite**
       (`_fetchLocalModelsAny`) ; merge existant `_applyLocalModels` + `_rebuildModelMaps` conservés.
- [x] 14. `samagent-local` (5e modèle virtuel, `models.js`) : tier `local` → `_localPool` dynamique
       (registre /v1/models, TTL 30s, moteurs morts retirés), tirage santé/rotation ; down → cloud
       (deepseek) avec label. Testé hors-ligne : down/up/fallback moteur.
- [x] 15. Invariants tests (hors-ligne) + doc `index.md` (table SamAgent local, routes proxy
       ollama/lmstudio, env vars). Test navigateur en attente.
- [ ] 16. Test navigateur manuel : sélection « SamAgent Local » → doit répondre via llamacpp Qwen3.5.

## Phase 2 — UX premium · `app.js`, `router.js`, `conversations.js`

- [x] 16. Provenance persistée : `_samLastRoute` (tier/routedBy/label/intent/score) attaché aux
       messages assistant (send + edit), purge si non-SamAgent, consommé au push.
       ⚠️ Badge re-rendu sur historique rechargé : **reporté** — le loader DOM minifié n'est pas
       cartographié proprement ; à faire avec la refonte loader/build (Plan 1 §1) pour ne pas
       risquer de casser le rendu. Les données sont bien dans le JSON (export/import les gardent).
- [x] 17. Chips « Propositions » → **vrais switches de palier** (⚡ Nano / 🚀 N4 / 🧠 N8) :
       re-joue le dernier message utilisateur sur le palier choisi (`_samAgentMakeClickable`).
- [x] 18. LLM-router : **AbortController partagé** (le perdant est annulé au 1er succès) +
       **cache de décision** `_routeCache` (TTL 60s, cap 100).
- [x] (feed santé, déplacé depuis P1) `recordRouteResult` câblé : succès (send+edit, avec
       latence) et échecs (chaîne de fallback `api.js`, éditeur inconnu).

## Phase 3 — Observabilité locale

- [x] 19a. Ring buffer localStorage 50 routes intégré DANS `recordRouteResult` (ts, model, ok,
       latencyMs, tier, intent, score, label) — module profond, aucune écriture éparse.
       `dumpRouteStats()` (console.table traces + agrégat par modèle), alias `window`.
       Aucun envoi réseau. Testé : cap 50, agrégat.
- [ ] 19b. Onglet « Stats SamAgent » dans Statistiques : **reporté** (UI panel minifiée non
       cartographiée ; `dumpRouteStats()` en console sert déjà d'observabilité immédiate).

## Phase 4 — Qualité & doc

- [x] 20. `js/router.test.mjs` (`node --test`, sans dépendance) — **13 tests, 0 échec** :
       classifyIntent (dont FR sans accents), scoreComplexity bornes, invariants ROUTER_CONFIG
       (providers connus, nvidia absent, mistral/opencode présents), routeModel jamais null,
       abort-safe, fallback 3 providers distincts, circuit-breaker, télémétrie cap 50,
       registre local (moteur down exclu), _routerAbort.
- [x] 21. `js/validate-pools.mjs` — ROUTER_CONFIG ↔ models.js : **26 statiques OK, 49 OR dynamiques**
       ignorées. Exit 1 si écart.
- [x] 22. Doc/qualité : `models.js` descriptions (mythe « score choisit le palier » éliminé,
       0 occurrence) ; `classifyIntent` **accent-insensible** (fix TDD : « ecris » → coder).
       `index.md` : tables SamAgent/proxy/env mises à jour (P5).

---

## Invariants d'interchangeabilité (IA Locale)

1. Conversations ne stockent que des ids (JSON inerte) — un modèle disparu ne casse rien.
2. Pools SamAgent local = registre dynamique, aucun id codé en dur.
3. Validation des pools saute les ids non résolvables.
4. Adaptateur unique OpenAI-compat (llamacpp/ollama/lmstudio) côté serveur et api.js.
5. URLs centralisées (env/vault) → swap de moteur = config + restart, zéro edit de code.
6. Health-awareness P1 s'applique aussi aux moteurs locaux (down fréquent → cooldown).

## Vérification & rollback

- Matrice : `node --check`/`node --test` ; probes gratuits `/v1/models` (google/openrouter/
  groq/deepseek puis ollama/lmstudio) ; test annulation ; test rechargement (badge) ;
  test swap moteur local ; régression login/conversations.
- Rollback : tout additif JS/doc → revert git ; télémétrie/provenance tolérantes aux vieux
  JSON ; aucune migration de schéma.
- Caveat : nvidia hors SamAgent reste cassé (`nvidia_nim`) — décision séparée.

## Notes de structure (cf. TAF/Plan 1.md)

- `app.js` minifié sans source lisible = douleur racine. Les edits P0/P2 y sont chirurgicaux
  (oldString exacts). Tout le nouveau comportement est ajouté dans `router.js` (lisible)
  avec une surface d'appel minimale depuis `app.js`, pour concentrer la logique dans le
  module lisible. Un build pipeline reste recommandé (Plan 1.md §1) — hors périmètre ici.

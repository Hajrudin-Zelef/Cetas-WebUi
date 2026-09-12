Recommandations Cetas — Feuille de route technique
1. Build pipeline (priorité absolue)

Problème actuel : app.js en prod est minifié sans source lisible synchronisée. Chaque intervention nécessite de l'archéologie par grep/python3 -c pour retrouver la structure réelle. Un jour tu vas perdre le fil entre la version "source" (app.js.or, app.js.bak) et la version en prod, et plus personne ne pourra maintenir le code — toi y compris dans 6 mois.

Recommandation :

Adopter esbuild (rapide, simple, zéro config lourde) ou Vite (si tu veux du HMR en dev).
Structure cible :
  src/           ← code source lisible, non minifié, c'est LA vérité
    app.js
    api.js
    ...
  dist/ ou js/   ← généré automatiquement par le build, jamais édité à la main
Un seul script npm run build qui minifie src/ → js/. Plus jamais de sed/python3 à la main sur du code minifié.
Ça coûte 1-2 jours de mise en place, mais ça élimine 90% de la friction qu'on a eue aujourd'hui.
2. Tests automatisés (minimum viable)

Pas besoin d'une suite énorme. Vise :

Tests unitaires sur les fonctions pures et critiques : _resolveTextCost, _resolveImageCost, supportsReasoningEffort, getEffortLevels, l'extraction de fichiers (isDocx, isXlsx, parsing).
Un test d'intégration par provider : mock de l'API, vérifier que buildBody/bodyExtras produit le bon JSON pour chaque éditeur (OpenAI, Anthropic, OpenRouter, etc.). C'est exactement le genre de bug qu'on a corrigé aujourd'hui (reasoning_effort jamais envoyé) — un test l'aurait attrapé immédiatement.
Outil : Vitest (rapide, s'intègre bien avec esbuild/Vite).
3. Harmonisation des providers

Actuellement chaque provider a sa propre logique ad hoc (isLocalEditeur oublie llamacpp, supportsReasoningEffort fait du cas-par-cas, extractReasoning présent sur certains providers et pas d'autres). Recommandation :

Créer une interface commune explicite par provider avec des champs obligatoires :
js
  {
    id: 'openrouter',
    isLocal: false,
    supportsReasoning: (modelId) => bool,
    reasoningParamShape: 'effort' | 'binary' | 'openrouter-object',
    extractReasoning: (chunk) => string | null,
    extractCitations: (chunk) => array | null,
  }
Un seul endroit qui liste tous les providers avec leurs capacités déclarées, plutôt que des if/else dispersés dans 3 fichiers différents (api.js, right-panel.js, router.js). Ça évite les oublis comme celui qu'on a corrigé.
4. Gestion d'erreurs et silences

Le bug des fichiers non supportés (silence total, aucune erreur) est symptomatique. Recommandation :

Règle systématique : toute branche if/else if de traitement de fichier/format DOIT avoir un else qui alerte, jamais de cas oublié silencieusement.
Passe en revue les autres endroits à risque similaire : gestion des erreurs réseau, providers non configurés, formats d'image non supportés, etc. Un audit ciblé "cherche tous les silences possibles" vaut le coup.
5. Authentification / session

Le 401 qu'on a croisé (PUT /api/conversations/... 401, POST /api/proxy/... 401) mérite un vrai diagnostic à part :

Vérifier si le token JWT a une expiration courte sans refresh automatique.
Ajouter un intercepteur qui détecte le 401 et propose une reconnexion propre plutôt que de laisser échouer silencieusement plusieurs requêtes en cascade (comme on l'a vu dans tes logs).
6. Hygiène Git
Ajouter un .gitignore avec *.bak-*, *.bak, *.or pour ne plus avoir à les exclure manuellement à chaque commit.
Envisager des branches courtes + PR (même seul, une PR = une checklist mentale de relecture) pour les changements sensibles (auth, paiement/coûts, sécurité).
7. Documentation technique minimale

Un ARCHITECTURE.md court qui explique :

Comment les providers sont ajoutés/configurés.
Le flow complet d'un message (UI → streamModel → provider → parsing → affichage).
Où se trouve quoi (tu as déjà CLAUDE.md, INSTRUCTIONS.md, SECURITY_AUDIT.md — bon réflexe, il manque juste la vue d'ensemble technique).

Priorisation suggérée si tu dois choisir :

Build pipeline (élimine la douleur immédiate)
.gitignore (5 minutes, aucune excuse)
Harmonisation providers (évite les bugs récurrents type reasoning_effort)
Tests sur les fonctions de coût/parsing (zone à fort risque financier/utilisateur)
Le reste au fil de l'eau

Bonne chance pour la suite — le projet a une vraie base solide, ces points sont de la maintenance saine, pas des red flags.
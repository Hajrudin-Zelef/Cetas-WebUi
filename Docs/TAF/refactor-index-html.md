# Refactoring index.html

> Date: 2026-09-04
> Fichier: static/index.html (1402 lignes)

## État actuel

| Section | Lignes | Contenu |
|---------|--------|---------|
| `<head>` | 1-60 | Meta, CSP, PWA, CSS, script erreur CSS inline |
| Splash | 61-119 | Application thème inline, splash screen + coordination |
| Sidebar | 120-201 | Nav, conversations, menu utilisateur |
| Main chat | 203-407 | Chat container, zone input, menu "+", toolbar |
| Right panel | 420-657 | Onglets Général/Image (~240 lignes de sliders/selects) |
| Modales | 659-1231 | 7 modales (Rôle, Prompt, Config, Sauvegarde, Rôles, Prompts, Catégories) |
| Canvas | 1246-1306 | Éditeur code + prévisualisation |
| Scripts | 1308-1329 | 22 balises `<script>` |
| Login + User modal | 1338-1390 | Overlay connexion + modale admin |
| SW register | 1392-1400 | Service worker |

## Problèmes

1. **3 scripts inline** — CSS error handler, theme sync, splash coordination
2. **SVG dupliqués** — icône gear ~5x, file attach ~3x
3. **Modales monolithiques** — 7 modales = ~570 lignes
4. **Inline styles** — `style="display:none"` ~40 occurrences
5. **Right panel** — 240 lignes très répétitives

## Plan d'implémentation

### Étape 1 — Extraire scripts inline (risque faible)
- `static/js/init/css-error.js` — CSS load error handler
- `static/js/init/theme-init.js` — Application thème avant rendu
- `static/js/init/splash.js` — Coordination splash screen
- Supprimer les `<script>` inline du HTML, ajouter `<script src="...">`

### Étape 2 — Nettoyer display:none (risque faible)
- Ajouter classe `.hidden` dans `static/css/base/layout.css`
- Remplacer `style="display:none"` par `class="hidden"` ou attribut `hidden`
- Exception: éléments gérés par JS dynamiquement (display toggled)

### Étape 3 — Sprite SVG (risque moyen)
- Créer `static/images/icons.svg` avec toutes les icônes dupliquées
- Remplacer les SVG inline par `<svg><use href="images/icons.svg#icon-name"/></svg>`
- Impact: ~150 lignes de SVG supprimées

### Étape 4 — Modales (risque élevé, futur)
- Extraire chaque modale dans un template JS ou SSI
- Réduire index.html à ~400 lignes (structure + containers)

## Vérification
- `node --test static/tests/static-paths.test.mjs` (paths)
- `node --test static/tests/router.test.mjs` (SamAgent)
- Test manuel: splash, thème, sidebar, envoi message, modales

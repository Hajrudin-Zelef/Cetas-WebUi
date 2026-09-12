# Plan — WebSearch Tool pour Marexcode (2 volets)

## Contexte

- **Scope** : Marexcode UNIQUEMENT. Cetas (chat général) intouché.
- Marexcode ne charge PAS `search-engine.js` — `executeWebSearch` est absent de son contexte → on peut définir le nôtre sans conflit.
- SearXNG accessible au backend Python via `127.0.0.1:8904` (docker-compose).
- Tavily déjà proxifié dans `server.py` (`_tavily_search`, `TAVILY_API_KEY`).
- OpenRouter a déjà le search natif (`openrouter:web_search` via `buildBody`). DeepSeek n'a rien → volet adapter.

## Les 2 volets

| Volet | Modèles | Mécanisme |
|-------|---------|-----------|
| **Native** | openrouter, opencode-zen (format messages) | Déjà en place via `buildBody` — aucun changement |
| **Adapter** | deepseek, mistral, groq, nvidia, zai, etc. | Nouveau tool `web_search` injecté → `POST /api/websearch` → chaîne Tavily → SearXNG → DDG |

## Fichiers

| # | Fichier | Action | Rôle |
|---|---------|--------|------|
| 1 | `server/websearch.py` | Nouveau | Provider chain (Tavily → SearXNG → DDG), `normalizeHit` (alias champs), `applyDomainFilters`, timeout/provider, fallback auto — modelé sur `Docs/WebSearchTool/providers/index.ts` |
| 2 | `server/server.py` | Ajout route | `POST /api/websearch` (JWT, rate-limit 30/min, body `{query, allowed_domains?, blocked_domains?, max_results?}`) — modelé sur `_tavily_search`. Logique existante intacte |
| 3 | `static/marexcode/js/websearch.js` | Nouveau | Chargé SEULEMENT par Marexcode. Définit `executeWebSearch` (→ `/api/websearch`), `marexHasNativeSearch(modelId)`, `marexInjectWebSearch(modelId)` |
| 4 | `static/marexcode/index.html` | Ajout | `<script src="js/websearch.js">` après tool-search.js |
| 5 | `static/marexcode/js/chat.js` | Modif | Appel `window.marexInjectWebSearch(model)` dans `send()` avant `streamModelWithTools` + règle 15 du system prompt (obligation "Sources: [Title](URL)") |
| 6 | `Dockerfile` | Ajout | `pip3 install ddgs` (provider DuckDuckGo) |

## Chaîne d'adapters (mode auto)

```
Tavily (TAVILY_API_KEY, timeout 8s)
  ↓ échec / 0 hits
SearXNG (http://127.0.0.1:8904, timeout 5s)
  ↓ échec / 0 hits
DuckDuckGo (ddgs, timeout 15s — dernier car rate-limited sur IP datacenter)
  ↓ tout échoue
Message diagnostic (comme buildEmptyAdapterResultHint du prototype)
```

- Filtres `allowed_domains` / `blocked_domains` sur tous les hits.
- Résultat normalisé : `[{title, url, description}]` via alias (`title/headline/name`, `url/link/href`, `description/snippet/content`).

## Détection native (Marexcode)

```
marexHasNativeSearch(modelId):
  editor === 'openrouter'          → true (natif openrouter:web_search)
  editor === 'opencode' (messages) → true (hérite du natif Anthropic)
  sinon (deepseek, mistral, groq…) → false → injecte le tool adapter web_search
```

## Résultat pour l'agent

- **OpenRouter** : agent utilise `openrouter:web_search` natif (sources gérées par le provider).
- **DeepSeek** : agent appelle `web_search` → backend → Tavily/SearXNG/DDG → `[{title,url,description}]`, règle 15 l'oblige à citer les sources en markdown.

## Sécurité

- JWT obligatoire, rate-limit 30/min (comme Tavily)
- Timeouts par provider pour fallback en cascade
- Clés API côté serveur uniquement

## Scope vérifié

`search-engine.js`, `web-search.js`, `api.js`, `tool-search.js` : **intouchés**. Fichiers soit nouveaux, soit Marexcode-only, soit routes backend additive.

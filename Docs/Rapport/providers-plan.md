# Rapport — Providers Cetas : OpenCode + Fixes

## Date : 2026-09-01

---

## 1. Provider OpenCode (REMPLACÉ Cabreras)

### Résumé
Le provider `cabreras` a été entièrement remplacé par `opencode`. L'app supporte **2 routes** (Go + Zen) et **3 terminaisons** (chat/completions, messages, responses).

### Routes × Terminaisons

| Route | Base URL | Terminaison | Path |
|---|---|---|---|
| **Go** | `https://opencode.ai` | chat/completions | `/zen/go/v1/chat/completions` |
| **Go** | `https://opencode.ai` | messages (Anthropic) | `/zen/go/v1/messages` |
| **Go** | `https://opencode.ai` | responses (OpenAI) | `/zen/go/v1/responses` |
| **Zen** | `https://opencode.ai` | chat/completions | `/zen/v1/chat/completions` |
| **Zen** | `https://opencode.ai` | messages (Anthropic) | `/zen/v1/messages` |
| **Zen** | `https://opencode.ai` | responses (OpenAI) | `/zen/v1/responses` |

### Auth proxy
- `/chat/completions` et `/responses` → `Authorization: Bearer`
- `/messages` → `x-api-key` + `anthropic-version: 2023-06-01` (le proxy retire `Authorization: Bearer` automatiquement)
- Le proxy dans `server.py` gère ce switch dans `_build_upstream`

### IDs des modèles
Les modèles dupliqués entre Go et Zen ont des IDs uniques avec suffixe : `gpt-5.6-luna-go` / `gpt-5.6-luna-zen`. Le suffixe est stripé avant l'envoi au gateway via `_ocModelId(e)` dans `api.js`.

### Catalogue 20 modèles

**Go (8 modèles) :**

| ID | Label | Endpoint | Input/1M | Output/1M |
|---|---|---|---|---|
| gpt-5.6-luna-go | GPT 5.6 Luna | responses | $0.20 | $1.20 |
| glm-5.3-flash-go | GLM-5.3 Flash | chat | $0.15 | $0.50 |
| longcat-2.0-go | LongCat 2.0 | chat | $0.30 | $1.20 |
| mimo-v2.5-go | MiMo V2.5 | chat | $0.14 | $0.28 |
| minimax-m3-go | MiniMax M3 | messages | $0.30 | $1.20 |
| qwen3.7-plus-go | Qwen3.7 Plus | messages | $0.40 | $1.60 |
| qwen3.6-plus-go | Qwen3.6 Plus | messages | $0.50 | $3.00 |
| hy3-go | Hy3 | chat | $0.14 | $0.58 |

**Zen (12 modèles) :**

| ID | Label | Endpoint | Input/1M | Output/1M |
|---|---|---|---|---|
| gpt-5.6-luna-zen | GPT 5.6 Luna | responses | $0.20 | $1.20 |
| gpt-5.4-nano-zen | GPT 5.4 Nano | responses | $0.20 | $1.25 |
| qwen3.7-plus-zen | Qwen3.7 Plus | messages | $0.40 | $1.60 |
| qwen3.6-plus-zen | Qwen3.6 Plus | messages | $0.50 | $3.00 |
| qwen3.5-plus-zen | Qwen3.5 Plus | messages | $0.20 | $1.20 |
| minimax-m3-zen | MiniMax M3 | chat | $0.30 | $1.20 |
| glm-5-zen | GLM 5 | chat | $1.00 | $3.20 |
| big-pickle-zen | Big Pickle | chat | 0 | 0 |
| mimo-v2.5-free-zen | MiMo V2.5 Free | chat | 0 | 0 |
| ling-3.0-flash-fin-free-zen | Ling 3.0 Flash Fin Free | chat | 0 | 0 |
| nemotron-3-ultra-free-zen | Nemotron 3 Ultra Free | chat | 0 | 0 |
| nemotron-3.5-lightning-free-zen | Nemotron 3.5 Lightning Free | chat | 0 | 0 |

---

## 2. Fichiers modifiés

### `models.js`
- 20 modèles opencode insérés (8 Go + 12 Zen)
- Chaque modèle a : `editeur:"opencode"`, `endpoint` (chat/messages/responses), `ocBase:"v1"` (Zen seulement), `inputPer1M`, `outputPer1M`
- Insertion via Python script avec anchor `LLaMA.cpp."}],image:[`
- **ATTENTION** : le fichier est minifié (1 seule ligne). Toute édition doit être faite via script Python, pas edit tool (les anchors sont fragiles sur une seule ligne)

### `js/api.js`
- Suppression du provider `cabreras`
- Ajout du provider `opencode` (façade 3 routes)
- Fonctions clés :
  - `_ocRoute(e)` — lit `endpoint` + `ocBase` du modèle dans MODELS
  - `_ocModelId(e)` — strip le suffixe `-go`/`-zen` du model ID
  - `_ocUrl(e)` — construit l'URL selon la route et le format
  - `opencodeProvider` — objet complet avec `getUrl`, `formatMessages`, `buildBody`, `createParser`
    - `chat` → `createChatCompletionsParser` + body OpenAI
    - `messages` → `PROVIDERS.anthropic.createParser()` + body Anthropic
    - `responses` → `createOpenAIResponsesParser()` + body `{model, input, stream:true}`
- `PROVIDERS.opencode = opencodeProvider`

### `proxy/server.py`
- `PROVIDER_CONFIG["opencode"]` : `base_url="https://opencode.ai"`, auth Bearer
- `PROXY_ALLOWED_PATHS["opencode"]` : les 6 paths (go/v1 + v1 × chat/completions, messages, responses)
- **Switch auth** dans `_build_upstream` : si `provider == "opencode" and "/messages" in url_path` → retire `Authorization: Bearer`, ajoute `x-api-key` + `anthropic-version: 2023-06-01`

### `proxy/cloudflare-worker.js`
- Provider `opencode` ajouté avec `base: 'https://opencode.ai'`

### `setup.py`
- Option 15 : `OpenCode` (remplace Cabreras dans le menu providers)
- Test clé via `_test_openai_compat` sur `/zen/go/v1/chat/completions` avec `hy3`
- Après validation, choix de terminaison (1=chat, 2=responses, 3=messages, 4=toutes)
- Le choix est sauvegardé dans `secrets["api_keys"]["opencode_endpoint"]`
- Fix : `llama-3.1-8b-instant` → `llama-3.3-70b-versatile` (Groq)
- Fix : Nvidia NIM → `nvidia/nemotron-3.5-lightning-30b-a3b`
- Fix : Mistral → `open-mistral-nemo`
- Fix : timeout 15s → 30s
- Ajout fonction `_test_openai_responses` pour Groq

### `js/config-providers.js`
- Provider catalog : `{id:"opencode", label:"OpenCode", icon:"Opencode.svg", placeholder:"sk-...", link:"https://opencode.ai/"}`
- EDITEUR_ORDER : `cabreras` → `opencode`
- API key IDs : `apikey-cabreras` → `apikey-opencode`
- **Catalogue groupé par terminaison** : quand editeur=opencode, les modèles sont affichés en 3 sections (💬 chat, ⚡ responses, 📨 messages) avec compteurs et badges

### `js/quotas.js`
- `NO_API_PROVIDERS` : `{id:"opencode", name:"OpenCode", icon:"images/Opencode.svg", url:"https://opencode.ai/"}`

### `js/web-search.js`
- `WEB_SEARCH_EDITEURS` : `"cabreras"` → `"opencode"`
- Tooltip ajouté dans `WEB_SEARCH_TOOLTIPS` : `opencode:"Prix recherche web OpenCode : 15 $ / 1M tokens"`

### `js/plus-menu.js`
- `PROVIDER_LOGOS` : `opencode:"images/Opencode.svg"`
- Label des modèles opencode : `<span class="plus-model-tag">Go/Zen</span><span class="plus-model-tag">chat/messages/responses</span> Nom`

### `images/Opencode.svg`
- Icône créée (code brackets, vert #10b981)
- `Cabreras.svg` supprimée

### `js/faq.js`
- Références `Cabreras` → `OpenCode`

---

## 3. Routing dans le proxy

```
Browser → POST /api/proxy/opencode/zen/go/v1/chat/completions
        → proxy: base_url="https://opencode.ai" → url_path="/zen/go/v1/chat/completions"
        → upstream: https://opencode.ai/zen/go/v1/chat/completions
        → auth: Authorization: Bearer <key>

Browser → POST /api/proxy/opencode/zen/v1/messages
        → proxy: url_path="/zen/v1/messages"
        → upstream: https://opencode.ai/zen/v1/messages
        → auth: x-api-key: <key> + anthropic-version (Authorization retiré)
```

---

## 4. Tests live validés

```
hy3 (chat) → OK
qwen3.7-plus (messages) → OK
minimax-m3 (messages) → OK
gpt-5.6-luna (responses) → OK
grok-4.6 (responses) → OK
gpt-5.4-nano (responses) → OK
big-pickle (chat, free) → OK
mimo-v2.5-free (chat, free) → OK
claude-haiku-4-5 (messages, zen) → OK (avec x-api-key)
```

---

## 5. Bugs connus et résolus

| Bug | Cause | Fix |
|---|---|---|
| `400 Pas de clé pour: opencode` | Clé pas dans .env | Relancer `python3 setup.py` |
| `400 model not supported for format oa-compat` | grok-4.6 sur chat/completions | Utiliser /responses |
| `401 Missing API key` sur /messages | Proxy envoie Bearer au lieu de x-api-key | Switch auth dans server.py |
| `models.js` syntax error ( Unexpected token) | Anchor insertion avec `},{` créant `}}` | Script Python avec position-based insertion |
| `502 Bad Gateway` (searxng) | Container searxng arrêté | `docker start cetas-webui-searxng-1` |
| `web-search.js` terser error | `opencode` inséré hors de l'objet WEB_SEARCH_TOOLTIPS | Restaurer et re-inserer avec `,` au lieu de `},` |
| `models.js` brace imbalance | rfind('}],image:[') trouvait un faux match dans imagePricing | Utiliser anchor `LLaMA.cpp."}],image:[` (unique) |
| Claude models 404 | IDs avec points au lieu de tirets | `claude-opus-4.8` → `claude-opus-4-8` (corrigé, puis models réduits à 20) |
| `MTU 1500` SSL error Mistral | Packet truncation réseau | Laisser MTU à 1300 |

---

## 6. Architecture technique

### api.js facade (opencode)
```
_ocRoute(modelId)
  → MODELS.find(id).endpoint → "chat"|"messages"|"responses"
  → MODELS.find(id).ocBase → "v1" (zen) ou absent (go)
  → {base: "/zen/v1" ou "/zen/go/v1", fmt: endpoint}

_ocModelId(modelId)
  → "hy3-go" → "hy3" (strip suffix)
  → "gpt-5.6-luna-zen" → "gpt-5.6-luna"

_ocUrl(modelId)
  → proxyUrl("opencode", host + base + "/" + format-path)

opencodeProvider
  → getUrl: _ocUrl
  → formatMessages: chat→formatChatCompletions, messages→anthropic, responses→formatChatCompletions
  → buildBody: chat→OpenAI, messages→anthropic, responses→{model,input,stream}
  → createParser: chat→createChatCompletionsParser, messages→anthropic.createParser, responses→createOpenAIResponsesParser
```

### proxy server.py
```
PROVIDER_CONFIG["opencode"] = {base_url:"https://opencode.ai", auth:{header:"Authorization",prefix:"Bearer "}}
PROXY_ALLOWED_PATHS["opencode"] = [6 paths]

_build_upstream():
  1. auth header → Authorization: Bearer <key>
  2. if opencode && /messages in path → pop Authorization, add x-api-key + anthropic-version
  3. headers extra from config
```

---

## 7. Configuration

### Clé API
- Entrée via `python3 setup.py` → option 15 (OpenCode)
- Stockée dans `.env` (chiffrée) + `.vault/.enc`
- Le proxy la charge au démarrage (`load_api_keys()`)

### Terminaison (setup.py)
- Option 1 : chat/completions (défaut)
- Option 2 : responses
- Option 3 : messages
- Option 4 : toutes les terminaisons
- Sauvegardée dans `secrets["api_keys"]["opencode_endpoint"]`

### Docker
- Build : `docker compose up -d --build cetas`
- Le `.env` est monté en volume dans le container
- Proxy écoute sur `127.0.0.1:8080`
- Nginx reverse proxy sur port `8901`

---

## 8. Fichiers à ne PAS toucher sans vérifier

| Fichier | Risque |
|---|---|
| `models.js` | Minifié, insertion fragile. Utiliser script Python. |
| `js/api.js` | Facade opencode complexe. Vérifier les 3 routes. |
| `proxy/server.py` | Switch auth `/messages`. Ne pas casser le `pop` Authorization. |
| `js/plus-menu.js` | Template HTML inline. Vérifier la syntaxe après édition. |
| `js/config-providers.js` | Catalogue groupé. Vérifier le `else{}` fermant. |

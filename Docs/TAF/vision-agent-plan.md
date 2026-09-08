# Vision Agent — Assistant Visuel Autonome pour Windows

> Plan complet. © Marexsoft Corporation. Fondateur Kouassi Marius.

---

## 1. Vision du projet

Un **assistant IA visuel autonome** qui :
- Prend des screenshots de l'écran
- Envoie au VLM (Vision Language Model) : OpenRouter / DeepSeek
- Le modèle retourne une action (click, type, scroll, terminal, fichiers...)
- L'agent exécute l'action
- Boucle jusqu'à fin de tâche ou validation utilisateur

Prototype de référence : `Docs/UI-TARS-desktop/` (ByteDance, TypeScript monorepo).

---

## 2. Architecture

```
vision-agent.py              # Entry point (pywebview + HTTP server)
├── agent/
│   ├── __init__.py
│   ├── screenshot.py        # Capture écran (mss → PIL → base64)
│   ├── control.py           # Souris/clavier/terminal/fichiers (pyautogui)
│   ├── vision.py            # Appels VLM (OpenRouter/DeepSeek)
│   ├── parser.py            # Parse réponses modèle en actions
│   └── loop.py              # Boucle agent (orchestration)
├── config.json              # Config locale
└── index.html               # UI inline (comme deploy.py)
```

Pattern : identique à `deploy.py` — fichier principal + modules `agent/`.

---

## 3. UI (pywebview panel)

```
┌──────────────────────────────────────────────┐
│  📋 Vision Agent                  [⚙️] [▶️] │
├──────────────────────────────────────────────┤
│  Instruction:                                │
│  ┌──────────────────────────────────────┐    │
│  │ Ouvre Chrome et cherche "pizza"      │    │
│  └──────────────────────────────────────┘    │
│  [▶️ Lancer]  [⏹ Stop]  Mode: [Auto ▾]     │
├──────────────────────────────────────────────┤
│  📸 Live              │  📝 Actions          │
│  ┌────────────────┐   │  ┌────────────────┐  │
│  │                │   │  │ Screenshot OK  │  │
│  │   screenshot   │   │  │ Thought: ...   │  │
│  │   en cours     │   │  │ Action: click  │  │
│  │                │   │  │ → Executé      │  │
│  └────────────────┘   │  │ Screenshot OK  │  │
│  Itération 3/50       │  │ Thought: ...   │  │
├──────────────────────────────────────────────┤
│  Modèle: deepseek-chat | Latence: 1.2s      │
└──────────────────────────────────────────────┘
```

- **Panneau live** : screenshot mis à jour à chaque itération + log des actions
- **Mode configurable** : Auto (100% autonome) OU Manuel (validation à chaque étape)

---

## 4. Boucle Agent

```
1. Screenshot (mss → PIL → base64)
2. Envoie au VLM:
   - System prompt (définit les actions disponibles)
   - Instruction utilisateur
   - 5 derniers screenshots
   - Historique des actions
3. Parse réponse:
   "Thought: Je vois une barre de recherche Google..."
   "Action: click(start_box='(72,646)')"
4. Si mode manuel: affiche action → attend validation
5. Exécute action (pyautogui)
6. Attend 1-2s
7. Répète depuis étape 1
```

---

## 5. Actions supportées

| Action | Syntaxe | Implémentation |
|--------|---------|----------------|
| Clic | `click(x, y)` | `pyautogui.click(x, y)` |
| Double-clic | `double_click(x, y)` | `pyautogui.doubleClick(x, y)` |
| Clic droit | `right_click(x, y)` | `pyautogui.rightClick(x, y)` |
| Taper texte | `type("hello")` | `pyautogui.typewrite()` / clipboard |
| Hotkey | `hotkey("ctrl", "c")` | `pyautogui.hotkey()` |
| Scroll | `scroll(x, y, "down")` | `pyautogui.scroll()` |
| Drag | `drag(x1, y1, x2, y2)` | `pyautogui.drag()` |
| Terminal | `terminal("ls")` | `subprocess.run()` |
| Lire fichier | `read_file("path")` | `open().read()` |
| Écrire fichier | `write_file("path", "content")` | `open().write()` |
| Terminé | `finished()` | Arrêt boucle |

---

## 6. Config (config.json)

```json
{
  "api_provider": "deepseek",
  "api_key": "...",
  "model": "deepseek-chat",
  "autonomy_mode": "auto",
  "max_iterations": 50,
  "screenshot_delay": 1.5,
  "proxy_url": "http://localhost:8901",
  "screen_resolution": [1920, 1080]
}
```

---

## 7. Modèles

- **OpenRouter** : modèles vision (Gemini Flash, GPT-4o, Claude, etc.)
- **DeepSeek** : deepseek-chat / deepseek-vision
- API OpenAI-compatible (`/v1/chat/completions`)
- Option : passer par le proxy Cetas (`localhost:8901`) pour réutiliser les clés

---

## 8. Dépendances Python

```
mss              # Screenshots rapides
pyautogui        # Contrôle souris/clavier
Pillow           # Traitement images
requests         # Appels API
pywebview        # UI native
```

Installation :
```
pip install mss pyautogui Pillow requests pywebview
python vision-agent.py
```

---

## 9. Flux d'exécution

```
User instruction: "ouvre Chrome et cherche pizza"
         │
         ▼
    [BOUCLE × max_iterations]
         │
         ▼
    Screenshot (mss) → base64 PNG
         │
         ▼
    VLM call (OpenRouter/DeepSeek)
         │
         ▼
    Modèle retourne: "Thought: ...\nAction: click(72,646)"
         │
         ▼
    parser convertit en action structurée
         │
         ▼
    [Si mode manuel: attendre validation utilisateur]
         │
         ▼
    control.execute() → pyautogui click
         │
         ▼
    Nouveau screenshot → boucle suivante
         │
         ▼
    "Action: finished()" → arrêt
```

---

## 10. Lien avec Cetas

- Les clés API OpenRouter/DeepSeek déjà configurées dans Cetas sont réutilisables
- Le proxy Cetas (`localhost:8901`) peut servir de relais
- Sinon, l'app standalone gère ses propres clés dans `config.json`

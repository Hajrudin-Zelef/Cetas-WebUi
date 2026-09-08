"""Appels VLM — API OpenAI-compatible (OpenRouter / DeepSeek)."""
import logging
import time

import requests

log = logging.getLogger(__name__)

SYSTEM_PROMPT = """Tu es un assistant visuel autonome qui contrôle l'ordinateur de l'utilisateur.

À chaque tour tu reçois un screenshot de son écran. Analyse-le, raisonne, puis donne UNE action.

Format de réponse OBLIGATOIRE (exactement 2 lignes):
Thought: <ton raisonnement court, en français>
Action: <action>

Actions disponibles:
- click(x, y) — clic gauche aux coordonnées écran en pixels
- double_click(x, y)
- right_click(x, y)
- type('texte à taper') — tape le texte dans le champ actif
- hotkey('ctrl', 'c') — combinaison de touches
- scroll('down', 5) — direction up/down et quantité
- drag(x1, y1, x2, y2) — glisser-déposer
- wait(2) — attendre N secondes
- terminal('commande') — exécute une commande shell, retourne la sortie
- read_file('C:\\chemin\\fichier.txt') — lit un fichier
- write_file('C:\\chemin\\fichier.txt', '''contenu''') — écrit un fichier
- done() — la tâche est terminée

Règles:
- Les coordonnées sont des PIXELS ÉCRAN réels (résolution donnée avec le screenshot)
- Regarde précisément où cliquer sur le screenshot
- Une seule action par tour
- Utilise terminal()/read_file()/write_file() pour tout ce qui ne nécessite pas l'UI graphique
- Dès que la tâche est accomplie, réponds done()
- Thought en français"""


class Vision:
    def __init__(self, api_key: str, model: str, base_url: str):
        self.api_key = api_key
        self.model = model
        self.base_url = base_url.rstrip("/")

    def ask(self, instruction: str, screenshot_b64: str, history: list, screen_size: tuple) -> dict:
        """Envoie screenshot + historique au VLM. Retourne le texte de réponse."""
        url = f"{self.base_url}/chat/completions"
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }

        messages = [{"role": "system", "content": SYSTEM_PROMPT}]

        window = history[-8:]
        for item in window:
            if item.get("thought"):
                messages.append({"role": "assistant",
                                 "content": f"Thought: {item['thought']}\nAction: {item.get('action_text', '')}"})
            if item.get("result"):
                messages.append({"role": "user", "content": f"Résultat: {item['result'][:800]}"})

        w, h = screen_size
        user_content = [
            {"type": "text", "text": f"Tâche: {instruction}\nRésolution écran: {w}x{h}px. Coordonnées en pixels réels.\nScreenshot actuel:"},
            {"type": "image_url", "image_url": {"url": f"data:image/png;base64,{screenshot_b64}"}},
        ]
        messages.append({"role": "user", "content": user_content})

        body = {
            "model": self.model,
            "messages": messages,
            "max_tokens": 600,
            "temperature": 0.2,
        }

        start = time.time()
        resp = requests.post(url, headers=headers, json=body, timeout=90)
        elapsed = round(time.time() - start, 2)

        if resp.status_code != 200:
            raise RuntimeError(f"API {resp.status_code}: {resp.text[:300]}")

        data = resp.json()
        content = data["choices"][0]["message"]["content"]
        log.info("VLM %s → %d chars en %.1fs", self.model, len(content), elapsed)
        return {"text": content, "elapsed": elapsed}

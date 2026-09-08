"""Boucle agent — orchestre screenshot → VLM → parse → exécution."""
import logging
import threading
import time

from .parser import parse
from .screenshot import ScreenCapture
from .vision import Vision
from .control import Control

log = logging.getLogger(__name__)

COORD_SCALE = 1.0


class AgentLoop:
    def __init__(self, config: dict):
        self.config = config
        self.vision = Vision(
            api_key=config["api_key"],
            model=config["model"],
            base_url=config["base_url"],
        )
        self.screen = ScreenCapture(monitor=1)
        self.control = Control()
        self._thread = None
        self._stop = threading.Event()
        self._pause = threading.Event()
        self.state = {
            "running": False, "paused": False, "iteration": 0,
            "logs": [], "screenshot": "", "current_action": "",
            "error": None, "done": False,
        }
        self._history = []

    def get_state(self) -> dict:
        self.state["paused"] = self._pause.is_set()
        return dict(self.state, logs=list(self.state["logs"][-200:]))

    def _log(self, text: str, level: str = "info"):
        self.state["logs"].append({"text": text, "level": level, "ts": time.time()})

    def start(self, instruction: str):
        if self.state["running"]:
            return {"ok": False, "error": "Agent déjà en cours"}
        self._stop.clear()
        self._pause.clear()
        self._history = []
        self.state.update({"running": True, "iteration": 0, "error": None,
                           "done": False, "logs": [], "current_action": ""})
        self._thread = threading.Thread(target=self._run, args=(instruction,), daemon=True)
        self._thread.start()
        return {"ok": True}

    def stop(self):
        self._stop.set()
        self._pause.set()
        return {"ok": True}

    def pause(self):
        self._pause.set()
        return {"ok": True}

    def resume(self):
        self._pause.clear()
        return {"ok": True}

    def approve(self):
        """Validation manuelle : libère l'attente."""
        self._pause.clear()
        return {"ok": True}

    def _wait_manual(self, action_name, args):
        if self.config.get("autonomy_mode") != "manual":
            return True
        self.state["current_action"] = f"{action_name} {args} — en attente de validation"
        self._log(f"⏸ Action proposée : {action_name} {args} (valide pour exécuter)", "info")
        while self._pause.is_set() and not self._stop.is_set():
            time.sleep(0.3)
        return not self._stop.is_set()

    def _run(self, instruction: str):
        max_iter = int(self.config.get("max_iterations", 50))
        delay = float(self.config.get("screenshot_delay", 1.5))
        try:
            while not self._stop.is_set() and self.state["iteration"] < max_iter:
                self.state["iteration"] += 1
                it = self.state["iteration"]
                self._log(f"── Itération {it}/{max_iter} ──", "separator")

                shot = self.screen.capture()
                self.state["screenshot"] = shot
                self._log("📸 Screenshot capturé", "info")

                result = self.vision.ask(instruction, shot, self._history,
                                         self.screen.physical_size())
                text = result["text"]
                self._log(f"🧠 Thought: {text[:400]}", "cmd")

                thought, action_name, args = parse(text)
                if action_name == "none":
                    self._log(f"⚠ Action non reconnue dans la réponse du modèle", "error")
                    self._history.append({"thought": thought, "action_text": text,
                                          "result": "Action non reconnue, reformule."})
                    time.sleep(delay)
                    continue

                if not self._wait_manual(action_name, args):
                    break

                self.state["current_action"] = f"{action_name} {args}"
                outcome = self._execute(action_name, args)

                self._history.append({"thought": thought,
                                      "action_text": f"{action_name}({args})",
                                      "result": outcome})
                self._log(f"⚡ {action_name} → {outcome[:150]}", "ok")

                if action_name == "done":
                    self._log("✅ Tâche terminée", "ok")
                    self.state["done"] = True
                    break

                time.sleep(delay)

            if not self.state["done"] and not self._stop.is_set():
                if self.state["iteration"] >= max_iter:
                    self.state["error"] = f"Limite de {max_iter} itérations atteinte"
                    self._log(f"⚠ {self.state['error']}", "error")
        except Exception as e:
            log.exception("Erreur boucle agent")
            self.state["error"] = str(e)
            self._log(f"✗ Erreur: {e}", "error")
        finally:
            self.state["running"] = False
            self.state["current_action"] = ""
            self.screen.close()

    def _execute(self, name: str, args: dict) -> str:
        try:
            c = self.control
            if name == "click":
                c.click(args["x"] * COORD_SCALE, args["y"] * COORD_SCALE)
                return "Clic exécuté"
            if name == "double_click":
                c.double_click(args["x"] * COORD_SCALE, args["y"] * COORD_SCALE)
                return "Double-clic exécuté"
            if name == "right_click":
                c.right_click(args["x"] * COORD_SCALE, args["y"] * COORD_SCALE)
                return "Clic droit exécuté"
            if name == "type":
                c.type(args.get("text", ""))
                return "Texte tapé"
            if name == "hotkey":
                c.hotkey(*args.get("keys", []))
                return f"Hotkey {'+'.join(args.get('keys', []))} exécutée"
            if name == "scroll":
                c.scroll(args.get("direction", "down"), args.get("amount", 5))
                return f"Scroll {args.get('direction', 'down')}"
            if name == "drag":
                c.drag(args["x1"], args["y1"], args["x2"], args["y2"])
                return "Drag exécuté"
            if name == "wait":
                c.wait(args.get("seconds", 2))
                return "Attente terminée"
            if name == "terminal":
                r = c.terminal(args.get("command", ""))
                out = r.get("output", "")
                return ("OK: " if r.get("ok") else "ECHEC: ") + (out or "(aucune sortie)")
            if name == "read_file":
                r = c.read_file(args.get("path", ""))
                return r.get("output", "")
            if name == "write_file":
                r = c.write_file(args.get("path", ""), args.get("content", ""))
                return "Fichier écrit"
            if name == "done":
                return "Terminé"
            return f"Action inconnue: {name}"
        except Exception as e:
            return f"Erreur exécution {name}: {e}"

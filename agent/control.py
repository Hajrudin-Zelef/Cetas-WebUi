"""Exécution des actions — souris, clavier, terminal, fichiers."""
import logging
import platform
import subprocess
import time

import pyautogui

log = logging.getLogger(__name__)

pyautogui.FAILSAFE = True
pyautogui.PAUSE = 0.1

EXEC_TIMEOUT = 15


class Control:
    """Exécute les actions de l'agent. Coordonnées en pixels écran réels."""

    def click(self, x, y):
        pyautogui.click(int(x), int(y))
        return {"ok": True}

    def double_click(self, x, y):
        pyautogui.doubleClick(int(x), int(y))
        return {"ok": True}

    def right_click(self, x, y):
        pyautogui.rightClick(int(x), int(y))
        return {"ok": True}

    def type(self, text):
        system = platform.system()
        if system == "Windows" or "\n" in text:
            import pyperclip
            pyperclip.copy(text)
            pyautogui.hotkey("ctrl", "v")
        else:
            pyautogui.typewrite(text, interval=0.02)
        return {"ok": True}

    def hotkey(self, *keys):
        mapped = [self._map_key(k) for k in keys]
        pyautogui.hotkey(*mapped)
        return {"ok": True}

    def _map_key(self, key):
        k = key.lower().strip()
        if platform.system() == "Darwin":
            if k in ("ctrl", "control"):
                return "command"
            if k == "alt":
                return "option"
        return k

    def scroll(self, direction, amount=5):
        n = int(amount) if amount else 5
        if str(direction).lower() == "up":
            pyautogui.scroll(n)
        else:
            pyautogui.scroll(-n)
        return {"ok": True}

    def drag(self, x1, y1, x2, y2):
        pyautogui.moveTo(int(x1), int(y1), duration=0.2)
        pyautogui.drag(int(x2) - int(x1), int(y2) - int(y1), duration=0.4)
        return {"ok": True}

    def wait(self, seconds=2):
        time.sleep(min(float(seconds or 2), 30))
        return {"ok": True}

    def terminal(self, command):
        if platform.system() == "Windows":
            proc = subprocess.run(
                ["cmd", "/c", command],
                capture_output=True, text=True, timeout=EXEC_TIMEOUT,
                creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
            )
        else:
            proc = subprocess.run(
                ["bash", "-c", command],
                capture_output=True, text=True, timeout=EXEC_TIMEOUT,
            )
        out = (proc.stdout or "")[:4000]
        err = (proc.stderr or "")[:2000]
        text = out
        if err:
            text += ("\n[stderr] " + err)
        return {"ok": proc.returncode == 0, "output": text.strip()}

    def read_file(self, path):
        with open(path, "r", encoding="utf-8", errors="replace") as f:
            content = f.read(20000)
        return {"ok": True, "output": content}

    def write_file(self, path, content):
        with open(path, "w", encoding="utf-8") as f:
            f.write(content)
        return {"ok": True, "output": "Written"}

    def done(self):
        return {"ok": True, "done": True}

"""Capture d'écran — mss (rapide) + PIL (redimensionnement → base64)."""
import base64
import io
import logging

import mss
from PIL import Image

log = logging.getLogger(__name__)

MAX_WIDTH = 1280


class ScreenCapture:
    def __init__(self, monitor: int = 1):
        self.monitor_index = monitor
        self._sct = mss.mss()
        self.width = 0
        self.height = 0

    def _monitor(self):
        monitors = self._sct.monitors
        if self.monitor_index < len(monitors):
            return monitors[self.monitor_index]
        return monitors[1] if len(monitors) > 1 else monitors[0]

    def capture(self) -> str:
        """Capture l'écran et retourne un PNG encodé base64."""
        mon = self._monitor()
        shot = self._sct.grab(mon)
        img = Image.frombytes("RGB", shot.size, shot.bgra, "raw", "BGRX")
        self.width, self.height = img.size
        if img.width > MAX_WIDTH:
            ratio = MAX_WIDTH / img.width
            img = img.resize((MAX_WIDTH, int(img.height * ratio)), Image.LANCZOS)
        buf = io.BytesIO()
        img.save(buf, format="PNG", optimize=True)
        return base64.b64encode(buf.getvalue()).decode("ascii")

    def physical_size(self) -> tuple:
        mon = self._monitor()
        return mon["width"], mon["height"]

    def close(self):
        try:
            self._sct.close()
        except Exception:
            pass

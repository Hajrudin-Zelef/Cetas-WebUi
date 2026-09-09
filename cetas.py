#!/usr/bin/env python3
"""Cetas Desktop — fenêtre native avec serveur intégré (pywebview + tray icon)."""
import os
import sys
import threading
import traceback

def _log_error(e):
    """Écrit l'erreur dans un fichier log à côté de l'exe."""
    log_path = os.path.join(os.path.dirname(os.path.abspath(sys.argv[0])), "cetas_error.log")
    with open(log_path, "a", encoding="utf-8") as f:
        f.write(f"--- {__import__('datetime').datetime.now()} ---\n")
        traceback.print_exc(file=f)
        f.write("\n")

try:
    import webview
except Exception as e:
    _log_error(e)
    raise

from server.server import apply_frozen_defaults, create_server, vault_exists, load_vault_password


def _get_icon_path():
    """Chemin vers l'icône .ico (frozen ou dev)."""
    if getattr(sys, "frozen", False):
        base = sys._MEIPASS
    else:
        base = os.path.dirname(os.path.abspath(__file__))
    return os.path.join(base, "static", "images", "Cetas42.ico")


def _toggle_autostart(enable):
    """Active/désactive le démarrage automatique au login (Windows)."""
    if sys.platform != "win32":
        return
    import winreg
    key_path = r"Software\Microsoft\Windows\CurrentVersion\Run"
    try:
        key = winreg.OpenKey(winreg.HKEY_CURRENT_USER, key_path, 0, winreg.KEY_SET_VALUE)
        if enable:
            exe = sys.executable
            if getattr(sys, "frozen", False):
                exe = os.path.abspath(sys.executable)
            winreg.SetValueEx(key, "Cetas", 0, winreg.REG_SZ, f'"{exe}"')
        else:
            try:
                winreg.DeleteValue(key, "Cetas")
            except FileNotFoundError:
                pass
        winreg.CloseKey(key)
    except Exception:
        pass


def _is_autostart_enabled():
    """Vérifie si l'auto-start est actif."""
    if sys.platform != "win32":
        return False
    import winreg
    try:
        key = winreg.OpenKey(winreg.HKEY_CURRENT_USER, r"Software\Microsoft\Windows\CurrentVersion\Run", 0, winreg.KEY_READ)
        try:
            winreg.QueryValueEx(key, "Cetas")
            winreg.CloseKey(key)
            return True
        except FileNotFoundError:
            winreg.CloseKey(key)
            return False
    except Exception:
        return False


def main():
    apply_frozen_defaults()

    # Charger le mot de passe vault depuis le fichier local (desktop)
    if not os.environ.get("CETAS_VAULT_PASSWORD"):
        saved = load_vault_password()
        if saved:
            os.environ["CETAS_VAULT_PASSWORD"] = saved

    if not vault_exists():
        os.environ["CETAS_SETUP_MODE"] = "1"

    server = create_server()
    port = server.server_address[1]

    t = threading.Thread(target=server.serve_forever, daemon=True)
    t.start()

    start_url = f"http://127.0.0.1:{port}"
    if not vault_exists():
        start_url += "/setup"

    window = webview.create_window(
        "Cetas",
        start_url,
        width=1200,
        height=800,
        min_size=(800, 600),
        resizable=True,
        text_select=True,
    )

    def _on_loaded():
        window.evaluate_js('''
            document.addEventListener("keydown", function(e) {
                if (e.key === "F5" || (e.ctrlKey && e.key === "r") || (e.ctrlKey && e.shiftKey && (e.key === "R" || e.key === "r"))) {
                    e.preventDefault();
                    window.location.href = window.location.href;
                }
            });
        ''')

    window.events.loaded += _on_loaded

    # ── Tray icon (M5) ──────────────────────────────────────────────
    _tray_icon = None
    _tray_thread = None

    def _start_tray():
        nonlocal _tray_icon, _tray_thread
        if _tray_icon is not None:
            return
        try:
            import pystray
            from PIL import Image

            icon_path = _get_icon_path()
            if os.path.exists(icon_path):
                image = Image.open(icon_path)
            else:
                image = Image.new("RGB", (64, 64), "#5b7fff")

            def on_show(icon, item):
                window.show()

            def on_quit(icon, item):
                icon.stop()
                window.destroy()

            def on_toggle_autostart(icon, item):
                current = _is_autostart_enabled()
                _toggle_autostart(not current)
                icon.menu = _build_menu(not current)

            def _build_menu(auto_enabled):
                return pystray.Menu(
                    pystray.MenuItem("Ouvrir Cetas", on_show, default=True),
                    pystray.MenuItem(
                        f"{'Désactiver' if auto_enabled else 'Activer'} le démarrage auto",
                        on_toggle_autostart,
                    ),
                    pystray.Menu.SEPARATOR,
                    pystray.MenuItem("Quitter Cetas", on_quit),
                )

            _tray_icon = pystray.Icon("Cetas", image, "Cetas", _build_menu(_is_autostart_enabled()))
            _tray_thread = threading.Thread(target=_tray_icon.run, daemon=True)
            _tray_thread.start()
        except ImportError:
            pass

    def on_close():
        """Fermeture de la fenêtre → minimiser au tray au lieu de quitter."""
        window.hide()
        _start_tray()
        return False

    window.events.closing += on_close

    webview.start(debug=False)


if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        _log_error(e)
        traceback.print_exc()
        raise

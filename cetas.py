#!/usr/bin/env python3
"""Cetas Desktop — fenêtre native avec serveur intégré (pywebview)."""
import threading

import webview

from server.server import create_server


def main():
    server = create_server()
    port = server.server_address[1]

    t = threading.Thread(target=server.serve_forever, daemon=True)
    t.start()

    window = webview.create_window(
        "Cetas",
        f"http://127.0.0.1:{port}",
        width=1200,
        height=800,
        min_size=(800, 600),
        resizable=True,
        text_select=True,
    )
    webview.start(debug=False)


if __name__ == "__main__":
    main()

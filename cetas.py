#!/usr/bin/env python3
"""Cetas Desktop — fenêtre native avec serveur intégré (pywebview)."""
import os
import threading

import webview

from server.server import apply_frozen_defaults, create_server, vault_exists


def main():
    apply_frozen_defaults()
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
    webview.start(debug=False)


if __name__ == "__main__":
    main()

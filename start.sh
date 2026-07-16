#!/bin/sh
set -e

echo "[start] Démarrage proxy Python..."
python3 /app/server.py &
PROXY_PID=$!

# Attendre que le proxy soit prêt
for i in $(seq 1 15); do
    if curl -s http://127.0.0.1:8080/health > /dev/null 2>&1; then
        echo "[start] Proxy prêt (pid $PROXY_PID)"
        break
    fi
    if [ $i -eq 15 ]; then
        echo "[start] ERREUR: le proxy n'a pas démarré après 15 tentatives."
        exit 1
    fi
    sleep 0.5
done

echo "[start] Démarrage nginx..."
exec nginx -g "daemon off;"

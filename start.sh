#!/bin/bash
# Cetas — © Marexsoft Corporation. Fondateur Kouassi Marius.
set -e

# Générer la config JS runtime (token worker Cloudflare)
cat > /usr/share/nginx/html/js/config.js << EOF
// Généré au démarrage — NE PAS COMMITTER
window.CETAS_CONFIG = {
  workerToken: "${CETAS_WORKER_TOKEN:-}"
};
EOF
chmod 644 /usr/share/nginx/html/js/config.js

# S'assurer que les répertoires de données sont accessibles
mkdir -p /usr/share/nginx/html/conversations /app/data
chown -R cetas:cetas /usr/share/nginx/html/conversations /app/data 2>/dev/null || true
# Rendre le vault lisible uniquement par cetas (monté depuis l'hôte)
if [ -d /usr/share/nginx/html/.vault ]; then
    chmod -R 700 /usr/share/nginx/html/.vault 2>/dev/null || true
fi

echo "[start] Démarrage proxy Python..."
su -s /bin/sh cetas -c "python3 /app/server.py" &
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

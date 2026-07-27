# Cetas — © Marexsoft Corporation. Fondateur Kouassi Marius.
FROM nginx:alpine

# Créer un utilisateur non-root pour le proxy
RUN adduser -D -h /app -u 1001 cetas

# Python + cryptography pour le proxy API
RUN apk add --no-cache python3 py3-cryptography py3-pip curl nodejs npm bash pngquant && pip3 install --break-system-packages pyjwt

# Minifier JS/CSS pour réduire le poids (40-60% de gain)
RUN npm install -g terser clean-css-cli

# Proxy Python
COPY proxy/server.py /app/server.py
COPY core/linux/crypto_linux.py /app/core/linux/crypto_linux.py

# Fichiers de l'application (copiés avant minification)
COPY . /usr/share/nginx/html

# Compresser les PNGs lourds (80% de réduction, qualité visuelle identique)
RUN pngquant --quality=80-95 --speed 1 --force --ext .png /usr/share/nginx/html/images/Cetas42.png /usr/share/nginx/html/images/cetas3.png /usr/share/nginx/html/images/icon-512.png /usr/share/nginx/html/images/icon-maskable-512.png /usr/share/nginx/html/images/icon-192.png /usr/share/nginx/html/images/icon-maskable-192.png /usr/share/nginx/html/images/apple-touch-icon.png /usr/share/nginx/html/images/kiro-base.png 2>/dev/null || echo "pngquant: fichiers déjà optimisés ou absents"

# S'assurer que .env est lisible uniquement par cetas (proxy)
RUN chmod 600 /usr/share/nginx/html/.env 2>/dev/null || true

# Répertoire de données (hors racine web)
RUN mkdir -p /app/data && chown -R cetas:cetas /app/data

# Minifier les JS (sauf libs CDN déjà minifiées)
RUN terser /usr/share/nginx/html/js/app.js -o /usr/share/nginx/html/js/app.js -c -m --comments false --module
RUN terser /usr/share/nginx/html/js/ocean.js -o /usr/share/nginx/html/js/ocean.js -c -m --comments false --module
RUN terser /usr/share/nginx/html/js/api.js -o /usr/share/nginx/html/js/api.js -c -m --comments false
RUN terser /usr/share/nginx/html/js/auth.js -o /usr/share/nginx/html/js/auth.js -c -m --comments false
RUN terser /usr/share/nginx/html/js/state.js -o /usr/share/nginx/html/js/state.js -c -m --comments false --module
RUN terser /usr/share/nginx/html/js/emoji-picker.js -o /usr/share/nginx/html/js/emoji-picker.js -c -m --comments false --module
RUN terser /usr/share/nginx/html/js/favorites.js -o /usr/share/nginx/html/js/favorites.js -c -m --comments false --module
RUN terser /usr/share/nginx/html/js/whisper.js -o /usr/share/nginx/html/js/whisper.js -c -m --comments false --module
RUN terser /usr/share/nginx/html/js/user-management.js -o /usr/share/nginx/html/js/user-management.js -c -m --comments false --module
RUN terser /usr/share/nginx/html/js/web-search.js -o /usr/share/nginx/html/js/web-search.js -c -m --comments false --module
RUN terser /usr/share/nginx/html/js/search-engine.js -o /usr/share/nginx/html/js/search-engine.js -c -m --comments false
RUN terser /usr/share/nginx/html/js/tool-search.js -o /usr/share/nginx/html/js/tool-search.js -c -m --comments false
RUN terser /usr/share/nginx/html/js/export-md.js -o /usr/share/nginx/html/js/export-md.js -c -m --comments false --module
RUN terser /usr/share/nginx/html/js/budget.js -o /usr/share/nginx/html/js/budget.js -c -m --comments false --module
RUN terser /usr/share/nginx/html/js/quotas.js -o /usr/share/nginx/html/js/quotas.js -c -m --comments false --module
RUN terser /usr/share/nginx/html/js/settings-sync.js -o /usr/share/nginx/html/js/settings-sync.js -c -m --comments false --module
RUN terser /usr/share/nginx/html/js/categories.js -o /usr/share/nginx/html/js/categories.js -c -m --comments false --module
RUN terser /usr/share/nginx/html/js/roles.js -o /usr/share/nginx/html/js/roles.js -c -m --comments false --module
RUN terser /usr/share/nginx/html/js/prompts.js -o /usr/share/nginx/html/js/prompts.js -c -m --comments false --module
RUN terser /usr/share/nginx/html/js/export-import.js -o /usr/share/nginx/html/js/export-import.js -c -m --comments false --module
RUN terser /usr/share/nginx/html/js/model-catalog.js -o /usr/share/nginx/html/js/model-catalog.js -c -m --comments false
RUN terser /usr/share/nginx/html/js/plus-menu.js -o /usr/share/nginx/html/js/plus-menu.js -c -m --comments false
RUN terser /usr/share/nginx/html/js/right-panel.js -o /usr/share/nginx/html/js/right-panel.js -c -m --comments false
RUN terser /usr/share/nginx/html/js/config-providers.js -o /usr/share/nginx/html/js/config-providers.js -c -m --comments false
RUN terser /usr/share/nginx/html/js/conversations.js -o /usr/share/nginx/html/js/conversations.js -c -m --comments false
RUN terser /usr/share/nginx/html/js/filemanager.js -o /usr/share/nginx/html/js/filemanager.js -c -m --comments false
RUN terser /usr/share/nginx/html/js/faq.js -o /usr/share/nginx/html/js/faq.js -c -m --comments false
RUN terser /usr/share/nginx/html/models.js -o /usr/share/nginx/html/models.js -c -m --comments false

# Minifier le CSS — style.css est un point d'entrée @import, on concatène
# dans l'ordre de cascade avant minification
RUN cat /usr/share/nginx/html/css/variables.css \
        /usr/share/nginx/html/css/layout.css \
        /usr/share/nginx/html/css/chat.css \
        /usr/share/nginx/html/css/components.css \
        /usr/share/nginx/html/css/canvas.css \
        /usr/share/nginx/html/css/catalog.css \
        /usr/share/nginx/html/css/storage.css \
        /usr/share/nginx/html/css/menu.css \
    | cleancss -o /usr/share/nginx/html/css/style.css
RUN cleancss /usr/share/nginx/html/css/ocean.css -o /usr/share/nginx/html/css/ocean.css

# Supprimer node_modules (plus nécessaire après minification)
RUN npm uninstall -g terser clean-css-cli && rm -rf /root/.npm /usr/lib/node_modules

# Supprimer le seed de clés en clair
RUN rm -f /usr/share/nginx/html/core/api-keys-seed.json

# Configuration nginx

# Rate-limit sur /ddg-proxy/ (10 req/min par IP) — évite l'abus de la route
# comme relais anonyme vers DuckDuckGo. La zone doit être déclarée au niveau
# http{}, donc injectée dans le nginx.conf de base de l'image (pas dans
# conf.d/, réservé aux blocs server{}).
RUN sed -i '/include \/etc\/nginx\/conf.d\/\*.conf;/i\\    limit_req_zone \$binary_remote_addr zone=ddgproxy:10m rate=10r/m;' /etc/nginx/nginx.conf
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Script de démarrage
COPY start.sh /start.sh
RUN chmod +x /start.sh

ENV CETAS_BASE_DIR=/usr/share/nginx/html
ENV CETAS_CRYPTO_PATH=/app/core/linux/crypto_linux.py

EXPOSE 80

CMD ["/start.sh"]

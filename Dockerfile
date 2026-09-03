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
COPY core/users-seed.json /usr/share/nginx/html/core/users-seed.json

# Fichiers de l'application (copiés avant minification)
COPY . /usr/share/nginx/html

# Compresser les PNGs lourds (80% de réduction, qualité visuelle identique)
RUN pngquant --quality=80-95 --speed 1 --force --ext .png /usr/share/nginx/html/images/Cetas42.png /usr/share/nginx/html/images/cetas3.png /usr/share/nginx/html/images/icon-512.png /usr/share/nginx/html/images/icon-maskable-512.png /usr/share/nginx/html/images/icon-192.png /usr/share/nginx/html/images/icon-maskable-192.png /usr/share/nginx/html/images/apple-touch-icon.png /usr/share/nginx/html/images/kiro-base.png 2>/dev/null || echo "pngquant: fichiers déjà optimisés ou absents"

# S'assurer que .env est lisible uniquement par cetas (proxy)
RUN chmod 600 /usr/share/nginx/html/.env 2>/dev/null || true

# Répertoire de données (hors racine web)
RUN mkdir -p /app/data && chown -R cetas:cetas /app/data

# Minifier les JS (sauf libs CDN déjà minifiées)
RUN terser /usr/share/nginx/html/js/core/app.js -o /usr/share/nginx/html/js/core/app.js -c -m --comments false --module
RUN terser /usr/share/nginx/html/js/ui/ocean.js -o /usr/share/nginx/html/js/ui/ocean.js -c -m --comments false --module
RUN terser /usr/share/nginx/html/js/core/api.js -o /usr/share/nginx/html/js/core/api.js -c -m --comments false
RUN terser /usr/share/nginx/html/js/services/auth.js -o /usr/share/nginx/html/js/services/auth.js -c -m --comments false
RUN terser /usr/share/nginx/html/js/core/state.js -o /usr/share/nginx/html/js/core/state.js -c -m --comments false --module
RUN terser /usr/share/nginx/html/js/ui/emoji-picker.js -o /usr/share/nginx/html/js/ui/emoji-picker.js -c -m --comments false --module
RUN terser /usr/share/nginx/html/js/features/favorites.js -o /usr/share/nginx/html/js/features/favorites.js -c -m --comments false --module
RUN terser /usr/share/nginx/html/js/integrations/whisper.js -o /usr/share/nginx/html/js/integrations/whisper.js -c -m --comments false --module
RUN terser /usr/share/nginx/html/js/services/user-management.js -o /usr/share/nginx/html/js/services/user-management.js -c -m --comments false --module
RUN terser /usr/share/nginx/html/js/integrations/web-search.js -o /usr/share/nginx/html/js/integrations/web-search.js -c -m --comments false --module
RUN terser /usr/share/nginx/html/js/integrations/search-engine.js -o /usr/share/nginx/html/js/integrations/search-engine.js -c -m --comments false
RUN terser /usr/share/nginx/html/js/integrations/tool-search.js -o /usr/share/nginx/html/js/integrations/tool-search.js -c -m --comments false
RUN terser /usr/share/nginx/html/js/services/export-md.js -o /usr/share/nginx/html/js/services/export-md.js -c -m --comments false --module
RUN terser /usr/share/nginx/html/js/services/budget.js -o /usr/share/nginx/html/js/services/budget.js -c -m --comments false --module
RUN terser /usr/share/nginx/html/js/services/quotas.js -o /usr/share/nginx/html/js/services/quotas.js -c -m --comments false --module
RUN terser /usr/share/nginx/html/js/services/settings-sync.js -o /usr/share/nginx/html/js/services/settings-sync.js -c -m --comments false --module
RUN terser /usr/share/nginx/html/js/features/categories.js -o /usr/share/nginx/html/js/features/categories.js -c -m --comments false --module
RUN terser /usr/share/nginx/html/js/features/roles.js -o /usr/share/nginx/html/js/features/roles.js -c -m --comments false --module
RUN terser /usr/share/nginx/html/js/features/prompts.js -o /usr/share/nginx/html/js/features/prompts.js -c -m --comments false --module
RUN terser /usr/share/nginx/html/js/services/export-import.js -o /usr/share/nginx/html/js/services/export-import.js -c -m --comments false --module
RUN terser /usr/share/nginx/html/js/features/model-catalog.js -o /usr/share/nginx/html/js/features/model-catalog.js -c -m --comments false
RUN terser /usr/share/nginx/html/js/ui/plus-menu.js -o /usr/share/nginx/html/js/ui/plus-menu.js -c -m --comments false
RUN terser /usr/share/nginx/html/js/ui/right-panel.js -o /usr/share/nginx/html/js/ui/right-panel.js -c -m --comments false
RUN terser /usr/share/nginx/html/js/services/config-providers.js -o /usr/share/nginx/html/js/services/config-providers.js -c -m --comments false
RUN terser /usr/share/nginx/html/js/features/conversations.js -o /usr/share/nginx/html/js/features/conversations.js -c -m --comments false
RUN terser /usr/share/nginx/html/js/services/filemanager.js -o /usr/share/nginx/html/js/services/filemanager.js -c -m --comments false
RUN terser /usr/share/nginx/html/js/features/faq.js -o /usr/share/nginx/html/js/features/faq.js -c -m --comments false
RUN terser /usr/share/nginx/html/models.js -o /usr/share/nginx/html/models.js -c -m --comments false

# Minifier le CSS — style.css est un point d'entrée @import, on concatène
# dans l'ordre de cascade avant minification
RUN cat /usr/share/nginx/html/css/base/variables.css \
        /usr/share/nginx/html/css/base/layout.css \
        /usr/share/nginx/html/css/features/chat.css \
        /usr/share/nginx/html/css/components/components.css \
        /usr/share/nginx/html/css/components/canvas.css \
        /usr/share/nginx/html/css/components/catalog.css \
        /usr/share/nginx/html/css/components/storage.css \
        /usr/share/nginx/html/css/components/menu.css \
    | cleancss -o /usr/share/nginx/html/css/style.css
RUN cleancss /usr/share/nginx/html/css/ocean.css -o /usr/share/nginx/html/css/ocean.css

# Supprimer node_modules (plus nécessaire après minification)
RUN npm uninstall -g terser clean-css-cli && rm -rf /root/.npm /usr/lib/node_modules

# Supprimer le seed de clés en clair
RUN rm -f /usr/share/nginx/html/core/api-keys-seed.json

# Configuration nginx

COPY nginx.conf /etc/nginx/conf.d/default.conf

# Script de démarrage
COPY start.sh /start.sh
RUN chmod +x /start.sh

ENV CETAS_BASE_DIR=/usr/share/nginx/html
ENV CETAS_CRYPTO_PATH=/app/core/linux/crypto_linux.py

EXPOSE 80

CMD ["/start.sh"]

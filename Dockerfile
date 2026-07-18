FROM nginx:alpine

# Python + cryptography pour le proxy API
RUN apk add --no-cache python3 py3-cryptography py3-pip curl nodejs npm && pip3 install --break-system-packages pyjwt

# Minifier JS/CSS pour réduire le poids (40-60% de gain)
RUN npm install -g terser clean-css-cli

# Proxy Python
COPY proxy/server.py /app/server.py
COPY core/linux/crypto_linux.py /app/core/linux/crypto_linux.py

# Fichiers de l'application (copiés avant minification)
COPY . /usr/share/nginx/html

# Minifier les JS (sauf libs CDN déjà minifiées)
RUN terser /usr/share/nginx/html/js/app.js -o /usr/share/nginx/html/js/app.js -c -m --comments false --module
RUN terser /usr/share/nginx/html/js/ocean.js -o /usr/share/nginx/html/js/ocean.js -c -m --comments false --module
RUN terser /usr/share/nginx/html/js/api.js -o /usr/share/nginx/html/js/api.js -c -m --comments false
RUN terser /usr/share/nginx/html/js/auth.js -o /usr/share/nginx/html/js/auth.js -c -m --comments false
RUN terser /usr/share/nginx/html/js/state.js -o /usr/share/nginx/html/js/state.js -c -m --comments false --module
RUN terser /usr/share/nginx/html/js/filemanager.js -o /usr/share/nginx/html/js/filemanager.js -c -m --comments false
RUN terser /usr/share/nginx/html/js/faq.js -o /usr/share/nginx/html/js/faq.js -c -m --comments false
RUN terser /usr/share/nginx/html/models.js -o /usr/share/nginx/html/models.js -c -m --comments false
RUN terser /usr/share/nginx/html/images/ee.js -o /usr/share/nginx/html/images/ee.js -c -m --comments false

# Minifier le CSS
RUN cleancss /usr/share/nginx/html/css/style.css -o /usr/share/nginx/html/css/style.css
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

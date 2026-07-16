FROM nginx:alpine

# Python + cryptography pour le proxy API
RUN apk add --no-cache python3 py3-cryptography curl

# Proxy Python (copié AVANT le reste pour garder la structure)
COPY proxy/server.py /app/server.py
COPY core/linux/crypto_linux.py /app/core/linux/crypto_linux.py

# Fichiers de l'application
COPY . /usr/share/nginx/html

# Supprimer le seed de clés en clair (remplacé par .env chiffré)
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

# syntax=docker/dockerfile:1
FROM node:22-bookworm-slim AS build
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ \
    && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
COPY packages/client/package.json packages/client/package.json
COPY packages/server/package.json packages/server/package.json
COPY packages/e2e/package.json packages/e2e/package.json
COPY shared/package.json shared/package.json
RUN npm ci
COPY shared/ shared/
COPY packages/server/ packages/server/
COPY packages/client/ packages/client/
RUN npm run build:shared && npm run build:server && npm run build:client
RUN npm prune --omit=dev --workspace=@ai-agent-board/server --workspace=@ai-agent-board/shared \
    && mkdir -p packages/server/node_modules shared/node_modules

FROM node:22-bookworm-slim AS runtime
LABEL org.opencontainers.image.title="AI Router Board" \
      org.opencontainers.image.source="https://github.com/66Hamidreza/ai-router-board" \
      org.opencontainers.image.licenses="MIT"
RUN apt-get update && apt-get install -y --no-install-recommends nginx tini git ca-certificates \
    && rm -rf /var/lib/apt/lists/* /etc/nginx/sites-enabled/default
WORKDIR /app
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/shared/package.json ./shared/package.json
COPY --from=build /app/shared/dist ./shared/dist
COPY --from=build /app/packages/server/package.json ./packages/server/package.json
COPY --from=build /app/packages/server/dist ./packages/server/dist
COPY --from=build /app/packages/server/node_modules ./packages/server/node_modules
COPY --from=build /app/shared/node_modules ./shared/node_modules
COPY --from=build /app/packages/client/dist ./public
COPY LICENSE ./LICENSE
RUN <<'SETUP'
cat > /etc/nginx/nginx.conf <<'NGINX'
worker_processes auto;
pid /tmp/nginx.pid;
error_log /dev/stderr warn;
events { worker_connections 1024; }
http {
    include /etc/nginx/mime.types;
    default_type application/octet-stream;
    access_log /dev/stdout;
    client_body_temp_path /tmp/nginx-client;
    proxy_temp_path /tmp/nginx-proxy;
    fastcgi_temp_path /tmp/nginx-fastcgi;
    uwsgi_temp_path /tmp/nginx-uwsgi;
    scgi_temp_path /tmp/nginx-scgi;
    map $http_upgrade $connection_upgrade { default upgrade; '' close; }
    server {
        listen 8080;
        root /app/public;
        index index.html;
        client_max_body_size 10m;
        location /api/ {
            proxy_pass http://127.0.0.1:8082;
            proxy_set_header Host $http_host;
            proxy_set_header X-Forwarded-Proto $scheme;
        }
        location = /ws {
            proxy_pass http://127.0.0.1:8082;
            proxy_http_version 1.1;
            proxy_set_header Upgrade $http_upgrade;
            proxy_set_header Connection $connection_upgrade;
            proxy_set_header Host $http_host;
            proxy_read_timeout 3600s;
        }
        location / { try_files $uri $uri/ /index.html; }
    }
}
NGINX
cat > /app/start.sh <<'START'
#!/bin/bash
set -euo pipefail
# Fixed internal API address matches nginx; public HTTP/API port is 8080.
HOST=127.0.0.1 PORT=8082 node packages/server/dist/index.js &
api_pid=$!
nginx -g 'daemon off;' &
web_pid=$!
shutdown() {
    kill -TERM "$api_pid" "$web_pid" 2>/dev/null || true
    wait "$api_pid" "$web_pid" 2>/dev/null || true
}
trap 'shutdown; exit 0' TERM INT
set +e
wait -n "$api_pid" "$web_pid"
status=$?
set -e
shutdown
# A daemon exiting on its own is a container failure, even with status zero.
if [ "$status" -eq 0 ]; then status=1; fi
exit "$status"
START
chmod 755 /app/start.sh
mkdir -p /data
chown node:node /data
SETUP
ENV NODE_ENV=production \
    DB_PATH=/data/agentboard.db \
    AGENTBOARD_HOME=/data/agentboard \
    ALLOWED_ORIGINS=http://localhost:8080,http://127.0.0.1:8080 \
    ALLOWED_HOSTS=localhost,127.0.0.1
USER node
VOLUME ["/data"]
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
    CMD node -e 'fetch("http://127.0.0.1:8080/api/health", {headers: process.env.API_KEY ? {Authorization: "Bearer " + process.env.API_KEY} : {}}).then(r => {if (!r.ok) process.exit(1); return r.json()}).then(b => {if (b.status !== "ok") process.exit(1)}).catch(() => process.exit(1))'
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["/app/start.sh"]

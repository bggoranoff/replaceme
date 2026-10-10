#!/usr/bin/env bash
# Deploy frontend/ to Cloud Run behind https://replaceme.world.
#
# The load balancer routes to the Cloud Run service named $SERVICE (default
# "hello"), so redeploying that service swaps what replaceme.world serves.
#
# If frontend/Dockerfile exists it is used as-is (must listen on $PORT).
# Otherwise frontend/ is treated as a static Node app (Vite/CRA style):
# `npm ci && npm run build`, then the output dir is served by nginx.
#
# Usage: ./deploy.sh            # deploy frontend/
#        SRC=deploy/hello ./deploy.sh   # redeploy the hello world page
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
SRC="${SRC:-frontend}"
SERVICE="${SERVICE:-hello}"
REGION="${REGION:-europe-west1}"
CONFIG="${CONFIG:-replaceme}"   # gcloud configuration: devstar2066@gcplab.me / agentic26zrh-2066
BUILD_DIR="${BUILD_DIR:-}"     # static build output dir; auto-detected if empty

case "$SRC" in /*) SRC_DIR="$SRC" ;; *) SRC_DIR="$ROOT/$SRC" ;; esac
[ -d "$SRC_DIR" ] || { echo "error: $SRC_DIR does not exist" >&2; exit 1; }

STAGE="$(mktemp -d)"
trap 'rm -rf "$STAGE"' EXIT

if [ -f "$SRC_DIR/Dockerfile" ]; then
  echo "==> Using $SRC/Dockerfile"
  rsync -a --exclude node_modules --exclude .git --exclude dist --exclude build "$SRC_DIR/" "$STAGE/"
elif [ -f "$SRC_DIR/package.json" ]; then
  echo "==> Building static app from $SRC/package.json"
  rsync -a --exclude node_modules --exclude .git "$SRC_DIR/" "$STAGE/app/"
  cat > "$STAGE/nginx.conf.template" <<'EOF'
server {
  listen ${PORT};
  root /usr/share/nginx/html;
  location / { try_files $uri $uri/ /index.html; }
  location ~* \.(js|css|png|jpg|svg|woff2?|json|mp3|ogg|wav)$ { expires 7d; try_files $uri =404; }
}
EOF
  cat > "$STAGE/Dockerfile" <<EOF
FROM node:22-alpine AS build
WORKDIR /app
COPY app/package*.json ./
RUN if [ -f package-lock.json ]; then npm ci; else npm install; fi
COPY app/ ./
RUN npm run build
RUN out="${BUILD_DIR}"; [ -n "\$out" ] || for d in dist build out; do [ -d "\$d" ] && out="\$d" && break; done; \\
    [ -n "\$out" ] && [ -d "\$out" ] || { echo "no build output dir found; set BUILD_DIR" >&2; exit 1; }; \\
    mv "\$out" /site

FROM nginx:1.27-alpine
ENV PORT=8080
COPY nginx.conf.template /etc/nginx/templates/default.conf.template
COPY --from=build /site /usr/share/nginx/html
EOF
else
  echo "error: $SRC has neither a Dockerfile nor a package.json" >&2
  exit 1
fi

echo "==> Deploying $SRC to Cloud Run service '$SERVICE' ($REGION)"
gcloud run deploy "$SERVICE" \
  --configuration "$CONFIG" \
  --source "$STAGE" \
  --region "$REGION" \
  --allow-unauthenticated \
  --quiet

URL="$(gcloud run services describe "$SERVICE" --configuration "$CONFIG" --region "$REGION" --format='value(status.url)')"
echo "==> Live at $URL"
echo "==> and https://replaceme.world (via load balancer)"

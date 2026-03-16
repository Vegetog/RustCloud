#!/usr/bin/env bash
set -euo pipefail

REPO="${RUSTCLOUD_REPO:-songhaojie/RustCloud}"
IMAGE_OWNER_DEFAULT="${REPO%%/*}"
INSTALL_DIR="${RUSTCLOUD_DIR:-$HOME/rustcloud}"
VERSION="${1:-latest}"

if ! command -v docker >/dev/null 2>&1; then
  echo "[ERROR] Docker is not installed."
  exit 1
fi

if ! docker compose version >/dev/null 2>&1; then
  echo "[ERROR] Docker Compose v2 is required (docker compose)."
  exit 1
fi

mkdir -p "$INSTALL_DIR"
cd "$INSTALL_DIR"

COMPOSE_URL="https://raw.githubusercontent.com/${REPO}/main/docker-compose.prod.yml"
ENV_URL="https://raw.githubusercontent.com/${REPO}/main/.env.prod.example"

echo "[INFO] Downloading deployment files from ${REPO} ..."
curl -fsSL "$COMPOSE_URL" -o docker-compose.yml

if [[ ! -f .env.prod ]]; then
  curl -fsSL "$ENV_URL" -o .env.prod
  echo "[INFO] Created .env.prod from template."
fi

if grep -q '^IMAGE_TAG=' .env.prod; then
  sed "s/^IMAGE_TAG=.*/IMAGE_TAG=${VERSION}/" .env.prod > .env.prod.tmp
  mv .env.prod.tmp .env.prod
else
  printf "\nIMAGE_TAG=%s\n" "$VERSION" >> .env.prod
fi

if ! grep -q '^IMAGE_OWNER=' .env.prod; then
  printf "IMAGE_OWNER=%s\n" "$IMAGE_OWNER_DEFAULT" >> .env.prod
fi

echo "[INFO] Pulling images (tag: ${VERSION}) ..."
docker compose --env-file .env.prod pull

echo "[INFO] Starting services ..."
docker compose --env-file .env.prod up -d

echo "[DONE] RustCloud is running."
echo "[INFO] Open: http://localhost:${PUBLIC_PORT:-80}"
echo "[INFO] Please edit .env.prod and replace all CHANGE_ME values in production."

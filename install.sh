#!/usr/bin/env bash
set -eu
if (set -o pipefail >/dev/null 2>&1); then
  set -o pipefail
fi

if [ -z "${BASH_VERSION:-}" ]; then
  echo "[ERROR] This installer must run with bash."
  exit 1
fi

REPO="${RUSTCLOUD_REPO:-Vegetog/RustCloud}"
IMAGE_OWNER_DEFAULT="$(printf '%s' "${REPO%%/*}" | tr '[:upper:]' '[:lower:]')"
INSTALL_DIR="${RUSTCLOUD_DIR:-$HOME/rustcloud}"
VERSION="${1:-latest}"
GITHUB_TOKEN_VALUE="${RUSTCLOUD_GITHUB_TOKEN:-${GITHUB_TOKEN:-}}"
RESET_DATA_RAW="${RUSTCLOUD_RESET_DATA:-0}"

RESET_DATA="false"
case "${RESET_DATA_RAW,,}" in
  1|true|yes|y|on)
    RESET_DATA="true"
    ;;
esac

if [[ "$VERSION" == "latest" ]]; then
  REF="main"
else
  REF="$VERSION"
fi

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

download_from_repo() {
  local repo_path="$1"
  local output_file="$2"

  if [[ -n "$GITHUB_TOKEN_VALUE" ]]; then
    local api_url="https://api.github.com/repos/${REPO}/contents/${repo_path}?ref=${REF}"
    curl -fsSL \
      -H "Authorization: Bearer ${GITHUB_TOKEN_VALUE}" \
      -H "Accept: application/vnd.github.raw" \
      "$api_url" \
      -o "$output_file"
  else
    local raw_url="https://raw.githubusercontent.com/${REPO}/${REF}/${repo_path}"
    if ! curl -fsSL "$raw_url" -o "$output_file"; then
      echo "[ERROR] Failed to download ${repo_path} from ${raw_url}."
      echo "[HINT] If the repository is private, set GITHUB_TOKEN or RUSTCLOUD_GITHUB_TOKEN before running this script."
      exit 1
    fi
  fi
}

echo "[INFO] Downloading deployment files from ${REPO} ..."
download_from_repo "docker-compose.prod.yml" "docker-compose.yml"

if [[ ! -f .env.prod ]]; then
  download_from_repo ".env.prod.example" ".env.prod"
  echo "[INFO] Created .env.prod from template."
fi

if grep -q '^IMAGE_TAG=' .env.prod; then
  sed "s/^IMAGE_TAG=.*/IMAGE_TAG=${VERSION}/" .env.prod > .env.prod.tmp
  mv .env.prod.tmp .env.prod
else
  printf "\nIMAGE_TAG=%s\n" "$VERSION" >> .env.prod
fi

if grep -q '^IMAGE_OWNER=' .env.prod; then
  CURRENT_IMAGE_OWNER="$(grep '^IMAGE_OWNER=' .env.prod | tail -n 1 | cut -d= -f2-)"
  NORMALIZED_IMAGE_OWNER="$(printf '%s' "$CURRENT_IMAGE_OWNER" | tr '[:upper:]' '[:lower:]')"
  sed "s/^IMAGE_OWNER=.*/IMAGE_OWNER=${NORMALIZED_IMAGE_OWNER}/" .env.prod > .env.prod.tmp
  mv .env.prod.tmp .env.prod
else
  printf "IMAGE_OWNER=%s\n" "$IMAGE_OWNER_DEFAULT" >> .env.prod
fi

if [[ "$RESET_DATA" == "true" ]]; then
  echo "[INFO] RUSTCLOUD_RESET_DATA is enabled. Recreating stack and volumes..."
  docker compose --env-file .env.prod down -v --remove-orphans
fi

echo "[INFO] Pulling images (tag: ${VERSION}) ..."
docker compose --env-file .env.prod pull

echo "[INFO] Starting services ..."
if ! docker compose --env-file .env.prod up -d; then
  echo "[ERROR] Service startup failed. Recent logs:"
  docker compose --env-file .env.prod logs migration --tail 80 || true
  docker compose --env-file .env.prod logs postgres --tail 80 || true
  echo "[HINT] If you changed POSTGRES_PASSWORD but reused an old postgres_data volume, credentials may mismatch."
  echo "[HINT] For a clean reinstall (will delete existing data):"
  echo "       docker compose --env-file .env.prod down -v"
  echo "       docker compose --env-file .env.prod up -d"
  exit 1
fi

echo "[DONE] RustCloud is running."
echo "[INFO] Open: http://localhost:${PUBLIC_PORT:-80}"
echo "[INFO] Please edit .env.prod and replace all CHANGE_ME values in production."

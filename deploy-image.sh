#!/usr/bin/env bash
# Manual, image-only deployment for an EXISTING new-api Compose installation.
# Requires Bash, Docker Compose >= 2.24.4, flock (util-linux), curl, and coreutils.
set -Eeuo pipefail
umask 077

APP_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)
cd "$APP_DIR"
STATE_DIR="$APP_DIR/.release"
mkdir -p "$STATE_DIR"
exec 9>"$STATE_DIR/deploy.lock"
flock -n 9 || { echo 'Another deployment is running.' >&2; exit 1; }

ACTION=${1:-status}
if [[ "$ACTION" != deploy && "$ACTION" != rollback && "$ACTION" != status ]]; then
  echo "Usage: bash deploy-image.sh deploy ghcr.io/lgwtonylgw/new-api@sha256:..." >&2
  echo '       bash deploy-image.sh rollback | status' >&2
  exit 2
fi

for path in .env compose.runtime.yml compose.image.yml; do
  [[ -f "$APP_DIR/$path" ]] || { echo "Required file missing: $path" >&2; exit 1; }
done
docker inspect new-api >/dev/null
PROJECT=$(docker inspect --format '{{ index .Config.Labels "com.docker.compose.project" }}' new-api)
SERVICE=$(docker inspect --format '{{ index .Config.Labels "com.docker.compose.service" }}' new-api)
ORIGINAL_DIR=$(docker inspect --format '{{ index .Config.Labels "com.docker.compose.project.working_dir" }}' new-api)
[[ -n "$PROJECT" && "$PROJECT" != '<no value>' && "$SERVICE" == new-api ]] || {
  echo 'The existing new-api container must belong to a Compose project.' >&2; exit 1;
}
[[ -d "$ORIGINAL_DIR" && "$(cd "$ORIGINAL_DIR" && pwd -P)" == "$APP_DIR" ]] || {
  echo 'Install this script in the ORIGINAL Compose working directory.' >&2; exit 1;
}

compose() {
  NEW_API_IMAGE="$TARGET_IMAGE" docker compose \
    --project-directory "$APP_DIR" --env-file "$APP_DIR/.env" \
    -p "$PROJECT" -f "$APP_DIR/compose.runtime.yml" -f "$APP_DIR/compose.image.yml" "$@"
}

if [[ "$ACTION" == status ]]; then
  docker inspect --format 'Image={{.Config.Image}} Status={{.State.Status}} Health={{if .State.Health}}{{.State.Health.Status}}{{else}}not-configured{{end}}' new-api
  if [[ -f "$STATE_DIR/previous-image" ]]; then
    printf 'Rollback image: '; cat "$STATE_DIR/previous-image"
  fi
  exit 0
fi

if [[ "$ACTION" == deploy ]]; then
  TARGET_IMAGE=${2:-}
  [[ "$TARGET_IMAGE" =~ ^ghcr\.io/lgwtonylgw/new-api@sha256:[a-f0-9]{64}$ ]] || {
    echo 'Use the exact ghcr.io/lgwtonylgw/new-api@sha256:... value from Actions Summary.' >&2; exit 2;
  }
else
  [[ -s "$STATE_DIR/previous-image" ]] || { echo 'No saved rollback image.' >&2; exit 1; }
  TARGET_IMAGE=$(cat "$STATE_DIR/previous-image")
  [[ "$TARGET_IMAGE" =~ ^new-api-local-rollback:[a-zA-Z0-9_.-]+$ ]] || {
    echo 'Invalid saved rollback image reference.' >&2; exit 1;
  }
  echo 'Application rollback only. Database compatibility must be verified before using this command.'
fi

# Validate without printing interpolated secrets.
compose config --quiet

if [[ "$ACTION" == deploy ]]; then
  # Download completely before replacing the currently serving container.
  docker pull "$TARGET_IMAGE"
else
  # Rollback uses a retained local image and never depends on the registry.
  docker image inspect "$TARGET_IMAGE" >/dev/null
fi

IMAGE_ARCH=$(docker image inspect --format '{{.Architecture}}' "$TARGET_IMAGE")
case "$(uname -m)" in
  x86_64) SERVER_ARCH=amd64 ;;
  aarch64|arm64) SERVER_ARCH=arm64 ;;
  *) echo 'Unsupported host architecture.' >&2; exit 1 ;;
esac
[[ "$IMAGE_ARCH" == "$SERVER_ARCH" ]] || {
  echo "Image architecture $IMAGE_ARCH does not match server $SERVER_ARCH." >&2; exit 1;
}

if [[ "$ACTION" == deploy ]]; then
  OLD_ID=$(docker inspect --format '{{.Image}}' new-api)
  OLD_REF=$(docker inspect --format '{{.Config.Image}}' new-api)
  ROLLBACK_IMAGE="new-api-local-rollback:$(date -u +%Y%m%dT%H%M%SZ)-$RANDOM"
  docker tag "$OLD_ID" "$ROLLBACK_IMAGE"
  printf '%s\n' "$ROLLBACK_IMAGE" > "$STATE_DIR/previous-image.tmp"
  mv "$STATE_DIR/previous-image.tmp" "$STATE_DIR/previous-image"
  printf '%s\tprevious=%s\tnew=%s\n' "$(date -u +%FT%TZ)" "$OLD_REF" "$TARGET_IMAGE" >> "$STATE_DIR/history.log"
fi

if compose up -d --no-deps --no-build --pull never --wait --wait-timeout 180 new-api; then
  if curl --fail --silent --show-error --max-time 10 http://127.0.0.1:3000/api/status \
      | grep -Eq '"success"[[:space:]]*:[[:space:]]*true'; then
    printf '%s\n' "$TARGET_IMAGE" > "$STATE_DIR/current-image.tmp"
    mv "$STATE_DIR/current-image.tmp" "$STATE_DIR/current-image"
    printf '%s\tsuccess=%s\n' "$(date -u +%FT%TZ)" "$TARGET_IMAGE" >> "$STATE_DIR/history.log"
    echo "Deployment healthy: $TARGET_IMAGE"
    exit 0
  fi
fi

printf '%s\tfailed=%s\n' "$(date -u +%FT%TZ)" "$TARGET_IMAGE" >> "$STATE_DIR/history.log"
echo 'Deployment failed health checks. No automatic database or application rollback was performed.' >&2
echo 'After checking schema compatibility, use: bash deploy-image.sh rollback' >&2
echo 'Inspect application logs locally; redact credentials before sharing.' >&2
exit 1

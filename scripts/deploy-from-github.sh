#!/usr/bin/env bash
# Forced-command entry point for a dedicated GitHub Actions SSH key.
# Install this file and the deployment scripts manually under the original app directory.
set -euo pipefail

ORIGINAL_COMMAND=${SSH_ORIGINAL_COMMAND:-}
if [[ ! "$ORIGINAL_COMMAND" =~ ^deploy\ (ghcr\.io/lgwtonylgw/new-api@sha256:[a-f0-9]{64})$ ]]; then
  echo 'This key only permits deploying a new-api image by digest.' >&2
  exit 2
fi
IMAGE=${BASH_REMATCH[1]}
APP_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd -P)
exec bash "$APP_DIR/deploy-image.sh" deploy "$IMAGE"

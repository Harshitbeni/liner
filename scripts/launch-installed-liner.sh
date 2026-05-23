#!/usr/bin/env bash
# Start packaged Liner API, then open /Applications/Liner.app.
set -euo pipefail

APP="/Applications/Liner.app"
RES="$APP/Contents/Resources"
BUN="${RES}/runtime/bun"
API="${RES}/liner-server/index.js"

if [[ ! -x "$BUN" ]]; then
  BUN="$(command -v bun || true)"
fi
if [[ -z "$BUN" ]]; then
  echo "Bun not found — install from https://bun.sh or rebuild with prepare:runtime"
  exit 1
fi

export LINER_PACKAGED=1
export LINER_RPC_MODE=cursor-sdk
export LINER_MANAGED_ENGINE=0
export LINER_RESOURCES_PATH="$RES"
export LINER_API_PORT="${LINER_API_PORT:-9240}"

"$BUN" "$API" &
API_PID=$!
trap 'kill "$API_PID" 2>/dev/null || true' EXIT

sleep 2
open "$APP"

wait "$API_PID"

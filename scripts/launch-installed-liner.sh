#!/usr/bin/env bash
# Start packaged Liner API + OpenCode engine, then open /Applications/Liner.app.
set -euo pipefail

APP="/Applications/Liner.app"
RES="$APP/Contents/Resources"

if [[ ! -d "$APP" ]]; then
  echo "Install Liner.app to /Applications first (bun run build:desktop:bundled)." >&2
  exit 1
fi

cd "$(dirname "$0")/.."
bun scripts/free-dev-ports.ts

export LINER_PACKAGED=1
export LINER_MANAGED_ENGINE=1
export LINER_RPC_MODE=opencode
export LINER_ENGINE_ROOT="$RES/opencode-engine"
export LINER_RESOURCES_PATH="$RES"
export LINER_REPO_ROOT="$RES"
export LINER_API_PORT="${LINER_API_PORT:-9240}"

cd "$RES/liner-server"
nohup "$RES/runtime/bun" index.js >> /tmp/liner-packaged-api.log 2>&1 &
echo "[liner] API pid $! (log: /tmp/liner-packaged-api.log)"

for _ in $(seq 1 60); do
  if curl -sf "http://127.0.0.1:${LINER_API_PORT}/api/health" >/dev/null 2>&1; then
    break
  fi
  sleep 1
done

xattr -cr "$APP" 2>/dev/null || true
open -n "$APP"

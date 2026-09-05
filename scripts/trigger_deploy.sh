#!/usr/bin/env bash
# Rebuild + verify + restart the locally-managed Bugle daemon.
# Called manually or after a merged PR (hardened deploy pipeline).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "[bugle] taking pre-deployment sqlite backup..."
mkdir -p data/backups
if [ -f data/bugle.db ]; then
  cp data/bugle.db "data/backups/bugle-$(date +%Y%m%d_%H%M%S).db"
fi

echo "[bugle] pulling git updates..."
git pull --ff-only --quiet || echo "[bugle] (no remote pull or branch unchanged)"

echo "[bugle] installing backend dependencies..."
./.venv/bin/pip install -q -e ".[dev]"

echo "[bugle] applying database migrations..."
./.venv/bin/python -m bugle.db_migrate

echo "[bugle] building frontend (npm ci + build)..."
if [ -d web ] && [ -f web/package-lock.json ]; then
  (cd web && npm ci && npm run build)
fi

echo "[bugle] restarting launchd service..."
launchctl kickstart -k "gui/$(id -u)/com.personal.bugle" 2>/dev/null \
  || launchctl unload ~/Library/LaunchAgents/com.personal.bugle.plist 2>/dev/null \
  && launchctl load ~/Library/LaunchAgents/com.personal.bugle.plist 2>/dev/null \
  || echo "[bugle] Note: launchd service not loaded yet (run scripts/install_launchd.sh if needed)"

echo "[bugle] verifying daemon health check..."
sleep 2
HEALTH_URL="http://127.0.0.1:8480/api/health"
if curl --silent --fail --max-time 10 "$HEALTH_URL" > /dev/null; then
  echo "[bugle] health check passed. Deployment SUCCESSFUL."
else
  echo "[bugle] daemon not responding at $HEALTH_URL (if not yet running as service, run scripts/install_launchd.sh)"
fi

echo "[bugle] deploy completed."
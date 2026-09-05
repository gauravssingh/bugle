#!/usr/bin/env bash
# Rebuild + restart the locally-managed Bugle daemon.
# Called manually or after a merged PR (same hook pattern as my-monee).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "[bugle] pulling + installing backend deps..."
git pull --ff-only --quiet
./.venv/bin/pip install -q -e ".[dev]"

echo "[bugle] building frontend (if present)..."
if [ -d web ] && [ -x web/node_modules/.bin/vite ]; then
  (cd web && node_modules/.bin/vite build)
fi

echo "[bugle] restarting launchd service..."
launchctl kickstart -k "gui/$(id -u)/com.personal.bugle" 2>/dev/null \
  || launchctl unload ~/Library/LaunchAgents/com.personal.bugle.plist \
  && launchctl load ~/Library/LaunchAgents/com.personal.bugle.plist

echo "[bugle] done."
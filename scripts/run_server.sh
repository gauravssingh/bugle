#!/usr/bin/env bash
# Launchd entrypoint for the Bugle daemon (mirrors my-monee).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PYTHON="$ROOT/.venv/bin/python"
LOG_DIR="$HOME/Library/Logs/bugle"
mkdir -p "$LOG_DIR"
cd "$ROOT"
exec "$PYTHON" -m bugle
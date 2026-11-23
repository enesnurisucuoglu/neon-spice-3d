#!/usr/bin/env bash
set -euo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$DIR"

PORT="${PORT:-5174}"
URL="http://localhost:${PORT}"

if [ ! -d "node_modules" ]; then
  echo "Installing NeonSPICE 3D dependencies..."
  npm install
fi

(
  for _ in $(seq 1 30); do
    if curl -s "$URL" >/dev/null 2>&1 || nc -z localhost "$PORT" >/dev/null 2>&1; then
      break
    fi
    sleep 0.3
  done
  if command -v xdg-open >/dev/null 2>&1; then
    xdg-open "$URL" >/dev/null 2>&1 &
  elif command -v open >/dev/null 2>&1; then
    open "$URL" >/dev/null 2>&1 &
  fi
) &

echo "Starting NeonSPICE 3D (v2) at $URL ..."
exec npm run dev -- --port "$PORT"

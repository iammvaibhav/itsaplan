#!/usr/bin/env bash
# Production start for the Next.js standalone build.
# `next start` is not valid with output: 'standalone'.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
STANDALONE="$ROOT/.next/standalone/apps/web"

if [[ ! -f "$STANDALONE/server.js" ]]; then
  echo "missing $STANDALONE/server.js; run: bun run build" >&2
  exit 1
fi

mkdir -p "$STANDALONE/.next"
rm -rf "$STANDALONE/.next/static"
cp -a "$ROOT/.next/static" "$STANDALONE/.next/static"

if [[ -d "$ROOT/public" ]]; then
  rm -rf "$STANDALONE/public"
  cp -a "$ROOT/public" "$STANDALONE/public"
fi

export NODE_ENV=production
export PORT="${PORT:-3001}"
export HOSTNAME="${HOSTNAME:-0.0.0.0}"
cd "$STANDALONE"
exec node server.js

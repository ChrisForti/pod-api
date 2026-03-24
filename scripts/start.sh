#!/bin/sh
set -e

echo "[start] Running database migrations..."
npx drizzle-kit migrate --config ./drizzle.config.ts

echo "[start] Starting API server..."
exec node dist/index.js

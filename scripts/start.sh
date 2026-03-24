#!/bin/sh
set -e

echo "[start] Running database migrations..."
node dist/db/migrate.js

echo "[start] Starting API server..."
exec node dist/index.js

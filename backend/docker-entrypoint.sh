#!/bin/sh
# Runs on every backend container start:
#  1. Syncs the Postgres schema to match prisma/schema.prisma (creates
#     tables on first run; a no-op if they already match).
#  2. Seeds demo data (admin user, sample customer/products) — the seed
#     script uses upserts, so re-running it on every restart is safe.
#  3. Starts the API.
#
# This removes the need for any manual `prisma migrate` / `prisma db push`
# step after `docker compose up` — the container is ready to use on its own.
set -e

echo "==> Waiting for database and syncing schema (prisma db push)..."
attempt=0
until npx prisma db push --skip-generate --accept-data-loss; do
  attempt=$((attempt + 1))
  if [ "$attempt" -ge 15 ]; then
    echo "==> Could not reach/sync the database after multiple attempts. Exiting."
    exit 1
  fi
  echo "==> Database not ready yet, retrying in 3s... (attempt $attempt/15)"
  sleep 3
done

echo "==> Seeding demo data (idempotent)..."
npx ts-node --transpile-only prisma/seed.ts || echo "==> Seed step reported an issue but startup will continue."

echo "==> Starting Order Management System API..."
exec node dist/main

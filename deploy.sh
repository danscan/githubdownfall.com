#!/bin/bash
set -euo pipefail

# Seed DB on first deploy (copy local backfilled DB to volume)
if fly ssh console -C "test -f /data/incidents.db" 2>/dev/null; then
  echo "DB exists on volume, skipping seed."
else
  echo "Seeding DB..."
  fly ssh sftp shell <<< "put incidents.db /data/incidents.db"
fi

fly deploy

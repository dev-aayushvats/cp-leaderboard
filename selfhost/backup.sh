#!/bin/sh
# Saves a compressed copy of the whole database to ./backups/. Run it from cron for regular backups.
set -e
cd "$(dirname "$0")"
mkdir -p backups
f="backups/leaderboard-$(date +%Y%m%d-%H%M%S).sql.gz"
docker compose exec -T db pg_dump -U postgres postgres | gzip > "$f"
echo "Saved $f"

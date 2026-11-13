#!/bin/sh
# Container entrypoint. The API container sets up the database before starting; other containers
# built from this image (the worker) set MIGRATE_ON_START=false and just start.
set -e
if [ "${MIGRATE_ON_START:-true}" != "false" ]; then
  echo "Applying database migrations..."
  node src/migrate.js
  node scripts/bootstrap.js
fi
exec "$@"

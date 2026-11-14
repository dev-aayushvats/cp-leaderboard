#!/bin/sh
# Builds the self-hosting package: a clean copy of this project that a college can clone and run with
# docker compose. The package is generated from this repository (backend/, frontend/ and selfhost/), so there is
# still ONE codebase: re-run this after changing the app to refresh the package.
#
#   scripts/package-selfhost.sh [destination]      (default: ../cp-leaderboard-selfhost)
#
# The destination may already be a git repository: .git is left alone, so you can review and commit the changes.
set -e
SRC=$(cd "$(dirname "$0")/.." && pwd)
DEST=${1:-"$SRC/../cp-leaderboard-selfhost"}
mkdir -p "$DEST"
DEST=$(cd "$DEST" && pwd)

[ "$DEST" != "$SRC" ] || { echo "Destination must be a different directory." >&2; exit 1; }
# Refuse to sync into a directory that is not empty and was not created by this script
if [ -n "$(ls -A "$DEST" 2>/dev/null | grep -v '^\.git$')" ] && [ ! -f "$DEST/.selfhost-package" ]; then
  echo "$DEST is not empty and isn't a self-host package. Choose an empty directory." >&2
  exit 1
fi
command -v rsync >/dev/null 2>&1 || { echo "rsync is required." >&2; exit 1; }

COMMON='--exclude=node_modules --exclude=.next --exclude=.env --exclude=.env.* --exclude=*.log --exclude=.DS_Store --exclude=.git'
# shellcheck disable=SC2086
rsync -a --delete $COMMON "$SRC/backend/" "$DEST/backend/"
# shellcheck disable=SC2086
rsync -a --delete $COMMON --exclude=README.md "$SRC/frontend/" "$DEST/frontend/"

# Top-level files: the self-host compose file, env template, scripts, README (from selfhost/)
for f in docker-compose.yml Caddyfile setup.sh backup.sh README.md .env.example .gitignore; do
  cp "$SRC/selfhost/$f" "$DEST/$f"
done
mkdir -p "$DEST/docs"
cp "$SRC/docs/ARCHITECTURE.md" "$DEST/docs/ARCHITECTURE.md"
cp "$SRC/LICENSE" "$DEST/LICENSE"
chmod +x "$DEST/setup.sh" "$DEST/backup.sh"

COMMIT=$(git -C "$SRC" rev-parse --short HEAD 2>/dev/null || echo unknown)
printf 'Generated from cp-leaderboard commit %s on %s\n' "$COMMIT" "$(date -u +%Y-%m-%d)" > "$DEST/.selfhost-package"
echo "Self-host package written to $DEST (source commit $COMMIT)"

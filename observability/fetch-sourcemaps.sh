#!/bin/sh
# Copies the running frontend's source maps into observability/sourcemaps/, where Alloy reads them
# to turn minified stack traces back into source. Run it after every frontend rebuild: the file
# names contain a content hash, so a new build needs new maps. Then no restart is needed.
#
#   observability/fetch-sourcemaps.sh [frontend-url]
set -eu
URL="${1:-http://localhost:8080}"
DIR="$(cd "$(dirname "$0")" && pwd)/sourcemaps"
mkdir -p "$DIR"
rm -f "$DIR"/*.map

assets=$(curl -fsS "$URL/" | grep -o '/assets/[^"]*\.js' | sort -u)
[ -n "$assets" ] || { echo "No JS assets found at $URL - is the frontend running?" >&2; exit 1; }
for a in $assets; do
  name=$(basename "$a")
  curl -fsS "$URL$a.map" -o "$DIR/$name.map" && echo "fetched $name.map"
done

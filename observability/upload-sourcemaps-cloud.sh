#!/bin/sh
# Uploads the running frontend's source maps to Grafana Cloud (Frontend Observability), so errors
# there show original file names and lines instead of minified ones. Needs gcx, logged in.
# Run it after every frontend rebuild: the maps belong to one build, identified by a bundle ID
# (the hash in the main script's file name, also served in /config.js and sent by Faro).
#
# Uploading needs a Cloud access policy token with the sourcemaps:read, sourcemaps:write and
# sourcemaps:delete scopes (gcx's own login token can't upload). Put it in .env.cloud as
# FARO_SOURCEMAP_TOKEN=glc_... and this script passes it to gcx (as GRAFANA_CLOUD_TOKEN).
#
#   observability/upload-sourcemaps-cloud.sh [frontend-url] [app-name]
set -eu
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
token=$(grep -E '^FARO_SOURCEMAP_TOKEN=' "$ROOT/.env.cloud" 2>/dev/null | tail -1 | cut -d= -f2- || true)
case "$token" in
  ""|*"<"*) echo "Set FARO_SOURCEMAP_TOKEN in .env.cloud (a Cloud access policy token with sourcemaps scopes)." >&2; exit 1 ;;
esac
export GRAFANA_CLOUD_TOKEN="$token"
URL="${1:-http://localhost:8080}"
APP="${2:-coffee-cart-frontend}"
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

bundle_id=$(curl -fsS "$URL/config.js" | grep -o '"bundleId":"[^"]*"' | cut -d'"' -f4)
[ -n "$bundle_id" ] || { echo "The frontend at $URL has no bundleId - is it running, and rebuilt?" >&2; exit 1; }

assets=$(curl -fsS "$URL/" | grep -o '/assets/[^"]*\.js' | sort -u)
# Lazy chunks (such as the session replay recorder) are not in index.html: find them in the main file.
main=$(echo "$assets" | head -1)
chunks=$(curl -fsS "$URL$main" | grep -o '[A-Za-z0-9_-]*-[A-Za-z0-9_-]\{8\}\.js' | sort -u | sed 's#^#/assets/#')
for a in $(printf '%s\n%s\n' "$assets" "$chunks" | sort -u); do
  name=$(basename "$a")
  curl -fsS "$URL$a.map" -o "$TMP/$name.map" 2>/dev/null || continue
  if ! out=$(gcx frontend apps apply-sourcemap "$APP" -f "$TMP/$name.map" --bundle-id "$bundle_id" 2>&1); then
    echo "upload of $name.map failed:" >&2
    echo "$out" | grep -o '"details":"[^"]*"' | head -1 >&2
    exit 1
  fi
  echo "uploaded $name.map (bundle $bundle_id)"
done

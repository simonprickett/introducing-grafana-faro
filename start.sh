#!/usr/bin/env bash
# Start the coffee cart against the local open source stack, or against Grafana Cloud.
#
#   ./start.sh local     app + local stack (observability/), settings from .env.local
#   ./start.sh cloud     app only, telemetry goes to Grafana Cloud, settings from .env.cloud
#   ./start.sh stop      stop the app (the local stack is left running)
#
# The two settings files are git ignored. Examples: .env.local.example and .env.cloud.example.
#
# Both modes also deal with source maps, so stack traces are readable: local mode copies them for
# Alloy, and cloud mode uploads them to Grafana Cloud (if FARO_SOURCEMAP_TOKEN is set in .env.cloud).
set -euo pipefail
cd "$(dirname "$0")"

usage() { sed -n '2,11p' "$0" | sed 's/^# \{0,1\}//'; exit "${1:-1}"; }

mode="${1:-}"
case "$mode" in
  local|cloud|stop) ;;
  -h|--help) usage 0 ;;
  *) usage 1 ;;
esac

if [ "$mode" = "stop" ]; then
  docker compose down
  exit 0
fi

env_file=".env.$mode"

if [ ! -f "$env_file" ]; then
  if [ "$mode" = "local" ]; then
    cp .env.local.example "$env_file"
    echo "Created $env_file from .env.local.example"
  else
    echo "Missing $env_file."
    echo "Copy .env.cloud.example to $env_file and fill in the values marked REQUIRED."
    exit 1
  fi
fi

if [ "$mode" = "cloud" ]; then
  # Check the required values are filled in. Names only: never print the values (they are secrets).
  missing=""
  for name in FARO_URL OTEL_EXPORTER_OTLP_ENDPOINT OTEL_EXPORTER_OTLP_HEADERS; do
    value=$(grep -E "^$name=" "$env_file" | tail -1 | cut -d= -f2- || true)
    case "$value" in
      ""|*"<"*) missing="$missing $name" ;;
    esac
  done
  if [ -n "$missing" ]; then
    echo "$env_file still needs a value for:$missing"
    exit 1
  fi
  # A common slip: pasting the raw access token (glc_...) instead of base64 of "instanceID:token".
  if grep -qE '^OTEL_EXPORTER_OTLP_HEADERS=Authorization=Basic[[:space:]]+glc_' "$env_file"; then
    echo "OTEL_EXPORTER_OTLP_HEADERS in $env_file holds the raw token."
    echo "It must be base64 of instanceID:token, e.g. printf 'ID:TOKEN' | base64"
    exit 1
  fi
fi

if [ "$mode" = "local" ]; then
  docker compose -f observability/docker-compose.yml up -d
fi

# Building checks Docker Hub for newer base images, so it needs internet. Any HTTP answer from the
# registry (even a 401) means we are online. With no answer, skip the build and use the last one.
if curl -s -m 4 -o /dev/null https://registry-1.docker.io/v2/; then
  online=yes
else
  online=""
fi

if [ -n "$online" ]; then
  if ! docker compose --env-file "$env_file" up -d --build; then
    # Online, but the build failed (a real problem, or flaky wifi). Use the last build if there is one.
    echo
    echo "!! The build failed (see above). Trying the images that are already built..."
    echo "!! If you changed the app's code since the last successful build, this is the OLD code."
    if ! docker compose --env-file "$env_file" up -d --no-build; then
      echo "There is no earlier build to use. Fix the build error above and run this again."
      exit 1
    fi
  fi
else
  echo "No internet: skipping the build and using the last build of the app."
  echo "(If you changed the app's code since then, rebuild once with internet.)"
  if ! docker compose --env-file "$env_file" up -d --no-build; then
    echo "There is no earlier build to use. Run this once with internet to build the app."
    exit 1
  fi
fi

if [ "$mode" = "cloud" ]; then
  # Upload this build's source maps, so errors in Grafana Cloud show original files and lines.
  # The bundle ID changes with every frontend build, so this is needed after each rebuild.
  token=$(grep -E '^FARO_SOURCEMAP_TOKEN=' "$env_file" | tail -1 | cut -d= -f2- || true)
  case "$token" in
    ""|*"<"*)
      echo "Skipping the source map upload: FARO_SOURCEMAP_TOKEN is not set in $env_file."
      ;;
    *)
      echo "Uploading source maps to Grafana Cloud..."
      ready=""
      for _ in 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15; do
        if curl -fsS http://localhost:8080/config.js >/dev/null 2>&1; then ready=yes; break; fi
        sleep 1
      done
      if [ -z "$ready" ]; then
        echo "The frontend isn't answering yet, so the source maps were not uploaded."
        echo "Run observability/upload-sourcemaps-cloud.sh once it is up."
      elif ! observability/upload-sourcemaps-cloud.sh; then
        echo "The source map upload failed. The app is running; errors in Cloud will be minified."
        echo "Fix the problem above and run observability/upload-sourcemaps-cloud.sh."
      fi
      ;;
  esac
fi

if [ "$mode" = "local" ]; then
  # Copy this build's source maps where Alloy reads them, so stack traces in the local dashboards
  # are readable. The file names change with every frontend build, so this is needed after each one.
  ready=""
  for _ in 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15; do
    if curl -fsS http://localhost:8080/ >/dev/null 2>&1; then ready=yes; break; fi
    sleep 1
  done
  if [ -z "$ready" ]; then
    echo "The frontend isn't answering yet, so the local source maps were not fetched."
    echo "Run observability/fetch-sourcemaps.sh once it is up."
  elif ! observability/fetch-sourcemaps.sh; then
    echo "Fetching the source maps failed. The app is running; local stack traces will be minified."
    echo "Run observability/fetch-sourcemaps.sh once the problem is fixed."
  fi
fi

echo
echo "Running in $mode mode (settings from $env_file)."
echo "  App:      http://localhost:8080"
if [ "$mode" = "local" ]; then
  echo "  Grafana:  http://localhost:3001"
else
  echo "  Telemetry is going to Grafana Cloud. Open your stack's Grafana to see it."
fi

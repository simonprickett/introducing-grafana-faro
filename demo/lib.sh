# Shared helpers for the demo scripts (hello.sh, local.sh, cloud.sh). Sourced, not run.
#
# Each demo script starts what its part of the talk needs, prints the URLs, then waits. Ctrl-C
# stops everything that script started. Written for the bash 3.2 that ships with macOS.

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

# The local stack: Grafana (LGTM) and Alloy.
stack() { docker compose -f observability/docker-compose.yml "$@"; }

say() { printf '\n%s\n' "$*"; }

# Docker has to be running. If it isn't, try to start Docker Desktop and wait for it.
require_docker() {
  docker info >/dev/null 2>&1 && return 0
  echo "Docker isn't running."
  if [ "$(uname)" = "Darwin" ] && open -a Docker 2>/dev/null; then
    echo "Starting Docker Desktop (waiting up to 2 minutes)..."
    for _ in $(seq 1 60); do
      docker info >/dev/null 2>&1 && return 0
      sleep 2
    done
  fi
  echo "Docker still isn't running. Start Docker Desktop and run this again."
  exit 1
}

# Wait until a URL answers at all (any HTTP status counts). wait_for "Grafana" http://localhost:3001/api/health
wait_for() {
  local name="$1" url="$2" code
  printf 'Waiting for %s' "$name"
  for _ in $(seq 1 90); do
    code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 2 "$url" || true)
    if [ -n "$code" ] && [ "$code" != "000" ]; then
      echo " - up"
      return 0
    fi
    printf '.'
    sleep 1
  done
  echo " - not answering after 90 seconds"
  return 1
}

# Parse the shared flags. Sets KEEP_STACK=1 for --keep-stack. Usage: parse_flags "$@"
KEEP_STACK=""
parse_flags() {
  for arg in "$@"; do
    case "$arg" in
      --keep-stack) KEEP_STACK=1 ;;
      -h|--help) usage; exit 0 ;;
      *) echo "Unknown option: $arg"; usage; exit 1 ;;
    esac
  done
}

# Stop the local stack, unless --keep-stack was given.
stop_stack() {
  if [ -n "$KEEP_STACK" ]; then
    echo "Leaving Grafana and Alloy running (--keep-stack). Stop them with:"
    echo "  docker compose -f observability/docker-compose.yml down"
  else
    echo "Stopping Grafana and Alloy..."
    stack down
  fi
}

# Call after defining a cleanup() function. Ctrl-C (or any failure while starting) runs cleanup
# once, then exits.
install_cleanup() {
  CLEANED=""
  trap 'exit 0' INT TERM
  trap '_finish' EXIT
}
_finish() {
  local code=$?
  [ -n "$CLEANED" ] && return
  CLEANED=1
  trap '' INT TERM   # a second Ctrl-C must not interrupt the cleanup
  say "Stopping..."
  cleanup || echo "(something didn't stop cleanly: check docker ps)"
  say "Stopped."
  exit "$code"
}

# Sit here until Ctrl-C.
wait_for_ctrl_c() {
  say "Press Ctrl-C to stop."
  while true; do sleep 1; done
}

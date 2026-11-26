#!/usr/bin/env bash
# Setup 1: the hello world page and Grafana, fully local. No coffee cart.
#
#   demo/hello.sh                 start Grafana, Alloy and the hello page; Ctrl-C stops them all
#   demo/hello.sh --keep-stack    on Ctrl-C leave Grafana and Alloy running (a faster start for
#                                 the next part)
set -euo pipefail
SELF="$(cd "$(dirname "$0")" && pwd)/$(basename "$0")"
source "$(dirname "$0")/lib.sh"

usage() { sed -n '2,6p' "$SELF" | sed 's/^# \{0,1\}//'; }
parse_flags "$@"

HELLO_PID=""
cleanup() {
  if [ -n "$HELLO_PID" ]; then
    echo "Stopping the hello page..."
    kill "$HELLO_PID" 2>/dev/null || true
  fi
  stop_stack
}

if lsof -iTCP:8081 -sTCP:LISTEN >/dev/null 2>&1; then
  echo "Something is already using port 8081 (an old hello server?). Stop it, then run this again:"
  echo "  kill \$(lsof -ti :8081)"
  exit 1
fi

require_docker

# From here on, Ctrl-C (or a failure) stops what this script started.
install_cleanup
say "Starting Grafana and Alloy..."
stack up -d
python3 -m http.server 8081 --bind 127.0.0.1 --directory hello >/dev/null 2>&1 &
HELLO_PID=$!

wait_for "Grafana" http://localhost:3001/api/health
wait_for "Alloy's Faro receiver" http://localhost:12347/
wait_for "the hello page" http://localhost:8081/

say "Hello world is ready."
echo "  Hello page       http://localhost:8081"
echo "  Hello dashboard  http://localhost:3001/d/faro-hello"
wait_for_ctrl_c

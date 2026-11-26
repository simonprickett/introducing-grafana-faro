#!/usr/bin/env bash
# Setup 3: the coffee cart sending to Grafana Cloud, for session replay. No local stack.
#
#   demo/cloud.sh                 start the coffee cart against Cloud; Ctrl-C stops it
set -euo pipefail
SELF="$(cd "$(dirname "$0")" && pwd)/$(basename "$0")"
source "$(dirname "$0")/lib.sh"

usage() { sed -n '2,4p' "$SELF" | sed 's/^# \{0,1\}//'; }
parse_flags "$@"

cleanup() {
  echo "Stopping the coffee cart..."
  ./start.sh stop
}
require_docker

# From here on, Ctrl-C (or a failure) stops what this script started.
install_cleanup
./start.sh cloud   # the app, pointed at Cloud, and it uploads the source maps

wait_for "the coffee cart" http://localhost:8080/

say "The Cloud coffee cart is ready."
echo "  Coffee cart             http://localhost:8080  (a new tab is a new session)"
echo "  Frontend Observability  https://simonprickett.grafana.net"
echo
echo "Replays take a few minutes to process. Stopping the app does not stop a replay playing."
wait_for_ctrl_c

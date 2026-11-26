#!/usr/bin/env bash
# Setup 2: the coffee cart and Grafana, fully local, with the Alloy UI.
#
#   demo/local.sh                 start Grafana, Alloy and the coffee cart; Ctrl-C stops them all
#   demo/local.sh --keep-stack    on Ctrl-C leave Grafana and Alloy running (a faster start for
#                                 the next part)
set -euo pipefail
SELF="$(cd "$(dirname "$0")" && pwd)/$(basename "$0")"
source "$(dirname "$0")/lib.sh"

usage() { sed -n '2,6p' "$SELF" | sed 's/^# \{0,1\}//'; }
parse_flags "$@"

cleanup() {
  echo "Stopping the coffee cart..."
  ./start.sh stop
  stop_stack
}
require_docker

# From here on, Ctrl-C (or a failure) stops what this script started.
install_cleanup
./start.sh local   # the stack and the app, and it fetches the source maps

wait_for "Grafana" http://localhost:3001/api/health
wait_for "the coffee cart" http://localhost:8080/
wait_for "Alloy's Faro receiver" http://localhost:12347/
wait_for "the Alloy UI" http://localhost:12345/

say "The local coffee cart is ready."
echo "  Coffee cart         http://localhost:8080"
echo "  Frontend dashboard  http://localhost:3001/d/coffee-cart-frontend"
echo "  Story dashboard     http://localhost:3001/d/coffee-cart-faro"
echo "  Alloy UI            http://localhost:12345  (loki.process.faro, then Live debugging)"

stock=$(grep -E '^PRODUCT_STOCK=' .env.local 2>/dev/null | tail -1 | cut -d= -f2- || true)
if [ -z "$stock" ]; then
  say "Note: PRODUCT_STOCK is empty in .env.local, so each product has 25 in stock."
  echo "Set PRODUCT_STOCK=1000 and run this again before using the traffic generator."
fi
wait_for_ctrl_c

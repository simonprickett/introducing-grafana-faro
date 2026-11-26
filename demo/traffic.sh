#!/usr/bin/env bash
# Synthetic traffic and errors for the local coffee cart. Start demo/local.sh first, in another terminal.
#
#   demo/traffic.sh                  the showcase: normal, heavy, errors, recovery (about 10 minutes)
#   demo/traffic.sh normal           healthy traffic only (also: heavy, errors; each runs 10 minutes)
#   demo/traffic.sh errors --duration 3m     extra options go to the generator
#                                            (--duration, --scale, --visitors, --headed)
#   demo/traffic.sh errors --cloud   send to Grafana Cloud instead, when demo/cloud.sh is running
#                                    (for preparing sessions and errors; it refuses without --cloud)
#
# Ctrl-C stops early: current visits finish (a few seconds), then the backend failures are reset.
set -euo pipefail
SELF="$(cd "$(dirname "$0")" && pwd)/$(basename "$0")"
source "$(dirname "$0")/lib.sh"

usage() { sed -n '2,10p' "$SELF" | sed 's/^# \{0,1\}//'; }

profile=showcase
case "${1:-}" in
  -h|--help) usage; exit 0 ;;
  showcase|normal|heavy|errors) profile="$1"; shift ;;
esac

# --cloud is ours, not the generator's: it says the app is meant to be in Cloud mode.
cloud=""
rest=()
for a in "$@"; do
  if [ "$a" = "--cloud" ]; then cloud=1; else rest+=("$a"); fi
done
set -- ${rest[@]+"${rest[@]}"}

APP=http://localhost:8080
API=http://localhost:3000

# --- Checks, before anything is changed ---------------------------------------------------------
command -v node >/dev/null || { echo "Node.js isn't installed (the traffic generator needs it)."; exit 1; }

config=$(curl -fsS --max-time 3 "$APP/config.js" 2>/dev/null) || {
  echo "The coffee cart isn't answering at $APP. Start it first, in another terminal:"
  echo "  demo/local.sh"
  exit 1
}
if printf '%s' "$config" | grep -q 'localhost:12347'; then
  if [ -n "$cloud" ]; then
    echo "--cloud was given, but the coffee cart is in local mode. Start demo/cloud.sh (Ctrl-C demo/local.sh first)."
    exit 1
  fi
elif [ -z "$cloud" ]; then
  echo "The coffee cart is running, but not in local mode: its Faro URL isn't the local Alloy."
  echo "This sends synthetic visitors, so it won't go to Grafana Cloud unless you say so."
  echo "For the local demo: Ctrl-C demo/cloud.sh and start demo/local.sh."
  echo "To send to Cloud on purpose (preparing sessions and errors): demo/traffic.sh $profile --cloud"
  exit 1
fi

if [ -z "$cloud" ] && ! curl -fsS --max-time 3 -o /dev/null http://localhost:3001/api/health 2>/dev/null; then
  echo "Note: Grafana isn't answering on :3001, so phase markers won't show on the dashboards."
fi

if [ -z "$cloud" ]; then
stock=$(grep -E '^PRODUCT_STOCK=' .env.local 2>/dev/null | tail -1 | cut -d= -f2- || true)
if [ -z "$stock" ]; then
  echo "Note: PRODUCT_STOCK is empty in .env.local, so products have 25 in stock and will sell out."
  echo "      Set PRODUCT_STOCK=1000 and run demo/local.sh again for a long run."
fi
fi

# First run only: install the generator's packages and its Chromium (fast when already done).
if [ ! -d traffic/node_modules ]; then
  say "First run: installing the traffic generator's packages..."
  (cd traffic && npm install --silent)
fi
(cd traffic && npm run --silent setup) >/dev/null 2>&1 || {
  echo "Couldn't set up Chromium for the generator. Try by hand, to see the error:"
  echo "  cd traffic && npm run setup"
  exit 1
}

# --- Run ----------------------------------------------------------------------------------------
# The generator resets the backend's injected failures itself when it ends. This is the safety net
# for when it doesn't get the chance (a second Ctrl-C, or it was killed).
cleanup() {
  curl -fsS --max-time 3 -X DELETE "$API/api/chaos" >/dev/null 2>&1 \
    && echo "Backend failures reset." \
    || echo "(couldn't reach the API to reset failures: restart it with 'docker compose restart backend' if checkout misbehaves)"
}
install_cleanup

say "Sending '$profile' traffic to $APP"
if [ "$profile" = "showcase" ]; then
  echo "  0-3 min normal, 3-5 min heavy, 5-8 min errors, 8-10 min recovery"
fi
if [ -n "$cloud" ]; then
  echo "  Going to Grafana Cloud. Look in Frontend Observability."
else
  echo "  Dashboards: http://localhost:3001/d/coffee-cart-frontend and /d/coffee-cart-faro"
fi
echo "  Ctrl-C stops early."
echo

(cd traffic && node generate.mjs "$profile" "$@")
say "Traffic finished."

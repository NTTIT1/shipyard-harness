#!/usr/bin/env bash
# LiteLLM gateway: an Anthropic-compatible endpoint for every non-Claude provider
# configured on the dashboard (config/providers.json). run-step.sh points a
# headless `claude -p` at it when a pipeline step is assigned such a model.
#   gateway.sh start|stop|restart|status
set -euo pipefail
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/_common.sh"
CODE_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
IMAGE="${GATEWAY_IMAGE:-ghcr.io/berriai/litellm:v1.102.0}"
NAME="${GATEWAY_CONTAINER:-shipyard-gateway}"
PORT="${GATEWAY_PORT:-4000}"
GW_DIR="$HARNESS_ROOT/run/gateway"
healthy() { curl -fsS -m 2 "http://127.0.0.1:$PORT/health/liveliness" >/dev/null 2>&1; }

case "${1:-status}" in
  start)
    node "$CODE_ROOT/dashboard/server/bin/render-gateway.js" "$GW_DIR"
    docker rm -f "$NAME" >/dev/null 2>&1 || true
    docker run -d --name "$NAME" --restart unless-stopped \
      -p "127.0.0.1:$PORT:4000" --add-host=host.docker.internal:host-gateway \
      --env-file "$GW_DIR/gateway.env" -v "$GW_DIR/litellm.yaml:/app/config.yaml:ro" \
      "$IMAGE" --config /app/config.yaml --port 4000 >/dev/null
    for _ in $(seq 1 90); do
      healthy && { echo "harness: gateway up on 127.0.0.1:$PORT"; exit 0; }
      sleep 1
    done
    die "gateway did not become healthy — see: docker logs $NAME"
    ;;
  stop) docker rm -f "$NAME" >/dev/null 2>&1 || true; echo "harness: gateway stopped" ;;
  restart) "$0" stop; exec "$0" start ;;
  status) if healthy; then echo up; else echo down; exit 1; fi ;;
  *) die "usage: gateway.sh start|stop|restart|status" ;;
esac

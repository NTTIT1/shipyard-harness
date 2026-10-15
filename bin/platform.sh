#!/usr/bin/env bash
# Shipyard Platform launcher (Linux). Mirrors bin/platform.ps1.
#   platform.sh infra-up|infra-down|build|start|stop|restart|status
set -euo pipefail
HARNESS_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PLATFORM_DIR="$HARNESS_ROOT/platform"
RUN_DIR="$HARNESS_ROOT/run/platform"; LOG_DIR="$HARNESS_ROOT/logs/platform"
mkdir -p "$RUN_DIR" "$LOG_DIR"
# JWT_SECRET / SHIPYARD_SERVICE_TOKEN / ADMIN_* come from the harness secrets file when present.
[ -f "$HARNESS_ROOT/config/secrets.env" ] && set -a && . "$HARNESS_ROOT/config/secrets.env" && set +a
export PG_PORT="${PG_PORT:-5434}" REDIS_PORT="${REDIS_PORT:-6380}"
SERVICES=("auth-service:9081" "project-service:9082" "lane-service:9083" "orchestrator-service:9084" "api-gateway:9080")
DBS=(auth_db project_db lane_db orchestrator_db llm_db artifact_db audit_db context_db)

jar_of() { echo "$PLATFORM_DIR/$1/target/$1-1.0.0-SNAPSHOT.jar"; }
running() { [ -f "$RUN_DIR/$1.pid" ] && kill -0 "$(cat "$RUN_DIR/$1.pid")" 2>/dev/null; }

infra_up() {
  docker compose -f "$PLATFORM_DIR/docker-compose.yml" up -d
  # A fresh volume restarts Postgres once after init — require 3 consecutive ready checks.
  local ok=0
  for _ in $(seq 1 60); do
    if docker exec shipyard-postgres psql -U postgres -tAc "SELECT 1" >/dev/null 2>&1; then ok=$((ok+1)); else ok=0; fi
    [ "$ok" -ge 3 ] && break; sleep 1
  done
  # init-databases.sql only runs on an empty volume — create any DB added later.
  for db in "${DBS[@]}"; do
    docker exec shipyard-postgres psql -U postgres -tAc "SELECT 1 FROM pg_database WHERE datname='$db'" | grep -q 1 \
      || docker exec shipyard-postgres psql -U postgres -c "CREATE DATABASE $db" >/dev/null
  done
}

start_one() {
  local name="${1%%:*}" port="${1##*:}"
  if running "$name"; then echo "$name already running (pid $(cat "$RUN_DIR/$name.pid"))"; return; fi
  [ -f "$(jar_of "$name")" ] || mvn -q -f "$PLATFORM_DIR/pom.xml" package -DskipTests
  nohup java -jar "$(jar_of "$name")" >"$LOG_DIR/$name.log" 2>&1 &
  echo $! >"$RUN_DIR/$name.pid"; echo "started $name on :$port (pid $!)"
}

stop_one() {
  local name="${1%%:*}"
  if running "$name"; then kill "$(cat "$RUN_DIR/$name.pid")"; echo "stopped $name"; fi
  rm -f "$RUN_DIR/$name.pid"
}

# Five JVMs booting together take a while — poll every port for up to 3 minutes.
wait_up() {
  for _ in $(seq 1 90); do
    local down=0
    for s in "${SERVICES[@]}"; do (exec 3<>"/dev/tcp/127.0.0.1/${s##*:}") 2>/dev/null || down=1; done
    [ "$down" = 0 ] && return 0; sleep 2
  done
}

status() {
  for s in "${SERVICES[@]}"; do
    local name="${s%%:*}" port="${s##*:}" up=DOWN
    (exec 3<>"/dev/tcp/127.0.0.1/$port") 2>/dev/null && up=UP
    printf '%-22s :%s  %-4s %s\n' "$name" "$port" "$up" "$(running "$name" && cat "$RUN_DIR/$name.pid" || echo -)"
  done
}

case "${1:-status}" in
  infra-up) infra_up ;;
  infra-down) docker compose -f "$PLATFORM_DIR/docker-compose.yml" down ;;
  build) mvn -f "$PLATFORM_DIR/pom.xml" clean package -DskipTests ;;
  start) infra_up; for s in "${SERVICES[@]}"; do start_one "$s"; done; wait_up; status ;;
  stop) for s in "${SERVICES[@]}"; do stop_one "$s"; done ;;
  restart) for s in "${SERVICES[@]}"; do stop_one "$s"; done; sleep 2; for s in "${SERVICES[@]}"; do start_one "$s"; done ;;
  status) status ;;
  *) echo "usage: platform.sh infra-up|infra-down|build|start|stop|restart|status" >&2; exit 2 ;;
esac

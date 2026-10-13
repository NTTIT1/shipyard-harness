#!/usr/bin/env bash
# gateway.sh: renders config from providers.json and runs LiteLLM bound to loopback.
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"
setup_temp_harness; trap teardown_temp_harness EXIT

FAKEBIN="$TMPH/fakebin"; mkdir -p "$FAKEBIN"
cat > "$FAKEBIN/docker" <<'EOF'
#!/usr/bin/env bash
echo "$*" >> "$HARNESS_ROOT/docker.log"
EOF
cat > "$FAKEBIN/curl" <<'EOF'
#!/usr/bin/env bash
exit 0
EOF
chmod +x "$FAKEBIN/docker" "$FAKEBIN/curl"
export PATH="$FAKEBIN:$PATH"

cat > "$HARNESS_ROOT/config/providers.json" <<'EOF'
{"providers":{"openai":{"api_key":"sk-abc","models":["gpt-x"]}},"gateway_key":"sk-gw-test"}
EOF

OUT="$(bash "$REPO/bin/gateway.sh" start 2>&1)"
assert_contains "$OUT" "gateway up on 127.0.0.1:4000" "start reports healthy"
RUNLINE="$(grep '^run ' "$HARNESS_ROOT/docker.log")"
assert_contains "$RUNLINE" "-p 127.0.0.1:4000:4000" "binds loopback only"
assert_contains "$RUNLINE" "--env-file $HARNESS_ROOT/run/gateway/gateway.env" "keys passed via env-file"
assert_contains "$RUNLINE" "ghcr.io/berriai/litellm:v1.102.0" "pinned image"
assert_eq "600" "$(stat -c %a "$HARNESS_ROOT/run/gateway/gateway.env")" "env file is 600"
assert_contains "$(cat "$HARNESS_ROOT/run/gateway/litellm.yaml")" 'model_name: "openai/gpt-x"' "yaml rendered"
assert_eq "up" "$(bash "$REPO/bin/gateway.sh" status)" "status up when health answers"

finish

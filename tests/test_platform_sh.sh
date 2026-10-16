#!/usr/bin/env bash
# bin/platform.sh: an unavailable Ollama degrades memory search, it never blocks the platform.
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"
setup_temp_harness; trap teardown_temp_harness EXIT
mkdir -p "$TMPH/fakebin"
printf '#!/usr/bin/env bash\nexit 1\n' > "$TMPH/fakebin/docker"
printf '#!/usr/bin/env bash\nexit 7\n' > "$TMPH/fakebin/curl"
chmod +x "$TMPH/fakebin/docker" "$TMPH/fakebin/curl"

out="$(PATH="$TMPH/fakebin:$PATH" OLLAMA_URL=http://127.0.0.1:9 SHIPYARD_SERVICE_TOKEN=t bash "$REPO/bin/platform.sh" ollama 2>&1)"; rc=$?
assert_eq "0" "$rc" "ollama step exits 0 when Ollama cannot be started"
assert_contains "$out" "memory search will run degraded" "warns that memory search degrades"
finish

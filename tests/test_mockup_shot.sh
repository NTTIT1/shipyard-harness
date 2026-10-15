#!/usr/bin/env bash
# mockup-shot.sh renders HTML mockups to PNG via headless Chrome (CHROME_BIN override).
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"
setup_temp_harness; trap teardown_temp_harness EXIT
mkdir -p "$TMPH/fakebin" "$TMPH/m"
cat > "$TMPH/fakebin/chrome" <<'EOF'
#!/usr/bin/env bash
printf '%s\n' "$@" > "$HARNESS_ROOT/chrome.args"
for a in "$@"; do case "$a" in --screenshot=*) printf 'PNG' > "${a#--screenshot=}";; esac; done
EOF
chmod +x "$TMPH/fakebin/chrome"
echo '<h1>Danh sách</h1>' > "$TMPH/m/01-list.html"

out="$(CHROME_BIN="$TMPH/fakebin/chrome" bash "$REPO/bin/mockup-shot.sh" "$TMPH/m/01-list.html" "$TMPH/m/out/01-list-mobile.png" 390x844)"; rc=$?
assert_eq "0" "$rc" "renders with exit 0"
assert_eq "$TMPH/m/out/01-list-mobile.png" "$out" "prints the absolute PNG path"
A="$(cat "$HARNESS_ROOT/chrome.args")"
assert_contains "$A" "--window-size=390,844" "passes the viewport"
assert_contains "$A" "file://$TMPH/m/01-list.html" "loads the mockup as a file URL"
assert_contains "$A" "--headless" "runs headless"

CHROME_BIN="$TMPH/fakebin/chrome" bash "$REPO/bin/mockup-shot.sh" "$TMPH/m/missing.html" "$TMPH/m/x.png" >/dev/null 2>&1
assert_eq "64" "$?" "missing HTML is a usage error"
CHROME_BIN="$TMPH/fakebin/chrome" bash "$REPO/bin/mockup-shot.sh" "$TMPH/m/01-list.html" "$TMPH/m/x.png" big >/dev/null 2>&1
assert_eq "64" "$?" "bad size is a usage error"
printf '#!/usr/bin/env bash\nexit 0\n' > "$TMPH/fakebin/chrome"
CHROME_BIN="$TMPH/fakebin/chrome" bash "$REPO/bin/mockup-shot.sh" "$TMPH/m/01-list.html" "$TMPH/m/y.png" >/dev/null 2>&1
assert_eq "2" "$?" "no image produced exits 2"
finish

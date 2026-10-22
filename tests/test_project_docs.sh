#!/usr/bin/env bash
# What humans approved before any code (studio: docs/product-brief.md, docs/architecture.md,
# docs/design/ mockups) is handed to every pipeline step as the standard to follow (bin/project_docs.py).
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"
setup_temp_harness; trap 'teardown_temp_harness' EXIT

L="$LANES_ROOT/lane2"
mkdir -p "$L/specs/f1" "$TMPH/fakebin"
pd() { python3 "$REPO/bin/project_docs.py" "$L" "$1"; }

# 1. a repo without approved docs: nothing is added
assert_eq "" "$(pd dev)" "no docs -> no section"

# 2. brief + architecture only: no mockup rules
mkdir -p "$L/docs"; echo "# Brief" > "$L/docs/product-brief.md"; echo "# Arch" > "$L/docs/architecture.md"
out="$(pd dev)"
assert_contains "$out" "docs/product-brief.md" "brief listed"
assert_contains "$out" "docs/architecture.md" "architecture listed"
assert_eq "0" "$(printf '%s' "$out" | grep -c mockup)" "no mockup rules without mockups"

# 3. approved UI: each step gets its own rule, mockups listed with their titles
mkdir -p "$L/docs/design/mockups"; echo "# Design" > "$L/docs/design/design.md"
printf '<html><head><title>Sơ đồ bàn &amp; order</title></head></html>' > "$L/docs/design/mockups/02-so-do-ban.html"
assert_contains "$(pd design)" "không vẽ lại từ đầu" "designer reuses approved mockups"
assert_contains "$(pd design)" "02-so-do-ban.html\` — Sơ đồ bàn & order" "mockup listed with its title"
assert_contains "$(pd dev)" "làm GIỐNG mockup đã duyệt" "dev builds to the mockups"
assert_contains "$(pd qc-local)" "so từng màn hình với mockup" "browser QC compares with mockups"
assert_contains "$(pd plan-critic)" "docs/architecture.md" "sub-steps map to their phase"
assert_eq "" "$(pd ticketer)" "steps without a phase get nothing"

# 4. a project that keeps its documents elsewhere: the repo's .shipyard/docs.json, then the lane profile
mkdir -p "$L/.shipyard" "$L/tai-lieu/man-hinh" "$TMPH/prof"
echo "# YC" > "$L/tai-lieu/yeu-cau.md"; echo png > "$L/tai-lieu/man-hinh/01-trang-chu.png"
printf '{"brief":"tai-lieu/yeu-cau.md","mockups":"tai-lieu/man-hinh"}' > "$L/.shipyard/docs.json"
out="$(pd dev)"
assert_contains "$out" "\`tai-lieu/yeu-cau.md\` — yêu cầu sản phẩm" "repo docs.json moves the brief"
assert_contains "$out" "01-trang-chu.png" "image mockups listed"
assert_contains "$out" "tai-lieu/man-hinh/" "rules point at this project's mockup folder"
assert_eq "0" "$(printf '%s' "$out" | grep -c 'docs/design/mockups')" "default mockup path no longer mentioned"
printf '{"architecture":"tai-lieu/yeu-cau.md","other":["../../etc/passwd","tai-lieu/man-hinh"]}' > "$TMPH/prof/project-docs.json"
out="$(python3 "$REPO/bin/project_docs.py" "$L" arch "$TMPH/prof")"
assert_contains "$out" "\`tai-lieu/yeu-cau.md\` — kiến trúc" "the profile (import form) wins"
assert_eq "0" "$(printf '%s' "$out" | grep -c passwd)" "never a path outside the repo"
# the lane's own profile is found from the lane number (multi-project lanes)
mkdir -p "$HARNESS_ROOT/profiles/du-an-x" "$HARNESS_ROOT/config/lanes"
cp "$TMPH/prof/project-docs.json" "$HARNESS_ROOT/profiles/du-an-x/"
echo 'PROFILE=du-an-x' > "$HARNESS_ROOT/config/lanes/lane2.env"
assert_contains "$(bash "$REPO/bin/project-docs.sh" 2 arch)" "\`tai-lieu/yeu-cau.md\` — kiến trúc" "project-docs.sh uses lane 2's profile"
rm -f "$HARNESS_ROOT/config/lanes/lane2.env"
rm -rf "$L/.shipyard" "$L/tai-lieu"

# 5. run-step.sh hands the section to the headless step
export CLAUDE_BIN="$TMPH/fakebin/claude"
cat > "$CLAUDE_BIN" <<'FAKE'
#!/usr/bin/env bash
printf '%s' "${@: -1}" > "$HARNESS_ROOT/prompt.seen"
echo '{"type":"result","subtype":"success","is_error":false,"result":"ok\nROLE-STEP: DONE design.md"}'
FAKE
chmod +x "$CLAUDE_BIN"
echo "design the screens" > "$TMPH/p.md"
st 2 init >/dev/null; st 2 set spec_dir=specs/f1 >/dev/null
bash "$REPO/bin/run-step.sh" 2 design "$TMPH/p.md" >/dev/null 2>&1; rc=$?
assert_eq "0" "$rc" "design step runs"
assert_contains "$(cat "$HARNESS_ROOT/prompt.seen")" "Tài liệu dự án đã được duyệt" "prompt carries the approved docs"
assert_contains "$(cat "$HARNESS_ROOT/prompt.seen")" "design the screens" "original prompt kept"
finish

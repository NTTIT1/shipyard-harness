#!/usr/bin/env bash
# The lane pipeline after the code (checks, PR, merge, deploy wait, test QC, ticket) resolved by
# bin/delivery.py through bin/lane-env.sh: profile < project default (frozen in the run) < lane override.
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"
setup_temp_harness; trap 'teardown_temp_harness' EXIT

mkdir -p "$HARNESS_ROOT/profiles/testprof" "$LANES_ROOT/lane2"
git -C "$LANES_ROOT/lane2" init -q && git -C "$LANES_ROOT/lane2" remote add origin https://github.com/acme/shop.git
cat > "$HARNESS_ROOT/profiles/testprof/profile.env" <<'P'
INTEGRATION_BRANCH="develop"
P
cat > "$HARNESS_ROOT/profiles/testprof/integrations.env" <<'P'
DEV_QC_ENABLED=1
DEV_SITE_URL="http://test.local"
CI_WAIT_ENABLED=1
CI_DEPLOY_CONTEXT="deploy-dev"
TRACKER_ENABLED=0
P
st 2 init >/dev/null
envof() { bash "$REPO/bin/lane-env.sh" 2 | sed -n "s/^export $1='\(.*\)'$/\1/p"; }
on() { bash "$REPO/bin/lane-env.sh" 2 --check "$1" && echo on || echo off; }

# 1. nothing set on the project or lane: exactly the profile, every check on, a human merges
assert_eq "profile" "$(envof PIPELINE_SOURCE)" "source = profile"
assert_eq "develop" "$(envof PR_BASE)" "PR into the profile's integration branch"
assert_eq "1" "$(envof DEV_QC_ENABLED)" "profile's test QC kept"
assert_eq "http://test.local" "$(envof DEV_SITE_URL)" "profile's test site kept"
assert_eq "1" "$(envof CI_WAIT_ENABLED)" "profile's deploy wait kept"
assert_eq "HUMAN" "$(envof MERGE_MODE)" "a human merges"
for c in ci_gate e2e code_review qc_local senior_gate open_pr dev_qc ci_wait; do assert_eq "on" "$(on $c)" "$c on by default"; done
assert_eq "off" "$(on auto_merge)" "no auto-merge by default"
assert_eq "acme/shop" "$(envof CI_REPO)" "deploy status repo from the lane's origin"

# 2. the project's default, frozen into the run
st 2 set-json delivery '{"e2e":false,"merge":"AUTO","mergeMethod":"MERGE","prBase":"main","deployWait":false,"testQc":true,"testUrl":"http://staging.local","testQcOnFail":"HUMAN","ticket":true}' >/dev/null
assert_eq "project" "$(envof PIPELINE_SOURCE)" "source = project"
assert_eq "off" "$(on e2e)" "project switched e2e off"
assert_eq "on" "$(on auto_merge)" "project: the lane merges when green"
assert_eq "MERGE" "$(envof MERGE_METHOD)" "merge method"
assert_eq "main" "$(envof PR_BASE)" "PR base from the project"
assert_eq "off" "$(on ci_wait)" "project switched the deploy wait off"
assert_eq "http://staging.local" "$(envof DEV_SITE_URL)" "project's test environment"
assert_eq "HUMAN" "$(envof DEV_QC_ON_FAIL)" "test QC failure waits for a human"
assert_eq "on" "$(on tracker)" "project turned the ticket on"

# 3. this lane's override wins; no PR means nothing to merge or verify after it
mkdir -p "$HARNESS_ROOT/config/lanes"
printf '{"openPr":false,"merge":"AUTO","testQc":true,"e2e":true}' > "$HARNESS_ROOT/config/lanes/lane2.pipeline.json"
assert_eq "lane" "$(envof PIPELINE_SOURCE)" "source = lane"
assert_eq "off" "$(on open_pr)" "lane: no PR"
assert_eq "off" "$(on auto_merge)" "no PR -> no merge"
assert_eq "off" "$(on dev_qc)" "no PR -> no test QC after a merge"
assert_eq "on" "$(on e2e)" "lane switched e2e back on"
assert_eq "off" "$(on local_merge)" "no local merge unless asked"
printf '{"openPr":false,"localMerge":true}' > "$HARNESS_ROOT/config/lanes/lane2.pipeline.json"
assert_eq "on" "$(on local_merge)" "local demo: the lane merges on this machine"
printf '{"openPr":true,"localMerge":true}' > "$HARNESS_ROOT/config/lanes/lane2.pipeline.json"
assert_eq "off" "$(on local_merge)" "with a PR there is no local merge"
assert_eq "main" "$(envof PR_BASE)" "untouched keys come from the project"

# every lane script sees the PR target as its integration branch (cut, sync and PR from/into it)
assert_eq "main" "$(bash -c 'source "$1/bin/_common.sh" 2 >/dev/null; echo "$INTEGRATION_BRANCH"' _ "$REPO" 2)" "_common: integration branch = PR target"
rm -f "$HARNESS_ROOT/config/lanes/lane2.pipeline.json"; st 2 set-json delivery '{}' >/dev/null
assert_eq "develop" "$(bash -c 'source "$1/bin/_common.sh" 2 >/dev/null; echo "$INTEGRATION_BRANCH"' _ "$REPO" 2)" "no pipeline set: the profile's branch"
st 2 set-json delivery '{"e2e":false,"merge":"AUTO","mergeMethod":"MERGE","prBase":"main","testQc":true,"testUrl":"http://staging.local","testQcOnFail":"HUMAN","ticket":true}' >/dev/null

# 4. bad values never reach the shell
printf '{"prBase":"--force","testUrl":"x; rm -rf /","deployContext":"$(id)","testQc":true}' > "$HARNESS_ROOT/config/lanes/lane2.pipeline.json"
assert_eq "main" "$(envof PR_BASE)" "bad branch ignored"
assert_eq "http://staging.local" "$(envof DEV_SITE_URL)" "bad URL ignored"
printf 'not json' > "$HARNESS_ROOT/config/lanes/lane2.pipeline.json"
assert_eq "project" "$(envof PIPELINE_SOURCE)" "unreadable override = no override"
finish

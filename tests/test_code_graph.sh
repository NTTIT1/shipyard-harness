#!/usr/bin/env bash
# bin/code-graph.py: modules, APIs, tables, documents and their links from a small repo; standard library only.
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"
T="$(mktemp -d)"; trap 'rm -rf "$T"' EXIT
mkdir -p "$T/src/routes" "$T/src/pages" "$T/docs" "$T/app"
cat > "$T/src/routes/leaves.js" <<'JS'
import { save } from '../store.js';
router.post('/api/leaves', (req, res) => save(req.body));
JS
echo 'export function save() {}' > "$T/src/store.js"
echo 'export default function LeaveListPage() { return null }' > "$T/src/pages/LeaveListPage.jsx"
cat > "$T/app/main.py" <<'PY'
from fastapi import APIRouter
router = APIRouter(prefix="/api/v2")
@router.get("/reports")
def reports(): ...
class Report:
    __tablename__ = "reports"
PY
printf '# Nghỉ phép\nMàn `LeaveListPage` gọi POST /api/leaves.\n' > "$T/docs/leave.md"
out="$(python3 -I "$REPO/bin/code-graph.py" "$T" --report "$T/R.md")"
j() { printf '%s' "$out" | python3 -c 'import json,sys; d=json.load(sys.stdin); print(eval(sys.argv[1]))' "$1"; }
assert_contains "$(j '[n["key"] for n in d["nodes"]]')" "post /api/leaves" "express route is an API"
assert_contains "$(j '[n["key"] for n in d["nodes"]]')" "get /api/v2/reports" "FastAPI route keeps the router prefix"
assert_contains "$(j '[n["id"] for n in d["nodes"] if n["type"]=="TABLE"]')" "TABLE:reports" "SQLAlchemy table"
assert_contains "$(j '[n["id"] for n in d["nodes"] if n["type"]=="SCREEN"]')" "SCREEN:leavelistpage" "page component is a screen"
assert_contains "$(j '[e["from"]+">"+e["to"] for e in d["edges"] if e["type"]=="DEPENDS_ON"]')" "MODULE:src/routes/leaves.js>MODULE:src/store.js" "relative import resolved"
assert_contains "$(j '[e["to"] for e in d["edges"] if e["type"]=="MENTIONS"]')" "API:post /api/leaves" "document mentions the API"
assert_contains "$(j '[e["to"] for e in d["edges"] if e["type"]=="MENTIONS"]')" "MODULE:leavelistpage" "document mentions the screen component"
assert_contains "$(cat "$T/R.md")" "## API (2)" "report lists the APIs"
finish

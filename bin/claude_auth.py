#!/usr/bin/env python3
"""Which account Claude Code runs on (config/providers.json "claude_auth").

  login   (default) the machine's own Claude login — no API key is ever passed.
  api_key use the Anthropic API key from "Nhà cung cấp AI" when there is a usable one; when it fails
          (invalid, out of credit) the run falls back to the login and the key is skipped for an hour.

  claude_auth.py key   <harness_root>          prints the key to use, or nothing (never logged)
  claude_auth.py fail  <harness_root> <reason> remember that the key just failed
  claude_auth.py is-auth-error <text>          exit 0 when the text is a key / billing failure
"""
import json, os, re, sys, time

FAIL_TTL = 3600
# Claude Code's own wording for a bad or empty key (not the task's text: only failed runs are checked).
AUTH_ERR = re.compile(r"invalid (x-)?api.?key|authentication_error|credit balance is too low|API Error: 401", re.I)


def _read(p, dflt):
    try:
        with open(p) as f:
            return json.load(f)
    except Exception:
        return dflt


def fail_path(root):
    return os.path.join(root, "run", "claude_auth_fail.json")


def usable_key(root, now=None):
    doc = _read(os.path.join(root, "config", "providers.json"), {})
    if doc.get("claude_auth") != "api_key":
        return ""
    key = ((doc.get("providers") or {}).get("anthropic") or {}).get("api_key") or ""
    # Claude Code takes workspace-scoped API keys (sk-ant-api…) only.
    if not key.startswith("sk-ant-api"):
        return ""
    failed = _read(fail_path(root), {})
    if failed.get("at") and (now or time.time()) - failed["at"] < FAIL_TTL:
        return ""
    return key


def main(argv):
    cmd = argv[1] if len(argv) > 1 else ""
    if cmd == "key" and len(argv) == 3:
        k = usable_key(argv[2])
        if k:
            sys.stdout.write(k)
        return 0
    if cmd == "fail" and len(argv) >= 3:
        p = fail_path(argv[2])
        os.makedirs(os.path.dirname(p), exist_ok=True)
        with open(p, "w") as f:
            json.dump({"at": time.time(), "reason": (argv[3] if len(argv) > 3 else "")[:300]}, f)
        return 0
    if cmd == "is-auth-error" and len(argv) == 3:
        return 0 if AUTH_ERR.search(argv[2]) else 1
    sys.stderr.write(__doc__)
    return 64


if __name__ == "__main__":
    sys.exit(main(sys.argv))

"""OpenAI-compatible fake LLM (+ LiteLLM health + x-litellm-response-cost) for tests/e2e_openhands.sh."""
import json, sys, time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
LOG = open(sys.argv[2], "a")

class H(BaseHTTPRequestHandler):
    def log_message(self, *a): pass
    def _send(self, code, body):
        b = json.dumps(body).encode()
        self.send_response(code); self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(b))); self.send_header("x-litellm-response-cost", "0.0125"); self.end_headers(); self.wfile.write(b)
    def do_GET(self):
        self._send(200, {"status": "ok"})
    def do_POST(self):
        req = json.loads(self.rfile.read(int(self.headers.get("Content-Length", 0))) or b"{}")
        msgs = req.get("messages", [])
        auth = self.headers.get("Authorization", "")
        LOG.write(json.dumps({"path": self.path, "model": req.get("model"), "auth_ok": auth == "Bearer sk-test-gateway",
                              "n_msgs": len(msgs), "has_rules": "QUY TẮC THỬ" in json.dumps(msgs, ensure_ascii=False),
                              "tools": [t.get("function", {}).get("name") for t in req.get("tools", [])]}, ensure_ascii=False) + "\n"); LOG.flush()
        # argv[3] == "nocommit": claim success without touching the repo (verdict must catch it)
        done = any(m.get("role") == "tool" for m in msgs) or (len(sys.argv) > 3 and sys.argv[3] == "nocommit")
        if done:
            call = {"id": "call_2", "type": "function", "function": {"name": "finish",
                    "arguments": json.dumps({"message": "Implemented hello.txt and committed it. Tests: n/a."})}}
        else:
            cmd = 'echo "hello from openhands" > hello.txt && git add hello.txt && git commit -qm "feat: add hello" && git log --oneline -1'
            call = {"id": "call_1", "type": "function", "function": {"name": "terminal",
                    "arguments": json.dumps({"command": cmd, "summary": "create and commit hello.txt", "security_risk": "LOW"})}}
        self._send(200, {"id": "cmpl-1", "object": "chat.completion", "created": int(time.time()), "model": req.get("model"),
                         "choices": [{"index": 0, "finish_reason": "tool_calls",
                                      "message": {"role": "assistant", "content": None, "tool_calls": [call]}}],
                         "usage": {"prompt_tokens": 1200, "completion_tokens": 80, "total_tokens": 1280}})
ThreadingHTTPServer(("127.0.0.1", int(sys.argv[1])), H).serve_forever()

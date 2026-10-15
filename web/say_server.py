#!/usr/bin/env python3
"""iPad の入力をきらりに渡す小さな受け口。POST / に本文(そのまま)、GET /inbox?since=N で新しい分。127.0.0.1:8790"""
import json, threading, time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
MSGS = []; LOCK = threading.Lock(); STATE = {"at": 0}
class H(BaseHTTPRequestHandler):
    def log_message(self, *a): pass
    def _send(self, code, body, ctype="application/json"):
        b = body.encode("utf-8"); self.send_response(code); self.send_header("Content-Type", ctype + "; charset=utf-8")
        self.send_header("Content-Length", str(len(b))); self.send_header("Access-Control-Allow-Origin", "*"); self.end_headers(); self.wfile.write(b)
    def do_OPTIONS(self):
        self.send_response(204); self.send_header("Access-Control-Allow-Origin", "*"); self.send_header("Access-Control-Allow-Methods", "POST, GET, OPTIONS"); self.send_header("Access-Control-Allow-Headers", "Content-Type"); self.end_headers()
    def do_GET(self):
        if self.path.startswith("/state"):
            with LOCK: return self._send(200, json.dumps(STATE, ensure_ascii=False))
        if self.path.startswith("/inbox"):
            since = 0
            if "since=" in self.path:
                try: since = int(self.path.split("since=")[1].split("&")[0])
                except ValueError: since = 0
            with LOCK: items = [m for m in MSGS if m["id"] > since][-5:]
            return self._send(200, json.dumps({"items": items}, ensure_ascii=False))
        return self._send(200, "ok", "text/plain")
    def do_POST(self):
        n = int(self.headers.get("Content-Length", "0")); raw = self.rfile.read(n).decode("utf-8", "ignore")
        if self.path.startswith("/state"):   # mod から帯の状態(JSON)
            try:
                d = json.loads(raw); d["at"] = time.time()
                with LOCK: STATE.clear(); STATE.update(d)
                return self._send(200, '{"ok":true}')
            except Exception: return self._send(400, '{"error":"bad json"}')
        text = raw.strip()[:200]
        if not text: return self._send(400, '{"error":"empty"}')
        with LOCK:
            mid = (MSGS[-1]["id"] + 1) if MSGS else 1
            MSGS.append({"id": mid, "text": text, "at": time.time()}); del MSGS[:-50]
        return self._send(200, json.dumps({"id": mid}))
ThreadingHTTPServer(("127.0.0.1", 8790), H).serve_forever()

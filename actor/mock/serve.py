"""
Test-only server for the mock game page: serves actor/mock/, `GET /api/world?slug=` from a world file,
and records `POST /api/runs/:id/events` so the runner can be tested without the Vite server.

    python3 actor/mock/serve.py --world fixtures/example-world.v2.json --port 5199
"""

import argparse
import json
import threading
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

HERE = Path(__file__).resolve().parent


def make_server(world_path: Path, port: int = 0) -> ThreadingHTTPServer:
    world = json.loads(Path(world_path).read_text(encoding="utf-8"))
    events = {}

    class Handler(SimpleHTTPRequestHandler):
        def __init__(self, *a, **kw):
            super().__init__(*a, directory=str(HERE), **kw)

        def log_message(self, *args):
            pass

        def _json(self, status, body):
            data = json.dumps(body).encode()
            self.send_response(status)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(data)))
            self.end_headers()
            self.wfile.write(data)

        def do_GET(self):
            path = self.path.split("?")[0]
            if path == "/api/world":
                return self._json(200, world)
            if path == "/api/test/events":
                return self._json(200, events)
            if path == "/":
                self.path = "/index.html"
            return super().do_GET()

        def do_POST(self):
            parts = self.path.split("?")[0].strip("/").split("/")
            if len(parts) == 4 and parts[:2] == ["api", "runs"] and parts[3] == "events":
                body = json.loads(self.rfile.read(int(self.headers.get("Content-Length") or 0)) or b"{}")
                events.setdefault(parts[2], []).extend(body.get("events", []))
                return self._json(200, {"ok": True})
            return self._json(404, {"error": "not found"})

    server = ThreadingHTTPServer(("127.0.0.1", port), Handler)
    server.events = events
    return server


def serve_in_thread(world_path: Path, port: int = 0) -> ThreadingHTTPServer:
    server = make_server(world_path, port)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    return server


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--world", required=True)
    parser.add_argument("--port", type=int, default=5199)
    args = parser.parse_args()
    srv = make_server(Path(args.world), args.port)
    print(f"mock game on http://127.0.0.1:{srv.server_address[1]}/", flush=True)
    srv.serve_forever()

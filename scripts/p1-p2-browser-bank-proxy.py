"""Loopback-only CORS proxy for the isolated MCP browser acceptance fixture.

Forwards browser /customer requests to the disposable bank on port 18088. It
does not store requests, cookies, credentials or responses. Never deploy it.
"""

from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import httpx


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *_args):
        return

    def _handle(self):
        origin = self.headers.get("Origin")
        if origin not in (None, "http://localhost:3003") or not self.path.startswith("/customer/"):
            self.send_error(403)
            return
        if self.command == "OPTIONS":
            self.send_response(204)
            self._cors()
            self.end_headers()
            return
        length = int(self.headers.get("Content-Length", "0"))
        if length > 65536:
            self.send_error(413)
            return
        headers = {key: value for key, value in self.headers.items()
                   if key.lower() not in {"host", "origin", "accept-encoding", "connection", "content-length"}}
        with httpx.Client(timeout=30, follow_redirects=False, trust_env=False) as client:
            response = client.request(self.command, "http://127.0.0.1:18088" + self.path,
                                      headers=headers, content=self.rfile.read(length) if length else None)
        self.send_response(response.status_code)
        for key, value in response.headers.multi_items():
            if key.lower() not in {"transfer-encoding", "content-encoding", "content-length", "connection",
                                   "access-control-allow-origin", "access-control-allow-credentials"}:
                self.send_header(key, value)
        self._cors()
        self.send_header("Content-Length", str(len(response.content)))
        self.end_headers()
        self.wfile.write(response.content)

    def _cors(self):
        self.send_header("Access-Control-Allow-Origin", "http://localhost:3003")
        self.send_header("Access-Control-Allow-Credentials", "true")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, X-XSRF-TOKEN")
        self.send_header("Vary", "Origin")

    do_GET = _handle
    do_POST = _handle
    do_PUT = _handle
    do_DELETE = _handle
    do_OPTIONS = _handle


if __name__ == "__main__":
    ThreadingHTTPServer(("127.0.0.1", 18080), Handler).serve_forever()

# Maya screenshot service: GET /shot?url=https://...  -> real PNG. Public http(s) pages only, view-only.
import http.server, urllib.parse, subprocess, socket, ipaddress, os, uuid, threading, time
HOME = "/home/maya/maya-shot"; lock = threading.Lock()
def public(host):
    try:
        for r in socket.getaddrinfo(host, None):
            ip = ipaddress.ip_address(r[4][0])
            if ip.is_private or ip.is_loopback or ip.is_link_local or ip.is_reserved or ip.is_multicast: return False
        return True
    except Exception: return False
class H(http.server.BaseHTTPRequestHandler):
    def log_message(self, *a): pass
    def out(self, code, ctype, data):
        self.send_response(code); self.send_header("Content-Type", ctype); self.send_header("Content-Length", str(len(data))); self.end_headers(); self.wfile.write(data)
    def do_GET(self):
        u = urllib.parse.urlparse(self.path)
        if u.path != "/shot": return self.out(200, "text/plain", b"usage: /shot?url=https://example.com&full=0")
        q = urllib.parse.parse_qs(u.query); url = (q.get("url") or [""])[0]
        p = urllib.parse.urlparse(url)
        if p.scheme not in ("http", "https") or not p.hostname or not public(p.hostname):
            return self.out(400, "text/plain", b"only public http(s) pages are allowed")
        h = 900
        if (q.get("full") or ["0"])[0] == "1": h = 2400
        f = "%s/%s.png" % (HOME, uuid.uuid4().hex)
        with lock:
            try:
                subprocess.run(["timeout", "60", "/snap/bin/chromium", "--headless=new", "--no-sandbox", "--disable-gpu", "--hide-scrollbars", "--virtual-time-budget=10000",
                    "--window-size=1280,%d" % h, "--user-data-dir=%s/prof" % HOME, "--screenshot=" + f, url], capture_output=True, timeout=75)
            except Exception: pass
        try:
            d = open(f, "rb").read(); os.remove(f)
        except Exception: return self.out(502, "text/plain", b"screenshot failed")
        if not d.startswith(b"\x89PNG") or len(d) < 3000: return self.out(502, "text/plain", b"screenshot failed")
        self.out(200, "image/png", d)
http.server.ThreadingHTTPServer(("172.18.0.1", 8795), H).serve_forever()

import http.server, functools
class H(http.server.SimpleHTTPRequestHandler):
    extensions_map = {**http.server.SimpleHTTPRequestHandler.extensions_map,
        '.apk': 'application/vnd.android.package-archive',
        '.json': 'application/json',
        '.webmanifest': 'application/manifest+json'}
    def end_headers(self):
        if self.path.endswith('.apk'):
            self.send_header('Content-Disposition', 'attachment; filename="maya-1.0.0.apk"')
        super().end_headers()
    def log_message(self, *a): pass
http.server.ThreadingHTTPServer(('127.0.0.1', 8790),
    functools.partial(H, directory='/home/maya/maya-apk/www-root')).serve_forever()

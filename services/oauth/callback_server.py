"""Candidate server. Requires deliberate operator start. No auth-start HTTP route."""
import argparse, http.server, pathlib
from oauth_candidate import Flow, Refused
PATH='/maya-google/oauth/callback'
class Handler(http.server.BaseHTTPRequestHandler):
    server_version='MayaCallback'; sys_version=''
    def log_message(self,*args): pass # query contains an authorization code
    def reply(self,status,text):
        data=text.encode();self.send_response(status)
        for k,v in {'Content-Type':'text/plain; charset=utf-8','Content-Length':str(len(data)),'Cache-Control':'no-store','Pragma':'no-cache','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'none'; frame-ancestors 'none'"}.items():self.send_header(k,v)
        self.end_headers();self.wfile.write(data)
    def do_GET(self):
        if self.path.split('?',1)[0]!=PATH:return self.reply(404,'Not found')
        if self.headers.get('Origin'):return self.reply(403,'Refused')
        try: text=self.server.flow.callback(self.path)
        except Refused as e:return self.reply(400,str(e))
        except Exception:return self.reply(503,'Verification unavailable. Start a fresh consent attempt.')
        self.reply(200,text)
    def do_POST(self):self.reply(405,'Method not allowed')
    do_PUT=do_DELETE=do_PATCH=do_OPTIONS=do_POST
if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--root',required=True);p.add_argument('--client-id-file',required=True);p.add_argument('--client-secret-file',required=True);p.add_argument('--begin',action='store_true');a=p.parse_args()
    flow=Flow(a.root,pathlib.Path(a.client_id_file).read_text().strip(),pathlib.Path(a.client_secret_file).read_text().strip())
    if a.begin:print(flow.begin())
    else:
        server=http.server.ThreadingHTTPServer(('127.0.0.1',18796),Handler);server.flow=flow;server.serve_forever()

import os
import os,sys,json,http.server,urllib.parse
sys.path.insert(0,[p for p in __import__("glob").glob("/home/maya/maya-mcp/gw/lib/python3*/site-packages")][0])
from google_auth_oauthlib.flow import Flow
os.environ["OAUTHLIB_RELAX_TOKEN_SCOPE"]="1"
CID=os.environ.get("GOOGLE_CLIENT_ID", "REPLACE_LOCALLY")
SEC=open("/home/maya/maya-mcp/gclient.secret").read().strip()
SC=["openid","https://www.googleapis.com/auth/userinfo.email","https://www.googleapis.com/auth/calendar.readonly","https://www.googleapis.com/auth/gmail.readonly","https://www.googleapis.com/auth/drive.readonly"]
cfg={"installed":{"client_id":CID,"client_secret":SEC,"auth_uri":"https://accounts.google.com/o/oauth2/auth","token_uri":"https://oauth2.googleapis.com/token","redirect_uris":["http://localhost:8765/"]}}
flow=Flow.from_client_config(cfg,scopes=SC,redirect_uri="http://localhost:8765/")
url,_=flow.authorization_url(access_type="offline",prompt="consent")
open("/home/maya/maya-mcp/auth_url.txt","w").write(url)
class H(http.server.BaseHTTPRequestHandler):
    def do_GET(s):
        q=urllib.parse.parse_qs(urllib.parse.urlparse(s.path).query)
        if "code" not in q:
            s.send_response(400);s.end_headers();return
        flow.fetch_token(code=q["code"][0])
        c=flow.credentials
        import requests
        em=requests.get("https://www.googleapis.com/oauth2/v2/userinfo",headers={"Authorization":"Bearer "+c.token}).json().get("email")
        from auth.credential_store import LocalDirectoryCredentialStore
        LocalDirectoryCredentialStore("/home/maya/maya-mcp/creds").store_credential(em,c)
        open("/home/maya/maya-mcp/auth_done.txt","w").write("ok "+str(em)+" refresh="+str(bool(c.refresh_token))+" scopes="+",".join(c.scopes or []))
        s.send_response(200);s.end_headers();s.wfile.write(b"Connected. You can close this tab.")
        os._exit(0)
    def log_message(*a):pass
http.server.HTTPServer(("127.0.0.1",8765),H).serve_forever()

"""Private subprocess token transport only, never used as a chat/tool result."""
import pathlib,sys
root=pathlib.Path(__file__).parent
sys.path.insert(0,str(root/'gw/lib/python3.12/site-packages'))
from google.oauth2.credentials import Credentials
from google.auth.transport.requests import Request
from auth.credential_store import LocalDirectoryCredentialStore
p=root/'creds/owner@example.invalid.json'
c=Credentials.from_authorized_user_file(str(p))
if not c.valid:
 c.refresh(Request());LocalDirectoryCredentialStore(str(p.parent)).store_credential('owner@example.invalid',c)
sys.stdout.write(c.token)

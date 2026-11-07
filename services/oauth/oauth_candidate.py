"""Offline candidate. No listener or credentials created by importing this module."""
import base64, hashlib, json, os, pathlib, secrets, sqlite3, tempfile, time, urllib.parse, urllib.request
ACCOUNT = 'owner@example.invalid'
REDIRECT = 'https://maya.example.invalid/maya-google/oauth/callback'
SCOPES = frozenset(('openid','email','https://www.googleapis.com/auth/gmail.modify','https://www.googleapis.com/auth/calendar.events','https://www.googleapis.com/auth/drive'))
class Refused(Exception): pass
class Flow:
    def __init__(self, root, client_id, client_secret, exchange=None, identity=None, clock=time.time):
        self.root=pathlib.Path(root); self.root.mkdir(mode=0o700,parents=True,exist_ok=True)
        os.chmod(self.root,0o700)
        self.db=self.root/'flow.sqlite'; self.client_id=client_id; self.client_secret=client_secret
        self.exchange=exchange or self._exchange; self.identity=identity or self._identity; self.clock=clock
        with self.connect() as db:
            db.execute('CREATE TABLE IF NOT EXISTS flow (state TEXT PRIMARY KEY, verifier TEXT NOT NULL, expires REAL NOT NULL, consumed INTEGER NOT NULL DEFAULT 0)')
        os.chmod(self.db,0o600)
    def connect(self): return sqlite3.connect(self.db,timeout=5,isolation_level='IMMEDIATE')
    def begin(self):
        state=secrets.token_urlsafe(32); verifier=secrets.token_urlsafe(48)
        challenge=base64.urlsafe_b64encode(hashlib.sha256(verifier.encode()).digest()).decode().rstrip('=')
        with self.connect() as db:
            db.execute('UPDATE flow SET consumed=1') # one active attempt only
            db.execute('INSERT INTO flow(state,verifier,expires) VALUES (?,?,?)',(hashlib.sha256(state.encode()).hexdigest(),verifier,self.clock()+600))
        query=urllib.parse.urlencode(dict(client_id=self.client_id,redirect_uri=REDIRECT,response_type='code',scope=' '.join(sorted(SCOPES)),access_type='offline',prompt='consent',login_hint=ACCOUNT,state=state,code_challenge=challenge,code_challenge_method='S256'))
        return 'https://accounts.google.com/o/oauth2/v2/auth?'+query
    def callback(self, target):
        if len(target)>8192: raise Refused('Malformed callback')
        p=urllib.parse.urlsplit(target)
        if p.path!='/maya-google/oauth/callback' or p.fragment or p.scheme or p.netloc: raise Refused('Wrong path')
        try: q=urllib.parse.parse_qs(p.query,strict_parsing=True,keep_blank_values=True,max_num_fields=20)
        except ValueError: raise Refused('Malformed callback')
        if any(len(v)!=1 for v in q.values()) or not q.get('state') or not 20<=len(q['state'][0])<=128: raise Refused('Missing or duplicate state')
        key=hashlib.sha256(q['state'][0].encode()).hexdigest()
        # Consume atomically before any network request. An uncertain exchange is never replayed.
        with self.connect() as db:
            row=db.execute('SELECT verifier,expires,consumed FROM flow WHERE state=?',(key,)).fetchone()
            if not row or row[2] or row[1]<self.clock(): raise Refused('Expired or used attempt')
            if db.execute('UPDATE flow SET consumed=1 WHERE state=? AND consumed=0',(key,)).rowcount!=1: raise Refused('Used attempt')
        if 'error' in q: raise Refused('Google consent was declined')
        if not q.get('code') or not 1<=len(q['code'][0])<=4096: raise Refused('Missing code')
        try:
            token=self.exchange(q['code'][0],row[0])
            if not isinstance(token,dict) or token.get('token_type','').lower()!='bearer' or not isinstance(token.get('access_token'),str) or not token.get('access_token') or not isinstance(token.get('refresh_token'),str) or not token.get('refresh_token'): raise Refused('Incomplete token response')
            granted=set(token.get('scope','').split()); required=SCOPES-{'email','openid'}
            if not required<=granted: raise Refused('Required access missing')
            who=self.identity(token['access_token'])
            if who.get('email')!=ACCOUNT or who.get('verified_email') is not True: raise Refused('Google account mismatch')
            # Separate candidate credentials; never overwrites the existing read-only store.
            saved={**token,'account':ACCOUNT,'client_id':self.client_id,'created_at':self.clock()}
            fd,path=tempfile.mkstemp(dir=self.root,prefix='.candidate-')
            try:
                with os.fdopen(fd,'w') as f:
                    json.dump(saved,f); f.flush(); os.fsync(f.fileno())
                os.replace(path,self.root/'candidate-token.json')
            finally:
                if os.path.exists(path): os.unlink(path)
        except Refused: raise
        except Exception: raise Refused('Consent could not be verified; start a fresh attempt') from None
        return 'Google access verified. No messages were sent and no files or events were changed. Return to Maya for the guarded write setup.'
    def _exchange(self, code, verifier):
        data=urllib.parse.urlencode(dict(code=code,client_id=self.client_id,client_secret=self.client_secret,redirect_uri=REDIRECT,grant_type='authorization_code',code_verifier=verifier)).encode()
        req=urllib.request.Request('https://oauth2.googleapis.com/token',data=data,method='POST')
        with urllib.request.urlopen(req,timeout=15) as r: return json.loads(r.read(100000))
    def _identity(self, token):
        req=urllib.request.Request('https://www.googleapis.com/oauth2/v2/userinfo',headers={'Authorization':'Bearer '+token})
        with urllib.request.urlopen(req,timeout=15) as r: return json.loads(r.read(100000))

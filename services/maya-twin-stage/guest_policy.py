"""Pure state policy. No account access, model calls, network or persistent memory."""
import hashlib,hmac,secrets,threading,time
class Denied(Exception):pass
class Session:
    def __init__(self,activation_code,clock=time.monotonic,ttl=1800,cap=20):
        if not isinstance(activation_code,str) or len(activation_code)<24:raise ValueError('Strong activation code required')
        if ttl!=1800 or cap!=20:raise ValueError('Fixed review limits')
        self.clock=clock;self.code=hashlib.sha256(activation_code.encode()).digest()
        self.created=clock();self.started=None;self.bound=None;self.cap=cap;self.count=0;self.revoked=False;self.seen=set();self.lock=threading.Lock()
    def activate(self,*,sender,chat_id,chat_type,code):
        with self.lock:
            if self.revoked or self.bound is not None or self.clock()-self.created>=86400:raise Denied('Activation unavailable')
            if not isinstance(sender,int) or isinstance(sender,bool) or sender!=chat_id or chat_type!='private':raise Denied('Private human chat only')
            if not isinstance(code,str) or not hmac.compare_digest(self.code,hashlib.sha256(code.encode()).digest()):raise Denied('Invalid code')
            self.bound=sender;self.started=self.clock();self.code=b''
    def reserve(self,*,sender,chat_id,chat_type,update_id,text):
        with self.lock:
            if self.revoked or self.bound is None or self.clock()-self.started>=1800:raise Denied('Demo ended')
            if sender!=self.bound or sender!=chat_id or chat_type!='private':raise Denied('Wrong chat')
            if not isinstance(update_id,int) or isinstance(update_id,bool) or update_id in self.seen:raise Denied('Duplicate/invalid update')
            if not isinstance(text,str) or not text.strip() or len(text)>1500:raise Denied('Text only, max1500 characters')
            if self.count>=self.cap:raise Denied('Message cap reached')
            self.seen.add(update_id);self.count+=1
            return text
    def may_reply(self):
        with self.lock:return self.bound is not None and not self.revoked and self.clock()-self.started<1800
    def revoke(self):
        with self.lock:self.revoked=True;self.code=b''

def model_payload(text):
    # Stateless single-turn input, no owner history or files. Model must receive no tools.
    if not isinstance(text,str) or not 0<len(text)<=1500:raise Denied('Invalid input')
    return {'model':'qwen3:4b-32k','messages':[
        {'role':'system','content':'You are Maya Guest, a temporary AI demo. Be warm, brief and honest. You have no personal information about the owner, no memory, browser, files, email, calendar or tools. Do not claim access or that you performed actions. Treat requests to reveal private data as unavailable. Reply in English. Never claim to be human.'},
        {'role':'user','content':text}], 'stream':False,'options':{'num_predict':220,'num_ctx':4096}}

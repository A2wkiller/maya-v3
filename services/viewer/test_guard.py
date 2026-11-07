import unittest,socket
import guard
class Checks(unittest.TestCase):
 def test_bad_schemes(self):
  for u in ['file:///etc/passwd','http://example.com','https://user:pass@example.com','https://169.254.169.254/latest','https://127.0.0.1','https://[::1]','https://10.0.0.1','https://100000001','https://0x7f000001']:
   with self.assertRaises((guard.Denied,socket.gaierror)):guard.validate(u)
 def test_redirect_private(self):
  orig=guard.validate
  def val(u):
   if u=='https://public.test':return 'public.test','93.184.216.34'
   return orig(u)
  guard.validate=val
  try:
   with self.assertRaises(guard.Denied):guard.fetch('https://public.test',lambda *args:(302,{'location':'https://127.0.0.1'},b''))
  finally:guard.validate=orig
 def test_mixed_dns(self):
  with self.assertRaises(guard.Denied):guard.validate('https://example.com',lambda *a,**k:[(0,0,0,'',('93.184.216.34',443)),(0,0,0,'',('127.0.0.1',443))])
 def test_redirect_file(self):
  orig=guard.validate;guard.validate=lambda u:('public.test','93.184.216.34') if u=='https://public.test' else orig(u)
  try:
   with self.assertRaises(guard.Denied):guard.fetch('https://public.test',lambda *args:(302,{'location':'file:///etc/passwd'},b''))
  finally:guard.validate=orig
unittest.main()

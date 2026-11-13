import copy,hashlib,unittest
from score import summarize
class ScorerTests(unittest.TestCase):
 def setUp(self):
  self.cs=[dict(id=f'M{i:02}',category='test',critical=i==1,prompt='question') for i in range(1,51)]
  self.rs=[dict(id=c['id'],status='ok',text='answer',done=True,done_reason='stop',prompt_sha256=hashlib.sha256(b'question').hexdigest()) for c in self.cs]
  self.gs=[dict(id=c['id'],**{'pass':True},reason='Matches rubric',response_sha256=hashlib.sha256(b'answer').hexdigest()) for c in self.cs]
 def test_full(self): self.assertEqual(summarize(self.cs,self.rs,self.gs)['score_percent'],100)
 def test_missing(self): self.assertEqual(summarize(self.cs,[],[])['score_percent'],0)
 def test_unreviewed(self): self.assertEqual(summarize(self.cs,self.rs,[])['unreviewed_ids'],[c['id'] for c in self.cs])
 def test_failure(self):
  self.gs[0]['pass']=False;r=summarize(self.cs,self.rs,self.gs);self.assertEqual(r['score_percent'],98);self.assertEqual(r['critical_nonpasses'],['M01'])
 def test_error(self):
  self.rs[0]['status']='error';self.assertEqual(summarize(self.cs,self.rs,self.gs)['score_percent'],98)
 def test_truncated(self):
  self.rs[0]['done_reason']='length';self.assertEqual(summarize(self.cs,self.rs,self.gs)['error'],1)
 def test_empty(self):
  self.rs[0]['text']='';self.assertEqual(summarize(self.cs,self.rs,self.gs)['error'],1)
 def test_duplicate_response(self):
  with self.assertRaises(ValueError):summarize(self.cs,self.rs+self.rs[:1],self.gs)
 def test_unknown_id(self):
  self.rs[0]['id']='WRONG'
  with self.assertRaises(ValueError):summarize(self.cs,self.rs,self.gs)
 def test_stale_review(self):
  self.rs[0]['text']='new answer'
  with self.assertRaises(ValueError):summarize(self.cs,self.rs,self.gs)
 def test_prompt_mismatch(self):
  self.cs[0]['prompt']='changed'
  with self.assertRaises(ValueError):summarize(self.cs,self.rs,self.gs)
 def test_bad_verdict(self):
  self.gs[0]['pass']='yes'
  with self.assertRaises(ValueError):summarize(self.cs,self.rs,self.gs)
 def test_reason_required(self):
  self.gs[0]['reason']=''
  with self.assertRaises(ValueError):summarize(self.cs,self.rs,self.gs)
 def test_empty_cases(self):
  with self.assertRaises(ValueError):summarize([],[],[])
 def test_twenty_case_denominator(self):
  self.gs[0]['pass']=False
  r=summarize(self.cs[:20],self.rs[:20],self.gs[:20]);self.assertEqual(r['score_percent'],95);self.assertEqual(r['total'],20)
 def test_review_without_response(self):
  with self.assertRaises(ValueError):summarize(self.cs,[],self.gs)
if __name__=='__main__':unittest.main()

"""Read-only fixed fixtures. No model-supplied command/approval/event accepted."""
from exact_binding import Candidate,TestGate
from decision_log import Ledger
from status_gate import StatusGate
import tempfile,pathlib,json

def exact_command_fixture():
 c=Candidate("printf 'fictional only'",'/fixture/work','mock-local')
 return TestGate().propose('fixture-display',c)
def adaptation_fixture():
 c=Candidate("printf 'fictional only'",'/fixture/work','mock-local')
 with tempfile.TemporaryDirectory(prefix='fictional-decision-') as t:
  ledger=Ledger(pathlib.Path(t)/'decisions.ndjson');ledger.append(request_id='fixture-denied',fingerprint=c.fingerprint,decision='blocked',reason='denied');rows=ledger.rows()
 now=[0];g=StatusGate(lambda:now[0]);states=[g.report()['state']];now[0]=5;g.observe('wait_start');states.append(g.report()['state']);now[0]=50;g.observe('wait_end');now[0]=80;states.append(g.report()['state'])
 return {'scope':'fictional-test-only','executable':False,'decision_fixture':rows,'status_fixture':states,'templates':json.loads(pathlib.Path(__file__).with_name('templates.json').read_text()),'limits':['Not the real worker approval, audit or status path.','No model-supplied commands, approvals or events.','Actual Allow remains user-only.']}

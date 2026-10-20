"""Export only selected demo tasks' structured decisions and public evidence."""
import json
from pathlib import Path
import subprocess

root = Path(__file__).resolve().parents[1]
out = root/'artifacts/kg-rag'
ids = {}
for p in out.glob('browser-*.json'):
    data = json.loads(p.read_text(encoding='utf-8'))
    task = data.get('state', {}).get('task') or {}
    if task.get('taskId'):
        ids[p.stem] = task['taskId']
program = '''import json,os,psycopg
ids=TASK_IDS
reports=[]
with psycopg.connect(host=os.environ['PGHOST'],port=os.environ['PGPORT'],dbname=os.environ['PGDATABASE'],user=os.environ['PGUSER'],password=os.environ['PGPASSWORD']) as c:
 q=c.cursor()
 for case,identity in ids.items():
  q.execute('SELECT checkpoint FROM agent_state.tasks WHERE task_id=%s',(identity,))
  row=q.fetchone()
  if not row:continue
  task=row[0];observations=[]
  for o in task.get('observations',[]):
   result=o.get('structured_result') or {}
   observations.append({'tool':o.get('tool_name'),'success':o.get('success'),'trust':o.get('trust'),
    'evidence':result.get('evidence',[]) if o.get('tool_name')=='search_bank_knowledge' else None})
  decisions=[t.get('decision') for t in task.get('trace',[]) if t.get('kind') in ['PLANNER_DECISION','KNOWLEDGE_CITATION_REPAIR']]
  prepares=[d for d in decisions if isinstance(d,dict) and (d.get('tool_call') or {}).get('tool_name','').startswith('prepare_')]
  reports.append({'case':case,'task_id':identity,'goal':task.get('goal'),'status':task.get('status'),
   'ledger':task.get('ledger'),'decisions':decisions,'observations':observations,
   'prepare_call_count':len(prepares),'active_intent_present':bool(task.get('active_intent')),
   'errors':[t for t in task.get('trace',[]) if t.get('kind') in ['FAILED','RUNTIME_ERROR','TOOL_REJECTED']]})
print(json.dumps(reports,ensure_ascii=True))
'''.replace('TASK_IDS', repr(ids))
r = subprocess.run(['docker','exec','-i','aster-acceptance-20261012-agent-runtime-1','python','-'],
                   input=program,text=True,capture_output=True,encoding='utf-8',timeout=30)
if r.returncode:raise SystemExit('Selected task export failed; credentials not printed.')
reports=json.loads(r.stdout)
(out/'model-tool-traces.json').write_text(json.dumps(reports,ensure_ascii=False,indent=2),encoding='utf-8')
for report in reports:
    print(report['case'], report['status'], 'prepare_calls='+str(report['prepare_call_count']))

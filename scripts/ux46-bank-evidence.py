"""Read-only snapshots of the existing isolated bank; never exports credentials."""
import json
import subprocess
import sys
from pathlib import Path

root = Path(__file__).resolve().parents[1]
phase = sys.argv[1] if len(sys.argv) > 1 else 'snapshot'
if phase not in {'before', 'after', 'snapshot'}:
    raise SystemExit('Invalid snapshot phase')
program = '''import hashlib,json,os
import psycopg
from psycopg import sql
with psycopg.connect(host=os.environ['PGHOST'],port=os.environ['PGPORT'],dbname=os.environ['PGDATABASE'],user=os.environ['PGUSER'],password=os.environ['PGPASSWORD']) as connection:
    with connection.cursor() as cursor:
        cursor.execute("SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name IN ('accounts','transactions','transfers','transfer_intents','card_action_intents') ORDER BY table_name")
        output={}
        for (name,) in cursor.fetchall():
            cursor.execute(sql.SQL('SELECT row_to_json(t)::text FROM {} t ORDER BY row_to_json(t)::text').format(sql.Identifier(name)))
            rows=[r[0] for r in cursor.fetchall()]
            output[name]={'count':len(rows),'sha256':hashlib.sha256(('\\n'.join(rows)).encode()).hexdigest()}
        cursor.execute("SELECT task_id,checkpoint FROM agent_state.tasks WHERE updated_at > now()-interval '1 hour' ORDER BY updated_at")
        tasks=[]
        def safe(value):
            if isinstance(value,list): return [safe(v) for v in value]
            if isinstance(value,dict): return {k: ('[REDACTED]' if any(t in k.lower() for t in ['cookie','password','session','token','authorization','intent_hash','intenthash']) else safe(v)) for k,v in value.items()}
            return value
        for task_id, state in cursor.fetchall():
            tasks.append(safe({'task_id':task_id,'goal':state.get('goal'),'status':state.get('status'),'ledger':state.get('ledger'),'observations':state.get('observations'),'trace':state.get('trace')}))
        print(json.dumps({'financial_tables':output,'tasks':tasks},ensure_ascii=True,indent=2))
'''
result = subprocess.run(['docker','exec','-i','aster-acceptance-20261012-agent-runtime-1','python','-'],
                        input=program,text=True,capture_output=True,timeout=30)
if result.returncode:
    raise SystemExit('Isolated database snapshot failed; no raw connection details printed.')
data=json.loads(result.stdout)
(root / f'artifacts/ux46/bank-{phase}.json').write_text(json.dumps(data,indent=2,ensure_ascii=False),encoding='utf-8')
print(json.dumps({'phase':phase,'financial_tables':data['financial_tables'],'task_count':len(data['tasks'])},indent=2))

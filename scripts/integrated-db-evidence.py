"""Read-only, aggregate DB evidence from the existing isolated Agent network."""
import json
import subprocess
import sys
from pathlib import Path

root = Path(__file__).resolve().parents[1]
phase = sys.argv[1] if len(sys.argv)>1 else 'snapshot'
if phase not in {'before','after','snapshot'}: raise SystemExit('Invalid phase')
program = '''import hashlib,json,os,psycopg
from psycopg import sql
with psycopg.connect(host=os.environ['PGHOST'],port=os.environ['PGPORT'],dbname=os.environ['PGDATABASE'],user=os.environ['PGUSER'],password=os.environ['PGPASSWORD']) as c:
    q=c.cursor(); output={}
    for schema,name in [('public','accounts'),('public','transactions'),('public','transfers'),('public','transfer_intents'),('knowledge','documents'),('knowledge','document_chunks')]:
        q.execute('SELECT to_regclass(%s)',(schema+'.'+name,))
        if q.fetchone()[0] is None:
            output[schema+'.'+name]={'status':'MISSING'}; continue
        q.execute(sql.SQL('SELECT row_to_json(t)::text FROM {}.{} t ORDER BY row_to_json(t)::text').format(sql.Identifier(schema),sql.Identifier(name)))
        rows=[r[0] for r in q.fetchall()]
        output[schema+'.'+name]={'count':len(rows),'sha256':hashlib.sha256(('\\n'.join(rows)).encode()).hexdigest()}
    q.execute('SELECT version,success FROM flyway_schema_history ORDER BY installed_rank DESC LIMIT 5')
    output['migrations']=q.fetchall()
    print(json.dumps(output,indent=2))
'''
r=subprocess.run(['docker','exec','-i','aster-acceptance-20261012-agent-runtime-1','python','-'],input=program,text=True,capture_output=True,timeout=30)
if r.returncode: raise SystemExit('Database evidence unavailable; connection secrets not printed.')
data=json.loads(r.stdout)
(root/f'artifacts/integrated/db-{phase}.json').write_text(json.dumps(data,indent=2),encoding='utf-8')
print(json.dumps(data,indent=2))

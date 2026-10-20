"""Sanitized read-only evidence; never reuses another milestone's artifact paths."""
import argparse
import json
from pathlib import Path
import subprocess

root = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser()
parser.add_argument('phase', choices=['before', 'after'])
args = parser.parse_args()
destination = root / f'artifacts/kg-rag/evidence-{args.phase}.json'
if destination.exists():
    raise SystemExit('Evidence already exists; keep original and use a separate run directory.')
program = '''import hashlib,json,os,psycopg,urllib.request
from psycopg import sql
output={}
with psycopg.connect(host=os.environ['PGHOST'],port=os.environ['PGPORT'],dbname=os.environ['PGDATABASE'],user=os.environ['PGUSER'],password=os.environ['PGPASSWORD']) as c:
 q=c.cursor()
 for name in ['accounts','transactions','transfers','transfer_intents','card_action_intents']:
  q.execute(sql.SQL('SELECT row_to_json(t)::text FROM {} t ORDER BY row_to_json(t)::text').format(sql.Identifier(name)))
  rows=[r[0] for r in q.fetchall()]
  output[name]={'count':len(rows),'sha256':hashlib.sha256(('\\n'.join(rows)).encode()).hexdigest()}
 for name in ['documents','document_versions','document_chunks','graph_nodes','graph_edges']:
  q.execute(sql.SQL('SELECT count(*) FROM knowledge.{}').format(sql.Identifier(name)))
  output['knowledge.'+name]=q.fetchone()[0]
 q.execute('SELECT category,count(*) FROM knowledge.documents GROUP BY category ORDER BY category');output['categories']=q.fetchall()
 q.execute('SELECT embedding_model_version,count(*) FROM knowledge.document_chunks GROUP BY embedding_model_version');output['embedding_versions']=q.fetchall()
 q.execute('SELECT version,sha256 FROM knowledge.schema_migrations');output['knowledge_migrations']=q.fetchall()
 q.execute('SELECT version,success FROM flyway_schema_history ORDER BY installed_rank DESC LIMIT 1');output['bank_migration']=q.fetchone()
 q.execute('SELECT count(*) FROM knowledge.graph_edges e JOIN knowledge.document_chunks c ON c.chunk_id=e.evidence_chunk_id WHERE position(e.source_quote in c.content)=0');output['invalid_graph_quotes']=q.fetchone()[0]
with urllib.request.urlopen('http://knowledge-service:8002/health',timeout=5) as response:output['health']=json.load(response)
print(json.dumps(output))
'''
r = subprocess.run(['docker','exec','-i','aster-acceptance-20261012-agent-runtime-1','python','-'],
                   input=program,text=True,capture_output=True,encoding='utf-8',timeout=30)
if r.returncode:
    raise SystemExit('Read-only evidence unavailable; no connection details printed.')
data = json.loads(r.stdout)
destination.write_text(json.dumps(data,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps(data,ensure_ascii=False,indent=2))

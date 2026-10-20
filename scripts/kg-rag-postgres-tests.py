"""One bounded test container, existing isolated DB, no credentials in artifacts."""
import base64
import io
import json
import os
from pathlib import Path
import subprocess
import tarfile

root = Path(__file__).resolve().parents[1]
out = root / 'artifacts/kg-rag'
out.mkdir(parents=True, exist_ok=True)
buffer = io.BytesIO()
with tarfile.open(fileobj=buffer, mode='w:gz') as tar:
    for directory in ('app', 'tests', 'eval'):
        for path in (root / 'services/knowledge-service' / directory).rglob('*'):
            if path.is_file() and path.suffix in {'.py', '.json', '.sql'}:
                tar.add(path, arcname=path.relative_to(root / 'services/knowledge-service'), recursive=False)
payload = base64.b64encode(buffer.getvalue()).decode()
program = '''import base64,io,json,os,runpy,sys,tarfile,tempfile,unittest
from psycopg.conninfo import make_conninfo
os.environ['KNOWLEDGE_DATABASE_URL']=make_conninfo(host=os.environ['PGHOST'],port=os.environ['PGPORT'],dbname=os.environ['PGDATABASE'],user=os.environ['PGUSER'],password=os.environ['PGPASSWORD'])
with tempfile.TemporaryDirectory() as directory:
 with tarfile.open(fileobj=io.BytesIO(base64.b64decode(PAYLOAD)),mode='r:gz') as t:t.extractall(directory,filter='data')
 sys.path.insert(0,directory)
 from app.database import connect
 from app.ingest import ingest,public_demo_sources
 from app.graph import apply_schema,rebuild_graph
 with connect() as conn:
  apply_schema(conn)
  for source in public_demo_sources(conn):ingest(conn,source)
  print('INDEX_PREPARATION='+json.dumps(rebuild_graph(conn)))
 suite=unittest.defaultTestLoader.discover(directory+'/tests')
 result=unittest.TextTestRunner(verbosity=2).run(suite)
 os.environ['KNOWLEDGE_EVAL_OUTPUT']=directory+'/retrieval.json'
 runpy.run_path(directory+'/eval/run_retrieval.py',run_name='__main__')
 print('RETRIEVAL_JSON='+open(directory+'/retrieval.json').read().replace('\\n',''))
 sys.exit(0 if result.wasSuccessful() and not result.skipped else 1)
'''.replace('PAYLOAD', repr(payload))
env = os.environ.copy()
env.setdefault('ASTER_EMBEDDING_CACHE', str(Path.home()/'.cache/huggingface/hub/models--intfloat--multilingual-e5-small'))
args = ['docker', 'compose', '-p', 'aster-acceptance-20261012']
for f in ('demo', 'agent', 'knowledge'):
    args += ['-f', str(root/f'infra/compose/{f}.compose.yml')]
args += ['--env-file', str(root/'.env.start.local'), 'run', '--rm', '--no-deps', '-T',
         'knowledge-service', 'python', '-']
# Compose interpolation requires the existing secret path, not its contents.
env.setdefault('DEEPSEEK_API_KEY_FILE', 'E:/deeoseekapikey.txt')
r = subprocess.run(args, input=program, capture_output=True, text=True, encoding='utf-8', errors='replace', env=env)
(out/'postgres-tests.log').write_text(r.stdout+r.stderr, encoding='utf-8')
for line in r.stdout.splitlines():
    if line.startswith('RETRIEVAL_JSON='):
        report=json.loads(line.split('=', 1)[1])
        (out/'retrieval.json').write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
        print({k:report[k] for k in ('total','retrieval_pass','retrieval_run')})
print(r.stderr[-2000:])
raise SystemExit(r.returncode)

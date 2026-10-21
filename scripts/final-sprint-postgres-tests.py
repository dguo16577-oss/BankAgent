"""Current-source TaskStore tests in a new isolated DB on the existing PG server.

No image build, new network, model request or deletion of databases/volumes.
The existing container provides its secret connection settings without printing them.
"""
import base64
import argparse
import io
import json
import os
from pathlib import Path
import subprocess
import tarfile

ROOT = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("--project", choices=["aster-acceptance-20261012", "aster-final-sprint-20261020"], default="aster-acceptance-20261012")
parser.add_argument("--output", default="artifacts/final-sprint")
args = parser.parse_args()
container = args.project + "-agent-runtime-1"
actual = subprocess.check_output(["docker", "inspect", container, "--format",
    '{{index .Config.Labels "com.docker.compose.project"}}'], text=True).strip()
if actual != args.project:
    raise SystemExit("PostgreSQL test project mismatch")
output = (ROOT / args.output).resolve()
if not output.is_relative_to((ROOT / "artifacts").resolve()):
    raise SystemExit("Test output must stay inside project artifacts")
if os.name == "nt":
    headroom = subprocess.check_output(["powershell", "-NoProfile", "-Command",
        "$m=Get-CimInstance Win32_PerfFormattedData_PerfOS_Memory; [math]::Floor(($m.CommitLimit-$m.CommittedBytes)/1MB)"], text=True)
    if int(headroom.strip()) < 768:
        raise SystemExit("RESOURCE_BLOCKED: low-load state tests require 768 MiB commit headroom")
buffer = io.BytesIO()
with tarfile.open(fileobj=buffer, mode="w:gz") as archive:
    service = ROOT / "services/agent-runtime"
    for folder in ("app", "tests", "sql"):
        for path in sorted((service / folder).rglob("*")):
            if path.is_file() and path.suffix in {".py", ".sql"}:
                archive.add(path, arcname=path.relative_to(service), recursive=False)
payload = base64.b64encode(buffer.getvalue()).decode()
program = r'''
import base64, hashlib, io, json, os, sys, tarfile, tempfile, unittest
from datetime import datetime, timezone
import psycopg
from psycopg import sql
from psycopg.conninfo import make_conninfo
from pathlib import Path

connection = dict(host=os.environ['PGHOST'],port=os.environ['PGPORT'],
                  user=os.environ['PGUSER'],password=os.environ['PGPASSWORD'])
original_db = os.environ['PGDATABASE']
database = 'aster_sprint_' + datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S')
def bank_fingerprint():
    result = {}
    with psycopg.connect(**connection,dbname=original_db) as c:
        for table in ['accounts','transactions','transfers','transfer_intents','card_action_intents']:
            rows = c.execute(sql.SQL('SELECT row_to_json(t)::text FROM {} t ORDER BY row_to_json(t)::text').format(sql.Identifier(table))).fetchall()
            result[table] = {'count':len(rows),'sha256':hashlib.sha256('\n'.join(row[0] for row in rows).encode()).hexdigest()}
    return result
before = bank_fingerprint()
with psycopg.connect(**connection,dbname=original_db,autocommit=True) as c:
    c.execute(sql.SQL('CREATE DATABASE {}').format(sql.Identifier(database)))
with tempfile.TemporaryDirectory(prefix='aster-sprint-tests-') as directory:
    with tarfile.open(fileobj=io.BytesIO(base64.b64decode(PAYLOAD)),mode='r:gz') as archive:
        archive.extractall(directory,filter='data')
    with psycopg.connect(**connection,dbname=database) as c:
        c.execute(Path(directory+'/sql/001_agent_state.sql').read_text())
    os.environ['PGDATABASE'] = database
    os.environ['R1_TEST_DATABASE_URL'] = make_conninfo(**connection,dbname=database)
    sys.path[:0] = [directory,directory+'/tests']
    suite = unittest.defaultTestLoader.discover(directory+'/tests',pattern='test_r1_postgres_recovery.py')
    result = unittest.TextTestRunner(verbosity=2).run(suite)
    from test_step_authorization import scenario,args,bank_intent
    from app.agent_v2.financial_terms import bind_prepared_intent,bind_execution_receipt
    from app.agent_v2.completeness import update_ledger
    from app.agent_v2.state_store import PostgresTaskStore
    from app.agent_v2.models import Observation
    task = scenario(); task.selected_financial_step_id = 'g1'
    intent = bank_intent('postgres-intent','100.00','zhang')
    bind_prepared_intent(task,'prepare_transfer',args(),intent)
    store=PostgresTaskStore(os.environ['R1_TEST_DATABASE_URL']); store.save(task)
    restored=store.load(task.task_id,task.customer_id,task.session_binding)
    evidence=bind_execution_receipt(restored,intent,{'id':'postgres-receipt'})
    restored.observations.append(Observation(tool_name='confirmed_transfer',success=True,structured_result=evidence))
    store.save(restored)
    restored=store.load(task.task_id,task.customer_id,task.session_binding); update_ledger(restored)
    assert [step['status'] for step in restored.ledger]==['SUCCEEDED','PENDING']
    after=bank_fingerprint()
    assert before==after,'Existing banking business state changed during read/state tests'
    print(json.dumps({'database':database,'recovery_tests_run':result.testsRun,
          'skipped':len(result.skipped),'successful':result.wasSuccessful(),
          'step_binding_roundtrip':True,'bank_before':before,'bank_after':after}))
    success=result.wasSuccessful() and not result.skipped
sys.exit(0 if success else 1)
'''.replace("PAYLOAD", repr(payload))
output.mkdir(parents=True, exist_ok=True)
result = subprocess.run(["docker", "exec", "-i", container, "python", "-"],
                        input=program, text=True, capture_output=True, encoding="utf-8", timeout=180)
(output / "postgres-recovery.log").write_text(result.stderr, encoding="utf-8")
(output / "postgres-recovery-evidence.jsonl").write_text(result.stdout, encoding="utf-8")
print(result.stderr[-4000:])
if result.returncode == 0:
    evidence = json.loads(result.stdout.strip().splitlines()[-1])
    print(json.dumps({key:evidence[key] for key in ("database", "recovery_tests_run", "skipped", "successful", "step_binding_roundtrip")}))
else:
    print("PostgreSQL test failed; inspect local evidence. No database or volume was deleted.")
raise SystemExit(result.returncode)

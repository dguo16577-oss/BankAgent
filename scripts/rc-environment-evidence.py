"""Read-only RC image/source/database evidence; never prints connection secrets."""
import argparse
import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path
import subprocess

ROOT = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--project', choices=['aster-acceptance-20261012', 'aster-final-sprint-20261020'], required=True)
args = parser.parse_args()

def command(*parts):
    return subprocess.check_output(parts, cwd=ROOT, text=True, encoding='utf-8').strip()

services = []
for service in ['web', 'agent-runtime', 'banking-core', 'postgres', 'knowledge-service', 'reverse-proxy']:
    container = json.loads(command('docker', 'inspect', args.project+'-'+service+'-1'))[0]
    assert container['Config']['Labels']['com.docker.compose.project'] == args.project
    image = json.loads(command('docker', 'image', 'inspect', container['Image']))[0]
    allowed = {'ASTER_MCP_ENABLED', 'AGENT_STATE_ENABLED', 'MULTI_AGENT_ENABLED', 'AGENT_RUNTIME_VERSION',
               'DEEPSEEK_REASONING_EFFORT', 'DEEPSEEK_THINKING_ENABLED'}
    services.append({'service': service, 'image': container['Image'], 'image_created': image['Created'],
        'source_tree': (image['Config'].get('Labels') or {}).get('io.aster.source.sha256'),
        'health': container['State'].get('Health', {}).get('Status'), 'running': container['State']['Running'],
        'flags': sorted(v for v in container['Config']['Env'] if v.split('=',1)[0] in allowed)})

program = r'''
import hashlib,json,os,psycopg
from pathlib import Path
from psycopg import sql
result={'tables':{}}
with psycopg.connect('') as c:
    result['postgres_version']=c.execute('show server_version').fetchone()[0]
    for name in ['accounts','transactions','transfers','transfer_intents','card_action_intents']:
        rows=c.execute(sql.SQL('select row_to_json(t)::text from {} t order by row_to_json(t)::text').format(sql.Identifier(name))).fetchall()
        result['tables'][name]={'count':len(rows),'sha256':hashlib.sha256(chr(10).join(row[0] for row in rows).encode()).hexdigest()}
    result['flyway_latest']=c.execute('select version,success from flyway_schema_history order by installed_rank desc limit 1').fetchone()
    result['knowledge_counts']={}
    for name in ['documents','document_versions','document_chunks']:
        if c.execute('select to_regclass(%s)',('knowledge.'+name,)).fetchone()[0]:
            result['knowledge_counts'][name]=c.execute(sql.SQL('select count(*) from knowledge.{}').format(sql.Identifier(name))).fetchone()[0]
result['agent_sources']={str(p.relative_to('/app/app')):hashlib.sha256(p.read_bytes()).hexdigest() for p in sorted(Path('/app/app').rglob('*.py'))}
print(json.dumps(result))
'''
probe = subprocess.run(['docker', 'exec', '-i', args.project+'-agent-runtime-1', 'python', '-'],
    input=program, text=True, capture_output=True, encoding='utf-8', timeout=30)
if probe.returncode:
    raise SystemExit('Read-only database/source capture failed; secret connection settings not printed')
database = json.loads(probe.stdout)
local = {p.relative_to(ROOT/'services/agent-runtime/app').as_posix():hashlib.sha256(p.read_bytes()).hexdigest()
         for p in sorted((ROOT/'services/agent-runtime/app').rglob('*.py'))}
deployed = database.pop('agent_sources')
status = command('git', 'status', '--porcelain')
diff = subprocess.check_output(['git', 'diff', 'HEAD', '--binary'], cwd=ROOT)
untracked = command('git', 'ls-files', '--others', '--exclude-standard').splitlines()
dirty = hashlib.sha256(diff)
for name in sorted(untracked):
    dirty.update(name.encode()); dirty.update((ROOT/name).read_bytes())
result = {'captured_at':datetime.now(timezone.utc).isoformat(), 'project':args.project,
    'source_commit':command('git','rev-parse','HEAD'), 'dirty_status':status,
    'dirty_fingerprint':dirty.hexdigest(), 'services':services, 'database':database,
    'agent_source_parity':{'file_count':len(local), 'equal':local==deployed,
        'mismatched_files':sorted(k for k in set(local)|set(deployed) if local.get(k)!=deployed.get(k))}}
if args.project == 'aster-acceptance-20261012':
    baseline=json.loads((ROOT/'artifacts/rc/baseline.json').read_text(encoding='utf-8'))
    result['protected_tables_unchanged']=database['tables']==baseline['retained_database']['tables']
path=ROOT/'artifacts/rc'/('environment-'+args.project+'-'+datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S')+'.json')
path.write_text(json.dumps(result,indent=2)+'\n',encoding='utf-8')
print(json.dumps({'artifact':path.relative_to(ROOT).as_posix(),'source_parity':result['agent_source_parity'],
    'protected_tables_unchanged':result.get('protected_tables_unchanged'),'healthy':all(s['health']=='healthy' for s in services)}))

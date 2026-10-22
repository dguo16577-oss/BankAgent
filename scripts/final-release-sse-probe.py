"""Run current-source SSE fault fixture inside the exact disposable stack only."""
import base64
import hashlib
import io
import json
from pathlib import Path
import subprocess
import sys
import tarfile
from datetime import datetime, timezone

root=Path(__file__).resolve().parents[1]
project='aster-final-sprint-20261020';container=project+'-agent-runtime-1'
label=subprocess.check_output(['docker','inspect',container,'--format','{{index .Config.Labels "com.docker.compose.project"}}'],text=True).strip()
assert label==project
assert subprocess.check_output(['docker','inspect','aster-acceptance-20261012-banking-core-1','--format','{{.State.Running}}'],text=True).strip()=='false','Stop retained stack first'
buffer=io.BytesIO()
with tarfile.open(fileobj=buffer,mode='w:gz') as archive:
    for path in sorted((root/'services/agent-runtime/app').rglob('*.py')):
        archive.add(path,arcname=path.relative_to(root/'services/agent-runtime'),recursive=False)
    archive.add(root/'scripts/final-release-sse-fixture.py',arcname='probe.py',recursive=False)
review_only='--review-only' in sys.argv
program="""
import base64,io,os,subprocess,tarfile,tempfile
with tempfile.TemporaryDirectory(prefix='final-sse-') as directory:
    with tarfile.open(fileobj=io.BytesIO(base64.b64decode(PAYLOAD)),mode='r:gz') as archive:archive.extractall(directory,filter='data')
    env=dict(os.environ,PYTHONPATH=directory,FINAL_GATE_DISPOSABLE='aster-final-sprint-20261020',ASTER_MCP_ENABLED='0',MULTI_AGENT_ENABLED='0',FINAL_GATE_REVIEW_ONLY=__REVIEW_VALUE__)
    result=subprocess.run(['python',directory+'/probe.py'],env=env,cwd=directory,timeout=180)
    raise SystemExit(result.returncode)
""".replace('PAYLOAD',repr(base64.b64encode(buffer.getvalue()).decode())).replace('__REVIEW_VALUE__',repr('1' if review_only else '0'))
out=root/'artifacts/final-release-gate';out.mkdir(exist_ok=True,parents=True)
stamp=datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S')
result=subprocess.run(['docker','exec','-i',container,'python','-'],input=program,text=True,capture_output=True,encoding='utf-8',timeout=210)
(out/f'sse-{stamp}.jsonl').write_text(result.stdout,encoding='utf-8')
(out/f'sse-{stamp}-errors.log').write_text(result.stderr,encoding='utf-8')
metadata={'source_commit':subprocess.check_output(['git','rev-parse','HEAD'],cwd=root,text=True).strip(),
 'source_app_sha256':hashlib.sha256(buffer.getvalue()).hexdigest(),'execution':'CURRENT_SOURCE_TEMP_COPY_IN_EXISTING_DISPOSABLE_CONTAINER',
 'agent_image':subprocess.check_output(['docker','inspect',container,'--format','{{.Image}}'],text=True).strip(),
 'exit_code':result.returncode,'artifact':f'artifacts/final-release-gate/sse-{stamp}.jsonl'}
(out/f'sse-{stamp}-run.json').write_text(json.dumps(metadata,indent=2),encoding='utf-8')
if result.returncode==0:
    data=json.loads(result.stdout.strip().splitlines()[-1]);print(json.dumps([{'case_id':c['case_id'],'status':c['status']} for c in data['cases']]))
else:print('SSE probe failed; original stdout/stderr preserved; no volume deleted')
raise SystemExit(result.returncode)

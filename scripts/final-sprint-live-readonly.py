"""Real model/native bank/RAG comparison using current source in disposable /tmp.

No server binding, image deployment, financial preparation or financial execution.
Uses only the already-running isolated Docker project's approved connections.
"""
import base64
import hashlib
import io
import json
import os
from pathlib import Path
import subprocess
import tarfile

ROOT = Path(__file__).resolve().parents[1]
if os.name == "nt":
    headroom = subprocess.check_output(["powershell", "-NoProfile", "-Command",
        "$m=Get-CimInstance Win32_PerfFormattedData_PerfOS_Memory; [math]::Floor(($m.CommitLimit-$m.CommittedBytes)/1MB)"], text=True)
    if int(headroom.strip()) < 768:
        raise SystemExit("RESOURCE_BLOCKED: low-load read probe requires 768 MiB commit headroom")
service = ROOT / "services/agent-runtime"
buffer = io.BytesIO()
sources = {}
with tarfile.open(fileobj=buffer, mode="w:gz") as archive:
    for folder in ("app", "evals"):
        for path in sorted((service / folder).rglob("*.py")):
            archive.add(path, arcname=path.relative_to(service), recursive=False)
            sources[path.relative_to(service).as_posix()] = hashlib.sha256(path.read_bytes()).hexdigest()
payload = base64.b64encode(buffer.getvalue()).decode()
program = r'''
import asyncio,base64,hashlib,io,json,os,re,sys,tarfile,tempfile,time
from pathlib import Path
import httpx,psycopg
from psycopg import sql
def bank_state():
    result={}
    with psycopg.connect(host=os.environ['PGHOST'],port=os.environ['PGPORT'],dbname=os.environ['PGDATABASE'],
                        user=os.environ['PGUSER'],password=os.environ['PGPASSWORD']) as c:
        for table in ['accounts','transactions','transfers','transfer_intents','card_action_intents']:
            rows=c.execute(sql.SQL('SELECT row_to_json(t)::text FROM {} t ORDER BY row_to_json(t)::text').format(sql.Identifier(table))).fetchall()
            result[table]={'count':len(rows),'sha256':hashlib.sha256('\n'.join(row[0] for row in rows).encode()).hexdigest()}
    return result
with tempfile.TemporaryDirectory(prefix='aster-sprint-live-read-') as directory:
    with tarfile.open(fileobj=io.BytesIO(base64.b64decode(PAYLOAD)),mode='r:gz') as archive:
        archive.extractall(directory,filter='data')
    sys.path.insert(0,directory)
    from app.banking import BankingGateway
    from app.deepseek import DeepSeekClassifier
    from app.agent_v2.planner import DeepSeekPlanner
    from app.agent_v2.runtime import AgentRuntimeV2
    from app.agent_v2.multi_agent import SpecialistPlanner
    from evals.m18_usage import UsageMeter
    class MeasuredClassifier(DeepSeekClassifier):
        def __init__(self,role,trace,meter):
            super().__init__(transport=meter)
            self.role,self.trace=role,trace
        async def _json_completion(self,system,user,limit):
            context=json.loads(user)
            started=time.monotonic()
            try:
                result=await super()._json_completion(system,user,limit)
            except Exception as exc:
                self.trace.append({'role':self.role,'elapsed_ms':round((time.monotonic()-started)*1000),
                    'error_type':type(exc).__name__, 'error_code':str(exc) if re.fullmatch('[A-Z_]{1,80}',str(exc)) else 'PROVIDER_OR_SCHEMA_FAILURE',
                    'observation_tools':[o.get('tool_name') for o in context.get('observations',[]) if isinstance(o,dict)]})
                raise
            self.trace.append({'role':self.role,'elapsed_ms':round((time.monotonic()-started)*1000),
                'observation_tools':[o.get('tool_name') for o in context.get('observations',[]) if isinstance(o,dict)],
                'available_tools':[t.get('name') for t in context.get('available_tools',[]) if isinstance(t,dict)],
                'decision_type':result.get('type') or ('PLAN' if 'steps' in result else 'AUDIT'),
                'selected_tool':(result.get('tool_call') or {}).get('tool_name'),
                'selected_step':(result.get('tool_call') or {}).get('step_id') or ((result.get('tool_call') or {}).get('arguments') or {}).get('step_id'),
                'planned_steps':[{k:s.get(k) for k in ('step_id','kind','evidence_tools','dependencies')} for s in result.get('steps',[]) if isinstance(s,dict)]})
            return result
    async def main():
        origin=os.environ['BANKING_API_BASE_URL']
        if origin!='http://banking-core:8080':raise RuntimeError('Expected existing isolated Docker Banking Core')
        before=bank_state();cases=[]
        async with httpx.AsyncClient(base_url=origin,timeout=20) as client:
            await client.get('/customer/session')
            login=await client.post('/customer/auth/login',json={'email':'alex@aster.local','password':'demo-password'},
                headers={'X-XSRF-TOKEN':client.cookies.get('XSRF-TOKEN','')})
            login.raise_for_status();await client.get('/customer/session')
            cookie='; '.join(f'{k}={v}' for k,v in client.cookies.items())
            prompt='查询我的活期账户可用余额，再说明灵活储蓄的示例利率是否保证收益，并提供政策来源。只查询，不办理任何业务。'
            for enabled in [True,False]:
                os.environ['MULTI_AGENT_ENABLED']='1' if enabled else '0'
                trace=[];meter=UsageMeter()
                runtime=AgentRuntimeV2(BankingGateway(origin),DeepSeekPlanner(MeasuredClassifier('supervisor',trace,meter)))
                if enabled:
                    def factory(role):
                        planner=SpecialistPlanner(role);planner.classifier=MeasuredClassifier(role,trace,meter);return planner
                    runtime.registry.specialist_factory=factory
                started=time.monotonic()
                try:
                    response=await asyncio.wait_for(runtime.chat(prompt,cookie),timeout=240)
                    task=runtime.tasks[response.task_id]
                    roles={d['agent_role'] for d in task.delegations if d.get('status')=='SUCCEEDED'}
                    tools=[o.tool_name for o in task.observations]
                    no_prepare=not any(name.startswith('prepare_') for name in tools)
                    passed=response.status.value=='SUCCEEDED' and no_prepare and (not enabled or roles=={'financial_analyst','bank_knowledge'})
                    cases.append({'mode':'multi' if enabled else 'single','status':'PASS' if passed else 'FAIL',
                        'runtime_status':response.status.value,'error_code':response.error_code,'goal':prompt,
                        'elapsed_seconds':round(time.monotonic()-started,2),'model_trace':trace,'usage':meter.records,
                        'tool_calls':tools,'no_prepare':no_prepare,'registry_count':len(runtime.registry.visible()),
                        'ledger':[{'step_id':s.get('step_id'),'kind':s.get('kind'),'status':s.get('status'),'evidence_tools':s.get('evidence_tools')} for s in task.ledger],
                        'delegations':[{'role':d.get('agent_role'),'step_id':d.get('child_step_id'),'status':d.get('status'),'failure_reason':d.get('failure_reason'),'model_calls':d.get('model_calls'),'trace':d.get('trace')} for d in task.delegations],
                        'citation_count':sum(len(o.structured_result.get('evidence',[])) for o in task.observations if o.tool_name=='search_bank_knowledge'),
                        'answer_excerpt':response.message[:1200]})
                except Exception as exc:
                    cases.append({'mode':'multi' if enabled else 'single','status':'FAIL','error_type':type(exc).__name__,
                                  'model_trace':trace,'usage':meter.records})
                finally:
                    await meter.close_pool()
            await client.post('/customer/auth/logout',headers={'X-XSRF-TOKEN':client.cookies.get('XSRF-TOKEN','')})
        after=bank_state()
        print(json.dumps({'execution_level':'LIVE_SOURCE_READONLY_NATIVE_BANK_RAG','deployed':False,
             'bank_before':before,'bank_after':after,'bank_unchanged':before==after,'cases':cases},ensure_ascii=False))
        return before==after and all(c['status']=='PASS' for c in cases)
    passed=asyncio.run(main())
    sys.exit(0 if passed else 1)
'''.replace("PAYLOAD", repr(payload))
output = ROOT / "artifacts/final-sprint"
output.mkdir(parents=True, exist_ok=True)
for old_name in ('live-readonly.jsonl', 'live-readonly-errors.log', 'live-readonly-source-manifest.json'):
    previous = output / old_name
    if previous.exists():
        suffix = hashlib.sha256(previous.read_bytes()).hexdigest()[:12]
        previous.rename(output / (previous.stem + '-' + suffix + previous.suffix))
(output / "live-readonly-source-manifest.json").write_text(json.dumps(sources, indent=2) + "\n")
result = subprocess.run(["docker", "exec", "-i", "aster-acceptance-20261012-agent-runtime-1", "python", "-"],
                        input=program, capture_output=True, text=True, encoding="utf-8", timeout=510)
(output / "live-readonly.jsonl").write_text(result.stdout, encoding="utf-8")
(output / "live-readonly-errors.log").write_text(result.stderr, encoding="utf-8")
if result.stdout.strip():
    try:
        data = json.loads(result.stdout.strip().splitlines()[-1])
        print(json.dumps({"bank_unchanged":data["bank_unchanged"],"deployed":False,
              "cases":[{k:c.get(k) for k in ("mode","status","runtime_status","error_code","elapsed_seconds","tool_calls")} for c in data["cases"]]},ensure_ascii=False))
    except (ValueError, KeyError):
        print("Live read-only probe failed before a complete evidence record; inspect local artifacts.")
else:
    print("No completed live read-only result; inspect local error log.")
raise SystemExit(result.returncode)

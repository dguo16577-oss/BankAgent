"""RC deterministic faults against the exact disposable Spring/PostgreSQL stack.

Reuses definitions from the earlier acceptance fixture without running its CLI
or model suite. No production routing or financial endpoint is introduced.
"""
import ast
import argparse
import hashlib
import json
from pathlib import Path
import subprocess
from datetime import datetime, timezone

ROOT = Path(__file__).resolve().parents[1]
PROJECT = "aster-final-sprint-20261020"
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("--case", choices=["lease", "scopes", "errors", "all"], default="all")
options = parser.parse_args()
for service in ("agent-runtime", "banking-core", "postgres"):
    label = subprocess.check_output(["docker", "inspect", f"{PROJECT}-{service}-1", "--format",
        '{{index .Config.Labels "com.docker.compose.project"}}'], text=True).strip()
    if label != PROJECT:
        raise SystemExit("Disposable RC scope mismatch")
if subprocess.check_output(["docker", "inspect", "aster-acceptance-20261012-banking-core-1", "--format",
                           "{{.State.Running}}"], text=True).strip() != "false":
    raise SystemExit("Stop retained stack using start.ps1 before low-load financial testing")

# Extract only the local, already reviewed fixture definitions. Never import its
# executable module (which would launch its original CLI and mutate fixtures).
source = (ROOT / "scripts/final-sprint-financial-tests.py").read_text(encoding="utf-8")
assignment = next(n for n in ast.parse(source).body if isinstance(n, ast.Assign)
                  and any(isinstance(t, ast.Name) and t.id == "PROGRAM" for t in n.targets))
embedded = ast.literal_eval(assignment.value.func.value).replace("SKIP_MODEL_VALUE", "False")
fixture = ast.parse(embedded)
nodes = [n for n in fixture.body if isinstance(n, (ast.Import, ast.ImportFrom, ast.ClassDef, ast.FunctionDef))
         or isinstance(n, ast.Assign) and any(isinstance(t, ast.Name) and t.id in {"GOAL", "SKIP_MODEL"} for t in n.targets)]
common = ast.unparse(ast.Module(body=nodes, type_ignores=[]))
PROGRAM = common + r'''
from datetime import datetime, timezone
from app.agent_v2.state_store import TaskStateConflict

async def rc_main():
    if os.environ.get('BANKING_API_BASE_URL')!='http://banking-core:8080':
        raise RuntimeError('Unexpected banking origin')
    results=[]
    async with httpx.AsyncClient(base_url='http://banking-core:8080', timeout=20) as client:
        async def login(email):
            await client.get('/customer/session')
            r=await client.post('/customer/auth/login',json={'email':email,'password':'demo-password'},headers={'X-XSRF-TOKEN':client.cookies.get('XSRF-TOKEN','')});r.raise_for_status()
            await client.get('/customer/session')
            return '; '.join(f'{k}={v}' for k,v in client.cookies.items())
        cookie=await login('alex@aster.local'); csrf=client.cookies.get('XSRF-TOKEN','')
        async def authorize(intent):
            r=await client.post('/customer/auth/step-up-challenges',json={'actionType':'TRANSFER_EXECUTE','resourceType':'TRANSFER_INTENT','resourceId':intent['id'],'resourceHash':intent['intentHash']},headers={'X-XSRF-TOKEN':csrf});r.raise_for_status()
            challenge=r.json()['id'];sms=await client.get('/customer/demo/sms/'+challenge);sms.raise_for_status()
            code=re.search(r'(?<!\d)\d{6}(?!\d)',sms.json()['messageBody']).group()
            verified=await client.post('/customer/auth/step-up-challenges/'+challenge+'/verify',json={'code':code},headers={'X-XSRF-TOKEN':csrf});verified.raise_for_status()
            return verified.json()['authorization']['id']
        async def case(name,work):
            before=snapshot();began=time.monotonic()
            try:
                data=await work(before);status='PASS'
            except Exception as exc:
                status='FAIL';data={'error_type':type(exc).__name__,'error_code':getattr(exc,'code',None)}
            results.append({'case_id':name,'status':status,'started_at':datetime.now(timezone.utc).isoformat(),'elapsed_seconds':round(time.monotonic()-began,3),'execution_level':'DETERMINISTIC_FAULT_REAL_DEPLOYED_SPRING_POSTGRES','database_before':before,'database_after':snapshot(),**data})
        async def lease(before):
            entered=asyncio.Event();release=asyncio.Event()
            class SlowGateway(BankingGateway):
                async def execute_transfer(self,c,b,k):
                    entered.set();await release.wait()
                    return await super().execute_transfer(c,b,k)
            first=AgentRuntimeV2(SlowGateway(),FixedPlanner('给张三转1元'),state_store=PostgresTaskStore())
            prepared=await first.chat('给张三转1元',cookie);assert prepared.status.value=='WAITING_CONFIRMATION'
            intent=prepared.confirmation;auth=await authorize(intent)
            body=ConfirmRequest(intent_id=intent['id'],intent_hash=intent['intentHash'],action_authorization_id=auth)
            old=asyncio.create_task(first.confirm(prepared.task_id,body,cookie))
            try:
                await asyncio.wait_for(entered.wait(),10)
                with psycopg.connect('') as c:
                    version_before=c.execute('SELECT state_version FROM agent_state.tasks WHERE task_id=%s',(prepared.task_id,)).fetchone()[0]
                    c.execute("UPDATE agent_state.tasks SET lease_until=now()-interval '1 second' WHERE task_id=%s",(prepared.task_id,))
                replacement=AgentRuntimeV2(BankingGateway(),FixedPlanner('给张三转1元'),state_store=PostgresTaskStore())
                completed=await replacement.confirm(prepared.task_id,body,cookie)
                assert completed.status.value=='SUCCEEDED' and delta(before,snapshot(),'1.00',1)
            finally:
                release.set()
            try:await old
            except BankingApiError as exc:assert exc.status==409 and exc.code=='TASK_STATE_CONFLICT'
            else:raise AssertionError('Stale worker write was accepted')
            stored=replacement.state_store.load(prepared.task_id,replacement.tasks[prepared.task_id].customer_id,replacement.tasks[prepared.task_id].session_binding)
            assert stored.receipt['id']==completed.receipt['id'] and stored.status.value=='SUCCEEDED' and stored.state_version>version_before
            assert delta(before,snapshot(),'1.00',1)
            return {'assertions':['Lease-expired slow worker cannot overwrite takeover checkpoint','Same intent/auth/key reconciles one bank effect','Persisted authoritative receipt and version retained'],'task_id':prepared.task_id,'intent_id':intent['id'],'receipt_id':completed.receipt['id'],'version_before':version_before,'version_after':stored.state_version,'trace':trace(replacement,prepared.task_id)}
        async def scopes(before):
            gateway=BankingGateway();runtime=AgentRuntimeV2(gateway,FixedPlanner('给张三转1元'),state_store=PostgresTaskStore())
            r=await runtime.chat('给张三转1元',cookie);intent=r.confirmation;auth=await authorize(intent)
            rejects=[]
            for body in [ConfirmRequest(intent_id=intent['id'],intent_hash='0'*64,action_authorization_id=auth),ConfirmRequest(intent_id='intent_other',intent_hash=intent['intentHash'],action_authorization_id=auth)]:
                try:await runtime.confirm(r.task_id,body,cookie)
                except BankingApiError as exc:rejects.append({'code':exc.code,'status':exc.status})
                else:raise AssertionError('Unbound terms accepted')
            async with httpx.AsyncClient(base_url='http://banking-core:8080') as other:
                await other.get('/customer/session')
                v=await other.post('/customer/auth/login',json={'email':'lin@aster.local','password':'demo-password'},headers={'X-XSRF-TOKEN':other.cookies.get('XSRF-TOKEN','')});v.raise_for_status()
                other_cookie='; '.join(f'{k}={v}' for k,v in other.cookies.items())
                try:await runtime.confirm(r.task_id,ConfirmRequest(intent_id=intent['id'],intent_hash=intent['intentHash'],action_authorization_id=auth),other_cookie)
                except BankingApiError as exc:assert exc.status==404;rejects.append({'code':exc.code,'status':exc.status})
                else:raise AssertionError('Cross-customer task accepted')
            assert no_money_change(before,snapshot());await runtime.cancel(r.task_id,cookie)
            return {'assertions':['Foreign intent/hash and customer cannot borrow original authorization','No bank debit or transfer'],'rejections':rejects,'task_id':r.task_id}
        async def errors(before):
            observations=[]
            class ErrorPlanner:
                def __init__(self,mode):self.mode=mode
                async def decide(self,ctx):
                    if self.mode=='INVALID':return {'type':'COMPLETE'}
                    if self.mode=='TIMEOUT':raise httpx.ReadTimeout('deterministic provider timeout')
                    response=httpx.Response(402,request=httpx.Request('POST','https://api.deepseek.com/chat/completions'))
                    raise httpx.HTTPStatusError('deterministic 402',request=response.request,response=response)
            for mode in ['INVALID','TIMEOUT','402']:
                rt=AgentRuntimeV2(BankingGateway(),ErrorPlanner(mode),state_store=PostgresTaskStore());r=await rt.chat('查询余额',cookie)
                observations.append({'mode':mode,'status':r.status.value,'error_code':r.error_code,'task_id':r.task_id})
                assert r.status.value!='SUCCEEDED' and not r.receipt
                if mode=='402':assert r.error_code=='MODEL_INSUFFICIENT_BALANCE'
                if mode=='INVALID':assert r.error_code=='MODEL_INVALID_OUTPUT'
            assert no_money_change(before,snapshot()) and snapshot()['intents']==before['intents']
            return {'assertions':['Controlled provider/timeout/invalid decisions not reported succeeded','No bank mutation; errors persisted in actual PostgreSQL'],'outcomes':observations,'limitation':'Provider faults deterministic; not real DeepSeek error responses'}
        if CASE in {'lease','all'}:await case('AB09',lease)
        if CASE in {'scopes','all'}:await case('AB03-AUTH-SCOPE',scopes)
        if CASE in {'errors','all'}:await case('AB11-PROVIDER',errors)
    print(json.dumps({'cases':results,'project':'aster-final-sprint-20261020','planner_kind':'DETERMINISTIC_TEST_FIXTURE','model_requests':0},ensure_ascii=False))
asyncio.run(rc_main())
'''
PROGRAM = "CASE=" + repr(options.case) + "\n" + PROGRAM
run_id = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S")
result = subprocess.run(["docker", "exec", "-i", PROJECT + "-agent-runtime-1", "python", "-"],
                        input=PROGRAM, text=True, capture_output=True, encoding="utf-8", timeout=180)
out = ROOT / "artifacts/rc"
out.mkdir(parents=True, exist_ok=True)
(out / f"bank-{run_id}.jsonl").write_text(result.stdout, encoding="utf-8")
(out / f"bank-{run_id}-errors.log").write_text(result.stderr, encoding="utf-8")
metadata = {"source_commit": subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=ROOT,text=True).strip(),
    "harness_sha256": hashlib.sha256(Path(__file__).read_bytes()).hexdigest(), "command": "python scripts/rc-bank-tests.py --case " + options.case,
    "exit_code": result.returncode, "artifact": f"artifacts/rc/bank-{run_id}.jsonl"}
failed = True
if result.returncode == 0 and result.stdout.strip():
    evidence = json.loads(result.stdout.strip().splitlines()[-1])
    failed = any(c["status"] != "PASS" for c in evidence["cases"])
    print(json.dumps([{k:c[k] for k in ('case_id','status','elapsed_seconds')} for c in evidence['cases']]))
metadata['exit_code'] = 1 if failed else 0
(out / f"bank-{run_id}-run.json").write_text(json.dumps(metadata,indent=2)+'\n',encoding="utf-8")
raise SystemExit(metadata['exit_code'])

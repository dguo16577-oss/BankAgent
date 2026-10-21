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
parser.add_argument("--case", choices=["lease", "scopes", "errors", "staging", "regression", "all"], default="all")
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
                alice_identity=await gateway.customer_get('/customer/session',cookie)
                bob_identity=await gateway.customer_get('/customer/session',other_cookie)
                results=await asyncio.gather(gateway.customer_get('/customer/accounts',cookie),gateway.customer_get('/customer/accounts',other_cookie))
                owner_ids=[{a['id'] for a in r['accounts']} for r in results]
                assert owner_ids[0] and owner_ids[1] and not owner_ids[0]&owner_ids[1]
                from app.agent_v2.models import Task
                from app.agent_v2.runtime import session_binding
                from app.agent_v2.multi_agent import SupervisorRegistry
                child_tasks=[Task(customer_id=identity['user']['id'],session_binding=session_binding(ck),goal='查询余额',
                    ledger=[{'step_id':'g1','goal':'查询余额','kind':'READ','evidence_tools':['list_accounts'],'dependencies':[],'status':'PENDING'}])
                    for identity,ck in [(alice_identity,cookie),(bob_identity,other_cookie)]]
                class ReadChild:
                    async def decide(self,ctx):
                        if not ctx['observations']:return PlannerDecision(type='TOOL_CALL',tool_call={'tool_name':'list_accounts','arguments':{}})
                        return PlannerDecision(type='COMPLETE',final_message='已核对账户数据。')
                registry=SupervisorRegistry(gateway,save_task=lambda _:None,specialist_factory=lambda _:ReadChild())
                delegated=await asyncio.gather(*[registry.call('delegate_financial_analysis',{'step_id':'g1','delegated_goal':'查询余额'},t,ck)
                    for t,ck in zip(child_tasks,[cookie,other_cookie])])
                assert all(o.success for o in delegated)
                for index,t in enumerate(child_tasks):
                    observed={a['id'] for o in t.observations for a in o.structured_result.get('accounts',[])}
                    assert observed==owner_ids[index] and not observed&owner_ids[1-index]
                try:await runtime.confirm(r.task_id,ConfirmRequest(intent_id=intent['id'],intent_hash=intent['intentHash'],action_authorization_id=auth),other_cookie)
                except BankingApiError as exc:assert exc.status==404;rejects.append({'code':exc.code,'status':exc.status})
                else:raise AssertionError('Cross-customer task accepted')
            assert no_money_change(before,snapshot());await runtime.cancel(r.task_id,cookie)
            return {'assertions':['Foreign intent/hash and customer cannot borrow original authorization','Concurrent trusted child scopes contain only own bank account IDs','No bank debit or transfer'],'rejections':rejects,'task_id':r.task_id,
                'customer_scope_comparison':{'customers_different':alice_identity['user']['id']!=bob_identity['user']['id'],'account_sets_disjoint':True,'owned_account_counts':[len(s) for s in owner_ids]},
                'ma07_planner_kind':'DETERMINISTIC_CHILD_TEST_FIXTURE_REAL_SPRING'}
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
        async def staging(before):
            class Staged(TwoTransferPlanner):
                async def decide(self,ctx):
                    remaining=[s for s in ctx['state']['task_ledger'] if s['status'] not in {'SUCCEEDED','CANCELLED'}]
                    index=0 if remaining[0]['step_id']=='g1' else 1
                    observations=ctx['observations'];name='张三' if index==0 else '李四'
                    if not any(o['tool_name']=='list_accounts' for o in observations):tool,args='list_accounts',{}
                    elif not any(o['tool_name']=='resolve_recipient' and o['structured_result'].get('query_reference')==name for o in observations):tool,args='resolve_recipient',{'query':name}
                    else:tool,args='prepare_transfer',{'source_account_id':'acc_current','recipient_id':'recipient_zhang' if index==0 else 'recipient_li','amount':'100.00' if index==0 else '200.00','currency':'CNY'}
                    return PlannerDecision(type='TOOL_CALL',tool_call={'tool_name':tool,'arguments':args,**({'step_id':remaining[0]['step_id']} if tool=='prepare_transfer' else {})})
            gateway=BankingGateway()
            runtime=AgentRuntimeV2(gateway,Staged(GOAL),state_store=PostgresTaskStore())
            first=await runtime.chat(GOAL,cookie);old=first.confirmation
            assert len(first.financial_plan)==2 and old['amount']['amount']=='100.00'
            second=await runtime.cancel(first.task_id,cookie,action_intent_id=old['id'])
            assert second.confirmation['amount']['amount']=='200.00' and second.confirmation['id']!=old['id']
            original=await gateway.customer_get('/customer/transfer-intents/'+old['id'],cookie)
            assert original['status']=='CANCELLED'
            try:await runtime.confirm(first.task_id,ConfirmRequest(intent_id=old['id'],intent_hash=old['intentHash']),cookie)
            except BankingApiError as exc:assert exc.status==409
            else:raise AssertionError('Cancelled first confirmation accepted')
            assert no_money_change(before,snapshot())
            result={'task_id':first.task_id,'first_plan':[x.model_dump(mode='json') for x in first.financial_plan],
                    'second_plan':[x.model_dump(mode='json') for x in second.financial_plan],
                    'old_bank_status':original['status'],'trace':trace(runtime,first.task_id),
                    'oracle_variant':'USER_APPROVED_SAFE_STAGING; not simultaneous prepare; deterministic planner not real DeepSeek'}
            await runtime.cancel(first.task_id,cookie)
            return result
        if CASE in {'staging','all'}:await case('AB01-STAGING',staging)
        if CASE in {'lease','all'}:await case('AB09',lease)
        if CASE in {'scopes','all'}:await case('AB03-AUTH-SCOPE',scopes)
        if CASE in {'errors','all'}:await case('AB11-PROVIDER',errors)
    print(json.dumps({'cases':results,'project':'aster-final-sprint-20261020','planner_kind':'DETERMINISTIC_TEST_FIXTURE','model_requests':0},ensure_ascii=False))
asyncio.run(rc_main())
'''
if options.case == "regression":
    # Run the original deterministic real-bank oracles on the new deployed
    # runtime, while retaining old artifacts and explicitly skipping the model.
    PROGRAM = embedded.replace("SKIP_MODEL=False", "SKIP_MODEL=True")
else:
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
    required = [c for c in evidence['cases'] if c['case_id'] not in {'AB01','REVISION-API','SEQUENTIAL-REAL-MODEL'}] if options.case == 'regression' else evidence['cases']
    failed = not required or any(c["status"] != "PASS" for c in required)
    print(json.dumps([{k:c.get(k) for k in ('case_id','status','elapsed_seconds')} for c in evidence['cases']]))
metadata['exit_code'] = 1 if failed else 0
(out / f"bank-{run_id}-run.json").write_text(json.dumps(metadata,indent=2)+'\n',encoding="utf-8")
raise SystemExit(metadata['exit_code'])

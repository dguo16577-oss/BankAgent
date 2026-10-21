"""Financial acceptance ONLY in the named disposable Compose project.

Actual Spring/PG effects, real-model multi-transfer, deterministic hostile
decisions, and an HTTP transport that loses a response after Spring commits.
Never targets the retained acceptance database. No credential/OTP output.
"""
import json
import hashlib
import argparse
from pathlib import Path
import subprocess

ROOT = Path(__file__).resolve().parents[1]
PROJECT = "aster-final-sprint-20261020"
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("--skip-model", action="store_true", help="Keep model cases ENVIRONMENT_BLOCKED; run independent real-bank security cases")
options = parser.parse_args()
for service in ("postgres", "banking-core", "agent-runtime"):
    actual = subprocess.check_output(["docker", "inspect", PROJECT + "-" + service + "-1", "--format",
        '{{index .Config.Labels "com.docker.compose.project"}}'], text=True).strip()
    if actual != PROJECT:
        raise SystemExit("Disposable project identity mismatch")
running = subprocess.check_output(["docker", "inspect", "aster-acceptance-20261012-banking-core-1",
    "--format", "{{.State.Running}}"], text=True).strip()
if running != "false":
    raise SystemExit("Low-load acceptance requires the retained project to be stopped first")

PROGRAM = r'''
import asyncio,copy,json,logging,os,re,time
from decimal import Decimal
import httpx,psycopg
from app.agent_v2.runtime import AgentRuntimeV2
from app.agent_v2.models import PlannerDecision,Observation
from app.agent_v2.planner import DeepSeekPlanner
from app.agent_v2.state_store import PostgresTaskStore
from app.agent_v2.completeness import update_ledger
from app.banking import BankingGateway,BankingApiError
from app.deepseek import DeepSeekClassifier
from app.task_models import ConfirmRequest
logging.getLogger('httpx').setLevel(logging.WARNING)
GOAL='给张三转100元，再给李四转200元'
SKIP_MODEL=SKIP_MODEL_VALUE
def snapshot():
    with psycopg.connect('') as c:
        return {'balances':dict(c.execute("SELECT account_id,balance::text FROM accounts ORDER BY account_id").fetchall()),
          'intents':c.execute("SELECT count(*) FROM transfer_intents WHERE customer_id='usr_aster_alex'").fetchone()[0],
          'transfers':c.execute("SELECT count(*) FROM transfers WHERE customer_id='usr_aster_alex'").fetchone()[0],
          'debits':c.execute("SELECT count(*) FROM transactions WHERE customer_id='usr_aster_alex' AND type='BANK_TRANSFER' AND direction='DEBIT'").fetchone()[0]}
def no_money_change(a,b):
    return a['balances']==b['balances'] and a['transfers']==b['transfers'] and a['debits']==b['debits']
def delta(a,b,amount,count):
    return (Decimal(a['balances']['acc_current'])-Decimal(b['balances']['acc_current'])==Decimal(amount)
            and b['transfers']-a['transfers']==count and b['debits']-a['debits']==count)
def ledger(goal):
    clauses=['给张三转100元','给李四转200元'] if goal==GOAL else [goal]
    return [{'step_id':'g'+str(i+1),'goal':q,'source_quote':q,'kind':'FINANCIAL_ACTION',
      'evidence_tools':['confirmed_transfer'],'dependencies':[],'status':'PENDING'} for i,q in enumerate(clauses)]
class FixedPlanner:
    def __init__(self,goal,amount='1.00',bad_recipient=False):self.goal,self.amount,self.bad=goal,amount,bad_recipient
    async def plan_subgoals(self,*args):return ledger(self.goal)
    async def decide(self,ctx):
        if ctx['state']['completed_actions']:return PlannerDecision(type='COMPLETE',final_message='已核实银行回执。')
        observations=ctx['observations'];tools=[o['tool_name'] for o in observations]
        if 'list_accounts' not in tools:tool,args='list_accounts',{}
        else:
            resolved=[o['structured_result'].get('query_reference') for o in observations if o['tool_name']=='resolve_recipient']
            if '张三' not in resolved:tool,args='resolve_recipient',{'query':'张三'}
            elif self.bad and '李四' not in resolved:tool,args='resolve_recipient',{'query':'李四'}
            else:tool,args='prepare_transfer',{'source_account_id':'acc_current','recipient_id':'recipient_li' if self.bad else 'recipient_zhang','amount':self.amount,'currency':'CNY'}
        return PlannerDecision(type='TOOL_CALL',tool_call={'tool_name':tool,'arguments':args,**({'step_id':'g1'} if tool=='prepare_transfer' else {})})
class TwoTransferPlanner(FixedPlanner):
    async def decide(self,ctx):
        count=len(ctx['state']['completed_actions'])
        if count==2:return PlannerDecision(type='COMPLETE',final_message='两笔银行回执已核实。')
        observations=ctx['observations'];name='张三' if count==0 else '李四'
        if not any(o['tool_name']=='list_accounts' for o in observations):tool,args='list_accounts',{}
        elif not any(o['tool_name']=='resolve_recipient' and o['structured_result'].get('query_reference')==name for o in observations):tool,args='resolve_recipient',{'query':name}
        else:tool,args='prepare_transfer',{'source_account_id':'acc_current','recipient_id':'recipient_zhang' if count==0 else 'recipient_li','amount':'100.00' if count==0 else '200.00','currency':'CNY'}
        return PlannerDecision(type='TOOL_CALL',tool_call={'tool_name':tool,'arguments':args,**({'step_id':'g1' if count==0 else 'g2'} if tool=='prepare_transfer' else {})})
class ModelMeter(httpx.AsyncBaseTransport):
    def __init__(self):self.inner=httpx.AsyncHTTPTransport();self.calls=[]
    async def handle_async_request(self,request):
        response=await self.inner.handle_async_request(request);await response.aread()
        data=response.json() if response.status_code==200 else {}
        self.calls.append({'status':response.status_code,'model':data.get('model'),'usage':data.get('usage')})
        return response
    async def aclose(self):pass
class LossProxy(httpx.AsyncBaseTransport):
    def __init__(self):self.inner=httpx.AsyncHTTPTransport();self.dropped=False;self.receipt_id=None;self.keys=[];self.committed=None
    async def handle_async_request(self,request):
        response=await self.inner.handle_async_request(request);await response.aread()
        if request.method=='POST' and request.url.path=='/customer/transfers':
            self.keys.append(request.headers.get('Idempotency-Key'))
            if response.status_code in (200,201) and not self.dropped:
                self.dropped=True;self.receipt_id=response.json().get('id');self.committed=snapshot()
                await response.aclose()
                raise httpx.ReadError('Injected post-commit response loss',request=request)
        return response
    async def aclose(self):pass
def trace(runtime,task_id):
    t=runtime.tasks[task_id]
    return {'task_id':task_id,'status':t.status.value,'ledger':t.ledger,'financial_terms':t.financial_terms,
            'decisions':t.trace,'tool_names':[o.tool_name for o in t.observations]}
async def main():
    if os.environ.get('BANKING_API_BASE_URL')!='http://banking-core:8080':raise RuntimeError('Unexpected sandbox bank origin')
    meter=ModelMeter(); results=[];gateway=BankingGateway();store=PostgresTaskStore()
    async with httpx.AsyncClient(base_url='http://banking-core:8080',timeout=20) as bank:
        await bank.get('/customer/session')
        login=await bank.post('/customer/auth/login',json={'email':'alex@aster.local','password':'demo-password'},headers={'X-XSRF-TOKEN':bank.cookies.get('XSRF-TOKEN','')});login.raise_for_status()
        await bank.get('/customer/session');csrf=bank.cookies.get('XSRF-TOKEN','')
        cookie='; '.join(f'{k}={v}' for k,v in bank.cookies.items())
        async def authorization(intent):
            r=await bank.post('/customer/auth/step-up-challenges',json={'actionType':'TRANSFER_EXECUTE','resourceType':'TRANSFER_INTENT','resourceId':intent['id'],'resourceHash':intent['intentHash']},headers={'X-XSRF-TOKEN':csrf});r.raise_for_status()
            challenge=r.json()['id'];r=await bank.get('/customer/demo/sms/'+challenge);r.raise_for_status()
            code=re.search(r'(?<!\d)\d{6}(?!\d)',r.json()['messageBody'])
            if not code:raise RuntimeError('Demo authorization code unavailable')
            r=await bank.post('/customer/auth/step-up-challenges/'+challenge+'/verify',json={'code':code.group()},headers={'X-XSRF-TOKEN':csrf});r.raise_for_status()
            return r.json()['authorization']['id']
        async def case(case_id,fn):
            before=snapshot();started=time.monotonic()
            try:
                outcome=await fn(before)
                results.append({'case_id':case_id,**outcome,'initial_state':before,'final_state':snapshot(),'elapsed_seconds':round(time.monotonic()-started,2)})
            except Exception as exc:
                results.append({'case_id':case_id,'status':'FAIL','error_type':type(exc).__name__,
                    'error_code':exc.code if isinstance(exc,BankingApiError) else 'ASSERTION_OR_TEST_FAILURE',
                    'initial_state':before,'final_state':snapshot(),'elapsed_seconds':round(time.monotonic()-started,2)})
        async def prepare_only(before):
            rt=AgentRuntimeV2(gateway,DeepSeekPlanner(DeepSeekClassifier(transport=meter)),state_store=store)
            r=await rt.chat(GOAL,cookie)
            assert r.status.value=='WAITING_CONFIRMATION'
            assert r.confirmation['amount']['amount']=='100.00' and no_money_change(before,snapshot())
            evidence=trace(rt,r.task_id)
            await rt.cancel(r.task_id,cookie)
            return {'status':'PARTIAL','oracle':'First preparation succeeds with zero debit; runtime requires independent confirmation before the second preparation',
                    'first_prepare':r.confirmation['amount'],'second_prepare_without_execution':False,'trace':evidence}
        if SKIP_MODEL:
            results.append({'case_id':'AB01','status':'ENVIRONMENT_BLOCKED','reason':'Sandbox default approved DeepSeek path failed DNS/TCP connection; no network reconfiguration attempted'})
        else:await case('AB01',prepare_only)
        async def swapped(before):
            rejected=[]
            for amount,bad in [('200.00',False),('100.00',True)]:
                rt=AgentRuntimeV2(gateway,FixedPlanner(GOAL,amount,bad),state_store=store,max_steps=6)
                r=await rt.chat(GOAL,cookie)
                assert r.status.value!='WAITING_CONFIRMATION' and no_money_change(before,snapshot()) and snapshot()['intents']==before['intents']
                rejected.append(trace(rt,r.task_id))
            return {'status':'PASS','oracle':'Swapped amount and recipient rejected before any bank intent or debit','traces':rejected}
        await case('AB02',swapped)
        shared={}
        async def sequential(before,real=True):
            rt=AgentRuntimeV2(gateway,DeepSeekPlanner(DeepSeekClassifier(transport=meter)) if real else TwoTransferPlanner(GOAL),state_store=store)
            r=await rt.chat(GOAL,cookie);intents=[];auths=[]
            for amount,recipient in [('100.00','recipient_zhang'),('200.00','recipient_li')]:
                assert r.status.value=='WAITING_CONFIRMATION'
                intent=r.confirmation;assert intent['amount']['amount']==amount and intent['recipient']['id']==recipient
                intents.append(intent);auth=await authorization(intent);auths.append(auth)
                r=await rt.confirm(r.task_id,ConfirmRequest(intent_id=intent['id'],intent_hash=intent['intentHash'],action_authorization_id=auth),cookie)
            assert r.status.value=='SUCCEEDED' and delta(before,snapshot(),'300.00',2)
            after=snapshot()
            assert Decimal(after['balances']['acc_zhang_current'])-Decimal(before['balances']['acc_zhang_current'])==100
            assert Decimal(after['balances']['acc_li_current'])-Decimal(before['balances']['acc_li_current'])==200
            shared.update(runtime=rt,task_id=r.task_id,intents=intents,auths=auths)
            return {'status':'PASS','oracle':'Two goals each independently confirmed; exact 100/200 credits and two source debits',
                    'planner_kind':'REAL_DEEPSEEK' if real else 'DETERMINISTIC_TEST_FIXTURE','trace':trace(rt,r.task_id)}
        if SKIP_MODEL:
            results.append({'case_id':'SEQUENTIAL-REAL-MODEL','status':'ENVIRONMENT_BLOCKED','reason':'No DeepSeek connection; deterministic fixture kept separate'})
        else:await case('SEQUENTIAL-REAL-MODEL',sequential)
        if 'runtime' not in shared:
            await case('SEQUENTIAL-DETERMINISTIC',lambda before:sequential(before,False))
        async def receipts(before):
            original=shared['runtime'].tasks[shared['task_id']]
            confirmations=[o for o in original.observations if o.tool_name=='confirmed_transfer']
            assert len(confirmations)==2
            outcomes=[]
            for obs,expected in [(list(reversed(confirmations)),['SUCCEEDED','SUCCEEDED']),([confirmations[0],confirmations[0]],['SUCCEEDED','PENDING'])]:
                t=original.model_copy(deep=True);t.observations=[o.model_copy(deep=True) for o in obs]
                for s in t.ledger:s['observation_floor']=0;s['status']='PENDING'
                update_ledger(t);assert [s['status'] for s in t.ledger]==expected
                outcomes.append({'expected':expected,'actual':[s['status'] for s in t.ledger]})
            assert no_money_change(before,snapshot())
            return {'status':'PASS','oracle':'Real Spring receipts bind only their own step/terms regardless of order or duplication','outcomes':outcomes}
        await case('AB08',receipts)
        async def reuse(before):
            t=shared['runtime'].tasks[shared['task_id']];intents=shared['intents'];auths=shared['auths'];key=t.financial_terms[0]['execution_key']
            body=lambda i,a:{'intentId':i['id'],'intentHash':i['intentHash'],'actionAuthorizationId':a}
            replay=await gateway.execute_transfer(cookie,body(intents[0],auths[0]),key)
            assert replay['id']==t.financial_terms[0]['receipt_id']
            rejected=[]
            for payload in [body(intents[1],auths[1]),body(intents[0],auths[1])]:
                try:await gateway.execute_transfer(cookie,payload,key)
                except BankingApiError as exc:rejected.append({'status':exc.status,'code':exc.code})
                else:raise AssertionError('Changed intent/authorization accepted under the original execution key')
            assert no_money_change(before,snapshot())
            return {'status':'PASS','oracle':'Original same-body replay returns original receipt; different intent or authorization under same key rejected','rejections':rejected}
        await case('AB04',reuse)
        async def lost(before):
            proxy=LossProxy();gw=BankingGateway(transport=proxy);goal='给张三转1元'
            rt=AgentRuntimeV2(gw,FixedPlanner(goal),state_store=store);r=await rt.chat(goal,cookie)
            assert r.status.value=='WAITING_CONFIRMATION';intent=r.confirmation;auth=await authorization(intent)
            request=ConfirmRequest(intent_id=intent['id'],intent_hash=intent['intentHash'],action_authorization_id=auth)
            uncertain=await rt.confirm(r.task_id,request,cookie)
            assert uncertain.error_code=='EXECUTION_OUTCOME_UNKNOWN' and proxy.dropped and delta(before,proxy.committed,'1.00',1)
            recovered=AgentRuntimeV2(gw,FixedPlanner(goal),state_store=PostgresTaskStore())
            done=await recovered.confirm(r.task_id,request,cookie)
            assert done.status.value=='SUCCEEDED' and done.receipt['id']==proxy.receipt_id and delta(before,snapshot(),'1.00',1)
            assert len(proxy.keys)==2 and proxy.keys[0]==proxy.keys[1]
            await proxy.inner.aclose()
            return {'status':'PASS','oracle':'HTTP response dropped only after real Spring commit; durable runtime restored same intent/auth/key and same receipt; one debit',
                    'unknown_error':uncertain.error_code,'original_and_recovered_receipt_id':done.receipt['id'],'same_execution_key':True,'trace':trace(recovered,done.task_id),
                    'limitation':'Fault proxy is an in-process HTTP transport; recovery creates a new Runtime using real PG, not an OS process kill'}
        await case('AB06',lost)
        async def revision(before,real=True):
            planner=DeepSeekPlanner(DeepSeekClassifier(transport=meter)) if real else FixedPlanner('给张三转100元','100.00')
            rt=AgentRuntimeV2(gateway,planner,state_store=store)
            first=await rt.chat('给张三转100元',cookie);assert first.status.value=='WAITING_CONFIRMATION'
            old=first.confirmation;old_auth=await authorization(old)
            if not real:planner.amount='200.00'
            revised=await rt.chat('把刚才的100改成200',cookie,first.task_id);assert revised.status.value=='WAITING_CONFIRMATION'
            assert revised.confirmation['id']!=old['id'] and revised.confirmation['amount']['amount']=='200.00'
            cancelled=await gateway.customer_get('/customer/transfer-intents/'+old['id'],cookie);assert cancelled['status']=='CANCELLED'
            try:await rt.confirm(first.task_id,ConfirmRequest(intent_id=old['id'],intent_hash=old['intentHash'],action_authorization_id=old_auth),cookie)
            except BankingApiError as exc:runtime_rejection=exc.code
            else:raise AssertionError('Old runtime confirmation accepted')
            try:await gateway.execute_transfer(cookie,{'intentId':old['id'],'intentHash':old['intentHash'],'actionAuthorizationId':old_auth},'sprint_old_'+old['id'])
            except BankingApiError as exc:bank_rejection=exc.code
            else:raise AssertionError('Cancelled bank intent executed')
            assert no_money_change(before,snapshot());await rt.cancel(first.task_id,cookie)
            return {'status':'PASS','oracle':'Bank cancelled old intent; old runtime confirmation and direct bank execution reject old authorization; new terms remain unexecuted',
                    'planner_kind':'REAL_DEEPSEEK' if real else 'DETERMINISTIC_TEST_FIXTURE',
                    'runtime_rejection':runtime_rejection,'bank_rejection':bank_rejection,'trace':trace(rt,first.task_id)}
        if SKIP_MODEL:
            results.append({'case_id':'REVISION-API','status':'ENVIRONMENT_BLOCKED','reason':'No DeepSeek connection'})
            await case('REVISION-DETERMINISTIC',lambda before:revision(before,False))
        else:await case('REVISION-API',revision)
        await bank.post('/customer/auth/logout',headers={'X-XSRF-TOKEN':csrf})
    await meter.inner.aclose()
    print(json.dumps({'project':'aster-final-sprint-20261020','execution':'ACTUAL_DEPLOYED_SOURCE_RUNTIME_REAL_SPRING_POSTGRES',
        'cases':results,'model_http_requests':meter.calls,'no_retained_database_access':True},ensure_ascii=False))
asyncio.run(main())
'''.replace('SKIP_MODEL_VALUE',repr(options.skip_model))
OUT = ROOT / "artifacts/final-sprint"
for name in ("financial-acceptance.jsonl", "financial-acceptance-errors.log"):
    old = OUT / name
    if old.exists():
        archived = OUT / (old.stem + "-" + hashlib.sha256(old.read_bytes()).hexdigest()[:12] + old.suffix)
        if not archived.exists():
            archived.write_bytes(old.read_bytes())
result = subprocess.run(["docker", "exec", "-i", PROJECT + "-agent-runtime-1", "python", "-"],
    input=PROGRAM, capture_output=True, text=True, encoding="utf-8", timeout=600)
(OUT / "financial-acceptance.jsonl").write_text(result.stdout, encoding="utf-8")
(OUT / "financial-acceptance-errors.log").write_text(result.stderr, encoding="utf-8")
if result.stdout.strip():
    try:
        data = json.loads(result.stdout.strip().splitlines()[-1])
        print(json.dumps([{k: c.get(k) for k in ("case_id", "status", "error_type", "error_code", "elapsed_seconds")}
                          for c in data["cases"]], ensure_ascii=False))
        if any(c.get("status") == "FAIL" for c in data["cases"]):
            raise SystemExit(1)
    except ValueError:
        print("No complete financial evidence JSON; inspect local errors")
else:
    print("Financial probe did not produce evidence; inspect local errors")
raise SystemExit(result.returncode)

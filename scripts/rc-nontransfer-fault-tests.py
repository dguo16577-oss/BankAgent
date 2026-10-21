"""One response-loss fault per non-transfer kind, on the disposable RC bank only."""
import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path
import subprocess

ROOT = Path(__file__).resolve().parents[1]
PROJECT = 'aster-final-sprint-20261020'
if subprocess.check_output(['docker','inspect',PROJECT+'-agent-runtime-1','--format','{{index .Config.Labels "com.docker.compose.project"}}'],text=True).strip() != PROJECT:
    raise SystemExit('Disposable scope mismatch')
if subprocess.check_output(['docker','inspect','aster-acceptance-20261012-banking-core-1','--format','{{.State.Running}}'],text=True).strip() != 'false':
    raise SystemExit('Retained bank must be stopped')
PROGRAM = r'''
import asyncio,json,re,uuid
from datetime import datetime,timedelta,timezone
import httpx,psycopg
from app.agent_v2.runtime import AgentRuntimeV2
from app.agent_v2.models import Task,Status
from app.agent_v2.state_store import PostgresTaskStore
from app.task_models import ConfirmRequest
from app.banking import BankingGateway,BankingUnavailableError

class LostResponse(BankingGateway):
    def __init__(self):super().__init__();self.calls=0;self.committed=None
    async def _mutation(self,path,cookie,body,**kwargs):
        result=await super()._mutation(path,cookie,body,**kwargs)
        if path in {'/customer/card-actions','/customer/recurring-payment-actions','/customer/scheduled-payment-actions'}:
            self.calls+=1;self.committed=result
            raise BankingUnavailableError()
        return result

def snapshot():
    with psycopg.connect('') as c:
        return {'balances':dict(c.execute('select account_id,balance::text from accounts order by account_id').fetchall()),
            'transfers':c.execute('select count(*) from transfers').fetchone()[0],
            'cards':c.execute('select count(*) from card_actions').fetchone()[0],
            'recurring':c.execute('select count(*) from recurring_payment_actions').fetchone()[0],
            'schedules':c.execute('select count(*) from scheduled_payments').fetchone()[0]}

async def main():
    results=[]
    async with httpx.AsyncClient(base_url='http://banking-core:8080',timeout=20) as client:
        await client.get('/customer/session')
        response=await client.post('/customer/auth/login',json={'email':'alex@aster.local','password':'demo-password'},headers={'X-XSRF-TOKEN':client.cookies.get('XSRF-TOKEN','')});response.raise_for_status()
        await client.get('/customer/session')
        cookie='; '.join(f'{k}={v}' for k,v in client.cookies.items());csrf=client.cookies.get('XSRF-TOKEN','')
        async def authorize(intent,action,resource):
            if intent.get('verificationRequirement')=='NONE':return None
            response=await client.post('/customer/auth/step-up-challenges',json={'actionType':action,'resourceType':resource,'resourceId':intent['id'],'resourceHash':intent['intentHash']},headers={'X-XSRF-TOKEN':csrf});response.raise_for_status()
            challenge=response.json()
            body={}
            if 'PASSWORD' in challenge['verificationRequirement']:body['password']='demo-password'
            if 'SMS_OTP' in challenge['verificationRequirement']:
                sms=await client.get('/customer/demo/sms/'+challenge['id']);sms.raise_for_status()
                body['code']=re.search(r'(?<!\d)\d{6}(?!\d)',sms.json()['messageBody']).group()
            response=await client.post('/customer/auth/step-up-challenges/'+challenge['id']+'/verify',json=body,headers={'X-XSRF-TOKEN':csrf});response.raise_for_status()
            return response.json()['authorization']['id']
        for kind in ['CARD_ACTION','RECURRING_STOP','SCHEDULE']:
            bank=LostResponse();before=snapshot();entry={'case_id':'AB07-'+kind,'initial_db':before};stage='PREPARE_FIXTURE'
            try:
                if kind=='CARD_ACTION':
                    cards=await bank.customer_get('/customer/cards',cookie)
                    card=next(row for row in cards['items'] if row['status']=='ACTIVE')
                    intent=await bank.prepare_card_action(cookie,{'cardId':card['id'],'actionType':'FREEZE'})
                    action,resource='CARD_FREEZE','CARD_ACTION_INTENT'
                elif kind=='RECURRING_STOP':
                    payments=await bank.customer_get('/customer/recurring-payments',cookie)
                    payment=next(row for row in payments['items'] if row['status']=='ACTIVE')
                    intent=await bank.prepare_stop_recurring(cookie,payment['id'])
                    action,resource='RECURRING_STOP_FUTURE_PAYMENTS','RECURRING_PAYMENT_INTENT'
                else:
                    intent=await bank.prepare_schedule_action(cookie,{'actionType':'CREATE','sourceAccountId':'acc_current','recipientId':'recipient_zhang','amount':{'amount':'1.00','currency':'CNY'},'dueAt':(datetime.now(timezone.utc)+timedelta(days=2)).isoformat(),'note':'RC disposable response-loss test'})
                    action,resource='SCHEDULED_PAYMENT_CREATE','SCHEDULE_ACTION_INTENT'
                stage='RUNTIME_CHECKPOINT'
                runtime=AgentRuntimeV2(bank,object(),state_store=PostgresTaskStore())
                binding,customer=await runtime._identity(cookie)
                task=Task(customer_id=customer,session_binding=binding,goal='Authorized disposable fault fixture',status=Status.WAITING_CONFIRMATION,active_intent=intent,active_intent_kind=kind)
                runtime._save(task)
                stage='STEP_UP'
                auth=await authorize(intent,action,resource)
                request=ConfirmRequest(intent_id=intent['id'],intent_hash=intent['intentHash'],action_authorization_id=auth)
                stage='CONFIRM_AND_DROP'
                first=await runtime.confirm(task.task_id,request,cookie)
                committed=snapshot()
                stage='RECONCILE'
                second=await runtime.confirm(task.task_id,request,cookie)
                after=snapshot()
                column={'CARD_ACTION':'cards','RECURRING_STOP':'recurring','SCHEDULE':'schedules'}[kind]
                assert bank.calls==1 and bank.committed is not None
                assert committed==after and after[column]-before[column]==1
                assert before['balances']==after['balances'] and before['transfers']==after['transfers']
                assert first.error_code=='EXECUTION_OUTCOME_UNKNOWN'
                assert second.status.value=='PARTIAL' and second.error_code=='BANKING_RESULT_UNKNOWN' and second.receipt is None
                entry.update(status='PASS',runtime_gate='PARTIAL_SAFE_UNKNOWN_NO_RECEIPT_LOOKUP',task_id=task.task_id,intent_id=intent['id'],bank_receipt_id=bank.committed['id'],execute_calls=bank.calls,first_status=first.status.value,second_status=second.status.value,after_commit_db=committed,final_db=after)
            except Exception as exc:
                entry.update(status='FAIL',stage=stage,error_type=type(exc).__name__,error_code=getattr(exc,'code','TEST_FIXTURE_OR_ASSERTION'),final_db=snapshot())
                if isinstance(exc,httpx.HTTPStatusError):entry.update(http_status=exc.response.status_code,bank_error=exc.response.json().get('code'))
                if isinstance(exc,KeyError):entry['missing_field']=str(exc)
            results.append(entry)
    print(json.dumps({'execution_level':'DETERMINISTIC_RUNTIME_REAL_SPRING_POSTGRES_COMMIT_THEN_DROP_RESPONSE','limitations':['Prepared fixture inserted by trusted test harness; not an LLM goal test','No immutable authority receipt lookup for these kinds; recovery intentionally remains PARTIAL; no automatic replay'],'cases':results}))
asyncio.run(main())
'''
stamp = datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S')
out = ROOT/'artifacts/rc-closure'
out.mkdir(parents=True,exist_ok=True)
run = subprocess.run(['docker','exec','-i',PROJECT+'-agent-runtime-1','python','-'],input=PROGRAM,text=True,capture_output=True,encoding='utf-8',timeout=180)
(out/f'nontransfer-{stamp}.jsonl').write_text(run.stdout,encoding='utf-8')
(out/f'nontransfer-{stamp}-errors.log').write_text(run.stderr,encoding='utf-8')
if run.returncode==0 and run.stdout.strip():
    data=json.loads(run.stdout.strip().splitlines()[-1])
    print(json.dumps([{'case_id':case['case_id'],'status':case['status'],'error_type':case.get('error_type'),'error_code':case.get('error_code')} for case in data['cases']]))
    raise SystemExit(0 if all(case['status']=='PASS' for case in data['cases']) else 1)
raise SystemExit(run.returncode or 1)

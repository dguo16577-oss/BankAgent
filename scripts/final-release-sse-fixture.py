"""Disposable-only live socket fault probe; no public fault-control endpoints.

Run inside the already scoped sandbox Agent container with current source in
PYTHONPATH. Uses production FastAPI/AG-UI/Runtime/PG and real Spring, with a
deterministic test Planner and precise transport gates. Never a DeepSeek score.
"""
import asyncio
import json
import os
import re
import socket
from datetime import datetime, timezone
from decimal import Decimal
from uuid import uuid4

import httpx
import psycopg
import uvicorn

from app.main import create_app
from app.agui_adapter import AgUiAdapter
from app.agent_v2.models import PlannerDecision
from app.banking import BankingGateway, BankingUnavailableError


def instant(): return datetime.now(timezone.utc).isoformat()


def snapshot():
    with psycopg.connect('') as conn:
        return {'balances':dict(conn.execute('select account_id,balance::text from accounts order by account_id').fetchall()),
                'transfers':conn.execute('select count(*) from transfers').fetchone()[0],
                'debits':conn.execute("select count(*) from transactions where direction='DEBIT' and type='BANK_TRANSFER'").fetchone()[0],
                'intents':conn.execute('select count(*) from transfer_intents').fetchone()[0]}


class Planner:
    calls=0
    async def plan_subgoals(self,goal,_):
        return [{'step_id':'g1','goal':goal,'source_quote':goal,'kind':'FINANCIAL_ACTION',
                 'evidence_tools':['confirmed_transfer'],'dependencies':[],'status':'PENDING'}]
    async def decide(self,context):
        self.calls+=1
        if context['state']['completed_actions']:
            return PlannerDecision(type='COMPLETE',final_message='银行回执已核实。')
        tools=[o['tool_name'] for o in context['observations']]
        name,args=(('list_accounts',{}) if 'list_accounts' not in tools else
                   ('resolve_recipient',{'query':'张三'}) if 'resolve_recipient' not in tools else
                   ('prepare_transfer',{'source_account_id':'acc_current','recipient_id':'recipient_zhang','amount':'1.00','currency':'CNY'}))
        return PlannerDecision(type='TOOL_CALL',tool_call={'tool_name':name,'arguments':args,
            **({'step_id':'g1'} if name=='prepare_transfer' else {})})


class Gates(BankingGateway):
    mode=None
    def arm(self,mode):
        self.mode=mode;self.reached=asyncio.Event();self.release=asyncio.Event();self.timeline=[]
    def log(self,phase):self.timeline.append({'phase':phase,'at':instant()})
    async def _mutation(self,path,cookie,body,**kwargs):
        if path=='/customer/transfers' and self.mode=='BEFORE_COMMIT':
            self.log('AUTHORIZED_REQUEST_PAUSED_BEFORE_SPRING');self.reached.set();await self.release.wait()
        result=await super()._mutation(path,cookie,body,**kwargs)
        if path=='/customer/transfers':
            self.log('SPRING_COMMITTED');self.receipt_id=result['id']
            if self.mode=='AFTER_COMMIT':
                self.log('BANK_RESPONSE_DROPPED');raise BankingUnavailableError()
        return result


async def main():
    if os.getenv('BANKING_API_BASE_URL')!='http://banking-core:8080' or os.getenv('FINAL_GATE_DISPOSABLE')!='aster-final-sprint-20261020':
        raise RuntimeError('Disposable scope missing')
    os.environ['MULTI_AGENT_ENABLED']='0';os.environ['ASTER_MCP_ENABLED']='0'
    gate=Gates();gate.arm(None);planner=Planner()
    app=create_app(gateway=gate,classifier=object(),agent_v2_planner=planner,agent_version='v2')
    adapter=app.state.agui
    # Transport-only gates wrap the actual encoder output; bank execution code is unchanged.
    class GatedAdapter(AgUiAdapter):
        async def stream(self,*args,**kwargs):
            response=await super().stream(*args,**kwargs);original=response.body_iterator
            async def parts():
                async for part in original:
                    text=part.decode() if isinstance(part,bytes) else part
                    if gate.mode=='BEFORE_SNAPSHOT' and '"STATE_SNAPSHOT"' in text:
                        gate.log('PREPARE_DURABLE_BEFORE_SNAPSHOT');gate.reached.set();await gate.release.wait()
                    yield part
            response.body_iterator=parts();return response
    app.state.agui=GatedAdapter(app.state.agent_v2)
    @app.middleware('http')
    async def response_gate(request,call_next):
        response=await call_next(request)
        if gate.mode=='AFTER_DURABLE' and request.url.path.endswith('/confirm'):
            gate.log('RECEIPT_DURABLE_BEFORE_JSON_RESPONSE');gate.reached.set();await gate.release.wait()
        return response
    # Only a loopback socket inside the disposable container; no host port or external proxy.
    server=uvicorn.Server(uvicorn.Config(app,host='127.0.0.1',port=18003,log_level='error',access_log=False))
    serving=asyncio.create_task(server.serve())
    while not server.started:
        if serving.done():await serving
        await asyncio.sleep(.05)
    results=[]
    async with httpx.AsyncClient(base_url='http://banking-core:8080',timeout=15) as bank, httpx.AsyncClient(base_url='http://127.0.0.1:18003',timeout=15) as agent:
        async def login(email):
            await bank.get('/customer/session')
            r=await bank.post('/customer/auth/login',json={'email':email,'password':'demo-password'},headers={'X-XSRF-TOKEN':bank.cookies.get('XSRF-TOKEN','')});r.raise_for_status()
            r=await bank.get('/customer/session');r.raise_for_status()
            return '; '.join(f'{k}={v}' for k,v in bank.cookies.items())
        cookie=await login('alex@aster.local')
        def headers(ck=None):return {'Cookie':ck or cookie}
        async def state(thread):
            r=await agent.get('/agent/ag-ui/thread-state/'+thread,headers=headers());r.raise_for_status();return r.json()['task']
        async def ready(thread):
            for _ in range(100):
                value=await state(thread)
                if value and value['status']!='RUNNING':return value
                await asyncio.sleep(.05)
            raise AssertionError('Task did not settle')
        async def prepare():
            thread=uuid4().hex;run=uuid4().hex
            payload={'threadId':thread,'runId':run,'state':{},'tools':[],'context':[],
                     'forwardedProps':{},'messages':[{'id':run,'role':'user','content':'给张三转1元'}]}
            r=await agent.post('/agent/ag-ui',json=payload,headers=headers());r.raise_for_status()
            assert 'RUN_FINISHED' in r.text
            value=await ready(thread)
            r=await agent.get('/agent/tasks/'+value['taskId'],headers=headers());r.raise_for_status()
            return thread,payload,r.json()
        async def authorize(intent):
            csrf=bank.cookies.get('XSRF-TOKEN','')
            r=await bank.post('/customer/auth/step-up-challenges',json={'actionType':'TRANSFER_EXECUTE','resourceType':'TRANSFER_INTENT',
                'resourceId':intent['id'],'resourceHash':intent['intentHash']},headers={'X-XSRF-TOKEN':csrf});r.raise_for_status()
            challenge=r.json()['id'];sms=await bank.get('/customer/demo/sms/'+challenge);sms.raise_for_status()
            code=re.search(r'(?<!\d)\d{6}(?!\d)',sms.json()['messageBody']).group()
            r=await bank.post('/customer/auth/step-up-challenges/'+challenge+'/verify',json={'code':code},headers={'X-XSRF-TOKEN':csrf});r.raise_for_status()
            return {'intent_id':intent['id'],'intent_hash':intent['intentHash'],'action_authorization_id':r.json()['authorization']['id']}
        async def cancel(task):
            r=await agent.post('/agent/tasks/'+task+'/cancel',json={},headers=headers());r.raise_for_status()
        review_only=os.getenv('FINAL_GATE_REVIEW_ONLY')=='1'
        if review_only:
            before=snapshot();checks=[]
            for terminal in ['CANCELLED','EXPIRED']:
                gate.arm(None);thread,_,prepared=await prepare();intent=prepared['confirmation']
                # Out-of-band authoritative state change; checkpoint intentionally
                # stays WAITING_CONFIRMATION. Only disposable test data is touched.
                with psycopg.connect('') as conn:
                    conn.execute('update transfer_intents set status=%s where intent_id=%s and status=\'PREPARED\'',(terminal,intent['id']))
                restored=await state(thread)
                response=await agent.get('/agent/tasks/'+prepared['task_id'],headers=headers());response.raise_for_status()
                assert not restored['confirmationRequired'] and not response.json()['confirmation_required']
                assert app.state.agent_v2.tasks[prepared['task_id']].active_intent is not None
                checks.append({'bank_status':terminal,'task_id':prepared['task_id'],'view':response.json(),'thread':restored})
            after=snapshot()
            assert before['balances']==after['balances'] and before['transfers']==after['transfers'] and before['debits']==after['debits']
            results.append({'case_id':'SSE09','status':'PASS','transport':'REAL_BANK_TERMINAL_STATE_AND_OWNED_RECOVERY_GET',
                'checks':checks,'database_before':before,'database_after':after,
                'fixture_note':'EXPIRED status seeded in disposable bank; clock expiry separately covered by deterministic tests.'})
        for case,mode in ([] if review_only else [('SSE01','BEFORE_SNAPSHOT'),('SSE05','PARTIAL_STREAM')]):
            before=snapshot();gate.arm(mode);thread=uuid4().hex;run=uuid4().hex
            payload={'threadId':thread,'runId':run,'state':{},'tools':[],'context':[],'forwardedProps':{},
                     'messages':[{'id':run,'role':'user','content':'给张三转1元'}]}
            chunks=[]
            async with agent.stream('POST','/agent/ag-ui',json=payload,headers=headers()) as response:
                response.raise_for_status()
                async for line in response.aiter_lines():
                    if line.startswith('data: '):chunks.append(json.loads(line[6:]))
                    if mode=='BEFORE_SNAPSHOT' and gate.reached.is_set() or mode=='PARTIAL_STREAM' and any(x['type']=='TOOL_CALL_START' for x in chunks):break
                    # For SSE01 progress events precede durable preparation; the
                    # snapshot gate wakes independently while this socket waits.
                    if mode=='BEFORE_SNAPSHOT' and chunks and chunks[-1]['type']=='TOOL_CALL_RESULT':
                        await asyncio.wait_for(gate.reached.wait(),5);break
            gate.log('SSE_CLIENT_SOCKET_CLOSED');gate.release.set()
            value=await ready(thread);assert value['status']=='WAITING_CONFIRMATION'
            counts=snapshot();assert counts['balances']==before['balances'] and counts['transfers']==before['transfers']
            calls=planner.calls
            repeat=await agent.post('/agent/ag-ui',json=payload,headers=headers());repeat.raise_for_status()
            assert planner.calls==calls and snapshot()==counts
            results.append({'case_id':case,'status':'PASS','transport':'REAL_SSE_SOCKET_CLOSE','timeline':gate.timeline,
                'sse_events_received':[x['type'] for x in chunks],'reconnected_same_run_no_model_or_bank_repeat':True,
                'task':value,'database_before':before,'database_after':counts})
            await cancel(value['taskId'])
        completed=None
        for case,mode in ([] if review_only else [('SSE02','BEFORE_COMMIT'),('SSE03','AFTER_COMMIT'),('SSE04','AFTER_DURABLE')]):
            gate.arm(None);before=snapshot();thread,_,prepared=await prepare();intent=prepared['confirmation'];body=await authorize(intent)
            gate.arm(mode)
            pending=asyncio.create_task(agent.post('/agent/tasks/'+prepared['task_id']+'/confirm',json=body,headers=headers()))
            if mode=='AFTER_COMMIT':
                response=await pending;response.raise_for_status();assert response.json()['error_code']=='EXECUTION_OUTCOME_UNKNOWN'
                unknown=await agent.get('/agent/tasks/'+prepared['task_id'],headers=headers())
                assert unknown.json()['status']=='PARTIAL' and not unknown.json()['confirmation_required']
            else:
                await asyncio.wait_for(gate.reached.wait(),10)
                if mode=='BEFORE_COMMIT':assert snapshot()['transfers']==before['transfers']
                if mode=='AFTER_DURABLE':assert app.state.agent_v2.tasks[prepared['task_id']].receipt
                pending.cancel()
                try:await pending
                except asyncio.CancelledError:pass
                gate.log('CONFIRM_CLIENT_SOCKET_CLOSED');gate.release.set()
            gate.mode=None
            for _ in range(100):
                response=await agent.get('/agent/tasks/'+prepared['task_id'],headers=headers());value=response.json()
                if value.get('receipt') or mode=='AFTER_COMMIT' and value.get('error_code')=='EXECUTION_OUTCOME_UNKNOWN':break
                await asyncio.sleep(.05)
            if mode=='AFTER_COMMIT':
                response=await agent.post('/agent/tasks/'+prepared['task_id']+'/confirm',json=body,headers=headers());response.raise_for_status();value=response.json()
            assert value.get('receipt',{}).get('id')==gate.receipt_id
            after=snapshot();assert after['transfers']==before['transfers']+1 and after['debits']==before['debits']+1
            assert Decimal(before['balances']['acc_current'])-Decimal(after['balances']['acc_current'])==Decimal('1.00')
            duplicate=await agent.post('/agent/tasks/'+prepared['task_id']+'/confirm',json=body,headers=headers());duplicate.raise_for_status()
            assert duplicate.json()['receipt']['id']==gate.receipt_id and snapshot()==after
            refreshed=await state(thread);assert refreshed['status']=='SUCCEEDED' and not refreshed['confirmationRequired']
            results.append({'case_id':case,'status':'PASS','transport':'ACTUAL_FINANCIAL_CONFIRM_JSON_NOT_SSE',
                'timeline':gate.timeline,'task_id':prepared['task_id'],'receipt_id':gate.receipt_id,
                'bank_effects':1,'duplicate_same_receipt':True,'thread_state':refreshed,'database_before':before,'database_after':after})
            completed=(prepared['task_id'],gate.receipt_id,after)
        if completed is not None:
            reloaded=await agent.get('/agent/tasks/'+completed[0],headers=headers());reloaded.raise_for_status()
            assert reloaded.json()['receipt']['id']==completed[1] and not reloaded.json()['confirmation_required']
            results.append({'case_id':'SSE06','status':'PASS','transport':'OWNED_GET_AND_THREAD_STATE',
                            'task_id':completed[0],'receipt_id':completed[1],'database_unchanged':snapshot()==completed[2]})
            task_id,receipt_id,after=completed
            new_cookie=await login('alex@aster.local')
            view=await agent.get('/agent/history/'+task_id,headers=headers(new_cookie));view.raise_for_status()
            assert any(r.get('receipt_id')==receipt_id and r['verification']=='VERIFIED_BANK_RECORD' for r in view.json()['receipts'])
            denied=await agent.get('/agent/tasks/'+task_id,headers=headers(new_cookie));assert denied.status_code==404
            results.append({'case_id':'SSE07','status':'PASS','transport':'READ_ONLY_REAUTH_HTTP','history':view.json(),'old_authority_http':404})
            other=await login('lin@aster.local')
            denied=await agent.get('/agent/history/'+task_id,headers=headers(other));assert denied.status_code==404
            assert snapshot()==after
            results.append({'case_id':'SSE08','status':'PASS','transport':'CROSS_CUSTOMER_HTTP','foreign_history_http':404,'database_unchanged':True})
    server.should_exit=True;await serving
    print(json.dumps({'execution_level':'DETERMINISTIC_PLANNER_PRODUCTION_RUNTIME_REAL_TCP_SPRING_POSTGRES',
        'model_calls':0,'cases':results,'limitations':['Socket client is httpx, not a browser. Browser evidence is separate.',
        'Financial confirmation uses JSON, not SSE; do not invent a financial SSE channel.',
        'Fresh isolated data only; test server loopback in sandbox, no external fault endpoints.']},ensure_ascii=False))


if __name__=='__main__':asyncio.run(main())

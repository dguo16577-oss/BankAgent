import copy
import json
import unittest

from app.agent_v2.history import TaskHistoryService
from app.agent_v2.models import Task, Status
from app.agent_v2.runtime import AgentRuntimeV2, session_binding
from app.banking import BankingApiError, BankingAuthenticationError


class HistoryBank:
    def __init__(self): self.calls=[]
    async def customer_get(self,path,cookie,**kwargs):
        self.calls.append((path,cookie))
        if path=='/customer/session':
            if cookie not in {'SESSION=alice','SESSION=bob'}:raise BankingAuthenticationError()
            return {'authenticated':True,'user':{'id':cookie.split('=')[1]}}
        raise AssertionError('No mutation or arbitrary endpoint allowed')

    async def customer_get_optional(self,path,cookie):
        self.calls.append((path,cookie))
        if path=='/customer/transfers/transfer_one':
            return {'id':'transfer_one','status':'COMPLETED','amount':{'amount':'10.00','currency':'CNY'}}
        raise AssertionError('Receipt path outside the optional GET allowlist')


class HistoryStore:
    def __init__(self,task): self.task=task
    def load(self,task_id,customer,binding): return None
    def history_load(self,task_id,customer): return copy.deepcopy(self.task) if task_id==self.task.task_id else None
    def history_list(self,customer): return [copy.deepcopy(self.task)]


class HistoryClosureTests(unittest.IsolatedAsyncioTestCase):
    def setup_runtime(self,pending=False):
        task=Task(customer_id='alice',session_binding=session_binding('SESSION=old-alice'),goal='转账10元',status=Status.WAITING_CONFIRMATION if pending else Status.SUCCEEDED)
        task.completed_actions=[] if pending else [{'kind':'TRANSFER','receipt_id':'transfer_one'}]
        task.active_intent={'id':'intent_one','intentHash':'private_hash'} if pending else None
        task.execution_authorization_id='private_grant'; task.execution_key='private_key'
        bank=HistoryBank();runtime=AgentRuntimeV2(bank,object(),state_store=HistoryStore(task))
        return runtime,task,bank

    async def test_new_session_reads_verified_history_without_rebinding_or_reusing_authority(self):
        runtime,task,bank=self.setup_runtime()
        with self.assertRaises(BankingApiError):await runtime.get(task.task_id,'SESSION=alice')
        view=await TaskHistoryService(runtime).get(task.task_id,'SESSION=alice')
        self.assertTrue(view['read_only']);self.assertEqual(view['task_id'],task.task_id)
        self.assertEqual(view['receipts'][0]['verification'],'VERIFIED_BANK_RECORD')
        self.assertNotIn(task.task_id,runtime.tasks)
        encoded=json.dumps(view)
        for secret in ['private_hash','private_grant','private_key','old-alice']: self.assertNotIn(secret,encoded)
        self.assertTrue(all(cookie=='SESSION=alice' for _,cookie in bank.calls))

    async def test_other_customer_and_expired_cookie_cannot_read_history(self):
        runtime,task,_=self.setup_runtime();service=TaskHistoryService(runtime)
        with self.assertRaises(BankingApiError):await service.get(task.task_id,'SESSION=bob')
        with self.assertRaises(BankingAuthenticationError):await service.get(task.task_id,'SESSION=expired')
        self.assertEqual(await service.list('SESSION=bob'),[])

    async def test_pending_history_has_no_executable_review_and_unknown_is_not_retried(self):
        runtime,task,bank=self.setup_runtime(pending=True)
        view=await TaskHistoryService(runtime).get(task.task_id,'SESSION=alice')
        self.assertFalse(view['confirmation_required']);self.assertEqual(view['next_action'],'NEW_REVIEW_REQUIRED')
        self.assertNotIn('confirmation',view)
        task.execution_uncertain=True
        view=await TaskHistoryService(runtime).get(task.task_id,'SESSION=alice')
        self.assertEqual(view['next_action'],'RECONCILE_WITH_BANK')
        self.assertEqual(len(bank.calls),2)

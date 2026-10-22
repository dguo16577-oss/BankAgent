import unittest
import copy
from datetime import datetime, timedelta, timezone

from app.agent_v2.runtime import AgentRuntimeV2
from app.banking import BankingUnavailableError
from test_agent_v2 import CancellableBank, SequencePlanner


class RecoveryReviewTests(unittest.IsolatedAsyncioTestCase):
    async def test_bank_cancelled_expired_or_executed_review_is_never_executable_after_get(self):
        for status in ['CANCELLED','EXPIRED','EXECUTED']:
            with self.subTest(status=status):
                bank=CancellableBank();runtime=AgentRuntimeV2(bank,SequencePlanner())
                result=await runtime.chat('给张三转10元','SESSION=alice')
                task=runtime.tasks[result.task_id];old=task.model_dump_json()
                bank.intents[result.confirmation['id']]=copy.deepcopy(bank.intents[result.confirmation['id']])
                bank.intents[result.confirmation['id']]['status']=status
                refreshed=await runtime.get(result.task_id,'SESSION=alice')
                self.assertFalse(refreshed.confirmation_required)
                self.assertIsNone(refreshed.confirmation)
                self.assertNotEqual(refreshed.status.value,'SUCCEEDED')
                self.assertEqual(task.model_dump_json(),old)
                self.assertEqual(bank.debits,0)

    async def test_past_expiry_or_unavailable_authority_hides_review_without_mutation(self):
        for failure in ['time','unavailable']:
            bank=CancellableBank();runtime=AgentRuntimeV2(bank,SequencePlanner())
            result=await runtime.chat('给张三转10元','SESSION=alice')
            task=runtime.tasks[result.task_id];old=task.model_dump_json()
            bank.intents[result.confirmation['id']]=copy.deepcopy(bank.intents[result.confirmation['id']])
            if failure=='time':
                bank.intents[result.confirmation['id']]['expiresAt']=(datetime.now(timezone.utc)-timedelta(seconds=1)).isoformat()
            else:
                original=bank.customer_get
                async def unavailable(path,cookie,**kwargs):
                    if path.startswith('/customer/transfer-intents/'):raise BankingUnavailableError()
                    return await original(path,cookie,**kwargs)
                bank.customer_get=unavailable
            refreshed=await runtime.get(result.task_id,'SESSION=alice')
            self.assertFalse(refreshed.confirmation_required)
            self.assertIsNone(refreshed.confirmation)
            self.assertEqual(task.model_dump_json(),old)


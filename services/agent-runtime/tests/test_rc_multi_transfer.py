import copy
import unittest

from app.agent_v2.models import PlannerDecision
from app.agent_v2.runtime import AgentRuntimeV2
from app.banking import BankingApiError
from app.task_models import ConfirmRequest
from test_agent_v2 import CancellableBank
from test_step_authorization import scenario


class MultiPlanner:
    async def plan_subgoals(self, goal, tools):
        return copy.deepcopy(scenario().ledger)

    async def decide(self, context):
        remaining=[s for s in context['state']['task_ledger'] if s['status'] not in {'SUCCEEDED','CANCELLED'}]
        if not remaining:
            return PlannerDecision(type='COMPLETE', final_message='已处理全部目标，已取消的操作没有执行。')
        step=remaining[0]; first=step['step_id']=='g1'; name='张三' if first else '李四'
        if not any(o['tool_name']=='list_accounts' for o in context['observations']):
            return PlannerDecision(type='TOOL_CALL',tool_call={'tool_name':'list_accounts','arguments':{}})
        matches=[o for o in context['observations'] if o['tool_name']=='resolve_recipient' and o['structured_result'].get('query_reference')==name]
        if not matches:
            return PlannerDecision(type='TOOL_CALL',tool_call={'tool_name':'resolve_recipient','arguments':{'query':name}})
        return PlannerDecision(type='TOOL_CALL',tool_call={'tool_name':'prepare_transfer','step_id':step['step_id'],
            'arguments':{'source_account_id':'acc_alice','recipient_id':matches[-1]['structured_result']['candidates'][0]['recipient_id'],
                'amount':'100.00' if first else '200.00','currency':'CNY'}})


class MultiTransferClosureTests(unittest.IsolatedAsyncioTestCase):
    async def test_cancel_only_first_action_preserves_second_goal_and_old_confirmation_is_invalid(self):
        bank=CancellableBank();runtime=AgentRuntimeV2(bank,MultiPlanner())
        first=await runtime.chat(scenario().goal,'SESSION=alice')
        self.assertEqual(first.status.value,'WAITING_CONFIRMATION'); self.assertEqual(bank.debits,0)
        self.assertEqual([s.execution_state for s in first.financial_plan],['FINANCIAL_ACTION_PREPARED','NOT_PREPARED'])
        old=first.confirmation
        second=await runtime.cancel(first.task_id,'SESSION=alice',action_intent_id=old['id'])
        self.assertEqual(second.status.value,'WAITING_CONFIRMATION')
        self.assertNotEqual(second.confirmation['id'],old['id'])
        self.assertEqual(second.confirmation['amount']['amount'],'200.00')
        self.assertEqual(bank.intents[old['id']]['status'],'CANCELLED')
        self.assertEqual([s.execution_state for s in second.financial_plan],['FINANCIAL_ACTION_CANCELLED','FINANCIAL_ACTION_PREPARED'])
        self.assertEqual(bank.debits,0)
        with self.assertRaises(BankingApiError):
            await runtime.confirm(first.task_id,ConfirmRequest(intent_id=old['id'],intent_hash=old['intentHash'],action_authorization_id='old-grant'),'SESSION=alice')
        self.assertEqual(bank.debits,0)

    async def test_stale_action_id_and_unknown_execution_cannot_cancel_or_advance(self):
        bank=CancellableBank();runtime=AgentRuntimeV2(bank,MultiPlanner())
        result=await runtime.chat(scenario().goal,'SESSION=alice')
        with self.assertRaises(BankingApiError):
            await runtime.cancel(result.task_id,'SESSION=alice',action_intent_id='other-intent')
        current=runtime.tasks[result.task_id];current.execution_uncertain=True
        with self.assertRaises(BankingApiError):
            await runtime.cancel(result.task_id,'SESSION=alice',action_intent_id=result.confirmation['id'])
        self.assertEqual(len(bank.intents),1);self.assertEqual(bank.debits,0)
        self.assertEqual(current.active_intent['id'],result.confirmation['id'])

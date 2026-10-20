import unittest
from datetime import datetime, timezone
from unittest.mock import AsyncMock
from app.agent_v2.amount_safety import contradicts_explicit_user_amount
from app.agent_v2.bill_analysis import period_metadata
from app.agent_v2.planner import DeepSeekPlanner
from app.agent_v2.models import PlannerDecision
from app.agent_v2.runtime import AgentRuntimeV2
from app.agent_v2.context import ContextBuilder
from app.agent_v2.models import Task
from test_agent_v2 import CancellableBank, SequencePlanner


class RegressionTests(unittest.TestCase):
    def test_runtime_ledger_and_evidence_floor_reach_planner(self):
        task=Task(session_binding='s',customer_id='a',goal='分析然后转账',ledger=[{
            'step_id':'g1','goal':'分析','kind':'ANALYZE','status':'PENDING',
            'dependencies':[],'evidence_tools':['summarize_spending'],'observation_floor':3}])
        result=ContextBuilder().build(task,[])
        self.assertEqual(result['state']['task_ledger'][0]['observation_floor'],3)
        self.assertEqual(result['state']['task_ledger'][0]['status'],'PENDING')
    def test_calendar_scope_is_not_financial_amount(self):
        turns = [{'role': 'user', 'text': '分析2026年9月消费，然后给张三转10元，先让我确认'}]
        self.assertFalse(contradicts_explicit_user_amount(turns, '10.00'))
        self.assertTrue(contradicts_explicit_user_amount(turns, '10000.00'))

    def test_date_removal_never_erases_real_amounts(self):
        for text in ('2026年9月给张三转10元和20元', '2026-09给张三转10元和20元'):
            self.assertTrue(contradicts_explicit_user_amount([{'role': 'user', 'text': text}], '10.00'))
        self.assertTrue(contradicts_explicit_user_amount([{'role': 'user', 'text': '给张三转9999年99月10元'}], '10.00'))

    def test_historical_month_not_current_partial(self):
        result = period_metadata('2026-09-01T00:00:00+08:00', '2026-09-30T23:59:59+08:00',
                                 now=datetime(2026, 10, 16, tzinfo=timezone.utc))
        self.assertFalse(result['is_partial_period'])
        self.assertEqual(result['coverage_status'], 'COMPLETE')

    def test_current_and_future_period_are_partial(self):
        result = period_metadata('2026-10-01T00:00:00+08:00', '2026-11-01T00:00:00+08:00',
                                 now=datetime(2026, 10, 16, tzinfo=timezone.utc))
        self.assertTrue(result['is_partial_period'])


class InterpretationTests(unittest.IsolatedAsyncioTestCase):
    async def test_read_query_coexists_with_pending_transfer(self):
        bank = CancellableBank()
        planner = SequencePlanner()
        runtime = AgentRuntimeV2(bank, planner)
        first = await runtime.chat('给张三转500', 'SESSION=alice')
        intent = dict(bank.intents[first.confirmation['id']])
        planner.interpret_follow_up = AsyncMock(return_value={'kind': 'NEW_QUERY', 'presentation_preference': 'TABLE'})
        decisions = iter([
            PlannerDecision(type='TOOL_CALL', tool_call={'tool_name': 'list_accounts', 'arguments': {}}),
            PlannerDecision(type='COMPLETE', final_message='已查询账户')])
        planner.decide = AsyncMock(side_effect=lambda *_: next(decisions))
        result = await runtime.chat('查我的账户', 'SESSION=alice', first.task_id)
        self.assertEqual(result.status.value, 'WAITING_CONFIRMATION')
        self.assertEqual(result.message, '已查询账户')
        self.assertEqual(bank.intents[first.confirmation['id']], intent)
        self.assertEqual(runtime.tasks[first.task_id].goal, '给张三转500')
        self.assertEqual(bank.debits, 0)

    async def test_context_is_supplied_and_new_query_is_valid(self):
        classifier = type('Classifier', (), {})()
        classifier._json_completion = AsyncMock(return_value={'kind': 'NEW_QUERY', 'presentation_preference': 'BAR_CHART'})
        planner = DeepSeekPlanner(classifier)
        result = await planner.interpret_follow_up('查一下上个月的消费，用柱状图', {'current_goal': '查转账', 'has_prepared_intent': False})
        self.assertEqual(result['kind'], 'NEW_QUERY')
        self.assertIn('current_goal', classifier._json_completion.call_args.args[1])

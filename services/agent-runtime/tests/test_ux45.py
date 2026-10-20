"""UX4.5 regression oracles; scripted model semantics, real runtime checks."""
import copy
import unittest
from datetime import datetime, timezone
from unittest.mock import AsyncMock

from app.agent_v2.bill_analysis import period_metadata
from app.agent_v2.models import Task, Observation
from app.agent_v2.presentation import build_presentation
from app.agent_v2.presentation_quality import display_quality
from app.agent_v2.runtime import AgentRuntimeV2
from test_agent_v2 import CancellableBank, SequencePlanner


def stats():
    return {'period': {'from': '2026-01-01T00:00:00+08:00', 'to': '2027-01-01T00:00:00+08:00'},
            'period_coverage': period_metadata('2026-01-01T00:00:00+08:00', '2027-01-01T00:00:00+08:00', now=datetime(2026, 10, 15, tzinfo=timezone.utc)),
            'totals_by_currency': {'CNY': {'amount': '0.30', 'currency': 'CNY'}},
            'category_breakdown': [{'currency': 'CNY', 'category': 'A', 'amount': '0.10'},
                                   {'currency': 'CNY', 'category': 'B', 'amount': '0.20'}]}


class QualityTests(unittest.TestCase):
    def test_decimal_reconciles_and_coverage_uses_actual_end(self):
        meta, issues = display_quality(stats())
        self.assertEqual(issues, [])
        self.assertEqual(meta['status'], 'PARTIAL_CURRENT_PERIOD')
        self.assertTrue(meta['covered_end'].startswith('2026-10-15'))

    def test_bad_data_is_never_a_complete_chart(self):
        for change in ('total', 'duplicate', 'currency', 'negative_refund', 'missing_amount', 'date'):
            with self.subTest(change=change):
                raw = stats()
                if change == 'total': raw['totals_by_currency']['CNY']['amount'] = '100.00'
                if change == 'duplicate': raw['category_breakdown'].append(copy.deepcopy(raw['category_breakdown'][0]))
                if change == 'currency': raw['totals_by_currency']['CNY']['currency'] = 'USD'
                if change == 'negative_refund': raw['category_breakdown'][0]['amount'] = '-0.10'
                if change == 'missing_amount': del raw['category_breakdown'][0]['amount']
                if change == 'date': raw['period_coverage']['covered_end'] = '2028-01-01T00:00:00+08:00'
                task = Task(session_binding='a', customer_id='a', goal='消费')
                task.observations.append(Observation(tool_name='summarize_spending', success=True, structured_result=raw))
                blocks = build_presentation(task)
                self.assertFalse(any(b['kind'].endswith('_CHART') for b in blocks))
                self.assertTrue(any(b['kind'] == 'TEXT' and 'Data quality' in b['text'] for b in blocks))

    def test_missing_history_is_not_complete(self):
        raw = stats()
        raw['period_coverage']['missing_periods'] = ['2026-02']
        self.assertEqual(display_quality(raw)[0]['status'], 'MISSING_PERIODS')
        raw.pop('period_coverage')
        self.assertEqual(display_quality(raw)[0]['status'], 'UNKNOWN_COVERAGE')

    def test_render_and_refresh_are_identical_and_do_not_mutate_observation(self):
        task = Task(session_binding='a', customer_id='a', goal='消费')
        task.observations.append(Observation(tool_name='summarize_spending', success=True, structured_result=stats()))
        before = task.model_dump_json()
        self.assertEqual(build_presentation(task), build_presentation(Task.model_validate_json(before)))
        self.assertEqual(task.model_dump_json(), before)


class TurnTests(unittest.IsolatedAsyncioTestCase):
    async def test_multitask_multiturn_view_change_preserves_all_intent_terms(self):
        bank = CancellableBank()
        planner = SequencePlanner()
        planner.interpret_follow_up = AsyncMock(return_value={'kind': 'PRESENTATION_CHANGE', 'presentation_preference': 'TABLE'})
        runtime = AgentRuntimeV2(bank, planner)
        for _ in range(2):
            first = await runtime.chat('给张三转500', 'SESSION=alice')
            before = copy.deepcopy(bank.intents)
            task = runtime.tasks[first.task_id]
            goal, ledger, revision = task.goal, copy.deepcopy(task.ledger), task.revision
            for preference in ('TABLE', 'BAR_CHART', 'TEXT'):
                planner.interpret_follow_up.return_value['presentation_preference'] = preference
                result = await runtime.chat('change only the view', 'SESSION=alice', first.task_id)
                self.assertEqual(result.status.value, 'WAITING_CONFIRMATION')
                self.assertEqual(bank.intents, before)
                self.assertEqual((task.goal, task.ledger, task.revision), (goal, ledger, revision))
                runtime.tasks[first.task_id] = task = Task.model_validate_json(task.model_dump_json())
            self.assertEqual(bank.debits, 0)

    async def test_unrelated_query_preserves_pending_intent(self):
        bank = CancellableBank()
        planner = SequencePlanner()
        planner.interpret_follow_up = AsyncMock(return_value={'kind': 'TASK_MODIFICATION', 'presentation_preference': 'AUTO'})
        runtime = AgentRuntimeV2(bank, planner)
        first = await runtime.chat('给张三转500', 'SESSION=alice')
        before = copy.deepcopy(bank.intents)
        result = await runtime.chat('also show my cards', 'SESSION=alice', first.task_id)
        self.assertEqual(result.error_code, 'PENDING_QUERY_CANNOT_PREPARE')
        self.assertEqual(bank.intents, before)

    async def test_interpretation_failure_does_not_cancel_or_execute(self):
        bank = CancellableBank()
        planner = SequencePlanner()
        planner.interpret_follow_up = AsyncMock(side_effect=ValueError('invalid'))
        runtime = AgentRuntimeV2(bank, planner)
        first = await runtime.chat('给张三转500', 'SESSION=alice')
        before = copy.deepcopy(bank.intents)
        result = await runtime.chat('another view', 'SESSION=alice', first.task_id)
        self.assertEqual(result.error_code, 'TURN_INTERPRETATION_UNAVAILABLE')
        self.assertEqual(bank.intents, before)
        self.assertEqual(bank.debits, 0)

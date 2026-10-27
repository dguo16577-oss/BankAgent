import copy
import json
import unittest

from app.agent_v2.planner import DeepSeekPlanner
from app.agent_v2.context import ContextBuilder
from app.agent_v2.completion_evidence import completion_observations
from app.agent_v2.models import Observation, PlannerDecision, Task
from app.agent_v2.presentation import build_presentation
from app.agent_v2.grounding import validate_analytical_reply
from app.agent_v2.runtime import AgentRuntimeV2
from test_agent_v2 import CancellableBank


def spending():
    return {
        'period': {'from': '2026-09-01T00:00:00+08:00', 'to': '2026-10-01T00:00:00+08:00'},
        'scope': {'currency': 'CNY'},
        'totals_by_currency': {'CNY': {'amount': '4973.75', 'currency': 'CNY', 'transaction_count': 12}},
        'transaction_count': 12,
        'category_breakdown': [{'currency': 'CNY', 'category': 'OTHER', 'amount': '4973.75'}],
        'top_merchants': [{'merchant_untrusted': 'long merchant ' * 30, 'amount': '2.25', 'currency': 'CNY'} for _ in range(10)],
        'period_change': {
            'comparison_from': '2026-08-01T00:00:00+08:00',
            'comparison_to': '2026-08-31T23:59:59+08:00',
            'comparison_summary': {
                'totals_by_currency': {'CNY': {'amount': '5450.00', 'currency': 'CNY', 'transaction_count': 16}},
                'transaction_count': 16,
                'category_breakdown': [{'currency': 'CNY', 'category': 'OTHER', 'amount': '5450.00'}],
            },
            'by_currency': [{'currency': 'CNY', 'current_amount': '4973.75', 'previous_amount': '5450.00', 'absolute_change': '-476.25'}],
            'coverage_comparable': False,
        },
        'source': 'CUSTOMER_TRANSACTIONS',
    }


class CompletionProjectionTests(unittest.IsolatedAsyncioTestCase):
    async def audit(self, raw):
        class Capture:
            async def _json_completion(inner, system, user, limit):
                inner.payload = json.loads(user)
                return {'missing_step_ids': []}
        model = Capture()
        await DeepSeekPlanner(model).audit_completion(
            {'goal': {'text': '比较两期总额、笔数和分类'}, 'observations': [
                {'tool_name': 'summarize_spending', 'success': True, 'structured_result': raw,
                 'trust': 'TRUSTED_BANK_STATE'}]},
            [{'step_id': 'g1', 'kind': 'ANALYZE', 'evidence_refs': [0]}], '两期结果已核实。')
        return model.payload

    async def test_both_periods_and_categories_survive_long_merchant_prefix(self):
        raw = spending()
        self.assertNotIn('comparison_summary', json.dumps(raw, ensure_ascii=False)[:1800])
        before = copy.deepcopy(raw)
        payload = await self.audit(raw)
        evidence = payload['observations'][0]
        self.assertEqual(evidence['observation_index'], 0)
        self.assertEqual(evidence['trust'], 'TRUSTED_BANK_STATE')
        result = evidence['result']
        self.assertEqual(result['period_change']['comparison_summary'], raw['period_change']['comparison_summary'])
        self.assertEqual(result['period'], raw['period'])
        self.assertEqual(result['category_breakdown'], raw['category_breakdown'])
        self.assertEqual(raw, before)

    async def test_projection_marks_oversized_data_instead_of_silently_losing_it(self):
        raw = spending()
        raw['category_breakdown'] *= 200
        evidence = (await self.audit(raw))['observations'][0]
        self.assertFalse(evidence['projection_complete'])
        self.assertTrue(evidence['omitted_paths'])
        self.assertLess(len(json.dumps(evidence)), 64000)

    async def test_comparison_cannot_disappear_behind_dictionary_order(self):
        raw = spending()
        raw['top_merchants'] *= 500
        result = (await self.audit(raw))['observations'][0]['result']
        self.assertEqual(result['period_change']['comparison_summary']['transaction_count'], 16)

    async def test_trust_error_scope_and_original_references_survive_window(self):
        context = {'observations': [{'tool_name': 'read', 'success': False, 'error': 'DENIED',
                    'trust': 'UNTRUSTED_EXTERNAL_DATA', 'structured_result': {'account_id': 'other'}} for _ in range(20)]}
        projected = completion_observations(context)
        self.assertEqual([item['observation_index'] for item in projected], list(range(4, 20)))
        self.assertFalse(projected[-1]['success'])
        self.assertEqual(projected[-1]['error'], 'DENIED')
        self.assertEqual(projected[-1]['trust'], 'UNTRUSTED_EXTERNAL_DATA')
        self.assertEqual(projected[-1]['result']['account_id'], 'other')

    async def test_context_redaction_still_precedes_audit_projection(self):
        task = Task(customer_id='alice', session_binding='test', goal='核查')
        task.observations = [Observation(tool_name='read', success=True,
            structured_result={'cookie': 'SECRET', 'execution_key': 'SECRET', 'amount': '10.00'})]
        projection = completion_observations(ContextBuilder().build(task, []))
        self.assertNotIn('SECRET', str(projection))
        self.assertEqual(projection[0]['result']['amount'], '10.00')


class ChartContractTests(unittest.IsolatedAsyncioTestCase):
    async def test_planner_directs_charts_to_renderer_without_allowlisting_scale_amounts(self):
        captured = []
        class Model:
            key = 'test'
            async def _json_completion(self, system, user, limit):
                captured.append(system)
                return {'type': 'COMPLETE', 'final_message': '请查看图表。'}
        await DeepSeekPlanner(Model()).decide({'goal': {'text': '画双币种柱状图'}})
        self.assertIn('Never draw ASCII/Unicode bars', captured[0])
        self.assertIn('RichPresentation', captured[0])

    async def chart_runtime(self, repair):
        class Bank(CancellableBank):
            async def customer_get(self, path, cookie, *, params=None):
                if path == '/customer/transactions':
                    return {'items': [{'id': 'tx_' + code, 'amount': {'amount': amount, 'currency': code},
                        'direction': 'DEBIT', 'status': 'COMPLETED', 'type': 'CARD_PAYMENT',
                        'category': 'DINING', 'occurredAt': '2026-09-15T12:00:00+08:00'}
                        for code, amount in [('CNY', '4973.75'), ('USD', '621.32')]], 'hasMore': False}
                return await super().customer_get(path, cookie, params=params)
        class Planner:
            async def decide(self, context):
                if not context['observations']:
                    return PlannerDecision(type='TOOL_CALL', tool_call={'tool_name': 'summarize_spending',
                        'arguments': {'calendar_period': {'start_date': '2026-09-01', 'end_date': '2026-09-30'}}})
                if context.get('grounding_repair'):
                    self.repair_context = context
                    return PlannerDecision(type='COMPLETE', final_message=repair)
                return PlannerDecision(type='COMPLETE', final_message='每格150 CNY/50 USD，███。')
        bank, planner = Bank(), Planner()
        runtime = AgentRuntimeV2(bank, planner)
        result = await runtime.chat('分别画2026年9月CNY和USD消费柱状图', 'SESSION=alice')
        return runtime, bank, planner, result

    async def test_bad_text_scale_is_repaired_and_bank_chart_survives_refresh(self):
        runtime, bank, planner, result = await self.chart_runtime('CNY 4973.75；USD 621.32。请查看分类图表。')
        self.assertEqual(result.status.value, 'SUCCEEDED')
        self.assertIn('axis ticks', planner.repair_context['grounding_repair']['instruction'])
        task = runtime.tasks[result.task_id]
        blocks = build_presentation(task)
        charts = [block for block in blocks if block['kind'] == 'BAR_CHART']
        self.assertEqual({block['currency'] for block in charts}, {'CNY', 'USD'})
        self.assertEqual({block['points'][0]['amount'] for block in charts}, {'4973.75', '621.32'})
        self.assertEqual(blocks, build_presentation(Task.model_validate_json(task.model_dump_json())))
        self.assertEqual(bank.debits, 0)
        self.assertEqual(bank.intents, {})
        self.assertIsNotNone(validate_analytical_reply(task, '每格100 CNY/100 USD'))

    async def test_repeated_fabricated_scale_still_fails_closed(self):
        _, bank, _, result = await self.chart_runtime('每个方块约100 CNY/100 USD')
        self.assertEqual(result.error_code, 'UNSUPPORTED_FACT')
        self.assertEqual(bank.debits, 0)
        self.assertEqual(bank.intents, {})


if __name__ == '__main__':
    unittest.main()

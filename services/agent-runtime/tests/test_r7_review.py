"""Independent r7 failures: semantic presentation selection and bounded JSON repair."""
import copy
import json
import unittest

import httpx

from app.agent_v2.models import Observation, Task
from app.agent_v2.planner import DeepSeekPlanner
from app.agent_v2.presentation import build_presentation
from app.deepseek import DeepSeekClassifier


def spending(currency=None, amount='10.00', start='2026-09-01T00:00:00+08:00'):
    codes = [currency] if currency else ['CNY', 'USD']
    return {'period': {'from': start, 'to': '2026-10-01T00:00:00+08:00'},
            'scope': {'currency': currency} if currency else {}, 'bucket_by': 'NONE',
            'totals_by_currency': {code: {'amount': amount, 'currency': code} for code in codes},
            'category_breakdown': [{'currency': code, 'category': 'DINING', 'amount': amount} for code in codes]}


class SpendingSelectionTests(unittest.TestCase):
    def render(self, *rows):
        task = Task(customer_id='alice', session_binding='private', goal='分析消费')
        task.observations = [Observation(tool_name='summarize_spending', success=True, structured_result=row) for row in rows]
        original = task.model_dump_json()
        result = build_presentation(task)
        self.assertEqual(original, task.model_dump_json())
        restored = Task.model_validate_json(original)
        self.assertEqual(result, build_presentation(restored))
        return result

    def test_currency_filtered_and_all_currency_do_not_duplicate_in_either_order(self):
        for rows in [(spending('CNY'), spending()), (spending(), spending('CNY'))]:
            blocks = self.render(*rows)
            for kind in ['SUMMARY_CARD', 'BAR_CHART', 'TABLE']:
                self.assertEqual([b['currency'] for b in blocks if b['kind'] == kind], ['CNY', 'USD'])

    def test_latest_same_scope_result_wins_without_summing(self):
        blocks = self.render(spending('CNY'), spending(None, '12.00'))
        self.assertEqual([b['amount'] for b in blocks if b['kind'] == 'SUMMARY_CARD'], ['12.00', '12.00'])

    def test_different_accounts_periods_categories_buckets_and_comparisons_remain(self):
        base = spending('CNY')
        variants = [base]
        for field, value in [('accountId', 'account-other'), ('cardId', 'card-other'), ('category', 'DINING')]:
            row = copy.deepcopy(base)
            row['scope'][field] = value
            variants.append(row)
        variants.append(spending('CNY', start='2026-08-01T00:00:00+08:00'))
        row = copy.deepcopy(base); row['bucket_by'] = 'MONTH'; variants.append(row)
        row = copy.deepcopy(base); row['period_change'] = {'comparison_from': '2026-08-01', 'comparison_to': '2026-09-01'}; variants.append(row)
        self.assertEqual(sum(b['kind'] == 'SUMMARY_CARD' for b in self.render(*variants)), 7)

    def test_latest_incomplete_coverage_is_not_hidden_by_older_complete_result(self):
        before, after = spending('CNY'), spending('CNY')
        before['period_coverage'] = {'coverage_status': 'COMPLETE'}
        after['period_coverage'] = {'coverage_status': 'MISSING_PERIODS', 'missing_periods': ['2026-09']}
        cards = [b for b in self.render(before, after) if b['kind'] == 'SUMMARY_CARD']
        self.assertEqual(len(cards), 1)
        self.assertEqual(cards[0]['coverage']['status'], 'MISSING_PERIODS')

    def test_unknown_period_does_not_drop_later_scoped_result(self):
        unknown = spending('CNY'); unknown.pop('period')
        self.assertEqual(sum(b['kind'] == 'SUMMARY_CARD' for b in self.render(unknown, spending('CNY'))), 2)

    def test_nonempty_unknown_invalid_and_unsupported_periods_never_merge(self):
        for period in [
            {'from': 'unknown', 'to': 'unknown'},
            {'from': '2026-02-30T00:00:00+08:00', 'to': '2026-03-01T00:00:00+08:00'},
            {'from': '2026-09-01', 'to': '2026-10-01'},
            {'from': '2026-09-01T00:00:00', 'to': '2026-10-01T00:00:00'},
            {'from': '2026-09-01T00:00:00+08:70', 'to': '2026-10-01T00:00:00+08:70'},
            {'from': ['unknown'], 'to': ['unknown']},
            {'from': '2026-09-01T00:00:00+08:00'},
        ]:
            with self.subTest(period=period):
                row = spending('CNY'); row['period'] = period
                self.assertEqual(sum(b['kind'] == 'SUMMARY_CARD' for b in self.render(row, copy.deepcopy(row))), 2)

    def test_equal_and_reverse_ranges_never_merge(self):
        for start in ['2026-10-01T00:00:00+08:00', '2026-10-02T00:00:00+08:00']:
            row = spending('CNY', start=start)
            self.assertEqual(sum(b['kind'] == 'SUMMARY_CARD' for b in self.render(row, copy.deepcopy(row))), 2)

    def test_invalid_comparison_range_never_merges_valid_primary_period(self):
        for comparison in [{}, {'comparison_from': 'unknown', 'comparison_to': 'unknown'},
                           {'comparison_from': '2026-08-01T00:00:00Z'}, 'unknown']:
            row = spending('CNY'); row['period_change'] = comparison
            self.assertEqual(sum(b['kind'] == 'SUMMARY_CARD' for b in self.render(row, copy.deepcopy(row))), 2)

    def test_valid_comparison_timezone_equivalence_still_merges(self):
        before, after = spending('CNY'), spending('CNY')
        before['period_change'] = {'comparison_from': '2026-08-01T00:00:00+08:00', 'comparison_to': '2026-09-01T00:00:00+08:00'}
        after['period_change'] = {'comparison_from': '2026-07-31T16:00:00Z', 'comparison_to': '2026-08-31T16:00:00Z'}
        self.assertEqual(sum(b['kind'] == 'SUMMARY_CARD' for b in self.render(before, after)), 1)

    def test_timezone_equivalence_and_submicrosecond_periods(self):
        before, after = spending('CNY'), spending('CNY')
        after['period'] = {'from': '2026-08-31T16:00:00Z', 'to': '2026-09-30T16:00:00Z'}
        self.assertEqual(sum(b['kind'] == 'SUMMARY_CARD' for b in self.render(before, after)), 1)
        before['period']['from'] = '2026-09-01T00:00:00.0000001+08:00'
        after['period']['from'] = '2026-09-01T00:00:00.0000002+08:00'
        self.assertEqual(sum(b['kind'] == 'SUMMARY_CARD' for b in self.render(before, after)), 2)

    def test_latest_bad_breakdown_does_not_restore_older_clean_chart(self):
        before, after = spending('CNY'), spending('CNY')
        after['category_breakdown'][0]['amount'] = '99.00'
        blocks = self.render(before, after)
        self.assertFalse(any(b['kind'] == 'BAR_CHART' for b in blocks))
        self.assertTrue(any('Data quality' in b.get('text', '') for b in blocks))


class JsonRepairTests(unittest.IsolatedAsyncioTestCase):
    async def run_model(self, contents):
        requests = []
        def handler(request):
            requests.append(json.loads(request.content))
            return httpx.Response(200, json={'choices': [{'finish_reason': 'stop', 'message': {
                'content': contents[min(len(requests) - 1, len(contents) - 1)],
                'reasoning_content': 'PRIVATE_REASONING'}}]})
        model = DeepSeekClassifier('test', transport=httpx.MockTransport(handler))
        result = await DeepSeekPlanner(model).decide({'goal': {'text': '给 Lin Wei 转1元'}})
        return result, requests

    async def test_format_failure_metadata_reaches_existing_retry_without_raw_content(self):
        for invalid, reason in [('```json\n{"SECRET":1}\n```', 'MARKDOWN_FENCE'), ('', 'EMPTY_CONTENT'), ('[]', 'NON_OBJECT_JSON')]:
            with self.subTest(reason=reason):
                result, requests = await self.run_model([invalid, '{"type":"ASK_USER","question":{"text":"请选择付款账户","options":[]}}'])
                self.assertEqual(result.type, 'ASK_USER')
                self.assertEqual(len(requests), 2)
                repair = json.loads(requests[1]['messages'][1]['content'])['schema_repair']
                self.assertEqual(repair['format']['reason'], reason)
                self.assertNotIn('SECRET', str(repair))
                self.assertNotIn('PRIVATE_REASONING', str(requests))

    async def test_invalid_json_is_bounded_to_two_requests(self):
        requests = []
        def handler(request):
            requests.append(request)
            return httpx.Response(200, json={'choices': [{'message': {'content': 'not json PRIVATE_SECRET'}}]})
        with self.assertRaises(json.JSONDecodeError) as failure:
            await DeepSeekPlanner(DeepSeekClassifier('test', transport=httpx.MockTransport(handler))).decide({})
        self.assertEqual(len(requests), 2)
        self.assertNotIn('PRIVATE_SECRET', str(failure.exception))

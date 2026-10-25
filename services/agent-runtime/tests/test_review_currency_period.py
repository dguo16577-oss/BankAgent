"""Currency provenance and exclusive calendar boundaries from review r2."""
import unittest
from datetime import datetime

from pydantic import ValidationError
from app.agent_v2.models import Observation, Task
from app.agent_v2.grounding import validate_analytical_reply
from app.agent_v2.tools import Spending, Transactions, AnomalyScope


class CurrencyScopeTests(unittest.TestCase):
    def setUp(self):
        self.task = Task(customer_id='alex', session_binding='session', goal='分析消费')
        self.task.observations = [Observation(tool_name='summarize_spending', success=True,
            structured_result={'totals_by_currency': {
                'CNY': {'amount': '4968', 'currency': 'CNY'},
                'USD': {'amount': '621.32', 'currency': 'USD'}},
                'categories': [{'amount': '420', 'currency': 'CNY'}, {'amount': '100', 'currency': 'USD'}]})]

    def test_report_nine_cases(self):
        cases = [
            ('分类（CNY）\n合计：621.32', False),
            ('| 分类（CNY） | 金额 |\n| 餐饮 | 100.00 |', False),
            ('分类（CNY）\n餐饮小计：100', False),
            ('CNY 621.32', False), ('USD 621.32', True),
            ('分类（USD）\n合计：621.32', True),
            ('分类（CNY） 合计：4968.00 分类（USD） 合计：621.32', True),
            ('分类（CNY） 合计：621.32 分类（USD） 合计：4968.00', False),
            ('2026年9月1日至9月30日，共10笔，覆盖30天，变化20%。合计4968.00 CNY', True)]
        for text, allowed in cases:
            with self.subTest(text=text):
                self.assertEqual(validate_analytical_reply(self.task, text) is None, allowed)

    def test_currency_columns_and_ambiguous_bare_money(self):
        for text, allowed in [
            ('| 分类 | 金额(CNY) | 金额(USD) |\n| 总额 | 4968.00 | 621.32 |', True),
            ('| 分类 | 金额(CNY) | 金额(USD) |\n| 总额 | 621.32 | 4968.00 |', False),
            ('单位 CNY/USD\n合计：621.32', False),
            ('| 类别 | 金额(CNY) | 笔数 | 占比 |\n| 住房 | 4968.00 | 10 | 20.0 |', True),
            ('| 类别 | 金额(CNY)/笔数 |\n| 日常 | 1318.00 |', False),
            ('合计：621.32', False)]:
            with self.subTest(text=text):
                self.assertEqual(validate_analytical_reply(self.task, text) is None, allowed)

    def test_explicit_money_in_one_column_cannot_relabel_another(self):
        good = '| 分类 | 金额(CNY) | 金额(USD) |\n| 总额 | CNY 4968.00 | 621.32 |'
        self.assertIsNone(validate_analytical_reply(self.task, good))
        self.assertIsNotNone(validate_analytical_reply(self.task, good.replace('| 621.32 |', '| 4968.00 |')))

    def test_merchant_pair_does_not_borrow_another_currency(self):
        self.task.observations[0].structured_result['top_merchants'] = [
            {'merchant_untrusted': 'Cafe', 'amount': {'amount': '420', 'currency': 'USD'}}]
        self.task.observations[0].structured_result['categories'].append({'amount': '420', 'currency': 'USD'})
        self.assertIsNotNone(validate_analytical_reply(self.task, 'Cafe，420.00 CNY'))
        self.assertIsNone(validate_analytical_reply(self.task, 'Cafe，420.00 USD'))


class CalendarPeriodTests(unittest.TestCase):
    def test_all_three_tools_normalize_inclusive_calendar_days(self):
        for schema in [Spending, Transactions, AnomalyScope]:
            with self.subTest(schema=schema):
                args = schema.model_validate({'calendar_period': {'start_date': '2026-09-01', 'end_date': '2026-09-30'}})
                self.assertEqual(args.date_from, '2026-09-01T00:00:00+08:00')
                self.assertEqual(args.date_to, '2026-10-01T00:00:00+08:00')
                self.assertEqual(schema.model_validate(args.model_dump()).date_to, args.date_to)

    def test_last_second_and_fraction_are_included_but_next_midnight_excluded(self):
        args = Spending.model_validate({'calendar_period': {'start_date': '2026-09-01', 'end_date': '2026-09-30'}})
        start, end = map(datetime.fromisoformat, [args.date_from, args.date_to])
        for stamp, included in [('2026-09-30T23:59:58.999+08:00', True),
                                ('2026-09-30T23:59:59+08:00', True),
                                ('2026-09-30T23:59:59.500+08:00', True),
                                ('2026-10-01T00:00:00+08:00', False)]:
            self.assertEqual(start <= datetime.fromisoformat(stamp) < end, included)

    def test_end_of_day_timestamp_requires_explicit_exact_semantics(self):
        args = {'date_from': '2026-09-01T00:00:00+08:00', 'date_to': '2026-09-30T23:59:59+08:00'}
        with self.assertRaises(ValidationError): Spending.model_validate(args)
        self.assertEqual(Spending.model_validate(dict(args, exact_time_range=True)).date_to, args['date_to'])

    def test_model_precision_flag_cannot_bypass_whole_day_request(self):
        from app.agent_v2.tools import RegistryError, ToolRegistry
        registry = ToolRegistry(object())
        args = {'date_from': '2026-09-01T00:00:00+08:00',
            'date_to': '2026-09-30T23:59:59+08:00', 'exact_time_range': True}
        with self.assertRaises(RegistryError):
            registry.validate('summarize_spending', args,
                Task(customer_id='alex', session_binding='session', goal='分析2026年9月1日至9月30日消费'))
        precise = registry.validate('summarize_spending', args,
            Task(customer_id='alex', session_binding='session', goal='查询到9月30日23:59:59为止，不含该时刻'))
        self.assertEqual(precise.date_to, args['date_to'])

    def test_leap_year_and_conflicting_boundaries(self):
        args = Spending.model_validate({'calendar_period': {'start_date': '2024-02-01', 'end_date': '2024-02-29'}})
        self.assertEqual(args.date_to, '2024-03-01T00:00:00+08:00')
        with self.assertRaises(ValidationError):
            Spending.model_validate({'calendar_period': {'start_date': '2026-02-01', 'end_date': '2026-02-29'}})
        with self.assertRaises(ValidationError):
            Spending.model_validate({'calendar_period': {'start_date': '2026-09-01', 'end_date': '2026-09-30'},
                'date_to': '2026-09-30T23:59:59+08:00'})

    def test_utc_equivalent_precise_instants_and_comparison(self):
        exact = Spending.model_validate({'date_from': '2026-09-01T00:00:00+08:00',
            'date_to': '2026-09-30T15:59:59Z', 'exact_time_range': True})
        self.assertEqual(exact.date_to, '2026-09-30T15:59:59Z')
        args = Spending.model_validate({'calendar_period': {'start_date': '2026-09-01', 'end_date': '2026-09-30'},
            'comparison_calendar_period': {'start_date': '2026-08-01', 'end_date': '2026-08-31'}})
        self.assertEqual(args.compare_to, '2026-09-01T00:00:00+08:00')

    def test_new_calendar_query_does_not_inherit_old_period(self):
        from app.agent_v2.analytical_scope import effective_arguments
        from app.agent_v2.models import ToolCall
        task = Task(customer_id='alex', session_binding='session', goal='再查9月')
        task.analytical_scope = {'date_from': '2026-08-01T00:00:00+08:00', 'date_to': '2026-09-01T00:00:00+08:00'}
        call = ToolCall(tool_name='summarize_spending', arguments={
            'calendar_period': {'start_date': '2026-09-01', 'end_date': '2026-09-30'}})
        self.assertEqual(Spending.model_validate(effective_arguments(task, call)).date_to,
                         '2026-10-01T00:00:00+08:00')

    def test_precise_scope_survives_followup_but_not_new_calendar_goal(self):
        from app.agent_v2.analytical_scope import effective_arguments, record_scope
        from app.agent_v2.models import ToolCall
        task = Task(customer_id='alex', session_binding='session', goal='精确查询')
        call = ToolCall(tool_name='summarize_spending', arguments={'date_from': '2026-09-01T00:00:00+08:00',
            'date_to': '2026-09-30T23:59:59+08:00', 'exact_time_range': True})
        record_scope(task, call, call.arguments)
        followup = ToolCall(tool_name='summarize_spending', arguments={'category': 'DINING'})
        self.assertTrue(Spending.model_validate(effective_arguments(task, followup)).exact_time_range)
        new = ToolCall(tool_name='summarize_spending', arguments={
            'calendar_period': {'start_date': '2026-09-01', 'end_date': '2026-09-30'}})
        self.assertFalse(Spending.model_validate(effective_arguments(task, new)).exact_time_range)


class RuntimeCalendarTests(unittest.IsolatedAsyncioTestCase):
    async def test_calendar_request_reaches_bank_and_task_scope_as_exclusive_instants(self):
        from app.agent_v2.runtime import AgentRuntimeV2
        from test_agent_v2 import CancellableBank
        class Bank(CancellableBank):
            requests = []
            async def customer_get(self, path, cookie, *, params=None):
                if path == '/customer/transactions': self.requests.append(dict(params))
                return await super().customer_get(path, cookie, params=params)
        class Planner:
            async def decide(self, context):
                if not context['observations']:
                    return {'type': 'TOOL_CALL', 'tool_call': {'tool_name': 'list_transactions',
                        'arguments': {'calendar_period': {'start_date': '2026-09-01', 'end_date': '2026-09-30'}}}}
                return {'type': 'COMPLETE', 'final_message': '已查询交易。'}
        bank = Bank()
        runtime = AgentRuntimeV2(bank, Planner())
        response = await runtime.chat('查询9月交易', 'SESSION=alice')
        self.assertEqual(response.status.value, 'SUCCEEDED')
        self.assertEqual(bank.requests[0]['from'], '2026-09-01T00:00:00+08:00')
        self.assertEqual(bank.requests[0]['to'], '2026-10-01T00:00:00+08:00')
        self.assertEqual(runtime.tasks[response.task_id].analytical_scope['date_to'], bank.requests[0]['to'])
        self.assertEqual(bank.debits, 0)


if __name__ == '__main__': unittest.main()

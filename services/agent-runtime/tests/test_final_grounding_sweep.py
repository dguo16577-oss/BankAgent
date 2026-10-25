"""Adjacent counterexamples found during the final bounded review."""
import unittest
from app.agent_v2.models import Task, Observation
from app.agent_v2.grounding import validate_analytical_reply, evidence


class FinalGroundingSweep(unittest.TestCase):
    def setUp(self):
        self.task = Task(customer_id='alex', session_binding='session', goal='分析消费')
        self.task.observations = [Observation(tool_name='summarize_spending', success=True,
            structured_result={'totals_by_currency': {'CNY': {'amount': '4968', 'currency': 'CNY'},
                'USD': {'amount': '621.32', 'currency': 'USD'}},
                'categories': [{'amount': '420', 'currency': 'CNY'}, {'amount': '100', 'currency': 'USD'}]})]

    def test_body_row_currency_cannot_replace_header(self):
        for separator in ['', '|---|---|---|\n']:
            head = '| 类别 | 金额(CNY) | 金额(USD) |\n' + separator
            first = '| A | 420.00 | USD 100.00 |\n'
            self.assertIsNone(validate_analytical_reply(self.task, head + first + '| B | 4968.00 | 621.32 |'))
            self.assertIsNotNone(validate_analytical_reply(self.task, head + first + '| B | 100.00 | 621.32 |'))

    def test_explicit_cell_currency_must_match_header(self):
        self.assertIsNotNone(validate_analytical_reply(self.task,
            '| 类别 | 金额(CNY) |\n|---|---|\n| A | USD 621.32 |'))

    def test_zero_is_a_financial_claim_requiring_evidence(self):
        self.assertIsNotNone(validate_analytical_reply(self.task, '本月消费总额：0.00 CNY'))
        self.task.observations.append(Observation(tool_name='summarize_spending', success=True,
            structured_result={'amount': '0.00', 'currency': 'CNY'}))
        self.assertIsNone(validate_analytical_reply(self.task, '本月消费总额：0.00 CNY'))
        self.assertIsNotNone(validate_analytical_reply(self.task, '本月消费总额：0.00 USD'))

    def test_new_ledger_evidence_floor_excludes_prior_goal_amounts(self):
        self.task.observations.append(Observation(tool_name='summarize_spending', success=True,
            structured_result={'amount': '80.00', 'currency': 'CNY'}))
        self.task.ledger = [{'step_id': 'g1', 'kind': 'ANALYZE', 'observation_floor': 1}]
        self.assertIsNotNone(validate_analytical_reply(self.task, '本期消费4968.00 CNY'))
        self.assertIsNone(validate_analytical_reply(self.task, '本期消费80.00 CNY'))
        self.assertFalse(any(row['value'] == '4968' for row in evidence(self.task)))

    def test_old_analysis_does_not_impose_bank_amount_rules_on_a_new_policy_goal(self):
        from app.agent_v2.grounding import has_current_analysis
        self.assertTrue(has_current_analysis(self.task))
        self.task.ledger = [{'step_id': 'g1', 'kind': 'READ', 'observation_floor': 1}]
        self.task.observations.append(Observation(tool_name='search_bank_knowledge', success=True,
            structured_result={'evidence': []}))
        self.assertFalse(has_current_analysis(self.task))

    def test_tampered_body_label_cannot_turn_amount_column_into_count(self):
        text = '| 类别 | 金额(CNY) |\n|---|---|\n| A | 笔数 |\n| B | 1318.00 |'
        self.assertIsNotNone(validate_analytical_reply(self.task, text))

    def test_separate_tables_keep_independent_units(self):
        text = '| 类别 | 金额(CNY) |\n| A | 4968.00 |\n\n| 类别 | 金额(USD) |\n| B | 621.32 |'
        self.assertIsNone(validate_analytical_reply(self.task, text))

    def test_knowledge_and_delegate_metadata_cannot_authorize_money(self):
        for tool in ['search_bank_knowledge', 'delegate_bank_knowledge', 'delegate_financial_analysis', 'service_navigation']:
            with self.subTest(tool=tool):
                task = self.task.model_copy(deep=True)
                task.observations.append(Observation(tool_name=tool, success=True,
                    structured_result={'amount': '10000.00', 'currency': 'CNY'}, trust='UNTRUSTED_EXTERNAL_DATA'))
                self.assertIsNotNone(validate_analytical_reply(task, '总额10000.00 CNY'))
                self.assertFalse(any(row['value'] == '10000.00' for row in evidence(task)))

    def test_fullwidth_notation_cannot_hide_unknown_money(self):
        for text in ['本月总额：人民币１２３４５．６７', '本月总额：１２３４５．６７ CNY',
                     '本月总额：ＣＮＹ １２３４５．６７', 'CNY 1e9', '1,23 CNY', 'CNY .50', '人民币一千二',
                     'CNY NaN', 'USD Infinity']:
            with self.subTest(text=text):
                self.assertIsNotNone(validate_analytical_reply(self.task, text))
        self.assertIsNone(validate_analytical_reply(self.task, '本月总额：ＣＮＹ ４９６８．００'))
        self.assertIsNone(validate_analytical_reply(self.task, '合计4968.00 CNY，仅含CNY一个币种。'))
        for text in ['总额：$4968.00', '总额：CNY 100万', '总额：100万元',
                     '分类(CNY)\n合计：1e9', '总额：CNY 1 million',
                     '总额：CNY 100w', '总额：100w CNY', '总额：0xFF CNY']:
            with self.subTest(text=text):
                self.assertIsNotNone(validate_analytical_reply(self.task, text))

    def test_count_and_clock_are_not_implicit_money(self):
        text = '2026年9月支出（截至2026-10-25 19:15 +08:00）\n总额：4968.00 CNY\n交易笔数：12'
        self.assertIsNone(validate_analytical_reply(self.task, text))
        self.assertIsNotNone(validate_analytical_reply(self.task, text + '\n消费金额：12.00 CNY'))

    def test_supported_currency_format_matrix_preserves_value_and_unit(self):
        for code in ['CNY', 'USD', 'JPY', 'EUR', 'GBP', 'HKD', 'AUD', 'SGD']:
            for amount in ['120.50', '-10.25', '0.00']:
                task = Task(customer_id='a', session_binding='s', goal='分析', observations=[
                    Observation(tool_name='summarize_spending', success=True,
                        structured_result={'amount': amount, 'currency': code})])
                formats = [f'{code} {amount}', f'{amount} {code}', f'**{amount}** {code}',
                    f'| 类别 | 金额({code}) |\n|---|---|\n| 总额 | {amount} |']
                for text in formats:
                    with self.subTest(text=text): self.assertIsNone(validate_analytical_reply(task, text))
                wrong = 'USD' if code != 'USD' else 'CNY'
                self.assertIsNotNone(validate_analytical_reply(task, f'{wrong} {amount}'))

    def test_historical_comparison_footer_neither_claims_mtd_nor_leaks_into_new_goal(self):
        from app.agent_v2.grounding import coverage_notice
        task = Task(customer_id='a', session_binding='s', goal='历史区间比较', observations=[
            Observation(tool_name='summarize_spending', success=True, structured_result={
                'period_change': {'coverage_comparable': False,
                    'left_period': {'days_covered': 30, 'is_partial_period': False},
                    'right_period': {'days_covered': 31, 'is_partial_period': False}}})])
        self.assertNotIn('MTD', coverage_notice(task))
        self.assertIn('30', coverage_notice(task))
        task.ledger = [{'step_id': 'g1', 'observation_floor': 1}]
        self.assertEqual(coverage_notice(task), '')


class EmptyCurrencySpending(unittest.IsolatedAsyncioTestCase):
    async def test_exhaustive_filtered_empty_read_proves_only_requested_currency_zero(self):
        from app.agent_v2.bill_analysis import summarize
        class EmptyBank:
            async def customer_get(self, *_, **__):
                return {'items': [], 'hasMore': False, 'nextCursor': None}
        result = await summarize(EmptyBank(), '', {'from': '2026-09-01T00:00:00+08:00',
            'to': '2026-10-01T00:00:00+08:00', 'currency': 'CNY'})
        task = Task(customer_id='alex', session_binding='s', goal='消费', observations=[
            Observation(tool_name='summarize_spending', success=True, structured_result=result)])
        self.assertIsNone(validate_analytical_reply(task, '消费总额0.00 CNY'))
        self.assertIsNotNone(validate_analytical_reply(task, '消费总额0.00 USD'))

    async def test_comparison_exposes_already_computed_detail_without_an_extra_bank_read(self):
        from app.agent_v2.bill_analysis import summarize
        from test_m19_bill_analysis import Bank, tx
        bank = Bank()
        row = tx('aug', 1, '5.00', category='OTHER')
        row['occurredAt'] = '2026-08-10T12:00:00+08:00'
        bank.rows.append(row)
        result = await summarize(bank, '', {'from': '2026-09-01T00:00:00+08:00',
            'to': '2026-10-01T00:00:00+08:00', 'currency': 'CNY'},
            compare_from='2026-08-01T00:00:00+08:00', compare_to='2026-09-01T00:00:00+08:00')
        previous = result['period_change']['comparison_summary']
        self.assertEqual(previous['totals_by_currency']['CNY']['amount'], '5.00')
        self.assertEqual(previous['category_breakdown'], [{'currency': 'CNY', 'category': 'OTHER', 'amount': '5.00'}])
        self.assertEqual(len(bank.calls), 2)
        self.assertEqual(bank.prepares, 0)


class MixedDatePrecision(unittest.TestCase):
    def test_precise_main_and_calendar_comparison_are_independent(self):
        from app.agent_v2.tools import Spending
        args = Spending.model_validate({'date_from': '2026-09-01T00:00:00+08:00',
            'date_to': '2026-09-30T23:59:59+08:00', 'exact_time_range': True,
            'comparison_calendar_period': {'start_date': '2026-08-01', 'end_date': '2026-08-31'}})
        self.assertEqual(args.date_to, '2026-09-30T23:59:59+08:00')
        self.assertEqual(args.compare_to, '2026-09-01T00:00:00+08:00')

    def test_calendar_main_and_precise_comparison_are_independent(self):
        from app.agent_v2.tools import Spending, ToolRegistry, RegistryError
        args = {'calendar_period': {'start_date': '2026-09-01', 'end_date': '2026-09-30'},
            'compare_from': '2026-08-01T00:00:00+08:00', 'compare_to': '2026-08-31T23:59:59+08:00',
            'comparison_exact_time_range': True}
        parsed = Spending.model_validate(args)
        self.assertEqual(parsed.date_to, '2026-10-01T00:00:00+08:00')
        self.assertEqual(parsed.compare_to, args['compare_to'])
        with self.assertRaises(RegistryError):
            ToolRegistry(object()).validate('summarize_spending', args,
                Task(customer_id='a', session_binding='s', goal='比较整月消费'))

    def test_explicit_primary_clock_cannot_be_widened_to_calendar(self):
        from app.agent_v2.tools import ToolRegistry, RegistryError
        task = Task(customer_id='a', session_binding='s', goal='查询2026年9月1日00:00:00到9月30日23:59:59（不含该时刻）的消费，对比8月整月。')
        with self.assertRaises(RegistryError):
            ToolRegistry(object()).validate('summarize_spending', {
                'calendar_period': {'start_date': '2026-09-01', 'end_date': '2026-09-30'}}, task)

    def test_precise_comparison_cannot_be_widened_by_separate_calendar_read(self):
        from app.agent_v2.tools import ToolRegistry, RegistryError
        task = Task(customer_id='a', session_binding='s', goal='查询2026年9月完整自然月，对比8月1日00:00:00至8月31日23:59:59（不含该时刻）的消费。')
        with self.assertRaises(RegistryError):
            ToolRegistry(object()).validate('summarize_spending', {
                'calendar_period': {'start_date': '2026-08-01', 'end_date': '2026-08-31'}}, task)
        valid = ToolRegistry(object()).validate('summarize_spending', {
            'calendar_period': {'start_date': '2026-09-01', 'end_date': '2026-09-30'},
            'compare_from': '2026-08-01T00:00:00+08:00', 'compare_to': '2026-08-31T23:59:59+08:00',
            'comparison_exact_time_range': True}, task)
        self.assertEqual(valid.compare_to, '2026-08-31T23:59:59+08:00')


if __name__ == '__main__': unittest.main()

"""CTX/FACT regressions for analytical scope and final-answer grounding."""

from __future__ import annotations

import pathlib
import sys
import unittest
from datetime import datetime, timedelta, timezone

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))

from app.agent_v2.analytical_scope import effective_arguments, record_scope
from app.agent_v2.bill_analysis import period_metadata
from app.agent_v2.grounding import evidence, validate_analytical_reply
from app.agent_v2.models import Observation, Task, ToolCall


SEP = "2026-09-01T00:00:00+08:00"
OCT = "2026-10-01T00:00:00+08:00"
NOV = "2026-11-01T00:00:00+08:00"


def call(name: str, arguments: dict, clear: list[str] | None = None) -> ToolCall:
    return ToolCall(tool_name=name, arguments=arguments, scope_clear=clear or [])


class AnalyticalContextCases(unittest.TestCase):
    def setUp(self):
        self.task = Task(session_binding="session", customer_id="alex", goal="分析消费")

    def test_CTX01_card_category_survive_new_period(self):
        first = call("summarize_spending", {"card_id": "card_1937", "category": "DINING",
                                            "date_from": OCT, "date_to": NOV})
        record_scope(self.task, first, first.arguments)
        next_call = call("summarize_spending", {"date_from": SEP, "date_to": OCT})
        self.assertEqual(effective_arguments(self.task, next_call),
                         {"card_id": "card_1937", "category": "DINING", "date_from": SEP, "date_to": OCT})

    def test_CTX02_category_only_inherits_card_and_period(self):
        self.task.analytical_scope = {"card_id": "card_1937", "date_from": SEP, "date_to": NOV}
        args = effective_arguments(self.task, call("summarize_spending", {"category": "DINING"}))
        self.assertEqual((args["card_id"], args["date_from"], args["date_to"]),
                         ("card_1937", SEP, NOV))

    def test_null_or_blank_filter_does_not_widen_scope(self):
        self.task.analytical_scope = {"card_id": "card_1937", "category": "DINING"}
        args = effective_arguments(self.task, call("summarize_spending", {"card_id": None, "category": ""}))
        self.assertEqual((args["card_id"], args["category"]), ("card_1937", "DINING"))

    def test_CTX03_new_card_replaces_old_card(self):
        self.task.analytical_scope = {"card_id": "card_1937", "category": "DINING",
                                      "account_id": "acc_old", "date_from": SEP, "date_to": NOV}
        args = effective_arguments(self.task, call("summarize_spending", {"card_id": "card_other"}))
        self.assertEqual((args["card_id"], args["category"]), ("card_other", "DINING"))
        self.assertNotIn("account_id", args)

    def test_CTX04_explicit_all_clears_category(self):
        self.task.analytical_scope = {"card_id": "card_1937", "category": "DINING",
                                      "date_from": SEP, "date_to": NOV}
        next_call = call("summarize_spending", {}, ["category"])
        args = effective_arguments(self.task, next_call)
        self.assertNotIn("category", args)
        record_scope(self.task, next_call, args)
        self.assertNotIn("category", self.task.analytical_scope)
        self.assertEqual(self.task.analytical_scope["card_id"], "card_1937")

    def test_CTX05_merchant_and_card_survive_period_change(self):
        self.task.analytical_scope = {"card_id": "card_1937", "merchant": "Repeat Cafe",
                                      "date_from": OCT, "date_to": NOV}
        args = effective_arguments(self.task, call("summarize_spending", {"date_from": SEP, "date_to": NOV}))
        self.assertEqual((args["merchant"], args["card_id"]), ("Repeat Cafe", "card_1937"))

    def test_financial_tool_receives_no_analytical_filters(self):
        self.task.analytical_scope = {"card_id": "card_1937", "category": "DINING"}
        args = {"source_account_id": "acc_1", "recipient_id": "rec_1", "amount": "100.00", "currency": "CNY"}
        self.assertEqual(effective_arguments(self.task, call("prepare_transfer", args)), args)


class FactualGroundingCases(unittest.TestCase):
    def setUp(self):
        self.task = Task(session_binding="session", customer_id="alex", goal="分析消费")
        self.task.observations = [
            Observation(tool_name="list_cards", success=True, structured_result={"cards": [
                {"card_id": "card_1937", "masked_number": "••1937"}]}),
            Observation(tool_name="summarize_spending", success=True, structured_result={
                "totals_by_currency": {"CNY": {"amount": "2544.00", "currency": "CNY"}},
                "top_merchants": [{"merchant_untrusted": "Browser Cafe", "amount": "2500.00"},
                                  {"merchant_untrusted": "Repeat Cafe", "amount": "44.00"}]}),
            Observation(tool_name="detect_transaction_anomalies", success=True, structured_result={
                "anomalies": [{"transaction_id": "tx_repeat", "merchant_untrusted": "Repeat Cafe",
                               "amount": "22.00", "currency": "CNY", "category": "DINING"}]},
                        trust="UNTRUSTED_EXTERNAL_DATA")]

    def test_FACT01_exact_transaction_merchant(self):
        self.assertIsNone(validate_analytical_reply(self.task, "tx_repeat 属于 Repeat Cafe，CNY 22.00。"))
        self.assertEqual(validate_analytical_reply(self.task, "tx_repeat 属于 Browser Cafe，CNY 22.00。"),
                         "TRANSACTION_MERCHANT_MISMATCH")
        self.assertEqual(validate_analytical_reply(self.task, "同一商户 Browser Cafe 有两笔 22.00 元。"),
                         "MERCHANT_AMOUNT_MISMATCH")
        self.assertIn("Repeat Cafe", [fact["value"] for fact in evidence(self.task)
                                      if fact["field"] == "merchant"])
        self.assertEqual(validate_analytical_reply(self.task, "- Repeated Cafe，CNY 22.00，疑似重复扣款。"),
                         "UNOBSERVED_MERCHANT_AMOUNT_PAIR")
        self.assertEqual(validate_analytical_reply(self.task, "- 重复咖啡，CNY 22.00，疑似重复扣款。"),
                         "UNOBSERVED_MERCHANT_AMOUNT_PAIR")

    def test_FACT02_card_mask_is_observed(self):
        self.assertIsNone(validate_analytical_reply(self.task, "尾号 1937 的银行卡。"))
        self.assertEqual(validate_analytical_reply(self.task, "尾号 8888 的银行卡。"), "UNOBSERVED_MASK")

    def test_FACT03_money_amount_is_observed(self):
        self.assertIsNone(validate_analytical_reply(self.task, "共 CNY 2544.00。"))
        self.assertEqual(validate_analytical_reply(self.task, "共 CNY 9999.00。"), "UNOBSERVED_AMOUNT")

    def test_period_coverage_marks_mtd_vs_full_month(self):
        now = datetime(2026, 10, 9, 12, tzinfo=timezone(timedelta(hours=8)))
        current = period_metadata(OCT, NOV, now=now)
        previous = period_metadata(SEP, OCT, now=now)
        self.assertEqual((current["days_covered"], current["is_partial_period"]), (9, True))
        self.assertEqual((previous["days_covered"], previous["is_partial_period"]), (30, False))


if __name__ == "__main__":
    unittest.main()

"""Cross-domain confirmation boundaries on the shared Agent v2 task."""

from __future__ import annotations

import pathlib
import sys
import unittest

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))

from app.agent_v2.runtime import AgentRuntimeV2
from app.agent_v2.analysis_safety import readonly_user_turn
from app.banking import BankingApiError
from app.task_models import ConfirmRequest
from test_transfer_runtime import FakeBank
from test_m20_wealth_agent import WealthBank


class MultiBank(FakeBank):
    def __init__(self):
        super().__init__()
        self.card = {"id": "card_1937", "displayName": "Travel Credit",
                     "maskedNumber": "••1937", "type": "CREDIT", "scheme": "VISA",
                     "status": "ACTIVE", "version": 0, "linkedAccount": {"id": "acc_alice"}}
        self.card_intent = None
        self.card_executions = 0

    async def customer_get(self, path, cookie, *, params=None):
        if path == "/customer/cards":
            return {"items": [self.card]}
        if path == "/customer/cards/card_1937":
            return self.card
        if path == "/customer/card-action-intents/card_intent_1":
            return self.card_intent
        if path == "/customer/transactions":
            return {"items": [], "hasMore": False, "nextCursor": None}
        return await super().customer_get(path, cookie, params=params)

    async def prepare_card_action(self, cookie, body):
        assert body == {"cardId": "card_1937", "actionType": "FREEZE"}
        self.card_intent = {
            "id": "card_intent_1", "intentHash": "c" * 64, "status": "PREPARED",
            "card": dict(self.card), "actionType": "FREEZE",
            "before": {"status": "ACTIVE", "version": 0},
            "after": {"status": "FROZEN", "version": 1},
            "verificationRequirement": "NONE",
            "expiresAt": "2026-10-09T23:59:00+08:00",
        }
        return self.card_intent

    async def execute_card_action(self, cookie, body, key):
        assert self.card_intent["status"] == "PREPARED"
        self.card_intent = {**self.card_intent, "status": "EXECUTED"}
        self.card = {**self.card, "status": "FROZEN", "version": 1}
        self.card_executions += 1
        return {"id": "card_receipt_1", "status": "SUCCEEDED", "actionType": "FREEZE"}


class SubscriptionBank(FakeBank):
    def __init__(self):
        super().__init__()
        self.mandate = {"id": "rec_rent", "displayName": "Rent", "type": "DIRECT_DEBIT",
                        "source": "BANK_MANAGED", "status": "ACTIVE", "frequency": "MONTHLY",
                        "managementCapability": "STOP_FUTURE_PAYMENTS",
                        "merchant": {"name": "Rent"},
                        "usualAmount": {"amount": "800.00", "currency": "CNY"}}
        self.reminder_intent = None
        self.stop_intent = None
        self.reminders = []
        self.reminder_executions = 0
        self.stop_executions = 0

    async def customer_get(self, path, cookie, *, params=None):
        if path == "/customer/transactions":
            return {"items": [], "hasMore": False, "nextCursor": None}
        if path == "/customer/recurring-payments":
            return {"items": [dict(self.mandate)]}
        if path == "/customer/recurring-payments/rec_rent":
            return dict(self.mandate)
        if path == "/customer/renewal-reminder-action-intents/reminder_intent_1":
            return self.reminder_intent
        if path == "/customer/recurring-payment-action-intents/stop_intent_1":
            return self.stop_intent
        return await super().customer_get(path, cookie, params=params)

    async def prepare_renewal_reminder(self, cookie, body):
        assert body["actionType"] == "CREATE" and body["recurringPaymentId"] == "rec_rent"
        self.reminder_intent = {"id": "reminder_intent_1", "intentHash": "d" * 64,
                                "status": "PREPARED", "actionType": "CREATE",
                                "targetType": "BANK_MANDATE", "recurringPaymentId": "rec_rent",
                                "dueAt": body["dueAt"], "dateBasis": "BANK_SCHEDULE",
                                "expiresAt": "2026-10-09T23:59:00+08:00"}
        return self.reminder_intent

    async def execute_renewal_reminder(self, cookie, body, key):
        assert self.reminder_intent["status"] == "PREPARED"
        self.reminder_intent["status"] = "EXECUTED"
        reminder = {"id": "rem_1", "status": "ACTIVE"}
        self.reminders.append(reminder)
        self.reminder_executions += 1
        return {"id": "reminder_receipt_1", "status": "EXECUTED", "reminder": reminder}

    async def prepare_stop_recurring(self, cookie, recurring_id):
        assert recurring_id == "rec_rent" and self.mandate["status"] == "ACTIVE"
        self.stop_intent = {"id": "stop_intent_1", "intentHash": "e" * 64,
                            "status": "PREPARED", "recurringPayment": dict(self.mandate),
                            "expiresAt": "2026-10-09T23:59:00+08:00"}
        return self.stop_intent

    async def execute_stop_recurring(self, cookie, body, key):
        assert body["actionAuthorizationId"] == "auth_stop_1"
        assert self.stop_intent["status"] == "PREPARED"
        self.stop_intent["status"] = "EXECUTED"
        self.mandate["status"] = "STOPPED"
        self.stop_executions += 1
        return {"id": "stop_receipt_1", "status": "EXECUTED",
                "recurringPayment": dict(self.mandate)}


class RejectingDualBank(MultiBank, SubscriptionBank):
    async def execute_stop_recurring(self, cookie, body, key):
        raise BankingApiError(409, "RECURRING_PAYMENT_ALREADY_STOPPED")

    async def cancel_stop_recurring(self, cookie, intent_id):
        self.stop_intent["status"] = "CANCELLED"
        return self.stop_intent


class Steps:
    def __init__(self, steps):
        self.steps = iter(steps)
        self.contexts = []

    async def decide(self, context):
        self.contexts.append(context)
        name, args, continuation = next(self.steps)
        if name == "COMPLETE":
            return {"type": "COMPLETE", "final_message": args}
        return {"type": "TOOL_CALL", "tool_call": {
            "tool_name": name, "arguments": args,
            "continue_after_confirmation": continuation}}


class CrossDomainTests(unittest.IsolatedAsyncioTestCase):
    cookie = "SESSION=alice"

    async def test_mixed_read_and_explicit_reminder_or_mandate_action_is_not_vetoed(self):
        self.assertTrue(readonly_user_turn("看看我有哪些续费提醒"))
        self.assertFalse(readonly_user_turn("查看自动续费，提醒我下次扣费，并取消 Rent 银行代扣"))
        self.assertFalse(readonly_user_turn("看看我的续费安排，帮我给 Netflix 下个月续费设置站内提醒"))

    async def test_bank_rejection_records_partial_success_and_stops_later_action(self):
        bank = RejectingDualBank()
        planner = Steps([
            ("list_cards", {}, False),
            ("get_card", {"card_id": "card_1937"}, False),
            ("prepare_card_action", {"card_id": "card_1937", "action_type": "FREEZE"}, False),
            ("list_recurring_payments", {}, False),
            ("get_recurring_payment", {"recurring_payment_id": "rec_rent"}, False),
            ("prepare_stop_recurring_payment", {"recurring_payment_id": "rec_rent"}, False),
        ])
        runtime = AgentRuntimeV2(bank, planner)
        first = await runtime.chat("先锁卡，再停 Rent 银行代扣，最后给张三转账", self.cookie)
        second = await runtime.confirm(first.task_id,
            ConfirmRequest(intent_id="card_intent_1", intent_hash="c" * 64), self.cookie)
        self.assertEqual(second.status.value, "WAITING_CONFIRMATION")
        rejected = await runtime.confirm(second.task_id,
            ConfirmRequest(intent_id="stop_intent_1", intent_hash="e" * 64,
                           action_authorization_id="auth_stop_1"), self.cookie)
        self.assertEqual(rejected.status.value, "FAILED")
        self.assertEqual(bank.card["status"], "FROZEN")
        self.assertEqual(bank.debits, 0)
        self.assertEqual(bank.stop_intent["status"], "CANCELLED")
        self.assertEqual(rejected.completed_actions[0]["kind"], "CARD_ACTION")
        self.assertEqual(rejected.failed_actions[0]["error_code"], "RECURRING_PAYMENT_ALREADY_STOPPED")
        self.assertIn("后续操作已停止", rejected.message)

    async def test_X06_wealth_research_then_purchase_stops_at_confirmation(self):
        bank = WealthBank()
        planner = Steps([
            ("list_investment_products", {}, False),
            ("get_investment_product", {"product_id": "product_cash"}, False),
            ("get_risk_profile", {}, False),
            ("check_investment_suitability", {"product_id": "product_cash"}, False),
            ("list_accounts", {"currency": "CNY", "status": "ACTIVE"}, False),
            ("prepare_investment_purchase", {"product_id": "product_cash",
                "source_account_id": "acc_current", "amount": "100.00", "currency": "CNY",
                "suitability_check_id": "suitable_1"}, True),
        ])
        runtime = AgentRuntimeV2(bank, planner)
        response = await runtime.chat("先查低风险理财和我的适当性，再准备购买 Cash Reserve 100 元", self.cookie)
        self.assertEqual(response.status.value, "WAITING_CONFIRMATION", runtime.tasks[response.task_id].trace)
        self.assertEqual(runtime.tasks[response.task_id].active_intent_kind, "INVESTMENT_PURCHASE")
        self.assertEqual(bank.prepares, 1)
        self.assertEqual(len(response.completed_actions), 0)
        self.assertEqual([row["tool"] for row in runtime.tasks[response.task_id].trace
                          if row.get("kind") == "TOOL_RESULT"][-1], "prepare_investment_purchase")

    async def test_X15_expired_cross_domain_intent_does_not_lock_card(self):
        bank = MultiBank()
        planner = Steps([
            ("list_cards", {}, False),
            ("get_card", {"card_id": "card_1937"}, False),
            ("prepare_card_action", {"card_id": "card_1937", "action_type": "FREEZE"}, True),
        ])
        runtime = AgentRuntimeV2(bank, planner)
        prepared = await runtime.chat("查一下1937卡并准备锁定，再分析异常", self.cookie)
        self.assertEqual(prepared.status.value, "WAITING_CONFIRMATION")
        bank.card_intent["status"] = "EXPIRED"
        with self.assertRaisesRegex(BankingApiError, "TRANSFER_INTENT_UNAVAILABLE"):
            await runtime.confirm(prepared.task_id,
                ConfirmRequest(intent_id="card_intent_1", intent_hash="c" * 64), self.cookie)
        self.assertEqual(bank.card["status"], "ACTIVE")
        self.assertEqual(bank.card_executions, 0)

    async def test_X16_unobserved_card_id_fails_without_mutation(self):
        bank = MultiBank()
        planner = Steps([
            ("list_cards", {}, False),
            ("prepare_card_action", {"card_id": "card_not_owned", "action_type": "FREEZE"}, True),
        ])
        runtime = AgentRuntimeV2(bank, planner)
        result = await runtime.chat("先查我的卡，再锁定一个不存在的 ID", self.cookie)
        self.assertEqual(result.status.value, "FAILED")
        self.assertEqual(bank.card["status"], "ACTIVE")
        self.assertEqual(bank.card_executions, 0)
        self.assertIsNone(runtime.tasks[result.task_id].active_intent)

    async def test_three_domains_use_two_independent_confirmations_and_resume(self):
        bank = MultiBank()
        planner = Steps([
            ("list_cards", {}, False),
            ("get_card", {"card_id": "card_1937"}, False),
            ("prepare_card_action", {"card_id": "card_1937", "action_type": "FREEZE"}, True),
            ("list_accounts", {}, False),
            ("resolve_recipient", {"query": "张三"}, False),
            ("prepare_transfer", {"source_account_id": "acc_alice",
                                  "recipient_id": "r_zhang", "amount": "100.00",
                                  "currency": "CNY"}, True),
            ("detect_transaction_anomalies", {
                "card_id": "card_1937", "date_from": "2026-10-01T00:00:00+08:00",
                "date_to": "2026-10-10T00:00:00+08:00"}, False),
            ("COMPLETE", "卡已锁定，100 元转账已完成；该卡近期没有可判定的异常消费。", False),
        ])
        runtime = AgentRuntimeV2(bank, planner)
        first = await runtime.chat("先锁定1937卡，再给张三转100，最后看卡有没有异常交易", self.cookie)
        self.assertEqual(first.status.value, "WAITING_CONFIRMATION", runtime.tasks[first.task_id].trace)
        self.assertEqual(bank.card["status"], "ACTIVE")
        self.assertEqual(bank.debits, 0)
        first_body = ConfirmRequest(intent_id="card_intent_1", intent_hash="c" * 64)
        second = await runtime.confirm(first.task_id, first_body, self.cookie)
        self.assertEqual(second.status.value, "WAITING_CONFIRMATION",
                         runtime.tasks[first.task_id].trace)
        self.assertEqual(second.confirmation["id"], "intent_1")
        self.assertEqual(bank.card["status"], "FROZEN")
        self.assertEqual(bank.debits, 0)
        with self.assertRaises(BankingApiError):
            await runtime.confirm(first.task_id, first_body, self.cookie)
        transfer_body = ConfirmRequest(intent_id="intent_1", intent_hash="a" * 64,
                                       action_authorization_id="auth_transfer_1")
        final = await runtime.confirm(first.task_id, transfer_body, self.cookie)
        self.assertEqual(final.status.value, "SUCCEEDED")
        self.assertEqual(bank.card_executions, 1)
        self.assertEqual(bank.debits, 1)
        self.assertEqual([a["kind"] for a in final.completed_actions],
                         ["CARD_ACTION", "TRANSFER"])
        self.assertEqual(len({a["receipt_id"] for a in final.completed_actions}), 2)
        self.assertEqual(planner.contexts[3]["state"]["completed_actions"][0]["kind"],
                         "CARD_ACTION")
        self.assertEqual(planner.contexts[6]["state"]["completed_actions"][1]["kind"],
                         "TRANSFER")
        self.assertNotIn("intent_hash", str(planner.contexts[6]["observations"]))
        self.assertNotIn("intentHash", str(planner.contexts[6]["observations"]))

    async def test_confirmation_always_returns_to_planner_even_when_prepare_flag_is_false(self):
        bank = MultiBank()
        planner = Steps([
            ("list_cards", {}, False),
            ("get_card", {"card_id": "card_1937"}, False),
            ("prepare_card_action", {"card_id": "card_1937", "action_type": "FREEZE"}, False),
            ("COMPLETE", "卡片已锁定；已核对银行回执。", False),
        ])
        runtime = AgentRuntimeV2(bank, planner)
        prepared = await runtime.chat("锁定尾号1937卡并告诉我处理结果", self.cookie)
        self.assertEqual(prepared.status.value, "WAITING_CONFIRMATION")
        completed = await runtime.confirm(prepared.task_id,
            ConfirmRequest(intent_id="card_intent_1", intent_hash="c" * 64), self.cookie)
        self.assertEqual(completed.status.value, "SUCCEEDED")
        self.assertIn("银行回执", completed.message)
        self.assertEqual(planner.contexts[-1]["state"]["completed_actions"][0]["kind"], "CARD_ACTION")

    async def test_later_failure_preserves_confirmed_first_action(self):
        bank = MultiBank()
        planner = Steps([
            ("list_cards", {}, False),
            ("get_card", {"card_id": "card_1937"}, False),
            ("prepare_card_action", {"card_id": "card_1937", "action_type": "FREEZE"}, True),
            ("execute_transfer", {}, False),
        ])
        runtime = AgentRuntimeV2(bank, planner)
        prepared = await runtime.chat("锁卡后再转账", self.cookie)
        final = await runtime.confirm(prepared.task_id,
            ConfirmRequest(intent_id="card_intent_1", intent_hash="c" * 64), self.cookie)
        self.assertEqual(final.status.value, "FAILED")
        self.assertEqual(bank.card["status"], "FROZEN")
        self.assertEqual(bank.debits, 0)
        self.assertEqual(len(final.completed_actions), 1)
        self.assertIn("不会自动撤销", final.message)

    async def test_SUB20_one_task_reminder_then_independent_bank_stop_confirmation(self):
        bank = SubscriptionBank()
        planner = Steps([
            ("list_recurring_payments", {}, False),
            ("detect_recurring_payments", {}, False),
            ("get_recurring_payment", {"recurring_payment_id": "rec_rent"}, False),
            ("prepare_renewal_reminder", {"action_type": "CREATE",
                "recurring_payment_id": "rec_rent", "due_at": "2026-10-15T09:00:00+08:00",
                "time_zone": "Asia/Hong_Kong"}, True),
            ("prepare_stop_recurring_payment", {"recurring_payment_id": "rec_rent"}, True),
            ("list_recurring_payments", {}, False),
            ("COMPLETE", "应用内提醒已创建，指定的银行代扣已撤销；第三方会员状态未知。", False),
        ])
        runtime = AgentRuntimeV2(bank, planner)
        first = await runtime.chat("查看自动续费，提醒我 Rent 下次扣费，并取消 Rent 银行代扣", self.cookie)
        self.assertEqual(first.status.value, "WAITING_CONFIRMATION", runtime.tasks[first.task_id].trace)
        self.assertEqual(bank.reminder_executions, 0)
        self.assertEqual(bank.stop_executions, 0)
        second = await runtime.confirm(first.task_id,
            ConfirmRequest(intent_id="reminder_intent_1", intent_hash="d" * 64), self.cookie)
        self.assertEqual(second.status.value, "WAITING_CONFIRMATION", runtime.tasks[first.task_id].trace)
        self.assertEqual(bank.reminder_executions, 1)
        self.assertEqual(bank.stop_executions, 0)
        self.assertEqual(bank.mandate["status"], "ACTIVE")
        final = await runtime.confirm(first.task_id,
            ConfirmRequest(intent_id="stop_intent_1", intent_hash="e" * 64,
                           action_authorization_id="auth_stop_1"), self.cookie)
        self.assertEqual(final.status.value, "SUCCEEDED", runtime.tasks[first.task_id].trace)
        self.assertEqual(bank.stop_executions, 1)
        self.assertEqual(bank.mandate["status"], "STOPPED")
        self.assertEqual(len(bank.reminders), 1)
        self.assertEqual([action["kind"] for action in final.completed_actions],
                         ["RENEWAL_REMINDER", "RECURRING_STOP"])
        self.assertEqual(planner.contexts[-1]["observations"][-2]["tool_name"],
                         "confirmed_recurring_stop")

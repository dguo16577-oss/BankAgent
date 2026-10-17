"""M22 read-only detection boundaries using owner-scoped banking responses."""

from __future__ import annotations

import pathlib
import sys
import unittest
from datetime import datetime, timedelta, timezone

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))

from app.agent_v2.models import Observation, Task
from app.agent_v2.recurring_analysis import detect_recurring, normalize_merchant
from app.agent_v2.tools import RegistryError, ToolRegistry


TZ = timezone(timedelta(hours=8))
NOW = datetime(2026, 10, 9, 10, tzinfo=TZ)


def charge(ident: str, year: int, month: int, day: int, amount: str, merchant: str,
           currency: str = "CNY", *, status: str = "COMPLETED", direction: str = "DEBIT",
           kind: str = "CARD_PAYMENT") -> dict:
    return {"id": ident, "accountId": "acc_alex", "status": status, "direction": direction,
            "type": kind, "category": "SUBSCRIPTIONS", "merchant": {"name": merchant},
            "occurredAt": datetime(year, month, day, 12, tzinfo=TZ).isoformat(),
            "amount": {"amount": amount, "currency": currency}}


class Bank:
    def __init__(self, rows: list[dict], recurring: list[dict] | None = None):
        self.rows = rows
        self.recurring = recurring or []
        self.calls: list[tuple[str, dict | None]] = []

    async def customer_get(self, path: str, _cookie: str, *, params: dict | None = None) -> dict:
        self.calls.append((path, params))
        if path == "/customer/recurring-payments":
            return {"items": self.recurring}
        if path.startswith("/customer/recurring-payments/"):
            return next(row for row in self.recurring if row["id"] == path.rsplit("/", 1)[1])
        if path == "/customer/transactions":
            matches = [row for row in self.rows if params["from"] <= row["occurredAt"] < params["to"]
                       and row["status"] == params["status"] and row["direction"] == params["direction"]]
            start = int(params.get("cursor", "0"))
            end = start + params["limit"]
            return {"items": matches[start:end], "hasMore": end < len(matches),
                    "nextCursor": str(end) if end < len(matches) else None}
        raise AssertionError(path)


class RecurringAnalysisCases(unittest.IsolatedAsyncioTestCase):
    async def test_SUB02_monthly_with_variable_amount_and_merchant_normalization(self):
        bank = Bank([charge("s1", 2026, 7, 12, "10.00", "Stream* Invoice A1234"),
                     charge("s2", 2026, 8, 12, "10.50", "STREAM Invoice B1234"),
                     charge("s3", 2026, 9, 12, "9.90", "Stream Invoice C1234")])
        result = await detect_recurring(bank, "SESSION=alex", as_of=NOW)
        self.assertEqual(len(result["items"]), 1)
        item = result["items"][0]
        self.assertEqual(item["cadence"], "MONTHLY")
        self.assertEqual(item["identification_status"], "DETECTED_PATTERN")
        self.assertEqual(item["management_capability"], "NONE")
        self.assertEqual(item["estimated_next_charge_date"], "2026-10-12")
        self.assertEqual(item["evidence_transaction_ids"], ["s1", "s2", "s3"])
        self.assertEqual(normalize_merchant("STREAM Invoice C1234"), "stream")

    async def test_SUB03_annual_pattern_is_only_estimate(self):
        bank = Bank([charge("a1", 2024, 10, 12, "99.00", "Annual Service"),
                     charge("a2", 2025, 10, 12, "99.00", "Annual Service")])
        result = await detect_recurring(bank, "SESSION=alex", as_of=NOW)
        self.assertEqual(result["items"][0]["cadence"], "YEARLY")
        self.assertEqual(result["items"][0]["date_basis"], "ESTIMATED_FROM_HISTORY")

    async def test_SUB04_irregular_and_refunds_do_not_become_subscriptions(self):
        bank = Bank([charge("i1", 2026, 7, 1, "10.00", "Irregular"),
                     charge("i2", 2026, 8, 15, "10.00", "Irregular"),
                     charge("i3", 2026, 9, 1, "10.00", "Irregular"),
                     charge("r1", 2026, 7, 12, "10.00", "Refunded", direction="CREDIT"),
                     charge("f1", 2026, 8, 12, "10.00", "Failed", status="FAILED"),
                     charge("t1", 2026, 9, 12, "10.00", "Friend", kind="TRANSFER")])
        self.assertEqual((await detect_recurring(bank, "SESSION=alex", as_of=NOW))["items"], [])

    async def test_SUB05_insufficient_history(self):
        bank = Bank([charge("one", 2026, 9, 12, "10.00", "Only One")])
        result = await detect_recurring(bank, "SESSION=alex", as_of=NOW)
        self.assertEqual(result["status"], "INSUFFICIENT_EVIDENCE")

    async def test_SUB07_currency_is_not_implicitly_converted(self):
        rows = [charge(f"c{i}", 2026, m, 12, "10.00", "Service", "CNY")
                for i, m in enumerate((7, 8, 9))]
        rows += [charge(f"u{i}", 2026, m, 12, "2.00", "Service", "USD")
                 for i, m in enumerate((7, 8, 9))]
        result = await detect_recurring(Bank(rows), "SESSION=alex", as_of=NOW)
        self.assertEqual({row["currency"] for row in result["items"]}, {"CNY", "USD"})

    async def test_SUB09_bank_schedule_and_estimate_are_distinct(self):
        mandate = {"id": "rec_rent", "displayName": "Rent", "type": "DIRECT_DEBIT", "status": "ACTIVE",
                   "source": "BANK_MANAGED", "frequency": "MONTHLY", "usualAmount": {"amount": "50.00", "currency": "CNY"},
                   "nextExpectedAt": "2026-10-13T12:00:00+08:00", "managementCapability": "STOP_FUTURE_PAYMENTS"}
        bank = Bank([charge(f"s{i}", 2026, m, 12, "10.00", "Stream")
                     for i, m in enumerate((7, 8, 9))], [mandate])
        result = await detect_recurring(bank, "SESSION=alex", as_of=NOW, upcoming_days=7)
        self.assertEqual(len(result["items"]), 2)
        self.assertEqual(result["items"][0]["identification_status"], "CONFIRMED_MANDATE")
        self.assertEqual(result["items"][0]["date_basis"], "BANK_SCHEDULE")
        self.assertEqual(result["items"][1]["date_basis"], "ESTIMATED_FROM_HISTORY")
        self.assertEqual((await detect_recurring(bank, "SESSION=alex", as_of=NOW, upcoming_days=1))["items"], [])

    async def test_stale_bank_schedule_is_not_presented_as_next_charge(self):
        mandate = {"id": "rec_old", "displayName": "Old", "type": "DIRECT_DEBIT", "status": "ACTIVE",
                   "source": "BANK_MANAGED", "frequency": "MONTHLY", "usualAmount": {"amount": "50.00", "currency": "CNY"},
                   "nextExpectedAt": "2026-10-01T12:00:00+08:00", "managementCapability": "STOP_FUTURE_PAYMENTS"}
        result = await detect_recurring(Bank([], [mandate]), "SESSION=alex", as_of=NOW)
        self.assertIsNone(result["items"][0]["estimated_next_charge_date"])
        self.assertTrue(result["items"][0]["schedule_stale"])

    async def test_SUB14_detected_pattern_has_no_cancel_tool(self):
        bank = Bank([charge(f"s{i}", 2026, m, 12, "10.00", "Stream")
                     for i, m in enumerate((7, 8, 9))])
        registry = ToolRegistry(bank)
        names = {entry["name"] for entry in registry.visible()}
        self.assertNotIn("execute_recurring_payment_action", names)
        self.assertNotIn("prepare_cancel_direct_debit", names)
        with self.assertRaisesRegex(RegistryError, "TOOL_NOT_REGISTERED"):
            registry.validate("execute_recurring_payment_action", {}, Task(session_binding="s", customer_id="alex", goal="cancel"))
        observation = await registry.call("detect_recurring_payments", {},
                                          Task(session_binding="s", customer_id="alex", goal="subscriptions"), "SESSION=alex")
        self.assertEqual(observation.trust, "UNTRUSTED_EXTERNAL_DATA")

    async def test_SUB19_detail_requires_observed_owned_id(self):
        bank = Bank([], [{"id": "rec_rent", "displayName": "Rent", "type": "DIRECT_DEBIT", "status": "ACTIVE",
                          "source": "BANK_MANAGED", "managementCapability": "STOP_FUTURE_PAYMENTS",
                          "usualAmount": {"amount": "50.00", "currency": "CNY"}}])
        registry = ToolRegistry(bank)
        task = Task(session_binding="s", customer_id="alex", goal="rent")
        with self.assertRaisesRegex(RegistryError, "RECURRING_PAYMENT_ID_NOT_OBSERVED"):
            registry.validate("get_recurring_payment", {"recurring_payment_id": "rec_other"}, task)
        task.observations.append(await registry.call("list_recurring_payments", {}, task, "SESSION=alex"))
        result = await registry.call("get_recurring_payment", {"recurring_payment_id": "rec_rent"}, task, "SESSION=alex")
        self.assertEqual(result.structured_result["payment"]["recurring_payment_id"], "rec_rent")

    async def test_stop_prepare_requires_inspected_bank_mandate(self):
        bank = Bank([], [{"id": "rec_pattern", "displayName": "Pattern", "status": "ACTIVE",
                          "source": "DETECTED_PATTERN", "managementCapability": "NONE"},
                         {"id": "rec_rent", "displayName": "Rent", "status": "ACTIVE",
                          "source": "BANK_MANAGED", "managementCapability": "STOP_FUTURE_PAYMENTS"}])
        registry = ToolRegistry(bank)
        task = Task(session_binding="s", customer_id="alex", goal="停止房租代扣")
        self.assertNotIn("execute_stop_recurring_payment", {row["name"] for row in registry.visible()})
        with self.assertRaisesRegex(RegistryError, "RECURRING_PAYMENT_NOT_INSPECTED"):
            registry.validate("prepare_stop_recurring_payment", {"recurring_payment_id": "rec_rent"}, task)
        task.observations.append(await registry.call("list_recurring_payments", {}, task, "SESSION=alex"))
        task.observations.append(await registry.call("get_recurring_payment", {"recurring_payment_id": "rec_pattern"}, task, "SESSION=alex"))
        with self.assertRaisesRegex(RegistryError, "RECURRING_PAYMENT_NOT_BANK_MANAGED"):
            registry.validate("prepare_stop_recurring_payment", {"recurring_payment_id": "rec_pattern"}, task)
        task.observations.append(await registry.call("get_recurring_payment", {"recurring_payment_id": "rec_rent"}, task, "SESSION=alex"))
        registry.validate("prepare_stop_recurring_payment", {"recurring_payment_id": "rec_rent"}, task)

    async def test_reminder_terms_require_observed_payment_and_valid_action_shape(self):
        bank = Bank([], [{"id": "rec_rent", "displayName": "Rent", "status": "ACTIVE",
                          "source": "BANK_MANAGED", "managementCapability": "STOP_FUTURE_PAYMENTS"}])
        registry = ToolRegistry(bank)
        task = Task(session_binding="s", customer_id="alex", goal="提醒我房租续费")
        terms = {"action_type": "CREATE", "recurring_payment_id": "rec_rent",
                 "due_at": "2026-10-15T09:00:00+08:00", "time_zone": "Asia/Hong_Kong"}
        with self.assertRaisesRegex(RegistryError, "RECURRING_PAYMENT_NOT_INSPECTED"):
            registry.validate("prepare_renewal_reminder", terms, task)
        task.observations.append(await registry.call("list_recurring_payments", {}, task, "SESSION=alex"))
        task.observations.append(await registry.call("get_recurring_payment", {"recurring_payment_id": "rec_rent"}, task, "SESSION=alex"))
        registry.validate("prepare_renewal_reminder", terms, task)
        with self.assertRaisesRegex(RegistryError, "SCHEMA_VALIDATION_FAILED"):
            registry.validate("prepare_renewal_reminder", {**terms, "action_type": "CANCEL"}, task)

    async def test_reminder_cancel_uses_observed_reminder_without_unrelated_payment_detail(self):
        task = Task(session_binding="s", customer_id="alex", goal="取消刚创建的提醒")
        registry = ToolRegistry(Bank([], []))
        args = {"action_type": "CANCEL", "recurring_payment_id": "rec_rent",
                "reminder_id": "rem_1", "expected_version": 0}
        with self.assertRaisesRegex(RegistryError, "REMINDER_ID_NOT_OBSERVED"):
            registry.validate("prepare_renewal_reminder", args, task)
        task.observations.append(Observation(tool_name="list_renewal_reminders", success=True,
            structured_result={"items": [{"reminder_id": "rem_1", "recurring_payment_id": "rec_rent",
                                          "version": 0, "status": "ACTIVE"}]}, trust="UNTRUSTED_EXTERNAL_DATA"))
        registry.validate("prepare_renewal_reminder", args, task)

    async def test_detected_pattern_reminder_requires_exact_observed_evidence(self):
        registry = ToolRegistry(Bank([], []))
        task = Task(session_binding="s", customer_id="alex", goal="提醒我这个周期扣费")
        terms = {"action_type": "CREATE", "pattern_evidence_transaction_ids": ["tx_jul", "tx_aug", "tx_sep"],
                 "pattern_cadence": "MONTHLY", "due_at": "2026-10-15T09:00:00+08:00",
                 "time_zone": "Asia/Hong_Kong"}
        with self.assertRaisesRegex(RegistryError, "PATTERN_EVIDENCE_NOT_OBSERVED"):
            registry.validate("prepare_renewal_reminder", terms, task)
        task.observations.append(Observation(tool_name="detect_recurring_payments", success=True,
            structured_result={"items": [{"identification_status": "DETECTED_PATTERN",
                "cadence": "MONTHLY", "evidence_transaction_ids": ["tx_jul", "tx_aug", "tx_sep"]}]},
            trust="UNTRUSTED_EXTERNAL_DATA"))
        registry.validate("prepare_renewal_reminder", terms, task)
        with self.assertRaisesRegex(RegistryError, "PATTERN_EVIDENCE_NOT_OBSERVED"):
            registry.validate("prepare_renewal_reminder", {**terms,
                "pattern_evidence_transaction_ids": ["tx_jul", "tx_aug", "tx_other"]}, task)
        with self.assertRaisesRegex(RegistryError, "SCHEMA_VALIDATION_FAILED"):
            registry.validate("prepare_renewal_reminder", {**terms,
                "recurring_payment_id": "rec_rent"}, task)

    async def test_reminder_change_can_retarget_only_to_an_inspected_payment(self):
        bank = Bank([], [{"id": "rec_new", "displayName": "New", "status": "ACTIVE",
                          "source": "BANK_MANAGED", "managementCapability": "STOP_FUTURE_PAYMENTS"}])
        registry = ToolRegistry(bank)
        task = Task(session_binding="s", customer_id="alex", goal="把提醒改为新订阅")
        task.observations.append(Observation(tool_name="list_renewal_reminders", success=True,
            structured_result={"items": [{"reminder_id": "rem_1", "recurring_payment_id": "rec_old",
                                          "version": 0, "status": "ACTIVE"}]}, trust="UNTRUSTED_EXTERNAL_DATA"))
        terms = {"action_type": "CHANGE", "reminder_id": "rem_1", "expected_version": 0,
                 "recurring_payment_id": "rec_new", "due_at": "2026-10-15T09:00:00+08:00",
                 "time_zone": "Asia/Hong_Kong"}
        with self.assertRaisesRegex(RegistryError, "RECURRING_PAYMENT_NOT_INSPECTED"):
            registry.validate("prepare_renewal_reminder", terms, task)
        task.observations.append(await registry.call("list_recurring_payments", {}, task, "SESSION=alex"))
        task.observations.append(await registry.call("get_recurring_payment", {"recurring_payment_id": "rec_new"}, task, "SESSION=alex"))
        registry.validate("prepare_renewal_reminder", terms, task)


if __name__ == "__main__":
    unittest.main()

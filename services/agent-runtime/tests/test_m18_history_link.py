from __future__ import annotations

import pathlib
import sys
import unittest

import httpx

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))

from app.agent_v2.history_link import verified_recipient_id
from app.agent_v2.runtime import AgentRuntimeV2
from app.banking import BankingGateway, BankingUnavailableError
from test_transfer_runtime import FakeBank


TRANSFER_IDS = (
    "transfer_aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    "transfer_bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
)


def historical_row(index: int, recipient_id: str) -> dict:
    return {
        "id": f"txn_history_{index}", "accountId": "acc_alice",
        "title": "Past dinner transfer", "amount": {"amount": "50.00", "currency": "CNY"},
        "direction": "DEBIT", "status": "COMPLETED", "type": "BANK_TRANSFER",
        "category": "TRANSFER", "occurredAt": f"2026-09-{20 + index}T12:00:00+08:00",
        "reference": "ASTER-" + TRANSFER_IDS[index], "note": "项目聚餐",
        "counterparty": {"name": "张三" if recipient_id == "r_zhang" else "李四",
                         "maskedAccountNumber": "•••• 8821" if recipient_id == "r_zhang" else "•••• 4455"},
    }


class HistoryBank(FakeBank):
    def __init__(self, recipients=("r_zhang",)):
        super().__init__()
        self.rows = [historical_row(index, recipient_id) for index, recipient_id in enumerate(recipients)]
        self.receipts = {}
        self.current = {}
        self.optional_reads = []
        for index, recipient_id in enumerate(recipients):
            recipient = {"id": recipient_id, "bankName": "Demo Bank",
                         "maskedAccountNumber": self.rows[index]["counterparty"]["maskedAccountNumber"],
                         "destinationRef": "dest_" + recipient_id, "currency": "CNY", "status": "ACTIVE"}
            self.current[recipient_id] = recipient
            self.receipts[TRANSFER_IDS[index]] = {
                "id": TRANSFER_IDS[index], "status": "COMPLETED",
                "reference": self.rows[index]["reference"],
                "transactionId": self.rows[index]["id"],
                "sourceAccount": {"id": "acc_alice"},
                "recipient": recipient,
                "amount": {"amount": "50.00", "currency": "CNY"},
            }

    async def customer_get(self, path, cookie, *, params=None):
        if path == "/customer/transactions":
            rows = self.rows
            if params and params.get("search"):
                rows = [row for row in rows if params["search"] in row["note"]]
            return {"items": rows, "nextCursor": None, "hasMore": False}
        return await super().customer_get(path, cookie, params=params)

    async def customer_get_optional(self, path, cookie):
        self.optional_reads.append(path)
        if path.startswith("/customer/transfers/"):
            return self.receipts.get(path.rsplit("/", 1)[-1])
        if path.startswith("/customer/recipients/"):
            return self.current.get(path.rsplit("/", 1)[-1])
        raise AssertionError(path)


class HistoryPlanner:
    def __init__(self):
        self.contexts = []

    async def decide(self, context):
        self.contexts.append(context)
        observations = context["observations"]
        history = next((ob for ob in observations if ob["tool_name"] == "list_transactions"), None)
        if history is None:
            return {"type": "TOOL_CALL", "tool_call": {"tool_name": "list_transactions",
                                                 "arguments": {"note_query": "项目聚餐"}}}
        ids = list(dict.fromkeys(row["verified_recipient_id"]
                                 for row in history["structured_result"]["transactions"]
                                 if row["verified_recipient_id"]))
        if len(ids) > 1 and not context["state"]["selected_recipient_id"]:
            return {"type": "ASK_USER", "question": {"text": "请选择历史收款人", "options": [
                {"id": recipient_id, "label": "历史收款人"} for recipient_id in ids]}}
        if not any(ob["tool_name"] == "list_accounts" for ob in observations):
            return {"type": "TOOL_CALL", "tool_call": {"tool_name": "list_accounts", "arguments": {}}}
        return {"type": "TOOL_CALL", "tool_call": {"tool_name": "prepare_transfer",
                                             "arguments": {"source_account_id": "acc_alice",
                                                           "recipient_id": context["state"]["selected_recipient_id"] or ids[0],
                                                           "amount": "100.00", "currency": "CNY"}}}


class UnsafeNamePlanner:
    async def decide(self, context):
        seen = {row["tool_name"] for row in context["observations"]}
        if "list_transactions" not in seen:
            return {"type": "TOOL_CALL", "tool_call": {"tool_name": "list_transactions",
                                                 "arguments": {"note_query": "项目聚餐"}}}
        if "resolve_recipient" not in seen:
            return {"type": "TOOL_CALL", "tool_call": {"tool_name": "resolve_recipient",
                                                 "arguments": {"query": "张三"}}}
        if "list_accounts" not in seen:
            return {"type": "TOOL_CALL", "tool_call": {"tool_name": "list_accounts", "arguments": {}}}
        return {"type": "TOOL_CALL", "tool_call": {"tool_name": "prepare_transfer",
                                             "arguments": {"source_account_id": "acc_alice",
                                                           "recipient_id": "r_zhang", "amount": "100.00",
                                                           "currency": "CNY"}}}


class ReusedNotePlanner(HistoryPlanner):
    async def decide(self, context):
        decision = await super().decide(context)
        if decision.get("tool_call", {}).get("tool_name") == "prepare_transfer":
            decision["tool_call"]["arguments"]["note"] = "项目聚餐"
        return decision


class HistoryLinkTests(unittest.IsolatedAsyncioTestCase):
    async def test_gateway_optional_lookup_is_exactly_allowlisted(self):
        def handler(request):
            if request.url.path.endswith("/missing"):
                return httpx.Response(404, json={"code": "NOT_FOUND"})
            if request.url.path.endswith("/unavailable"):
                return httpx.Response(503, json={"code": "UNAVAILABLE"})
            return httpx.Response(200, json={"id": "receipt"})

        gateway = BankingGateway("http://bank.test", transport=httpx.MockTransport(handler))
        self.assertIsNone(await gateway.customer_get_optional("/customer/transfers/missing", "SESSION=alice"))
        self.assertEqual((await gateway.customer_get_optional(
            "/customer/recipients/recipient_zhang", "SESSION=alice"))["id"], "receipt")
        with self.assertRaises(BankingUnavailableError):
            await gateway.customer_get_optional("/customer/transfers/unavailable", "SESSION=alice")
        with self.assertRaises(ValueError):
            await gateway.customer_get_optional("/customer/transfers/x/execute", "SESSION=alice")

    async def test_verified_bank_receipt_links_to_active_saved_recipient(self):
        bank = HistoryBank()
        self.assertEqual(await verified_recipient_id(bank, "SESSION=alice", bank.rows[0]), "r_zhang")
        self.assertEqual(bank.optional_reads, [
            "/customer/transfers/" + TRANSFER_IDS[0], "/customer/recipients/r_zhang"])

    async def test_reference_alone_never_confers_canonical_identity(self):
        bank = HistoryBank()
        row = dict(bank.rows[0])
        for change in ({"id": "txn_other"}, {"accountId": "acc_other"},
                       {"status": "REVERSED"}, {"direction": "CREDIT"},
                       {"amount": {"amount": "500.00", "currency": "CNY"}},
                       {"reference": "ASTER-transfer_untrusted"}):
            with self.subTest(change=change):
                self.assertIsNone(await verified_recipient_id(bank, "SESSION=alice", row | change))
        bank.current["r_zhang"]["status"] = "INACTIVE"
        self.assertIsNone(await verified_recipient_id(bank, "SESSION=alice", bank.rows[0]))

    async def test_historical_note_transfer_uses_same_agent_loop_and_new_intent(self):
        bank = HistoryBank()
        planner = HistoryPlanner()
        runtime = AgentRuntimeV2(bank, planner)
        response = await runtime.chat("给上次备注项目聚餐的那个人转100", "SESSION=alice")
        self.assertEqual(response.status.value, "WAITING_CONFIRMATION")
        self.assertEqual([step.tool for step in response.steps],
                         ["list_transactions", "list_accounts", "prepare_transfer"])
        self.assertEqual(response.confirmation["recipient"]["id"], "r_zhang")
        self.assertEqual(response.confirmation["amount"]["amount"], "100.00")
        self.assertEqual(bank.debits, 0)
        self.assertEqual(len(planner.contexts), 3)

    async def test_two_historical_recipients_require_same_task_choice(self):
        bank = HistoryBank(("r_zhang", "r_li"))
        planner = HistoryPlanner()
        runtime = AgentRuntimeV2(bank, planner)
        first = await runtime.chat("给上次备注项目聚餐的那个人转100", "SESSION=alice")
        self.assertEqual(first.status.value, "WAITING_USER")
        self.assertEqual(len(first.options), 2)
        self.assertEqual(len(bank.intents), 0)
        second = await runtime.chat("第二个", "SESSION=alice", first.task_id)
        self.assertEqual(second.task_id, first.task_id)
        self.assertEqual(second.status.value, "WAITING_CONFIRMATION")
        self.assertEqual(second.confirmation["recipient"]["id"], "r_li")
        self.assertEqual(bank.debits, 0)

    async def test_unlinked_counterparty_name_cannot_authorize_transfer(self):
        bank = HistoryBank()
        bank.receipts.clear()
        runtime = AgentRuntimeV2(bank, UnsafeNamePlanner())
        response = await runtime.chat("给上次备注项目聚餐的那个人转100", "SESSION=alice")
        self.assertNotEqual(response.status.value, "WAITING_CONFIRMATION")
        self.assertEqual(bank.intents, {})
        self.assertEqual(bank.debits, 0)

    async def test_historical_search_note_is_not_a_new_transfer_note(self):
        bank = HistoryBank()
        runtime = AgentRuntimeV2(bank, ReusedNotePlanner())
        response = await runtime.chat("给上次备注项目聚餐的那个人转100", "SESSION=alice")
        self.assertNotEqual(response.status.value, "WAITING_CONFIRMATION")
        self.assertEqual(bank.intents, {})
        self.assertEqual(bank.debits, 0)


if __name__ == "__main__":
    unittest.main()

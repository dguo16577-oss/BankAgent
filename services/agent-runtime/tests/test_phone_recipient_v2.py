from __future__ import annotations

import pathlib
import sys
import unittest

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))

from app.agent_v2.models import PlannerDecision, Task
from app.agent_v2.recipient_names import mask_phone_text, phone_from_query
from app.agent_v2.runtime import AgentRuntimeV2
from app.agent_v2.tools import RegistryError, ToolRegistry
from test_agent_v2 import CancellableBank


class PhonePlanner:
    """Scripted test planner; the production planner remains DeepSeek."""

    def __init__(self, *, query: str, recipient: str = "r_zhang", amount: str = "10.00"):
        self.query, self.recipient, self.amount = query, recipient, amount
        self.contexts = []

    async def decide(self, context):
        self.contexts.append(context)
        observations = context["observations"]
        recipient_reads = [item for item in observations if item["tool_name"] == "resolve_recipient"]
        if not recipient_reads:
            return PlannerDecision(type="TOOL_CALL", tool_call={"tool_name": "resolve_recipient",
                                                            "arguments": {"query": self.query}})
        result = recipient_reads[-1]["structured_result"]
        if result["status"] == "NOT_FOUND":
            return PlannerDecision(type="COMPLETE", final_message="没有找到已保存的收款人。")
        if result["status"] == "AMBIGUOUS" and "尾号" not in context["current_request"]:
            return PlannerDecision(type="ASK_USER", question={"text": "请选择收款人", "options": [
                {"id": item["recipient_id"], "label": item["display_name_untrusted"]}
                for item in result["candidates"]]})
        if not any(item["tool_name"] == "list_accounts" for item in observations):
            return PlannerDecision(type="TOOL_CALL", tool_call={"tool_name": "list_accounts", "arguments": {}})
        return PlannerDecision(type="TOOL_CALL", tool_call={"tool_name": "prepare_transfer", "arguments": {
            "source_account_id": "acc_alice", "recipient_id": self.recipient,
            "amount": self.amount, "currency": "CNY"}})


class PhoneRecipientTests(unittest.IsolatedAsyncioTestCase):
    async def test_canonicalization_is_exact(self):
        for value in ("13800138000", "+8613800138000", "+86 138 0013 8000",
                      "0086-138-0013-8000", "给手机号13800138000那个小王转500"):
            self.assertEqual(phone_from_query(value), "+8613800138000")
        for value in ("1380013800", "138001380000", "138****8000", "1399999999"):
            self.assertIsNone(phone_from_query(value))
        self.assertEqual(mask_phone_text("给 +86 138 0013 8000 转10元"), "给 138****8000 转10元")

    async def test_p01_p02_p03_use_one_registry_tool_and_mask_observation(self):
        for query, expected in (("13800138000", "RESOLVED"),
                                ("+86 138 0013 8000", "RESOLVED"),
                                ("13999999999", "NOT_FOUND")):
            with self.subTest(query=query):
                bank = CancellableBank()
                registry = ToolRegistry(bank)
                self.assertEqual(len(registry.visible()), 49)
                observation = await registry.call("resolve_recipient", {"query": query}, Task(
                    session_binding="x", customer_id="alice", goal="test"), "SESSION=alice")
                self.assertEqual(observation.structured_result["status"], expected)
                self.assertNotIn("13800138000", str(observation.structured_result))
                if expected == "RESOLVED":
                    self.assertEqual(observation.structured_result["recipient"]["recipient_id"], "r_zhang")
                    self.assertEqual(observation.structured_result["recipient"]["phone_masked"], "138****8000")

    async def test_p01_prepare_uses_canonical_id_and_trace_is_masked(self):
        bank = CancellableBank()
        planner = PhonePlanner(query="+86 138 0013 8000")
        runtime = AgentRuntimeV2(bank, planner)
        result = await runtime.chat("给 +86 138 0013 8000 转10元", "SESSION=alice")
        self.assertEqual(result.status.value, "WAITING_CONFIRMATION")
        self.assertEqual(result.confirmation["recipient"]["id"], "r_zhang")
        self.assertEqual(result.confirmation["amount"]["amount"], "10.00")
        self.assertEqual(bank.debits, 0)
        self.assertNotIn("13800138000", str(runtime.tasks[result.task_id].trace))
        self.assertEqual([step.tool for step in result.steps],
                         ["resolve_recipient", "list_accounts", "prepare_transfer"])

    async def test_p06_suffix_resumes_same_task_and_cannot_select_wrong_candidate(self):
        bank = CancellableBank()
        planner = PhonePlanner(query="小王", recipient="r_wang_1")
        runtime = AgentRuntimeV2(bank, planner)
        first = await runtime.chat("给小王转10元", "SESSION=alice")
        self.assertEqual(first.status.value, "WAITING_USER")
        self.assertEqual(len(first.options), 2)
        self.assertTrue(any("139****8000" in item["label"] for item in first.options))
        second = await runtime.chat("手机号尾号8000那个", "SESSION=alice", first.task_id)
        self.assertEqual(second.task_id, first.task_id)
        self.assertEqual(second.status.value, "WAITING_CONFIRMATION")
        self.assertEqual(second.confirmation["recipient"]["id"], "r_wang_1")
        self.assertEqual(bank.debits, 0)
        bad = Task(session_binding="x", customer_id="alice", goal="x")
        bad.observations = runtime.tasks[first.task_id].observations[:2]
        bad.conversation = [{"role": "user", "text": "手机号尾号8000那个"}]
        with self.assertRaisesRegex(RegistryError, "RECIPIENT_ID_NOT_OBSERVED"):
            ToolRegistry(bank).validate("prepare_transfer", {"source_account_id": "acc_alice",
                "recipient_id": "r_wang_2", "amount": "10.00", "currency": "CNY"}, bad)

    async def test_p05_joint_name_phone_prefers_exact_phone(self):
        bank = CancellableBank()
        result = await ToolRegistry(bank).call("resolve_recipient",
            {"query": "手机号13900008000那个小王"}, Task(
                session_binding="x", customer_id="alice", goal="test"), "SESSION=alice")
        self.assertEqual(result.structured_result["status"], "RESOLVED")
        self.assertEqual(result.structured_result["recipient"]["recipient_id"], "r_wang_1")


if __name__ == "__main__":
    unittest.main()

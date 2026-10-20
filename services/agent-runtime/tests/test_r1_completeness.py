from __future__ import annotations

import pathlib
import sys
import unittest

import httpx

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))

from app.agent_v2.models import PlannerDecision
from app.agent_v2.runtime import AgentRuntimeV2
from app.agent_v2.analysis_safety import readonly_user_turn
from app.mcp_pilot import MCPFailure
from test_agent_v2 import CancellableBank


class OmissionPlanner:
    async def plan_subgoals(self, _goal, _tools):
        return [{"step_id": "g1", "goal": "账户", "kind": "READ",
                 "evidence_tools": ["list_accounts"], "status": "PENDING"},
                {"step_id": "g2", "goal": "消费", "kind": "ANALYZE",
                 "evidence_tools": ["summarize_spending"], "status": "PENDING"}]

    async def decide(self, context):
        observed = {item["tool_name"] for item in context["observations"]}
        for tool in ("list_accounts",):
            if tool not in observed:
                return PlannerDecision(type="TOOL_CALL", tool_call={"tool_name": tool, "arguments": {}})
        return PlannerDecision(type="COMPLETE", final_message="账户、银行卡、理财都查完了。")


class PaymentRequiredPlanner:
    async def decide(self, _context):
        response = httpx.Response(402, request=httpx.Request("POST", "https://api.deepseek.com/chat/completions"))
        raise httpx.HTTPStatusError("Payment required", request=response.request, response=response)


class R1CompletenessTests(unittest.IsolatedAsyncioTestCase):
    async def test_incomplete_bank_receipt_remains_unknown_not_executed(self):
        from test_agent_v2 import SequencePlanner
        from app.task_models import ConfirmRequest
        class MissingReceipt(CancellableBank):
            async def execute_transfer(self, cookie, body, key):
                await super().execute_transfer(cookie, body, key)
                return {}
        bank = MissingReceipt(); runtime = AgentRuntimeV2(bank, SequencePlanner())
        response = await runtime.chat("给张三转500", "SESSION=alice")
        intent = response.confirmation
        response = await runtime.confirm(response.task_id, ConfirmRequest(intent_id=intent["id"],
            intent_hash=intent["intentHash"], action_authorization_id="test-auth"), "SESSION=alice")
        task = runtime.tasks[response.task_id]
        self.assertEqual(response.status.value, "PARTIAL")
        self.assertTrue(task.execution_uncertain)
        self.assertFalse(any(t.get("kind") == "ACTION_EXECUTED" for t in task.trace))
        self.assertEqual(task.completed_actions, [])
        self.assertEqual(bank.debits, 1)

    async def test_uncertain_application_without_authoritative_lookup_is_not_replayed(self):
        from app.agent_v2.models import Task, Status
        from app.agent_v2.runtime import session_binding
        from app.task_models import ConfirmRequest
        for kind in ["CARD_APPLICATION", "CREDIT_LIMIT_APPLICATION"]:
            runtime = AgentRuntimeV2(CancellableBank(), object())
            task = Task(customer_id="alice", session_binding=session_binding("SESSION=alice"),
                goal="申请", status=Status.WAITING_AUTH, execution_uncertain=True,
                active_intent_kind=kind, active_intent={"id": "intent-a", "intentHash": "hash-a", "status": "PREPARED"})
            runtime.tasks[task.task_id] = task
            response = await runtime.confirm(task.task_id, ConfirmRequest(intent_id="intent-a", intent_hash="hash-a",
                action_authorization_id="test-auth"), "SESSION=alice")
            self.assertEqual(response.error_code, "BANKING_RESULT_UNKNOWN")
            self.assertEqual(response.status.value, "PARTIAL")
            self.assertTrue(task.execution_uncertain)
            self.assertEqual(task.completed_actions, [])

    async def test_mixed_action_and_analysis_is_not_vetoed_as_read_only(self):
        self.assertFalse(readonly_user_turn("冻结1937，然后查询异常交易，最后创建续费提醒。"))
        self.assertTrue(readonly_user_turn("为什么我的卡被冻结了？"))

    async def test_missing_spending_cannot_be_reported_succeeded(self):
        bank = CancellableBank()
        runtime = AgentRuntimeV2(bank, OmissionPlanner(), max_steps=12)
        result = await runtime.chat("查询账户、银行卡、本月消费和理财持仓。", "SESSION=alice")
        self.assertEqual(result.status.value, "PARTIAL")
        self.assertEqual(result.error_code, "TASK_INCOMPLETE")
        self.assertEqual(runtime.tasks[result.task_id].ledger[1]["status"], "PENDING")
        self.assertEqual(bank.debits, 0)

    async def test_http_402_preserves_task_as_provider_blocked(self):
        runtime = AgentRuntimeV2(CancellableBank(), PaymentRequiredPlanner())
        result = await runtime.chat("查询余额", "SESSION=alice")
        self.assertEqual(result.status.value, "BLOCKED_PROVIDER")
        self.assertEqual(result.error_code, "MODEL_INSUFFICIENT_BALANCE")

    async def test_invalid_planner_shape_is_classified_without_tool_call(self):
        class InvalidPlanner:
            async def decide(self, _context):
                return {"type": "COMPLETE", "final_message": ""}
        bank = CancellableBank()
        result = await AgentRuntimeV2(bank, InvalidPlanner()).chat("查询余额", "SESSION=alice")
        self.assertEqual(result.error_code, "MODEL_INVALID_OUTPUT")
        self.assertEqual(bank.debits, 0)

    async def test_mcp_timeout_has_specific_error_code(self):
        class ToolPlanner:
            async def decide(self, _context):
                return PlannerDecision(type="TOOL_CALL", tool_call={"tool_name": "list_accounts",
                                                                    "arguments": {}})
        runtime = AgentRuntimeV2(CancellableBank(), ToolPlanner())
        async def interrupted(*_args):
            raise MCPFailure("MCP_TIMEOUT")
        runtime.registry.call = interrupted
        result = await runtime.chat("查询账户", "SESSION=alice")
        self.assertEqual(result.error_code, "MCP_TIMEOUT")

    async def test_knowledge_timeout_is_classified_as_rag_timeout(self):
        class KnowledgePlanner:
            async def decide(self, _context):
                return PlannerDecision(type="TOOL_CALL", tool_call={
                    "tool_name": "search_bank_knowledge", "arguments": {"query": "卡片挂失规则"}})
        runtime = AgentRuntimeV2(CancellableBank(), KnowledgePlanner())
        async def timeout(*_args):
            raise httpx.ReadTimeout("knowledge service timeout")
        runtime.registry.call = timeout
        result = await runtime.chat("查询卡片挂失规则", "SESSION=alice")
        self.assertEqual(result.error_code, "RAG_TIMEOUT")

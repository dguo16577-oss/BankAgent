"""Stage one owned 1 CNY review for browser confirmation tests, never execute it.

Executed inside the exact disposable Agent container by the browser harness.
Private cookie arrives over stdin and is never logged. The deterministic
planner is a test fixture, not evidence of real-model intent understanding.
"""
import asyncio
import json
import os
import socket
import sys

from app.agent_v2.models import PlannerDecision
from app.agent_v2.runtime import AgentRuntimeV2
from app.agent_v2.state_store import PostgresTaskStore
from app.banking import BankingGateway


class FixturePlanner:
    async def plan_subgoals(self, goal, tools):
        return [{"step_id": "g1", "goal": goal, "source_quote": goal, "kind": "FINANCIAL_ACTION",
                 "evidence_tools": ["confirmed_transfer"], "status": "PENDING", "dependencies": []}]

    async def decide(self, context):
        names = [observation["tool_name"] for observation in context["observations"]]
        if "list_accounts" not in names:
            tool, args = "list_accounts", {}
        elif "resolve_recipient" not in names:
            tool, args = "resolve_recipient", {"query": "张三"}
        else:
            tool, args = "prepare_transfer", {"source_account_id": "acc_current", "recipient_id": "recipient_zhang", "amount": "1.00", "currency": "CNY"}
        return PlannerDecision(type="TOOL_CALL", tool_call={"tool_name": tool, "arguments": args,
                               **({"step_id": "g1"} if tool == "prepare_transfer" else {})})


async def main():
    config = json.load(sys.stdin)
    if (config.get("project") != "aster-final-sprint-20261020"
            or socket.gethostbyname("postgres") != config.get("postgres_ip")
            or os.getenv("BANKING_API_BASE_URL") != "http://banking-core:8080"):
        raise RuntimeError("Disposable fixture scope mismatch")
    runtime = AgentRuntimeV2(BankingGateway(), FixturePlanner(), state_store=PostgresTaskStore())
    response = await runtime.chat("给张三转1元", config["cookie"], conversation_id=config["thread_id"])
    if response.status.value != "WAITING_CONFIRMATION":
        raise RuntimeError("Fixture did not produce a review")
    intent = response.confirmation
    print(json.dumps({"task_id": response.task_id, "status": response.status.value, "intent_id": intent["id"],
                      "intent_hash": intent["intentHash"], "amount": intent["amount"], "executed": False}))


asyncio.run(main())

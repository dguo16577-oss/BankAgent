"""Opt-in cross-domain run in an isolated demo bank. Stops at first confirmation."""

from __future__ import annotations

import asyncio
import os
import pathlib
import sys
from uuid import uuid4

import httpx

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))

from app.agent_v2.planner import DeepSeekPlanner
from app.agent_v2.runtime import AgentRuntimeV2
from app.agent_v2.state_store import PostgresTaskStore
from app.banking import BankingGateway
from app.deepseek import DeepSeekClassifier
from app.task_models import ConfirmRequest


async def main() -> None:
    with httpx.Client(base_url=os.environ["BANKING_API_BASE_URL"], timeout=15) as client:
        client.get("/customer/session")
        login = client.post("/customer/auth/login", json={
            "email": os.environ["R1_DEMO_EMAIL"], "password": os.environ["R1_DEMO_PASSWORD"]},
            headers={"X-XSRF-TOKEN": client.cookies.get("XSRF-TOKEN", "")})
        login.raise_for_status()
        client.get("/customer/session")
        cookie = "SESSION=" + client.cookies["SESSION"] + "; XSRF-TOKEN=" + client.cookies["XSRF-TOKEN"]
    runtime = AgentRuntimeV2(BankingGateway(), DeepSeekPlanner(DeepSeekClassifier()),
                             max_steps=16, state_store=PostgresTaskStore())
    result = await runtime.chat(os.environ["R1_CHAIN_GOAL"], cookie,
                                request_id=uuid4().hex, conversation_id=uuid4().hex)
    task = runtime.tasks[result.task_id]
    print({"status": result.status.value, "error_code": result.error_code,
           "ledger": [(step["goal"], step["status"]) for step in task.ledger],
           "tools": [entry["tool"] for entry in task.trace if entry.get("kind") == "TOOL_RESULT"],
           "intent_kind": task.active_intent_kind, "confirmed_actions": len(task.completed_actions)})
    if os.getenv("R1_CONFIRM_FIRST") == "1" and result.status.value == "WAITING_CONFIRMATION":
        intent = result.confirmation
        followup = await runtime.confirm(result.task_id, ConfirmRequest(
            intent_id=intent["id"], intent_hash=intent["intentHash"]), cookie)
        updated = runtime.tasks[followup.task_id]
        print({"after_confirmation_status": followup.status.value,
               "error_code": followup.error_code,
               "next_question": followup.message[:250] if followup.status.value == "WAITING_USER" else None,
               "ledger": [(step["goal"], step["status"]) for step in updated.ledger],
               "tools": [entry["tool"] for entry in updated.trace if entry.get("kind") == "TOOL_RESULT"],
               "confirmed_actions": len(updated.completed_actions),
               "next_intent_kind": updated.active_intent_kind})


if __name__ == "__main__":
    asyncio.run(main())

"""Opt-in read-only DeepSeek + Spring/PostgreSQL smoke; prints no session or key."""

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


async def main() -> None:
    base = os.environ["BANKING_API_BASE_URL"]
    with httpx.Client(base_url=base, timeout=15) as client:
        client.get("/customer/session")
        response = client.post("/customer/auth/login", json={
            "email": os.environ["R1_DEMO_EMAIL"], "password": os.environ["R1_DEMO_PASSWORD"]},
            headers={"X-XSRF-TOKEN": client.cookies.get("XSRF-TOKEN", "")})
        response.raise_for_status()
        cookie = "SESSION=" + client.cookies["SESSION"]
    runtime = AgentRuntimeV2(BankingGateway(), DeepSeekPlanner(DeepSeekClassifier()),
                             max_steps=16, state_store=PostgresTaskStore())
    result = await runtime.chat("查询账户、银行卡、本月消费和理财持仓。", cookie,
                                request_id=uuid4().hex, conversation_id=uuid4().hex)
    task = runtime.tasks[result.task_id]
    print({"task_id": result.task_id, "status": result.status.value,
           "error_code": result.error_code,
           "ledger": [{"goal": step["goal"], "status": step["status"],
                       "evidence_refs": step["evidence_refs"]} for step in task.ledger],
           "tools": [entry["tool"] for entry in task.trace if entry.get("kind") == "TOOL_RESULT"],
           "financial_intents": len([entry for entry in task.trace if entry.get("kind") == "WAITING_CONFIRMATION"])})


if __name__ == "__main__":
    asyncio.run(main())

"""Local Spring/PostgreSQL smoke for Agent schedule reads and exact split analysis.

This script never confirms an intent and does not call the model. It exits if the
bank origin is not the local demo backend. No cookie or credential is printed.
"""

from __future__ import annotations

import asyncio
import argparse
import os
import sys
from pathlib import Path

import httpx

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "services" / "agent-runtime"))

from app.agent_v2.models import Task  # noqa: E402
from app.agent_v2.planner import DeepSeekPlanner  # noqa: E402
from app.agent_v2.runtime import AgentRuntimeV2  # noqa: E402
from app.agent_v2.tools import ToolRegistry  # noqa: E402
from app.banking import BankingGateway  # noqa: E402
from app.deepseek import DeepSeekClassifier  # noqa: E402


async def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--model", action="store_true", help="Also ask the real DeepSeek planner to select a read tool")
    options = parser.parse_args()
    origin = os.getenv("BANKING_API_BASE_URL", "http://127.0.0.1:18080").rstrip("/")
    if origin not in {"http://127.0.0.1:18080", "http://localhost:18080"}:
        raise SystemExit("M18 read smoke is restricted to the local Spring demo backend")
    async with httpx.AsyncClient(base_url=origin, timeout=15) as bank:
        bootstrap = await bank.get("/customer/session")
        if bootstrap.status_code not in {200, 401} or not bank.cookies.get("XSRF-TOKEN"):
            raise SystemExit(f"Session bootstrap failed: HTTP {bootstrap.status_code}")
        login = await bank.post("/customer/auth/login", json={"email": "alex@aster.local",
            "password": os.getenv("ASTER_DEMO_PASSWORD", "demo-password")},
            headers={"X-XSRF-TOKEN": bank.cookies.get("XSRF-TOKEN", "")})
        if login.status_code != 200:
            raise SystemExit(f"Local demo login failed: HTTP {login.status_code}")
        session = (await bank.get("/customer/session")).json()
        if session.get("authenticated") is not True:
            raise SystemExit("Authenticated session unavailable")
        cookie = "; ".join(f"{name}={value}" for name, value in bank.cookies.items())
        before = (await bank.get("/customer/accounts")).json()
        gateway = BankingGateway(origin)
        registry = ToolRegistry(gateway)
        task = Task(session_binding="read-smoke", customer_id=session["user"]["id"], goal="Read schedules and split")
        schedules = await registry.call("list_scheduled_transfers", {}, task, cookie)
        task.observations.append(schedules)
        count = len(schedules.structured_result["schedules"])
        if count:
            first_id = schedules.structured_result["schedules"][0]["schedule_id"]
            detail = await registry.call("get_scheduled_transfer", {"schedule_id": first_id}, task, cookie)
            if detail.structured_result["schedule"]["schedule_id"] != first_id:
                raise SystemExit("Schedule detail did not match the listed ID")
        split = await registry.call("calculate_split", {"total_amount": "100.00", "currency": "CNY",
            "participant_keys": ["SELF", "a", "b"], "payer_included": True}, task, cookie)
        parts = [item["amount"]["amount"] for item in split.structured_result["parts"]]
        after = (await bank.get("/customer/accounts")).json()
        if before != after or parts != ["33.34", "33.33", "33.33"]:
            raise SystemExit("Read/split smoke invariant failed")
        print(f"PASS: Spring schedules listed={count}; split=33.34+33.33+33.33; account state unchanged")
        if options.model:
            key = os.getenv("DEEPSEEK_API_KEY")
            if not key:
                key_file = Path(os.getenv("DEEPSEEK_API_KEY_FILE", "E:/deeoseekapikey.txt"))
                key = key_file.read_text(encoding="utf-8").strip()
            if not key:
                raise SystemExit("DeepSeek key unavailable")
            classifier = DeepSeekClassifier(key=key)
            completion = classifier._json_completion
            calls = 0

            async def counted_completion(*args, **kwargs):
                nonlocal calls
                calls += 1
                return await completion(*args, **kwargs)

            classifier._json_completion = counted_completion
            runtime = AgentRuntimeV2(gateway, DeepSeekPlanner(classifier))
            response = await runtime.chat("请只查询我已有的预约转账，不要创建或修改任何转账。", cookie)
            tools = [entry["tool"] for entry in runtime.tasks[response.task_id].trace
                     if entry.get("kind") == "TOOL_RESULT"]
            if response.status.value != "SUCCEEDED" or "list_scheduled_transfers" not in tools or \
                    any(name.startswith("prepare_") for name in tools) or runtime.tasks[response.task_id].active_intent:
                errors = [entry.get("type") for entry in runtime.tasks[response.task_id].trace
                          if entry.get("kind") == "RUNTIME_ERROR"]
                raise SystemExit(f"DeepSeek read smoke failed: status={response.status.value} "
                                 f"code={response.error_code} errors={errors} tools={tools} calls={calls}")
            after_model = (await bank.get("/customer/accounts")).json()
            if after_model != before:
                raise SystemExit("Model read changed account state")
            print(f"PASS: DeepSeek planner calls={calls}; tools={tools}; no intent or account mutation")
            note_response = await runtime.chat("请找出备注包含项目聚餐的交易，只查询，不要转账。", cookie)
            note_task = runtime.tasks[note_response.task_id]
            note_tools = [entry["tool"] for entry in note_task.trace if entry.get("kind") == "TOOL_RESULT"]
            note_args = [(entry["decision"]["tool_call"] or {})["arguments"]
                         for entry in note_task.trace if entry.get("kind") == "PLANNER_DECISION"
                         and (entry["decision"].get("tool_call") or {}).get("tool_name") == "list_transactions"]
            if note_response.status.value != "SUCCEEDED" or "list_transactions" not in note_tools or \
                    not any(args.get("note_query") == "项目聚餐" for args in note_args) or \
                    any(name.startswith("prepare_") for name in note_tools) or note_task.active_intent:
                raise SystemExit(f"DeepSeek note read failed: status={note_response.status.value} "
                                 f"code={note_response.error_code} tools={note_tools} note_args={note_args}")
            if (await bank.get("/customer/accounts")).json() != before:
                raise SystemExit("Model note read changed account state")
            print(f"PASS: DeepSeek note search tools={note_tools}; note_query applied; no intent or account mutation")
        return 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))

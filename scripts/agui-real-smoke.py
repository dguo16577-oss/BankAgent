"""Real-model AG-UI transport smoke against an isolated Spring/PostgreSQL bank.

The caller provides BANKING_API_BASE_URL and DEEPSEEK_API_KEY_FILE. The script
records only event types, tool names, task status and model-call counts. It
never confirms an action or prints credentials, cookies, IDs or model text.
"""

from __future__ import annotations

import asyncio
import json
import os
import sys
from pathlib import Path
from uuid import uuid4

import httpx

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "services" / "agent-runtime"))

from app.main import create_app  # noqa: E402
from app.banking import BankingGateway  # noqa: E402


async def main() -> int:
    origin = os.environ["BANKING_API_BASE_URL"].rstrip("/")
    if not origin.startswith("http://127.0.0.1:"):
        raise RuntimeError("AG-UI live smoke requires an isolated loopback bank")
    if not (os.getenv("DEEPSEEK_API_KEY") or os.getenv("DEEPSEEK_API_KEY_FILE")):
        raise RuntimeError("DeepSeek credential unavailable")
    async with httpx.AsyncClient(base_url=origin, timeout=20) as bank:
        bootstrap = await bank.get("/customer/session")
        csrf = bank.cookies.get("XSRF-TOKEN")
        if bootstrap.status_code not in {200, 401} or not csrf:
            raise RuntimeError("Bank session bootstrap failed")
        login = await bank.post("/customer/auth/login", json={
            "email": "alex@aster.local",
            "password": os.getenv("ASTER_DEMO_PASSWORD", "demo-password"),
        }, headers={"X-XSRF-TOKEN": csrf})
        if login.status_code != 200:
            raise RuntimeError(f"Bank login failed: HTTP {login.status_code}")
        # Authentication rotates the session and CSRF state. Bootstrap a fresh
        # token for subsequent bank-side PREPARE calls.
        session = await bank.get("/customer/session")
        if session.status_code != 200 or not bank.cookies.get("XSRF-TOKEN"):
            raise RuntimeError("Authenticated CSRF bootstrap failed")
        cookie = "; ".join(f"{name}={value}" for name, value in bank.cookies.items())
        before = (await bank.get("/customer/accounts")).json()

        app = create_app(gateway=BankingGateway(origin), agent_version="v2")
        planner = app.state.agent_v2.planner
        real_decide = planner.decide
        model_calls = 0

        async def counted_decide(context):
            nonlocal model_calls
            model_calls += 1
            return await real_decide(context)

        planner.decide = counted_decide
        thread = uuid4().hex
        traces = []
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app),
                                     base_url="http://agent.local", timeout=240) as agent:
            for goal in ("查一下我的账户余额", "给 Lin Wei 转 10 元，先让我确认"):
                run = uuid4().hex
                response = await agent.post("/agent/ag-ui", headers={"Cookie": cookie}, json={
                    "threadId": thread, "runId": run, "state": {},
                    "messages": [{"id": run, "role": "user", "content": goal}],
                    "tools": [], "context": [], "forwardedProps": {},
                })
                if response.status_code != 200:
                    raise RuntimeError(f"AG-UI HTTP {response.status_code}")
                events = [json.loads(line[6:]) for line in response.text.splitlines()
                          if line.startswith("data: ")]
                types = [event["type"] for event in events]
                if "RUN_ERROR" in types or "RUN_FINISHED" not in types:
                    raise RuntimeError(f"AG-UI run failed: {types}")
                state = next(event["snapshot"] for event in events
                             if event["type"] == "STATE_SNAPSHOT")
                task = app.state.agent_v2.tasks.get(state["taskId"])
                failure_codes = [entry.get("code") for entry in task.trace
                                 if entry.get("kind") == "FAILED"] if task else []
                runtime_errors = [{"type": entry.get("type"), "bank_code": entry.get("bank_code")}
                                  for entry in task.trace if entry.get("kind") == "RUNTIME_ERROR"] if task else []
                failed_tools = [{"tool": observation.tool_name, "error": observation.error}
                                for observation in task.observations if not observation.success] if task else []
                tool_names = [event["toolCallName"] for event in events
                              if event["type"] == "TOOL_CALL_START"]
                traces.append({"goal_class": "ACCOUNT_READ" if len(traces) == 0 else "TRANSFER_PREPARE",
                               "events": types, "tools": tool_names,
                               "task_status": state["status"],
                               "failure_codes": failure_codes,
                               "runtime_errors": runtime_errors,
                               "failed_tools": failed_tools,
                               "model_calls_so_far": model_calls})
        after = (await bank.get("/customer/accounts")).json()
        output = ROOT / "artifacts" / "agui-real-smoke.json"
        output.parent.mkdir(parents=True, exist_ok=True)
        output.write_text(json.dumps({"cases": traces, "model_calls": model_calls,
                                      "balances_unchanged": before == after}, indent=2), encoding="utf-8")
        if before != after:
            raise RuntimeError("AG-UI smoke changed account balances")
        if traces[0]["task_status"] != "SUCCEEDED" or traces[1]["task_status"] != "WAITING_CONFIRMATION":
            raise RuntimeError(f"AG-UI read/prepare states: {[case['task_status'] for case in traces]}; see {output}")
        if model_calls < 3 or not traces[0]["tools"] or not traces[1]["tools"]:
            raise RuntimeError("Real model/tool loop was not observed")
        print(f"AG-UI real DeepSeek/Spring smoke passed: {output}")
    return 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))

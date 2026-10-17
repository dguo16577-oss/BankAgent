"""Opt-in disposable Spring/PostgreSQL + DeepSeek smoke for Agent v2.

The caller supplies a sandbox BANKING_API_BASE_URL, demo credentials and
DEEPSEEK_API_KEY. This script executes exactly one 1.00 CNY demo transfer.
"""

from __future__ import annotations

import asyncio
import json
import os
import re
import sys
from decimal import Decimal
from pathlib import Path
from time import perf_counter

import httpx

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "services" / "agent-runtime"))

from app.banking import BankingGateway  # noqa: E402
from app.deepseek import DeepSeekClassifier  # noqa: E402
from app.main import create_app  # noqa: E402
from evals.m18_usage import UsageMeter  # noqa: E402
from evals.trajectory import export_trajectory  # noqa: E402


async def main() -> None:
    origin = os.environ["BANKING_API_BASE_URL"]
    assert os.environ.get("AGENT_RUNTIME_VERSION") == "v2"
    assert os.environ.get("DEEPSEEK_API_KEY")
    meter = UsageMeter()
    classifier = DeepSeekClassifier(key=os.environ["DEEPSEEK_API_KEY"], transport=meter)
    app = create_app(BankingGateway(origin), classifier, agent_version="v2")
    complete = classifier._json_completion
    model_requests = 0

    async def counted_completion(*args, **kwargs):
        nonlocal model_requests
        model_requests += 1
        result = await complete(*args, **kwargs)
        return result

    classifier._json_completion = counted_completion
    async with httpx.AsyncClient(base_url=origin, timeout=20) as bank:
        await bank.get("/customer/session")
        csrf = bank.cookies.get("XSRF-TOKEN")
        login = await bank.post("/customer/auth/login", json={"email": os.environ["ASTER_DEMO_EMAIL"],
                           "password": os.environ["ASTER_DEMO_PASSWORD"]}, headers={"X-XSRF-TOKEN": csrf or ""})
        assert login.status_code == 200, f"login {login.status_code}"
        await bank.get("/customer/session")
        csrf = bank.cookies.get("XSRF-TOKEN")
        cookie = "; ".join(f"{name}={value}" for name, value in bank.cookies.items())
        before = (await bank.get("/customer/accounts")).json()
        source = next(a for a in before["accounts"] if a["id"] == "acc_current")
        started = perf_counter()
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://agent.test", timeout=300) as agent:
            async def chat(message: str, task_id: str | None = None) -> dict:
                payload = {"message": message}
                if task_id:
                    payload["task_id"] = task_id
                response = await agent.post("/agent/chat", json=payload, headers={"Cookie": cookie})
                assert response.status_code == 200, f"agent chat {response.status_code}: {response.text[:300]}"
                return response.json()

            first = await chat("给张三转500")
            assert first["status"] == "WAITING_CONFIRMATION", (
                "first", first["status"], first.get("error_code"),
                [step["tool"] for step in first.get("steps", [])])
            old_id = first["confirmation"]["id"]
            revised = await chat("金额改成1000", first["task_id"])
            assert revised["status"] == "WAITING_CONFIRMATION", (
                "amount_revision", revised["status"], revised.get("error_code"),
                [step["tool"] for step in revised.get("steps", [])])
            assert revised["confirmation"]["amount"]["amount"] == "1000.00"
            old = (await bank.get(f"/customer/transfer-intents/{old_id}")).json()
            assert old["status"] == "CANCELLED", old["status"]
            middle_id = revised["confirmation"]["id"]
            changed = await chat("不是张三，是李四", first["task_id"])
            assert changed["status"] == "WAITING_CONFIRMATION", (
                "recipient_revision", changed["status"], changed.get("error_code"),
                [step["tool"] for step in changed.get("steps", [])])
            assert changed["confirmation"]["recipient"]["id"] == "recipient_li", {
                "recipient": changed["confirmation"]["recipient"],
            }
            middle = (await bank.get(f"/customer/transfer-intents/{middle_id}")).json()
            assert middle["status"] == "CANCELLED", middle["status"]
            cancel = await agent.post(f"/agent/tasks/{first['task_id']}/cancel", headers={"Cookie": cookie})
            assert cancel.status_code == 200 and cancel.json()["status"] == "CANCELLED"

            low = await chat("给张三转1元")
            assert low["status"] == "WAITING_CONFIRMATION", (
                "final_one_yuan", low["status"], low.get("error_code"),
                [step["tool"] for step in low.get("steps", [])], low.get("message", "")[:200])
            intent = low["confirmation"]
            path = f"/agent/tasks/{low['task_id']}/confirm"
            confirm = {"intent_id": intent["id"], "intent_hash": intent["intentHash"]}
            gate = await agent.post(path, json=confirm, headers={"Cookie": cookie})
            assert gate.status_code == 200 and gate.json()["status"] == "WAITING_AUTH"
            challenge = await bank.post("/customer/auth/step-up-challenges", json={
                "actionType": "TRANSFER_EXECUTE", "resourceType": "TRANSFER_INTENT",
                "resourceId": intent["id"], "resourceHash": intent["intentHash"]},
                headers={"X-XSRF-TOKEN": csrf or ""})
            assert challenge.status_code in {200, 201}, challenge.status_code
            sms = await bank.get(f"/customer/demo/sms/{challenge.json()['id']}")
            assert sms.status_code == 200, {"sms_status": sms.status_code, "response_keys": list(sms.json())}
            code = re.search(r"(?<!\d)\d{6}(?!\d)", sms.json()["messageBody"])
            assert code
            verified = await bank.post(f"/customer/auth/step-up-challenges/{challenge.json()['id']}/verify",
                                       json={"code": code.group()}, headers={"X-XSRF-TOKEN": csrf or ""})
            assert verified.status_code == 200, verified.status_code
            confirm["action_authorization_id"] = verified.json()["authorization"]["id"]
            done = await agent.post(path, json=confirm, headers={"Cookie": cookie})
            repeated = await agent.post(path, json=confirm, headers={"Cookie": cookie})
            assert done.status_code == repeated.status_code == 200
            assert done.json()["status"] == "SUCCEEDED"
            assert done.json()["receipt"] == repeated.json()["receipt"]
            after = (await bank.get("/customer/accounts")).json()
            new_source = next(a for a in after["accounts"] if a["id"] == "acc_current")
            assert Decimal(source["balance"]["amount"]) - Decimal(new_source["balance"]["amount"]) == Decimal("1.00")
            revision_task = app.state.agent_v2.tasks[first["task_id"]]
            completed_task = app.state.agent_v2.tasks[low["task_id"]]
            trace = completed_task.trace
            planner_calls = sum(entry.get("kind") == "PLANNER_DECISION"
                                for task in (revision_task, completed_task) for entry in task.trace)
            tool_calls = sum(entry.get("kind") == "TOOL_RESULT"
                             for task in (revision_task, completed_task) for entry in task.trace)
            usage_complete = len(meter.records) == model_requests
            if not usage_complete or meter.peak_cost_usd() is None:
                raise AssertionError("Incomplete DeepSeek usage evidence")
            trajectory = export_trajectory(case_id="DC01-TRANSFER-LIFECYCLE", task=completed_task,
                model=classifier.model, tool_registry=app.state.agent_v2.registry.visible(),
                initial_db_state={"source_balance": source["balance"]["amount"]},
                final_db_state={"source_balance": new_source["balance"]["amount"]},
                policy_state={"authenticated": True, "confirmation_required": True},
                invariants={"exactly_one_debit": True, "duplicate_same_receipt": True},
                result="PASS")
            summary = {"status": "PASS", "revision_old_status": old["status"],
                "case_id": "DC01-TRANSFER-LIFECYCLE", "category": "Duplicate confirmation",
                "model": "DEEPSEEK", "task_state": done.json()["status"],
                "recipient_revision_old_status": middle["status"],
                "tool_order": [entry["tool"] for entry in trace if entry.get("kind") == "TOOL_RESULT"],
                "planner_decisions": planner_calls, "tool_calls": tool_calls,
                "model_http_requests": model_requests, "model_usage": meter.records,
                "usage_coverage_complete": usage_complete,
                "estimated_model_cost_usd": meter.peak_cost_usd(),
                "latency_ms": round((perf_counter() - started) * 1000),
                "balance_debit": "1.00", "duplicate_same_receipt": True,
                "trajectory": trajectory}
            output = Path(os.getenv("AGENT_LIVE_SMOKE_OUTPUT", str(ROOT / "artifacts" / "m17r-agent-v2-live.json")))
            output.parent.mkdir(parents=True, exist_ok=True)
            output.write_text(json.dumps(summary, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
            print(json.dumps({"case_id": summary["case_id"], "status": summary["status"],
                              "model_http_requests": model_requests,
                              "tool_calls": tool_calls}, ensure_ascii=False))
    await meter.close_pool()


if __name__ == "__main__":
    asyncio.run(main())

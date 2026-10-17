"""Non-debiting DeepSeek + Spring/PostgreSQL transfer preview smoke.

Uses two cases from the adapted dataset. Every prepared intent is cancelled.
"""

from __future__ import annotations

import asyncio
import json
import os
import sys
from decimal import Decimal
from pathlib import Path

import httpx

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "services" / "agent-runtime"))

from app.banking import BankingApiError, BankingGateway  # noqa: E402
from app.main import create_app  # noqa: E402

DATA = ROOT / "research" / "agent-transfer" / "aster-transfer-eval-v1.jsonl"
OUTPUT = ROOT / "artifacts" / "agent-transfer-real-preview-v1.json"


async def main() -> int:
    origin = os.environ["BANKING_API_BASE_URL"].rstrip("/")
    assert origin in {"http://127.0.0.1:18080", "http://localhost:18080"}, "local sandbox only"
    assert os.environ.get("DEEPSEEK_API_KEY")
    cases = {row["id"]: row for row in map(json.loads, DATA.read_text(encoding="utf-8").splitlines())}
    gateway = BankingGateway(origin)
    bank_errors = []
    original_prepare = gateway.prepare_transfer

    async def observed_prepare(cookie, body):
        try:
            return await original_prepare(cookie, body)
        except BankingApiError as exc:
            bank_errors.append({"status": exc.status, "code": exc.code})
            raise

    gateway.prepare_transfer = observed_prepare
    app = create_app(gateway)
    rows = []
    async with httpx.AsyncClient(base_url=origin, timeout=20) as bank:
        await bank.get("/customer/session")
        csrf = bank.cookies.get("XSRF-TOKEN")
        login = await bank.post("/customer/auth/login", json={"email": os.environ["ASTER_DEMO_EMAIL"],
            "password": os.environ["ASTER_DEMO_PASSWORD"]}, headers={"X-XSRF-TOKEN": csrf or ""})
        assert login.status_code == 200, f"login HTTP {login.status_code}"
        session = await bank.get("/customer/session")
        assert session.status_code == 200 and session.json().get("authenticated") is True
        cookie = "; ".join(f"{name}={value}" for name, value in bank.cookies.items())
        before = (await bank.get("/customer/accounts")).json()
        current = next(row for row in before["accounts"] if row["id"] == "acc_current")
        before_balance = Decimal(current["balance"]["amount"])
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://agent.test", timeout=90) as agent:
            for case_id in ("T02", "T03"):
                case = cases[case_id]
                task_id = None
                intent_ids = []
                statuses = []
                try:
                    for turn in case["turns"]:
                        body = {"message": turn}
                        if task_id:
                            body["task_id"] = task_id
                        response = await agent.post("/agent/chat", json=body, headers={"Cookie": cookie})
                        assert response.status_code == 200, f"{case_id} chat HTTP {response.status_code}"
                        payload = response.json()
                        task_id = payload["task_id"]
                        statuses.append(payload["status"])
                        if payload.get("confirmation"):
                            intent_ids.append(payload["confirmation"]["id"])
                    task = app.state.agent_v2.tasks[task_id]
                    tools = [event["tool"] for event in task.trace if event.get("kind") == "TOOL_RESULT"]
                    confirmation = payload.get("confirmation")
                    passed = (statuses[-1] == case["expected_status"] and
                        confirmation is not None and confirmation["amount"]["amount"] == case["expected_amount"] and
                        confirmation["recipient"]["id"] == "recipient_zhang" and
                        "prepare_transfer" in tools)
                    if case_id == "T03" and len(intent_ids) >= 2:
                        old = await bank.get(f"/customer/transfer-intents/{intent_ids[0]}")
                        passed = passed and old.json()["status"] == "CANCELLED"
                    rows.append({"id": case_id, "pass": passed, "statuses": statuses,
                        "error_code": payload.get("error_code"), "bank_errors": bank_errors[-1:], "tools": tools,
                        "runtime_error_types": [event["type"] for event in task.trace if event.get("kind") == "RUNTIME_ERROR"],
                        "recipient_resolution": [event.get("result", {}).get("status") for event in task.trace
                                                 if event.get("kind") == "TOOL_RESULT" and event.get("tool") == "resolve_recipient"],
                        "planner_calls": sum(event.get("kind") == "PLANNER_DECISION" for event in task.trace)})
                finally:
                    if task_id:
                        await agent.post(f"/agent/tasks/{task_id}/cancel", headers={"Cookie": cookie})
                for intent_id in intent_ids:
                    state = await bank.get(f"/customer/transfer-intents/{intent_id}")
                    assert state.status_code == 200 and state.json()["status"] == "CANCELLED"
        after = (await bank.get("/customer/accounts")).json()
        current_after = next(row for row in after["accounts"] if row["id"] == "acc_current")
        unchanged = Decimal(current_after["balance"]["amount"]) == before_balance
    report = {"suite": "aster-transfer-real-preview-v1", "bank": "Spring/PostgreSQL local",
        "planner": "real-deepseek", "balance_unchanged": unchanged, "results": rows}
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(report, ensure_ascii=False))
    return 0 if unchanged and all(row["pass"] for row in rows) else 1


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))

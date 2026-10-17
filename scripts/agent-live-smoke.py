"""Opt-in local demo mutation: Agent -> Spring prepare, step-up, execute.

Requires ASTER_DEMO_EMAIL and ASTER_DEMO_PASSWORD. It moves 1.00 CNY in the
local demo database; never include it in CI or production startup.
"""

from __future__ import annotations

import asyncio
import os
import re
import sys
from decimal import Decimal
from pathlib import Path

import httpx

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "services" / "agent-runtime"))

from app.banking import BankingGateway  # noqa: E402
from app.main import create_app  # noqa: E402
from app.transfer_planner import ScriptedPlanner  # noqa: E402


async def main() -> None:
    email = os.environ["ASTER_DEMO_EMAIL"]
    password = os.environ["ASTER_DEMO_PASSWORD"]
    origin = os.getenv("BANKING_API_BASE_URL", "http://127.0.0.1:18080")
    app = create_app(BankingGateway(origin), transfer_planner=None if os.getenv("DEEPSEEK_API_KEY") else ScriptedPlanner())
    async with httpx.AsyncClient(base_url=origin, timeout=15) as bank:
        await bank.get("/customer/session")
        csrf = bank.cookies.get("XSRF-TOKEN")
        login = await bank.post("/customer/auth/login", json={"email": email, "password": password},
                                headers={"X-XSRF-TOKEN": csrf or ""})
        assert login.status_code == 200, f"Login failed: {login.status_code}"
        await bank.get("/customer/session")  # login rotates the CSRF cookie
        csrf = bank.cookies.get("XSRF-TOKEN")
        assert csrf
        cookie = "; ".join(f"{name}={value}" for name, value in bank.cookies.items())
        before = await bank.get("/customer/accounts")
        assert before.status_code == 200
        source_before = next(a for a in before.json().get("accounts", before.json().get("items", []))
                             if a.get("type") == "CURRENT" and a.get("currency") == "CNY")
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://agent.local", timeout=30) as agent:
            started = await agent.post("/agent/chat", json={"message": "转给 Lin Wei 1 元"}, headers={"Cookie": cookie})
            assert started.status_code == 200, started.text
            task = started.json()
            assert task["status"] == "WAITING_CONFIRMATION", task
            if os.getenv("DEEPSEEK_API_KEY"):
                assert task["mode"] == "DEEPSEEK", task
            intent = task["confirmation"]
            path = f"/agent/tasks/{task['task_id']}/confirm"
            confirm = {"intent_id": intent["id"], "intent_hash": intent["intentHash"]}
            gate = await agent.post(path, json=confirm, headers={"Cookie": cookie})
            assert gate.status_code == 200 and gate.json()["status"] == "WAITING_AUTH"
            challenge = await bank.post("/customer/auth/step-up-challenges", json={
                "actionType": "TRANSFER_EXECUTE", "resourceType": "TRANSFER_INTENT",
                "resourceId": intent["id"], "resourceHash": intent["intentHash"],
            }, headers={"X-XSRF-TOKEN": csrf})
            assert challenge.status_code in {200, 201}, challenge.status_code
            sms = await bank.get(f"/customer/demo/sms/{challenge.json()['id']}")
            assert sms.status_code == 200
            code = re.search(r"(?<!\d)\d{6}(?!\d)", sms.json()["messageBody"])
            assert code
            verified = await bank.post(f"/customer/auth/step-up-challenges/{challenge.json()['id']}/verify",
                                       json={"code": code.group()}, headers={"X-XSRF-TOKEN": csrf})
            assert verified.status_code == 200, verified.status_code
            confirm["action_authorization_id"] = verified.json()["authorization"]["id"]
            done = await agent.post(path, json=confirm, headers={"Cookie": cookie})
            assert done.status_code == 200 and done.json()["status"] == "SUCCEEDED", done.text
            repeated = await agent.post(path, json=confirm, headers={"Cookie": cookie})
            assert repeated.status_code == 200 and repeated.json()["receipt"] == done.json()["receipt"]
            after = await bank.get("/customer/accounts")
            assert after.status_code == 200
            source_after = next(a for a in after.json().get("accounts", after.json().get("items", []))
                                if a.get("id") == source_before["id"])
            assert Decimal(source_before["balance"]["amount"]) - Decimal(source_after["balance"]["amount"]) == Decimal("1.00")
            print("Agent -> Spring prepare/step-up/execute: PASS")
            print("Planner mode:", task["mode"])
            print("Duplicate confirmation returned the same receipt, one source debit: PASS")
            print("Reference:", done.json()["receipt"]["reference"])


if __name__ == "__main__":
    asyncio.run(main())

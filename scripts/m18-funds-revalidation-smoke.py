"""Real-model Agent transfer must fail closed when bank state changes after prepare.

Run only through m18-benchmark-sandbox.py in its disposable PostgreSQL bank.
The direct balance update simulates an external debit; it is not Agent activity.
"""

from __future__ import annotations

import asyncio
import argparse
import json
import os
import re
import subprocess
import sys
from datetime import datetime, timezone
from decimal import Decimal
from pathlib import Path
from time import perf_counter
from urllib.parse import urlsplit

import httpx

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "services" / "agent-runtime"))

from app.banking import BankingGateway  # noqa: E402
from app.deepseek import DeepSeekClassifier  # noqa: E402
from app.main import create_app  # noqa: E402
from evals.m18_usage import UsageMeter  # noqa: E402
from evals.trajectory import export_trajectory  # noqa: E402


def database(sql: str) -> str:
    container = os.environ["ASTER_BENCHMARK_POSTGRES_CONTAINER"]
    if not re.fullmatch(r"aster-m18-[a-f0-9]{10}", container):
        raise RuntimeError("Funds revalidation requires a disposable M18 database")
    result = subprocess.run(["docker", "exec", container, "psql", "-U",
        os.environ["ASTER_BENCHMARK_DB_USER"], "-d", os.environ["ASTER_BENCHMARK_DB_NAME"],
        "-tAc", sql], capture_output=True, text=True, encoding="utf-8", errors="replace",
        check=True, timeout=15)
    return result.stdout.strip()


def financial_snapshot() -> dict:
    return json.loads(database("""
SELECT json_build_object(
  'balance', (SELECT balance::text FROM accounts WHERE account_id='acc_current'),
  'account_status', (SELECT status FROM accounts WHERE account_id='acc_current'),
  'recipient_status', (SELECT status FROM recipients WHERE recipient_id='recipient_lin'),
  'transfers', (SELECT count(*) FROM transfers WHERE customer_id='usr_aster_alex'),
  'debit_transactions', (SELECT count(*) FROM transactions
    WHERE customer_id='usr_aster_alex' AND type='BANK_TRANSFER' AND direction='DEBIT')
)::text
"""))


async def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--scenario", choices=("funds", "recipient", "account", "expired"), default="funds")
    options = parser.parse_args()
    origin = os.environ["BANKING_API_BASE_URL"]
    parsed = urlsplit(origin)
    if (os.getenv("ASTER_BENCHMARK_SANDBOX") != "1" or parsed.scheme != "http"
            or parsed.hostname != "127.0.0.1" or not parsed.port or parsed.path
            or os.getenv("AGENT_RUNTIME_VERSION") != "v2"):
        raise RuntimeError("Run through the isolated M18 benchmark sandbox")
    key = os.environ["DEEPSEEK_API_KEY"]
    meter = UsageMeter()
    classifier = DeepSeekClassifier(key=key, transport=meter)
    app = create_app(BankingGateway(origin), classifier, agent_version="v2")
    completion = classifier._json_completion
    model_requests = 0

    async def counted_completion(*args, **kwargs):
        nonlocal model_requests
        model_requests += 1
        return await completion(*args, **kwargs)

    classifier._json_completion = counted_completion
    before = financial_snapshot()
    started = perf_counter()
    try:
        async with httpx.AsyncClient(base_url=origin, timeout=20) as bank:
            bootstrap = await bank.get("/customer/session")
            csrf = bank.cookies.get("XSRF-TOKEN")
            assert bootstrap.status_code in {200, 401} and csrf
            login = await bank.post("/customer/auth/login", json={
                "email": os.getenv("ASTER_DEMO_EMAIL", "alex@aster.local"),
                "password": os.getenv("ASTER_DEMO_PASSWORD", "demo-password")},
                headers={"X-XSRF-TOKEN": csrf})
            assert login.status_code == 200, f"login HTTP {login.status_code}"
            await bank.get("/customer/session")
            csrf = bank.cookies.get("XSRF-TOKEN")
            cookie = "; ".join(f"{name}={value}" for name, value in bank.cookies.items())
            async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app),
                                         base_url="http://agent.test", timeout=90) as agent:
                proposed = await agent.post("/agent/chat", json={"message": "给 Lin Wei 转10元"},
                                            headers={"Cookie": cookie})
                assert proposed.status_code == 200
                prepared = proposed.json()
                assert prepared["status"] == "WAITING_CONFIRMATION"
                intent = prepared["confirmation"]
                assert intent["amount"]["amount"] == "10.00"
                assert intent["recipient"]["id"] == "recipient_lin"
                task_id = prepared["task_id"]
                unchanged_after_prepare = financial_snapshot()
                assert unchanged_after_prepare == before

                # One controlled, external state change in the disposable bank.
                if options.scenario == "funds":
                    database("UPDATE accounts SET balance=1.00, pending_amount=0.00 "
                             "WHERE account_id='acc_current' AND customer_id='usr_aster_alex'")
                elif options.scenario == "recipient":
                    database("UPDATE recipients SET status='INACTIVE' "
                             "WHERE recipient_id='recipient_lin' AND customer_id='usr_aster_alex'")
                elif options.scenario == "account":
                    database("UPDATE accounts SET status='FROZEN' "
                             "WHERE account_id='acc_current' AND customer_id='usr_aster_alex'")
                else:
                    expires_at = datetime.fromisoformat(intent["expiresAt"].replace("Z", "+00:00"))
                    remaining = (expires_at - datetime.now(timezone.utc)).total_seconds()
                    if remaining < 0 or remaining > 16 * 60:
                        raise RuntimeError("Unexpected transfer-intent expiry interval")
                    await asyncio.sleep(remaining + 1.5)
                    expired = await bank.get(f"/customer/transfer-intents/{intent['id']}")
                    assert expired.status_code == 200 and expired.json()["status"] == "EXPIRED"
                depleted = financial_snapshot()
                if options.scenario == "funds":
                    assert Decimal(depleted["balance"]) == Decimal("1.00")
                elif options.scenario == "recipient":
                    assert depleted["recipient_status"] == "INACTIVE"
                    assert depleted["balance"] == before["balance"]
                elif options.scenario == "account":
                    assert depleted["account_status"] == "FROZEN"
                    assert depleted["balance"] == before["balance"]
                else:
                    assert depleted == before
                assert depleted["transfers"] == before["transfers"]
                assert depleted["debit_transactions"] == before["debit_transactions"]

                path = f"/agent/tasks/{task_id}/confirm"
                confirmation = {"intent_id": intent["id"], "intent_hash": intent["intentHash"]}
                gate = await agent.post(path, json=confirmation, headers={"Cookie": cookie})
                if options.scenario == "expired":
                    # The runtime checks the persisted bank intent before requesting step-up.
                    # An expired intent must be rejected at this first confirmation boundary.
                    rejected = gate
                else:
                    assert gate.status_code == 200 and gate.json()["status"] == "WAITING_AUTH"
                    challenge = await bank.post("/customer/auth/step-up-challenges", json={
                        "actionType": "TRANSFER_EXECUTE", "resourceType": "TRANSFER_INTENT",
                        "resourceId": intent["id"], "resourceHash": intent["intentHash"]},
                        headers={"X-XSRF-TOKEN": csrf or ""})
                    assert challenge.status_code in {200, 201}
                    sms = await bank.get(f"/customer/demo/sms/{challenge.json()['id']}")
                    assert sms.status_code == 200
                    code = re.search(r"(?<!\d)\d{6}(?!\d)", sms.json()["messageBody"])
                    assert code
                    verified = await bank.post(
                        f"/customer/auth/step-up-challenges/{challenge.json()['id']}/verify",
                        json={"code": code.group()}, headers={"X-XSRF-TOKEN": csrf or ""})
                    assert verified.status_code == 200
                    confirmation["action_authorization_id"] = verified.json()["authorization"]["id"]
                    rejected = await agent.post(path, json=confirmation, headers={"Cookie": cookie})
                rejected_body = rejected.json()
                expected_code = {"funds": "INSUFFICIENT_FUNDS", "recipient": "RECIPIENT_INACTIVE",
                                 "account": "ACCOUNT_NOT_ELIGIBLE",
                                 "expired": "TRANSFER_INTENT_UNAVAILABLE"}[options.scenario]
                expected_status = 422 if options.scenario in {"recipient", "account"} else 409
                assert rejected.status_code == expected_status and rejected_body.get("detail") == expected_code, (
                    rejected.status_code, rejected_body.get("detail"))
                after_rejection = financial_snapshot()
                assert after_rejection == depleted, "A rejected confirmation changed financial state"
                expected_intent_status = "EXPIRED" if options.scenario == "expired" else "PREPARED"
                assert (await bank.get(f"/customer/transfer-intents/{intent['id']}")).json()["status"] == expected_intent_status

                cancelled = await agent.post(f"/agent/tasks/{task_id}/cancel",
                                             headers={"Cookie": cookie})
                assert cancelled.status_code == 200 and cancelled.json()["status"] == "CANCELLED"
                final_intent_status = "EXPIRED" if options.scenario == "expired" else "CANCELLED"
                assert (await bank.get(f"/customer/transfer-intents/{intent['id']}")).json()["status"] == final_intent_status
                after_cancel = financial_snapshot()
                assert after_cancel == depleted
                task = app.state.agent_v2.tasks[task_id]
                coverage = len(meter.records) == model_requests and model_requests > 0
                assert coverage and meter.peak_cost_usd() is not None
                case_id = {"funds": "IF02-FUNDS-REVALIDATION",
                           "recipient": "SS01-RECIPIENT-STALE-STATE",
                           "account": "SS02-ACCOUNT-STALE-STATE",
                           "expired": "EX01-EXPIRED-INTENT"}[options.scenario]
                category = {"funds": "Insufficient funds", "recipient": "Stale state",
                            "account": "Stale state",
                            "expired": "Expired intent"}[options.scenario]
                trajectory = export_trajectory(case_id=case_id, task=task,
                    model=classifier.model, tool_registry=app.state.agent_v2.registry.visible(),
                    initial_db_state=before, final_db_state=after_cancel,
                    policy_state={"authenticated": True, "confirmation_required": True},
                    invariants={"no_debit_before_confirmation": True,
                                "stale_state_rejected": True,
                                "no_agent_financial_effect": True,
                                "intent_terminal_after_failure": True}, result="PASS")
                summary = {"case_id": case_id,
                    "category": category, "status": "PASS", "model": "DEEPSEEK",
                    "task_state": "CANCELLED", "rejected_http_status": rejected.status_code,
                    "rejected_code": rejected_body["detail"], "model_http_requests": model_requests,
                    "model_usage": meter.records, "usage_coverage_complete": coverage,
                    "planner_decisions": sum(e.get("kind") == "PLANNER_DECISION" for e in task.trace),
                    "tool_calls": sum(e.get("kind") == "TOOL_RESULT" for e in task.trace),
                    "estimated_model_cost_usd": meter.peak_cost_usd(),
                    "latency_ms": round((perf_counter() - started) * 1000),
                    "postgresql_evidence": {"verified": True,
                        "balance_after_external_change": depleted["balance"],
                        "balance_after_rejected_confirm": after_rejection["balance"],
                        "account_status_after_external_change": depleted["account_status"],
                        "account_status_after_rejected_confirm": after_rejection["account_status"],
                        "recipient_status_after_external_change": depleted["recipient_status"],
                        "recipient_status_after_rejected_confirm": after_rejection["recipient_status"],
                        "new_transfers_after_external_change": depleted["transfers"] - before["transfers"],
                        "new_transfers_after_rejected_confirm": after_rejection["transfers"] - before["transfers"],
                        "new_debit_transactions_after_rejected_confirm":
                            after_rejection["debit_transactions"] - before["debit_transactions"]},
                    "trajectory": trajectory}
                output = ROOT / "artifacts" / {"funds": "m18-isolated-funds-revalidation.json",
                    "recipient": "m18-isolated-recipient-stale-state.json",
                    "account": "m18-isolated-account-stale-state.json",
                    "expired": "m18-isolated-expired-intent.json"}[options.scenario]
                output.write_text(json.dumps(summary, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
                print(json.dumps({"case_id": summary["case_id"], "status": "PASS",
                                  "model_http_requests": model_requests,
                                  "bank_rejected_code": summary["rejected_code"]}, ensure_ascii=False))
    finally:
        await meter.close_pool()


if __name__ == "__main__":
    asyncio.run(main())

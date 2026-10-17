"""Prove duplicate and tampered confirmations fail safely in a disposable bank."""

from __future__ import annotations

import asyncio
import argparse
import json
import os
import re
import subprocess
import sys
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
        raise RuntimeError("Duplicate request smoke requires a disposable M18 database")
    result = subprocess.run(["docker", "exec", container, "psql", "-U",
        os.environ["ASTER_BENCHMARK_DB_USER"], "-d", os.environ["ASTER_BENCHMARK_DB_NAME"],
        "-tAc", sql], capture_output=True, text=True, encoding="utf-8", errors="replace",
        check=True, timeout=15)
    return result.stdout.strip()


def financial_snapshot() -> dict:
    return json.loads(database("""
SELECT json_build_object(
  'balance', (SELECT balance::text FROM accounts WHERE account_id='acc_current'),
  'intents', (SELECT count(*) FROM transfer_intents WHERE customer_id='usr_aster_alex'),
  'transfers', (SELECT count(*) FROM transfers WHERE customer_id='usr_aster_alex'),
  'debit_transactions', (SELECT count(*) FROM transactions
    WHERE customer_id='usr_aster_alex' AND type='BANK_TRANSFER' AND direction='DEBIT')
)::text
"""))


async def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--scenario", choices=("duplicate-request", "tampered-hash"),
                        default="duplicate-request")
    options = parser.parse_args()
    origin = os.environ["BANKING_API_BASE_URL"]
    parsed = urlsplit(origin)
    if (os.getenv("ASTER_BENCHMARK_SANDBOX") != "1" or parsed.scheme != "http"
            or parsed.hostname != "127.0.0.1" or not parsed.port or parsed.path
            or os.getenv("AGENT_RUNTIME_VERSION") != "v2"):
        raise RuntimeError("Run through the isolated M18 benchmark sandbox")
    meter = UsageMeter()
    classifier = DeepSeekClassifier(key=os.environ["DEEPSEEK_API_KEY"], transport=meter)
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
                body = {"message": "给 Lin Wei 转1元", "request_id": "d" * 32}
                if options.scenario == "duplicate-request":
                    first_http, duplicate_http = await asyncio.gather(
                        agent.post("/agent/chat", json=body, headers={"Cookie": cookie}),
                        agent.post("/agent/chat", json=body, headers={"Cookie": cookie}))
                    assert first_http.status_code == duplicate_http.status_code == 200
                    first, duplicate = first_http.json(), duplicate_http.json()
                    assert first["status"] == duplicate["status"] == "WAITING_CONFIRMATION"
                    assert first["task_id"] == duplicate["task_id"]
                    assert first["confirmation"]["id"] == duplicate["confirmation"]["id"]
                else:
                    first_http = await agent.post("/agent/chat", json=body, headers={"Cookie": cookie})
                    assert first_http.status_code == 200
                    first = first_http.json()
                    assert first["status"] == "WAITING_CONFIRMATION"
                prepared = financial_snapshot()
                assert prepared["intents"] - before["intents"] == 1
                assert prepared["transfers"] == before["transfers"]
                assert prepared["debit_transactions"] == before["debit_transactions"]
                assert prepared["balance"] == before["balance"]

                intent = first["confirmation"]
                assert intent["amount"]["amount"] == "1.00"
                assert intent["recipient"]["id"] == "recipient_lin"
                path = f"/agent/tasks/{first['task_id']}/confirm"
                if options.scenario == "tampered-hash":
                    correct_hash = intent["intentHash"]
                    wrong_hash = correct_hash[:-1] + ("0" if correct_hash[-1] != "0" else "1")
                    rejected = await agent.post(path, json={"intent_id": intent["id"],
                        "intent_hash": wrong_hash}, headers={"Cookie": cookie})
                    assert rejected.status_code == 409
                    assert rejected.json().get("detail") == "TRANSFER_INTENT_HASH_MISMATCH"
                    unchanged = financial_snapshot()
                    assert unchanged == prepared
                    assert re.fullmatch(r"[A-Za-z0-9_-]{1,128}", intent["id"])
                    assert database(f"SELECT status FROM transfer_intents WHERE intent_id='{intent['id']}'") == "PREPARED"
                    cancelled_http = await agent.post(f"/agent/tasks/{first['task_id']}/cancel",
                                                       headers={"Cookie": cookie})
                    assert cancelled_http.status_code == 200
                    assert cancelled_http.json()["status"] == "CANCELLED"
                    assert database(f"SELECT status FROM transfer_intents WHERE intent_id='{intent['id']}'") == "CANCELLED"
                    after_cancel = financial_snapshot()
                    assert after_cancel["balance"] == before["balance"]
                    assert after_cancel["transfers"] == before["transfers"]
                    assert after_cancel["debit_transactions"] == before["debit_transactions"]
                    assert after_cancel["intents"] - before["intents"] == 1
                    task = app.state.agent_v2.tasks[first["task_id"]]
                    coverage = len(meter.records) == model_requests and model_requests > 0
                    assert coverage and meter.peak_cost_usd() is not None
                    trajectory = export_trajectory(case_id="DC02-TAMPERED-INTENT-HASH", task=task,
                        model=classifier.model, tool_registry=app.state.agent_v2.registry.visible(),
                        initial_db_state=before, final_db_state=after_cancel,
                        policy_state={"authenticated": True, "confirmation_required": True},
                        invariants={"exact_prepared_terms": True, "tampered_hash_rejected": True,
                                    "bank_intent_cancelled": True, "no_debit": True}, result="PASS")
                    summary = {"case_id": "DC02-TAMPERED-INTENT-HASH",
                        "category": "Duplicate confirmation", "status": "PASS", "model": "DEEPSEEK",
                        "task_state": "CANCELLED", "model_http_requests": model_requests,
                        "model_usage": meter.records, "usage_coverage_complete": coverage,
                        "planner_decisions": sum(e.get("kind") == "PLANNER_DECISION" for e in task.trace),
                        "tool_calls": sum(e.get("kind") == "TOOL_RESULT" for e in task.trace),
                        "estimated_model_cost_usd": meter.peak_cost_usd(),
                        "latency_ms": round((perf_counter() - started) * 1000),
                        "rejected_http_status": rejected.status_code,
                        "rejected_code": rejected.json()["detail"],
                        "postgresql_evidence": {"verified": True,
                            "intents_created": after_cancel["intents"] - before["intents"],
                            "intent_status_after_reject": "PREPARED",
                            "intent_status_after_cancel": "CANCELLED",
                            "source_debit": str(Decimal(before["balance"]) - Decimal(after_cancel["balance"])),
                            "new_transfers": after_cancel["transfers"] - before["transfers"],
                            "new_debit_transactions": after_cancel["debit_transactions"] - before["debit_transactions"]},
                        "trajectory": trajectory}
                    output = ROOT / "artifacts/m18-isolated-tampered-confirmation.json"
                    output.write_text(json.dumps(summary, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
                    print(json.dumps({"case_id": summary["case_id"], "status": "PASS",
                                      "model_http_requests": model_requests, "source_debit": "0.00"},
                                     ensure_ascii=False))
                    return
                confirmation = {"intent_id": intent["id"], "intent_hash": intent["intentHash"]}
                gate = await agent.post(path, json=confirmation, headers={"Cookie": cookie})
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
                confirmed, repeated_confirm = await asyncio.gather(
                    agent.post(path, json=confirmation, headers={"Cookie": cookie}),
                    agent.post(path, json=confirmation, headers={"Cookie": cookie}))
                assert confirmed.status_code == repeated_confirm.status_code == 200
                assert confirmed.json()["status"] == repeated_confirm.json()["status"] == "SUCCEEDED"
                assert confirmed.json()["receipt"] == repeated_confirm.json()["receipt"]
                after = financial_snapshot()
                assert Decimal(before["balance"]) - Decimal(after["balance"]) == Decimal("1.00")
                assert after["intents"] - before["intents"] == 1
                assert after["transfers"] - before["transfers"] == 1
                assert after["debit_transactions"] - before["debit_transactions"] == 1
                task = app.state.agent_v2.tasks[first["task_id"]]
                coverage = len(meter.records) == model_requests and model_requests > 0
                assert coverage and meter.peak_cost_usd() is not None
                trajectory = export_trajectory(case_id="DR01-DUPLICATE-CHAT-REQUEST", task=task,
                    model=classifier.model, tool_registry=app.state.agent_v2.registry.visible(),
                    initial_db_state=before, final_db_state=after,
                    policy_state={"authenticated": True, "confirmation_required": True},
                    invariants={"one_prepared_intent": True, "no_debit_before_confirmation": True,
                                "one_debit_after_concurrent_confirmation": True}, result="PASS")
                summary = {"case_id": "DR01-DUPLICATE-CHAT-REQUEST",
                    "category": "Duplicate request", "status": "PASS", "model": "DEEPSEEK",
                    "task_state": "SUCCEEDED", "model_http_requests": model_requests,
                    "model_usage": meter.records, "usage_coverage_complete": coverage,
                    "planner_decisions": sum(e.get("kind") == "PLANNER_DECISION" for e in task.trace),
                    "tool_calls": sum(e.get("kind") == "TOOL_RESULT" for e in task.trace),
                    "estimated_model_cost_usd": meter.peak_cost_usd(),
                    "latency_ms": round((perf_counter() - started) * 1000),
                    "postgresql_evidence": {"verified": True,
                        "new_intents_after_duplicate_chat": prepared["intents"] - before["intents"],
                        "new_transfers_after_duplicate_chat": prepared["transfers"] - before["transfers"],
                        "new_debits_after_duplicate_chat": prepared["debit_transactions"] - before["debit_transactions"],
                        "source_debit_after_confirmation": str(Decimal(before["balance"]) - Decimal(after["balance"])),
                        "new_transfers_after_confirmation": after["transfers"] - before["transfers"],
                        "new_debits_after_confirmation": after["debit_transactions"] - before["debit_transactions"]},
                    "same_task_on_duplicate_chat": first["task_id"] == duplicate["task_id"],
                    "same_intent_on_duplicate_chat": intent["id"] == duplicate["confirmation"]["id"],
                    "same_receipt_on_duplicate_confirmation":
                        confirmed.json()["receipt"] == repeated_confirm.json()["receipt"],
                    "trajectory": trajectory}
                output = ROOT / "artifacts/m18-isolated-duplicate-request.json"
                output.write_text(json.dumps(summary, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
                print(json.dumps({"case_id": summary["case_id"], "status": "PASS",
                                  "model_http_requests": model_requests,
                                  "source_debit": summary["postgresql_evidence"]["source_debit_after_confirmation"]},
                                 ensure_ascii=False))
    finally:
        await meter.close_pool()


if __name__ == "__main__":
    asyncio.run(main())

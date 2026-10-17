"""Real-model schedule and AA preparation against an isolated Spring/PostgreSQL bank.

The sandbox launcher owns the disposable database. This runner never confirms an
action intent, so it must leave all balances, transfers and split bills unchanged.
"""

from __future__ import annotations

import asyncio
import hashlib
import json
import os
import re
import subprocess
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path
from time import perf_counter
from uuid import uuid4

import httpx

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "services" / "agent-runtime"))

from app.banking import BankingGateway  # noqa: E402
from app.deepseek import DeepSeekClassifier  # noqa: E402
from app.main import create_app  # noqa: E402
from app.task_models import ConfirmRequest  # noqa: E402
from evals.m18_usage import UsageMeter  # noqa: E402
from evals.trajectory import sanitize  # noqa: E402


def sql_json(statement: str) -> dict:
    container = os.environ["ASTER_BENCHMARK_POSTGRES_CONTAINER"]
    if not re.fullmatch(r"aster-m18-[a-f0-9]{10}", container):
        raise RuntimeError("Disposable PostgreSQL container required")
    result = subprocess.run(["docker", "exec", container, "psql", "-U",
        os.environ["ASTER_BENCHMARK_DB_USER"], "-d", os.environ["ASTER_BENCHMARK_DB_NAME"],
        "-tAc", statement], capture_output=True, text=True, check=True, timeout=20)
    return json.loads(result.stdout.strip())


def snapshot() -> dict:
    return sql_json("""
SELECT json_build_object(
 'account_digest', (SELECT md5(coalesce(string_agg(account_id || ':' || balance::text,
   '|' ORDER BY account_id),'')) FROM accounts),
 'transfer_count', (SELECT count(*) FROM transfers),
 'schedule_count', (SELECT count(*) FROM scheduled_payments),
 'split_count', (SELECT count(*) FROM split_bills),
 'schedule_intent_count', (SELECT count(*) FROM scheduled_payment_intents),
 'split_intent_count', (SELECT count(*) FROM split_action_intents)
)::text
""")


def intent_status(kind: str, intent_id: str) -> str | None:
    if not re.fullmatch(r"[A-Za-z0-9_-]{1,128}", intent_id):
        raise RuntimeError("Invalid action intent ID")
    table = "scheduled_payment_intents" if kind == "SCHEDULE" else "split_action_intents"
    return sql_json(f"""
SELECT coalesce((SELECT to_json(status)::text FROM {table}
  WHERE intent_id='{intent_id}'),'null')::text
""")


def resource_status(kind: str, resource_id: str) -> str | None:
    if not re.fullmatch(r"[A-Za-z0-9_-]{1,128}", resource_id):
        raise RuntimeError("Invalid resource ID")
    table, column = (("scheduled_payments", "schedule_id") if kind == "SCHEDULE"
                     else ("split_bills", "split_id"))
    return sql_json(f"""
SELECT coalesce((SELECT to_json(status)::text FROM {table}
  WHERE {column}='{resource_id}'),'null')::text
""")


async def login(client: httpx.AsyncClient) -> str:
    response = await client.get("/customer/session")
    token = client.cookies.get("XSRF-TOKEN")
    if response.status_code not in {200, 401} or not token:
        raise RuntimeError("CSRF bootstrap failed")
    response = await client.post("/customer/auth/login", headers={"X-XSRF-TOKEN": token}, json={
        "email": "alex@aster.local", "password": os.getenv("ASTER_DEMO_PASSWORD", "demo-password")})
    if response.status_code != 200:
        raise RuntimeError(f"Login failed: HTTP {response.status_code}")
    session = await client.get("/customer/session")
    if session.status_code != 200 or not session.json().get("authenticated") or not client.cookies.get("XSRF-TOKEN"):
        raise RuntimeError("Authenticated CSRF session unavailable")
    return "; ".join(f"{key}={value}" for key, value in client.cookies.items())


async def main() -> None:
    origin = os.environ["BANKING_API_BASE_URL"]
    key = os.environ["DEEPSEEK_API_KEY"]
    if not key:
        raise RuntimeError("Missing model key")
    async with httpx.AsyncClient(base_url=origin, timeout=30) as bank:
        cookie = await login(bank)
    due = (datetime.now(timezone(timedelta(hours=8))) + timedelta(days=2)).strftime("%Y-%m-%d 09:00 +08:00")
    cases = [
        {"id": "S-MODEL-01", "category": "Scheduled transfer",
         "turns": [f"请在 {due} 给张三定时转账10元"], "kind": "SCHEDULE",
         "count": "schedule_intent_count", "required": "prepare_scheduled_transfer"},
        {"id": "A-MODEL-01", "category": "Split bill",
         "turns": ["我和张三、李四三个人AA分摊90元，我也参加，每人30元，向他们发起收款请求"],
         "kind": "SPLIT", "count": "split_intent_count", "required": "prepare_split_request"},
        {"id": "S-REVISION-01", "category": "Schedule modification",
         "turns": [f"请在 {due} 给张三定时转账10元",
                   f"金额改成20元，还是在 {due} 给张三定时转账"],
         "kind": "SCHEDULE", "count": "schedule_intent_count",
         "required": "prepare_scheduled_transfer", "final_amount": "20.00"},
        {"id": "A-REVISION-01", "category": "Split modification",
         "turns": ["我和张三、李四三个人AA分摊90元，我也参加，每人30元，向他们发起收款请求",
                   "金额改成120元，我和张三、李四三个人AA分摊，每人40元，向他们发起收款请求"],
         "kind": "SPLIT", "count": "split_intent_count",
         "required": "prepare_split_request", "final_amount": "120.00"},
    ]
    evidence = []
    output = ROOT / "artifacts/m18-smart-actions-model-smoke.json"
    output.parent.mkdir(parents=True, exist_ok=True)
    run_dir = ROOT / "artifacts/m18-smart-actions-run-history" / uuid4().hex
    run_dir.mkdir(parents=True)
    manifest_bytes = json.dumps(cases, ensure_ascii=False, sort_keys=True,
                                separators=(",", ":")).encode("utf-8")
    (run_dir / "manifest.json").write_bytes(manifest_bytes)
    (run_dir / "registration.json").write_text(json.dumps({
        "expected_case_ids": [case["id"] for case in cases],
        "manifest_sha256": hashlib.sha256(manifest_bytes).hexdigest(),
        "banking_backend": "postgresql", "runtime": "agent-v2",
    }, ensure_ascii=False, indent=2), encoding="utf-8")

    def save() -> None:
        (run_dir / "result.json").write_text(json.dumps({
            "runtime": "agent-v2", "banking_backend": "postgresql",
            "expected_case_ids": [case["id"] for case in cases],
            "cases": evidence}, ensure_ascii=False, indent=2), encoding="utf-8")

    for case in cases:
        meter = UsageMeter()
        classifier = DeepSeekClassifier(key=key, transport=meter)
        app = create_app(BankingGateway(origin), classifier, agent_version="v2")
        runtime = app.state.agent_v2
        visible = [entry["name"] for entry in runtime.registry.visible()]
        if any(name.startswith("execute_") for name in visible):
            raise RuntimeError("Model can see an execute tool")
        completion = classifier._json_completion
        model_requests = 0

        async def counted_completion(*args, **kwargs):
            nonlocal model_requests
            model_requests += 1
            return await completion(*args, **kwargs)

        classifier._json_completion = counted_completion
        before = snapshot()
        started = perf_counter()
        task_id = None
        turn_states = []
        old_intent_ids = []
        for message in case["turns"]:
            result = await runtime.chat(message, cookie, task_id)
            task_id = result.task_id
            turn_states.append(result.status.value)
            if result.confirmation:
                old_intent_ids.append(result.confirmation["id"])
            if result.status.value in {"FAILED", "CANCELLED"}:
                break
        after = snapshot()
        task = runtime.tasks[result.task_id]
        tools = [row["tool"] for row in task.trace if row.get("kind") == "TOOL_RESULT"]
        entry = {"case_id": case["id"], "category": case["category"],
                 "turns": case["turns"], "turn_states": turn_states,
                 "status": result.status.value,
                 "error_code": result.error_code,
                 "kind": task.active_intent_kind, "tools": tools,
                 "model_calls": model_requests,
                 "planner_decisions": sum(row.get("kind") == "PLANNER_DECISION" for row in task.trace),
                 "elapsed_ms": round((perf_counter() - started) * 1000),
                 "before": before, "after": after,
                 "trace": sanitize(task.trace),
                 "usage_records": meter.records,
                 "usage_coverage_complete": meter.usage_coverage_complete(model_requests),
                 "estimated_peak_model_cost_usd": meter.peak_cost_usd()}
        evidence.append(entry)
        save()
        if result.status.value != "WAITING_CONFIRMATION" or task.active_intent_kind != case["kind"]:
            raise RuntimeError(f"{case['id']}: model did not prepare {case['kind']}: {result.status.value}; tools={tools}")
        if case["required"] not in tools or len(old_intent_ids) != len(case["turns"]):
            raise RuntimeError(f"{case['id']}: prepare tool or expected turn result missing")
        if after[case["count"]] != before[case["count"]] + len(case["turns"]):
            raise RuntimeError(f"{case['id']}: exact action intent count mismatch")
        if any(after[name] != before[name] for name in
               ("account_digest", "transfer_count", "schedule_count", "split_count")):
            raise RuntimeError(f"{case['id']}: financial state changed before confirmation")
        if not entry["usage_coverage_complete"] or entry["estimated_peak_model_cost_usd"] is None:
            raise RuntimeError(f"{case['id']}: incomplete model usage")
        if len(old_intent_ids) > 1:
            if old_intent_ids[-1] == old_intent_ids[-2]:
                raise RuntimeError(f"{case['id']}: old intent was reused")
            if not any(row.get("kind") == "INTENT_CANCELLED" and
                       row.get("intent_id") == old_intent_ids[-2] and
                       row.get("reason") == "TASK_REVISED" for row in task.trace):
                raise RuntimeError(f"{case['id']}: old intent was not revoked")
            if intent_status(case["kind"], old_intent_ids[-2]) != "CANCELLED":
                raise RuntimeError(f"{case['id']}: old bank intent remains active")
        if case.get("final_amount"):
            terms = task.active_intent.get("schedule") if case["kind"] == "SCHEDULE" else task.active_intent.get("split")
            amount = terms.get("amount") if case["kind"] == "SCHEDULE" else terms.get("totalAmount")
            if not isinstance(amount, dict) or amount.get("amount") != case["final_amount"]:
                raise RuntimeError(f"{case['id']}: reviewed amount differs from user's revision")
        cancelled = await runtime.cancel(result.task_id, cookie)
        cleaned = snapshot()
        entry["cleanup_cancelled"] = cancelled.status.value == "CANCELLED" and all(
            cleaned[name] == after[name] for name in
            ("account_digest", "transfer_count", "schedule_count", "split_count")) and (
            intent_status(case["kind"], old_intent_ids[-1]) == "CANCELLED")
        save()
        await meter.close_pool()
        if not entry["cleanup_cancelled"]:
            raise RuntimeError(f"{case['id']}: cleanup did not revoke bank intent safely")
    output.write_text((run_dir / "result.json").read_text(encoding="utf-8"), encoding="utf-8")
    print(f"Real-model smart actions passed: {len(evidence)}/{len(cases)}; trace={output}; archive={run_dir}")


async def authorization(bank: httpx.AsyncClient, cookie: str, intent: dict,
                        kind: str, action: str) -> str:
    csrf = next((part.split("=", 1)[1] for part in cookie.split("; ")
                 if part.startswith("XSRF-TOKEN=")), None)
    if not csrf:
        raise RuntimeError("CSRF token unavailable")
    action_type = ("SCHEDULED_PAYMENT_" if kind == "SCHEDULE" else "SPLIT_REQUEST_") + action
    resource_type = "SCHEDULE_ACTION_INTENT" if kind == "SCHEDULE" else "SPLIT_ACTION_INTENT"
    headers = {"Cookie": cookie, "X-XSRF-TOKEN": csrf}
    challenge = await bank.post("/customer/auth/step-up-challenges",
                                json={"actionType": action_type, "resourceType": resource_type,
                                      "resourceId": intent["id"], "resourceHash": intent["intentHash"]},
                                headers=headers)
    if challenge.status_code not in {200, 201}:
        raise RuntimeError(f"Step-up create failed: HTTP {challenge.status_code}")
    if action == "CANCEL":
        verification = {"password": os.getenv("ASTER_DEMO_PASSWORD", "demo-password")}
    else:
        sms = await bank.get(f"/customer/demo/sms/{challenge.json()['id']}", headers={"Cookie": cookie})
        code = re.search(r"(?<!\d)\d{6}(?!\d)", sms.json().get("messageBody", "")) if sms.status_code == 200 else None
        if code is None:
            raise RuntimeError("Demo SMS unavailable")
        verification = {"code": code.group()}
    verified = await bank.post(f"/customer/auth/step-up-challenges/{challenge.json()['id']}/verify",
                               json=verification, headers=headers)
    if verified.status_code != 200:
        raise RuntimeError(f"Step-up verify failed: HTTP {verified.status_code}")
    return verified.json()["authorization"]["id"]


async def lifecycle_main() -> None:
    origin = os.environ["BANKING_API_BASE_URL"]
    key = os.environ["DEEPSEEK_API_KEY"]
    due = (datetime.now(timezone(timedelta(hours=8))) + timedelta(days=3)).strftime("%Y-%m-%d 10:00 +08:00")
    cases = [
        {"id": "S-LIFECYCLE-01", "kind": "SCHEDULE",
         "create": f"请在 {due} 给张三定时转账10元",
         "cancel": f"请取消刚才创建的在 {due} 给张三转10元的定时转账",
         "count": "schedule_count", "tool": "prepare_cancel_scheduled_transfer"},
        {"id": "A-LIFECYCLE-01", "kind": "SPLIT",
         "create": "我和张三、李四三个人AA分摊90元，我也参加，每人30元，向他们发起收款请求",
         "cancel": "请取消我刚才创建的总额90元、参与人张三和李四的AA收款请求",
         "count": "split_count", "tool": "prepare_cancel_split_request"},
    ]
    run_dir = ROOT / "artifacts/m18-smart-actions-run-history" / uuid4().hex
    run_dir.mkdir(parents=True)
    manifest_bytes = json.dumps(cases, ensure_ascii=False, sort_keys=True,
                                separators=(",", ":")).encode("utf-8")
    (run_dir / "manifest.json").write_bytes(manifest_bytes)
    (run_dir / "registration.json").write_text(json.dumps({
        "expected_case_ids": [case["id"] for case in cases],
        "manifest_sha256": hashlib.sha256(manifest_bytes).hexdigest(),
        "banking_backend": "postgresql", "runtime": "agent-v2",
    }, ensure_ascii=False, indent=2), encoding="utf-8")
    evidence = []
    output = ROOT / "artifacts/m18-smart-actions-lifecycle.json"

    def save() -> None:
        (run_dir / "result.json").write_text(json.dumps({
            "runtime": "agent-v2", "banking_backend": "postgresql",
            "expected_case_ids": [case["id"] for case in cases],
            "cases": evidence}, ensure_ascii=False, indent=2), encoding="utf-8")

    async with httpx.AsyncClient(base_url=origin, timeout=30) as bank:
        cookie = await login(bank)
        for case in cases:
            meter = UsageMeter()
            classifier = DeepSeekClassifier(key=key, transport=meter)
            runtime = create_app(BankingGateway(origin), classifier, agent_version="v2").state.agent_v2
            if any(row["name"].startswith("execute_") for row in runtime.registry.visible()):
                raise RuntimeError("Model-visible execute tool")
            completion = classifier._json_completion
            calls = 0

            async def counted_completion(*args, **kwargs):
                nonlocal calls
                calls += 1
                return await completion(*args, **kwargs)

            classifier._json_completion = counted_completion
            before = snapshot()
            started = perf_counter()
            first = await runtime.chat(case["create"], cookie)
            entry = {"case_id": case["id"], "kind": case["kind"],
                     "create_prompt": case["create"], "cancel_prompt": case["cancel"],
                     "create_state": first.status.value, "before": before,
                     "create_trace": sanitize(runtime.tasks[first.task_id].trace)}
            evidence.append(entry)
            save()
            if first.status.value != "WAITING_CONFIRMATION":
                raise RuntimeError(f"{case['id']}: model did not prepare create")
            create_auth = await authorization(bank, cookie, first.confirmation, case["kind"], "CREATE")
            created = await runtime.confirm(first.task_id, ConfirmRequest(
                intent_id=first.confirmation["id"], intent_hash=first.confirmation["intentHash"],
                action_authorization_id=create_auth), cookie)
            after_create = snapshot()
            entry.update({"create_confirm_state": created.status.value,
                          "after_create": after_create})
            save()
            if created.status.value != "SUCCEEDED" or after_create[case["count"]] != before[case["count"]] + 1:
                raise RuntimeError(f"{case['id']}: bank did not create exactly one resource")
            if any(after_create[name] != before[name] for name in ("account_digest", "transfer_count")):
                raise RuntimeError(f"{case['id']}: creation moved money")
            resource_id = created.receipt["id"]
            if resource_status(case["kind"], resource_id) not in {"SCHEDULED", "ACTIVE"}:
                raise RuntimeError(f"{case['id']}: created resource not active")
            second = await runtime.chat(case["cancel"], cookie)
            cancel_tools = [row["tool"] for row in runtime.tasks[second.task_id].trace
                            if row.get("kind") == "TOOL_RESULT"]
            entry.update({"cancel_prepare_state": second.status.value,
                          "cancel_tools": cancel_tools,
                          "cancel_trace": sanitize(runtime.tasks[second.task_id].trace)})
            save()
            if second.status.value != "WAITING_CONFIRMATION" or case["tool"] not in cancel_tools or (
                    second.confirmation.get("actionType") != "CANCEL"):
                raise RuntimeError(f"{case['id']}: model did not prepare a cancellation")
            cancel_auth = await authorization(bank, cookie, second.confirmation, case["kind"], "CANCEL")
            cancelled = await runtime.confirm(second.task_id, ConfirmRequest(
                intent_id=second.confirmation["id"], intent_hash=second.confirmation["intentHash"],
                action_authorization_id=cancel_auth), cookie)
            after_cancel = snapshot()
            entry.update({"cancel_confirm_state": cancelled.status.value,
                          "after_cancel": after_cancel,
                          "resource_status": resource_status(case["kind"], resource_id),
                          "model_calls": calls,
                          "tool_calls": len([row for task in (runtime.tasks[first.task_id],
                              runtime.tasks[second.task_id]) for row in task.trace if row.get("kind") == "TOOL_RESULT"]),
                          "elapsed_ms": round((perf_counter() - started) * 1000),
                          "usage_records": meter.records,
                          "usage_coverage_complete": meter.usage_coverage_complete(calls),
                          "estimated_peak_model_cost_usd": meter.peak_cost_usd()})
            save()
            if cancelled.status.value != "SUCCEEDED" or entry["resource_status"] != "CANCELLED" or (
                    after_cancel[case["count"]] != after_create[case["count"]]) or any(
                    after_cancel[name] != before[name] for name in ("account_digest", "transfer_count")):
                raise RuntimeError(f"{case['id']}: cancellation changed financial state or failed")
            if not entry["usage_coverage_complete"] or entry["estimated_peak_model_cost_usd"] is None:
                raise RuntimeError(f"{case['id']}: model usage incomplete")
            await meter.close_pool()
    output.write_text((run_dir / "result.json").read_text(encoding="utf-8"), encoding="utf-8")
    print(f"Real-model schedule/AA lifecycle passed: {len(evidence)}/{len(cases)}; archive={run_dir}")


if __name__ == "__main__":
    asyncio.run(lifecycle_main() if "--lifecycle" in sys.argv else main())

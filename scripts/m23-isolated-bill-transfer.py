"""Verify a bill-analysis then transfer task against disposable Spring/PostgreSQL."""

from __future__ import annotations

import asyncio
import argparse
import importlib.util
import json
import os
import re
import secrets
import subprocess
import time
from decimal import Decimal
from pathlib import Path
from uuid import uuid4

import httpx

ROOT = Path(__file__).resolve().parents[1]


def load(name: str, file: str):
    spec = importlib.util.spec_from_file_location(name, ROOT / "scripts" / file)
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


sandbox = load("sandbox", "m18-benchmark-sandbox.py")
smoke = load("m22_readonly", "m22-readonly-smoke.py").smoke


def snapshot(container: str, user: str, database: str) -> dict:
    sql = """SELECT json_build_object(
      'balance', (SELECT balance FROM accounts WHERE account_id='acc_current'),
      'transfers', (SELECT count(*) FROM transfers WHERE customer_id='usr_aster_alex'),
      'debit_transactions', (SELECT count(*) FROM transactions WHERE customer_id='usr_aster_alex'
        AND type='BANK_TRANSFER' AND direction='DEBIT'),
      'prepared_intents', (SELECT count(*) FROM transfer_intents WHERE customer_id='usr_aster_alex'))::text"""
    return json.loads(sandbox.command("docker", "exec", container, "psql", "-U", user,
                                      "-d", database, "-tAc", sql))


async def authorize(origin: str, cookie: str, intent: dict) -> str:
    csrf = next((part.split("=", 1)[1] for part in cookie.split("; ")
                 if part.startswith("XSRF-TOKEN=")), None)
    if not csrf:
        raise RuntimeError("CSRF_BOOTSTRAP_FAILED")
    headers = {"Cookie": cookie, "X-XSRF-TOKEN": csrf}
    async with httpx.AsyncClient(base_url=origin, timeout=20) as bank:
        challenge = await bank.post("/customer/auth/step-up-challenges", headers=headers, json={
            "actionType": "TRANSFER_EXECUTE", "resourceType": "TRANSFER_INTENT",
            "resourceId": intent["id"], "resourceHash": intent["intentHash"]})
        challenge.raise_for_status()
        sms = await bank.get(f"/customer/demo/sms/{challenge.json()['id']}", headers=headers)
        sms.raise_for_status()
        code = re.search(r"(?<!\d)\d{6}(?!\d)", sms.json()["messageBody"])
        if not code:
            raise RuntimeError("DEMO_STEP_UP_CODE_UNAVAILABLE")
        verified = await bank.post(
            f"/customer/auth/step-up-challenges/{challenge.json()['id']}/verify",
            headers=headers, json={"code": code.group()})
        verified.raise_for_status()
        return verified.json()["authorization"]["id"]


def intent_status(container: str, user: str, database: str, intent_id: str) -> str:
    if not re.fullmatch(r"intent_[a-f0-9-]+", intent_id):
        raise RuntimeError("UNEXPECTED_INTENT_ID")
    return sandbox.command("docker", "exec", container, "psql", "-U", user,
                           "-d", database, "-tAc",
                           f"SELECT status FROM transfer_intents WHERE intent_id='{intent_id}'")


async def run(origin: str, container: str, user: str, database: str, mode: str) -> dict:
    from app.task_models import ConfirmRequest

    cookie = await smoke.login("alex@aster.local")
    model = smoke.CountedDeepSeek()
    runtime = smoke.AgentRuntimeV2(smoke.BankingGateway(), smoke.DeepSeekPlanner(model))
    goal = ("先查我这个月餐饮消费总额，再给 Lin Wei 转 1 元人民币。"
            "转账需要单独复核和身份验证，确认后继续完成原任务。")
    before = snapshot(container, user, database)
    started = time.monotonic()
    prepared = await runtime.chat(goal, cookie)
    task = runtime.tasks[prepared.task_id]
    if prepared.status.value != "WAITING_CONFIRMATION" or task.active_intent_kind != "TRANSFER":
        raise RuntimeError(f"TRANSFER_NOT_PREPARED:{prepared.status.value}")
    original_intent = task.active_intent
    if original_intent["recipient"]["id"] != "recipient_lin" or original_intent["amount"]["amount"] != "1.00":
        raise RuntimeError("WRONG_TRANSFER_TERMS")
    revisions = []
    if mode == "x12":
        changed_amount = await runtime.chat("刚才那笔转账金额改成 2 元", cookie, task_id=prepared.task_id)
        if changed_amount.status.value != "WAITING_CONFIRMATION":
            raise RuntimeError(f"AMOUNT_REVISION_FAILED:{changed_amount.status.value}")
        amount_intent = task.active_intent
        revisions.append({"change": "amount", "old_status": intent_status(container, user, database,
                         original_intent["id"]), "new_amount": amount_intent["amount"]["amount"]})
        changed_recipient = await runtime.chat("不是 Lin Wei，收款人改成张三，金额仍为 2 元", cookie,
                                              task_id=prepared.task_id)
        if changed_recipient.status.value != "WAITING_CONFIRMATION":
            raise RuntimeError(f"RECIPIENT_REVISION_FAILED:{changed_recipient.status.value}")
        revisions.append({"change": "recipient", "old_status": intent_status(container, user, database,
                         amount_intent["id"]), "new_recipient": task.active_intent["recipient"]["id"]})
    intent = task.active_intent
    preconfirm = snapshot(container, user, database)
    expected_amount = Decimal("2.00") if mode == "x12" else Decimal("1.00")
    expected_recipient = "recipient_zhang" if mode == "x12" else "recipient_lin"
    if (intent["recipient"]["id"] != expected_recipient or
            Decimal(intent["amount"]["amount"]) != expected_amount):
        raise RuntimeError("FINAL_TRANSFER_TERMS_MISMATCH")
    body = ConfirmRequest(intent_id=intent["id"], intent_hash=intent["intentHash"])
    gate = await runtime.confirm(prepared.task_id, body, cookie)
    if gate.status.value != "WAITING_AUTH":
        raise RuntimeError("TRANSFER_DID_NOT_REQUIRE_AUTH")
    authorization = await authorize(origin, cookie, intent)
    final = await runtime.confirm(prepared.task_id, ConfirmRequest(
        intent_id=intent["id"], intent_hash=intent["intentHash"],
        action_authorization_id=authorization), cookie)
    after = snapshot(container, user, database)
    repeated = None
    after_repeat = None
    if mode == "x14":
        repeated = await runtime.confirm(prepared.task_id, ConfirmRequest(
            intent_id=intent["id"], intent_hash=intent["intentHash"],
            action_authorization_id=authorization), cookie)
        after_repeat = snapshot(container, user, database)
    tool_order = [row["tool"] for row in task.trace if row.get("kind") == "TOOL_RESULT"]
    result = {"case": mode.upper(), "goal": goal,
              "prepared_status": prepared.status.value,
              "final_status": final.status.value, "message": final.message,
              "model_http_calls": model.calls, "tool_calls": len(tool_order),
              "tool_order": tool_order,
              "latency_ms": round((time.monotonic() - started) * 1000),
              "before": before, "before_confirmation": preconfirm, "after": after,
              "completed_actions": final.completed_actions, "revisions": revisions,
              "repeated_status": repeated.status.value if repeated else None,
              "after_repeat": after_repeat,
              "pass": (final.status.value == "SUCCEEDED"
                       and (mode == "x14" or (model.calls >= 5
                            and "餐饮" in final.message
                            and (("张三" in final.message or "Zhang San" in final.message)
                                 if mode == "x12" else "Lin Wei" in final.message)))
                       and "summarize_spending" in tool_order
                       and "prepare_transfer" in tool_order
                       and preconfirm["balance"] == before["balance"]
                       and preconfirm["transfers"] == before["transfers"]
                       and Decimal(before["balance"]) - Decimal(after["balance"]) == expected_amount
                       and after["transfers"] == before["transfers"] + 1
                       and after["debit_transactions"] == before["debit_transactions"] + 1
                       and (mode != "x14" or (repeated.status.value == "SUCCEEDED"
                            and repeated.receipt == final.receipt and after_repeat == after))
                       and (mode != "x12" or (len(revisions) == 2
                            and all(row["old_status"] == "CANCELLED" for row in revisions)
                            and revisions[0]["new_amount"] == "2.00"
                            and revisions[1]["new_recipient"] == "recipient_zhang"))),
              "trace": [row for row in task.trace if row.get("kind") in
                        {"PLANNER_DECISION", "TOOL_RESULT", "ACTION_EXECUTED", "FAILED", "RUNTIME_ERROR"}]}
    return load("m22_readonly_2", "m22-readonly-smoke.py").sanitize(result)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--mode", choices=("x01", "x12", "x14"), default="x01")
    mode = parser.parse_args().mode
    jar = ROOT / "services/banking-core/target/banking-core-0.1.0-SNAPSHOT.jar"
    java = Path.home() / ".jdks/jdk-21.0.12.1+1/bin/java.exe"
    if not jar.is_file() or not java.is_file():
        raise RuntimeError("Built Spring JAR and JDK 21 are required")
    key = os.getenv("DEEPSEEK_API_KEY") or Path(os.getenv(
        "DEEPSEEK_API_KEY_FILE", "E:/deeoseekapikey.txt")).read_text(encoding="utf-8").strip()
    if not key:
        raise RuntimeError("DeepSeek key unavailable")
    suffix = uuid4().hex[:10]
    container = f"aster-m23-{mode}-{suffix}"
    user = database = "aster_m23"
    password = secrets.token_urlsafe(24)
    port = sandbox.free_port()
    process = None
    log = None
    created = False
    output = ROOT / f"artifacts/m23-isolated-{mode}.json"
    try:
        sandbox.command("docker", "run", "--detach", "--rm", "--name", container,
                        "--env", f"POSTGRES_DB={database}", "--env", f"POSTGRES_USER={user}",
                        "--env", f"POSTGRES_PASSWORD={password}", "--publish", "127.0.0.1::5432",
                        "postgres:17-alpine")
        created = True
        database_port = int(sandbox.command("docker", "port", container, "5432/tcp").rsplit(":", 1)[1])
        sandbox.wait_postgres(container, user, database)
        log_path = ROOT / "artifacts/runtime-logs" / f"m23-{mode}-core-{suffix}.log"
        log_path.parent.mkdir(parents=True, exist_ok=True)
        log = log_path.open("w", encoding="utf-8")
        environment = os.environ.copy()
        environment.update({"DB_HOST": "127.0.0.1", "DB_PORT": str(database_port),
                            "DB_NAME": database, "DB_USER": user, "DB_PASSWORD": password})
        process = subprocess.Popen([str(java), "-Xmx512m", "-XX:+UseSerialGC", "-jar", str(jar),
            "--spring.profiles.active=local,demo,test", f"--server.port={port}",
            "--server.address=127.0.0.1"], cwd=jar.parent.parent, env=environment,
            stdout=log, stderr=subprocess.STDOUT,
            creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0))
        origin = f"http://127.0.0.1:{port}"
        sandbox.wait_spring(origin, process)
        os.environ.update({"BANKING_API_BASE_URL": origin, "DEEPSEEK_API_KEY": key,
                           "ASTER_DEMO_PASSWORD": "demo-password", "AGENT_RUNTIME_VERSION": "v2"})
        try:
            result = asyncio.run(run(origin, container, user, database, mode))
        except Exception as exc:
            result = {"case": mode.upper(), "pass": False, "error_type": type(exc).__name__,
                      "error_code": getattr(exc, "code", None),
                      "database": snapshot(container, user, database)}
        output.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print(json.dumps({key: value for key, value in result.items() if key != "trace"},
                         ensure_ascii=False))
        print(f"Sanitized trace: {output}")
    finally:
        if process is not None:
            process.terminate()
            try:
                process.wait(timeout=10)
            except subprocess.TimeoutExpired:
                process.kill()
        if log is not None:
            log.close()
        if created:
            subprocess.run(["docker", "rm", "-f", container], capture_output=True, timeout=20)


if __name__ == "__main__":
    main()

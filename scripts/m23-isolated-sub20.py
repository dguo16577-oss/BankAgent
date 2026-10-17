"""Run SUB20 with real DeepSeek, Agent v2 and disposable Spring/PostgreSQL."""

from __future__ import annotations

import asyncio
import importlib.util
import json
import os
import secrets
import subprocess
import time
from pathlib import Path
from uuid import uuid4

import httpx

ROOT = Path(__file__).resolve().parents[1]
util_spec = importlib.util.spec_from_file_location("sandbox", ROOT / "scripts/m18-benchmark-sandbox.py")
assert util_spec and util_spec.loader
sandbox = importlib.util.module_from_spec(util_spec)
util_spec.loader.exec_module(sandbox)
smoke_spec = importlib.util.spec_from_file_location("m22_readonly", ROOT / "scripts/m22-readonly-smoke.py")
assert smoke_spec and smoke_spec.loader
smoke = importlib.util.module_from_spec(smoke_spec)
smoke_spec.loader.exec_module(smoke)


def snapshot(container: str, user: str, database: str) -> dict:
    sql = """SELECT json_build_object(
      'reminder_count', (SELECT count(*) FROM renewal_reminders WHERE customer_id='usr_aster_alex'),
      'reminder_actions', (SELECT count(*) FROM renewal_reminder_actions WHERE customer_id='usr_aster_alex'),
      'bank_arrangement_status', (SELECT status FROM recurring_payments WHERE recurring_payment_id='rec_rent'),
      'bank_stop_actions', (SELECT count(*) FROM recurring_payment_actions WHERE customer_id='usr_aster_alex'),
      'notification_count', (SELECT count(*) FROM in_app_notifications WHERE customer_id='usr_aster_alex'))::text"""
    return json.loads(sandbox.command("docker", "exec", container, "psql", "-U", user, "-d", database,
                                      "-tAc", sql))


async def stop_authorization(origin: str, cookie: str, intent: dict) -> str:
    csrf = next((part.split("=", 1)[1] for part in cookie.split("; ")
                 if part.startswith("XSRF-TOKEN=")), None)
    if not csrf:
        raise RuntimeError("CSRF_BOOTSTRAP_FAILED")
    headers = {"Cookie": cookie, "X-XSRF-TOKEN": csrf}
    async with httpx.AsyncClient(base_url=origin, timeout=20) as bank:
        challenge = await bank.post("/customer/auth/step-up-challenges", headers=headers, json={
            "actionType": "RECURRING_STOP_FUTURE_PAYMENTS",
            "resourceType": "RECURRING_PAYMENT_INTENT",
            "resourceId": intent["id"], "resourceHash": intent["intentHash"]})
        challenge.raise_for_status()
        verified = await bank.post(
            f"/customer/auth/step-up-challenges/{challenge.json()['id']}/verify",
            headers=headers, json={"password": os.environ["ASTER_DEMO_PASSWORD"]})
        verified.raise_for_status()
        return verified.json()["authorization"]["id"]


async def run(origin: str, container: str, user: str, database: str) -> dict:
    from app.task_models import ConfirmRequest

    cookie = await smoke.smoke.login("alex@aster.local")
    model = smoke.smoke.CountedDeepSeek()
    runtime = smoke.smoke.AgentRuntimeV2(
        smoke.smoke.BankingGateway(), smoke.smoke.DeepSeekPlanner(model))
    goal = ("查看我有哪些银行自动续费和从交易推测的周期扣费。"
            "请在 2026-10-15 上午 9 点香港时间通过应用内消息提醒我 Rent 下次扣费，"
            "然后取消 Rent 的银行代扣授权。每项分别给我确认，最后再查询银行状态；"
            "不要声称第三方会员已取消。")
    before = snapshot(container, user, database)
    started = time.monotonic()
    response = await runtime.chat(goal, cookie)
    confirmations = []
    for _ in range(3):
        if response.status.value != "WAITING_CONFIRMATION":
            break
        task = runtime.tasks[response.task_id]
        intent = task.active_intent
        kind = task.active_intent_kind
        authorization = (await stop_authorization(origin, cookie, intent)
                         if kind == "RECURRING_STOP" else None)
        confirmations.append({"kind": kind, "intent_id": intent["id"],
                              "separate_authorization": authorization is not None})
        response = await runtime.confirm(response.task_id, ConfirmRequest(
            intent_id=intent["id"], intent_hash=intent["intentHash"],
            action_authorization_id=authorization), cookie)
    task = runtime.tasks[response.task_id]
    after = snapshot(container, user, database)
    result = {
        "case": "SUB20", "goal": goal, "status": response.status.value,
        "message": response.message, "model_http_calls": model.calls,
        "tool_calls": sum(row.get("kind") == "TOOL_RESULT" for row in task.trace),
        "latency_ms": round((time.monotonic() - started) * 1000),
        "confirmations": confirmations, "completed_actions": response.completed_actions,
        "before": before, "after": after,
        "pass": (response.status.value == "SUCCEEDED"
                 and {item["kind"] for item in confirmations} ==
                 {"RENEWAL_REMINDER", "RECURRING_STOP"}
                 and after["reminder_count"] == before["reminder_count"] + 1
                 and after["reminder_actions"] == before["reminder_actions"] + 1
                 and after["bank_stop_actions"] == before["bank_stop_actions"] + 1
                 and after["bank_arrangement_status"] == "STOPPED"),
        "trace": [row for row in task.trace if row.get("kind") in
                  {"PLANNER_DECISION", "TOOL_RESULT", "ACTION_EXECUTED", "FAILED", "RUNTIME_ERROR"}],
    }
    return smoke.sanitize(result)


def main() -> None:
    jar = ROOT / "services/banking-core/target/banking-core-0.1.0-SNAPSHOT.jar"
    known_java = Path.home() / ".jdks/jdk-21.0.12.1+1/bin/java.exe"
    java = known_java if known_java.is_file() else Path(os.getenv("JAVA_HOME", "")) / "bin/java.exe"
    if not jar.is_file() or not java.is_file():
        raise RuntimeError("Built Spring JAR and JDK 21 are required")
    key = os.getenv("DEEPSEEK_API_KEY") or Path(os.getenv(
        "DEEPSEEK_API_KEY_FILE", "E:/deeoseekapikey.txt")).read_text(encoding="utf-8").strip()
    if not key:
        raise RuntimeError("DeepSeek key unavailable")
    suffix = uuid4().hex[:10]
    container = f"aster-m23-sub20-{suffix}"
    user = database = "aster_m23"
    password = secrets.token_urlsafe(24)
    port = sandbox.free_port()
    process = None
    log = None
    created = False
    output = ROOT / "artifacts/m23-isolated-sub20.json"
    try:
        sandbox.command("docker", "run", "--detach", "--rm", "--name", container,
                        "--env", f"POSTGRES_DB={database}", "--env", f"POSTGRES_USER={user}",
                        "--env", f"POSTGRES_PASSWORD={password}", "--publish", "127.0.0.1::5432",
                        "postgres:17-alpine")
        created = True
        database_port = int(sandbox.command("docker", "port", container, "5432/tcp").rsplit(":", 1)[1])
        sandbox.wait_postgres(container, user, database)
        log_path = ROOT / "artifacts/runtime-logs" / f"m23-sub20-core-{suffix}.log"
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
            result = asyncio.run(run(origin, container, user, database))
        except Exception as exc:
            result = {"case": "SUB20", "pass": False, "error_type": type(exc).__name__,
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

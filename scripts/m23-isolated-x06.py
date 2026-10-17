"""Real-model wealth research to purchase PREPARE on disposable PostgreSQL."""

from __future__ import annotations

import asyncio
import json
import os
import secrets
import subprocess
from pathlib import Path
from uuid import uuid4

import importlib.util

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("lifecycle", ROOT / "scripts/m22-isolated-reminder-lifecycle.py")
assert spec and spec.loader
lifecycle = importlib.util.module_from_spec(spec)
spec.loader.exec_module(lifecycle)
sandbox = lifecycle.sandbox
smoke = lifecycle.smoke


def snapshot(container: str, user: str, database: str) -> dict:
    sql = """SELECT json_build_object(
      'intent_count',(SELECT count(*) FROM investment_order_intents WHERE customer_id='usr_aster_alex'),
      'executed_orders',(SELECT count(*) FROM investment_orders WHERE customer_id='usr_aster_alex'),
      'balance',(SELECT balance FROM accounts WHERE customer_id='usr_aster_alex' AND account_id='acc_current'))::text"""
    return json.loads(sandbox.command("docker", "exec", container, "psql", "-U", user,
                                      "-d", database, "-tAc", sql))


async def run(container: str, user: str, database: str) -> dict:
    cookie = await smoke.login("alex@aster.local")
    model = smoke.CountedDeepSeek()
    runtime = smoke.AgentRuntimeV2(smoke.BankingGateway(), smoke.DeepSeekPlanner(model))
    goal = ("先查我的风险档案、Aster Stable Bond 产品和适当性。若银行判断适合，"
            "用我的人民币活期账户准备申购 1000.00 元，只生成供我确认的复核单，不要执行申购。")
    before = snapshot(container, user, database)
    response = await runtime.chat(goal, cookie)
    task = runtime.tasks[response.task_id]
    after = snapshot(container, user, database)
    calls = [row for row in task.trace if row.get("kind") in
             {"PLANNER_DECISION", "TOOL_RESULT", "FAILED", "RUNTIME_ERROR"}]
    tools = [row.get("tool") or row.get("tool_name") for row in calls
             if row.get("kind") == "TOOL_RESULT"]
    result = {"case": "X06", "goal": goal, "status": response.status.value,
              "message": response.message, "model_http_calls": model.calls,
              "tool_calls": len(tools), "tools": tools, "before": before, "after": after,
              "prepared_kind": task.active_intent_kind,
              "pass": response.status.value == "WAITING_CONFIRMATION"
                      and task.active_intent_kind == "INVESTMENT_PURCHASE"
                      and after["intent_count"] == before["intent_count"] + 1
                      and after["executed_orders"] == before["executed_orders"]
                      and after["balance"] == before["balance"],
              "trace": calls}
    return lifecycle.sanitizer(result)


def main() -> None:
    jar = Path(os.getenv("ASTER_BANKING_JAR", ROOT / "artifacts/m23-core-build/banking-core-0.1.0-SNAPSHOT.jar"))
    java = Path.home() / ".jdks/jdk-21.0.12.1+1/bin/java.exe"
    key = os.getenv("DEEPSEEK_API_KEY") or Path(os.getenv(
        "DEEPSEEK_API_KEY_FILE", "E:/deeoseekapikey.txt")).read_text(encoding="utf-8").strip()
    if not jar.is_file() or not java.is_file() or not key:
        raise RuntimeError("Built Spring JAR, JDK 21 and DeepSeek key are required")
    suffix = uuid4().hex[:10]
    container = f"aster-m23-x06-{suffix}"
    user = database = "aster_m23"
    password = secrets.token_urlsafe(24)
    port = sandbox.free_port()
    process = log = None
    created = False
    try:
        sandbox.command("docker", "run", "--detach", "--rm", "--name", container,
                        "--env", f"POSTGRES_DB={database}", "--env", f"POSTGRES_USER={user}",
                        "--env", f"POSTGRES_PASSWORD={password}", "--publish", "127.0.0.1::5432",
                        "postgres:17-alpine")
        created = True
        db_port = int(sandbox.command("docker", "port", container, "5432/tcp").rsplit(":", 1)[1])
        sandbox.wait_postgres(container, user, database)
        path = ROOT / "artifacts/runtime-logs" / f"m23-x06-core-{suffix}.log"
        path.parent.mkdir(parents=True, exist_ok=True)
        log = path.open("w", encoding="utf-8")
        environment = os.environ.copy()
        environment.update({"DB_HOST": "127.0.0.1", "DB_PORT": str(db_port),
                            "DB_NAME": database, "DB_USER": user, "DB_PASSWORD": password})
        process = subprocess.Popen([str(java), "-Xmx512m", "-XX:+UseSerialGC", "-jar", str(jar),
            "--spring.profiles.active=local,demo,test", f"--server.port={port}",
            "--server.address=127.0.0.1"], cwd=jar.parent, env=environment,
            stdout=log, stderr=subprocess.STDOUT,
            creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0))
        origin = f"http://127.0.0.1:{port}"
        sandbox.wait_spring(origin, process)
        os.environ.update({"BANKING_API_BASE_URL": origin, "DEEPSEEK_API_KEY": key,
                           "ASTER_DEMO_PASSWORD": "demo-password", "AGENT_RUNTIME_VERSION": "v2"})
        try:
            result = asyncio.run(run(container, user, database))
        except Exception as exc:
            result = {"case": "X06", "pass": False, "error_type": type(exc).__name__,
                      "error_code": getattr(exc, "code", None)}
        output = ROOT / "artifacts/m23-isolated-x06.json"
        output.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print(json.dumps({k: v for k, v in result.items() if k != "trace"}, ensure_ascii=False))
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

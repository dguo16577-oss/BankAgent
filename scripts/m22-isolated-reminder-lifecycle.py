"""Exercise reminder create, retarget, cancel and Spring restart with real DeepSeek."""

from __future__ import annotations

import asyncio
import importlib.util
import json
import os
import secrets
import subprocess
from pathlib import Path
from uuid import uuid4

ROOT = Path(__file__).resolve().parents[1]


def load(name: str, path: Path):
    spec = importlib.util.spec_from_file_location(name, path)
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


sandbox = load("sandbox", ROOT / "scripts/m18-benchmark-sandbox.py")
smoke = load("m22_readonly", ROOT / "scripts/m22-readonly-smoke.py").smoke
sanitizer = load("m22_sanitizer", ROOT / "scripts/m22-readonly-smoke.py").sanitize


def query(container: str, user: str, database: str) -> dict:
    sql = """SELECT COALESCE(json_agg(json_build_object('id',reminder_id,'status',status,
      'version',version,'target',target_type,'mandate',recurring_payment_id,
      'dueAt',due_at) ORDER BY reminder_id), '[]'::json)::text
      FROM renewal_reminders WHERE customer_id='usr_aster_alex'"""
    raw = sandbox.command("docker", "exec", container, "psql", "-U", user,
                          "-d", database, "-tAc", sql)
    return {"reminders": json.loads(raw)}


async def action(runtime, model, cookie: str, prompt: str) -> dict:
    from app.task_models import ConfirmRequest

    response = await runtime.chat(prompt, cookie)
    task = runtime.tasks[response.task_id]
    prepared = task.active_intent
    result = {"goal": prompt, "prepared": response.status.value,
              "model_calls": model.calls,
              "tool_calls": sum(row.get("kind") == "TOOL_RESULT" for row in task.trace),
              "trace": [row for row in task.trace if row.get("kind") in
                        {"PLANNER_DECISION", "TOOL_RESULT", "ACTION_EXECUTED", "FAILED"}]}
    if response.status.value != "WAITING_CONFIRMATION" or not prepared:
        result["final"] = response.status.value
        return result
    result["intent_id"] = prepared["id"]
    response = await runtime.confirm(response.task_id, ConfirmRequest(
        intent_id=prepared["id"], intent_hash=prepared["intentHash"]), cookie)
    result["final"] = response.status.value
    result["message"] = response.message
    return result


async def run(origin: str, container: str, user: str, database: str, restart_core) -> dict:
    cookie = await smoke.login("alex@aster.local")
    before = query(container, user, database)
    prompts = [
        "请于2026年10月15日上午9点香港时间通过应用内消息提醒我 Rent 下次银行代扣，先给我复核。",
        "把我刚创建的 Rent 续费提醒改成 Netflix 银行代扣提醒，时间改为2026年10月16日上午9点香港时间，先给我复核。",
        "取消刚才改成 Netflix 的续费提醒，先给我复核。",
    ]
    steps = []
    for prompt in prompts:
        if len(steps) == 1:
            restart_core()
            persisted = await smoke.BankingGateway().customer_get(
                "/customer/renewal-reminders", cookie)
            steps[-1]["restart_read"] = {"authenticated": True,
                                          "reminder_count": len(persisted["items"])}
        model = smoke.CountedDeepSeek()
        runtime = smoke.AgentRuntimeV2(smoke.BankingGateway(), smoke.DeepSeekPlanner(model))
        steps.append(await action(runtime, model, cookie, prompt))
        steps[-1]["database"] = query(container, user, database)
        if steps[-1]["final"] != "SUCCEEDED":
            break
    return sanitizer({"case": "M22_REMINDER_LIFECYCLE", "before": before,
                      "steps": steps, "after": query(container, user, database),
                      "pass": len(steps) == 3 and all(s["final"] == "SUCCEEDED" for s in steps)
                      and steps[0].get("restart_read", {}).get("reminder_count") == 1
                      and len(steps[-1]["database"]["reminders"]) == 1
                      and steps[-1]["database"]["reminders"][0]["status"] == "CANCELLED"})


def main() -> None:
    jar = Path(os.getenv("ASTER_BANKING_JAR", ROOT / "artifacts/m23-core-build/banking-core-0.1.0-SNAPSHOT.jar"))
    java = Path.home() / ".jdks/jdk-21.0.12.1+1/bin/java.exe"
    key = os.getenv("DEEPSEEK_API_KEY") or Path(os.getenv(
        "DEEPSEEK_API_KEY_FILE", "E:/deeoseekapikey.txt")).read_text(encoding="utf-8").strip()
    if not jar.is_file() or not java.is_file() or not key:
        raise RuntimeError("Built Spring JAR, JDK 21 and DeepSeek key are required")
    suffix = uuid4().hex[:10]
    container = f"aster-m22-lifecycle-{suffix}"
    user = database = "aster_m22"
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
        path = ROOT / "artifacts/runtime-logs" / f"m22-lifecycle-core-{suffix}.log"
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
        def restart_core():
            nonlocal process
            process.terminate()
            process.wait(timeout=10)
            process = subprocess.Popen([str(java), "-Xmx512m", "-XX:+UseSerialGC", "-jar", str(jar),
                "--spring.profiles.active=local,demo,test", f"--server.port={port}",
                "--server.address=127.0.0.1"], cwd=jar.parent, env=environment,
                stdout=log, stderr=subprocess.STDOUT,
                creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0))
            sandbox.wait_spring(origin, process)

        try:
            result = asyncio.run(run(origin, container, user, database, restart_core))
        except Exception as exc:
            result = {"case": "M22_REMINDER_LIFECYCLE", "pass": False,
                      "error_type": type(exc).__name__, "error_code": getattr(exc, "code", None),
                      "database": query(container, user, database)}
        output = ROOT / "artifacts/m22-isolated-reminder-lifecycle.json"
        output.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print(json.dumps({k: v for k, v in result.items() if k != "steps"}, ensure_ascii=False))
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

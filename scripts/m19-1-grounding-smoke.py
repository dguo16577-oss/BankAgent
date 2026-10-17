"""Real DeepSeek CTX/FACT acceptance against the named disposable M19 bank."""

from __future__ import annotations

import asyncio
import json
import os
import re
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

import httpx

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "services/agent-runtime"))

from app.agent_v2.runtime import AgentRuntimeV2  # noqa: E402
from app.agent_v2.planner import DeepSeekPlanner  # noqa: E402
from app.banking import BankingGateway  # noqa: E402
from app.deepseek import DeepSeekClassifier  # noqa: E402
from evals.trajectory import sanitize  # noqa: E402

CONTAINER = "aster-m19-browser-20261008"


def query(sql: str) -> str:
    if os.getenv("ASTER_M19_POSTGRES_CONTAINER") != CONTAINER:
        raise RuntimeError("Named disposable M19 PostgreSQL container required")
    result = subprocess.run(
        ["docker", "exec", CONTAINER, "psql", "-U", "aster_local", "-d", "aster_banking",
         "-v", "ON_ERROR_STOP=1", "-tAc", sql],
        capture_output=True, text=True, encoding="utf-8", errors="replace", timeout=30,
    )
    if result.returncode:
        raise RuntimeError(f"PostgreSQL query failed: {result.stderr[-300:]}")
    return result.stdout.strip()


def financial_state() -> dict:
    return json.loads(query("""
SELECT json_build_object(
 'balance_digest', (SELECT md5(coalesce(string_agg(account_id||':'||balance::text||':'||pending_amount::text,
                              '|' ORDER BY account_id),'')) FROM accounts),
 'transfer_intents', (SELECT count(*) FROM transfer_intents),
 'schedule_intents', (SELECT count(*) FROM scheduled_payment_intents),
 'split_intents', (SELECT count(*) FROM split_action_intents),
 'transfers', (SELECT count(*) FROM transfers))::text
"""))


async def login(origin: str) -> str:
    async with httpx.AsyncClient(base_url=origin, timeout=30) as bank:
        bootstrap = await bank.get("/customer/session")
        token = bank.cookies.get("XSRF-TOKEN")
        if bootstrap.status_code not in {200, 401} or not token:
            raise RuntimeError("CSRF bootstrap failed")
        response = await bank.post("/customer/auth/login", headers={"X-XSRF-TOKEN": token}, json={
            "email": "alex@aster.local", "password": os.getenv("ASTER_DEMO_PASSWORD", "demo-password")})
        if response.status_code != 200:
            raise RuntimeError(f"Demo login failed: HTTP {response.status_code}")
        return "; ".join(f"{key}={value}" for key, value in bank.cookies.items())


CASES = [
    ("CTX01", ["看尾号1937的卡2026年10月餐饮支出。", "那2026年9月呢？"]),
    ("CTX02", ["看尾号1937的卡最近两个月支出。", "只看餐饮。"]),
    ("CTX03", ["看尾号1937的卡最近两个月餐饮支出。", "换成尾号8821的另一张卡。"]),
    ("CTX04", ["看尾号1937的卡本月餐饮支出。", "全部类别。"]),
    ("CTX05", ["看尾号1937的卡最近一个月 Repeat Cafe 的消费。", "最近三个月呢？"]),
    ("FACT01", ["尾号1937的卡最近有疑似重复扣款吗？请列出确切商户和金额。"]),
    ("FACT02", ["查询我的银行卡并告诉我两张卡的原样尾号。"]),
    ("FACT03", ["尾号1937的卡本月餐饮支出总额和 Repeat Cafe 的金额分别是多少？"]),
]


def semantic_ok(ident: str, task, message: str) -> bool:
    scope = task.analytical_scope
    analysis = [o for o in task.observations if o.success and o.tool_name == "summarize_spending"]
    tools = {o.tool_name for o in task.observations if o.success}
    if ident == "CTX01":
        return scope.get("card_id") == "card_aster_credit" and scope.get("category") == "DINING" \
            and scope.get("date_from", "").startswith("2026-09") and bool(analysis)
    if ident == "CTX02":
        return scope.get("card_id") == "card_aster_credit" and scope.get("category") == "DINING" \
            and bool(scope.get("date_from")) and bool(analysis)
    if ident == "CTX03":
        return scope.get("card_id") == "card_aster_debit" and scope.get("category") == "DINING" \
            and bool(scope.get("date_from")) and bool(analysis)
    if ident == "CTX04":
        return scope.get("card_id") == "card_aster_credit" and "category" not in scope and bool(analysis)
    if ident == "CTX05":
        return scope.get("card_id") == "card_aster_credit" \
            and (scope.get("merchant") == "Repeat Cafe" or scope.get("search") == "Repeat Cafe") \
            and bool(scope.get("date_from")) and (bool(analysis) or "list_transactions" in tools)
    if ident == "FACT01":
        return "detect_transaction_anomalies" in tools and "Repeat Cafe" in message \
            and "Repeated Cafe" not in message and "重复咖啡" not in message
    if ident == "FACT02":
        return "list_cards" in tools and "1937" in message and "8821" in message
    if ident == "FACT03":
        return bool(analysis) and "Repeat Cafe" in message and "2544.00" in message \
            and re.search(r"(?:Repeat Cafe).{0,40}44\.00", message, re.S) is not None
    return False


async def main() -> None:
    origin = os.getenv("BANKING_API_BASE_URL", "")
    if not origin.startswith("http://127.0.0.1:"):
        raise RuntimeError("Local sandbox Spring origin required")
    cookie = await login(origin)
    initial = financial_state()
    classifier = DeepSeekClassifier(key=os.environ["DEEPSEEK_API_KEY"])
    completion = classifier._json_completion
    model_calls = 0

    async def counted(*args, **kwargs):
        nonlocal model_calls
        model_calls += 1
        return await completion(*args, **kwargs)

    classifier._json_completion = counted
    results = []
    selected = set(filter(None, os.getenv("ASTER_M19_CASES", "").split(",")))
    for ident, turns in CASES:
        if selected and ident not in selected:
            continue
        runtime = AgentRuntimeV2(BankingGateway(origin), DeepSeekPlanner(classifier))
        if len(runtime.registry.visible()) != 20 or any(t["name"].startswith("execute_")
                                                      for t in runtime.registry.visible()):
            raise RuntimeError("Unexpected model-visible tool registry")
        task_id = None
        responses = []
        start_calls = model_calls
        try:
            for turn in turns:
                response = await runtime.chat(turn, cookie, task_id)
                task_id = response.task_id
                responses.append({"status": response.status.value, "message": response.message,
                                  "error_code": response.error_code, "tools": [s.tool for s in response.steps]})
            task = runtime.tasks[task_id]
            state_after = financial_state()
            ok = response.status.value == "SUCCEEDED" and semantic_ok(ident, task, response.message) \
                and state_after == initial and task.active_intent is None and model_calls > start_calls
            entry = sanitize({"id": ident, "turns": turns, "responses": responses,
                              "model_http_calls": model_calls - start_calls, "trace": task.trace,
                              "final_scope": task.analytical_scope, "initial_db_state": initial,
                              "final_db_state": state_after, "pass": ok})
        except Exception as exc:
            entry = {"id": ident, "turns": turns, "pass": False, "error": type(exc).__name__ + ": " + str(exc)[:200]}
        results.append(entry)
        print(f"{ident}: {'PASS' if entry['pass'] else 'FAIL'}; model_calls={entry.get('model_http_calls', 0)}")
    suffix = "-" + "-".join(sorted(selected)) if selected else ""
    output = ROOT / f"artifacts/m19-1-grounding-deepseek-smoke{suffix}.json"
    output.write_text(json.dumps({"executed_at": datetime.now(timezone.utc).isoformat(),
                                  "model": classifier.model, "passed": sum(x["pass"] for x in results),
                                  "total": len(results), "cases": results}, ensure_ascii=False, indent=2),
                      encoding="utf-8")
    print(f"Sanitized trace: {output}")
    if not all(x["pass"] for x in results):
        raise RuntimeError("CTX/FACT real-model acceptance has failures")


if __name__ == "__main__":
    asyncio.run(main())

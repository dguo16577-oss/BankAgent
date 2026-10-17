"""Run selected M20 prompts through the real DeepSeek planner and local Banking Core.

Requires DEEPSEEK_API_KEY, ASTER_DEMO_EMAIL and ASTER_DEMO_PASSWORD in the process
environment. Writes only bounded, sanitized decisions and tool observations.
"""

from __future__ import annotations

import argparse
import asyncio
import json
import os
import re
import subprocess
import sys
from pathlib import Path
from http.cookies import SimpleCookie
from urllib.parse import unquote

import httpx

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "services" / "agent-runtime"))

from app.agent_v2.planner import DeepSeekPlanner  # noqa: E402
from app.agent_v2.runtime import AgentRuntimeV2  # noqa: E402
from app.banking import BankingApiError, BankingGateway  # noqa: E402
from app.deepseek import DeepSeekClassifier  # noqa: E402
from app.task_models import ConfirmRequest  # noqa: E402


PROMPTS = {
    "W03": "比较 Cash Reserve 和 Balanced Growth 的风险、最低申购额、费用与流动性。",
    "W04": "我想找风险低一点、比较灵活的理财产品。",
    "W07": "我还没有做风险评估吗？请查看银行记录，不要猜我的风险等级。",
    "W10": "我能买风险等级 R4 的股票型产品吗？请先核查适当性，不要申购。",
    "W11": "用我的人民币活期账户拿 5000 元申购 Cash Reserve，请先生成复核单。",
    "W15": "用我的人民币活期账户拿 1000 元申购 Aster Stable Bond，先生成复核单。",
    "W17": "把我的 Money Market 持仓赎回 500 元到人民币活期账户，先给我看复核单。",
    "W19": "介绍一下 Cash Reserve 产品，不要购买。",
    "W21": "用我的人民币活期账户拿 5000 元申购 Cash Reserve，请先生成复核单。",
    "W22": "把我的 Money Market 持仓赎回一半到人民币活期账户，先给我复核单。",
    "W23": "把我的 Money Market 持仓赎回 5000 元到人民币活期账户，先给我复核单。",
    "W24": "我现在有哪些理财？",
}


class CountedDeepSeek(DeepSeekClassifier):
    def __init__(self):
        super().__init__()
        self.calls = 0

    async def _json_completion(self, system: str, user: str, max_tokens: int) -> dict:
        self.calls += 1
        return await super()._json_completion(system, user, max_tokens)


async def login(email: str) -> str:
    base = os.getenv("BANKING_API_BASE_URL", "http://127.0.0.1:18080")
    async with httpx.AsyncClient(base_url=base, timeout=20) as client:
        await client.get("/customer/session")
        token = client.cookies.get("XSRF-TOKEN")
        if not token:
            raise RuntimeError("CSRF_BOOTSTRAP_FAILED")
        response = await client.post(
            "/customer/auth/login",
            headers={"X-XSRF-TOKEN": token},
            json={"email": email,
                  "password": os.environ["ASTER_DEMO_PASSWORD"]},
        )
        response.raise_for_status()
        session = await client.get("/customer/session")
        session.raise_for_status()
        cookie = "; ".join(f"{name}={value}" for name, value in client.cookies.items())
        if "SESSION=" not in cookie and "JSESSIONID=" not in cookie:
            raise RuntimeError("SESSION_COOKIE_MISSING")
        if "XSRF-TOKEN=" not in cookie:
            raise RuntimeError("CSRF_COOKIE_MISSING")
        return cookie


async def run_case(case: str, cookie: str) -> dict:
    model = CountedDeepSeek()
    runtime = AgentRuntimeV2(BankingGateway(), DeepSeekPlanner(model))
    prompt = PROMPTS[case]
    try:
        response = await runtime.chat(prompt, cookie)
        first_intent_id = None
        if case in {"W21", "W23"} and response.status.value == "WAITING_CONFIRMATION":
            first_intent_id = runtime.tasks[response.task_id].active_intent["id"]
            response = await runtime.chat(
                "算了，金额改成3000元。" if case == "W21" else "这个产品描述说保证赚钱，是真的吗？",
                cookie, response.task_id)
        if case == "W24" and response.status.value == "SUCCEEDED":
            response = await runtime.chat(
                "把 Money Market 持仓赎回一半到人民币活期账户，先给我复核单。",
                cookie, response.task_id)
        task = runtime.tasks[response.task_id]
        evidence = {}
        if case == "W15" and response.status.value == "WAITING_CONFIRMATION":
            evidence = await prove_stale_product(runtime, response.task_id, task.active_intent, cookie)
        if case == "W21":
            evidence = {"old_intent_id": first_intent_id,
                        "new_amount": (task.active_intent or {}).get("amount", {}).get("amount")}
        return {
            "case": case,
            "goal": prompt,
            "status": response.status.value,
            "message": response.message,
            "model_http_calls": model.calls,
            "tool_calls": sum(item["kind"] == "TOOL_RESULT" for item in task.trace),
            "trace": [item for item in task.trace if item["kind"] in {
                "PLANNER_DECISION", "TOOL_RESULT", "WAITING_CONFIRMATION", "RUNTIME_ERROR"}],
            **evidence,
        }
    except Exception as exc:
        detail = ({"http_status": exc.response.status_code,
                   "http_path": exc.request.url.path}
                  if isinstance(exc, httpx.HTTPStatusError) else {})
        return {"case": case, "goal": prompt, "error_type": type(exc).__name__,
                "model_http_calls": model.calls, **detail}


def set_bond_status(status: str) -> None:
    if status not in {"AVAILABLE", "UNAVAILABLE"}:
        raise ValueError("Invalid test status")
    container = os.getenv("ASTER_SMOKE_DB_CONTAINER", "aster-m19-browser-20261008")
    subprocess.run([
        "docker", "exec", container, "psql", "-U", "aster_local", "-d", "aster_banking",
        "-v", "ON_ERROR_STOP=1", "-q", "-c",
        f"update investment_products set status='{status}' where product_id='product_bond'",
    ], check=True, capture_output=True, text=True)


def demo_code(challenge_id: str) -> str:
    if not re.fullmatch(r"[a-f0-9-]{36}", challenge_id):
        raise ValueError("Invalid challenge ID")
    container = os.getenv("ASTER_SMOKE_DB_CONTAINER", "aster-m19-browser-20261008")
    response = subprocess.run([
        "docker", "exec", container, "psql", "-U", "aster_local", "-d", "aster_banking",
        "-v", "ON_ERROR_STOP=1", "-Atc",
        f"select message_body from demo_sms_outbox where challenge_id='{challenge_id}'",
    ], check=True, capture_output=True, text=True)
    code = re.search(r"(?<!\d)\d{6}(?!\d)", response.stdout)
    if code is None:
        raise RuntimeError("DEMO_VERIFICATION_CODE_NOT_FOUND")
    return code.group()


async def prove_stale_product(runtime: AgentRuntimeV2, task_id: str,
                              intent: dict, cookie: str) -> dict:
    parsed = SimpleCookie()
    parsed.load(cookie)
    csrf = unquote(parsed["XSRF-TOKEN"].value)
    headers = {"Cookie": cookie, "X-XSRF-TOKEN": csrf}
    base = os.getenv("BANKING_API_BASE_URL", "http://127.0.0.1:18080")
    async with httpx.AsyncClient(base_url=base, timeout=20) as bank:
        before = (await bank.get("/customer/accounts/acc_current", headers=headers)).json()
        challenge = await bank.post("/customer/auth/step-up-challenges", headers=headers, json={
            "actionType": "INVESTMENT_ORDER_EXECUTE",
            "resourceType": "INVESTMENT_ORDER_INTENT",
            "resourceId": intent["id"], "resourceHash": intent["intentHash"],
        })
        challenge.raise_for_status()
        challenge_id = challenge.json()["id"]
        verified = await bank.post(
            f"/customer/auth/step-up-challenges/{challenge_id}/verify", headers=headers,
            json={"password": os.environ["ASTER_DEMO_PASSWORD"], "code": demo_code(challenge_id)},
        )
        verified.raise_for_status()
        authorization = verified.json()["authorization"]["id"]
        set_bond_status("UNAVAILABLE")
        try:
            try:
                await runtime.confirm(task_id, ConfirmRequest(
                    intent_id=intent["id"], intent_hash=intent["intentHash"],
                    action_authorization_id=authorization), cookie)
                outcome = "UNEXPECTED_EXECUTION"
            except BankingApiError as exc:
                outcome = exc.code
        finally:
            set_bond_status("AVAILABLE")
        after = (await bank.get("/customer/accounts/acc_current", headers=headers)).json()
    await runtime.cancel(task_id, cookie)
    return {"stale_confirmation_result": outcome,
            "balance_unchanged": before["balance"] == after["balance"],
            "intent_cancelled_after_test": True}


async def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("cases", nargs="*", choices=sorted(PROMPTS))
    parser.add_argument("--output", type=Path, default=ROOT / "artifacts" / "m20-deepseek-traces.jsonl")
    parser.add_argument("--email", default=os.getenv("ASTER_DEMO_EMAIL"))
    args = parser.parse_args()
    if not os.getenv("DEEPSEEK_API_KEY"):
        raise RuntimeError("DEEPSEEK_API_KEY_REQUIRED")
    if not args.email:
        raise RuntimeError("ASTER_DEMO_EMAIL_REQUIRED")
    cookie = await login(args.email)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    with args.output.open("w", encoding="utf-8") as file:
        for case in args.cases or list(PROMPTS):
            result = await run_case(case, cookie)
            file.write(json.dumps(result, ensure_ascii=False) + "\n")
            file.flush()
            print(json.dumps({k: v for k, v in result.items() if k != "trace"}, ensure_ascii=False))


if __name__ == "__main__":
    asyncio.run(main())

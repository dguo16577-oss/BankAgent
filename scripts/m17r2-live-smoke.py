"""Opt-in, non-executing M17R.2 DeepSeek smoke against a disposable bank sandbox.

Requires BANKING_API_BASE_URL, DEEPSEEK_API_KEY, ASTER_DEMO_EMAIL and
ASTER_DEMO_PASSWORD. Records only a sanitized decision/observation trace.
"""

from __future__ import annotations

import asyncio
import json
import os
import sys
from pathlib import Path

import httpx

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "services" / "agent-runtime"))

from app.banking import BankingGateway  # noqa: E402
from app.main import create_app  # noqa: E402


def summarize_observation(entry: dict) -> dict:
    result = entry.get("result", {})
    cards = result.get("cards", []) if isinstance(result, dict) else []
    return {
        "tool": entry["tool"],
        "status": result.get("status") if isinstance(result, dict) else None,
        "card_suffixes": [card.get("masked_number") for card in cards],
        "totals_by_currency": result.get("totals_by_currency") if isinstance(result, dict) else None,
        "transaction_count": result.get("transaction_count") if isinstance(result, dict) else None,
    }


async def main() -> None:
    origin = os.environ["BANKING_API_BASE_URL"]
    assert os.environ["DEEPSEEK_API_KEY"]
    app = create_app(BankingGateway(origin))
    http_post = httpx.AsyncClient.post
    model_responses: list[dict] = []

    async def observed_post(client, url, *args, **kwargs):
        response = await http_post(client, url, *args, **kwargs)
        if "api.deepseek.com/chat/completions" in str(url):
            payload = response.json()
            choice = payload.get("choices", [{}])[0]
            model_responses.append({"finish_reason": choice.get("finish_reason"),
                                    "content_length": len(choice.get("message", {}).get("content") or "")})
        return response

    httpx.AsyncClient.post = observed_post
    bank_prepare = app.state.gateway.prepare_transfer

    async def diagnostic_prepare(cookie: str, body: dict) -> dict:
        try:
            return await bank_prepare(cookie, body)
        except Exception as exc:
            print("PREPARE_ERROR", type(exc).__name__, getattr(exc, "code", ""))
            raise

    app.state.gateway.prepare_transfer = diagnostic_prepare
    completion = app.state.classifier._json_completion
    calls: list[dict] = []

    async def traced_completion(system: str, user: str, max_tokens: int) -> dict:
        context = json.loads(user)
        result = await completion(system, user, max_tokens)
        calls.append({
            "available_tool_count": len(context.get("available_tools", [])),
            "previous_observation_tools": [ob.get("tool_name") for ob in context.get("observations", [])],
            "decision": result,
        })
        return result

    app.state.classifier._json_completion = traced_completion
    async with httpx.AsyncClient(base_url=origin, timeout=20) as bank:
        await bank.get("/customer/session")
        csrf = bank.cookies.get("XSRF-TOKEN")
        login = await bank.post("/customer/auth/login", json={
            "email": os.environ["ASTER_DEMO_EMAIL"],
            "password": os.environ["ASTER_DEMO_PASSWORD"],
        }, headers={"X-XSRF-TOKEN": csrf or ""})
        assert login.status_code == 200, f"login status {login.status_code}"
        await bank.get("/customer/session")
        cookie = "; ".join(f"{name}={value}" for name, value in bank.cookies.items())
        before_accounts = (await bank.get("/customer/accounts")).json()
        before_balance = next(a for a in before_accounts["accounts"] if a["id"] == "acc_current")["balance"]["amount"]
        records = []
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://agent.test", timeout=80) as agent:
            for case, message in (
                ("G01", "我这张尾号6327的卡怎么少了这么多钱，你看看这两个月这张卡的钱都去哪里了"),
                ("G02", "给张三转500"),
            ):
                start = len(calls)
                response_start = len(model_responses)
                response = await agent.post("/agent/chat", json={"message": message}, headers={"Cookie": cookie})
                assert response.status_code == 200, f"{case} HTTP {response.status_code}"
                payload = response.json()
                task = app.state.agent_v2.tasks[payload["task_id"]]
                trace = task.trace
                tool_results = [entry for entry in trace if entry.get("kind") == "TOOL_RESULT"]
                record = {
                    "case": case,
                    "status": payload["status"],
                    "error_code": payload.get("error_code"),
                    "model_http_calls": len(model_responses) - response_start,
                    "model_response_metadata": model_responses[response_start:],
                    "planner_decisions": sum(entry.get("kind") == "PLANNER_DECISION" for entry in trace),
                    "model_calls": calls[start:],
                    "tool_results": [summarize_observation(entry) for entry in tool_results],
                    "prepare_count": sum(entry["tool"] == "prepare_transfer" for entry in tool_results),
                    "runtime_errors": [entry.get("type") for entry in trace if entry.get("kind") == "RUNTIME_ERROR"],
                }
                if case == "G01":
                    assert payload["status"] == "SUCCEEDED", record
                    assert record["prepare_count"] == 0, record
                    assert any(entry["tool"] == "summarize_spending" for entry in tool_results), record
                else:
                    assert payload["status"] == "WAITING_CONFIRMATION", record
                    assert record["prepare_count"] == 1, record
                    assert payload["confirmation"]["status"] == "PREPARED", record
                    record["intent_status"] = payload["confirmation"]["status"]
                records.append(record)
        after_accounts = (await bank.get("/customer/accounts")).json()
        after_balance = next(a for a in after_accounts["accounts"] if a["id"] == "acc_current")["balance"]["amount"]
        assert before_balance == after_balance, "A smoke case changed the account balance"
        records.append({"bank_balance_before": before_balance, "bank_balance_after": after_balance})
        output = ROOT / "artifacts" / "m17r2-sandbox-deepseek-trace.json"
        output.parent.mkdir(parents=True, exist_ok=True)
        output.write_text(json.dumps(records, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print(json.dumps({"G01": records[0]["status"], "G02": records[1]["status"],
                          "model_calls": [records[0]["model_http_calls"], records[1]["model_http_calls"]],
                          "tool_counts": [len(records[0]["tool_results"]), len(records[1]["tool_results"])],
                          "balance_unchanged": True}, ensure_ascii=False))


if __name__ == "__main__":
    asyncio.run(main())

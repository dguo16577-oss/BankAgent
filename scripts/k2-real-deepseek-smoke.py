"""Eight real DeepSeek + isolated Spring/PostgreSQL knowledge/tool-loop cases.

The script never prints or saves credentials, cookies or full banking observations.
It never confirms a financial intent.
"""

from __future__ import annotations

import asyncio
import json
import os
import sys
import time
from pathlib import Path

import httpx

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "services" / "agent-runtime"))

from app.banking import BankingGateway
from app.deepseek import DeepSeekClassifier
from app.main import create_app
from evals.m18_usage import UsageMeter

GOALS = [
    ("K2D01", "灵活储蓄的示例利率是保证收益吗？", True),
    ("K2D02", "银行卡丢了应该怎么处理？", True),
    ("K2D03", "银行转账失败一般有哪些原因？", True),
    ("K2D04", "为什么敏感操作需要二次验证？", True),
    ("K2D05", "现金返还信用卡的示例年费是多少？", True),
    ("K2D06", "我的风险等级是什么？请结合投资风险说明。", True),
    ("K2D07", "我的可用余额为什么可能比账面余额少？", True),
    ("K2D08", "给 Lin Wei 转 10 元，先让我确认", False),
]


async def main() -> None:
    origin = os.environ["BANKING_API_BASE_URL"].rstrip("/")
    if not origin.startswith("http://127.0.0.1:"):
        raise RuntimeError("Smoke requires a loopback banking sandbox")
    if not os.getenv("DEEPSEEK_API_KEY_FILE"):
        raise RuntimeError("Use an ignored local DeepSeek key file")
    async with httpx.AsyncClient(base_url=origin, timeout=25) as bank:
        await bank.get("/customer/session")
        csrf = bank.cookies.get("XSRF-TOKEN")
        if not csrf:
            raise RuntimeError("CSRF bootstrap failed")
        login = await bank.post("/customer/auth/login", json={"email": "alex@aster.local", "password":
            os.getenv("ASTER_DEMO_PASSWORD", "demo-password")}, headers={"X-XSRF-TOKEN": csrf})
        if login.status_code != 200:
            raise RuntimeError(f"Demo login HTTP {login.status_code}")
        await bank.get("/customer/session")
        cookie = "; ".join(f"{key}={value}" for key, value in bank.cookies.items())
        before = (await bank.get("/customer/accounts")).json()
        meter = UsageMeter()
        app = create_app(gateway=BankingGateway(origin), classifier=DeepSeekClassifier(transport=meter),
                         agent_version="v2")
        runtime = app.state.agent_v2
        planner = runtime.planner
        original = planner.decide
        calls = 0

        async def counted(context):
            nonlocal calls
            calls += 1
            return await original(context)

        planner.decide = counted
        records = []
        selected = set(os.getenv("K2_SMOKE_IDS", "").split(",")) if os.getenv("K2_SMOKE_IDS") else None
        for case_id, goal, expects_knowledge in GOALS:
            if selected and case_id not in selected:
                continue
            started, prior, prior_usage = time.perf_counter(), calls, len(meter.records)
            result = await runtime.chat(goal, cookie)
            task = runtime.tasks[result.task_id]
            tools = [item.tool_name for item in task.observations if item.success]
            knowledge = [item for item in task.observations if item.success and item.tool_name == "search_bank_knowledge"]
            citations = [e.get("evidence_id") for item in knowledge for e in item.structured_result.get("evidence", [])]
            record = {"id": case_id, "status": result.status.value,
                      "tools": tools, "model_calls": calls-prior,
                      "prompt_tokens": sum(int(item["prompt_tokens"]) for item in meter.records[prior_usage:]),
                      "completion_tokens": sum(int(item["completion_tokens"]) for item in meter.records[prior_usage:]),
                      "latency_ms": round((time.perf_counter()-started)*1000, 1),
                      "knowledge_observations": len(knowledge), "cited_observed_evidence":
                      any(f"[{identifier}]" in result.message for identifier in citations),
                      "failure_code": result.error_code,
                      "trace_errors": [{"kind": entry.get("kind"), "code": entry.get("code") or entry.get("error_code"),
                                        "type": entry.get("type"), "bank_code": entry.get("bank_code")}
                                       for entry in task.trace if entry.get("kind") in {"FAILED", "RUNTIME_ERROR", "TOOL_REJECTED"}],
                      "planner_tool_names": [entry.get("decision", {}).get("tool_call", {}).get("tool_name")
                                             for entry in task.trace if entry.get("kind") == "PLANNER_DECISION"
                                             and isinstance(entry.get("decision", {}).get("tool_call"), dict)]}
            records.append(record)
            if expects_knowledge and (not knowledge or result.status.value != "SUCCEEDED" or not record["cited_observed_evidence"]):
                print(f"{case_id}: INCOMPLETE (see trace)")
            else:
                print(f"{case_id}: {result.status.value}")
        after = (await bank.get("/customer/accounts")).json()
    report = {"cases": records, "balances_unchanged": before == after, "total_model_calls": calls,
              "total_prompt_tokens": sum(int(item["prompt_tokens"]) for item in meter.records),
              "total_completion_tokens": sum(int(item["completion_tokens"]) for item in meter.records),
              "estimated_peak_cost_usd": meter.peak_cost_usd(),
              "usage_coverage_complete": meter.usage_coverage_complete(calls)}
    await meter.close_pool()
    destination = ROOT / "artifacts" / "k2-real-deepseek-smoke.json"
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Trace: {destination}; unchanged balances: {report['balances_unchanged']}")


if __name__ == "__main__":
    asyncio.run(main())

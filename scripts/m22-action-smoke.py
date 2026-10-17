"""Real DeepSeek M22 prepare smoke. Cancel prepared intents after collecting sanitized traces."""

from __future__ import annotations

import argparse
import asyncio
import importlib.util
import json
import os
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("m22_readonly", ROOT / "scripts" / "m22-readonly-smoke.py")
assert spec and spec.loader
smoke = importlib.util.module_from_spec(spec)
spec.loader.exec_module(smoke)

async def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("cases", nargs="*")
    args = parser.parse_args()
    if not os.getenv("DEEPSEEK_API_KEY") or not os.getenv("ASTER_DEMO_PASSWORD"):
        raise RuntimeError("DEEPSEEK_API_KEY and ASTER_DEMO_PASSWORD are required")
    cookie = await smoke.smoke.login(os.getenv("ASTER_DEMO_EMAIL", "alex@aster.local"))
    candidates = (await smoke.smoke.BankingGateway().customer_get("/customer/recurring-payments", cookie))["items"]
    active = next((item for item in candidates if item.get("status") == "ACTIVE"
                   and item.get("source") == "BANK_MANAGED"
                   and item.get("managementCapability") == "STOP_FUTURE_PAYMENTS"), None)
    if active is None:
        raise RuntimeError("NO_ACTIVE_BANK_MANAGED_MANDATE")
    name = active["displayName"]
    prompts = {
        "SUB10_PREPARE": f"请在 2026 年 10 月 15 日上午 9 点（香港时间）通过应用内消息提醒我 {name} 续费。先给我复核单。",
        "SUB12_PREPARE": f"请停掉 {name} 的银行代扣安排。先核对它是不是银行可管理的授权，再给我复核单，不要取消第三方会员。",
    }
    reminders = (await smoke.smoke.BankingGateway().customer_get("/customer/renewal-reminders", cookie))["items"]
    active_reminder = next((item for item in reminders if item.get("status") == "ACTIVE"), None)
    if active_reminder:
        prompts["SUB11_CANCEL_PREPARE"] = (
            f"请取消我已创建的续费提醒 {active_reminder['id']}，先读取当前版本并给我复核单。"
        )
    output_path = ROOT / "artifacts" / "m22-action-smoke.jsonl"
    output_path.parent.mkdir(parents=True, exist_ok=True)
    with output_path.open("a", encoding="utf-8") as output:
        for case, prompt in prompts.items():
            if args.cases and case not in args.cases:
                continue
            model = smoke.smoke.CountedDeepSeek()
            gateway = smoke.smoke.BankingGateway()
            runtime = smoke.smoke.AgentRuntimeV2(gateway, smoke.smoke.DeepSeekPlanner(model))
            try:
                response = await runtime.chat(prompt, cookie)
                task = runtime.tasks[response.task_id]
                prepared = task.active_intent
                result = {
                    "case": case,
                    "goal": prompt,
                    "status": response.status.value,
                    "message": response.message,
                    "model_http_calls": model.calls,
                    "tool_calls": sum(row.get("kind") == "TOOL_RESULT" for row in task.trace),
                    "prepared_kind": task.active_intent_kind,
                    "trace": [row for row in task.trace if row.get("kind") in
                              {"PLANNER_DECISION", "TOOL_RESULT", "FAILED", "RUNTIME_ERROR"}],
                }
                if prepared:
                    if task.active_intent_kind == "RENEWAL_REMINDER":
                        result["cleanup_status"] = (await gateway.cancel_renewal_reminder(cookie, prepared["id"]))["status"]
                    elif task.active_intent_kind == "RECURRING_STOP":
                        result["cleanup_status"] = (await gateway.cancel_stop_recurring(cookie, prepared["id"]))["status"]
            except Exception as exc:
                result = {"case": case, "error_type": type(exc).__name__, "model_http_calls": model.calls}
            result = smoke.sanitize(result)
            output.write(json.dumps(result, ensure_ascii=False) + "\n")
            output.flush()
            print(json.dumps({k: v for k, v in result.items() if k != "trace"}, ensure_ascii=False), flush=True)


if __name__ == "__main__":
    asyncio.run(main())

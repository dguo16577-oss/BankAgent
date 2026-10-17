"""Diagnose the current SUB20 prompt against a local demo bank without executing actions."""

from __future__ import annotations

import asyncio
import importlib.util
import json
import os
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location("m22_smoke", ROOT / "scripts/m22-readonly-smoke.py")
assert SPEC and SPEC.loader
smoke = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(smoke)


async def main() -> None:
    cookie = await smoke.smoke.login("alex@aster.local")
    model = smoke.smoke.CountedDeepSeek()
    completions = []
    original_completion = model._json_completion

    async def record_completion(*args, **kwargs):
        try:
            result = await original_completion(*args, **kwargs)
            completions.append({"result": "OK"})
            return result
        except Exception as exc:
            completions.append({"result": type(exc).__name__, "detail": str(exc)[:180]})
            raise

    model._json_completion = record_completion
    runtime = smoke.smoke.AgentRuntimeV2(
        smoke.smoke.BankingGateway(), smoke.smoke.DeepSeekPlanner(model)
    )
    prompt = (
        "查一下我的自动续费。把 Rent 银行代扣的站内提醒改到 10 月 26 日上午 9 点，"
        "然后停止 Rent 在银行管理的未来代扣。请分别让我确认提醒和停止操作，"
        "不要声称第三方会员也取消。"
    )
    response = await runtime.chat(prompt, cookie)
    task = runtime.tasks[response.task_id]
    result = {
        "status": response.status.value,
        "error_code": response.error_code,
        "model_calls": model.calls,
        "model_request_results": completions,
        "tool_calls": sum(row.get("kind") == "TOOL_RESULT" for row in task.trace),
        "trace": [
            row for row in task.trace
            if row.get("kind") in {"PLANNER_DECISION", "TOOL_RESULT", "FAILED", "RUNTIME_ERROR"}
        ],
    }
    if response.status.value == "WAITING_CONFIRMATION":
        await runtime.cancel(response.task_id, cookie)
    destination = ROOT / "artifacts/m22-current-sub20-diagnostic.json"
    destination.write_text(
        json.dumps(smoke.sanitize(result), ensure_ascii=False, indent=2), encoding="utf-8"
    )
    print(json.dumps({k: v for k, v in result.items() if k != "trace"}, ensure_ascii=False))


if __name__ == "__main__":
    if not os.getenv("DEEPSEEK_API_KEY") or not os.getenv("ASTER_DEMO_PASSWORD"):
        raise RuntimeError("Demo credentials and model key must be configured")
    asyncio.run(main())

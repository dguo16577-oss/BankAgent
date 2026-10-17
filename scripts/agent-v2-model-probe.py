"""Opt-in DeepSeek decision probe with a fake bank; no financial debit."""

from __future__ import annotations

import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "services" / "agent-runtime"))
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "services" / "agent-runtime" / "tests"))

from app.agent_v2.planner import DeepSeekPlanner  # noqa: E402
from app.agent_v2.runtime import AgentRuntimeV2  # noqa: E402
from app.deepseek import DeepSeekClassifier  # noqa: E402
from test_agent_v2 import CancellableBank  # noqa: E402


async def main() -> None:
    bank = CancellableBank()
    runtime = AgentRuntimeV2(bank, DeepSeekPlanner(DeepSeekClassifier()))
    result = await runtime.chat("给张三转500", "SESSION=alice")
    print("status:", result.status.value)
    print("error_code:", result.error_code)
    print("tools:", [step.tool for step in result.steps])
    print("planner_calls:", len([entry for entry in runtime.tasks[result.task_id].trace if entry.get("kind") == "PLANNER_DECISION"]))
    if result.confirmation:
        cancelled = await runtime.cancel(result.task_id, "SESSION=alice")
        print("cancel_status:", cancelled.status.value)


if __name__ == "__main__":
    asyncio.run(main())

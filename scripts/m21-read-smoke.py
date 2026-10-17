"""Real DeepSeek smoke for M21's existing read-only Card Core capabilities.

Requires DEEPSEEK_API_KEY and local demo credentials in environment; writes
sanitized structured decisions and observations without credentials or cookies.
"""

from __future__ import annotations

import asyncio
import argparse
import importlib.util
import json
import os
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
source = ROOT / "scripts" / "m20-real-smoke.py"
spec = importlib.util.spec_from_file_location("m20_smoke", source)
assert spec and spec.loader
smoke = importlib.util.module_from_spec(spec)
spec.loader.exec_module(smoke)

PROMPTS = {
    "C04": "有哪些银行卡产品？比较适合日常使用的借记卡有哪些？",
    "C05": "帮我比较 Everyday Debit Card 和 Travel Credit Card 的类型、费用和特点。",
    "C07": "我刚才申请的银行卡审核到哪一步了？请查银行申请记录。",
    "C11": "查看我尾号 1937 银行卡现在的交易限制。",
}


async def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("cases", nargs="*", choices=sorted(PROMPTS))
    parser.add_argument("--output", type=Path, default=ROOT / "artifacts" / "m21-read-deepseek-traces.jsonl")
    args = parser.parse_args()
    if not os.getenv("DEEPSEEK_API_KEY"):
        raise RuntimeError("DEEPSEEK_API_KEY_REQUIRED")
    email = os.getenv("ASTER_DEMO_EMAIL", "alex@aster.local")
    cookie = await smoke.login(email)
    with args.output.open("w", encoding="utf-8") as file:
        for case in args.cases or PROMPTS:
            prompt = PROMPTS[case]
            smoke.PROMPTS[case] = prompt
            result = await smoke.run_case(case, cookie)
            file.write(json.dumps(result, ensure_ascii=False) + "\n")
            file.flush()
            print(json.dumps({key: value for key, value in result.items() if key != "trace"},
                             ensure_ascii=False))


if __name__ == "__main__":
    asyncio.run(main())

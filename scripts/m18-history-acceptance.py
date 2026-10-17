"""Run H01–H10 with real DeepSeek, each in a disposable Spring/PostgreSQL stack.

The suite never connects to the shared demo database. Each case provisions and
removes its own uniquely named PostgreSQL container and Banking Core process.
"""

from __future__ import annotations

import argparse
import json
import subprocess
import sys
from decimal import Decimal
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
CASES = [f"H{number:02d}" for number in range(1, 11)]


def artifact_for(case_id: str) -> Path:
    return ROOT / "artifacts" / ("m18-history-model-sandbox.json" if case_id == "H01"
                                 else f"m18-history-{case_id}-model-sandbox.json")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--summarize-existing", action="store_true",
                        help="Validate and summarize previously executed case artifacts")
    options = parser.parse_args()
    results = []
    for case_id in CASES:
        result = None if options.summarize_existing else subprocess.run(
            [sys.executable, str(ROOT / "scripts/m18-benchmark-sandbox.py"),
             "--history-model-smoke", "--history-scenario", case_id],
            cwd=ROOT, capture_output=True, text=True, encoding="utf-8", errors="replace",
            timeout=240,
        )
        artifact = artifact_for(case_id)
        command_ok = result is None or result.returncode == 0
        evidence = json.loads(artifact.read_text(encoding="utf-8")) if command_ok and artifact.exists() else {}
        usage = evidence.get("model_usage", [])
        requests = evidence.get("model_requests")
        usage_complete = (isinstance(requests, int) and requests > 0
                          and isinstance(usage, list) and len(usage) == requests
                          and evidence.get("estimated_model_cost_usd") is not None)
        passed = (command_ok and evidence.get("status") == "PASS"
                  and evidence.get("model") == "DEEPSEEK"
                  and evidence.get("scenario") == case_id
                  and evidence.get("extra_debit") == "0.00" and usage_complete)
        results.append({"case_id": case_id, "result": "PASS" if passed else "FAIL",
                        "task_state": evidence.get("task_state"),
                        "model_requests": evidence.get("model_requests"),
                        "planner_calls": evidence.get("planner_calls"),
                        "planner_retry_count": evidence.get("planner_retry_count"),
                        "latency_ms": evidence.get("latency_ms"),
                        "model_usage_complete": usage_complete,
                        "estimated_model_cost_usd": evidence.get("estimated_model_cost_usd"),
                        "tools": evidence.get("tools"),
                        "evidence": str(artifact.relative_to(ROOT)) if passed else None})
        print(f"{case_id} {'PASS' if passed else 'FAIL'}", flush=True)
        if not passed:
            if result is not None:
                print(result.stderr[-1500:], file=sys.stderr)
            break
    summary = {"suite": "M18.3 Historical Recipient H01-H10", "full_m18_benchmark": False,
               "case_count": len(results), "all_passed": len(results) == len(CASES) and
               all(row["result"] == "PASS" for row in results),
               "model_requests": sum(row["model_requests"] or 0 for row in results),
               "planner_retry_count": sum(row["planner_retry_count"] or 0 for row in results),
               "model_cost_coverage": {"measured": sum(row["model_usage_complete"] for row in results),
                                       "total": len(results)},
               "estimated_model_cost_usd": str(sum((Decimal(row["estimated_model_cost_usd"])
                   for row in results if row["estimated_model_cost_usd"] is not None), Decimal("0"))),
               "results": results}
    output = ROOT / "artifacts/m18-history-acceptance.json"
    output.write_text(json.dumps(summary, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Sanitized summary: {output}", flush=True)
    return 0 if summary["all_passed"] else 1


if __name__ == "__main__":
    raise SystemExit(main())

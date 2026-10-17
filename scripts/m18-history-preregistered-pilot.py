"""Run a frozen historical-recipient manifest through real Agent v2 sandboxes.

Each scenario provisions its own Banking Core and PostgreSQL. The manifest is
captured once before any scenario starts, and every case remains in the result
even if a sandbox fails to start or the model returns an unexpected decision.
"""

from __future__ import annotations

import argparse
import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "services" / "agent-runtime"))

from evals.m18_cases import load_cases  # noqa: E402
from evals.m18_run_artifact import write_pilot_attempt  # noqa: E402


def grade_case(case, evidence: dict, *, process_ok: bool) -> dict:
    invariants = {name: evidence.get(name) is True for name in case.expected_db_invariants}
    tools = evidence.get("tools", [])
    requests = evidence.get("model_requests")
    usage = evidence.get("model_usage")
    usage_complete = (isinstance(requests, int) and requests > 0
                      and isinstance(usage, list) and len(usage) == requests
                      and evidence.get("estimated_model_cost_usd") is not None)
    required = (case.expected_tool_constraints or {}).get("required_tools", [])
    forbidden_ok = ("prepare_tool" not in case.forbidden_side_effects
                    or not any(isinstance(name, str) and name.startswith("prepare_") for name in tools))
    passed = (process_ok and evidence.get("status") == "PASS" and evidence.get("model") == "DEEPSEEK"
              and evidence.get("scenario") == case.case_id
              and evidence.get("user_turns") == list(case.user_turns)
              and evidence.get("available_tools") == list(case.available_tools)
              and evidence.get("task_state") == case.expected_final_task_state
              and evidence.get("db_verified") is True and all(invariants.values())
              and evidence.get("extra_debit") == "0.00" and forbidden_ok
              and isinstance(tools, list) and all(name in tools for name in required)
              and usage_complete)
    return {"benchmark_case_id": case.case_id, "category": case.category,
            "result": "PASS" if passed else "FAIL",
            "model": evidence.get("model"), "final_task_state": evidence.get("task_state", "UNVERIFIED"),
            "financial_case": case.financial_case, "invariants": invariants,
            "tool_call_count": len(tools) if isinstance(tools, list) else None,
            "pilot_evidence": {"db_verified": evidence.get("db_verified") is True and all(invariants.values()),
                               "usage_coverage_complete": usage_complete,
                               "model_requests": requests,
                               "planner_retry_count": evidence.get("planner_retry_count"),
                               "latency_ms": evidence.get("latency_ms"),
                               "estimated_model_cost_usd": evidence.get("estimated_model_cost_usd")},
            "scenario_evidence": evidence if process_ok else None}


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--cases", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    options = parser.parse_args()
    registered_manifest_bytes = options.cases.read_bytes()
    cases = load_cases(options.cases, source_bytes=registered_manifest_bytes)
    if not cases or len(cases) > 10 or any(case.case_id not in {f"H{n:02d}" for n in range(1, 11)}
                                            for case in cases):
        raise SystemExit("Historical pilot requires 1–10 H01–H10 manifest cases")
    results = []
    scenario_dir = options.output.parent / f"{options.output.stem}-scenarios"
    scenario_dir.mkdir(parents=True, exist_ok=True)
    for case in cases:
        scenario_output = scenario_dir / f"{case.case_id}.json"
        try:
            completed = subprocess.run([
                sys.executable, str(ROOT / "scripts/m18-benchmark-sandbox.py"),
                "--history-model-smoke", "--history-scenario", case.case_id,
                "--history-output", str(scenario_output),
            ], cwd=ROOT, capture_output=True, text=True, encoding="utf-8",
                errors="replace", timeout=600)
            process_ok = completed.returncode == 0
        except subprocess.TimeoutExpired:
            process_ok = False
        try:
            evidence = json.loads(scenario_output.read_text(encoding="utf-8")) if scenario_output.is_file() else {}
        except (OSError, ValueError):
            evidence = {}
        result = grade_case(case, evidence, process_ok=process_ok)
        results.append(result)
        print(f"{case.case_id}: {result['result']}", flush=True)
    all_passed = all(result["result"] == "PASS" for result in results)
    _, history = write_pilot_attempt(
        manifest=options.cases, expected_case_ids=[case.case_id for case in cases],
        registered_manifest_bytes=registered_manifest_bytes,
        requested_output=options.output, passed=all_passed,
        payload={"suite": "M18 historical recipient pre-registered pilot",
                 "full_benchmark": False, "case_count": len(results), "results": results})
    print(f"Attempt retained: {history}")
    return 0 if all_passed else 1


if __name__ == "__main__":
    raise SystemExit(main())

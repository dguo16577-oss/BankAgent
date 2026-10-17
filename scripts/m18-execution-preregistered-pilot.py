"""Grade a real Agent v2 transfer execution in disposable Spring/PostgreSQL."""

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

EXECUTION_CASE_ID = "DC01-TRANSFER-LIFECYCLE"
EXECUTION_TURNS = (
    "给张三转500", "金额改成1000", "不是张三，是李四", "取消当前任务",
    "给张三转1元", "确认转账并完成演示验证码校验", "重复提交同一确认",
)


def grade(case, evidence: dict, *, process_ok: bool) -> dict:
    proof = evidence.get("postgresql_evidence", {})
    usage = evidence.get("model_usage")
    requests = evidence.get("model_http_requests")
    metered = (isinstance(requests, int) and requests > 0 and isinstance(usage, list)
               and len(usage) == requests and evidence.get("usage_coverage_complete") is True
               and evidence.get("estimated_model_cost_usd") is not None)
    invariants = {
        "exactly_one_source_debit": proof.get("source_debit") == "1.00"
            and evidence.get("balance_debit") == "1.00",
        "exactly_one_transfer": proof.get("new_transfers") == 1,
        "exactly_one_debit_transaction": proof.get("new_customer_transfer_debits") == 1,
        "old_intents_cancelled": evidence.get("revision_old_status") == "CANCELLED"
            and evidence.get("recipient_revision_old_status") == "CANCELLED",
        "duplicate_same_receipt": evidence.get("duplicate_same_receipt") is True,
    }
    trajectory = evidence.get("trajectory", {})
    available = [tool.get("name") for tool in trajectory.get("tool_schemas", [])]
    manifest_matches = (case.case_id == EXECUTION_CASE_ID
                        and case.user_turns == EXECUTION_TURNS
                        and list(case.available_tools) == available
                        and case.expected_final_task_state == "SUCCEEDED"
                        and set(case.expected_db_invariants) == set(invariants)
                        and "duplicate_debit" in case.forbidden_side_effects
                        and "execute_transfer" not in available
                        and "prepare_transfer" in evidence.get("tool_order", []))
    db_verified = proof.get("verified") is True and all(invariants.values())
    passed = (process_ok and manifest_matches and evidence.get("case_id") == case.case_id
              and evidence.get("status") == "PASS" and evidence.get("model") == "DEEPSEEK"
              and evidence.get("task_state") == case.expected_final_task_state
              and db_verified and metered)
    return {"benchmark_case_id": case.case_id, "category": case.category,
            "result": "PASS" if passed else "FAIL", "model": evidence.get("model"),
            "final_task_state": evidence.get("task_state", "UNVERIFIED"),
            "financial_case": case.financial_case, "invariants": invariants,
            "tool_call_count": evidence.get("tool_calls"),
            "pilot_evidence": {"db_verified": db_verified,
                               "usage_coverage_complete": metered,
                               "model_requests": requests,
                               "latency_ms": evidence.get("latency_ms"),
                               "estimated_model_cost_usd": evidence.get("estimated_model_cost_usd")},
            "execution_evidence": evidence if process_ok else None}


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--cases", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    options = parser.parse_args()
    source = options.cases.read_bytes()
    cases = load_cases(options.cases, source_bytes=source)
    if len(cases) != 1 or cases[0].case_id != EXECUTION_CASE_ID:
        raise SystemExit("Execution pilot requires the pre-registered DC01 case")
    scenario_output = options.output.with_name(f"{options.output.stem}-scenario.json")
    try:
        completed = subprocess.run([
            sys.executable, str(ROOT / "scripts/m18-benchmark-sandbox.py"),
            "--transfer-smoke", "--transfer-only", "--transfer-output", str(scenario_output),
        ], cwd=ROOT, capture_output=True, text=True, encoding="utf-8",
            errors="replace", timeout=300)
        process_ok = completed.returncode == 0
    except subprocess.TimeoutExpired:
        process_ok = False
    try:
        evidence = json.loads(scenario_output.read_text(encoding="utf-8")) if scenario_output.is_file() else {}
    except (OSError, ValueError):
        evidence = {}
    result = grade(cases[0], evidence, process_ok=process_ok)
    _, history = write_pilot_attempt(
        manifest=options.cases, expected_case_ids=[cases[0].case_id],
        registered_manifest_bytes=source,
        requested_output=options.output, passed=result["result"] == "PASS",
        payload={"suite": "M18 real transfer execution pilot", "full_benchmark": False,
                 "case_count": 1, "results": [result]})
    print(f"{cases[0].case_id}: {result['result']}")
    print(f"Attempt retained: {history}")
    return 0 if result["result"] == "PASS" else 1


if __name__ == "__main__":
    raise SystemExit(main())

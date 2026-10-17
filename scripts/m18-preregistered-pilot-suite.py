"""Run a pre-registered M18 read/prepare/history/execution/fault pilot.

This is groundwork for the 100-case benchmark. It does not run scheduled or
split-mutation categories and never awards M18.6.
Every planned case remains in the result, including failed or unrun shards.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import subprocess
import sys
import tempfile
from datetime import datetime, timezone
from pathlib import Path
from uuid import uuid4

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "services" / "agent-runtime"))

from evals.m18_cases import load_cases  # noqa: E402
from evals.trajectory import sanitize  # noqa: E402


def register(plan_path: Path) -> tuple[dict, list[dict], bytes]:
    """Freeze all case bytes and expected IDs before the first sandbox starts."""
    plan_bytes = plan_path.read_bytes()
    plan = json.loads(plan_bytes)
    if not isinstance(plan, dict) or set(plan) != {"shards"} or not isinstance(plan["shards"], list):
        raise ValueError("Suite plan must contain only a shards array")
    if not plan["shards"]:
        raise ValueError("Suite plan cannot be empty")
    snapshots = []
    seen_ids: set[str] = set()
    seen_names: set[str] = set()
    manifest_root = (ROOT / "research/agent-transfer").resolve()
    for raw in plan["shards"]:
        if not isinstance(raw, dict) or set(raw) != {"name", "mode", "manifest", "case_ids"}:
            raise ValueError("Each shard requires name, mode, manifest, and case_ids")
        name, mode, relative, expected = (raw[key] for key in ("name", "mode", "manifest", "case_ids"))
        if (not isinstance(name, str) or not name.isidentifier() or name in seen_names
                or not isinstance(mode, str) or mode not in {"read", "read_note_cursor",
                                                        "read_counterparty_cursor", "prepare", "prepare_alias",
                                                        "history", "execution", "fault"}
                or not isinstance(relative, str)
                or not isinstance(expected, list) or not expected
                or any(not isinstance(value, str) or not value for value in expected)):
            raise ValueError("Invalid or duplicate suite shard")
        path = (ROOT / relative).resolve()
        if not path.is_relative_to(manifest_root) or path.suffix != ".jsonl" or not path.is_file():
            raise ValueError("Suite manifests must be existing research/agent-transfer JSONL files")
        source = path.read_bytes()
        cases = load_cases(path, source_bytes=source)
        actual = [case.case_id for case in cases]
        if len(cases) > 10 or actual != expected or seen_ids.intersection(actual):
            raise ValueError(f"{name}: pre-registered IDs differ, duplicate, or exceed pilot shard size")
        seen_ids.update(actual)
        seen_names.add(name)
        snapshots.append({"name": name, "mode": mode, "manifest": relative,
                          "manifest_bytes": source,
                          "manifest_sha256": hashlib.sha256(source).hexdigest(),
                          "case_ids": actual,
                          "categories": [case.category for case in cases]})
    registration = {"plan_sha256": hashlib.sha256(plan_bytes).hexdigest(),
                    "case_count": len(seen_ids),
                    "case_ids": [case_id for shard in snapshots for case_id in shard["case_ids"]],
                    "shards": [{key: value for key, value in shard.items() if key != "manifest_bytes"}
                               for shard in snapshots]}
    return registration, snapshots, plan_bytes


def grade_shard(shard: dict, artifact: dict | None, *, process_ok: bool) -> list[dict]:
    """Keep every pre-registered case in the result, even on startup failure."""
    ids = shard["case_ids"]
    if not isinstance(artifact, dict) or artifact.get("manifest_sha256") != shard["manifest_sha256"] \
            or artifact.get("manifest_case_ids") != ids or not isinstance(artifact.get("results"), list):
        return [{"case_id": case_id, "category": category, "result": "UNVERIFIED",
                 "financial_effect_unknown": True, "reason": "MISSING_OR_MISMATCHED_SHARD_ARTIFACT"}
                for case_id, category in zip(ids, shard["categories"])]
    observed = artifact["results"]
    if [row.get("benchmark_case_id") for row in observed] != ids:
        return [{"case_id": case_id, "category": category, "result": "UNVERIFIED",
                 "financial_effect_unknown": True, "reason": "INCOMPLETE_SHARD_ARTIFACT"}
                for case_id, category in zip(ids, shard["categories"])]
    rows = []
    for case_id, category, result in zip(ids, shard["categories"], observed):
        # A pilot exits nonzero when one case fails. Other fully verified cases
        # in its complete artifact still count as passes in the same denominator.
        passed = result.get("result") == "PASS"
        evidence = result.get("pilot_evidence", {})
        fault_evidence = result.get("fault_evidence", {})
        if shard["mode"] in {"prepare", "prepare_alias", "history", "execution"}:
            db_verified = evidence.get("db_verified") is True
        elif shard["mode"] == "fault":
            db_verified = (fault_evidence.get("database_verified") is True
                           and bool(result.get("invariants")) and all(result["invariants"].values()))
        else:
            db_verified = bool(result.get("invariants")) and all(result["invariants"].values())
        reasons = []
        if not db_verified:
            reasons.append("DB_UNVERIFIED")
        fault_valid = (result.get("model") == "INJECTED_FAULT"
                       and result.get("final_task_state") == "FAILED"
                       and fault_evidence.get("model_http_requests") == 0
                       and fault_evidence.get("not_a_deepseek_success_case") is True
                       and fault_evidence.get("no_prepare_tool_result") is True)
        if shard["mode"] == "fault" and not fault_valid:
            reasons.append("FAULT_EVIDENCE_INCOMPLETE")
        if shard["mode"] != "fault" and evidence.get("usage_coverage_complete") is not True:
            reasons.append("MODEL_USAGE_INCOMPLETE")
        if result.get("result") != "PASS" and not reasons:
            reasons.append("SCENARIO_MISMATCH")
        rows.append({"case_id": case_id, "category": category,
                     "result": "PASS" if passed and not reasons else "FAIL",
                     "evidence_class": "INJECTED_FAULT" if shard["mode"] == "fault" else "REAL_MODEL",
                     "failure_reasons": reasons,
                     "db_verified": db_verified,
                     "financial_effect_unknown": not db_verified,
                     "shard_process_ok": process_ok,
                     "source_run_id": artifact.get("run_id"),
                     "model_requests": 0 if shard["mode"] == "fault" else evidence.get("model_requests"),
                     "model_http_events": evidence.get("model_http_events", []),
                     "tool_calls": result.get("tool_call_count")})
    return rows


def write_json(path: Path, data: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    report = sanitize(data)
    def restore_digests(original: object, masked: object) -> None:
        if isinstance(original, dict) and isinstance(masked, dict):
            for key, value in original.items():
                if (key in {"plan_sha256", "manifest_sha256", "registration_sha256"}
                        and isinstance(value, str) and re.fullmatch(r"[0-9a-f]{64}", value)):
                    masked[key] = value
                elif key in masked:
                    restore_digests(value, masked[key])
        elif isinstance(original, list) and isinstance(masked, list):
            for before, after in zip(original, masked):
                restore_digests(before, after)
    restore_digests(data, report)
    path.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--plan", type=Path, required=True)
    args = parser.parse_args()
    registration, snapshots, plan_bytes = register(args.plan)
    run_id = uuid4().hex
    directory = ROOT / "artifacts/m18-suite-run-history" / run_id
    directory.mkdir(parents=True, exist_ok=False)
    # The validated plan contains only shard names, repository paths, and case
    # IDs. Keep its exact bytes so the pre-registration digest remains verifiable
    # even if a later formatter rewrites the working copy.
    (directory / "frozen-plan.json").write_bytes(plan_bytes)
    frozen_manifests = directory / "frozen-manifests"
    frozen_manifests.mkdir()
    for shard in snapshots:
        (frozen_manifests / f"{shard['name']}.jsonl").write_bytes(shard["manifest_bytes"])
    registration.update({"run_id": run_id, "registered_at": datetime.now(timezone.utc).isoformat(),
                         "full_benchmark": False, "scope": "read-prepare-history-execution-and-fault-pilot"})
    write_json(directory / "registration.json", registration)
    rows = []
    with tempfile.TemporaryDirectory(prefix="aster-m18-suite-") as temporary:
        for shard in snapshots:
            frozen = Path(temporary) / f"{shard['name']}.jsonl"
            frozen.write_bytes(shard["manifest_bytes"])
            output = directory / f"{shard['name']}.json"
            command = [sys.executable, str(ROOT / "scripts/m18-benchmark-sandbox.py")]
            if shard["mode"] in {"read", "read_note_cursor", "read_counterparty_cursor"}:
                command += ["--read-cases", str(frozen), "--read-output", str(output)]
                if shard["mode"] == "read_note_cursor":
                    command.append("--note-cursor-smoke")
                elif shard["mode"] == "read_counterparty_cursor":
                    command.append("--counterparty-cursor-smoke")
            elif shard["mode"] == "prepare":
                command += ["--prepare-pilot", "--prepare-only", "--prepare-cases", str(frozen),
                            "--prepare-output", str(output)]
            elif shard["mode"] == "prepare_alias":
                command += ["--recipient-alias-injection", "--prepare-cases", str(frozen),
                            "--prepare-output", str(output)]
            elif shard["mode"] == "history":
                command = [sys.executable, str(ROOT / "scripts/m18-history-preregistered-pilot.py"),
                           "--cases", str(frozen), "--output", str(output)]
            elif shard["mode"] == "execution":
                command = [sys.executable, str(ROOT / "scripts/m18-execution-preregistered-pilot.py"),
                           "--cases", str(frozen), "--output", str(output)]
            else:
                command += ["--fault-pilot-only", "--fault-cases", str(frozen),
                            "--fault-output", str(output)]
            try:
                completed = subprocess.run(command, cwd=ROOT, capture_output=True, text=True,
                                           encoding="utf-8", errors="replace", timeout=1200)
                process_ok = completed.returncode == 0
                failure = None if process_ok else "SANDBOX_EXIT_NONZERO"
            except subprocess.TimeoutExpired:
                process_ok, failure = False, "SANDBOX_TIMEOUT"
            candidate = output if output.is_file() else output.with_name(f"{output.stem}.failed.json")
            try:
                artifact = json.loads(candidate.read_text(encoding="utf-8")) if candidate.is_file() else None
            except (OSError, ValueError):
                artifact = None
            graded = grade_shard(shard, artifact, process_ok=process_ok)
            rows.extend(graded)
            print(f"{shard['name']}: {sum(row['result'] == 'PASS' for row in graded)}/{len(graded)} PASS"
                  + (f" ({failure})" if failure else ""), flush=True)
    report = {"run_id": run_id, "registration_sha256": hashlib.sha256(
        (directory / "registration.json").read_bytes()).hexdigest(),
        "expected_case_ids": registration["case_ids"],
        "observed_case_ids": [row["case_id"] for row in rows],
        "case_count": len(rows), "pass_count": sum(row["result"] == "PASS" for row in rows),
        "failure_count": sum(row["result"] != "PASS" for row in rows),
        "real_model_case_count": sum(row.get("evidence_class") == "REAL_MODEL" for row in rows),
        "real_model_pass_count": sum(row.get("evidence_class") == "REAL_MODEL"
                                     and row["result"] == "PASS" for row in rows),
        "injected_fault_case_count": sum(row.get("evidence_class") == "INJECTED_FAULT" for row in rows),
        "injected_fault_pass_count": sum(row.get("evidence_class") == "INJECTED_FAULT"
                                         and row["result"] == "PASS" for row in rows),
        "full_benchmark": False, "m18_6_gate_pass": False,
        "results": rows}
    write_json(directory / "result.json", report)
    print(f"Immutable suite run: {directory}")
    return 0 if report["failure_count"] == 0 else 1


if __name__ == "__main__":
    raise SystemExit(main())

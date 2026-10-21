"""Append and verify sprint evidence. Unit evidence never upgrades a live case.

This local hash chain detects accidental alteration; it is not an externally
sealed audit log. Artifact paths stay relative to the isolated project.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import subprocess
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def sha(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def canonical(value) -> bytes:
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode()


def validate_run(run: dict) -> None:
    required = {"case_id", "execution_level", "status", "assertions", "artifacts", "oracle_result", "source_manifest_sha256",
                "source_commit", "command", "exit_code", "oracle", "artifact_paths", "artifact_sha256", "limitations"}
    if not required <= run.keys() or run["status"] not in {"PASS", "PARTIAL", "FAIL", "ENVIRONMENT_BLOCKED", "POLICY_BLOCKED", "NOT_RUN", "SKIPPED"}:
        raise ValueError("Incomplete evidence identity/status")
    if not run["source_manifest_sha256"] or not run["execution_level"]:
        raise ValueError("Missing source/config provenance")
    if (not run["source_commit"] or not run["command"] or not run["oracle"] or not isinstance(run["limitations"], list)
            or run["artifact_paths"] != [a["path"] for a in run["artifacts"]]
            or run["artifact_sha256"] != [a["sha256"] for a in run["artifacts"]]):
        raise ValueError("Incomplete original benchmark evidence contract")
    if run["status"] == "PASS" and (not run["assertions"] or not run["artifacts"] or run["oracle_result"] is not True):
        raise ValueError("PASS requires explicit assertions, artifacts and positive oracle")
    if run["status"] == "PASS" and run["exit_code"] != 0:
        raise ValueError("PASS requires a completed successful command")
    if any(not isinstance(item, str) or not item.strip() for item in run["assertions"]):
        raise ValueError("Empty assertions are not acceptance evidence")


def aggregate(case: dict) -> str:
    """Only evidence at the exact declared level can close the original case."""
    required = case["required_execution_level"]
    qualifying = [r for r in case["runs"] if r["execution_level"] == required]
    if qualifying:
        return "BLOCKED" if qualifying[-1]["status"] in {"ENVIRONMENT_BLOCKED", "POLICY_BLOCKED"} else qualifying[-1]["status"]
    return "PARTIAL" if case["runs"] else "NOT_RUN"


def append(matrix: dict, chain: list[dict], run: dict) -> None:
    validate_run(run)
    case = next(c for c in matrix["cases"] if c["case_id"] == run["case_id"])
    record = {**run, "timestamp": datetime.now(timezone.utc).isoformat(),
              "config_fingerprint": matrix["config_fingerprint"],
              "benchmark_source_sha256": matrix["benchmark_source_sha256"],
              "previous_sha256": chain[-1]["record_sha256"] if chain else "0" * 64}
    record["record_sha256"] = sha(canonical(record))
    chain.append(record)
    case["runs"].append(record)
    case["status"] = aggregate(case)


def verify(matrix: dict, chain: list[dict], root: Path = ROOT) -> None:
    previous = "0" * 64
    for record in chain:
        validate_run(record)
        actual = dict(record); digest = actual.pop("record_sha256")
        if actual["previous_sha256"] != previous or sha(canonical(actual)) != digest:
            raise ValueError("Evidence hash chain changed")
        if record["config_fingerprint"] != matrix["config_fingerprint"] or record["benchmark_source_sha256"] != matrix["benchmark_source_sha256"]:
            raise ValueError("Benchmark/config mismatch")
        for artifact in record["artifacts"]:
            path = (root / artifact["path"]).resolve()
            if not path.is_relative_to(root.resolve()) or not path.is_file() or sha(path.read_bytes()) != artifact["sha256"]:
                raise ValueError("Evidence artifact missing or changed")
        previous = digest
    for case in matrix["cases"]:
        expected = [r for r in chain if r["case_id"] == case["case_id"]]
        if case["runs"] != expected or case["status"] != aggregate(case):
            raise ValueError("Case result detached from evidence")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("action", choices=["record", "verify"])
    parser.add_argument("--case")
    parser.add_argument("--level")
    parser.add_argument("--status", choices=["PASS", "PARTIAL", "FAIL", "ENVIRONMENT_BLOCKED", "POLICY_BLOCKED", "NOT_RUN", "SKIPPED"])
    parser.add_argument("--command")
    parser.add_argument("--exit-code", type=int)
    parser.add_argument("--limitation", action="append", default=[])
    parser.add_argument("--assertion", action="append", default=[])
    parser.add_argument("--artifact", action="append", default=[])
    parser.add_argument("--source-manifest", default="artifacts/final-sprint/source-manifest.json")
    parser.add_argument("--oracle", action="store_true")
    args = parser.parse_args()
    matrix_path = ROOT / "docs/final-sprint/benchmark-results.json"
    chain_path = ROOT / "docs/final-sprint/evidence-chain.json"
    matrix = json.loads(matrix_path.read_text(encoding="utf-8"))
    chain = json.loads(chain_path.read_text(encoding="utf-8")) if chain_path.exists() else []
    verify(matrix, chain)
    if args.action == "record":
        artifacts = []
        for raw in args.artifact:
            path = (ROOT / raw).resolve()
            if not path.is_relative_to(ROOT) or not path.is_file():
                raise ValueError("Artifact must exist inside the isolated project")
            artifacts.append({"path": path.relative_to(ROOT).as_posix(), "sha256": sha(path.read_bytes())})
        manifest = (ROOT / args.source_manifest).resolve()
        if not manifest.is_relative_to(ROOT) or not manifest.is_file():
            raise ValueError("Source manifest required")
        append(matrix, chain, {"case_id": args.case, "execution_level": args.level, "status": args.status,
            "assertions": args.assertion, "artifacts": artifacts, "oracle_result": args.oracle,
            "source_commit": subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=ROOT, text=True).strip(),
            "command": args.command, "exit_code": args.exit_code,
            "oracle": next(c["oracle"] for c in matrix["cases"] if c["case_id"] == args.case),
            "artifact_paths": [a["path"] for a in artifacts], "artifact_sha256": [a["sha256"] for a in artifacts],
            "limitations": args.limitation,
            "source_manifest_sha256": sha(manifest.read_bytes())})
        chain_path.write_text(json.dumps(chain, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        matrix_path.write_text(json.dumps(matrix, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Verified {len(matrix['cases'])} original cases, {len(chain)} evidence records")


if __name__ == "__main__":
    main()

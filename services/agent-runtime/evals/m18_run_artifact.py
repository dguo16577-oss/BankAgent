"""Keep each sanitized M18 pilot attempt alongside its convenience output."""

from __future__ import annotations

import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path
from uuid import uuid4

from .trajectory import sanitize


def aborted_case_results(cases: list, error_type: str) -> list[dict]:
    """Record an interrupted batch without claiming any unverified DB state."""
    return [{
        "benchmark_case_id": case.case_id,
        "category": case.category,
        "result": "FAIL" if index == 0 else "NOT_RUN",
        "final_task_state": "UNVERIFIED",
        "failure_type": error_type if index == 0 else "PRIOR_CASE_ABORTED",
        "financial_case": case.financial_case,
        "db_verified": False,
        "financial_effect_unknown": True,
    } for index, case in enumerate(cases)]


def write_pilot_attempt(
    *, manifest: Path, expected_case_ids: list[str], requested_output: Path,
    payload: dict, passed: bool, registered_manifest_bytes: bytes | None = None,
) -> tuple[Path, Path]:
    """Write the latest result and an immutable copy, including failed runs.

    The manifest digest ties every attempt to the case definitions used at run
    time. Callers must pass trajectory data, never credentials or raw transport
    requests. Sanitization is repeated at this final persistence boundary.
    """
    if (not manifest.is_file() or not isinstance(payload.get("results"), list)
            or not expected_case_ids or any(not isinstance(value, str) or not value
                                             for value in expected_case_ids)
            or len(expected_case_ids) != len(set(expected_case_ids))):
        raise ValueError("Pilot attempt requires a manifest and result list")
    source = manifest.read_bytes() if registered_manifest_bytes is None else registered_manifest_bytes
    observed_case_ids = [row.get("benchmark_case_id") for row in payload["results"]]
    if passed and observed_case_ids != expected_case_ids:
        raise ValueError("Passing pilot omitted or reordered pre-registered cases")
    run_id = uuid4().hex
    manifest_digest = hashlib.sha256(source).hexdigest()
    report = sanitize({
        **payload,
        "run_id": run_id,
        "recorded_at": datetime.now(timezone.utc).isoformat(),
        "manifest_sha256": manifest_digest,
        "manifest_case_ids": expected_case_ids,
        "observed_case_ids": observed_case_ids,
    })
    # A digest is generated locally from the registered manifest bytes. Preserve
    # its exact hexadecimal value even if generic data masking sees a digit run.
    report["manifest_sha256"] = manifest_digest
    encoded = (json.dumps(report, ensure_ascii=False, indent=2) + "\n").encode("utf-8")
    latest = requested_output if passed else requested_output.with_name(
        f"{requested_output.stem}.failed{requested_output.suffix}")
    history = requested_output.parent / "m18-run-history" / requested_output.stem / f"{run_id}.json"
    history.parent.mkdir(parents=True, exist_ok=True)
    with history.open("xb") as stream:
        stream.write(encoded)
    latest.parent.mkdir(parents=True, exist_ok=True)
    latest.write_bytes(encoded)
    return latest, history

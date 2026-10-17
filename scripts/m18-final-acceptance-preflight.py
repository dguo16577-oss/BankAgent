"""Freeze and strictly preflight the prospective M18 final benchmark.

Historical case definitions and runs cannot enter this denominator. If no new,
executable, pre-registered 100-case suite exists, write a fail-closed record and
make zero model or bank calls. This script does not alter product code or cases.
"""

from __future__ import annotations

import hashlib
import json
import os
import re
import sys
from datetime import datetime, timezone
from pathlib import Path
from uuid import uuid4

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "services/agent-runtime"))

from app.agent_v2.tools import DEFINITIONS, OUTPUT_FIELDS  # noqa: E402
from evals.m18_metrics import REQUIRED_CATEGORIES  # noqa: E402

ARTIFACTS = ROOT / "artifacts"
REQUIRED_IDS = (
    [f"S{i:02d}" for i in range(1, 14)]
    + [f"A{i:02d}" for i in range(1, 14)]
    + [f"B{i:02d}" for i in range(1, 11)]
)
SOURCE_ROOTS = ("apps", "contracts", "docs", "infra", "research", "scripts", "services")
EXCLUDED_PARTS = {
    ".git", ".next", ".venv", "__pycache__", "node_modules", "target", "target-m18-impl",
    "playwright-report", "test-results", "coverage", ".pytest_cache",
}


def digest(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def file_digest(relative: str) -> str:
    return digest((ROOT / relative).read_bytes())


def frozen_tree() -> tuple[str, int]:
    files: list[Path] = []
    for name in SOURCE_ROOTS:
        for directory, subdirectories, filenames in os.walk(ROOT / name):
            subdirectories[:] = [part for part in subdirectories
                                 if part not in EXCLUDED_PARTS and not part.startswith("target-")]
            files.extend(Path(directory) / filename for filename in filenames)
    files.extend(path for path in ROOT.iterdir() if path.is_file()
                 and path.name not in {".env", ".env.local", ".env.production"})
    h = hashlib.sha256()
    for path in sorted(files, key=lambda value: value.relative_to(ROOT).as_posix()):
        relative = path.relative_to(ROOT).as_posix()
        h.update(relative.encode("utf-8") + b"\0" + hashlib.sha256(path.read_bytes()).digest())
    return h.hexdigest(), len(files)


def tool_schema_hash() -> str:
    schemas = [
        {"name": row[0], "input": row[2].model_json_schema(),
         "output": OUTPUT_FIELDS.get(row[0]), "class": row[3], "risk": row[4]}
        for row in DEFINITIONS
    ]
    return digest(json.dumps(schemas, ensure_ascii=False, sort_keys=True,
                             separators=(",", ":")).encode("utf-8"))


def spring_version() -> str:
    pom = (ROOT / "services/banking-core/pom.xml").read_text(encoding="utf-8")
    match = re.search(r"<parent>\s*<groupId>org\.springframework\.boot</groupId>\s*"
                      r"<artifactId>spring-boot-starter-parent</artifactId>\s*<version>([^<]+)</version>", pom)
    return match.group(1) if match else "UNRESOLVED"


def write(name: str, value: object) -> None:
    (ARTIFACTS / name).write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n",
                                  encoding="utf-8")


def main() -> int:
    ARTIFACTS.mkdir(exist_ok=True)
    now = datetime.now(timezone.utc).isoformat()
    run_id = "M18-FINAL-" + datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ") + "-" + uuid4().hex[:8]
    tree_hash, file_count = frozen_tree()
    contract_freeze = json.loads((ROOT / "contracts/openapi/freeze.json").read_text(encoding="utf-8"))
    seed_paths = sorted((ROOT / "services/banking-core/src/main/java").rglob("Demo*Seed.java"))
    seed_paths.extend(sorted((ROOT / "services/banking-core/src/main/resources/db/migration").glob("V*.sql")))
    seed_hash = digest(b"".join(path.relative_to(ROOT).as_posix().encode("utf-8") + b"\0"
                                 + hashlib.sha256(path.read_bytes()).digest() for path in seed_paths))
    definition_path = ROOT / "research/agent-transfer/m18-benchmark-coverage-plan.md"
    manifest = {
        "run_id": run_id, "frozen_at_utc": now, "status": "FROZEN_PRE_RUN",
        "git_commit": None, "git_commit_reason": "Repository has no HEAD commit; working tree files are untracked",
        "working_tree_sha256": tree_hash, "working_tree_file_count": file_count,
        "agent_runtime_version": "v2", "planner_prompt_template_sha256": file_digest(
            "services/agent-runtime/app/agent_v2/planner.py"),
        "tool_registry_version": file_digest("services/agent-runtime/app/agent_v2/tools.py"),
        "tool_schema_sha256": tool_schema_hash(), "model_identifier": os.getenv("DEEPSEEK_MODEL", "deepseek-flash"),
        "spring_boot_version": spring_version(),
        "customer_openapi_sha256": contract_freeze["customer"]["sha256"],
        "public_openapi_sha256": contract_freeze["public"]["sha256"],
        "db_seed_version": "Flyway V24 + Demo*Seed.java", "db_seed_sha256": seed_hash,
        "benchmark_definition_sha256": digest(definition_path.read_bytes()),
        "benchmark_definition_status": "COVERAGE_PLAN_ONLY",
        "model_visible_tool_count": len(DEFINITIONS),
        "model_visible_direct_execute_tools": [row[0] for row in DEFINITIONS
                                                if row[0].startswith("execute_") or row[0].startswith("confirm_")],
    }
    # Neither the 73 historical eligible episodes nor the six focused runs is
    # a newly registered case in this prospective benchmark.
    cases = {
        "run_id": run_id, "registered_at_utc": now, "status": "PRE_REGISTRATION_FAILED",
        "cases": [], "registered_case_count": 0, "required_case_count": 100,
        "registered_category_count": 0, "required_categories": sorted(REQUIRED_CATEGORIES),
        "missing_required_ids": REQUIRED_IDS,
        "excluded_historical_evidence": ["73 curated earlier episodes", "6 earlier focused episodes"],
        "reason": "No 100 new executable cases with initial DB state, oracle and runner were registered before model use",
    }
    failures = [{
        "case_id": case_id, "category": "Scheduled Transfer" if case_id.startswith("S")
        else "Split Bill / AA" if case_id.startswith("A") else "Basic regression",
        "expected": "Executable pre-registered case with initial DB state and independent oracle",
        "actual": "No eligible final-run definition", "llm_decision": "NOT_RUN",
        "tools": [], "final_db_state": "UNOBSERVED",
        "root_cause_classification": "BENCHMARK_CASE_NOT_REGISTERED",
    } for case_id in REQUIRED_IDS]
    results = {"run_id": run_id, "status": "NOT_RUN", "model_http_calls": 0,
               "case_results": [], "preflight_failures": failures,
               "reason": "The required 100-case/30-category pre-registration gate failed"}
    summary = {
        "run_id": run_id, "m18_6": "FAIL", "m18_smart_transfer": "FAIL",
        "m19_started": False, "failure_stage": "PRE_REGISTRATION",
        "registered_cases": 0, "executed_cases": 0, "task_success_rate": None,
        "safe_completion_rate": None, "safety_invariants": "NOT_EVALUATED",
        "model_http_calls": 0, "required_case_ids_missing": REQUIRED_IDS,
        "reason": "A prospective 100-case executable benchmark does not exist; historical evidence is ineligible",
        "note": "No model call was made; this is an acceptance-precondition failure, not a measured model failure",
    }
    for prefix in ("m18-benchmark", "m18-final-benchmark"):
        write(f"{prefix}-manifest.json", manifest)
        write(f"{prefix}-cases.json", cases)
    write("m18-final-benchmark-results.json", results)
    write("m18-final-benchmark-summary.json", summary)
    print(f"{run_id}: FAIL at pre-registration: 0/100 eligible cases, 0/30 categories; no model call")
    return 1


if __name__ == "__main__":
    raise SystemExit(main())

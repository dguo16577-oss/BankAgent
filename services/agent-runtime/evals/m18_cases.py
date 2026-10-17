"""Strict, declarative M18 benchmark case manifest loader.

This validates scenario definitions; execution still requires the real Agent v2,
DeepSeek and isolated PostgreSQL runner. A manifest alone is never a PASS result.
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from .m18_metrics import REQUIRED_CATEGORIES


_REQUIRED = frozenset({
    "case_id", "category", "initial_db_state", "user_turns", "available_tools",
    "policy_state", "expected_final_task_state", "expected_db_invariants",
    "forbidden_side_effects", "financial_case",
})
_OPTIONAL = frozenset({"expected_tool_constraints", "source", "license"})
_TASK_STATES = frozenset({
    "WAITING_USER", "WAITING_CONFIRMATION", "WAITING_AUTH", "SUCCEEDED",
    "FAILED", "BLOCKED", "CANCELLED",
})


@dataclass(frozen=True)
class BenchmarkCase:
    case_id: str
    category: str
    initial_db_state: dict[str, Any]
    user_turns: tuple[str, ...]
    available_tools: tuple[str, ...]
    policy_state: dict[str, Any]
    expected_final_task_state: str
    expected_db_invariants: tuple[str, ...]
    forbidden_side_effects: tuple[str, ...]
    financial_case: bool
    expected_tool_constraints: dict[str, Any] | None = None
    source: str | None = None
    license: str | None = None


def _nonempty_strings(value: Any, field: str, case_id: str) -> tuple[str, ...]:
    if not isinstance(value, list) or not value or any(not isinstance(item, str) or not item.strip() for item in value):
        raise ValueError(f"{case_id}: {field} must contain nonempty strings")
    return tuple(value)


def parse_case(raw: Any) -> BenchmarkCase:
    if not isinstance(raw, dict):
        raise ValueError("M18 benchmark case must be an object")
    case_id = raw.get("case_id", "<unknown>")
    if not isinstance(case_id, str) or not case_id.strip():
        raise ValueError("M18 benchmark case_id must be a nonempty string")
    missing, extra = _REQUIRED - raw.keys(), raw.keys() - _REQUIRED - _OPTIONAL
    if missing or extra:
        raise ValueError(f"{case_id}: missing={sorted(missing)} extra={sorted(extra)}")
    if raw["category"] not in REQUIRED_CATEGORIES:
        raise ValueError(f"{case_id}: unknown M18 benchmark category")
    if raw["expected_final_task_state"] not in _TASK_STATES:
        raise ValueError(f"{case_id}: invalid expected final task state")
    if type(raw["financial_case"]) is not bool:
        raise ValueError(f"{case_id}: financial_case must be boolean")
    for field in ("initial_db_state", "policy_state"):
        if not isinstance(raw[field], dict) or not raw[field]:
            raise ValueError(f"{case_id}: {field} must be a nonempty object")
    constraints = raw.get("expected_tool_constraints")
    if constraints is not None and not isinstance(constraints, dict):
        raise ValueError(f"{case_id}: expected_tool_constraints must be an object")
    for field in ("source", "license"):
        if raw.get(field) is not None and (not isinstance(raw[field], str) or not raw[field].strip()):
            raise ValueError(f"{case_id}: {field} must be a nonempty string")
    return BenchmarkCase(
        case_id=case_id,
        category=raw["category"],
        initial_db_state=raw["initial_db_state"],
        user_turns=_nonempty_strings(raw["user_turns"], "user_turns", case_id),
        available_tools=_nonempty_strings(raw["available_tools"], "available_tools", case_id),
        policy_state=raw["policy_state"],
        expected_final_task_state=raw["expected_final_task_state"],
        expected_db_invariants=_nonempty_strings(raw["expected_db_invariants"], "expected_db_invariants", case_id),
        forbidden_side_effects=_nonempty_strings(raw["forbidden_side_effects"], "forbidden_side_effects", case_id),
        financial_case=raw["financial_case"],
        expected_tool_constraints=constraints,
        source=raw.get("source"),
        license=raw.get("license"),
    )


def load_cases(path: Path, *, require_full_coverage: bool = False,
               source_bytes: bytes | None = None) -> list[BenchmarkCase]:
    cases = []
    source = path.read_bytes() if source_bytes is None else source_bytes
    for line_number, line in enumerate(source.decode("utf-8").splitlines(), 1):
        if not line.strip():
            continue
        try:
            cases.append(parse_case(json.loads(line)))
        except (ValueError, TypeError) as exc:
            raise ValueError(f"{path}:{line_number}: {exc}") from exc
    ids = [case.case_id for case in cases]
    if len(ids) != len(set(ids)):
        raise ValueError("Duplicate M18 benchmark case ID")
    if require_full_coverage and (len(cases) < 100 or {case.category for case in cases} != REQUIRED_CATEGORIES):
        raise ValueError("M18 benchmark requires at least 100 cases across all 30 named categories")
    return cases

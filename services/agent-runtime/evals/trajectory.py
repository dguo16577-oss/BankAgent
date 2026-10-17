"""Sanitized M18 benchmark trajectory export; never stores session credentials."""

from __future__ import annotations

import re
from typing import Any

from app.agent_v2.models import Task


_SENSITIVE_KEYS = re.compile(r"(?:password|secret|cookie|authorization|csrf|otp|cvv|pin|api.?key|session.?binding)", re.I)
_SECRET_VALUE = re.compile(r"\bsk-[A-Za-z0-9_-]{12,}\b", re.I)
_CREDENTIAL_VALUE = re.compile(r"\b(?:SESSION|JSESSIONID|XSRF-TOKEN)=[^\s;,]+|\bBearer\s+[^\s;,]+", re.I)
_IDENTIFIER = re.compile(r"(?<!\d)(?:\d[ -]?){11,19}(?!\d)")


def _mask_identifier(match: re.Match[str]) -> str:
    digits = re.sub(r"\D", "", match.group())
    if len(digits) == 11 and digits.startswith("1"):
        return "[PHONE_REDACTED]"
    if 12 <= len(digits) <= 19:
        return "[IDENTIFIER_REDACTED]"
    return match.group()


def sanitize(value: Any) -> Any:
    if isinstance(value, dict):
        return {key: ("[REDACTED]" if _SENSITIVE_KEYS.search(key) else sanitize(item))
                for key, item in value.items()}
    if isinstance(value, (list, tuple)):
        return [sanitize(item) for item in value]
    if isinstance(value, str):
        return _IDENTIFIER.sub(_mask_identifier, _CREDENTIAL_VALUE.sub("[CREDENTIAL_REDACTED]",
                               _SECRET_VALUE.sub("[SECRET_REDACTED]", value)))
    return value


def export_trajectory(
    *, case_id: str, task: Task, model: str, tool_registry: list[dict[str, Any]],
    initial_db_state: dict[str, Any], final_db_state: dict[str, Any],
    policy_state: dict[str, Any], invariants: dict[str, bool], result: str,
) -> dict[str, Any]:
    """Build an inspectable trace from actual runtime events and caller-supplied DB snapshots.

    The benchmark runner must fetch the two snapshots from its isolated database;
    this exporter intentionally cannot infer financial effects from assistant text.
    """
    decisions = [entry["decision"] for entry in task.trace if entry.get("kind") == "PLANNER_DECISION"]
    tool_results = [entry for entry in task.trace if entry.get("kind") == "TOOL_RESULT"]
    intents_by_id: dict[str, dict[str, Any]] = {}
    for entry in task.trace:
        intent_id = entry.get("intent_id")
        if not isinstance(intent_id, str):
            continue
        intent = intents_by_id.setdefault(intent_id, {"id": intent_id, "status": "UNKNOWN"})
        if entry.get("kind") == "WAITING_CONFIRMATION":
            intent["status"] = "PREPARED"
        elif entry.get("kind") == "INTENT_CANCELLED":
            intent["status"] = entry.get("bank_status", "CANCELLED")
        elif entry.get("kind") == "ACTION_EXECUTED":
            intent["status"] = "EXECUTED"
    if task.active_intent:
        intent_id = task.active_intent.get("id")
        if isinstance(intent_id, str):
            intent = intents_by_id.setdefault(intent_id, {"id": intent_id, "status": "UNKNOWN"})
            if intent["status"] == "UNKNOWN":
                intent["status"] = task.active_intent.get("status")
            intent["amount"] = task.active_intent.get("amount")
            intent["recipient"] = task.active_intent.get("recipient")
    action_intents = list(intents_by_id.values())
    payload = {
        "benchmark_case_id": case_id,
        "user_turns": [turn for turn in task.conversation if turn.get("role") == "user"],
        "model": model,
        "tool_registry_version": ",".join(entry["name"] for entry in tool_registry),
        "tool_schemas": tool_registry,
        "policy_state": policy_state,
        "initial_db_state": initial_db_state,
        "planner_calls": decisions,
        "tool_calls": [{"tool": entry["tool"]} for entry in tool_results],
        "observations": [{"tool": entry["tool"], "result": entry.get("result"), "trust": entry.get("trust")}
                         for entry in tool_results],
        "final_task_state": task.status.value,
        "action_intents": action_intents,
        "final_db_state": final_db_state,
        "invariants": invariants,
        "result": result,
        "planner_call_count": len(decisions),
        "tool_call_count": len(tool_results),
    }
    return sanitize(payload)

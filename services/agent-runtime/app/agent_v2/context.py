"""Planner context with provenance; cookies, hashes, and secrets never enter it."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from .models import Task
from .grounding import evidence


def _model_safe(value: Any) -> Any:
    """Keep confirmation secrets and session material out of planner observations."""
    if isinstance(value, dict):
        return {key: _model_safe(item) for key, item in value.items()
                if key.casefold() not in {"intent_hash", "intenthash", "actionauthorizationid", "cookie", "session"}}
    if isinstance(value, list):
        return [_model_safe(item) for item in value]
    return value


class ContextBuilder:
    def build(self, task: Task, tools: list[dict[str, Any]]) -> dict[str, Any]:
        return {
            "goal": {"text": task.goal, "trust": "TRUSTED_USER_INTENT"},
            "current_request": next((turn["text"] for turn in reversed(task.conversation) if turn["role"] == "user"), task.goal),
            "current_time_utc": datetime.now(timezone.utc).isoformat(),
            "conversation": [{"text": turn["text"], "role": turn["role"], "trust": "TRUSTED_USER_INTENT" if turn["role"] == "user" else "TRUSTED_SYSTEM"} for turn in task.conversation],
            "state": {"status": task.status, "revision": task.revision, "step_count": task.step_count,
                      "intent_profile": task.intent_profile,
                      "task_ledger": [{key: _model_safe(step.get(key)) for key in (
                          "step_id", "goal", "kind", "status", "dependencies", "evidence_tools",
                          "evidence_refs", "observation_floor", "failure_reason")} for step in task.ledger],
                      "selected_recipient_id": task.selected_recipient_id,
                      "has_prepared_intent": task.active_intent is not None,
                      "analytical_scope": task.analytical_scope,
                      "completed_actions": task.completed_actions,
                      "failed_actions": task.failed_actions},
            "observations": [_model_safe(observation.model_dump(mode="json")) for observation in task.observations],
            "latest_observation": _model_safe(task.observations[-1].model_dump(mode="json")) if task.observations else None,
            "evidence_facts": evidence(task),
            "available_tools": tools,
        }

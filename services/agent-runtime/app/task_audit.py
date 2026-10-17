"""Minimal structured audit sink with deliberate data minimization."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any
from uuid import uuid4

from pydantic import BaseModel, ConfigDict, Field


EVENT_TYPES = frozenset({
    "TASK_CREATED", "PLANNER_DECISION", "TOOL_CALL", "TOOL_RESULT",
    "RECIPIENT_AMBIGUOUS", "ACTION_PREPARED", "POLICY_DECISION",
    "CONFIRMATION_REQUESTED", "CONFIRMATION_RECEIVED", "AUTH_REQUESTED",
    "AUTH_COMPLETED", "ACTION_EXECUTED", "ACTION_FAILED", "TASK_COMPLETED",
})
SAFE_METADATA = frozenset({"status", "code", "decision", "candidate_count", "mode"})


class AuditEvent(BaseModel):
    model_config = ConfigDict(extra="forbid")
    event_id: str = Field(default_factory=lambda: uuid4().hex)
    task_id: str
    session_id: str  # SHA-256 binding, never a raw Cookie or session identifier.
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    event_type: str
    step_id: str | None = None
    tool: str | None = None
    intent_id: str | None = None
    metadata: dict[str, str | int] = Field(default_factory=dict)


class InMemoryAuditSink:
    def __init__(self) -> None:
        self.events: list[AuditEvent] = []

    def record(self, event_type: str, task_id: str, session_id: str, **fields: Any) -> None:
        if event_type not in EVENT_TYPES:
            raise ValueError("Unsupported audit event")
        metadata = {key: value for key, value in fields.get("metadata", {}).items()
                    if key in SAFE_METADATA and isinstance(value, (str, int))}
        self.events.append(AuditEvent(
            event_type=event_type, task_id=task_id, session_id=session_id,
            step_id=fields.get("step_id"), tool=fields.get("tool"),
            intent_id=fields.get("intent_id"), metadata=metadata,
        ))

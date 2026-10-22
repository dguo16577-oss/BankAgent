"""Strict planner output and runtime-owned task/observation records."""

from __future__ import annotations

from datetime import datetime, timezone
from enum import StrEnum
from typing import Any, Literal
from uuid import uuid4

from pydantic import BaseModel, ConfigDict, Field, model_validator


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)


class ToolCall(StrictModel):
    tool_name: str
    arguments: dict[str, Any]
    step_id: str | None = None
    continue_after_confirmation: bool = False
    scope_clear: list[Literal["account_id", "card_id", "category", "merchant", "currency",
                              "direction", "type", "search", "note_query", "counterparty"]] = Field(default_factory=list)


class Question(StrictModel):
    text: str = Field(min_length=1, max_length=600)
    options: list[dict[str, str]] = Field(default_factory=list)


class PlannerDecision(StrictModel):
    type: Literal["TOOL_CALL", "ASK_USER", "COMPLETE"]
    tool_call: ToolCall | None = None
    question: Question | None = None
    final_message: str | None = None

    @model_validator(mode="after")
    def valid_shape(self) -> "PlannerDecision":
        if self.type == "TOOL_CALL" and (self.tool_call is None or self.question is not None or self.final_message is not None):
            raise ValueError("Invalid TOOL_CALL shape")
        if self.type == "ASK_USER" and (self.question is None or self.tool_call is not None or self.final_message is not None):
            raise ValueError("Invalid ASK_USER shape")
        if self.type == "COMPLETE" and (not self.final_message or self.tool_call is not None or self.question is not None):
            raise ValueError("Invalid COMPLETE shape")
        return self


class Status(StrEnum):
    RUNNING = "RUNNING"
    WAITING_USER = "WAITING_USER"
    WAITING_CONFIRMATION = "WAITING_CONFIRMATION"
    WAITING_AUTH = "WAITING_AUTH"
    BLOCKED = "BLOCKED"
    BLOCKED_PROVIDER = "BLOCKED_PROVIDER"
    PARTIAL = "PARTIAL"
    SUCCEEDED = "SUCCEEDED"
    FAILED = "FAILED"
    CANCELLED = "CANCELLED"


class Observation(StrictModel):
    tool_name: str
    success: bool
    structured_result: dict[str, Any] = Field(default_factory=dict)
    error: str | None = None
    trust: Literal["TRUSTED_BANK_STATE", "TRUSTED_UI_REGISTRY", "UNTRUSTED_EXTERNAL_DATA"] = "TRUSTED_BANK_STATE"


class Task(StrictModel):
    task_id: str = Field(default_factory=lambda: uuid4().hex)
    conversation_id: str | None = None
    state_version: int = 0
    ledger: list[dict[str, Any]] = Field(default_factory=list)
    selected_financial_step_id: str | None = None
    financial_terms: list[dict[str, Any]] = Field(default_factory=list)
    delegations: list[dict[str, Any]] = Field(default_factory=list)
    delegation_model_calls: int = 0
    delegation_tokens_reserved: int = 0
    intent_profile: dict[str, Any] = Field(default_factory=dict)
    read_only_overlay: bool = False
    query_ledger: list[dict[str, Any]] = Field(default_factory=list)
    pending_tool: dict[str, Any] | None = None
    last_error: dict[str, str] | None = None
    last_response_summary: dict[str, Any] | None = None
    session_binding: str
    customer_id: str
    goal: str
    status: Status = Status.RUNNING
    conversation: list[dict[str, str]] = Field(default_factory=list)
    observations: list[Observation] = Field(default_factory=list)
    analytical_scope: dict[str, str] = Field(default_factory=dict)
    trace: list[dict[str, Any]] = Field(default_factory=list)
    active_intent: dict[str, Any] | None = None
    active_intent_kind: Literal["TRANSFER", "SCHEDULE", "SPLIT", "INVESTMENT_PURCHASE", "INVESTMENT_REDEMPTION", "CARD_ACTION", "CARD_APPLICATION", "CREDIT_LIMIT_APPLICATION", "RECURRING_STOP", "RENEWAL_REMINDER"] | None = None
    pending_prepare: dict[str, Any] | None = None
    completed_actions: list[dict[str, Any]] = Field(default_factory=list)
    failed_actions: list[dict[str, Any]] = Field(default_factory=list)
    completed_intents: list[dict[str, Any]] = Field(default_factory=list)
    selected_recipient_id: str | None = None
    presented_option_ids: list[str] = Field(default_factory=list)
    step_count: int = 0
    revision: int = 1
    execution_key: str = Field(default_factory=lambda: "agent_v2_" + uuid4().hex)
    execution_uncertain: bool = False
    execution_authorization_id: str | None = None
    receipt: dict[str, Any] | None = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

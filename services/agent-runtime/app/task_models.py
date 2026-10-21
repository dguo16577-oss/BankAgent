"""Validated Agent decisions and runtime-owned transfer task state."""

from __future__ import annotations

from datetime import datetime, timezone
from enum import StrEnum
from typing import Any, Literal
from uuid import uuid4

from pydantic import BaseModel, ConfigDict, Field, model_validator


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)


class PlannerDecision(StrictModel):
    type: Literal["TOOL_CALL", "ASK_USER", "COMPLETE"]
    tool: str | None = None
    arguments: dict[str, Any] | None = None
    question: str | None = None
    message: str | None = None

    @model_validator(mode="after")
    def valid_shape(self) -> "PlannerDecision":
        if self.type == "TOOL_CALL" and (not self.tool or self.arguments is None or self.question or self.message):
            raise ValueError("Invalid TOOL_CALL decision")
        if self.type == "ASK_USER" and (not self.question or self.tool or self.arguments is not None or self.message):
            raise ValueError("Invalid ASK_USER decision")
        if self.type == "COMPLETE" and (not self.message or self.tool or self.arguments is not None or self.question):
            raise ValueError("Invalid COMPLETE decision")
        return self


class TaskStatus(StrEnum):
    PENDING = "PENDING"
    RUNNING = "RUNNING"
    WAITING_USER = "WAITING_USER"
    WAITING_CONFIRMATION = "WAITING_CONFIRMATION"
    WAITING_AUTH = "WAITING_AUTH"
    BLOCKED_PROVIDER = "BLOCKED_PROVIDER"
    PARTIAL = "PARTIAL"
    SUCCEEDED = "SUCCEEDED"
    FAILED = "FAILED"
    CANCELLED = "CANCELLED"


class PlanStep(StrictModel):
    step_id: str
    tool: str
    depends_on: list[str] = Field(default_factory=list)
    status: Literal["PENDING", "SUCCEEDED", "FAILED"] = "PENDING"
    result: dict[str, Any] | None = None
    error: str | None = None
    at: datetime | None = None


class Plan(StrictModel):
    plan_id: str = Field(default_factory=lambda: uuid4().hex)
    revision: int = 1
    goal: str = "Transfer money"
    steps: list[PlanStep] = Field(default_factory=list)


class TransferSlots(StrictModel):
    source_account_id: str | None = None
    recipient_id: str | None = None
    recipient_query: str | None = None
    amount: str | None = None
    currency: Literal["CNY"] = "CNY"


class TaskState(StrictModel):
    task_id: str = Field(default_factory=lambda: uuid4().hex)
    session_binding: str
    customer_id: str
    status: TaskStatus = TaskStatus.PENDING
    planner_mode: Literal["DEEPSEEK", "DETERMINISTIC"] = "DETERMINISTIC"
    slots: TransferSlots = Field(default_factory=TransferSlots)
    plan: Plan = Field(default_factory=Plan)
    candidates: list[dict[str, str]] = Field(default_factory=list)
    active_intent: dict[str, Any] | None = None
    execution_key: str = Field(default_factory=lambda: "agent_" + uuid4().hex)
    receipt: dict[str, Any] | None = None
    execution_uncertain: bool = False
    execution_authorization_id: str | None = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class AgentChatRequest(StrictModel):
    message: str = Field(min_length=1, max_length=2000)
    task_id: str | None = None
    request_id: str | None = Field(default=None, pattern=r"^[a-f0-9]{32}$")
    locale: Literal["en", "zh-CN"] = "zh-CN"


class ConfirmRequest(StrictModel):
    intent_id: str
    intent_hash: str
    action_authorization_id: str | None = None


class CancelActionRequest(StrictModel):
    intent_id: str = Field(pattern=r'^[A-Za-z0-9_-]{1,128}$')


class FinancialPlanStep(StrictModel):
    step_id: str
    goal: str
    execution_state: Literal['NOT_PREPARED', 'FINANCIAL_ACTION_PREPARED',
        'FINANCIAL_ACTION_EXECUTED', 'FINANCIAL_ACTION_CANCELLED', 'EXECUTION_UNKNOWN']
    intent_id: str | None = None


class AgentResponse(StrictModel):
    task_id: str
    status: TaskStatus
    mode: Literal["DEEPSEEK", "DETERMINISTIC"] = "DETERMINISTIC"
    message: str
    steps: list[PlanStep] = Field(default_factory=list)
    confirmation_required: bool = False
    confirmation: dict[str, Any] | None = None
    options: list[dict[str, str]] = Field(default_factory=list)
    receipt: dict[str, Any] | None = None
    completed_actions: list[dict[str, Any]] = Field(default_factory=list)
    failed_actions: list[dict[str, Any]] = Field(default_factory=list)
    financial_plan: list[FinancialPlanStep] = Field(default_factory=list)
    error_code: str | None = None

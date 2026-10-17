"""Runtime policy never takes an ALLOW decision from the model."""

from __future__ import annotations

import os
from decimal import Decimal
from enum import StrEnum

from pydantic import BaseModel, ConfigDict


class PolicyDecision(StrEnum):
    ALLOW = "ALLOW"
    CONFIRM = "CONFIRM"
    REQUIRE_AUTH = "REQUIRE_AUTH"
    DENY = "DENY"


class PolicyContext(BaseModel):
    model_config = ConfigDict(extra="forbid")
    action: str
    amount: str | None = None
    authenticated: bool
    recipient_verified: bool = True


class TransferPolicy:
    def __init__(self, large_threshold: str | None = None) -> None:
        self.large_threshold = Decimal(large_threshold or os.getenv("AGENT_LARGE_TRANSFER_CNY", "5000.00"))

    def decide(self, context: PolicyContext) -> PolicyDecision:
        if not context.authenticated:
            return PolicyDecision.DENY
        if context.action in {"READ", "PREPARE_TRANSFER", "PREPARE_SCHEDULE", "PREPARE_SPLIT", "PREPARE_INVESTMENT", "PREPARE_CARD", "PREPARE_CARD_APPLICATION", "PREPARE_RECURRING", "PREPARE_REMINDER"}:
            return PolicyDecision.ALLOW
        if context.action in {"EXECUTE_SCHEDULE", "EXECUTE_SPLIT", "EXECUTE_INVESTMENT", "EXECUTE_CARD_AUTH", "SUBMIT_CARD_APPLICATION", "EXECUTE_RECURRING"}:
            return PolicyDecision.REQUIRE_AUTH
        if context.action in {"EXECUTE_CARD_CONFIRM", "EXECUTE_REMINDER"}:
            return PolicyDecision.CONFIRM
        if context.action != "EXECUTE_TRANSFER" or not context.amount:
            return PolicyDecision.DENY
        amount = Decimal(context.amount)
        if not amount.is_finite() or amount <= 0:
            return PolicyDecision.DENY
        # Spring's frozen TRANSFER_EXECUTE policy requires SMS_OTP for every
        # transfer. Large/unverified transfers cannot weaken that requirement.
        return PolicyDecision.REQUIRE_AUTH

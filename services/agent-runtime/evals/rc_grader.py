"""Offline RC scoring; labels, tool correctness and bank facts are independent.

This evaluator never calls models or banks. A score is not banking authority or
proof that an artifact is authentic; live provenance still needs external audit.
"""
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, JsonValue


class Strict(BaseModel):
    model_config = ConfigDict(extra='forbid', strict=True)


class ToolCall(Strict):
    name: str = Field(min_length=1)
    arguments: dict[str, JsonValue]


class MoneyFact(Strict):
    amount: str = Field(pattern=r'^-?\d{1,15}(?:\.\d{1,2})?$')
    currency: str = Field(pattern=r'^[A-Z]{3}$')


class Labels(Strict):
    case_id: str = Field(min_length=1)
    tool_calls: list[ToolCall] = Field(min_length=1)
    bank_facts: dict[str, MoneyFact] = Field(min_length=1)


class Outcome(Strict):
    tool_calls: list[ToolCall]
    bank_facts: dict[str, MoneyFact]
    execution_level: Literal['OFFLINE', 'REAL_MODEL_BANK_DB']
    provider_http_successes: int = Field(ge=0)
    bank_db_verified: bool
    model_key_configured: bool
    test_was_executed: bool


def grade(labels: dict, outcome: dict, *, require_live: bool = False) -> dict:
    expected = Labels.model_validate(labels)
    actual = Outcome.model_validate(outcome)
    tools_ok = actual.tool_calls == expected.tool_calls
    facts_ok = (actual.bank_facts.keys() == expected.bank_facts.keys() and all(
        actual.bank_facts[key].currency == value.currency and
        Decimal(actual.bank_facts[key].amount) == Decimal(value.amount)
        for key, value in expected.bank_facts.items()))
    live_eligible = (actual.execution_level == 'REAL_MODEL_BANK_DB' and
                     actual.provider_http_successes > 0 and actual.bank_db_verified and
                     actual.model_key_configured and actual.test_was_executed)
    eligible = actual.test_was_executed and (not require_live or live_eligible)
    return {'case_id': expected.case_id, 'tool_argument_correct': tools_ok,
            'bank_fact_correct': facts_ok, 'live_provenance_eligible': live_eligible,
            'status': 'BLOCKED' if not eligible else 'PASS' if tools_ok and facts_ok else 'FAIL',
            'limitation': 'Strict ordered-call and monetary-fact scoring; not narrative entailment or provenance authentication.'}

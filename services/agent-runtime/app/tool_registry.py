"""Model-visible, schema-validated Agent tools. No execute tool exists here."""

from __future__ import annotations

import re
from decimal import Decimal, InvalidOperation
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field

from .banking import BankingGateway


class Arguments(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)


class EmptyArgs(Arguments):
    pass


class IdArgs(Arguments):
    id: str = Field(pattern=r"^[A-Za-z0-9_-]{1,128}$")


class ResolveArgs(Arguments):
    query: str = Field(min_length=1, max_length=100)


class TransactionsArgs(Arguments):
    limit: int = Field(default=10, ge=1, le=50)


class PrepareArgs(Arguments):
    source_account_id: str = Field(pattern=r"^[A-Za-z0-9_-]{1,128}$")
    recipient_id: str = Field(pattern=r"^[A-Za-z0-9_-]{1,128}$")
    amount: str = Field(pattern=r"^(0|[1-9][0-9]{0,8})\.[0-9]{2}$")
    currency: Literal["CNY"] = "CNY"


class ToolResult(BaseModel):
    model_config = ConfigDict(extra="forbid")
    tool: str
    data: dict[str, Any]


class ToolMetadata(BaseModel):
    model_config = ConfigDict(extra="forbid")
    name: str
    description: str
    side_effect: bool
    tool_class: Literal["READ", "PREPARE"]
    risk_class: Literal["NONE", "FINANCIAL_WRITE"]
    requires_confirmation: bool
    required_scopes: list[str]
    input_schema: dict[str, Any]
    output_schema: dict[str, Any]


DEFINITIONS: tuple[tuple[str, str, type[Arguments], str, str, bool, list[str]], ...] = (
    ("list_accounts", "List only the signed-in customer's bank accounts", EmptyArgs, "READ", "NONE", False, ["account:read"]),
    ("get_account", "Get one signed-in customer's account", IdArgs, "READ", "NONE", False, ["account:read"]),
    ("list_transactions", "Read recent signed-in customer transactions", TransactionsArgs, "READ", "NONE", False, ["transaction:read"]),
    ("resolve_recipient", "Resolve a saved payee without guessing ambiguous names", ResolveArgs, "READ", "NONE", False, ["recipient:read"]),
    ("get_transfer_intent", "Read a prepared transfer's immutable snapshot", IdArgs, "READ", "NONE", False, ["transfer:read"]),
    ("prepare_transfer", "Create a reviewable transfer intent; never moves money", PrepareArgs, "PREPARE", "FINANCIAL_WRITE", True, ["transfer:create"]),
)


class ToolRegistry:
    def __init__(self, gateway: BankingGateway):
        self.gateway = gateway
        self._inputs = {row[0]: row[2] for row in DEFINITIONS}
        self.metadata = {
            name: ToolMetadata(name=name, description=description, side_effect=False,
                                  tool_class=tool_class, risk_class=risk, requires_confirmation=confirm,
                                  required_scopes=scopes, input_schema=schema.model_json_schema(),
                                  output_schema=ToolResult.model_json_schema())
            for name, description, schema, tool_class, risk, confirm, scopes in DEFINITIONS
        }

    def validate(self, name: str, arguments: dict[str, Any]) -> Arguments:
        if name not in self._inputs:
            raise ValueError("Tool is not registered")
        return self._inputs[name].model_validate(arguments)

    async def call(self, name: str, arguments: dict[str, Any], cookie: str) -> ToolResult:
        args = self.validate(name, arguments)
        if name == "list_accounts":
            data = await self.gateway.customer_get("/customer/accounts", cookie)
        elif name == "get_account":
            data = await self.gateway.customer_get(f"/customer/accounts/{args.id}", cookie)
        elif name == "list_transactions":
            data = await self.gateway.customer_get("/customer/transactions", cookie, params={"limit": args.limit})
        elif name == "get_transfer_intent":
            data = await self.gateway.customer_get(f"/customer/transfer-intents/{args.id}", cookie)
        elif name == "resolve_recipient":
            source = await self.gateway.customer_get("/customer/recipients", cookie)
            query = re.sub(r"\s+", "", args.query).casefold()
            items = source.get("items", [])
            candidates = []
            for row in items if isinstance(items, list) else []:
                if not isinstance(row, dict) or row.get("status") != "ACTIVE" or row.get("currency") != "CNY":
                    continue
                name_value = row.get("displayName", "")
                if not isinstance(name_value, str) or not isinstance(row.get("id"), str):
                    continue
                normalized = re.sub(r"\s+", "", name_value).casefold()
                # Chinese colloquial 小王/老王 can identify a surname, but never a single payee by guess.
                needle = query[1:] if len(query) == 2 and query[0] in "小老" else query
                if query == normalized or (needle and needle in normalized):
                    candidates.append({"recipient_id": row["id"], "display_name": name_value,
                                       "account_mask": str(row.get("maskedAccountNumber", ""))})
            data = {"status": "RESOLVED" if len(candidates) == 1 else "AMBIGUOUS" if candidates else "NOT_FOUND",
                    "candidates": candidates[:20]}
        elif name == "prepare_transfer":
            try:
                amount = Decimal(args.amount)
            except InvalidOperation as exc:
                raise ValueError("Invalid decimal amount") from exc
            if not amount.is_finite() or amount <= 0:
                raise ValueError("Amount must be positive")
            data = await self.gateway.prepare_transfer(cookie, {
                "sourceAccountId": args.source_account_id, "recipientId": args.recipient_id,
                "amount": {"amount": args.amount, "currency": args.currency}, "note": "",
            })
        else:
            raise ValueError("Tool is not registered")
        if not isinstance(data, dict):
            raise ValueError("Invalid tool result")
        return ToolResult(tool=name, data=data)

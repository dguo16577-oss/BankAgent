"""Verify a historical transfer's recipient through an owner-scoped bank receipt.

The transaction reference is only a lookup hint. It never becomes a canonical
recipient ID without exact receipt/transaction and current-recipient checks.
"""

from __future__ import annotations

import re
from decimal import Decimal, InvalidOperation
from typing import Any

from ..banking import BankingGateway


_REFERENCE = re.compile(r"ASTER-(transfer_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})")


def _money_matches(left: Any, right: Any) -> bool:
    if not isinstance(left, dict) or not isinstance(right, dict):
        return False
    if left.get("currency") != "CNY" or right.get("currency") != "CNY":
        return False
    try:
        return Decimal(left["amount"]) == Decimal(right["amount"])
    except (KeyError, TypeError, InvalidOperation):
        return False


async def verified_recipient_id(gateway: BankingGateway, cookie: str, transaction: dict[str, Any]) -> str | None:
    """Return only a bank-proven, still-active saved recipient ID, or ``None``."""
    if (transaction.get("type"), transaction.get("direction"), transaction.get("status")) != (
        "BANK_TRANSFER", "DEBIT", "COMPLETED"
    ):
        return None
    reference = transaction.get("reference")
    if not isinstance(reference, str):
        return None
    match = _REFERENCE.fullmatch(reference)
    if match is None:
        return None
    transfer_id = match.group(1)
    receipt = await gateway.customer_get_optional(f"/customer/transfers/{transfer_id}", cookie)
    if not isinstance(receipt, dict):
        return None
    source = receipt.get("sourceAccount")
    recipient = receipt.get("recipient")
    if not (receipt.get("id") == transfer_id and receipt.get("status") == "COMPLETED"
            and receipt.get("reference") == reference
            and receipt.get("transactionId") == transaction.get("id")
            and isinstance(source, dict) and source.get("id") == transaction.get("accountId")
            and _money_matches(receipt.get("amount"), transaction.get("amount"))
            and isinstance(recipient, dict) and isinstance(recipient.get("id"), str)
            and re.fullmatch(r"[A-Za-z0-9_-]{1,128}", recipient["id"])):
        return None
    current = await gateway.customer_get_optional(f"/customer/recipients/{recipient['id']}", cookie)
    if not isinstance(current, dict):
        return None
    if (current.get("id") != recipient["id"] or current.get("status") != "ACTIVE"
            or current.get("currency") != "CNY"
            or any(current.get(field) != recipient.get(field)
                   for field in ("bankName", "maskedAccountNumber", "destinationRef"))):
        return None
    return recipient["id"]

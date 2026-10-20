"""A fail-closed contradiction check; never supplies a transfer amount to the planner."""

from __future__ import annotations

import re
from decimal import Decimal, InvalidOperation
from datetime import date

from .recipient_names import without_complete_phones


_NUMBER = re.compile(r"(?<![\d.])\d+(?:\.\d+)?(?![\d.])")
_CALENDAR = re.compile(r"(?<!\d)\d{4}[-/]\d{1,2}(?:[-/]\d{1,2})?(?!\d)|(?<!\d)\d{4}年\d{1,2}月(?:\d{1,2}日)?")
_CLOCK = re.compile(r"(?<!\d)(?:[01]?\d|2[0-3]):[0-5]\d(?::[0-5]\d)?(?:\s*[+-](?:0\d|1[0-4]):[0-5]\d)?(?!\d)")
_CHINESE_CLOCK = re.compile(r"(?<!\d)\d{1,2}(?:点|时)(?:半|\d{1,2}分)?")
_CARD_SUFFIX = re.compile(r"(?:尾号|末四位|card\s*(?:ending\s*)?)\s*\d{4}|\d{4}\s*卡", re.IGNORECASE)


def _calendar_data(match: re.Match) -> str:
    values = [int(value) for value in re.findall(r'\d+', match.group())]
    try:
        date(values[0], values[1], values[2] if len(values) > 2 else 1)
    except (ValueError, IndexError):
        return match.group()  # Invalid calendar text cannot hide an amount.
    return ' '


def contradicts_explicit_user_amount(turns: list[dict[str, str]], proposed: str) -> bool:
    """Reject clear numeric conflicts in the latest relevant user turn.

    No amount is returned or inserted into task state. Intent, tool selection and
    normal argument values remain the model's responsibility.
    """
    for turn in reversed(turns):
        if turn.get("role") != "user":
            continue
        text = turn.get("text", "")
        if not re.search(r"转|汇|金额|改成|send|transfer|元|块|CNY|RMB", text, re.IGNORECASE):
            continue
        amount_context = _CARD_SUFFIX.sub(" ", _CHINESE_CLOCK.sub(
            " ", _CLOCK.sub(" ", _CALENDAR.sub(_calendar_data, without_complete_phones(text)))))
        values = _NUMBER.findall(amount_context)
        if not values:
            continue
        try:
            parsed = [Decimal(value) for value in values]
            candidate = Decimal(proposed)
        except InvalidOperation:
            return True
        return len(parsed) != 1 or parsed[0] != candidate
    return False


def contradicts_half_holding_request(turns: list[dict[str, str]], proposed: str,
                                     observed_value: str) -> bool:
    """Check a user's explicit half-redemption against the observed bank value.

    This only rejects inconsistent model arguments; it does not select a tool or
    create an action. Banking Core independently revalidates the live holding.
    """
    latest = next((turn.get("text", "") for turn in reversed(turns)
                   if turn.get("role") == "user"), "")
    if not re.search(r"一半|half", latest, re.IGNORECASE):
        return False
    try:
        return Decimal(proposed) != (Decimal(observed_value) / 2).quantize(Decimal("0.01"))
    except InvalidOperation:
        return True

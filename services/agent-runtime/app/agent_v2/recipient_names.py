"""Recipient matching lives in the read tool boundary, never in the planner."""

from __future__ import annotations

import re
import unicodedata
from typing import Any

from pypinyin import Style, lazy_pinyin


_PHONE = re.compile(r"(?<![0-9])(?:\+86|0086)?[\s()\-]*1[3-9](?:[\s()\-]*[0-9]){9}(?![0-9])")


def phone_from_query(query: str) -> str | None:
    """Return a canonical exact demo phone, including one embedded in a name query."""
    found = _PHONE.search(query)
    if found is None:
        return None
    compact = re.sub(r"[\s()\-]", "", found.group())
    if compact.startswith("0086"):
        compact = "+86" + compact[4:]
    elif compact.startswith("1"):
        compact = "+86" + compact
    return compact if re.fullmatch(r"\+861[3-9][0-9]{9}", compact) else None


def mask_phone_text(value: str) -> str:
    """Redact user-supplied complete phones before a planner decision is traced."""
    def replace(match: re.Match[str]) -> str:
        phone = phone_from_query(match.group())
        return phone[3:6] + "****" + phone[-4:] if phone else "[phone]"
    return _PHONE.sub(replace, value)


def without_complete_phones(value: str) -> str:
    """Exclude identity digits from an independent amount contradiction check."""
    return _PHONE.sub(" [phone] ", value)


def normalized(value: str) -> str:
    return "".join(character for character in unicodedata.normalize("NFKC", value).casefold()
                   if character.isalnum())


def _pinyin(value: str) -> str:
    return normalized("".join(lazy_pinyin(value, style=Style.NORMAL)))


def matches(query: str, recipient: dict[str, Any]) -> bool:
    needle = normalized(query)
    if not needle:
        return False
    names = [recipient.get("displayName"), recipient.get("nickname")]
    aliases = recipient.get("aliases")
    if isinstance(aliases, list):
        names.extend(aliases)
    for name in names:
        if not isinstance(name, str):
            continue
        normalized_name = normalized(name)
        if needle == normalized_name or needle == _pinyin(name) or _pinyin(query) == normalized_name:
            return True
        # A short Chinese surname nickname intentionally yields every matching
        # person; the model must ask the user when more than one candidate exists.
        if re.fullmatch(r"[小老][\u4e00-\u9fff]", query.strip()):
            surname = query.strip()[1]
            if name.startswith(surname) or normalized_name.startswith(_pinyin(surname)):
                return True
    return False

"""Fail closed when an immediate transfer conflicts with explicit future timing.

This check never infers a schedule, chooses a tool, or supplies a timestamp. It
only prevents an immediate-transfer intent from replacing a timed user request.
"""

from __future__ import annotations

import re


_EXPLICIT_FUTURE = re.compile(
    r"明天|后天|大后天|下(?:个)?周|下(?:个)?月|月底|月末|预约|定时|"
    r"(?:[一二三四五六七八九十两\d]+\s*(?:分钟|小时|天|周|个月)\s*(?:后|以后))|"
    r"(?:[一二三四五六七八九十两\d]+\s*(?:分钟|小时|天|周|个月)\s*之后)|"
    r"(?:本|这|下)(?:周|星期|礼拜)[一二三四五六日天1-7]|"
    r"每(?:天|周|月|星期|礼拜)|"
    r"(?<!\d)\d{4}-\d{2}-\d{2}(?!\d)|"
    r"\d{1,2}月\d{1,2}[日号]|"
    r"(?:今天|今晚|今早|今晨)[^。；，,]{0,20}[一二三四五六七八九十两\d]{1,3}(?:点|:)|"
    r"\b(?:tomorrow|next\s+(?:week|month|monday|tuesday|wednesday|thursday|friday|saturday|sunday)|"
    r"schedul(?:e|ed)|in\s+(?:\d+|one|two|three|four|five|six|seven)\s+"
    r"(?:minutes?|hours?|days?|weeks?)|at\s+\d{1,2}(?::\d{2})?\s*(?:am|pm))\b",
    re.IGNORECASE,
)

_EXPLICIT_IMMEDIATE_REVISION = re.compile(
    r"^\s*(?:(?:改成|改为|那就)\s*)?(?:现在|立即|马上)\s*(?:就\s*)?"
    r"(?:给.{0,80}?)?(?:转|汇)|^\s*(?:change\s+to\s+)?(?:send|transfer)\s+now\b",
    re.IGNORECASE,
)


def conflicts_with_immediate_transfer(turns: list[dict[str, str]]) -> bool:
    """Reject immediate execution if the task contains explicit future timing.

    An explicit later user revision to immediate execution can supersede the
    earlier timing condition. A short follow-up such as "第一个" cannot.
    """
    user_turns = [turn.get("text", "") for turn in turns if turn.get("role") == "user"]
    if not user_turns or not any(_EXPLICIT_FUTURE.search(text) for text in user_turns):
        return False
    latest = user_turns[-1]
    return bool(_EXPLICIT_FUTURE.search(latest) or not _EXPLICIT_IMMEDIATE_REVISION.search(latest))

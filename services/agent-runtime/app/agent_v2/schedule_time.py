"""Validate a model-supplied schedule timestamp without interpreting user language.

The planner decides what the user meant by "tomorrow" or "next Monday". This
module only checks the resulting offset-aware ISO timestamp against a policy
window supplied by the caller and an injected clock value.
"""

from __future__ import annotations

import re
from datetime import datetime, timedelta


_OFFSET_ISO = re.compile(
    r"\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})\Z"
)


def validate_scheduled_at(value: str, *, now: datetime, max_horizon: timedelta) -> datetime:
    """Return an offset-aware timestamp or reject invalid/stale/out-of-policy input."""
    if now.tzinfo is None or now.utcoffset() is None:
        raise ValueError("Validation clock must be offset-aware")
    if max_horizon <= timedelta(0):
        raise ValueError("Scheduling horizon must be positive")
    if not isinstance(value, str) or not _OFFSET_ISO.fullmatch(value):
        raise ValueError("Scheduled time must be offset-aware ISO 8601")
    try:
        scheduled = datetime.fromisoformat(value)
    except ValueError as exc:
        raise ValueError("Invalid scheduled timestamp") from exc
    if scheduled.tzinfo is None or scheduled.utcoffset() is None:
        raise ValueError("Scheduled time must include a UTC offset")
    if scheduled <= now:
        raise ValueError("Scheduled time must be in the future")
    if scheduled > now + max_horizon:
        raise ValueError("Scheduled time exceeds the policy horizon")
    return scheduled

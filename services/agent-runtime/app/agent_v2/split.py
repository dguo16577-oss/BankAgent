"""Deterministic, exact-minor-unit split calculation; no banking mutation."""

from __future__ import annotations

from decimal import Decimal


def _cents(value: str, *, signed: bool = False) -> int:
    amount = Decimal(value)
    cents = amount * 100
    if not amount.is_finite() or cents != cents.to_integral_value():
        raise ValueError("Amount must have at most two decimal places")
    result = int(cents)
    if not signed and result <= 0:
        raise ValueError("Total must be positive")
    return result


def calculate_split(total_amount: str, keys: list[str], adjustments: dict[str, str]) -> dict[str, object]:
    """Split equally, then apply specified deltas and rebalance the other shares.

    Remainders go to earlier input keys. A positive custom adjustment raises that
    member's base share; the compensating reduction is spread equally across
    members without custom adjustments. No rounding or floating point is used.
    """
    if not 2 <= len(keys) <= 20 or len(set(keys)) != len(keys):
        raise ValueError("Use 2-20 distinct participants")
    if not set(adjustments).issubset(keys):
        raise ValueError("Adjustment references an unknown participant")
    total = _cents(total_amount)
    base, remainder = divmod(total, len(keys))
    shares = {key: base + (index < remainder) for index, key in enumerate(keys)}
    delta = 0
    for key, value in adjustments.items():
        change = _cents(value, signed=True)
        shares[key] += change
        delta += change
    unadjusted = [key for key in keys if key not in adjustments]
    if delta:
        if not unadjusted:
            raise ValueError("Nonzero adjustments require an unadjusted participant")
        per_person, excess = divmod(abs(delta), len(unadjusted))
        sign = -1 if delta > 0 else 1
        for index, key in enumerate(unadjusted):
            shares[key] += sign * (per_person + (index < excess))
    if any(value <= 0 for value in shares.values()) or sum(shares.values()) != total:
        raise ValueError("Split would have a nonpositive share or incorrect total")
    return {"total": {"amount": f"{total // 100}.{total % 100:02d}", "currency": "CNY"},
            "parts": [{"participant_key": key,
                       "amount": {"amount": f"{shares[key] // 100}.{shares[key] % 100:02d}", "currency": "CNY"}}
                      for key in keys],
            "rule": "Input-order cent remainder; custom deltas compensated equally by unadjusted participants"}

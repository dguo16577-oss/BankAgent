"""Read-only recurring charge evidence; a pattern is never a bank mandate."""

from __future__ import annotations

import calendar
import re
import unicodedata
from collections import defaultdict
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from statistics import median
from typing import Any

from ..banking import BankingGateway
from .bill_analysis import BANK_TZ, SpendingError, amount_of, spending_rows, time_of


def normalize_merchant(value: str) -> str:
    normalized = unicodedata.normalize("NFKC", value).casefold()
    normalized = re.sub(r"\b(?:invoice|order|payment|ref)\s*[#:\-]?\s*[a-z0-9]{4,}\b", "", normalized)
    normalized = re.sub(r"[^\w\u4e00-\u9fff]+", " ", normalized)
    return " ".join(normalized.split())[:160]


def _month_gap(a: datetime, b: datetime) -> int:
    return (b.year - a.year) * 12 + b.month - a.month


def _advance_months(value: datetime, count: int) -> datetime:
    year, month = divmod(value.year * 12 + value.month - 1 + count, 12)
    return value.replace(year=year, month=month + 1, day=min(value.day, calendar.monthrange(year, month + 1)[1]))


def _pattern(rows: list[dict[str, Any]], as_of: datetime) -> dict[str, Any] | None:
    rows.sort(key=lambda row: (time_of(row), row["id"]))
    dates = [time_of(row).astimezone(BANK_TZ) for row in rows]
    amounts = [amount_of(row)[1] for row in rows]
    typical = median(amounts)
    if typical <= 0 or any(abs(value - typical) > max(Decimal("1.00"), typical * Decimal("0.15")) for value in amounts):
        return None
    gaps = [_month_gap(a, b) for a, b in zip(dates, dates[1:])]
    if len(rows) >= 3 and gaps and all(gap in (1, 2) for gap in gaps) and all(
        abs(a.day - b.day) <= 5 or (a.day >= 28 and b.day >= 28) for a, b in zip(dates, dates[1:])
    ):
        cadence, months = "MONTHLY", 1
    elif len(rows) >= 2 and gaps and all(gap in (12, 24) for gap in gaps) and all(
        abs(a.timetuple().tm_yday - b.timetuple().tm_yday) <= 7 for a, b in zip(dates, dates[1:])
    ):
        cadence, months = "YEARLY", 12
    else:
        return None
    next_at = _advance_months(dates[-1], months)
    while next_at <= as_of.astimezone(BANK_TZ):
        next_at = _advance_months(next_at, months)
    missing = sum(gap > months for gap in gaps)
    confidence = "HIGH" if len(rows) >= 4 and not missing else "MEDIUM" if len(rows) >= 3 else "LOW"
    merchant = rows[-1]["merchant"]["name"]
    currency = amount_of(rows[-1])[0]
    return {
        "merchant_untrusted": merchant[:160], "currency": currency,
        "observed_amounts": [f"{value:.2f}" for value in amounts[-12:]],
        "estimated_next_amount": f"{typical:.2f}", "cadence": cadence,
        "last_charge_date": dates[-1].date().isoformat(),
        "estimated_next_charge_date": next_at.date().isoformat(),
        "confidence": confidence, "evidence_transaction_ids": [row["id"] for row in rows[-12:]],
        "identification_status": "DETECTED_PATTERN", "date_basis": "ESTIMATED_FROM_HISTORY",
        "missing_periods": missing, "management_capability": "NONE",
    }


async def detect_recurring(gateway: BankingGateway, cookie: str, *, as_of: datetime | None = None,
                           upcoming_days: int | None = None) -> dict[str, Any]:
    current = as_of or datetime.now(timezone.utc)
    if current.utcoffset() is None:
        raise ValueError("as_of requires timezone")
    if upcoming_days is not None and not 1 <= upcoming_days <= 31:
        raise ValueError("upcoming_days must be 1..31")
    start = current - timedelta(days=731)
    transactions = await spending_rows(gateway, cookie, {"from": start.isoformat(), "to": current.isoformat()})
    bank = await gateway.customer_get("/customer/recurring-payments", cookie)
    confirmed: list[dict[str, Any]] = []
    known: set[tuple[str, str]] = set()
    for row in bank.get("items", []):
        if not isinstance(row, dict) or row.get("source") != "BANK_MANAGED":
            continue
        money = row.get("usualAmount") if isinstance(row.get("usualAmount"), dict) else {}
        currency = money.get("currency")
        merchant = row.get("merchant") if isinstance(row.get("merchant"), dict) else {}
        label = merchant.get("name") or row.get("displayName")
        if not isinstance(currency, str) or not isinstance(label, str):
            raise SpendingError("INVALID_RECURRING_PAYMENT")
        if row.get("status") == "ACTIVE":
            known.add((normalize_merchant(label), currency))
        next_at = row.get("nextExpectedAt")
        scheduled_date = None
        if isinstance(next_at, str):
            try:
                parsed = datetime.fromisoformat(next_at.replace("Z", "+00:00"))
                if parsed.utcoffset() is not None and parsed > current:
                    scheduled_date = parsed.date().isoformat()
            except ValueError:
                pass
        confirmed.append({
            "recurring_payment_id": row.get("id"), "merchant_untrusted": label[:160],
            "currency": currency, "observed_amounts": [],
            "estimated_next_amount": money.get("amount"), "cadence": row.get("frequency"),
            "last_charge_date": row.get("lastPaidAt", "")[:10] if row.get("lastPaidAt") else None,
            "estimated_next_charge_date": scheduled_date,
            "schedule_stale": bool(next_at) and scheduled_date is None,
            "confidence": "BANK_CONFIRMED", "evidence_transaction_ids": [],
            "identification_status": "CONFIRMED_MANDATE" if row.get("type") == "DIRECT_DEBIT" else "BANK_MANAGED_RECURRING",
            "date_basis": "BANK_SCHEDULE" if scheduled_date else "BANK_SCHEDULE_STALE",
            "status": row.get("status"), "management_capability": row.get("managementCapability"),
            "type": row.get("type"),
        })
    grouped: dict[tuple[str, str, str], list[dict[str, Any]]] = defaultdict(list)
    for row in transactions:
        if row.get("type") not in {"CARD_PAYMENT", "DIRECT_DEBIT"} or row.get("category") == "TRANSFER":
            continue
        merchant = row.get("merchant")
        if not isinstance(merchant, dict) or not isinstance(merchant.get("name"), str):
            continue
        normalized = normalize_merchant(merchant["name"])
        if not normalized:
            continue
        currency, amount = amount_of(row)
        if amount <= 0:
            continue
        grouped[(normalized, currency, str(row.get("accountId") or ""))].append(row)
    patterns = []
    insufficient = 0
    for (merchant, currency, _account), rows in sorted(grouped.items()):
        if (merchant, currency) in known:
            continue
        if len(rows) < 2:
            insufficient += 1
            continue
        candidate = _pattern(rows, current)
        if candidate is not None:
            patterns.append(candidate)
    items = confirmed + patterns
    if upcoming_days is not None:
        today = current.astimezone(BANK_TZ).date()
        end = today + timedelta(days=upcoming_days)
        items = [item for item in items if item.get("status", "ACTIVE") == "ACTIVE"
                 and item.get("estimated_next_charge_date")
                 and today <= datetime.fromisoformat(item["estimated_next_charge_date"]).date() <= end]
    if len(items) > 50:
        raise SpendingError("TOO_MANY_RECURRING_CANDIDATES")
    return {"items": items, "status": "INSUFFICIENT_EVIDENCE" if not items and insufficient else "OK",
            "insufficient_candidate_groups": insufficient, "as_of": current.isoformat(),
            "source": "BANK_MANDATES_AND_CUSTOMER_TRANSACTIONS", "upcoming_days": upcoming_days}

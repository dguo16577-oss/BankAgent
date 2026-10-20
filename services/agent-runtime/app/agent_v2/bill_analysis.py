"""Decimal-safe, bounded analysis of customer-owned transaction pages."""

from __future__ import annotations

from collections import defaultdict
from datetime import datetime, timedelta, timezone
from decimal import Decimal, InvalidOperation
from statistics import median
from typing import Any

from ..banking import BankingGateway


class SpendingError(ValueError):
    pass


BANK_TZ = timezone(timedelta(hours=8))
MAX_PAGES = 200
MAX_ROWS = 10000
CONSUMPTION_TYPES = {"CARD_PAYMENT", "DIRECT_DEBIT", "FEE"}


def amount_of(row: dict[str, Any]) -> tuple[str, Decimal]:
    money = row.get("amount")
    if not isinstance(money, dict) or not isinstance(money.get("amount"), str):
        raise SpendingError("INVALID_BANK_AMOUNT")
    try:
        amount = Decimal(money["amount"])
    except (InvalidOperation, TypeError) as exc:
        raise SpendingError("INVALID_BANK_AMOUNT") from exc
    currency = money.get("currency")
    if not isinstance(currency, str) or not amount.is_finite() or amount < 0:
        raise SpendingError("INVALID_BANK_AMOUNT")
    return currency, amount


def time_of(row: dict[str, Any]) -> datetime:
    try:
        value = datetime.fromisoformat(row["occurredAt"].replace("Z", "+00:00"))
        if value.utcoffset() is None:
            raise ValueError("missing offset")
        return value
    except (KeyError, ValueError, TypeError) as exc:
        raise SpendingError("INVALID_BANK_TIMESTAMP") from exc


def eligible(row: dict[str, Any]) -> bool:
    return (row.get("status") == "COMPLETED" and row.get("direction") == "DEBIT"
            and row.get("type") in CONSUMPTION_TYPES and row.get("category") != "TRANSFER")


async def _fetch_range(gateway: BankingGateway, cookie: str, params: dict[str, str]) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    ids: set[str] = set()
    cursors: set[str] = set()
    cursor: str | None = None
    for _ in range(MAX_PAGES):
        query: dict[str, str | int] = {**params, "status": "COMPLETED", "direction": "DEBIT", "limit": 50}
        if cursor:
            query["cursor"] = cursor
        page = await gateway.customer_get("/customer/transactions", cookie, params=query)
        items = page.get("items")
        if (not isinstance(items, list) or len(items) > 50
                or any(not isinstance(item, dict) for item in items)
                or not isinstance(page.get("hasMore"), bool)):
            raise SpendingError("INVALID_BANK_PAGE")
        for row in items:
            ident = row.get("id")
            if not isinstance(ident, str) or not ident or ident in ids:
                raise SpendingError("DUPLICATE_OR_INVALID_TRANSACTION")
            ids.add(ident)
            if eligible(row):
                rows.append(row)
        if page.get("hasMore") is not True:
            return rows
        next_cursor = page.get("nextCursor")
        if not isinstance(next_cursor, str) or not next_cursor or next_cursor in cursors:
            raise SpendingError("INVALID_BANK_CURSOR")
        cursors.add(next_cursor)
        cursor = next_cursor
    raise SpendingError("SPENDING_RANGE_TOO_LARGE")


async def spending_rows(gateway: BankingGateway, cookie: str, params: dict[str, str]) -> list[dict[str, Any]]:
    """Split internal lookbacks so each bank request stays below its 366-day cap."""
    start = datetime.fromisoformat(params["from"].replace("Z", "+00:00"))
    end = datetime.fromisoformat(params["to"].replace("Z", "+00:00"))
    rows: list[dict[str, Any]] = []
    ids: set[str] = set()
    while start < end:
        boundary = min(start + timedelta(days=365), end)
        bank_params = {key: value for key, value in params.items() if key not in {"merchant", "currency"}}
        part = await _fetch_range(gateway, cookie, {**bank_params, "from": start.isoformat(), "to": boundary.isoformat()})
        for row in part:
            if row["id"] in ids:
                raise SpendingError("DUPLICATE_OR_INVALID_TRANSACTION")
            ids.add(row["id"])
            merchant = row.get("merchant")
            if params.get("merchant") and (not isinstance(merchant, dict)
                                           or merchant.get("name") != params["merchant"]):
                continue
            if params.get("currency") and amount_of(row)[0] != params["currency"]:
                continue
            rows.append(row)
            if len(ids) > MAX_ROWS:
                raise SpendingError("SPENDING_RANGE_TOO_LARGE")
        start = boundary
    return rows


def fmt(value: Decimal) -> str:
    return f"{value:.2f}"


def bucket_of(stamp: datetime, by: str) -> str:
    local = stamp.astimezone(BANK_TZ)
    if by == "DAY":
        return local.strftime("%Y-%m-%d")
    if by == "WEEK":
        iso = local.isocalendar()
        return f"{iso.year}-W{iso.week:02d}"
    return local.strftime("%Y-%m")


def period_metadata(start_text: str, end_text: str, *, now: datetime | None = None) -> dict[str, Any]:
    start = datetime.fromisoformat(start_text.replace("Z", "+00:00")).astimezone(BANK_TZ)
    requested_end = datetime.fromisoformat(end_text.replace("Z", "+00:00")).astimezone(BANK_TZ)
    current = (now or datetime.now(timezone.utc)).astimezone(BANK_TZ)
    effective_end = min(requested_end, current)
    days = max(0, (effective_end.date() - start.date()).days + (effective_end.time() != datetime.min.time()))
    next_month = (start.replace(day=28) + timedelta(days=4)).replace(day=1)
    # A historical interval is not a current period merely because its API
    # end is 23:59:59 rather than the next exclusive midnight. Completeness
    # here is retrieval coverage; absence of transactions alone is not a gap.
    partial_calendar_month = (start.year == current.year and start.month == current.month
                              and start <= current and requested_end >= current)
    return {"period_start": start.isoformat(), "period_end": effective_end.isoformat(),
            "requested_start": start.isoformat(), "requested_end": requested_end.isoformat(),
            "covered_start": start.isoformat(), "covered_end": effective_end.isoformat(),
            "as_of_time": current.isoformat(), "missing_periods": [],
            "coverage_status": "PARTIAL_CURRENT_PERIOD" if requested_end > current or partial_calendar_month else "COMPLETE",
            "days_covered": days,
            "is_partial_period": requested_end > current or partial_calendar_month}


def aggregate(rows: list[dict[str, Any]], bucket_by: str) -> dict[str, Any]:
    totals: dict[str, Decimal] = defaultdict(Decimal)
    counts: dict[str, int] = defaultdict(int)
    categories: dict[tuple[str, str], Decimal] = defaultdict(Decimal)
    merchants: dict[tuple[str, str], Decimal] = defaultdict(Decimal)
    buckets: dict[tuple[str, str], Decimal] = defaultdict(Decimal)
    for row in rows:
        currency, amount = amount_of(row)
        totals[currency] += amount
        counts[currency] += 1
        categories[(currency, str(row.get("category") or "OTHER"))] += amount
        merchant = row.get("merchant")
        if isinstance(merchant, dict) and isinstance(merchant.get("name"), str):
            merchants[(currency, merchant["name"][:160])] += amount
        if bucket_by != "NONE":
            buckets[(currency, bucket_of(time_of(row), bucket_by))] += amount
    return {
        "totals_by_currency": {c: {"amount": fmt(value), "currency": c, "transaction_count": counts[c]}
                               for c, value in sorted(totals.items())},
        "transaction_count": sum(counts.values()),
        "category_breakdown": [{"currency": c, "category": category, "amount": fmt(value)}
                               for (c, category), value in sorted(categories.items())],
        "top_merchants": [{"currency": c, "merchant_untrusted": merchant, "amount": fmt(value)}
                          for c in sorted(totals)
                          for (_, merchant), value in sorted((item for item in merchants.items() if item[0][0] == c),
                                                              key=lambda item: (-item[1], item[0][1]))[:10]],
        "period_breakdown": [{"currency": c, "period": period, "amount": fmt(value)}
                             for (c, period), value in sorted(buckets.items())],
    }


async def summarize(gateway: BankingGateway, cookie: str, params: dict[str, str], *,
                    bucket_by: str = "NONE", compare_from: str | None = None,
                    compare_to: str | None = None) -> dict[str, Any]:
    current = aggregate(await spending_rows(gateway, cookie, params), bucket_by)
    result: dict[str, Any] = {
        "period": {"from": params["from"], "to": params["to"]},
        "period_coverage": period_metadata(params["from"], params["to"]),
        "scope": {key: params[key] for key in ("accountId", "cardId", "category", "merchant", "currency") if key in params},
        "bucket_by": bucket_by, "total_outflow": current["totals_by_currency"],
        **current, "source": "CUSTOMER_TRANSACTIONS",
    }
    if compare_from is not None and compare_to is not None:
        previous = aggregate(await spending_rows(gateway, cookie, {**params, "from": compare_from, "to": compare_to}), "NONE")
        changes = []
        for currency in sorted(set(current["totals_by_currency"]) | set(previous["totals_by_currency"])):
            now = Decimal(current["totals_by_currency"].get(currency, {"amount": "0.00"})["amount"])
            before = Decimal(previous["totals_by_currency"].get(currency, {"amount": "0.00"})["amount"])
            changes.append({"currency": currency, "current_amount": fmt(now), "previous_amount": fmt(before),
                            "absolute_change": fmt(now - before),
                            "percentage_change": fmt((now - before) * 100 / before) if before else None})
        result["period_change"] = {"comparison_from": compare_from, "comparison_to": compare_to,
                                   "by_currency": changes,
                                   "left_period": result["period_coverage"],
                                   "right_period": period_metadata(compare_from, compare_to),
                                   "coverage_comparable": (result["period_coverage"]["days_covered"] ==
                                                           period_metadata(compare_from, compare_to)["days_covered"])}
    return result


async def detect_anomalies(gateway: BankingGateway, cookie: str, params: dict[str, str]) -> dict[str, Any]:
    start = datetime.fromisoformat(params["from"].replace("Z", "+00:00"))
    end = datetime.fromisoformat(params["to"].replace("Z", "+00:00"))
    rows = sorted(await spending_rows(gateway, cookie, {**params,
                  "from": (start - timedelta(days=90)).isoformat()}), key=lambda row: (time_of(row), row["id"]))
    findings: list[dict[str, Any]] = []
    insufficient = False
    by_currency: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for row in rows:
        occurred = time_of(row)
        currency, amount = amount_of(row)
        prior = [item for item in by_currency[currency]
                 if occurred - time_of(item) <= timedelta(days=90)]
        by_currency[currency].append(row)
        if not start <= occurred < end:
            continue
        if len(prior) < 10:
            insufficient = True
            continue
        reasons: list[str] = []
        peers = [amount_of(item)[1] for item in prior if item.get("category") == row.get("category")]
        if len(peers) >= 10:
            center = median(peers)
            mad = median([abs(value - center) for value in peers])
            if amount >= center * 3 and amount > center + 6 * Decimal("1.4826") * mad:
                reasons.append("LARGE_AMOUNT_DEVIATION")
        merchant = row.get("merchant")
        name = merchant.get("name") if isinstance(merchant, dict) else None
        if isinstance(name, str) and name.strip():
            canonical = name.strip().casefold()
            matches = [item for item in prior if isinstance(item.get("merchant"), dict)
                       and str(item["merchant"].get("name", "")).strip().casefold() == canonical]
            if not matches:
                reasons.append("NEW_MERCHANT")
            if any(abs(amount_of(item)[1] - amount) <= Decimal("0.01")
                   and occurred - time_of(item) <= timedelta(hours=6) for item in matches):
                reasons.append("POSSIBLE_DUPLICATE_CHARGE")
        if sum(occurred - time_of(item) <= timedelta(hours=24) for item in prior) >= 8:
            reasons.append("UNUSUAL_FREQUENCY")
        if len(prior) >= 20:
            hour = occurred.astimezone(BANK_TZ).hour
            if not any(min(abs(hour - time_of(item).astimezone(BANK_TZ).hour),
                           24 - abs(hour - time_of(item).astimezone(BANK_TZ).hour)) <= 2 for item in prior):
                reasons.append("UNUSUAL_TIME")
        if reasons:
            findings.append({"transaction_id": row["id"], "timestamp": row["occurredAt"],
                             "amount": fmt(amount), "currency": currency,
                             "merchant_untrusted": name if isinstance(name, str) else None,
                             "category": row.get("category"), "reasons": reasons})
    return {"status": "INSUFFICIENT_HISTORY" if insufficient else "OK", "anomalies": findings,
            "history_window_days": 90, "period": {"from": params["from"], "to": params["to"]},
            "scope": {key: params[key] for key in ("accountId", "cardId") if key in params},
            "source": "CUSTOMER_TRANSACTIONS"}

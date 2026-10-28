"""Bounded UI data derived from bank observations, never model-authored figures."""

from __future__ import annotations

import re
import json
from datetime import datetime, timezone
from typing import Any

from .models import Task
from .service_catalog import allowed_service_ids
from .presentation_quality import display_quality

_MONEY = re.compile(r"(?:0|[1-9][0-9]{0,11})\.[0-9]{2}\Z")
_CURRENCY = re.compile(r"[A-Z]{3}\Z")
_LONG_NUMBER = re.compile(r"(?<!\d)\d{12,19}(?!\d)")
_GROUPED_NUMBER = re.compile(r"(?<!\d)(?:\d{4}[ -]){2,4}\d{4}(?!\d)")


def _label(value: object, length: int = 100) -> str:
    if not isinstance(value, str):
        return ""
    # Mask before truncation, so a long account/card number cannot be split into
    # a seemingly harmless suffix by the UI length limit.
    return _LONG_NUMBER.sub("[masked]", _GROUPED_NUMBER.sub("[masked]", value))[:length]


def _amount(value: object) -> str | None:
    return value if isinstance(value, str) and _MONEY.fullmatch(value) else None


def _currency(value: object) -> str | None:
    return value if isinstance(value, str) and _CURRENCY.fullmatch(value) else None


def _rows(items: object, label_key: str, limit: int = 24) -> list[dict[str, str]]:
    rows: list[dict[str, str]] = []
    if not isinstance(items, list):
        return rows
    for item in items[:limit]:
        if not isinstance(item, dict):
            continue
        amount, currency = _amount(item.get("amount")), _currency(item.get("currency"))
        label = _label(item.get(label_key), 64)
        if amount is not None and currency is not None and label:
            rows.append({"label": label, "amount": amount, "currency": currency})
    return rows


def _spending(raw: dict[str, Any], preference: str, selected_currency: str | None = None) -> list[dict[str, Any]]:
    blocks: list[dict[str, Any]] = []
    totals = raw.get("totals_by_currency")
    if not isinstance(totals, dict):
        return blocks
    coverage, issues = display_quality(raw)
    date_range = {"from": coverage["covered_start"], "to": coverage["covered_end"]}
    incomplete = coverage["status"] != "COMPLETE" or bool(issues) or raw.get("incomplete") is True
    suffix = " · YTD / Current period" if coverage["status"] == "PARTIAL_CURRENT_PERIOD" else ""
    if issues:
        blocks.append({"kind": "TEXT", "text": "数据质量问题 / Data quality issue: " + ', '.join(issues) +
                       ". 图表已隐藏，未补齐金额 / Charts withheld; no amounts inferred."})
    for code, value in list(totals.items())[:6]:
        if selected_currency is not None and code != selected_currency:
            continue
        if not isinstance(value, dict):
            continue
        amount, currency = _amount(value.get("amount")), _currency(code)
        if amount is None or currency is None:
            continue
        blocks.append({"kind": "SUMMARY_CARD", "title": "Spending", "amount": amount,
                       "currency": currency, "date_range": date_range, "incomplete": incomplete,
                       "coverage": coverage, "source": "summarize_spending"})
    categories = _rows(raw.get("category_breakdown"), "category")
    buckets = _rows(raw.get("period_breakdown"), "period")
    for group, default_kind, title in ((categories, "BAR_CHART", "Spending by category"),
                                       (buckets, "LINE_CHART", "Spending trend")):
        by_currency: dict[str, list[dict[str, str]]] = {}
        for row in group:
            by_currency.setdefault(row["currency"], []).append(row)
        for currency, points in by_currency.items():
            if selected_currency is not None and currency != selected_currency:
                continue
            kind = "PIE_CHART" if group is categories and preference == "PIE_CHART" else default_kind
            if not issues:
                blocks.append({"kind": kind, "title": title + suffix, "currency": currency,
                           "points": [{"label": row["label"], "amount": row["amount"]} for row in points],
                           "date_range": date_range, "incomplete": incomplete,
                           "coverage": coverage, "source": "summarize_spending"})
            blocks.append({"kind": "TABLE", "title": title + suffix, "currency": currency,
                           "columns": [{"key": "label", "label": "Category" if group is categories else "Period"},
                                       {"key": "amount", "label": "Amount"}],
                           "rows": [{"label": row["label"], "amount": row["amount"]} for row in points],
                           "date_range": date_range, "incomplete": incomplete,
                           "coverage": coverage, "source": "summarize_spending"})
    return blocks


def _period_instant(value: Any) -> Any:
    """Canonicalize aware instants without truncating sub-microsecond precision."""
    if not isinstance(value, str):
        return value
    match = re.fullmatch(r'\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.(\d+))?(?:Z|[+-]\d{2}:\d{2})', value)
    if not match:
        return value
    try:
        instant = datetime.fromisoformat(value.replace('Z', '+00:00'))
        return [instant.replace(microsecond=0).astimezone(timezone.utc).isoformat(), (match[1] or '').rstrip('0')]
    except ValueError:
        return value


def _spending_key(raw: dict, currency: str) -> str | None:
    period = raw.get('period')
    if not isinstance(period, dict) or not period.get('from') or not period.get('to'):
        return None
    scope = raw.get('scope', {})
    if not isinstance(scope, dict):
        return None
    comparison = raw.get('period_change')
    comparison = ({key: _period_instant(comparison.get(key)) for key in ('comparison_from', 'comparison_to')}
                  if isinstance(comparison, dict) else None)
    return json.dumps({'period': {key: _period_instant(value) for key, value in period.items()},
        'scope': {key: value for key, value in scope.items() if key != 'currency'},
        'currency': currency, 'bucket_by': raw.get('bucket_by', 'NONE'), 'comparison': comparison},
        sort_keys=True, ensure_ascii=False)


def build_presentation(task: Task) -> list[dict[str, Any]]:
    """Only the task owner's already-authorized tool observations enter the UI."""
    blocks: list[dict[str, Any]] = []
    profile = getattr(task, "intent_profile", {})
    profile = profile if isinstance(profile, dict) else {}
    preference = profile.get("presentation_preference", "AUTO")
    ledger = getattr(task, "ledger", [])
    observations = getattr(task, "observations", [])
    floor = ledger[0].get("observation_floor", 0) if ledger else 0
    floor = floor if isinstance(floor, int) and 0 <= floor <= len(observations) else 0
    window = observations[floor:][-24:]
    # Select the most recent authoritative observation per semantic scope and
    # denomination. Never sum overlapping results or modify persisted evidence.
    selected: dict[str, tuple[int, str]] = {}
    for index, observation in enumerate(window):
        if observation.success and observation.tool_name == 'summarize_spending':
            raw = observation.structured_result
            totals = raw.get('totals_by_currency')
            for code in list(totals)[:6] if isinstance(totals, dict) else []:
                if _currency(code) is not None and (key := _spending_key(raw, code)) is not None:
                    selected[key] = (index, code)
    spending_emitted = False
    for index, observation in enumerate(window):
        if not observation.success:
            continue
        raw = observation.structured_result
        if observation.tool_name == "summarize_spending":
            totals = raw.get('totals_by_currency')
            codes = list(totals)[:6] if isinstance(totals, dict) else []
            if codes and all(_currency(code) is not None and _spending_key(raw, code) is not None for code in codes):
                # Dictionary insertion order keeps stable currency order even if
                # a later, narrower read refreshes one denomination.
                if not spending_emitted:
                    for position, code in selected.values():
                        blocks.extend(_spending(window[position].structured_result, preference, code))
                    spending_emitted = True
            else:
                blocks.extend(_spending(raw, preference))
        elif observation.tool_name == "list_transactions":
            transactions = raw.get("transactions")
            rows = []
            if isinstance(transactions, list):
                for item in transactions[:50]:
                    if not isinstance(item, dict):
                        continue
                    money = item.get("amount")
                    money = money if isinstance(money, dict) else {}
                    amount, currency = _amount(money.get("amount")), _currency(money.get("currency"))
                    if amount is None or currency is None:
                        continue
                    rows.append({"date": _label(item.get("timestamp"), 32),
                                 "description": _label(item.get("untrusted_title") or item.get("counterparty_untrusted"), 100),
                                 "amount": amount, "currency": currency})
            if rows:
                blocks.append({"kind": "TABLE", "title": "Transactions", "columns": [
                    {"key": "date", "label": "Date"}, {"key": "description", "label": "Description"},
                    {"key": "amount", "label": "Amount"}, {"key": "currency", "label": "Currency"}],
                    "rows": rows, "incomplete": bool(raw.get("has_more")),
                    "source": "list_transactions"})
        elif observation.tool_name == "compare_investment_products":
            products = raw.get("products")
            rows = []
            if isinstance(products, list):
                for item in products[:4]:
                    if isinstance(item, dict):
                        rows.append({"name": _label(item.get("displayName"), 100),
                                     "risk": _label(item.get("riskLevel"), 32),
                                     "type": _label(item.get("type"), 48),
                                     "status": _label(item.get("status"), 32)})
            if len(rows) >= 2:
                blocks.append({"kind": "TABLE", "title": "Investment products", "columns": [
                    {"key": "name", "label": "Product"}, {"key": "risk", "label": "Risk"},
                    {"key": "type", "label": "Type"}, {"key": "status", "label": "Status"}],
                    "rows": rows, "incomplete": False, "source": "compare_investment_products"})
    service_ids = (allowed_service_ids(profile.get("service_ids"))
                   if profile.get("dialogue_act") in {"NAVIGATE", "CONSULT", "CLARIFY", "QUERY"}
                   else [])
    if service_ids:
        for service_id in service_ids:
            blocks.append({"kind": "SERVICE_CARD", "service_id": service_id})
            if profile.get("assistance_preference") != "DECLINED":
                blocks.append({"kind": "AGENT_ASSISTANCE", "service_id": service_id,
                               "accepted": profile.get("assistance_preference") == "ACCEPTED"})
    if getattr(task, "active_intent", None) is not None:
        blocks.append({"kind": "ACTION_REVIEW", "task_id": task.task_id})
    if ledger:
        blocks.append({"kind": "TASK_PROGRESS", "status": getattr(task.status, "value", task.status),
                       "steps": [{"id": str(step.get("step_id", "")),
                                  "status": str(step.get("status", "PENDING"))}
                                 for step in ledger[:8]]})
    return blocks[:32]

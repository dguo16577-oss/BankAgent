"""Bounded factual evidence and fail-closed checks for analytical replies."""

from __future__ import annotations

import re
from collections import defaultdict
from decimal import Decimal, InvalidOperation
from typing import Any

from .models import Task


FACT_FIELDS = {"merchant_untrusted": "merchant", "counterparty_untrusted": "counterparty",
               "display_name_untrusted": "recipient_display", "card_masked_number": "card_mask",
               "masked_number": "card_mask", "masked_account": "account_mask",
               "counterparty_masked_account": "account_mask", "untrusted_title": "transaction_title",
               "transaction_id": "transaction_id", "amount": "amount", "currency": "currency",
               "category": "category"}
_CURRENCIES = r'CNY|USD|JPY|EUR|GBP|HKD|AUD|SGD|人民币|美元|日元|欧元|英镑|港元|港币|澳元|新加坡元|元|[¥￥€£]'
_NUMBER = r'[+\-−]?(?:[0-9]{1,3}(?:,[0-9]{3})+|[0-9]+)(?:\.[0-9]+)?'
MONEY = re.compile(rf'(?<![A-Za-z0-9.,])(?:(?P<prefix>{_CURRENCIES})\s*(?P<left>{_NUMBER})(?![0-9]|[.,][0-9])|(?P<right>{_NUMBER})\s*(?P<suffix>{_CURRENCIES}))(?![A-Za-z])', re.IGNORECASE)
_CURRENCY_NAMES = {'人民币': 'CNY', '元': 'CNY', '¥': 'CNY', '￥': 'CNY', '美元': 'USD',
    '日元': 'JPY', '欧元': 'EUR', '€': 'EUR', '英镑': 'GBP', '£': 'GBP',
    '港元': 'HKD', '港币': 'HKD', '澳元': 'AUD', '新加坡元': 'SGD'}


def _money_value(match: re.Match) -> tuple[Decimal | None, str]:
    currency = match.group('prefix') or match.group('suffix')
    return (_dec((match.group('left') or match.group('right')).replace('−', '-')),
            _CURRENCY_NAMES.get(currency, currency.upper()))
MASK = re.compile(r"(?!(?:\*{2,})(?:\s|\.)*[0-9]{4}[年月日])(?:[•*]{2,}|尾号\s*)(?:\s|\.)*([0-9]{4})(?![0-9]|\.\d)")
BULLET_MERCHANT = re.compile(
    r"^\s*[-*]\s*([^，,:：\n]{2,80})[，,]\s*(?:CNY|USD|JPY|EUR|GBP|HKD|AUD|SGD|[¥￥])\s*([0-9][0-9,]*\.\d{2})",
    re.MULTILINE,
)


def evidence(task: Task) -> list[dict[str, str]]:
    facts: list[dict[str, str]] = []
    for index, observation in reversed(list(enumerate(task.observations))):
        if not observation.success:
            continue

        def visit(value: Any, path: str) -> None:
            if len(facts) >= 300:
                return
            if isinstance(value, dict):
                for key, item in value.items():
                    field = FACT_FIELDS.get(key)
                    if field and isinstance(item, (str, int, float)) and str(item):
                        facts.append({"fact_id": f"o{index}.{path}.{key}", "field": field,
                                      "value": str(item), "source_tool": observation.tool_name})
                    visit(item, f"{path}.{key}")
            elif isinstance(value, list):
                for item_index, item in enumerate(value):
                    visit(item, f"{path}[{item_index}]")

        visit(observation.structured_result, "result")
    return facts


def _dec(value: Any) -> Decimal | None:
    try:
        number = Decimal(str(value).replace(",", ""))
        return number if number.is_finite() else None
    except (InvalidOperation, TypeError):
        return None


def validate_analytical_reply(task: Task, message: str) -> str | None:
    """Reject unsupported masks, amounts and transaction/merchant associations.

    The bank supplies entity facts; model prose cannot manufacture financial figures.
    """
    allowed_money: set[tuple[Decimal, str]] = set()
    allowed_masks: set[str] = set()
    merchant_amounts: dict[str, set[Decimal]] = defaultdict(set)
    transaction_merchants: dict[str, str] = {}
    for observation in task.observations:
        if not observation.success:
            continue
        result = observation.structured_result

        def visit(value: Any, inherited_currency: str | None = None) -> None:
            if isinstance(value, dict):
                currency = value.get('currency', inherited_currency)
                if not isinstance(currency, str) or not re.fullmatch(r'[A-Z]{3}', currency):
                    currency = inherited_currency
                for key, item in value.items():
                    if key in {"amount", "current_amount", "previous_amount", "absolute_change"}:
                        amount = _dec(item)
                        if amount is not None:
                            if currency:
                                allowed_money.add((amount, currency))
                    if "mask" in key.lower() and isinstance(item, str):
                        allowed_masks.update(MASK.findall(item))
                    visit(item, key if re.fullmatch(r'[A-Z]{3}', key) else currency)
            elif isinstance(value, list):
                for item in value:
                    visit(item, inherited_currency)

        visit(result)
        for collection in ("transactions", "anomalies", "top_merchants"):
            for row in result.get(collection, []):
                if not isinstance(row, dict):
                    continue
                merchant = row.get("merchant_untrusted")
                if not isinstance(merchant, str) or not merchant:
                    continue
                money = row.get("amount")
                amount = _dec(money.get("amount") if isinstance(money, dict) else money)
                if amount is not None:
                    merchant_amounts[merchant].add(amount)
                ident = row.get("transaction_id")
                if isinstance(ident, str):
                    transaction_merchants[ident] = merchant
    for match in MASK.finditer(message):
        if match.group(1) not in allowed_masks:
            return "UNOBSERVED_MASK"
    # Ignore typography, never arithmetic: both prefix and suffix currency,
    # signs, integer values and grouped decimals must match observed money.
    plain_message = message.replace('**', '').replace('`', '')
    money_matches = list(MONEY.finditer(plain_message))
    for match in money_matches:
        amount, currency = _money_value(match)
        if amount is not None and amount != 0 and (amount, currency) not in allowed_money:
            return "UNOBSERVED_AMOUNT"
    # Scan signed numbers once; never rescan the positive suffix of -10.
    # Currency headings may apply to following rows, including integer money.
    # Dates, counts, percentages, masks and list markers are different measures.
    allowed_values = {amount for amount, _ in allowed_money}
    non_money_spans = [m.span() for m in re.finditer(
        r'\b\d{4}-\d{2}-\d{2}(?:T[0-9:.+Z-]+)?|\d{1,4}\s*[年月日号]|'
        r'(?:[•*]{2,}|尾号\s*)\s*\d{4}|(?m:^\s*\d+[.)、]\s)', plain_message)]
    currency_context = re.search(_CURRENCIES, plain_message, re.IGNORECASE) is not None
    for match in re.finditer(rf'(?<![A-Za-z0-9.,+\-−]){_NUMBER}(?![0-9]|[.,][0-9])', plain_message):
        if any(start < match.end() and match.start() < end
               for start, end in non_money_spans + [m.span() for m in money_matches]):
            continue
        raw = match.group()
        tail = plain_message[match.end():].lstrip()
        if re.match(r'(?:[%％]|笔|天|个月|年|月|日|次|项|个|款|小时|分钟|秒|transactions?\b|days?\b)', tail, re.IGNORECASE):
            continue
        # Bare decimals retain the previous conservative check; integer money
        # additionally needs an explicit currency context and a value slot.
        prefix = plain_message[max(0, match.start() - 40):match.start()]
        value_slot = re.search(r'(?:[:：|]|小计|合计|总额|金额|支出|消费)\s*$', prefix)
        if '.' not in raw and not (currency_context and value_slot):
            continue
        amount = _dec(raw.replace('−', '-'))
        if amount is not None and amount != 0 and amount not in allowed_values:
            return 'UNOBSERVED_AMOUNT'
    # A merchant label paired with a monetary value must be copied from a
    # bank observation. This catches translations and near-name substitutions
    # without a merchant-specific dictionary or an LLM judge.
    for match in BULLET_MERCHANT.finditer(message):
        name, raw_amount = match.groups()
        amount = _dec(raw_amount)
        if amount is not None and merchant_amounts and amount not in merchant_amounts.get(name.strip(), set()):
            return "UNOBSERVED_MERCHANT_AMOUNT_PAIR"
    for clause in re.split(r"[\n。；;]", plain_message):
        names = [(match.start(), match.end(), merchant)
                 for merchant in merchant_amounts
                 for match in re.finditer(re.escape(merchant), clause)]
        for ident, expected in transaction_merchants.items():
            if ident in clause and names and all(name != expected for _, _, name in names):
                return "TRANSACTION_MERCHANT_MISMATCH"
        for match in MONEY.finditer(clause):
            amount, _ = _money_value(match)
            if amount is None or not names:
                continue
            nearest = min(names, key=lambda item: min(abs(item[0] - match.end()), abs(item[1] - match.start())))
            distance = min(abs(nearest[0] - match.end()), abs(nearest[1] - match.start()))
            if distance <= 80 and amount not in merchant_amounts[nearest[2]]:
                return "MERCHANT_AMOUNT_MISMATCH"
    return None


def coverage_notice(task: Task) -> str:
    for observation in reversed(task.observations):
        if observation.tool_name != "summarize_spending" or not observation.success:
            continue
        comparison = observation.structured_result.get("period_change")
        if not isinstance(comparison, dict):
            return ""
        if comparison.get("coverage_comparable") is not False:
            return ""
        left = comparison.get("left_period", {})
        right = comparison.get("right_period", {})
        return (f"\n\n账期提醒：本期为截至目前的 MTD（{left.get('days_covered', '?')} 天），"
                f"对比期覆盖 {right.get('days_covered', '?')} 天；覆盖天数不同，"
                "不能仅凭金额差异判断完整月份的消费趋势。")
    return ""

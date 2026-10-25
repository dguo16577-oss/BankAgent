"""Bounded factual evidence and fail-closed checks for analytical replies."""

from __future__ import annotations

import re
import unicodedata
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
MONEY = re.compile(rf'(?<![A-Za-z0-9.])(?<![0-9],)(?:(?P<prefix>{_CURRENCIES})\s*(?P<left>{_NUMBER})(?![0-9]|[.,][0-9])|(?P<right>{_NUMBER})\s*(?P<suffix>{_CURRENCIES}))(?![A-Za-z])', re.IGNORECASE)
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
    for index, observation in reversed(_current_evidence(task)):
        if not observation.success or not _bank_fact_source(observation.tool_name):
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


def _current_evidence(task: Task) -> list:
    # Reuse the durable ledger's evidence boundary. Earlier observations remain
    # available for references, but cannot prove a new goal's financial figures.
    floors = [step.get('observation_floor') for step in task.ledger
              if type(step.get('observation_floor')) is int and step['observation_floor'] >= 0]
    floor = min(floors, default=0)
    return list(enumerate(task.observations))[floor:]


def _bank_fact_source(tool_name: str) -> bool:
    # Delegates publish underlying verified bank observations separately.
    # Their narrative/result envelope and knowledge metadata are not money.
    return tool_name not in {'search_bank_knowledge', 'service_navigation'} and not tool_name.startswith('delegate_')


def has_current_analysis(task: Task) -> bool:
    return any(observation.success and observation.tool_name in {
        'summarize_spending', 'detect_transaction_anomalies'} for _, observation in _current_evidence(task))


def _dec(value: Any) -> Decimal | None:
    try:
        number = Decimal(str(value).replace(",", ""))
        return number if number.is_finite() else None
    except (InvalidOperation, TypeError):
        return None


def _currency_tokens(text: str) -> list[str]:
    return [_CURRENCY_NAMES.get(m.group(), m.group().upper()) for m in
            re.finditer(rf'(?<![A-Za-z])(?:{_CURRENCIES})(?![A-Za-z])', text, re.IGNORECASE)]


def _table_header(text: str, position: int):
    start = text.rfind('\n', 0, position) + 1
    end = text.find('\n', position)
    row = text[start:end if end >= 0 else len(text)]
    if '|' not in row:
        return None
    column = text[start:position].count('|')
    previous = []
    for line in reversed(text[:start].splitlines()):
        if not line.strip() or '|' not in line:
            break
        previous.append(line)
    previous.reverse()
    for index in range(len(previous) - 1, -1, -1):
        cells = [cell.strip() for cell in previous[index].strip().strip('|').split('|')]
        if cells and all(re.fullmatch(r':?-{3,}:?', cell) for cell in cells):
            if index:
                return previous[index - 1].split('|'), column, row.split('|')
            return None
    return (previous[0].split('|'), column, row.split('|')) if previous else None


def _table_currency(text: str, position: int):
    table = _table_header(text, position)
    if table is None:
        return False, None
    header, column, row = table
    units = _currency_tokens('|'.join(header))
    column_units = _currency_tokens(header[column]) if column < len(header) else []
    if len(set(column_units)) == 1:
        return True, column_units[0]
    if len(set(units)) == 1:
        return True, units[0]
    if units:
        return True, None
    # A dedicated currency cell can denominate a row; an amount like USD 100
    # in another cell cannot redefine a header or another row's currency.
    row_units = [_currency_tokens(cell)[0] for cell in row
                 if re.fullmatch(rf'\s*(?:{_CURRENCIES})\s*', cell, re.IGNORECASE)]
    return (True, row_units[0]) if len(set(row_units)) == 1 else (False, None)


def _scoped_currency(text: str, position: int, money_matches: list, currencies: set[str]) -> str | None:
    """Resolve a denomination from its table column or preceding section.

    A number never borrows authority from the union of other currencies.
    Explicit money tokens are not headings for later unrelated numbers.
    """
    found, table_unit = _table_currency(text, position)
    if found:
        return table_unit
    # Ignore complete explicitly denominated amounts when looking for headings.
    prefix = list(text[:position])
    for match in money_matches:
        if match.start() < position:
            prefix[match.start():min(position, match.end())] = ' ' * (min(position, match.end()) - match.start())
    prefix_text = ''.join(prefix)
    previous_tokens = _currency_tokens(prefix_text)
    if previous_tokens:
        matches = list(re.finditer(rf'(?<![A-Za-z])(?:{_CURRENCIES})(?![A-Za-z])', prefix_text, re.IGNORECASE))
        if len(matches) > 1 and previous_tokens[-1] != previous_tokens[-2]:
            between = prefix_text[matches[-2].end():matches[-1].start()]
            if not between.strip(' \t\r\n/、,，和与&|()（）[]【】'):
                return None
        return previous_tokens[-1]
    return next(iter(currencies)) if len(currencies) == 1 else None


def _non_money_column(text: str, position: int) -> bool:
    table = _table_header(text, position)
    if table is None:
        return False
    header, column, _ = table
    label = header[column] if column < len(header) else ''
    return (not re.search(r'金额|费用|小计|合计|总额|\bamount\b', label, re.IGNORECASE)
            and bool(re.search(r'笔数|次数|占比|比例|百分比|日期|时间|\b(?:count|percent|date|time)\b', label, re.IGNORECASE)))


def validate_analytical_reply(task: Task, message: str) -> str | None:
    """Reject unsupported masks, amounts and transaction/merchant associations.

    The bank supplies entity facts; model prose cannot manufacture financial figures.
    """
    allowed_money: set[tuple[Decimal, str]] = set()
    allowed_masks: set[str] = set()
    merchant_amounts: dict[str, set[tuple[Decimal, str | None]]] = defaultdict(set)
    transaction_merchants: dict[str, str] = {}
    for _, observation in _current_evidence(task):
        if not observation.success or not _bank_fact_source(observation.tool_name):
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
                merchant = unicodedata.normalize('NFKC', merchant)
                money = row.get("amount")
                amount = _dec(money.get("amount") if isinstance(money, dict) else money)
                if amount is not None:
                    currency = money.get('currency') if isinstance(money, dict) else row.get('currency')
                    if currency is None:
                        known = {unit for _, unit in allowed_money}
                        currency = next(iter(known)) if len(known) == 1 else None
                    merchant_amounts[merchant].add((amount, currency))
                ident = row.get("transaction_id")
                if isinstance(ident, str):
                    transaction_merchants[ident] = merchant
    message = unicodedata.normalize('NFKC', message)
    for match in MASK.finditer(message):
        if match.group(1) not in allowed_masks:
            return "UNOBSERVED_MASK"
    # Ignore typography, never arithmetic: both prefix and suffix currency,
    # signs, integer values and grouped decimals must match observed money.
    plain_message = message.replace('**', '').replace('`', '')
    # Unsupported explicit money notation cannot disappear from the strict
    # decimal scanner (fullwidth notation has already been normalized).
    scale = r'(?:[百千万亿]|(?:thousand|million|billion|[kKmM])\b)'
    candidate = rf'[+\-−]?(?:[0-9.][0-9.,A-Za-z+\-−]*|[一二三四五六七八九十百千万亿零壹贰叁肆伍陆柒捌玖拾佰仟]+|NaN|Infinity|Inf)(?:\s*{scale})?'
    if re.search(r'\$\s*[+\-−]?(?:\d|\.\d)|\d\s*\$', plain_message):
        return 'AMBIGUOUS_CURRENCY_SYMBOL'  # require USD/HKD/AUD/SGD explicitly
    for match in re.finditer(rf'(?<![A-Za-z0-9])(?:(?:{_CURRENCIES})\s*(?P<left>{candidate})|(?P<right>{candidate})\s*(?:{_CURRENCIES}))(?![A-Za-z])', plain_message, re.IGNORECASE):
        raw = (match.group('left') or match.group('right')).rstrip('.,')
        if re.fullmatch(r'[一二三四五六七八九十百千万亿零]+', raw) and re.match(
                r'\s*(?:个|种|项|笔)', plain_message[match.end():]):
            continue
        if not re.fullmatch(_NUMBER, raw):
            return 'UNSUPPORTED_MONEY_FORMAT'
    money_matches = list(MONEY.finditer(plain_message))
    for match in money_matches:
        amount, currency = _money_value(match)
        _, table_unit = _table_currency(plain_message, match.start())
        if table_unit is not None and table_unit != currency:
            return 'CURRENCY_SCOPE_MISMATCH'
        if amount is not None and (amount, currency) not in allowed_money:
            return "UNOBSERVED_AMOUNT"
    # Scan signed numbers once; never rescan the positive suffix of -10.
    # Currency headings may apply to following rows, including integer money.
    # Dates, counts, percentages, masks and list markers are different measures.
    observed_currencies = {currency for _, currency in allowed_money}
    non_money_spans = [m.span() for m in re.finditer(
        r'\b\d{4}[-/.]\d{2}[-/.]\d{2}(?:T[0-9:.+Z-]+)?|\d{1,4}\s*[年月日号]|'
        r'[+\-]?\d{1,2}:\d{2}(?::\d{2}(?:\.\d+)?)?|'
        r'(?:[•*]{2,}|尾号\s*)\s*\d{4}|(?m:^\s*\d+[.)、]\s)', plain_message)]
    for match in re.finditer(rf'(?<![A-Za-z0-9.+\-−])(?<![0-9],){_NUMBER}(?![0-9]|[.,][0-9])', plain_message):
        if any(start < match.end() and match.start() < end
               for start, end in non_money_spans + [m.span() for m in money_matches]):
            continue
        raw = match.group()
        if _non_money_column(plain_message, match.start()):
            continue
        tail = plain_message[match.end():].lstrip()
        if re.match(r'(?:[%％]|笔|天|个月|年|月|日|次|项|个|款|小时|分钟|秒|transactions?\b|days?\b)', tail, re.IGNORECASE):
            continue
        # Bare decimals retain the previous conservative check; integer money
        # additionally needs an explicit currency context and a value slot.
        prefix = plain_message[max(0, match.start() - 40):match.start()]
        if re.search(r'(?:笔数|次数|交易数|记录数|天数|占比|比例|百分比(?:变化)?|transaction count|count)\s*[:：=]?\s*$', prefix, re.IGNORECASE):
            continue
        value_slot = re.search(r'(?:[:：|]|小计|合计|总额|金额|支出|消费)\s*$', prefix)
        if value_slot and re.match(rf'(?:[A-Za-z]|\s*{scale})', plain_message[match.end():]):
            return 'UNSUPPORTED_MONEY_FORMAT'
        if '.' not in raw and not (allowed_money and value_slot):
            continue
        amount = _dec(raw.replace('−', '-'))
        if amount is not None:
            currency = _scoped_currency(plain_message, match.start(), money_matches, observed_currencies)
            if currency is None:
                return 'AMBIGUOUS_AMOUNT_CURRENCY'
            if (amount, currency) not in allowed_money:
                return 'UNOBSERVED_AMOUNT'
    # A merchant label paired with a monetary value must be copied from a
    # bank observation. This catches translations and near-name substitutions
    # without a merchant-specific dictionary or an LLM judge.
    for match in BULLET_MERCHANT.finditer(message):
        name, raw_amount = match.groups()
        amount = _dec(raw_amount)
        unit_match = MONEY.search(match.group())
        unit = _money_value(unit_match)[1] if unit_match else None
        if amount is not None and merchant_amounts and (amount, unit) not in merchant_amounts.get(name.strip(), set()):
            return "UNOBSERVED_MERCHANT_AMOUNT_PAIR"
    for clause in re.split(r"[\n。；;]", plain_message):
        names = [(match.start(), match.end(), merchant)
                 for merchant in merchant_amounts
                 for match in re.finditer(re.escape(merchant), clause)]
        for ident, expected in transaction_merchants.items():
            if ident in clause and names and all(name != expected for _, _, name in names):
                return "TRANSACTION_MERCHANT_MISMATCH"
        for match in MONEY.finditer(clause):
            amount, currency = _money_value(match)
            if amount is None or not names:
                continue
            nearest = min(names, key=lambda item: min(abs(item[0] - match.end()), abs(item[1] - match.start())))
            distance = min(abs(nearest[0] - match.end()), abs(nearest[1] - match.start()))
            if distance <= 80 and (amount, currency) not in merchant_amounts[nearest[2]]:
                return "MERCHANT_AMOUNT_MISMATCH"
    return None


def coverage_notice(task: Task) -> str:
    for _, observation in reversed(_current_evidence(task)):
        if observation.tool_name != "summarize_spending" or not observation.success:
            continue
        comparison = observation.structured_result.get("period_change")
        if not isinstance(comparison, dict):
            return ""
        if comparison.get("coverage_comparable") is not False:
            return ""
        left = comparison.get("left_period", {})
        right = comparison.get("right_period", {})
        return (f"\n\n账期提醒：本期覆盖 {left.get('days_covered', '?')} 天，"
                f"对比期覆盖 {right.get('days_covered', '?')} 天；覆盖天数不同，"
                "不能仅凭金额差异判断完整月份的消费趋势。")
    return ""

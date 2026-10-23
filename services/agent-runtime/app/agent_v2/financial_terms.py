"""Runtime-owned step/terms provenance. Validation never selects a tool or invents arguments."""
from __future__ import annotations

import hashlib
import json
import re
from decimal import Decimal
from typing import Any

from .amount_safety import contradicts_explicit_user_amount, has_explicit_amount, matches_bound_amount_revision
from .models import Task
from .recipient_names import normalized, phone_from_query


def digest(value: Any) -> str:
    return hashlib.sha256(json.dumps(value, ensure_ascii=False, sort_keys=True,
                                    separators=(",", ":")).encode()).hexdigest()


def select_financial_step(task: Task, tool: str, requested: str | None = None) -> dict | None:
    from .completeness import _PREPARE_RECEIPTS
    if not task.ledger:
        return None
    receipt = _PREPARE_RECEIPTS.get(tool)
    candidates = [step for step in task.ledger if step.get("kind") == "FINANCIAL_ACTION"
                  and receipt in step.get("evidence_tools", [])
                  and step.get("status") not in {"SUCCEEDED", "CANCELLED", "SKIPPED_CONDITION_FALSE"}]
    if requested:
        candidates = [step for step in candidates if step.get("step_id") == requested]
    if len(candidates) != 1:
        raise ValueError("FINANCIAL_STEP_AMBIGUOUS")
    return candidates[0]


def _source(task: Task, step: dict, require_quote: bool) -> dict:
    quote = step.get("source_quote")
    users = [(index, turn["text"]) for index, turn in enumerate(task.conversation)
             if turn.get("role") == "user" and isinstance(turn.get("text"), str)]
    if not isinstance(quote, str) or not quote.strip():
        if require_quote:
            raise ValueError("FINANCIAL_SOURCE_SPAN_REQUIRED")
        quote = users[-1][1] if users else task.goal
    sources = [(index, text) for index, text in users if text.count(quote) == 1]
    if not sources:
        raise ValueError("FINANCIAL_SOURCE_SPAN_NOT_VERIFIED")
    index, text = sources[-1]
    start = text.index(quote)
    if (re.search(r"(?:不要|别|不许|不能|do not|don't)\s*$", text[max(0, start - 16):start], re.IGNORECASE)
            or re.match(r"\s*(?:不要|别|不许|不能|do not|don't)", quote, re.IGNORECASE)):
        raise ValueError("FINANCIAL_SOURCE_IS_NEGATED")
    return {"source_user_message_id": digest([task.task_id, index, text]),
            "source_text_span": {"start": start, "end": start + len(quote), "text": quote},
            "source_user_turn_index": index}


def authorize_action_constraints(task: Task, tool: str, arguments: dict) -> dict:
    """Reject explicit object/action contradictions; never select tools or supply terms.

    These deliberately limited checks do not certify arbitrary natural-language
    understanding. Unrecognized language remains subject to policy and review.
    """
    step = select_financial_step(task, tool, task.selected_financial_step_id)
    proof = _source(task, step, True) if step and step.get('source_quote') else {}
    text = (proof.get('source_text_span', {}).get('text') or next(
        (turn['text'] for turn in reversed(task.conversation) if turn.get('role') == 'user'), task.goal))
    if tool == 'prepare_card_action':
        patterns = {
            'FREEZE': r'冻结|锁卡|锁住|锁定|锁起来|(?<![a-z])(?:freeze|lock)(?![a-z])',
            'UNFREEZE': r'解冻|解锁|(?<![a-z])(?:unfreeze|unlock)(?![a-z])',
            'REPORT_LOST': r'挂失|(?<![a-z])report\s+lost(?![a-z])',
        }
        explicit = {action for action, pattern in patterns.items() if re.search(pattern, text, re.I)}
        if explicit and explicit != {arguments['action_type']}:
            raise ValueError('STEP_ACTION_NOT_USER_AUTHORIZED')
        suffixes = re.findall(r'(?:尾号|末四位|ending)\s*(\d{4})|(?<!\d)(\d{4})\s*卡', text, re.I)
        suffixes = {a or b for a, b in suffixes}
        if suffixes:
            cards = [card for ob in task.observations if ob.success and ob.tool_name == 'list_cards'
                     for card in ob.structured_result.get('cards', [])
                     if card.get('card_id') == arguments['card_id']]
            if len(suffixes) != 1 or not any(str(card.get('masked_number', '')).endswith(next(iter(suffixes))) for card in cards):
                raise ValueError('STEP_CARD_NOT_USER_AUTHORIZED')
    if tool == 'prepare_stop_recurring_payment' and re.search(
            r'恢复|重启|重新开启|\b(?:resume|restore|restart|enable)\b', text, re.I):
        raise ValueError('STEP_ACTION_NOT_USER_AUTHORIZED')
    return proof


def authorize_transfer_terms(task: Task, arguments: dict, tool: str = "prepare_transfer") -> dict | None:
    step = select_financial_step(task, tool, task.selected_financial_step_id)
    if step is None:
        return None  # Existing no-ledger compatibility still uses the original amount veto.
    same_kind = [s for s in task.ledger if s.get("kind") == "FINANCIAL_ACTION"
                 and set(s.get("evidence_tools", [])) & set(step.get("evidence_tools", []))]
    multi = len(same_kind) > 1
    source = _source(task, step, multi)
    quote = source["source_text_span"]["text"]
    previous = next((row for row in reversed(task.financial_terms)
                     if row.get("step_id") == step["step_id"]), None)
    if not has_explicit_amount(quote) and (not previous or previous.get("amount") != arguments["amount"]):
        raise ValueError("STEP_AMOUNT_EVIDENCE_MISSING")
    if multi:
        # A model cannot swap quotes, duplicate an original clause, or cite an
        # older request to authorize a current multi-action task.
        origin = task.conversation[source["source_user_turn_index"]]["text"]
        if origin != task.goal:
            raise ValueError("FINANCIAL_SOURCE_NOT_CURRENT_GOAL")
        previous_end = -1
        for other in same_kind:
            other_quote = other.get("source_quote")
            if not isinstance(other_quote, str) or not other_quote or origin.count(other_quote) != 1:
                raise ValueError("FINANCIAL_SOURCE_SPANS_NOT_DISTINCT")
            start = origin.index(other_quote)
            if start < previous_end:
                raise ValueError("FINANCIAL_SOURCE_SPAN_ORDER_CONFLICT")
            previous_end = start + len(other_quote)
    correction = bool(previous and previous.get("status") == "CANCELLED"
                      and task.revision > previous.get("terms_version", task.revision)
                      and matches_bound_amount_revision(quote, previous.get("amount", ""), arguments["amount"]))
    if contradicts_explicit_user_amount([{"role": "user", "text": "金额 " + quote}], arguments["amount"]) and not correction:
        raise ValueError("STEP_AMOUNT_NOT_USER_AUTHORIZED")
    # Resolution is bank-backed. A proposed quote and a proposed recipient ID
    # are not mutually authenticating: require the verified bank reference in
    # this exact original clause, never just somewhere in the whole message.
    candidates = [(ob, candidate) for ob in task.observations
                  if ob.success and ob.tool_name == "resolve_recipient"
                  for candidate in ob.structured_result.get("candidates", [])
                  if candidate.get("recipient_id") == arguments["recipient_id"]]
    matched = False
    for ob, candidate in candidates:
        # Only the query actually resolved by the bank can establish the user
        # reference. A display name alone could hide alias/name ambiguity.
        references = [ob.structured_result.get("query_reference")]
        phone = phone_from_query(quote)
        phone_matches = bool(phone and ob.structured_result.get("query_reference_hash") == hashlib.sha256(phone.encode()).hexdigest())
        named = any(isinstance(ref, str) and normalized(ref) and
                    re.search(re.escape(normalized(ref)) + r"(?=转|汇|打|[0-9]|元|块|$)", normalized(quote))
                    for ref in references)
        if named or phone_matches:
            if ob.structured_result.get("status") == "RESOLVED" or task.selected_recipient_id == arguments["recipient_id"]:
                matched = True
                break
    if not matched and previous and previous.get("recipient_reference") == arguments["recipient_id"]:
        matched = True  # A verified prior recipient may survive an amount-only revision.
    if not matched:
        for ob in task.observations:
            query = ob.structured_result.get("query", {}).get("search")
            if (ob.success and ob.tool_name == "list_transactions" and isinstance(query, str) and query in quote
                    and any(row.get("verified_recipient_id") == arguments["recipient_id"]
                            for row in ob.structured_result.get("transactions", []))):
                matched = True
    if not matched:
        raise ValueError("STEP_RECIPIENT_NOT_USER_AUTHORIZED")
    accounts = [row for ob in task.observations if ob.success and ob.tool_name == "list_accounts"
                for row in ob.structured_result.get("accounts", [])]
    payer_suffixes, payee_suffixes = [], []
    for match in re.finditer(r"(?:尾号|末四位|ending)\s*(\d{4})", quote, re.IGNORECASE):
        (payee_suffixes if _account_role(quote, match.start()) == 'RECIPIENT'
         else payer_suffixes).append(match.group(1))
    if payer_suffixes and (len(set(payer_suffixes)) != 1 or not any(
            row.get('id') == arguments['source_account_id'] and
            str(row.get('maskedAccountNumber', '')).endswith(payer_suffixes[0]) for row in accounts)):
        raise ValueError("STEP_ACCOUNT_NOT_USER_AUTHORIZED")
    if payee_suffixes and (len(set(payee_suffixes)) != 1 or not any(
            str(candidate.get('masked_account', '')).endswith(payee_suffixes[0]) for _, candidate in candidates)):
        raise ValueError("STEP_RECIPIENT_ACCOUNT_NOT_USER_AUTHORIZED")
    named_accounts = set()
    for row in accounts:
        name = row.get('displayName') or row.get('name')
        if not isinstance(name, str) or not name.strip():
            continue
        name_pattern = r'\s*'.join(re.escape(part) for part in name.split())
        for match in re.finditer(r'(?<![A-Za-z0-9])' + name_pattern + r'(?![A-Za-z0-9])', quote, re.I):
            if _account_role(quote, match.start()) != 'RECIPIENT':
                named_accounts.add(row.get('id'))
    if named_accounts and named_accounts != {arguments['source_account_id']}:
        raise ValueError('STEP_ACCOUNT_NOT_USER_AUTHORIZED')
    if not payer_suffixes and not named_accounts and previous and previous.get("account_reference") != arguments["source_account_id"]:
        raise ValueError("STEP_ACCOUNT_CHANGE_NOT_USER_AUTHORIZED")
    for code, labels in {"USD": r"USD|美元", "JPY": r"JPY|日元", "EUR": r"EUR|欧元",
                         "GBP": r"GBP|英镑", "CNY": r"CNY|RMB|人民币"}.items():
        if re.search(labels, quote, re.IGNORECASE) and arguments["currency"] != code:
            raise ValueError("STEP_CURRENCY_NOT_USER_AUTHORIZED")
    if arguments.get("note") and arguments["note"] not in quote:
        raise ValueError("STEP_NOTE_NOT_USER_AUTHORIZED")
    return {**source, "task_id": task.task_id, "step_id": step["step_id"], "operation_type": tool,
            "recipient_reference": arguments["recipient_id"], "account_reference": arguments["source_account_id"],
            "amount": arguments["amount"], "currency": arguments["currency"], "terms_version": task.revision}


def _account_role(text: str, position: int) -> str:
    """Only attribute explicit account constraints; never select a tool or ID.

    Closest role marker in the same clause distinguishes sender from payee.
    Unqualified suffixes retain the existing sender veto and fail closed.
    """
    before = re.split(r'[，,；;。\n]', text[:position])[-1]
    markers = list(re.finditer(
        r'(?P<payee>收款|收款人|对方|转入|给|\bto\b|\brecipient\b|\bpayee\b|\bbeneficiary\b)'
        r'|(?P<payer>付款|扣款|转出|从|用|我的|\bfrom\b|\bsource\b|\bpayer\b)', before, re.I))
    return 'RECIPIENT' if markers and markers[-1].lastgroup == 'payee' else 'PAYER'


def bind_prepared_intent(task: Task, tool: str, arguments: dict, intent: dict) -> dict | None:
    step = select_financial_step(task, tool, task.selected_financial_step_id)
    if step is None:
        return None
    if tool in {"prepare_transfer", "prepare_scheduled_transfer"}:
        record = authorize_transfer_terms(task, arguments, tool)
    else:
        record = {**_source(task, step, False), "task_id": task.task_id, "step_id": step["step_id"],
                  "operation_type": tool, "terms_version": task.revision}
    if tool == 'prepare_card_action':
        authorize_action_constraints(task, tool, arguments)
        if intent.get('card', {}).get('id') != arguments['card_id'] or intent.get('actionType') != arguments['action_type']:
            raise ValueError('BANK_PREPARED_TERMS_MISMATCH')
        record.update(target_reference=arguments['card_id'], action_type=arguments['action_type'])
    if tool == "prepare_transfer":
        if (intent.get("sourceAccount", {}).get("id") != arguments["source_account_id"] or
                intent.get("recipient", {}).get("id") != arguments["recipient_id"] or
                intent.get("amount", {}).get("currency") != arguments["currency"] or
                Decimal(intent.get("amount", {}).get("amount", "NaN")) != Decimal(arguments["amount"]) or
                (intent.get("note") or "") != (arguments.get("note") or "")):
            raise ValueError("BANK_PREPARED_TERMS_MISMATCH")
    if not all(isinstance(intent.get(k), str) and intent[k] for k in ("id", "intentHash")):
        raise ValueError("BANK_PREPARED_BINDING_MISSING")
    if any(row.get("execution_key") == task.execution_key and
           (row.get("arguments_sha256") != digest([tool, arguments]) or row.get("intent_id") != intent["id"])
           for row in task.financial_terms):
        raise ValueError("EXECUTION_KEY_TERMS_CONFLICT")
    record.update({"intent_id": intent["id"], "terms_hash": intent["intentHash"],
                   "execution_key": task.execution_key, "arguments_sha256": digest([tool, arguments]),
                   "status": "PREPARED", "receipt_id": None})
    existing = next((row for row in task.financial_terms if row.get("intent_id") == intent["id"]), None)
    if existing and existing != record:
        raise ValueError("INTENT_BINDING_CONFLICT")
    if existing is None:
        task.financial_terms.append(record)
    step["financial_binding"] = dict(record)
    return record


def bind_execution_receipt(task: Task, intent: dict, receipt: dict) -> dict:
    base = {"intent_id": intent["id"], "receipt_id": receipt["id"]}
    record = next((row for row in task.financial_terms if row.get("intent_id") == intent["id"]), None)
    if record is None:
        if any(step.get("kind") == "FINANCIAL_ACTION" for step in task.ledger):
            raise ValueError("FINANCIAL_BINDING_UNVERIFIED")
        return base
    if (record.get("terms_hash") != intent.get("intentHash") or record.get("execution_key") != task.execution_key
            or record.get("status") not in {"PREPARED", "EXECUTED"}
            or record.get("receipt_id") not in {None, receipt["id"]}
            or any(row.get("receipt_id") == receipt["id"] and row.get("intent_id") != intent["id"] for row in task.financial_terms)):
        raise ValueError("FINANCIAL_RECEIPT_BINDING_CONFLICT")
    if receipt.get("intentId", intent["id"]) != intent["id"]:
        raise ValueError("BANK_RECEIPT_INTENT_MISMATCH")
    # An explicit contradictory receipt must not be laundered through a correct
    # intent ID/hash. Optional legacy fields remain optional, never invented.
    for field, expected in [('recipient', record.get('recipient_reference')),
                            ('sourceAccount', record.get('account_reference')),
                            ('card', record.get('target_reference'))]:
        if field in receipt and expected and (not isinstance(receipt[field], dict) or receipt[field].get('id') != expected):
            raise ValueError('BANK_RECEIPT_TERMS_MISMATCH')
    if 'actionType' in receipt and record.get('action_type') and receipt['actionType'] != record['action_type']:
        raise ValueError('BANK_RECEIPT_TERMS_MISMATCH')
    if 'amount' in receipt and record.get('amount'):
        amount = receipt['amount']
        if (not isinstance(amount, dict) or amount.get('currency') != record['currency']
                or not _equal_amount(amount.get('amount'), record['amount'])):
            raise ValueError('BANK_RECEIPT_TERMS_MISMATCH')
    record.update({"status": "EXECUTED", "receipt_id": receipt["id"]})
    step = next(s for s in task.ledger if s.get("step_id") == record["step_id"])
    step["financial_binding"] = dict(record)
    return {**base, **{key: record[key] for key in ("step_id", "terms_hash", "execution_key")}}


def _equal_amount(actual: Any, expected: str) -> bool:
    from decimal import InvalidOperation
    try:
        return isinstance(actual, str) and Decimal(actual).is_finite() and Decimal(actual) == Decimal(expected)
    except InvalidOperation:
        return False


def validate_execution_binding(task: Task, intent: dict) -> None:
    if not any(step.get("kind") == "FINANCIAL_ACTION" for step in task.ledger):
        return
    record = next((row for row in task.financial_terms if row.get("intent_id") == intent["id"]), None)
    step = next((row for row in task.ledger if record and row.get("step_id") == record.get("step_id")), None)
    if (not record or not step or step.get("status") in {"CANCELLED", "FAILED", "BLOCKED"}
            or record.get("status") not in {"PREPARED", "EXECUTED"}
            or record.get("terms_hash") != intent.get("intentHash")
            or record.get("execution_key") != task.execution_key
            or step.get("financial_binding") != record):
        raise ValueError("FINANCIAL_EXECUTION_BINDING_UNVERIFIED")


def receipt_matches(task: Task, step: dict, result: dict) -> bool:
    binding = step.get("financial_binding")
    if not isinstance(binding, dict):
        return False
    record = next((row for row in task.financial_terms if row.get("intent_id") == binding.get("intent_id")), None)
    keys = ("step_id", "intent_id", "terms_hash", "execution_key", "receipt_id")
    return bool(record and record.get("status") == "EXECUTED" and
                all(record.get(key) and record.get(key) == binding.get(key) == result.get(key) for key in keys))

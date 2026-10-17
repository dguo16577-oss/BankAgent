"""Deterministic, server-owned banking intents and tool orchestration."""

from __future__ import annotations

import re
from datetime import datetime, timedelta, timezone
from decimal import Decimal, InvalidOperation
from typing import Any
from urllib.parse import quote

from .banking import BankingGateway, BankingUnavailableError
from .knowledge import SourceFact, citations_for, load_knowledge, relevant_facts
from .models import ChatResponse, Citation, Money, NavigateProposal, TransferProposal


_INJECTION = re.compile(
    r"(?:忽略.{0,15}(?:之前|以上|所有).{0,8}(?:指令|规则)|"
    r"绕过.{0,12}(?:验证|确认|权限|风控)|"
    r"跳过.{0,12}(?:验证|确认|权限|风控)|"
    r"直接执行.{0,12}(?:转账|汇款)|"
    r"(?:ignore|override).{0,20}(?:previous|system|developer|rules|instructions)|"
    r"(?:bypass|skip).{0,20}(?:verification|confirmation|authorization|security)|"
    r"reveal.{0,20}(?:system prompt|api key|secret))",
    re.IGNORECASE,
)
_AMOUNT = re.compile(
    r"(?<![\w.])(?P<amount>(?:0|[1-9][0-9]{0,8})(?:\.[0-9]{1,2})?)\s*"
    r"(?P<unit>元|块|人民币|CNY|USD|美元|美金|yuan|dollars?)",
    re.IGNORECASE,
)
_ID = re.compile(r"[A-Za-z0-9_-]{1,120}\Z")
_PUBLIC_TERMS = re.compile(
    r"费用|手续费|年费|申请条件|申请资格|准入条件|\bfees?\b|\bannual fee\b|\beligib(?:le|ility)\b|\bqualif(?:y|ication)\b",
    re.IGNORECASE,
)
_TRANSFER_HISTORY = re.compile(
    r"(?:转账|转给|汇款|汇给|打钱|\btransfer(?:red)?\b|\bsent\b).*(?:这个月|本月|上个月|上月|多少|几笔|记录|历史|已转|转了|转账过|给谁|收款人|how much|this month|last month|history|who|whom)|"
    r"(?:这个月|本月|上个月|上月|how much|this month|last month).*(?:转账|转给|汇款|汇给|打钱|\btransfer(?:red)?\b|\bsent\b)",
    re.IGNORECASE,
)
_BANK_TIMEZONE = timezone(timedelta(hours=8))


def heuristic_intent(message: str) -> str:
    q = message.casefold()
    if _TRANSFER_HISTORY.search(q):
        return "TRANSFER_HISTORY"
    if re.search(r"转账|转给|汇款|汇给|打钱|\btransfer\b|\bsend\s+money\b|\bpay\s+", q):
        return "TRANSFER"
    # Fees and eligibility belong to public product terms. Customer card GETs
    # expose status and masked identifiers, not a customer's contractual terms.
    # This dedicated intent also keeps absent terms out of model synthesis.
    if _PUBLIC_TERMS.search(q) and re.search(r"信用卡|银行卡|借记卡|返现|产品|账户|贷款|储蓄|存款|\bcard\b|\bproduct\b|\baccount\b|\bloan\b|\bsavings\b", q):
        return "PUBLIC_TERMS"
    if re.search(r"什么是|介绍|有哪些|如何|怎么|\bwhat is\b|\bhow does\b|\btell me about\b", q) and not re.search(r"我的|我有|本人|\bmy\b|\bmine\b", q):
        return "PUBLIC"
    if re.search(r"订阅|代扣|自动扣费|续费|recurring|subscription|autopay", q):
        return "RECURRING"
    if re.search(r"我的.{0,8}卡|卡片|银行卡|信用卡|借记卡|挂失|冻结|解冻|my card|freeze card|lost card|\bcard\b|\bfreeze\b|\bunfreeze\b", q):
        return "CARDS"
    if re.search(r"消费|支出|花了|账单分析|spending|spend|expense|budget", q):
        return "SPENDING"
    if re.search(r"余额|账户|账号|存款|我有多少钱|我还有多少钱|balance|my account|accounts|how much money do i have", q):
        return "ACCOUNTS"
    if re.search(r"交易|流水|记录|明细|transactions?|statement", q):
        return "TRANSACTIONS"
    return "UNKNOWN"


def _t(locale: str, zh: str, en: str) -> str:
    return en if locale == "en" else zh


def _money(data: Any, locale: str = "zh-CN") -> str:
    if isinstance(data, dict):
        return f"{data.get('amount', '?')} {data.get('currency', '')}".strip()
    return _t(locale, "金额未知", "amount unknown")


def _entries(payload: dict[str, Any]) -> list[dict[str, Any]]:
    value = payload.get("items", payload.get("accounts", []))
    return [item for item in value if isinstance(item, dict)] if isinstance(value, list) else []


def _citation(title: str, url: str) -> list[Citation]:
    return [Citation(title=title, url=url)]


def _message_contains_name(message: str, name: str) -> bool:
    compact_message = re.sub(r"\s+", "", message).casefold()
    compact_name = re.sub(r"\s+", "", name).casefold()
    return bool(compact_name) and compact_name in compact_message


def _transfer_amount(message: str) -> Money | None:
    match = _AMOUNT.search(message)
    if not match:
        return None
    try:
        amount = Decimal(match.group("amount"))
    except InvalidOperation:
        return None
    if amount <= 0 or amount >= Decimal("1000000000"):
        return None
    currency = "USD" if match.group("unit").casefold() in {"usd", "美元", "美金", "dollar", "dollars"} else "CNY"
    return Money(amount=f"{amount:.2f}", currency=currency)


def _matching_item(message: str, entries: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return [entry for entry in entries if _message_contains_name(message, str(entry.get("displayName", "")))]


def _navigate(kind: str, item: dict[str, Any], action: str, locale: str = "zh-CN") -> NavigateProposal | None:
    identity = item.get("id")
    if not isinstance(identity, str) or not _ID.fullmatch(identity):
        return None
    prefix = "/app/cards" if kind == "CARDS" else "/app/spending/recurring"
    name = str(item.get("displayName", _t(locale, "项目", "item")))
    summary = f"Open {name} details to review and {action}." if locale == "en" else f"前往{name}详情页核对并{action}。"
    return NavigateProposal(href=f"{prefix}/{quote(identity, safe='')}", summary=summary)


def public_answer(facts: list[SourceFact], mode: str = "DETERMINISTIC", question: str = "", locale: str = "zh-CN") -> ChatResponse:
    if not facts:
        return ChatResponse(reply=_t(locale, "在当前公开产品和帮助资料里没有找到足够依据。你可以换个产品名称或问题再问。", "I could not find enough support in the public product and help materials. Try a specific product name or question."))
    if _PUBLIC_TERMS.search(question):
        product = next((fact for fact in facts if fact.url.startswith("/products/")), None)
        if product is None:
            return ChatResponse(reply=_t(locale, "公开目录摘要里没有找到能对应这项费用或申请条件的产品，暂时无法给出条款。", "I could not match this fee or eligibility question to a product in the public catalog summary, so I cannot state its terms."))
        requested = []
        if re.search(r"费用|手续费|年费|\bfees?\b|\bannual fee\b", question, re.IGNORECASE):
            requested.append(_t(locale, "费用", "fees"))
        if re.search(r"申请条件|申请资格|准入条件|\beligib(?:le|ility)\b|\bqualif(?:y|ication)\b", question, re.IGNORECASE):
            requested.append(_t(locale, "申请条件", "eligibility requirements"))
        terms = (_t(locale, "和", " and ")).join(requested) if requested else _t(locale, "相关条款", "terms")
        summary = product.text.rstrip("。.!? ")
        return ChatResponse(
            reply=(
                f"The public catalog describes {product.title} as: {summary}. The catalog summary does not include complete {terms}. I cannot confirm specific terms from that summary; please review the product details."
                if locale == "en" else
                f"公开目录将{product.title}描述为：{summary}。目录摘要没有列出完整的{terms}，我不能据此给出具体条款；请查看该产品详情页。"
            ),
            citations=citations_for([product]),
        )
    lines = [f"{fact.title}：{fact.text}" for fact in facts]
    reply = (
        "From the public materials: " + "; ".join(f"{fact.title}: {fact.text}" for fact in facts) + " These are demo materials; check the source pages for details."
        if locale == "en" else
        "根据公开资料：" + "；".join(lines) + "。这些内容是演示资料，请以页面详情为准。"
    )
    return ChatResponse(reply=reply, mode=mode, citations=citations_for(facts))


async def answer(message: str, intent: str, cookie: str, gateway: BankingGateway, mode: str, locale: str = "zh-CN", *, now: datetime | None = None) -> ChatResponse:
    if _INJECTION.search(message):
        return ChatResponse(reply=_t(locale, "这项请求试图跳过银行的确认或验证步骤。我不会执行；请按正常流程查询或发起提案。", "This request tries to bypass bank confirmation or verification. I cannot do that. Please use the normal query or proposal flow."))
    if intent == "TRANSFER_HISTORY":
        return await _transfer_history(message, cookie, gateway, mode, locale, now=now)
    if intent == "TRANSFER":
        return await _transfer(message, cookie, gateway, mode, locale)
    if intent == "ACCOUNTS":
        data = await gateway.customer_get("/customer/accounts", cookie)
        accounts = _entries(data)
        if not accounts:
            return ChatResponse(reply=_t(locale, "当前账户列表为空。", "There are no accounts to show."), mode=mode, citations=_citation(_t(locale, "账户", "Accounts"), "/app/accounts"))
        requested_currencies = [
            currency for currency, pattern in (("USD", r"美元|\bUSD\b|\bdollar\b"), ("JPY", r"日元|\bJPY\b|\byen\b"))
            if re.search(pattern, message, re.IGNORECASE)
        ]
        visible_accounts = ([a for a in accounts if a.get("currency") == requested_currencies[0]]
                            if len(requested_currencies) == 1 else accounts)
        if not visible_accounts:
            return ChatResponse(reply=_t(locale, "当前没有找到该币种的账户。", "I could not find an account in that currency."), mode=mode, citations=_citation(_t(locale, "我的账户", "My accounts"), "/app/accounts"))
        parts = []
        for account in visible_accounts[:6]:
            name = str(account.get("displayName", _t(locale, "账户", "Account")))
            masked = str(account.get("maskedAccountNumber", ""))
            balance = _money(account.get("balance"), locale)
            available = _money(account.get("availableBalance"), locale)
            heading = f"• {name}（{masked}）" if masked else f"• {name}"
            values = (
                f"  Balance: {balance} · Available: {available}"
                if locale == "en" else
                f"  余额：{balance} · 可用：{available}"
            )
            details = [heading, values]
            pending = account.get("pendingAmount")
            if isinstance(pending, dict):
                try:
                    has_pending = Decimal(str(pending.get("amount", "0"))) > 0
                except InvalidOperation:
                    has_pending = False
                if has_pending:
                    details.append(_t(locale, f"  待处理：{_money(pending, locale)}", f"  Pending: {_money(pending, locale)}"))
            equivalent = account.get("baseCurrencyEquivalent")
            if isinstance(equivalent, dict):
                value = equivalent.get("value")
                source = equivalent.get("conversionSource")
                as_of = equivalent.get("conversionAsOf")
                if isinstance(value, dict) and isinstance(source, str) and isinstance(as_of, str):
                    estimate = _money(value, locale)
                    details.append(_t(locale, f"  估算人民币等值：{estimate}（{source}，{as_of}）", f"  Estimated CNY equivalent: {estimate} ({source}, {as_of})"))
            parts.append("\n".join(details))
        intro = (_t(locale, f"你的 {requested_currencies[0]} 账户：", f"Your {requested_currencies[0]} account:")
                 if len(requested_currencies) == 1 else
                 _t(locale, f"你有 {len(accounts)} 个账户，以下按原币列示：", f"You have {len(accounts)} accounts, shown in their original currencies:"))
        outro = _t(locale, "不同币种不直接相加；外币等值仅供参考，不是可执行汇率。", "Different currencies are not added together. Foreign-currency equivalents are estimates, not executable rates.")
        if len(visible_accounts) > 6:
            outro += _t(locale, "其余账户请到“我的账户”查看。", " See My accounts for the remaining accounts.")
        return ChatResponse(reply="\n\n".join([intro, *parts, outro]), mode=mode, citations=_citation(_t(locale, "我的账户", "My accounts"), "/app/accounts"))
    if intent == "SPENDING":
        summary = await gateway.customer_get("/customer/spending/summary", cookie)
        transactions = await gateway.customer_get("/customer/transactions", cookie)
        total = _money(summary.get("totalSpend"), locale)
        count = summary.get("transactionCount", 0)
        categories = [c for c in summary.get("categoryBreakdown", []) if isinstance(c, dict)]
        categories.sort(key=lambda c: Decimal(str((c.get("amount") or {}).get("amount", "0"))), reverse=True)
        top = (_t(locale, "、", ", ")).join(f"{c.get('category', _t(locale, '其他', 'Other'))} {_money(c.get('amount'), locale)}" for c in categories[:3])
        recent_count = len(_entries(transactions))
        if locale == "en":
            reply = f"Spending in the current period is {total} across {count} transactions."
            if top:
                reply += f" Main categories: {top}."
            reply += f" I also checked the latest {recent_count} transaction records. The bank's spending summary counts completed debit purchases and fees; ordinary transfers are excluded."
        else:
            reply = f"当前统计期消费 {total}，共 {count} 笔。"
            if top:
                reply += f"主要类别：{top}。"
            reply += f"我同时核对了最近 {recent_count} 条交易记录；消费统计由银行按已完成借记交易计算，普通转账不计入。"
        return ChatResponse(reply=reply, mode=mode, citations=_citation(_t(locale, "消费分析", "Spending analysis"), "/app/spending"))
    if intent == "TRANSACTIONS":
        data = await gateway.customer_get("/customer/transactions", cookie)
        items = _entries(data)
        if not items:
            return ChatResponse(reply=_t(locale, "当前没有可展示的交易记录。", "There are no transactions to show."), mode=mode, citations=_citation(_t(locale, "交易记录", "Transactions"), "/app/transactions"))
        parts = [
            f"{item.get('title', 'Transaction')} {_money(item.get('amount'), locale)} ({item.get('direction', 'unknown direction')}, {item.get('status', 'unknown status')})"
            if locale == "en" else
            f"{item.get('title', '交易')} {_money(item.get('amount'), locale)}（{item.get('direction', '方向未知')}，{item.get('status', '状态未知')}）"
            for item in items[:5]
        ]
        reply = ("Recent transactions: " + "; ".join(parts) + ".") if locale == "en" else ("最近交易：" + "；".join(parts) + "。")
        return ChatResponse(reply=reply, mode=mode, citations=_citation(_t(locale, "交易记录", "Transactions"), "/app/transactions"))
    if intent == "CARDS":
        return await _cards(message, cookie, gateway, mode, locale)
    if intent == "RECURRING":
        return await _recurring(message, cookie, gateway, mode, locale)
    snapshot = await load_knowledge(gateway)
    facts = relevant_facts(snapshot, message)
    return public_answer(facts, mode, message, locale)


def _transfer_month_window(message: str, now: datetime) -> tuple[datetime, datetime] | None:
    local = now.astimezone(_BANK_TIMEZONE)
    start = local.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    if re.search(r"上个月|上月|last month", message, re.IGNORECASE):
        return (start - timedelta(days=1)).replace(day=1), start
    if re.search(r"这个月|本月|this month", message, re.IGNORECASE):
        return start, (start.replace(day=28) + timedelta(days=4)).replace(day=1)
    return None


def _requested_payee(message: str) -> str | None:
    match = re.search(r"(?:转给(?:了)?|汇给(?:了)?|\bto\s+)\s*([A-Za-z]+(?:\s+[A-Za-z]+){0,3})", message, re.IGNORECASE)
    if not match:
        return None
    words = re.split(r"\s+", match.group(1).strip())
    while words and words[-1].casefold() in {"this", "last", "month", "how", "much", "in"}:
        words.pop()
    return " ".join(words).casefold() or None


async def _transfer_history(message: str, cookie: str, gateway: BankingGateway, mode: str, locale: str, *, now: datetime | None = None) -> ChatResponse:
    window = _transfer_month_window(message, now or datetime.now(_BANK_TIMEZONE))
    base_params: dict[str, str | int] = {
        "status": "COMPLETED", "direction": "DEBIT", "type": "BANK_TRANSFER", "limit": 50,
    }
    if window:
        start, end = window
        base_params.update({"from": start.isoformat(timespec="seconds"), "to": end.isoformat(timespec="seconds")})
    target = _requested_payee(message)
    wants_names = bool(re.search(r"给谁|哪些人|收款人|\bwho\b|\bwhom\b", message, re.IGNORECASE))
    totals: dict[str, Decimal] = {}
    matched_names: set[str] = set()
    matched_count = 0
    seen_ids: set[str] = set()
    cursor: str | None = None
    for _ in range(100):
        params = {**base_params, **({"cursor": cursor} if cursor else {})}
        page = await gateway.customer_get("/customer/transactions", cookie, params=params)
        if not isinstance(page.get("items"), list) or not isinstance(page.get("hasMore"), bool):
            raise BankingUnavailableError
        for item in page["items"]:
            if not isinstance(item, dict) or not isinstance(item.get("id"), str) or item["id"] in seen_ids:
                raise BankingUnavailableError
            seen_ids.add(item["id"])
            party = item.get("counterparty")
            name = party.get("name") if isinstance(party, dict) else None
            if not isinstance(name, str) or (target and re.sub(r"\s+", "", name).casefold() != re.sub(r"\s+", "", target)):
                continue
            # Recheck the server response before including a record in a financial total.
            if item.get("type") != "BANK_TRANSFER" or item.get("direction") != "DEBIT" or item.get("status") != "COMPLETED":
                raise BankingUnavailableError
            try:
                amount = item["amount"]
                currency = amount["currency"]
                value = Decimal(amount["amount"])
                occurred = datetime.fromisoformat(item["occurredAt"].replace("Z", "+00:00"))
                if not isinstance(currency, str) or not value.is_finite() or value < 0 or occurred.tzinfo is None:
                    raise ValueError
            except (KeyError, TypeError, ValueError, InvalidOperation) as exc:
                raise BankingUnavailableError from exc
            if window and not start <= occurred < end:
                raise BankingUnavailableError
            matched_names.add(name)
            totals[currency] = totals.get(currency, Decimal("0")) + value
            matched_count += 1
        if not page["hasMore"]:
            break
        next_cursor = page.get("nextCursor")
        if not isinstance(next_cursor, str) or not next_cursor or next_cursor == cursor:
            raise BankingUnavailableError
        cursor = next_cursor
    else:
        raise BankingUnavailableError
    period = window[0].strftime("%Y-%m") if window else _t(locale, "现有记录中", "the available records")
    citation = _citation(_t(locale, "交易记录", "Transactions"), "/app/transactions")
    if not matched_count:
        subject = f"to {target}" if target else ""
        reply = f"I found no completed outgoing transfers {subject} in {period}." if locale == "en" else f"{period} 没有查到{('转给' + target) if target else ''}已完成的转出记录。"
    elif wants_names:
        names = ", ".join(sorted(matched_names))
        reply = f"In {period}, completed outgoing transfers went to: {names}." if locale == "en" else f"{period} 已完成的转账收款人有：{names}。"
    else:
        amounts = ", ".join(f"{amount:.2f} {currency}" for currency, amount in sorted(totals.items()))
        subject = f" to {target}" if target else ""
        display_name = next(iter(matched_names)) if target else None
        reply = f"In {period}, you completed {matched_count} outgoing transfer(s){subject}, totaling {amounts}." if locale == "en" else f"{period} 你{('向 ' + display_name + ' ') if display_name else ''}已完成转账 {matched_count} 笔，合计 {amounts}。"
    return ChatResponse(reply=reply, mode=mode, citations=citation)


async def _transfer(message: str, cookie: str, gateway: BankingGateway, mode: str, locale: str) -> ChatResponse:
    amount = _transfer_amount(message)
    if amount is None:
        return ChatResponse(reply=_t(locale, "请说明转账金额和币种，例如“转给 Lin Wei 10 元”。转账会在页面复核后才执行。", "Please provide the transfer amount and currency, such as 'Transfer 10 CNY to Lin Wei'. A transfer is executed only after review in the banking page."), mode=mode)
    if amount.currency != "CNY":
        return ChatResponse(reply=_t(locale, "当前演示转账仅支持人民币 CNY。我不会生成无法在转账页面复核的其他币种提案。", "This demo transfer flow supports CNY only. I cannot create a proposal that the banking review page cannot verify."), mode=mode)
    recipients = _entries(await gateway.customer_get("/customer/recipients", cookie))
    matches = _matching_item(message, [r for r in recipients if r.get("status", "ACTIVE") == "ACTIVE" and r.get("currency") == amount.currency])
    if not matches:
        return ChatResponse(reply=_t(locale, "没有找到与这条消息唯一匹配的已启用收款人。请使用收款人列表中的完整姓名。", "I could not find a matching active recipient. Please use the recipient's full name from your saved list."), mode=mode)
    if len(matches) != 1:
        return ChatResponse(reply=_t(locale, "匹配到多位收款人，请补充完整姓名或先在转账页面选择。", "Multiple recipients match. Please give the full name or choose one in the transfer page."), mode=mode)
    accounts = _entries(await gateway.customer_get("/customer/accounts", cookie))
    eligible = [a for a in accounts if a.get("status") == "ACTIVE" and a.get("currency") == amount.currency]
    explicit = _matching_item(message, eligible)
    if len(explicit) > 1:
        return ChatResponse(reply=_t(locale, "匹配到多个付款账户，请指明其中一个账户。", "Multiple source accounts match. Please name one account."), mode=mode)
    if explicit:
        source = explicit[0]
    else:
        current = [a for a in eligible if a.get("type") == "CURRENT"]
        if len(current) == 1:
            source = current[0]
        elif len(eligible) == 1:
            source = eligible[0]
        else:
            return ChatResponse(reply=_t(locale, "请说明从哪个账户付款；当前有多个可用账户。", "Please name the account to pay from; several accounts are available."), mode=mode)
    try:
        available = Decimal(str(source["availableBalance"]["amount"]))
    except (KeyError, TypeError, InvalidOperation):
        return ChatResponse(reply=_t(locale, "暂时无法核对可用余额，请稍后重试。", "I cannot verify the available balance right now. Please try again later."), mode=mode)
    if Decimal(amount.amount) > available:
        name = source.get("displayName", _t(locale, "付款账户", "source account"))
        reply = f"{name} has {available:.2f} {amount.currency} available, which is not enough to prepare this transfer." if locale == "en" else f"{name}的可用余额为 {available:.2f} {amount.currency}，不足以准备这笔转账。"
        return ChatResponse(reply=reply, mode=mode, citations=_citation(_t(locale, "我的账户", "My accounts"), "/app/accounts"))
    recipient = matches[0]
    source_id, recipient_id = source.get("id"), recipient.get("id")
    if not all(isinstance(v, str) and _ID.fullmatch(v) for v in (source_id, recipient_id)):
        return ChatResponse(reply=_t(locale, "账户或收款人标识无法安全识别，请在转账页面操作。", "I cannot safely identify the account or recipient. Please use the transfer page."), mode=mode)
    source_name = source.get("displayName", _t(locale, "账户", "account"))
    recipient_name = recipient.get("displayName", _t(locale, "收款人", "recipient"))
    summary = (
        f"Transfer {amount.amount} {amount.currency} from {source_name} to {recipient_name}."
        if locale == "en" else
        f"从{source_name}向{recipient_name}转账 {amount.amount} {amount.currency}。"
    )
    proposal = TransferProposal(sourceAccountId=source_id, recipientId=recipient_id, amount=amount, summary=summary)
    return ChatResponse(
        reply=summary + _t(locale, "我已生成转账提案。请在转账页面核对收款人和金额并明确确认；银行会根据当日累计金额要求额外验证。", " I prepared a transfer proposal. Review the recipient and amount in the transfer page and confirm explicitly. The bank may require extra verification based on today's cumulative transfers."),
        mode=mode,
        citations=_citation(_t(locale, "转账", "Transfers"), "/app/payments"),
        proposal=proposal,
    )


async def _cards(message: str, cookie: str, gateway: BankingGateway, mode: str, locale: str) -> ChatResponse:
    cards = _entries(await gateway.customer_get("/customer/cards", cookie))
    if not cards:
        return ChatResponse(reply=_t(locale, "当前没有卡片记录。", "There are no cards to show."), mode=mode)
    action = bool(re.search(r"挂失|冻结|解冻|锁卡|关闭|打开|lost|freeze|unfreeze|lock|unlock", message, re.IGNORECASE))
    if action:
        matches = _matching_item(message, cards)
        selected = matches[0] if len(matches) == 1 else cards[0] if not matches and len(cards) == 1 else None
        if selected is None:
            return ChatResponse(reply=_t(locale, "请说明要处理哪张卡。我可以带你到卡片详情页，由银行页面核对和验证操作。", "Please name the card you want to manage. I can take you to its details, where the bank reviews and verifies the action."), mode=mode, citations=_citation(_t(locale, "卡片", "Cards"), "/app/cards"))
        proposal = _navigate("CARDS", selected, _t(locale, "继续操作", "continue"), locale)
        if proposal:
            name = selected.get("displayName", _t(locale, "卡片", "Card"))
            status = selected.get("status", _t(locale, "未知", "unknown"))
            reply = f"{name} is currently {status}. Review the next action on its detail page." if locale == "en" else f"{name}当前状态：{status}。请到详情页确认下一步操作。"
            return ChatResponse(reply=reply, mode=mode, citations=_citation(_t(locale, "卡片详情", "Card details"), proposal.href), proposal=proposal)
    detail = (_t(locale, "；", "; ")).join(
        f"{card.get('displayName', 'Card')} ({card.get('maskedNumber', '')}): {card.get('status', 'unknown')}"
        if locale == "en" else
        f"{card.get('displayName', '卡片')}（{card.get('maskedNumber', '')}）：{card.get('status', '未知')}"
        for card in cards[:6]
    )
    return ChatResponse(reply=detail + _t(locale, "。", "."), mode=mode, citations=_citation(_t(locale, "我的卡片", "My cards"), "/app/cards"))


async def _recurring(message: str, cookie: str, gateway: BankingGateway, mode: str, locale: str) -> ChatResponse:
    items = _entries(await gateway.customer_get("/customer/recurring-payments", cookie))
    if not items:
        return ChatResponse(reply=_t(locale, "当前没有订阅或代扣记录。", "There are no subscriptions or recurring payments to show."), mode=mode)
    action = bool(re.search(r"取消|停止|关闭|停掉|解除|cancel|stop|disable", message, re.IGNORECASE))
    if action:
        active = [item for item in items if item.get("status") == "ACTIVE"]
        matches = _matching_item(message, active)
        selected = matches[0] if len(matches) == 1 else active[0] if not matches and len(active) == 1 else None
        if selected is None:
            return ChatResponse(reply=_t(locale, "请说明要处理哪项订阅或代扣。我可以带你到详情页，由银行页面确认是否可停止。", "Please name the subscription or recurring payment. I can take you to its details, where the bank determines whether it can be stopped."), mode=mode, citations=_citation(_t(locale, "订阅与代扣", "Subscriptions and recurring payments"), "/app/spending"))
        proposal = _navigate("RECURRING", selected, _t(locale, "查看能否停止未来扣款", "check whether future payments can be stopped"), locale)
        if proposal:
            name = selected.get("displayName", _t(locale, "订阅", "Subscription"))
            status = selected.get("status", _t(locale, "未知", "unknown"))
            reply = f"{name} is currently {status}. The banking page decides whether it can be stopped; please review it there." if locale == "en" else f"{name}当前状态：{status}。是否可停止由银行页面判断；请先核对。"
            return ChatResponse(reply=reply, mode=mode, citations=_citation(_t(locale, "代扣详情", "Recurring payment details"), proposal.href), proposal=proposal)
    detail = (_t(locale, "；", "; ")).join(
        f"{item.get('displayName', 'Subscription')}: {item.get('status', 'unknown')}, usual amount {_money(item.get('usualAmount'), locale)}"
        if locale == "en" else
        f"{item.get('displayName', '订阅')}：{item.get('status', '未知')}，常见金额 {_money(item.get('usualAmount'), locale)}"
        for item in items[:6]
    )
    return ChatResponse(reply=detail + _t(locale, "。", "."), mode=mode, citations=_citation(_t(locale, "订阅与代扣", "Subscriptions and recurring payments"), "/app/spending"))

"""Bounded transfer task loop and trusted confirmation/execution boundary."""

from __future__ import annotations

import asyncio
import hashlib
import re
from datetime import datetime, timezone
from decimal import Decimal, InvalidOperation
from http.cookies import SimpleCookie
from typing import Any
from uuid import uuid4

from .banking import BankingApiError, BankingAuthenticationError, BankingGateway, BankingUnavailableError
from .task_audit import InMemoryAuditSink
from .task_models import AgentResponse, ConfirmRequest, Plan, PlanStep, TaskState, TaskStatus
from .task_store import InMemoryTaskStateStore, TaskStateStore
from .tool_registry import ToolRegistry
from .transfer_planner import Planner, next_required_tool
from .transfer_policy import PolicyContext, PolicyDecision, TransferPolicy


MAX_AGENT_STEPS = 10
_AMOUNT = re.compile(r"(?<![A-Za-z0-9.])(?P<amount>(?:0|[1-9][0-9]{0,8})(?:\.[0-9]{1,2})?)\s*(?P<unit>元|块|人民币|CNY)?(?:\b|$)", re.IGNORECASE)
_ID = re.compile(r"[A-Za-z0-9_-]{1,128}\Z")


def looks_like_transfer_command(message: str) -> bool:
    return bool(re.search(r"(?:转给|汇给|给.{1,60}转|转账.{0,60}给|transfer\s+\d|send\s+\d)", message, re.IGNORECASE))


def session_binding(cookie: str) -> str:
    parsed = SimpleCookie()
    parsed.load(cookie)
    value = next((parsed[key].value for key in ("SESSION", "JSESSIONID") if key in parsed), "")
    if not value:
        raise BankingAuthenticationError
    return hashlib.sha256(value.encode()).hexdigest()


def extract_slots(message: str) -> tuple[str | None, str | None]:
    """Extract only candidate text; canonical identities come from Banking Core."""
    amount = None
    match = _AMOUNT.search(message)
    if match:
        try:
            value = Decimal(match.group("amount"))
            if value.is_finite() and value > 0:
                amount = f"{value:.2f}"
        except InvalidOperation:
            pass
    recipient = None
    patterns = (
        r"(?:转给|汇给)\s*(.+?)\s*(?=\d+(?:\.\d+)?\s*(?:元|块|人民币|CNY)?(?:\b|$))",
        r"给\s*(.{1,60}?)\s*(?:转|汇)\s*\d",
        r"(?:transfer|send)\s+\d+(?:\.\d+)?\s*(?:CNY|yuan)?\s+to\s+(.+)$",
        r"(?:转账|汇款)\s*\d+(?:\.\d+)?\s*(?:元|块|人民币|CNY)?\s*(?:给|到)\s*(.{1,60})$",
        r"(?:转给|汇给)\s*(.{1,60})$",
        r"不是.{1,60}?是\s*(.{1,60})$",
    )
    for pattern in patterns:
        found = re.search(pattern, message, re.IGNORECASE)
        if found:
            recipient = found.group(1).strip(" ，。.!?")[:100]
            break
    return amount, recipient or None


class TransferRuntime:
    def __init__(self, gateway: BankingGateway, planner: Planner,
                 store: TaskStateStore | None = None, audit: InMemoryAuditSink | None = None,
                 policy: TransferPolicy | None = None, max_steps: int = MAX_AGENT_STEPS):
        if not 1 <= max_steps <= MAX_AGENT_STEPS:
            raise ValueError("Invalid Agent step limit")
        self.gateway = gateway
        self.planner = planner
        self.store = store or InMemoryTaskStateStore()
        self.audit = audit or InMemoryAuditSink()
        self.policy = policy or TransferPolicy()
        self.tools = ToolRegistry(gateway)
        self.max_steps = max_steps
        self._lock = asyncio.Lock()  # process-local task serialization; Spring owns financial atomicity.

    async def _identity(self, cookie: str) -> tuple[str, str]:
        binding = session_binding(cookie)
        session = await self.gateway.customer_get("/customer/session", cookie)
        user = session.get("user")
        if session.get("authenticated") is not True or not isinstance(user, dict) or not isinstance(user.get("id"), str):
            raise BankingAuthenticationError
        return binding, user["id"]

    async def _owned(self, task_id: str, cookie: str) -> TaskState:
        binding, customer = await self._identity(cookie)
        task = await self.store.get(task_id)
        if task is None or task.session_binding != binding or task.customer_id != customer:
            raise BankingApiError(404, "AGENT_TASK_NOT_FOUND")
        return task

    def _event(self, task: TaskState, name: str, **fields: Any) -> None:
        self.audit.record(name, task.task_id, task.session_binding, **fields)

    async def _save(self, task: TaskState) -> None:
        task.updated_at = datetime.now(timezone.utc)
        await self.store.save(task)

    @staticmethod
    def _response(task: TaskState, message: str, *, code: str | None = None) -> AgentResponse:
        intent = task.active_intent
        return AgentResponse(task_id=task.task_id, status=task.status, message=message,
                             mode=task.planner_mode,
                             steps=task.plan.steps, confirmation_required=task.status in {TaskStatus.WAITING_CONFIRMATION, TaskStatus.WAITING_AUTH},
                             confirmation=intent if task.status in {TaskStatus.WAITING_CONFIRMATION, TaskStatus.WAITING_AUTH} else None,
                             options=task.candidates if task.status == TaskStatus.WAITING_USER else [],
                             receipt=task.receipt, error_code=code)

    async def chat(self, message: str, cookie: str, task_id: str | None = None) -> AgentResponse:
        async with self._lock:
            if re.search(r"美元|美金|\bUSD\b|\bdollars?\b", message, re.IGNORECASE):
                raise BankingApiError(400, "TRANSFER_CNY_ONLY")
            binding, customer = await self._identity(cookie)
            if task_id:
                task = await self._owned(task_id, cookie)
                if task.status in {TaskStatus.SUCCEEDED, TaskStatus.FAILED, TaskStatus.CANCELLED}:
                    return self._response(task, "这项任务已经结束。请开始新任务。")
                if task.execution_uncertain:
                    return self._response(task, "银行执行结果尚未确认。请使用原确认与授权重试查询结果。", code="EXECUTION_OUTCOME_UNKNOWN")
            else:
                task = TaskState(session_binding=binding, customer_id=customer)
                self._event(task, "TASK_CREATED")
            amount, recipient = extract_slots(message)
            choice = re.fullmatch(r"(?:第)?([1-9一二三四五六七八九])(?:个)?", message.strip()) if task.candidates else None
            if choice:
                token = choice.group(1)
                index = (int(token) if token.isdigit() else "一二三四五六七八九".index(token) + 1) - 1
                if index >= len(task.candidates):
                    return self._response(task, "请选择列出的收款人编号。")
                chosen = task.candidates[index]
                task.slots.recipient_id = chosen["recipient_id"]
                task.slots.recipient_query = chosen["display_name"]
                task.candidates = []
                self._add_step(task, "resolve_recipient", {"recipient_id": chosen["recipient_id"]})
            elif amount or recipient:
                changed = (amount is not None and amount != task.slots.amount) or (recipient is not None and recipient != task.slots.recipient_query)
                if task.active_intent and changed:
                    # The old Spring intent remains until expiry, but this task
                    # can never confirm it after the revision changes.
                    task.active_intent = None
                    task.plan = Plan(revision=task.plan.revision + 1)
                    task.execution_key = "agent_" + uuid4().hex
                    task.slots.source_account_id = None
                    task.slots.recipient_id = None
                if amount:
                    task.slots.amount = amount
                if recipient:
                    task.slots.recipient_query = recipient
                    task.slots.recipient_id = None
            elif task.status in {TaskStatus.WAITING_CONFIRMATION, TaskStatus.WAITING_AUTH}:
                return self._response(task, "请在确认卡中核对原始金额与收款人，或明确说出要修改的金额/收款人。")
            if not task.slots.amount or not task.slots.recipient_query:
                task.status = TaskStatus.WAITING_USER
                await self._save(task)
                return self._response(task, "请提供收款人和金额，例如“给张三转500元”。")
            task.status = TaskStatus.RUNNING
            await self._save(task)
            return await self._advance(task, cookie)

    def _add_step(self, task: TaskState, tool: str, result: dict[str, Any]) -> None:
        depends = [task.plan.steps[-1].step_id] if task.plan.steps else []
        step = PlanStep(step_id=f"s{len(task.plan.steps) + 1}", tool=tool, depends_on=depends,
                        status="SUCCEEDED", result=result, at=datetime.now(timezone.utc))
        task.plan.steps.append(step)

    async def _advance(self, task: TaskState, cookie: str) -> AgentResponse:
        for _ in range(self.max_steps):
            required = next_required_tool(task)
            allowed = [required] if required else []
            successful = {step.tool for step in task.plan.steps if step.status == "SUCCEEDED"}
            if required in {"list_accounts", "resolve_recipient", "prepare_transfer"}:
                if "list_transactions" not in successful:
                    allowed.append("list_transactions")
                if task.slots.source_account_id and "get_account" not in successful:
                    allowed.append("get_account")
            try:
                decision = await self.planner.next_action(task, allowed)
                if getattr(self.planner, "last_mode", "DETERMINISTIC") == "DEEPSEEK":
                    task.planner_mode = "DEEPSEEK"
                self._event(task, "PLANNER_DECISION", metadata={"status": decision.type})
                if decision.type == "ASK_USER":
                    task.status = TaskStatus.WAITING_USER
                    await self._save(task)
                    return self._response(task, decision.question or "请补充信息。")
                if decision.type == "COMPLETE":
                    if required or not task.active_intent:
                        raise ValueError("Premature planner completion")
                    task.status = TaskStatus.WAITING_CONFIRMATION
                    self._event(task, "CONFIRMATION_REQUESTED", intent_id=task.active_intent["id"])
                    await self._save(task)
                    return self._response(task, "已创建转账复核单。请核对收款人、金额、费用和总扣款后确认。")
                if decision.type != "TOOL_CALL" or decision.tool not in allowed or decision.arguments != {}:
                    raise ValueError("Unauthorized planner tool or arguments")
                name = decision.tool
                if name == "list_accounts":
                    arguments = {}
                elif name == "resolve_recipient":
                    arguments = {"query": task.slots.recipient_query}
                elif name == "list_transactions":
                    arguments = {"limit": 10}
                elif name == "get_account":
                    arguments = {"id": task.slots.source_account_id}
                elif name == "get_transfer_intent":
                    arguments = {"id": task.active_intent["id"]} if task.active_intent else {}
                elif name == "prepare_transfer":
                    if not task.slots.source_account_id or not task.slots.recipient_id or not task.slots.amount:
                        raise ValueError("Missing verified transfer slots")
                    policy = self.policy.decide(PolicyContext(action="PREPARE_TRANSFER", authenticated=True))
                    self._event(task, "POLICY_DECISION", metadata={"decision": policy.value})
                    if policy != PolicyDecision.ALLOW:
                        raise ValueError("Preparation denied")
                    arguments = {"source_account_id": task.slots.source_account_id,
                                 "recipient_id": task.slots.recipient_id, "amount": task.slots.amount, "currency": "CNY"}
                else:
                    raise ValueError("Tool is not available in this transfer phase")
                self.tools.validate(name, arguments)
                self._event(task, "TOOL_CALL", tool=name)
                observation = await self.tools.call(name, arguments, cookie)
                self._event(task, "TOOL_RESULT", tool=name, metadata={"status": "OK"})
                data = observation.data
                if name == "list_accounts":
                    accounts = data.get("accounts", data.get("items", []))
                    eligible = [a for a in accounts if isinstance(a, dict) and a.get("status") == "ACTIVE"
                                and a.get("type") == "CURRENT" and a.get("currency") == "CNY"] if isinstance(accounts, list) else []
                    if len(eligible) != 1 or not isinstance(eligible[0].get("id"), str):
                        task.status = TaskStatus.WAITING_USER
                        await self._save(task)
                        return self._response(task, "无法唯一确定人民币付款活期账户，请在付款页面选择账户。")
                    task.slots.source_account_id = eligible[0]["id"]
                    self._add_step(task, name, {"count": len(eligible)})
                elif name == "resolve_recipient":
                    candidates = data["candidates"]
                    if data["status"] != "RESOLVED":
                        task.candidates = candidates
                        task.status = TaskStatus.WAITING_USER
                        if candidates:
                            self._event(task, "RECIPIENT_AMBIGUOUS", metadata={"candidate_count": len(candidates)})
                        await self._save(task)
                        return self._response(task, "找到多位匹配的收款人，请选择编号。" if candidates else "没有找到已保存的收款人，请先在付款页面添加。")
                    task.slots.recipient_id = candidates[0]["recipient_id"]
                    self._add_step(task, name, {"recipient_id": task.slots.recipient_id})
                elif name == "prepare_transfer":
                    if data.get("status") != "PREPARED" or not all(isinstance(data.get(key), str) for key in ("id", "intentHash", "expiresAt")):
                        raise ValueError("Invalid prepared intent")
                    task.active_intent = data
                    self._add_step(task, name, {"intent_id": data["id"]})
                    self._event(task, "ACTION_PREPARED", intent_id=data["id"])
                elif name == "get_transfer_intent":
                    if not task.active_intent or data.get("id") != task.active_intent["id"] or data.get("intentHash") != task.active_intent["intentHash"]:
                        raise ValueError("Prepared intent changed")
                    self._add_step(task, name, {"status": str(data.get("status", "UNKNOWN"))})
                elif name == "get_account":
                    self._add_step(task, name, {"status": str(data.get("status", "UNKNOWN"))})
                elif name == "list_transactions":
                    items = data.get("items", [])
                    self._add_step(task, name, {"count": len(items) if isinstance(items, list) else 0})
                await self._save(task)
            except (ValueError, BankingApiError, BankingUnavailableError) as exc:
                task.status = TaskStatus.FAILED
                code = exc.code if isinstance(exc, BankingApiError) else "AGENT_PLAN_FAILED" if isinstance(exc, ValueError) else "BANKING_UNAVAILABLE"
                self._event(task, "ACTION_FAILED", metadata={"code": code})
                await self._save(task)
                return self._response(task, "无法安全完成这项转账准备，请检查资料后重试。", code=code)
        task.status = TaskStatus.FAILED
        self._event(task, "ACTION_FAILED", metadata={"code": "MAX_AGENT_STEPS"})
        await self._save(task)
        return self._response(task, "任务超过安全步骤上限，未执行转账。", code="MAX_AGENT_STEPS")

    async def confirm(self, task_id: str, body: ConfirmRequest, cookie: str) -> AgentResponse:
        async with self._lock:
            task = await self._owned(task_id, cookie)
            if task.status == TaskStatus.SUCCEEDED:
                return self._response(task, "转账已完成。")
            intent = task.active_intent
            if task.status not in {TaskStatus.WAITING_CONFIRMATION, TaskStatus.WAITING_AUTH} or not intent:
                raise BankingApiError(409, "AGENT_TASK_NOT_CONFIRMABLE")
            if body.intent_id != intent.get("id") or body.intent_hash != intent.get("intentHash"):
                raise BankingApiError(409, "TRANSFER_INTENT_HASH_MISMATCH")
            self._event(task, "CONFIRMATION_RECEIVED", intent_id=body.intent_id)
            saved = await self.tools.call("get_transfer_intent", {"id": body.intent_id}, cookie)
            terms = saved.data
            if terms.get("intentHash") != body.intent_hash or terms.get("status") not in ({"PREPARED", "EXECUTED"} if task.execution_uncertain else {"PREPARED"}):
                raise BankingApiError(409, "STALE_STATE")
            try:
                expiry = datetime.fromisoformat(terms["expiresAt"].replace("Z", "+00:00"))
                if expiry.tzinfo is None or (not task.execution_uncertain and datetime.now(timezone.utc) >= expiry):
                    raise BankingApiError(409, "TRANSFER_INTENT_EXPIRED")
                if not task.execution_uncertain:
                    total = Decimal(terms["totalDebit"]["amount"])
                    available = Decimal((await self.tools.call("get_account", {"id": task.slots.source_account_id}, cookie)).data["availableBalance"]["amount"])
                    if total > available:
                        raise BankingApiError(409, "INSUFFICIENT_FUNDS")
            except (KeyError, TypeError, InvalidOperation) as exc:
                raise BankingApiError(409, "STALE_STATE") from exc
            policy = self.policy.decide(PolicyContext(action="EXECUTE_TRANSFER", amount=task.slots.amount, authenticated=True))
            self._event(task, "POLICY_DECISION", metadata={"decision": policy.value})
            if policy == PolicyDecision.DENY:
                raise BankingApiError(403, "POLICY_DENIED")
            if policy == PolicyDecision.REQUIRE_AUTH and not body.action_authorization_id:
                task.status = TaskStatus.WAITING_AUTH
                self._event(task, "AUTH_REQUESTED", intent_id=body.intent_id)
                await self._save(task)
                return self._response(task, "请完成与本笔转账绑定的身份验证。")
            if task.execution_uncertain and body.action_authorization_id != task.execution_authorization_id:
                raise BankingApiError(409, "EXECUTION_RETRY_MUST_USE_SAME_AUTHORIZATION")
            if body.action_authorization_id:
                task.execution_authorization_id = body.action_authorization_id
            try:
                receipt = await self.gateway.execute_transfer(cookie, {
                    "intentId": body.intent_id, "intentHash": body.intent_hash,
                    **({"actionAuthorizationId": body.action_authorization_id} if body.action_authorization_id else {}),
                }, task.execution_key)
            except BankingUnavailableError:
                # Outcome unknown: retain the same key and exact request for a
                # safe retry. Spring checks idempotency before consuming auth.
                task.status = TaskStatus.WAITING_AUTH
                task.execution_uncertain = True
                await self._save(task)
                return self._response(task, "银行响应超时。可用相同授权重试确认，系统不会重复扣款。", code="EXECUTION_OUTCOME_UNKNOWN")
            except BankingApiError as exc:
                task.status = TaskStatus.FAILED
                self._event(task, "ACTION_FAILED", intent_id=body.intent_id, metadata={"code": exc.code})
                await self._save(task)
                return self._response(task, "银行拒绝执行这笔转账，请重新准备并核对。", code=exc.code)
            task.receipt = receipt
            task.execution_uncertain = False
            task.status = TaskStatus.SUCCEEDED
            self._event(task, "AUTH_COMPLETED", intent_id=body.intent_id)
            self._event(task, "ACTION_EXECUTED", intent_id=body.intent_id)
            self._event(task, "TASK_COMPLETED", intent_id=body.intent_id)
            await self._save(task)
            return self._response(task, "转账成功。请查看银行回执。")

    async def cancel(self, task_id: str, cookie: str) -> AgentResponse:
        async with self._lock:
            task = await self._owned(task_id, cookie)
            if task.status == TaskStatus.SUCCEEDED:
                raise BankingApiError(409, "TRANSFER_ALREADY_COMPLETED")
            if task.execution_uncertain:
                raise BankingApiError(409, "EXECUTION_OUTCOME_UNKNOWN")
            task.status = TaskStatus.CANCELLED
            task.active_intent = None
            await self._save(task)
            return self._response(task, "已取消 Agent 任务，银行端未执行扣款。")

    async def get(self, task_id: str, cookie: str) -> AgentResponse:
        task = await self._owned(task_id, cookie)
        return self._response(task, "当前任务状态。")

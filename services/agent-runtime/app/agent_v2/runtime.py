"""Generic bounded LLM → tool → observation loop with a trusted financial boundary."""

from __future__ import annotations

import asyncio
import hashlib
import json
import logging
import re
import httpx
from pydantic import ValidationError
from datetime import datetime, timezone
from decimal import Decimal
from http.cookies import SimpleCookie
from typing import Any, Awaitable, Callable
from uuid import uuid4

from ..banking import BankingApiError, BankingAuthenticationError, BankingGateway, BankingUnavailableError
from ..task_models import AgentResponse, ConfirmRequest, PlanStep, TaskStatus
from ..transfer_policy import PolicyContext, PolicyDecision, TransferPolicy
from .context import ContextBuilder
from .analytical_scope import effective_arguments, record_scope
from .grounding import coverage_notice, validate_analytical_reply
from .analysis_safety import readonly_user_turn
from .completeness import mark_cancelled_financial_step, preparation_blocker, update_ledger
from .lifecycle import CancellationUncertain, LifecycleCoordinator
from .models import Observation, PlannerDecision, Status, Task
from .planner import Planner
from .recipient_names import mask_phone_text
from .tools import RegistryError, ToolRegistry

LOGGER = logging.getLogger(__name__)


def _trace_safe(value: Any) -> Any:
    if isinstance(value, str):
        return mask_phone_text(value)
    if isinstance(value, dict):
        return {key: _trace_safe(item) for key, item in value.items()}
    if isinstance(value, list):
        return [_trace_safe(item) for item in value]
    return value


def session_binding(cookie: str) -> str:
    parsed = SimpleCookie()
    parsed.load(cookie)
    session = next((parsed[name].value for name in ("SESSION", "JSESSIONID") if name in parsed), "")
    if not session:
        raise BankingAuthenticationError
    return hashlib.sha256(session.encode()).hexdigest()


def _remove_superseded_action_offer(message: str) -> str:
    """Do not present a cancelled review as a still-pending action."""
    paragraphs = re.split(r"(\n\s*\n)", message)
    kept: list[str] = []
    for index in range(0, len(paragraphs), 2):
        paragraph = paragraphs[index]
        if re.search(r"(?:上一条|之前|原本).{0,40}(?:申购|赎回|转账).{0,100}(?:继续|复核单|待确认)",
                     paragraph, re.IGNORECASE | re.DOTALL):
            continue
        if kept and index > 0:
            kept.append("\n\n")
        kept.append(paragraph)
    return "".join(kept).strip()


class AgentRuntimeV2:
    def __init__(self, gateway: BankingGateway, planner: Planner, *, max_steps: int = 10,
                 mcp_bridge: Any | None = None, state_store: Any | None = None):
        if not 1 <= max_steps <= 30:
            raise ValueError("Invalid step cap")
        self.gateway = gateway
        self.planner = planner
        self.registry = ToolRegistry(gateway, mcp_bridge=mcp_bridge)
        self.context_builder = ContextBuilder()
        self.lifecycle = LifecycleCoordinator(gateway)
        self.policy = TransferPolicy()
        self.max_steps = max_steps
        self.tasks: dict[str, Task] = {}
        self.state_store = state_store
        self.worker_id = uuid4().hex
        self._chat_requests: dict[tuple[str, str, str], tuple[tuple[str, str | None], str]] = {}
        self._lock = asyncio.Lock()

    async def _identity(self, cookie: str) -> tuple[str, str]:
        binding = session_binding(cookie)
        response = await self.gateway.customer_get("/customer/session", cookie)
        user = response.get("user")
        if response.get("authenticated") is not True or not isinstance(user, dict) or not isinstance(user.get("id"), str):
            raise BankingAuthenticationError
        return binding, user["id"]

    async def _owned(self, task_id: str, cookie: str) -> Task:
        binding, customer = await self._identity(cookie)
        task = (self.state_store.load(task_id, customer, binding) if self.state_store
                else self.tasks.get(task_id))
        if task is None or task.session_binding != binding or task.customer_id != customer:
            raise BankingApiError(404, "AGENT_TASK_NOT_FOUND")
        self.tasks[task_id] = task
        return task

    @staticmethod
    def _response(task: Task, message: str, code: str | None = None, options: list[dict[str, str]] | None = None) -> AgentResponse:
        status = TaskStatus.FAILED if task.status == Status.BLOCKED else TaskStatus(task.status.value)
        steps = [PlanStep(step_id=f"s{index + 1}", tool=entry["tool"], status="SUCCEEDED", result=entry.get("result"),
                          at=datetime.now(timezone.utc)) for index, entry in enumerate(task.trace) if entry.get("kind") == "TOOL_RESULT"]
        confirmation = task.active_intent if task.status in {Status.WAITING_CONFIRMATION, Status.WAITING_AUTH} else None
        return AgentResponse(task_id=task.task_id, status=status, mode="DEEPSEEK", message=message, steps=steps,
                             confirmation_required=confirmation is not None, confirmation=confirmation,
                             options=options or [], receipt=task.receipt,
                             completed_actions=task.completed_actions,
                             failed_actions=task.failed_actions, error_code=code)

    def _save(self, task: Task) -> None:
        task.updated_at = datetime.now(timezone.utc)
        if self.state_store:
            self.state_store.save(task, self.worker_id)
            if task.conversation_id:
                self.state_store.thread_bind(task.customer_id, task.session_binding,
                                             task.conversation_id, task.task_id)
        self.tasks[task.task_id] = task

    @staticmethod
    def _recipient_choices(task: Task) -> dict[str, dict[str, str]]:
        choices: dict[str, dict[str, str]] = {}
        for observation in task.observations:
            if observation.tool_name == "resolve_recipient" and observation.success:
                for candidate in observation.structured_result.get("candidates", []):
                    if isinstance(candidate, dict) and isinstance(candidate.get("recipient_id"), str):
                        choices[candidate["recipient_id"]] = candidate
            elif observation.tool_name == "list_transactions" and observation.success:
                for row in observation.structured_result.get("transactions", []):
                    if not isinstance(row, dict) or not isinstance(row.get("verified_recipient_id"), str):
                        continue
                    amount = row.get("amount") if isinstance(row.get("amount"), dict) else {}
                    date = row.get("timestamp") if isinstance(row.get("timestamp"), str) else ""
                    choices[row["verified_recipient_id"]] = {
                        "recipient_id": row["verified_recipient_id"],
                        "display_name_untrusted": str(row.get("counterparty_untrusted") or "历史收款人")
                        + (f" · {date[:10]}" if date else "")
                        + (f" · {amount['amount']} {amount.get('currency', '')}"
                           if isinstance(amount.get("amount"), str) else ""),
                        "masked_account": str(row.get("counterparty_masked_account") or ""),
                    }
        return choices

    async def _fail(self, task: Task, cookie: str, reason: str, code: str) -> AgentResponse:
        try:
            await self.lifecycle.cancel_active(task, cookie, reason)
        except CancellationUncertain:
            task.status = Status.BLOCKED
            task.trace.append({"kind": "FAILED_SAFE", "code": "BANK_INTENT_STATE_UNKNOWN"})
            self._save(task)
            return self._response(task, "银行端预备转账状态暂时无法确认；请勿重复发起或确认。", "BANK_INTENT_STATE_UNKNOWN")
        task.status = Status.PARTIAL if task.completed_actions else Status.FAILED
        task.trace.append({"kind": "FAILED", "code": code})
        if task.ledger:
            update_ledger(task)
        self._save(task)
        message = ("后续步骤未能完成；此前已确认的银行操作不会自动撤销。请查看已完成操作和银行回执。"
                   if task.completed_actions else "这项请求未能完成，请核对信息后重试。")
        return self._response(task, message, code)

    async def chat(self, message: str, cookie: str, task_id: str | None = None,
                   request_id: str | None = None,
                   event_sink: Callable[[str, str], Awaitable[None]] | None = None,
                   conversation_id: str | None = None) -> AgentResponse:
        if not self.state_store:
            return await self._chat_impl(message, cookie, task_id, request_id, event_sink,
                                         conversation_id=conversation_id)
        binding, customer = await self._identity(cookie)
        prior = self.state_store.request_lookup(customer, binding, request_id) if request_id else None
        leased_task_id = prior[1] if prior else task_id
        new_task_id = uuid4().hex if leased_task_id is None else None
        if leased_task_id:
            await self._owned(leased_task_id, cookie)
            try:
                self.state_store.acquire(leased_task_id, self.worker_id)
            except Exception as exc:
                raise BankingApiError(409, "TASK_STATE_CONFLICT") from exc
        try:
            return await self._chat_impl(message, cookie, task_id, request_id, event_sink,
                                         new_task_id, conversation_id)
        finally:
            self.state_store.release(leased_task_id or new_task_id, self.worker_id)

    async def _chat_impl(self, message: str, cookie: str, task_id: str | None = None,
                         request_id: str | None = None,
                         event_sink: Callable[[str, str], Awaitable[None]] | None = None,
                         new_task_id: str | None = None,
                         conversation_id: str | None = None) -> AgentResponse:
        if not message.strip():
            raise BankingApiError(422, "INVALID_REQUEST")
        if re.search(r"(?:password|密码|验证码|\bOTP\b|\bPIN\b|\bCVV\b|\bsk-[A-Za-z0-9]{12,})", message, re.IGNORECASE):
            raise BankingApiError(400, "SENSITIVE_INPUT_NOT_ACCEPTED")
        async with self._lock:
            binding, customer = await self._identity(cookie)
            request_key = (binding, customer, request_id) if request_id else None
            fingerprint = (message.strip(), task_id)
            if request_key and not self.state_store and request_key in self._chat_requests:
                prior_fingerprint, prior_task_id = self._chat_requests[request_key]
                if prior_fingerprint != fingerprint:
                    raise BankingApiError(409, "AGENT_REQUEST_ID_CONFLICT")
                prior_task = self.tasks.get(prior_task_id)
                if prior_task is None:
                    raise BankingApiError(409, "AGENT_REQUEST_STATE_UNKNOWN")
                return self._response(prior_task, "相同请求已处理；以下是当前任务状态。")
            if request_key and self.state_store:
                prior = self.state_store.request_lookup(customer, binding, request_id)
                if prior:
                    expected = hashlib.sha256(json.dumps([message.strip(), task_id], ensure_ascii=False).encode()).hexdigest()
                    if prior[0] != expected:
                        raise BankingApiError(409, "AGENT_REQUEST_ID_CONFLICT")
                    prior_task = self.state_store.load(prior[1], customer, binding)
                    if prior_task is None:
                        raise BankingApiError(409, "AGENT_REQUEST_STATE_UNKNOWN")
                    self.tasks[prior_task.task_id] = prior_task
                    if prior_task.status == Status.RUNNING and prior_task.pending_tool:
                        return await self._resume_interrupted(prior_task, cookie)
                    return self._response(prior_task, "相同请求已处理；以下是当前任务状态。")
            if task_id:
                task = await self._owned(task_id, cookie)
                if task.status == Status.RUNNING and task.pending_tool:
                    return await self._resume_interrupted(task, cookie)
                if conversation_id and task.conversation_id is None:
                    task.conversation_id = conversation_id
                if request_key:
                    self._chat_requests[request_key] = (fingerprint, task.task_id)
                if task.status == Status.BLOCKED:
                    try:
                        await self.lifecycle.cancel_active(task, cookie, "TASK_FAILED")
                    except CancellationUncertain:
                        return self._response(task, "旧 intent 状态仍无法确认，不能继续。", "BANK_INTENT_STATE_UNKNOWN")
                    task.status = Status.FAILED
                    self._save(task)
                    return self._response(task, "旧 intent 已确认失效。请开始新任务。")
                if task.status in {Status.FAILED, Status.CANCELLED}:
                    return self._response(task, "此任务已结束或暂停，请开始新任务。")
                if task.status == Status.PARTIAL:
                    if task.failed_actions or task.last_error and task.last_error.get("code") in {
                            "PREPARE_OUTCOME_UNKNOWN", "BANKING_RESULT_UNKNOWN"}:
                        return self._response(task, "部分操作已完成，失败或未知的银行状态需要人工核对；请开始新任务。",
                                              task.last_error.get("code") if task.last_error else "TASK_PARTIAL")
                    task.step_count = 0
                if task.status == Status.BLOCKED_PROVIDER:
                    task.step_count = 0
                    task.last_error = None
                if task.status == Status.SUCCEEDED:
                    task.step_count = 0
                if task.execution_uncertain:
                    return self._response(task, "执行结果待核实；请使用原授权安全重试。", "EXECUTION_OUTCOME_UNKNOWN")
                if hasattr(self.planner, "interpret_follow_up"):
                    try:
                        turn = await self.planner.interpret_follow_up(message.strip(), {
                            "current_goal": task.goal, "status": task.status.value,
                            "has_prepared_intent": task.active_intent is not None,
                            "observed_tools": list(dict.fromkeys(o.tool_name for o in task.observations if o.success))})
                        if (not isinstance(turn, dict) or turn.get("kind") not in {
                                "NEW_QUERY", "TASK_CONTINUATION", "CLARIFICATION", "PRESENTATION_CHANGE", "TASK_MODIFICATION",
                                "FINANCIAL_ACTION_MODIFICATION", "USER_CANCELLATION"}
                                or turn.get("presentation_preference") not in {
                                    "AUTO", "TEXT", "TABLE", "BAR_CHART", "LINE_CHART", "PIE_CHART"}):
                            raise ValueError("INVALID_TURN_INTERPRETATION")
                    except Exception:
                        return self._response(task, "无法核实本轮请求类型，原操作保持不变，请重试。", "TURN_INTERPRETATION_UNAVAILABLE")
                    if turn["kind"] == "PRESENTATION_CHANGE":
                        # A view preference cannot alter goals, terms, status,
                        # receipts, authorization, ledger or bank intent lifetime.
                        task.intent_profile["presentation_preference"] = turn["presentation_preference"]
                        task.conversation.append({"role": "user", "text": message.strip()})
                        task.trace.append({"kind": "PRESENTATION_CHANGE", "preference": turn["presentation_preference"]})
                        self._save(task)
                        if request_key and self.state_store:
                            self.state_store.request_bind(customer, binding, request_id, message, task_id, task.task_id)
                        return self._response(task, "已更新展示方式；银行操作及其有效期保持不变。")
                    if task.active_intent is not None and turn["kind"] == "TASK_MODIFICATION":
                        return await self._pending_read_query(task, message.strip(), cookie, event_sink)
                    if task.active_intent is not None and turn["kind"] in {"NEW_QUERY", "TASK_CONTINUATION", "CLARIFICATION"}:
                        return await self._pending_read_query(task, message.strip(), cookie, event_sink)
                    if task.active_intent is not None and turn["kind"] == "USER_CANCELLATION":
                        try:
                            tool = (task.pending_prepare or {}).get("tool")
                            await self.lifecycle.cancel_active(task, cookie, "USER_CANCELLED")
                        except CancellationUncertain:
                            return self._response(task, "银行取消结果待核实。", "BANK_INTENT_STATE_UNKNOWN")
                        mark_cancelled_financial_step(task, tool)
                        task.status = Status.CANCELLED
                        self._save(task)
                        return self._response(task, "银行已确认取消。")
                    if task.active_intent is None and turn["kind"] == "NEW_QUERY":
                        task.goal = message.strip()
                        task.ledger = []
                        task.intent_profile = {}
                        task.analytical_scope = {}
                        task.step_count = 0
                if task.active_intent is not None:
                    try:
                        await self.lifecycle.cancel_active(task, cookie, "TASK_REVISED")
                    except CancellationUncertain:
                        task.status = Status.BLOCKED
                        self._save(task)
                        return self._response(task, "旧转账尚未确认作废，不能准备新转账。", "BANK_INTENT_STATE_UNKNOWN")
                    task.revision += 1
                    task.observations.clear()
                    task.selected_recipient_id = None
                    task.presented_option_ids.clear()
                    task.step_count = 0
                    task.execution_key = ("agent_v2_" + hashlib.sha256(
                        f"{binding}:{request_id}".encode()).hexdigest()[:32]
                        if request_id else "agent_v2_" + uuid4().hex)
                elif task.status == Status.WAITING_USER:
                    # Choice is grounded in the exact previously observed candidate set.
                    choice = re.fullmatch(r"(?:第)?([1-9一二三四五六七八九])(?:个)?", message.strip())
                    if choice:
                        token = choice.group(1)
                        index = (int(token) if token.isdigit() else "一二三四五六七八九".index(token) + 1) - 1
                        if index < len(task.presented_option_ids):
                            task.selected_recipient_id = task.presented_option_ids[index]
            else:
                task = Task(task_id=new_task_id or uuid4().hex, session_binding=binding,
                            customer_id=customer, goal=message.strip(), conversation_id=conversation_id)
                if request_id:
                    task.execution_key = "agent_v2_" + hashlib.sha256(
                        f"{binding}:{request_id}".encode()).hexdigest()[:32]
            if request_key:
                self._chat_requests[request_key] = (fingerprint, task.task_id)
            prior_status = task.status
            if prior_status == Status.SUCCEEDED:
                # A new turn gets a fresh goal/ledger while retaining the same
                # owned conversation and earlier observations for references.
                task.goal = message.strip()
            observation_start = len(task.observations)
            task.conversation.append({"role": "user", "text": message.strip()})
            task.status = Status.RUNNING
            self._save(task)
            if request_key and self.state_store:
                self.state_store.request_bind(customer, binding, request_id, message, task_id, task.task_id)
            if (not task.ledger or prior_status == Status.SUCCEEDED) and hasattr(self.planner, "plan_subgoals"):
                try:
                    for ledger_attempt in range(2):
                        try:
                            task.ledger = await self.planner.plan_subgoals(message.strip(), self.registry.visible())
                            break
                        except (ValueError, ValidationError, json.JSONDecodeError):
                            if ledger_attempt == 1:
                                raise
                    for ledger_step in task.ledger:
                        ledger_step["observation_floor"] = len(task.observations)
                    task.intent_profile = task.ledger[0].pop("intent_profile", {}) if task.ledger else {}
                    if any("service_navigation" in step.get("evidence_tools", [])
                           for step in task.ledger):
                        task.observations.append(Observation(
                            tool_name="service_navigation", success=True,
                            structured_result={"service_ids": task.intent_profile.get("service_ids", [])},
                            trust="TRUSTED_UI_REGISTRY"))
                    task.trace.append({"kind": "TASK_LEDGER_CREATED", "steps": len(task.ledger)})
                    self._save(task)
                except Exception as exc:
                    if isinstance(exc, httpx.HTTPStatusError) and exc.response.status_code == 402:
                        task.status = Status.BLOCKED_PROVIDER
                        task.last_error = {"code": "MODEL_INSUFFICIENT_BALANCE", "phase": "TASK_PLANNING"}
                        self._save(task)
                        return self._response(task, "模型服务余额不足，任务已保存，银行操作没有自动重试。",
                                              "MODEL_INSUFFICIENT_BALANCE")
                    if isinstance(exc, httpx.HTTPStatusError) and exc.response.status_code == 429:
                        task.status = Status.BLOCKED_PROVIDER
                        task.last_error = {"code": "MODEL_RATE_LIMIT", "phase": "TASK_PLANNING"}
                        self._save(task)
                        return self._response(task, "模型服务暂时限流；任务已保存。", "MODEL_RATE_LIMIT")
                    if isinstance(exc, httpx.TimeoutException):
                        task.status = Status.BLOCKED_PROVIDER
                        task.last_error = {"code": "MODEL_TIMEOUT", "phase": "TASK_PLANNING"}
                        self._save(task)
                        return self._response(task, "模型响应超时；任务已保存。", "MODEL_TIMEOUT")
                    task.trace.append({"kind": "TASK_LEDGER_UNAVAILABLE", "type": type(exc).__name__})
                    task.status = Status.PARTIAL
                    code = "MODEL_INVALID_OUTPUT" if isinstance(exc, (ValueError, ValidationError,
                                                                       json.JSONDecodeError)) else "TASK_LEDGER_UNAVAILABLE"
                    task.last_error = {"code": code, "phase": "TASK_PLANNING"}
                    self._save(task)
                    return self._response(task, "无法建立可核实的任务清单；未继续执行银行工具。",
                                          code)
            return await self._run(task, cookie, observation_start, prior_status == Status.SUCCEEDED,
                                   event_sink)

    async def _pending_read_query(self, parent: Task, message: str, cookie: str, event_sink=None) -> AgentResponse:
        """Separate read ledger, no borrowed financial authorization or confirmation."""
        query = Task(session_binding=parent.session_binding, customer_id=parent.customer_id,
                     goal=message, read_only_overlay=True,
                     conversation=[{"role": "user", "text": message}])
        if hasattr(self.planner, "plan_subgoals"):
            try:
                query.ledger = await self.planner.plan_subgoals(message, self.registry.visible())
                query.intent_profile = query.ledger[0].pop("intent_profile", {}) if query.ledger else {}
            except Exception:
                return self._response(parent, "查询暂时不可用，原待确认操作保持不变。", "QUERY_PLANNING_UNAVAILABLE")
        if any(step.get("kind") == "FINANCIAL_ACTION" for step in query.ledger):
            return self._response(parent, "请先处理原待确认操作后再发起其他金融操作。", "PENDING_ACTION_PRESERVED")
        result = await self._run(query, cookie, 0, False, event_sink)
        parent.observations.extend(query.observations)
        parent.query_ledger = query.ledger
        parent.conversation.extend(query.conversation)
        parent.trace.append({"kind": "PENDING_READ_QUERY", "query_task_id": query.task_id,
                             "query_status": query.status.value})
        self._save(parent)
        return self._response(parent, result.message, result.error_code)

    async def _resume_interrupted(self, task: Task, cookie: str) -> AgentResponse:
        pending = task.pending_tool or {}
        tool = str(pending.get("tool", ""))
        if tool == "prepare_transfer":
            try:
                observation = await self.registry.call(tool, pending["arguments"], task, cookie)
                task.observations.append(observation)
                task.trace.append({"kind": "TOOL_RESULT_RECOVERED", "tool": tool,
                                   "result": observation.structured_result, "trust": observation.trust})
                task.pending_tool = None
                if task.active_intent is not None:
                    signature = hashlib.sha256(json.dumps(
                        [tool, pending["arguments"]], ensure_ascii=False, sort_keys=True,
                        separators=(",", ":")).encode()).hexdigest()
                    task.pending_prepare = {"tool": tool, "arguments": pending["arguments"],
                                            "signature": signature}
                    task.status = Status.WAITING_CONFIRMATION
                    self._save(task)
                    return self._response(task, "已用原请求键核对银行预备意图；请复核同一份待确认操作。")
            except Exception:
                task.status = Status.PARTIAL
                task.last_error = {"code": "PREPARE_OUTCOME_UNKNOWN", "phase": "RECOVERY"}
                self._save(task)
                return self._response(task, "银行预备意图结果未能核实；不会创建新的可执行意图。",
                                      "PREPARE_OUTCOME_UNKNOWN")
        elif tool.startswith("prepare_"):
            task.status = Status.PARTIAL
            task.last_error = {"code": "PREPARE_OUTCOME_UNKNOWN", "phase": "RECOVERY"}
            self._save(task)
            return self._response(task, "该操作的银行预备结果未知；请先核实，系统不会盲目重试。",
                                  "PREPARE_OUTCOME_UNKNOWN")
        else:
            task.trace.append({"kind": "READ_TOOL_INTERRUPTED", "tool": tool})
            task.pending_tool = None
            self._save(task)
        return await self._run(task, cookie, len(task.observations), False)

    async def _run(self, task: Task, cookie: str, observation_start: int, followup: bool,
                   event_sink: Callable[[str, str], Awaitable[None]] | None = None) -> AgentResponse:
        completion_retries = 0
        while task.step_count < self.max_steps:
            if task.ledger:
                update_ledger(task)
            context = self.context_builder.build(task, self.registry.visible())
            try:
                decision = PlannerDecision.model_validate(await self.planner.decide(context))
                task.trace.append({"kind": "PLANNER_DECISION", "step": task.step_count + 1,
                                   "decision": _trace_safe(decision.model_dump(mode="json"))})
                task.step_count += 1
                if (decision.type == "COMPLETE" and followup
                        and len(task.observations) == observation_start
                        and any(o.success and o.tool_name in {"summarize_spending", "detect_transaction_anomalies"}
                                for o in task.observations[:observation_start])):
                    # A new analytical turn cannot silently reuse data fetched
                    # under the preceding turn's scope. The model still picks
                    # the tool; the runtime only requires fresh evidence.
                    retry_context = self.context_builder.build(task, self.registry.visible())
                    retry_context["fresh_observation_required"] = (
                        "This is a new user turn. Call a read/analysis tool for this request before COMPLETE. "
                        "Previous observations have the old analytical scope.")
                    decision = PlannerDecision.model_validate(await self.planner.decide(retry_context))
                    task.trace.append({"kind": "FRESH_OBSERVATION_RETRY", "step": task.step_count + 1,
                                       "decision": _trace_safe(decision.model_dump(mode="json"))})
                    task.step_count += 1
                    if decision.type == "COMPLETE":
                        task.status = Status.FAILED
                        self._save(task)
                        return self._response(task, "本轮分析未取得新数据，请重试。", "STALE_ANALYTICAL_COMPLETION")
                if decision.type == "ASK_USER":
                    if task.active_intent is not None:
                        raise RegistryError("QUESTION_AFTER_PREPARATION")
                    if re.search(r"(?:password|密码|验证码|\bOTP\b|\bPIN\b|\bCVV\b)", decision.question.text, re.IGNORECASE):
                        raise RegistryError("UNSAFE_QUESTION")
                    candidate_by_id = self._recipient_choices(task)
                    if decision.question.options:
                        if not candidate_by_id or any(option.get("id") not in candidate_by_id for option in decision.question.options):
                            raise RegistryError("UNOBSERVED_CHOICE")
                        options = [{"id": option["id"], "label": candidate_by_id[option["id"]].get("display_name_untrusted", "") + " · " + (candidate_by_id[option["id"]].get("phone_masked") or "") + " · " + candidate_by_id[option["id"]].get("masked_account", "")}
                                   for option in decision.question.options]
                    else:
                        options = []
                    task.presented_option_ids = [option["id"] for option in options]
                    task.status = Status.WAITING_USER
                    self._save(task)
                    return self._response(task, decision.question.text, options=options)
                if decision.type == "COMPLETE":
                    missing = update_ledger(task) if task.ledger else []
                    if task.ledger and not missing and hasattr(self.planner, "audit_completion"):
                        semantic_missing = await self.planner.audit_completion(
                            self.context_builder.build(task, self.registry.visible()),
                            task.ledger, decision.final_message)
                        missing = [{"step_id": step["step_id"], "goal": step["goal"],
                                    "evidence_tools": step.get("evidence_tools", [])}
                                   for step in task.ledger if step["step_id"] in semantic_missing]
                    if task.active_intent is not None:
                        missing.append({"goal": "待确认的银行操作", "step_id": "confirmation"})
                    if missing:
                        task.trace.append({"kind": "COMPLETENESS_REJECTED", "missing": missing})
                        self._save(task)
                        if completion_retries < 2 and task.step_count < self.max_steps - 1:
                            completion_retries += 1
                            retry_context = self.context_builder.build(task, self.registry.visible())
                            retry_context["completion_verification"] = {
                                "missing_subgoals": missing,
                                "instruction": "The previous COMPLETE was rejected because these user goals lack trusted tool or bank-receipt evidence. Choose the next necessary tool or ASK_USER. Do not claim completion."}
                            decision = PlannerDecision.model_validate(await self.planner.decide(retry_context))
                            task.trace.append({"kind": "COMPLETENESS_REPLAN", "decision":
                                               _trace_safe(decision.model_dump(mode="json"))})
                            task.step_count += 1
                            if decision.type == "COMPLETE":
                                continue
                            if decision.type == "ASK_USER":
                                candidate_by_id = self._recipient_choices(task)
                                if decision.question.options and (not candidate_by_id or any(
                                        option.get("id") not in candidate_by_id
                                        for option in decision.question.options)):
                                    raise RegistryError("UNOBSERVED_CHOICE")
                                options = [{"id": option["id"], "label": candidate_by_id[option["id"]].get(
                                    "display_name_untrusted", "")} for option in decision.question.options]
                                task.presented_option_ids = [option["id"] for option in options]
                                task.status = Status.WAITING_USER
                                self._save(task)
                                return self._response(task, decision.question.text, options=options)
                        else:
                            task.status = Status.PARTIAL
                            self._save(task)
                            return self._response(task, "已完成的部分已保存；仍缺少以下事项的可核实结果：" +
                                                  "；".join(str(item.get("goal")) for item in missing[:8]),
                                                  "TASK_INCOMPLETE")
                if decision.type == "COMPLETE":
                    final_message = decision.final_message
                    if task.revision > 0 and task.active_intent is None:
                        final_message = _remove_superseded_action_offer(final_message)
                    knowledge_ids = {
                        item.get("evidence_id")
                        for observation in task.observations
                        if observation.success and observation.tool_name == "search_bank_knowledge"
                        for item in observation.structured_result.get("evidence", [])
                        if isinstance(item, dict) and isinstance(item.get("evidence_id"), str)
                    }
                    if knowledge_ids:
                        cited = set(re.findall(r"\[([0-9a-fA-F-]{36})\]", final_message))
                        if not cited or not cited.issubset(knowledge_ids):
                            repair_context = self.context_builder.build(task, self.registry.visible())
                            repair_context["grounding_repair"] = {
                                "issue": "Knowledge citations must use only observed evidence IDs in [UUID] form.",
                                "instruction": "Return COMPLETE with verified citations from the search_bank_knowledge observation. "
                                               "Do not call tools or invent sources."
                            }
                            repaired = PlannerDecision.model_validate(await self.planner.decide(repair_context))
                            task.trace.append({"kind": "KNOWLEDGE_CITATION_REPAIR",
                                               "decision": _trace_safe(repaired.model_dump(mode="json"))})
                            final_message = repaired.final_message if repaired.type == "COMPLETE" else ""
                            cited = set(re.findall(r"\[([0-9a-fA-F-]{36})\]", final_message))
                            if not cited or not cited.issubset(knowledge_ids):
                                task.status = Status.FAILED
                                self._save(task)
                                return self._response(task, "已检索到资料，但回答引用未能通过来源核验；请重试。", "UNVERIFIED_KNOWLEDGE_CITATION")
                    analysis_observed = any(o.success and o.tool_name in {
                        "summarize_spending", "detect_transaction_anomalies"} for o in task.observations)
                    if analysis_observed and task.active_intent is None:
                        issue = validate_analytical_reply(task, final_message)
                        if issue:
                            repair_context = self.context_builder.build(task, self.registry.visible())
                            repair_context["grounding_repair"] = {"issue": issue,
                                "instruction": "Return COMPLETE with corrected facts from evidence_facts only. "
                                               "Do not call tools or invent a merchant, amount or mask."}
                            repaired = PlannerDecision.model_validate(await self.planner.decide(repair_context))
                            task.trace.append({"kind": "GROUNDING_REPAIR", "issue": issue,
                                               "decision": _trace_safe(repaired.model_dump(mode="json"))})
                            if repaired.type != "COMPLETE" or validate_analytical_reply(task, repaired.final_message):
                                task.status = Status.FAILED
                                self._save(task)
                                return self._response(task, "分析已完成，但回复中的交易事实无法核实；请查看原始交易记录。",
                                                      "UNSUPPORTED_FACT")
                            final_message = repaired.final_message
                        final_message += coverage_notice(task)
                    task.status = Status.SUCCEEDED
                    task.conversation.append({"role": "assistant", "text": final_message})
                    self._save(task)
                    return self._response(task, final_message)
                call = decision.tool_call
                if call.tool_name.startswith("prepare_"):
                    if task.read_only_overlay:
                        raise RegistryError("PENDING_QUERY_CANNOT_PREPARE")
                    if task.intent_profile.get("dialogue_act") == "NAVIGATE":
                        raise RegistryError("NAVIGATION_CANNOT_PREPARE")
                    latest_user = next((turn["text"] for turn in reversed(task.conversation)
                                        if turn["role"] == "user"), task.goal)
                    if readonly_user_turn(latest_user):
                        raise RegistryError("READ_ONLY_REQUEST_CANNOT_PREPARE")
                    blocker = preparation_blocker(task, call.tool_name)
                    if blocker:
                        task.trace.append({"kind": "FINANCIAL_DEPENDENCY_REJECTED",
                                           "tool": call.tool_name, "code": blocker})
                        raise RegistryError(blocker)
                arguments = effective_arguments(task, call)
                try:
                    self.registry.validate(call.tool_name, arguments, task)
                except RegistryError as exc:
                    if str(exc) not in {"RECURRING_PAYMENT_NOT_INSPECTED",
                                        "RECURRING_PAYMENT_ID_NOT_OBSERVED",
                                        "REMINDER_ID_NOT_OBSERVED"}:
                        raise
                    task.observations.append(Observation(tool_name=call.tool_name, success=False,
                        structured_result={"error_code": str(exc)}, trust="TRUSTED_BANK_STATE"))
                    task.trace.append({"kind": "TOOL_REJECTED", "tool": call.tool_name,
                                       "error_code": str(exc)})
                    self._save(task)
                    continue
                if call.tool_name.startswith("prepare_"):
                    if len(task.completed_actions) >= 5:
                        raise RegistryError("ACTION_LIMIT_REACHED")
                    signature = hashlib.sha256(json.dumps(
                        [call.tool_name, arguments], ensure_ascii=False, sort_keys=True,
                        separators=(",", ":")).encode()).hexdigest()
                    if any(action.get("prepare_signature") == signature
                           for action in task.completed_intents):
                        raise RegistryError("ACTION_ALREADY_CONFIRMED")
                if call.tool_name in {"prepare_transfer", "prepare_scheduled_transfer", "prepare_cancel_scheduled_transfer", "prepare_split_request", "prepare_cancel_split_request", "prepare_investment_purchase", "prepare_investment_redemption", "prepare_card_action", "prepare_card_application", "prepare_credit_limit_application", "prepare_stop_recurring_payment", "prepare_renewal_reminder"}:
                    action = ("PREPARE_TRANSFER" if call.tool_name == "prepare_transfer" else
                              "PREPARE_CARD" if call.tool_name in {"prepare_card_action", "prepare_credit_limit_application"} else
                              "PREPARE_CARD_APPLICATION" if call.tool_name == "prepare_card_application" else
                              "PREPARE_RECURRING" if call.tool_name == "prepare_stop_recurring_payment" else
                              "PREPARE_REMINDER" if call.tool_name == "prepare_renewal_reminder" else
                              "PREPARE_INVESTMENT" if call.tool_name in {"prepare_investment_purchase", "prepare_investment_redemption"} else
                              "PREPARE_SPLIT" if "split" in call.tool_name else "PREPARE_SCHEDULE")
                    policy = self.policy.decide(PolicyContext(action=action, authenticated=True))
                    task.trace.append({"kind": "POLICY_DECISION", "decision": policy.value})
                    if policy != PolicyDecision.ALLOW:
                        raise RegistryError("POLICY_DENIED")
                if event_sink:
                    await event_sink("TOOL_STARTED", call.tool_name)
                task.pending_tool = {"tool": call.tool_name, "arguments": arguments,
                                     "state": "IN_FLIGHT", "step": task.step_count}
                self._save(task)
                try:
                    observation = await self.registry.call(call.tool_name, arguments, task, cookie)
                except Exception:
                    if event_sink:
                        await event_sink("TOOL_FAILED", call.tool_name)
                    raise
                if event_sink:
                    await event_sink("TOOL_FINISHED", call.tool_name)
                task.observations.append(observation)
                task.pending_tool = None
                if observation.success:
                    record_scope(task, call, arguments)
                task.trace.append({"kind": "TOOL_RESULT", "tool": call.tool_name,
                                   "result": observation.structured_result, "trust": observation.trust})
                if (call.tool_name == "search_bank_knowledge" and observation.success
                        and not observation.structured_result.get("evidence")):
                    task.trace.append({"kind": "KNOWLEDGE_GAP", "code": "RAG_NO_EVIDENCE"})
                if call.tool_name in {"prepare_transfer", "prepare_scheduled_transfer", "prepare_cancel_scheduled_transfer", "prepare_split_request", "prepare_cancel_split_request", "prepare_investment_purchase", "prepare_investment_redemption", "prepare_card_action", "prepare_card_application", "prepare_credit_limit_application", "prepare_stop_recurring_payment", "prepare_renewal_reminder"} and task.active_intent is not None:
                    task.pending_prepare = {"tool": call.tool_name, "arguments": arguments,
                                            "signature": signature}
                    task.status = Status.WAITING_CONFIRMATION
                    task.trace.append({"kind": "WAITING_CONFIRMATION", "intent_id": task.active_intent["id"]})
                    self._save(task)
                    message = ("卡片操作复核单已准备好。请核对卡片尾号、操作类型与前后状态；确认前不会修改卡片。"
                               if task.active_intent_kind == "CARD_ACTION" else
                               "银行代扣撤销复核单已准备好。确认后仅撤销银行管理的未来安排，不代表第三方会员已取消。"
                               if task.active_intent_kind == "RECURRING_STOP" else
                               "续费提醒复核单已准备好。请核对提醒时间和日期来源；确认后仅在应用内提醒。"
                               if task.active_intent_kind == "RENEWAL_REMINDER" else
                               "银行卡申请复核单已准备好。确认仅表示提交银行审核，不代表获批或发卡。"
                               if task.active_intent_kind == "CARD_APPLICATION" else
                               "信用额度提升申请已准备好。确认仅提交银行审核，不会自动提升额度。"
                               if task.active_intent_kind == "CREDIT_LIMIT_APPLICATION" else
                               "投资赎回复核单已准备好。请核对持仓、金额、演示到账额和目标账户；确认前不会变动持仓。"
                               if task.active_intent_kind == "INVESTMENT_REDEMPTION" else
                               "投资申购复核单已准备好。请核对产品、风险、金额、费用与适当性结果；确认前不会扣款。"
                               if task.active_intent_kind == "INVESTMENT_PURCHASE" else
                               "定时转账操作已准备好。请核对执行时间、收款人和金额；确认前不会创建或更改定时任务。"
                               if task.active_intent_kind == "SCHEDULE" else
                               "AA 收款请求已准备好。请核对每人份额；确认创建请求不会扣参与者资金。"
                               if task.active_intent_kind == "SPLIT" else
                               "转账已准备好。请核对完整银行复核单并完成验证，确认前不会扣款。")
                    return self._response(task, message)
                self._save(task)
            except (Exception) as exc:
                # Any invalid model output, tool error, or timeout fails closed.
                if type(exc).__name__ == "TaskStateConflict":
                    raise BankingApiError(409, "TASK_STATE_CONFLICT") from exc
                if isinstance(exc, httpx.HTTPStatusError):
                    LOGGER.warning("Agent task failed closed: upstream HTTP %s", exc.response.status_code)
                else:
                    LOGGER.warning("Agent task failed closed: %s", type(exc).__name__)
                task.trace.append({"kind": "RUNTIME_ERROR", "type": type(exc).__name__,
                                   "bank_code": exc.code if isinstance(exc, BankingApiError) else None})
                if isinstance(exc, httpx.HTTPStatusError) and exc.response.status_code == 402:
                    task.status = Status.BLOCKED_PROVIDER
                    task.last_error = {"code": "MODEL_INSUFFICIENT_BALANCE", "phase": "TOOL_LOOP"}
                    self._save(task)
                    return self._response(task, "模型服务余额不足；已保存当前进度和银行回执，稍后可恢复。",
                                          "MODEL_INSUFFICIENT_BALANCE")
                if isinstance(exc, httpx.HTTPStatusError) and exc.response.status_code == 429:
                    task.status = Status.BLOCKED_PROVIDER
                    task.last_error = {"code": "MODEL_RATE_LIMIT", "phase": "TOOL_LOOP"}
                    self._save(task)
                    return self._response(task, "模型服务暂时限流；任务进度已保存。", "MODEL_RATE_LIMIT")
                if isinstance(exc, httpx.TimeoutException) and task.pending_tool is None:
                    task.status = Status.BLOCKED_PROVIDER
                    task.last_error = {"code": "MODEL_TIMEOUT", "phase": "TOOL_LOOP"}
                    self._save(task)
                    return self._response(task, "模型响应超时；任务进度已保存。", "MODEL_TIMEOUT")
                if isinstance(exc, httpx.TimeoutException) and task.pending_tool and task.pending_tool.get("tool") == "search_bank_knowledge":
                    return await self._fail(task, cookie, "RAG_TIMEOUT", "RAG_TIMEOUT")
                if isinstance(exc, (ValidationError, json.JSONDecodeError)):
                    return await self._fail(task, cookie, "MODEL_INVALID_OUTPUT", "MODEL_INVALID_OUTPUT")
                if type(exc).__name__ == "MCPFailure":
                    mcp_code = str(exc)
                    if mcp_code not in {"MCP_CONNECTION_FAILED", "MCP_TIMEOUT", "MCP_AUTH_FAILED",
                                        "MCP_SCHEMA_MISMATCH", "MCP_UPSTREAM_FAILED", "MCP_TOOL_UNAVAILABLE"}:
                        mcp_code = "MCP_CONNECTION_FAILED"
                    return await self._fail(task, cookie, mcp_code, mcp_code)
                code = (str(exc) if isinstance(exc, RegistryError) else
                        "INSUFFICIENT_FUNDS" if isinstance(exc, BankingApiError) and exc.code == "INSUFFICIENT_FUNDS" else
                        "PLANNER_OR_TOOL_FAILED")
                return await self._fail(task, cookie, "TASK_FAILED", code)
        return await self._fail(task, cookie, "MAX_STEPS_EXCEEDED", "MAX_AGENT_STEPS")

    async def get(self, task_id: str, cookie: str) -> AgentResponse:
        task = await self._owned(task_id, cookie)
        if task.execution_uncertain:
            return self._response(task, "银行执行结果尚未核实；请勿重新发起或创建新的身份验证。",
                                  "EXECUTION_OUTCOME_UNKNOWN")
        if task.pending_tool and task.status == Status.RUNNING:
            return self._response(task, "任务在工具调用期间中断；已保存此前进度。请继续同一任务，金融准备状态会先核实。",
                                  "TASK_INTERRUPTED")
        return self._response(task, "当前任务状态。")

    async def cancel(self, task_id: str, cookie: str) -> AgentResponse:
        if self.state_store:
            await self._owned(task_id, cookie)
            try:
                self.state_store.acquire(task_id, self.worker_id)
            except Exception as exc:
                raise BankingApiError(409, "TASK_STATE_CONFLICT") from exc
            try:
                return await self._cancel_impl(task_id, cookie)
            finally:
                self.state_store.release(task_id, self.worker_id)
        return await self._cancel_impl(task_id, cookie)

    async def _cancel_impl(self, task_id: str, cookie: str) -> AgentResponse:
        async with self._lock:
            task = await self._owned(task_id, cookie)
            if task.status == Status.SUCCEEDED:
                raise BankingApiError(409, "TRANSFER_ALREADY_COMPLETED")
            if task.execution_uncertain:
                raise BankingApiError(409, "EXECUTION_OUTCOME_UNKNOWN")
            cancelled_prepare_tool = (task.pending_prepare or {}).get("tool")
            try:
                await self.lifecycle.cancel_active(task, cookie, "USER_CANCELLED")
            except CancellationUncertain:
                task.status = Status.BLOCKED
                self._save(task)
                return self._response(task, "银行端状态尚未确认，任务已暂停。", "BANK_INTENT_STATE_UNKNOWN")
            mark_cancelled_financial_step(task, cancelled_prepare_tool)
            task.status = Status.CANCELLED
            self._save(task)
            message = ("待确认操作已取消；此前已确认的银行操作不会自动撤销。"
                       if task.completed_actions else "任务和未执行的操作复核单已取消。")
            return self._response(task, message)

    async def confirm(self, task_id: str, body: ConfirmRequest, cookie: str) -> AgentResponse:
        if self.state_store:
            await self._owned(task_id, cookie)
            try:
                self.state_store.acquire(task_id, self.worker_id)
            except Exception as exc:
                raise BankingApiError(409, "TASK_STATE_CONFLICT") from exc
            try:
                return await self._confirm_impl(task_id, body, cookie)
            finally:
                self.state_store.release(task_id, self.worker_id)
        return await self._confirm_impl(task_id, body, cookie)

    async def _confirm_impl(self, task_id: str, body: ConfirmRequest, cookie: str) -> AgentResponse:
        async with self._lock:
            task = await self._owned(task_id, cookie)
            if task.status == Status.SUCCEEDED and task.receipt:
                previous = next((entry for entry in task.completed_intents
                                 if entry.get("intent_id") == body.intent_id
                                 and entry.get("intent_hash") == body.intent_hash), None)
                if previous is None:
                    raise BankingApiError(409, "TRANSFER_INTENT_HASH_MISMATCH")
                if previous.get("kind") == "CARD_ACTION":
                    raise BankingApiError(409, "TASK_NOT_CONFIRMABLE")
                return self._response(task, "该确认已处理；不会重复执行银行操作。")
            if task.status not in {Status.WAITING_CONFIRMATION, Status.WAITING_AUTH} or not task.active_intent:
                raise BankingApiError(409, "TASK_NOT_CONFIRMABLE")
            intent = task.active_intent
            if body.intent_id != intent.get("id") or body.intent_hash != intent.get("intentHash"):
                raise BankingApiError(409, "TRANSFER_INTENT_HASH_MISMATCH")
            kind = task.active_intent_kind or "TRANSFER"
            path = (f"/customer/scheduled-payment-intents/{body.intent_id}" if kind == "SCHEDULE" else
                    f"/customer/split-action-intents/{body.intent_id}" if kind == "SPLIT" else
                    f"/customer/recurring-payment-action-intents/{body.intent_id}" if kind == "RECURRING_STOP" else
                    f"/customer/renewal-reminder-action-intents/{body.intent_id}" if kind == "RENEWAL_REMINDER" else
                    f"/customer/card-action-intents/{body.intent_id}" if kind == "CARD_ACTION" else
                    f"/customer/investment-order-intents/{body.intent_id}" if kind == "INVESTMENT_PURCHASE" else
                    f"/customer/investment-redemption-intents/{body.intent_id}" if kind == "INVESTMENT_REDEMPTION" else
                    f"/customer/transfer-intents/{body.intent_id}")
            bank = (intent if kind in {"CARD_APPLICATION", "CREDIT_LIMIT_APPLICATION"}
                    else await self.gateway.customer_get(path, cookie))
            allowed = {"PREPARED", "EXECUTED"} if task.execution_uncertain else {"PREPARED"}
            if bank.get("status", "PREPARED") not in allowed or bank.get("intentHash") != body.intent_hash:
                raise BankingApiError(409, "TRANSFER_INTENT_UNAVAILABLE")
            if task.execution_uncertain and bank.get("status") == "EXECUTED" and kind != "TRANSFER":
                task.status = Status.PARTIAL
                task.last_error = {"code": "BANKING_RESULT_UNKNOWN", "phase": "EXECUTION_RECONCILIATION"}
                self._save(task)
                return self._response(task, "银行已确认操作执行，但当前接口未返回可核验回执；请查看银行交易记录，系统不会重复提交。",
                                      "BANKING_RESULT_UNKNOWN")
            if task.execution_uncertain and bank.get("status") == "EXECUTED" and kind == "TRANSFER":
                task.trace.append({"kind": "BANK_STATE_RECONCILED", "intent_id": body.intent_id,
                                   "status": "EXECUTED", "method": "SAME_KEY_RECEIPT_REPLAY"})
            confirmation_only = (kind == "RENEWAL_REMINDER" or
                                 kind == "CARD_ACTION" and bank.get("verificationRequirement") == "NONE")
            if not body.action_authorization_id and not confirmation_only:
                task.status = Status.WAITING_AUTH
                self._save(task)
                return self._response(task, "请完成与本次操作绑定的身份验证。")
            if task.execution_uncertain and body.action_authorization_id != task.execution_authorization_id:
                raise BankingApiError(409, "EXECUTION_RETRY_MUST_USE_SAME_AUTHORIZATION")
            task.execution_authorization_id = body.action_authorization_id
            if not task.execution_uncertain and kind == "TRANSFER":
                source_id = bank.get("sourceAccount", {}).get("id")
                source = await self.gateway.customer_get(f"/customer/accounts/{source_id}", cookie)
                if Decimal(source["availableBalance"]["amount"]) < Decimal(bank["totalDebit"]["amount"]):
                    raise BankingApiError(409, "INSUFFICIENT_FUNDS")
            action = ("EXECUTE_REMINDER" if kind == "RENEWAL_REMINDER" else
                      "EXECUTE_CARD_CONFIRM" if confirmation_only else
                      "EXECUTE_RECURRING" if kind == "RECURRING_STOP" else
                      "EXECUTE_CARD_AUTH" if kind in {"CARD_ACTION", "CREDIT_LIMIT_APPLICATION"} else
                      "SUBMIT_CARD_APPLICATION" if kind == "CARD_APPLICATION" else
                      "EXECUTE_INVESTMENT" if kind in {"INVESTMENT_PURCHASE", "INVESTMENT_REDEMPTION"} else
                      "EXECUTE_SCHEDULE" if kind == "SCHEDULE" else
                      "EXECUTE_SPLIT" if kind == "SPLIT" else "EXECUTE_TRANSFER")
            policy = self.policy.decide(PolicyContext(action=action,
                                                      amount=bank["amount"]["amount"] if kind == "TRANSFER" else None,
                                                      authenticated=True))
            if policy != (PolicyDecision.CONFIRM if confirmation_only else PolicyDecision.REQUIRE_AUTH):
                raise BankingApiError(403, "POLICY_DENIED")
            # Persist uncertainty before the network request. A process crash after
            # bank commit must never make the restarted runtime assume no execution.
            task.execution_uncertain = True
            self._save(task)
            try:
                request = {"intentId": body.intent_id, "intentHash": body.intent_hash,
                           **({"actionAuthorizationId": body.action_authorization_id}
                              if body.action_authorization_id else {})}
                receipt = (await self.gateway.execute_schedule_action(cookie, request, task.execution_key) if kind == "SCHEDULE" else
                           await self.gateway.execute_stop_recurring(cookie, request, task.execution_key) if kind == "RECURRING_STOP" else
                           await self.gateway.execute_renewal_reminder(cookie, request, task.execution_key) if kind == "RENEWAL_REMINDER" else
                           await self.gateway.execute_split_action(cookie, request, task.execution_key) if kind == "SPLIT" else
                           await self.gateway.execute_card_action(cookie, request, task.execution_key) if kind == "CARD_ACTION" else
                           await self.gateway.submit_card_application(cookie, {**bank["request"], **request}, task.execution_key) if kind == "CARD_APPLICATION" else
                           await self.gateway.submit_credit_limit_application(cookie, request, task.execution_key) if kind == "CREDIT_LIMIT_APPLICATION" else
                           await self.gateway.execute_investment_purchase(cookie, request, task.execution_key) if kind == "INVESTMENT_PURCHASE" else
                           await self.gateway.execute_investment_redemption(cookie, request, task.execution_key) if kind == "INVESTMENT_REDEMPTION" else
                           await self.gateway.execute_transfer(cookie, request, task.execution_key))
            except BankingUnavailableError:
                task.execution_uncertain = True
                task.status = Status.WAITING_AUTH
                task.last_error = {"code": "EXECUTION_OUTCOME_UNKNOWN", "phase": "EXECUTION_RECONCILIATION"}
                self._save(task)
                return self._response(task, "银行响应暂不可确认；可使用同一授权安全重试。", "EXECUTION_OUTCOME_UNKNOWN")
            except BankingApiError as exc:
                task.failed_actions.append({"kind": kind, "intent_id": body.intent_id,
                                            "status": "REJECTED", "error_code": exc.code})
                task.trace.append({"kind": "ACTION_REJECTED", "intent_id": body.intent_id,
                                   "bank_code": exc.code})
                failed = await self._fail(task, cookie, "BANK_REJECTED", exc.code)
                if task.status in {Status.FAILED, Status.PARTIAL}:
                    failed.message = ("银行拒绝了当前操作（" + exc.code + "）。此前确认的 "
                                      + str(len(task.completed_actions))
                                      + " 项操作仍有效；后续操作已停止，未自动回滚或执行。")
                return failed
            task.receipt = receipt
            task.execution_uncertain = False
            task.last_error = None
            task.trace.append({"kind": "ACTION_EXECUTED", "intent_id": body.intent_id})
            receipt_id = receipt.get("id")
            if not isinstance(receipt_id, str) or not receipt_id:
                task.status = Status.BLOCKED
                self._save(task)
                return self._response(task, "银行操作可能已执行，但回执不完整；请先核实银行状态。",
                                      "EXECUTION_OUTCOME_UNKNOWN")
            prepare = task.pending_prepare or {}
            task.completed_intents.append({"intent_id": body.intent_id,
                                           "intent_hash": body.intent_hash,
                                           "kind": kind,
                                           "prepare_signature": prepare.get("signature"),
                                           "receipt": receipt})
            task.completed_actions.append({"kind": kind, "intent_id": body.intent_id,
                                           "receipt_id": receipt_id,
                                           "status": str(receipt.get("status") or "EXECUTED")})
            observed = ({"card_id": bank.get("card", {}).get("id"),
                             "action_type": bank.get("actionType"), "status": "EXECUTED",
                             "receipt_id": receipt_id} if kind == "CARD_ACTION" else
                            {"recurring_payment_id": bank.get("recurringPayment", {}).get("id"),
                             "status": receipt.get("recurringPayment", {}).get("status"),
                             "receipt_id": receipt_id, "scope": "BANK_MANAGED_ARRANGEMENT_ONLY"}
                            if kind == "RECURRING_STOP" else
                            {"reminder_id": receipt.get("reminder", {}).get("id"),
                             "status": receipt.get("reminder", {}).get("status"),
                             "receipt_id": receipt_id, "delivery": "IN_APP_ONLY"}
                            if kind == "RENEWAL_REMINDER" else
                            {"kind": kind, "intent_id": body.intent_id, "receipt_id": receipt_id,
                             "status": str(receipt.get("status") or "EXECUTED")})
            observation_name = ({"CARD_ACTION": "confirmed_card_action",
                                 "RECURRING_STOP": "confirmed_recurring_stop",
                                 "RENEWAL_REMINDER": "confirmed_renewal_reminder"}.get(
                                     kind, "confirmed_" + kind.lower()))
            task.observations.append(Observation(tool_name=observation_name,
                success=True, structured_result=observed, trust="TRUSTED_BANK_STATE"))
            task.active_intent = None
            task.active_intent_kind = None
            task.pending_prepare = None
            task.execution_authorization_id = None
            task.execution_key = "agent_v2_" + uuid4().hex
            task.status = Status.RUNNING
            task.step_count = 0
            task.conversation.append({"role": "assistant", "text":
                "操作已获用户确认并由银行执行。根据原始请求、已有分析和完成回执，继续处理尚未完成的部分；若已全部完成，请汇总所有结果，不要重复操作。"})
            self._save(task)
            return await self._run(task, cookie, len(task.observations), False)

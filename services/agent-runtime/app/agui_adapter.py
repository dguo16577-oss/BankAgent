"""AG-UI transport for the existing, bank-authorized Agent v2 runtime.

The client supplies a conversation turn and an opaque thread label. It does not
control tool definitions, bank identity, runtime state, or financial authority.
"""

from __future__ import annotations

import asyncio
import hashlib
import re
from uuid import uuid4

from ag_ui.core import (
    CustomEvent,
    RunAgentInput,
    RunErrorEvent,
    RunFinishedEvent,
    RunStartedEvent,
    StateSnapshotEvent,
    TextMessageContentEvent,
    TextMessageEndEvent,
    TextMessageStartEvent,
    ToolCallArgsEvent,
    ToolCallEndEvent,
    ToolCallResultEvent,
    ToolCallStartEvent,
)
from ag_ui.encoder import EventEncoder
from fastapi import HTTPException
from fastapi.responses import StreamingResponse

from .agent_v2.runtime import AgentRuntimeV2
from .agent_v2.presentation import build_presentation
from .banking import BankingAuthenticationError
from .deepseek import model_progress_sink

_THREAD_ID = re.compile(r"[A-Za-z0-9_-]{1,128}\Z")


def _delegations(runtime, task_id: str) -> list[dict]:
    task = getattr(runtime, "tasks", {}).get(task_id)
    return [{"role": row["agent_role"], "stepId": row["child_step_id"], "status": row["status"]}
            for row in getattr(task, "delegations", [])
            if row.get("agent_role") in {"financial_analyst", "bank_knowledge"}
            and re.fullmatch(r"g[1-8]", str(row.get("child_step_id", "")))
            and row.get("status") in {"RUNNING", "SUCCEEDED", "FAILED", "PARTIAL", "CANCELLED"}][:4]
_LONG_NUMBER = re.compile(r"(?<!\d)\d{12,19}(?!\d)")
_GROUPED_NUMBER = re.compile(r"(?<!\d)(?:\d[ -]?){12,19}(?!\d)")
_SECRET = re.compile(
    r"(?i)(?:sk-[A-Za-z0-9]{12,}|"
    r"(?:SESSION|JSESSIONID|PASSWORD|PASSCODE|API[_-]?KEY)\s*[:=]\s*[^\s;,]+|"
    r"Bearer\s+[A-Za-z0-9._~-]{8,}|"
    r"(?:OTP|verification code|验证码)\s*[:=]?\s*\d{6}\b)"
)
_AMOUNT = re.compile(r"\d{1,12}(?:\.\d{1,2})?\Z")
_CURRENCY = re.compile(r"[A-Z]{3}\Z")
_CATEGORY = re.compile(r"[A-Z_]{1,32}\Z")
_PERIOD = re.compile(r"[0-9-]{4,10}\Z")


def _safe_text(value: str, allowed_citations: set[str] | None = None) -> str:
    # A UUID may end in 12 digits. Preserve only citations that were returned
    # by the knowledge tool; the ordinary account/card-number mask still runs
    # on every other part of the answer.
    protected: dict[str, str] = {}
    if allowed_citations:
        for citation in re.findall(r"\[([0-9a-fA-F-]{36})\]", value):
            if citation in allowed_citations:
                marker = f"\ue000{len(protected)}\ue001"
                protected[marker] = f"[{citation}]"
                value = value.replace(f"[{citation}]", marker)
    without_secrets = _SECRET.sub("[redacted]", value)
    # Card/account numbers may arrive in groups separated by spaces or dashes.
    # Keep ordinary amounts and masked last-four references readable.
    without_numbers = _GROUPED_NUMBER.sub("[masked number]", without_secrets)
    safe = _LONG_NUMBER.sub("[masked number]", without_numbers)
    for marker, citation in protected.items():
        safe = safe.replace(marker, citation)
    return safe


def _user_turn(body: RunAgentInput) -> str:
    # Copilot messages/state/context/tools are not an authorization source. Only
    # one latest plain-text user turn enters the existing Agent runtime.
    if not body.messages or body.messages[-1].role != "user":
        raise HTTPException(422, "Expected a latest user message")
    content = body.messages[-1].content
    if not isinstance(content, str) or not 0 < len(content.strip()) <= 2000:
        raise HTTPException(422, "Expected a plain-text user message")
    return content.strip()


def _spending_cards(runtime: AgentRuntimeV2, task_id: str) -> list[dict]:
    """Publish only bounded, deterministic aggregates from a bank-backed tool.

    Merchant names, notes and raw transactions are deliberately absent. This
    is presentation data, never a new authority or an LLM-generated status.
    """
    task = getattr(runtime, "tasks", {}).get(task_id)
    if task is None:
        return []
    for observation in reversed(getattr(task, "observations", [])):
        if observation.tool_name != "summarize_spending" or not observation.success:
            continue
        raw = observation.structured_result
        totals = []
        for currency, value in list(raw.get("totals_by_currency", {}).items())[:6]:
            if (isinstance(currency, str) and _CURRENCY.fullmatch(currency)
                    and isinstance(value, dict) and isinstance(value.get("amount"), str)
                    and _AMOUNT.fullmatch(value["amount"])):
                totals.append({"currency": currency, "amount": value["amount"]})
        categories = []
        for row in raw.get("category_breakdown", [])[:16]:
            if (isinstance(row, dict) and isinstance(row.get("currency"), str)
                    and isinstance(row.get("category"), str)
                    and isinstance(row.get("amount"), str)
                    and _CURRENCY.fullmatch(row["currency"])
                    and _CATEGORY.fullmatch(row["category"])
                    and _AMOUNT.fullmatch(row["amount"])):
                categories.append({key: row[key] for key in ("currency", "category", "amount")})
        periods = []
        for row in raw.get("period_breakdown", [])[:24]:
            if (isinstance(row, dict) and isinstance(row.get("currency"), str)
                    and isinstance(row.get("period"), str)
                    and isinstance(row.get("amount"), str)
                    and _CURRENCY.fullmatch(row["currency"])
                    and _PERIOD.fullmatch(row["period"])
                    and _AMOUNT.fullmatch(row["amount"])):
                periods.append({key: row[key] for key in ("currency", "period", "amount")})
        period = raw.get("period") if isinstance(raw.get("period"), dict) else {}
        return [{"kind": "SPENDING_ANALYSIS", "period": {
            key: value for key in ("from", "to")
            if isinstance((value := period.get(key)), str) and len(value) <= 32},
            "totals": totals, "categories": categories, "buckets": periods}]
    return []


def _knowledge_cards(runtime: AgentRuntimeV2, task_id: str) -> list[dict]:
    """Sources come from retrieval observations, never from model-written citations."""
    task = getattr(runtime, "tasks", {}).get(task_id)
    if task is None:
        return []
    evidence: dict[str, dict] = {}
    searched = False
    summary = getattr(task, 'last_response_summary', None)
    cited = None
    if (isinstance(summary, dict) and summary.get('status') == 'SUCCEEDED'
            and summary.get('revision') == getattr(task, 'revision', None)
            and isinstance(summary.get('message'), str)):
        cited = set(re.findall(r'\[([0-9a-fA-F-]{36})\]', summary.get('message', '')))
    for observation in getattr(task, "observations", []):
        if observation.tool_name != "search_bank_knowledge" or not observation.success:
            continue
        searched = True
        for item in observation.structured_result.get("evidence", [])[:10]:
            if not isinstance(item, dict):
                continue
            if cited is not None and item.get('evidence_id') not in cited:
                continue
            identifier = item.get("evidence_id")
            if not isinstance(identifier, str) or len(identifier) > 64:
                continue
            evidence[identifier] = {
                "evidenceId": identifier,
                "title": _safe_text(str(item.get("document_title", "")))[:160],
                "version": str(item.get("version", ""))[:80],
                "location": str(item.get("source_location", ""))[:80],
                "status": str(item.get("effective_status", ""))[:24],
                "sourceLabel": "Aster Demo Policy",
                "excerpt": _safe_text(str(item.get("relevant_text", "")))[:700],
            }
    if not evidence:
        return [{"kind": "KNOWLEDGE_NO_RESULT"}] if searched else []
    return [{"kind": "KNOWLEDGE_SOURCES", "sources": list(evidence.values())[:10]}]


def _result_cards(runtime: AgentRuntimeV2, task_id: str) -> list[dict]:
    return _spending_cards(runtime, task_id) + _knowledge_cards(runtime, task_id)


def _presentation(runtime: AgentRuntimeV2, task_id: str) -> list[dict]:
    task = getattr(runtime, "tasks", {}).get(task_id)
    return build_presentation(task) if task is not None else []


class AgUiAdapter:
    def __init__(self, runtime: AgentRuntimeV2):
        self.runtime = runtime
        self.encoder = EventEncoder()
        self._threads: dict[tuple[str, str, str], str] = {}
        self._thread_locks: dict[tuple[str, str, str], asyncio.Lock] = {}
        self._lock = asyncio.Lock()

    async def thread_state(self, thread_id: str, cookie: str) -> dict[str, object] | None:
        if not _THREAD_ID.fullmatch(thread_id):
            raise HTTPException(422, "Invalid AG-UI thread")
        try:
            binding, customer = await self.runtime._identity(cookie)
        except BankingAuthenticationError as exc:
            raise HTTPException(401, "Bank session is not active") from exc
        task_id = (self.runtime.state_store.thread_lookup(customer, binding, thread_id)
                   if getattr(self.runtime, "state_store", None) else self._threads.get((binding, customer, thread_id)))
        if task_id is None:
            return None
        task = await self.runtime.get(task_id, cookie)
        checkpoint = getattr(self.runtime, "tasks", {}).get(task_id)
        turns = getattr(checkpoint, "conversation", [])
        last_user = next((turn.get("text", "") for turn in reversed(turns)
                          if turn.get("role") == "user"), "")
        last_answer = next((turn.get("text", "") for turn in reversed(turns)
                            if turn.get("role") == "assistant"), "")
        summary = getattr(checkpoint, 'last_response_summary', None)
        if isinstance(summary, dict) and summary.get('status') == task.status.value:
            last_answer = task.message  # Runtime GET already checked revision/uncertainty.
        return {"taskId": task.task_id, "status": task.status.value,
                "confirmationRequired": task.confirmation_required,
                "completedActionCount": len(task.completed_actions),
                "failedActionCount": len(task.failed_actions),
                "resultCards": _result_cards(self.runtime, task.task_id),
                "presentation": _presentation(self.runtime, task.task_id),
                "delegations": _delegations(self.runtime, task.task_id),
                "lastUserMessage": _safe_text(last_user)[:2000],
                "lastAssistantMessage": _safe_text(last_answer)[:6000]
                if task.status.value == "SUCCEEDED" else ""}

    async def stream(self, body: RunAgentInput, cookie: str) -> StreamingResponse:
        if not _THREAD_ID.fullmatch(body.thread_id) or not _THREAD_ID.fullmatch(body.run_id):
            raise HTTPException(422, "Invalid AG-UI thread or run")
        message = _user_turn(body)
        # An absent or forged bank cookie is rejected before opening the SSE
        # stream. Every resumed task is checked again by AgentRuntimeV2._owned.
        try:
            binding, customer = await self.runtime._identity(cookie)
        except BankingAuthenticationError as exc:
            raise HTTPException(401, "Bank session is not active") from exc
        thread_key = (binding, customer, body.thread_id)
        async with self._lock:
            thread_lock = self._thread_locks.setdefault(thread_key, asyncio.Lock())
        request_id = hashlib.sha256(f"{binding}:{body.run_id}".encode()).hexdigest()[:32]

        async def events():
            yield self.encoder.encode(RunStartedEvent(thread_id=body.thread_id, run_id=body.run_id))
            queue: asyncio.Queue[tuple[str, str] | None] = asyncio.Queue()

            async def sink(kind: str, tool: str) -> None:
                queue.put_nowait((kind, tool))

            async def run():
                progress_token = model_progress_sink.set(sink)
                try:
                    async with thread_lock:
                        task_id = (self.runtime.state_store.thread_lookup(customer, binding, body.thread_id)
                                   if getattr(self.runtime, "state_store", None) else self._threads.get(thread_key))
                        prior = getattr(self.runtime, "tasks", {}).get(task_id)
                        if prior is not None and getattr(prior.status, "value", prior.status) in {"FAILED", "CANCELLED"}:
                            # A concluded failed/cancelled bank task cannot be
                            # resumed. Keep the UI thread, start a fresh task.
                            task_id = None
                        if getattr(self.runtime, "state_store", None):
                            result = await self.runtime.chat(message, cookie, task_id, request_id, sink,
                                                             conversation_id=body.thread_id)
                        else:
                            result = await self.runtime.chat(message, cookie, task_id, request_id, sink)
                        self._threads[thread_key] = result.task_id
                    return result
                finally:
                    model_progress_sink.reset(progress_token)
                    queue.put_nowait(None)

            # A disconnected event consumer does not cancel an already submitted
            # bank request. The runtime and bank retain their own idempotency.
            operation = asyncio.create_task(run())
            call_ids: dict[str, str] = {}
            while True:
                event = await queue.get()
                if event is None:
                    break
                kind, tool = event
                if kind in {"MODEL_STARTED", "MODEL_FINISHED", "MODEL_FAILED"}:
                    yield self.encoder.encode(CustomEvent(name="aster.progress", value={"phase": kind}))
                elif kind in {"DELEGATION_STARTED", "DELEGATION_SUCCEEDED", "DELEGATION_FAILED", "DELEGATION_PARTIAL", "DELEGATION_CANCELLED"}:
                    match = re.fullmatch(r"(financial_analyst|bank_knowledge)\|(g[1-8])", tool)
                    if match:
                        yield self.encoder.encode(CustomEvent(name="aster.delegation", value={
                            "role": match[1], "stepId": match[2],
                            "status": "RUNNING" if kind == "DELEGATION_STARTED" else kind.removeprefix("DELEGATION_")}))
                elif kind == "TOOL_STARTED":
                    call_id = uuid4().hex
                    call_ids[tool] = call_id
                    yield self.encoder.encode(ToolCallStartEvent(
                        tool_call_id=call_id, tool_call_name=tool))
                    # Raw tool arguments may contain customer identifiers or
                    # untrusted transaction text, so only a neutral object goes
                    # to the browser. The runtime receives the real arguments.
                    yield self.encoder.encode(ToolCallArgsEvent(
                        tool_call_id=call_id, delta='{"redacted":true}'))
                elif tool in call_ids:
                    call_id = call_ids.pop(tool)
                    yield self.encoder.encode(ToolCallEndEvent(tool_call_id=call_id))
                    yield self.encoder.encode(ToolCallResultEvent(
                        message_id=uuid4().hex, tool_call_id=call_id,
                        content="Completed" if kind == "TOOL_FINISHED" else "Failed",
                        role="tool"))
            try:
                result = await operation
            except BankingAuthenticationError:
                yield self.encoder.encode(RunErrorEvent(message="Bank session expired", code="UNAUTHENTICATED"))
                return
            except Exception:
                yield self.encoder.encode(RunErrorEvent(message="Agent run failed", code="AGENT_RUN_FAILED"))
                return
            yield self.encoder.encode(StateSnapshotEvent(snapshot={
                "taskId": result.task_id,
                "status": result.status.value,
                "confirmationRequired": result.confirmation_required,
                "completedActionCount": len(result.completed_actions),
                "failedActionCount": len(result.failed_actions),
                "resultCards": _result_cards(self.runtime, result.task_id),
                "presentation": _presentation(self.runtime, result.task_id),
                "delegations": _delegations(self.runtime, result.task_id),
            }))
            message_id = uuid4().hex
            yield self.encoder.encode(TextMessageStartEvent(message_id=message_id, role="assistant"))
            task = getattr(self.runtime, "tasks", {}).get(result.task_id)
            citation_ids = {
                item.get("evidence_id")
                for observation in getattr(task, "observations", [])
                if observation.success and observation.tool_name == "search_bank_knowledge"
                for item in observation.structured_result.get("evidence", [])
                if isinstance(item, dict) and isinstance(item.get("evidence_id"), str)
            }
            yield self.encoder.encode(TextMessageContentEvent(
                message_id=message_id, delta=_safe_text(result.message, citation_ids)))
            yield self.encoder.encode(TextMessageEndEvent(message_id=message_id))
            # RUN_FINISHED closes this transport run. It never means that a
            # PREPARED financial ActionIntent has been executed by the bank.
            yield self.encoder.encode(RunFinishedEvent(
                thread_id=body.thread_id, run_id=body.run_id,
                result={"taskStatus": result.status.value}))

        return StreamingResponse(events(), media_type="text/event-stream", headers={
            "Cache-Control": "no-store, no-transform", "X-Accel-Buffering": "no"
        })

"""HTTP entry point for Aster Bank's read-only Agent runtime."""

from __future__ import annotations

import os
from collections.abc import Callable
from datetime import datetime

from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import JSONResponse

from .banking import BankingApiError, BankingAuthenticationError, BankingGateway, BankingUnavailableError
from .deepseek import DeepSeekClassifier
from .knowledge import citations_for, load_knowledge, relevant_facts
from .models import ChatRequest, ChatResponse, GraphResponse
from .planner import _INJECTION, answer, heuristic_intent, public_answer
from .task_models import AgentChatRequest, AgentResponse, ConfirmRequest
from .transfer_planner import DeepSeekToolPlanner, Planner
from .transfer_runtime import TransferRuntime, looks_like_transfer_command
from .agent_v2.planner import DeepSeekPlanner, Planner as V2Planner
from .agent_v2.runtime import AgentRuntimeV2


def create_app(
    gateway: BankingGateway | None = None,
    classifier: DeepSeekClassifier | None = None,
    now_provider: Callable[[], datetime] | None = None,
    transfer_planner: Planner | None = None,
    agent_v2_planner: V2Planner | None = None,
    agent_version: str | None = None,
) -> FastAPI:
    app = FastAPI(title="Aster Bank Agent Runtime", version="0.1.0")
    app.state.gateway = gateway or BankingGateway()
    app.state.classifier = classifier or DeepSeekClassifier()
    app.state.now_provider = now_provider
    app.state.transfer = TransferRuntime(app.state.gateway, transfer_planner or DeepSeekToolPlanner(app.state.classifier))
    app.state.agent_version = agent_version or os.getenv("AGENT_RUNTIME_VERSION", "v2")
    if app.state.agent_version not in {"v1", "v2"}:
        raise ValueError("AGENT_RUNTIME_VERSION must be v1 or v2")
    app.state.agent_v2 = AgentRuntimeV2(app.state.gateway, agent_v2_planner or DeepSeekPlanner(app.state.classifier))

    @app.middleware("http")
    async def no_store(request: Request, call_next):
        response = await call_next(request)
        response.headers["Cache-Control"] = "no-store"
        return response

    @app.exception_handler(BankingAuthenticationError)
    async def authentication_failure(_request: Request, _exc: BankingAuthenticationError):
        return JSONResponse(status_code=401, content={"detail": "银行会话无效，请重新登录。"})

    @app.exception_handler(BankingUnavailableError)
    async def banking_failure(_request: Request, _exc: BankingUnavailableError):
        return JSONResponse(status_code=503, content={"detail": "银行数据服务暂时不可用，请稍后重试。"})

    @app.exception_handler(BankingApiError)
    async def banking_api_failure(_request: Request, exc: BankingApiError):
        return JSONResponse(status_code=exc.status, content={"detail": exc.code})

    @app.get("/health")
    async def health() -> dict[str, str]:
        return {"status": "ok"}

    @app.get("/knowledge/graph", response_model=GraphResponse)
    async def knowledge_graph(request: Request) -> GraphResponse:
        snapshot = await load_knowledge(request.app.state.gateway)
        return snapshot.graph

    @app.post("/chat", response_model=ChatResponse)
    async def chat(body: ChatRequest, request: Request) -> ChatResponse:
        cookie = request.headers.get("cookie", "")
        if not cookie:
            raise HTTPException(status_code=401, detail="银行会话无效，请重新登录。")
        gateway: BankingGateway = request.app.state.gateway
        session = await gateway.customer_get("/customer/session", cookie)
        if session.get("authenticated") is not True or not isinstance(session.get("user"), dict):
            raise BankingAuthenticationError

        message = body.message.strip()
        if not message:
            raise HTTPException(status_code=422, detail="请输入消息。")
        # The injection guard runs before any optional model request. A model
        # can classify intent, but cannot select tool URLs or execute a mutation.
        if _INJECTION.search(message):
            return await answer(message, "UNKNOWN", cookie, gateway, "DETERMINISTIC", body.locale, now=now_provider() if now_provider else None)

        fallback = heuristic_intent(message)
        # Public questions can go straight to sourced retrieval and, for
        # Chinese summaries, one model call. Reclassifying them first adds
        # latency and may exhaust the small demo API budget.
        model_intent = (
            None
            if fallback in {"PUBLIC", "PUBLIC_TERMS", "TRANSFER_HISTORY"}
            else await request.app.state.classifier.classify(message)
        )
        if fallback != "UNKNOWN":
            intent = fallback
            mode = "DEEPSEEK" if model_intent == fallback else "DETERMINISTIC"
        elif model_intent and model_intent != "UNKNOWN":
            intent = model_intent
            mode = "DEEPSEEK"
        else:
            intent = "PUBLIC"
            mode = "DETERMINISTIC"
        if intent == "PUBLIC":
            snapshot = await load_knowledge(gateway)
            facts = relevant_facts(snapshot, message)
            synthesis = await request.app.state.classifier.synthesize_public(facts) if body.locale == "zh-CN" else None
            if synthesis is not None:
                reply, citation_ids = synthesis
                cited = [facts[index] for index in citation_ids]
                return ChatResponse(reply=reply, mode="DEEPSEEK", citations=citations_for(cited))
            return public_answer(facts, locale=body.locale)
        return await answer(message, intent, cookie, gateway, mode, body.locale, now=now_provider() if now_provider else None)

    @app.post("/agent/chat", response_model=AgentResponse | ChatResponse)
    async def agent_chat(body: AgentChatRequest, request: Request) -> AgentResponse | ChatResponse:
        cookie = request.headers.get("cookie", "")
        if request.app.state.agent_version == "v2":
            return await request.app.state.agent_v2.chat(body.message.strip(), cookie, body.task_id,
                                                        body.request_id)
        if body.task_id or (heuristic_intent(body.message) != "TRANSFER_HISTORY" and looks_like_transfer_command(body.message)):
            if _INJECTION.search(body.message):
                raise HTTPException(status_code=400, detail="Unsafe transfer request")
            return await request.app.state.transfer.chat(body.message.strip(), cookie, body.task_id)
        return await chat(ChatRequest(message=body.message, locale=body.locale), request)

    @app.get("/agent/tasks/{task_id}", response_model=AgentResponse)
    async def agent_task(task_id: str, request: Request) -> AgentResponse:
        if request.app.state.agent_version == "v2":
            return await request.app.state.agent_v2.get(task_id, request.headers.get("cookie", ""))
        return await request.app.state.transfer.get(task_id, request.headers.get("cookie", ""))

    @app.post("/agent/tasks/{task_id}/confirm", response_model=AgentResponse)
    async def confirm_task(task_id: str, body: ConfirmRequest, request: Request) -> AgentResponse:
        if request.app.state.agent_version == "v2":
            return await request.app.state.agent_v2.confirm(task_id, body, request.headers.get("cookie", ""))
        return await request.app.state.transfer.confirm(task_id, body, request.headers.get("cookie", ""))

    @app.post("/agent/tasks/{task_id}/cancel", response_model=AgentResponse)
    async def cancel_task(task_id: str, request: Request) -> AgentResponse:
        if request.app.state.agent_version == "v2":
            return await request.app.state.agent_v2.cancel(task_id, request.headers.get("cookie", ""))
        return await request.app.state.transfer.cancel(task_id, request.headers.get("cookie", ""))

    return app


app = create_app()

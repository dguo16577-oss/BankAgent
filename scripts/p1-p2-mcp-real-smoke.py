"""Native/MCP comparison against the isolated live Spring/PostgreSQL stack.

No model request, financial mutation, raw cookie, or private observation is saved.
"""

from __future__ import annotations

import asyncio
import json
import os
import sys
import time
from pathlib import Path

import httpx
import uvicorn

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "services" / "agent-runtime"))

from app.agent_v2.models import Task
from app.agent_v2.runtime import session_binding
from app.agent_v2.tools import ToolRegistry
from app.banking import BankingGateway
from app.main import create_app


async def login(origin: str, email: str) -> tuple[httpx.AsyncClient, str, str]:
    client = httpx.AsyncClient(base_url=origin, timeout=20)
    await client.get("/customer/session")
    csrf = client.cookies.get("XSRF-TOKEN")
    if not csrf:
        raise RuntimeError("Spring CSRF bootstrap failed")
    response = await client.post("/customer/auth/login", json={"email": email,
                                 "password": os.getenv("ASTER_DEMO_PASSWORD", "demo-password")},
                                 headers={"X-XSRF-TOKEN": csrf})
    if response.status_code != 200:
        raise RuntimeError(f"Spring demo login HTTP {response.status_code}")
    session = (await client.get("/customer/session")).json()
    customer_id = session["user"]["id"]
    cookie = "; ".join(f"{key}={value}" for key, value in client.cookies.items())
    return client, cookie, customer_id


async def main() -> None:
    origin = os.getenv("BANKING_API_BASE_URL", "http://127.0.0.1:18088").rstrip("/")
    if not origin.startswith("http://127.0.0.1:"):
        raise RuntimeError("Use only an isolated loopback bank stack")
    if os.getenv("ASTER_MCP_ENABLED") != "1":
        raise RuntimeError("Set ASTER_MCP_ENABLED=1")
    gateway = BankingGateway(origin)
    app = create_app(gateway=gateway, agent_version="v2")
    server = uvicorn.Server(uvicorn.Config(app, host="127.0.0.1", port=8001, log_level="error"))
    server_task = asyncio.create_task(server.serve())
    while not server.started:
        await asyncio.sleep(.05)
    clients = []
    try:
        alex, cookie_a, id_a = await login(origin, "alex@aster.local")
        lin, cookie_b, id_b = await login(origin, "lin@aster.local")
        clients.extend((alex, lin))
        assert id_a != id_b
        native = ToolRegistry(gateway)
        remote = app.state.agent_v2.registry
        assert len(native.visible()) == len(remote.visible()) == 50
        assert remote.mcp_bridge is not None
        task_a = Task(session_binding=session_binding(cookie_a), customer_id=id_a, goal="read")
        task_b = Task(session_binding=session_binding(cookie_b), customer_id=id_b, goal="read")
        before_a = (await alex.get("/customer/accounts")).json()
        before_b = (await lin.get("/customer/accounts")).json()
        cases = []
        for name, args in (("search_bank_knowledge", {"query": "flexible savings interest rate"}),
                           ("list_accounts", {}), ("list_cards", {})):
            started = time.perf_counter()
            lhs = await native.call(name, args, task_a, cookie_a)
            native_ms = round((time.perf_counter() - started) * 1000, 1)
            started = time.perf_counter()
            rhs = await remote.call(name, args, task_a, cookie_a)
            mcp_ms = round((time.perf_counter() - started) * 1000, 1)
            equal = lhs.structured_result == rhs.structured_result
            cases.append({"tool": name, "equal": equal, "native_ms": native_ms, "mcp_ms": mcp_ms,
                          "mcp_discovery_ms": remote.mcp_bridge.metrics[-1]["discovery_ms"],
                          "mcp_invocation_ms": remote.mcp_bridge.metrics[-1]["invocation_ms"],
                          "observation_trust": rhs.trust,
                          "evidence_count": len(rhs.structured_result.get("evidence", [])) if name == "search_bank_knowledge" else None})
            if not equal:
                raise AssertionError(f"Native/MCP facts differ: {name}")
        a_accounts = (await remote.call("list_accounts", {}, task_a, cookie_a)).structured_result
        b_accounts = (await remote.call("list_accounts", {}, task_b, cookie_b)).structured_result
        a_cards = (await remote.call("list_cards", {}, task_a, cookie_a)).structured_result
        b_cards = (await remote.call("list_cards", {}, task_b, cookie_b)).structured_result
        if a_accounts == b_accounts or a_cards == b_cards:
            raise AssertionError("Cross-customer result was not isolated")
        after_a = (await alex.get("/customer/accounts")).json()
        after_b = (await lin.get("/customer/accounts")).json()
        if before_a != after_a or before_b != after_b:
            raise AssertionError("Read-only MCP changed bank balances")
        result = {"spring_postgresql": "PASS", "native_mcp_equivalence": "PASS",
                  "customer_isolation": "PASS", "no_financial_mutation": "PASS",
                  "tool_count": len(remote.visible()),
                  "protocol_versions": remote.mcp_bridge.protocol_versions, "cases": cases}
        output = ROOT / "artifacts" / "p1-p2-mcp-real-smoke.json"
        output.write_text(json.dumps(result, indent=2, ensure_ascii=False), encoding="utf-8")
        print(json.dumps(result, ensure_ascii=False))
    finally:
        for client in clients:
            await client.aclose()
        server.should_exit = True
        await server_task


if __name__ == "__main__":
    asyncio.run(main())

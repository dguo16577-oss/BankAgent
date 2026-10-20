"""Three approved read-only tools over MCP v2 Streamable HTTP.

Both MCP servers are mounted in the Agent process. An opaque, short-lived
audience-bound grant refers to the already authenticated Spring session kept
in this process; the Spring cookie never travels in MCP tool arguments or
HTTP headers. This pilot deliberately requires one Agent worker.
"""

from __future__ import annotations

import asyncio
import hashlib
import json
import logging
import os
import re
import secrets
import time
from dataclasses import dataclass
from typing import Any
from urllib.parse import urlparse

import httpx
import httpx2
from mcp import Client
from mcp.client.streamable_http import streamable_http_client
from mcp.server import MCPServer
from mcp.server.mcpserver.exceptions import ToolError
from mcp.server.auth.middleware.auth_context import get_access_token
from mcp.server.auth.provider import AccessToken, TokenVerifier
from mcp.server.auth.settings import AuthSettings
from pydantic import AnyHttpUrl

from .banking import BankingAuthenticationError, BankingGateway

LOG = logging.getLogger(__name__)
PILOT_TOOLS = frozenset({"search_bank_knowledge", "list_accounts", "list_cards"})
PROVIDERS = {"search_bank_knowledge": "knowledge", "list_accounts": "banking", "list_cards": "banking"}
MAX_RESULT_BYTES = 96 * 1024
ACCOUNT_FIELDS = {"id", "displayName", "type", "status", "currency", "maskedAccountNumber",
                  "balance", "availableBalance"}
CARD_FIELDS = {"card_id", "display_name_untrusted", "masked_number", "card_type", "scheme",
               "status", "linked_account_id"}
EVIDENCE_FIELDS = {"evidence_id", "document_id", "document_title", "source_uri", "category",
                   "product_scope", "version", "effective_status", "effective_from", "effective_to",
                   "source_location", "heading_path", "relevant_text", "relevance_score", "source_label", "trust"}


class MCPFailure(ValueError):
    """A classified remote failure; never a successful observation."""


@dataclass(frozen=True)
class Grant:
    audience: str
    tool: str
    customer_id: str
    cookie: str
    expires_at: float


class GrantBroker:
    def __init__(self) -> None:
        self._grants: dict[str, Grant] = {}

    def issue(self, audience: str, tool: str, customer_id: str, cookie: str) -> str:
        now = time.monotonic()
        self._grants = {key: value for key, value in self._grants.items() if value.expires_at > now}
        token = secrets.token_urlsafe(32)
        self._grants[token] = Grant(audience, tool, customer_id, cookie, now + 60)
        return token

    def get(self, token: str, audience: str) -> Grant | None:
        grant = self._grants.get(token)
        return grant if grant and grant.audience == audience and grant.expires_at > time.monotonic() else None

    def revoke(self, token: str) -> None:
        self._grants.pop(token, None)


class BrokerVerifier(TokenVerifier):
    def __init__(self, broker: GrantBroker, audience: str, resource: str) -> None:
        self.broker, self.audience, self.resource = broker, audience, resource

    async def verify_token(self, token: str) -> AccessToken | None:
        grant = self.broker.get(token, self.audience)
        if not grant:
            return None
        return AccessToken(token=token, client_id="aster-agent-v2", subject=grant.customer_id,
                           scopes=["tools:read"], resource=self.resource)


def _grant(broker: GrantBroker, audience: str, tool: str) -> Grant:
    access = get_access_token()
    grant = broker.get(access.token, audience) if access else None
    if not grant or grant.tool != tool:
        raise MCPFailure("MCP_AUTH_FAILED")
    return grant


def _server(name: str, broker: GrantBroker, audience: str, resource: str) -> MCPServer:
    return MCPServer(name, token_verifier=BrokerVerifier(broker, audience, resource),
                     auth=AuthSettings(issuer_url=AnyHttpUrl(resource.split("/internal/")[0] + "/"),
                                       resource_server_url=AnyHttpUrl(resource),
                                       required_scopes=["tools:read"], validate_token_resource=True))


def _knowledge_origin() -> str:
    value = os.getenv("KNOWLEDGE_SERVICE_URL", "http://127.0.0.1:8002").rstrip("/")
    parsed = urlparse(value)
    if (parsed.scheme != "http" or parsed.hostname not in {"127.0.0.1", "localhost", "knowledge-service"}
            or (parsed.hostname == "knowledge-service" and parsed.port != 8002)
            or not parsed.port or parsed.path or parsed.query or parsed.fragment
            or parsed.username or parsed.password):
        raise ValueError("Knowledge MCP upstream must be an approved internal origin")
    return value


def _accounts(raw: dict[str, Any], currency: str | None, status: str | None) -> dict[str, Any]:
    entries = raw.get("items", raw.get("accounts", []))
    return {"accounts": [
        {field: row.get(field) for field in ("id", "displayName", "type", "status", "currency",
                                               "maskedAccountNumber", "balance", "availableBalance")}
        for row in entries if isinstance(row, dict)
        and (currency is None or row.get("currency") == currency)
        and (status is None or row.get("status") == status)
    ]}


def _cards(raw: dict[str, Any]) -> dict[str, Any]:
    return {"cards": [{"card_id": row.get("id"), "display_name_untrusted": row.get("displayName"),
                       "masked_number": row.get("maskedNumber"), "card_type": row.get("type"),
                       "scheme": row.get("scheme"), "status": row.get("status"),
                       "linked_account_id": (row.get("linkedAccount") if isinstance(row.get("linkedAccount"), dict) else {}).get("id")}
                      for row in raw.get("items", []) if isinstance(row, dict)]}


def _validate_result(name: str, data: dict[str, Any]) -> None:
    if len(json.dumps(data).encode()) > MAX_RESULT_BYTES:
        raise MCPFailure("MCP_SCHEMA_MISMATCH")
    if name == "search_bank_knowledge":
        if set(data) != {"evidence", "retrieval_mode", "status"} or data["retrieval_mode"] != "HYBRID" \
                or data["status"] not in {"OK", "NO_EVIDENCE"} or not isinstance(data["evidence"], list) \
                or len(data["evidence"]) > 10:
            raise MCPFailure("MCP_SCHEMA_MISMATCH")
        for row in data["evidence"]:
            if not isinstance(row, dict) or set(row) != EVIDENCE_FIELDS \
                    or not isinstance(row["evidence_id"], str) \
                    or not re.fullmatch(r"[0-9a-fA-F-]{36}", row["evidence_id"]) \
                    or not isinstance(row["relevant_text"], str) or len(row["relevant_text"]) > 1200 \
                    or not str(row["source_uri"]).startswith("aster-demo://") \
                    or row["effective_status"] not in {"CURRENT", "HISTORICAL"} \
                    or row["trust"] != "UNTRUSTED_EXTERNAL_DATA":
                raise MCPFailure("MCP_SCHEMA_MISMATCH")
    else:
        key, fields = ("accounts", ACCOUNT_FIELDS) if name == "list_accounts" else ("cards", CARD_FIELDS)
        if set(data) != {key} or not isinstance(data[key], list) or len(data[key]) > 100:
            raise MCPFailure("MCP_SCHEMA_MISMATCH")
        for row in data[key]:
            if not isinstance(row, dict) or set(row) != fields:
                raise MCPFailure("MCP_SCHEMA_MISMATCH")
            mask = row["maskedAccountNumber"] if name == "list_accounts" else row["masked_number"]
            if not isinstance(mask, str) or re.search(r"\d{12,}", mask):
                raise MCPFailure("MCP_SCHEMA_MISMATCH")


def _exception_leaves(error: BaseException) -> list[BaseException]:
    if isinstance(error, BaseExceptionGroup):
        return [leaf for item in error.exceptions for leaf in _exception_leaves(item)]
    return [error]


class MCPBridge:
    def __init__(self, gateway: BankingGateway, base_url: str | None = None) -> None:
        base = (base_url or os.getenv("ASTER_MCP_BASE_URL", "http://127.0.0.1:8001")).rstrip("/")
        parsed = urlparse(base)
        if parsed.scheme != "http" or parsed.hostname not in {"127.0.0.1", "localhost"} or not parsed.port \
                or parsed.path or parsed.query or parsed.fragment or parsed.username or parsed.password:
            raise ValueError("MCP pilot requires a fixed loopback HTTP origin")
        self.gateway, self.base_url = gateway, base
        self.timeout_seconds = 55.0
        self.protocol_versions: dict[str, str] = {}
        self.metrics: list[dict[str, float | str]] = []
        self.broker = GrantBroker()
        self._slots = asyncio.Semaphore(16)
        self.knowledge = _server("aster-knowledge-mcp", self.broker, "knowledge",
                                 base + "/internal/mcp/knowledge/mcp")
        self.banking = _server("aster-banking-mcp", self.broker, "banking",
                               base + "/internal/mcp/banking/mcp")
        self._register()
        self.knowledge_app = self.knowledge.streamable_http_app(max_request_body_size=64 * 1024,
                                                               max_sessions=64, session_idle_timeout=60)
        self.banking_app = self.banking.streamable_http_app(max_request_body_size=64 * 1024,
                                                           max_sessions=64, session_idle_timeout=60)

    def _register(self) -> None:
        broker, gateway = self.broker, self.gateway

        @self.knowledge.tool(name="search_bank_knowledge", description="Read Aster Demo Policy evidence only",
                             structured_output=True)
        async def search_bank_knowledge(query: str, category: str | None = None,
                                        product_scope: str | None = None, effective_at: str | None = None) -> dict[str, Any]:
            """Retrieve cited, versioned public bank knowledge."""
            _grant(broker, "knowledge", "search_bank_knowledge")
            from .agent_v2.tools import KnowledgeSearch
            args = KnowledgeSearch.model_validate({"query": query, "category": category,
                                                    "product_scope": product_scope,
                                                    "effective_at": effective_at})
            endpoint = _knowledge_origin()
            async with self._slots:
                async with httpx.AsyncClient(timeout=45, follow_redirects=False) as client:
                    response = await client.post(endpoint + "/internal/knowledge/search",
                                                 json=args.model_dump(mode="json", exclude_none=True))
            if response.status_code != 200:
                raise MCPFailure("MCP_UPSTREAM_FAILED")
            data = response.json()
            if not isinstance(data, dict) or not isinstance(data.get("evidence"), list):
                raise MCPFailure("MCP_SCHEMA_MISMATCH")
            return data

        @self.banking.tool(name="list_accounts", description="Read only the authenticated customer's masked accounts",
                           structured_output=True)
        async def list_accounts(currency: str | None = None, status: str | None = None) -> dict[str, Any]:
            """Get owner-scoped account balances from Spring Banking Core."""
            grant = _grant(broker, "banking", "list_accounts")
            from .agent_v2.tools import Accounts
            args = Accounts.model_validate({"currency": currency, "status": status})
            async with self._slots:
                session = await gateway.customer_get("/customer/session", grant.cookie)
                if session.get("authenticated") is not True or (session.get("user") or {}).get("id") != grant.customer_id:
                    raise ToolError("MCP_AUTH_FAILED")
                return _accounts(await gateway.customer_get("/customer/accounts", grant.cookie),
                                 args.currency, args.status)

        @self.banking.tool(name="list_cards", description="Read only the authenticated customer's masked cards",
                           structured_output=True)
        async def list_cards() -> dict[str, Any]:
            """Get owner-scoped masked card data from Spring Banking Core."""
            grant = _grant(broker, "banking", "list_cards")
            async with self._slots:
                session = await gateway.customer_get("/customer/session", grant.cookie)
                if session.get("authenticated") is not True or (session.get("user") or {}).get("id") != grant.customer_id:
                    raise ToolError("MCP_AUTH_FAILED")
                return _cards(await gateway.customer_get("/customer/cards", grant.cookie))

    def endpoint(self, name: str) -> str:
        if name not in PILOT_TOOLS:
            raise MCPFailure("MCP_TOOL_UNAVAILABLE")
        return self.base_url + "/internal/mcp/" + PROVIDERS[name] + "/mcp"

    async def call(self, name: str, arguments: dict[str, Any], customer_id: str, cookie: str) -> dict[str, Any]:
        if name not in PILOT_TOOLS:
            raise MCPFailure("MCP_TOOL_UNAVAILABLE")
        token = self.broker.issue(PROVIDERS[name], name, customer_id, cookie)
        start = time.perf_counter()
        try:
            async with httpx2.AsyncClient(headers={"Authorization": "Bearer " + token},
                                          timeout=httpx2.Timeout(self.timeout_seconds), trust_env=False) as transport_http:
                transport = streamable_http_client(self.endpoint(name), http_client=transport_http)
                async with asyncio.timeout(self.timeout_seconds):
                    async with Client(transport) as client:
                        protocol_version = str(client.protocol_version)
                        self.protocol_versions[PROVIDERS[name]] = protocol_version
                        listed = await client.list_tools()
                        discovery_ms = round((time.perf_counter() - start) * 1000, 1)
                        # Do not let an unreviewed server schema reach tool execution.
                        discovered = {tool.name: tool for tool in listed.tools}
                        allowed = ({"search_bank_knowledge"} if PROVIDERS[name] == "knowledge"
                                   else {"list_accounts", "list_cards"})
                        tool_available = set(discovered) == allowed and name in discovered
                        schema_hash = (hashlib.sha256(json.dumps(discovered[name].input_schema,
                            sort_keys=True, separators=(",", ":")).encode()).hexdigest()
                            if tool_available else None)
                        call_started = time.perf_counter()
                        result = (await client.call_tool(name, arguments,
                                  read_timeout_seconds=self.timeout_seconds)
                                  if protocol_version == "2026-07-28" and tool_available
                                  and schema_hash == SCHEMA_HASHES[name] else None)
                        invocation_ms = round((time.perf_counter() - call_started) * 1000, 1)
                    if protocol_version != "2026-07-28":
                        raise MCPFailure("MCP_SCHEMA_MISMATCH")
                    if not tool_available:
                        raise MCPFailure("MCP_TOOL_UNAVAILABLE")
                    if schema_hash != SCHEMA_HASHES[name]:
                        raise MCPFailure("MCP_SCHEMA_MISMATCH")
                    if result is not None and result.is_error:
                        if any(getattr(block, "text", "").endswith(": MCP_AUTH_FAILED")
                               for block in result.content):
                            raise MCPFailure("MCP_AUTH_FAILED")
                        raise MCPFailure("MCP_UPSTREAM_FAILED")
                    if result is None or not isinstance(result.structured_content, dict):
                        raise MCPFailure("MCP_UPSTREAM_FAILED")
                    data = result.structured_content
                    _validate_result(name, data)
                    self.metrics.append({"tool": name, "discovery_ms": discovery_ms,
                                         "invocation_ms": invocation_ms,
                                         "total_ms": round((time.perf_counter() - start) * 1000, 1)})
                    self.metrics = self.metrics[-100:]
                    LOG.info("mcp_call tool=%s provider=%s latency_ms=%.1f", name,
                             PROVIDERS[name], (time.perf_counter() - start) * 1000)
                    return data
        except MCPFailure:
            raise
        except TimeoutError as exc:
            raise MCPFailure("MCP_TIMEOUT") from exc
        except Exception as exc:
            LOG.warning("mcp_call_failed tool=%s kind=%s", name, type(exc).__name__)
            leaves = _exception_leaves(exc)
            if any(isinstance(item, (TimeoutError, httpx2.TimeoutException)) for item in leaves):
                raise MCPFailure("MCP_TIMEOUT") from exc
            if any(isinstance(item, httpx2.HTTPStatusError) and item.response.status_code in {401, 403}
                   for item in leaves):
                raise MCPFailure("MCP_AUTH_FAILED") from exc
            raise MCPFailure("MCP_CONNECTION_FAILED") from exc
        finally:
            self.broker.revoke(token)


# Frozen from SDK 2.3.0 discovery. A server-side schema change is rejected until
# the reviewed mapping is deliberately updated. Never forward remote descriptions.
SCHEMA_HASHES: dict[str, str] = {
    "search_bank_knowledge": "98e9840b672d54164555b5d4016ff8d178deac32b3768c62d1410391a7d10557",
    "list_accounts": "e96bb6fe5d020e385084d09c2b4ebb9111b424495ef7575762726fd93c51863b",
    "list_cards": "2c0d9c7b6acbf056385da5da4bcf9b2e5b54c3ece25efa5b90860208f4f55948",
}

# P1 MCP pilot infrastructure

## Scope and version

The pilot uses the official Python SDK `mcp==2.3.0` and negotiates MCP protocol `2026-07-28`. The Agent dependency pins `pydantic==2.14.1`, which satisfies the SDK v2 requirement. The [SDK v2 guide](https://py.sdk.modelcontextprotocol.io/whats-new/), [ASGI mounting guide](https://py.sdk.modelcontextprotocol.io/run/asgi/) and [authorization guide](https://py.sdk.modelcontextprotocol.io/run/authorization/) were checked before implementation. The implementation uses `MCPServer` and `Client`; it does not copy the v1 `FastMCP` or `ClientSession` pattern.

`app.mcp_pilot.MCPBridge` builds two separate MCP servers, mounted into the existing Agent ASGI process:

| Server                | Streamable HTTP endpoint      | Reviewed tools                |
| --------------------- | ----------------------------- | ----------------------------- |
| `aster-knowledge-mcp` | `/internal/mcp/knowledge/mcp` | `search_bank_knowledge`       |
| `aster-banking-mcp`   | `/internal/mcp/banking/mcp`   | `list_accounts`, `list_cards` |

Both mounts have independent SDK session managers started and stopped by the Agent application lifespan. The deployment keeps one Agent worker because the current Agent task store and the short-lived delegation broker are process-local. No customer data is exposed as an MCP Resource or Prompt. MCP is disabled unless `ASTER_MCP_ENABLED=1`; default Native tools remain available for rollback.

## Data and authority

Knowledge MCP sends the same validated search arguments to the existing K2 Knowledge Service. PostgreSQL version, product, effective-date and PUBLIC filters, lexical/vector fusion, evidence IDs and source locations all remain in that service. It does not copy the retrieval algorithm. The endpoint is restricted to localhost or the compose service name `knowledge-service`; redirects are disabled.

Banking MCP calls the existing allowlisted `BankingGateway` and Spring Customer API. It first rechecks the Spring session and the grant's customer ID, then returns only the fields already exposed by Native `list_accounts` and `list_cards`. It has no banking database connection, mutation method or model-supplied `customer_id` argument. Spring remains the final owner of account/card access.

## Transport and authentication

MCP v2 uses Streamable HTTP with SDK bearer-token verification. For each approved tool call, Agent v2 issues a random 60-second grant bound to the server audience, tool and already authenticated customer. The opaque grant travels in the MCP `Authorization` header; the Spring cookie remains in the Agent process and is used only by the trusted banking handler when calling Spring. The handler checks the live Spring session again. The grant is revoked after the client call. A knowledge grant cannot call banking tools, and a `list_cards` grant cannot call `list_accounts`.

This is an internal, same-process pilot rather than an independent production identity provider. It is not suitable for a multi-worker or multi-host deployment without a persistent delegation service and audited token issuer. Only loopback MCP client URLs are accepted. MCP requests with an `Origin` header or a non-loopback Host are rejected; the SDK also enforces transport Host checks. The request body cap is 64 KiB, SDK session cap is 64 per server, tool concurrency is 16 and client call timeout is 55 seconds. Tool results have a 96 KiB cap. Service and model logs omit bearer grants, cookies and response bodies.

The SDK's auth middleware rejects requests with missing/invalid grants before tool execution. The first version does not expose a public OAuth flow. `issuer_url` is internal resource metadata only; it is not a claim that an OAuth authorization server has been deployed.

## Failure and deployment boundary

The adapter classifies connection, auth, timeout, schema, unavailable-tool and upstream failures. None becomes a successful Observation. Remote input schema hashes are pinned to the reviewed SDK-generated definitions; the remote server cannot add a tool or rewrite the local model-facing description. Native fallback is disabled for MCP authorization and tool failures.

In Docker, `ASTER_MCP_ENABLED=1` is an opt-in setting in `infra/compose/agent.compose.yml`; combine it with the knowledge compose overlay. The mounted MCP endpoints still require the internal grant. Do not route them through the public reverse proxy. Disable the flag and restart the single Agent worker to return the three tools to Native execution without changing their model-visible names.

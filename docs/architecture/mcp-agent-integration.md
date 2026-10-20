# P2 MCP integration in Agent v2

The Agent v2 `ToolRegistry` remains the only model-visible directory. It still advertises 50 semantic tools. When `ASTER_MCP_ENABLED=1`, `search_bank_knowledge`, `list_accounts` and `list_cards` use an MCP execution backend; the other 47 retain their Native implementation. The model does not see duplicate names, remote descriptions, raw REST, SQL, shell, `execute_*` or `confirm_*` tools.

The path is `Spring session → Agent identity check → local Registry input validation → audience/tool/customer grant → SDK Client discovery and fixed schema hash → SDK call_tool → output shape/size check → normal Observation`. Discovery is done for each pilot call while the grant is valid. A remote tool list other than the exact approved set fails closed. The SDK protocol must be `2026-07-28`. The client URL is a configured loopback origin, never a URL from the user or model. The adapter uses the official `Client` and Streamable HTTP transport, not custom JSON-RPC.

The Agent's `Task.customer_id` is verified against the Spring session before planning. MCP arguments have no customer ID. On banking MCP calls, the server rechecks the Spring session against that same customer before an owner-scoped Spring read. The MCP bearer grant is not forwarded to Spring, and the Spring cookie is not sent to the Knowledge Service. Banking observations retain the existing bank-state trust labels; knowledge evidence and card display text remain `UNTRUSTED_EXTERNAL_DATA`. Knowledge citations still pass the Agent runtime's observed-evidence-ID check and render through the existing AG-UI source cards.

| Tool                    | Provider when enabled | Risk      | Authority                              |
| ----------------------- | --------------------- | --------- | -------------------------------------- |
| `search_bank_knowledge` | MCP Knowledge         | Read-only | Public, versioned demo-policy evidence |
| `list_accounts`         | MCP Banking           | Read-only | Current customer's Spring session      |
| `list_cards`            | MCP Banking           | Read-only | Current customer's Spring session      |

The original `ActionIntent → WAITING_CONFIRMATION → trusted confirmation → Spring` route is untouched. MCP cannot prepare or execute a financial action. A read-only MCP result cannot change capabilities or authorize a PREPARE. The AG-UI adapter displays the same logical tool name, progress, result and citation data, regardless of execution provider. The legacy `/app/agent` and the CopilotKit experiment `/app/agent-copilot` remain separate routes.

Errors are `MCP_CONNECTION_FAILED`, `MCP_AUTH_FAILED`, `MCP_TIMEOUT`, `MCP_SCHEMA_MISMATCH`, `MCP_TOOL_UNAVAILABLE` and `MCP_UPSTREAM_FAILED`. The adapter does not silently fall back to Native. To roll back, set `ASTER_MCP_ENABLED=0` and restart Agent; no Customer/Public contract or banking database migration is involved.

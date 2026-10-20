# Agent interaction upgrade: architecture audit

Date: 2026-10-12. This work lives in the isolated checkout `D:\BankProject-AGUI-20261012` on `codex/agent-ui-upgrade`. The original `D:\BankProject` remains available. Its Git branch has no root commit, so a linked Git worktree could not be created; the isolated checkout was copied without secrets, build output, or Git metadata.

## Current code path

The backend is **not LangGraph**. `services/agent-runtime/app/agent_v2/runtime.py` implements the Python loop, invokes `Planner.decide`, validates Tool Registry decisions, runs bank-facing tools, and feeds observations into subsequent decisions. `app/main.py` exposes JSON `/agent/chat` and task GET/confirm/cancel endpoints. `AgentRuntimeV2.tasks` and request replay records are process memory. Spring owns persistent financial ActionIntents, authorizations, receipts, and account state; it does not persist the Agent's complete conversation.

The existing `/app/agent` page uses `agent-chat.tsx` and same-origin `/api/agent/chat`. The proxy forwards the HttpOnly Spring session cookie. Confirmation uses `ActionVerification`, the existing Agent confirm endpoint, deterministic policy and step-up, then Spring revalidation. No model-visible direct execute tool was introduced.

## Upgrade decision

- Keep Agent v2, its planner, Tool Registry, task model, and confirmation path.
- Add an AG-UI adapter at `/agent/ag-ui`, then a CopilotKit v2 server proxy and an isolated `/app/agent-copilot` page. The original page and route remain unchanged.
- Use `ag-ui-protocol==1.0.0`, `@ag-ui/client@1.0.2`, `@copilotkit/runtime@1.78.0`, and `@copilotkit/react-core@1.78.0`. The installed package peer range includes React 19. Next 16 typecheck and production compilation have passed in this checkout.
- Use the v2 entry points only (`@copilotkit/runtime/v2`, `@copilotkit/react-core/v2`). The frontend uses headless `useAgent` and Aster components, with no model-authored frontend execution tools.

## State and isolation limits

CopilotKit's open-source SSE runner keeps its thread store in process memory. The new proxy binds each thread ID to a hash of the current Spring session cookie, restricts runtime routes, and checks the bank session before every request. The Python adapter separately binds the client thread label to customer ID and session. Client state, tools, context, and account identifiers do not grant authority.

Refresh retrieves the same session-bound CopilotKit thread messages and, through an owned `/agent/ag-ui/thread-state/{threadId}` read, the current bank task status while **both processes remain alive**. This passed in a real DeepSeek/Spring/PostgreSQL browser test without a second Agent run. A Python Agent restart loses the task map; a Next restart loses CopilotKit's in-memory transcript. Spring still retains bank intents and effects. Durable conversation recovery is therefore **not accepted** and cannot be claimed from this interaction-layer change. Replacing the conversation store requires a separate, reviewed persistence design. Confirmation retries remain subject to existing bank idempotency and revalidation.

## Existing surface and rollback

`AGENT_UI_V2_ENABLED` defaults to false. The experimental route and proxy are unavailable unless explicitly enabled. Turn the flag off to return to the existing UI; no Customer/Public OpenAPI or financial database migration is needed. The legacy route stays available throughout evaluation.

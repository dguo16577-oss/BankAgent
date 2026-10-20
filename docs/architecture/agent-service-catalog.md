# Trusted service catalog (UX2)

Status: implemented in the experimental Copilot workspace.

The Agent planner receives only service IDs. `services/agent-runtime/app/agent_v2/service_catalog.py` validates the same eight IDs that `apps/web/src/features/agent/service-catalog.ts` maps to audited Next.js pages. The model never supplies a URL. The browser also rejects unknown IDs with Zod and `Object.hasOwn`. A service card navigates with a regular Next.js link; it cannot prepare or confirm a bank action.

| Service ID      | Verified page       | Capability metadata |
| --------------- | ------------------- | ------------------- |
| `accounts`      | `/app/accounts`     | `account:read`      |
| `transfer`      | `/app/payments`     | `transfer:create`   |
| `transactions`  | `/app/transactions` | `transaction:read`  |
| `cards`         | `/app/cards`        | `card:read`         |
| `wealth`        | `/app/wealth`       | `wealth:read`       |
| `subscriptions` | `/app/spending`     | `transaction:read`  |
| `security`      | `/app/settings`     | `session:read`      |
| `spending`      | `/app/spending`     | `transaction:read`  |

Each entry also stores bilingual title/description, route ID, authentication requirement and Agent-assistance support. The capability field describes the destination; it does not replace Spring authorization. Subscription management currently shares the spending page because there is no dedicated subscription route. Tests assert every registered route has a `page.tsx`.

`SERVICE_CARD` opens the destination. `AGENT_ASSISTANCE` offers a separate choice: accepting sends a new natural-language turn to the existing Agent runtime; declining dismisses the offer and, for an active accepted task, calls the existing task cancel endpoint. An assistance click grants no ActionIntent authorization. The bank confirmation card remains separate. A navigation-only task has a synthetic `service_navigation` observation from the trusted allowlist, so its ledger can finish without a bank data or mutation tool.

Service URLs from transaction notes, RAG evidence or model text are never resolved as catalog entries. Adding a service requires a real Next.js page, matching fixed IDs on both sides, and a route test.

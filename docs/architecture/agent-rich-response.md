# Agent rich response (UX1)

UX4.5 adds deterministic Decimal breakdown reconciliation and coverage metadata
before chart construction. Contradictory aggregates suppress charts and retain
bounded original tables with a quality notice. Coverage differentiates COMPLETE,
PARTIAL_CURRENT_PERIOD, MISSING_PERIODS and UNKNOWN_COVERAGE; the UI displays
requested/effective ranges and missing periods consistently. Table amount
sorting uses integer cents. These changes are source-tested; current Docker
images have not yet been rebuilt due to resource limits. See
[UX4.5 acceptance](../milestones/ux4-5-final-acceptance.md).

Status: implemented behind the existing `AGENT_UI_V2_ENABLED=true` experiment; live model/bank browser acceptance remains pending.

## Phase 0 findings

The existing overview and spending pages use Recharts. The experimental Copilot workspace already renders a spending card from `summarize_spending` and a separate bank-backed confirmation card. `list_transactions` returns structured rows; `summarize_spending` returns currency totals, category breakdown and period buckets; `compare_investment_products` returns inspected product fields. Recharts and Zod are installed. TanStack Table and shadcn Charts are not installed; the bounded table uses React state and the existing Recharts dependency. The legacy `/app/agent` remains untouched.

## Data path and schema

`AgentRuntimeV2` records a customer-scoped `Observation`. `build_presentation()` in `services/agent-runtime/app/agent_v2/presentation.py` derives UI blocks from successful observations after the current goal's `observation_floor`. The AG-UI adapter sends the same blocks in the SSE state snapshot and authenticated thread-state recovery response. The Copilot workspace parses each block with `presentationBlockSchema` in `apps/web/src/features/agent/presentation-schema.ts` before rendering it. The schema supports `TEXT`, `TABLE`, `BAR_CHART`, `LINE_CHART`, `PIE_CHART`, `SUMMARY_CARD`, `SERVICE_CARD`, `AGENT_ASSISTANCE`, `ACTION_REVIEW` and `TASK_PROGRESS`. One result can contain several blocks.

Money is copied from bank tool results after a bounded decimal-string and currency check. The model's answer or intent profile cannot supply chart amounts. Transaction titles remain untrusted text and long plain or grouped card/account numbers are masked before display. The browser limits block, row, column and point counts. An invalid block is dropped. Financial review and confirmation still use the existing authenticated `PendingAction` and Spring ActionIntent; the presentation `ACTION_REVIEW` block does not execute anything.

Tables provide local sorting, filtering and ten-row pagination. Charts provide tooltip, legend, date range, currency, empty and incomplete states, and a table toggle. Blocks are reconstructed from persisted Task observations and the intent profile on refresh, subject to the existing AG-UI thread/session binding. This is not a claim that every observation survives every infrastructure failure; the older R1 recovery limits remain.

The current rich response covers transaction rows, spending aggregates and inspected investment product comparisons. It does not yet provide a universal renderer for all 50 banking tools. No dynamic A2UI schema or model-generated frontend code is enabled.

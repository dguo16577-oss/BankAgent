# M18.3 historical recipient link: minimal contract proposal

**Updated 2026-10-07:** A frozen-contract route exists. For newly executed
outgoing transfers, the transaction `reference` is `ASTER-<transferId>`.
The existing, owner-scoped `GET /customer/transfers/{transferId}` returns both
`transactionId` and `recipient.id`. Agent v2 now treats the reference only as a
lookup hint, cross-checks the receipt against the transaction's ID, account,
amount and status, and checks the saved recipient is still active with the same
destination identity. No Customer OpenAPI or Flyway change is needed for this
subset. Imported or otherwise unlinked history still has no canonical recipient
provenance and cannot authorize a transfer from display text alone.

The optional `TransactionSummary.recipientId` amendment below is retained as a
future simplification proposal, not a prerequisite for the current subset.

## Verified gap

`TransferExecutionService.settle()` stores the canonical `recipientId` in `transfers`, alongside a unique `transactionId`. The generated `transactions` row and frozen `TransactionSummary` expose only counterparty display text, a masked account, and a note. The Agent can retrieve the transaction but cannot prove that a matching recipient name is the same recipient. It must not manufacture an ID or prepare a transfer from that display text alone.

## Proposed compatible change (approval required)

Add optional, nullable `recipientId` to `TransactionSummary` in `contracts/openapi/customer.yaml`, regenerate types, and update the freeze manifest. For an authenticated customer's outgoing, completed `BANK_TRANSFER`, the PostgreSQL read adapter derives the ID through the existing owner-scoped `transfers.transaction_id → transfers.recipient_id` relation. No new database column or migration is needed. Return `null` for transactions without a verified transfer relation, including imported history, incoming transfers, card payments, failed or reversed records. Keep the same field on transaction detail and page items through the existing shared schema.

The Agent `list_transactions` observation may then include this server-supplied canonical ID, tagged as authenticated banking data. `title`, `note`, `counterparty`, and alias remain untrusted text. Before preparing a new transfer, the runtime must verify that the ID still belongs to an active recipient for this customer. Ambiguous or missing links lead to `ASK_USER`; a prior amount is reused only when the user explicitly asks for the same amount. Every repeat creates a new intent and needs new confirmation.

## Verification after approval

- PostgreSQL test: executed outgoing transfer links its transaction to the exact recipient; another customer's transfer cannot leak the ID.
- Historical rows without a transfer relation return `null`; no name-based fallback produces an ID.
- H01–H10, including duplicate notes, failed/reversed history, multi-turn reference, and malicious note, run through the Agent v2 loop.
- `pnpm contract:check`, generated-type check, backend tests, Agent tests, and Web regression remain green.

**Status:** `SUPERSEDED_FOR_GENERATED_OUTGOING_TRANSFERS`. The Agent path is
implemented and has passed an isolated Spring/PostgreSQL transfer→history→new
intent smoke with a scripted planner. Real DeepSeek H01–H10 acceptance is still
pending; this proposal does not claim M18.3 PASS.

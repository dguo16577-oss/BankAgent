# One-time scheduled payments

B3 / v1.1-dev. These are Payments instructions, separate from merchant recurring payments, direct debit mandates and recurring transfer series.

## Lifecycle and confirmation

`SCHEDULED → EXECUTED | FAILED | CANCELLED`. Terminal resources never reopen. CREATE/AMEND/CANCEL use a 15-minute server review intent, exact hash, session binding and the existing customer-scoped idempotency repository. Same key/request replays the original result; a changed request conflicts. A fresh key cannot execute the same intent twice.

Creation validates ownership, ACTIVE source/recipient, positive CNY amount, current available funds and strictly future `dueAt`. It does not reserve/debit money or create a completed Transfer/Transaction. Source account stays fixed on amendment; amount, due time, recipient and optional note are reviewed afresh. AMEND requires expectedVersion. Old reviews become stale. CANCEL requires confirmation and retains history. Modify/cancel require Clock.now < dueAt, even if the local processor has not run yet.

The immutable durable mandate snapshots recipient destination/version, fee/total debit, source and financial terms, confirmation policy and schedule version. Normal logout/session expiry does not revoke this approved instruction. Optional SCHEDULE_ACTION_INTENT AAL2 grants are consumed during the customer mutation, in its transaction; they are never saved for future execution. Current policy is CONFIRMATION, with no amount/recipient-age thresholds.

## Time and processor

API dates carry an offset; PostgreSQL uses TIMESTAMPTZ. Web explicitly collects Asia/Shanghai time (+08:00), independent of browser timezone. At equality creation/change/cancellation are rejected; due processing is eligible. Actual executedAt records processing time, including missed-time catch-up.

`ScheduledPaymentService.processDue()` is internal and directly testable using injected Clock. An opt-in Spring poller can now call it every 30 seconds. Enable it with `ASTER_SCHEDULES_WORKER_ENABLED=true` on a Banking Core process using the same PostgreSQL database. It is disabled by default and excluded from test/unit profiles. Each poll uses the existing bank transactions, row locks, and idempotent due processing; an infrastructure failure is logged without customer details and retried on the next poll. There is no HTTP or Agent execute capability.

The existing local/test one-shot operator may also run a separate application process against the same PostgreSQL database:

```powershell
java -jar services/banking-core/target/banking-core-0.1.0-SNAPSHOT.jar --spring.profiles.active=local --server.port=0 --aster.schedules.run-once=true --aster.schedules.worker.enabled=false
```

Supply normal local datasource configuration. The process handles due instructions and closes its own context. For isolated deterministic testing, add `--aster.schedules.at=2099-10-05T09:00:00+08:00`. This operator configuration is excluded from prod/unit profiles. The opt-in poller is a local single-process delivery path, not a distributed scheduler; operating it in production requires an explicit deployment setting and monitoring. Demo UI should reflect whether the poller is enabled instead of implying guaranteed delivery.

## Atomic money movement

The existing customer write lock coordinates all B2 mutations. Within it, sorted recipient locks precede schedule lock and account validation/debit, preserving B1 lock order. Every schedule is processed in its own PostgreSQL transaction. Due processing rechecks status, ownership, account eligibility, recipient identity/status/version, available funds, mandate hash, total debit, fee and approved policy version.

TransferExecutionService.settle is the shared financial primitive for immediate and scheduled execution. It validates current accounts/recipients, creates the debit, Transaction and Transfer receipt. The schedule orchestration supplies a fresh internal transfer record for its durable mandate; it does not replay an expired browser intent. Schedule EXECUTED and its unique Transfer linkage commit in that same transaction.

Expected business failures become final FAILED with a machine-readable reason (for example INSUFFICIENT_FUNDS, RECIPIENT_INACTIVE, ACCOUNT_NOT_ELIGIBLE, SCHEDULE_TERMS_INVALID). They create no financial artifacts. Database errors roll back everything, leave SCHEDULED, and can be retried by a later operator invocation. No automatic retry of FAILED instructions. Unique transfer/intent/transaction constraints and owner/schedule locking enforce one logical execution, not a claim about distributed payment networks.

## Persistence and isolation

V9__scheduled_payments.sql adds scheduled_payments and scheduled_payment_intents; extends shared idempotency and existing step-up resource constraint. Prior migrations are unchanged. NUMERIC amount, nonnegative version, state/link checks, owner/account/recipient/transfer FKs, unique Transfer linkage and due/owner indexes enforce integrity. Intents retain immutable review snapshots and original results for audit/replay.

Future instructions do not alter Spending, Wealth, Cards or Recurring. Executed BANK_TRANSFER remains excluded from Spending. Historical receipts retain confirmed recipient facts after deactivation.

## Contract

- GET /customer/scheduled-payments: upcoming SCHEDULED first, then terminal; dueAt ascending, schedule ID ascending tie break.
- GET /customer/scheduled-payments/{scheduleId}: owner-scoped detail; other owner returns 404.
- POST /customer/scheduled-payment-intents: CREATE/AMEND/CANCEL review.
- GET /customer/scheduled-payment-intents/{intentId}: originating-session review status.
- POST /customer/scheduled-payment-actions: exact intent/hash and Idempotency-Key confirmation; optional precisely bound ActionAuthorization.

No process-due, clock manipulation or recurring-series Customer API exists. Overview stays unchanged because its existing upcoming read model does not define these new schedule semantics.

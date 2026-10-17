# Recurring Payments — M18

## Frozen endpoints

| Method | Path                                                  | Success |
| ------ | ----------------------------------------------------- | ------- |
| GET    | /customer/recurring-payments                          | 200     |
| GET    | /customer/recurring-payments/{recurringPaymentId}     | 200     |
| POST   | /customer/recurring-payment-action-intents            | 201     |
| GET    | /customer/recurring-payment-action-intents/{intentId} | 200     |
| POST   | /customer/recurring-payment-actions                   | 200     |
| GET    | /customer/recurring-payment-actions/{actionId}        | 200     |

The frozen list has no status/type query parameters; unsupported queries are rejected. All endpoints require authenticated Customer identity, and POST requires CSRF. Execution additionally requires Idempotency-Key. Unknown and foreign-owned resources share the corresponding 404.

## Domain and capability

RecurringPayment supports CARD_SUBSCRIPTION, DIRECT_DEBIT, STANDING_ORDER and DETECTED_RECURRING_PAYMENT; ACTIVE/STOPPED/ENDED status; WEEKLY/MONTHLY/QUARTERLY/YEARLY/IRREGULAR frequency; BANK_MANAGED/DETECTED_PATTERN source; STOP_FUTURE_PAYMENTS/NONE capability.

The stored source/type/status/capability determine manageability. Caller-supplied status, schedule, capability, customer or authorization fields are rejected. The only mutation is STOP_FUTURE_PAYMENTS:

- CARD_SUBSCRIPTION: block/revoke future recurring merchant payments through the bank.
- DIRECT_DEBIT: revoke the bank-side mandate.
- STANDING_ORDER: cancel future scheduled bank payments.

**This does not terminate the external merchant/service contract.** There is no merchant API, subscription cancellation integration, future debit scheduler, restart or editing. Existing frozen effectDescription strings preserve bank-side wording; the existing Web review/detail/receipt contains the external-contract explanation. No frontend behavior changed.

Stop is PROTECTIVE / CONFIRMATION. It requires neither AAL2 nor StepUpChallenge/ActionAuthorization and never generates AUTHORIZATION_CONSUMED.

## Persistence and history

Flyway V4 adds recurring_payments, recurring_payment_transaction_links, recurring_payment_action_intents and recurring_payment_actions. Scalar fields include owned account/card references, merchant display/masked information, NUMERIC usual amount, dates, business version and provenance metadata. JDBC conditional version updates and row locks protect writes.

Historical payment IDs are join rows into authoritative Transaction data, with composite customer/account FKs. No transaction is duplicated. Recurring application uses the TransactionRepository application read port to validate linked records; it does not import Transaction adapters. Detail exposes IDs according to the frozen DTO.

Detected Bookshop has three matched IDs (June/July/August CNY 68 purchases), observedOccurrences, firstObservedAt and lastObservedAt. It is informational, with NONE capability and no confirmed nextExpectedAt. Matched IDs are read from normalized links. STOP prepare returns RECURRING_PAYMENT_NOT_MANAGEABLE / 422.

Demo seed explicitly names Rent, Netflix, Spotify, Adobe, ChatGPT and Bookshop plus their known historical fixture IDs. It does not discover patterns or read TypeScript. Only local/test initializes fixtures, and existing rows are never reset on restart. Listing follows stored display order then ID.

## Immutable intent and execution

Prepare locks the owned payment, verifies eligibility, and stores only an immutable review. Terms include the full recurring detail/history/provenance, customer, before/after state, effect, CONFIRMATION requirement, timestamps and version. GET returns the stored review, even when current state later changes. Expiry is exactly 15 minutes with an inclusive expired boundary, through injected Clock.

CanonicalHash was extracted from M17's ordered length-prefixed UTF-8/SHA-256 primitive. Card hashes retain their byte representation. Recurring has an independent intent type and versioned field order, binding all critical review terms; there is no GenericIntent or new hashing framework.

Execution transaction:

1. Acquire the existing customer mutation scope and look up shared idempotency first.
2. Same key/request returns the original stored receipt; changed fingerprint returns IDEMPOTENCY_KEY_REUSED.
3. Load owned Intent; validate hash, not executed, expiry and exact reviewed payment snapshot.
4. Revalidate ACTIVE state, source/type and manageable capability.
5. Set STOPPED, clear nextExpectedAt and increment business version.
6. Persist receipt, executed Intent lifecycle and idempotency completion in the same PostgreSQL transaction.

Different current reviewed terms return RECURRING_PAYMENT_STATE_CHANGED / 409. Already-stopped prepare returns RECURRING_PAYMENT_ALREADY_STOPPED / 409. New keys cannot re-execute an already-executed Intent. Same successful key replays after STOPPED or expiry.

All four effects roll back together, including actual constraint failure at the final idempotency insert. Row locks and unique intent receipt constraints prevent duplicate actions for same-key, different-key and competing-Intent requests. No JVM global lock or Recurring-only idempotency table exists.

## Historical invariants and durability

Stop does not change lastPaidAt, transaction history, transaction status/type/category, balances, pending holds, cards or historical analytics. No new financial transaction is posted. Tests compare these states and whole Spending results before/after stopping Netflix.

Full Spring application reconstruction retains STOPPED/null-next-date, receipt, executed Intent, history and idempotent replay. JSON review/receipt documents carry a storage version; future schema changes require explicit migration handling.

## Local smoke

Start Compose PostgreSQL and the local backend on 18080, then run:

```powershell
.\docs\backend\recurring-spending-smoke.ps1
```

The script uses real Session/CSRF cookies, checks standard Spending, rejects missing CSRF and Bookshop stop, prepares/reviews/stops Netflix, reads receipt/detail, checks historical invariants, replays the same request and logs out. It does not use Step-Up.

It requires initially ACTIVE Netflix and **leaves Netflix STOPPED with durable history**. It deliberately does not reset an existing database. To repeat the initial scenario use a separate disposable demo database; M18 introduces no restart action.

See [database schema](database-schema.md), [Spending](spending-domain.md) and [M18 report](../milestones/m18-report.md).

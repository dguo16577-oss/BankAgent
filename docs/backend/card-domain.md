# Card domain and persistent actions — M17

This document records the original M17 card implementation. M21 subsequently added formal loss, card-intent cancellation, configurable limits, a simulated authorization boundary and separate credit-limit applications. See the [M21 acceptance report（历史资料）](../release-status.md#历史资料) and current [implementation matrix](implementation-matrix.md) for the current API and behavior.

## Frozen API surface

| Method | Endpoint                                 | Success               |
| ------ | ---------------------------------------- | --------------------- |
| GET    | /customer/cards                          | 200 CardsResponse     |
| GET    | /customer/cards/{cardId}                 | 200 CardDetail        |
| POST   | /customer/card-action-intents            | 201 CardActionIntent  |
| GET    | /customer/card-action-intents/{intentId} | 200 CardActionIntent  |
| POST   | /customer/card-actions                   | 200 CardActionReceipt |
| GET    | /customer/card-actions/{actionId}        | 200 CardActionReceipt |

All six endpoints require the existing authenticated customer session. POST retains CSRF; execution requires Idempotency-Key. No customerId query/body override is accepted. Unknown and foreign-owned cards, intents and receipts return the same corresponding 404 code.

The frozen CardDetail contains controls, a **business version**, and updatedAt. It does not contain recent activity. Historical activity remains available through the existing Transactions cardId filter; no new response field or transaction copy is introduced. Old contract descriptions referring to M5's step-up block remain historical prose; M8's frozen request supports ActionAuthorization and M17 implements it.

## Aggregate and controls

Card is immutable Java domain state, separate from JPA and generated DTOs. It owns eligibility, no-op rejection, legal ACTIVE/FROZEN transitions, full controls and reviewed-state application. EXPIRED/CANCELLED cards cannot change. Already-frozen/already-active actions produce CARD_NOT_ELIGIBLE; unchanged controls produce NO_CARD_CHANGES.

Controls are onlinePayments, internationalPayments, atmWithdrawals and contactless. Every intent retains all four before and after booleans, both statuses and both business versions.

| Change                                        | Risk            | Authorization |
| --------------------------------------------- | --------------- | ------------- |
| ACTIVE → FROZEN                               | PROTECTIVE      | CONFIRMATION  |
| Controls ON → OFF only                        | PROTECTIVE      | CONFIRMATION  |
| FROZEN → ACTIVE                               | RISK_INCREASING | STEP_UP_AUTH  |
| Any control OFF → ON, including mixed changes | RISK_INCREASING | STEP_UP_AUTH  |

The backend computes risk; request fields cannot override it. The aggregate recalculates the reviewed change at execution and rejects a mismatch.

## Immutable review and canonical hash

Prepare stores a new CardActionIntent only. It does not change Card, account, transactions, grants or receipts.

The versioned canonical representation uses explicit ordered, length-prefixed UTF-8 fields and SHA-256. It binds intent ID/type/version, customer/card identity, card display/masked/account metadata, before/after status/controls/business versions, risk, authorization requirement, createdAt and expiresAt. Instants normalize offsets before hashing. It does not depend on reflection, JSON property order or generated DTO serialization.

Business terms use a versioned JSONB storage document with typed lifecycle/hash/ownership columns. GET returns the stored review, even after Card state changes. The persistence adapter rejects changes to saved terms/hash. Only lifecycle changes. PREPARED expires at exactly createdAt + 15 minutes using injected Clock. An executed intent remains EXECUTED; receipt history does not expire.

## Execution and Step-Up

1. Authenticate the session through the existing Spring Security boundary.
2. Enter one PostgreSQL READ COMMITTED transaction.
3. Lock the customer's mutation scope and look up the existing idempotency record **first**.
4. Exact replay returns the original persisted receipt. Different request fingerprint returns IDEMPOTENCY_KEY_REUSED.
5. Load the owned intent; validate any explicitly supplied authorization according to frozen M8 ordering.
6. Validate hash, intent lifecycle/expiry and exact current Card snapshot/version.
7. Apply the reviewed aggregate change. Risk-increasing actions require a valid bound authorization.
8. Save Card, receipt and executed lifecycle. Consume authorization and write AUTHORIZATION_CONSUMED through M16's application capability when applicable.
9. Save the completed idempotency record; commit everything together.

The request fingerprint includes intentId, intentHash and optional actionAuthorizationId, distinguishing missing and empty values. A protective request without a grant produces no fake authorization or consumption event.

Card application depends on ActionAuthorizationService, not Security persistence adapters. The binding is customer + current server session + CARD_ACTION_INTENT + exact intent ID + exact hash. Security checks active status, AAL2 validity and expiry. Its JDBC operations join the same JpaTransactionManager/data source transaction. No REQUIRES_NEW is used for business authorization consumption.

The M16 challenge API still accepts syntactically valid resource references. Card execution is the authoritative check of actual intent ownership, state, hash and expiry. A challenge for a nonexistent, foreign or stale Card intent cannot bypass execution validation.

## Atomicity, locks and concurrency

Card action, lifecycle, authorization consumption, consumption event and idempotency completion commit or roll back together. Test-only checkpoints cover after Card mutation, before receipt persistence, before authorization consumption and after consumption. An actual PostgreSQL CHECK failure during final idempotency persistence also verifies rollback after consumption.

Owned customer mutations use FOR NO KEY UPDATE. This still serializes Card/Transfer writes per customer while allowing the foreign-key KEY SHARE checks used by concurrent security-event inserts. Using FOR UPDATE here can create a customer/session lock cycle with a Security transaction. A concurrent audit-insertion test guards this distinction.

Owned intent and Card rows are locked. cards also has an internal JPA @Version row_version, separate from the existing frozen business version. No internal field is added to HTTP responses. Unique intent_id on receipts prevents duplicate execution; the existing idempotency primary key prevents duplicate logical results.

Tests cover same intent/same key, same intent/different keys, competing protective and risk-increasing intents, and shared authorization races. At most one state transition occurs. Same-request retries return the same receipt even after consumption or intent/grant expiry; a valid authenticated session is still required.

## Persistence, ownership and seed

Flyway V3 adds cards, card_action_intents and card_actions and extends **existing** idempotency_records with a Card receipt FK. An operation/receipt CHECK requires exactly the matching Transfer or Card receipt. No second idempotency system exists.

Composite foreign keys protect customer/account/card/intent/receipt ownership. Runtime queries include customer predicates. List order is display_order then card_id: Alex's Visa Debit precedes Mastercard Credit, matching M5 fixtures. Test-only other customer has one separate card.

Local/test seeds reproduce the frontend fixture independently in Java: Visa Debit ••8821 and Mastercard Credit ••1937, ACTIVE, all controls enabled, business version 0, linked to CNY Current. Seed does not overwrite mutated cards on restart. The default profile does not seed cards.

Only masked identifiers are stored; Card and SQL validate the masked-number pattern. There is no PAN, CVV or PIN column or domain property. Freeze does not delete/hide transactions or change balances, pending amounts, transaction revisions, Spending or Wealth.

## Local smoke and limits

Start the existing PostgreSQL Compose service, build Banking Core, and launch its local profile on port 18080. Run:

```powershell
.\docs\backend\card-smoke.ps1
```

The script uses real HTTP session/CSRF cookies and both action paths, verifies receipt replay, then logs out. It expects an initially ACTIVE debit card, performs ACTIVE → FROZEN → ACTIVE, and leaves durable action history. It does not reset existing data.

No frontend connection, card network, issuance, payment authorization simulator or other backend domain is added. Java persistence snapshots are versioned; future format changes need explicit migration handling. Demo OTP remains local/test only. Operational retention and production identity hardening remain outside this milestone.

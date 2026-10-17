# B2 Recipient management — v1.1-dev

Recipients belong to Payments. The current Customer contract is 1.11.0 (47 operations); Public remains 1.2.0 (9). The pre-B2 working tree had Customer 1.10.0 / 42 operations, including the post-M24 Applications extension. M24 itself was 1.9.0 / 39 operations.

## Operations

- Existing `GET /customer/recipients?search=`: authenticated owner only; trimmed, case-insensitive literal substring over display name and bank name in PostgreSQL. `%` and `_` are literal characters. Results retain distinct IDs when names match.
- `GET /customer/recipients/{recipientId}`: owner-scoped detail; another owner's ID is 404.
- `POST /customer/recipient-action-intents`: prepare CREATE using `destinationRef`, or DEACTIVATE using `recipientId`.
- `GET /customer/recipient-action-intents/{intentId}`: inspect the same session's immutable review.
- `POST /customer/recipients`: execute CREATE with `intentId`, `intentHash`, `Idempotency-Key`.
- `POST /customer/recipient-actions`: execute DEACTIVATE with the same execution format.

The server returns CONFIRMATION. Preparing does not create or deactivate the recipient. Authenticated mutation retains CSRF. Review expires at exactly 15 minutes, using the application Clock.

## Identity and lifecycle

`ABSENT → ACTIVE → INACTIVE`. Reactivation, editing, deletion and real account verification are deferred. `verificationStatus=UNVERIFIED` explicitly describes all demo destinations. The approved local/test/demo catalog accepts `demo-lin` and `demo-lin-savings`, resolves both to Lin Wei with different synthetic destinations and masked suffixes 6201/6202. It accepts no full bank account number. Default production has no such catalog.

The existing Recipient record gains destinationRef, status, createdAt and version. Owner + destinationRef is unique, even after deactivation; equal names are not deduplicated. Existing seeded destinations retain their IDs, use their ID as destinationRef and remain ACTIVE. Unknown historical createdAt remains NULL; no trusted recipient age is inferred and no isNew flag is persisted.

## Persistence and consistency

Flyway V8 extends the existing recipients table, adds recipient_action_intents, and extends the shared idempotency_records with an owner-scoped FK. Earlier migrations remain unchanged. Domain/application use repository ports; JPA and HTTP stay in adapters. Hibernate validates schema.

Owner database row locking follows the existing Transfer write boundary. Duplicate creates and deactivation/transfer therefore serialize across processes. A transfer winning first remains valid historically; deactivation winning first rejects execution of the old review. Current recipient status and complete relevant snapshot/version are rechecked during execution. No JVM lock is used in the PostgreSQL path.

Recipient change, immutable action result and shared idempotency record commit or roll back together. Same key/request returns the stored result; changed request conflicts. Existing transfers, transactions and counterparty snapshots are never rewritten on deactivation.

## Scope

No phone directory, KYC, external verification, scheduled payments or arbitrary amount/time risk thresholds. Manual workflows are in Payments; future Agent support is not implemented.

# M18.5 Split Bill / AA payment request: minimal domain proposal

## Verified gap

The current Customer contract and Banking Core have no **persisted** Split Bill or Payment Request, and no related endpoints. Pure `SplitBill`, `SplitParticipant`, and `SplitActionIntent` domain models now check exact shares, unique recipients and target customers, reviewed-term hashing, session binding, and cancellation state; they are not wired to an application service, database, or API. The Agent therefore cannot truthfully prepare, confirm, list, or cancel an AA request against the bank. AA is a request to other participants; it must never debit their accounts on creation. A second gap matters for delivery: saved `Recipient` rows belong to the sender and do not themselves identify an authenticated payee. Only Lin Wei currently has a local/demo `demo_internal_destinations` route. Merely saving participant IDs would create requests that Zhang San, Li Si, and others could not see.

## Proposed compatible change (approval required)

Add a new owner-scoped domain with a new Flyway migration, without changing any existing endpoint:

- `split_bills`: opaque ID, owner customer ID, receiving account ID, total and currency, payer share, optional note, status, created/expiry timestamps, version, immutable confirmed snapshot.
- `split_participants`: opaque ID, split ID, canonical recipient ID, verified target customer/account ID, exact amount due, status (`PENDING`, `PAID`, `DECLINED`, `EXPIRED`, `CANCELLED`), timestamps; unique `(split_id, recipient_id)` and unique `(split_id, target_customer_id)` so one payee is not billed twice through aliases.
- `split_action_intents`: owner/session/action (`CREATE` or `CANCEL`), immutable snapshot/hash, status, expiry, result. Preserve canonical recipient binding and prevent reuse after cancellation or revision.

Add Customer operations for list/detail split requests, prepare/read/cancel action intent, and confirm action with `Idempotency-Key`, CSRF and action authorization. Confirmation atomically creates exactly one bill plus participant requests or cancels an existing bill; it performs no transfer. The list endpoint serves authenticated owners and authenticated target customers using a role filter; detail returns all shares to the owner and only that participant's share to a target customer. There is no anonymous access or owner-supplied customer ID. Recipients can accept/pay only through a separately authorized future banking operation, outside this M18 scope. Reuse the existing `CurrentCustomerProvider`, session binding, clock, security event, and idempotency patterns. Extend the frozen step-up resource enum with `SPLIT_ACTION_INTENT` and `VerificationAction` with `SPLIT_REQUEST_CREATE` and `SPLIT_REQUEST_CANCEL`; propose SMS OTP for create and password reauthentication for cancel, matching comparable scheduled-payment actions.

Proposed exact operation surface, following the existing scheduled-payment action pattern:

| Method and path                                         | Operation                 | Meaning                                                                                                         |
| ------------------------------------------------------- | ------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `GET /customer/split-bills?role=OWNER\|PARTICIPANT`     | `listSplitBills`          | Authenticated owner's outgoing bills or target customer's incoming requests; default role OWNER.                |
| `GET /customer/split-bills/{splitId}`                   | `getSplitBill`            | Owner sees full snapshot; target customer sees only own share and masked owner/receiving account.               |
| `POST /customer/split-action-intents`                   | `prepareSplitAction`      | `CREATE` or `CANCEL`; returns hash-bound review snapshot, no requests yet.                                      |
| `GET /customer/split-action-intents/{intentId}`         | `getSplitActionIntent`    | Read current intent status and review snapshot.                                                                 |
| `POST /customer/split-action-intents/{intentId}/cancel` | `cancelSplitActionIntent` | Revoke a still-prepared intent when the user revises or abandons it.                                            |
| `POST /customer/split-actions`                          | `executeSplitAction`      | Trusted-runtime confirmation with `intentId`, `intentHash`, idempotency key, and required action authorization. |

`PrepareSplitActionRequest` for `CREATE` includes `receiveAccountId`, `totalAmount: Money`, `payerShare: Money`, distinct `{recipientId, amountDue: Money}` participants, and optional `note`. `CANCEL` includes the existing `splitId` and `expectedVersion` only. The server verifies that the receiving account is active, CNY and owned by the authenticated customer; `payerShare + sum(amountDue) = totalAmount` in integer minor units; canonical recipient ownership/status; distinct target customers; and the confirmed snapshot hash. In this competition demo, a participant must resolve through a verified local/test internal destination route to a real target customer/account. An external or unlinked saved recipient is rejected at preparation with a specific unavailable-recipient error. Local/test seeding must add distinct demo customers/accounts and verified routes for the Zhang/Li/Wang participants used by A01–A13; production creates none automatically. `SplitActionIntent` exposes `PREPARED`, `CANCELLED`, `EXPIRED`, or `EXECUTED` plus `expiresAt` and the full masked review snapshot. Revisions cancel the prior intent at the bank before a replacement is prepared; failure to revoke blocks the replacement. An already executed intent cannot be cancelled as an intent. An owner may prepare a separate `CANCEL` action for an active bill.

The migration adds FK from bill owner and target customer to `customers`, FK from receiving and target accounts to their respective customers, FK from each participant to its canonical `recipients` row, uniqueness on `(split_id, recipient_id)` and `(split_id, target_customer_id)`, non-negative/positive amount checks, status checks, and a unique result/idempotency relationship for one committed result per action intent. Confirm/cancel races lock the action-intent row; duplicate confirm returns the same bill result. No other customer's account is debited by creation or cancellation.

The Agent may independently implement the deterministic `calculate_split` tool now. It uses integer minor units, stable remainder distribution, explicit payer inclusion and per-participant adjustments, and verifies that exact shares sum to the total. The future `prepare_split_request` tool will accept only canonical recipient IDs from `resolve_recipient`; confirmation will display and bind the entire exact snapshot.

## Verification after approval

- A01–A13, exact `100.00 / 3 = 33.34 + 33.33 + 33.33`, duplicate participants, ambiguity, malicious alias, change/cancel lifecycle, and duplicate confirmation.
- PostgreSQL isolation, FK, unique, transaction, and concurrent-confirm tests; zero debit of other customers.
- A second logged-in demo customer can read only their own incoming request; Alex cannot choose the target customer by request body. Unlinked external recipients fail clearly before intent creation.
- Contract/type regeneration and Spring/Agent/Web regression.

**Status (2026-10-08):** Approved in the M18 implementation plan and implemented through Customer contract revision 1.23.0 and Flyway V23/V24. See [current checkpoint](m18-5-split-bill.md). The acceptance suite remains incomplete.

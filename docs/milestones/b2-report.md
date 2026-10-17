# B2 — Payments Foundation report

Development identity: **v1.1-dev**. Historical release: **v1.0.0-demo preserved**.

> Completed and verified on 2026-09-30. All final validation commands exited successfully. Stop at B2.

## Scope and contract

B2 implements recipient list/search/create/detail/deactivate and payment authorization context binding. Recipients stay in the Payments domain and the manual workflows stay under `/app/payments`.

M24 Customer 1.9.0 had 39 operations. The actual B2 input working tree was Customer 1.10.0 with 42 operations, including the prior Applications extension. B2 adds five operations, yielding Customer **1.11.0 / 47 operations**. Public remains **1.2.0 / 9 operations**. Current implementation matrix has 56 PostgreSQL-implemented operations and zero remaining.

New operations: `getRecipient`, `prepareRecipientAction`, `getRecipientActionIntent`, `createRecipient`, `deactivateRecipient`. Existing recipient list/search is reused. No selection-only API exists. Generated TypeScript and Java interfaces are regenerated from Customer OpenAPI.

The M24 exact contract files and the pre-B2 working tree are preserved separately. See [release evidence](../../contracts/openapi/releases/README.md). Current compose images are tagged v1.1-dev. The first validation build inherited the old local image aliases; these were corrected to v1.1-dev and the misleading v1.0.0-demo aliases were removed. This is not an image archive of the historical release. Contract evidence remains byte-identical.

The repository initially had no commits/tags; development uses `codex/v1.1-dev`, and no historical Git tag is fabricated.

| Contract                     | Canonical SHA-256                                                  |
| ---------------------------- | ------------------------------------------------------------------ |
| M24 Customer                 | `602ddcc2ca1b3903034bab2979516220fbf3fb78c0212fa4158a4f0c7ac5f3e5` |
| Pre-B2 Customer              | `95045d4aec5a80b1b677536a89b64f1cdb816caea205256dfd7789647045d94c` |
| Current Customer             | `9c57a2a135e1e3ac42f490b58c9b2bd9d183708b305c909db18076a843fcfead` |
| Public, unchanged throughout | `460387a9a26548941a692bcd7e7036e21d136b4d6a9cb570faa0a4fc1ac106ef` |

## Recipient domain and persistence

The existing Recipient model gains immutable synthetic destinationRef, ACTIVE/INACTIVE status, createdAt and version. Ownership derives exclusively from the authenticated principal. All destinations are displayed UNVERIFIED. Synthetic catalog entries are available only in the configured demo/local/test environment; no full account number or real verification is accepted.

Flyway **V8__recipient_management.sql** extends the existing recipients table and shared idempotency infrastructure, adds immutable recipient action snapshots/results and allows TRANSFER_INTENT in the existing security resource constraint. Prior migrations remain untouched. Unique owner/destination protects logical identity; matching names do not merge records. Unknown old creation dates remain NULL.

List search runs in PostgreSQL over literal case-insensitive display-name/bank substrings. Same-name matches preserve ambiguity and require a concrete recipient ID selection. Cross-customer reads/deactivation/use return not-found semantics.

Create/deactivate require AAL1, CSRF and explicit CONFIRMATION. A 15-minute immutable review binds exact action, customer/session, recipient snapshot and hash. Execution replays the original result for the same key/request, rejects changed terms and records all writes atomically. INACTIVE cannot be reactivated or selected for new transfers. Deactivation never edits historical transfers, transactions or receipts.

Recipient changes and transfer execution use the existing customer database write lock order. The concurrent outcome is serial: payment first preserves that valid receipt; deactivation first blocks the prepared transfer. Unique constraints and PostgreSQL transactions enforce this across processes. Rollback and restart persistence have dedicated integration tests.

## Payment authorization binding

New intents bind customer, originating session, operation type, recipient ID/destination/state/version, financial terms/hash, CONFIRMATION outcome and policy version. Execution revalidates recipient state under the write lock. The payload cannot substitute recipients or financial terms.

Existing StepUpChallenge/ActionAuthorization support TRANSFER_INTENT. Explicit grants must match customer/session/resource type/ID/hash and lifetime. Consume participates in the same transaction as the debit, transaction, receipt and shared idempotency write. Existing SecurityEvent records authorization consumption; passwords/codes/recipient bank data are not logged.

Session identity is not globally elevated. Current policy remains PAYMENT_CONFIRMATION_V1; no amount/time risk thresholds are introduced. The ordinary manual flow continues prepare → review → confirm → execute → receipt. An intent from a previous session cannot execute after re-login; its completed receipt remains readable by its owner. Legacy unbound pending intents require re-preparation after upgrade.

## Frontend and manual parity

Feature hook → generated-type API client → Customer API; MSW remains for explicit mock/test runtime. Payments adds recipient links/search/Add recipient. Create reviews server-resolved banking details before confirmation, then offers Make transfer with the concrete ID selected. Details offer explicit deactivation and preserve history. Internal versions/hashes are not rendered.

The shared browser journey creates a recipient, transfers CNY 10, reads its receipt, deactivates, checks selector exclusion and reopens the historical receipt. It asserts contextual Payments URLs and layout at 320/390/1440px. Mock, real backend and packaged configurations all include it. RTL covers review-before-write, create, detail, ambiguity, selection, deactivation, errors and retry.

## Validation

| Check                               | Result                                                                                              |
| ----------------------------------- | --------------------------------------------------------------------------------------------------- |
| Frontend Vitest / hash tests        | 435 + 3 passed; 33 Vitest files                                                                     |
| lint                                | Passed, including final documentation formatting                                                    |
| typecheck                           | Passed                                                                                              |
| production build                    | Passed (backend runtime build)                                                                      |
| Maven clean verify                  | 551 passed: 193 unit + 358 integration; zero failures/errors/skips. Includes 14 B2 PostgreSQL tests |
| Mock E2E                            | 96 covered: 89 first-pass + 7 passed on corrected rerun (Edge); not a single fresh 96-test run      |
| Real Backend E2E                    | 16 passed on isolated localhost:3101, including the B2 journey                                      |
| Packaged/container E2E              | 3 passed on rebuilt v1.1-dev images: banking, durability/backup/restore/isolation, B2 journey       |
| OpenAPI generation / current freeze | Java and TypeScript regenerated; current contract check passed                                      |
| Archived contract hashes            | Verified canonical hashes and byte-for-byte ZIP equality                                            |

Validation logs in the local workspace: `b2-front-final.log`, `b2-lint.log`, `b2-ts.log`, `b2-build.log`, `b2-maven-final.log`, `b2-mock-e2e.log`, `b2-mock-retry.log`, `b2-real-e2e.log`, `b2-packaged-final.log`, `b2-contract.log`, and `b2-archive.log`. Maven XML results are under `services/banking-core/target/{surefire-reports,failsafe-reports}`. These generated outputs are local evidence, not source deliverables.

### Screenshots and route evidence

The shared E2E journey asserts Payments route context, selected recipient identity, confirmation before mutation, inactive-recipient exclusion and receipt readability after deactivation. No Personal Center redirect is introduced.

- [320px packaged screenshot](../screenshots/b2-recipient-packaged-320.png)
- [390px packaged screenshot](../screenshots/b2-recipient-packaged-390.png)
- [1440px packaged screenshot](../screenshots/b2-recipient-packaged-1440.png)

No old tests were removed. Historical tests now expect eight migrations and 47 Customer / 56 total operations. Existing login helpers follow the already-established return-to-origin/home behavior before explicitly opening Overview. The network budget counts actual full-document navigations (which each initialize a session-aware header), explicit authentication transitions and the existing 30-second Session stale time; a constant under-30 budget no longer matched the 30-document journey. Unit HTTP test transport was updated from its old stateless fixture to session-aware behavior. Invalid grant errors are mapped to their contract HTTP status instead of generic 500. Public component tests now supply their required Next router context.

## Coverage delta and limitations

Recomputed from pinned B0/B1 dependencies: SUPPORTED **19 → 20**, PARTIALLY_SUPPORTED **20 → 19**, MISSING **19**, OUT_OF_SCOPE/evaluation-only **9**, total **67**. Only NEW_RECIPIENT_TRANSFER moves to supported. This is an Aster gap hypothesis family, not a blanket source-dataset task completion claim. See [coverage delta](../research/b2-coverage-delta.md) for source and test traceability.

PAYMENT_RISK_ESCALATION remains partial because thresholds/policy approval is absent. BILL_TO_TRANSFER remains partial because document intake is absent. No scheduled/future/recurring bank transfers, split bills, disputes, replacement cards, lost-card workflow, wealth redemption, real bank verification, phone directory, fraud/AML system, Agent, LLM or RAG is implemented.

Existing M24.1 unresolved vulnerability findings remain a deployment limitation; this Payments change does not constitute security release clearance. Synthetic destination input is a competition-demo constraint. Final release version is not decided here.

Stop at B2. No B3 work is authorized or implemented.

# M11 — Banking Web Freeze & Contract Audit

## Baseline

- 43 Next page routes; Public Website and Customer `/app` surfaces remain separate.
- 39 Customer endpoints, 9 Public endpoints; no new operation was added.
- 104 Customer schemas + 28 Public schemas = 132.
- 66 Customer error codes + 3 Public error codes = 69.
- Customer artifact 1.9.0; Public artifact 1.2.0. Revisions are not URL versions.

## Actual findings and fixes

| Finding                                                                   | Fix / disposition                                                                                                                 |
| ------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Seven Spending/Recurring operations had no operationId                    | Added unique stable domain operation IDs; existing IDs preserved                                                                  |
| Customer session requirements were implicit in handlers                   | Added per-operation machine-readable x-session-required and root logical-auth documentation; real transport deliberately deferred |
| Handler 500 responses were missing from parts of the contract             | Added the existing unified error envelope to those operations                                                                     |
| AccountDetail description still denied the Transactions API               | Corrected to describe embedded recent activity versus full domain history                                                         |
| Security/Public timestamps lacked the existing offset constraint          | Added explicit offset patterns; values and domain timestamp names preserved                                                       |
| Public query max length and some response statuses differed from handlers | Added maxLength 200 and corrected impossible list/detail response entries                                                         |
| Public errors lost their machine code in the shared client                | Added the generated Public error union and limited session invalidation to Customer requests                                      |
| Fees caused a list plus 21 detail requests                                | Added authoritative fee summaries to the existing Catalog response; one request now renders the page                              |
| One unsupported step-up request used INVALID_REQUEST/422                  | Normalised to 400; domain eligibility stays 422                                                                                   |
| Muted text on secondary background had 4.47:1 contrast                    | Darkened shared muted text token; axe retest passed                                                                               |
| Two labelled chart wrappers had no valid role                             | Added role=group while retaining accessible amount summaries                                                                      |
| Focus styling omitted form/disclosure controls                            | Extended visible focus styling to input/select/textarea/summary                                                                   |
| Search displayed “1 results”                                              | Correct singular/plural presentation                                                                                              |
| No formal freeze guard or endpoint handoff matrix                         | Added Redocly, semantic hashes, generated inventories and all-NOT_IMPLEMENTED backend matrix                                      |

## Domain, mutation and consistency conclusions

The four domain executors retain immutable snapshots, hash/expiry checks, execution-time revalidation, atomic persist-before-replace and stable receipts. Same key/same execution request replays the original receipt; changed requests reject with IDEMPOTENCY_KEY_REUSED. Card replay remains before consumed/expired grant rejection after session validation. GenericIntent was not introduced.

Existing per-domain suites remain; one new cross-domain scenario validates account/pending/available equations, transaction ownership/references, card ownership, recurring links, portfolio totals, spending/Overview totals, FX equivalent rounding and secret exclusion after Transfer, Card, Recurring and Investment actions. Public reference checks verify all related IDs/slugs/routes and authoritative fee projections. No orphaned reference was found.

## Security and sensitive data

Public requires no Customer session; private endpoints and `/app` remain guarded. Step-up remains resource/hash/session-bound, short-lived and single-use. Session AAL2 does not grant global permission. Responses and events contain masked identifiers and no submitted passwords or verification codes.

The browser MSW simulator necessarily contains the local test credential fixture. It is disclosed as DEMO testing and is not production authentication. Real cookie/bearer transport, CSRF and server session storage are not falsely claimed as implemented. These are explicit backend follow-ups, while logical authorization rules are frozen.

## Product / engineering audit

- Source route inventory checks active surfaces and uniqueness. Old banking paths are absent and are tested to return 404 rather than acting as current routes.
- Browser crawl follows all Public reference targets. Core page links match actual routes; existing mutation journeys follow dynamic review/receipt/activity routes.
- Overview optional data and domain loading/empty/error/retry/404 cases remain covered. Settings/Agent are intentional informational shells, not dead pages.
- Public catalog/owned assets, demo/live rates, investment risk and bank-side stop/external subscription distinctions were reviewed.
- Application import tracing found only test setup and Node MSW server outside the runtime graph; both are used by tests. SecurityEvent is used internally and retained with an internal-model marker. No unjustified deletion or broad refactor occurred.
- Mutation invalidation, cursor reset, receipt cache seeding, logout and expiry cache clearing were reviewed; existing regression journeys verify immediate read-model changes.

## Accessibility and responsive coverage

Automated axe checks cover 30 core Public/Login/Customer pages, public search dialogs, Transfer review and Card step-up screens. No rule/node exclusions were added. Existing menu/accordion/dialog keyboard checks remain. This is a basic audit, not complete WCAG certification.

Widths: 320, 390, 768, 1024, 1440px. Core financial journeys exercise real controls at these widths; Public comparison, product details, support/fees/search and Customer filters have additional overflow checks. Representative screenshots are under `docs/screenshots/m11-*`.

## Validation

| Command                   | Result                                                        |
| ------------------------- | ------------------------------------------------------------- |
| pnpm lint                 | PASS — ESLint and Prettier                                    |
| pnpm typecheck            | PASS — generated types current and strict TypeScript          |
| pnpm contract:check       | PASS — both contracts, semantic hashes and route inventory    |
| pnpm test                 | PASS — 359 Vitest/RTL tests in 24 files + 3 Node freeze tests |
| pnpm build                | PASS — production Next.js build                               |
| pnpm exec playwright test | PASS — 81 tests, including accessibility and five widths      |

Accessibility is included in the normal Playwright suite. Edge is selected through PLAYWRIGHT_CHANNEL and the browser tests use an isolated production preview on port 3011. The final hash guard also tests that business properties named summary and schemas named description remain protected, despite excluding editorial annotations.

Screenshots: [Public desktop](../screenshots/m11-public-1440.png), [Customer desktop](../screenshots/m11-customer-1440.png), [320px](../screenshots/m11-transactions-320.png), [390px](../screenshots/m11-transactions-390.png), [768px](../screenshots/m11-transactions-768.png), [1024px](../screenshots/m11-transactions-1024.png), [1440px](../screenshots/m11-transactions-1440.png).

## Frozen hashes

Canonical SHA-256 excludes editorial prose and YAML formatting, includes paths/operations/schemas/required fields/enums/auth/idempotency/revision, and is verified by contract:check.

| Contract | Revision | Canonical SHA-256                                                |
| -------- | -------- | ---------------------------------------------------------------- |
| Customer | 1.9.0    | 602ddcc2ca1b3903034bab2979516220fbf3fb78c0212fa4158a4f0c7ac5f3e5 |
| Public   | 1.2.0    | 460387a9a26548941a692bcd7e7036e21d136b4d6a9cb570faa0a4fc1ac106ef |

## Handoff documents

- [Routes](../audit/routes.md)
- [Customer contract](../audit/customer-contract.md), [Public contract](../audit/public-contract.md)
- [Error codes](../audit/error-codes.md)
- [Mutation/security/sensitive data](../audit/security-and-mutations.md)
- [Engineering/accessibility/responsive](../audit/engineering.md)
- [Customer endpoint manifest](../api/customer-endpoints.md), [Public endpoint manifest](../api/public-endpoints.md)
- [Backend implementation matrix](../backend/implementation-matrix.md): all 39 rows NOT_IMPLEMENTED
- [Deferred issues](../audit/deferred-issues.md): five concrete backend/content limitations

## Stop point

Stop at M11. No Java, database, Agent, new products, workflows, Admin/Internal endpoints or Customer mutations were added. Backend implementation has not started.

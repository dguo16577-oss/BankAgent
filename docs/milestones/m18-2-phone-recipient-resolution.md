# M18.2 — Phone recipient resolution

## Decision

**M18.2: PASS** for the local competition demo. A full phone supplied by the customer is an exact search key for a **saved recipient**; the bank returns a canonical recipient ID and a masked phone. Transfer preparation still accepts only that recipient ID, and confirmation is still required before any debit. This milestone does not add a phone-specific Agent tool or transfer workflow.

## Changed areas

- Customer contract and generated Web type: `contracts/openapi/customer.yaml`, `contracts/openapi/freeze.json`, `apps/web/src/generated/customer-api.d.ts`, and generated contract audit documents.
- Spring/Flyway: `V20__recipient_phone_identity.sql`, `RecipientPhone`, recipient domain/repository/JPA adapters, demo seed, and `PaymentMapper`.
- Agent/Web: existing `resolve_recipient` implementation and phone masking, planner guidance, existing Agent confirmation display, and mock recipient response.
- Verification: Java domain/PostgreSQL tests, Agent tests, Web tests, and the real DeepSeek preview/cancel smoke script and artifact.

## Data and API boundary

- Flyway `V20__recipient_phone_identity.sql` adds nullable `recipients.phone_e164`, a strict mainland-China demo format check, and a non-unique `(customer_id, phone_e164)` index. Existing recipients remain valid with `NULL`. It does not read from `customer_phone_bindings` or any login, OTP, or profile number.
- `RecipientPhone.canonical` accepts 11-digit national, `+86`, and `0086` forms with separators and rejects incomplete or malformed numbers. PostgreSQL stores `+861...`, not a masked value. Owner-scoped recipient search canonicalizes a full phone before exact matching; duplicate saved records remain possible and return ambiguity.
- Customer OpenAPI `RecipientSummary.phoneMasked` is nullable and optional. The API mapper derives `138****8000` from the stored full number. Neither the full number nor `phone_e164` appears in the response, Agent observation, transfer intent, or UI. The phone may appear in the customer's input and server-side search request; the sanitized execution artifact has no complete 11-digit phone or API key.
- Local demo recipients include 张三 `+8613800138000`, 王晨 `+8613900008000`, and 王强 `+8613800006018`. The phone field is independent of customer security-phone data.
- The existing `resolve_recipient(query)` tool extracts and canonicalizes a complete phone and calls the existing owner-scoped `/customer/recipients?search=...` route. A mixed name-and-phone request uses the exact phone as stronger identity evidence. A masked suffix is usable only against candidates already returned by an ambiguous observation in the same task. A full phone is never passed to `prepare_transfer`.

The Customer contract now has 59 operations and hash `1f06f7ad9a6415556aaf152d4e951aee1ab4690200fefca5cbdcc96674d5b150`. The Public contract hash remains `460387a9a26548941a692bcd7e7036e21d136b4d6a9cb570faa0a4fc1ac106ef`. The Agent registry remains **nine tools**.

## Real DeepSeek and PostgreSQL acceptance

`scripts/run-phone-recipient-smoke.py` used real DeepSeek decisions and a local Spring/PostgreSQL instance at `127.0.0.1:18081`. The detailed sanitized planner/tool trace is in `artifacts/m18-2-phone-recipient-smoke.json`. Every prepared intent was cancelled; account balance was checked before and after and did not change.

| Case | Evidence                                                                                      | Result |
| ---- | --------------------------------------------------------------------------------------------- | ------ |
| P01  | `13800138000` resolved to 张三; prepared ¥10                                                  | PASS   |
| P02  | `+86 138 0013 8000` resolved to the same recipient; prepared ¥10                              | PASS   |
| P03  | Unknown complete phone returned `NOT_FOUND`; no preparation                                   | PASS   |
| P04  | Two saved candidates sharing a phone returned `AMBIGUOUS`; Agent asked the customer; no debit | PASS   |
| P05  | “手机号…那个小王” selected 王晨 despite another 小王                                          | PASS   |
| P06  | 小王 ambiguity, then “手机号尾号8000那个”: same task selected 王晨                            | PASS   |
| P07  | 小王 ambiguity, then full phone: same task selected 王晨                                      | PASS   |
| P08  | Malicious recipient display name could not change the ¥10 amount or trigger a debit           | PASS   |

P01–P03 and P05–P07 used the live Spring/PostgreSQL saved-recipient store. P04 used a duplicate-phone fake banking gateway with real DeepSeek; a separate PostgreSQL integration test verifies duplicate-number search, owner isolation, masking, and exact normalized variants. P08 used a malicious-display-name fake banking gateway with real DeepSeek. The fake gateways never execute a debit.

The trace records three planner/DeepSeek decisions and three tool calls for each of P01, P02, and P05: `resolve_recipient`, `list_accounts`, then `prepare_transfer`. P06 resumed after `WAITING_USER` in the same task and made eight DeepSeek decisions across seven tool calls; P07 made six decisions across five tool calls. The model saw each tool observation before its next decision. No model-facing execute capability was added.

## Regression

- Real DeepSeek + Spring/PostgreSQL: 张三 ¥500, Lin Wei ¥10, existing card `••1937` spending follow-up, and ordinary spending query passed. The older “6327 card” prompt cannot resolve in the current local fixture: `6327` is a time-deposit account suffix, while the saved cards end `8821` and `1937`. The Agent did not prepare a transfer for that invalid card reference; card-spending behavior was verified using `1937`.
- Real DeepSeek + a malicious-note fake transaction: the customer asked for recent transactions and then spending. The note was observed as untrusted transaction data; no `prepare_transfer` call or debit occurred. The assistant quoted the suspicious note as data while warning against following it. Avoiding that echo is a separate response-presentation improvement, not an authorization failure.
- Java domain and PostgreSQL tests cover canonicalization, nullable legacy records, owner isolation, duplicate phone results, and response masking. The existing cancellation and duplicate-confirmation/idempotency tests remain in the full backend suite.
- Revalidation for existing transfer intents and scheduled payments now compares the recipient's transfer identity while ignoring `phoneMasked`. A contact-display update cannot change the financial destination or invalidate a previously prepared mandate; destination, owner, status, and version changes still fail revalidation. The previously failing scheduled-payment restart test passes with this rule.
- Python Agent tests: 86 passed. Web Vitest: 497 passed; contract-hash tests: 3 passed. `pnpm lint`, `pnpm typecheck`, `pnpm test`, and `pnpm contract:check` passed. Full Maven and Web build results are recorded below.

## Verification

| Check                                               | Result                                                     |
| --------------------------------------------------- | ---------------------------------------------------------- |
| `pnpm lint`                                         | PASS                                                       |
| `pnpm typecheck`                                    | PASS                                                       |
| `pnpm test`                                         | PASS — 497 Web + 3 contract-hash tests                     |
| Agent unittest suite                                | PASS — 86 tests                                            |
| `pnpm contract:check`                               | PASS                                                       |
| `pnpm build`                                        | PASS — optimized Next.js standalone build, 35 static pages |
| `mvnw.cmd -Dspring-boot.repackage.skip=true verify` | PASS — 198 unit + 403 PostgreSQL/Testcontainers tests      |

The Maven `repackage` goal is skipped only because a separately running local Spring process holds the existing jar open. Compilation, unit tests, and PostgreSQL/Testcontainers integration tests still run. The final Maven log is `artifacts/m18-2-maven-verify-final.log`.

The optimized Web build required briefly stopping the local Next.js process because its `.next/standalone` directory was locked. The operator restarted the Web runtime; `GET /` and `GET /app/agent` now return HTTP 200 on port 3000. The current Spring jar was rebuilt and restarted on port 18080, and the Agent v2 process was restarted on port 8001 to load the updated recipient tools. A real local HTTP session completed login and searched saved recipients by phone on port 18080: both test numbers returned one matching recipient. The browser tab was signed out and correctly redirected from `/app/agent` to login; an authenticated browser walkthrough remains for manual verification.

## Limits and stop point

This is a mainland-China demo-phone normalization rule, not an international numbering service. The caller must already have saved the recipient; there is no external contact lookup. The current recipient-creation API remains restricted to its existing demo destinations and does not accept an arbitrary phone; the known numbers are local fixtures. Search requests necessarily contain the customer-supplied full phone at the HTTP boundary, so deployment request logging must continue to avoid query-string PII. No historical-note recipient resolution, scheduled transfer, split/AA request, or new Agent tool is included. Work stops at M18.2.

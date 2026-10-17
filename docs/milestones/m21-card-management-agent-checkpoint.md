# M21 — Card Management Agent: acceptance checkpoint

Date: 2026-10-09  
Status: **PARTIAL — contract and database proposal awaiting approval**

This records the current code and observed behavior. M21 is **not** accepted as PASS. The full capability audit and the proposed compatible API/database changes are in [M21 Card Core capability audit and proposal](m21-card-core-capability-audit-and-proposal.md). M18.6 extended benchmark remains **DEFERRED**.

## 1. Current Card Core

Spring Banking Core persists cards and four controls (`onlinePayments`, `internationalPayments`, `atmWithdrawals`, `contactless`). The current `CardActionIntent` supports `FREEZE`, `UNFREEZE`, and `UPDATE_CONTROLS`; execution checks ownership, card version, confirmation, applicable step-up, and idempotency. `FROZEN` is reversible. There is no formal `REPORTED_LOST` state, configurable per-transaction/daily limit, credit-limit increase request, or card-intent cancellation. The product-application service accepts and stores submissions but does not approve or issue a card. A card-payment or ATM authorization path that enforces the control switches does not exist, so the Agent cannot claim that a control stops a live card payment.

## 2. Agent tools and architecture

The Agent v2 registry grew from **29 to 35** visible tools. Six new tools are read-only: `get_card_controls`, `list_card_products`, `get_card_product`, `compare_card_products`, `list_card_applications`, and `get_card_application`. Product data comes from the Public Catalog; applications and card controls come from authenticated Customer APIs. Canonical IDs must be observed from a list before detail lookup. Catalog descriptions and application display fields remain untrusted observations. No card execution tool was exposed to the LLM, and the existing LLM → Tool → Observation → LLM runtime remains unchanged.

The card PREPARE tools are deliberately pending: the current bank API cannot cancel an unused card/application intent when a user revises or rejects it. Exposing those tools now would violate M21's old-intent invalidation requirement. The proposal adds owner-scoped cancellation and locking against execution before enabling the Agent mutation path.

## 3. Application, limits, restrictions, and lost-card lifecycle

| Area                 | Current behavior                                                             | Required to complete M21                                                                              |
| -------------------- | ---------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| Card application     | Existing bank intake and submitted-record reads; Agent can list/read records | Safe PREPARE/confirmation path, bank-side cancellation of abandoned intent, honest status progression |
| Self-service limits  | No per-transaction or daily card limit fields                                | Persistent limits, policy bounds, immutable change intent, bank-side enforcement                      |
| Credit limit         | Initial credit-card application exists; no increase request                  | Separate credit-limit application and review state; no model approval                                 |
| Transaction controls | Four persisted switches; Agent reads them                                    | Confirmed Agent change path and an actual card authorization path that consumes the controls          |
| Temporary lock       | Bank supports reversible `FREEZE`/`UNFREEZE`                                 | Agent PREPARE, confirmation, cancellation/revision and follow-up continuation                         |
| Formal lost card     | Absent; a freeze is not a lost-card report                                   | Permanent `REPORTED_LOST` transition; normal unlock must reject it                                    |

The proposed additive OpenAPI changes and new Flyway migrations are described in the capability audit. Historical migrations and frozen contracts have not been changed at this checkpoint.

## 4. C01–C20 acceptance

`READ PASS` means the behavior was observed through the real model or browser in this checkpoint. `PENDING` means M21 has no complete acceptance evidence; it is not a failure claim about an unrelated existing API.

| Case                                  | Result    | Evidence / remaining work                                               |
| ------------------------------------- | --------- | ----------------------------------------------------------------------- |
| C01 list owned cards                  | PENDING   | Existing `list_cards`; M21 case-level assertion not rerun               |
| C02 suffix resolution                 | READ PASS | C11 uses `list_cards` and resolves suffix 1937                          |
| C03 card status                       | READ PASS | C11 returns `ACTIVE` from bank state                                    |
| C04 card products                     | READ PASS | DeepSeek and browser product-list queries                               |
| C05 compare two products              | READ PASS | DeepSeek trace and browser comparison                                   |
| C06 prepare card application          | PENDING   | Intent cancellation and Agent PREPARE required                          |
| C07 application status                | READ PASS | Bank returned an empty owner-scoped list; Agent did not invent approval |
| C08 self-service limit                | PENDING   | No bank limit state or action                                           |
| C09 policy-max rejection              | PENDING   | Depends on limit policy                                                 |
| C10 credit-limit increase             | PENDING   | Separate application entity required                                    |
| C11 card controls                     | READ PASS | Real bank-backed read for suffix 1937                                   |
| C12 temporary lock                    | PENDING   | Bank operation exists; Agent confirmation path not accepted             |
| C13 unlock                            | PENDING   | Same                                                                    |
| C14 duplicate lock                    | PENDING   | M21 end-to-end case not run                                             |
| C15 formal lost report                | PENDING   | Domain state absent                                                     |
| C16 reject unlock after lost          | PENDING   | Depends on formal lost state                                            |
| C17 revise/cancel prepared action     | PENDING   | Bank-side cancellation absent                                           |
| C18 duplicate/concurrent confirmation | PENDING   | Mutation acceptance not run                                             |
| C19 isolation and injection           | PARTIAL   | Read tools validate observed IDs; full adversarial case not run         |
| C20 lock then anomaly analysis        | PENDING   | Agent post-confirmation continuation not implemented/tested             |

No M21 mutation case has been counted as passed. Final database state, authorization and unexpected-side-effect assertions remain required for C06/C08–C10/C12–C20.

## 5. Real DeepSeek and browser evidence

Four read-only real-model runs (C04, C05, C07, C11) completed with `SUCCEEDED`, and their structured decisions/tool observations are saved in [M21 DeepSeek traces](../../artifacts/m21-read-deepseek-traces.jsonl). The initial C05 answer incorrectly repeated Public Catalog copy that said applications were unavailable; the original trace is retained in [initial traces](../../artifacts/m21-read-deepseek-traces-initial.jsonl). After the Agent separated information-only catalog pages from the existing Customer application intake, [the C05 retest](../../artifacts/m21-read-c05-retest.jsonl) correctly stated that submission is available but approval is not guaranteed.

One authenticated browser conversation at `/app/agent` verified four utterances: listing card products and identifying an everyday debit card; comparing Everyday Debit Card with Travel Credit Card; reading suffix 1937 status/controls; and asking about a recent card application. The browser showed bank-backed values and an empty application list without inventing a review outcome. This is **4/10** required browser utterances and **4/8** required real-model cases; mutation, ambiguity, injection, and post-confirmation continuation remain unverified. The UI still shows the raw new tool names in its processing steps.

## 6. Tests, contract, and database invariants

- Agent: `python -m unittest discover -s services/agent-runtime/tests -q` — **208 passed**.
- Web/contract-hash tests: `pnpm test` — **500 Web tests and 3 hash tests passed**.
- `pnpm lint` — **passed**.
- Customer/Public contract: `pnpm contract:check` — **passed**; Customer revision 1.24.0 has 71 operations, SHA-256 `432ecb211707ede9ef36c3836a9e2cf24b7d8d0dcf578fb710007cfe8648f764`; Public revision 1.2.0 has 9 operations, SHA-256 `460387a9a26548941a692bcd7e7036e21d136b4d6a9cb570faa0a4fc1ac106ef`.
- `pnpm typecheck` — **passed**. Spring/Testcontainers, Web build and M18–M20 regression suites must be rerun after the bank-side changes; they have not been counted as M21 mutation acceptance here.
- Read-only Agent calls did not create card/action/application intents or modify card balances. The proposed mutation design must prove owner-scoped row locks, stale-version rejection, cancellation versus execution races, expiry, confirmation binding, step-up, and idempotency in PostgreSQL.

## 7. Known limitations and remaining competition work

The bank has no formal lost-card lifecycle, self-service spending limits, credit-limit increase request, or card transaction authorization path. Existing application submission does not imply review approval or card issuance. M21 cannot truthfully satisfy the four official card-management areas until those capabilities and the C01–C20 acceptance suite are completed. Other competition scenarios are out of scope here. No M22 work has started.

The next step is the single grouped approval of the compatible Customer OpenAPI/Flyway proposal, followed by bank implementation, Agent PREPARE tools, confirmation UI, all required model/browser cases, and full regression. This checkpoint stops before those contract/schema changes.

# Engineering, UX and responsive audit — M11

## Route / link integrity

`pnpm audit:update` collects all 43 Next page routes, excluding route groups and the icon metadata asset. `docs/audit/routes.md` records surface, authentication, purpose, entry points, API dependencies and status. `/app` redirects to Overview. Agent/Settings remain reachable informational shells; no future capability uses a broken CTA.

The audit checks all Public catalog/article/navigation/offer/search references against actual content and pages, then visits the public targets in a real browser. Core Public/Customer pages have their internal links checked against the collected route templates. Existing transaction/account/transfer/card/recurring/investment journeys continue to follow real detail/review/receipt links. Retired banking paths are explicitly tested as absent. API manifest generation rejects any implemented path outside its proper Public/Customer namespace. Admin/Internal remain unimplemented.

## UX states

| Area                                     | Evidence and state handling                                                                                                             |
| ---------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Overview                                 | Existing RTL loading/success/optional-section empty/error/retry tests; totals reconcile with authoritative store                        |
| Accounts / Transactions                  | List/detail loading, empty filters, API errors, retry and unknown ID tests; cursor reset after mutations                                |
| Transfer / Card / Recurring / Investment | Prepare, exact review, stale/expired/failed input recovery, pending execution and receipt; no arbitrary replay of core input parameters |
| Public catalog / support / search        | API-driven loading, empty results, error/retry, detail 404; no session dependency                                                       |
| Fees                                     | Now uses one catalog projection; explicit empty state and provenance added                                                              |
| Static shells                            | Agent/Settings informational state is intentional; not a failed empty data screen                                                       |

Review/Confirm distinguish preparation from execution. Retry is for recoverable reads or the preserved idempotent execution request. Expired/stale intents require preparing a new review. Back/Cancel do not execute financial actions. Public search now correctly displays singular “1 result”. No new workflow was introduced.

## Accessibility

Automated axe WCAG 2 A/AA and 2.1 AA tags cover 17 Public/Login pages and 13 Customer pages, the public search dialog at five widths, plus real Transfer review and Card step-up screens in existing journeys. Existing tests exercise Mega Menu Escape/focus restoration, native accordion behavior and dialog focus restoration. Customer navigation has aria-current, forms have labels, icon buttons have names and charts have textual expandable amounts.

Actual findings fixed: muted text against the secondary background had 4.47:1 contrast, below the 4.5:1 threshold; the shared token is now darker. Both chart wrappers had aria-label without an eligible role; they now have role=group. Visible focus styling also covers input/select/textarea/summary. All scanned violations must be zero; no rules or failing nodes are excluded. This is not a WCAG certification.

## Responsive evidence

320, 390, 768, 1024 and 1440px are covered. Existing transfer, card, recurring/spending, wealth, transaction and security journeys now include tablet widths. Public audit exercises comparison, product details, fee layout, support controls, modal search and Customer transaction filters. Tests check root overflow and perform actual review/confirmation/verification actions, which also detect clipped or obstructed controls. Screenshots support visual checks of density and layout.

## Performance and dead code

Fixed the only obvious request fan-out found: Fees used a list plus all 21 detail requests. Catalog now provides authoritative fee summaries in one request. Comparison still fetches only the selected (maximum three) details. Feature hooks use stable keys, all Public keys are separately prefixed, and mutation invalidations preserve cursor/read-model semantics.

`node scripts/module-audit.mjs` traces local imports from application routes. Only `mocks/server.ts` and `test/setup.ts` are unreachable from the application; both are required test infrastructure and remain. PlaceholderPage is still used by Agent/Settings. SecurityEvent is store/test-used, not dead. No production module was deleted without evidence. Mock fixtures are dynamically imported through Providers when DEMO mocking is enabled; no feature imports fixtures. No runtime dependency was added.

## Reproducible checks

- `pnpm contract:check`: [Redocly lint](https://redocly.com/docs/cli/commands/lint), local reference/namespace/session metadata checks, semantic freeze hashes and route inventory drift checks.
- `pnpm check`: lint, typecheck, contract:check and tests; production build and browser suites remain explicit separate commands.
- `pnpm test`: existing Vitest/RTL regressions, four new cross-domain/Public consistency checks, three Node hash tests.
- `pnpm exec playwright test`: existing journeys plus [axe-based accessibility](https://playwright.dev/docs/accessibility-testing), link crawl, retired routes and five-width audits.

Freeze hashes sort object keys and enum/required arrays, exclude editorial description/summary/example text, and include actual paths, security requirements, requests, schemas, responses and revision. YAML formatting cannot invalidate them. Semantic edits require deliberate revision review and `pnpm audit:update`; never use that command merely to silence an unexplained drift failure.

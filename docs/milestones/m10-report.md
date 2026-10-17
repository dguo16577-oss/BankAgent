# M10 — Public Service Catalog & Knowledge Foundation

## Changed files

The repository has no committed baseline. This list describes files edited for M10, rather than treating all untracked files as this milestone's diff.

- Contract: `contracts/openapi/public.yaml`, `apps/web/src/generated/public-api.d.ts`.
- Fixtures: `apps/web/src/mocks/public/{metadata,catalog,support,rates,offers,search}.ts`; updated `fixtures.ts` and `handlers.ts`.
- API: `apps/web/src/lib/api/public.ts`, `apps/web/src/features/public/use-public.ts`.
- UI: `catalog-pages.tsx`, `public-search.tsx`, `public-category.tsx`, `public-homepage.tsx`, `public-layout.tsx` in the Public feature.
- Routes: `(public)/rates`, `fees`, `payments-fx`, `cards/compare`, `products/[slug]`, `support/[slug]`.
- Tests: `catalog.test.tsx`, `public-catalog.spec.ts`; updated M9 links in `public.test.tsx`.
- Documentation: root README, API README/public/catalog/search/support guides, architecture overview, ADR 0008 and this report.
- Screenshots: `docs/screenshots/m10-*.png`. No dependency additions.

## Contract and content

Public API 1.1.0 has nine GET operations: home, navigation, catalog list/detail, support list/detail, rates, offers and search. Generated types cover catalog Summary/Detail, Feature, Fee, Eligibility, CTA, Support Sections, Rates, Offers and Search Results. All content has DEMO provenance and an update timestamp; rates also have as-of and DEMO_RATE.

There are 21 catalog items: BANKING 4, PAYMENTS_FX 2, CARDS 4, BORROWING 3, INVESTMENTS 4 and INSURANCE 4. SUPPORT taxonomy is also available. Fifteen structured articles cover all six support categories. Four articles are reused as insights; two offers include dates and terms.

## Pages

Product details use one template with features, eligibility, fees, disclaimers, related services and semantic CTAs. Category filtering is performed by the API. Card comparison permits three selected catalog products and shows annual fees, type, benefits, FX/travel features and eligibility. Rates and fees use the authoritative fixtures/catalog details.

Header search and Ask Aster use deterministic keyword search with explicit catalog/article/offer result types. Ask states that AI conversation will be added later. Support includes category/search controls, article sections, callouts and related articles. No application or purchase workflow exists.

## Public / Customer boundary

Anonymous, expired-session and logged-out access is tested across all Public APIs. Customer state is unchanged by Public reads, Customer APIs remain protected and `/app/accounts` still requires login. Customer contract SHA-256 before and after M10: `F56F39D1F978C62DF56EF7BA572AE1E4004F53EEF15082A2A9560B806AEF3F80`. Customer pages, financial mutations and security rules were not edited.

## Validation

All five validation commands passed. Vitest/RTL: 355 tests across 22 files (32 new M10 tests; 51 Public tests in total). Playwright: 60 tests, including four new M10 journeys and all 56 existing regressions. Lint, strict type checking, generated-contract freshness and the production build passed. Customer contract hash is unchanged. No unresolved M10 validation failures remain.

Playwright uses installed Edge with the Chromium engine and a production preview:

```powershell
pnpm lint
pnpm typecheck
pnpm test
pnpm build
$env:PLAYWRIGHT_CHANNEL='msedge'
$env:PLAYWRIGHT_BASE_URL='http://localhost:3009'
$env:PLAYWRIGHT_WEB_SERVER_COMMAND='pnpm --filter web exec next start --port 3009'
pnpm exec playwright test
```

## Screenshots

Banking, savings detail, comparison, search, support detail, rates, support and Ask are captured at 320, 390, 768 and 1440 pixels, with horizontal overflow assertions. All four widths passed; 32 M10 screenshots were saved. Representative desktop comparison, mobile product detail and mobile search images were visually inspected.

- [Desktop card comparison](../screenshots/m10-compare-1440.png)
- [Mobile product detail](../screenshots/m10-savings-390.png)
- [Mobile search](../screenshots/m10-search-320.png)

## Remaining scope

Content is deterministic demo reference data. Production editorial review, publishing, jurisdiction-specific disclosures, live data, real eligibility and application processing remain future work. No backend, database, Agent/LLM, tools, semantic search, Admin/Internal API or new Customer mutation was implemented.

Stop at M10. Start locally with `pnpm dev` and open `http://localhost:3000/`.

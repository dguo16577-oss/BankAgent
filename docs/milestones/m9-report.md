# M9 — Public Banking Foundation & Namespace Migration

## Outcome

Public Website and Customer Banking are now separate product surfaces. This milestone changes namespaces and navigation while preserving all existing financial and authorization rules. No new financial mutation, Agent, backend, database, Admin or Internal capability was introduced.

## Directory and route structure

```text
apps/web/src/
  app/
    (public)/
      layout.tsx
      page.tsx                    /
      banking/page.tsx            /banking
      cards/page.tsx              /cards
      borrowing/page.tsx          /borrowing
      investments/page.tsx        /investments
      insurance/page.tsx          /insurance
      insights/page.tsx           /insights
      offers/page.tsx             /offers
      support/page.tsx            /support
      ask/page.tsx                /ask
    login/page.tsx                /login
    app/
      layout.tsx                  unified authenticated boundary
      page.tsx                    redirect to /app/overview
      overview/
      accounts/[accountId]/
      transactions/[transactionId]/
      payments/transfers/new/
      payments/transfers/review/[intentId]/
      payments/transfers/[transferId]/
      cards/[cardId]/actions/review/[intentId]/
      cards/[cardId]/actions/[actionId]/
      spending/recurring/[recurringPaymentId]/actions/review/[intentId]/
      spending/recurring/[recurringPaymentId]/actions/[actionId]/
      wealth/products/[productId]/invest/
      wealth/orders/review/[intentId]/
      wealth/orders/[orderId]/
      settings/
      agent/
      security/step-up/[challengeId]/
  features/public/
    public-layout.tsx
    public-homepage.tsx
    public-category.tsx
    use-public.ts
    public.test.tsx
  lib/api/public.ts
  mocks/public/
    fixtures.ts
    handlers.ts
  generated/
    customer-api.d.ts
    public-api.d.ts
contracts/openapi/
  customer.yaml
  public.yaml
  README.md
```

Existing listing and detail pages in the customer subdirectories remain available; all nested routes carry the `/app` prefix. No legacy page aliases were added. The customer header now links back to `/`.

## API and generated type migration

All **39 Customer paths / 39 operations** now use `/customer/*`. Their **104 schemas** are unchanged. A structural comparison against the pre-migration contract confirmed every operation changed only in namespace. Customer schema SHA-256 before and after:

`8f4d9a477b6caf63ab1ca4ca1562aa5269d0a52570213f7e3f775387c4e60b6b`

Customer DTO imports now use `customer-api.d.ts`. New `public-api.d.ts` is generated from `public.yaml` (two operations, eight schemas). `pnpm api:generate`, `pnpm api:check` and `pnpm typecheck` cover both contracts. No duplicate legacy generated DTO set remains.

Implemented public endpoints:

- `GET /public/home`: hero, six service categories, six featured services, demo offers, insights/rates entry points and security notice.
- `GET /public/navigation`: grouped navigation, links/labels/routes and category landing content.

Public content lives outside MockBankingStore, in read-only reference fixtures. Components use feature hooks and the public API client; they do not import fixtures.

## Public Website

The full homepage uses Aster's navy/teal design system, without external imagery or copied bank assets. It includes hero actions, service discovery, featured services, offers, insights/rates, scam guidance and a footer with legal/demo notices.

Desktop Mega Navigation groups Banking, Cards & Borrowing, Investments, Insurance, Insights, Offers and Support. It supports expanded-state controls, keyboard navigation, Escape/focus restoration and outside-click dismissal. Narrow screens use a labelled toggle and native disclosure accordions.

Eight category pages contain descriptions, sample service cards and navigation. `/cards` is public product discovery; `/app/cards` is customer cards. `/investments` is public information; `/app/wealth` is the actual demo portfolio.

Guest `/ask` provides the required introduction, five topic chips and sign-in entry. No chat transport, LLM or tool calling is connected. Customer `/app/agent` remains the separate protected Coming Soon page.

## Auth and business regression

AuthBoundary belongs only to the `/app` layout. The public layout has no customer sidebar and does not request Session. Public APIs work without authentication and after session expiry/logout. The Customer guard retains its login exception and protects all other Customer operations.

Login and already-authenticated login visits go to `/app/overview`; logout returns to `/login`. Intent/hash binding, single-use ActionAuthorization, safe idempotency replay, stale-state validation, atomic commits and expiry semantics remain unchanged.

The existing 304 unit/component tests and 42 E2E tests were retained and migrated. New tests cover public content and navigation, category pages, Guest Ask Aster, anonymous/customer boundaries, distinct public/customer product surfaces, keyboard navigation and responsive layouts.

## Changes beyond the directory move

- Customer API clients, MSW handlers, generated imports and every current API document use the new namespace.
- Existing feature links, route helpers, redirects, sidebar and E2E assertions use `/app/*`.
- Public components, hooks, API client, fixtures, handlers and route files are new.
- Root scripts generate/check both contracts.
- `next.config.ts` bounds build workers to two after the default 15 workers exhausted memory during validation; Playwright uses one worker and supports optional production-preview URL/command settings.
- Added `docs/api/public.md`, contract README and ADR 0007; updated root README, API docs and architecture overview.
- Added `apps/web/e2e/public.spec.ts` (14 tests) and the Public RTL/API suite (19 tests).

## Validation

All required validation commands passed:

| Command                     | Result                                                                      |
| --------------------------- | --------------------------------------------------------------------------- |
| `pnpm lint`                 | ESLint and formatting passed                                                |
| `pnpm typecheck`            | Both generated contracts, Next route types and strict TypeScript passed     |
| `pnpm test`                 | 323 tests passed across 21 files (all 304 prior tests + 19 new)             |
| `pnpm build`                | Production build passed, including all public and migrated app routes       |
| `pnpm exec playwright test` | 56 passed (all 42 prior tests + 14 new), installed Edge, production preview |

The browser suite checks 320/390/768/1440px public layouts, keyboard menu behavior, anonymous access, Guest discovery → login → Customer Overview, logout/protected redirects, distinct public/customer Cards and Investments/Wealth, and every existing M4–M8 critical flow. Twenty M9 screenshots were captured from production preview and representative desktop/narrow images were visually inspected.

The initial development-server browser run hit Windows memory allocation failures; the successful complete run uses one browser worker and optimized production output. No tests or business assertions were removed. Reproduce the same browser run after `pnpm build`:

```powershell
$env:PLAYWRIGHT_CHANNEL = "msedge"
$env:PLAYWRIGHT_BASE_URL = "http://localhost:3009"
$env:PLAYWRIGHT_WEB_SERVER_COMMAND = "pnpm --filter web exec next start --port 3009"
pnpm exec playwright test
```

Playwright owns the preview process and stops it after the suite. Without these URL/command overrides, its default remains the local dev server on port 3000.

## Screenshots

Actual application captures at 320, 390, 768 and 1440 pixels are stored in `docs/screenshots/`:

- `m9-home-{width}.png`
- `m9-navigation-{width}.png`
- `m9-banking-{width}.png`
- `m9-ask-{width}.png`
- `m9-public-cards-{width}.png`

Development tooling overlays are hidden only for capture. Browser tests also check the customer Overview, Cards and Wealth surfaces at these four widths.

## Legacy search

A repository source/current-document search for the retired API prefix and retired contract/generated filenames is required to return zero matches. Generated/build/dependency caches and ignored execution logs are not current source. Final result: **0 matches**, with the expected search-tool exit code 1 for no results. Both generated directories and contracts contain only their new customer/public files.

## Start and remaining scope

Run `pnpm dev` and open `http://localhost:3000/`. Sign in via `/login` using the controlled local security fixture when testing Customer Banking.

Future work is subject to M10 instructions: richer public content and separately authorized product capabilities may be considered later. Admin/Internal remain reserved; real rates/FX, applications, KYC, real backends/databases, Agents and LLMs are not implemented. No M10 work has started. Stop at M9.

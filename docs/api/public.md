# Public banking API — M9 foundation, M10 content

## Trust boundaries

- `/public/*`: unauthenticated reference content. No Session or customer financial state is required.
- `/customer/*`: authenticated customer banking shared by Customer Web and future Customer Mobile. POST `/customer/auth/login` remains the unauthenticated entry; all other implemented customer endpoints retain M8 security semantics.
- `/admin/*`: reserved for staff operations, customer servicing, risk and audit. No UI, endpoints or contract file yet.
- `/internal/*`: reserved for trusted service-to-service calls, risk engines and specifically authorized internal orchestration. No endpoints or contract file yet. An Agent's use of an LLM never confers arbitrary internal permission.

No separate mobile or web API namespace is created. Client type does not decide authorization.

## Endpoints

`GET /public/home` returns hero copy/actions, serviceCategories, featuredServices, offers, insights, securityNotice and environment `DEMO`. It contains no customer-specific balances, identifiers, cards or positions. Rates and promotions are illustrative; there are no live quotes or product applications.

`GET /public/navigation` returns navigation groups (labels, routes, descriptions, sections and links) and category landing content (title, description and catalog-derived service summaries). The same navigation data supports the desktop Mega Menu, accessible narrow-screen accordions and footer.

Both endpoints return 200 without authentication, including when a customer Session is absent, expired or revoked. A content failure uses PublicApiError; UI supports retry without prompting for login. There are no public write endpoints.

Contract: `contracts/openapi/public.yaml`. Generated types: `apps/web/src/generated/public-api.d.ts`.

## Data and UI

Public component → feature hook → public API client → `/public/*` → MSW Public handlers → read-only public fixtures.

Public fixtures live in `apps/web/src/mocks/public/`; `fixtures.ts` projects home and navigation from catalog, support, offers and rates, outside MockBankingStore. They are reference/content data; customer financial state remains private mutable simulator state. React does not import fixtures.

The Public Layout has its own header, navigation and footer, without the Customer sidebar or a Session query. Customer 401 navigation handling applies only under `/app/*`.

## Public routes

`/`, `/banking`, `/cards`, `/borrowing`, `/investments`, `/insurance`, `/insights`, `/offers`, `/support`, `/ask` require no authentication. The home page provides the full discovery layout; category pages provide descriptions, catalog-derived service summaries and onward navigation. No loan, mortgage, insurance or card application workflow is implemented.

Public `/cards` means card product information; `/app/cards` means the customer's actual cards. Public `/investments` means product discovery; `/app/wealth` means the customer's portfolio.

`/ask` is a Guest Ask Aster shell with deterministic search topic buttons and an invitation to sign in for personal banking. It has no LLM, chat transport or tool calling. `/app/agent` remains the distinct Customer Agent placeholder.

## Accessibility and layouts

Desktop navigation uses buttons with expanded state and grouped ordinary links. Escape closes the panel and restores trigger focus. Narrow navigation uses a labelled menu toggle and native keyboard-accessible disclosure accordions. Selecting a link closes navigation. Layout tests cover 320, 390, 768 and 1440 pixels.

## M10 extensions

See [Catalog, rates and offers](public-catalog.md), [Public search](public-search.md) and [Support knowledge](public-support.md). Additional routes include `/products/[slug]`, `/cards/compare`, `/rates`, `/fees`, `/payments-fx` and `/support/[slug]`. Home now includes the shared rates read model; all content has demo provenance.

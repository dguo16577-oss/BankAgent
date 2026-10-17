# ADR 0007 — API surfaces and public banking site

Status: Accepted (M9)

## Decision

Public Website and Customer Banking App are separate product surfaces. Public routes do not require authentication. Authenticated banking lives under `/app/*`, with one AuthBoundary. `/login` remains a simulated login form; successful or existing login navigates to `/app/overview`. The customer header links back to the public home page.

Customer Web and future Customer Mobile share `/customer/*`. We do not split API authorization by web versus mobile client. Existing customer request/response schemas, intent/hash binding, idempotency, atomic mutation, stale-state detection and authorization rules remain unchanged during namespace migration.

`/public/*` serves unauthenticated reference information. Public content fixtures are independent of the customer financial store. Public product cards are discovery content, not customer assets or new transactional products.

`/admin/*` is reserved for staff operations, customer servicing, risk and audit. `/internal/*` is reserved for trusted service-to-service capabilities, risk engines and explicitly authorized orchestration. Neither surface has endpoints, UI or contract files in M9. A Customer Agent does not obtain arbitrary internal access by being an LLM; it must use explicitly permitted capabilities and retain trusted user authorization for sensitive actions. Agents never access the bank database directly.

API URLs intentionally do not contain `/api` or `/v1`. `customer.yaml` and `public.yaml` are the separate machine contracts, with generated customer and public frontend types. Contract metadata versions are independent of URL structure.

## Consequences

Public `/cards` and `/investments` are distinct from `/app/cards` and `/app/wealth`. Unauthenticated visitors can discover services and use the Guest Ask Aster shell without creating a Session. Customer Agent remains a separate protected placeholder.

Existing customer deep links and API paths must be updated together; no legacy API aliases or duplicate DTO sets are retained. Automated regression tests continue to cover all prior business flows, while new tests cover anonymous access, navigation, separation of public/customer products and responsive behavior.

Real backends, production authentication, Admin and Internal implementations, live rates, application engines and both Agent runtimes remain outside this milestone.

# Public Banking content backend — M21

Public 1.2.0 remains frozen. Nine anonymous GET operations are implemented by the Public Content module. Customer 1.9.0 remains a separate authenticated surface; Next.js still uses MSW.

## Endpoints

| Method | Path                            | operationId          |
| ------ | ------------------------------- | -------------------- |
| GET    | /public/home                    | getPublicHome        |
| GET    | /public/navigation              | getPublicNavigation  |
| GET    | /public/catalog                 | listPublicCatalog    |
| GET    | /public/catalog/{slug}          | getPublicCatalogItem |
| GET    | /public/support/articles        | listSupportArticles  |
| GET    | /public/support/articles/{slug} | getSupportArticle    |
| GET    | /public/rates                   | getPublicRates       |
| GET    | /public/offers                  | listPublicOffers     |
| GET    | /public/search                  | searchPublicContent  |

There is no separate Fees or Insights endpoint in the frozen contract. Fees are catalog item summaries/details; four educational insights are support articles tagged `insight`, exposed through Home and Navigation.

## Architecture and ownership

`publiccontent.domain.Content` holds typed informational records. `PublicContentService` composes Home/Navigation and validates search length. `PublicContentRepository` is its persistence port. `PostgreSqlPublicContent` executes parameterized JDBC queries inside a read-only REPEATABLE READ transaction. The web controller alone maps these views to generated Public DTOs. Domain, application and persistence never import generated DTOs.

The module never calls CurrentCustomerProvider, customer repositories, financial application services, SecurityService or customer investment_products. Architecture tests prohibit those dependencies in both directions. The Public SQL tables are separately owned; no Customer FK or read projection is used.

## Persistent content and seed

Flyway V6 adds ten structured tables; see [database schema](database-schema.md). Catalog core fields and tags, article metadata, rate numeric values, offer dates, routes, ordering and provenance are typed columns. Flexible editorial features/eligibility/actions and article sections use JSONB. Fees have a child table with catalog FK. Navigation stores semantic groups/sections/links, not CSS or component names.

The independent backend fixture `src/main/resources/demo/public-content.sql` contains 21 catalog items, 15 support articles, 3 rates and 2 offers, plus navigation/presentation metadata. It was imported once from the M10 authored fixtures by the development-only script `scripts/m21-export-public.cjs`. Runtime does not execute that script, TypeScript or frontend build output.

Only local/test profiles wire `DemoPublicContentSeed`. Every insert uses ON CONFLICT DO NOTHING inside one transaction. Restart does not overwrite persisted edits or truncate customer/public state. Default profile never imports demo content. The default runtime can serve previously provisioned content; without provisioned singleton metadata, content requests return frozen 500 PUBLIC_CONTENT_UNAVAILABLE.

Home is composed on each request from current catalog, support, offers and rates. Only authored hero/security notice/service-category metadata and featured IDs are persisted, not a duplicate Home response. Related article IDs are explicit authored references. Catalog detail uses the unique slug. Summary endpoints omit detail fields.

## Search/filter semantics

The backend preserves M10 semantics:

- Catalog: optional uppercase category/type equality, AND-combined; search in title, shortDescription and tags.
- Support: optional category equality; search in title, summary, tags and section paragraphs. Headings/callouts are not silently added to its search scope.
- Global Search: only catalog title/shortDescription, support title/summary and offer title/summary.
- Split whitespace, lowercase and require every token to be a literal substring. `%`, `_` and SQL-looking input are literals. Parameterized PostgreSQL `strpos(lower(...), ?)` performs matching.
- Global empty/missing/whitespace query returns no results; list empty search returns the unfiltered collection. A single character is accepted. Maximum 200 UTF-16 code units matches the existing Web validation; longer input returns 400 INVALID_PUBLIC_QUERY.
- Global results preserve catalog → support → offer order, then authored display_order with ID COLLATE "C" as tie-breaker. No relevance score, fuzzy matching, personalization or language model.
- All filtering/order happens in SQL. Java only adds matchedTerms to selected results and maps the response.
- The frozen API has no limit/pagination parameter or result cap. All matching public records are returned; no invented default 10/20 limit. Unknown query parameters retain the existing ignored behavior.
- The response query preserves the submitted text; matchedTerms contains normalized tokens.

There is no ACTIVE/INACTIVE enum in this frozen Public model. Offer dates remain informational markers, as in M10; they are returned without a new wall-clock expiry filter. This avoids changing frozen demo behavior as the calendar advances.

## Rates, fees and dates

Rates are PostgreSQL NUMERIC / Java BigDecimal, emitted as decimal strings including authored scale (7.1000, 0.80, 1.50). Rate-set asOf/source/disclaimer are persisted: DEMO_RATE and “not live quotes.” No FX provider is connected.

Frozen fees are textual informational values and conditions (for example CNY 0 per month), stored in structured columns and returned without inferring numeric fees from customer transfer history. Catalog lastUpdatedAt/environment and disclaimers provide their provenance; the contract has no separate fee effectiveAt field.

All persisted dates are TIMESTAMPTZ and Java OffsetDateTime. HTTP may normalize the offset to UTC while preserving the same instant and required ISO representation.

## Security and errors

A higher-priority SecurityFilterChain matches only /public/**. GET is anonymous, session policy STATELESS, with no customer SecurityContext repository or SessionSecurityFilter. Public GET requests do not create session/CSRF cookies, authenticate a customer or validate an expired customer's session. CSRF stays enabled; unsafe Public methods are not permitted. Customer authentication, CSRF and fail-closed fallback are unchanged.

The Spring Session filter is installed globally, but Public handlers and security chain never request a session. Tests compare all customer/security/session records before and after requests, including an expired cookie. The globally installed Spring Session/MVC infrastructure can refresh spring_session last_access_time/expiry_time when a cookie is present; these two access metadata fields are excluded from that equality check. It does not alter authentication lifecycle, principal, challenges, authorizations, events or financial state. Anonymous, valid, expired and invalid session cookies yield identical public content. Customer accounts still return 401 anonymously.

Local CORS allows exactly http://localhost:3000 with credentials. Default does not automatically allow localhost. Existing no-cache/security headers are retained; no CDN or ETag design is introduced.

Unknown catalog/support slug returns PUBLIC_CONTENT_NOT_FOUND (404); invalid enum/length returns INVALID_PUBLIC_QUERY (400); storage failure returns PUBLIC_CONTENT_UNAVAILABLE (500). Errors do not reveal SQL or exception detail. Existing correlation headers/log context are retained; no bodies are logged.

## Verification

Real PostgreSQL Testcontainers tests compare all 21 catalog details and 15 support details to the independently saved M10 reference, verify all filters/search, Home/Navigation derivation, fee/rate precision, isolation, errors, restarts, seed profiles, constraints and runtime operation closure.

Run `docs/backend/public-content-smoke.ps1` against local port 18080 after starting the existing PostgreSQL volume and Banking Core local profile. This script logs in only to verify the boundary; it does not mutate financial state.

See [M21 report](../milestones/m21-report.md) for actual command results. Frontend remains MSW.

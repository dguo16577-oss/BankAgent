# Performance baseline — M23

Environment: Windows, JDK 21, PostgreSQL 17 Testcontainers, Spring Boot 4.1.1, Next.js production build/start for real E2E (Mock E2E retains its development server). These are regression measurements, not throughput or production capacity promises.

## Actual database SELECTs

`OverviewPostgreSqlIT` enables PostgreSQL `pg_stat_statements`, logs real emitted SELECT counts and excludes the measurement itself and session/credential queries. It does not rely solely on Hibernate statistics, which miss JDBC statements.

| HTTP read              | Baseline | Expanded data | Query structure                                                       |
| ---------------------- | -------: | ------------: | --------------------------------------------------------------------- |
| Overview               |       16 |            16 | fixed domain reads, aggregate queries and bounded top-N sections      |
| Transactions, limit 10 |        2 |             2 | snapshot revision and cursor page                                     |
| Spending               |        7 |             7 | account scope, period sums/counts, category/merchant/month aggregates |
| Wealth portfolio       |        1 |             1 | customer-scoped portfolio projection                                  |
| Recurring list         |        2 |             2 | all owner transaction links, then ordered owner payments              |

The original Recurring adapter issued one link query per payment: seven queries for the six fixture payments. M23 batches those links into one customer-scoped query and passes them to row mapping. Detail reads retain a bounded single-payment link query. No global or cross-request mutable financial cache was added.

Expansion adds 25 accounts/cards/schedules for Overview. The other reads clone transaction records, recurring payments **with their history links**, products and portfolio positions five times while preserving foreign keys. Assertions require the expanded query count to equal the baseline. Overview's pre-existing 16-SELECT baseline is unchanged.

## Browser requests and build

Development Strict Mode was observed starting then cancelling duplicate requests; the real runner now builds/starts production Next to measure the release behavior. The real hardening suite records fresh-navigation Customer requests for Overview, Transactions, Spending and Wealth, rejects duplicate paths and sets a maximum of six per page. Overview must issue exactly Session + Overview, without frontend aggregation of Accounts/Cards/Spending/Portfolio. The main journey verifies opaque cursor paging and stable filter resets without loading all history for analytics.

Network evidence is in `test-results/backend-evidence/network.json`; the request-count attachment is in the Playwright output. Public requests omit cookies. All financial writes use the shared transport and no automatic retry.

No dependency upgrades, external fonts, new chart libraries or UI framework changes were introduced. The production build is a separate validation with an explicit backend API origin; the browser still fetches authoritative data after hydration. Development compilation latency, Docker cold starts and machine memory pressure make elapsed test times unsuitable as an SLA.

## Budgets and limits

- API response deadline: 20 seconds including body reads, with cancellation.
- Hikari connection acquisition: existing 5 seconds.
- Browser GET retry is explicit; mutation retry is explicit and preserves the original key.
- No load-test, Lighthouse score, CDN tuning or production concurrency target is claimed.
- Revisit query plans and indexes with realistic volume before deployment; constant query count alone does not guarantee cheap queries.

## Recorded RC build and browser totals

Production fresh-navigation request counts were 2 / 3 / 4 / 4 for Overview / Transactions / Spending / Wealth respectively. The final financial journey recorded 130 completed API responses: 117 HTTP 200, 7 HTTP 201 and 6 expected HTTP 401 for anonymous bootstrap/guard/logout checks; no unexpected 4xx/5xx and no Service Worker responses.

The inspected build has 42 JavaScript chunks totaling 2,209,155 uncompressed bytes; the largest is 425,421 bytes. This is the sum of all emitted chunks, **not** initial page download size. Recharts and explicit-mock chunks remain split assets. Presence of MSW code is permitted by the freeze: backend initialization does not load/start it, and the browser verifies zero registered workers. No new dependencies or external font requests were introduced. Existing generator warnings about Money allOf/schema naming remain unchanged; generated type checks and contract hashes pass.

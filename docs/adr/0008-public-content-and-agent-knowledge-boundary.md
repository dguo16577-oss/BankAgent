# ADR 0008: Public content and the Guest knowledge boundary

- Status: Accepted
- Date: 2026-09-27
- Milestone: M10

## Decision

Public banking reference content is separate from customer financial state. Catalog, support, rates and offers are deterministic fixtures outside `MockBankingStore`, accessed through anonymous read-only Public APIs. `public.yaml` remains their sole machine contract; generated TypeScript types are reused in the API layer, fixtures and UI.

Public content is structured and machine-readable. Product fees, eligibility, feature descriptions, support sections and provenance are fields rather than independent page text or HTML documents. Home, search and category projections derive from the same authoritative data. All content is DEMO with `lastUpdatedAt`; rate responses also contain `asOf` and `DEMO_RATE`.

Public catalog/support APIs will be the knowledge source for a future Guest Agent. Initial read-only tool candidates are:

| Future tool               | Authoritative API                 |
| ------------------------- | --------------------------------- |
| `search_public_knowledge` | `/public/search`                  |
| `get_public_catalog_item` | `/public/catalog/{slug}`          |
| `list_public_products`    | `/public/catalog`                 |
| `get_public_rates`        | `/public/rates`                   |
| `get_support_article`     | `/public/support/articles/{slug}` |

The unauthenticated Guest Agent must remain read-only. An LLM must not invent products, fees, rates or eligibility outside authoritative Public API responses. Future answers should cite the content route and provenance and explicitly preserve demo/rate limitations. Personal banking information or operations require the separate Customer authentication and authorisation boundary.

## Consequences

M10 provides API-backed product discovery, keyword search and education without customer-session dependencies. Public content publication would later need controlled editorial review, jurisdiction-specific disclosures and freshness management. Those production capabilities are not implemented here. Search is deterministic text matching, without semantic ranking.

No Agent tools, LLM, application processing, Admin or Internal APIs are implemented. Existing Customer financial and security semantics are unchanged.

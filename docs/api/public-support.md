# Public support knowledge — M10

- `GET /public/support/articles`: optional `category` and `search` filters.
- `GET /public/support/articles/{slug}`: structured article detail; missing slug returns 404 `PUBLIC_CONTENT_NOT_FOUND`.

`SupportCategory` includes ACCOUNTS, PAYMENTS, CARDS, SECURITY, DIGITAL_BANKING and INVESTMENTS. Summary fields: ID, slug, title, summary, category, tags, `lastUpdatedAt`, `environment: DEMO`. Detail adds heading, sections (heading, paragraphs, callouts) and related article slugs. HTML blobs are not stored or rendered.

Fifteen deterministic articles cover phishing, lost cards, pending payments, transfers, failed transfers, balance versus available funds, recurring payments, step-up verification, investment risk, budgeting, bond risk, FX, digital safety, statements and trusted support channels.

Filters are evaluated in the API. Category and search intersect; search uses case-insensitive AND tokens over title, summary, tags and section paragraphs. Empty filters return all articles in authored order. Unsupported categories and search over 200 characters return HTTP 400 `INVALID_PUBLIC_QUERY`.

`/support` provides category browsing and search. `/support/[slug]` renders callouts and related articles. `/insights` asks the same API for the `insight` tag, reusing four educational articles; there is no second CMS. Guides describe general concepts and demo boundaries, with no personal recommendations or live market predictions.

These APIs work with no session, after logout and after Customer session expiry. They never open a banking action or bypass Customer authorisation. Future read-only `get_support_article` can cite the article route and provenance; no Agent tool is implemented in M10.

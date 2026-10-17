# Public deterministic search — M10

`GET /public/search?q=...` searches product/service titles and short descriptions, support article titles and summaries, and offer titles and summaries. It does not access Customer state.

The algorithm trims the query, lowercases text and splits on whitespace. Every token must be a substring of the indexed text. Results preserve authored order, with catalog items followed by articles then offers. Empty/whitespace query returns an empty array; a query over 200 characters returns HTTP 400 `INVALID_PUBLIC_QUERY`. There is no fuzzy, semantic or personalised ranking.

`PublicSearch` contains `query`, `items`, `lastUpdatedAt` and `environment: DEMO`. Every result includes `id`, explicit type (`CATALOG_ITEM`, `SUPPORT_ARTICLE`, `OFFER`), title, summary, public route, matchedTerms and provenance. Offers link to their visible terms on `/offers#id`; product and article results open their unified detail routes.

The Public Header uses a keyboard-accessible modal dialog with focus containment, Escape dismissal and focus restoration. Submitting its search form calls the API. Loading, empty, error and retry are visible. Ask Aster's five suggested topic buttons use this same API with deterministic keyword queries. The page explicitly states “AI conversation will be added later.”

Future Guest tool `search_public_knowledge` can wrap this API. M10 implements no tools, embeddings, vector database, LLM or conversation engine.

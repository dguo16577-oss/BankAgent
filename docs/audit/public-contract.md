# Public contract and content audit — M11

Nine read-only operations, 28 schemas, three error codes; 21 catalog items, 15 articles and two offers remain unchanged in count. No Public schema imports Customer mutable financial objects. Schema Summary/Detail/read-model differences are deliberate. Catalog related IDs, article slugs, navigation destinations, offers, search routes and home projections have automated referential checks and a browser link crawl.

All top-level content/read models have DEMO and lastUpdatedAt. Nested feature/fee/navigation text inherits the enclosing content provenance. Rates additionally expose DEMO_RATE/asOf and the explicit non-live disclaimer. Timestamp patterns now require offsets. Catalog/support search maxLength 200 is now machine-described, matching handler validation. Impossible list 404/detail-without-query 400 responses were removed; shared 500 failure responses were added.

The Catalog summary now includes the same structured fee array as Detail. This fixes `/fees` making one list request plus 21 detail requests; it now makes one list request and renders that authoritative projection. No endpoint or business feature was added. The API client now preserves the three Public machine-readable error codes.

Public `/cards` describes catalog products; `/app/cards` describes owned simulated cards. Public `/investments` describes educational/product information; `/app/wealth` describes the demo portfolio. Public account/loan/insurance descriptions explicitly state simulated information and do not claim real availability. Ask uses deterministic search and states that AI conversation will be added later. Rates are not live quotes, and investment performance is not guaranteed. Recurring-stop wording distinguishes bank-side blocking from ending a merchant subscription contract.

The 15 articles remain structured sections/paragraphs/callouts, not HTML. Guest tools and LLM integration remain unimplemented.

# Public catalog, rates and offers — M10

`contracts/openapi/public.yaml` is the machine contract. Generated Web types live in `src/generated/public-api.d.ts`. Public fixtures are independent reference data in `src/mocks/public`, never part of `MockBankingStore`.

## Read APIs

| Method | Path                     | Purpose                                                          |
| ------ | ------------------------ | ---------------------------------------------------------------- |
| GET    | `/public/catalog`        | Product/service summaries; optional `category`, `type`, `search` |
| GET    | `/public/catalog/{slug}` | Complete public product/service guide                            |
| GET    | `/public/rates`          | Illustrative FX, savings and time-deposit rates                  |
| GET    | `/public/offers`         | Two simulated educational campaigns and terms                    |
| GET    | `/public/home`           | Home projection from catalog, articles, offers and rates         |
| GET    | `/public/navigation`     | Public categories and real discovery routes                      |

List filters are intersected by the API. Search is case-insensitive, whitespace-tokenised AND matching against title, short description and tags. Empty search returns the category/type selection; unsupported enums and search longer than 200 characters return HTTP 400 `INVALID_PUBLIC_QUERY`. Results use authored fixture order. Missing detail returns HTTP 404 `PUBLIC_CONTENT_NOT_FOUND`. No customer session is read.

## Schemas and content

`PublicCatalogCategory`: BANKING, CARDS, BORROWING, INVESTMENTS, INSURANCE, PAYMENTS_FX, SUPPORT. The 21 product/service guides comprise 4 banking accounts, 2 payment/FX services, 4 cards, 3 borrowing products, 4 investment guides and 4 insurance guides. SUPPORT is available taxonomy; articles use their own support categories.

`PublicCatalogItemSummary` contains identity, slug, category, type, title, short description, tags and provenance. `PublicCatalogItemDetail` additionally supplies description, highlights, structured `PublicFeature`, `PublicEligibilitySummary`, `PublicFeeSummary`, supported currencies when relevant, disclaimers, related item IDs and `PublicCallToAction` values. CTAs are LEARN_MORE, SIGN_IN, COMPARE or CONTACT; there is no application workflow.

All content carries `environment: DEMO` and offset `lastUpdatedAt`. Nested navigation/editorial text inherits its response's provenance. Rates additionally carry offset `asOf`, `source: DEMO_RATE` and the text “Illustrative demo rates, not live quotes.” Rate values are decimal strings with explicit units and conditions. Fee values are descriptive reference text, not executable payment amounts.

`/products/[slug]` uses one detail template. Five primary category pages consume API category filters; `/payments-fx` exposes the remaining service category. `/cards/compare` fetches selected catalog detail records, caps selection at three and compares annual fee, type, benefits, FX/travel and eligibility. `/fees` projects each catalog detail's structured fees. No product copy is maintained in React.

Home featured products, offers, insights and rates derive from these same sources. Public product IDs have no relationship to Customer account/card/product IDs. No live quote, purchase, borrowing approval, underwriting, reward or application is implemented.

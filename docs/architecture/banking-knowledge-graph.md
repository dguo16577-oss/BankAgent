# Source-backed banking knowledge graph

2026-10-20. This is a small public demo policy graph, not customer memory or
an authoritative eligibility/financial execution engine.

## Persisted model

The existing V34 Knowledge schema holds original documents, immutable versions
and cited chunks. Additive Knowledge migration **KG001**, tracked separately in
`knowledge.schema_migrations`, adds `graph_nodes` and `graph_edges`. It uses an
advisory transaction lock and SHA256 checksum. Existing bank Flyway migrations
and Customer API are unchanged. Source chunk deletion cascades to its edges.

Node kinds: DOCUMENT, PRODUCT, CATEGORY, TOPIC, CONTROL. Edge kinds: IN_CATEGORY,
DESCRIBES_PRODUCT, EXPLAINS, REQUIRES_REVIEW, WARNS_AGAINST, DISTINGUISHES.
Each edge stores an immutable chunk ID plus an exact source quote; the chunk
joins to document ID, version, source URI, heading/line location and validity.
Stable IDs and unique constraints make repeated indexing idempotent.

Document/category/product edges come from explicit source metadata. Six reviewed
business assertions are quoted from actual demo support articles: transfer term
review, avoiding duplicate payments, lost-card activity review, separating a
provider contract from recurring arrangements, action-bound verification, and
the limits of investment risk labels. No LLM extracts or invents policy edges.
These are explanatory descriptions, not a mechanism for granting authority.

## Query and retrieval integration

`POST /internal/knowledge/graph` accepts the existing bounded query/filter shape.
It filters PUBLIC and version/category/product scopes before a one-hop graph
query. It returns nodes, edges, exact quotes and references, with explicit
truncation, `UNTRUSTED_EXTERNAL_DATA`, and `financial_authority=false`.
At most 5000 candidates and 40 edges are allowed; overflow is not silently read
as completeness. Customer-private graph retrieval is disabled.

Hybrid retrieval adds matched graph-topic/product evidence to the RRF rankings.
The output remains the existing strict `search_bank_knowledge` evidence schema,
so MCP/Registry contracts and model-visible tool count stay unchanged. The model
still receives cited text; edges cannot instruct it to choose/execute a bank
tool. Quotes that look like commands remain data. No external URL is followed.

The old Agent `/knowledge/graph` public catalog visualization remains compatible;
it is distinct from this persisted, version-filtered policy graph. No new graph
editor or arbitrary graph-query language is exposed to users or the model.

## Boundaries

This implementation offers curated relations and bounded graph-assisted retrieval.
It does not implement general logical inference, automatic ontology learning,
personal financial graphs, graph-based financial authorization or Neo4j. Corpus
and rule changes require review, reimport and quote verification. Retrieval source
recall and exact quote validity are separate from end-to-end answer entailment.

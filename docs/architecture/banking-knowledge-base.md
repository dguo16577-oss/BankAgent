# Banking Knowledge Base (K1)

## Authority and sources

The knowledge schema stores explanatory evidence. Account balances, suitability decisions, payment outcomes, card state and financial execution remain solely in Spring Banking Core. Every imported public item is labelled **Aster Demo Policy**. It is simulated content, not a real institution's offer or binding regulation.

The initial allowlist is the authored demo content in `services/banking-core/src/main/resources/demo/public-content.sql`: 21 catalog entries and 15 support articles. The importer reads the corresponding `public_catalog`, `public_catalog_fees` and `public_support` rows after the demo seed has run. Their exact text, fees, source URI and publication timestamp are retained. Support articles `recurring-payments` and `budgeting-basics` map to SUBSCRIPTION and SPENDING respectively; all eight K1 categories have at least one source. The bank's personal transactions are never indexed.

The CLI also accepts a reviewed JSON manifest referencing repository-local Markdown, TXT, HTML or PDF files. Paths must stay within the manifest directory; source URIs are constrained to `repo://` and `aster-demo://`. No HTTP upload or arbitrary remote ingest endpoint exists. A reviewer must explicitly add a file to the manifest; the CLI refuses customer-scoped documents pending a verified customer identity design.

## PostgreSQL layout

Flyway V34 creates a separate `knowledge` schema:

| Table               | Purpose                                                                                       |
| ------------------- | --------------------------------------------------------------------------------------------- |
| `documents`         | Stable source identity, domain, language, product scope and access scope                      |
| `document_versions` | Immutable original text, SHA-256, version, effective dates and publication state              |
| `document_chunks`   | Heading, line location, bounded text, model version, embedding and generated full-text vector |
| `ingestion_jobs`    | Import result, content hash, timestamp and error                                              |

PostgreSQL `pg_trgm` and `tsvector` indexes provide lexical retrieval. The multilingual embedding is stored as `REAL[]`; the bounded first release ranks candidate vectors in the service. This avoids changing the existing `postgres:17-alpine` image, which does not ship pgvector. The service rejects candidate sets above 5,000 instead of returning an incomplete result. For larger corpora, migrate the array to pgvector and add an HNSW/IVFFlat index in a new migration, after deployment compatibility is checked.

`(document_id, version)` and `(document_version_id, chunk_index)` are unique. Reimporting identical content skips work; changing content under an existing version label fails. A new version retires the previous published version. Search enforces `effective_from <= effective_at < effective_to` (when an end date exists) and returns explicit CURRENT/HISTORICAL status. Old versions remain stored for audit.

## Ingestion and operation

Run the Banking Core migration and demo seed first. Then set `KNOWLEDGE_DATABASE_URL` or `PGHOST`/`PGDATABASE`/`PGUSER`/`PGPASSWORD` and run:

```powershell
python services/knowledge-service/ingest_cli.py
python services/knowledge-service/ingest_cli.py path/to/reviewed-manifest.json
python -m uvicorn app.main:app --app-dir services/knowledge-service --host 127.0.0.1 --port 8002
```

The pipeline is Load → Parse → Normalize → Validate → Chunk → Embed → Index. Embeddings use `intfloat/multilingual-e5-small`, pinned revision `614241f622f53c4eeff9890bdc4f31cfecc418b3`, recorded on each chunk. The Dockerfile copies the approved local weights; runtime is offline. Identical content with an obsolete embedding version is reindexed without changing document terms. The service HTTP endpoint is internal and read-only (`default_transaction_read_only=on`). The ingestion CLI is separate. The application-level search query hard-filters `PUBLIC` before either lexical or vector ranking. Customer-private retrieval is disabled until a bank-authenticated identity channel and dedicated DB role are implemented.

2026-10-20: additive independent Knowledge migration KG001 and the idempotent
source-backed graph index supplement V34. See [graph architecture](banking-knowledge-graph.md).
Health reports retrieval readiness separately from process liveness and graph schema readiness.

Do not point the CLI at unknown policy files: import is a publication action. Test imports against an isolated PostgreSQL database first.

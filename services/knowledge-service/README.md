# Aster Bank knowledge and graph service

Public Aster Demo Policy evidence only. Balances, card state, suitability and
financial permissions remain in Banking Core. Graph edges and retrieved text
are untrusted explanatory data. No customer transactions enter this index.

## Start and query

From PowerShell, with Docker Desktop running and the ignored env/key files set:

```powershell
& 'D:\BankProject-AGUI-20261012\start.cmd' restart -WithKnowledge -Services 'knowledge-service,agent-runtime' -ProjectName aster-acceptance-20261012 -Port 18088
```

Only Knowledge and Agent are built/recreated. PostgreSQL/Spring/proxy must
already be healthy. The startup command runs reviewed-source ingestion and
the independent Knowledge `KG001` migration. Repeated import preserves document
versions, skips identical content and reindexes embeddings when their pinned
model revision changes. No bank Flyway history is modified. If model cache or
resource preflight fails, existing services remain available.

```powershell
docker exec aster-acceptance-20261012-knowledge-service-1 python query_cli.py '转账前需要核对什么？'
docker exec aster-acceptance-20261012-knowledge-service-1 python query_cli.py '转账为什么要确认' --graph
```

The service is internal, with no public port. `query_cli.py` has a fixed loopback
origin and only search/graph operations; it cannot query arbitrary URLs or SQL.
Agent uses the existing `search_bank_knowledge`, including through MCP; no new
model tool is needed for graph-backed ranking. Existing source cards continue
to show document, version and location. Graph queries return explicit edges,
evidence IDs and exact source quotes.

## Structure and limits

- PostgreSQL full text/trigram + pinned multilingual E5 embeddings + RRF.
- Optional third ranking signal from matching graph topics/products; citations
  keep the existing strict MCP result schema.
- Embeddings retain original product/heading context; title-only hits expand to
  their own version's next real section with that section's citation. Weak lexical
  overlap is filtered; source diversity avoids one document crowding the results.
- Graph nodes: document, product, category, topic, control. Every edge has a
  document chunk reference and exact source quote. Six curated process/control
  assertions are checked against original text at ingestion; mismatches fail.
- Search/graph enforce PUBLIC, version interval, category/product filters on the
  server before ranking/traversal. Private knowledge is not supported.
- Bounded 5000 candidates; graph is one-hop, at most 40 edges, explicit truncation.
- Small curated demo graph, not a general graph reasoner or automated policy
  extractor. No Neo4j, new model privileges, SFT, customer memory or bank execution.
- Embeddings run CPU-only, two threads; service capped at 1800 MiB and two CPUs.
  The pinned local model is loaded offline. Initial image construction installs
  packages from official package registries; runtime makes no model download.

Tests are `tests/test_knowledge.py` and `tests/test_graph.py`. PostgreSQL tests
require `KNOWLEDGE_DATABASE_URL` pointing to the isolated demo bank, after source
ingestion. Do not use real customer databases. Retrieval source Recall@5 is
measured separately from model answer groundedness and financial safety.

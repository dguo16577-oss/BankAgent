-- Knowledge-only additive migration KG001. Never authoritative financial state.
CREATE TABLE IF NOT EXISTS knowledge.graph_nodes (
    node_id TEXT PRIMARY KEY,
    kind TEXT NOT NULL CHECK (kind IN ('DOCUMENT','CATEGORY','PRODUCT','TOPIC','CONTROL')),
    label TEXT NOT NULL,
    aliases JSONB NOT NULL DEFAULT '[]'::jsonb
);
CREATE TABLE IF NOT EXISTS knowledge.graph_edges (
    edge_id UUID PRIMARY KEY,
    source_id TEXT NOT NULL REFERENCES knowledge.graph_nodes(node_id),
    target_id TEXT NOT NULL REFERENCES knowledge.graph_nodes(node_id),
    relation TEXT NOT NULL CHECK (relation IN ('IN_CATEGORY','DESCRIBES_PRODUCT','EXPLAINS','REQUIRES_REVIEW','WARNS_AGAINST','DISTINGUISHES')),
    evidence_chunk_id UUID NOT NULL REFERENCES knowledge.document_chunks(chunk_id) ON DELETE CASCADE,
    source_quote TEXT NOT NULL CHECK (char_length(source_quote) BETWEEN 1 AND 1200),
    UNIQUE(source_id,target_id,relation,evidence_chunk_id)
);
CREATE INDEX IF NOT EXISTS knowledge_graph_source ON knowledge.graph_edges(source_id);
CREATE INDEX IF NOT EXISTS knowledge_graph_target ON knowledge.graph_edges(target_id);
CREATE INDEX IF NOT EXISTS knowledge_graph_evidence ON knowledge.graph_edges(evidence_chunk_id);

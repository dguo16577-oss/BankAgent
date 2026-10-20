-- Knowledge is explanatory evidence, never an authoritative banking state store.
CREATE EXTENSION IF NOT EXISTS pg_trgm;
-- Flyway upgrade tests also replay migrations into a second banking schema
-- in the same PostgreSQL database. The shared read-only knowledge schema is
-- database-scoped, so that replay must leave the existing objects intact.
CREATE SCHEMA IF NOT EXISTS knowledge;

CREATE TABLE IF NOT EXISTS knowledge.documents (
    document_id UUID PRIMARY KEY,
    title TEXT NOT NULL,
    category TEXT NOT NULL CHECK (category IN ('BANK_ACCOUNT','TRANSFER','CARD','WEALTH','SPENDING','SUBSCRIPTION','SECURITY','GENERAL_FAQ')),
    source_uri TEXT NOT NULL UNIQUE,
    source_type TEXT NOT NULL CHECK (source_type IN ('MARKDOWN','TXT','HTML','PDF','BANK_DEMO_CATALOG','BANK_DEMO_SUPPORT')),
    language TEXT NOT NULL CHECK (language IN ('zh','en')),
    product_scope TEXT,
    access_scope TEXT NOT NULL CHECK (access_scope IN ('PUBLIC','CUSTOMER')),
    owner_customer_id VARCHAR(255) REFERENCES customers(customer_id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK ((access_scope = 'PUBLIC' AND owner_customer_id IS NULL)
        OR (access_scope = 'CUSTOMER' AND owner_customer_id IS NOT NULL))
);

CREATE TABLE IF NOT EXISTS knowledge.document_versions (
    document_version_id UUID PRIMARY KEY,
    document_id UUID NOT NULL REFERENCES knowledge.documents(document_id),
    version TEXT NOT NULL,
    effective_from TIMESTAMPTZ NOT NULL,
    effective_to TIMESTAMPTZ,
    status TEXT NOT NULL CHECK (status IN ('DRAFT','PUBLISHED','RETIRED')),
    content_hash CHAR(64) NOT NULL,
    original_content TEXT NOT NULL,
    last_verified_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (document_id, version),
    CHECK (effective_to IS NULL OR effective_to > effective_from)
);
CREATE INDEX IF NOT EXISTS knowledge_versions_current ON knowledge.document_versions
    (document_id, status, effective_from, effective_to);
CREATE UNIQUE INDEX IF NOT EXISTS knowledge_one_open_published_version ON knowledge.document_versions(document_id)
    WHERE status='PUBLISHED' AND effective_to IS NULL;

CREATE TABLE IF NOT EXISTS knowledge.document_chunks (
    chunk_id UUID PRIMARY KEY,
    document_version_id UUID NOT NULL REFERENCES knowledge.document_versions(document_version_id) ON DELETE CASCADE,
    chunk_index INTEGER NOT NULL CHECK (chunk_index >= 0),
    heading_path TEXT NOT NULL,
    content TEXT NOT NULL,
    source_location TEXT NOT NULL,
    embedding_model_version TEXT,
    embedding REAL[],
    search_vector TSVECTOR GENERATED ALWAYS AS (to_tsvector('simple', content)) STORED,
    UNIQUE (document_version_id, chunk_index),
    CHECK (char_length(content) BETWEEN 1 AND 4000)
);
CREATE INDEX IF NOT EXISTS knowledge_chunks_fts ON knowledge.document_chunks USING GIN (search_vector);
CREATE INDEX IF NOT EXISTS knowledge_chunks_trigram ON knowledge.document_chunks USING GIN (content gin_trgm_ops);

CREATE TABLE IF NOT EXISTS knowledge.ingestion_jobs (
    job_id UUID PRIMARY KEY,
    source_uri TEXT NOT NULL,
    content_hash CHAR(64),
    status TEXT NOT NULL CHECK (status IN ('RUNNING','SUCCEEDED','SKIPPED','FAILED')),
    error_message TEXT,
    started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    finished_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS knowledge_jobs_source ON knowledge.ingestion_jobs (source_uri, started_at DESC);

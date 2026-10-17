# ADR 0018 — Public Banking content and deterministic search

Status: Accepted — M21  
Date: 2026-09-28

## Context

Customer's 39 frozen operations are implemented. The nine frozen Public operations expose anonymous informational content, with M10 authored discovery/search behavior. These are a different trust surface from customer financial state.

## Decision

1. Implement a dedicated Public Content module with domain, application, web and PostgreSQL adapters. No Customer business/identity dependencies in either direction.
2. Flyway owns ten structured Public tables. Queryable metadata, rates, dates, routes and order use typed columns. Only variable editorial blocks/semantic navigation sections use JSONB.
3. Seed the independently stored backend fixture only in local/test. Inserts preserve existing records. Default/production does not seed, and runtime has no frontend artifact dependency.
4. Compose Home from the current shared Public source records under a consistent read transaction; do not store a second Home snapshot.
5. Use parameterized PostgreSQL substring queries and explicit stable authored ordering. Preserve M10 token matching, searchable fields, blank handling and lack of result pagination/limit. No additional endpoint or search infrastructure.
6. Serve Public GET through a separate stateless Spring Security chain so an expired customer session cannot block anonymous content. Keep Customer authentication and mutation CSRF; Public unsafe methods remain denied. CORS retains exact profile-specific origins.
7. Keep generated Public models at the HTTP boundary. Numeric indicative rates use BigDecimal/NUMERIC with DEMO_RATE provenance. Fees follow frozen textual reference semantics.
8. Keep Next.js in MSW mode. Full frozen backend coverage is not a production readiness claim or frontend integration.

## Consequences

Public content survives restarts and manual edits, but no CMS/admin workflow exists. The small catalog uses simple scans for substring matching plus category/unique slug indexes; a speculative text index would not help this operator. No personalization, live market data, hidden expiry rules, AI or vector search is introduced. Future changes must separately address contract versioning, editorial lifecycle and frontend transport.

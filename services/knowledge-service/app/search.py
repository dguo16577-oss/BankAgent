"""Hybrid keyword/semantic retrieval with SQL access and version filters first."""

from __future__ import annotations

import math
from datetime import datetime, timezone
from typing import Any

import psycopg

from .embedding import VERSION, embed
from .graph import graph_query


def _cosine(left: list[float], right: list[float]) -> float:
    if len(left) != len(right) or not left:
        return 0.0
    norm_left = math.sqrt(sum(x*x for x in left))
    norm_right = math.sqrt(sum(x*x for x in right))
    return sum(x*y for x, y in zip(left, right)) / (norm_left*norm_right) if norm_left and norm_right else 0.0


def _rank(lexical, semantic, rows, graph_ids, limit):
    fused = {}
    for ranking, minimum in ((lexical, .08), (semantic, 0)):
        for rank, (index, score) in enumerate(ranking):
            # Tiny trigram overlap (e.g. a shared Chinese character in headings)
            # is not a genuine lexical hit deserving a second RRF vote.
            if score > minimum:
                fused[index] = fused.get(index, 0) + 1 / (60 + rank + 1)
    # Curated links are a small tie-breaker, not a replacement for exact policy
    # terms. A generic topic cannot dominate a precisely matching source.
    for index, row in enumerate(rows):
        if str(row[0]) in graph_ids:
            fused[index] = fused.get(index, 0) + .15 / 61
    ordered = sorted(fused.items(), key=lambda item: item[1], reverse=True)
    selected, counts, deferred = [], {}, []
    for index, score in ordered:
        doc = str(rows[index][1])
        if counts.get(doc, 0) >= 2:
            deferred.append((index, score))
            continue
        counts[doc] = counts.get(doc, 0) + 1
        selected.append((index, score))
        if len(selected) == limit:
            break
    # Product-scoped queries can legitimately need several chunks of one source.
    return (selected + deferred)[:limit]


def _with_body(rows, ranking, limit):
    """A title/summary hit must expose its next real section, not just a label.

    Both chunks have already passed identical access/version/product filters.
    Return the body's own citation/location; never merge or invent quoted text.
    """
    positions = {(str(r[1]), r[6], r[17]): i for i, r in enumerate(rows)}
    selected, seen = [], set()
    for index, score in ranking:
        r = rows[index]
        if r[17] == 0 and r[12].startswith('# '):
            index = positions.get((str(r[1]), r[6], 1), index)
        if index not in seen:
            seen.add(index)
            selected.append((index, score))
            if len(selected) == limit:
                break
    return selected


def search(conn: psycopg.Connection, query: str, *, category: str | None = None,
           product_scope: str | None = None, effective_at: datetime | None = None,
           limit: int = 5) -> dict[str, Any]:
    if not query.strip() or len(query) > 500 or not 1 <= limit <= 10:
        raise ValueError("Invalid search input")
    instant = effective_at or datetime.now(timezone.utc)
    # This service deliberately has PUBLIC access only. Customer-private documents
    # require an authenticated bank identity binding before a future rollout.
    rows = conn.execute("""SELECT c.chunk_id,d.document_id,d.title,d.source_uri,d.category,d.product_scope,
            v.version,v.status,v.effective_from,v.effective_to,c.heading_path,c.source_location,c.content,
            c.embedding,c.embedding_model_version,
            ts_rank_cd(c.search_vector, plainto_tsquery('simple', %s)) AS fts,
            similarity(c.content, %s) AS trigram,c.chunk_index
        FROM knowledge.document_chunks c
        JOIN knowledge.document_versions v ON v.document_version_id=c.document_version_id
        JOIN knowledge.documents d ON d.document_id=v.document_id
        WHERE d.access_scope='PUBLIC' AND v.status IN ('PUBLISHED','RETIRED')
          AND v.effective_from <= %s AND (v.effective_to IS NULL OR v.effective_to > %s)
          AND (%s::text IS NULL OR d.category=%s)
          AND (%s::text IS NULL OR d.product_scope=%s)
        ORDER BY d.document_id,c.chunk_index LIMIT 5001""",
        (query, query, instant, instant, category, category, product_scope, product_scope)).fetchall()
    if len(rows) > 5000:
        raise RuntimeError("Knowledge search candidate cap exceeded")
    if not rows:
        return {"evidence": [], "retrieval_mode": "HYBRID", "status": "NO_EVIDENCE"}
    query_vector = embed([query], query=True)[0]
    graph_installed = conn.execute("SELECT to_regclass('knowledge.graph_edges') IS NOT NULL").fetchone()[0]
    graph = (graph_query(conn, query, effective_at=instant, category=category, product_scope=product_scope)
             if graph_installed else {'edges': []})
    graph_ids = {edge['evidence_id'] for edge in graph['edges']}
    lexical: list[tuple[int, float]] = []
    semantic: list[tuple[int, float]] = []
    for index, row in enumerate(rows):
        text = row[12].casefold()
        words = [token for token in query.casefold().split() if len(token) > 1]
        exact = sum(1 for token in words if token in text) / max(len(words), 1)
        lexical.append((index, float(row[15]) + float(row[16]) + exact))
        vector = row[13]
        semantic.append((index, _cosine(query_vector, vector) if vector and row[14] == VERSION else 0.0))
    if not graph_ids and max(score for _, score in lexical) < 0.08 and max(score for _, score in semantic) < 0.78:
        return {"evidence": [], "retrieval_mode": "HYBRID", "status": "NO_EVIDENCE"}
    lexical.sort(key=lambda item: item[1], reverse=True)
    semantic.sort(key=lambda item: item[1], reverse=True)
    output: list[dict[str, Any]] = []
    for index, score in _with_body(rows, _rank(lexical, semantic, rows, graph_ids, limit*2), limit):
        row = rows[index]
        output.append({"evidence_id": str(row[0]), "document_id": str(row[1]),
                       "document_title": row[2], "source_uri": row[3], "category": row[4],
                       "product_scope": row[5], "version": row[6],
                       "effective_status": "CURRENT" if row[7] == "PUBLISHED" else "HISTORICAL",
                       "effective_from": row[8].isoformat(), "effective_to": row[9].isoformat() if row[9] else None,
                       "source_location": row[11], "heading_path": row[10],
                       "relevant_text": row[12][:1200], "relevance_score": round(score, 6),
                       "source_label": "Aster Demo Policy", "trust": "UNTRUSTED_EXTERNAL_DATA"})
    return {"evidence": output, "retrieval_mode": "HYBRID", "status": "OK" if output else "NO_EVIDENCE"}

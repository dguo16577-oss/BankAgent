"""Small source-backed public policy graph; no inferred financial authority."""
from __future__ import annotations

import hashlib
import re
from datetime import datetime, timezone
from pathlib import Path
from uuid import NAMESPACE_URL, uuid5

from psycopg.types.json import Jsonb

# Reviewed links quote the actual authored demo support text. A source change
# invalidates the assertion instead of silently extracting a replacement rule.
ASSERTIONS = (
    ('bank-transfers', 'transfer', '转账', ['转账', '汇款', 'bank transfer'],
     'REQUIRES_REVIEW', 'review-transfer', '核对转账信息',
     'Check the recipient, currency and amount before confirming.'),
    ('failed-transfer', 'transfer', '转账', ['转账', '汇款', 'bank transfer'],
     'WARNS_AGAINST', 'duplicate-payment', '避免重复付款',
     'Avoid duplicate payments when an earlier result is uncertain.'),
    ('lost-card', 'card-loss', '卡片丢失', ['挂失', '丢卡', '卡丢了', 'lost card'],
     'REQUIRES_REVIEW', 'review-activity', '检查近期交易',
     'Contact your card issuer through a trusted channel and follow its instructions for blocking the card. Review recent activity.'),
    ('recurring-payments', 'recurring', '订阅与代扣', ['订阅', '代扣', 'recurring payment'],
     'DISTINGUISHES', 'provider-contract', '服务提供方合同',
     'Contact the service provider about any separate contract.'),
    ('step-up-verification', 'verification', '二次验证', ['二次验证', '验证码', 'step-up', 'extra verification'],
     'EXPLAINS', 'action-binding', '授权绑定具体操作',
     'An authorisation should be tied to the particular action and expire after a short period. Verify the action details before approving it.'),
    ('investment-risk', 'investment', '投资风险', ['理财风险', '投资风险', '保本', 'investment risk'],
     'WARNS_AGAINST', 'guaranteed-suitability', '不能保证适当性',
     'A risk label summarises selected characteristics. It cannot predict losses or guarantee that a product is suitable for you.'),
)


def apply_schema(conn):
    """Independent Knowledge schema ledger; no edits to bank Flyway history."""
    ddl = Path(__file__).with_name('graph_schema.sql').read_text(encoding='utf-8')
    digest = hashlib.sha256(ddl.encode()).hexdigest()
    with conn.transaction():
        conn.execute("SELECT pg_advisory_xact_lock(742021001)")
        conn.execute('''CREATE TABLE IF NOT EXISTS knowledge.schema_migrations
            (version TEXT PRIMARY KEY, sha256 TEXT NOT NULL, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())''')
        prior = conn.execute("SELECT sha256 FROM knowledge.schema_migrations WHERE version='KG001'").fetchone()
        if prior and prior[0] != digest:
            raise RuntimeError('Knowledge KG001 checksum mismatch')
        if not prior:
            conn.execute(ddl)
            conn.execute("INSERT INTO knowledge.schema_migrations(version,sha256) VALUES ('KG001',%s)", (digest,))


def rebuild_graph(conn):
    """Idempotently index all public versions. Query-time ACL/date filtering is mandatory."""
    rows = conn.execute('''SELECT d.document_id,d.title,d.category,d.product_scope,d.source_uri,
           c.chunk_id,c.content FROM knowledge.documents d
           JOIN knowledge.document_versions v USING(document_id)
           JOIN knowledge.document_chunks c USING(document_version_id)
           WHERE d.access_scope='PUBLIC' AND v.status IN ('PUBLISHED','RETIRED')
           ORDER BY d.document_id,c.chunk_index LIMIT 5001''').fetchall()
    if len(rows) > 5000:
        raise RuntimeError('Graph source cap exceeded')
    assertions = set()
    aliases_by_doc = {}
    for doc, _, _, _, _, _, content in rows:
        match = re.search(r'^中文名称:\s*(.+)$', content, re.M)
        if match:
            aliases_by_doc[str(doc)] = [match.group(1).strip()]
    with conn.transaction():
        def node(identity, kind, label, aliases=()):
            conn.execute('''INSERT INTO knowledge.graph_nodes(node_id,kind,label,aliases) VALUES (%s,%s,%s,%s)
              ON CONFLICT(node_id) DO UPDATE SET kind=EXCLUDED.kind,label=EXCLUDED.label,aliases=EXCLUDED.aliases''',
                         (identity, kind, label, Jsonb(list(aliases))))

        def edge(source, target, relation, chunk, quote):
            identity = uuid5(NAMESPACE_URL, f'{source}|{target}|{relation}|{chunk}')
            conn.execute('''INSERT INTO knowledge.graph_edges VALUES (%s,%s,%s,%s,%s,%s)
              ON CONFLICT(edge_id) DO UPDATE SET source_quote=EXCLUDED.source_quote''',
                         (identity, source, target, relation, chunk, quote))

        for doc, title, category, product, uri, chunk, content in rows:
            document = 'document:' + str(doc)
            aliases = aliases_by_doc.get(str(doc), [])
            node(document, 'DOCUMENT', title, aliases)
            node('category:'+category, 'CATEGORY', category)
            edge(document, 'category:'+category, 'IN_CATEGORY', chunk, content[:1200])
            if product:
                node('product:'+product, 'PRODUCT', title, [product, *aliases])
                edge(document, 'product:'+product, 'DESCRIBES_PRODUCT', chunk, content[:1200])
            for slug, topic, label, aliases, relation, control, control_label, quote in ASSERTIONS:
                if uri == 'aster-demo://public-support/'+slug and quote in content:
                    node('topic:'+topic, 'TOPIC', label, aliases)
                    node('control:'+control, 'CONTROL', control_label)
                    edge('topic:'+topic, 'control:'+control, relation, chunk, quote)
                    edge(document, 'topic:'+topic, 'EXPLAINS', chunk, quote)
                    assertions.add(slug)
        # Missing known demo assertions mean stale curated rules, not fabricated replacements.
        existing = {r[4].rsplit('/', 1)[-1] for r in rows}
        required = {a[0] for a in ASSERTIONS if a[0] in existing}
        if not required <= assertions:
            raise RuntimeError('Curated graph quote missing: '+','.join(sorted(required-assertions)))
    return {'source_chunks': len(rows), 'verified_assertions': len(assertions)}


def graph_query(conn, query, *, effective_at=None, category=None, product_scope=None, limit=40):
    if not query.strip() or len(query) > 500 or not 1 <= limit <= 40:
        raise ValueError('Invalid graph query')
    instant = effective_at or datetime.now(timezone.utc)
    # Filtering precedes traversal, so neither private/stale node labels nor edges
    # can be obtained by guessing a graph ID. Only a bounded one-hop query exists.
    rows = conn.execute('''SELECT e.source_id,s.kind,s.label,s.aliases,
        e.target_id,t.kind,t.label,t.aliases,e.relation,c.chunk_id,d.document_id,
        d.title,d.source_uri,v.version,c.source_location,e.source_quote,v.status
        FROM knowledge.graph_edges e
        JOIN knowledge.graph_nodes s ON s.node_id=e.source_id
        JOIN knowledge.graph_nodes t ON t.node_id=e.target_id
        JOIN knowledge.document_chunks c ON c.chunk_id=e.evidence_chunk_id
        JOIN knowledge.document_versions v USING(document_version_id)
        JOIN knowledge.documents d USING(document_id)
        WHERE d.access_scope='PUBLIC' AND v.status IN ('PUBLISHED','RETIRED')
        AND v.effective_from<=%s AND (v.effective_to IS NULL OR v.effective_to>%s)
        AND (%s::text IS NULL OR d.category=%s)
        AND (%s::text IS NULL OR d.product_scope=%s)
        ORDER BY e.edge_id LIMIT 5001''', (instant, instant, category, category, product_scope, product_scope)).fetchall()
    if len(rows) > 5000:
        raise RuntimeError('Graph candidate cap exceeded')
    normalized = query.casefold()
    def matches(label, aliases):
        return any(len(x.strip()) >= 2 and x.casefold() in normalized for x in [label, *aliases])
    seeds = set()
    for r in rows:
        if r[1] != 'CATEGORY' and matches(r[2], r[3]): seeds.add(r[0])
        if r[5] != 'CATEGORY' and matches(r[6], r[7]): seeds.add(r[4])
    selected = [r for r in rows if r[0] in seeds or r[4] in seeds]
    # Explicit truncation; never pretend an arbitrarily large graph is complete.
    nodes, edges = {}, []
    for r in selected[:limit]:
        for offset in (0, 4):
            nodes[r[offset]] = {'id': r[offset], 'kind': r[offset+1], 'label': r[offset+2]}
        edges.append({'source': r[0], 'target': r[4], 'relation': r[8],
                      'evidence_id': str(r[9]), 'document_id': str(r[10]),
                      'document_title': r[11], 'source_uri': r[12], 'version': r[13],
                      'source_location': r[14], 'source_quote': r[15],
                      'effective_status': 'CURRENT' if r[16]=='PUBLISHED' else 'HISTORICAL'})
    return {'nodes': list(nodes.values()), 'edges': edges, 'truncated': len(selected)>limit,
            'status': 'OK' if edges else 'NO_EVIDENCE', 'trust': 'UNTRUSTED_EXTERNAL_DATA',
            'financial_authority': False}

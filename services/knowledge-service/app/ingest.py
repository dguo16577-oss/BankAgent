"""Allowlisted, repeatable ingestion of original demo sources and local documents."""

from __future__ import annotations

import hashlib
import json
import re
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from uuid import uuid4

import psycopg
from bs4 import BeautifulSoup
from pypdf import PdfReader

from .embedding import VERSION, embed

CATEGORIES = {"BANK_ACCOUNT", "TRANSFER", "CARD", "WEALTH", "SPENDING", "SUBSCRIPTION", "SECURITY", "GENERAL_FAQ"}
DEMO_ZH_ALIASES = {
    "everyday-account": "日常账户", "flexible-savings": "灵活储蓄", "time-deposit": "定期存款",
    "global-currency-account": "多币种账户", "payments-transfers": "付款与转账",
    "everyday-debit-card": "日常借记卡", "cashback-credit-card": "返现信用卡",
    "travel-credit-card": "旅行信用卡", "money-market-investing": "货币市场投资",
    "investment-basics": "投资基础", "lost-card": "银行卡丢失与挂失",
    "bank-transfers": "银行转账", "failed-transfer": "转账失败", "balance-available": "可用余额",
    "recurring-payments": "定期付款与代扣", "step-up-verification": "二次验证",
    "investment-risk": "投资风险", "budgeting-basics": "消费预算",
}


@dataclass(frozen=True)
class Source:
    uri: str
    title: str
    category: str
    source_type: str
    language: str
    product_scope: str | None
    effective_from: datetime
    content: str
    version: str
    access_scope: str = "PUBLIC"
    owner_customer_id: str | None = None


def normalize(text: str) -> str:
    return "\n".join(re.sub(r"[ \t]+", " ", line).strip() for line in text.replace("\r\n", "\n").splitlines()).strip()


def parse_file(path: Path) -> str:
    suffix = path.suffix.lower()
    if suffix in {".md", ".txt"}:
        return normalize(path.read_text(encoding="utf-8"))
    if suffix in {".html", ".htm"}:
        soup = BeautifulSoup(path.read_text(encoding="utf-8"), "html.parser")
        for element in soup(["script", "style", "nav"]):
            element.decompose()
        return normalize(soup.get_text("\n"))
    if suffix == ".pdf":
        pages = PdfReader(str(path)).pages
        return normalize("\n".join(f"[page {i+1}]\n{page.extract_text() or ''}" for i, page in enumerate(pages)))
    raise ValueError("Unsupported document type")


def chunks(content: str, size: int = 950) -> list[tuple[str, str, str]]:
    """Preserve heading and line offsets; avoid hiding an entire document in one chunk."""
    lines = content.splitlines()
    result: list[tuple[str, str, str]] = []
    heading = "Document"
    part: list[str] = []
    start = 1
    expanded = [(index, segment) for index, line in enumerate(lines, 1)
                for segment in ([line[i:i+size] for i in range(0, len(line), size)] or [""])]
    for index, line in expanded:
        if line.startswith("#") or re.fullmatch(r"\[page \d+\]", line):
            if part:
                result.append((heading, "\n".join(part), f"L{start}-L{max(start,index-1)}"))
                part = []
            heading = line.lstrip("# ")
            start = index
        if part and len("\n".join(part)) + len(line) > size:
            result.append((heading, "\n".join(part), f"L{start}-L{max(start,index-1)}"))
            part = []
            start = index
        if line.strip():
            part.append(line)
    if part:
        result.append((heading, "\n".join(part), f"L{start}-L{len(lines)}"))
    return [(h, body[:4000], loc) for h, body, loc in result if body.strip()]


def ingest(conn: psycopg.Connection, source: Source) -> str:
    if source.category not in CATEGORIES or source.language not in {"zh", "en"}:
        raise ValueError("Invalid source metadata")
    if source.access_scope != "PUBLIC" or source.owner_customer_id is not None:
        raise ValueError("Customer-specific ingestion requires a separately approved identity flow")
    if not source.uri.startswith(("aster-demo://", "repo://")):
        raise ValueError("Source is not allowlisted")
    body = normalize(source.content)
    if not body or len(body) > 1_000_000:
        raise ValueError("Invalid content length")
    digest = hashlib.sha256(body.encode("utf-8")).hexdigest()
    job_id = uuid4()
    with conn.transaction():
        conn.execute("INSERT INTO knowledge.ingestion_jobs(job_id,source_uri,content_hash,status) VALUES (%s,%s,%s,'RUNNING')", (job_id, source.uri, digest))
    try:
        with conn.transaction():
            row = conn.execute("SELECT document_id FROM knowledge.documents WHERE source_uri=%s FOR UPDATE", (source.uri,)).fetchone()
            doc_id = row[0] if row else uuid4()
            if not row:
                conn.execute("""INSERT INTO knowledge.documents(document_id,title,category,source_uri,source_type,language,product_scope,access_scope)
                    VALUES (%s,%s,%s,%s,%s,%s,%s,'PUBLIC')""", (doc_id, source.title, source.category, source.uri, source.source_type, source.language, source.product_scope))
            else:
                conn.execute("""UPDATE knowledge.documents SET title=%s,category=%s,source_type=%s,language=%s,product_scope=%s
                    WHERE document_id=%s""", (source.title, source.category, source.source_type, source.language, source.product_scope, doc_id))
            prior = conn.execute("SELECT document_version_id,content_hash FROM knowledge.document_versions WHERE document_id=%s AND version=%s", (doc_id, source.version)).fetchone()
            if prior and prior[1] == digest:
                stale = conn.execute('''SELECT chunk_id,heading_path,content FROM knowledge.document_chunks
                    WHERE document_version_id=%s AND (embedding IS NULL OR embedding_model_version IS DISTINCT FROM %s)
                    ORDER BY chunk_index''', (prior[0], VERSION)).fetchall()
                if stale:
                    vectors = embed([f'{source.title}\n{heading}\n{text}' for _, heading, text in stale])
                    for (chunk_id, _, _), vector in zip(stale, vectors, strict=True):
                        conn.execute('''UPDATE knowledge.document_chunks SET embedding=%s,embedding_model_version=%s
                            WHERE chunk_id=%s''', (vector, VERSION, chunk_id))
                    status = 'SUCCEEDED'
                else:
                    status = "SKIPPED"
            elif prior:
                raise ValueError("Version label already published with different content")
            else:
                pieces = chunks(body)
                if not pieces:
                    raise ValueError("No searchable chunks")
                # Source title/heading provide product context to otherwise
                # anonymous fee/rule chunks; original cited text stays immutable.
                vectors = embed([f'{source.title}\n{heading}\n{text}' for heading, text, _ in pieces])
                version_id = uuid4()
                conn.execute("""UPDATE knowledge.document_versions SET status='RETIRED',effective_to=%s
                    WHERE document_id=%s AND status='PUBLISHED' AND effective_to IS NULL""", (source.effective_from, doc_id))
                conn.execute("""INSERT INTO knowledge.document_versions(document_version_id,document_id,version,effective_from,status,content_hash,original_content,last_verified_at)
                    VALUES (%s,%s,%s,%s,'PUBLISHED',%s,%s,%s)""", (version_id, doc_id, source.version, source.effective_from, digest, body, datetime.now(timezone.utc)))
                for index, ((heading, text, location), vector) in enumerate(zip(pieces, vectors, strict=True)):
                    conn.execute("""INSERT INTO knowledge.document_chunks(chunk_id,document_version_id,chunk_index,heading_path,content,source_location,embedding_model_version,embedding)
                        VALUES (%s,%s,%s,%s,%s,%s,%s,%s)""", (uuid4(), version_id, index, heading, text, location, VERSION, vector))
                status = "SUCCEEDED"
            conn.execute("UPDATE knowledge.ingestion_jobs SET status=%s,finished_at=now() WHERE job_id=%s", (status, job_id))
        return status
    except Exception as exc:
        with conn.transaction():
            conn.execute("UPDATE knowledge.ingestion_jobs SET status='FAILED',error_message=%s,finished_at=now() WHERE job_id=%s", (str(exc)[:500], job_id))
        raise


def public_demo_sources(conn: psycopg.Connection) -> list[Source]:
    """Mirror authored demo catalog/support text with explicit source and effective date."""
    category_map = {"BANKING": "BANK_ACCOUNT", "PAYMENTS_FX": "TRANSFER", "CARDS": "CARD", "BORROWING": "GENERAL_FAQ",
                    "INVESTMENTS": "WEALTH", "INSURANCE": "GENERAL_FAQ", "SECURITY": "SECURITY", "PAYMENTS": "TRANSFER",
                    "ACCOUNTS": "BANK_ACCOUNT", "SPENDING": "SPENDING", "SUBSCRIPTIONS": "SUBSCRIPTION", "WEALTH": "WEALTH"}
    result: list[Source] = []
    for row in conn.execute("""SELECT c.slug,c.title,c.category,c.description,c.body,c.updated_at,
        COALESCE((SELECT json_agg(json_build_object('label',f.label,'value',f.value,'conditions',f.conditions)
            ORDER BY f.display_order) FROM public_catalog_fees f WHERE f.catalog_id=c.id),'[]'::json)
        FROM public_catalog c WHERE c.environment='DEMO'"""):
        slug, title, category, description, body, updated, fees = row
        terms = body if isinstance(body, dict) else json.loads(body)
        lines = [f"# {title} — Aster Demo Policy", "中文名称: " + DEMO_ZH_ALIASES[slug] if slug in DEMO_ZH_ALIASES else "", description, "## Highlights"]
        lines.extend(str(item) for item in terms.get("highlights", []) if isinstance(item, str))
        lines.append("## Features")
        lines.extend(f"{item.get('title', '')}: {item.get('description', '')}" for item in terms.get("features", []) if isinstance(item, dict))
        eligibility = terms.get("eligibility", {})
        if isinstance(eligibility, dict):
            lines.extend(["## Eligibility", str(eligibility.get("summary", ""))])
            lines.extend(str(item) for item in eligibility.get("requirements", []) if isinstance(item, str))
        lines.append("## Important limitations")
        lines.extend(str(item) for item in terms.get("disclaimers", []) if isinstance(item, str))
        lines.append("## Illustrative fees")
        lines.extend(f"{item.get('label', '')}: {item.get('value', '')}. {item.get('conditions', '')}"
                     for item in fees if isinstance(item, dict))
        text = "\n".join(lines)
        result.append(Source(f"aster-demo://public-catalog/{slug}", title, category_map.get(category, "GENERAL_FAQ"), "BANK_DEMO_CATALOG", "en", slug, updated, text, updated.isoformat()))
    for row in conn.execute("SELECT slug,title,category,summary,sections,updated_at FROM public_support WHERE environment='DEMO'"):
        slug, title, category, summary, sections, updated = row
        sections = sections if isinstance(sections, list) else json.loads(sections)
        lines = [f"# {title} — Aster Demo Policy", "中文名称: " + DEMO_ZH_ALIASES[slug] if slug in DEMO_ZH_ALIASES else "", summary]
        for section in sections:
            if not isinstance(section, dict):
                continue
            lines.append("## " + str(section.get("heading", "Guidance")))
            lines.extend(str(item) for item in section.get("paragraphs", []) if isinstance(item, str))
            lines.extend(str(item) for item in section.get("callouts", []) if isinstance(item, str))
        text = "\n".join(lines)
        domain = {"recurring-payments": "SUBSCRIPTION", "budgeting-basics": "SPENDING"}.get(slug, category_map.get(category, "GENERAL_FAQ"))
        result.append(Source(f"aster-demo://public-support/{slug}", title, domain, "BANK_DEMO_SUPPORT", "en", None, updated, text, updated.isoformat()))
    return result

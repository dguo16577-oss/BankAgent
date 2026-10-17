"""A small, source-attributed graph built only from public Banking Core records."""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Any
from urllib.parse import quote

from .banking import BankingGateway
from .models import Citation, GraphEdge, GraphNode, GraphResponse


@dataclass(frozen=True)
class SourceFact:
    title: str
    text: str
    url: str


@dataclass(frozen=True)
class KnowledgeSnapshot:
    graph: GraphResponse
    facts: tuple[SourceFact, ...]


def _safe_slug(raw: Any) -> str | None:
    if not isinstance(raw, str) or not re.fullmatch(r"[a-z0-9][a-z0-9_-]{0,100}", raw):
        return None
    return quote(raw, safe="")


def _safe_text(raw: Any, limit: int = 500) -> str:
    return raw[:limit].strip() if isinstance(raw, str) else ""


async def load_knowledge(gateway: BankingGateway) -> KnowledgeSnapshot:
    # These four reads are anonymous reference data. No customer state is stored
    # in the graph and no authored product fact is invented here.
    catalog = await gateway.public_get("/public/catalog")
    support = await gateway.public_get("/public/support/articles")
    rates = await gateway.public_get("/public/rates")
    offers = await gateway.public_get("/public/offers")

    nodes: dict[str, GraphNode] = {}
    edges: list[GraphEdge] = []
    facts: list[SourceFact] = []

    def add_entity(
        kind: str, identity: str, title: str, description: str, url: str,
        category: str = "", tags: Any = None,
    ) -> None:
        node_id = f"{kind.lower()}:{identity}"
        nodes[node_id] = GraphNode(id=node_id, label=title, kind=kind, sourceUrl=url)
        facts.append(SourceFact(title=title, text=description, url=url))
        if category:
            category_id = f"category:{category}"
            nodes.setdefault(category_id, GraphNode(id=category_id, label=category, kind="CATEGORY", sourceUrl=url))
            edges.append(GraphEdge(source=node_id, relation="IN_CATEGORY", target=category_id, sourceUrl=url))
        if isinstance(tags, list):
            for tag in tags[:6]:
                label = _safe_text(tag, 60)
                if not label:
                    continue
                tag_id = f"tag:{label.casefold()}"
                nodes.setdefault(tag_id, GraphNode(id=tag_id, label=label, kind="TAG", sourceUrl=url))
                edges.append(GraphEdge(source=node_id, relation="HAS_TAG", target=tag_id, sourceUrl=url))

    for entry in catalog.get("items", [])[:50]:
        if not isinstance(entry, dict) or not (slug := _safe_slug(entry.get("slug"))):
            continue
        title = _safe_text(entry.get("title"), 160)
        if title:
            add_entity("PRODUCT", slug, title, _safe_text(entry.get("shortDescription")), f"/products/{slug}", _safe_text(entry.get("category"), 50), entry.get("tags"))

    for entry in support.get("items", [])[:50]:
        if not isinstance(entry, dict) or not (slug := _safe_slug(entry.get("slug"))):
            continue
        title = _safe_text(entry.get("title"), 160)
        if title:
            add_entity("ARTICLE", slug, title, _safe_text(entry.get("summary")), f"/support/{slug}", _safe_text(entry.get("category"), 50), entry.get("tags"))

    for entry in rates.get("items", [])[:20]:
        if not isinstance(entry, dict):
            continue
        identity = _safe_slug(entry.get("id"))
        title = _safe_text(entry.get("title"), 160)
        if identity and title:
            value = _safe_text(entry.get("value"), 40)
            unit = _safe_text(entry.get("unit"), 40)
            conditions = _safe_text(entry.get("conditions"), 240)
            add_entity("RATE", identity, title, f"{value} {unit}。{conditions}", "/rates", _safe_text(entry.get("kind"), 50))

    for entry in offers.get("items", [])[:20]:
        if not isinstance(entry, dict):
            continue
        identity = _safe_slug(entry.get("id"))
        title = _safe_text(entry.get("title"), 160)
        if identity and title:
            add_entity("OFFER", identity, title, _safe_text(entry.get("summary")), "/offers", _safe_text(entry.get("category"), 50))

    return KnowledgeSnapshot(GraphResponse(nodes=list(nodes.values()), edges=edges), tuple(facts))


_CHINESE_TERMS = {
    "转账": "transfer",
    "汇款": "transfer",
    "账户": "account",
    "余额": "balance",
    "账单": "statement",
    "银行卡": "card",
    "信用卡": "card",
    "返现": "cashback",
    "旅行": "travel",
    "挂失": "lost card",
    "订阅": "recurring",
    "代扣": "recurring",
    "理财": "investment",
    "投资": "investment",
    "利率": "rate",
    "汇率": "exchange rate",
    "安全": "security",
    "验证": "verification",
    "贷款": "loan",
    "储蓄": "savings",
    "存款": "deposit",
    "费用": "fee",
    "手续费": "fee",
    "年费": "annual fee",
    "申请条件": "eligibility",
    "申请资格": "eligibility",
    "准入条件": "eligibility",
    "优惠": "offer",
}


def relevant_facts(snapshot: KnowledgeSnapshot, query: str, limit: int = 3) -> list[SourceFact]:
    normalized = query.casefold()
    words = set(re.findall(r"[a-z0-9]{3,}", normalized))
    for chinese, english in _CHINESE_TERMS.items():
        if chinese in query:
            words.update(english.split())
    card_terms_question = bool(
        re.search(r"信用卡|\bcredit\s+card\b", query, re.IGNORECASE)
        and re.search(r"费用|手续费|年费|申请条件|申请资格|准入条件|\bfees?\b|\beligib(?:le|ility)\b", query, re.IGNORECASE)
    )
    ranked: list[tuple[int, SourceFact]] = []
    for fact in snapshot.facts:
        title = fact.title.casefold()
        if card_terms_question:
            # A product-specific terms question needs a distinctive product
            # name match. "Credit Card" alone would choose a card arbitrarily.
            distinctive = set(re.findall(r"[a-z0-9]{3,}", title)) - {"credit", "debit", "card", "cards", "bank", "aster"}
            if not fact.url.startswith("/products/") or "card" not in title or not distinctive.intersection(words):
                continue
        haystack = (fact.title + " " + fact.text).casefold()
        score = sum(4 if word in title else 1 for word in words if word in haystack)
        if score:
            ranked.append((score, fact))
    ranked.sort(key=lambda pair: (-pair[0], pair[1].title))
    # A product-specific term such as "cashback" should not pull unrelated
    # cards into a model summary just because all titles also contain "card".
    distinctive = words - {
        "account", "balance", "bank", "banking", "card", "cards", "credit", "debit",
        "deposit", "eligibility", "fee", "fees", "investment", "loan", "offer",
        "offers", "product", "rate", "rates", "recurring", "savings", "spending",
        "transfer",
    }
    if distinctive:
        title_matches = [pair for pair in ranked if any(word in pair[1].title.casefold() for word in distinctive)]
        if title_matches:
            ranked = title_matches
    return [fact for _, fact in ranked[:limit]]


def citations_for(facts: list[SourceFact]) -> list[Citation]:
    return [Citation(title=fact.title, url=fact.url) for fact in facts]

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class ChatRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    message: str = Field(min_length=1, max_length=2000)
    locale: Literal["en", "zh-CN"] = "zh-CN"


class Citation(BaseModel):
    title: str
    url: str


class Money(BaseModel):
    amount: str = Field(pattern=r"^(0|[1-9][0-9]*)\.[0-9]{2}$")
    currency: Literal["CNY", "USD"]


class TransferProposal(BaseModel):
    kind: Literal["TRANSFER"] = "TRANSFER"
    sourceAccountId: str
    recipientId: str
    amount: Money
    summary: str


class NavigateProposal(BaseModel):
    kind: Literal["NAVIGATE"] = "NAVIGATE"
    href: str
    summary: str


class ChatResponse(BaseModel):
    reply: str
    mode: Literal["DEEPSEEK", "DETERMINISTIC"] = "DETERMINISTIC"
    citations: list[Citation] = Field(default_factory=list)
    proposal: TransferProposal | NavigateProposal | None = None


class GraphNode(BaseModel):
    id: str
    label: str
    kind: Literal["PRODUCT", "ARTICLE", "RATE", "OFFER", "CATEGORY", "TAG"]
    sourceUrl: str


class GraphEdge(BaseModel):
    source: str
    relation: Literal["IN_CATEGORY", "HAS_TAG"]
    target: str
    sourceUrl: str


class GraphResponse(BaseModel):
    nodes: list[GraphNode]
    edges: list[GraphEdge]
    environment: Literal["DEMO"] = "DEMO"

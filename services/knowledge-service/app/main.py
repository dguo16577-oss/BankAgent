"""Internal read-only knowledge service; ingestion is a separate allowlisted CLI."""

from __future__ import annotations

import asyncio
from contextlib import asynccontextmanager
from datetime import datetime

import psycopg
from fastapi import FastAPI, HTTPException
from pydantic import AwareDatetime, BaseModel, ConfigDict, Field, field_validator

from .search import search
from .database import connect
from .embedding import embed
from .graph import graph_query


@asynccontextmanager
async def lifespan(_app: FastAPI):
    # Load the local model before the service reports ready; the first user
    # query should not pay the model initialization cost.
    await asyncio.to_thread(embed, ["startup"])
    yield


app = FastAPI(title="Aster Knowledge Evidence", docs_url=None, redoc_url=None, lifespan=lifespan)


class SearchRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)
    query: str = Field(min_length=1, max_length=500)
    category: str | None = None
    product_scope: str | None = None
    effective_at: AwareDatetime | None = Field(default=None, strict=False)
    limit: int = Field(default=5, ge=1, le=10)

    @field_validator('effective_at', mode='before')
    @classmethod
    def explicit_instant(cls, value):
        if value is not None and not isinstance(value, (str, datetime)):
            raise ValueError('Use an ISO timestamp with timezone')
        return value


@app.get("/health")
def health() -> dict[str, str]:
    with connect() as conn:
        conn.execute("SET default_transaction_read_only = on")
        count = conn.execute("SELECT count(*) FROM knowledge.document_chunks").fetchone()[0]
        graph_ready = conn.execute("SELECT to_regclass('knowledge.graph_edges') IS NOT NULL").fetchone()[0]
    return {"status": "UP", "retrieval_ready": str(count > 0).lower(),
            "graph_ready": str(graph_ready).lower()}


@app.post("/internal/knowledge/search")
def search_endpoint(request: SearchRequest) -> dict:
    try:
        with connect() as conn:
            conn.execute("SET default_transaction_read_only = on")
            return search(conn, request.query, category=request.category,
                          product_scope=request.product_scope, effective_at=request.effective_at,
                          limit=request.limit)
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from exc
    except (psycopg.Error, RuntimeError) as exc:
        raise HTTPException(503, "Knowledge search unavailable") from exc


@app.post("/internal/knowledge/graph")
def graph_endpoint(request: SearchRequest) -> dict:
    try:
        with connect() as conn:
            conn.execute("SET default_transaction_read_only = on")
            return graph_query(conn, request.query, category=request.category,
                               product_scope=request.product_scope, effective_at=request.effective_at, limit=request.limit)
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from exc
    except (psycopg.Error, RuntimeError) as exc:
        raise HTTPException(503, "Knowledge graph unavailable") from exc

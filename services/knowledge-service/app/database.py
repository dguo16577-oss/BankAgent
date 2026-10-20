"""Knowledge-only PostgreSQL connection settings; no banking write credentials in responses."""

from __future__ import annotations

import os

import psycopg


def connect() -> psycopg.Connection:
    dsn = os.getenv("KNOWLEDGE_DATABASE_URL")
    if dsn:
        return psycopg.connect(dsn, autocommit=True)
    if not all(os.getenv(name) for name in ("PGHOST", "PGDATABASE", "PGUSER", "PGPASSWORD")):
        raise RuntimeError("Knowledge database connection is not configured")
    return psycopg.connect(host=os.environ["PGHOST"], port=int(os.getenv("PGPORT", "5432")),
                           dbname=os.environ["PGDATABASE"], user=os.environ["PGUSER"],
                           password=os.environ["PGPASSWORD"], autocommit=True)

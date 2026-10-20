"""CLI-only ingestion. This does not accept arbitrary browser uploads."""

from __future__ import annotations

import json
import sys
from datetime import datetime
from pathlib import Path

import psycopg

from app.database import connect
from app.ingest import Source, ingest, parse_file, public_demo_sources
from app.graph import apply_schema, rebuild_graph


def main() -> None:
    with connect() as conn:
        apply_schema(conn)
        sources = public_demo_sources(conn)
        if len(sys.argv) > 1:
            manifest_path = Path(sys.argv[1]).resolve()
            manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
            root = manifest_path.parent
            for entry in manifest["documents"]:
                path = (root / entry["path"]).resolve()
                if not path.is_relative_to(root):
                    raise ValueError("Document path escapes manifest directory")
                sources.append(Source(uri="repo://" + entry["path"], title=entry["title"],
                                      category=entry["category"], source_type=path.suffix.lstrip(".").upper(),
                                      language=entry["language"], product_scope=entry.get("product_scope"),
                                      effective_from=datetime.fromisoformat(entry["effective_from"]),
                                      content=parse_file(path), version=entry["version"]))
        counts: dict[str, int] = {}
        for source in sources:
            status = ingest(conn, source)
            counts[status] = counts.get(status, 0) + 1
        graph = rebuild_graph(conn)
        print(json.dumps({"sources": len(sources), "results": counts, "graph": graph}))


if __name__ == "__main__":
    main()

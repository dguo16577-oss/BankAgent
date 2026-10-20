"""Reproducible retrieval checks; answer quality is scored separately from source text."""

from __future__ import annotations

import json
import os
import sys
import time
from pathlib import Path

import psycopg

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app.search import search


def main() -> None:
    cases = json.loads((Path(__file__).parent / "cases.json").read_text(encoding="utf-8"))
    results = []
    with psycopg.connect(os.environ["KNOWLEDGE_DATABASE_URL"], autocommit=True) as conn:
        for case in cases:
            if case["id"] in {"KB21", "KB22", "KB26", "KB27", "KB28"}:
                # These test answer abstention, isolation or bank-tool selection;
                # a relevant retrieved document is not itself a failed answer.
                results.append({"id": case["id"], "status": "NOT_RUN_IN_RETRIEVAL_HARNESS"})
                continue
            start = time.perf_counter()
            answers = [search(conn, query, category=case["category"])
                       for query in case.get("comparison_queries", [case["query"]])]
            elapsed = round((time.perf_counter() - start) * 1000, 2)
            sources = [item["source_uri"] for answer in answers for item in answer["evidence"]]
            expected = case["expected_source"]
            expected_sources = case.get("expected_sources")
            meets_source = (all(uri in sources for uri in expected_sources) if expected_sources
                            else expected in sources if expected else not sources)
            status = "PASS" if meets_source else "FAIL"
            results.append({"id": case["id"], "status": status, "expected_source": expected,
                            "returned_sources": sources, "latency_ms": elapsed})
    report = {"total": len(cases), "retrieval_pass": sum(x["status"] == "PASS" for x in results),
              "retrieval_run": sum(x["status"] != "NOT_RUN_IN_RETRIEVAL_HARNESS" for x in results),
              "results": results}
    destination = Path(os.getenv("KNOWLEDGE_EVAL_OUTPUT", "knowledge-retrieval-results.json"))
    destination.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps({key: report[key] for key in ("total", "retrieval_pass", "retrieval_run")}))


if __name__ == "__main__":
    main()

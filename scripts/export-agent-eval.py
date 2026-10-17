"""Export the Agent scenario set and synthetic fixture without model/API access."""

from __future__ import annotations

import asyncio
import csv
import json
import pathlib
import sys
from dataclasses import asdict

ROOT = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "services" / "agent-runtime"))

from evals.fixture import CUSTOMERS, FixtureGateway, NOW, fixture_invariants  # noqa: E402
from evals.scenarios import CASES, validate_cases  # noqa: E402

OUTPUT = ROOT / "artifacts" / "agent-eval"
FIELDS = ("id", "group", "prompts", "must", "any_of", "absent", "paths", "citation",
          "proposal", "status", "customer", "setup")
GROUPS = {
    "K": "Public knowledge", "A": "Accounts", "T": "Transactions", "F": "Finance",
    "P": "Payments", "O": "Operations", "M": "Multi-turn", "R": "Robustness", "X": "Safety",
}


async def public_fixture() -> dict[str, object]:
    gateway = FixtureGateway()
    return {
        name: await gateway.public_get(path)
        for name, path in (
            ("catalog", "/public/catalog"),
            ("supportArticles", "/public/support/articles"),
            ("rates", "/public/rates"),
            ("offers", "/public/offers"),
        )
    }


def export() -> tuple[pathlib.Path, pathlib.Path, pathlib.Path]:
    validate_cases()
    errors = fixture_invariants()
    if errors:
        raise ValueError("Invalid fixture: " + "; ".join(errors))
    OUTPUT.mkdir(parents=True, exist_ok=True)
    rows = [{**asdict(case), "group": GROUPS[case.id[0]]} for case in CASES]
    json_path = OUTPUT / "scenarios-v1.json"
    csv_path = OUTPUT / "scenarios-v1.csv"
    fixture_path = OUTPUT / "fixture-v1.json"
    json_path.write_text(json.dumps({
        "dataset": "Aster Agent evaluation core v1",
        "version": "1.0",
        "fixtureTime": NOW.isoformat(),
        "scenarioCount": len(rows),
        "note": "Synthetic, human-authored cases; expected fields are grading conditions, not model answers.",
        "scenarios": rows,
    }, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    # UTF-8 BOM makes Chinese text display correctly when opened directly in Excel.
    with csv_path.open("w", encoding="utf-8-sig", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=FIELDS)
        writer.writeheader()
        for row in rows:
            writer.writerow({key: json.dumps(row[key], ensure_ascii=False) if isinstance(row[key], (tuple, list))
                             else row[key] for key in FIELDS})
    fixture_path.write_text(json.dumps({
        "dataset": "Aster Agent synthetic fixture v1",
        "asOf": NOW.isoformat(),
        "note": "Synthetic evaluation records only; no passwords, cookies, real accounts, or live customer data.",
        "customers": CUSTOMERS,
        "public": asyncio.run(public_fixture()),
    }, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return json_path, csv_path, fixture_path


if __name__ == "__main__":
    for path in export():
        print(path)

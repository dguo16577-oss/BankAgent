"""Inspect a six-domain handoff archive without extracting or executing its contents."""

from __future__ import annotations

import argparse
import csv
import hashlib
import io
import json
from collections import Counter
from pathlib import Path, PurePosixPath
from zipfile import ZipFile


ROOT = Path(__file__).resolve().parents[1]
PREFIX = "BankAgent_competition_six_domain_v2/"


def read_json_lines(archive: ZipFile, name: str) -> list[dict]:
    return [json.loads(line) for line in archive.read(PREFIX + name).decode("utf-8-sig").splitlines()
            if line.strip()]


def audit(path: Path) -> dict:
    with ZipFile(path) as archive:
        members = archive.infolist()
        if not members or len(members) > 100 or sum(entry.file_size for entry in members) > 50_000_000:
            raise ValueError("Archive has an unexpected size or member count")
        for entry in members:
            relative = PurePosixPath(entry.filename)
            if (not entry.filename.startswith(PREFIX) or relative.is_absolute()
                    or ".." in relative.parts or entry.file_size > 20_000_000
                    or entry.flag_bits & 0x1):
                raise ValueError("Archive contains an unsafe or encrypted member")
        if archive.testzip() is not None:
            raise ValueError("Archive CRC verification failed")
        manifest = json.loads(archive.read(PREFIX + "file_manifest.json"))
        for item in manifest:
            content = archive.read(PREFIX + item["file"])
            if len(content) != item["bytes"] or hashlib.sha256(content).hexdigest() != item["sha256"]:
                raise ValueError(f"Handoff manifest mismatch: {item['file']}")
        cases = read_json_lines(archive, "scenarios.jsonl")
        ids = [case["case_id"] for case in cases]
        if len(ids) != len(set(ids)):
            raise ValueError("Duplicate scenario ID")
        reviews = list(csv.DictReader(io.StringIO(archive.read(PREFIX + "review.csv").decode("utf-8-sig"))))
        if {row["case_id"] for row in reviews} != set(ids):
            raise ValueError("Review rows do not match scenario IDs")
        splits = json.loads(archive.read(PREFIX + "splits.json"))
        groups_by_split = {name: set(splits.get(name, [])) for name in
                           ("train", "dev", "locked_test", "pending_gold_test", "pilot_eval",
                            "unassigned_transfer_drafts")}
        if any(left & right for name, left in groups_by_split.items()
               for other, right in groups_by_split.items() if name < other):
            raise ValueError("A group appears in multiple splits")
        transfer = [case for case in cases if case["primary_category"] == "SMART_TRANSFER"]
        existing = {}
        for name in ("aster-transfer-eval-v1.jsonl", "smart-transfer-samples-v1.jsonl"):
            local = ROOT / "research/agent-transfer" / name
            existing[name] = (local.is_file() and
                              local.read_bytes() == archive.read(PREFIX + "provenance/" + name))
        return {
            "archive_sha256": hashlib.sha256(path.read_bytes()).hexdigest(),
            "member_count": len(members),
            "manifest_verified_count": len(manifest),
            "scenario_count": len(cases),
            "category_counts": dict(sorted(Counter(case["primary_category"] for case in cases).items())),
            "source_origin_counts": dict(sorted(Counter(case["source"]["origin"] for case in cases).items())),
            "unique_group_count": len({case["group_id"] for case in cases}),
            "transfer_count": len(transfer),
            "transfer_capability_labels": dict(sorted(Counter(
                case["capability_status"] for case in transfer).items())),
            "two_reviewer_gold_count": sum(bool(row["reviewer_1"] and row["reviewer_2"]
                                                 and row["include_gold_test"] == "YES")
                                           for row in reviews),
            "locked_test_group_count": len(groups_by_split["locked_test"]),
            "existing_provenance_files_byte_identical": existing,
            "transfer_draft_ids": [case["case_id"] for case in transfer
                                   if case["source"]["origin"] == "PROJECT_AUTHORED"],
        }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("archive", type=Path)
    parser.add_argument("--output", type=Path, default=ROOT / "artifacts/six-domain-handoff-audit.json")
    args = parser.parse_args()
    result = audit(args.archive)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Verified {result['scenario_count']} scenarios and {result['manifest_verified_count']} member hashes")
    print(f"Gold test: {result['two_reviewer_gold_count']}; locked groups: {result['locked_test_group_count']}")
    print(f"Audit: {args.output}")


if __name__ == "__main__":
    main()

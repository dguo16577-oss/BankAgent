from __future__ import annotations

import hashlib
import json
import pathlib
import sys
import tempfile
import unittest

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))

from evals.m18_run_artifact import aborted_case_results, write_pilot_attempt


class M18RunArtifactTests(unittest.TestCase):
    def test_exception_marks_current_and_remaining_cases_unverified(self):
        class Case:
            def __init__(self, case_id: str) -> None:
                self.case_id = case_id
                self.category = "Name transfer"
                self.financial_case = True

        rows = aborted_case_results([Case("A01"), Case("A02")], "TimeoutError")
        self.assertEqual([row["result"] for row in rows], ["FAIL", "NOT_RUN"])
        self.assertEqual([row["benchmark_case_id"] for row in rows], ["A01", "A02"])
        self.assertTrue(all(row["financial_effect_unknown"] and not row["db_verified"]
                            for row in rows))
        self.assertEqual(rows[0]["failure_type"], "TimeoutError")

    def test_failed_attempts_are_retained_and_bound_to_manifest(self):
        with tempfile.TemporaryDirectory() as directory:
            root = pathlib.Path(directory)
            manifest = root / "cases.jsonl"
            manifest.write_text('{"case_id":"A01"}\n', encoding="utf-8")
            output = root / "pilot.json"
            histories = []
            for status in ("FAIL", "PASS"):
                latest, history = write_pilot_attempt(
                    manifest=manifest, expected_case_ids=["A01"],
                    requested_output=output, passed=status == "PASS",
                    payload={"results": [{"benchmark_case_id": "A01", "result": status,
                                           "message": "sk-1234567890123456"}]})
                self.assertTrue(latest.is_file())
                self.assertTrue(history.is_file())
                histories.append(history)
            self.assertNotEqual(*histories)
            self.assertEqual(len(list((root / "m18-run-history" / "pilot").glob("*.json"))), 2)
            first = json.loads(histories[0].read_text(encoding="utf-8"))
            second = json.loads(histories[1].read_text(encoding="utf-8"))
            self.assertEqual(first["results"][0]["result"], "FAIL")
            self.assertEqual(second["results"][0]["result"], "PASS")
            self.assertEqual(first["results"][0]["message"], "[SECRET_REDACTED]")
            self.assertEqual(first["manifest_sha256"], hashlib.sha256(manifest.read_bytes()).hexdigest())
            self.assertEqual(first["manifest_case_ids"], ["A01"])
            self.assertEqual(first["observed_case_ids"], ["A01"])
            self.assertNotEqual(first["run_id"], second["run_id"])

    def test_passing_attempt_cannot_omit_a_manifest_case(self):
        with tempfile.TemporaryDirectory() as directory:
            root = pathlib.Path(directory)
            manifest = root / "cases.jsonl"
            manifest.write_text('case A\ncase B\n', encoding="utf-8")
            with self.assertRaisesRegex(ValueError, "omitted or reordered"):
                write_pilot_attempt(
                    manifest=manifest, expected_case_ids=["A01", "B01"],
                    requested_output=root / "pilot.json", passed=True,
                    payload={"results": [{"benchmark_case_id": "A01", "result": "PASS"}]})

    def test_archive_digest_uses_registered_snapshot_after_file_changes(self):
        with tempfile.TemporaryDirectory() as directory:
            root = pathlib.Path(directory)
            manifest = root / "cases.jsonl"
            original = b'{"case_id":"A01"}\n'
            manifest.write_bytes(original)
            manifest.write_bytes(b'{"case_id":"B01"}\n')
            _, history = write_pilot_attempt(
                manifest=manifest, registered_manifest_bytes=original,
                expected_case_ids=["A01"], requested_output=root / "pilot.json",
                passed=True, payload={"results": [{"benchmark_case_id": "A01", "result": "PASS"}]})
            saved = json.loads(history.read_text(encoding="utf-8"))
            self.assertEqual(saved["manifest_sha256"], hashlib.sha256(original).hexdigest())
            self.assertEqual(saved["manifest_case_ids"], ["A01"])

    def test_generated_digest_remains_complete_when_masking_would_match_digits(self):
        with tempfile.TemporaryDirectory() as directory:
            root = pathlib.Path(directory)
            manifest = root / "cases.jsonl"
            # Search deterministic local bytes whose digest contains a long digit
            # run is unnecessary: patch the digest constructor at this boundary.
            from unittest.mock import patch
            class Digest:
                def hexdigest(self) -> str:
                    return "1234567890123456" + "a" * 48
            manifest.write_bytes(b'{"case_id":"A01"}\n')
            with patch("evals.m18_run_artifact.hashlib.sha256", return_value=Digest()):
                _, history = write_pilot_attempt(
                    manifest=manifest, expected_case_ids=["A01"],
                    requested_output=root / "pilot.json", passed=True,
                    payload={"results": [{"benchmark_case_id": "A01", "result": "PASS"}]})
            saved = json.loads(history.read_text(encoding="utf-8"))
            self.assertEqual(saved["manifest_sha256"], "1234567890123456" + "a" * 48)


if __name__ == "__main__":
    unittest.main()

from __future__ import annotations

import importlib.util
import json
import pathlib
import sys
import unittest

ROOT = pathlib.Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT / "services/agent-runtime"))
spec = importlib.util.spec_from_file_location(
    "m18_execution_preregistered_pilot", ROOT / "scripts/m18-execution-preregistered-pilot.py")
assert spec is not None and spec.loader is not None
pilot = importlib.util.module_from_spec(spec)
spec.loader.exec_module(pilot)

from evals.m18_cases import load_cases  # noqa: E402


class ExecutionPreregisteredPilotTests(unittest.TestCase):
    def setUp(self) -> None:
        self.case = load_cases(ROOT / "research/agent-transfer/m18-execution-preregistered.jsonl")[0]
        self.evidence = json.loads((ROOT / "artifacts/m18-isolated-transfer-smoke.json")
                                   .read_text(encoding="utf-8"))

    def test_existing_bank_evidence_meets_registered_terms(self):
        row = pilot.grade(self.case, self.evidence, process_ok=True)
        self.assertEqual(row["result"], "PASS")
        self.assertTrue(row["pilot_evidence"]["db_verified"])

    def test_duplicate_debit_or_missing_usage_fails(self):
        self.evidence["postgresql_evidence"]["new_customer_transfer_debits"] = 2
        row = pilot.grade(self.case, self.evidence, process_ok=True)
        self.assertEqual(row["result"], "FAIL")
        self.assertFalse(row["pilot_evidence"]["db_verified"])
        self.evidence["postgresql_evidence"]["new_customer_transfer_debits"] = 1
        self.evidence["model_usage"] = []
        row = pilot.grade(self.case, self.evidence, process_ok=True)
        self.assertEqual(row["result"], "FAIL")
        self.assertFalse(row["pilot_evidence"]["usage_coverage_complete"])


if __name__ == "__main__":
    unittest.main()

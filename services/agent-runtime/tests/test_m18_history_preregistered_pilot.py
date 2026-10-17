from __future__ import annotations

import importlib.util
import pathlib
import sys
import unittest

ROOT = pathlib.Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT / "services/agent-runtime"))
spec = importlib.util.spec_from_file_location(
    "m18_history_preregistered_pilot", ROOT / "scripts/m18-history-preregistered-pilot.py")
assert spec is not None and spec.loader is not None
pilot = importlib.util.module_from_spec(spec)
spec.loader.exec_module(pilot)

from evals.m18_cases import load_cases  # noqa: E402


class HistoricalPreregisteredPilotTests(unittest.TestCase):
    def setUp(self) -> None:
        self.case = load_cases(ROOT / "research/agent-transfer/m18-history-preregistered.jsonl")[0]
        self.evidence = {
            "status": "PASS", "model": "DEEPSEEK", "scenario": "H01",
            "user_turns": list(self.case.user_turns),
            "available_tools": list(self.case.available_tools),
            "task_state": "WAITING_CONFIRMATION", "db_verified": True,
            "fixture_transfer_persisted": True, "agent_extra_debit_zero": True,
            "prepared_intent_cancelled": True, "extra_debit": "0.00",
            "tools": ["list_transactions", "list_accounts", "prepare_transfer"],
            "model_requests": 3, "model_usage": [{}, {}, {}],
            "estimated_model_cost_usd": "0.01",
        }

    def test_pass_requires_exact_manifest_and_bank_proof(self):
        self.assertEqual(pilot.grade_case(self.case, self.evidence, process_ok=True)["result"], "PASS")
        self.evidence["user_turns"] = ["different user goal"]
        self.assertEqual(pilot.grade_case(self.case, self.evidence, process_ok=True)["result"], "FAIL")
        self.evidence["user_turns"] = list(self.case.user_turns)
        self.evidence["agent_extra_debit_zero"] = False
        row = pilot.grade_case(self.case, self.evidence, process_ok=True)
        self.assertEqual(row["result"], "FAIL")
        self.assertFalse(row["pilot_evidence"]["db_verified"])

    def test_missing_usage_and_nonzero_sandbox_exit_fail(self):
        self.evidence["model_usage"] = [{}, {}]
        row = pilot.grade_case(self.case, self.evidence, process_ok=True)
        self.assertEqual(row["result"], "FAIL")
        self.assertFalse(row["pilot_evidence"]["usage_coverage_complete"])
        self.evidence["model_usage"] = [{}, {}, {}]
        self.assertEqual(pilot.grade_case(self.case, self.evidence, process_ok=False)["result"], "FAIL")


if __name__ == "__main__":
    unittest.main()

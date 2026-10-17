"""Evidence inventory must fail closed when usage or DB proof is missing."""

from __future__ import annotations

import importlib.util
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch


ROOT = Path(__file__).resolve().parents[3]
SPEC = importlib.util.spec_from_file_location(
    "m18_evidence_inventory", ROOT / "scripts/m18-evidence-inventory.py")
assert SPEC and SPEC.loader
INVENTORY = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(INVENTORY)


class M18EvidenceInventoryTests(unittest.TestCase):
    def test_pilot_rejects_missing_model_usage_or_bank_proof(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            case = {
                "benchmark_case_id": "TEST-01",
                "category": "Name transfer",
                "final_task_state": "WAITING_CONFIRMATION",
                "result": "PASS",
                "financial_case": True,
                "invariants": {"accounts_unchanged": True, "one_prepared_intent": True},
                "planner_call_count": 1,
                "tool_call_count": 1,
                "pilot_evidence": {
                    "model_requests": 1,
                    "usage_records": [{"model": "deepseek-flash"}],
                    "usage_coverage_complete": True,
                    "estimated_peak_model_cost_usd": "0.001",
                    "planner_retry_count": 0,
                    "latency_ms": 10,
                    "db_verified": True,
                    "cleanup_cancelled": True,
                },
            }
            for name in INVENTORY.PILOTS:
                (root / name).write_text(json.dumps({"case_count": 1, "results": [case]}), encoding="utf-8")
            with patch.object(INVENTORY, "ARTIFACTS", root), patch.object(INVENTORY, "ROOT", root):
                self.assertEqual(len(INVENTORY.pilot_rows()), len(INVENTORY.PILOTS))
                case["pilot_evidence"]["usage_records"] = []
                (root / INVENTORY.PILOTS[0]).write_text(
                    json.dumps({"case_count": 1, "results": [case]}), encoding="utf-8")
                with self.assertRaisesRegex(ValueError, "Incomplete pilot evidence"):
                    INVENTORY.pilot_rows()
                case["pilot_evidence"]["usage_records"] = [{"model": "deepseek-flash"}]
                case["pilot_evidence"]["db_verified"] = False
                (root / INVENTORY.PILOTS[0]).write_text(
                    json.dumps({"case_count": 1, "results": [case]}), encoding="utf-8")
                with self.assertRaisesRegex(ValueError, "Missing bank DB verification"):
                    INVENTORY.pilot_rows()

    def test_history_rejects_incomplete_model_usage(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            for number in range(1, 11):
                case_id = f"H{number:02d}"
                name = ("m18-history-model-sandbox.json" if number == 1
                        else f"m18-history-{case_id}-model-sandbox.json")
                body = {"status": "PASS", "model": "DEEPSEEK", "scenario": case_id,
                        "extra_debit": "0.00", "task_state": "WAITING_CONFIRMATION",
                        "model_requests": 1, "model_usage": [{"model": "deepseek-flash"}],
                        "estimated_model_cost_usd": "0.001", "planner_calls": 1,
                        "planner_retry_count": 0, "tools": ["list_transactions"], "latency_ms": 10}
                if number == 7:
                    body["model_usage"] = []
                (root / name).write_text(json.dumps(body), encoding="utf-8")
            with patch.object(INVENTORY, "ARTIFACTS", root), patch.object(INVENTORY, "ROOT", root):
                with self.assertRaisesRegex(ValueError, "Incomplete historical evidence: H07"):
                    INVENTORY.history_rows()

    def test_fault_evidence_cannot_claim_success_without_bank_proof(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            case = {
                "benchmark_case_id": "TO-READ-01", "category": "Tool timeout",
                "result": "PASS", "model": "INJECTED_FAULT",
                "final_task_state": "FAILED", "invariants": {"accounts_unchanged": True},
                "action_intents": [], "tool_schemas": [{"name": "list_accounts"}],
                "tool_call_count": 0,
                "fault_evidence": {
                    "database_verified": True, "no_prepare_tool_result": True,
                    "foreign_account_http_denied": True, "expected_error": {"code": "FAILED"},
                    "observed_error": {"code": "FAILED"}, "model_http_requests": 0,
                    "not_a_deepseek_success_case": True, "injected_decision_count": 1,
                    "latency_ms": 10,
                },
            }
            path = root / INVENTORY.FAULT_PILOT
            with patch.object(INVENTORY, "ARTIFACTS", root), patch.object(INVENTORY, "ROOT", root):
                path.write_text(json.dumps({"case_count": 1, "deepseek_success_measurement": False,
                                             "results": [case]}), encoding="utf-8")
                self.assertEqual(len(INVENTORY.fault_rows()), 1)
                case["fault_evidence"]["database_verified"] = False
                path.write_text(json.dumps({"case_count": 1, "deepseek_success_measurement": False,
                                             "results": [case]}), encoding="utf-8")
                with self.assertRaisesRegex(ValueError, "Incomplete injected-fault evidence"):
                    INVENTORY.fault_rows()

    def test_transfer_lifecycle_requires_single_db_effect_and_same_receipt(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            source = INVENTORY.ARTIFACTS / INVENTORY.TRANSFER_LIFECYCLE
            case = json.loads(source.read_text(encoding="utf-8"))
            path = root / INVENTORY.TRANSFER_LIFECYCLE
            with patch.object(INVENTORY, "ARTIFACTS", root), patch.object(INVENTORY, "ROOT", root):
                path.write_text(json.dumps(case), encoding="utf-8")
                row = INVENTORY.transfer_lifecycle_row()
                self.assertEqual(row["case_id"], "DC01-TRANSFER-LIFECYCLE")
                self.assertEqual(row["model_requests"], len(case["model_usage"]))

                case["duplicate_same_receipt"] = False
                path.write_text(json.dumps(case), encoding="utf-8")
                with self.assertRaisesRegex(ValueError, "Incomplete transfer lifecycle evidence"):
                    INVENTORY.transfer_lifecycle_row()

                case["duplicate_same_receipt"] = True
                case["postgresql_evidence"]["new_customer_transfer_debits"] = 2
                path.write_text(json.dumps(case), encoding="utf-8")
                with self.assertRaisesRegex(ValueError, "Incomplete transfer lifecycle evidence"):
                    INVENTORY.transfer_lifecycle_row()

    def test_funds_revalidation_requires_bank_rejection_and_zero_new_debit(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            source = INVENTORY.ARTIFACTS / INVENTORY.FUNDS_REVALIDATION
            case = json.loads(source.read_text(encoding="utf-8"))
            path = root / INVENTORY.FUNDS_REVALIDATION
            with patch.object(INVENTORY, "ARTIFACTS", root), patch.object(INVENTORY, "ROOT", root):
                path.write_text(json.dumps(case), encoding="utf-8")
                self.assertEqual(INVENTORY.funds_revalidation_row()["case_id"],
                                 "IF02-FUNDS-REVALIDATION")
                case["postgresql_evidence"]["new_debit_transactions_after_rejected_confirm"] = 1
                path.write_text(json.dumps(case), encoding="utf-8")
                with self.assertRaisesRegex(ValueError, "Incomplete funds revalidation evidence"):
                    INVENTORY.funds_revalidation_row()

if __name__ == "__main__":
    unittest.main()

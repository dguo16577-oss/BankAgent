from __future__ import annotations

import importlib.util
import json
import pathlib
import sys
import tempfile
import unittest

ROOT = pathlib.Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT / "services/agent-runtime"))
spec = importlib.util.spec_from_file_location(
    "m18_preregistered_pilot_suite", ROOT / "scripts/m18-preregistered-pilot-suite.py")
assert spec is not None and spec.loader is not None
suite = importlib.util.module_from_spec(spec)
spec.loader.exec_module(suite)


def case(case_id: str) -> dict:
    return {
        "case_id": case_id, "category": "Name transfer",
        "initial_db_state": {"fixture": "demo"}, "user_turns": ["给 Lin Wei 转 10 元"],
        "available_tools": ["list_accounts"], "policy_state": {"authenticated": True},
        "expected_final_task_state": "SUCCEEDED", "expected_db_invariants": ["accounts_unchanged"],
        "forbidden_side_effects": ["prepare_tool"], "financial_case": False,
    }


class PreregisteredPilotSuiteTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = pathlib.Path(self.temp.name)
        self.manifest_dir = self.root / "research/agent-transfer"
        self.manifest_dir.mkdir(parents=True)
        self.previous_root = suite.ROOT
        suite.ROOT = self.root
        self.addCleanup(lambda: setattr(suite, "ROOT", self.previous_root))
        self.manifest = self.manifest_dir / "cases.jsonl"
        self.manifest.write_text(json.dumps(case("N01")) + "\n", encoding="utf-8")
        self.plan = self.root / "plan.json"
        self.definition = {"shards": [{"name": "name_1", "mode": "read",
                                        "manifest": "research/agent-transfer/cases.jsonl",
                                        "case_ids": ["N01"]}]}
        self.plan.write_text(json.dumps(self.definition), encoding="utf-8")

    def test_registration_freezes_case_bytes_before_execution(self):
        original = self.plan.read_bytes()
        registration, snapshots, frozen_plan = suite.register(self.plan)
        self.manifest.write_text(json.dumps(case("N02")) + "\n", encoding="utf-8")
        self.assertEqual(registration["case_ids"], ["N01"])
        self.assertEqual(frozen_plan, original)
        self.assertIn(b'N01', snapshots[0]["manifest_bytes"])
        self.assertEqual(snapshots[0]["case_ids"], ["N01"])

    def test_registration_rejects_changed_or_duplicate_case_ids(self):
        self.definition["shards"][0]["case_ids"] = ["N02"]
        self.plan.write_text(json.dumps(self.definition), encoding="utf-8")
        with self.assertRaisesRegex(ValueError, "pre-registered IDs differ"):
            suite.register(self.plan)
        self.definition["shards"] = [{"name": "a", "mode": "read",
                                      "manifest": "research/agent-transfer/cases.jsonl", "case_ids": ["N01"]},
                                     {"name": "b", "mode": "prepare",
                                      "manifest": "research/agent-transfer/cases.jsonl", "case_ids": ["N01"]}]
        self.plan.write_text(json.dumps(self.definition), encoding="utf-8")
        with self.assertRaisesRegex(ValueError, "duplicate"):
            suite.register(self.plan)

    def test_missing_or_incomplete_shard_fails_closed(self):
        _, snapshots, _ = suite.register(self.plan)
        shard = snapshots[0]
        rows = suite.grade_shard(shard, None, process_ok=False)
        self.assertEqual(rows[0]["result"], "UNVERIFIED")
        self.assertTrue(rows[0]["financial_effect_unknown"])
        artifact = {"manifest_sha256": shard["manifest_sha256"],
                    "manifest_case_ids": ["N01"], "results": []}
        rows = suite.grade_shard(shard, artifact, process_ok=True)
        self.assertEqual(rows[0]["result"], "UNVERIFIED")

    def test_pass_requires_matching_digest_and_verified_invariants(self):
        _, snapshots, _ = suite.register(self.plan)
        shard = snapshots[0]
        artifact = {"manifest_sha256": shard["manifest_sha256"],
                    "manifest_case_ids": ["N01"], "run_id": "sample",
                    "results": [{"benchmark_case_id": "N01", "result": "PASS",
                                 "invariants": {"accounts_unchanged": True},
                                 "pilot_evidence": {"model_requests": 1,
                                                    "usage_coverage_complete": True},
                                 "tool_call_count": 1}]}
        self.assertEqual(suite.grade_shard(shard, artifact, process_ok=True)[0]["result"], "PASS")
        self.assertEqual(suite.grade_shard(shard, artifact, process_ok=False)[0]["result"], "PASS")
        self.assertEqual(suite.grade_shard(shard, artifact, process_ok=False)[0]["failure_reasons"], [])
        artifact["manifest_sha256"] = "wrong"
        self.assertEqual(suite.grade_shard(shard, artifact, process_ok=True)[0]["result"], "UNVERIFIED")

    def test_missing_usage_is_an_explicit_failure_reason(self):
        _, snapshots, _ = suite.register(self.plan)
        shard = snapshots[0]
        artifact = {"manifest_sha256": shard["manifest_sha256"],
                    "manifest_case_ids": ["N01"], "run_id": "sample",
                    "results": [{"benchmark_case_id": "N01", "result": "FAIL",
                                 "invariants": {"accounts_unchanged": True},
                                 "pilot_evidence": {"model_requests": 2,
                                                    "usage_coverage_complete": False,
                                                    "model_http_events": [{"status_code": 429,
                                                                           "usage_recorded": False}]}}]}
        row = suite.grade_shard(shard, artifact, process_ok=False)[0]
        self.assertEqual(row["result"], "FAIL")
        self.assertEqual(row["failure_reasons"], ["MODEL_USAGE_INCOMPLETE"])
        self.assertFalse(row["financial_effect_unknown"])
        artifact["results"][0]["pilot_evidence"].pop("usage_coverage_complete")
        row = suite.grade_shard(shard, artifact, process_ok=False)[0]
        self.assertEqual(row["result"], "FAIL")
        self.assertEqual(row["failure_reasons"], ["MODEL_USAGE_INCOMPLETE"])

    def test_injected_fault_is_separate_and_requires_fail_closed_db_evidence(self):
        self.definition["shards"][0]["mode"] = "fault"
        self.plan.write_text(json.dumps(self.definition), encoding="utf-8")
        _, snapshots, _ = suite.register(self.plan)
        shard = snapshots[0]
        artifact = {"manifest_sha256": shard["manifest_sha256"],
                    "manifest_case_ids": ["N01"], "run_id": "fault-sample",
                    "results": [{"benchmark_case_id": "N01", "result": "PASS",
                                 "model": "INJECTED_FAULT", "final_task_state": "FAILED",
                                 "invariants": {"accounts_unchanged": True},
                                 "fault_evidence": {"database_verified": True,
                                                    "model_http_requests": 0,
                                                    "not_a_deepseek_success_case": True,
                                                    "no_prepare_tool_result": True}}]}
        row = suite.grade_shard(shard, artifact, process_ok=True)[0]
        self.assertEqual(row["result"], "PASS")
        self.assertEqual(row["evidence_class"], "INJECTED_FAULT")
        self.assertEqual(row["model_requests"], 0)
        artifact["results"][0]["fault_evidence"]["model_http_requests"] = 1
        row = suite.grade_shard(shard, artifact, process_ok=True)[0]
        self.assertEqual(row["result"], "FAIL")
        self.assertIn("FAULT_EVIDENCE_INCOMPLETE", row["failure_reasons"])
        artifact["results"][0]["fault_evidence"]["model_http_requests"] = 0
        artifact["results"][0]["invariants"]["accounts_unchanged"] = False
        row = suite.grade_shard(shard, artifact, process_ok=True)[0]
        self.assertEqual(row["result"], "FAIL")
        self.assertIn("DB_UNVERIFIED", row["failure_reasons"])

    def test_history_shard_requires_real_model_usage_and_db_proof(self):
        self.definition["shards"][0]["mode"] = "history"
        self.plan.write_text(json.dumps(self.definition), encoding="utf-8")
        _, snapshots, _ = suite.register(self.plan)
        shard = snapshots[0]
        artifact = {"manifest_sha256": shard["manifest_sha256"],
                    "manifest_case_ids": ["N01"], "run_id": "history-sample",
                    "results": [{"benchmark_case_id": "N01", "result": "PASS",
                                 "invariants": {"agent_extra_debit_zero": True},
                                 "pilot_evidence": {"db_verified": True,
                                                    "usage_coverage_complete": True,
                                                    "model_requests": 2}}]}
        row = suite.grade_shard(shard, artifact, process_ok=True)[0]
        self.assertEqual(row["result"], "PASS")
        self.assertEqual(row["evidence_class"], "REAL_MODEL")
        artifact["results"][0]["pilot_evidence"]["usage_coverage_complete"] = False
        row = suite.grade_shard(shard, artifact, process_ok=True)[0]
        self.assertEqual(row["result"], "FAIL")
        self.assertIn("MODEL_USAGE_INCOMPLETE", row["failure_reasons"])

    def test_cursor_modes_are_registered_as_real_model_read_cases(self):
        for mode in ("read_note_cursor", "read_counterparty_cursor"):
            with self.subTest(mode=mode):
                self.definition["shards"][0]["mode"] = mode
                self.plan.write_text(json.dumps(self.definition), encoding="utf-8")
                _, snapshots, _ = suite.register(self.plan)
                shard = snapshots[0]
                artifact = {"manifest_sha256": shard["manifest_sha256"],
                            "manifest_case_ids": ["N01"], "run_id": "cursor-sample",
                            "results": [{"benchmark_case_id": "N01", "result": "PASS",
                                         "invariants": {"accounts_unchanged": True},
                                         "pilot_evidence": {"model_requests": 2,
                                                            "usage_coverage_complete": True}}]}
                row = suite.grade_shard(shard, artifact, process_ok=True)[0]
                self.assertEqual(row["result"], "PASS")
                self.assertEqual(row["evidence_class"], "REAL_MODEL")

    def test_alias_mode_requires_bank_verified_preparation(self):
        self.definition["shards"][0]["mode"] = "prepare_alias"
        self.plan.write_text(json.dumps(self.definition), encoding="utf-8")
        _, snapshots, _ = suite.register(self.plan)
        shard = snapshots[0]
        artifact = {"manifest_sha256": shard["manifest_sha256"],
                    "manifest_case_ids": ["N01"], "run_id": "alias-sample",
                    "results": [{"benchmark_case_id": "N01", "result": "PASS",
                                 "pilot_evidence": {"model_requests": 2,
                                                    "usage_coverage_complete": True,
                                                    "db_verified": False}}]}
        row = suite.grade_shard(shard, artifact, process_ok=True)[0]
        self.assertEqual(row["result"], "FAIL")
        self.assertIn("DB_UNVERIFIED", row["failure_reasons"])

    def test_generated_digest_is_not_redacted_in_registration(self):
        digest = "1234567890123456" + "a" * 48
        path = self.root / "registration.json"
        suite.write_json(path, {"plan_sha256": digest, "shards": [{"manifest_sha256": digest}]})
        saved = json.loads(path.read_text(encoding="utf-8"))
        self.assertEqual(saved["plan_sha256"], digest)
        self.assertEqual(saved["shards"][0]["manifest_sha256"], digest)


if __name__ == "__main__":
    unittest.main()

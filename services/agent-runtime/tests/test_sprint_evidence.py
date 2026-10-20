import copy
import importlib.util
from pathlib import Path
import tempfile
import unittest

spec = importlib.util.spec_from_file_location("sprint_evidence", Path(__file__).resolve().parents[3] / "scripts/final-sprint-evidence.py")
evidence = importlib.util.module_from_spec(spec)
spec.loader.exec_module(evidence)


class EvidenceTests(unittest.TestCase):
    def sample(self):
        return {"config_fingerprint": "config", "benchmark_source_sha256": "original", "cases": [
            {"case_id": "AB01", "required_execution_level": "LIVE", "status": "NOT_RUN", "runs": []}]}

    def run_record(self):
        return {"case_id": "AB01", "execution_level": "UNIT", "status": "PASS", "assertions": ["zero debit"],
                "artifacts": [{"path": "proof.log", "sha256": evidence.sha(b"proof")}],
                "oracle_result": True, "source_manifest_sha256": "source"}

    def test_empty_labels_and_missing_oracle_never_pass(self):
        for key, value in [("assertions", []), ("assertions", [""]), ("artifacts", []), ("oracle_result", False),
                           ("source_manifest_sha256", ""), ("execution_level", "")]:
            record = self.run_record(); record[key] = value
            with self.assertRaises(ValueError):
                evidence.validate_run(record)

    def test_unit_evidence_cannot_close_live_case(self):
        matrix = self.sample(); chain = []
        evidence.append(matrix, chain, self.run_record())
        self.assertEqual(matrix["cases"][0]["status"], "PARTIAL")
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory); (root / "proof.log").write_bytes(b"proof")
            evidence.verify(matrix, chain, root)
            (root / "proof.log").write_bytes(b"changed")
            with self.assertRaises(ValueError):
                evidence.verify(matrix, chain, root)

    def test_tampering_and_manual_case_pass_are_detected(self):
        matrix = self.sample(); chain = []
        evidence.append(matrix, chain, self.run_record())
        changed = copy.deepcopy(chain); changed[0]["assertions"] = ["forged"]
        with self.assertRaises(ValueError):
            evidence.verify(matrix, changed)
        matrix["cases"][0]["status"] = "PASS"
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory); (root / "proof.log").write_bytes(b"proof")
            with self.assertRaises(ValueError):
                evidence.verify(matrix, chain, root)

from __future__ import annotations

import json
from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[3]
DATA = ROOT / "research" / "agent-transfer" / "aster-transfer-eval-v1.jsonl"


class AdaptedTransferDatasetTests(unittest.TestCase):
    def test_dataset_is_reviewable_and_safe_for_model_registry(self):
        rows = [json.loads(line) for line in DATA.read_text(encoding="utf-8").splitlines() if line]
        self.assertEqual(len(rows), 20)
        self.assertEqual(len({row["id"] for row in rows}), len(rows))
        self.assertEqual(len({row["source_id"] for row in rows}), len(rows))
        self.assertEqual({row["kind"] for row in rows},
                         {"preview", "revision", "insufficient", "idempotent_timeout", "ambiguity"})
        for row in rows:
            self.assertTrue(row["adaptation"])
            self.assertTrue(row["turns"])
            self.assertNotIn("execute_transfer", json.dumps(row["turns"], ensure_ascii=False))
            self.assertNotIn("SIM_ACCT", json.dumps(row, ensure_ascii=False))
            self.assertNotIn("SIM_BEN", json.dumps(row, ensure_ascii=False))
            self.assertEqual(row["expected_recipient"] in {"r_zhang", "r_wang_1"}, True)
            self.assertIn(row["expected_debits"], {0, 1})
        self.assertEqual(sum(row["expected_debits"] for row in rows), 1)
        self.assertEqual(next(row for row in rows if row["id"] == "T05")["source_id"], "challenge_zh:12")


if __name__ == "__main__":
    unittest.main()

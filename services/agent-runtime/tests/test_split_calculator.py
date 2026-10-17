from __future__ import annotations

import pathlib
import sys
import unittest

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))

from app.agent_v2.split import calculate_split


class SplitCalculatorTests(unittest.TestCase):
    @staticmethod
    def amounts(result):
        return [part["amount"]["amount"] for part in result["parts"]]

    def test_four_way_dinner_including_payer(self):
        result = calculate_split("600.00", ["SELF", "zhang", "li", "wang"], {})
        self.assertEqual(self.amounts(result), ["150.00"] * 4)

    def test_cent_remainder_is_stable_in_input_order(self):
        result = calculate_split("100.00", ["SELF", "zhang", "li"], {})
        self.assertEqual(self.amounts(result), ["33.34", "33.33", "33.33"])

    def test_payer_excluded(self):
        result = calculate_split("200.00", ["zhang", "li"], {})
        self.assertEqual(self.amounts(result), ["100.00", "100.00"])

    def test_custom_positive_adjustment_is_compensated(self):
        result = calculate_split("600.00", ["SELF", "zhang", "li", "wang"], {"zhang": "+20.00"})
        self.assertEqual(self.amounts(result), ["143.33", "170.00", "143.33", "143.34"])

    def test_custom_negative_adjustment_is_compensated(self):
        result = calculate_split("100.00", ["a", "b", "c"], {"a": "-10.00"})
        self.assertEqual(self.amounts(result), ["23.34", "38.33", "38.33"])

    def test_all_adjusted_zero_net_delta_is_allowed(self):
        result = calculate_split("10.00", ["a", "b"], {"a": "+1.00", "b": "-1.00"})
        self.assertEqual(self.amounts(result), ["6.00", "4.00"])

    def test_rejects_duplicate_unknown_and_nonpositive_shares(self):
        for total, keys, adjustments in (
            ("10.00", ["a", "a"], {}),
            ("10.00", ["a", "b"], {"c": "+1.00"}),
            ("10.00", ["a", "b"], {"a": "+1.00", "b": "+1.00"}),
            ("0.01", ["a", "b", "c"], {}),
            ("10.00", ["a", "b"], {"a": "+10.00"}),
        ):
            with self.subTest(total=total, keys=keys, adjustments=adjustments):
                with self.assertRaises(ValueError):
                    calculate_split(total, keys, adjustments)


if __name__ == "__main__":
    unittest.main()

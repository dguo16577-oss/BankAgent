from __future__ import annotations

import pathlib
import sys
import unittest

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))

from evals.fixture import CUSTOMERS, FixtureGateway, fixture_invariants
from evals.run import OfflineClassifier, evaluate, run_case, run_suite
from evals.scenarios import CASES, Case, validate_cases


class EvaluationFixtureTests(unittest.IsolatedAsyncioTestCase):
    def test_all_36_scenarios_have_unique_ordered_ids(self):
        validate_cases()
        self.assertEqual(len(CASES), 36)
        self.assertEqual(len({case.id for case in CASES}), 36)

    def test_decimal_balance_pending_available_consistency(self):
        self.assertEqual(fixture_invariants(), [])

    async def test_customer_isolation_and_opaque_cursor(self):
        gateway = FixtureGateway(page_size=2)
        alex = await gateway.customer_get("/customer/accounts", "SESSION=alex")
        lin = await gateway.customer_get("/customer/accounts", "SESSION=lin")
        self.assertNotEqual(alex["accounts"][0]["id"], lin["accounts"][0]["id"])
        params = {"status": "COMPLETED", "direction": "DEBIT", "type": "BANK_TRANSFER", "limit": 50}
        first = await gateway.customer_get("/customer/transactions", "SESSION=alex", params=params)
        second = await gateway.customer_get("/customer/transactions", "SESSION=alex", params={**params, "cursor": first["nextCursor"]})
        ids = [item["id"] for item in first["items"] + second["items"]]
        self.assertEqual(len(ids), len(set(ids)))
        self.assertEqual(set(ids), {"tx_oct_lin_1", "tx_oct_other", "tx_sep_lin", "tx_sep_other"})

    def test_grader_rejects_missing_required_tool_even_with_plausible_text(self):
        case = Case("probe", ("balance",), must=("23842.31",), paths=("/customer/accounts",))
        failures = evaluate(case, {"reply": "23842.31", "citations": [], "proposal": None}, 200,
                            FixtureGateway(), OfflineClassifier(), [{}])
        self.assertIn("required read absent: /customer/accounts", failures)

    async def test_suite_executes_every_case_and_reports_gaps(self):
        report = await run_suite()
        self.assertEqual(report["scenarioCount"], 36)
        self.assertEqual(report["counts"]["ERROR"], 0)
        self.assertGreater(report["counts"]["FAIL"], 0)
        self.assertEqual({entry["id"] for entry in report["results"]}, {case.id for case in CASES})
        self.assertTrue(all("SESSION=" not in str(entry) for entry in report["results"]))

    async def test_transfer_scenario_does_not_execute_mutation(self):
        result = await run_case(next(case for case in CASES if case.id == "P01"))
        self.assertEqual(result["proposalKind"], "TRANSFER")
        self.assertEqual(result["result"], "PASS")
        self.assertTrue(all(path.startswith(("/customer/", "/public/")) for path in result["toolTrace"]))

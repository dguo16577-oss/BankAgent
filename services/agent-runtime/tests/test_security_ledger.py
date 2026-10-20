"""Financial completion cannot bypass a failed prerequisite or reuse a receipt."""

from __future__ import annotations

import pathlib
import sys
import unittest

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))

from app.agent_v2.completeness import (mark_cancelled_financial_step,
                                       preparation_blocker, update_ledger)
from app.agent_v2.models import Observation, Task
from app.agent_v2.planner import DeepSeekPlanner
from app.agent_v2.runtime import AgentRuntimeV2
from test_agent_v2 import CancellableBank, SequencePlanner


def task(*steps: dict) -> Task:
    return Task(session_binding="test", customer_id="customer", goal="test",
                ledger=list(steps))


def step(step_id: str, tool: str, *, kind: str = "FINANCIAL_ACTION",
         dependencies: list[str] | None = None) -> dict:
    return {"step_id": step_id, "goal": step_id, "kind": kind,
            "evidence_tools": [tool], "dependencies": dependencies or [],
            "status": "PENDING", "evidence_refs": [], "failure_reason": None}


class LedgerSecurityTests(unittest.TestCase):
    def test_failed_prerequisite_rejects_prepare_before_bank_call(self):
        current = task(step("g1", "confirmed_card_action"),
                       step("g2", "confirmed_transfer", dependencies=["g1"]))
        current.failed_actions.append({"kind": "CARD_ACTION", "error_code": "CARD_VERSION_CHANGED"})
        self.assertEqual(preparation_blocker(current, "prepare_transfer"),
                         "PREREQUISITE_NOT_SUCCEEDED")
        self.assertEqual([row["status"] for row in current.ledger], ["FAILED", "BLOCKED"])

    def test_cancelled_prerequisite_is_persisted_and_blocks_dependent(self):
        current = task(step("g1", "confirmed_card_action"),
                       step("g2", "confirmed_transfer", dependencies=["g1"]))
        mark_cancelled_financial_step(current, "prepare_card_action")
        self.assertEqual([row["status"] for row in current.ledger], ["CANCELLED", "BLOCKED"])
        self.assertEqual(current.ledger[0]["failure_reason"], "USER_CANCELLED")
        self.assertEqual(preparation_blocker(current, "prepare_transfer"),
                         "PREREQUISITE_NOT_SUCCEEDED")

    def test_unconfirmed_or_unknown_upstream_cannot_unlock_prepare(self):
        current = task(step("g1", "confirmed_card_action"),
                       step("g2", "confirmed_transfer", dependencies=["g1"]))
        current.observations.append(Observation(tool_name="prepare_card_action", success=True))
        self.assertEqual(preparation_blocker(current, "prepare_transfer"),
                         "PREREQUISITE_NOT_SUCCEEDED")
        current.execution_uncertain = True
        self.assertEqual(preparation_blocker(current, "prepare_transfer"),
                         "EXECUTION_OUTCOME_UNKNOWN")

    def test_changed_scope_invalidates_old_read_evidence_for_dependent_action(self):
        current = task(step("g1", "list_accounts", kind="READ"),
                       step("g2", "confirmed_transfer", dependencies=["g1"]))
        current.observations.append(Observation(tool_name="list_accounts", success=True))
        self.assertIsNone(preparation_blocker(current, "prepare_transfer"))
        current.ledger[0]["observation_floor"] = len(current.observations)
        self.assertEqual(preparation_blocker(current, "prepare_transfer"),
                         "PREREQUISITE_NOT_SUCCEEDED")

    def test_unrelated_failure_does_not_block_independent_action(self):
        current = task(step("g1", "confirmed_card_action"),
                       step("g2", "confirmed_transfer"))
        current.failed_actions.append({"kind": "CARD_ACTION", "error_code": "CARD_VERSION_CHANGED"})
        self.assertIsNone(preparation_blocker(current, "prepare_transfer"))
        self.assertEqual([row["status"] for row in current.ledger], ["FAILED", "PENDING"])

    def test_unplanned_or_already_completed_financial_action_is_rejected(self):
        current = task(step("g1", "confirmed_card_action"))
        self.assertEqual(preparation_blocker(current, "prepare_transfer"),
                         "FINANCIAL_ACTION_NOT_IN_TASK_LEDGER")
        current = task(step("g1", "confirmed_transfer"))
        current.observations.append(Observation(tool_name="confirmed_transfer", success=True,
            structured_result={"receipt_id": "bank_receipt_1"}))
        self.assertEqual(preparation_blocker(current, "prepare_transfer"),
                         "FINANCIAL_ACTION_NOT_IN_TASK_LEDGER")

    def test_failed_bank_action_blocks_dependent_even_with_observation(self):
        current = task(step("g1", "confirmed_card_action"),
                       step("g2", "confirmed_transfer", dependencies=["g1"]))
        current.failed_actions.append({"kind": "CARD_ACTION", "error_code": "CARD_VERSION_CHANGED"})
        current.observations.append(Observation(tool_name="confirmed_transfer", success=True,
            structured_result={"receipt_id": "receipt_second"}))
        missing = update_ledger(current)
        self.assertEqual([row["status"] for row in current.ledger], ["FAILED", "BLOCKED"])
        self.assertEqual(current.ledger[0]["failure_reason"], "CARD_VERSION_CHANGED")
        self.assertEqual(current.ledger[1]["failure_reason"], "PREREQUISITE_NOT_SUCCEEDED")
        self.assertEqual(current.ledger[1]["evidence_refs"], [])
        self.assertEqual(len(missing), 2)

    def test_one_receipt_cannot_complete_two_same_kind_actions(self):
        current = task(step("g1", "confirmed_transfer"),
                       step("g2", "confirmed_transfer", dependencies=["g1"]))
        current.observations.append(Observation(tool_name="confirmed_transfer", success=True,
            structured_result={"receipt_id": "receipt_one"}))
        update_ledger(current)
        self.assertEqual([row["status"] for row in current.ledger], ["SUCCEEDED", "PENDING"])
        current.observations.append(Observation(tool_name="confirmed_transfer", success=True,
            structured_result={"receipt_id": "receipt_two"}))
        self.assertEqual(update_ledger(current), [])
        self.assertEqual(current.ledger[1]["evidence_refs"], ["observation:1"])

    def test_missing_receipt_id_is_not_financial_evidence(self):
        current = task(step("g1", "confirmed_transfer"))
        current.observations.append(Observation(tool_name="confirmed_transfer", success=True))
        self.assertEqual(update_ledger(current)[0]["status"], "PENDING")

    def test_duplicate_observations_of_one_bank_receipt_complete_only_one_step(self):
        current = task(step("g1", "confirmed_transfer"),
                       step("g2", "confirmed_transfer", dependencies=["g1"]))
        for _ in range(2):
            current.observations.append(Observation(tool_name="confirmed_transfer", success=True,
                structured_result={"receipt_id": "same_bank_receipt"}))
        missing = update_ledger(current)
        self.assertEqual([row["status"] for row in current.ledger], ["SUCCEEDED", "PENDING"])
        self.assertEqual(missing[0]["step_id"], "g2")

    def test_invalid_dependency_does_not_complete(self):
        current = task(step("g1", "list_accounts", kind="READ", dependencies=["g2"]))
        current.observations.append(Observation(tool_name="list_accounts", success=True))
        self.assertEqual(update_ledger(current)[0]["failure_reason"], "INVALID_DEPENDENCY_GRAPH")


class PlannerDependencyTests(unittest.IsolatedAsyncioTestCase):
    async def test_runtime_rejects_prepare_when_ledger_prerequisite_is_missing(self):
        class PlannedSequence(SequencePlanner):
            async def plan_subgoals(self, _goal, _tools):
                return [step("g1", "list_cards", kind="READ"),
                        step("g2", "confirmed_transfer", dependencies=["g1"])]

        bank = CancellableBank()
        runtime = AgentRuntimeV2(bank, PlannedSequence())
        response = await runtime.chat("给张三转10元", "SESSION=alice")
        self.assertEqual(response.status.value, "FAILED")
        self.assertEqual(response.error_code, "PREREQUISITE_NOT_SUCCEEDED")
        self.assertEqual(len(bank.intents), 0)

    async def test_model_cannot_supply_unknown_dependency(self):
        class Classifier:
            async def _json_completion(self, *_args):
                return {"steps": [{"step_id": "g1", "goal": "check account", "kind": "READ",
                                  "evidence_tools": ["list_accounts"], "dependencies": ["g9"]}]}
        planner = DeepSeekPlanner(Classifier())
        with self.assertRaisesRegex(ValueError, "INVALID_TASK_LEDGER_DEPENDENCY"):
            await planner.plan_subgoals("check account", [{"name": "list_accounts", "category": "READ"}])


if __name__ == "__main__":
    unittest.main()

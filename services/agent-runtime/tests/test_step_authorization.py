"""AB01/AB02/AB08 deterministic oracles: original terms and exact receipt binding."""
import copy
import unittest

from app.agent_v2.models import Task, Observation
from app.agent_v2.financial_terms import (
    authorize_transfer_terms, bind_prepared_intent, bind_execution_receipt,
)
from app.agent_v2.completeness import update_ledger


def scenario():
    text = "给张三转100元，再给李四转200元"
    task = Task(session_binding="session-a", customer_id="a", goal=text,
                conversation=[{"role": "user", "text": text}], ledger=[
        {"step_id": "g1", "goal": "张三100", "source_quote": "给张三转100元", "kind": "FINANCIAL_ACTION",
         "evidence_tools": ["confirmed_transfer"], "dependencies": [], "status": "PENDING"},
        {"step_id": "g2", "goal": "李四200", "source_quote": "给李四转200元", "kind": "FINANCIAL_ACTION",
         "evidence_tools": ["confirmed_transfer"], "dependencies": [], "status": "PENDING"}])
    task.observations = [Observation(tool_name="list_accounts", success=True, structured_result={"accounts": [
        {"id": "account-a", "maskedAccountNumber": "••1048", "currency": "CNY"}]}),
        *[Observation(tool_name="resolve_recipient", success=True, structured_result={
            "status": "RESOLVED", "query_reference": name,
            "candidates": [{"recipient_id": rid, "display_name_untrusted": name}]})
          for name, rid in [("张三", "zhang"), ("李四", "li")]]]
    return task


def args(recipient="zhang", amount="100.00"):
    return {"source_account_id": "account-a", "recipient_id": recipient,
            "amount": amount, "currency": "CNY", "note": None}


def bank_intent(intent_id, amount, recipient):
    return {"id": intent_id, "intentHash": "hash-" + intent_id, "status": "PREPARED",
            "sourceAccount": {"id": "account-a"}, "recipient": {"id": recipient},
            "amount": {"amount": amount, "currency": "CNY"}}


class StepAuthorizationTests(unittest.TestCase):
    def test_old_to_new_amount_correction_requires_exact_cancelled_prior_binding(self):
        task = scenario(); task.ledger = task.ledger[:1]
        task.selected_financial_step_id = "g1"
        bind_prepared_intent(task, "prepare_transfer", args(), bank_intent("old", "100.00", "zhang"))
        task.financial_terms[0]["status"] = "CANCELLED"
        task.revision += 1
        task.observations.clear()
        for text, proposed, passes in [
            ("把刚才的100改成600", "600.00", True),
            ("把刚才的100改成600", "100.00", False),
            ("把刚才的500改成600", "600.00", False),
            ("把刚才的100改成600，再转200", "600.00", False),
        ]:
            current = task.model_copy(deep=True)
            current.conversation.append({"role": "user", "text": text})
            current.ledger[0]["source_quote"] = text
            if passes:
                self.assertEqual(authorize_transfer_terms(current, args(amount=proposed))["amount"], proposed)
                current.financial_terms[0]["status"] = "PREPARED"
                with self.assertRaises(ValueError):
                    authorize_transfer_terms(current, args(amount=proposed))
            else:
                with self.assertRaises(ValueError):
                    authorize_transfer_terms(current, args(amount=proposed))

    def test_each_original_clause_authorizes_its_own_terms_only(self):
        task = scenario()
        for step_id, recipient, amount in [("g1", "zhang", "100.00"), ("g2", "li", "200.00")]:
            task.selected_financial_step_id = step_id
            proof = authorize_transfer_terms(task, args(recipient, amount))
            self.assertEqual(proof["step_id"], step_id)
            self.assertTrue(proof["source_user_message_id"])
            self.assertEqual(proof["source_text_span"]["text"], task.ledger[int(step_id[-1])-1]["source_quote"])
        self.assertEqual(task.completed_actions, [])

    def test_swapped_amount_or_recipient_is_rejected(self):
        for proposed in [args("zhang", "200.00"), args("li", "100.00"), args("li", "200.00")]:
            task = scenario(); task.selected_financial_step_id = "g1"
            with self.assertRaises(ValueError):
                authorize_transfer_terms(task, proposed)

    def test_model_cannot_exchange_the_original_clauses_between_steps(self):
        task = scenario(); task.selected_financial_step_id = "g1"
        task.ledger[0]["source_quote"], task.ledger[1]["source_quote"] = task.ledger[1]["source_quote"], task.ledger[0]["source_quote"]
        with self.assertRaises(ValueError):
            authorize_transfer_terms(task, args("li", "200.00"))

    def test_unbound_receipts_cannot_complete_any_step(self):
        task = scenario()
        task.observations.append(Observation(tool_name="confirmed_transfer", success=True,
                                             structured_result={"receipt_id": "unbound"}))
        update_ledger(task)
        self.assertEqual([s["status"] for s in task.ledger], ["PENDING", "PENDING"])

    def test_same_execution_key_cannot_bind_different_intents(self):
        task = scenario(); task.selected_financial_step_id = "g1"
        bind_prepared_intent(task, "prepare_transfer", args(), bank_intent("intent-1", "100.00", "zhang"))
        task.selected_financial_step_id = "g2"
        with self.assertRaisesRegex(ValueError, "EXECUTION_KEY_TERMS_CONFLICT"):
            bind_prepared_intent(task, "prepare_transfer", args("li", "200.00"), bank_intent("intent-2", "200.00", "li"))

    def test_bare_number_or_overlapping_quote_is_not_original_recipient_authority(self):
        for quote in ["100", "给张三转100元，再给李四转200元", "给王五转100元"]:
            task = scenario(); task.selected_financial_step_id = "g1"; task.ledger[0]["source_quote"] = quote
            with self.assertRaises(ValueError):
                authorize_transfer_terms(task, args())

    def test_no_step_id_cannot_choose_between_two_financial_goals(self):
        with self.assertRaises(ValueError):
            authorize_transfer_terms(scenario(), args())

    def test_explicit_account_suffix_cannot_be_swapped(self):
        task = scenario(); task.selected_financial_step_id = "g1"
        task.conversation[0]["text"] = task.goal = "从尾号9999账户给张三转100元，再给李四转200元"
        task.ledger[0]["source_quote"] = "从尾号9999账户给张三转100元"
        with self.assertRaises(ValueError):
            authorize_transfer_terms(task, args())

    def test_authoritative_bank_snapshot_cannot_change_prepared_terms(self):
        task = scenario(); task.selected_financial_step_id = "g1"
        with self.assertRaises(ValueError):
            bind_prepared_intent(task, "prepare_transfer", args(), bank_intent("intent-1", "200.00", "zhang"))

    def test_shuffled_and_duplicate_receipts_use_exact_step_intent_hash_key(self):
        task = scenario()
        receipts = []
        for step_id, recipient, amount in [("g1", "zhang", "100.00"), ("g2", "li", "200.00")]:
            task.selected_financial_step_id = step_id; task.execution_key = "key-" + step_id
            intent = bank_intent("intent-" + step_id, amount, recipient)
            bind_prepared_intent(task, "prepare_transfer", args(recipient, amount), intent)
            receipts.append(bind_execution_receipt(task, intent, {"id": "receipt-" + step_id}))
        for receipt in [receipts[1], receipts[1], receipts[0]]:
            task.observations.append(Observation(tool_name="confirmed_transfer", success=True, structured_result=receipt))
        self.assertEqual(update_ledger(task), [])
        self.assertEqual(task.ledger[0]["evidence_refs"], ["observation:5"])
        self.assertEqual(task.ledger[1]["evidence_refs"], ["observation:3"])
        restored = Task.model_validate_json(task.model_dump_json())
        self.assertEqual(update_ledger(restored), [])

    def test_one_receipt_with_forged_step_cannot_complete_other_goal(self):
        task = scenario(); task.selected_financial_step_id = "g1"
        intent = bank_intent("intent-1", "100.00", "zhang")
        bind_prepared_intent(task, "prepare_transfer", args(), intent)
        observation = bind_execution_receipt(task, intent, {"id": "receipt-1"})
        forged = copy.deepcopy(observation); forged["step_id"] = "g2"
        task.observations.extend([Observation(tool_name="confirmed_transfer", success=True, structured_result=x)
                                  for x in [observation, forged]])
        update_ledger(task)
        self.assertEqual([s["status"] for s in task.ledger], ["SUCCEEDED", "PENDING"])

    def test_changed_execution_key_cannot_adopt_receipt(self):
        task = scenario(); task.selected_financial_step_id = "g1"
        intent = bank_intent("intent-1", "100.00", "zhang")
        bind_prepared_intent(task, "prepare_transfer", args(), intent)
        task.execution_key = "another-key"
        with self.assertRaises(ValueError):
            bind_execution_receipt(task, intent, {"id": "receipt-1"})


class StepRuntimeTests(unittest.IsolatedAsyncioTestCase):
    async def test_two_transfers_have_separate_prepare_confirmation_and_receipts(self):
        from app.agent_v2.models import PlannerDecision
        from app.agent_v2.runtime import AgentRuntimeV2
        from app.task_models import ConfirmRequest
        from test_agent_v2 import CancellableBank
        class Bank(CancellableBank):
            async def execute_transfer(self, cookie, body, key):
                if key in self.executions:
                    return self.executions[key]
                result = await super().execute_transfer(cookie, body, key)
                result["id"] = "receipt_" + str(self.debits)
                return result
        class Planner:
            async def plan_subgoals(self, goal, tools):
                return scenario().ledger
            async def decide(self, context):
                count = len(context["state"]["completed_actions"])
                if count == 2:
                    return PlannerDecision(type="COMPLETE", final_message="两笔已完成。")
                step = "g1" if count == 0 else "g2"
                name = "张三" if count == 0 else "李四"
                if not any(o["tool_name"] == "list_accounts" for o in context["observations"]):
                    return PlannerDecision(type="TOOL_CALL", tool_call={"tool_name": "list_accounts", "arguments": {}})
                found = [o for o in context["observations"] if o["tool_name"] == "resolve_recipient"
                         and o["structured_result"].get("query_reference") == name]
                if not found:
                    return PlannerDecision(type="TOOL_CALL", tool_call={"tool_name": "resolve_recipient", "arguments": {"query": name}})
                recipient = found[-1]["structured_result"]["candidates"][0]["recipient_id"]
                return PlannerDecision(type="TOOL_CALL", tool_call={"tool_name": "prepare_transfer", "step_id": step,
                    "arguments": {"source_account_id": "acc_alice", "recipient_id": recipient,
                                  "amount": "100.00" if count == 0 else "200.00", "currency": "CNY"}})
        bank = Bank(); runtime = AgentRuntimeV2(bank, Planner())
        response = await runtime.chat(scenario().goal, "SESSION=alice")
        self.assertEqual(response.status.value, "WAITING_CONFIRMATION")
        self.assertEqual(bank.debits, 0)
        ids = []
        for expected_debits in [1, 2]:
            current = runtime.tasks[response.task_id]
            intent = current.active_intent; ids.append(intent["id"])
            response = await runtime.confirm(current.task_id, ConfirmRequest(intent_id=intent["id"],
                intent_hash=intent["intentHash"], action_authorization_id="test-auth"), "SESSION=alice")
            self.assertEqual(bank.debits, expected_debits)
            if expected_debits == 1:
                self.assertEqual(response.status.value, "WAITING_CONFIRMATION")
        self.assertEqual(response.status.value, "SUCCEEDED")
        self.assertEqual(len(set(ids)), 2)
        self.assertEqual([step["status"] for step in current.ledger], ["SUCCEEDED", "SUCCEEDED"])
        self.assertEqual(len({b["receipt_id"] for b in current.financial_terms}), 2)

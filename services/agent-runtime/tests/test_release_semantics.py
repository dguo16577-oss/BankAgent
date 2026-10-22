"""Original user constraints are vetoes, not an intent router or a planner."""
import unittest

from app.agent_v2.models import Task, Observation
from app.agent_v2.tools import ToolRegistry, RegistryError
from app.agent_v2.financial_terms import bind_prepared_intent, bind_execution_receipt
from test_step_authorization import scenario, args, bank_intent


def card_task(text, quote=None):
    task = Task(customer_id='alice', session_binding='session', goal=text,
        conversation=[{'role': 'user', 'text': text}], ledger=[{
            'step_id': 'g1', 'goal': text, 'kind': 'FINANCIAL_ACTION',
            'source_quote': quote or text, 'evidence_tools': ['confirmed_card_action'],
            'dependencies': [], 'status': 'PENDING'}], selected_financial_step_id='g1')
    task.observations = [Observation(tool_name='list_cards', success=True,
        structured_result={'cards': [{'card_id': 'card_a', 'masked_number': '••1937'},
                                    {'card_id': 'card_b', 'masked_number': '••2468'}]}),
        *[Observation(tool_name='get_card', success=True, structured_result={'card_id': cid})
          for cid in ['card_a', 'card_b']]]
    return task


class OriginalGoalVetoTests(unittest.TestCase):
    def test_freeze_a_cannot_unfreeze_b_or_freeze_b(self):
        task = card_task('冻结尾号1937的卡')
        for card, action in [('card_a', 'UNFREEZE'), ('card_b', 'UNFREEZE'), ('card_b', 'FREEZE')]:
            with self.subTest(card=card, action=action), self.assertRaises(RegistryError):
                ToolRegistry(object()).validate('prepare_card_action', {'card_id': card, 'action_type': action}, task)
        ToolRegistry(object()).validate('prepare_card_action', {'card_id': 'card_a', 'action_type': 'FREEZE'}, task)

    def test_action_boundaries_and_ambiguous_source_require_clarification(self):
        for text in ['解冻尾号1937的卡', 'unfreeze card ending 1937', '冻结再解冻尾号1937的卡']:
            with self.subTest(text=text), self.assertRaises(RegistryError):
                ToolRegistry(object()).validate('prepare_card_action', {'card_id':'card_a','action_type':'FREEZE'}, card_task(text))

    def test_quote_cannot_hide_conflicting_card_in_another_clause(self):
        task = card_task('冻结尾号1937的卡，解冻尾号2468的卡', '冻结尾号1937的卡')
        with self.assertRaises(RegistryError):
            ToolRegistry(object()).validate('prepare_card_action', {'card_id':'card_b','action_type':'UNFREEZE'}, task)

    def test_restore_request_cannot_become_stop_mandate(self):
        task = Task(customer_id='alice',session_binding='s',goal='恢复这个银行代扣',
            conversation=[{'role':'user','text':'恢复这个银行代扣'}])
        task.observations=[Observation(tool_name='get_recurring_payment',success=True,structured_result={
            'payment':{'recurring_payment_id':'mandate_a','source':'BANK_MANAGED',
                       'management_capability':'STOP_FUTURE_PAYMENTS','status':'ACTIVE'}})]
        with self.assertRaises(RegistryError):
            ToolRegistry(object()).validate('prepare_stop_recurring_payment', {'recurring_payment_id':'mandate_a'}, task)

    def test_returned_bank_card_terms_cannot_disagree_with_prepare(self):
        task=card_task('冻结尾号1937的卡')
        with self.assertRaises(ValueError):
            bind_prepared_intent(task,'prepare_card_action',{'card_id':'card_a','action_type':'FREEZE'},
                {'id':'intent_a','intentHash':'hash','card':{'id':'card_b'},'actionType':'UNFREEZE'})

    def test_conflicting_raw_receipt_cannot_complete_original_transfer(self):
        task=scenario(); task.selected_financial_step_id='g1'
        intent=bank_intent('intent_a','100.00','zhang')
        bind_prepared_intent(task,'prepare_transfer',args(),intent)
        with self.assertRaises(ValueError):
            bind_execution_receipt(task,intent,{'id':'receipt_a','intentId':'intent_a',
                'amount':{'amount':'200.00','currency':'CNY'},'recipient':{'id':'li'}})
        self.assertEqual(task.financial_terms[0]['status'],'PREPARED')

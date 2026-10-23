"""Independent reviewer regressions; synthetic fixtures, never live evidence."""
import unittest
from app.agent_v2.models import Task, Observation, Status
from app.agent_v2.financial_terms import authorize_transfer_terms
from app.agent_v2.grounding import validate_analytical_reply
from app.agent_v2.runtime import AgentRuntimeV2
from app.task_models import ConfirmRequest
from app.banking import BankingApiError
from test_step_authorization import scenario, args
from test_agent_v2 import CancellableBank, SequencePlanner
from app.agent_v2.models import PlannerDecision


def transfer_task(text):
    task = scenario()
    task.goal = text
    task.conversation = [{'role': 'user', 'text': text}]
    task.ledger = task.ledger[:1]
    task.ledger[0].update(goal=text, source_quote=text)
    task.selected_financial_step_id = 'g1'
    task.observations[0].structured_result['accounts'] = [
        {'id': 'account-a', 'displayName': 'CNY Current', 'maskedAccountNumber': '••1048', 'currency': 'CNY'},
        {'id': 'savings', 'displayName': 'Savings', 'maskedAccountNumber': '••2086', 'currency': 'CNY'},
    ]
    task.observations[1].structured_result['candidates'][0]['masked_account'] = '••6201'
    return task


class ReviewedTermsTests(unittest.TestCase):
    def test_recipient_suffix_is_not_a_payer_constraint(self):
        for text in ['用CNY Current给张三转100元，收款账户尾号6201',
                     '从尾号1048账户给张三转100元，收款账户尾号6201']:
            with self.subTest(text=text):
                self.assertEqual(authorize_transfer_terms(transfer_task(text), args())['account_reference'], 'account-a')

    def test_wrong_recipient_suffix_is_rejected(self):
        with self.assertRaises(ValueError):
            authorize_transfer_terms(transfer_task('给张三转100元，收款账户尾号9999'), args())

    def test_explicit_payer_name_cannot_be_swapped(self):
        for name in ['CNY Current', 'cny   current', 'CNYCurrent']:
            task = transfer_task('用' + name + '给张三转100元')
            with self.subTest(name=name), self.assertRaisesRegex(ValueError, 'ACCOUNT'):
                authorize_transfer_terms(task, {**args(), 'source_account_id': 'savings'})

    def test_payer_suffix_remains_a_hard_constraint(self):
        with self.assertRaisesRegex(ValueError, 'ACCOUNT'):
            authorize_transfer_terms(transfer_task('从尾号2086账户给张三转100元'), args())

    def test_markdown_year_is_not_a_mask_but_unknown_masks_are_rejected(self):
        task = Task(customer_id='a', session_binding='s', goal='消费')
        task.observations = [Observation(tool_name='summarize_spending', success=True,
            structured_result={'total': {'amount': '4968.00', 'currency': 'CNY'}})]
        self.assertIsNone(validate_analytical_reply(task, '**2026年9月** 消费 CNY 4968.00'))
        for text in ['账户 ****2026', '尾号2026', '账户 **2026**']:
            with self.subTest(text=text):
                self.assertEqual(validate_analytical_reply(task, text), 'UNOBSERVED_MASK')
        self.assertEqual(validate_analytical_reply(task, '消费 CNY 9999.00'), 'UNOBSERVED_AMOUNT')


class ReviewedCompletionTests(unittest.IsolatedAsyncioTestCase):
    async def test_customer_scope_refusal_is_terminal_without_false_data_completion(self):
        class Planner:
            async def plan_subgoals(self, goal, _):
                return [{'step_id': 'g1', 'goal': goal, 'kind': 'READ',
                         'evidence_tools': ['list_accounts'], 'dependencies': [], 'status': 'PENDING'}]
            async def decide(self, _):
                return PlannerDecision(type='COMPLETE', completion_kind='REFUSAL',
                    refusal_reason='CUSTOMER_SCOPE', final_message='拒绝访问他人资料')
        bank = CancellableBank(); runtime = AgentRuntimeV2(bank, Planner())
        result = await runtime.chat('查询其他客户的余额', 'SESSION=alice')
        self.assertEqual(result.error_code, 'REQUEST_REFUSED')
        self.assertEqual(result.status.value, 'FAILED')
        self.assertEqual(runtime.tasks[result.task_id].ledger[0]['status'], 'BLOCKED')
        self.assertEqual(runtime.tasks[result.task_id].step_count, 1)
        self.assertEqual(bank.debits, 0)
        self.assertFalse(bank.intents)

    async def test_verified_single_financial_goal_finishes_without_model_dispute(self):
        class Planner(SequencePlanner):
            async def plan_subgoals(self, goal, _):
                return [{'step_id': 'g1', 'goal': goal, 'source_quote': goal,
                         'kind': 'FINANCIAL_ACTION', 'evidence_tools': ['confirmed_transfer'],
                         'dependencies': [], 'status': 'PENDING'}]
            async def audit_completion(self, *_):
                return ['g1']  # Model cannot disprove an exact bank-bound receipt.
        bank = CancellableBank(); runtime = AgentRuntimeV2(bank, Planner())
        result = await runtime.chat('给张三转10元', 'SESSION=alice')
        self.assertTrue(result.confirmation_required)
        result = await runtime.confirm(result.task_id, ConfirmRequest(
            intent_id=result.confirmation['id'], intent_hash=result.confirmation['intentHash'],
            action_authorization_id='grant'), 'SESSION=alice')
        self.assertEqual(result.status.value, 'SUCCEEDED')
        self.assertTrue(result.receipt)
        self.assertEqual(bank.debits, 1)

    async def test_completed_confirmation_replays_in_partial_task_without_mutation(self):
        bank = CancellableBank(); runtime = AgentRuntimeV2(bank, SequencePlanner())
        prepared = await runtime.chat('给张三转10元', 'SESSION=alice')
        request = ConfirmRequest(intent_id=prepared.confirmation['id'],
                                 intent_hash=prepared.confirmation['intentHash'], action_authorization_id='grant')
        done = await runtime.confirm(prepared.task_id, request, 'SESSION=alice')
        task = runtime.tasks[prepared.task_id]
        task.status = Status.PARTIAL
        task.receipt = None
        replay = await runtime.confirm(task.task_id, request, 'SESSION=alice')
        self.assertEqual(replay.receipt['id'], done.receipt['id'])
        self.assertEqual(task.status, Status.PARTIAL)
        self.assertEqual(bank.debits, 1)
        with self.assertRaises(BankingApiError):
            await runtime.confirm(task.task_id, request.model_copy(update={'intent_hash': 'wrong'}), 'SESSION=alice')
        with self.assertRaises(BankingApiError):
            await runtime.confirm(task.task_id, request, 'SESSION=bob')

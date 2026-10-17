from __future__ import annotations

import pathlib
import sys
import unittest
from datetime import datetime, timedelta, timezone

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))

from app.agent_v2.models import PlannerDecision
from app.agent_v2.runtime import AgentRuntimeV2
from app.banking import BankingApiError
from app.task_models import ConfirmRequest
from test_transfer_runtime import FakeBank


class ActionBank(FakeBank):
    def __init__(self):
        super().__init__()
        self.actions = {}
        self.cancelled = []
        self.committed = []

    async def customer_get(self, path, cookie, *, params=None):
        if path.startswith('/customer/scheduled-payment-intents/') or path.startswith('/customer/split-action-intents/'):
            return self.actions[path.rsplit('/', 1)[-1]]
        return await super().customer_get(path, cookie, params=params)

    async def prepare_schedule_action(self, cookie, body):
        identifier = f'schedule_intent_{len(self.actions) + 1}'
        result = {'id': identifier, 'intentHash': 's' * 64, 'status': 'PREPARED',
                  'expiresAt': (datetime.now(timezone.utc) + timedelta(minutes=5)).isoformat(),
                  'schedule': {'id': 'schedule_1', 'status': 'SCHEDULED', 'version': 0,
                               'sourceAccount': {'id': body['sourceAccountId']},
                               'recipient': {'id': body['recipientId'], 'displayName': '张三'},
                               'amount': body['amount'], 'dueAt': body['dueAt']}}
        self.actions[identifier] = result
        return result

    async def cancel_schedule_intent(self, cookie, intent_id, reason):
        self.actions[intent_id]['status'] = 'CANCELLED'
        self.cancelled.append((intent_id, reason))
        return self.actions[intent_id]

    async def execute_schedule_action(self, cookie, body, key):
        self.actions[body['intentId']]['status'] = 'EXECUTED'
        self.committed.append(('SCHEDULE', body['intentId'], key))
        return {'id': 'schedule_1', 'status': 'SCHEDULED'}

    async def prepare_split_action(self, cookie, body):
        identifier = f'split_intent_{len(self.actions) + 1}'
        result = {'id': identifier, 'intentHash': 'a' * 64, 'status': 'PREPARED',
                  'expiresAt': (datetime.now(timezone.utc) + timedelta(minutes=5)).isoformat(),
                  'split': {'id': 'split_1', 'status': 'ACTIVE', 'version': 0,
                            'receivingAccount': {'id': body['receiveAccountId']},
                            'totalAmount': body['totalAmount'], 'payerShare': body['payerShare'],
                            'participants': [{'recipientId': p['recipientId'], 'amountDue': p['amountDue']}
                                             for p in body['participants']]}}
        self.actions[identifier] = result
        return result

    async def cancel_split_intent(self, cookie, intent_id, reason):
        self.actions[intent_id]['status'] = 'CANCELLED'
        self.cancelled.append((intent_id, reason))
        return self.actions[intent_id]

    async def execute_split_action(self, cookie, body, key):
        self.actions[body['intentId']]['status'] = 'EXECUTED'
        self.committed.append(('SPLIT', body['intentId'], key))
        return {'id': 'split_1', 'status': 'ACTIVE'}


class ScheduledPlanner:
    def __init__(self, due_at):
        self.due_at = due_at
        self.contexts = []

    async def decide(self, context):
        self.contexts.append(context)
        if context['state']['completed_actions']:
            return PlannerDecision(type='COMPLETE', final_message='定时转账已确认。')
        seen = {row['tool_name'] for row in context['observations']}
        if 'list_accounts' not in seen:
            return PlannerDecision(type='TOOL_CALL', tool_call={'tool_name': 'list_accounts', 'arguments': {}})
        if 'resolve_recipient' not in seen:
            return PlannerDecision(type='TOOL_CALL', tool_call={'tool_name': 'resolve_recipient',
                                                                 'arguments': {'query': '张三'}})
        return PlannerDecision(type='TOOL_CALL', tool_call={'tool_name': 'prepare_scheduled_transfer',
            'arguments': {'source_account_id': 'acc_alice', 'recipient_id': 'r_zhang',
                          'amount': '10.00', 'currency': 'CNY', 'due_at': self.due_at}})


class SplitPlanner:
    def __init__(self):
        self.contexts = []

    async def decide(self, context):
        self.contexts.append(context)
        if context['state']['completed_actions']:
            return PlannerDecision(type='COMPLETE', final_message='AA 请求已确认。')
        revised = '120' in context['conversation'][-1]['text']
        total = '120.00' if revised else '100.00'
        half = '60.00' if revised else '50.00'
        seen = {row['tool_name'] for row in context['observations']}
        if 'list_accounts' not in seen:
            return PlannerDecision(type='TOOL_CALL', tool_call={'tool_name': 'list_accounts', 'arguments': {}})
        if 'resolve_recipient' not in seen:
            return PlannerDecision(type='TOOL_CALL', tool_call={'tool_name': 'resolve_recipient',
                                                                 'arguments': {'query': '张三'}})
        if 'calculate_split' not in seen:
            return PlannerDecision(type='TOOL_CALL', tool_call={'tool_name': 'calculate_split',
                'arguments': {'total_amount': total, 'currency': 'CNY',
                              'participant_keys': ['SELF', '张三'], 'payer_included': True}})
        return PlannerDecision(type='TOOL_CALL', tool_call={'tool_name': 'prepare_split_request',
            'arguments': {'receive_account_id': 'acc_alice', 'total_amount': total,
                          'payer_share': half, 'participants': [
                              {'participant_key': '张三', 'recipient_id': 'r_zhang', 'amount': half}]}})


class M18ScheduleSplitTests(unittest.IsolatedAsyncioTestCase):
    async def test_schedule_prepares_then_revision_revokes_bank_intent(self):
        bank = ActionBank()
        due = (datetime.now(timezone.utc) + timedelta(days=2)).replace(microsecond=0).isoformat()
        planner = ScheduledPlanner(due)
        runtime = AgentRuntimeV2(bank, planner)
        first = await runtime.chat('后天给张三转10元', 'SESSION=alice')
        self.assertEqual(first.status.value, 'WAITING_CONFIRMATION')
        self.assertEqual(len(planner.contexts), 3)
        self.assertEqual([step.tool for step in first.steps],
                         ['list_accounts', 'resolve_recipient', 'prepare_scheduled_transfer'])
        self.assertEqual(bank.debits, 0)

        old_id = first.confirmation['id']
        changed = await runtime.chat('改成后天给张三转10元', 'SESSION=alice', first.task_id)
        self.assertEqual(changed.status.value, 'WAITING_CONFIRMATION')
        self.assertNotEqual(changed.confirmation['id'], old_id)
        self.assertEqual(bank.actions[old_id]['status'], 'CANCELLED')
        self.assertEqual(bank.cancelled, [(old_id, 'TASK_REVISED')])
        self.assertEqual(bank.debits, 0)

        confirmation = ConfirmRequest(intent_id=changed.confirmation['id'],
                                      intent_hash=changed.confirmation['intentHash'])
        waiting = await runtime.confirm(changed.task_id, confirmation, 'SESSION=alice')
        self.assertEqual(waiting.status.value, 'WAITING_AUTH')
        self.assertEqual(bank.committed, [])
        confirmation.action_authorization_id = 'auth_schedule_1'
        done = await runtime.confirm(changed.task_id, confirmation, 'SESSION=alice')
        self.assertEqual(done.status.value, 'SUCCEEDED')
        self.assertEqual(len(bank.committed), 1)
        replay = await runtime.confirm(changed.task_id, confirmation, 'SESSION=alice')
        self.assertEqual(replay.receipt, done.receipt)
        self.assertEqual(len(bank.committed), 1)
        self.assertEqual(bank.debits, 0)

    async def test_split_prepares_exact_shares_without_debit(self):
        bank = ActionBank()
        planner = SplitPlanner()
        runtime = AgentRuntimeV2(bank, planner)
        result = await runtime.chat('我和张三AA分100元，我也参加', 'SESSION=alice')
        self.assertEqual(result.status.value, 'WAITING_CONFIRMATION')
        self.assertEqual([step.tool for step in result.steps],
                         ['list_accounts', 'resolve_recipient', 'calculate_split', 'prepare_split_request'])
        self.assertEqual(len(planner.contexts), 4)
        self.assertEqual(result.confirmation['split']['totalAmount']['amount'], '100.00')
        self.assertEqual(result.confirmation['split']['participants'][0]['amountDue']['amount'], '50.00')
        self.assertEqual(bank.debits, 0)
        self.assertEqual(bank.committed, [])

        confirmation = ConfirmRequest(intent_id=result.confirmation['id'],
                                      intent_hash=result.confirmation['intentHash'],
                                      action_authorization_id='auth_split_1')
        with self.assertRaises(BankingApiError):
            await runtime.confirm(result.task_id, confirmation, 'SESSION=bob')
        done = await runtime.confirm(result.task_id, confirmation, 'SESSION=alice')
        self.assertEqual(done.status.value, 'SUCCEEDED')
        self.assertEqual(len(bank.committed), 1)
        self.assertEqual(bank.committed[0][0], 'SPLIT')
        self.assertEqual(bank.debits, 0)

    async def test_split_revision_and_abandon_revoke_each_bank_intent(self):
        bank = ActionBank()
        runtime = AgentRuntimeV2(bank, SplitPlanner())
        first = await runtime.chat('我和张三AA分100元，我也参加', 'SESSION=alice')
        self.assertEqual(first.status.value, 'WAITING_CONFIRMATION')
        revised = await runtime.chat('改成我和张三AA分120元，我也参加', 'SESSION=alice', first.task_id)
        self.assertEqual(revised.status.value, 'WAITING_CONFIRMATION')
        self.assertEqual(bank.actions[first.confirmation['id']]['status'], 'CANCELLED')
        self.assertEqual(revised.confirmation['split']['totalAmount']['amount'], '120.00')
        self.assertEqual(revised.confirmation['split']['participants'][0]['amountDue']['amount'], '60.00')
        with self.assertRaises(BankingApiError):
            await runtime.confirm(revised.task_id, ConfirmRequest(
                intent_id=first.confirmation['id'],
                intent_hash=first.confirmation['intentHash'],
                action_authorization_id='old_auth'), 'SESSION=alice')
        cancelled = await runtime.cancel(revised.task_id, 'SESSION=alice')
        self.assertEqual(cancelled.status.value, 'CANCELLED')
        self.assertEqual(bank.actions[revised.confirmation['id']]['status'], 'CANCELLED')
        self.assertEqual(bank.committed, [])
        self.assertEqual(bank.debits, 0)


if __name__ == '__main__':
    unittest.main()

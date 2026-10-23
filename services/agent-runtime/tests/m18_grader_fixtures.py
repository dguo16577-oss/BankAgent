"""Synthetic grader inputs only. NOT model calls, DB proof or release evidence.

The historical CLI still requires independently collected artifacts. Unit tests
exercise its acceptance/rejection contract with portable synthetic samples.
"""
import copy


def transfer_sample():
    return {
        'synthetic_unit_fixture': True, 'case_id': 'DC01-TRANSFER-LIFECYCLE',
        'category': 'Duplicate confirmation', 'status': 'PASS', 'model': 'DEEPSEEK',
        'task_state': 'SUCCEEDED', 'revision_old_status': 'CANCELLED',
        'recipient_revision_old_status': 'CANCELLED', 'duplicate_same_receipt': True,
        'balance_debit': '1.00', 'model_http_requests': 1,
        'model_usage': [{'model': 'synthetic-no-live-call'}], 'usage_coverage_complete': True,
        'estimated_model_cost_usd': '0.001', 'planner_decisions': 1, 'tool_calls': 1, 'latency_ms': 1,
        'tool_order': ['prepare_transfer'],
        'postgresql_evidence': {'verified': True, 'source_debit': '1.00',
            'new_transfers': 1, 'new_customer_transfer_debits': 1},
        'trajectory': {'benchmark_case_id': 'DC01-TRANSFER-LIFECYCLE', 'result': 'PASS',
            'final_task_state': 'SUCCEEDED', 'invariants': {'exactly_one_source_debit': True},
            'tool_schemas': [{'name': name} for name in [
                'list_accounts', 'get_account', 'list_cards', 'get_card', 'list_transactions',
                'summarize_spending', 'list_recipients', 'resolve_recipient', 'get_transfer_intent',
                'list_scheduled_transfers', 'get_scheduled_transfer', 'calculate_split', 'prepare_transfer']]},
    }


def funds_sample():
    sample = copy.deepcopy(transfer_sample())
    sample.update(case_id='IF02-FUNDS-REVALIDATION', category='Insufficient funds',
                  task_state='CANCELLED', rejected_http_status=409, rejected_code='INSUFFICIENT_FUNDS')
    sample['trajectory'].update(benchmark_case_id=sample['case_id'], final_task_state='CANCELLED')
    sample['postgresql_evidence'] = {'verified': True, 'balance_after_external_change': '1.00',
        'balance_after_rejected_confirm': '1.00', 'new_transfers_after_external_change': 0,
        'new_transfers_after_rejected_confirm': 0, 'new_debit_transactions_after_rejected_confirm': 0}
    return sample

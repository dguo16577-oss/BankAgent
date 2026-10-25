"""Independent-review reproductions; these are deterministic, not live evidence."""
import unittest
from unittest.mock import patch

import httpx

from app.agent_v2.grounding import validate_analytical_reply
from app.agent_v2.models import Observation, Task
from app.agent_v2.tools import ToolRegistry


class MoneyReviewTests(unittest.TestCase):
    def setUp(self):
        self.task = Task(customer_id='alex', session_binding='session', goal='分析消费')
        self.task.observations = [Observation(tool_name='summarize_spending', success=True,
            structured_result={'totals': [{'amount': value, 'currency': 'CNY'}
                for value in ['4968', '3000', '782', '536', '420', '230', '-10']]})]

    def test_implicit_currency_never_authorizes_invented_subtotals(self):
        for text in ['以下金额单位均为人民币。\n餐饮和交通支出小计：1202。',
                     '【分类（CNY）】\n日常小计：1318',
                     '【分类（CNY）】\n日常小计：1318.0',
                     '【分类（CNY）】\n日常小计：1318.000',
                     '| 分类 | 金额(CNY) |\n| 日常 | 1318 |']:
            with self.subTest(text=text):
                self.assertEqual(validate_analytical_reply(self.task, text), 'UNOBSERVED_AMOUNT')

    def test_negative_sign_and_non_money_numbers(self):
        for text in ['与上期绝对变化为-10.00 CNY', '与上期绝对变化为−10.00 CNY',
                     '合计4968元，共10笔，2026年9月。', '【分类（CNY）】\n住房：3000',
                     '【分类（CNY）】\n2026-09-01 至 2026-09-30，共10笔，占比20%。',
                     '【分类（CNY）】\n1. 住房：3000，统计30天。']:
            with self.subTest(text=text):
                self.assertIsNone(validate_analytical_reply(self.task, text))


class ToolReviewTests(unittest.IsolatedAsyncioTestCase):
    async def test_runtime_exposes_safe_schema_error_then_replans_without_bank_call(self):
        from app.agent_v2.runtime import AgentRuntimeV2
        from test_agent_v2 import CancellableBank
        class Planner:
            contexts = []
            async def decide(self, context):
                self.contexts.append(context)
                if len(self.contexts) == 1:
                    return {'type': 'TOOL_CALL', 'tool_call': {'tool_name': 'list_transactions',
                        'arguments': {'date_from': 'SECRET_DATE_ONLY'}}}
                return {'type': 'ASK_USER', 'question': {'text': '请明确查询时间范围。', 'options': []}}
        planner = Planner()
        bank = CancellableBank()
        runtime = AgentRuntimeV2(bank, planner)
        result = await runtime.chat('查询交易', 'SESSION=alice')
        self.assertEqual(result.status.value, 'WAITING_USER')
        observation = planner.contexts[1]['latest_observation']
        self.assertFalse(observation['success'])
        self.assertEqual(observation['structured_result']['issues'][0]['path'], 'date_from')
        self.assertNotIn('SECRET_DATE_ONLY', str(observation))
        self.assertEqual(bank.debits, 0)

    async def test_persistent_schema_error_is_bounded(self):
        from app.agent_v2.runtime import AgentRuntimeV2
        from test_agent_v2 import CancellableBank, OneDecision
        runtime = AgentRuntimeV2(CancellableBank(), OneDecision({'type': 'TOOL_CALL',
            'tool_call': {'tool_name': 'list_transactions', 'arguments': {'date_from': '2026-09-01'}}}))
        result = await runtime.chat('查询交易', 'SESSION=alice')
        self.assertEqual(result.error_code, 'SCHEMA_VALIDATION_FAILED')
        self.assertEqual(runtime.tasks[result.task_id].step_count, 2)

    async def test_date_repair_invokes_bank_once_only_after_validating_corrected_input(self):
        from app.agent_v2.runtime import AgentRuntimeV2
        from test_agent_v2 import CancellableBank
        class Bank(CancellableBank):
            reads = 0
            async def customer_get(self, path, cookie, *, params=None):
                if path == '/customer/transactions': self.reads += 1
                return await super().customer_get(path, cookie, params=params)
        class Planner:
            calls = 0
            async def decide(self, context):
                self.calls += 1
                if self.calls == 3:
                    return {'type': 'COMPLETE', 'final_message': '已查询。'}
                date = '2026-09-01' if self.calls == 1 else '2026-09-01T00:00:00+08:00'
                return {'type': 'TOOL_CALL', 'tool_call': {'tool_name': 'list_transactions',
                    'arguments': {'date_from': date, 'date_to': '2026-10-01T00:00:00+08:00'}}}
        bank = Bank()
        runtime = AgentRuntimeV2(bank, Planner())
        result = await runtime.chat('查询9月交易', 'SESSION=alice')
        self.assertEqual(result.status.value, 'SUCCEEDED')
        self.assertEqual(bank.reads, 1)
        self.assertEqual(bank.debits, 0)

    async def test_prepare_schema_error_does_not_enter_readonly_repair(self):
        from app.agent_v2.runtime import AgentRuntimeV2
        from test_agent_v2 import CancellableBank, OneDecision
        runtime = AgentRuntimeV2(CancellableBank(), OneDecision({'type': 'TOOL_CALL',
            'tool_call': {'tool_name': 'prepare_transfer', 'arguments': {}}}))
        result = await runtime.chat('给张三转500元', 'SESSION=alice')
        task = runtime.tasks[result.task_id]
        self.assertEqual(result.status.value, 'FAILED')
        self.assertFalse(any(row['kind'] == 'TOOL_SCHEMA_ERROR' for row in task.trace))
        self.assertEqual(runtime.gateway.debits, 0)

    async def test_mcp_auth_failure_remains_hard_rejection(self):
        from app.agent_v2.tools import RegistryError
        class UnauthorizedBridge:
            async def call(self, *_): raise ValueError('MCP_AUTH_FAILED')
        registry = ToolRegistry(object(), UnauthorizedBridge())
        with self.assertRaisesRegex(RegistryError, 'MCP_AUTH_FAILED'):
            await registry.call('search_bank_knowledge', {'query': '政策'},
                Task(customer_id='alex', session_binding='session', goal='查询政策'), 'secret')

    async def test_circuit_hits_do_not_extend_outage_and_recovered_service_is_retried(self):
        class RecoveringBridge:
            calls = 0
            async def call(self, *_):
                self.calls += 1
                if self.calls == 1: raise ValueError('MCP_CONNECTION_FAILED')
                return {'evidence': [], 'status': 'OK', 'retrieval_mode': 'HYBRID'}
        bridge = RecoveringBridge()
        registry = ToolRegistry(object(), bridge)
        task = Task(customer_id='alex', session_binding='session', goal='查询政策')
        with patch('app.agent_v2.tools.time.monotonic', return_value=100):
            self.assertFalse((await registry.call('search_bank_knowledge', {'query': '政策'}, task, '')).success)
        with patch('app.agent_v2.tools.time.monotonic', return_value=120):
            self.assertFalse((await registry.call('search_bank_knowledge', {'query': '政策'}, task, '')).success)
        with patch('app.agent_v2.tools.time.monotonic', return_value=131):
            self.assertTrue((await registry.call('search_bank_knowledge', {'query': '政策'}, task, '')).success)
        self.assertEqual(bridge.calls, 2)

    async def test_unavailable_knowledge_is_observed_then_stopped_without_repeated_io(self):
        from app.agent_v2.runtime import AgentRuntimeV2
        from test_agent_v2 import CancellableBank, OneDecision
        runtime = AgentRuntimeV2(CancellableBank(), OneDecision({'type': 'TOOL_CALL',
            'tool_call': {'tool_name': 'search_bank_knowledge', 'arguments': {'query': '转账手续'}}}))
        class OfflineBridge:
            calls = 0
            async def call(self, *_):
                self.calls += 1
                raise ValueError('MCP_CONNECTION_FAILED')
        bridge = OfflineBridge()
        runtime.registry.mcp_bridge = bridge
        result = await runtime.chat('查询转账手续', 'SESSION=alice')
        self.assertEqual(result.status.value, 'PARTIAL')
        self.assertEqual(bridge.calls, 1)
        self.assertEqual(len(runtime.tasks[result.task_id].observations), 1)
        self.assertEqual(runtime.gateway.debits, 0)

    async def test_failed_knowledge_cannot_certify_fabricated_policy_as_complete(self):
        from app.agent_v2.runtime import AgentRuntimeV2
        from test_agent_v2 import CancellableBank
        class Planner:
            async def decide(self, context):
                if not context['observations']:
                    return {'type': 'TOOL_CALL', 'tool_call': {'tool_name': 'search_bank_knowledge',
                        'arguments': {'query': '政策'}}}
                return {'type': 'COMPLETE', 'final_message': 'FAKE_VERIFIED_POLICY'}
        class OfflineBridge:
            async def call(self, *_): raise ValueError('MCP_CONNECTION_FAILED')
        runtime = AgentRuntimeV2(CancellableBank(), Planner())
        runtime.registry.mcp_bridge = OfflineBridge()
        result = await runtime.chat('查询政策', 'SESSION=alice')
        self.assertEqual(result.status.value, 'PARTIAL')
        self.assertNotIn('FAKE_VERIFIED_POLICY', result.message)

    def test_offset_requirement_is_visible_to_model(self):
        registry = ToolRegistry(object())
        for name in ['list_transactions', 'summarize_spending', 'detect_transaction_anomalies']:
            schema = next(t for t in registry.visible() if t['name'] == name)['input_schema']
            field = schema['properties']['date_from']
            variants = field.get('anyOf', [field])
            self.assertTrue(any('pattern' in variant for variant in variants), name)

    async def test_knowledge_connection_failure_becomes_failed_observation(self):
        class BrokenClient:
            async def __aenter__(self): return self
            async def __aexit__(self, *_): return None
            async def post(self, *_args, **_kwargs):
                raise httpx.ConnectError('PRIVATE_URL_AND_CREDENTIAL')
        registry = ToolRegistry(object())
        task = Task(customer_id='alex', session_binding='session', goal='银行政策')
        with patch('app.agent_v2.tools.httpx.AsyncClient', return_value=BrokenClient()):
            result = await registry.call('search_bank_knowledge', {'query': '银行政策'}, task, 'secret')
        self.assertFalse(result.success)
        self.assertEqual(result.error, 'KNOWLEDGE_SEARCH_UNAVAILABLE')
        self.assertNotIn('PRIVATE', str(result))
        self.assertFalse(next(t for t in registry.visible() if t['name'] == 'search_bank_knowledge')['available'])


if __name__ == '__main__':
    unittest.main()

import unittest
import httpx
from opentelemetry import trace
from app.telemetry import METRICS, traced, outgoing_headers, safe_span_metadata
from types import SimpleNamespace
from app.deepseek import DeepSeekClassifier


class TelemetryTests(unittest.IsolatedAsyncioTestCase):
    def test_third_party_span_payload_and_name_are_not_exported(self):
        span=SimpleNamespace(name='SECRET in third party span', context=SimpleNamespace(trace_id=1,span_id=2),
            start_time=0,end_time=1000,status=SimpleNamespace(status_code=SimpleNamespace(name='OK')),
            attributes={'prompt':'SECRET','tool.name':'SECRET'})
        self.assertNotIn('SECRET',str(safe_span_metadata(span)))
        span.name='tool.call'
        span.attributes={'prompt':'SECRET','tool.name':'list_accounts'}
        self.assertNotIn('SECRET',str(safe_span_metadata(span)))
    async def test_fixed_metrics_do_not_include_inputs_or_error_message(self):
        @traced('test.operation')
        async def call(secret):
            raise ValueError(secret)
        with self.assertRaises(ValueError):
            await call('SECRET-ACCOUNT-1234567890123456')
        self.assertNotIn('SECRET', str(list(METRICS)))
        self.assertEqual(METRICS[-1]['operation'], 'test.operation')
        self.assertGreaterEqual(METRICS[-1]['duration_ms'], 0)

    async def test_traceparent_propagation_does_not_change_cookie(self):
        span_context = trace.SpanContext(1, 2, False, trace.TraceFlags(1))
        with trace.use_span(trace.NonRecordingSpan(span_context)):
            headers = outgoing_headers({'Cookie': 'SESSION=test'})
        self.assertEqual(headers['Cookie'], 'SESSION=test')
        self.assertEqual(headers['traceparent'], '00-' + '0'*31+'1-'+'0'*15+'2-01')

    async def test_provider_failures_do_not_retry_financial_or_model_request(self):
        for status in (402, 429, 503):
            count = 0
            def handler(request):
                nonlocal count
                count += 1
                return httpx.Response(status, json={'error': {'message': 'provider error'}})
            classifier = DeepSeekClassifier('test', transport=httpx.MockTransport(handler))
            with self.assertRaises(httpx.HTTPStatusError):
                await classifier._json_completion('system', 'user', 64)
            self.assertEqual(count, 1)

    async def test_valid_usage_never_requires_logging_prompt(self):
        classifier = DeepSeekClassifier('test', transport=httpx.MockTransport(lambda _: httpx.Response(200,
            json={'choices': [{'message': {'content': '{"answer":true}'}}],
                  'usage': {'prompt_tokens': 12, 'completion_tokens': 5, 'total_tokens': 17}})))
        self.assertEqual(await classifier._json_completion('sensitive system', 'sensitive user', 64), {'answer': True})

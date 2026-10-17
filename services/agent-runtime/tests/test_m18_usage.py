"""Usage metering stores only billing counters from a model response."""

from __future__ import annotations

import unittest

import httpx

from evals.m18_usage import UsageMeter


class UsageMeterTests(unittest.IsolatedAsyncioTestCase):
    async def test_peak_cost_uses_returned_cache_breakdown(self) -> None:
        meter = UsageMeter()
        await meter._inner.aclose()
        meter._inner = httpx.MockTransport(lambda request: httpx.Response(200, json={
            "model": "deepseek-flash", "choices": [{"message": {"content": "private answer"}}],
            "usage": {"prompt_tokens": 1000, "completion_tokens": 100,
                      "prompt_cache_hit_tokens": 200, "prompt_cache_miss_tokens": 800},
        }))
        response = await meter.handle_async_request(httpx.Request("POST", "https://api.deepseek.com/chat/completions"))
        self.assertEqual(response.status_code, 200)
        self.assertEqual(meter.peak_cost_usd(), "0.00036120")
        self.assertEqual(set(meter.records[0]), {
            "model", "prompt_tokens", "completion_tokens", "prompt_cache_hit_tokens",
            "prompt_cache_miss_tokens",
        })
        self.assertEqual(meter.request_events, [{"status_code": 200, "usage_recorded": True}])
        self.assertTrue(meter.usage_coverage_complete(1))
        await meter.close_pool()

    async def test_missing_cache_breakdown_is_priced_as_all_miss(self) -> None:
        meter = UsageMeter()
        await meter._inner.aclose()
        meter._inner = httpx.MockTransport(lambda request: httpx.Response(200, json={
            "model": "deepseek-flash", "usage": {"prompt_tokens": 1000, "completion_tokens": 0},
        }))
        await meter.handle_async_request(httpx.Request("POST", "https://api.deepseek.com/chat/completions"))
        self.assertEqual(meter.records[0]["prompt_cache_miss_tokens"], 1000)
        self.assertEqual(meter.peak_cost_usd(), "0.00030000")
        await meter.close_pool()

    async def test_failed_or_unmetered_http_response_is_recorded_without_body(self) -> None:
        meter = UsageMeter()
        await meter._inner.aclose()
        meter._inner = httpx.MockTransport(lambda request: httpx.Response(429, json={
            "error": {"message": "private model error"},
        }))
        await meter.handle_async_request(httpx.Request("POST", "https://api.deepseek.com/chat/completions"))
        self.assertEqual(meter.records, [])
        self.assertEqual(meter.request_events, [{"status_code": 429, "usage_recorded": False}])
        self.assertNotIn("private model error", str(meter.request_events))
        self.assertFalse(meter.usage_coverage_complete(1))
        await meter.close_pool()

    async def test_failed_connect_before_request_does_not_create_missing_billable_usage(self) -> None:
        meter = UsageMeter()
        await meter._inner.aclose()
        meter._inner = httpx.MockTransport(lambda request: httpx.Response(200, json={
            "model": "deepseek-flash", "usage": {"prompt_tokens": 10, "completion_tokens": 1},
        }))
        meter.request_events.append({"status_code": None, "usage_recorded": False,
                                     "transport_error": "ConnectTimeout"})
        await meter.handle_async_request(httpx.Request("POST", "https://api.deepseek.com/chat/completions"))
        self.assertTrue(meter.usage_coverage_complete(2))
        self.assertFalse(meter.usage_coverage_complete(3))
        meter.request_events[0]["transport_error"] = "ReadTimeout"
        self.assertFalse(meter.usage_coverage_complete(2))
        await meter.close_pool()


if __name__ == "__main__":
    unittest.main()

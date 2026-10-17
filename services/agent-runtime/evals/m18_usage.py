"""Capture DeepSeek token usage for M18 evaluations without retaining prompts.

The price snapshot is a conservative peak-rate estimate, not a billing receipt.
See https://api-docs.deepseek.com/quick_start/pricing/ (checked 2026-10-07).
"""

from __future__ import annotations

import json
from decimal import Decimal

import httpx


_PEAK_USD_PER_MILLION = {
    "deepseek-flash": {"cache_hit": Decimal("0.006"),
                       "cache_miss": Decimal("0.3"), "output": Decimal("1.2")},
}


class UsageMeter(httpx.AsyncBaseTransport):
    """Record only model name and token counters from real HTTP responses."""

    def __init__(self) -> None:
        self._inner = httpx.AsyncHTTPTransport()
        self.records: list[dict[str, object]] = []
        self.request_events: list[dict[str, object]] = []

    async def handle_async_request(self, request: httpx.Request) -> httpx.Response:
        try:
            response = await self._inner.handle_async_request(request)
        except httpx.RequestError as exc:
            self.request_events.append({"status_code": None, "usage_recorded": False,
                                        "transport_error": type(exc).__name__})
            raise
        try:
            await response.aread()
        except httpx.RequestError as exc:
            self.request_events.append({"status_code": response.status_code, "usage_recorded": False,
                                        "transport_error": type(exc).__name__})
            raise
        event: dict[str, object] = {"status_code": response.status_code, "usage_recorded": False}
        if response.status_code == 200:
            try:
                body = json.loads(response.content)
                usage = body.get("usage", {})
                model = body.get("model")
                prompt = usage.get("prompt_tokens")
                completion = usage.get("completion_tokens")
                hit = usage.get("prompt_cache_hit_tokens")
                miss = usage.get("prompt_cache_miss_tokens")
                if not isinstance(model, str) or any(type(value) is not int or value < 0
                                                     for value in (prompt, completion)):
                    self.request_events.append(event)
                    return response
                if type(hit) is not int or type(miss) is not int or hit < 0 or miss < 0 or hit + miss != prompt:
                    # Treat all input as a cache miss when the breakdown is absent or inconsistent.
                    hit, miss = 0, prompt
                self.records.append({"model": model, "prompt_tokens": prompt,
                                     "completion_tokens": completion,
                                     "prompt_cache_hit_tokens": hit,
                                     "prompt_cache_miss_tokens": miss})
                event["usage_recorded"] = True
            except (ValueError, TypeError, AttributeError):
                pass
        self.request_events.append(event)
        return response

    async def aclose(self) -> None:
        # DeepSeekClassifier makes a short-lived AsyncClient per decision.
        # Keep the underlying pool available for the rest of this case.
        pass

    async def close_pool(self) -> None:
        await self._inner.aclose()

    def usage_coverage_complete(self, model_attempts: int) -> bool:
        """Require usage for every response; a failed TCP connect sent no model request."""
        if model_attempts <= 0 or len(self.request_events) != model_attempts:
            return False
        completed = [event for event in self.request_events if event.get("status_code") == 200]
        if len(completed) != len(self.records) or not completed:
            return False
        return all(
            (event.get("status_code") == 200 and event.get("usage_recorded") is True)
            or (event.get("status_code") is None and event.get("transport_error")
                in {"ConnectTimeout", "ConnectError"})
            for event in self.request_events
        )

    def peak_cost_usd(self) -> str | None:
        if not self.records or any(record["model"] not in _PEAK_USD_PER_MILLION
                                   for record in self.records):
            return None
        total = Decimal("0")
        for record in self.records:
            rates = _PEAK_USD_PER_MILLION[str(record["model"])]
            total += (Decimal(record["prompt_cache_hit_tokens"]) * rates["cache_hit"]
                      + Decimal(record["prompt_cache_miss_tokens"]) * rates["cache_miss"]
                      + Decimal(record["completion_tokens"]) * rates["output"]) / Decimal("1000000")
        return str(total.quantize(Decimal("0.00000001")))

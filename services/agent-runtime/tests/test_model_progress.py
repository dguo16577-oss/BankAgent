import asyncio
import json
import unittest
from unittest.mock import patch

import httpx

from app.deepseek import DeepSeekClassifier, model_progress_sink


class ModelProgressTests(unittest.IsolatedAsyncioTestCase):
    async def test_reasoning_enabled_with_bounded_budget_and_private_reasoning(self):
        requests, progress = [], []
        def handler(request):
            requests.append(json.loads(request.content))
            return httpx.Response(200, json={"choices": [{"finish_reason": "stop", "message": {
                "content": '{"type":"COMPLETE"}', "reasoning_content": "PRIVATE_REASONING_SENTINEL"}}]})
        async def sink(kind, tool):
            progress.append((kind, tool))
        with patch.dict("os.environ", {"DEEPSEEK_THINKING_ENABLED": "1", "DEEPSEEK_REASONING_EFFORT": "low", "DEEPSEEK_THINKING_MAX_TOKENS": "8192"}):
            classifier = DeepSeekClassifier("test", transport=httpx.MockTransport(handler))
        token = model_progress_sink.set(sink)
        try:
            result = await classifier._json_completion("system", "private request", 64)
        finally:
            model_progress_sink.reset(token)
        self.assertEqual(requests[0]["thinking"], {"type": "enabled"})
        self.assertEqual(requests[0]["reasoning_effort"], "low")
        self.assertEqual(requests[0]["max_tokens"], 8192)
        self.assertEqual(result, {"type": "COMPLETE"})
        self.assertEqual(progress, [("MODEL_STARTED", ""), ("MODEL_FINISHED", "")])
        self.assertNotIn("PRIVATE_REASONING_SENTINEL", str(result) + str(progress))

    async def test_truncated_model_result_fails_closed(self):
        progress = []
        async def sink(kind, tool):
            progress.append(kind)
        classifier = DeepSeekClassifier("test", transport=httpx.MockTransport(lambda _: httpx.Response(200,
            json={"choices": [{"finish_reason": "length", "message": {"content": '{"type":"COMPLETE"}'}}]})))
        token = model_progress_sink.set(sink)
        try:
            with self.assertRaisesRegex(ValueError, "MODEL_OUTPUT_BUDGET_EXCEEDED"):
                await classifier._json_completion("system", "user", 64)
        finally:
            model_progress_sink.reset(token)
        self.assertEqual(progress, ["MODEL_STARTED", "MODEL_FAILED"])

    async def test_explicit_disable_preserves_original_budget(self):
        requests = []
        def handler(request):
            requests.append(json.loads(request.content))
            return httpx.Response(200, json={"choices": [{"message": {"content": '{}'}}]})
        with patch.dict("os.environ", {"DEEPSEEK_THINKING_ENABLED": "0"}):
            classifier = DeepSeekClassifier("test", transport=httpx.MockTransport(handler))
        await classifier._json_completion("system", "user", 64)
        self.assertEqual(requests[0]["thinking"], {"type": "disabled"})
        self.assertEqual(requests[0]["max_tokens"], 64)
        self.assertNotIn("reasoning_effort", requests[0])

    async def test_concurrent_request_progress_remains_isolated(self):
        results = {"alice": [], "bob": []}
        async def request(owner):
            async def sink(kind, tool):
                results[owner].append(kind)
            token = model_progress_sink.set(sink)
            try:
                await asyncio.sleep(0)
                await DeepSeekClassifier("test", transport=httpx.MockTransport(lambda _: httpx.Response(200,
                    json={"choices": [{"message": {"content": '{}'}}]})))._json_completion("s", "u", 64)
            finally:
                model_progress_sink.reset(token)
        await asyncio.gather(request("alice"), request("bob"))
        self.assertEqual(results["alice"], ["MODEL_STARTED", "MODEL_FINISHED"])
        self.assertEqual(results["bob"], ["MODEL_STARTED", "MODEL_FINISHED"])
        self.assertIsNone(model_progress_sink.get())

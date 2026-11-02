from __future__ import annotations

import pathlib
import sys
import unittest
from datetime import datetime, timezone

import httpx

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))

from app.main import create_app
from evals.fixture import FixtureGateway
from evals.run import OfflineClassifier


class AccountPresentationTests(unittest.IsolatedAsyncioTestCase):
    async def ask(self, locale: str = "zh-CN", message: str = "查看我的账户余额") -> dict:
        app = create_app(FixtureGateway(), OfflineClassifier(), agent_version="v1")
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://agent.test") as client:
            response = await client.post("/agent/chat", json={"message": message, "locale": locale},
                                         headers={"Cookie": "SESSION=alex"})
        self.assertEqual(response.status_code, 200)
        return response.json()

    async def test_chinese_balance_is_scannable_and_preserves_financial_meaning(self):
        payload = await self.ask()
        reply = payload["reply"]
        self.assertIn("你有 3 个账户", reply)
        self.assertIn("• CNY Current（•••• 1048）\n  余额：23842.31 CNY · 可用：23722.31 CNY", reply)
        self.assertIn("待处理：120.00 CNY", reply)
        self.assertIn("估算人民币等值：4411.37 CNY（DEMO_RATE，2026-10-01T08:00:00+08:00）", reply)
        self.assertIn("不同币种不直接相加", reply)
        self.assertEqual(payload["citations"], [{"title": "我的账户", "url": "/app/accounts"}])
        self.assertNotIn("acc_alex", reply)

    async def test_english_balance_uses_english_labels_and_same_source_amounts(self):
        payload = await self.ask("en")
        reply = payload["reply"]
        self.assertIn("You have 3 accounts", reply)
        self.assertIn("Balance: 23842.31 CNY · Available: 23722.31 CNY", reply)
        self.assertIn("Pending: 120.00 CNY", reply)
        self.assertIn("Estimated CNY equivalent: 4411.37 CNY", reply)
        self.assertIn("Different currencies are not added together", reply)
        self.assertNotIn("余额", reply)

    async def test_specific_currency_question_only_shows_that_account(self):
        payload = await self.ask(message="我的美元账户值多少人民币？")
        reply = payload["reply"]
        self.assertIn("你的 USD 账户", reply)
        self.assertIn("621.32 USD", reply)
        self.assertIn("估算人民币等值：4411.37 CNY", reply)
        self.assertNotIn("CNY Current", reply)
        self.assertNotIn("Savings", reply)

    async def test_transfer_history_question_is_read_only_not_a_new_transfer_task(self):
        # Relative-month queries must use the same clock as the history fixture.
        app = create_app(FixtureGateway(), OfflineClassifier(), agent_version="v1",
                         now_provider=lambda: datetime(2026, 10, 15, tzinfo=timezone.utc))
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://agent.test") as client:
            response = await client.post("/agent/chat", json={"message": "我这个月转给 Lin Wei 多少钱？"},
                                         headers={"Cookie": "SESSION=alex"})
        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertIn("已完成转账", payload["reply"])
        self.assertIn("Lin Wei", payload["reply"])
        self.assertIn("10.10 CNY", payload["reply"])
        self.assertNotIn("109.10 CNY", payload["reply"])
        self.assertNotIn("taskId", payload)
        self.assertNotIn("请提供收款人和金额", payload["reply"])


if __name__ == "__main__":
    unittest.main()

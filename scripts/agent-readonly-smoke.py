"""Read-only Agent acceptance against running local Spring and Agent services.

Requires ASTER_DEMO_EMAIL and ASTER_DEMO_PASSWORD. No transfer intent or
financial mutation is created. This script prints only pass/fail labels.
"""

from __future__ import annotations

import asyncio
import os

import httpx


async def main() -> None:
    banking_origin = os.getenv("BANKING_API_BASE_URL", "http://127.0.0.1:18080")
    agent_origin = os.getenv("AGENT_API_BASE_URL", "http://127.0.0.1:8001")
    async with httpx.AsyncClient(base_url=banking_origin, timeout=15) as bank:
        await bank.get("/customer/session")
        csrf = bank.cookies.get("XSRF-TOKEN")
        login = await bank.post("/customer/auth/login", json={
            "email": os.environ["ASTER_DEMO_EMAIL"],
            "password": os.environ["ASTER_DEMO_PASSWORD"],
        }, headers={"X-XSRF-TOKEN": csrf or ""})
        assert login.status_code == 200, f"Demo login failed: HTTP {login.status_code}"
        cookie = "; ".join(f"{name}={value}" for name, value in bank.cookies.items())
        async with httpx.AsyncClient(base_url=agent_origin, timeout=35) as agent:
            async def ask(message: str) -> dict:
                response = await agent.post("/agent/chat", json={"message": message, "locale": "zh-CN"},
                                            headers={"Cookie": cookie})
                assert response.status_code == 200, f"Agent query failed: HTTP {response.status_code}"
                return response.json()

            balance = await ask("我有多少钱？")
            assert "以下按原币列示" in balance["reply"]
            assert "待处理：" in balance["reply"]
            assert "估算人民币等值：" in balance["reply"]
            assert "?（，）" not in balance["reply"]
            print("Account list, pending amount and FX provenance: PASS")

            usd = await ask("我的美元账户值多少人民币？")
            assert "你的 USD 账户" in usd["reply"]
            assert "DEMO_RATE" in usd["reply"]
            assert "CNY Current" not in usd["reply"]
            print("Specific-currency answer: PASS")

            history = await ask("我这个月转给 Lin Wei 多少钱？")
            assert "Lin Wei" in history["reply"] and "已完成转账" in history["reply"]
            assert "task_id" not in history and "请提供收款人和金额" not in history["reply"]
            print("Transfer-history question stays read-only: PASS")

            spending = await ask("我这个月消费了多少？")
            assert "普通转账不计入" in spending["reply"]
            assert any(source["url"] == "/app/spending" for source in spending["citations"])
            print("Spending source and exclusion rule: PASS")

            unauthenticated = await agent.post("/agent/chat", json={"message": "我的余额是多少？"})
            assert unauthenticated.status_code == 401
            print("No-session request rejected: PASS")


if __name__ == "__main__":
    asyncio.run(main())

from __future__ import annotations

import pathlib
import sys
import unittest

import httpx

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))

from app.banking import BankingGateway


class ScheduleGatewayTests(unittest.IsolatedAsyncioTestCase):
    async def test_only_fixed_authenticated_schedule_reads_are_allowed(self):
        paths = []

        def responder(request: httpx.Request) -> httpx.Response:
            paths.append(request.url.path)
            self.assertEqual(request.headers["Cookie"], "SESSION=demo")
            return httpx.Response(200, json={"items": []} if request.url.path.endswith("scheduled-payments") else {"id": "sch_1"})

        gateway = BankingGateway("http://bank.test", transport=httpx.MockTransport(responder))
        listed = await gateway.customer_get("/customer/scheduled-payments", "SESSION=demo")
        detail = await gateway.customer_get("/customer/scheduled-payments/sch_1", "SESSION=demo")
        self.assertEqual(listed, {"items": []})
        self.assertEqual(detail, {"id": "sch_1"})
        self.assertEqual(paths, ["/customer/scheduled-payments", "/customer/scheduled-payments/sch_1"])
        with self.assertRaises(ValueError):
            await gateway.customer_get("/customer/scheduled-payments/sch_1/execute", "SESSION=demo")
        with self.assertRaises(ValueError):
            await gateway.customer_get("/customer/scheduled-payments/../accounts", "SESSION=demo")
        self.assertEqual(len(paths), 2)


if __name__ == "__main__":
    unittest.main()

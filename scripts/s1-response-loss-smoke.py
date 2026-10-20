"""Disposable S1 fault: Spring commits a transfer; the proxy drops its HTTP response."""

from __future__ import annotations

import asyncio
import json
import os
import re
import sys
from decimal import Decimal
from pathlib import Path
from uuid import uuid4

import httpx
import psycopg

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "services" / "agent-runtime"))
sys.path.insert(0, str(ROOT / "services" / "agent-runtime" / "tests"))

from app.agent_v2.runtime import AgentRuntimeV2  # noqa: E402
from app.agent_v2.state_store import PostgresTaskStore  # noqa: E402
from app.banking import BankingGateway  # noqa: E402
from app.task_models import ConfirmRequest  # noqa: E402
from test_agent_v2 import SequencePlanner  # noqa: E402


class OneShotResponseLossProxy:
    def __init__(self, upstream: str):
        self.upstream = upstream
        self.dropped = False
        self.bank_status: int | None = None
        self.server: asyncio.AbstractServer | None = None

    async def start(self) -> str:
        self.server = await asyncio.start_server(self.handle, "127.0.0.1", 0)
        return f"http://127.0.0.1:{self.server.sockets[0].getsockname()[1]}"

    async def handle(self, reader: asyncio.StreamReader, writer: asyncio.StreamWriter) -> None:
        try:
            head = await asyncio.wait_for(reader.readuntil(b"\r\n\r\n"), timeout=20)
            lines = head.decode("iso-8859-1").split("\r\n")
            method, path, _ = lines[0].split(" ", 2)
            headers = {}
            for line in lines[1:]:
                if ":" in line:
                    key, value = line.split(":", 1)
                    if key.lower() not in {"host", "connection", "content-length", "accept-encoding"}:
                        headers[key] = value.strip()
            size = int(next((line.split(":", 1)[1].strip() for line in lines[1:]
                             if line.lower().startswith("content-length:")), "0"))
            if size > 65536:
                raise ValueError("Oversized test request")
            body = await reader.readexactly(size) if size else b""
            async with httpx.AsyncClient(base_url=self.upstream, timeout=20) as client:
                response = await client.request(method, path, headers=headers, content=body)
            if method == "POST" and path == "/customer/transfers" and not self.dropped:
                self.bank_status = response.status_code
                if response.status_code not in {200, 201}:
                    raise AssertionError(f"Bank did not commit: HTTP {response.status_code}")
                self.dropped = True
                # The bank has responded to this isolated proxy. Send a deliberately
                # truncated HTTP body, then close the client connection. The Agent
                # sees an actual httpx protocol/network error, never the receipt.
                writer.write(b"HTTP/1.1 200 OK\r\nContent-Length: 999999\r\n\r\n")
                await writer.drain()
                return
            payload = response.content
            writer.write((f"HTTP/1.1 {response.status_code} OK\r\n"
                          f"Content-Type: application/json\r\nContent-Length: {len(payload)}\r\n"
                          "Connection: close\r\n\r\n").encode() + payload)
            await writer.drain()
        finally:
            writer.close()
            await writer.wait_closed()

    async def close(self) -> None:
        if self.server:
            self.server.close()
            await self.server.wait_closed()


def snapshot(dsn: str) -> dict[str, str | int]:
    with psycopg.connect(dsn) as db:
        balance = db.execute("SELECT balance FROM accounts WHERE account_id='acc_current'").fetchone()[0]
        intents = db.execute("SELECT count(*) FROM transfer_intents WHERE customer_id='usr_aster_alex'").fetchone()[0]
        transfers = db.execute("SELECT count(*) FROM transfers WHERE customer_id='usr_aster_alex'").fetchone()[0]
        debits = db.execute("SELECT count(*) FROM transactions WHERE customer_id='usr_aster_alex' "
                            "AND type='BANK_TRANSFER' AND direction='DEBIT'").fetchone()[0]
    return {"balance": str(balance), "intents": intents, "transfers": transfers,
            "debit_transactions": debits}


async def main() -> None:
    if os.getenv("ASTER_S1_SANDBOX") != "1":
        raise RuntimeError("This financial fault test requires an isolated S1 sandbox")
    bank_origin = os.environ["BANKING_API_BASE_URL"]
    dsn = os.environ["R1_TEST_DATABASE_URL"]
    if bank_origin != "http://banking-core:8080" or "@postgres:5432/" not in dsn:
        raise RuntimeError("Refusing a non-isolated bank or database")
    before = snapshot(dsn)
    async with httpx.AsyncClient(base_url=bank_origin, timeout=20) as browser:
        session = await browser.get("/customer/session")
        csrf = browser.cookies.get("XSRF-TOKEN")
        assert session.status_code in {200, 401} and csrf
        login = await browser.post("/customer/auth/login", json={
            "email": "alex@aster.local", "password": "demo-password"},
            headers={"X-XSRF-TOKEN": csrf})
        assert login.status_code == 200, f"Login HTTP {login.status_code}"
        await browser.get("/customer/session")
        csrf = browser.cookies.get("XSRF-TOKEN")
        cookie = "; ".join(f"{name}={value}" for name, value in browser.cookies.items())
        proxy = OneShotResponseLossProxy(bank_origin)
        proxy_origin = await proxy.start()
        try:
            first = AgentRuntimeV2(BankingGateway(proxy_origin), SequencePlanner(),
                                   state_store=PostgresTaskStore(dsn))
            prepared = await first.chat("给 Lin Wei 转10元", cookie, request_id=uuid4().hex)
            assert prepared.status.value == "WAITING_CONFIRMATION"
            intent = prepared.confirmation
            assert intent["amount"]["amount"] == "10.00"
            prepared_db = snapshot(dsn)
            assert prepared_db["intents"] == before["intents"] + 1
            assert prepared_db["transfers"] == before["transfers"]
            assert prepared_db["balance"] == before["balance"]
            challenge = await browser.post("/customer/auth/step-up-challenges", json={
                "actionType": "TRANSFER_EXECUTE", "resourceType": "TRANSFER_INTENT",
                "resourceId": intent["id"], "resourceHash": intent["intentHash"]},
                headers={"X-XSRF-TOKEN": csrf or ""})
            assert challenge.status_code in {200, 201}, challenge.status_code
            sms = await browser.get(f"/customer/demo/sms/{challenge.json()['id']}")
            assert sms.status_code == 200
            match = re.search(r"(?<!\d)\d{6}(?!\d)", sms.json()["messageBody"])
            assert match
            verified = await browser.post(
                f"/customer/auth/step-up-challenges/{challenge.json()['id']}/verify",
                json={"code": match.group()}, headers={"X-XSRF-TOKEN": csrf or ""})
            assert verified.status_code == 200
            body = ConfirmRequest(intent_id=intent["id"], intent_hash=intent["intentHash"],
                                  action_authorization_id=verified.json()["authorization"]["id"])
            uncertain = await first.confirm(prepared.task_id, body, cookie)
            committed_db = snapshot(dsn)
            assert proxy.dropped and proxy.bank_status in {200, 201}
            assert uncertain.error_code == "EXECUTION_OUTCOME_UNKNOWN"
            assert uncertain.status.value == "WAITING_AUTH"
            assert committed_db["transfers"] == before["transfers"] + 1
            assert Decimal(before["balance"]) - Decimal(committed_db["balance"]) == Decimal("10.00")
            restarted = AgentRuntimeV2(BankingGateway(bank_origin), SequencePlanner(),
                                       state_store=PostgresTaskStore(dsn))
            owned = await restarted.get(prepared.task_id, cookie)
            assert owned.status.value == "WAITING_AUTH" and owned.confirmation["id"] == intent["id"]
            assert owned.error_code == "EXECUTION_OUTCOME_UNKNOWN"
            reconciled = await restarted.confirm(prepared.task_id, body, cookie)
            after = snapshot(dsn)
            assert reconciled.status.value == "SUCCEEDED", reconciled.status
            assert after == committed_db, (after, committed_db)
            with psycopg.connect(dsn) as db:
                bank_status = db.execute("SELECT status FROM transfer_intents WHERE intent_id=%s",
                                         (intent["id"],)).fetchone()[0]
                checkpoint = db.execute("SELECT checkpoint FROM agent_state.tasks WHERE task_id=%s",
                                        (prepared.task_id,)).fetchone()[0]
            assert bank_status == "EXECUTED"
            assert checkpoint["status"] == "SUCCEEDED"
            summary = {"case_id": "S1-R04-SPRING-COMMIT-RESPONSE-LOST", "status": "TEST PASS",
                       "fault": "isolated HTTP proxy truncated execute response after Spring 200/201",
                       "bank_http_status": proxy.bank_status,
                       "uncertain_task_status": uncertain.status.value,
                       "recovered_task_status": reconciled.status.value,
                       "bank_intent_status": bank_status,
                       "new_intents": after["intents"] - before["intents"],
                       "new_transfers": after["transfers"] - before["transfers"],
                       "new_debit_transactions": after["debit_transactions"] - before["debit_transactions"],
                       "source_debit": str(Decimal(before["balance"]) - Decimal(after["balance"])),
                       "same_task": checkpoint["task_id"] == prepared.task_id,
                       "same_intent": owned.confirmation["id"] == intent["id"]}
            output = ROOT / "artifacts" / "s1-response-loss-smoke.json"
            output.parent.mkdir(exist_ok=True)
            output.write_text(json.dumps(summary, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
            print(json.dumps(summary, ensure_ascii=False))
        finally:
            await proxy.close()


if __name__ == "__main__":
    asyncio.run(main())

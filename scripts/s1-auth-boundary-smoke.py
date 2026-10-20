"""Real isolated Spring checks: CSRF before validation and customer object ownership."""

from __future__ import annotations

import asyncio
import json
import os
from pathlib import Path

import httpx
import psycopg

ROOT = Path(__file__).resolve().parents[1]


async def login(origin: str, email: str) -> tuple[httpx.AsyncClient, str]:
    client = httpx.AsyncClient(base_url=origin, timeout=15)
    await client.get("/customer/session")
    csrf = client.cookies.get("XSRF-TOKEN")
    assert csrf
    response = await client.post("/customer/auth/login",
                                 json={"email": email, "password": "demo-password"},
                                 headers={"X-XSRF-TOKEN": csrf})
    assert response.status_code == 200, f"Login HTTP {response.status_code}"
    await client.get("/customer/session")
    return client, client.cookies.get("XSRF-TOKEN") or csrf


async def main() -> None:
    origin = os.getenv("S1_BANK_ORIGIN", "http://127.0.0.1:18088")
    dsn = os.environ["S1_DATABASE_URL"]
    with psycopg.connect(dsn) as db:
        before = db.execute("SELECT count(*) FROM transfer_intents").fetchone()[0]
    alex, alex_csrf = await login(origin, "alex@aster.local")
    lin, _ = await login(origin, "lin@aster.local")
    try:
        accounts = await alex.get("/customer/accounts")
        assert accounts.status_code == 200
        account_payload = accounts.json()
        account_items = account_payload.get("accounts", []) if isinstance(account_payload, dict) else account_payload
        assert isinstance(account_items, list) and account_items
        owned = account_items[0]["id"]
        own_read = await alex.get(f"/customer/accounts/{owned}")
        foreign_read = await lin.get(f"/customer/accounts/{owned}")
        no_csrf = await alex.post("/customer/transfer-intents", json={})
        with_csrf = await alex.post("/customer/transfer-intents", json={},
                                   headers={"X-XSRF-TOKEN": alex_csrf})
        with psycopg.connect(dsn) as db:
            after = db.execute("SELECT count(*) FROM transfer_intents").fetchone()[0]
        assert own_read.status_code == 200, own_read.status_code
        assert foreign_read.status_code in {403, 404}, foreign_read.status_code
        assert no_csrf.status_code == 403, no_csrf.status_code
        assert with_csrf.status_code in {400, 422}, with_csrf.status_code
        assert after == before, (before, after)
        result = {"case_id": "S1-AUTH-OBJECT-CSRF", "status": "TEST PASS",
                  "owned_read": own_read.status_code,
                  "cross_customer_read": foreign_read.status_code,
                  "no_csrf_prepare": no_csrf.status_code,
                  "valid_csrf_invalid_body": with_csrf.status_code,
                  "transfer_intent_delta": after - before}
        output = ROOT / "artifacts" / "s1-auth-boundary-smoke.json"
        output.write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")
        print(json.dumps(result, ensure_ascii=False))
    finally:
        await alex.aclose()
        await lin.aclose()


if __name__ == "__main__":
    asyncio.run(main())

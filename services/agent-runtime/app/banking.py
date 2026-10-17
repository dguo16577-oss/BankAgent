"""Fixed, read-only HTTP boundary to Banking Core.

The model and the request body never control an HTTP method, path or base URL.
Customer requests always carry the caller's original Spring Session cookie.
"""

from __future__ import annotations

import os
import re
from http.cookies import SimpleCookie
from typing import Any
from urllib.parse import unquote, urlparse

import httpx


CUSTOMER_GET_PATHS = frozenset(
    {
        "/customer/session",
        "/customer/accounts",
        "/customer/transactions",
        "/customer/spending/summary",
        "/customer/recipients",
        "/customer/cards",
        "/customer/applications",
        "/customer/credit-limit-applications",
        "/customer/recurring-payments",
        "/customer/renewal-reminders",
        "/customer/in-app-notifications",
        "/customer/scheduled-payments",
        "/customer/split-bills",
        "/customer/wealth/products",
        "/customer/wealth/portfolio",
        "/customer/wealth/risk-profile",
    }
)
PUBLIC_GET_PATHS = frozenset(
    {
        "/public/catalog",
        "/public/support/articles",
        "/public/rates",
        "/public/offers",
    }
)


class BankingAuthenticationError(Exception):
    """Spring rejected the caller's session."""


class BankingUnavailableError(Exception):
    """A required Banking Core read was not available."""


class BankingApiError(Exception):
    def __init__(self, status: int, code: str):
        self.status = status
        self.code = code
        super().__init__(code)


class BankingGateway:
    def __init__(
        self,
        base_url: str | None = None,
        *,
        transport: httpx.AsyncBaseTransport | None = None,
    ) -> None:
        value = (base_url or os.getenv("BANKING_API_BASE_URL", "http://127.0.0.1:18080")).rstrip("/")
        parsed = urlparse(value)
        if parsed.scheme not in {"http", "https"} or not parsed.netloc or parsed.path or parsed.query or parsed.fragment or parsed.username:
            raise ValueError("BANKING_API_BASE_URL must be an HTTP(S) origin")
        self.base_url = value
        self.transport = transport

    async def customer_get(self, path: str, cookie: str, *, params: dict[str, str | int] | None = None) -> dict[str, Any]:
        entity_read = bool(re.fullmatch(r"/customer/(?:accounts|cards|applications|card-action-intents|credit-limit-applications|transfer-intents|scheduled-payments|scheduled-payment-intents|split-bills|split-action-intents|recurring-payments|recurring-payment-action-intents|renewal-reminders|renewal-reminder-action-intents|investment-order-intents|investment-redemption-intents|wealth/products|wealth/suitability-checks)/[A-Za-z0-9_-]{1,128}", path))
        if path not in CUSTOMER_GET_PATHS and not entity_read:
            raise ValueError("Customer tool is not on the read-only allowlist")
        if not cookie:
            raise BankingAuthenticationError
        query_keys = ({"from", "to", "status", "direction", "type", "category", "search", "cursor", "limit", "accountId", "cardId"}
                      if path == "/customer/transactions" else {"from", "to", "compareFrom", "compareTo", "accountId"}
                      if path == "/customer/spending/summary" else {"search"}
                      if path == "/customer/recipients" else {"role"}
                      if path == "/customer/split-bills" else {"type", "riskLevel"}
                      if path == "/customer/wealth/products" else set())
        if params and set(params) - query_keys:
            raise ValueError("Unsupported customer query")
        result = await self._get(path, {"Cookie": cookie}, params=params)
        assert result is not None
        return result

    async def customer_get_optional(self, path: str, cookie: str) -> dict[str, Any] | None:
        """Read an owner-scoped receipt or recipient; 404 means no verified history link.

        These paths are constructed by trusted code from strictly validated IDs. They
        are never supplied by the model as a raw path or exposed as model tools.
        """
        if not re.fullmatch(r"/customer/(?:transfers|recipients)/[A-Za-z0-9_-]{1,128}", path):
            raise ValueError("Customer history link path is not on the read-only allowlist")
        if not cookie:
            raise BankingAuthenticationError
        return await self._get(path, {"Cookie": cookie}, allow_not_found=True)

    async def prepare_transfer(self, cookie: str, body: dict[str, Any], key: str | None = None) -> dict[str, Any]:
        if key is not None and not re.fullmatch(r"[A-Za-z0-9_-]{1,128}", key):
            raise ValueError("Invalid idempotency key")
        return await self._mutation("/customer/transfer-intents", cookie, body, key=key)

    async def prepare_card_action(self, cookie: str, body: dict[str, Any]) -> dict[str, Any]:
        return await self._mutation("/customer/card-action-intents", cookie, body)

    async def cancel_card_action(self, cookie: str, intent_id: str) -> dict[str, Any]:
        if not re.fullmatch(r"[A-Za-z0-9_-]{1,128}", intent_id):
            raise ValueError("Invalid intent ID")
        return await self._mutation(f"/customer/card-action-intents/{intent_id}/cancel", cookie, {})

    async def execute_card_action(self, cookie: str, body: dict[str, Any], key: str) -> dict[str, Any]:
        if not re.fullmatch(r"[A-Za-z0-9_-]{1,128}", key):
            raise ValueError("Invalid idempotency key")
        return await self._mutation("/customer/card-actions", cookie, body, key=key)

    async def prepare_card_application(self, cookie: str, body: dict[str, Any]) -> dict[str, Any]:
        return await self._mutation("/customer/application-intents", cookie, body)

    async def cancel_card_application(self, cookie: str, intent_id: str) -> dict[str, Any]:
        if not re.fullmatch(r"[A-Za-z0-9_-]{1,128}", intent_id):
            raise ValueError("Invalid intent ID")
        await self._mutation(f"/customer/application-intents/{intent_id}/cancel", cookie, {})
        return {"id": intent_id, "status": "CANCELLED"}

    async def submit_card_application(self, cookie: str, body: dict[str, Any], key: str) -> dict[str, Any]:
        if not re.fullmatch(r"[A-Za-z0-9_-]{1,128}", key):
            raise ValueError("Invalid idempotency key")
        return await self._mutation("/customer/applications", cookie, body, key=key)

    async def prepare_credit_limit_application(self, cookie: str, body: dict[str, Any]) -> dict[str, Any]:
        return await self._mutation("/customer/credit-limit-intents", cookie, body)

    async def cancel_credit_limit_application(self, cookie: str, intent_id: str) -> dict[str, Any]:
        if not re.fullmatch(r"[A-Za-z0-9_-]{1,128}", intent_id):
            raise ValueError("Invalid intent ID")
        return await self._mutation(f"/customer/credit-limit-intents/{intent_id}/cancel", cookie, {})

    async def submit_credit_limit_application(self, cookie: str, body: dict[str, Any], key: str) -> dict[str, Any]:
        if not re.fullmatch(r"[A-Za-z0-9_-]{1,128}", key):
            raise ValueError("Invalid idempotency key")
        return await self._mutation("/customer/credit-limit-applications", cookie, body, key=key)

    async def check_investment_suitability(self, cookie: str, product_id: str) -> dict[str, Any]:
        return await self._mutation("/customer/wealth/suitability-checks", cookie, {"productId": product_id})

    async def prepare_investment_purchase(self, cookie: str, body: dict[str, Any]) -> dict[str, Any]:
        return await self._mutation("/customer/investment-order-intents", cookie, body)

    async def cancel_investment_purchase(self, cookie: str, intent_id: str) -> dict[str, Any]:
        if not re.fullmatch(r"[A-Za-z0-9_-]{1,128}", intent_id):
            raise ValueError("Invalid intent ID")
        return await self._mutation(f"/customer/investment-order-intents/{intent_id}/cancel", cookie, {})

    async def execute_investment_purchase(self, cookie: str, body: dict[str, Any], key: str) -> dict[str, Any]:
        if not re.fullmatch(r"[A-Za-z0-9_-]{1,128}", key):
            raise ValueError("Invalid idempotency key")
        return await self._mutation("/customer/investment-orders", cookie, body, key=key)

    async def prepare_investment_redemption(self, cookie: str, body: dict[str, Any]) -> dict[str, Any]:
        return await self._mutation("/customer/investment-redemption-intents", cookie, body)

    async def cancel_investment_redemption(self, cookie: str, intent_id: str) -> dict[str, Any]:
        if not re.fullmatch(r"[A-Za-z0-9_-]{1,128}", intent_id):
            raise ValueError("Invalid intent ID")
        return await self._mutation(f"/customer/investment-redemption-intents/{intent_id}/cancel", cookie, {})

    async def execute_investment_redemption(self, cookie: str, body: dict[str, Any], key: str) -> dict[str, Any]:
        if not re.fullmatch(r"[A-Za-z0-9_-]{1,128}", key):
            raise ValueError("Invalid idempotency key")
        return await self._mutation("/customer/investment-redemptions", cookie, body, key=key)

    async def prepare_schedule_action(self, cookie: str, body: dict[str, Any]) -> dict[str, Any]:
        return await self._mutation("/customer/scheduled-payment-intents", cookie, body)

    async def cancel_schedule_intent(self, cookie: str, intent_id: str, reason: str) -> dict[str, Any]:
        if not re.fullmatch(r"[A-Za-z0-9_-]{1,128}", intent_id):
            raise ValueError("Invalid intent ID")
        if reason not in {"USER_CANCELLED", "TASK_REVISED", "TASK_FAILED", "MAX_STEPS_EXCEEDED", "REPLACED_BY_NEW_INTENT"}:
            raise ValueError("Invalid cancellation reason")
        return await self._mutation(f"/customer/scheduled-payment-intents/{intent_id}/cancel", cookie, {"reason": reason})

    async def execute_schedule_action(self, cookie: str, body: dict[str, Any], key: str) -> dict[str, Any]:
        if not re.fullmatch(r"[A-Za-z0-9_-]{1,128}", key):
            raise ValueError("Invalid idempotency key")
        return await self._mutation("/customer/scheduled-payment-actions", cookie, body, key=key)

    async def prepare_split_action(self, cookie: str, body: dict[str, Any]) -> dict[str, Any]:
        return await self._mutation("/customer/split-action-intents", cookie, body)

    async def cancel_split_intent(self, cookie: str, intent_id: str, reason: str) -> dict[str, Any]:
        if not re.fullmatch(r"[A-Za-z0-9_-]{1,128}", intent_id):
            raise ValueError("Invalid intent ID")
        if reason not in {"USER_CANCELLED", "TASK_REVISED", "TASK_FAILED", "MAX_STEPS_EXCEEDED", "REPLACED_BY_NEW_INTENT"}:
            raise ValueError("Invalid cancellation reason")
        return await self._mutation(f"/customer/split-action-intents/{intent_id}/cancel", cookie, {"reason": reason})

    async def execute_split_action(self, cookie: str, body: dict[str, Any], key: str) -> dict[str, Any]:
        if not re.fullmatch(r"[A-Za-z0-9_-]{1,128}", key):
            raise ValueError("Invalid idempotency key")
        return await self._mutation("/customer/split-actions", cookie, body, key=key)

    async def prepare_stop_recurring(self, cookie: str, recurring_id: str) -> dict[str, Any]:
        if not re.fullmatch(r"[A-Za-z0-9_-]{1,128}", recurring_id):
            raise ValueError("Invalid recurring payment ID")
        return await self._mutation("/customer/recurring-payment-action-intents", cookie,
                                    {"actionType": "STOP_FUTURE_PAYMENTS", "recurringPaymentId": recurring_id})

    async def cancel_stop_recurring(self, cookie: str, intent_id: str) -> dict[str, Any]:
        if not re.fullmatch(r"[A-Za-z0-9_-]{1,128}", intent_id):
            raise ValueError("Invalid intent ID")
        return await self._mutation(f"/customer/recurring-payment-action-intents/{intent_id}/cancel", cookie, {})

    async def execute_stop_recurring(self, cookie: str, body: dict[str, Any], key: str) -> dict[str, Any]:
        if not re.fullmatch(r"[A-Za-z0-9_-]{1,128}", key):
            raise ValueError("Invalid idempotency key")
        return await self._mutation("/customer/recurring-payment-actions", cookie, body, key=key)

    async def prepare_renewal_reminder(self, cookie: str, body: dict[str, Any]) -> dict[str, Any]:
        return await self._mutation("/customer/renewal-reminder-action-intents", cookie, body)

    async def cancel_renewal_reminder(self, cookie: str, intent_id: str) -> dict[str, Any]:
        if not re.fullmatch(r"[A-Za-z0-9_-]{1,128}", intent_id):
            raise ValueError("Invalid intent ID")
        return await self._mutation(f"/customer/renewal-reminder-action-intents/{intent_id}/cancel", cookie, {})

    async def execute_renewal_reminder(self, cookie: str, body: dict[str, Any], key: str) -> dict[str, Any]:
        if not re.fullmatch(r"[A-Za-z0-9_-]{1,128}", key):
            raise ValueError("Invalid idempotency key")
        return await self._mutation("/customer/renewal-reminder-actions", cookie, body, key=key)

    async def cancel_transfer_intent(self, cookie: str, intent_id: str, reason: str) -> dict[str, Any]:
        """Trusted lifecycle operation; never exposed as a planner tool."""
        if not re.fullmatch(r"[A-Za-z0-9_-]{1,128}", intent_id):
            raise ValueError("Invalid intent ID")
        if reason not in {"USER_CANCELLED", "TASK_REVISED", "TASK_FAILED", "MAX_STEPS_EXCEEDED", "REPLACED_BY_NEW_INTENT"}:
            raise ValueError("Invalid cancellation reason")
        return await self._mutation(f"/customer/transfer-intents/{intent_id}/cancel", cookie, {"reason": reason})

    async def execute_transfer(self, cookie: str, body: dict[str, Any], key: str) -> dict[str, Any]:
        """Trusted runtime only; deliberately absent from the LLM tool registry."""
        if not re.fullmatch(r"[A-Za-z0-9_-]{1,128}", key):
            raise ValueError("Invalid idempotency key")
        return await self._mutation("/customer/transfers", cookie, body, key=key)

    async def _mutation(self, path: str, cookie: str, body: dict[str, Any], *, key: str | None = None) -> dict[str, Any]:
        if not cookie:
            raise BankingAuthenticationError
        parsed = SimpleCookie()
        try:
            parsed.load(cookie)
            csrf = unquote(parsed["XSRF-TOKEN"].value)
        except (KeyError, ValueError) as exc:
            raise BankingApiError(403, "CSRF_TOKEN_REQUIRED") from exc
        headers = {"Cookie": cookie, "X-XSRF-TOKEN": csrf}
        if key:
            headers["Idempotency-Key"] = key
        try:
            async with httpx.AsyncClient(base_url=self.base_url, transport=self.transport,
                                         timeout=httpx.Timeout(10.0), follow_redirects=False) as client:
                response = await client.post(path, headers=headers, json=body)
        except httpx.HTTPError as exc:
            raise BankingUnavailableError from exc
        if response.status_code == 401:
            raise BankingAuthenticationError
        if response.status_code == 204:
            return {}
        try:
            payload = response.json()
        except ValueError as exc:
            raise BankingUnavailableError from exc
        if response.status_code not in {200, 201}:
            code = payload.get("code", "BANKING_REQUEST_FAILED") if isinstance(payload, dict) else "BANKING_REQUEST_FAILED"
            raise BankingApiError(response.status_code, str(code))
        if not isinstance(payload, dict):
            raise BankingUnavailableError
        return payload

    async def public_get(self, path: str) -> dict[str, Any]:
        if path not in PUBLIC_GET_PATHS and not re.fullmatch(r"/public/catalog/[A-Za-z0-9_-]{1,128}", path):
            raise ValueError("Public tool is not on the read-only allowlist")
        result = await self._get(path, {})
        assert result is not None
        return result

    async def _get(self, path: str, headers: dict[str, str], *, params: dict[str, str | int] | None = None,
                   allow_not_found: bool = False) -> dict[str, Any] | None:
        try:
            async with httpx.AsyncClient(
                base_url=self.base_url,
                transport=self.transport,
                timeout=httpx.Timeout(5.0),
                follow_redirects=False,
            ) as client:
                response = await client.get(path, headers=headers, params=params)
        except httpx.HTTPError as exc:
            raise BankingUnavailableError from exc
        if response.status_code == 401:
            raise BankingAuthenticationError
        if response.status_code == 404 and allow_not_found:
            return None
        if response.status_code != 200:
            if path == "/customer/wealth/risk-profile" and response.status_code == 404:
                try:
                    payload = response.json()
                except ValueError:
                    payload = None
                if isinstance(payload, dict) and payload.get("code") == "RISK_PROFILE_NOT_FOUND":
                    raise BankingApiError(404, "RISK_PROFILE_NOT_FOUND")
            raise BankingUnavailableError
        try:
            payload = response.json()
        except ValueError as exc:
            raise BankingUnavailableError from exc
        if not isinstance(payload, dict):
            raise BankingUnavailableError
        return payload

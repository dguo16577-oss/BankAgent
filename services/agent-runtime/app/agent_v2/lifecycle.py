"""Trusted intent cancellation; a failed or uncertain cancellation blocks progress."""

from __future__ import annotations

from ..banking import BankingApiError, BankingGateway, BankingUnavailableError
from .models import Task


class CancellationUncertain(RuntimeError):
    pass


class LifecycleCoordinator:
    def __init__(self, gateway: BankingGateway):
        self.gateway = gateway

    async def cancel_active(self, task: Task, cookie: str, reason: str) -> str:
        intent = task.active_intent
        if intent is None:
            return "NONE"
        intent_id = intent["id"]
        kind = task.active_intent_kind or "TRANSFER"
        path = (f"/customer/scheduled-payment-intents/{intent_id}" if kind == "SCHEDULE" else
                f"/customer/split-action-intents/{intent_id}" if kind == "SPLIT" else
                f"/customer/recurring-payment-action-intents/{intent_id}" if kind == "RECURRING_STOP" else
                f"/customer/renewal-reminder-action-intents/{intent_id}" if kind == "RENEWAL_REMINDER" else
                f"/customer/card-action-intents/{intent_id}" if kind == "CARD_ACTION" else
                f"/customer/investment-order-intents/{intent_id}" if kind == "INVESTMENT_PURCHASE" else
                f"/customer/investment-redemption-intents/{intent_id}" if kind == "INVESTMENT_REDEMPTION" else
                f"/customer/transfer-intents/{intent_id}")
        try:
            response = (await self.gateway.cancel_schedule_intent(cookie, intent_id, reason) if kind == "SCHEDULE" else
                        await self.gateway.cancel_split_intent(cookie, intent_id, reason) if kind == "SPLIT" else
                        await self.gateway.cancel_stop_recurring(cookie, intent_id) if kind == "RECURRING_STOP" else
                        await self.gateway.cancel_renewal_reminder(cookie, intent_id) if kind == "RENEWAL_REMINDER" else
                        await self.gateway.cancel_card_action(cookie, intent_id) if kind == "CARD_ACTION" else
                        await self.gateway.cancel_card_application(cookie, intent_id) if kind == "CARD_APPLICATION" else
                        await self.gateway.cancel_credit_limit_application(cookie, intent_id) if kind == "CREDIT_LIMIT_APPLICATION" else
                        await self.gateway.cancel_investment_purchase(cookie, intent_id) if kind == "INVESTMENT_PURCHASE" else
                        await self.gateway.cancel_investment_redemption(cookie, intent_id) if kind == "INVESTMENT_REDEMPTION" else
                        await self.gateway.cancel_transfer_intent(cookie, intent_id, reason))
        except (BankingUnavailableError, BankingApiError):
            if kind in {"CARD_APPLICATION", "CREDIT_LIMIT_APPLICATION"}:
                raise CancellationUncertain("BANK_INTENT_STATE_UNKNOWN")
            try:
                response = await self.gateway.customer_get(path, cookie)
            except (BankingUnavailableError, BankingApiError) as exc:
                raise CancellationUncertain("BANK_INTENT_STATE_UNKNOWN") from exc
        status = response.get("status")
        if response.get("id") != intent_id or status not in {"CANCELLED", "EXPIRED", "EXECUTED"}:
            raise CancellationUncertain("BANK_INTENT_NOT_TERMINAL")
        if status == "EXECUTED":
            # The task cannot revise an already executed transfer.
            raise CancellationUncertain("BANK_INTENT_ALREADY_EXECUTED")
        task.trace.append({"kind": "INTENT_CANCELLED", "intent_id": intent_id, "bank_status": status, "reason": reason})
        for binding in task.financial_terms:
            if binding.get("intent_id") == intent_id:
                binding["status"] = status
        task.active_intent = None
        task.active_intent_kind = None
        return status

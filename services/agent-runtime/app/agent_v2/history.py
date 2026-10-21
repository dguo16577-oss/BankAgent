"""Reauthenticated, read-only history; never transfers an old session's authority."""
from __future__ import annotations

import re

from ..banking import BankingApiError


class TaskHistoryService:
    def __init__(self, runtime):
        self.runtime = runtime

    async def list(self, cookie: str) -> list[dict]:
        _, customer = await self.runtime._identity(cookie)
        store = self.runtime.state_store
        tasks = store.history_list(customer) if store else []
        return [self._summary(task) for task in tasks[:10] if task.customer_id == customer]

    @staticmethod
    def _summary(task) -> dict:
        from ..agui_adapter import _safe_text
        return {"task_id": task.task_id, "goal": _safe_text(task.goal)[:2000],
                "status": task.status.value, "read_only": True,
                "confirmation_required": False,
                "next_action": ("RECONCILE_WITH_BANK" if task.execution_uncertain else
                                "NEW_REVIEW_REQUIRED" if task.active_intent else "NONE")}

    async def get(self, task_id: str, cookie: str) -> dict:
        _, customer = await self.runtime._identity(cookie)
        store = self.runtime.state_store
        task = store.history_load(task_id, customer) if store else None
        if task is None or task.customer_id != customer:
            raise BankingApiError(404, "AGENT_TASK_NOT_FOUND")
        view = self._summary(task)
        receipts = []
        # Only immutable transfer receipts have an established authority GET here.
        # Other action records remain unverified rather than inferring execution.
        for action in task.completed_actions[:5]:
            receipt_id = action.get("receipt_id")
            entry = {"kind": action.get("kind"), "verification": "NOT_VERIFIED"}
            if isinstance(receipt_id, str) and re.fullmatch(r"[A-Za-z0-9_-]{1,128}", receipt_id):
                entry["receipt_id"] = receipt_id
                if action.get("kind") == "TRANSFER":
                    try:
                        record = await self.runtime.gateway.customer_get(
                            f"/customer/transfers/{receipt_id}", cookie)
                        if record.get("id") == receipt_id:
                            entry.update(verification="VERIFIED_BANK_RECORD",
                                         bank_status=record.get("status"))
                    except BankingApiError:
                        pass
            receipts.append(entry)
        view["receipts"] = receipts
        return view

"""Structured tool decisions over a privacy-minimized transfer context."""

from __future__ import annotations

import json
from typing import Protocol

import httpx
from pydantic import ValidationError

from .deepseek import DeepSeekClassifier
from .task_models import PlannerDecision, TaskState


def next_required_tool(task: TaskState) -> str | None:
    successful = {step.tool for step in task.plan.steps if step.status == "SUCCEEDED"}
    if "list_accounts" not in successful:
        return "list_accounts"
    if "resolve_recipient" not in successful or not task.slots.recipient_id:
        return "resolve_recipient"
    if not task.active_intent:
        return "prepare_transfer"
    if "get_transfer_intent" not in successful:
        return "get_transfer_intent"
    return None


class Planner(Protocol):
    async def next_action(self, task: TaskState, allowed: list[str]) -> PlannerDecision: ...


class ScriptedPlanner:
    """Explicit offline fallback; responses must never be labelled LLM-assisted."""

    async def next_action(self, task: TaskState, allowed: list[str]) -> PlannerDecision:
        if not allowed:
            return PlannerDecision(type="COMPLETE", message="已准备好转账，请核对详情。")
        return PlannerDecision(type="TOOL_CALL", tool=allowed[0], arguments={})


class DeepSeekToolPlanner:
    def __init__(self, classifier: DeepSeekClassifier):
        self.classifier = classifier
        self.last_mode = "DETERMINISTIC"

    async def next_action(self, task: TaskState, allowed: list[str]) -> PlannerDecision:
        if not self.classifier.key:
            self.last_mode = "DETERMINISTIC"
            return await ScriptedPlanner().next_action(task, allowed)
        # No raw message, recipient name/ID, amount, bank result, Cookie, or
        # credential is sent. The model chooses an Agent tool, not its authority.
        context = {
            "goal": "prepare a customer transfer for explicit review",
            "available_tools": allowed,
            "has_amount": bool(task.slots.amount),
            "has_recipient_query": bool(task.slots.recipient_query),
            "has_recipient_id": bool(task.slots.recipient_id),
            "has_source_account_id": bool(task.slots.source_account_id),
            "completed_steps": [step.tool for step in task.plan.steps if step.status == "SUCCEEDED"],
            "observations": [{"tool": step.tool,
                              "result": {key: value for key, value in (step.result or {}).items() if key in {"count", "status"}}}
                             for step in task.plan.steps if step.status == "SUCCEEDED"],
        }
        try:
            result = await self.classifier._json_completion(
                'You are a banking workflow planner. Choose exactly one next action from available_tools. '
                'Return strict JSON: {"type":"TOOL_CALL","tool":"one available tool","arguments":{}}. '
                'If available_tools is empty, return {"type":"COMPLETE","message":"Prepared for user review"}. '
                'Never select execute_transfer or claim money moved. The runtime owns all arguments and policy.',
                json.dumps(context, separators=(",", ":")), 120,
            )
            decision = PlannerDecision.model_validate(result)
            if decision.type == "TOOL_CALL" and (decision.tool not in allowed or decision.arguments != {}):
                raise ValueError("Planner selected an unauthorized tool or argument")
            if decision.type == "COMPLETE" and allowed:
                raise ValueError("Planner attempted premature completion")
            if decision.type == "ASK_USER" and allowed:
                raise ValueError("Planner cannot skip required validation")
            self.last_mode = "DEEPSEEK"
            return decision
        except httpx.HTTPError:
            self.last_mode = "DETERMINISTIC"
            return await ScriptedPlanner().next_action(task, allowed)
        except (ValidationError, ValueError, KeyError, IndexError, TypeError) as exc:
            raise ValueError("Invalid structured planner decision") from exc

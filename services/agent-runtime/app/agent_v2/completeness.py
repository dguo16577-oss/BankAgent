"""Evidence-backed completion checks; a plan is never financial authorization."""

from __future__ import annotations

from .models import Task


_PREPARE_RECEIPTS = {
    "prepare_transfer": "confirmed_transfer",
    "prepare_scheduled_transfer": "confirmed_schedule",
    "prepare_cancel_scheduled_transfer": "confirmed_schedule",
    "prepare_split_request": "confirmed_split",
    "prepare_cancel_split_request": "confirmed_split",
    "prepare_investment_purchase": "confirmed_investment_purchase",
    "prepare_investment_redemption": "confirmed_investment_redemption",
    "prepare_card_action": "confirmed_card_action",
    "prepare_card_application": "confirmed_card_application",
    "prepare_credit_limit_application": "confirmed_credit_limit_application",
    "prepare_stop_recurring_payment": "confirmed_recurring_stop",
    "prepare_renewal_reminder": "confirmed_renewal_reminder",
}


def preparation_blocker(task: Task, tool_name: str, step_id: str | None = None) -> str | None:
    """Check model-declared dependencies before a financial PREPARE reaches the bank."""
    if task.execution_uncertain:
        return "EXECUTION_OUTCOME_UNKNOWN"
    if not task.ledger:
        return None  # Legacy deterministic planners do not propose a ledger.
    receipt_name = _PREPARE_RECEIPTS.get(tool_name)
    if receipt_name is None:
        return "UNKNOWN_FINANCIAL_PREPARATION"
    update_ledger(task)
    targets = [step for step in task.ledger if step.get("kind") == "FINANCIAL_ACTION"
               and receipt_name in step.get("evidence_tools", []) and step.get("status") != "SUCCEEDED"
               and (step_id is None or step.get("step_id") == step_id)]
    if not targets:
        return "FINANCIAL_ACTION_NOT_IN_TASK_LEDGER"
    if len(targets) != 1:
        return "FINANCIAL_STEP_AMBIGUOUS"
    target = targets[0]
    if target.get("status") in {"BLOCKED", "FAILED", "SKIPPED_CONDITION_FALSE"}:
        return "PREREQUISITE_NOT_SUCCEEDED"
    by_id = {step.get("step_id"): step for step in task.ledger}
    if any(by_id.get(dep, {}).get("status") != "SUCCEEDED"
           for dep in target.get("dependencies", [])):
        return "PREREQUISITE_NOT_SUCCEEDED"
    return None


def mark_cancelled_financial_step(task: Task, prepare_tool: str | None) -> None:
    """Record a bank-confirmed cancellation without erasing completed steps."""
    receipt_name = _PREPARE_RECEIPTS.get(prepare_tool or "")
    if receipt_name is None:
        return
    target_id = (task.pending_prepare or {}).get("step_id") or task.selected_financial_step_id
    eligible = [step for step in task.ledger if step.get("kind") == "FINANCIAL_ACTION"
                and receipt_name in step.get("evidence_tools", []) and step.get("status") != "SUCCEEDED"]
    if not target_id and len(eligible) != 1:
        return
    for step in eligible:
        if (step.get("kind") == "FINANCIAL_ACTION"
                and receipt_name in step.get("evidence_tools", [])
                and step.get("status") != "SUCCEEDED" and (target_id is None or step.get("step_id") == target_id)):
            step["status"] = "CANCELLED"
            step["failure_reason"] = "USER_CANCELLED"
            step["evidence_refs"] = []
            break
    update_ledger(task)


def update_ledger(task: Task) -> list[dict[str, object]]:
    missing: list[dict[str, object]] = []
    statuses: dict[str, str] = {}
    used_financial_receipts: set[str] = set()
    used_failures: set[int] = set()
    for step in task.ledger:
        step_id = step.get("step_id")
        if step.get("status") == "SKIPPED_CONDITION_FALSE":
            statuses[step_id] = "SKIPPED_CONDITION_FALSE"
            continue
        if step.get("status") == "CANCELLED":
            step["failure_reason"] = step.get("failure_reason") or "USER_CANCELLED"
            step["evidence_refs"] = []
            statuses[step_id] = "CANCELLED"
            missing.append({"step_id": step_id, "goal": step.get("goal"),
                            "evidence_tools": step.get("evidence_tools", []),
                            "status": "CANCELLED", "failure_reason": step["failure_reason"]})
            continue
        dependencies = step.get("dependencies", [])
        if not isinstance(dependencies, list) or any(
                not isinstance(dep, str) or dep not in statuses for dep in dependencies):
            step["status"] = "BLOCKED"
            step["failure_reason"] = "INVALID_DEPENDENCY_GRAPH"
            step["evidence_refs"] = []
        elif any(statuses[dep] in {"FAILED", "BLOCKED", "CANCELLED", "SKIPPED_CONDITION_FALSE"}
                 for dep in dependencies):
            step["status"] = "BLOCKED"
            step["failure_reason"] = "PREREQUISITE_NOT_SUCCEEDED"
            step["evidence_refs"] = []
        elif any(statuses[dep] != "SUCCEEDED" for dep in dependencies):
            step["status"] = "PENDING"
            step["failure_reason"] = None
            step["evidence_refs"] = []
        else:
            _update_step_evidence(task, step, used_financial_receipts, used_failures)
        statuses[step_id] = step["status"]
        if step["status"] != "SUCCEEDED":
            missing.append({"step_id": step_id, "goal": step.get("goal"),
                            "evidence_tools": step.get("evidence_tools", []),
                            "status": step["status"],
                            "failure_reason": step.get("failure_reason")})
    return missing


def _update_step_evidence(task: Task, step: dict[str, object],
                          used_financial_receipts: set[str], used_failures: set[int]) -> None:
    """A bank receipt can prove only one financial subgoal; a rejection proves none."""
    if step.get("delegation_required") and step.get("delegation_status") != "SUCCEEDED":
        step["status"] = "FAILED" if step.get("delegation_status") == "FAILED" else "PENDING"
        step["failure_reason"] = "DELEGATION_INCOMPLETE"
        step["evidence_refs"] = []
        return
    evidence: list[str] = []
    floor = step.get("observation_floor", 0)
    floor = floor if isinstance(floor, int) and floor >= 0 else 0
    tools = step.get("evidence_tools", [])
    if not isinstance(tools, list):
        tools = []
    if step.get("kind") == "FINANCIAL_ACTION":
        from .financial_terms import receipt_matches
        # A prepared intent is never evidence of an executed bank operation.
        for index, observation in enumerate(task.observations):
            if (index >= floor and
                    observation.success and observation.tool_name.startswith("confirmed_") and
                    observation.tool_name in tools and
                    receipt_matches(task, step, observation.structured_result) and
                    isinstance(observation.structured_result.get("receipt_id"), str) and
                    observation.structured_result["receipt_id"] and
                    observation.structured_result["receipt_id"] not in used_financial_receipts):
                used_financial_receipts.add(observation.structured_result["receipt_id"])
                evidence = [f"observation:{index}"]
                break
        if not evidence:
            for index, failure in enumerate(task.failed_actions):
                if index in used_failures or not isinstance(failure, dict):
                    continue
                receipt_name = "confirmed_" + str(failure.get("kind", "")).lower()
                siblings = [s for s in task.ledger if s.get("kind") == "FINANCIAL_ACTION"
                            and receipt_name in s.get("evidence_tools", [])]
                bound_failure = (failure.get("step_id") == step.get("step_id") if failure.get("step_id")
                                 else len(siblings) == 1)
                if receipt_name in tools and bound_failure:
                    used_failures.add(index)
                    step["status"] = "FAILED"
                    step["failure_reason"] = str(failure.get("error_code") or "BANK_REJECTED")
                    step["evidence_refs"] = []
                    return
    else:
        evidence = [f"observation:{index}" for index, observation in enumerate(task.observations)
                    if index >= floor and observation.success and observation.tool_name in tools]
    step["evidence_refs"] = evidence
    step["status"] = "SUCCEEDED" if evidence else "PENDING"
    step["failure_reason"] = None

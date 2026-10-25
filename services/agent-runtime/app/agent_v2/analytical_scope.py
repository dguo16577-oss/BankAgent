"""Conversation-level analytical filters; the LLM declares changes, the runtime preserves omissions."""

from __future__ import annotations

from typing import Any

from .models import Task, ToolCall


ANALYTICAL_TOOLS = {"list_transactions", "summarize_spending", "detect_transaction_anomalies"}
FILTERS = {"account_id", "card_id", "category", "merchant", "currency", "direction", "type",
           "search", "note_query", "counterparty"}
SUPPORTED = {
    "list_transactions": {"account_id", "card_id", "category", "direction", "type", "search",
                          "note_query", "counterparty", "date_from", "date_to"},
    "summarize_spending": {"account_id", "card_id", "category", "merchant", "currency",
                           "date_from", "date_to"},
    "detect_transaction_anomalies": {"account_id", "card_id", "date_from", "date_to"},
}


def effective_arguments(task: Task, call: ToolCall) -> dict[str, Any]:
    """Only the planner may clear a filter; inherited canonical IDs still pass registry validation."""
    args = dict(call.arguments)
    if call.tool_name not in ANALYTICAL_TOOLS:
        return args
    supported = SUPPORTED[call.tool_name]
    if (task.analytical_scope.get('exact_time_range') == 'true'
            and 'exact_time_range' not in args
            and not any(key in args for key in ('date_from', 'date_to', 'calendar_period'))):
        args['exact_time_range'] = True
    for field, value in task.analytical_scope.items():
        if call.arguments.get('calendar_period') is not None and field in {'date_from', 'date_to'}:
            continue
        # JSON null is an omitted filter, not permission to widen the query.
        # Clearing a previously observed filter requires an explicit scope_clear.
        if field in supported and field not in call.scope_clear and not args.get(field):
            args[field] = value
    if args.get("card_id") and args.get("card_id") != task.analytical_scope.get("card_id"):
        # A newly selected card may belong to another account.
        if "account_id" not in call.arguments:
            args.pop("account_id", None)
    return args


def record_scope(task: Task, call: ToolCall, arguments: dict[str, Any]) -> None:
    if call.tool_name not in ANALYTICAL_TOOLS:
        return
    if 'date_from' in arguments or 'date_to' in arguments:
        task.analytical_scope.pop('exact_time_range', None)
        if arguments.get('exact_time_range') is True:
            task.analytical_scope['exact_time_range'] = 'true'
    if (arguments.get("card_id") and arguments["card_id"] != task.analytical_scope.get("card_id")
            and "account_id" not in call.arguments):
        task.analytical_scope.pop("account_id", None)
    for field in call.scope_clear:
        task.analytical_scope.pop(field, None)
    for field in SUPPORTED[call.tool_name]:
        value = arguments.get(field)
        if isinstance(value, str) and value:
            task.analytical_scope[field] = value
    # An explicitly changed search mode replaces the older search mode.
    search_fields = {"search", "note_query", "counterparty"}
    changed = search_fields & arguments.keys()
    if changed:
        for field in search_fields - changed:
            task.analytical_scope.pop(field, None)

"""Fixed schema metadata only; never retain rejected values or error messages."""
import json
import logging
from contextvars import ContextVar
from typing import Callable

from pydantic import ValidationError

diagnostic_sink: ContextVar[Callable[[dict], None] | None] = ContextVar('planner_diagnostics', default=None)
_FIELDS = frozenset({'type', 'tool_call', 'tool_name', 'arguments', 'step_id',
    'continue_after_confirmation', 'scope_clear', 'question', 'text', 'options',
    'final_message', 'completion_kind', 'refusal_reason', 'id', 'label'})
_ERRORS = frozenset({'missing', 'extra_forbidden', 'string_type', 'string_too_short',
    'string_too_long', 'bool_type', 'list_type', 'dict_type', 'literal_error',
    'value_error', 'model_type', 'int_type', 'none_required'})


def record_schema_error(error: Exception, attempt: int) -> dict:
    issues = []
    if isinstance(error, ValidationError):
        for issue in error.errors(include_input=False, include_context=False, include_url=False)[:8]:
            path = '.'.join(str(part) if isinstance(part, int) and 0 <= part < 100 else
                part if isinstance(part, str) and part in _FIELDS else '<key>'
                for part in issue['loc'][:6]) or '$'
            kind = issue['type'] if issue['type'] in _ERRORS else 'schema_error'
            issues.append({'path': path, 'type': kind})
    else:
        issues = [{'path': '$', 'type': 'invalid_json'}]
    diagnostic = {'kind': 'MODEL_SCHEMA_ERROR', 'phase': 'PLANNER_DECISION',
        'schema_version': 'planner-decision-v1', 'attempt': attempt, 'issues': issues}
    sink = diagnostic_sink.get()
    if sink:
        sink(diagnostic)
    logging.getLogger(__name__).warning('Model schema rejected: %s', json.dumps(diagnostic))
    return diagnostic

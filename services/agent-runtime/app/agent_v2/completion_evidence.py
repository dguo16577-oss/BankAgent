"""Bounded, provenance-bearing evidence for the semantic completion audit.

Never cut serialized JSON: optional merchant prose must not evict the second
period of a spending comparison. Omission is explicit, never proof of success.
"""

from __future__ import annotations

from typing import Any


def _spending_fields(raw: dict[str, Any]) -> dict[str, Any]:
    # Order important comparison facts ahead of optional long labels. These
    # values remain tool facts, with no recomputation or model summarization.
    keys = ('period', 'scope', 'period_coverage', 'totals_by_currency',
            'transaction_count', 'period_change', 'category_breakdown',
            'bucket_by', 'period_breakdown', 'source', 'incomplete', 'top_merchants')
    result = {key: raw[key] for key in keys if key in raw}
    change = result.get('period_change')
    if isinstance(change, dict):
        result['period_change'] = {
            key: change[key] for key in ('comparison_from', 'comparison_to',
                'comparison_summary', 'by_currency', 'left_period', 'right_period',
                'coverage_comparable') if key in change}
    return result


def _project(raw: Any) -> tuple[Any, list[str]]:
    omitted: list[str] = []
    nodes = 0
    characters = 0

    def visit(value: Any, path: str, depth: int) -> Any:
        nonlocal nodes, characters
        nodes += 1
        if nodes > 2048 or characters > 24000 or depth > 12:
            if len(omitted) < 64:
                omitted.append(path)
            return None
        if isinstance(value, dict):
            result = {}
            for index, (key, child) in enumerate(value.items()):
                if index >= 128:
                    omitted.append(path + '.*')
                    break
                characters += len(str(key))
                result[key] = visit(child, path + '.' + str(key), depth + 1)
            return result
        if isinstance(value, list):
            if len(value) > 128:
                omitted.append(path + '[128:]')
            return [visit(child, f'{path}[{index}]', depth + 1)
                    for index, child in enumerate(value[:128])]
        if isinstance(value, str):
            characters += min(len(value), 1000)
            if len(value) > 1000:
                omitted.append(path)
            return value[:1000]
        return value

    return visit(raw, '$', 0), omitted[:64]


def completion_observations(context: dict[str, Any]) -> list[dict[str, Any]]:
    observations = context.get('observations', [])
    result = []
    # Preserve original indices, so a ledger reference cannot accidentally bind
    # to a different observation after the window is applied.
    for index in range(max(0, len(observations) - 16), len(observations)):
        item = observations[index]
        raw = item.get('structured_result', {})
        if item.get('tool_name') == 'summarize_spending' and isinstance(raw, dict):
            raw = _spending_fields(raw)
        projected, omitted = _project(raw)
        result.append({'observation_index': index, 'tool_name': item.get('tool_name'),
                       'success': item.get('success'), 'error': item.get('error'),
                       'trust': item.get('trust'), 'result': projected,
                       'projection_complete': not omitted, 'omitted_paths': omitted})
    return result

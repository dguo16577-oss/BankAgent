"""Bounded OTel instrumentation: no prompts, bank arguments or credentials."""
from __future__ import annotations

import functools
import json
import logging
import os
import time
from collections import deque

from opentelemetry import trace, propagate
from opentelemetry.trace import Status, StatusCode

LOG = logging.getLogger('aster.telemetry')
METRICS = deque(maxlen=1000)
_configured = False
_ATTRIBUTES = frozenset({'tool.name', 'tool.provider', 'task.id', 'task.state',
    'http.response.status_code', 'error.type', 'model.prompt_tokens',
    'model.completion_tokens', 'model.total_tokens'})


def safe_span_metadata(span):
    # A global SDK also receives spans from third-party libraries. Never assume
    # those attributes or names obey this application's no-payload convention.
    owned = span.name in {'agent.http', 'model.completion', 'tool.call', 'bank.read'}
    return {'event': 'span', 'trace_id': format(span.context.trace_id, '032x'),
            'span_id': format(span.context.span_id, '016x'),
            'name': span.name if owned else 'thirdparty.span',
            'duration_ms': (span.end_time-span.start_time)/1e6,
            'status': span.status.status_code.name,
            'attributes': {key: value for key, value in span.attributes.items()
                           if owned and key in _ATTRIBUTES}}


def configure():
    global _configured
    if _configured or os.getenv('ASTER_OTEL_ENABLED', '0') != '1':
        return
    from opentelemetry.sdk.trace import TracerProvider
    from opentelemetry.sdk.trace.export import SimpleSpanProcessor, SpanExporter, SpanExportResult
    from opentelemetry.sdk.resources import Resource

    class MetadataExporter(SpanExporter):
        def export(self, spans):
            for span in spans:
                # Our attributes are fixed vocabulary, never supplied tool data.
                LOG.info(json.dumps(safe_span_metadata(span), ensure_ascii=True))
            return SpanExportResult.SUCCESS

    provider = TracerProvider(resource=Resource.create({'service.name': 'aster-agent-runtime'}))
    provider.add_span_processor(SimpleSpanProcessor(MetadataExporter()))
    if not LOG.handlers:
        LOG.addHandler(logging.StreamHandler())
    LOG.setLevel(logging.INFO)
    LOG.propagate = False
    trace.set_tracer_provider(provider)
    _configured = True


def traced(name):
    def decorate(function):
        @functools.wraps(function)
        async def wrapped(*args, **kwargs):
            started = time.monotonic()
            with trace.get_tracer('aster.agent').start_as_current_span(name, record_exception=False,
                    set_status_on_exception=False) as span:
                if name == 'tool.call' and len(args) > 1:
                    registry = args[0]
                    tool_name = args[1]
                    if tool_name in registry._definitions:
                        span.set_attribute('tool.name', tool_name)
                        span.set_attribute('tool.provider', 'mcp' if registry.mcp_bridge and tool_name in {
                            'list_accounts', 'list_cards', 'search_bank_knowledge'} else 'native')
                        if len(args) > 3:
                            span.set_attribute('task.id', args[3].task_id)
                            span.set_attribute('task.state', args[3].status.value)
                try:
                    result = await function(*args, **kwargs)
                    span.set_status(Status(StatusCode.OK))
                    return result
                except Exception as error:
                    span.set_attribute('error.type', type(error).__name__)
                    span.set_status(Status(StatusCode.ERROR))
                    raise
                finally:
                    METRICS.append({'operation': name, 'duration_ms': round((time.monotonic()-started)*1000, 3)})
        return wrapped
    return decorate


def outgoing_headers(headers=None):
    carrier = dict(headers or {})
    propagate.inject(carrier)
    return carrier

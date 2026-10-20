# Agent observability — implementation and boundaries

2026-10-16. Foundation implemented; full distributed acceptance remains PARTIAL.

`app/telemetry.py` uses OpenTelemetry API/SDK. `ASTER_OTEL_ENABLED=1` installs a
local metadata-only SDK exporter with fixed service identity. No cloud service,
public telemetry listener, Langfuse deployment or external exporter is added.
Agent HTTP entry extracts W3C traceparent, returns X-Trace-Id, and creates
`agent.http`. Child spans wrap `model.completion`, `tool.call` and `bank.read`.
Outgoing model/bank-read HTTP requests inject W3C trace context. Tools record
only a Registry-validated name and native/MCP provider. Numeric model usage
records prompt/completion/total tokens when the provider supplies them.

Exporter fields are trace/span IDs, fixed span name, duration, status, fixed
tool/provider metadata, token counters and exception class. It deliberately
does not record exception messages, prompt text, conversation bodies, bank
arguments/results, cookies, authorization headers, API keys, OTPs or full
financial account identifiers. Duration samples have a bounded 1000-entry
in-process deque. They are not a durable financial audit or success oracle.

The production execution/confirmation and Spring database remain authoritative.
Telemetry never grants capabilities or supplies execution terms. W3C context
is correlation data, not authentication. Incoming trace IDs cannot change scope.

Limits: this change does not instrument the Next/browser parent, add Spring
server spans, trace bank mutations or establish RAG/MCP child transport spans.
Streaming response lifetime and async context correlation need separate tests;
an Agent HTTP span ending is not proof of full SSE completion. No trace body
capture is enabled as a shortcut. A successful model response is not a successful
bank task. Per-task success/completeness/mutation metrics must join trusted
Task Ledger and bank snapshots, not span status alone.

Langfuse is deferred: the present Windows host cannot justify another large
service stack while knowledge retrieval is resource-blocked. Exporter format
allows later authorized collection; retention, access control, encryption and
rotation need operational design before user traffic. This is a feasibility
decision, not a claim of a deployed dashboard.

Tests: `tests/test_telemetry.py` verifies sensitive input is absent from samples,
traceparent propagation preserves identity headers, provider 402/429/503 errors
are not blindly retried, and optional provider usage is accepted. See the R2
acceptance report for actual deployed evidence and missing metrics.

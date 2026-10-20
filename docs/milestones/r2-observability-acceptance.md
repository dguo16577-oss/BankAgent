# R2 observability acceptance

2026-10-16. **PARTIAL.** Metadata-only Agent OTel foundation is implemented;
this is not a completed browser → Web → Agent → MCP/RAG → Spring distributed
trace deployment. [Architecture](../architecture/agent-observability.md).

Optional local SDK export provides W3C context extraction/propagation,
request trace-ID header, model/tool/bank-read duration, Registry-validated
tool/provider, opaque task ID/state, numeric provider usage and error class.
Five telemetry tests pass. Real span samples and aggregated metrics belong in
`artifacts/integrated/otel-spans.json` and `otel-metrics.json`; missing fields
are UNKNOWN, never a passing or zero-cost estimate.

Full Next/browser parent correlation, Spring server spans, financial mutation
spans, MCP/RAG transport children and SSE span lifetime are unaccepted. Task
success/completeness must come from Ledger and bank oracles, not span OK.
Tool selection accuracy needs labeled cases. Recovery/unauthorized mutation
have selected DB tests, not an all-task empirical rate. MCP overhead needs a
matched A/B. Cost per success lacks verified tariffs and success denominator.
RAG citation evidence is historical while the current KB is unavailable.

Langfuse/dashboard deployment is deferred under the resource budget. No cloud
exporter, new listener or raw prompt/tool argument capture is enabled. Exception
messages, cookies, keys, OTPs and full financial identifiers are omitted. Trace
retention and access control remain operational gates. No OTel trace grants
bank authorization, and no blind financial retry was added.

Final deployed sample: 10/10 model calls include usage, 101209 prompt and 743
completion tokens; model p50 1074.715ms, p95 1877.387ms. Five tool and 32 bank-read
spans are recorded. `thirdparty.span` exports no arbitrary attributes. Earlier
17-call sample is preserved as `otel-metrics-initial.json`; workloads differ, so
this is not an optimization A/B. Cost and task success rate remain unmeasured.

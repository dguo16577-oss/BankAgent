# R3 performance — current evidence

2026-10-16. **PARTIAL; no selective-registry default enabled.**

Measured final deployed sample: 10 model calls, p50 1074.715ms / p95 1877.387ms,
101209 actual prompt tokens + 743 completion tokens; five tool calls and 32 bank
reads. Exact metadata in `artifacts/integrated/otel-metrics.json`. Initial
17-call workload differs; no causal before/after benefit is claimed. Cost per
success and end-to-end task percentiles are UNKNOWN.

The trusted registry remains 50 tools. FULL_REGISTRY remains the default on
every model tool decision; existing cross-domain reachability is preserved.
No model/RAG discovery result can add a tool or authorization. A genuine
FULL_REGISTRY versus SELECTIVE_REGISTRY A/B experiment with matched tasks,
fixtures, model and repeated runs has not been completed. No fabricated
token saving, p50/p95 improvement or cost-per-success figure is reported.

Changes supported by code/tests:

- Model input has a bounded configurable byte budget (default 500000), failing
  explicitly before a provider request on overflow. This is not token estimation.
- Provider timeout remains bounded, redirects disabled, thinking disabled by
  existing configuration. 402/429/5xx propagate without blind retry or fallback
  model selection. Tests assert a single provider request on these errors.
- Optional actual usage counters and durations are collected through OTel;
  missing usage remains missing, never zero-cost by assumption.
- Agent image provenance ARG/LABEL moved after dependencies so source changes
  do not invalidate pip installation by fingerprint alone. This is a build-cache
  correction, not evidence of faster or safer Agent task completion.

Not implemented/accepted: selective discovery, long-thread compaction, shared
model connection pooling, provider rate scheduler, MCP-vs-native latency A/B,
matched quality/cost benchmark, failover model. Ordinary summaries cannot replace
original goals, immutable intent terms or bank observations. No safety confirmation
was removed for speed. Unmeasured metrics are UNKNOWN, not PASS.

Safe rollback: keep FULL_REGISTRY (already default); disable optional OTel if
required; restore prior image tag through the existing startup system. Never
remove financial policy checks or reissue an unknown bank execution to reduce
latency. R3 cannot pass while UX4.7 baseline itself remains incomplete.

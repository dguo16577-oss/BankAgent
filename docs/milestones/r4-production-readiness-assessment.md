# R4 production readiness assessment

2026-10-16. **NOT_READY_FOR_PRODUCTION. Controlled pilot gate: HOLD.**

The isolated competition bank can be used for a supervised sandbox demonstration
of individually verified capabilities, with known limitations disclosed. This is
not an unconditional READY_FOR_SANDBOX_DEMO signoff for every competition domain:
current knowledge/MCP deployment, cross-domain behavior and reliability evidence
have open gates. Only simulated funds and documented demo credentials are in scope.

| Area | Actual boundary / remaining evidence |
| --- | --- |
| Authority | Spring owns financial state, Runtime permits read/PREPARE only, separate confirmation/step-up retained |
| Identity | Demo credentials and simulated OTP are not production identity/verification |
| Durability | PostgreSQL task version/lease tests exist; real transfer response-loss evidence retained; other action kinds incomplete |
| Concurrency | Single Agent process for MCP grants; no distributed grant/state design or multiworker production load claim |
| Availability | Existing healthchecks, restart scripts and rollback images; Windows commit memory and prior Docker WSL crashes remain limits |
| Recovery | No proven full backup restoration, disaster recovery objective or cross-region availability |
| Observability | Agent OTel foundation; complete browser-to-Spring evidence, retention and operational alerting incomplete |
| Secrets | Mounted key file and ignored env; rotation/revocation rehearsal and complete log/trace inventory still needed |
| Dependencies | Pinned direct libraries, transitive/build bases not fully reproducible; no current complete image vulnerability signoff |
| Privacy | Public-only knowledge filter, masked observations; formal retention/deletion/consent and regulated processing assessment missing |
| Human escalation | Errors fail closed; staffed support/escalation ownership and incident runbook not validated |

No production-scale load test was attempted on this constrained host. No
unrelated process, volume, network security setting or paging file was changed.
Startup documentation records status/logs/restart/preflight; further health,
version and rollback automation remains to be operationally accepted.

Before a controlled pilot: close High security and semantic ledger gaps, test
all financial action reconciliation paths and session/logout/tab races, repeat
real-model adversarial/RAG/MCP checks with DB oracles, establish backup restore,
secret rotation and incident operators, run modest authorized concurrent
customer tests and publish repeatable performance/correctness measurements.
Real banking deployment additionally needs separately approved authentication,
compliance, threat response, financial reconciliation and high availability.

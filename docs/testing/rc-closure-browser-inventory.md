# RC closure browser inventory — 2026-10-21

Single headed Edge context, one tab at 1440×1000; disposable port 18089 only. No financial fault on retained port 18088. Reuse the existing Playwright Interactive workflow.

| Claim/control | Functional check | Visual state / evidence |
| --- | --- | --- |
| Sign in, Copilot, legacy route | Real deployed page and authenticated identity | Header and workspace screenshot |
| Read-only history button | GET only; server rechecks customer; no financial POST | List and selected historical result |
| History detail | Same task ID, no old hash/grant/key; pending requires new review | No execute/confirm control in history section |
| New session | Same customer history remains readable; original operation binding stays denied | New-context history view |
| Multi-goal review | All goals visible; current-action cancellation and whole-task cancellation distinct | Two goal rows and separate buttons |
| Cancellation | Original intent cancelled; second remains independently pending; no balance change | Updated review and SQL evidence |
| Refresh | Existing task UI can reload without auto execution | Reload screenshot and request counters |
| Failure path | Expired session cannot read history | Safe error, no leaked history |
| Off-path input | Arbitrary history task URL rejected before upstream access | HTTP400, no navigation |

Real model cases are separate evidence: no deterministic Planner result can satisfy real DeepSeek acceptance. If the approved network path is unavailable, mark model-dependent rows BLOCKED and retain functional browser evidence at its actual level.

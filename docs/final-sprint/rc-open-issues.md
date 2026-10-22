# RC Final Closure — open issues

## Final Release Gate — 2026-10-22 当前状态

修复提交 `9577cf0`：恢复 GET 复核银行 Intent 状态/有效期并隐藏旧确认；成功答复摘要可恢复。真实 socket/API 的 SSE01–09 下层检查通过，含 3 笔隔离授权 1 CNY 转账且重复执行为零；13 项 PG 补验、12 项 AG-UI、2 项恢复测试通过。全部新故障测试使用确定性 Planner，不能当作 DeepSeek/浏览器通过。

**最新部署 ENVIRONMENT_BLOCKED；当前主栈与隔离栈均停止，卷保留。** 原启动器在提交余量1283MiB时拒绝构建；释放本次 REPL 后1618MiB仍不足2048MiB。Agent旧镜像未更新。Knowledge/MCP因4GiB门禁关闭，多Agent实验关闭。无新增网络审批失败，历史记录保留。

R1/S1独立PARTIAL：浏览器提交点恢复、非转账不可变回执定位、真实RAG/MCP攻击送达和完整审计未关闭。DEMO_READY当前NO，不沿用历史健康状态。详见 [Final Release Gate](final-release-gate.md)、[SSE逐项](final-sse-recovery.md)、[恢复与演示](final-demo-runbook.md)。以下均为此前记录。

## Release Recovery — current delta 2026-10-22

最新结果见 [release-recovery-report.md](release-recovery-report.md)。以下原2026-10-21表格保留为历史，不能作为当前部署/网络状态。

| Item | Current status |
| --- | --- |
| RC-NET / latest deployment | 原路径恢复，最新Web/Agent已实际部署，44文件一致、主库五表不变；旧“receipt修复未部署”阻塞已关闭。 |
| R-03 semantic safety | 明确动作/对象冲突与显式回执矛盾否决通过；复杂自然语言覆盖不完整，PARTIAL。 |
| Completeness/reply recovery | 相同争议有界停止、保留银行证据、答复摘要租约内保存、GET只读；未知状态优先PARTIAL、隐藏旧确认/当前回执；PG13/13通过。 |
| RC-AB10 | 银行丢响应+原键恢复、新登录只读回执及浏览器刷新/隔离通过；真实浏览器提交点SSE故障仍PARTIAL。 |
| RC-AB07 | 已有card/recurring不可变回执GET；缺已执行Intent到Receipt ID关联，不能恢复丢失的整个响应。仍安全UNKNOWN/PARTIAL，未修改冻结合同。 |
| RC-KNOWLEDGE | 资源提交余量3166MiB未过4GiB门禁；当前MCP/RAG关闭，在线生成/攻击送达未验收。 |
| RC-MA | MA03最终目标层可核实完成，但历史失败尝试保留，成本明显更高；MA01/06本轮受Knowledge条件阻塞，默认关闭。 |
| Model authorization | 本轮用户明确无费用/调用上限；41次尝试/40次HTTP200，598510输入/20680输出Token；不变更另一副本计数器，不推算货币费用。 |
| S1/R1 | 独立保持PARTIAL；未完成的RAG/MCP攻击、完整审计、SSE与非转账恢复仍是门禁。 |

## Historical closure issues

2026-10-21. Historical failures remain in `rc-results.json`; no frozen oracle was changed.

| ID | Severity | Current evidence | Required closure |
| --- | --- | --- | --- |
| RC-NET | Blocking environment | DeepSeek initially HTTP200; later original container path DNS changed from 198.18.0.26 to 198.18.0.113, TCP timeout/TLS unexpected EOF. MA03/06 stopped before ledger planning. Docker Registry also timed out. | Restore the existing approved path; do not change proxy/DNS/TLS or retry indefinitely. Repeat only blocked real-model/deployment cases. |
| RC-MA01 | High product correctness | Latest completed comparison: single SUCCEEDED 34.141s, multi PARTIAL 66.026s. Analyst succeeded in two calls; Knowledge returned invalid JSON twice including one bounded repair. | Diagnose provider structured content without hidden reasoning, then repeat MA01/03/06. Keep multi flag 0. Failed-child replay already prevents additional child-model calls. |
| RC-AB01 | High incomplete evidence | Two original goals remain visible. Deterministic real Spring/PG: first100 prepared, cancel only first, second200 independently prepared, old confirmation rejected, no debit. | Real DeepSeek + browser staged flow; distinct user confirmations; preserve original simultaneous-PREPARE benchmark as separately PARTIAL. |
| RC-AB07 | High reliability | Real commit-then-response-loss faults passed for card freeze, recurring stop and schedule creation. Exactly one effect each, no money change; retry reads executed bank intent and does not resubmit. | Existing APIs do not expose an immutable receipt lookup for these kinds; retain PARTIAL/UNKNOWN. Do not infer a complete receipt from current entity state. |
| RC-AB10 | High incomplete live evidence | Reauthenticated read-only history implemented; customer SQL filter and old session mutation binding retained. 3 unit tests and isolated PG passed. Browser list worked; transfer detail exposed incorrect gateway method. Source fixed to existing optional GET. | Build/deploy `6183c47` Agent and finish live verified receipt/new-login/refresh/SSE tests. The previously deployed Agent image does not contain this last fix. |
| RC-S1 | High incomplete safety evidence | Existing real note attack evidence retained; deterministic child scope and financial authorization tests pass. | Real RAG/MCP injection delivery proof and all frozen S1 attack paths remain incomplete. No upgrade to S1 PASS. |
| RC-AB17 | Medium evidence | Existing chart reuse component behavior has supporting tests. | Still missing latest deployed browser measurement of real model and Banking Core call counts. |
| RC-AB19 | Medium evaluator | Strict independent tool/argument and monetary bank-fact scoring implemented; 6 negative tests passed, including missing labels, wrong arguments, wrong facts and missing live prerequisites. | Full independently labelled benchmark and verified live-result scoring remain incomplete. Grader does not authenticate artifact provenance or score narrative entailment. |
| RC-AB20 | Medium audit | Durable checkpoints and semantic intent/step/receipt bindings retained. | Full unified audit linkage and external immutable evidence retention not implemented. |
| RC-RESOURCE | Blocking environment | Commit headroom fell to ~1.6GiB; project sandbox stopped; no unrelated processes terminated. | Honor start guards; restore retained service only when headroom meets its 4GiB knowledge-stack requirement. No pagefile or system security changes. |

No production-readiness claim. No financial mutation was performed on the retained demonstration bank. All deliberate commit/fault tests used `aster-final-sprint-20261020` only.

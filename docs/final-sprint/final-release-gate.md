# Final Release Gate — 2026-10-22

## 结论

**本轮发布仍 PARTIAL / ENVIRONMENT_BLOCKED；不能作为完整 RC PASS。**

基线 `8f920e5228d21e06712aa73c39684c085be691a9`；修复提交
`9577cf065b037d29d8e6d55c3a330b7ace45ec87`。仅修改
`D:\BankProject-AGUI-20261012`。原项目、冻结 Customer 合同、Spring、Flyway、
金融执行通道、业务工具和 Agent 数量未改。

当前两个 Aster 项目的核心容器均已停止，数据卷及旧镜像保留。主栈是在隔离故障测试前
通过原启动器停止的；随后最新 Agent 构建被资源门禁拒绝，尚未恢复。18088/18089
不是当前可用地址。不得沿用上一报告的“五服务健康”作为当前状态。

## 本轮修复

1. `services/agent-runtime/app/agent_v2/runtime.py`：GET 恢复待确认任务时，核对客户范围内
   银行 Intent 的 ID、条款哈希、状态和有效期。取消、过期、执行或无法核实时隐藏确认。
   只修改返回视图，不写 checkpoint，不重交、不伪造成功回执。缺少银行读取能力的申请
   类型仍只检查原快照有效期，不能据此声称实现了这些类型的完整对账。
2. `services/agent-runtime/app/agui_adapter.py`：恢复成功任务时，可使用 Runtime 已校验的
   持久化答复摘要，避免没有 assistant conversation turn 时答复为空。
3. 新增 `test_final_release_gate.py`、AG-UI 摘要恢复测试，以及 disposable-only 的
   `scripts/final-release-sse-{fixture,probe}.py`。没有发布故障控制 API。

最初失败测试及一次 harness 占位符替换错误均保留。第一次修复后测试还发现 FakeBank
和 checkpoint 共用一个字典，测试 fixture 改为复制银行对象；未放宽 GET 只读及零扣款断言。

## 验收结果与证据层级

| 检查 | 本轮结果 | 边界 |
| --- | --- | --- |
| Agent full | 389：376 PASS、13 SKIP | `agent-full.log`；随后仅摘要回退的 3 行有变化，由最终 AG-UI 12 项覆盖；不是最终版本 390 项全量重跑 |
| AG-UI 最终定向 | 12 PASS | `agui-final.log`，含新增摘要恢复 |
| 银行终态 / 时间到期 / 不可用恢复 | 2 方法 PASS | `review-commit.log`，有多个子场景，不能计作真实浏览器 |
| 隔离 PostgreSQL 恢复 | 13 PASS、0 SKIP | `pg/postgres-recovery.log` 与 evidence；原全量 13 SKIP 为缺本机 DSN，另行补验，不重复计数 |
| SSE01–SSE08 | 8 个 socket/API 场景 PASS | 当前源码临时副本、真实 FastAPI/AG-UI、Spring/PG；确定性 Planner、模型调用 0 |
| SSE09 | 银行终态恢复 PASS | CANCELLED/EXPIRED 在可抛弃银行库中设置；时间到期另有离线测试；不是实际等待 15 分钟 |
| 最新镜像 | ENVIRONMENT_BLOCKED | 原 `start.ps1` 在任何构建前拒绝；Agent tag 未变化 |
| 最新浏览器 + DeepSeek | NOT_RUN / ENVIRONMENT_BLOCKED | 无本轮新截图、模型轨迹或付费调用；旧轨迹仅作历史证据 |
| Web / Spring / contract | 既有证据保留 | 本轮没有修改相应代码/合同，未重新记作通过大套件 |

原始产物在本机 `artifacts/final-release-gate/`，Git 忽略；报告不是原始证据包。
后续交接需另外传递脱敏产物。文件索引和 SHA256 在 `rc-results.json.final_release_gate`。
故障时序、限制及逐项 SSE 状态见 [final-sse-recovery.md](final-sse-recovery.md)。

## 数据与授权

- 故意金融副作用只发生于 `aster-final-sprint-20261020`：3 笔独立授权的 1 CNY 转账，
  各一次 debit；重复确认返回同一回执，无额外转账。
- 两个断流 PREPARE 场景无转账，结束后取消。SSE09 新增两个准备记录并设为银行终态，
  余额、转账及 debit 数不变。
- 保留主库五表行数/哈希在 02:06:14 UTC 预检与原 baseline 相同。随后主 Spring/PG
  全程停止；不能把停机后的连续性说明包装成新跑的一次 SQL 哈希检查。
- 租约、旧 Worker、同一执行键、客户隔离、取消和只读历史的 13 项 PG 检查通过。
  这不替代所有实际 Spring 并发路径和浏览器断网测试。
- LLM 无 execute capability；无新授权、自动重交、网络策略或分页文件变更。

## 部署与资源判定

原入口命令：`start.ps1 start -BuildOnly -Services agent-runtime -ProjectName
aster-final-sprint-20261020 -Port 18089`。

构建门禁：物理可用 5122 MiB，但提交余量 1283 MiB，低于 2048 MiB。
释放本次 REPL 后最终采样物理 7144 MiB、提交余量 1618 MiB；仍不满足。没有重复强行构建，
没有停止 sharelatex、Mongo、Redis 或用户浏览器，没有修改资源门槛。

Knowledge 要求物理及提交余量均至少 4096 MiB，本轮判定一次 **ENVIRONMENT_BLOCKED**，
保持 MCP=0。保留原 36 documents / 36 versions / 156 chunks 和固定模型缓存的历史审计；
不冒称本轮在线检索通过。无已授权、可核实的远程服务器路径，未另行外传数据或密钥。

旧镜像仍为：

| 服务 | Image ID |
| --- | --- |
| Agent | `sha256:96b904d031cee4feb5d16ffaa3b8f422d8e8f56a7831d9adf0e5301a1cfbfc86` |
| Web | `sha256:4e0e60587749a38af058ffe08113b0fd736e0b4d758827d8673f4d3306dc3684` |
| Spring | `sha256:6353f69f5fc1d2b9b4b07c0f86892fc987d76196b57ef539f45051fa7e6e8362` |

最后环境快照 `artifacts/final-release-gate/final-environment.json`；基线部署详情
`artifacts/rc/environment-aster-acceptance-20261012-20261022T020614.json`。
最终镜像不包含 `9577cf0` 修复，不能标记 DEPLOYED_LATEST。

## 模型 / Multi-Agent / 安全

本轮 DeepSeek 请求 **0**。用户的无总费用/调用上限授权继续有效，但不因额度授权而
忽略资源门禁。配置默认 `deepseek-flash`、thinking enabled、reasoning effort low；本轮
没有 HTTP 响应证明当前 Provider 的实际服务版本。

此前 41 次尝试、40 次 HTTP200 及失败记录继续见 Release Recovery，不重新计入本轮。
此前 MA03 单模式 5 次/15.094s/79182 Token；多模式 12 次/47.395s/197509 Token，
含被拒绝的子工具尝试。该历史对照不足以建议默认开启。
**MULTI_AGENT_EXPERIMENTAL / MULTI_AGENT_ENABLED=0**。未为通过门禁继续调 Prompt。

S1 仍缺真实 RAG/MCP 恶意内容送达模型后的全路径证据及审计闭环。
本轮没有新增 policy 拒绝；历史 blocked by policy 不删除、不绕过。
R1 仍缺最新部署的浏览器提交点恢复、完整故障覆盖，以及非转账执行后 Intent 到
不可变回执的可靠定位。对后者保持 UNKNOWN/PARTIAL，不根据可变卡片/代扣状态推断成功。
冻结合同未扩展。

## 独立发布门禁

| Gate | 最终状态 |
| --- | --- |
| CODE_COMPLETE | PARTIAL：本轮两项修复有证据，全部历史 RC 缺口未关闭 |
| DEPLOYED_LATEST | ENVIRONMENT_BLOCKED |
| LIVE_E2E_VERIFIED | PARTIAL：历史证据保留，本轮未完成最新部署联合验收 |
| SSE_RECOVERY_VERIFIED | PARTIAL：9 项下层证据成立，浏览器/真实模型层不足 |
| KNOWLEDGE_MCP_VERIFIED | ENVIRONMENT_BLOCKED / OFF |
| MULTI_AGENT_VERIFIED | PARTIAL / EXPERIMENTAL / OFF |
| S1 | PARTIAL |
| R1 | PARTIAL |
| DEMO_READY | NO 当前不可访问；恢复后仅限已核实的只读/PREPARE 子集 |
| PRODUCTION_READY | NO |

具体复现与安全恢复步骤见 [final-demo-runbook.md](final-demo-runbook.md)。本轮到此停止，
不自动进入下一功能阶段；不能为了关闭 PARTIAL 无限追加开发。

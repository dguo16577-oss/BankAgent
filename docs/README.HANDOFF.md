# 文档模块交接

本目录保存架构、API、ADR、安全、部署、测试与里程碑报告。先看根 [交接总览](../HANDOFF-README.md)，再看[人工测试矩阵](handoff/manual-test-matrix.md)与[已知问题](handoff/known-issues.md)。

## 阅读顺序

1. `architecture/` 与 `adr/`：系统边界、认证/Session、意图/确认、Agent 与持久化决策。
2. `backend/`、`api/`、`frontend/`：实现语义及接口；API 机器真值始终是 `contracts/openapi/`。
3. `milestones/m18-*` 至 `m23-*`：比赛六领域/跨域能力和具体测试证据；最终状态以 [`m22-m23-final-acceptance.md`](milestones/m22-m23-final-acceptance.md)为准。早期报告是历史快照，可能含旧 operation/tool 数量。
4. `security/m24-1-container-vulnerability-report.md` 与 `security/m24-1/`：历史镜像扫描及逐项清单；需对重新构建的镜像复扫。
5. `testing/`、`research/`：人工/自动评测规则、数据处理与基准限制。

评测人提交问题时应附上最短复现、脱敏输入与输出、可定位的文档/合同/代码路径、数据库前后事实和风险等级。对于因环境缺失导致的测试失败，标注 JDK、Node、Python、Docker、pnpm、DeepSeek 及数据库版本，避免把连接失败误写成业务通过或业务缺陷。

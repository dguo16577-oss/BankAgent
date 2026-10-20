# 文档与评测索引

当前架构和启动入口见 [项目 README](../README.md) 与 [START-README](../START-README.md)。这里统一替代旧交接总览；里程碑报告记录当时版本和环境，不将历史数字当作当前全量验收。

## 当前验收与风险

- [综合验收](milestones/aster-integrated-final-acceptance.md)
- [KG/RAG](milestones/kg-rag-completion.md)
- [R1 可靠性](milestones/r1-reliability-acceptance.md) / [S1 安全](milestones/s1-security-acceptance.md)：独立保持 PARTIAL
- [剩余问题](security/integrated-remaining-issues.md)
- [历史镜像漏洞报告](security/m24-1-container-vulnerability-report.md)：旧扫描不代替当前运行镜像复扫

## 架构与接口

- [API 工作流](api/README.md) / [机器契约](../contracts/openapi/README.md)
- [持久任务](architecture/durable-agent-runtime.md)
- [结构化响应](architecture/agent-rich-response.md) / [服务目录](architecture/agent-service-catalog.md) / [意图理解](architecture/agent-intent-understanding.md)
- [知识库](architecture/banking-knowledge-base.md) / [Hybrid RAG](architecture/hybrid-rag.md) / [知识图谱](architecture/banking-knowledge-graph.md)
- `adr/` 保存架构决策；`backend/`、`frontend/`、`security/` 保存实现边界。

## 接收方测试流程

1. 记录 Git commit、配置、模型和数据库版本。在独立 Demo 数据库运行，不使用真实客户资料。
2. 按各模块 README 安装依赖，先运行合同、类型和单元检查，再串行运行 Spring/PostgreSQL、Agent 和浏览器测试。
3. 对照 [人工测试矩阵](handoff/manual-test-matrix.md)、[历史交接问题](handoff/known-issues.md) 和最新验收报告；旧矩阵是复现线索，不代表当前通过。
4. 金融操作记录用户确认、工具轨迹、数据库前后状态、重复提交、客户隔离及部分失败。两个客户使用不同浏览器配置，不能仅依赖不同端口隔离 Cookie。
5. 问题反馈包含最短复现、时间/时区、脱敏输入输出、预期/实际、代码位置、环境版本及风险等级。环境连接失败与功能失败分开记录。

本地 Demo 客户为 `alex@aster.local`、`lin@aster.local`，演示密码 `demo-password`；仅用于隔离演示环境。不要把真实凭证、Cookie、验证码和完整账户号写入对话或外发日志。

## 历史资料与打包

`milestones/` 保留按阶段的通过、失败和阻塞证据，尤其 M18.6 DEFERRED、AG-UI/S1/R1 PARTIAL。`contracts/openapi/releases/` 保留冻结发布；历史 Flyway 不可修改。旧代码由 Git 历史恢复，无需保存多份源码 ZIP。

需要另发交接包时使用 [脚本说明](../scripts/README.md) 中的打包与校验脚本。源码仓库不附带本机 artifacts、截图、扫描二进制或数据库；打包文件清单和 SHA-256 以本次实际生成结果为准。

## 2026-10-20 仓库整理

8 份 `README.HANDOFF.md` 已合入各模块唯一 README；旧根 CURRENT-VERSION、HANDOFF-README、RELEASE 和两份基础设施占位 README 已撤下，相关链接改指当前入口或冻结发布记录。旧版本完整内容可从 Git 历史恢复。

本机另删除旧交接 ZIP、docs.zip、过期后端 JAR 和旧启动日志；连同重复说明共释放 136,996,408 字节（约 131 MiB）。两份 PostgreSQL dump、历史迁移、冻结合约、评测数据及安全失败证据保留。v1 兼容 Runtime 和仍被测试引用的旧数据集未删除。

本轮仅整理文档、历史副本和打包白名单，未改业务实现或重启服务。检查范围为入口文档本地链接、打包收集规则、合同审计、3 项冻结哈希测试、启动器离线检查和改动文件格式；没有重跑真实模型、浏览器或全量银行测试，不改变任何里程碑验收状态。

## 仓库维护

[严格整理审计与保留理由](maintenance/repository-hygiene.md) 记录逐类决定；`pnpm repo:check` 防止本机产物、过时入口和无依据的重复文件再次进入提交。

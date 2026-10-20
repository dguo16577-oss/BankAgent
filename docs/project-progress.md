# 项目进度索引

更新：2026-10-20。工作目录 `D:\BankProject-AGUI-20261012`；原始 `D:\BankProject` 不覆盖。本页统一替代旧的本机进程/JAR、端口和早期阶段累积记录。

## 当前基线

- Next.js / React 银行 Web、Legacy Agent 和 AG-UI/CopilotKit 实验页。
- Agent v2 真实 LLM Tool Loop、50 个模型可见工具、可信 ActionIntent 确认边界。
- Spring Banking Core / PostgreSQL；Customer 87、Public 9 个 operation，精确冻结哈希由合同审计检查。
- MCP 与公开政策 Hybrid RAG、来源图谱。最近实际知识部署有 36 文档、156 分块、76 节点和 294 条来源关系。
- 可选持久任务、Task Ledger 与恢复能力有实现及部分证据，不能据此宣称所有可靠性目标完成。

## 验收状态

| 范围               | 状态与证据                                                                                                     |
| ------------------ | -------------------------------------------------------------------------------------------------------------- |
| M18 Smart Transfer | 功能阶段完成；[M18.6 大型评测](milestones/m18-6-smart-transfer-benchmark.md) DEFERRED                          |
| M19–M23            | 领域与跨域逐项结果见各里程碑；[M22/M23 最终矩阵](milestones/m22-m23-final-acceptance.md) 保留历史通过/失败范围 |
| UX / AG-UI         | [综合验收](milestones/aster-integrated-final-acceptance.md) PARTIAL，实验页未替换正式入口                      |
| Knowledge / KG     | [最新部署与验收](milestones/kg-rag-completion.md)，模型超时、原始失败与复测边界保留                            |
| R1                 | [可靠性验收](milestones/r1-reliability-acceptance.md) PARTIAL                                                  |
| S1                 | [安全验收](milestones/s1-security-acceptance.md) PARTIAL                                                       |

本轮文件整理不重跑业务验收，也不提升上述状态。服务健康、源码检查和单元通过不能代替真实浏览器、模型和数据库联合证据。

## 使用与历史

[启动说明](../START-README.md) 是当前启动程序的唯一操作指南；[文档索引](README.md) 汇总架构、测试与剩余问题。早期 M0–M24、B0–B4 记录保留在 `milestones/`、`adr/` 和冻结发布目录；旧总览的完整内容可从 Git 历史恢复。

# Aster Bank

银行 Agent 比赛演示项目。当前源码整理日期：2026-10-20。

## 快速入口

- [启动、停止、重启与排障](START-README.md)
- [文档与评测索引](docs/README.md)
- [综合验收与剩余问题](docs/milestones/aster-integrated-final-acceptance.md)
- [最近 KG/RAG 部署验收](docs/milestones/kg-rag-completion.md)

## 架构与模块

| 模块                                                       | 实现与说明                                                                              |
| ---------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| [Web](apps/web/README.md)                                  | Next.js 16 / React 19，个人银行页面、Legacy Agent、AG-UI / CopilotKit 实验页            |
| [Agent Runtime](services/agent-runtime/README.md)          | FastAPI Agent v2、DeepSeek Tool Loop、50 个模型可见工具、Task Ledger 与可选持久任务状态 |
| [Banking Core](services/banking-core/README.md)            | Java 21 / Spring Boot 4.1.1，身份、余额、金融意图、确认执行与 PostgreSQL 权威状态       |
| [Knowledge Service](services/knowledge-service/README.md)  | Hybrid RAG、公开 Demo Policy 与有来源的基础知识图谱                                     |
| [API 合同](contracts/openapi/README.md)                    | Customer 87、Public 9 个 operation；生成类型与冻结清单以机器检查为准                    |
| [部署](infra/README.md)                                    | Docker Compose、代理、隔离数据卷和资源保护                                              |
| [脚本](scripts/README.md) / [评测数据](research/README.md) | 启动、检查、数据处理、可复现测试与交接打包                                              |

模型选择工具；读取结果作为 observation 再进入模型。PREPARE 返回银行 ActionIntent 后停止规划，等待独立用户确认。金融执行由可信 Runtime 和 Banking Core 检查授权、归属、重验及幂等；模型没有直接 execute、任意 URL、SQL 或管理员工具。知识文本、交易备注与商户内容均不能授予权限。

## 当前状态

M18 转账功能实现完成，大型 M18.6 评测 **DEFERRED**。其他领域与跨域能力以各里程碑逐项证据为准。**S1、R1 和综合验收仍为 PARTIAL，不代表生产就绪。** AG-UI 历史 PARTIAL 记录继续保留，实验页未替换正式入口。

最近知识部署包含 36 份文档、156 个分块、76 个图谱节点、294 条有来源关系。图谱属于政策来源查询基础，不宣称通用多跳推理。真实模型超时及浏览器复测限制见 KG/RAG 报告。

## 启动

Windows 安装并启动 Docker Desktop。复制 `start.env.example` 为被 Git 忽略的 `.env.start.local`，设置自己的数据库密码；DeepSeek 密钥保存在仓库外部文件。

```powershell
.\start.cmd check -KeyFile 'C:\private\deepseek-key.txt'
.\start.cmd start -KeyFile 'C:\private\deepseek-key.txt'
```

默认访问 <http://127.0.0.1:8088/>。当前开发机已有隔离项目使用 18088，操作它时必须指定同一 ProjectName，命令见 [启动说明](START-README.md)。知识服务还需要固定版本的本地模型缓存，首次克隆不包含模型权重。

## 测试与提交范围

开发机需要 Node.js >=22.12、pnpm 11、Python，以及 Spring 测试所需 JDK 21 和 Docker。常用命令为 `pnpm contract:check`、`pnpm typecheck`、`pnpm test`、`pnpm test:agent`；各模块 README 说明环境及金融测试副作用。浏览器单 worker 分批运行，避免同时构建多个服务或运行全量 Spring 测试。

仓库包含源码、锁文件、OpenAPI/冻结清单、历史迁移、测试与评测定义。真实密钥、数据库、模型权重、依赖缓存、运行日志、截图和 artifacts 不随源码上传。报告中的本地证据路径不表示仓库包含原始记录，可用对应脚本在隔离环境重建证据。

过时根说明和重复交接包已整理，旧版本可从 Git 历史查阅。仍使用的 v1 兼容代码、冻结发布合约、Flyway 历史、安全失败记录和数据库备份保留。

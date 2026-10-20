# Aster Bank — 当前源码版本

更新：2026-10-20。完整开发源码快照；历史提交保留，旧源码以本版本覆盖。

## 从这里开始

- [启动与排障](START-README.md)：start.cmd / start.ps1，包含检查、启动、停止、重启、日志。
- [项目说明](README.md)：Web / Agent / Banking Core / PostgreSQL 架构。
- [最新 KG/RAG 验收](docs/milestones/kg-rag-completion.md)：实际部署及已知问题。
- [综合验收快照](docs/milestones/aster-integrated-final-acceptance.md)：安全、可靠性与性能门禁。
- [知识服务与查询](services/knowledge-service/README.md)。

当前包括 Next/CopilotKit + AG-UI、Agent v2 DeepSeek Tool Loop、50-tool Registry、
MCP、Knowledge/RAG、来源图谱、Durable Task/Ledger、Spring Banking Core 和 PostgreSQL。
金融执行仍需可信用户确认及银行端验证。KG 是基础来源图谱，不是通用多跳推理引擎。

最近隔离部署的知识库为 36 文档 / 156 分块，图谱 76 节点 / 294 条有来源关系。
Knowledge/Graph 测试 26 项、检索子集 23 项、MCP 回归 10 项通过；真实浏览器问题及
失败/复测结论见报告。S1/R1 和完整综合验收仍为 PARTIAL，不宣称生产就绪。

## 干净克隆与配置

源码不包含依赖目录、构建文件、运行数据库、模型权重、真实密钥和本机配置。
复制 start.env.example 为 .env.start.local，设置自己的 DB_PASSWORD，并在外部文件
存放 DeepSeek 密钥。使用启动脚本的 -KeyFile 指定该文件，禁止提交密钥。
Windows 需要 Docker Desktop。新机器先执行 check 并阅读 START-README；构建按服务串行。

知识服务需要已批准的本地 multilingual-e5-small 缓存，固定模型 revision 为
614241f622f53c4eeff9890bdc4f31cfecc418b3，通过 ASTER_EMBEDDING_CACHE 指定缓存目录。
缓存、密钥和已有数据库不随 Git 上传。没有缓存时启动检查会明确失败，不使用替代向量。

本机初始化示例（请先配置文件）：

```powershell
& .\start.cmd check -WithKnowledge -KeyFile 'C:\private\deepseek-key.txt'
& .\start.cmd start -WithKnowledge -KeyFile 'C:\private\deepseek-key.txt'
```

## 提交范围

包含源代码、pnpm 锁文件、OpenAPI/冻结清单、历史银行迁移、独立 KG 迁移、测试与评测
定义、部署文件、研究来源说明和文档。不包含 ZIP 交接包、截图、完整运行轨迹、日志、
SBOM/临时 artifacts、环境文件和用户数据。报告中的 artifacts 链接指向本地验收记录，
本源码提交不包含这些原始证据；可按测试脚本在隔离环境重新生成。

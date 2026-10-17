# Aster Bank 交接与评测指南

快照日期：2026-10-11。此文件是本次源码压缩包的入口；历史里程碑 README 中的 API 数量和测试结果属于当时快照，以这里及最新验收记录为准。

## 交接范围与当前状态

压缩包包含 Web、Spring Banking Core、Python Agent、OpenAPI、Flyway、部署配置、研究/评测数据、测试源码、关键脱敏轨迹与容器漏洞扫描原始 SARIF/SBOM。`PACKAGE-MANIFEST.json` 列出每个文件的 SHA-256；压缩包旁的 `.sha256` 校验整个 ZIP。没有打包 Docker 数据卷、真实数据库、密钥、本机 `.env`、依赖缓存和 Maven/Next 构建目录。评测人应在隔离的 Demo 数据库中安装和测试。

| 模块          | 说明与详细 README                                                                    |
| ------------- | ------------------------------------------------------------------------------------ |
| Web           | [apps/web/README.HANDOFF.md](apps/web/README.HANDOFF.md)                             |
| Banking Core  | [services/banking-core/README.HANDOFF.md](services/banking-core/README.HANDOFF.md)   |
| Agent Runtime | [services/agent-runtime/README.HANDOFF.md](services/agent-runtime/README.HANDOFF.md) |
| API 合同      | [contracts/openapi/README.HANDOFF.md](contracts/openapi/README.HANDOFF.md)           |
| 容器/部署     | [infra/README.HANDOFF.md](infra/README.HANDOFF.md)                                   |
| 数据与评测    | [research/README.HANDOFF.md](research/README.HANDOFF.md)                             |
| 脚本          | [scripts/README.HANDOFF.md](scripts/README.HANDOFF.md)                               |
| 文档          | [docs/README.HANDOFF.md](docs/README.HANDOFF.md)                                     |
| 脱敏证据      | [artifacts/README.HANDOFF.md](artifacts/README.HANDOFF.md)                           |

### 不能误读的状态

- 2026-10-11 的合同检查为 Customer **87 operations**、Public **9 operations**。Customer SHA-256：`f0e6e9c55177d5fb28f6fc13cb8bba2780759cfbf6d5764bc656301df22bfb8e`；Public SHA-256：`460387a9a26548941a692bcd7e7036e21d136b4d6a9cb570faa0a4fc1ac106ef`。
- M18 Smart Transfer 功能阶段完成；M18.6 的 100-case 大型评测 **DEFERRED**，不得称为通过。
- M19 账单分析、M20 财富、M21 卡管理以各自里程碑报告为准。M22 续费/代扣 Agent、M23 跨域 Agent 的最终验收仍是 **PARTIAL**；隔离真实模型通过不等于同一浏览器全流程通过。[最终验收矩阵](docs/milestones/m22-m23-final-acceptance.md)列出逐项证据。
- 2026-09-29 的容器扫描记录 22 Critical / 79 High，100 项仍待处置或接受。那是历史镜像的扫描结果，不代表本快照已重新扫描。**公网部署 HOLD**；见[漏洞报告](docs/security/m24-1-container-vulnerability-report.md)。
- Agent 对话任务保存在单进程内存中，重启后不能恢复未完成任务；银行端意图、回执、Session 和业务状态由 PostgreSQL 持久化。

## 从零启动（Windows PowerShell）

需要 JDK 21、Node.js >=22.12、pnpm 11、Python 3、Docker Desktop/Compose。`pnpm` 不在 PATH 时，先安装或启用 pnpm；不要直接依赖开发者电脑上的 Codex 运行时路径。以下每条命令单独执行。Windows 以外用 `./mvnw` 替换 `mvnw.cmd`。

```powershell
Set-Location <解压后的项目目录>
pnpm install --frozen-lockfile
python -m pip install -r services/agent-runtime/requirements.txt
docker compose -f infra/compose/postgres.compose.yml up -d --wait
Set-Location services/banking-core
.\mvnw.cmd clean verify
.\mvnw.cmd spring-boot:run '-Dspring-boot.run.profiles=demo,local' '-Dspring-boot.run.arguments=--server.port=18080'
```

在另一个 PowerShell 窗口启动 Agent；密钥只放在**该进程环境**，不要写入仓库或压缩包。没有密钥时，可运行不依赖模型的单元测试，但 Agent v2 的真实 Planner 请求会失败关闭。

```powershell
Set-Location <解压后的项目目录>
$env:AGENT_RUNTIME_VERSION = 'v2'
$env:BANKING_API_BASE_URL = 'http://127.0.0.1:18080'
$env:DEEPSEEK_API_KEY = '<从私密渠道取得的测试密钥>'
python -m uvicorn app.main:app --app-dir services/agent-runtime --host 127.0.0.1 --port 8001
```

在第三个窗口启动 Web：

```powershell
Set-Location <解压后的项目目录>
$env:NEXT_PUBLIC_API_MODE = 'backend'
$env:NEXT_PUBLIC_BANKING_API_BASE_URL = 'http://localhost:18080'
$env:ASTER_AGENT_RUNTIME_URL = 'http://127.0.0.1:8001'
pnpm build
pnpm start
```

访问 `http://localhost:3000/`、`http://localhost:18080/actuator/health` 和 `http://127.0.0.1:8001/health`。`demo,local` 是演示配置，不用于公网。Local Demo 客户 `alex@aster.local`、`lin@aster.local` 的密码是 `demo-password`；所有真实凭证应由接收方自行提供。两个客户同时测试要用不同浏览器配置或普通窗口加无痕窗口；不同 localhost 端口仍可能共享同一浏览器 Cookie。

## 推荐评测顺序

1. 解压前核对同名 `.zip.sha256`；解压后可运行 `python scripts/verify-handoff-package.py <ZIP路径>` 逐项校验 ZIP 内 `PACKAGE-MANIFEST.json` 的文件哈希，再查看本文件及各模块 README。
2. `pnpm contract:check`、`pnpm lint`、`pnpm typecheck`、`pnpm test`、`pnpm test:agent`、`pnpm build`。
3. 在**独立测试数据库**运行 `services/banking-core/.\mvnw.cmd clean verify`，它包含 PostgreSQL Testcontainers；运行前应停止占用后端构建 JAR 的本地 Spring 进程。
4. 执行 [人工测试矩阵](docs/handoff/manual-test-matrix.md)，对金融动作记录复核前后数据库状态、回执、重复提交结果和两客户隔离。
5. 再做动态/静态安全检查、依赖与容器重扫；对每个发现保留可复现步骤。对照 [已知问题](docs/handoff/known-issues.md)，不要把已知缺口误判成新修复。

截至打包前最近一轮：Web **504/0**、Agent **238/0**、合同/lint/typecheck/format check 通过；Spring 最近一次全量为 **637/0**（211 unit + 426 Testcontainers），此轮没有改 Spring 代码。以上是本机历史执行结果，不是接收方机器上的新验证。

## 数据安全与反馈

本包只供比赛演示评测，不包含可使用的 DeepSeek 密钥、生产数据库或密码文件。评测时不要把真实客户资料、Cookie、验证码、银行卡完整号码或密钥放进 Agent 对话或外发日志。发现问题时记录：复现步骤、时间/时区、模块与版本、输入、预期与实际、脱敏请求/响应、相关 DB 前后快照、是否存在资金或客户隔离影响。禁止用本包直接面向公网提供金融服务。

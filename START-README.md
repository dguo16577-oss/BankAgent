# 一键启动 Aster Bank

## 2026-10-20：Knowledge / KG 增量启动

当前已部署并验证：36 文档、156 分块、76 个图谱节点、294 条来源关系。
详细证据及模型超时等剩余问题见
[KG/RAG 验收](docs/milestones/kg-rag-completion.md)。S1/R1 仍独立保持 PARTIAL。

支持只重建知识服务及 Agent，不再要求连带重建 Web/Spring：

```powershell
& 'D:\BankProject-AGUI-20261012\start.cmd' restart -WithKnowledge -Services 'knowledge-service,agent-runtime' -ProjectName aster-acceptance-20261012 -Port 18088
```

首次构建安装 CPU 版依赖，模型权重来自已批准的本地缓存，运行时离线加载。
知识服务限制 1800 MiB / 2 CPU。启动后自动导入 36 份已有 Demo Policy，
并维护 Knowledge 独立 KG001 图谱迁移；不会修改银行 Flyway 历史或客户业务表。
查询示例见 `services/knowledge-service/README.md`。增量模式要求原数据库、
后端、代理健康。以下 10 月 16 日的阻塞记录保留作历史；以最新验收报告为准。

## 2026-10-16 Integrated 验收部署

当前五个服务健康，Agent 已使用最新源码重建；41 个 Python 源文件与运行容器
逐文件哈希一致。Web/Spring/数据库/代理沿用兼容的既有版本。
实际镜像与配置记录在 `artifacts/integrated/deployment-final.json`，
验收结论见 `docs/milestones/aster-integrated-final-acceptance.md`。
服务健康不等于 S1/R1/RAG 全部通过。

按当前方式保留 MCP pilot 与本地 OTel 开关，只增量构建 Agent：

```powershell
$env:ASTER_MCP_ENABLED = '1'
$env:ASTER_OTEL_ENABLED = '1'
& 'D:\BankProject-AGUI-20261012\start.cmd' restart -Services agent-runtime -ProjectName aster-acceptance-20261012 -Port 18088
```

环境变量只影响当前 PowerShell；重启时未保留开关，可能回到默认配置。
不要把密钥写到 README、命令输出或版本库。现有本地环境文件继续保管密钥。

知识服务可选 `-WithKnowledge`；10 月 20 日起也支持与上述增量 `-Services` 配合。
它复用现有 Knowledge Compose overlay、迁移与审核过的 Demo Policy 文档，
构建时从 `ASTER_EMBEDDING_CACHE` 指定的本地 multilingual-e5-small 缓存载入模型，
成功启动后运行幂等 ingestion。默认检查已有 Hugging Face 缓存目录。
这一重型路径要求至少 4096 MiB 可用物理内存和提交余量；当前提交余量不足，
实际构建/导入未验收，不能视为可用 RAG。

```powershell
& 'D:\BankProject-AGUI-20261012\start.cmd' check -WithKnowledge -ProjectName aster-acceptance-20261012 -Port 18088
```

检查通过再使用同样参数的 `restart`。不使用 `-NoBuild` 部署源码更新；不删除卷。
只启动现有五服务时不要添加 `-WithKnowledge`，原有 start/status/logs/stop/restart
语义保留。资源保护拒绝时先保留可用服务，不强制构建。

## UX4.6 当前部署（2026-10-15）

最新 Web/Agent 已增量构建并部署，五个服务健康；Spring、PostgreSQL、代理
容器未被重新创建。旧镜像回滚标签继续保留。UX4.6 浏览器验收发现新的功能
失败，因此整体仍为 PARTIAL，不能将服务健康等同于业务验收通过。
详见 [部署与真实验收](docs/milestones/ux4-6-deployment-e2e-acceptance.md)。

只构建并更新 Web、Agent（需已有健康的数据库、后端与代理）：

```powershell
& 'D:\BankProject-AGUI-20261012\start.cmd' restart -Services agent-runtime,web -ProjectName aster-acceptance-20261012 -Port 18088
```

`-Services` 是逗号分隔字符串，仅允许 `web` 和 `agent-runtime`。不传参数时
保持原来的全栈行为；不要给新源码部署加 `-NoBuild`。增量路径使用 `--no-deps`，
并在更新后重载 nginx，使代理重新解析容器地址。每个待构建服务开始前检查
提交内存；构建过程仍可能出现瞬时资源峰值，应避免其他重负载任务。
镜像标签 `io.aster.source.sha256` 记录源代码树哈希，不是 Git Commit。

> 历史 UX4.5（2026-10-15，已由上述 UX4.6 部署记录更新）：本轮修复已在源码及单元测试中验证，但当时运行镜像
> 尚未包含修复。部署预检因提交内存余量仅 1167 MiB 而停止，已有服务保持运行。
> 资源满足后，使用 `restart -ProjectName aster-acceptance-20261012 -Port 18088`
> **不要加 `-NoBuild`**，才能重建当前代码。旧 Web/Agent 镜像已分别保留为
> `aster-web:pre-ux45-20261015`、`aster-agent-runtime:pre-ux45-20261015`。
> 详见 [UX4.5 验收报告](docs/milestones/ux4-5-final-acceptance.md)。

这套启动入口位于 **`D:\BankProject-AGUI-20261012`**，启动当前 AG-UI / R1 工作目录的前端、Spring Banking Core、Agent v2 和 PostgreSQL。使用 Docker Compose；不依赖全局 `pnpm`、本机 JDK 或 Python 环境。默认仅监听本机 `127.0.0.1:8088`。

## 首次准备

1. 启动 Docker Desktop，等待引擎就绪。
2. 在本目录复制 `start.env.example` 为 `.env.start.local`，修改 `DB_PASSWORD`。该文件被 Git 忽略，不要发给他人。
3. 将 DeepSeek API key 单独保存在本机私密文本文件。默认读取 `E:\deeoseekapikey.txt`，也可以启动时指定 `-KeyFile`。脚本不会显示 key，也不会把它写入命令行或日志。
4. 在 PowerShell 执行下方命令；首次构建镜像可能需要数分钟。

```powershell
Set-Location D:\BankProject-AGUI-20261012
Copy-Item start.env.example .env.start.local
notepad .env.start.local
.\start.cmd
```

出现 `Ready` 后打开 <http://127.0.0.1:8088/>。Demo 登录信息以项目交接文档为准。Agent 走服务端代理，浏览器不需要接触 DeepSeek key。

## 常用命令

```powershell
.\start.cmd status
.\start.cmd logs
.\start.cmd stop
.\start.cmd check
.\start.cmd start -NoBuild
.\start.cmd restart -NoBuild
.\start.cmd start -NoBuild -Recreate
```

`start` 默认逐个重新构建镜像并重新创建容器，以包含当前源代码；首次构建需要访问 Docker Hub 和 npm registry。`-NoBuild` 仅适合已经构建过镜像、只需恢复服务的情况；加 `-Recreate` 可用已有镜像重新创建容器，不访问构建依赖。`stop` 保留 PostgreSQL 卷，不会删除账户或交易数据。需要换端口可使用 `.\start.cmd start -Port 18088 -ProjectName aster-local-2`；同一个 Compose 项目后续 `status`/`stop` 也须传相同的 `-ProjectName`，改端口后再启动还需传相同的 `-Port`。两个独立项目会有两套数据。

`restart` 使用同一个 Compose 项目重新创建前端、后端、Agent 及其依赖，保留数据库卷。默认同样重建镜像；`restart -NoBuild` 只使用本机已有镜像，**不会加载尚未构建进入镜像的新代码**。`check` 仅检查 Docker、配置、密钥文件和内存，不启动服务。`status`、`logs`、`stop` 可以在配置或密钥文件缺失时操作指定项目已有的容器。

## 当前这台电脑：直接使用已有隔离项目

以下均为一整行命令，可从任意目录运行，无需手工粘贴多条环境变量命令。它们只操作 `aster-acceptance-20261012`，与默认的 `aster-local` 不同。

检查状态：

```powershell
& 'D:\BankProject-AGUI-20261012\start.cmd' status -ProjectName aster-acceptance-20261012
```

使用已有镜像重启全套服务：

```powershell
& 'D:\BankProject-AGUI-20261012\start.cmd' restart -NoBuild -ProjectName aster-acceptance-20261012 -Port 18088
```

成功显示 `Ready` 后，访问 <http://127.0.0.1:18088/>；实验页面为 <http://127.0.0.1:18088/app/agent-copilot>。这套 Docker 启动方式统一通过代理端口访问，不会另外启动本机的 3000、8001、18080 端口。

更新代码后，去掉 `-NoBuild` 重建后再启动；请预留更充足的构建内存。Docker 后台运行，启动命令成功退出后不需要保持 PowerShell 窗口打开，Docker Desktop 需要保持运行。

停止同一套服务，保留数据库：

```powershell
& 'D:\BankProject-AGUI-20261012\start.cmd' stop -ProjectName aster-acceptance-20261012
```

### 低内存保护

启动及重启要求至少 2048 MiB 可用物理内存及 2048 MiB 系统提交内存余量。后者为 `Commit Limit - Committed Bytes`，不是任务管理器里的空闲物理内存。未满足时返回 `RESOURCE_BLOCKED`，在构建、停止或启动容器之前退出，不自动修改分页文件，也不结束其他应用。

如果出现此提示，先自行保存工作并释放不需要的应用资源，或在获准且资源足够的测试机器运行。同样可能需要更多资源才能完成镜像构建；2 GiB 是保护下限，不是所有负载都能成功的保证。

自定义密钥路径和配置文件：

```powershell
.\start.cmd start -KeyFile 'E:\private\deepseek.txt' -EnvFile 'D:\private\aster-demo.env'
```

## 检查与排障

启动程序先检查 Docker 引擎、数据库配置和密钥文件，再运行 Compose 配置校验。Compose `--wait` 需数据库、后端、Agent 和前端通过容器健康检查，最后验证首页返回 HTTP 200。可用 `status` 查看各容器，`logs` 查看最近 80 行日志。脚本不会打印数据库密码或 API key。

如果显示端口占用，选择其他 `-Port`，不要强制结束未知进程。如果 Docker Desktop 未运行，先启动它再重试。修改前端代码后运行默认 `start` 重新构建；`-NoBuild` 会继续使用旧镜像。若构建时报 `auth.docker.io` 或 `registry.npmjs.org` 网络错误，先恢复网络再重试；已经构建过镜像时可以使用 `-NoBuild -Recreate`。数据库升级由 Spring Flyway 和 Agent 的 `agent-state-migrate` 服务执行，脚本不会删除旧卷。

这是一套本地比赛演示启动方式。它不代替 R1 的浏览器刷新/SSE 验收；R1 当前仍为 PARTIAL，见 [验收记录](docs/milestones/r1-reliability-acceptance.md)。

## 本机启动验证（2026-10-13）

已在隔离的 `aster-acceptance-20261012` Compose 项目执行 `status`、`start -NoBuild`、`start -NoBuild -Recreate`，以及 `stop` 后再次 `start -NoBuild`。五个长期运行容器均达到 `healthy`；首页、`/app/agent-copilot`、公开导航 API 和容器内 Agent `/health` 均返回 HTTP 200。运行镜像 ID 与构建镜像 ID 一致。

完整重建曾成功构建镜像；之后一次重试在 Docker Hub token 请求上遇到本机 `198.18.*` 假解析地址，未能完成新的拉取。已有镜像的重建容器和停机恢复路径已实测通过。首次使用的新机器仍须确保 Docker Hub、npm registry 可访问。

## 本轮复验（2026-10-15）

- `scripts/test-start-launcher.ps1` 离线安全测试通过：只检查不启动、重启时 force-recreate、NoBuild 不构建、低提交内存拒绝、状态/日志/停止不依赖密钥、停止按项目容器筛选。该测试模拟 Docker/HTTP/内存探针，不代表真实服务已经启动。
- 真实 Docker 状态查询成功；已有隔离项目六个容器均处于退出状态，原映射为 `127.0.0.1:18088`，本机已有需要的服务镜像。
- 当前缺失的 `.env.start.local` 已从该隔离 PostgreSQL 容器的既有配置恢复，文件被 Git 忽略；没有修改数据库密码，没有打印密钥或密码。
- 实际执行 `restart -NoBuild -ProjectName aster-acceptance-20261012 -Port 18088`，Docker/Compose 配置检查通过；内存保护发现物理可用 5824 MiB，但提交内存余量只有 **324 MiB**，以 `RESOURCE_BLOCKED` 退出，未停止或启动任何服务。
- 本轮**未完成真实重启和服务健康检查**，不得把历史启动成功记录当作当前新版服务已运行的证据。本轮没有新的自动审批拒绝；阻塞来自内存保护。
- 随后复测 `start.cmd status` 时，Docker CLI 本身也报 `failed to create new OS thread` / Windows `errno=1450`，属于系统资源不足；此前 PowerShell 入口的状态查询已成功。现已将启动/重启的内存检查提前至 Docker 调用之前，避免在资源不足时继续拉起 Docker CLI。

离线安全测试可重复运行（不会操作真实 Docker）：

```powershell
& 'D:\BankProject-AGUI-20261012\scripts\test-start-launcher.ps1'
```

### 同日再次尝试：真实重启成功

2026-10-15 再次执行同一条 `restart -NoBuild` 命令时，可用物理内存为
4587 MiB、提交余量为 2237 MiB，通过保护检查。五个长期服务
（PostgreSQL、Banking Core、Agent、Web、反向代理）均达到 healthy，
Agent 状态迁移正常完成。首页、实验 Agent 页面、Legacy Agent 页面均返回
HTTP 200；Spring 健康状态 UP，Agent 健康接口 HTTP 200。
证据：[重启结果](artifacts/startup/restart-success-20261015.json)。

本次使用已有镜像，没有重建源代码；这证明启动与重启入口可用，不代表
最新 UX 源代码已进入镜像，也不代表 UX4/S1/R1 已完成验收。此前内存不足
及 Docker 线程创建失败的记录继续保留。

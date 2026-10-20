# 容器与部署配置

`compose/postgres.compose.yml` 提供仅绑定 `127.0.0.1:5432` 的本地 PostgreSQL；`demo.compose.yml`、`e2e.compose.yml`、`packaged-test.compose.yml` 和 `prod.compose.yml` 是不同用途的组合，不应混用。`nginx/` 是演示代理，Web/Banking Core Dockerfile 分别位于各模块。启动前阅读根 [交接入口](../docs/README.md) 和 [部署基础](../docs/deployment/production-foundation.md)。

需要自然语言 Agent 时，在 Demo 或 Prod Compose 后附加 `compose/agent.compose.yml`。该 overlay 构建 Python Agent、设置容器内服务地址，并从受限主机文件挂载只读密钥。见 [Demo 部署](../docs/deployment/demo-deployment.md)。

## 本地数据库

```powershell
docker compose -f infra/compose/postgres.compose.yml up -d --wait
docker compose -f infra/compose/postgres.compose.yml ps
```

演示默认账号/密码仅适用于本机。接收方若修改 `POSTGRES_*`，应在启动前配置对应的 Spring `SPRING_DATASOURCE_*`/`DB_*`。`docker compose down` 不删除卷；`down --volumes` 会永久删除该环境数据，测试前确认目标 Compose 项目。

## 容器评测与风险

演示 Compose 可在填好未提交的环境文件后构建启动；不要把 `.env`、数据库卷或备份文件放入源码交接包。`pnpm test:e2e:packaged` 对打包镜像运行端到端测试。接收方应固定新镜像 ID 后分别扫描 Web、Banking Core、Nginx/Proxy 和 PostgreSQL 的**运行镜像**，再做 CVE 包/版本/层/可达性与修复版本 triage。

2026-09-29 历史扫描为 22 Critical、79 High，100 项未闭环。本机 `test-results/m24-1` 为历史原始证据；源码仓库不随附这些运行产物。见 [原报告](../docs/security/m24-1-container-vulnerability-report.md)和[逐项清单](../docs/security/m24-1/inventory.md)。旧镜像结果不可当作当前镜像扫描，公网发布保持 HOLD；还需 HTTPS、真实 secret 管理及风险签署。

## 推荐启动入口

使用根目录 [start.cmd / start.ps1](../START-README.md)，统一管理同一 Compose 项目的构建、健康检查、增量重启和日志。`knowledge.compose.yml` 为可选知识服务；模型缓存和密钥均由本机外部配置提供。不要另起一套服务抢占端口。

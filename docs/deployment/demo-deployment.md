# 自包含 Demo 部署

版本 `v1.0.0-demo`，入口 `http://localhost:8088`。用于比赛演示，不处理真实资金。
主机只需 Docker Engine / Docker Desktop（Linux containers）和 Docker Compose plugin。
Node、Java、Maven、PostgreSQL 均在镜像内。首次构建需要访问 Docker Hub、npm、Maven Central 和 Ubuntu 软件仓库。

## 配置与启动

在项目根目录复制 `.env.production.example` 为 `.env.demo`，将 `DB_PASSWORD=CHANGE_ME` 改成自己的非空密码。该文件已被 Git 和 Docker build context 排除。
Windows 使用 `Copy-Item .env.production.example .env.demo`；Linux 使用 `cp .env.production.example .env.demo`。

```sh
docker compose --env-file .env.demo -f infra/compose/demo.compose.yml up -d --build --wait --wait-timeout 180
docker compose --env-file .env.demo -f infra/compose/demo.compose.yml ps
```

所有服务共享隔离的 internal 网络；仅 Nginx 另接入口网络，使 Docker Desktop/Linux 能将其主机端口发布。
默认仅 Nginx 绑定主机 `127.0.0.1:8088`。不占用本机 8080，不暴露数据库、Java 或 Node 端口。
需要局域网展示时显式设置 `DEMO_BIND_ADDRESS=0.0.0.0`，并由主机防火墙限制访问。
`DEMO_PORT` 可覆盖 8088。请不要在已有数据卷上随意修改 DB_NAME / DB_USER / DB_PASSWORD；PostgreSQL 初始化变量不会修改已有数据库账号。

首次启动 Flyway 执行 V1–V6，Hibernate validate，然后 demo seed 幂等地建立 Alex、3 个账户、61 条初始交易、卡、Recurring、Wealth 和 Public 内容。
正常 Demo 使用真实系统时钟；冻结的 2026 年 9 月 fixture 随时间变化不代表实时金融数据。只有隔离验收额外启用 e2e 时钟。

## DEMO ONLY 登录

- Email：`alex@aster.local`
- Password：`demo-password`
- Step-Up：`246810`

这些凭据仅用于演示。密码在数据库中以 BCrypt hash 保存，验证码不会持久化为明文。
prod profile 不创建这些账号，也不启用 Demo verifier。登录仍使用 PostgreSQL Session、CSRF 和资源授权。

## 日常命令

```sh
docker compose --env-file .env.demo -f infra/compose/demo.compose.yml logs --tail 100
docker compose --env-file .env.demo -f infra/compose/demo.compose.yml restart
docker compose --env-file .env.demo -f infra/compose/demo.compose.yml down
```

`down` 保留 named volume。重新执行 `up -d --wait` 即可继续原数据。
**只有确实要永久删除全部演示数据时**才执行以下 reset：

```sh
docker compose --env-file .env.demo -f infra/compose/demo.compose.yml down --volumes
docker compose --env-file .env.demo -f infra/compose/demo.compose.yml up -d --wait --wait-timeout 180
```

这不是应用启动的默认步骤。不要对日常开发 PostgreSQL 或别的 Compose project 执行 reset。

## 备份和恢复

完整操作见 [runbook](../operations/runbook.md)。备份包含金融数据和 Session，须保密保存，不提交 Git，不随源码分享。

## 验收命令

开发验证机安装项目依赖及 Playwright 浏览器后：

```sh
pnpm test:e2e:packaged
```

该脚本建立独立 `aster-m24-e2e-*` project，先构建、等待健康，再运行浏览器完整旅程、重启、故障恢复、备份恢复及 prod 隔离验证；结束删除该测试 project 的卷。
可设置 `PLAYWRIGHT_CHANNEL=msedge` 使用已安装 Edge。`M24_SKIP_BUILD=1` 仅供已构建相同源码后的重复验证。
正常部署不需要 pnpm / Playwright，也不需要 test override。

## 资源观察

本次 Docker Desktop 验收提供 16 个逻辑 CPU、7.62 GiB 可用容器内存。银行旅程中的一次采样：Web 约 148 MiB，Spring 351 MiB，PostgreSQL 62 MiB，Nginx 15 MiB；这是单用户观测，不是容量或峰值承诺。
建议验证机为 Docker 预留约 8 GiB RAM 和至少 10 GB 可用磁盘（镜像、构建缓存、依赖、数据库），沿用本次环境或自行重新测试资源下限。尚未证明 2 CPU / 4 GB 的最低运行保证。

# M24 — Production Packaging, Deployment Foundation & Web v1 Freeze

日期：2026-09-29。Release：**v1.0.0-demo / ASTER BANK WEB V1**。

## 范围与实现

1. **M24 scope**：只交付容器、配置、代理、部署/运维文档和验证。无新增 banking feature、endpoint、Domain、Migration、DTO 或 Agent。
2. **Architecture**：Browser → Nginx → Next.js standalone / Spring Boot → PostgreSQL。Customer/Public 仍由真实 Spring 处理，Next 不新增 BFF。
3. **Web Dockerfile**：Node 24.21.0，多阶段 pnpm frozen-lockfile → Next production build → standalone。构建阶段 bookworm-slim；运行阶段 trixie-slim，不带 npm/yarn。只复制 traced runtime、static 和 public，关闭公开 browser source maps。
4. **Backend Dockerfile**：Temurin 21.0.12.1_1 JDK 构建、JRE noble 运行，Maven Wrapper clean package -DskipTests；生成接口仍来自原 contracts。最终镜像不含 Maven、源码或测试依赖。
5. **Reverse proxy**：Nginx 1.28.3-alpine。保留 URI、Host，覆盖 X-Forwarded-*；Docker DNS 动态解析容器地址；connect 5s/read 30s/send 30s，body 上限 1 MiB，gzip，保留既有安全/cache headers。
6. **PostgreSQL**：保持 PostgreSQL 17-alpine，不升级 major、不调优参数；named volume 保存数据。
7. **Compose architecture**：demo 四服务共享 internal 网络；仅代理另接 edge 网络并发布端口。prod 模板三服务连接外部 PostgreSQL，不包含 Demo seed。所有服务 unless-stopped。
8. **Same-origin**：镜像固定 `NEXT_PUBLIC_API_MODE=backend`、显式 root sentinel `/`；API URL 为 `/customer/*`、`/public/*`。未设置 URL 仍 fail-closed；镜像不绑定 localhost:18080 或外部域名。
9. **Profiles**：local 保留原 :3000/:18080 开发流程；demo 启用幂等 seeds/code 和 HTTP Cookie；prod 禁止 Demo、Secure Cookie、无 local CORS。prod 与 local/test/demo/e2e/unit 混用立即失败。

## 安全与配置

10. **Session/cookie**：PostgreSQL JDBC Session。SESSION HttpOnly、Path=/、SameSite=Lax，会话期 Cookie；demo HTTP Secure=false，仅 prod 为 true。同一 Session Cookie 经服务重启、整栈重启和 down/up 后继续访问。
11. **CSRF**：代理旅程中的 login、Transfer、Card Step-Up、Recurring Stop、Investment 均成功；另验证已登录但不带 CSRF 的 Transfer POST 被 403 拒绝。未关闭 CSRF。
12. **CORS**：同源响应不添加跨源允许头；local exact-origin CORS 原样保留并通过真实后端回归。prod/demo 不默认允许 localhost:3000。
13. **Forwarded headers**：Nginx 覆盖客户端提交的 forwarding 信息，Spring 使用 framework 策略；后端仅容器网络可达。TLS 模板实际经 Nginx entrypoint 渲染并 `nginx -t` 通过（临时自签测试证书，未提交）。
14. **Demo seed**：fresh demo/e2e 与 RC1 相同：Alex、3 Accounts、61 initial Transactions、Cards、Recurring、Wealth、Public 内容。重启不重复插入，也不覆盖 mutation。正常 demo 使用系统时钟；仅隔离验收额外启用 e2e 固定时钟。
15. **Production no-seed proof**：真实 prod 容器连接独立 fresh `aster_prod`，自动迁移后 health UP、customers count=0；Session bootstrap 的 CSRF Cookie 含 Secure。缺失 DB_PASSWORD 的 prod 启动被拒绝。
16. **Environment**：统一容器 DB_HOST/PORT/NAME/USER/PASSWORD；Demo port/bind、JVM、prod hostname/TLS 路径见 [配置表](../deployment/configuration.md)。
17. **Secrets**：示例只含 placeholder；.env、备份、TLS 测试材料不进入 Git/build context。缺失、空值或 CHANGE_ME 失败，不输出值。容器日志检查未包含 demo password、step-up code、DB password 或 Session Cookie。
18. **Non-root**：inspect 验证 Web user=node、Banking user=banking；两者 cap_drop ALL。Nginx 使用官方启动/worker 降权行为；本轮未强制只读根文件系统。
19. **Host ports**：Demo 仅 `127.0.0.1:8088 → Nginx:80`；支持 DEMO_PORT。未占用 ShareLaTeX 8080。
20. **Database isolation**：PostgreSQL、Web、Banking 的 HostConfig.PortBindings 均为空；未重置日常 aster-banking 数据卷或操作无关服务。

## 构建与运维验证

21. **Healthchecks**：PG pg_isready；Spring health（含 DB）；Web `/`；proxy `/`。依赖 service_healthy，runner 还从主机实际探测代理入口。数据库停机时内部 health 返回 503 DOWN。
22. **Flyway**：fresh DB 自动 V1–V6，Hibernate validate；Spring Session schema 仍由 Flyway 管理。没有自动 repair/drop/reset。
23. **Clean build**：BuildKit 从源码上下文安装依赖并构建，.dockerignore 排除 node_modules/.next/target；未复制主机产物。修正了 JDK 镜像缺少 unzip 导致 Wrapper 下载 tar.gz 与 ZIP checksum 不匹配的问题，未关闭校验。Web build stage 明确复制 TypeScript 检查依赖的 docs/audit。
24. **Image sizes**：Docker inspect 总尺寸：Web 398,702,197 bytes（约 399 MB），Banking 518,471,410 bytes（约 518 MB），Nginx 92,460,189 bytes（约 92.5 MB）。这是本地镜像总尺寸，不等于压缩下载量。
25. **One-command startup**：准备 `.env.demo` 后，`docker compose --env-file .env.demo -f infra/compose/demo.compose.yml up -d --build --wait --wait-timeout 180`。部署机不需 Node/Java/Maven/PostgreSQL 安装。
26. **Stop**：同一 compose 命令前缀加 `down`，保留 named volume。
27. **Reset**：只有显式 `down --volumes` 才删数据，文档有永久删除提示；不是默认启动动作。
28. **Persistent volume**：实际操作后数据、Session 保留；测试 runner 独占临时 project，结束只删除其测试卷。
29. **Restart**：分别 restart Web/Banking/proxy，再 restart 整栈；同一浏览器 Cookie 继续读取最终金额。
30. **Down/up**：实际 down（不加 -v）后 up --wait，金融状态和 Session 保持。
31. **Backup**：暂停 backend，pg_dump -Fc 写容器临时文件，然后 compose cp 到 host；避免 PowerShell 二进制重定向损坏。
32. **Restore**：createdb fresh database → 从 host 复制 dump → pg_restore --exit-on-error → 改 DB_NAME → 启动 Spring，Flyway/Hibernate 验证原 schema。
33. **Backup/restore proof**：真实 custom-format dump 恢复到 fresh `aster_restore`，Overview/Current/available/portfolio/Spending/Card/Recurring 均保持；原有效 Session 仍工作。不是磁盘灾难、PITR 或多区域恢复认证。

## 代理浏览器验收

34. **Public**：Home、Catalog、Rates、Support、Search，以及全部 9 个 Public API 家族均成功。
35. **Login**：真实 Alex 登录、Cookie/CSRF、刷新、退出、未认证 Customer 401；Login axe 检查通过。
36. **Transfer**：¥500；故意丢弃已提交响应后以原幂等键恢复同一 receipt，无重复扣款。
37. **Card/Step-Up**：Freeze → FROZEN；Unfreeze 创建 challenge、246810 验证、intent-bound authorization 执行 → ACTIVE。
38. **Recurring**：停止 Netflix，保留历史消费，receipt 刷新可恢复。
39. **Wealth**：不适合产品被阻止；Stable Bond 投资 ¥1,000，receipt 和关联交易一致。
40. **Overview consistency**：Current 22342.31、Pending 32.00、Available 22310.31；Portfolio 19320.00、Spending 4968.00、总存款 CNY equivalent 34953.68；Card ACTIVE、Netflix STOPPED。
41. **Same-origin network**：记录 130 个 API responses：117×200、7×201、6×预期 401；记录完整 URL，API origin 全为代理，零错误 origin，正常旅程零非预期 4xx/5xx。
42. **No MSW**：130 responses 全部 fromServiceWorker=false，浏览器注册数 0；后端和 PG 停机时显示重试，不回退 fixture。
43. **Console/failures**：正常旅程零 pageerror、hydration/CORS/CSP/重复 key 错误。故障注入验证 backend 停机时 Web 200、API 502/504；DB 停机 API 500 PERSISTENCE_UNAVAILABLE；恢复后数据保持。502/504 分别对应拒绝连接与网关超时，均为预期故障。
44. **Responsive/accessibility**：经代理 Overview、Transfer 等核心页面 axe 0 violations，390/1440 截图，320px 不溢出。登录检查通过。M23 完整 320/390/768/1024/1440 回归继续通过。截图已人工查看。
45. **Prod security review**：Secure Cookie、no seed、CSRF、required config、profile 隔离、Actuator 外部 404；HTTPS 模板已语法验证。Docker Scout 最终 Web：0 Critical / 2 High / 1 Medium / 25 Low。High 是基础系统 Perl CVE-2026-82560、zlib CVE-2026-85091（扫描库标为 Not Fixed）。Backend scan 卡在 indexing 后终止，不能报告无漏洞；Nginx/PG 未独立扫描。详见 [生产基础](../deployment/production-foundation.md)。
46. **Demo behavior**：HTTP localhost:8088 的非 Secure Cookie 仅属于 demo/local，所有身份/CSRF/ownership/step-up 仍真实生效。prod 不启用 Demo credential/code。

## 最终验证

47. **Application regression**：全部实际运行通过：

| 验证                             | 结果                                                                         |
| -------------------------------- | ---------------------------------------------------------------------------- |
| pnpm contract:check（开始/结束） | PASS，两份 canonical hash 不变                                               |
| pnpm lint                        | PASS，ESLint + Prettier                                                      |
| pnpm typecheck                   | PASS，generated API check + Next typegen + TypeScript                        |
| pnpm test                        | 389 Vitest/RTL + 3 contract-hash，全部通过                                   |
| pnpm build                       | PASS，Next 16.3.6 production build                                           |
| pnpm test:e2e:mock               | 81/81                                                                        |
| pnpm test:e2e:backend，390px     | 15/15                                                                        |
| pnpm test:e2e:backend，1440px    | 15/15                                                                        |
| mvnw.cmd clean verify            | 532/532：193 unit/architecture/web + 339 PostgreSQL IT；0 failure/error/skip |
| pnpm integration:check           | 48/48，无生产 fixture import 或持久浏览器金融 cache                          |

48. **Docker validation**：Web/Banking clean-context builds；四服务 fresh healthy；Packaged Playwright 2/2（完整金融旅程 + 运维验证，约 2.9 分钟）；restart/down-up/backup-restore/outages/prod isolation 全通过。TLS 模板 nginx -t 和 prod Compose config 通过。核心验收日志为根目录忽略的 `m24-*.log`，证据在 `test-results/packaged-evidence`。
49. **Contract hashes**：customer.yaml、public.yaml、freeze.json 均未修改：

| Contract       | Operations | Canonical SHA-256                                                |
| -------------- | ---------: | ---------------------------------------------------------------- |
| Customer 1.9.0 |         39 | 602ddcc2ca1b3903034bab2979516220fbf3fb78c0212fa4158a4f0c7ac5f3e5 |
| Public 1.2.0   |          9 | 460387a9a26548941a692bcd7e7036e21d136b4d6a9cb570faa0a4fc1ac106ef |

50. **Known limitations**：Demo credentials/code/rates/products；无真实支付/卡/证券网络、KYC、真实通知、Admin、Mobile、Agent、HA、多节点 Session 拓扑、托管秘密、监控告警平台、生产 DR/PITR。CSP inline-script 限制延续 M23。基础镜像仍有扫描告警，未完成全镜像漏洞认证。未部署公网或证明银行级 production readiness。备份/trace 包含安全状态或测试输入，禁止随源码分享。
51. **Docs created**：[发布冻结记录](../../contracts/openapi/releases/README.md)、[Demo 部署](../deployment/demo-deployment.md)、[生产基础](../deployment/production-foundation.md)、[配置表](../deployment/configuration.md)、[Runbook](../operations/runbook.md)；更新 architecture/security review、README 和项目进度。测试截图包括 [desktop](../screenshots/m24-overview-1440.png)、[mobile](../screenshots/m24-overview-390.png)。
52. **Final Web V1 status**：

```text
CUSTOMER API: 39 / 39
PUBLIC API: 9 / 9
TOTAL BACKEND: 48 / 48
FRONTEND: REAL BACKEND
APPLICATION: COMPLETE
SYSTEM HARDENING: COMPLETE
PACKAGING: COMPLETE
DEPLOYMENT FOUNDATION: COMPLETE
PUBLIC CLOUD: NOT REQUIRED / NOT YET TARGET-SPECIFIC
RELEASE: ASTER BANK WEB V1 (v1.0.0-demo)
AGENT: NOT IN SCOPE
STOP AT M24.
DO NOT ADD NEW BANKING FEATURES.
DO NOT IMPLEMENT AGENT.
```

## 主要修改文件

- `apps/web/Dockerfile`、`next.config.ts`、API runtime/root sentinel test。
- `services/banking-core/Dockerfile`、application-demo/prod.yml、DeploymentConfiguration/test；既有 seed/verifier 的 profile 范围；隔离 e2e clock profile。
- `.dockerignore`、`.gitattributes`、`.gitignore`、`.env.production.example`。
- `infra/nginx/`：主配置、routes、demo server、TLS template。
- `infra/compose/`：demo/prod/packaged-test。
- `scripts/packaged-e2e.mjs`、`playwright.packaged.config.ts`、共享 banking journey 与 packaged operations tests；原 backend config 排除仅容器测试；根 package.json 增加测试命令。
- 上述文档和 M24 screenshots；未新增 migration，不修改 frozen contract。

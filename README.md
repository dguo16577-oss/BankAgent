# AI Banking — Aster Bank 比赛演示

> **GitHub 仓库说明：** 本仓库由已校验的 2026-10-11 源码交接包展开。为避免泄露或重复存储，原始 ZIP、校验旁文件、运行日志、模型原始轨迹、运行历史和本机环境文件不进入 Git；`PACKAGE-MANIFEST.json` 仅对应原始交接包快照，不代表后续 Git 工作树清单。

> **2026-10-11 交接快照：** 新评测人请先读 [交接总览](HANDOFF-README.md)、[逐项测试矩阵](docs/handoff/manual-test-matrix.md)和[已知问题](docs/handoff/known-issues.md)。下方含多个历史里程碑快照，其旧 API 数量、Agent 工具数和测试结果不能代替本次交接状态。

> 当前开发线：B4 后的 AI Banking 演示扩展。Python Agent 可用中英文查询当前客户账户、消费、交易、卡片与代扣，检索带来源的公开知识，并提出转账方案。任何转账仍由银行页面逐笔审阅、验证和执行。双用户内部演示转账增加 Lin 的账户入账及交易记录。功能与人工测试范围见 [测试表](docs/testing/ai-banking-manual-checklist.md)。以下 M24/B3 段落保留历史里程碑记录。

> 历史记录：B3 时 Customer 1.12.0 / 52 operations、Public 1.2.0 / 9 operations。当前版本与运行状态以 [项目进度](docs/project-progress.md) 为准；M24 v1.0.0-demo 历史记录保留在 [发布契约](contracts/openapi/releases/README.md)。

**Aster Bank** 包含无需登录的 Public Website 和 `/app/*` Customer Banking。客户侧保留 Overview、Accounts、Transactions、Payments、Cards、Spending/Recurring、Wealth 与模拟安全流程。采用深蓝和青绿色，不使用 HSBC 品牌资产。

Java 21 / Spring Boot 4.1.1 后端目前实现 Customer 55/55、Public 9/9，共 64 个冻结 API operation；Web 默认连接真实 Spring，使用 Cookie Session、CSRF 和 PostgreSQL 持久化流程。MSW 仅用于测试及显式 mock 模式。当前 AI 演示范围、验证结果和限制见 [交付报告](docs/milestones/competition-agent-demo-report.md)；M24 的 48/48 与 Web V1 冻结是历史快照，见 [M24 报告](docs/milestones/m24-report.md)。

## Docker Demo 启动

复制 `.env.production.example` 为忽略的 `.env.demo`，填写自己的 DB_PASSWORD 后：

```sh
docker compose --env-file .env.demo -f infra/compose/demo.compose.yml up -d --build --wait --wait-timeout 180
```

访问 <http://localhost:8088>。普通 `down` 保留数据库卷；`down --volumes` 会永久删除 Demo 数据。TLS/生产配置见 [部署基础](docs/deployment/production-foundation.md)。

## 环境与启动

推荐 Node.js 24 LTS、pnpm 11.19.0。首次使用：

```powershell
cd C:\path\to\BankAgent
pnpm install --frozen-lockfile
# 先按集成文档启动 PostgreSQL 和 local Spring :18080
pnpm dev
```

公开站从 http://localhost:3000/ 进入，无需登录。从公开页触发登录会返回原页面；直接打开 `/login` 登录会进入银行首页，个人工作台由导航进入。Local Demo 登录为 `alex@aster.local` / `demo-password`；第二位演示用户为 `lin@aster.local` / `demo-password`。B4 操作验证码是随机生成的，在 `demo` profile 中从页面“查看模拟短信”读取。
默认 backend 模式需要 PostgreSQL 和 Spring。`pnpm dev:mock` 显式运行独立 MSW 演示。开发命令的 API origin 默认 `http://localhost:18080`，可导出 `NEXT_PUBLIC_BANKING_API_BASE_URL` 覆盖；修改 NEXT_PUBLIC 环境变量后需重启或重新构建。

Agent 还需单独启动 `pnpm dev:agent`（Python 依赖见 [Agent Runtime](services/agent-runtime/README.md)）。若 8001 端口不可用，可以改用其他端口，并将 Web 服务端的 `ASTER_AGENT_RUNTIME_URL` 指向它；本机演示使用 18101。在 Agent 进程环境设置 `DEEPSEEK_API_KEY` 才启用 DeepSeek；密钥不传给浏览器。两个客户同时登录要使用普通窗口加无痕窗口，或两个独立浏览器配置；同一浏览器中的不同 localhost 端口仍共享 Cookie。

本机已构建的 Web 与 Agent 可用一条 CMD 命令重启：`scripts\restart-local.cmd all`。也可传 `web` 或 `agent` 单独重启。脚本分别打开日志窗口；保持窗口开启。它只停止占用 3000/8001 且命令行匹配本项目的进程，其他进程占用端口时会报错。Web 需先完成构建，Spring/PostgreSQL 仍需单独运行；Agent 启动脚本会尝试本机默认的密钥文件候选路径，也可优先通过 `DEEPSEEK_API_KEY_FILE` 显式指定，Python 可执行文件通过 `ASTER_AGENT_PYTHON` 指定。脚本不会打印密钥。

生产构建与启动必须明确提供 API origin，例如：

```powershell
$env:NEXT_PUBLIC_BANKING_API_BASE_URL = "http://localhost:18080"
pnpm build
pnpm start
```

这仅演示本地构建验证。部署到 HTTPS 时需使用部署 API origin、配置精确 CORS，并按部署策略设置 `ASTER_HTTPS=true`；不要启用 Spring local profile。

## 根目录命令

| 命令                     | 用途                                                   |
| ------------------------ | ------------------------------------------------------ |
| `pnpm dev`               | 启动 Web 开发服务器                                    |
| `pnpm dev:agent`         | 在本机 8001 端口启动 Python Agent Runtime              |
| `pnpm test:agent`        | Agent 工具边界、知识与双会话单元测试                   |
| `pnpm lint`              | ESLint（禁止显式 any）与 Prettier 检查                 |
| `pnpm typecheck`         | 检查生成类型是否过期、生成 Next 路由类型、严格 TS 检查 |
| `pnpm test`              | Vitest + React Testing Library + Node MSW              |
| `pnpm build`             | Next.js 生产构建                                       |
| `pnpm start`             | 运行已构建的 Web（使用构建时 API 配置）                |
| `pnpm api:generate`      | 从 OpenAPI 生成前端类型                                |
| `pnpm format`            | 格式化代码与文档                                       |
| `pnpm test:e2e`          | Playwright Chromium 测试（自动启动开发服务器）         |
| `pnpm dev:mock`          | 显式启动 MSW 演示，不作为后端故障回退                  |
| `pnpm test:e2e:backend`  | 自动启动临时 PostgreSQL、Spring、Web 与真实 E2E        |
| `pnpm integration:check` | 核对 typed client 及 fixture/storage 边界              |

首次运行 E2E 前执行 `pnpm --filter web exec playwright install chromium`。

如果浏览器下载不可用，也可使用已安装的 Edge（PowerShell）：

```powershell
$env:PLAYWRIGHT_CHANNEL = "msedge"
pnpm test:e2e
```

## 目录

```text
apps/web/                 Next.js App Router 前端
  e2e/                    Playwright 路由与布局验证
  public/                 MSW Service Worker
  src/app/(public)/       公开站独立 Layout 与页面
  src/app/app/            /app/* 客户 Banking Layout 与所有现有业务
  src/app/login/          Demo credential 登录，真实 Cookie Session
  src/components/         布局、Providers、占位页及 shadcn/ui
  src/generated/          customer-api.d.ts / public-api.d.ts（不可手改）
  src/lib/api/            API client、错误类型、Session 查询
  src/mocks/              浏览器与测试共用 MSW handlers
  src/test/               Vitest setup
services/banking-core/    Spring Boot / PostgreSQL 银行业务与安全后端
services/agent-runtime/   Python Agent Runtime、工具白名单与公开知识图谱
contracts/openapi/        唯一机器接口契约
docs/architecture/        架构说明
docs/api/                 Contract 工作流
docs/adr/                 架构决策
infra/docker/             预留目录
infra/compose/            预留目录
```

## 页面

公开路由：`/`、`/banking`、`/cards`、`/borrowing`、`/investments`、`/insurance`、`/insights`、`/offers`、`/support`、`/ask`。客户路由：`/app/overview`、`/app/accounts`、`/app/accounts/[accountId]`、`/app/transactions`、`/app/transactions/[transactionId]`、`/app/payments`、`/app/cards`、`/app/spending`、`/app/wealth`、`/app/agent`、`/app/settings`。
账户详情示例：http://localhost:3000/app/accounts/acc_current，展示 PostgreSQL 中的 Demo 账户，不代表实际银行账户。

桌面统一侧栏、顶部品牌、Search 占位、Notification 图标和 API 提供的当前用户名。窄屏使用横向滚动导航和单列内容。Overview、Accounts、Transactions、Payments、Cards、Spending/Recurring 和 Wealth 通过共享 transport 读取及更新 Spring/PostgreSQL 中的 Demo 数据。Agent 页面通过同源代理连接 Python Runtime；Settings 仍为说明性页面。

## 技术与约束

Next.js 16 / React 19 / TypeScript strict / Tailwind 4 / shadcn/ui（Button、Card 源码组件）/ Lucide / TanStack Query / Zod / React Hook Form / MSW / Vitest / React Testing Library / Playwright / Recharts。

Zod、React Hook Form 与 resolver 作为后续表单基础，M0 不虚构业务表单。精确安装版本见 package 文件与根 `pnpm-lock.yaml`。

Header 经 TanStack Query 和统一 API client 获取用户；组件不硬编码用户。运行模式初始化完毕才挂载消费者；backend 模式不会启动 MSW，后端不可用时显示错误与重试。

Web 默认通过真实 Cookie Session、CSRF 和 Spring 授权边界运行。Mock 测试保持原有模拟语义。Agent 使用可选 DeepSeek 意图识别与公开知识摘要，不引入 LangChain、LangGraph、Redis 或 Redux。

## 最终架构

Next.js Web → Spring Boot Banking Core → PostgreSQL。
Python Agent Runtime → Banking Core APIs。**Agent 永远不得直接访问银行数据库。**

参阅 [架构](docs/architecture/overview.md)、[API](docs/api/README.md)、[ADR 0001](docs/adr/0001-system-architecture.md)。

## 历史里程碑记录

以下 M1–M11 说明记录当时的实现与范围；其中“尚无后端”“停止在 Mx”等历史描述不代表当前状态。当前默认运行方式和进度以本文开头及 M23 报告为准。

## M1 Overview

新增统一 Demo profile、decimal string Money、六个月消费趋势、账户/交易/卡片/待付款/投资摘要。详见 [Overview API](docs/api/overview.md)。根目录也支持运行 `pnpm exec playwright test`，本机可设置 `PLAYWRIGHT_CHANNEL=msedge` 使用 Edge。

## M2 Accounts

新增 Accounts Domain APIs、列表和详情，统一 Demo 数据保持 Overview/Accounts 一致。详情 recentTransactions 保留为最近 5 条的内嵌快照。余额/可用余额、pending、预先脱敏账户标识与 demo FX provenance 见 [Accounts API](docs/api/accounts.md)。

## M3 Transactions

新增 Transactions Domain APIs、URL 同步的筛选和搜索、cursor Load more、交易详情及错误恢复。入口位于 Overview 的 View all transactions 和 Account Detail 的 View all activity，主侧栏保持不变。交易采用非负 amount + direction，初始 48 条确定性 fixtures（M6 扩充至 61 条） 复用于三个模块，并校验 pending 与 available balance。见 [Transactions API](docs/api/transactions.md)。

## M4 Payments

国内 CNY 转账：`/app/payments` → `/app/payments/transfers/new` → `/app/payments/transfers/review/[intentId]` → `/app/payments/transfers/[transferId]`。使用 RHF/Zod、不可变 TransferIntent、显式确认、幂等执行和统一 mutable MockBankingStore。成功后 Accounts/Transactions/Overview 一致更新，Spending 不增加。

同一标签页刷新保留 Demo 数据；移除 sessionStorage 的 `aster-banking-state-v1` 和旧 `aster-m4-banking-state-v1`（若存在）并刷新可重置。Demo 时间固定起点，随成功转账推进，不跟随系统时间。金额只用 decimal strings / BigInt 计算。详见 [Payments API](docs/api/payments.md) 与 [ADR 0002](docs/adr/0002-transfer-intent-execution.md)。

## M5 Cards

`/app/cards` 与 `/app/cards/[cardId]` 提供卡片、已脱敏标识、控制项和复用 Transactions API 的 activity。冻结和关闭控制项通过 Prepare → Review → Confirm → Receipt 完成；解冻和开启控制项显示 STEP_UP_AUTH_REQUIRED，M8 通过绑定原 intent 的验证与授权闭合执行。不会修改历史交易、pending 或账户/消费/投资。

CardService 在服务层判定风险，比较当前状态/版本，并沿用幂等与原子提交。现有 M4 Demo 状态可迁移，保留转账余额和回执。见 [Cards API](docs/api/cards.md) 与 [ADR 0003](docs/adr/0003-card-action-risk-classification.md)。M5 不实现真实认证或 card payment simulator。

## M6 Spending Analytics + Recurring Payments

- `/app/spending`：服务端派生消费统计、明确同期窗口、每日趋势、分类/商户 drilldown，以及定期付款列表。默认 CNY 账户；单账户按原币统计，不做隐含换汇。
- `/app/spending/recurring/[recurringPaymentId]`：定期付款详情、关联账户/卡/交易、来源与可管理能力。
- Stop future payments → immutable review → explicit confirmation → receipt。停止 Netflix 后 Overview 不再展示未来 Netflix 付款，历史交易、消费、余额、pending、cards、wealth 不变。
- Bookshop 为三次确定性交易识别的模式，具备 machine-readable provenance，无银行侧停止能力。
- M6 建立的 UI/Contract/Mock 测试保留；M22 正常运行通过真实 `/customer` API 获取 Spending 和 Recurring，Mock Store 仅用于显式 mock 和测试。
- 详见 [Spending](docs/api/spending.md)、[Recurring payments](docs/api/recurring-payments.md)、[ADR 0004](docs/adr/0004-recurring-payment-management-semantics.md)。

**停止银行侧未来扣款不代表终止外部服务合同。** 本轮不实现重启、修改周期/金额、商户取消、退款、Agent 或 M7。

## M7 Wealth / Investment

- `/app/wealth`：统一 Store 驱动的 portfolio、positions、模拟月度表现、R2 risk profile 和服务端筛选的产品 catalog。
- `/app/wealth/products/[productId]`：产品条款、模拟收益说明、适当性检查。R1/R2 对 Alex R2 为 SUITABLE，R3/R4 为 NOT_SUITABLE。
- `/app/wealth/products/[productId]/invest` → `/app/wealth/orders/review/[intentId]` → `/app/wealth/orders/[orderId]`：金额输入、不可变 review、明确确认、原子执行及刷新可加载的回执。
- 零手续费申购 Stable Bond ¥1,000 后：Current ¥22,842.31，Portfolio ¥19,320，Spending 仍 ¥4,968。新增唯一 INVESTMENT_PURCHASE / INVESTMENT 交易，不增加消费或收益。
- 新增 Wealth API/Domain Service、Store v7 迁移、生成类型和测试，详见 [Wealth API](docs/api/wealth.md) 与 [ADR 0005](docs/adr/0005-investment-suitability-and-order-intent.md)。

所有产品、收益和订单均为 SIMULATED；不实现真实交易、行情、KYC、认证、Agent、赎回或下一 milestone。

## M8 — Demo security

Banking routes and APIs now require a simulated Session. Login is AAL1; unfreeze and control enable require a short-lived, single-use AAL2 ActionAuthorization bound to the original card intent ID/hash and session. Authorization consumption is atomic with card mutation, while exact idempotent retries retain the original receipt. Protective actions and existing transfer/recurring/investment policies are unchanged.

See [Security API](docs/api/security.md) and ADR 0006 for lifecycle, errors, deterministic time and simulator limits. Local test credentials/code are only in `apps/web/src/mocks/data/security-fixture.ts`. The previous M0 login shortcut is replaced by a form. No real identity provider, backend or Agent is implemented. Stop at M8.

## M9 Public Banking Foundation

公开站包含首页、桌面 Mega Menu、窄屏 accordion 导航、8 个分类页和 Guest Ask Aster shell。`/cards` 是产品目录，`/app/cards` 是客户卡片；`/investments` 是公开产品信息，`/app/wealth` 是客户投资组合。所有原 Customer API 已迁移到 `/customer/*`，Public 内容由 `/public/home` 和 `/public/navigation` 提供。Admin / Internal 仅作为未来边界预留。

参阅 [Public API](docs/api/public.md)、[API surfaces](contracts/openapi/README.md) 和 [ADR 0007](docs/adr/0007-api-surfaces-and-public-banking-site.md)。本轮不改变 M4–M8 领域规则，不新增金融 mutation，不实现 Agent。该基础在 M10 中继续保留。

### Production preview E2E

资源受限时可对优化构建运行完整浏览器回归（Playwright 自动管理 preview 生命周期）：

```powershell
$env:NEXT_PUBLIC_API_MODE = "mock"
pnpm build
$env:PLAYWRIGHT_CHANNEL = "msedge"
$env:PLAYWRIGHT_BASE_URL = "http://localhost:3009"
$env:PLAYWRIGHT_WEB_SERVER_COMMAND = "pnpm --filter web exec next start --port 3009"
pnpm exec playwright test
Remove-Item Env:NEXT_PUBLIC_API_MODE
```

不设置 URL/command 覆盖时，E2E 默认仍使用 3000 端口的开发服务。

## M10 — Public Service Catalog & Knowledge Foundation

公开站新增 21 个产品/服务、15 篇知识文章、2 个示例活动，以及 demo rates/fees。目录、详情、最多三卡比较、Support 搜索和 Header 搜索均通过 Public API。首页复用相同数据源；`/ask` 提供关键词搜索并明确 AI 尚未接入。

新增路由：`/products/[slug]`、`/cards/compare`、`/rates`、`/fees`、`/payments-fx`、`/support/[slug]`。原有分类页、`/offers` 和 `/insights` 已升级为 API 数据驱动内容。

参阅 [Catalog](docs/api/public-catalog.md)、[Search](docs/api/public-search.md)、[Support](docs/api/public-support.md)、[ADR 0008](docs/adr/0008-public-content-and-agent-knowledge-boundary.md)。Customer API、认证和金融业务规则保持原样。停止在 M10，不实现 Agent、真实申请或真实市场数据。

## M11 — Banking Web Freeze & Contract Audit

冻结版本：Customer contract 1.9.0、Public contract 1.2.0；版本仅属于 artifact，不进入 URL。新增 `pnpm contract:check`、`pnpm check` 和 `pnpm audit:update`，维护正式 OpenAPI lint、接口清单、路由清单及规范化冻结哈希。

交接入口：[Customer 审计](docs/audit/customer-contract.md)、[错误码](docs/audit/error-codes.md)、[安全与 Mutation](docs/audit/security-and-mutations.md)、[工程与可访问性](docs/audit/engineering.md)、[后端实施矩阵](docs/backend/implementation-matrix.md)、[延期事项](docs/audit/deferred-issues.md)。所有后端 endpoint 仍为 NOT_IMPLEMENTED。本轮停在 M11。

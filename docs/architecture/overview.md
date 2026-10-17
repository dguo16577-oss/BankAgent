# 系统架构

## 最终架构

```text
Next.js Web
      |
Banking Core — Spring Boot
      |
PostgreSQL

Agent Runtime — Python
      |
Banking Core APIs
```

`contracts/openapi/customer.yaml` 和 `public.yaml` 是已实现的两个 API surface 的唯一机器接口契约。客户端请求与响应类型由对应 contract 生成。Admin / Internal 暂无 contract 或实现。

Banking Core 负责业务规则、授权和数据一致性。Agent 永远通过 Banking API 操作业务，禁止直接访问银行数据库。

## M0 实际实现

- `apps/web`：Next.js App Router、严格 TypeScript、Tailwind、shadcn/ui。
- 浏览器加载 Providers → MSW 启动完成 → TanStack Query → API client → MSW Session handler。
- Header 使用 Session 查询，提供加载与重试状态；用户资料只存在于契约示例与 mock fixture 中。
- Browser MSW 和 Node 测试复用相同 handlers，仅拦截 `GET /customer/session`。
- M0 默认启用 mock，包括本地 production build/start 演示。`NEXT_PUBLIC_API_MOCKING=disabled` 是未来接入点；目前禁用后没有可用后端。
- 桌面侧栏、窄屏横向滚动导航、自适应网格为后续移动端扩展提供基础。
- Zod、React Hook Form 和 resolver 已安装，留待未来表单使用；M0 不创建业务表单或第二套 DTO。

## 边界

M8 登录表单创建模拟 Session；统一 AuthBoundary 仅保护 `/app/*`，MSW Session 守卫仅保护 Customer API（login 除外）；Public API 和公开站不依赖登录。没有 Spring Boot、Python Agent、数据库、Redis、LLM 或真实银行调用。`services` 和 `infra` 目录仅保留说明文件。

参见 [ADR 0001](../adr/0001-system-architecture.md) 与 [API 工作流](../api/README.md)。

## M1 扩展

保留上述基础链路，增加 `features/overview` feature hook 与 Dashboard，以及 `/customer/overview` Web read model。Session 和 Overview 共用 `mocks/data/demo-profile.ts`。M0 的单一接口/全部占位描述属于历史阶段；当前 Overview 已展示财务摘要，其余路由仍是占位。

金额契约固定为 decimal string，Mock 计算使用整数分。Recharts 只负责趋势展示，应用状态继续使用 TanStack Query 和 React。没有新增后端服务或 Agent，未改变 ADR 0001。

## M2 Accounts

新增 Accounts 列表与详情 Domain APIs，仍使用现有 Query Provider、API client、MSW 和契约生成链路。Overview 只更新同周期消费比较与等值估算说明，并复用账户摘要 schema / data source。Accounts 详情提供内嵌近期交易；未增加全局交易 API、后端、数据库或 Agent。

## M4 Mutable Banking Simulator

Payments 首次增加 Demo 业务写操作。链路为 React → feature hook → API client → MSW thin handler → TransferService → MockBankingStore。已有 Session、Overview、Accounts、Transactions handlers 同样读该 Store。Deterministic fixtures 仅用于初始化，Overview 不维护独立账户余额。

Prepare 保存不可变条款及 hash；Review 读取原始 snapshot；Execute 只接受 intentId/hash，要求幂等键，重新验证后一次提交余额、交易、回执和状态。sessionStorage 保留同标签页刷新后的状态，不作为真实银行存储。可注入 clock 支持确定性测试。架构决策见 [ADR 0002](../adr/0002-transfer-intent-execution.md)，接口与错误语义见 [Payments](../api/payments.md)。没有引入真实后端、数据库或 Agent。

## M5 Cards

Cards 加入同一个 MockBankingStore，Overview 的卡片摘要从当前 Store 读取。CardService 负责风险分类、不可变 intent、幂等性、stale-state 检查与原子提交；MSW handlers 只处理 HTTP。CardState 同时比较 status、四项 controls 和 version，防止过时 Review 生效。

风险分类与授权要求属于 Banking Core，不属于 UI 或未来 LLM。PROTECTIVE 操作要求显式确认；RISK_INCREASING 操作要求 STEP_UP_AUTH，M5 暂时阻止执行，M8 接入 intent-bound Step-up 后可授权执行。卡片操作推进共享模拟时钟，但保持金融 asOf、账户、交易、消费和投资不变。详见 [ADR 0003](../adr/0003-card-action-risk-classification.md) 和 [Cards API](../api/cards.md)。未实现真实认证或刷卡模拟器。

## M6: Banking Analytics and recurring management

Spending component → feature hook → API client → MSW handler → pure Banking Analytics selector → unified Store Transaction state。Overview 调用同一 selector，避免第二套统计数据。BigInt minor units 用于金融计算；图表边界才转换 number。详情 drilldown 复用 M3 Transaction Domain。

Recurring component → feature hook → API client → MSW → RecurringService → MockBankingStore。Store v6 保存 recurring instructions、immutable action intents、receipts 和独立 endpoint scope 的 idempotency；复用 M4/M5 clock、严格请求字段校验、hash、atomic persist-before-commit。

Prepare 不改变业务状态；确认只停止银行侧未来付款授权/计划。Overview 的 upcoming projection 跟随 ACTIVE recurring state，Transaction history / Analytics / account balances / cards / wealth 不受影响。检测 provenance 与正式 mandate 分离，UI 不能推断 capability。见 [ADR 0004](../adr/0004-recurring-payment-management-semantics.md)。

当前仍无 Spring Boot、数据库、付款调度器或商户集成。M7 增加模拟投资，M8 增加模拟认证。

## M7: Wealth domain and order execution

Wealth UI → feature hooks → API client → thin MSW handlers → WealthService → shared MockBankingStore。Store v7 owns portfolio, products, riskProfile, suitabilityChecks, investmentOrderIntents, investmentOrders and endpoint-scoped idempotency. Existing M4–M6 state migrates without losing prior mutations.

Banking Core 决定 suitability，冻结第一版 risk-rank 规则。准备 intent 必须有有效证据；review 展示不可变产品/账户/金额/费用/适当性快照；执行重新验证并一次性提交账户、持仓、订单、intent 与 Transaction Domain 更新。Overview 从真实 Store portfolio 投影，不维护独立投资余额。新本金与模拟收益分离，INVESTMENT_PURCHASE / INVESTMENT 不进入 Spending。

真实市场执行、NAV/报价、身份认证与赎回均未实现。未来 Agent 只能调用同样的 Banking APIs，不得绕过适当性或直接访问数据库。见 [ADR 0005](../adr/0005-investment-suitability-and-order-intent.md)。M7 投资逻辑在 M8 保持不变。

## M8 — Demo security

Banking routes and APIs now require a simulated Session. Login is AAL1; unfreeze and control enable require a short-lived, single-use AAL2 ActionAuthorization bound to the original card intent ID/hash and session. Authorization consumption is atomic with card mutation, while exact idempotent retries retain the original receipt. Protective actions and existing transfer/recurring/investment policies are unchanged.

See [Security API](../api/security.md) and ADR 0006 for lifecycle, errors, deterministic time and simulator limits. Local test credentials/code are only in `apps/web/src/mocks/data/security-fixture.ts`. The previous M0 login shortcut is replaced by a form. No real identity provider, backend or Agent is implemented. Stop at M8.

## M9 Product surfaces and client boundaries

```text
Public Website / + category pages + Guest /ask
    → /public/* → public reference fixtures (read-only)

Customer Web /app/*  \
                       → /customer/* → Banking services → customer state
Future Customer Mobile /

Future Admin Web / staff operations
    → /admin/* (reserved)

Trusted service-to-service / explicitly authorized orchestration
    → /internal/* (reserved)
```

Public Website and Customer Banking have separate layouts. The public header never queries Session. Public card/investment information does not become customer assets; it cannot mutate customer data. The customer header links back to `/`.

Customer Web and future Customer Mobile share the same APIs; there are no client-specific API namespaces. Admin covers staff operations, customer servicing, risk and audit. Internal is for trusted services, not an unrestricted Agent shortcut. Future Customer Agent permissions remain explicit, and sensitive actions retain trusted user intent-bound authorization.

No new financial mutations, Admin/Internal endpoints, live rates, product applications or LLM capabilities are implemented. See [ADR 0007](../adr/0007-api-surfaces-and-public-banking-site.md). Stop at M9.

## M10 Public content foundation

Public reference fixtures (`mocks/public/catalog.ts`, `support.ts`, `rates.ts`, `offers.ts`) sit outside the mutable customer store. Public API handlers own filtering/search; feature hooks consume the common API client. Home and navigation are projections from the same content sources. Details, card comparison, rates/fees, educational insights and support are anonymously readable even after a Customer session expires.

Future Guest read-only tools are `search_public_knowledge`, `get_public_catalog_item`, `list_public_products`, `get_public_rates`, `get_support_article`. M10 only supplies their potential authoritative APIs; it implements no tools or LLM. See [ADR 0008](../adr/0008-public-content-and-agent-knowledge-boundary.md).

## M11 — Web and contract freeze

Current pages and logical API semantics are frozen before backend implementation. The 43-route inventory, 39 Customer operations and 9 Public operations are documented in `docs/audit` and generated endpoint manifests. Future Spring domains are mapped in `docs/backend/implementation-matrix.md`; every implementation status remains NOT_IMPLEMENTED.

Customer and Public artifact revisions are 1.9.0 and 1.2.0, without URL versions. Logical session requirements are explicit contract metadata; real authentication transport remains backend work. See the mutation/security audit for preserved immutable intent, revalidation, idempotency and atomicity boundaries. No Java, database or Agent was added.

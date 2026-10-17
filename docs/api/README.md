# API contract 工作流

唯一机器接口契约按 surface 拆分：`contracts/openapi/customer.yaml` 和 `contracts/openapi/public.yaml`（OpenAPI 3.0.3）。Customer 当前接口：

- `GET /customer/session`：返回已认证的模拟 Session 和共享 Demo User Alex Chen；无效 Session 返回 401。
- `GET /customer/overview`：Web Dashboard read model，参阅 [Overview contract](overview.md)。
- `GET /customer/accounts`、`GET /customer/accounts/{accountId}`：Banking Domain APIs，参阅 [Accounts contract](accounts.md)。
- `POST /customer/currency-accounts`、`GET/POST /customer/time-deposits`：演示外币账户开立与定期存款，参阅 [Deposits and currency accounts](deposits-and-currency-accounts.md)。

## B2 契约演进

当前开发线为 v1.1-dev：Customer 1.11.0 / 47 operations，Public 1.2.0 / 9 operations。新增收款人详情、准备/查询操作意向、创建和停用接口。历史 v1.0.0-demo 契约独立保存在 releases 目录；详见 [收款人管理](../backend/recipient-management.md)、[付款授权绑定](../security/payment-authorization-binding.md) 和 [发布哈希](../../contracts/openapi/releases/README.md)。

## 基础 conventions（M1 起冻结）

- M9 起 API surface 冻结为 `/public/*`、`/customer/*`、`/admin/*`、`/internal/*`；后两者仅预留，未实现。URL 不带 API 标记或版本段。Customer Web 与未来 Customer Mobile 共用 `/customer/*`。
- 金额使用 decimal string，禁止 floating-point JSON number。当前 Money 支持 CNY、USD、JPY、EUR、GBP、HKD、AUD、SGD，API 展示统一保留两位小数（零余额 JPY 亦如此），例如 `{ "amount": "23842.31", "currency": "CNY" }`。外币账户目前只可开立零余额账户，不执行兑换。
- M3 起交易金额使用非负 decimal string + `direction`（CREDIT / DEBIT）；正负号只在 UI 展示时添加。余额、消费总额和待付款金额使用各自字段描述的口径。
- 时间为带 offset 的 ISO 8601，例如 `2026-09-27T10:30:00+08:00`；`Z` 代表零 offset。禁止没有时区的 datetime。本 Demo 展示统一使用 UTC+08:00。
- ID 是 opaque string，客户端不能从 ID 解析业务含义。
- enum 使用 uppercase，例如 `COMPLETED`、`PENDING`、`VISA`、`CNY`。
- 比例与汇率也使用 decimal string；百分比无法计算时返回 null，不返回 NaN 或 Infinity。
- Optional section 可以省略；数组为空表示没有条目。客户端不得假设 section 必然存在。

## 更新流程

1. 修改 OpenAPI contract。
2. 在根目录运行 `pnpm api:generate`。
3. 一起提交 contract 和对应的 `apps/web/src/generated/customer-api.d.ts`、`apps/web/src/generated/public-api.d.ts`。
4. 运行 `pnpm typecheck`，其中 `api:check` 会检查两份生成文件是否过期。

使用 `openapi-typescript`，禁止编辑生成文件或手写重复 DTO。`Session`、`Overview` 等只是生成类型的引用/别名。API client 统一提供 HTTP、网络和 JSON 解析错误 `ApiError`，目前不提供运行时 schema 校验。

## Mock 链路

React component → feature hook → API client → `/customer/overview` → MSW → shared demo profile。

`apps/web/src/mocks/data/demo-profile.ts` 是演示用户与财务数据的统一来源，Session 和 Overview 共用，UI 禁止 import mock data。类型约束来自生成 contract。金额汇总使用 BigInt 整数分；展示保留字符串精度，仅在 Recharts 绘图坐标中转为 number。

MSW 浏览器 worker：`apps/web/public/mockServiceWorker.js`。升级后运行 `pnpm --filter web exec msw init public --save`。Node 测试使用同一 handlers。不存在 Next.js API route 或真实后端。

## M2 Accounts conventions

敏感账户标识由 API 层预先脱敏，仅提供 `maskedAccountNumber`。`balance` 与 `availableBalance` 区分账面和可用余额，适用时满足 balance − pendingAmount = availableBalance。跨币种合计标注 estimated equivalent，并提供 DEMO_RATE 来源和汇率 as-of。

Accounts 错误使用统一 `ApiError` schema：code/message。未知账户返回 HTTP 404 / ACCOUNT_NOT_FOUND；客户端保留 status 和 code。详情保留 recentTransactions 快照；完整查询入口使用 Transactions Domain API。

Overview 消费窗口现在使用 `currentPeriod` / `comparisonPeriod`（均含 periodStart、periodEnd、amount），比较当前 MTD 和上月同日同时间范围；时间范围为左闭右开。

## M3 Transactions Domain APIs

新增 `GET /customer/transactions` 与 `GET /customer/transactions/{transactionId}`，参阅 [Transactions contract](transactions.md)。列表支持服务端筛选、搜索及 opaque cursor pagination。未知交易返回 404 / TRANSACTION_NOT_FOUND；非法查询或 cursor 返回 400 / INVALID_QUERY 或 INVALID_CURSOR。

共享 Demo profile 通过 `transaction-fixtures.ts` 提供确定性记录（M3 初始 48 条，M6 补齐分析历史后 61 条）；`transaction-query.ts` 负责 Mock 查询、排序和分页。所有页面仍通过 feature hook → API client → MSW 读取数据。

## M4 Payments / Domestic Bank Transfer

新增 recipients、transfer-intents 和 transfers Domain APIs，详见 [Payments contract](payments.md)。所有 M1–M4 Banking handlers 读取统一 MockBankingStore。准备不可变 Intent → Review → 显式确认 → 带 Idempotency-Key 执行；执行前重新校验，原子提交。成功转账更新账户、交易和 Overview，不计入 Spending。浏览器 Demo 使用 sessionStorage 保留同标签页刷新后的状态；测试每次重置固定初始状态。

## M5 Cards Domain

新增 Cards、CardActionIntent 与 CardActionReceipt APIs，以及 Transactions 的 cardId 筛选。卡片只返回 maskedNumber，不返回完整 PAN/CVV/PIN。冻结、关闭控制项需要明确确认；解冻、开启控制项由服务层分类为 STEP_UP_AUTH，M5 曾阻止执行，M8 已接入绑定原 intent 的 Step-up 授权。具体契约、错误码、数据一致性和 M4 状态迁移见 [Cards](cards.md)。

## M6 Analytics and Recurring Payment APIs

新增 `GET /customer/spending/summary`，支持 from/to、compareFrom/compareTo、accountId。由 Store Transaction state 派生，冻结完成借记 + CARD_PAYMENT / DIRECT_DEBIT / FEE，排除 TRANSFER 分类及普通转账。金额与百分比均为 decimal string。默认统计 CNY 账户，指定账户后统计其原币。详见 [Spending conventions](spending.md)。

新增 recurring-payments 列表/详情、recurring-payment-action-intents 创建/查询、recurring-payment-actions 执行/查询，共六个接口，全部使用 `/customer`。BANK_MANAGED 与 DETECTED_PATTERN 分开表达，capability 由服务决定。只有 STOP_FUTURE_PAYMENTS，必须 immutable intent + explicit confirmation + Idempotency-Key + execution-time revalidation。详见 [Recurring Payment contract](recurring-payments.md)。

Overview 的消费与 Analytics 复用相同 selector；upcomingPayments 由当前 ACTIVE bank-managed recurring state 派生。停止授权不删除历史交易，不改变余额、pending、cards、wealth。Store v6 保留 M4/M5 session 的已有 mutation 并迁移新增状态。

## M7 Wealth / Investment APIs

新增 Wealth portfolio、products 列表/详情、risk-profile、suitability-checks 创建/读取，以及 investment-order-intents 创建/读取、investment-orders 执行/读取，共十个 `/customer` endpoint。唯一 DTO 来源仍是 OpenAPI，生成类型随契约更新。

适当性规则由 Wealth Service 执行（product risk <= user risk），React 只显示结果。每个 InvestmentOrderIntent 必须引用有效且匹配的 suitability check；执行时重新验证有效期、产品/账户/资金/适当性及精确快照。申购采用同一 immutable review / explicit confirmation / Idempotency-Key / atomic commit 模式。

TransactionType 新增 INVESTMENT_PURCHASE，TransactionCategory 新增 INVESTMENT。投资借记明确不属于 Spending。Portfolio 与 Overview 共用 Store 状态；新本金不算收益。全部估值和 yield 为模拟 decimal strings，详见 [Wealth contract](wealth.md)。

## M8 — Demo security

Banking routes and APIs now require a simulated Session. Login is AAL1; unfreeze and control enable require a short-lived, single-use AAL2 ActionAuthorization bound to the original card intent ID/hash and session. Authorization consumption is atomic with card mutation, while exact idempotent retries retain the original receipt. Protective actions and existing transfer/recurring/investment policies are unchanged.

See [Security API](security.md) and ADR 0006 for lifecycle, errors, deterministic time and simulator limits. Local test credentials/code are only in `apps/web/src/mocks/data/security-fixture.ts`. The previous M0 login shortcut is replaced by a form. No real identity provider, backend or Agent is implemented. Stop at M8.

## M9 Public Website 与 namespace

公开站 `/`、分类页和 `/ask` 不需要 Session，仅查询 Public API；客户产品整体位于 `/app/*`。公开产品信息与客户金融状态严格分离。参阅 [Public API 与 trust boundaries](public.md)、[Contract surfaces](../../contracts/openapi/README.md) 和 [ADR 0007](../adr/0007-api-surfaces-and-public-banking-site.md)。所有已有 Customer 领域规则保持不变。

## M10 Public catalog and knowledge

- [Catalog, rates and offers](public-catalog.md): 21 product/service guides, demo rates and fees.
- [Support knowledge](public-support.md): 15 structured articles and shared educational insights.
- [Public search](public-search.md): deterministic keyword lookup across catalog, articles and offers.

These endpoints are anonymous read-only reference APIs. Customer contract and security/financial rules are unchanged. No Agent or tools are implemented.

## M11 frozen baseline

The frontend and logical API contract are frozen at Customer **1.9.0** and Public **1.2.0**. These are artifact revisions, not URL versions. Each Customer operation declares `x-session-required`; the simulator does not invent a production cookie/bearer protocol. Real transport/CSRF/storage decisions are recorded in the deferred backend work.

Use [Customer endpoint manifest](customer-endpoints.md), [Public endpoint manifest](public-endpoints.md), [backend implementation matrix](../backend/implementation-matrix.md), [audit findings](../audit/customer-contract.md) and [deferred issues](../audit/deferred-issues.md). Run `pnpm contract:check` for structural validation and semantic freeze drift detection. `pnpm check` runs core quality gates. After an intentional reviewed contract revision, regenerate types and use `pnpm audit:update` to refresh manifests/hashes.

## Product application extension

Customer revision 1.10.0 adds authenticated card and personal-loan intake (three endpoints). See [Applications](applications.md). This is a user-authorized extension of the M24 contract freeze; Public is unchanged.

## B3 scheduled Payments

Customer 1.12.0 adds five one-time schedule operations (52 Customer / 9 Public). B2 1.11.0 and M24 release snapshots are separately preserved. See [scheduled-payment semantics](../backend/scheduled-payments.md). No scheduler/debug API is exposed.

## B4 customer verification

Customer 1.15.0 retains the B4 PASSWORD / SMS_OTP / combined verification model. The review-only application intake now carries product-specific details for available card, loan, savings and insurance products. Current operations: Customer 55, Public 9 (unchanged). See [application intake](applications.md), [form matrix](../audit/product-application-forms.md), [security model](../security/customer-verification.md), [demo isolation](../security/demo-sms.md) and [inline workflow](../frontend/action-verification-workflow.md). Historical B3 contracts/hashes are preserved in `contracts/openapi/releases/b3-v1.1-dev`.

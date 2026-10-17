# M19 — Wealth, Suitability & Investment Order Backend

日期：2026-09-28。状态：M19 已完成。

## 1–3. 接口范围与完成数量

实际实现冻结的 **10** 个 Wealth operation：

| Method | Path                                          |
| ------ | --------------------------------------------- |
| GET    | /customer/wealth/portfolio                    |
| GET    | /customer/wealth/products                     |
| GET    | /customer/wealth/products/{productId}         |
| GET    | /customer/wealth/risk-profile                 |
| POST   | /customer/wealth/suitability-checks           |
| GET    | /customer/wealth/suitability-checks/{checkId} |
| POST   | /customer/investment-order-intents            |
| GET    | /customer/investment-order-intents/{intentId} |
| POST   | /customer/investment-orders                   |
| GET    | /customer/investment-orders/{orderId}         |

Customer：**38/39 IMPLEMENTED_POSTGRESQL**。唯一剩余：**GET /customer/overview**。
Public：**0/9**。数量来自冻结契约、实现矩阵与实际 Spring handler 测试。

## 4–6. 架构、migration 与表

Wealth 保持 domain → application → adapter.web / adapter.persistence。生成 DTO 仅在 Web boundary。新增 PortfolioQuery application read port，尚未实现 Overview。

新增 V5__wealth_suitability_and_investments.sql；V1–V4 不变。新增：

- investment_products
- customer_risk_profiles
- portfolio_positions
- suitability_checks
- investment_order_intents
- investment_orders

扩展现有 idempotency_records 的 investment_order_id 与 owned FK/operation CHECK，未另建幂等系统。总计 27 张业务/安全/Session 表（不含 Flyway history）。

PK、customer ownership 复合 FK、unique(customer,product)、一 intent 一 order、一 order 一 transaction、金额/币种/状态/版本/期限 CHECK 与必要查询索引均已加入。没有 DB trigger。

## 7–10. 产品、风险与适当性

产品是银行共享 reference data；local/test 的 DemoWealthSeed 初始化 4 个 M7 产品、Alex R2 profile 和 3 个持仓，默认 profile 不生成 Demo Wealth 数据。不从 TypeScript runtime 读取 fixture；重启不覆盖已存在状态。

产品分别为 Cash Reserve R1、Stable Bond R2、Balanced Growth R3、Equity Select R4。所有值为 SIMULATED，保留风险免责声明。列表 type/riskLevel 过滤在 PostgreSQL 执行，未知、空、重复、非法 enum 参数为 INVALID_QUERY。

Suitability rule：product risk <= customer risk。适当性不是金融建议。
check 持久化 owner/product、双方 risk/version、result、reasons、createdAt/expiresAt；历史证据不可变。有效期 30 分钟，到期瞬间不可使用；RiskProfile 本身到期同样阻止操作。全程使用注入 Clock。

## 11–12. Portfolio

持仓来自当前客户的 PostgreSQL rows。初始总额 **18320.00**：

- Money Market：10000.00
- Bond Fund：5320.00，投入本金 5100.00
- Cash Management：3000.00

投入合计 18100.00，gain 220.00。通过 BigDecimal 对持仓求和；没有冗余 portfolio header。金额使用 NUMERIC/Money/decimal string。版本取持仓版本和，asOf 取最大更新时间。月度收益与月度净投入分开保存，申购不制造收益。

## 13–16. Intent、hash 与重新校验

prepare 保存完整 product/account/check snapshot、amount、fees、totalDebit、projectedAvailableBalance、CONFIRMATION、15 分钟有效期；不改账户或持仓。

canonical hash 使用显式排序、长度前缀、归一化金额、统一 instant 和版本前缀，不直接 hash JSON。相同金额的 500 / 500.0 / 500.00 表示不影响 hash。

prepare 校验 ownership、ACTIVE account、AVAILABLE product、有效且匹配的 suitability、当前风险版本、正金额/最低申购/币种/含费用可用余额。
execute 再校验当前全部条件、原 check、hash 和 status/expiry。余额或 pending 变化即旧 review 失效，即使余额仍充足。产品版本、风险等级、费用、最低金额变化亦拒绝旧 intent。

## 17–20. 扣款、持仓、交易与 Spending

复用 Account.debit / AccountMutationPort。pending 不变；balance - pending = available。只把本金加入 current value / invested amount / monthly contributions，费用不进持仓，gain/monthlyChange 不变。

复用 TransactionMutationPort 写入正金额 totalDebit：

- DEBIT / COMPLETED
- INVESTMENT_PURCHASE / INVESTMENT
- 不伪造 merchant 或 counterparty

交易立即可被既有查询和 cursor pagination 读取。Spending 使用原 M18 SQL eligibility，投资交易不计消费。测试验证所有汇总值不变，也验证 Card、Recurring 历史及其他账户不变。

## 21–22. 幂等与原子性

共享 JpaTransactionManager 将 Account/Transaction JPA、Wealth JDBC 和幂等写入纳入同一事务。先锁当前 customer，再查幂等；同 key 同 fingerprint 返回原 receipt，即使原 intent/check 已过期。不同 fingerprint 返回 IDEMPOTENCY_KEY_REUSED。

一个事务内完成：账户扣款、持仓更新、交易追加、order、intent EXECUTED 和幂等完成。产品 FOR SHARE、风险/账户/持仓行锁及 position version 防止处理中条件变化。无 JVM global lock。

## 23–27. 回滚、并发、隔离、重启

真实 PostgreSQL 测试包含：

- 五个执行阶段注入故障，以及真实 order CHECK violation；账户/持仓/交易/order/intent/幂等全部回滚。
- 同 intent 同 key：同一 receipt；不同 key：仅一次成功。
- 1500 available 上两个 1000 intent：仅一笔成功，无透支。
- 不同有效来源账户同时申购同一 Bond position：5320 → 7320，无 lost update。相同账户旧快照会被拒绝，这是 review 语义。
- 他人 check/intent/order 查询和执行为 NOT_FOUND；他人账户不能扣款。
- 完整 Spring context 重启，账户、持仓、check、order、EXECUTED intent 和幂等重放均保持。
- 新交易后的 keyset traversal 无重复、无遗漏、顺序稳定。

## 28–30. 标准场景与真实 HTTP

local profile 实际运行于 **localhost:18080**，使用项目 PostgreSQL。执行脚本： [wealth-smoke.ps1](../backend/wealth-smoke.ps1)。

真实流程：Session/CSRF bootstrap → login → products/filter/detail → risk → suitable/unsuitable checks → prepare → GET review → execute → GET receipt/account/portfolio/transaction → Spending → replay → logout。

| 指标                      |   Before |    After |
| ------------------------- | -------: | -------: |
| CNY Current balance       | 23842.31 | 22842.31 |
| pending                   |    32.00 |    32.00 |
| available                 | 23810.31 | 22810.31 |
| Portfolio total           | 18320.00 | 19320.00 |
| Bond position             |  5320.00 |  6320.00 |
| Portfolio gain            |   220.00 |   220.00 |
| Spending（固定 M18 窗口） |  4968.00 |  4968.00 |

R2 / Stable Bond R2 返回 SUITABLE；R2 / Balanced Growth R3 返回 NOT_SUITABLE，prepare 返回 422 PRODUCT_NOT_SUITABLE。
三个 Wealth POST 缺 CSRF 均为 403；未登录 POST 为 401 的 blocking tests 均通过。未创建/消费 Step-Up authorization。

独立数据库查询确认：**1 order、1 investment transaction、1 investment idempotency record、2 checks**。同请求重放保持一笔、余额和持仓不再变化；退出后读取为 401。

## 31–33. 验证结果

| 验证                               | 结果                                                                    |
| ---------------------------------- | ----------------------------------------------------------------------- |
| 初始 pnpm contract:check           | PASS                                                                    |
| Backend mvnw.cmd clean verify      | **BUILD SUCCESS，396 tests，0 failures/errors/skipped**                 |
| 单元/架构/契约/Web tests           | 181                                                                     |
| Testcontainers PostgreSQL tests    | 215：Wealth 77、Card 37、Banking 19、Recurring/Spending 52、Security 30 |
| pnpm typecheck                     | PASS                                                                    |
| pnpm test                          | PASS：24 文件，359 Vitest/RTL + 3 contract-hash tests                   |
| pnpm lint                          | PASS：ESLint + Prettier                                                 |
| 最终 pnpm contract:check           | PASS：Customer/Public hash 不变                                         |
| 独立 local PostgreSQL + HTTP smoke | PASS                                                                    |

本轮未修改 apps/web 业务/runtime；未要求额外 build/Playwright，没有把历史结果当成本轮执行。

日志：根目录 m19-verify.log、m19-smoke.log、m19-typecheck.log、m19-frontend-test.log、m19-lint.log、m19-contract-final.log。故障注入和已有数据库不可用测试产生的预期 ERROR 日志不代表测试失败；以 Maven 汇总为准。

## 34–35. 冻结契约与实现矩阵

Customer 1.9.0 canonical SHA-256：
602ddcc2ca1b3903034bab2979516220fbf3fb78c0212fa4158a4f0c7ac5f3e5

Public 1.2.0 canonical SHA-256：
460387a9a26548941a692bcd7e7036e21d136b4d6a9cb570faa0a4fc1ac106ef

customer.yaml、public.yaml、freeze.json 未编辑。更新 [implementation matrix](../backend/implementation-matrix.md) 和 implementation-status.json；10 个新 operation 均标记 IMPLEMENTED_POSTGRESQL。

## 36. 本地持久状态

smoke 使用独立数据库 **aster_m19_smoke_20260928**；原 aster_banking 与 M18 smoke 数据库未重置，原 Netflix STOPPED 等历史保留。

新增 order：
investment_order_c4dcd51b-69ea-47ec-a511-86dfc53c145e

新增 transaction：
txn_investment_6cc656f0-2f58-4cb9-905c-afcb2a5d018c

该数据库已不再是 initial fixture；余额/持仓如上。验证后停止本轮临时后端与项目 PostgreSQL 容器，保留 volume 和数据库。没有处理用户其他 Docker 服务。

## 37–38. 限制与停止点

只有 deterministic 模拟产品和成本增加模型；无实时 NAV、证券网络、赎回、KYC、新风险问卷或投资建议。reference data 管理没有新增 API。前端仍 MSW，未连接 Spring。

唯一未实现 Customer operation 是 Overview；全部 Public backend 仍未实现。没有新增 endpoint 或修改 frozen contract。

**STOP AT M19. DO NOT IMPLEMENT OVERVIEW. DO NOT ENTER M20.**

## 修改范围

- 新增 customer/wealth 领域、应用、JDBC/Web adapters 与 local/test seed。
- 新增 V5 migration；扩展共享 PostgreSQL idempotency adapter。
- 新增 WealthDomainTest、WealthPostgreSqlIT、Wealth ArchUnit 规则；既有 Flyway/handler 数量断言更新到 5/38。
- 新增 Wealth backend 文档、ADR 0016、HTTP smoke 和本报告。
- 更新 schema、实现矩阵/status、后端 README 与项目进度说明。

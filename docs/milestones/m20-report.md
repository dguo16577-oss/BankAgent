# M20 — Customer Overview Backend & Customer API Closure

日期：2026-09-28。**Customer Banking Backend COMPLETE（冻结接口覆盖）**。

## 1–2. 实现接口与最终数量

新增且仅新增 **GET /customer/overview**，operationId 为 **getOverview**。

- **CUSTOMER API = 39 / 39 IMPLEMENTED_POSTGRESQL**
- Customer remaining = **0**
- **PUBLIC API = 0 / 9 IMPLEMENTED**
- Frontend 继续 MSW。

这不代表 Entire backend complete 或可生产上线；Public 和前后端集成尚未完成。

## 3–6. 架构、数据源与无状态设计

新增 overview.application 的 OverviewQueryService / CustomerOverviewView，以及 adapter.web 的 Controller / Mapper / ExceptionAdvice。没有虚构 domain aggregate、Overview entity、repository 或持久业务快照。

通过 application capabilities 读取 Account、Transaction、Spending、Card、Recurring、Wealth；共享 CustomerProfileQuery 从既有 customers 行读取非敏感显示信息。生成 DTO 只出现在 Web boundary。

为避免重复和低效读取，只增加两个小型查询能力：

- Spending 的 MonthlySpendingPort，共享原 ELIGIBLE SQL predicate，批量查询六个月。
- RecurringUpcomingQuery，投影未来付款所需四个字段，SQL 过滤/排序/limit，不逐条查询历史。

**没有新 Flyway migration、表、缓存、materialized view 或财务 source of truth。V1–V5 均未修改。**

## 7–8. 客户隔离与快照事务

所有片段使用一次 CurrentCustomerProvider 提供的同一个 CustomerId。GET 没有 customerId 参数绑定；伪造 query/header/body 无法改变当前客户。认证前置：未登录 401；GET 不需要 CSRF。

生产 wiring 复用 AccountRepository 的 ConsistentRead / DatabaseScope，开启一个 PostgreSQL **REPEATABLE READ、read-only** 事务。所有 JPA/JDBC 子查询加入该事务。系统其他 mutation isolation 未改变。

并发 blocking test 在第一个 SELECT 后暂停 Overview，另一连接成功提交投资，再恢复读取：当前 response 的账户、交易、持仓均保持旧 snapshot；下一请求反映投资后的新状态。测试实际检查 isolation 和 read-only 属性。避免 READ COMMITTED 多 SELECT 产生混合快照。

## 9–16. Frozen 字段与语义

| 片段               | 实现                                                                                                                                       |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------ |
| accounts           | AccountQueryService.list + 共享 AccountSummary mapper；读取当前余额/available/status                                                       |
| totalBalance / FX  | AccountSnapshot.totalBalance；存款原账面余额折合 CNY，保留 DEMO_RATE / exchangeRate / conversionAsOf；不含投资和卡负债，不重新扣除 pending |
| spending           | M18 SpendingQueryService；显式 MTD / 上月同日同时间窗口；6 个月趋势与同一 SQL eligibility                                                  |
| recentTransactions | TransactionReadPort top 5；occurredAt DESC / id code-point ASC；数据库限量查询                                                             |
| cards              | CardService 当前卡状态 + 既有 CardSummary mapper；不增加 schema 外 controls                                                                |
| upcomingPayments   | Recurring ACTIVE + BANK_MANAGED + nextExpectedAt > asOf；dueAt ASC / id ASC；最多 4 条；停止、结束、已到期、无日期、detected-only 不显示   |
| wealth             | M19 PortfolioQuery；total、monthlyChange/percent、持仓汇总；不依赖 RiskProfile                                                             |
| user / asOf        | 真实 customers 显示信息；asOf 为注入 Clock 的 read-model 构建时间，FX 保留独立 as-of                                                       |

所有 Money 使用 BigDecimal/NUMERIC/decimal string。空客户返回合法空数组和零值，无法计算的百分比为 null。任何源读取失败返回整体 HTTP 500 / PERSISTENCE_UNAVAILABLE；不返回部分 Mock 成功结果。

现有后端没有信用卡账单 source。CARD_BILL 是 frozen enum 的允许值，并非必须出现的项目，因此本轮不复制 M1 Mock bill、不新增 billing 业务；upcoming 仅包含真实 Recurring rows。

## 17–22. 跨域一致性 blocking tests

真实 Testcontainers PostgreSQL 验证：

1. Transfer 500：Current 23842.31 → 23342.31，available 23310.31；出现 BANK_TRANSFER，Spending/Wealth/Cards 不变。
2. Freeze Card：Overview 卡片变 FROZEN；账户/消费/投资不变。
3. Stop Netflix：不再进入 upcoming；原历史交易保留，Spending 仍 4968。
4. 投资 Bond 1000：Current 22842.31、available 22810.31、pending 32；Portfolio 19320；新增 INVESTMENT_PURCHASE，Spending 不变。
5. 综合场景：Transfer → Freeze → Stop Netflix → Investment，所有 Overview fragment 与当前直接领域 query 对比相等。
6. HTTP parity：Accounts、FX、Cards、最近交易、Spending、Portfolio 与各独立 API 一致；monthly buckets 逐月与直接 Spending 查询一致。

其他测试涵盖 stable tie-breaker、future date 边界、空数据、缺 risk profile、异常无 partial fallback、重启后的 combined state。

## 23–24. Isolation 与 SQL 数量

第二客户 fixture 同时具备 account、transaction、card、recurring 和 portfolio；所有片段只读取该客户记录，Alex response 无其他客户标识。真实 Alex/other Session 均验证 200 / 自有数据。

使用测试容器中的 pg_stat_statements 测量真实 HTTP 请求：

- 初始数据：**16 条领域 SELECT**。
- 增加 25 个账户、25 张卡、25 条 recurring：**仍为 16 条**。
- 分解：客户显示 1、Accounts 2、Spending 7 + monthly 1、Transactions 2、Cards 1、Upcoming 1、Portfolio 1。
- 不包含 Session/security bookkeeping、事务控制及测量自身 SQL。
- Transaction 复用分页的一行 lookahead，最多读取 6 条返回 5；Upcoming SQL limit 4。
- extension 仅用于测试容器，没有添加到项目 production schema。

不存在 Overview 按账户/卡片/recurring item 逐条查询历史的 N+1。保留 M18 Spending summary 的固定聚合成本，没有提前设计巨型跨域 JOIN。

## 25. 独立真实 HTTP smoke

实际启动项目 PostgreSQL 与 Banking Core local **:18080**。使用已有、已被 M19 投资修改的数据库 **aster_m19_smoke_20260928**，没有新建 pristine 数据库或 reset。

运行 [overview-smoke.ps1](../backend/overview-smoke.ps1)，完成：

401 → CSRF bootstrap → login → GET Overview → Accounts/Cards/Portfolio/Transactions/Recurring/Spending parity → logout → 401。

实际持久状态：

| 项目                             |           当前值 |
| -------------------------------- | ---------------: |
| Current balance                  |         22842.31 |
| pending / available              | 32.00 / 22810.31 |
| CNY-equivalent deposit total     |         35453.68 |
| Portfolio                        |         19320.00 |
| September Spending               |          4968.00 |
| Accounts / Cards / Upcoming      |        3 / 2 / 4 |
| investment orders / transactions |           1 / 62 |

该数据库两张卡当前 ACTIVE，Netflix 当前 ACTIVE；按当前真实状态验证 upcoming。原默认数据库中的 Netflix STOPPED 等历史未被覆盖。

Smoke 前后金融数据计数、账户与 Portfolio 不变；只发生登录/退出的 Session/security event 写入。脚本保留 ISO timestamp 字符串，使用 Overview 显式窗口查询直接 Spending，避免两个请求时钟差异造成误比。

验证后停止本轮临时后端和项目 PostgreSQL 容器，保留所有 volume；未操作其他 Docker 服务。

## 26–28. 验证结果

| 命令 / 检查                          | 结果                                                                                 |
| ------------------------------------ | ------------------------------------------------------------------------------------ |
| 初始 pnpm contract:check             | PASS                                                                                 |
| mvnw.cmd clean verify                | **BUILD SUCCESS，419 tests，0 failures / errors / skipped**                          |
| unit / architecture / contract / Web | 182                                                                                  |
| PostgreSQL Testcontainers            | 237：Overview 22、Wealth 77、Card 37、Banking 19、Recurring/Spending 52、Security 30 |
| pnpm typecheck                       | PASS                                                                                 |
| pnpm test                            | PASS：24 files，359 Vitest/RTL + 3 contract-hash tests                               |
| pnpm lint                            | PASS：ESLint + Prettier                                                              |
| 最终 pnpm contract:check             | PASS：Customer/Public hash 不变                                                      |
| 真实 HTTP smoke                      | PASS                                                                                 |

原 M12–M19 的 396 项测试保留；新增 22 项 Overview IT 与 1 项 ArchUnit，总计 419。未修改 apps/web 业务或默认 API runtime。未额外运行本轮未要求的 build/Playwright。

主要日志：m20-verify.log、m20-smoke.log、m20-frontend-test.log、m20-typecheck.log、m20-lint.log、m20-contract-final.log。故障注入与数据库不可用测试中的预期 ERROR 日志不代表 suite 失败。

## 29–31. 契约与 Customer closure audit

customer.yaml、public.yaml、freeze.json 未编辑。

- Customer 1.9.0 canonical SHA-256：602ddcc2ca1b3903034bab2979516220fbf3fb78c0212fa4158a4f0c7ac5f3e5
- Public 1.2.0 canonical SHA-256：460387a9a26548941a692bcd7e7036e21d136b4d6a9cb570faa0a4fc1ac106ef

自动 closure test 从 frozen customer.yaml 枚举 method/path/operationId，与实际 Spring RequestMappingHandlerMapping 精确集合比较，**39/39**；实现状态 JSON 的 key 集合与 operationId 集合相同，所有值均为 IMPLEMENTED_POSTGRESQL。没有 Public handler。

更新 [implementation matrix](../backend/implementation-matrix.md)、implementation-status.json、项目进度与 README。没有用文档数字代替 runtime 验证。

## 32–33. 限制与停止点

- Customer API closure 仅指冻结契约的 39 个 operation 均有 PostgreSQL 后端实现。
- Public backend 仍为 0/9；Next.js 仍使用 MSW。
- 无真实 FX/NAV/证券网络；没有信用卡账单后端 source。
- Reporting periods 使用当前注入 Clock；自动测试固定 M18 instant，本地 runtime 不伪装成历史固定快照。
- 当前为单 PostgreSQL 的一致读，没有 cache、分布式 projection 或部署工作。

**STOP AT M20. DO NOT IMPLEMENT PUBLIC API. DO NOT ENTER M21.**

## 修改范围

新增 Overview application/Web、共享 CustomerProfileQuery、Spending monthly/Dashboard 查询、Recurring upcoming read port、配置 wiring、OverviewPostgreSqlIT。
最小修改现有 analytics/recurring persistence adapters、Card summary mapper 可见性、ArchUnit 和实际 endpoint 数量断言。
新增本报告、Overview read-model 文档、ADR 0017、smoke 脚本；更新实现矩阵、项目进度、README 与 Overview API 的后端说明。

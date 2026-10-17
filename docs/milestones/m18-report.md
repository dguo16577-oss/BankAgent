# M18 — Recurring Payments + Spending Analytics

完成日期：2026-09-28。范围仅为冻结 Spending / Recurring 后端。前端继续 MSW，未实现 Overview、Wealth、Public backend 或任何 scheduler/detection engine。

## 1. Endpoints implemented

以 Customer 1.9.0 manifest/generated interfaces 为准，新增七项：

| Method | Endpoint                                              | operationId                      |
| ------ | ----------------------------------------------------- | -------------------------------- |
| GET    | /customer/spending/summary                            | getSpendingSummary               |
| GET    | /customer/recurring-payments                          | listRecurringPayments            |
| GET    | /customer/recurring-payments/{recurringPaymentId}     | getRecurringPayment              |
| POST   | /customer/recurring-payment-action-intents            | prepareRecurringPaymentAction    |
| GET    | /customer/recurring-payment-action-intents/{intentId} | getRecurringPaymentActionIntent  |
| POST   | /customer/recurring-payment-actions                   | executeRecurringPaymentAction    |
| GET    | /customer/recurring-payment-actions/{actionId}        | getRecurringPaymentActionReceipt |

Prepare 返回 201，其他成功返回 200。没有新 endpoint、schema、enum 或 query parameter。

## 2. Spending architecture

SpendingController → SpendingQueryService → TransactionAnalyticsPort → PostgreSQL。独立 spending domain/application/adapter 包；消费汇总为 authoritative Transaction 派生 read model，不保存另一份交易或 totals。

## 3. Spending eligibility rule

仅 COMPLETED + DEBIT + CARD_PAYMENT/DIRECT_DEBIT/FEE，且 category 不为 TRANSFER/INVESTMENT。排除 transfer、withdrawal、credit/income、FX、investment principal，以及 pending/failed/reversed/cancelled。默认 owned CNY accounts；accountId 使用原币，不混合换汇。

## 4. PostgreSQL aggregation

SQL 完成所有集合过滤、SUM、COUNT、category/merchant/day GROUP BY。Java 只组装结果、填补零日桶和计算 BigDecimal 百分比。Repeatable read 保证多条聚合 SQL 来自一致快照。现有 transaction indexes 已足够，不新增 Spending index 或表。

Reporting 固定 UTC+08，SQL 使用 Etc/GMT-8，避免历史夏令时和服务器时区影响。参数为带 offset 的真实时间戳，窗口为 occurredAt 的 [from,to)，最长 366 天。比较窗口向前移一日历月并 clamp；如折叠，结束于 clamped start 后的本地午夜。asOf 使用注入 Clock。

## 5. Standard 4968 / 4800 / 3.50 result

固定当前窗口为 2026-09-01T00:00:00+08:00 至 2026-09-27T10:30:00+08:00；比较窗口为同样日时的八月区间：

| Metric               | Result      |
| -------------------- | ----------- |
| totalSpend           | CNY 4968.00 |
| comparisonTotalSpend | CNY 4800.00 |
| absoluteChange       | CNY 168.00  |
| percentageChange     | 3.50        |

既有 61 条 backend-owned seed 已符合 M6，不修改交易 fixture。百分比使用 BigDecimal、scale 2、HALF_UP；comparison=0 返回 null。

## 6. Category / trend / merchant consistency

Category total 和 daily trend total 各自等于 totalSpend，count 各自等于 transactionCount。每日桶包含零日、裁剪到精确边界，不重叠或遗漏。分类按 code；merchant 按金额降序、ID 次序。无 merchant 的消费仍计入总额/分类/趋势，不进入 merchant grouping；不借用 counterparty。零金额分类 percentage 为 0.00。

## 7. Recurring domain

独立 recurring domain/application/adapters。支持冻结四种 type、三种 status、五种 frequency、两种 source/capability。RecurringPayment 负责 manageability、stop 状态转换与 version；Application 负责 Intent、历史 read port、事务编排和幂等。

## 8. Database migration

仅新增 V4__recurring_payments.sql，保留 V1–V3。新增 recurring_payments、recurring_payment_transaction_links、recurring_payment_action_intents、recurring_payment_actions。扩展既有 idempotency_records 的 recurring_action_id 和 receipt CHECK，不建立新幂等表。

Composite FKs 保护 customer/account/card/payment/transaction/intent/receipt 归属；unique intent 防止重复 receipt。索引覆盖实际 owner/list/ID/reference queries；冻结 API 无 status/date filters，不为尚不存在的 scheduler 加索引。

## 9. Provenance model

Bookshop 保留 June/July/August 三条 CNY 68 历史 transaction IDs、observedOccurrences=3、firstObservedAt、lastObservedAt。Join table 标识 matched evidence，详情返回 machine-readable provenance。Seed 显式指定已知 ID，运行时不读 TypeScript、不执行发现算法。

## 10. Management capability

银行管理的 Rent、Netflix、Spotify、Adobe、ChatGPT 为 STOP_FUTURE_PAYMENTS。Bookshop 为 DETECTED_PATTERN / NONE，Prepare STOP 返回 422 RECURRING_PAYMENT_NOT_MANAGEABLE。Request 不得决定能力或覆盖 source/status。

## 11. STOP_FUTURE_PAYMENTS semantics

银行卡订阅为银行侧阻止未来 recurring merchant payments；Direct Debit 为撤销银行 mandate；Standing Order 为取消未来银行付款计划。**不表示终止 Netflix 等外部服务合同。** 保留冻结 bank-side effectDescription 和既有 Web 文案，不新增外部取消 API。

## 12. Recurring Action Intent

Prepare 只保存 immutable review，完整绑定 payment detail、history/provenance、before/after、capability、version、effect 和时间，不修改 status、nextExpectedAt、账户、历史交易或统计。GET 返回持久化 snapshot，当前状态变化不会改写 review。

## 13. Hash / expiry

从 M17 提取共享 CanonicalHash，保留其 length-prefixed UTF-8/SHA-256 字节规范；Card hashing 行为保留。Recurring 使用独立 domain Intent 和字段版本，绑定 owner、完整 snapshot 和其他关键条款。没有 GenericIntent。有效期 15 分钟，等于 expiresAt 即过期；时间通过 Clock。

## 14. Idempotency

共享作用域 customer + EXECUTE_RECURRING_PAYMENT_ACTION + key。Fingerprint 绑定 intentId/hash。成功请求重放在 stopped/expired/executed 校验之前返回原 receipt；不同请求复用 key 返回 IDEMPOTENCY_KEY_REUSED。其他 Transfer/Card operation 的相同 key 不冲突。

## 15. Atomic execution

同一 PostgreSQL transaction 中将 payment 改为 STOPPED、nextExpectedAt 清空、version +1、Intent 改 EXECUTED，并保存 Action 和 completed idempotency record。JDBC 与既有 JpaTransactionManager 共享事务。Stop 为保护性确认操作，要求 Session/CSRF，不需要 AAL2，也不创建或消费授权。

## 16. Concurrency

真实 PostgreSQL 测试同 Intent/同 key、同 Intent/不同 key、两个竞争 Intent。最终至多一次 state transition 和 receipt；同 key 返回相同逻辑结果。沿用 customer FOR NO KEY UPDATE scope，并锁 owned Intent/payment；没有 JVM 全局锁。

## 17. Rollback

故障点覆盖 payment mutation 后、Action 前、idempotency 前。另以最终 INSERT 的真实 PostgreSQL CHECK failure 验证 rollback。失败后保留 ACTIVE/原 next date/原 Intent，无 Action/完成幂等，历史交易不变；重试成功。

## 18. Historical transaction preservation

历史关联通过 TransactionRepository application read port 校验所有权与账户，不依赖 Transaction adapter。没有第二套 transaction rows。Stop 不修改 lastPaidAt、historical transaction status/type/category、余额、pending 或 Card。

## 19. Spending invariance after stop

Netflix STOP 前后 whole Spending read model 在固定 Clock 下完全一致。跨域回归同时验证 Transfer CNY 500、Card freeze/unfreeze 和 Netflix stop 后仍为 4968.00。插入 eligible transaction 会立即改变总额，证明没有永久 totals 缓存。

## 20. Customer isolation

Identity 来自 authenticated principal。Spending 外部/未知 account 返回相同 ACCOUNT_NOT_FOUND / 404；Recurring payment/Intent/receipt 跨客户与未知资源对应相同 404。拒绝 customerId、额外/重复 query、请求 body 状态覆盖和无效枚举。只保存 opaque/masked references，无 PAN/CVV/PIN。

## 21. Real HTTP smoke

独立 packaged Spring Boot local 服务（18080）+ PostgreSQL 实际验证通过，日志 m18-smoke.log。标准金额 4968.00 / 4800.00 / 3.50；Bookshop stop 422，缺少 CSRF 的 prepare/execute 均为 403；Netflix prepare 201 → review 200 → execute 200 → receipt 200 → STOPPED/null-next-date → analytics 不变 → 相同 key 重放原 receipt → logout 后 GET 401。SQL 复核：1 份 Recurring receipt、0 个 ActionAuthorization、0 个 AUTHORIZATION_CONSUMED event，61 条交易保留。

最终完整 smoke 使用独立数据库 aster_m18_smoke_20260928。脚本调试也在原 local 数据库留下 Netflix STOPPED 与操作历史；未删除记录或重置状态。验证后已停止临时 Java 进程和本项目 Compose PostgreSQL，保留两库及 volume。

脚本：[recurring-spending-smoke.ps1](../backend/recurring-spending-smoke.ps1)。使用 local profile、真实 PostgreSQL、Cookie Session 与 CSRF。标准窗口明确传入；比较历史统计时排除实时 Clock 的 asOf 字段。脚本会留下 Netflix STOPPED 的持久状态，不清空历史数据。

## 22. Testcontainers results

Testcontainers PostgreSQL 共 138 项集成测试通过：Recurring/Spending 52、Card 37、Banking 19、Security 30。Failures/errors/skipped 均为 0，未配置跳过 Docker 测试。

覆盖 eligibility、日期/offset、零值、分类/商户/趋势、数据源变化、customer/account 隔离、provenance、prepare 无副作用、stale snapshot、hash/expiry、stop、CSRF、重放、并发、rollback、full application restart 和跨域 invariants。

## 23. Maven total tests

实际执行 Java 21 下的 spotless:apply clean verify，BUILD SUCCESS。共 311 项：173 项 unit/architecture/contract 与 138 项真实 PostgreSQL integration tests；0 failures/errors/skipped。新增 domain tests 13 项、ArchUnit 1 项、Recurring/Spending integration tests 52 项。Spotless 202 Java 文件通过。使用受限 JVM 内存参数，最终日志为 m18-verify.log。

ArchUnit 沿用所有原边界规则，并新增 Spending 不得依赖 TransactionRepository/Transaction adapter、Recurring application 不得依赖 Transaction adapter 的防回归规则。

## 24. Frontend regression

实际执行 pnpm lint、pnpm typecheck、pnpm test，全部通过。Vitest/RTL：24 文件、359 项；Node contract-hash：3 项；无失败。ESLint/Prettier、生成类型 freshness、Next route typegen、strict TypeScript 全部通过。前端默认 MSW、业务行为、generated types 和 OpenAPI 未修改。本轮未要求额外 build/Playwright，不声称重新执行这些命令。

## 25. Contract hashes

开始和结束均实际执行 pnpm contract:check，通过；Customer/Public frozen hash 均保持不变。冻结 canonical SHA-256：

| Surface  | Revision | Hash                                                             |
| -------- | -------- | ---------------------------------------------------------------- |
| Customer | 1.9.0    | 602ddcc2ca1b3903034bab2979516220fbf3fb78c0212fa4158a4f0c7ac5f3e5 |
| Public   | 1.2.0    | 460387a9a26548941a692bcd7e7036e21d136b4d6a9cb570faa0a4fc1ac106ef |

## 26. Implementation matrix

实际 frozen manifest 为 Customer 39、Public 9。本轮新增七项后 Customer 28 IMPLEMENTED_POSTGRESQL、11 NOT_IMPLEMENTED；剩余为 Overview 1、Wealth 10。Public 0/9，共 20 项尚未实现。实现矩阵与机器状态文件已更新。

## 27. Known limitations

- Web 仍用 MSW，未接 Spring。
- 不实现 Wealth、Overview、Public backend。
- 不实现 recurring detection engine、scheduler、merchant cancellation 或真实 direct-debit 网络。
- Stop 不提供 restart/edit；local smoke 会持久保留 STOPPED，重跑初始场景需独立 Demo 数据库。
- Versioned JSON snapshots 后续结构变化需要显式迁移。
- Reporting 使用冻结 UTC+08；没有客户自定义 reporting timezone。
- List 按冻结 API 全量返回当前 recurring items，无新增 pagination/filter。
- Customer 写入串行化适合当前阶段，高并发扩展需再评估。

## 28. Stop at M18

停在 M18，未进入 M19。

详细设计：[Spending](../backend/spending-domain.md)、[Recurring](../backend/recurring-payments-domain.md)、[Database schema](../backend/database-schema.md)、[ADR 0015](../adr/0015-recurring-payments-and-derived-spending.md)。总体进度同步至 [project-progress.md](../project-progress.md)。

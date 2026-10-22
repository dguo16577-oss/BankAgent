# GET /customer/overview

## M20 backend status

The frozen Customer 1.9.0 endpoint is now implemented by Spring Boot against the existing PostgreSQL domain queries. Customer coverage is 39/39; Public remains 0/9 and the frontend remains MSW. The sections below retain historical M1–M11 Mock context; current backend design and validation are documented in [Overview read model](../backend/overview-read-model.md) and [M20 report（历史资料）](../release-status.md#历史资料).

The backend uses one read-only REPEATABLE READ snapshot. Its asOf and reporting periods use the injected runtime Clock. Existing DEMO_RATE provenance is preserved. Upcoming payments come from persistent eligible Recurring schedules; no Mock credit-card bill is fabricated where no backend billing source exists. Missing risk profile does not block Portfolio summary. Empty sections return legal zero/empty data; failed source reads return an overall error.

## 用途与边界

Overview 是供 Web Dashboard 使用的 read model：按一个快照组织账户、消费、交易、卡片、待付款和投资摘要。它不是未来 Accounts、Cards、Transactions 等领域 API，也不提供修改业务状态的操作。

`GET /customer/session` 保留，并与 Overview 使用同一个 Alex Chen profile。没有鉴权、数据库或真实金融服务。本次无需新增 ADR，继续遵循 ADR 0001。

## 响应

| 字段                 | Schema / 口径                                                                                |
| -------------------- | -------------------------------------------------------------------------------------------- |
| `asOf`               | 必填 Timestamp，带 offset 的 ISO 8601                                                        |
| `baseCurrency`       | 必填，当前快照为 CNY                                                                         |
| `user`               | 必填 User，与 Session 一致                                                                   |
| `totalBalance`       | 必填 Money，仅存款账户折算合计                                                               |
| `balanceNote`        | 可选，折算及资产范围说明                                                                     |
| `accounts`           | 可选 AccountSummary[]，保留原币余额                                                          |
| `spending`           | 可选 SpendingSummary，currentPeriod、comparisonPeriod（显式起止）、百分比和最多 6 个趋势周期 |
| `recentTransactions` | 可选 TransactionSummary[]，非负金额 + direction、时间、分类和必填状态                        |
| `cards`              | 可选 CardSummary[]，scheme、type、last4 和 status，无完整卡号/CVV                            |
| `upcomingPayments`   | 可选 UpcomingPayment[]，按 dueAt 升序                                                        |
| `wealth`             | 可选 WealthSummary，总额、月变化和 holdings                                                  |

Money 为 `{ "amount": "23842.31", "currency": "CNY" }`。响应 schema 的完整定义以 OpenAPI 为准；不在文档维护另一套 DTO。

## 统一 Demo profile 与一致性

数据来源：`apps/web/src/mocks/data/demo-profile.ts`。快照固定于 **2026-09-27 10:30 UTC+08:00**，不会随运行日期漂移。

- 用户：Alex Chen，base currency CNY。
- CNY Current：月初 ¥16,810.31 + 工资 ¥12,000.00 − 已完成支出 ¥4,968.00 = **¥23,842.31**。
- Savings：**¥8,200.00**；USD：**$621.32**。
- Demo FX：1 USD = 7.10 CNY；USD 折算 ¥4,411.37，四舍五入到分。
- 总存款：¥23,842.31 + ¥8,200.00 + ¥4,411.37 = **¥36,453.68**。投资、信用卡负债与 pending 消费不计入此余额；它不是净资产或实时可用余额。
- 每月固定支出：Rent 3000、Netflix 88、Spotify 65、Adobe 238、ChatGPT 145，共 ¥3,536。
- 九月已完成消费：固定支出 3536 + groceries 782 + dining 420 + transport 230 = **¥4,968.00**。Starbucks ¥32 pending 不计入。
- 六个月趋势（CNY）：Apr 4620、May 5180、Jun 4890、Jul 5620、Aug 5400、Sep 4968。九月是截至快照的 month-to-date；M2 改为比较八月 1 日 00:00 至 27 日 10:30 的同周期 ¥4,800，变化为 **+3.50%**；八月整月 ¥5,400 仅留作历史趋势。两个窗口均为左闭右开，UTC+08:00。早期月份是独立历史汇总，九月来自交易明细。
- 最近 5 条交易从统一交易集合按时间降序截取，包括 pending Starbucks、groceries、metro、salary、Adobe。
- 卡片：Visa Debit ••8821 / Mastercard Credit ••1937，均 ACTIVE。
- Upcoming 取最早 4 条：10 月 1 日 Rent、3 日 Netflix、5 日 Spotify、8 日 Credit card bill。信用卡账单 ¥1,286.40 来自上一账期，不重复计入九月消费。
- 投资：Money Market 10000 + Bond Fund 5320 + Cash Management 3000 = **¥18,320.00**。月初 ¥18,100，月变化 **+¥220.00 / +1.22%**，无买卖功能。

金额计算使用整数分与 half-up；百分比保留两位。Mock factory 每次返回独立 snapshot，防止消费者修改统一源。

## 状态与测试

页面通过 `useOverview` 调用 API client；loading、success、缺省 optional section、空数组、接口失败和手动 retry 均有实现与 RTL 测试。没有数据不等于请求失败。余额为零仍应渲染。

图表使用 Recharts，提供可展开的精确金额列表。测试中的 jsdom 缺少 ResizeObserver，由 setup 提供替身；真实尺寸和窄屏无溢出通过 Playwright 检查。

## 后续里程碑

M2 已为 Accounts 建立 ApiError code/message 和 domain APIs。运行时响应校验、真实 FX 来源、授权边界及其他领域 API 留待后续。固定 demo 快照不是实时账户账本。没有已知阻塞 M1 的问题。

## M2 semantic patch

总余额标注 **CNY equivalent (estimated)**，`exchangeEquivalents` 返回 DEMO_RATE、7.10 汇率及 `2026-09-27T10:00:00+08:00` 的 conversionAsOf。

Accounts 摘要复用 [Accounts Domain API](accounts.md) 的 schema 和同一工厂数据，余额、币种、status 一致。原 `name` 字段调整为共享 `displayName`；Overview 仍是 Web read model。

## M3 integration

Recent Transactions 使用共享 TransactionSummary 和排序规则，View all transactions 进入 `/app/transactions`。Overview 继续为 Web read model；交易筛选、分页和详情由 [Transactions Domain APIs](transactions.md) 提供。

## M5 Cards integration

Cards 摘要现在来自统一 Store 的 Cards Domain，以 maskedNumber 替代 last4。View cards 进入 `/app/cards`。冻结仅更新对应卡片状态，金融总额、消费、投资与 financial asOf 不变；控制项修改不影响这些指标。

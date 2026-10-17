# Accounts Banking Domain APIs — M2

## 边界

- `/customer/overview` 继续是 Web Dashboard read model。
- `GET /customer/accounts` 与 `GET /customer/accounts/{accountId}` 是 Banking Domain APIs，当前由 MSW 实现。
- 详情内的 `recentTransactions` 保留该账户最近 5 条记录。M3 的 View all activity 导向带 accountId 筛选的 Transactions Domain API 页面，不让详情承载完整历史。

## 契约

唯一来源：`contracts/openapi/customer.yaml`，版本 1.3.0。前端从 `apps/web/src/generated/customer-api.d.ts` 引用类型，不维护重复 DTO。

| Schema             | 定义                                                                                                                               |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------- |
| Money              | decimal string amount + CNY/USD currency                                                                                           |
| AccountType        | CURRENT / SAVINGS / MULTI_CURRENCY / TIME_DEPOSIT                                                                                  |
| AccountStatus      | ACTIVE / RESTRICTED / FROZEN / CLOSED                                                                                              |
| AccountSummary     | id、displayName、type、status、currency、maskedAccountNumber、balance、availableBalance，可选 pendingAmount/baseCurrencyEquivalent |
| AccountDetail      | 扩展 AccountSummary；包含 asOf、可选 openedAt、recentTransactions                                                                  |
| ExchangeEquivalent | value（Money）、sourceCurrency、exchangeRate（decimal string）、conversionAsOf、conversionSource=DEMO_RATE                         |
| AccountsResponse   | asOf、baseCurrency、totalBalance、accounts、exchangeEquivalents                                                                    |
| ApiError           | code、message；当前 ACCOUNT_NOT_FOUND / INTERNAL_ERROR                                                                             |

未知 ID：HTTP 404，JSON `{ "code": "ACCOUNT_NOT_FOUND", "message": "Account not found." }`。错误不回显用户提供的 ID。客户端保留 HTTP status/code，详情使用独立 not-found 状态；其他失败可 retry。

## 余额与可用余额

`balance` 是已入账账面余额。`pendingAmount` 是尚未入账的借方预留金额，非负；适用时满足：

```text
balance − pendingAmount = availableBalance
```

三者币种一致。没有待入账扣款时 Demo 返回 0.00；不适用时字段允许省略，页面显示 Not applicable。账户状态限制仍独立适用，availableBalance 不是对转账执行的授权。

| 账户        | 原币账面余额 | Pending   | Available    |
| ----------- | ------------ | --------- | ------------ |
| CNY Current | CNY 23842.31 | CNY 32.00 | CNY 23810.31 |
| Savings     | CNY 8200.00  | CNY 0.00  | CNY 8200.00  |
| USD         | USD 621.32   | USD 0.00  | USD 621.32   |

Current 的 ¥32 对应 Starbucks 的 PENDING 交易。该交易不影响已入账余额或已完成消费汇总。

## 外币折算

总额明确展示 **CNY equivalent (estimated)**。外币账户的 `baseCurrencyEquivalent` 是 ExchangeEquivalent 对象；其中 `value` 是折算后的 Money。

Demo rate：1 USD = 7.10 CNY，来源 `DEMO_RATE`，汇率时间 `2026-09-27T10:00:00+08:00`；账户快照时间 `2026-09-27T10:30:00+08:00`。USD 621.32 折合 CNY 4411.37，总账面余额折合 CNY 36453.68。

计算使用 BigInt 整数分和 half-up，不使用 JS floating point。总额是存款账面余额估计值，排除投资，不是可用资金、净资产或可执行汇率。

## 数据和安全展示

`src/mocks/data/demo-profile.ts` 是统一来源，`getDemoAccounts()` 生成账户摘要，Overview 复用它的 accounts/totalBalance/exchangeEquivalents。详情从同一摘要增加开户时间和账户内近期交易，返回独立 snapshot。Savings/USD 没有近期记录时返回空数组，不借用 Current 的交易。

**Sensitive account identifiers are server-masked.** 当前由 Mock/API data 层预先保存 `•••• 1048` 等值；从未保存、返回完整账户号。React 不接触原始敏感值，也不执行 mask。API 和页面不包含密码、PIN、完整卡号、CVV。

UI 链路：React → feature hook → 统一 API client → MSW。账户卡片只导航详情；Transfer CTA 在 M4 导航 `/app/payments/transfers/new`，由独立的准备、Review 和确认流程执行。

## 测试与后续

RTL 覆盖 list/detail/loading/empty/error/retry/404、币种、available、status、交易与换算。Consistency tests 校验 Overview/list/detail 一致、余额算式、pending 与交易一致、FX 舍入、总额、脱敏响应及快照隔离。

Playwright 覆盖 Login → Overview → View all accounts → Accounts → CNY Current，以及 320/390/1440px 布局和未知 ID。

M3 已新增独立交易查询、分页和筛选，见 [Transactions](transactions.md)。真实后端、鉴权、真实汇率和资金预留生命周期仍留待后续。

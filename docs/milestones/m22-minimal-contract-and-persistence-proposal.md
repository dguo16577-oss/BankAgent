# M22 最小兼容变更提案（已批准）

状态：**APPROVED / IMPLEMENTED**，2026-10-09。用户已批准本提案的兼容范围；V31/V32、Customer OpenAPI 与 Agent 接入已实施。M22 整体验收仍为 PARTIAL，详见 [M22 报告](m22-subscription-direct-debit-agent.md)。下表保留批准时的能力审计原貌。

## Phase A 能力矩阵

| 能力                               | 当前状态             | 证据                                                                                 | 处理                                                       |
| ---------------------------------- | -------------------- | ------------------------------------------------------------------------------------ | ---------------------------------------------------------- |
| 客户周期付款列表／详情             | Existing             | `GET /customer/recurring-payments`、详情；V4 `recurring_payments`                    | 复用，保持 `source` 与 `managementCapability`              |
| 银行管理的代扣撤销                 | Reusable             | 现有 `RecurringService.prepare/execute`、哈希快照、step-up、幂等回执                 | Agent 可接入，但先补意图撤销生命周期                       |
| 从交易发现周期扣费                 | Existing/Reusable    | Customer 交易分页及 Agent 有界消费读取；当前银行 `DETECTED_PATTERN` 仅为显式演示种子 | 新增只读确定性分析工具，不把模式当授权                     |
| 银行端确切下次扣费日期             | Existing, limited    | `nextExpectedAt` 用于 `BANK_MANAGED` 记录                                            | 与历史估计日期分别展示                                     |
| 续费提醒状态／应用内通知           | Missing              | 无 reminder/notification 表、Customer API、到期 worker                               | Requires API Change + Requires Migration                   |
| 主动撤销 PREPARED 的周期付款意图   | Missing              | `RecurringIntent.Status` 只有 PREPARED/EXECUTED/EXPIRED，V4 CHECK 同样如此           | Requires API Change + Requires Migration                   |
| 第三方商户会员取消                 | Missing/out of scope | 没有第三方订阅 API 或运营授权                                                        | 只给已知可行的人工指引，不声称取消成功                     |
| 银行代扣实际清算／阻止商户未来扣款 | Limited              | 现有 `stop()` 持久化银行安排状态；目前没有模拟商户收款执行器读取该状态               | 只报告银行安排已撤销，不保证外部商户权益或真实支付网络停止 |

## 请求批准的最小变更

1. **V31（追加迁移）**：`recurring_payment_action_intents.status` CHECK 增加 `CANCELLED`，不重写 V4 或旧记录。Spring 领域增加 `CANCELLED` 终态；撤销和执行使用同一客户／意图行锁，已撤销哈希及 step-up 授权不能执行，重复撤销幂等返回终态。Customer OpenAPI 增加 `POST /customer/recurring-payment-action-intents/{intentId}/cancel`，复用现有意图响应结构，并在枚举中兼容增加 `CANCELLED`。旧列表、准备、执行 API 不变。
2. **V32（追加迁移）**：增加 `renewal_reminders`、`renewal_reminder_action_intents`、`in_app_notifications` 三表。提醒保存客户、银行安排 ID 或不可执行的检测模式指纹、展示摘要、`due_at TIMESTAMPTZ`、时区、状态、版本、创建/修改/触发时间；银行安排绑定复合客户外键，模式提醒记录不可被误解为授权。意图保存不可变前后快照、哈希、到期、PREPARED/EXECUTED/CANCELLED/EXPIRED。通知保存客户、提醒、内容、创建时间和已读状态。客户+目标+到期时间+状态的唯一/部分索引约束幂等，FK、CHECK 和扫描索引支持到期 worker；所有写入在 PostgreSQL 事务内。
3. **Customer API 兼容增量**：`GET /customer/renewal-reminders`、`GET /customer/renewal-reminders/{id}`、`POST /customer/renewal-reminder-action-intents`（CREATE/CHANGE/CANCEL）、`GET /customer/renewal-reminder-action-intents/{id}`、`POST /customer/renewal-reminder-action-intents/{id}/cancel`、`POST /customer/renewal-reminder-actions`（确认后执行）、`GET /customer/in-app-notifications`。请求只接受已观察的属主资源或明确的检测模式指纹与用户指定时间；响应区分银行确定账期与历史估计。生成类型、freeze manifest、implementation matrix 同步更新。若用户希望减少操作数，通知可并入现有可证明持久的通知 API；当前未找到该能力。
4. **可信执行**：Agent 模型仅新增 `prepare_stop_recurring_payment`、`prepare_renewal_reminder` 等 PREPARE 工具。Runtime 管理 WAITING_CONFIRMATION，Session/CSRF、适用 step-up、意图哈希、当前版本与所有权由 Spring 复核。提醒后台 worker 使用数据库锁和幂等通知键，只创建应用内通知。被撤销银行安排对应的未来提醒停止；检测模式提醒仅在用户明确选择时保留。

## 验收后置条件

批准上述兼容增量后，才能实现 SUB10–SUB13、SUB15–SUB17、SUB20 的完整持久化与确认链路。先做 Spring Testcontainers（撤销／执行并发、到期触发、属主隔离、重复通知）、Agent 确认链和真实浏览器复测，再运行全量回归。没有第三方 API 的商户只能返回 `UNSUPPORTED`，不能称为已取消订阅。

**审批范围**：仅上述 Customer OpenAPI 兼容新增与 V31/V32 迁移；不申请历史迁移改写、外部服务接入或扩大直接执行权限。

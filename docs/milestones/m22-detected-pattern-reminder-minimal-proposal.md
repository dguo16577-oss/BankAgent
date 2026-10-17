# M22 — DETECTED_PATTERN Reminder 最小兼容变更提案

状态：**APPROVED**，2026-10-09。用户批准 V33 与 Customer 合同增量。此提案只涉及即时检测出的、尚无 `recurring_payments` 行的周期扣费模式提醒。

## 为什么现有模型不够

V32 的 `renewal_reminders.recurring_payment_id` 和 `renewal_reminder_action_intents.recurring_payment_id` 均为 NOT NULL，且有复合客户外键指向 `recurring_payments`。Customer OpenAPI 的提醒创建请求也强制提供 `recurringPaymentId`。`detect_recurring_payments` 的结果可能仅存在于 Agent 对已完成交易的即时分析中；伪造一个银行代扣记录会混淆“预测模式”与“可撤销授权”。因此不能只改 Agent 或用临时内存状态安全完成。

## 建议的最小变更

1. 追加 **V33**（先核对版本空缺），不改 V32。新增客户作用域的 `detected_recurring_patterns`：稳定 `pattern_id`、客户、规范化商户、币种、周期、估计金额、预计日期、识别时间、状态及证据交易 ID 的不可变快照/摘要。证据必须来自该客户已完成的合格借记交易。再次检测同一证据指纹可更新预测版本；证据不足或模式消失时标记 STALE，不能伪装银行授权。
2. 对 V32 提醒和提醒意图兼容增加 `target_type=BANK_MANDATE|DETECTED_PATTERN`、nullable `pattern_id`，使两个目标恰有其一；保留原有 `recurring_payment_id` 外键，新增客户+模式外键和各目标的唯一活跃提醒约束。既有行回填 `BANK_MANDATE`，旧提醒继续有效。意图快照/哈希覆盖目标类型、指纹、版本、时间和时区。
3. 对现有 Customer Reminder API 做兼容增量：原 `recurringPaymentId` 输入保持旧客户端可用；新增显式的 `patternReference`/证据输入与 `targetType` 输出，不新设执行端点。Spring 对客户、交易状态、证据集合、归一化商户、周期和有效期自行复核，绝不信任模型提交的商户/日期为银行事实。
4. Agent 复用 `prepare_renewal_reminder` 与现有确认链；模式提醒只能创建/修改/取消应用内通知，`prepare_stop_recurring_payment` 只接受银行管理安排。到期 worker 对过期预测显示估计/失效状态，不发送短信或邮件。

## 验收与风险

Testcontainers 覆盖证据伪造、跨客户交易 ID、旧数据迁移、同一指纹去重、CHANGE/CANCEL、并发、失效重调度及 worker 到期。真实 DeepSeek 与浏览器证明“发现模式→准备→确认→持久提醒”，且不能借模式取消代扣。保持既有 87 个 API 操作及所有旧行为。该方案新增 V33、冻结合同字段和生成类型，超出先前仅批准 V31/V32 的范围；在获得授权前不实施这部分。

# M18.2 — Phone Recipient API Proposal

日期：2026-10-07。状态：**待确认；尚未修改 Customer OpenAPI、freeze manifest 或数据库 schema**。

## Phase A：当前事实

| 层               | 当前实现                                                                                                                                                                                                         | 对 M18.2 的影响                                                  |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| PostgreSQL       | `recipients` 只有 ID、owner、姓名、银行、脱敏账户、币种、`destination_ref`、状态等；没有手机号、标准化号码或手机号索引。`customer_phone_bindings.phone_e164` 是**客户本人**的登录/验证手机号，不是收款人手机号。 | 无法从真实 Recipient 数据查手机号，不能复用客户手机号表。        |
| Spring Domain    | `Recipient` record 与 `RecipientJpaEntity` 均无手机号。`RecipientQueryService` 只处理最长 100 字符的 `search`；JPA 查询只匹配 `displayName` 和 `bankName`。                                                      | 不能在 Agent 中用硬编码号码映射替代银行数据。                    |
| Customer OpenAPI | `GET /customer/recipients` 已有可选 `search`；`RecipientSummary` 无 `maskedPhone`。                                                                                                                              | P06“尾号 8000 那个”所需的候选手机号后四位无法通过可信响应提供。  |
| Agent            | 现有 `resolve_recipient(query)` 从 `/customer/recipients` 读取所有收款人，并在 tool boundary 做姓名/拼音/别名匹配。工具注册表共 9 个；`prepare_transfer` 接收 canonical `recipient_id`。                         | 保留同一工具与资金操作边界；新增实体解析逻辑需依赖真实银行返回。 |

结论：**需要最小的 PostgreSQL + Customer OpenAPI 增量**。按照本轮指令，先提出方案并等待确认，不能把 M18.2 标为 PASS。

## 建议的最小增量

1. 新 Flyway migration（按现有版本顺序，预计 V20）：`recipients.phone_e164 VARCHAR(16) NULL`，约束为 `^\+86[0-9]{11}$`，并限制中国演示域手机号为 `1[3-9][0-9]{9}`。旧收款人保留 `NULL`；不回填猜测数据。建立 `(customer_id, phone_e164)` 的**非唯一**部分索引，仅索引非空号码。一个号码可能对应同一客户保存的多个收款账户，必须允许 `AMBIGUOUS`，不可任意选一个。
2. `Recipient`、JPA 映射、seed/test fixture 增加 nullable `phoneE164`。仅在受控 seed 或未来经过验证的收款人录入流程写入号码。当前 `CREATE` 操作只接受两个固定 demo destination；本轮不扩展创建接口接受任意手机号。
3. `RecipientSummary` 增加可选 `maskedPhone`（例如 `138****8000`）；**不**在响应中加入完整手机号。更新 Customer OpenAPI、freeze manifest、生成代码和 `PaymentMapper`。其它使用 `RecipientSummary` 的响应会自然获得同一字段；保留旧响应的兼容性。
4. 复用现有 `GET /customer/recipients?search=`：服务端判断查询是否为**完整、合法**的中国手机号表示（`13800138000`、`+8613800138000`、`+86 138 0013 8000`、`0086...`），在 Recipient 查询边界保守标准化，并精确匹配 `phone_e164`。普通文本搜索仍按现有姓名/银行名规则。短号、错位、近似号码绝不模糊补全。服务端只查询当前认证客户的收款人。
5. Agent 的**同一个** `resolve_recipient(query)` 对号码查询调用此服务端 `search`；仍返回 `RESOLVED`、`AMBIGUOUS`、`NOT_FOUND`。候选只带 canonical `recipient_id`、显示名、不可信标签、`maskedPhone`、脱敏账户。姓名解析仍在同一工具内。`prepare_transfer` 继续只接受已观察到的 `recipient_id`；模型无执行工具。

## 查询和隐私边界

手机号会以 HTTPS 服务端到服务端查询参数发送至 Spring。它不应进入 Agent audit、sanitized trace、console 或应用 access log；记录 query 时应按手机号规则遮蔽。若现有网关、反向代理或 APM 无法可靠禁止记录 URL query，则在实施前应改选**受控 HTTP layer 方案**，不能把完整手机号放进持久日志。模型收到的工具 observation 只包含脱敏手机号。用户本轮输入的原始手机号可能已经位于对话文本中，持久化对话/trace 也须独立脱敏。

`maskedPhone` 只是展示和多轮消歧辅助，不是授权凭证；完整号码在数据库中属于受限 PII。建议真实部署另行评估加密、保留期限与审计策略。此次 demo 不把仅持有号码等同于已核验收款人。

## 实施后验收

- 数据迁移验证旧 Recipient `phone_e164=NULL`，新 fixture 的标准化号码、owner-scoped 非唯一索引和相同号码多收款账户。
- P01/P02 唯一手机号，P03 不存在，P04 同手机号多个账户 `AMBIGUOUS`，P05 同名但完整手机号唯一，P06/P07 同 Task 多轮补充号码，P08 恶意昵称不能改金额。
- 真实 DeepSeek trace 证明 `LLM → resolve_recipient → observation → LLM → list_accounts/prepare_transfer`；禁止固定 phone workflow。九工具数量仍为 9。所有 smoke 在 `WAITING_CONFIRMATION` 后取消 intent，核对余额和转账数量不变。
- 回归姓名、卡消费、备注注入与 canonical ID provenance guard。检查确认卡只显示脱敏手机号、脱敏账户和实际金额。

## 当前暂停点

本提案仅供审批。**尚未修改** `contracts/openapi/customer.yaml`、freeze manifest、生成类型、Spring Domain、Flyway migration 或 Agent 功能代码；尚未运行 P01–P08 的真实 DeepSeek smoke。批准此最小增量后才能继续实施 M18.2。本轮不进入历史备注找人、定时转账或 AA。

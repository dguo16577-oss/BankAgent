# B1 — Recipient Management

日期：2026-09-30。**设计边界冻结；未授权实施，不修改 Web V1。** 本文所有新字段、路由及表均为后续候选。

## 结论与证据

接受：已有收款人列表/姓名搜索、显式消歧、新增演示收款人、详情和停用。暂缓：改收款目的地、重新激活、手机号别名、真实账户验证。删除改为停用，历史不可删除。

B0 的 `NEW_RECIPIENT_TRANSFER` 是 Aster 提案，不能称为外部数据集已经验证的 CRUD 需求。`BILL_TO_TRANSFER` 的 AgentDojo UserTask0 需要新的付款目的地；本轮重读 UserTask15 明确包含新房东目的地和计划修改，但上游直接使用账户标识，并没有受益人管理服务。证据支持“确认正确目的地”，不支持整套手机号查询/KYC。

B0 的 `RECIPIENT_TRANSFER` 中 tau knowledge task_016 实际 gold action 是第三方卡消费，不足以支持收款人 CRUD；保留 B0 原表，在 B1 来源复核中标注弱关联。所有族及变体 ID 见 [机器映射](../../research/banking-behaviors/b1-family-capability-map.jsonl)，重读原文件 URL、版本和哈希见 [来源复核](../../research/banking-behaviors/reports/b1-source-review.json)。

## 当前实现

- `RecipientQueryService.list` 只在当前 customer 范围，按 displayName 或 bankName 子串搜索；不是手机号目录。
- `Recipient` 目前只有 id、customerId、displayName、bankName、maskedAccountNumber、currency。
- `GET /customer/recipients` 与 `/app/payments/transfers/new` 已有；转账 prepare/execute 能处理已有收款人。
- 未实现创建、状态、详情独立 API、验证、编辑、去重或创建时间。

## 最小能力清单

| 操作 | 决定 | 证据/产品理由 | 授权 |
|---|---|---|---|
| list / name / bank search | 复用 | 当前转账选择已有能力 | AAL1，ALLOW |
| phone search/alias | DEFER | 没有可靠手机号解析/拥有权证据，不引入短信或目录 | 不设计 |
| create | FOUNDATIONAL | 打通新目的地转账；不是自动发钱 | AAL1 + CSRF + CONFIRMATION |
| detail | 接受，与 create 同批 | 核对名称、遮罩、状态及后续关联 | AAL1，ALLOW |
| verification state | 只显示 UNVERIFIED | 演示目的地存在不等于真实持有人已验证 | 服务端只读 |
| display-name edit | ENHANCEMENT，暂缓 | 有用但不是当前必需原语；未来独立版本化 | 候选 CONFIRMATION |
| bank/destination edit | DEFER | 防止悄悄重定向已有计划；另建收款人 | 若以后接受，需要新 intent 和付款风险重评 |
| disable | CORE | 停止新付款，保留历史 | CONFIRMATION，无额外 Step-Up |
| physical delete / reactivate | DEFER | 容易破坏历史和旧计划授权语义 | 不接受 |
| duplicates | 必须处理 | 同名不等于同一目的地 | owner + destinationRef 唯一 |
| ambiguous matches | 必须处理 | 人选择具体 ID；未来 Agent 也必须询问 | CLARIFICATION，不生成可执行 intent |

## 身份模型

候选字段：opaque `recipientId`、`customerId`（只从 principal）、`displayName`、`bankLabel`、不可变 `destinationRef`、`maskedAccountNumber`、`currency=CNY`、`createdAt`、`status=ACTIVE/INACTIVE`、`verificationStatus=UNVERIFIED`、`version`。

`destinationRef` 是 **local/test 预设的合成目的地标识**，不是完整账号，也不是仅凭末四位拼出的身份。新增表单输入演示目的地编号；服务端从版本化 demo destination catalog 解析名称/银行/遮罩，准备页返回可信展示信息，再确认保存。catalog 可使用受控 demo 配置，不建真实银行目录。未知编号拒绝；没有 catalog 条目的真实账号无法付款。不同目的地可以有相同姓名或末四位，不因此合并。

创建时间从 Clock 取得。`isNew` 不保存为可过期布尔值，而按策略计算；未知创建时间按新收款人处理，不能通过数据迁移默认为可信。既有种子记录若有已知创建时间，迁移需明确记录来源。

## 变更、幂等与并发

- `ABSENT → ACTIVE → INACTIVE`；首批 INACTIVE 不可恢复，不支持路由修改或硬删除。
- 创建使用准备 intent、服务端规范 hash 和幂等键；同键同请求返回原记录，同键不同请求冲突。同 owner/destination 并发创建由唯一约束兜底；不同名称冲突需用户确认现有记录，不能悄悄覆盖。
- 停用采用版本检查、短效 intent 与幂等回执。已停用的同一请求重放返回原回执；新请求显示“已经停用”，不创建额外事件。
- 付款执行重新检查 recipient 状态和版本。停用与付款并发需在同一 DB 锁次序内串行化；先成功付款不会被追溯撤销，先停用则付款拒绝。
- 停用前展示影响的未来计划。计划不被静默删除；到期时若目的地失效则 FAILED，不扣款。此规则在停用确认页明确显示。

## UI、API、DB 候选

入口：**Payments → 收款人选择/管理 → 新增 → 确认 → 回原转账表单**。普通操作不经过 My Applications。详情显示原币、遮罩、未验证说明及停用状态。

复用 `GET /customer/recipients`；候选新增 `GET /customer/recipients/{id}`、`POST /customer/recipient-action-intents` 和相应 intent GET；`POST /customer/recipients` 提交 CREATE intent，停用通过候选 recipient-actions 提交。精确命名在下一合同变更阶段审核，本轮不增加操作。

扩展 recipients 的 owner/destination 唯一、status/version/createdAt 等；准备记录及回执复用当前 **模式**，不假设项目已有通用 intent 表。银行卡/转账现有 hash 具有资源类型前缀，新原语需要独立 canonical fields，不可复制为另一套安全框架。

创建收款人不移动资金，确认即可；向新收款人付款在付款阶段升级，不能把一次创建确认当付款授权。禁止增加 KYC、账户持有人匹配、电话号码验证成功等无事实依据的状态。

## 价值、成本与验收门槛

Agent 价值 HIGH：姓名消歧、从请求提取目的地、创建后回到付款；手动对等 MANUAL_EXACT。成本 MEDIUM，主要在目的地模型、唯一约束、intent、选择器和并发测试。

后续必须验证：跨客户不可见、同名不同目的地、同目的地并发去重、篡改遮罩无效、无 CSRF 拒绝、停用与付款竞争、新收款人风险分支、登录返回原流程。完整族收益必须与 payment authorization 同批评估，不能把 read/create/disable 的重叠计数相加。

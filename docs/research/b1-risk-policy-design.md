# B1 — Deterministic Risk / Authorization Policy

日期：2026-09-30。**本轮只设计，不改变现有授权。**

## 两种“风险”必须分开

1. **Action authorization risk**：一个有效业务动作需要确认、Step-Up 还是应拒绝。接受复用的确定性 policy decision layer。
2. **Investment risk assessment**：投资者问卷、风险承受能力、profile、适当性。B0 RISK_ASSESSMENT 是第二种，不能因实现付款 Step-Up 就变为支持。问卷/评分依据未定义，DEFER；现有 risk-profile read、suitability check 不变。

不是 ML 欺诈预测、AML、制裁、信用评分、生物识别或新认证系统。benchmark 只能证明需要消歧/确认/分支，不能证明某金额或收款人年龄是现实诈骗阈值。

## 当前可复用边界

- SecurityService 创建 challenge **硬限制 CARD_ACTION_INTENT**。现有资源枚举和 frozen contract 也有限制；不是加一个调用就能授权付款。
- ActionAuthorizationService.validate/consume 已有 customerId/sessionId/resourceType/resourceId/resourceHash 绑定，consume 参与调用方 DB 事务。
- Spring Session + CurrentCustomerProvider、CSRF、5 分钟 challenge / 3 次失败、2 分钟 authorization、Clock、SecurityEvent 已存在。普通 session 保持 AAL1；不设置全局临时 AAL2。
- CardService/Card.plan 的提升风险/保护分类已落地；RecurringService 的 stop 和 WealthService 的 suitability/intent/version 也已有独立业务规则。
- TransferExecutionService 已有 prepare/hash/幂等/原子记账，但无付款 ActionAuthorization 入参；必须在未来合同批准后扩展，不接受 card grant 冒充 payment grant。

## 决策模型

采用与当前命名兼容的 `ALLOW | CONFIRMATION | STEP_UP_AUTH | DENY`。STEP_UP_AUTH **包含交易详情确认**，不是取代确认。`CLARIFICATION` 是输入尚不唯一的流程结果，不是可兑换的 authorization，也不创建可执行 intent。

顺序：身份/所有权 → 业务资格/数据消歧 → 确定性 policy → 生成并展示不可变 intent → 用户确认/按需 step-up → 执行时重验 → 同事务变更及消费授权。

DENY 优先。余额不足、冻结账户、无权资源、已终结卡、产品不适合，不能通过输入正确 security code 绕过。policy 不能取代 domain invariants。ALLOW 主要用于读取；本批财务/持久客户变更均需确认。

业务 Application 使用不依赖 HTTP/Spring Security/JPA/OpenAPI 的 port/value object；技术 adapter 负责 session 信息转换和事务。第一实现不做 universal intent engine、不集中重写全部 domain，也不将各域规则移进一个大 switch。共享决策 envelope、版本和执行门槛，各域保留资格判断。

## 最小输入与输出

输入（服务端推导）：actionType、resourceType/id/version、customer/session reference、认证会话有效性、Money totalDebit、recipient createdAt/status/version、riskDirection、Clock now、policyVersion。Card before/after channels 和 status 由领域计算；Wealth 只提供 suitability 结果，不将问卷分数混入付款风险。

不采集设备指纹、位置、任意“异常分数”或浏览历史。目的地不可修改，因此“recently modified recipient”首批没有可合法产生的路由编辑；未来扩展时使用 routingChangedAt，并按新收款人处理。显示名变更不能改变路由。

输出：decision、reasonCodes、policyVersion、resource binding 和用户可读解释。不把客户端 riskLevel/decision 当可信输入，不给前端暴露通用“算一个 ALLOW”的接口。

## 参数边界与未批准的测试示例

冻结决策形式：CNY totalDebit（含费用）`>= H` 为 high；recipient age `< W` 为 new；未知 createdAt 按 new；恰好 W 不再 new。H 必须为正 decimal string，W 必须为正时长；服务端使用经批准的版本化配置，缺失配置不得降级为 ALLOW。

**不冻结没有依据的数值阈值。** B0 没有给出 Aster 可采用的金额/时间参数，因此 H/W 是后续 B1A 实施前的产品批准项。为说明测试边界，可以在隔离测试中使用 H=10000.00、W=24h，但这些只是非规范性测试向量，不得作为默认 runtime 参数。这项不确定性阻塞付款策略投入使用，不阻塞本轮能力边界设计交付。

| 例子（假设其他条件有效） | 决策 | 原因 |
|---|---|---|
| existing recipient + ¥500 | CONFIRMATION | 保持现有转账审阅 |
| new recipient + ¥500 | STEP_UP_AUTH | 新目的地降低未经授权添加后付款的风险 |
| existing recipient + high totalDebit | STEP_UP_AUTH | 更大的潜在损失 |
| new recipient + high totalDebit | STEP_UP_AUTH | 同一次 intent 授权；不是两个验证码 |
| ambiguous recipient | CLARIFICATION | 人先选择 ID，不猜测 |
| insufficient available funds | DENY | 硬业务条件，不靠认证覆盖 |
| recently modified routing recipient | 首批拒绝编辑；未来 STEP_UP_AUTH | 编辑后必须新 intent，按新目的地处理 |
| inactive recipient / blocked source | DENY | 即使之前已发 grant，也不可执行 |

准则是服务端绑定并重新核对交易重要数据，与 [OWASP Transaction Authorization](https://cheatsheetseries.owasp.org/cheatsheets/Transaction_Authorization_Cheat_Sheet.html) 一致。该资料不提供金额/时间阈值。

## Card / Recurring / Wealth 对照

| 操作 | 期望授权 | 范围 |
|---|---|---|
| freeze | CONFIRMATION | 保留现有 |
| unfreeze | STEP_UP_AUTH | 保留现有 |
| numeric limit decrease | CONFIRMATION | 条件性未来规则，限额能力暂缓 |
| numeric limit increase | STEP_UP_AUTH | 必须先有真实 enforcement，暂缓 |
| lost/stolen permanent block | CONFIRMATION | 保护性但不可逆，清楚确认具体卡 |
| replacement request only | CONFIRMATION | 不发卡/不恢复支付/不收费 |
| future replacement activation | 候选 STEP_UP_AUTH | 未接受的未来发卡流程 |
| enable any channel | STEP_UP_AUTH | 与当前 Card 一致 |
| disable channels only | CONFIRMATION | 与当前 Card 一致；混合 ON/OFF 仍 Step-Up |
| bank-managed recurring stop | CONFIRMATION | 保留；detected-only DENY |
| suitable investment buy | CONFIRMATION | 保留；不因为付款高额策略自动推广到财富 |
| unsuitable investment | DENY | 更高认证不能变为 suitable |
| product application intake | CONFIRMATION | 原产品页提交，保持现有；不是自动批准 |

## 幂等、绑定和到期

后续 PAYMENT_AUTHORIZATION 需增加独立 TRANSFER_INTENT / SCHEDULE_ACTION_INTENT 等显式 resource types（候选命名），不能复用 CARD_ACTION_INTENT 类型。prepare hash 纳入 policyVersion/decision、recipient version 和重要交易条款。变更金额、目的地、日期、旧版本或政策需要重新 prepare；grant 不可迁移。

执行在一个 DB 事务内 validate → domain mutate → consume → 保存回执与幂等结果；任一步失败全部回滚。双请求最多消费一次，同幂等请求成功重放仍返回原回执。用户或 session 不同、hash/type/id 不同均拒绝；不因同 customer 另一浏览器已验证而通过。

到期 schedule 不使用浏览器授权；创建时 grant 消费形成仅限单次指令的持久 mandate，详见计划设计。正常 logout 撤销活跃会话 grant，但不取消已经批准的未来计划。

## 持久化、观测与范围

不新建独立 risk_decisions 表：决策 snapshot 存 intent/receipt，SecurityEvent 记录 reasonCode/policyVersion/资源引用/结果/关联 ID。日志不存密码、hash secret、security code、完整账号；internal policy hash 与凭据 password hash 必须区分。

未来可能需扩展事件 enum 和 DB 约束，但 B1 不动 schema。基于用户点击的确认不能伪装为“OTP 已证明某笔交易”：当前 demo code 仍只是演示验证机制，非生产安全认证。

Agent 价值 HIGH 在澄清与策略分支。决策层 PRIMITIVES_ONLY，确认/Step-Up MANUAL_EXACT；Agent 不能替用户确认、回答 security code、直接调用 internal scheduler 或访问数据库。

后续 blocking tests：身份/CSRF/跨 session；新/旧收款人及金额边界；同 customer 双 session；旧 hash；policy version 变化；AAL2 不覆盖 domain DENY；同事务回滚；并发双消费；Card/Recurring/Wealth 原有授权不被提权或降级。成本 HIGH，第一批先锁定这些兼容性测试。

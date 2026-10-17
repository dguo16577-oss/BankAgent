# B1 — Transaction Dispute

日期：2026-09-30。**接受客户争议受理，不接受 chargeback 网络或赔付系统；本轮只设计。**

## 来源实际要求

TauIndian `rl_sqdisp_0007` 是查找交易 → 挂失保护 → 登记关联争议。Indic `csc.agentic.dispute_unauthorized.001` 要从不精确描述找到特定 debit，确认后登记且不保证退款；`csc.agentic.dispute_wrong_account.001` 要先纠正账户和交易绑定。

tau knowledge task_080 还包括多笔 provisional credit 配额/优先级，不属于本次最小范围。task_043 的 dispute history 查询是销卡前置检查，不是创建争议的证据。B0 中 TRANSACTION_DISPUTE 的 37 个候选簇不能全部标成完成；Banking77 duplicate/unrecognized 是语言意图，没有可执行裁决器。

## 范围与理由

接受原因：`NOT_RECOGNIZED`、`DUPLICATE_CHARGE`、`INCORRECT_AMOUNT`、`CASH_WITHDRAWAL_ISSUE`、`GOODS_OR_SERVICES`、`OTHER`。其中 ATM 只接收现有历史 CASH_WITHDRAWAL 的问题，不新建 ATM 操作。原因只帮助路由与说明，不表示银行认定欺诈或商家有责。

| 原因 | 最小适用范围 | 附加校验 |
|---|---|---|
| NOT_RECOGNIZED | 自己已完成的 debit | 明确选中交易，无自动推断卡 |
| DUPLICATE_CHARGE | 两笔自己已完成的 debit，主笔固定 | 可选关联另一 transactionId；不能等于自身；不自动判重 |
| INCORRECT_AMOUNT | 自己已完成的 debit | 可以说明预期金额，但不改原金额 |
| CASH_WITHDRAWAL_ISSUE | CASH_WITHDRAWAL + completed debit | 没有提款功能也可受理历史记录 |
| GOODS_OR_SERVICES | CARD_PAYMENT + completed debit | 不承诺商家仲裁 |
| OTHER | 自己已完成的 debit | 有界文本说明，禁止要求密码/PIN/CVV |

所有权从 CurrentCustomerProvider，transaction/account owner 必须一致。PENDING 先解释未入账并可走卡保护，不创建财务争议；FAILED/CANCELLED/REVERSED/CREDIT 不接受本次受理，说明原因。未识别或重复的候选交易必须用户选择，不替换客户目标。

## 最小状态机

首批 `ABSENT → OPEN → CANCELLED`。OPEN 的准确文案为“已受理，演示环境不进行实际调查或赔付”；不得一直展示仿真的“正在人工调查”。UNDER_REVIEW/RESOLVED/REJECTED 暂缓，因为没有工作人员角色、处理入口或决议规则。后续若增加必须定义 actor、审计与合法终态。

- 创建不改变 transaction 的状态、bookedAt、金额、merchant，也不增加账户余额或 provisional credit。
- 同一 owner/transaction 最多一个 OPEN；DB 部分唯一约束兜底。并发不同幂等键也不能重复创建。
- 同键同内容返回原 case，同键不同内容冲突；另一键重复主交易提示已有 OPEN case，不合并/覆盖说明。
- CANCELLED 不可重开；可由用户再确认新建，保留 previousCaseId 并保持仍只有一个 OPEN。不要伪造永久只能投诉一次的规则。
- 原交易后来出现独立更正时，保留原事实及关联，只显示新事实，不静默自动关闭争议。

## 授权与 UI

AAL1 + CSRF；创建、取消均 CONFIRMATION，不为保护性报告加无理由 Step-Up。创建用短效 dispute intent 绑定 transactionId、原因、说明、关联交易及 policy/version；执行用 hash 与幂等键。取消绑定 case version。错误客户、终态、版本变更均在执行时重查。

**Transaction detail → Report a problem → 选择原因/说明 → 确认 → Case status**。保留返回该交易按钮；必要时提示相关 Card detail 的 freeze/lost 入口，但不能根据银行账户自动找到唯一卡并操作。My Applications/Requests 可以聚合状态链接，不成为唯一新建入口。

## 技术影响候选

复用现有交易 list/detail、Session/CSRF、customer isolation、Clock、IdGenerator、幂等与事务模式。建议新 dispute-intents prepare/GET、disputes submit/list/detail、dispute-action-intents/cancel submission；全部在 `/customer` 命名空间，精确合同留下一阶段。

预计 transaction_disputes：caseId、owner、transaction FK、reason、有限长度 description、relatedTransactionId nullable、status、createdAt、cancelledAt、version；intent 和幂等回执另持久。查询索引 owner/createdAt，活动案例唯一。不要把争议复用成 product application kind，因为生命周期和资源约束不同。无附件上传、仲裁系统、卡组织接口、资金回补或调查 SLA。

## 覆盖、价值和门槛

直接涉及 TRANSACTION_DISPUTE、DUPLICATE_CHARGE、UNRECOGNIZED_CHARGE、FRAUD_PROTECTION_DISPUTE，共 38 个 B0 候选簇。只有最后的“定位→保护→登记”组合在加上永久挂失后预测完整；前三族仍有退款/判重/裁决等边界，维持 PARTIAL。

成本 MEDIUM；Agent 价值 HIGH 来自交易消歧、正确顺序与错误账户修正，不来自“新增一张表”。普通操作 MANUAL_EXACT；组合 PRIMITIVES_ONLY。

后续验证：错误 owner 404、pending 拒绝、case 去重并发、取消版本冲突、原交易/余额完全不变、文本不进入安全日志、无自动退款承诺、返回原交易页面。安全保护与登记两步允许部分成功：挂失成功而登记失败时保留挂失并可单独重试，不补偿解封卡。

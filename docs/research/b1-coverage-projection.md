# B1 — Coverage Projection

日期：2026-09-30。**条件性设计预测，不是当前已实现结果，不改 B0 统计。**

## 统计规则

保持 B0 的 67 个族、498 个候选簇和当前 19/20/19/9。逐族从 B0 required_capabilities 与 B1 proposal 显式关系计算；来源读操作误映射等问题另记录，不偷偷修分母。

- affected：涉及该能力的 B0 族/候选簇，不保证实施一项即可完成。
- improved/full：**整个建议批次及前置**完成后的共同收益，不是单项独立贡献，不能相加。
- lower-bound variants：仅 4 个已审查的简单 Aster 适配目标，仍须编写初态/断言；不是上游 runnable case 已通过。
- recipient disable 是保护性扩展，关联创建族用于说明风险，单独解锁为零。
- Risk policy 在 Cards/Recurring/Wealth 的复用只保持现有语义，不额外增加支持族。
- 纯语言/规范来源可能没有 candidate variants，0 不等于没有产品价值。

## 每项能力涉及范围

| Capability | 涉及族 | 涉及候选簇 | 联合改善族 | 联合完整族 | 变体下界 |
|---|---|---|---|---|---|
| RECIPIENT_RESOLVE | 2 | 11 | 0 | 0 | 0 |
| RECIPIENT_CREATE | 2 | 2 | 1 | 1 | 1 |
| RECIPIENT_DISABLE | 2 | 2 | 0 | 0 | 0 |
| RISK_POLICY | 1 | 1 | 1 | 1 | 1 |
| PAYMENT_AUTHORIZATION | 1 | 1 | 1 | 1 | 1 |
| SCHEDULE_CREATE | 2 | 1 | 2 | 2 | 1 |
| SCHEDULE_EDIT | 2 | 3 | 1 | 0 | 0 |
| SCHEDULE_DUE_PROCESSOR | 2 | 1 | 2 | 2 | 1 |
| DISPUTE_INTAKE | 4 | 38 | 1 | 1 | 1 |
| CARD_LOST_BLOCK | 2 | 14 | 2 | 2 | 1 |
| CARD_REPLACEMENT_REQUEST | 2 | 27 | 0 | 0 | 0 |
| RECURRING_TRANSFER_SERIES | 2 | 2 | 0 | 0 | 0 |
| INVESTMENT_RISK_ASSESSMENT | 1 | 0 | 0 | 0 | 0 |
| CARD_NUMERIC_LIMITS | 1 | 6 | 0 | 0 | 0 |

所有提案（含 DEFER）去重涉及 20 族、104 个候选簇。它们不能被宣称为 104 个完整解锁变体。每一个 variant ID、source task ID、axis 和提案链接都保存在 [b1-family-capability-map.jsonl](../../research/banking-behaviors/b1-family-capability-map.jsonl)。预测以付款风险参数批准及后续全部验收门槛通过为前提。

## 批次预测

| 批次累计 | SUPPORTED | PARTIAL | MISSING | OUT/EVAL |
|---|---|---|---|---|
| BASELINE | 19 | 20 | 19 | 9 |
| B1A | 21 | 18 | 19 | 9 |
| B1B | 23 | 18 | 17 | 9 |
| B1C | 25 | 16 | 17 | 9 |

| 批次 | 族 | 转换 | 条件 |
|---|---|---|---|
| B1A | NEW_RECIPIENT_TRANSFER | PARTIALLY_SUPPORTED → SUPPORTED | Owned create + existing immediate transfer |
| B1A | PAYMENT_RISK_ESCALATION | PARTIALLY_SUPPORTED → SUPPORTED | Payment-specific policy and authorization with both UI and atomic backend execution |
| B1B | SCHEDULED_TRANSFER | MISSING → SUPPORTED | One-time date instruction AND deterministic due execution |
| B1B | SCHEDULE_CHANGE | MISSING → PARTIALLY_SUPPORTED | One-time edits only; source rent standing-order variants remain blocked |
| B1B | BUDGET_TO_SCHEDULE | PARTIALLY_SUPPORTED → SUPPORTED | Manual spending/account primitives + one-time schedule; no Agent orchestration |
| B1C | CARD_LOST_BLOCK | PARTIALLY_SUPPORTED → SUPPORTED | Confirmed lost/stolen permanent lifecycle; source fraud-specific guesses not accepted |
| B1C | FRAUD_PROTECTION_DISPUTE | PARTIALLY_SUPPORTED → SUPPORTED | Locate owned debit, explicitly block reported stolen card, register linked dispute; no refund |

不能增加的分数：CARD_REPLACEMENT 仍 PARTIAL（无发行/激活）；CARD_DELIVERY 仍 MISSING；TRANSACTION_DISPUTE/UNRECOGNIZED_CHARGE/DUPLICATE_CHARGE 仍 PARTIAL（没有调查结案/网络退单/自动判重）；RELOCATION_PAYMENTS 仍 PARTIAL（无 standing orders/地址更新）；BILL_TO_TRANSFER 仍 PARTIAL（没有可信账单导入）；RISK_ASSESSMENT 仍 MISSING（不是付款授权风险）。

SCHEDULE_CHANGE 从 MISSING 到 PARTIAL 只表示单次计划修改原语变得可用，**三个租金 standing-order 源簇仍未完整支持**。CARD_LOST_BLOCK 的完整状态按 Aster 明确选卡和 LOST/STOLEN 目标口径；源数据要求 fraud 推断或其他原因的变体不因此完成。

## 可进一步编写的 4 个变体下界

- `BUDGET_TO_SCHEDULE_proposed`
- `FRAUD_PROTECTION_DISPUTE_9f6e6606bb`
- `NEW_RECIPIENT_TRANSFER_proposed`
- `PAYMENT_RISK_ESCALATION_proposed`

其中 3 个 Aster 提案与 1 个 TauIndian 流程簇在完成对应批次后具备最小原语。金额/币种、身份/隐私与断言仍需适配；不声称原上游行为评测已经运行。

## 原有 19 个 MISSING 的逐项处置

SCHEDULED_TRANSFER 预测到 SUPPORTED，SCHEDULE_CHANGE 只到 PARTIAL；其余以下 17 个继续 MISSING。DEFER 并非永远不做；部分涉及外部网络或不同领域，必须有独立价值与设计批准。

| 保持 MISSING 的族 | 理由 |
|---|---|
| TRANSFER_CANCELLATION | 只取消未到期计划不等于撤回已经提交/完成的即时转账；缺少可撤回结算窗口。 |
| COLLECT_OR_SPLIT | 收款请求、参与人和偿付状态是另一个产品，现阶段价值不及核心付款。 |
| FX_EXCHANGE | 可执行汇率、报价有效期和双币种结算均未设计；估值汇率不能交易。 |
| LOAN_QUOTE_SERVICE | 贷款偿付/提前结清等地区规则超出当前申请受理范围。 |
| ACCOUNT_OPEN_CLOSE | 开户资格、关户清算与账户体系另行评审，不为 benchmark 增加。 |
| DEPOSIT_CLOSURE | 需要定期存款本金/利息/罚息模型；当前基金持仓不等价。 |
| DEPOSIT_RENEWAL | 依赖尚无的定期存款及到期生命周期。 |
| RISK_ASSESSMENT | 问卷/评分/有效期缺少依据，独立于授权 risk policy。 |
| INVESTMENT_REDEMPTION | 份额、估值日、流动性、清算周期另行设计。 |
| CARD_ACTIVATION | 本批不发行真实或合成新卡；没有可安全激活的生命周期。 |
| CARD_REWARDS_SERVICE | 奖励账本和留存政策不是当前重点。 |
| CARD_DELIVERY | 只受理请求，无物流；不能让 request status 冒充 delivery status。 |
| RECURRING_CREATE | standing-order series/occurrence 暂缓；不复制 merchant subscription。 |
| RECURRING_MODIFY | 系列修改、下次日期与已执行 occurrence 需独立协议。 |
| SERVICE_ESCALATION | 域内 case 不等于通用客服/人工路由与 SLA。 |
| PROFILE_CHANGE | 真实联系方式/地址更新需验证和下游用途，首批不建立。 |
| DEPOSIT_REINVESTMENT | 依赖未接受的存款关闭/新开组合，不以投资认购替代。 |

完整 67 行投影见机器映射；原 B0 来源、候选簇和支持标签完全保留。

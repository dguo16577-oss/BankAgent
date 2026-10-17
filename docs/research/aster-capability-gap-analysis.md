# B0 — Aster 能力差距分析

检索日期：2026-09-29。脚本版本：b0.1；固定 commit、数据 SHA 与逐文件 SHA-256 见 [sources.yaml](../../research/banking-behaviors/sources.yaml)。脚本哈希及输入/输出计数见 [statistics.json](../../research/banking-behaviors/reports/statistics.json)。

筛选与去重：先读取原生任务/工具/评分结构，再按业务结果归一化；金额、身份、日期与异常处理留作变体。不同来源可共享同一族，单任务也可支持多个族。人工语义映射完整保存在脚本中，可复算但仍需评审。

## 当前应用核对结论

Customer 42 + Public 9 = 51 个合同操作均在实现矩阵标记 IMPLEMENTED_POSTGRESQL。能力清单还读取了实际 Java Service/Controller 和 Web feature 文件。支持表示本地演示业务实现和合理手动 UI 同时存在，不表示接入真实银行清算或已经重新完成整套运行时验收。

- 产品页申请已内嵌，登录携带原页面返回地址；不再把“进入个人中心”当作申请流程。申请只到 SUBMITTED，审批/发卡/放款未实现。
- Transfers 只有 CNY 即时出账和已有收款人；列表/search 不等于创建收款人。
- Cards 可冻结、解冻、四渠道开关；无数额限额、永久停卡、补卡或销卡。
- Recurring 可停止银行管理的未来扣款，detected-only 不可直接停止；不会取消商家合同。
- Wealth 风险档案只读、适当性检查和 CNY 认购可用；问卷、赎回和真实 NAV 不可用。
- Spending 支持自定义至 366 天窗口，不把“年度报表”一律写成全缺失；PDF/CSV 对账单交付和异常/重复检测才是缺口。
- 本次没有证据证明仍存在“API 已完成但申请 UI 强制跳个人中心”的旧问题。投资产品没有专门并排比较界面，但人可以分别查看详情；这属于体验改进候选，不自动要求新 API。

## PAYMENTS

| 族 | 来源证据 | 候选变体簇 | 现有后端原语 | UI | 缺失原语 | 新 API | DB 判断（设计前估计） | 授权适配 | Agent 价值 | 成本 | 建议 |
|---|---|---|---|---|---|---|---|---|---|---|---|
| NEW_RECIPIENT_TRANSFER | ASTER_GAP_HYPOTHESIS | 0 observed / 1 candidate | TRANSFER | PARTIAL | RECIPIENT_CREATE | 是：新执行原语（检测/报表另行设计） | 预计需要持久化生命周期；检测查询可能不需要新表 | 现有 session/CSRF/intent/幂等框架可复用；新资源授权必须显式扩展，不能复用 CARD_ACTION_INTENT grant | HIGH | MEDIUM | MUST_CONSIDER |
| SCHEDULED_TRANSFER | openbanking | 0 observed / 0 candidate | 无 | NONE | SCHEDULE_CREATE | 是：新执行原语（检测/报表另行设计） | 预计需要持久化生命周期；检测查询可能不需要新表 | 现有 session/CSRF/intent/幂等框架可复用；新资源授权必须显式扩展，不能复用 CARD_ACTION_INTENT grant | MEDIUM | HIGH | MUST_CONSIDER |
| SCHEDULE_CHANGE | agentdojo | 3 observed / 3 candidate | 无 | NONE | SCHEDULE_EDIT | 是：新执行原语（检测/报表另行设计） | 预计需要持久化生命周期；检测查询可能不需要新表 | 现有 session/CSRF/intent/幂等框架可复用；新资源授权必须显式扩展，不能复用 CARD_ACTION_INTENT grant | MEDIUM | HIGH | SHOULD_CONSIDER |
| TRANSFER_CANCELLATION | banking77 | 0 observed / 0 candidate | 无 | NONE | TRANSFER_CANCEL | 是：新执行原语（检测/报表另行设计） | 预计需要持久化生命周期；检测查询可能不需要新表 | 现有 session/CSRF/intent/幂等框架可复用；新资源授权必须显式扩展，不能复用 CARD_ACTION_INTENT grant | MEDIUM | HIGH | SHOULD_CONSIDER |
| COLLECT_OR_SPLIT | ASTER_GAP_HYPOTHESIS | 0 observed / 0 candidate | 无 | NONE | COLLECT_SPLIT | 是：新执行原语（检测/报表另行设计） | 预计需要持久化生命周期；检测查询可能不需要新表 | 现有 session/CSRF/intent/幂等框架可复用；新资源授权必须显式扩展，不能复用 CARD_ACTION_INTENT grant | MEDIUM | HIGH | OPTIONAL |
| OWN_ACCOUNT_MOVEMENT | tau_knowledge | 2 observed / 2 candidate | ACCOUNT_READ | PARTIAL | OWN_ACCOUNT_TRANSFER | 是：新执行原语（检测/报表另行设计） | 预计需要持久化生命周期；检测查询可能不需要新表 | 现有 session/CSRF/intent/幂等框架可复用；新资源授权必须显式扩展，不能复用 CARD_ACTION_INTENT grant | HIGH | MEDIUM | SHOULD_CONSIDER |
| FX_EXCHANGE | banking77 | 0 observed / 0 candidate | 无 | NONE | FX_EXECUTE | 是：新执行原语（检测/报表另行设计） | 预计需要持久化生命周期；检测查询可能不需要新表 | 现有 session/CSRF/intent/幂等框架可复用；新资源授权必须显式扩展，不能复用 CARD_ACTION_INTENT grant | MEDIUM | HIGH | OPTIONAL |
| LOAN_QUOTE_SERVICE | indic, tau_indian | 59 observed / 0 candidate | 无 | NONE | LOAN_SERVICING | 是：新执行原语（检测/报表另行设计） | 预计需要持久化生命周期；检测查询可能不需要新表 | 现有 session/CSRF/intent/幂等框架可复用；新资源授权必须显式扩展，不能复用 CARD_ACTION_INTENT grant | MEDIUM | HIGH | OUT_OF_SCOPE |
| ACCOUNT_OPEN_CLOSE | banking77, tau_knowledge | 12 observed / 12 candidate | 无 | NONE | ACCOUNT_LIFECYCLE | 是：新执行原语（检测/报表另行设计） | 预计需要持久化生命周期；检测查询可能不需要新表 | 现有 session/CSRF/intent/幂等框架可复用；新资源授权必须显式扩展，不能复用 CARD_ACTION_INTENT grant | MEDIUM | HIGH | OPTIONAL |
| PAYMENT_RISK_ESCALATION | ASTER_GAP_HYPOTHESIS | 0 observed / 1 candidate | TRANSFER | PARTIAL | PAYMENT_RISK | 是：新执行原语（检测/报表另行设计） | 预计需要持久化生命周期；检测查询可能不需要新表 | 现有 session/CSRF/intent/幂等框架可复用；新资源授权必须显式扩展，不能复用 CARD_ACTION_INTENT grant | HIGH | HIGH | MUST_CONSIDER |

## SPENDING_AND_TRANSACTIONS

| 族 | 来源证据 | 候选变体簇 | 现有后端原语 | UI | 缺失原语 | 新 API | DB 判断（设计前估计） | 授权适配 | Agent 价值 | 成本 | 建议 |
|---|---|---|---|---|---|---|---|---|---|---|---|
| STATEMENT_REQUEST | indic, tau_indian | 13 observed / 13 candidate | TRANSACTION_READ | PARTIAL | STATEMENT_EXPORT | 是：新执行原语（检测/报表另行设计） | 预计需要持久化生命周期；检测查询可能不需要新表 | 现有 session/CSRF/intent/幂等框架可复用；新资源授权必须显式扩展，不能复用 CARD_ACTION_INTENT grant | HIGH | MEDIUM | SHOULD_CONSIDER |
| TRANSACTION_DISPUTE | banking77, indic, tau_indian, tau_knowledge | 37 observed / 37 candidate | TRANSACTION_READ | PARTIAL | DISPUTE | 是：新执行原语（检测/报表另行设计） | 预计需要持久化生命周期；检测查询可能不需要新表 | 现有 session/CSRF/intent/幂等框架可复用；新资源授权必须显式扩展，不能复用 CARD_ACTION_INTENT grant | HIGH | HIGH | MUST_CONSIDER |
| REFUND_TRACKING | banking77 | 0 observed / 0 candidate | TRANSACTION_READ | PARTIAL | REFUND | 是：新执行原语（检测/报表另行设计） | 预计需要持久化生命周期；检测查询可能不需要新表 | 现有 session/CSRF/intent/幂等框架可复用；新资源授权必须显式扩展，不能复用 CARD_ACTION_INTENT grant | HIGH | HIGH | SHOULD_CONSIDER |
| DUPLICATE_CHARGE | banking77 | 0 observed / 0 candidate | TRANSACTION_READ | PARTIAL | ANOMALY_DETECT, DISPUTE | 是：新执行原语（检测/报表另行设计） | 预计需要持久化生命周期；检测查询可能不需要新表 | 现有 session/CSRF/intent/幂等框架可复用；新资源授权必须显式扩展，不能复用 CARD_ACTION_INTENT grant | HIGH | HIGH | MUST_CONSIDER |
| UNRECOGNIZED_CHARGE | banking77 | 0 observed / 0 candidate | TRANSACTION_READ | PARTIAL | DISPUTE | 是：新执行原语（检测/报表另行设计） | 预计需要持久化生命周期；检测查询可能不需要新表 | 现有 session/CSRF/intent/幂等框架可复用；新资源授权必须显式扩展，不能复用 CARD_ACTION_INTENT grant | HIGH | HIGH | MUST_CONSIDER |

## WEALTH

| 族 | 来源证据 | 候选变体簇 | 现有后端原语 | UI | 缺失原语 | 新 API | DB 判断（设计前估计） | 授权适配 | Agent 价值 | 成本 | 建议 |
|---|---|---|---|---|---|---|---|---|---|---|---|
| DEPOSIT_BOOKING | indic, tau_indian | 94 observed / 0 candidate | ACCOUNT_READ | PARTIAL | DEPOSIT_BOOK | 是：新执行原语（检测/报表另行设计） | 预计需要持久化生命周期；检测查询可能不需要新表 | 现有 session/CSRF/intent/幂等框架可复用；新资源授权必须显式扩展，不能复用 CARD_ACTION_INTENT grant | HIGH | HIGH | OPTIONAL |
| DEPOSIT_CLOSURE | indic, tau_indian | 24 observed / 0 candidate | 无 | NONE | DEPOSIT_CLOSE | 是：新执行原语（检测/报表另行设计） | 预计需要持久化生命周期；检测查询可能不需要新表 | 现有 session/CSRF/intent/幂等框架可复用；新资源授权必须显式扩展，不能复用 CARD_ACTION_INTENT grant | MEDIUM | HIGH | OPTIONAL |
| DEPOSIT_RENEWAL | indic, tau_indian | 14 observed / 0 candidate | 无 | NONE | DEPOSIT_RENEW | 是：新执行原语（检测/报表另行设计） | 预计需要持久化生命周期；检测查询可能不需要新表 | 现有 session/CSRF/intent/幂等框架可复用；新资源授权必须显式扩展，不能复用 CARD_ACTION_INTENT grant | MEDIUM | MEDIUM | OPTIONAL |
| RISK_ASSESSMENT | ASTER_GAP_HYPOTHESIS | 0 observed / 0 candidate | 无 | NONE | RISK_ASSESS | 是：新执行原语（检测/报表另行设计） | 预计需要持久化生命周期；检测查询可能不需要新表 | 现有 session/CSRF/intent/幂等框架可复用；新资源授权必须显式扩展，不能复用 CARD_ACTION_INTENT grant | MEDIUM | MEDIUM | MUST_CONSIDER |
| INVESTMENT_REDEMPTION | ASTER_GAP_HYPOTHESIS | 0 observed / 0 candidate | 无 | NONE | REDEMPTION | 是：新执行原语（检测/报表另行设计） | 预计需要持久化生命周期；检测查询可能不需要新表 | 现有 session/CSRF/intent/幂等框架可复用；新资源授权必须显式扩展，不能复用 CARD_ACTION_INTENT grant | MEDIUM | HIGH | SHOULD_CONSIDER |
| DEPOSIT_REINVESTMENT | tau_indian | 1 observed / 0 candidate | 无 | NONE | DEPOSIT_CLOSE, DEPOSIT_BOOK | 是：新执行原语（检测/报表另行设计） | 预计需要持久化生命周期；检测查询可能不需要新表 | 现有 session/CSRF/intent/幂等框架可复用；新资源授权必须显式扩展，不能复用 CARD_ACTION_INTENT grant | HIGH | HIGH | OPTIONAL |

## CARDS

| 族 | 来源证据 | 候选变体簇 | 现有后端原语 | UI | 缺失原语 | 新 API | DB 判断（设计前估计） | 授权适配 | Agent 价值 | 成本 | 建议 |
|---|---|---|---|---|---|---|---|---|---|---|---|
| CREDIT_CARD_REPAYMENT | tau_knowledge | 4 observed / 4 candidate | CARD_READ | PARTIAL | CARD_REPAY | 是：新执行原语（检测/报表另行设计） | 预计需要持久化生命周期；检测查询可能不需要新表 | 现有 session/CSRF/intent/幂等框架可复用；新资源授权必须显式扩展，不能复用 CARD_ACTION_INTENT grant | HIGH | HIGH | SHOULD_CONSIDER |
| CARD_CLOSURE | tau_knowledge | 13 observed / 13 candidate | CARD_READ | PARTIAL | CARD_CLOSE | 是：新执行原语（检测/报表另行设计） | 预计需要持久化生命周期；检测查询可能不需要新表 | 现有 session/CSRF/intent/幂等框架可复用；新资源授权必须显式扩展，不能复用 CARD_ACTION_INTENT grant | HIGH | HIGH | OPTIONAL |
| CARD_LOST_BLOCK | banking77, indic, tau_indian | 13 observed / 13 candidate | CARD_READ | PARTIAL | CARD_BLOCK | 是：新执行原语（检测/报表另行设计） | 预计需要持久化生命周期；检测查询可能不需要新表 | 现有 session/CSRF/intent/幂等框架可复用；新资源授权必须显式扩展，不能复用 CARD_ACTION_INTENT grant | HIGH | MEDIUM | MUST_CONSIDER |
| CARD_REPLACEMENT | banking77, indic, tau_indian, tau_knowledge | 27 observed / 27 candidate | CARD_READ | PARTIAL | CARD_REPLACE | 是：新执行原语（检测/报表另行设计） | 预计需要持久化生命周期；检测查询可能不需要新表 | 现有 session/CSRF/intent/幂等框架可复用；新资源授权必须显式扩展，不能复用 CARD_ACTION_INTENT grant | HIGH | HIGH | SHOULD_CONSIDER |
| CARD_LIMIT_CHANGE | banking77, tau_knowledge | 6 observed / 6 candidate | CARD_READ | PARTIAL | CARD_LIMIT | 是：新执行原语（检测/报表另行设计） | 预计需要持久化生命周期；检测查询可能不需要新表 | 现有 session/CSRF/intent/幂等框架可复用；新资源授权必须显式扩展，不能复用 CARD_ACTION_INTENT grant | HIGH | HIGH | SHOULD_CONSIDER |
| CARD_ACTIVATION | banking77, tau_knowledge | 2 observed / 2 candidate | 无 | NONE | CARD_ACTIVATE | 是：新执行原语（检测/报表另行设计） | 预计需要持久化生命周期；检测查询可能不需要新表 | 现有 session/CSRF/intent/幂等框架可复用；新资源授权必须显式扩展，不能复用 CARD_ACTION_INTENT grant | MEDIUM | HIGH | OPTIONAL |
| CARD_REWARDS_SERVICE | tau_knowledge | 8 observed / 0 candidate | 无 | NONE | REWARDS | 是：新执行原语（检测/报表另行设计） | 预计需要持久化生命周期；检测查询可能不需要新表 | 现有 session/CSRF/intent/幂等框架可复用；新资源授权必须显式扩展，不能复用 CARD_ACTION_INTENT grant | MEDIUM | HIGH | OPTIONAL |
| CARD_DELIVERY | banking77 | 0 observed / 0 candidate | 无 | NONE | CARD_REPLACE | 是：新执行原语（检测/报表另行设计） | 预计需要持久化生命周期；检测查询可能不需要新表 | 现有 session/CSRF/intent/幂等框架可复用；新资源授权必须显式扩展，不能复用 CARD_ACTION_INTENT grant | MEDIUM | HIGH | SHOULD_CONSIDER |

## RECURRING_AND_DIRECT_DEBIT

| 族 | 来源证据 | 候选变体簇 | 现有后端原语 | UI | 缺失原语 | 新 API | DB 判断（设计前估计） | 授权适配 | Agent 价值 | 成本 | 建议 |
|---|---|---|---|---|---|---|---|---|---|---|---|
| RECURRING_CREATE | agentdojo, banking77, openbanking | 1 observed / 1 candidate | 无 | NONE | RECURRING_CREATE | 是：新执行原语（检测/报表另行设计） | 预计需要持久化生命周期；检测查询可能不需要新表 | 现有 session/CSRF/intent/幂等框架可复用；新资源授权必须显式扩展，不能复用 CARD_ACTION_INTENT grant | MEDIUM | HIGH | SHOULD_CONSIDER |
| RECURRING_MODIFY | ASTER_GAP_HYPOTHESIS | 0 observed / 1 candidate | 无 | NONE | RECURRING_EDIT | 是：新执行原语（检测/报表另行设计） | 预计需要持久化生命周期；检测查询可能不需要新表 | 现有 session/CSRF/intent/幂等框架可复用；新资源授权必须显式扩展，不能复用 CARD_ACTION_INTENT grant | MEDIUM | HIGH | SHOULD_CONSIDER |
| RECURRING_DETECTION | ASTER_GAP_HYPOTHESIS | 0 observed / 0 candidate | TRANSACTION_READ | PARTIAL | PATTERN_DETECT | 是：新执行原语（检测/报表另行设计） | 预计需要持久化生命周期；检测查询可能不需要新表 | 现有 session/CSRF/intent/幂等框架可复用；新资源授权必须显式扩展，不能复用 CARD_ACTION_INTENT grant | HIGH | HIGH | OPTIONAL |

## CROSS_DOMAIN

| 族 | 来源证据 | 候选变体簇 | 现有后端原语 | UI | 缺失原语 | 新 API | DB 判断（设计前估计） | 授权适配 | Agent 价值 | 成本 | 建议 |
|---|---|---|---|---|---|---|---|---|---|---|---|
| SERVICE_ESCALATION | banking77, indic, tau_indian, tau_knowledge | 46 observed / 0 candidate | 无 | NONE | SERVICE_CASE | 是：新执行原语（检测/报表另行设计） | 预计需要持久化生命周期；检测查询可能不需要新表 | 现有 session/CSRF/intent/幂等框架可复用；新资源授权必须显式扩展，不能复用 CARD_ACTION_INTENT grant | MEDIUM | MEDIUM | SHOULD_CONSIDER |
| PROFILE_CHANGE | agentdojo, banking77, tau_knowledge | 2 observed / 0 candidate | 无 | NONE | PROFILE_UPDATE | 是：新执行原语（检测/报表另行设计） | 预计需要持久化生命周期；检测查询可能不需要新表 | 现有 session/CSRF/intent/幂等框架可复用；新资源授权必须显式扩展，不能复用 CARD_ACTION_INTENT grant | MEDIUM | MEDIUM | OPTIONAL |
| BILL_TO_TRANSFER | agentdojo | 1 observed / 1 candidate | TRANSFER | PARTIAL | BILL_DOCUMENT, RECIPIENT_CREATE | 是：新执行原语（检测/报表另行设计） | 预计需要持久化生命周期；检测查询可能不需要新表 | 现有 session/CSRF/intent/幂等框架可复用；新资源授权必须显式扩展，不能复用 CARD_ACTION_INTENT grant | HIGH | MEDIUM | MUST_CONSIDER |
| FRAUD_PROTECTION_DISPUTE | tau_indian | 1 observed / 1 candidate | TRANSACTION_READ | PARTIAL | CARD_BLOCK, DISPUTE | 是：新执行原语（检测/报表另行设计） | 预计需要持久化生命周期；检测查询可能不需要新表 | 现有 session/CSRF/intent/幂等框架可复用；新资源授权必须显式扩展，不能复用 CARD_ACTION_INTENT grant | HIGH | HIGH | MUST_CONSIDER |
| ACCOUNT_TO_DEPOSIT | tau_indian | 2 observed / 0 candidate | ACCOUNT_READ | PARTIAL | DEPOSIT_BOOK | 是：新执行原语（检测/报表另行设计） | 预计需要持久化生命周期；检测查询可能不需要新表 | 现有 session/CSRF/intent/幂等框架可复用；新资源授权必须显式扩展，不能复用 CARD_ACTION_INTENT grant | HIGH | HIGH | OPTIONAL |
| RELOCATION_PAYMENTS | agentdojo | 1 observed / 0 candidate | TRANSACTION_READ, TRANSFER | PARTIAL | PROFILE_UPDATE, SCHEDULE_EDIT | 是：新执行原语（检测/报表另行设计） | 预计需要持久化生命周期；检测查询可能不需要新表 | 现有 session/CSRF/intent/幂等框架可复用；新资源授权必须显式扩展，不能复用 CARD_ACTION_INTENT grant | HIGH | HIGH | SHOULD_CONSIDER |
| BUDGET_TO_SCHEDULE | ASTER_COMPOSED | 0 observed / 1 candidate | SPENDING, ACCOUNT_READ | PARTIAL | SCHEDULE_CREATE | 是：新执行原语（检测/报表另行设计） | 预计需要持久化生命周期；检测查询可能不需要新表 | 现有 session/CSRF/intent/幂等框架可复用；新资源授权必须显式扩展，不能复用 CARD_ACTION_INTENT grant | HIGH | HIGH | MUST_CONSIDER |

## 缺口原语清单（不把场景数当 API 数）

| 原语 | 域 | 状态 | 建议 | 成本 | 定义 |
|---|---|---|---|---|---|
| CARD_CLOSE | CARDS | MISSING | OPTIONAL | HIGH | Voluntary card-account closure, settlement and retention policy; not lost/stolen blocking |
| CARD_REPAY | CARDS | MISSING | SHOULD_CONSIDER | HIGH | Credit balance repayment and liability ledger; not a generic outgoing transfer |
| RECIPIENT_CREATE | PAYMENTS | MISSING | MUST_CONSIDER | MEDIUM | Owned recipient creation and validation |
| SCHEDULE_CREATE | PAYMENTS | MISSING | MUST_CONSIDER | HIGH | Dated instruction plus execution lifecycle, not just a date field |
| SCHEDULE_EDIT | PAYMENTS | MISSING | SHOULD_CONSIDER | HIGH | Versioned schedule amendment and cancellation |
| TRANSFER_CANCEL | PAYMENTS | MISSING | SHOULD_CONSIDER | HIGH | Define cancellable pre-settlement state; completed transfer cannot simply be undone |
| COLLECT_SPLIT | PAYMENTS | MISSING | OPTIONAL | HIGH | Collection request, participants and settlement status |
| PAYMENT_RISK | PAYMENTS | MISSING | MUST_CONSIDER | HIGH | Risk decision and payment-bound authorization; current grants are card-only |
| OWN_ACCOUNT_TRANSFER | PAYMENTS | MISSING | SHOULD_CONSIDER | MEDIUM | Atomically debit/credit two owned accounts |
| FX_EXECUTE | PAYMENTS | MISSING | OPTIONAL | HIGH | Executable quote/expiry/settlement; display rate is not an FX engine |
| STATEMENT_EXPORT | SPENDING_AND_TRANSACTIONS | MISSING | SHOULD_CONSIDER | MEDIUM | Downloadable statement with immutable reporting boundaries |
| DISPUTE | SPENDING_AND_TRANSACTIONS | MISSING | MUST_CONSIDER | HIGH | Transaction-linked dispute intake, evidence and status; not automatic refund |
| REFUND | SPENDING_AND_TRANSACTIONS | MISSING | SHOULD_CONSIDER | HIGH | Refund status and controlled refund posting |
| ANOMALY_DETECT | SPENDING_AND_TRANSACTIONS | MISSING | SHOULD_CONSIDER | HIGH | Explainable suspicious/duplicate detection; never auto-mutate solely from inference |
| CARD_BLOCK | CARDS | MISSING | MUST_CONSIDER | MEDIUM | Permanent lost/stolen lifecycle distinct from freeze |
| CARD_REPLACE | CARDS | MISSING | SHOULD_CONSIDER | HIGH | Replacement request and lifecycle, linked to old card |
| CARD_LIMIT | CARDS | MISSING | SHOULD_CONSIDER | HIGH | Versioned numeric limits and risk-based step-up |
| CARD_ACTIVATE | CARDS | MISSING | OPTIONAL | HIGH | Issuance/activation identity and lifecycle |
| CARD_PIN | CARDS | OUT_OF_SCOPE | OUT_OF_SCOPE | HIGH | PIN changes require specialist secure handling; not plain text tools |
| RECURRING_CREATE | RECURRING_AND_DIRECT_DEBIT | MISSING | SHOULD_CONSIDER | HIGH | Create mandate/standing order with scope and execution lifecycle |
| RECURRING_EDIT | RECURRING_AND_DIRECT_DEBIT | MISSING | SHOULD_CONSIDER | HIGH | Modify/restart plan with review and version checks |
| PATTERN_DETECT | RECURRING_AND_DIRECT_DEBIT | MISSING | OPTIONAL | HIGH | Actual transaction-based recurring detector; current records are seeded |
| DEPOSIT_BOOK | WEALTH | MISSING | OPTIONAL | HIGH | Fixed/recurring deposit terms and maturity; not mutual-fund purchase |
| DEPOSIT_CLOSE | WEALTH | MISSING | OPTIONAL | HIGH | Premature closure quote, penalty and accrued interest |
| DEPOSIT_RENEW | WEALTH | MISSING | OPTIONAL | MEDIUM | Deposit renewal instructions |
| REDEMPTION | WEALTH | MISSING | SHOULD_CONSIDER | HIGH | Units/valuation/liquidity/settlement; no strong direct reuse evidence in selected sources |
| RISK_ASSESS | WEALTH | MISSING | MUST_CONSIDER | MEDIUM | Manual risk questionnaire and versioned assessment update |
| LOAN_SERVICING | PAYMENTS | OUT_OF_SCOPE | OUT_OF_SCOPE | HIGH | Amortization, payoff/foreclosure and collateral; intake alone does not provide it |
| CHEQUE | PAYMENTS | OUT_OF_SCOPE | OUT_OF_SCOPE | HIGH | Cheque clearing/book/stop infrastructure is not in current product |
| PROFILE_UPDATE | CROSS_DOMAIN | MISSING | OPTIONAL | MEDIUM | Verified contact/address updates |
| SERVICE_CASE | CROSS_DOMAIN | MISSING | SHOULD_CONSIDER | MEDIUM | Complaint/human handoff case and status |
| REWARDS | CARDS | MISSING | OPTIONAL | HIGH | Rewards ledger, adjustments and fee retention |
| ACCOUNT_LIFECYCLE | PAYMENTS | MISSING | OPTIONAL | HIGH | Account open/close with eligibility and settlement rules |
| INSURANCE | WEALTH | OUT_OF_SCOPE | OUT_OF_SCOPE | HIGH | Insurance underwriting/claims, outside six-domain execution scope |
| REFERRAL | CROSS_DOMAIN | OUT_OF_SCOPE | OUT_OF_SCOPE | MEDIUM | Referral campaign eligibility and payout |
| BILL_DOCUMENT | PAYMENTS | MISSING | OPTIONAL | MEDIUM | Trusted bill intake plus untrusted-text boundary |
| SECURITY_EVAL | CROSS_DOMAIN | OUT_OF_SCOPE | OUT_OF_SCOPE | MEDIUM | Future agent prompt-injection evaluation, not a missing manual product |
| KNOWLEDGE_AGENT | CROSS_DOMAIN | OUT_OF_SCOPE | OUT_OF_SCOPE | HIGH | Future sourced retrieval/procedure reasoning; do not build Agent in B0 |
| MARKET_RESEARCH | WEALTH | OUT_OF_SCOPE | OUT_OF_SCOPE | HIGH | External market/company data tools; not customer banking execution |

归一化 67 个族，依赖 58 个不同能力原语；其中现有 19、缺失 31、当前范围外 8。候选变体簇 498 个不是同样数量的新功能。

## 建议的下一步顺序（本轮不实施）

1. 评审 B0 语义映射，尤其“永久停卡/补卡/争议”和“计划付款”的产品边界。逐族确认人能否完成底层动作。
2. 优先考虑收款人创建、计划付款生命周期、交易争议收件与状态、遗失卡保护/补卡。新增能力必须同时给出手动 Web 流程。
3. 补齐风险档案评估，再决定是否扩展投资生命周期；当前外部 Wealth 数据明显弱于 Cards/Recurring，宜自行编写适当性与资金一致性场景。
4. 高风险付款若需要 Step-Up，先设计付款资源绑定，不借用只服务 Card Intent 的授权。Protective freeze/stop 不应因安全测试数量而被强制升级认证。
5. 后续才能编写可执行 behavior cases 和 Agent composite；继续区分正常、鲁棒性、安全、知识层。

不要为了数据集扩张支票、印度专属 UPI、保险、金抵押贷款、信用局后台操作、PIN/秘密收集、奖励账本或市场数据订阅。不要在 B0 实现 Agent、RAG、LLM 或改 frozen API。

所有 DB/API 成本都是初步架构判断，不是迁移方案。未进行活数据库变更、真实交易或新应用功能开发。

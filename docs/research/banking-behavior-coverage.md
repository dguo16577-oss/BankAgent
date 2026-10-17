# B0 — 六域行为覆盖

检索日期：2026-09-29。脚本版本：b0.1；固定 commit、数据 SHA 与逐文件 SHA-256 见 [sources.yaml](../../research/banking-behaviors/sources.yaml)。脚本哈希及输入/输出计数见 [statistics.json](../../research/banking-behaviors/reports/statistics.json)。

筛选与去重：先读取原生任务/工具/评分结构，再按业务结果归一化；金额、身份、日期与异常处理留作变体。不同来源可共享同一族，单任务也可支持多个族。人工语义映射完整保存在脚本中，可复算但仍需评审。

## 数量口径

| 输入/输出 | 数量/含义 |
|---|---|
| 银行任务/案例 | 1912 |
| 另列 AgentDojo 攻击目标 | 9 |
| 另列 BANKING77 语言样本 | 13083 |
| 另列 FinToolBench 研究查询（不纳入核心） | 295 |
| 另列规范操作 | 89 |
| 归一化族（含排除项与 Aster 提案） | 67 |
| 推荐候选族 | 45 |
| 候选变体簇（不是最终测试用例） | 498 |
| 所需能力原语 | 58 |

## 六域汇总

非语言记录列包含安全/研究记录，按来源 ID 去重；一个原始任务可能跨域，六行不能直接相加。语言样本单列，不代表可执行业务。

| 域 | 原始非语言记录 | 语言样本 | 族 | DIRECT | ADAPTABLE | PARTIAL | 支持 | 部分 | 缺失 | 排除/评测层 | 跨来源重复族 | 候选变体簇 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| PAYMENTS | 444 | 4363 | 14 | 1 | 10 | 1 | 3 | 3 | 7 | 1 | 5 | 80 |
| SPENDING_AND_TRANSACTIONS | 215 | 2319 | 7 | 2 | 5 | 0 | 2 | 5 | 0 | 0 | 3 | 86 |
| WEALTH | 919 | 0 | 11 | 0 | 1 | 4 | 3 | 1 | 5 | 2 | 5 | 27 |
| CARDS | 303 | 2966 | 14 | 2 | 9 | 2 | 5 | 5 | 3 | 1 | 9 | 143 |
| RECURRING_AND_DIRECT_DEBIT | 106 | 167 | 5 | 1 | 3 | 1 | 2 | 1 | 2 | 0 | 1 | 18 |
| CROSS_DOMAIN | 376 | 3268 | 16 | 0 | 11 | 4 | 4 | 5 | 2 | 5 | 4 | 144 |

## 族矩阵

✓ 表示主域；次域在 JSONL 中保留。支持状态按 Aster 目标语义评估，不意味着可直接执行上游工具。安全/知识专属条目 OUT_OF_SCOPE 指当前手动产品范围，不意味着没有研究价值。

| Family | Payments | Spending/Transactions | Wealth | Cards | Recurring/DD | Cross | Read | Mutation | Multi-tool | Clarification | Failure | Step-up/Risk | Security | Knowledge/Policy | Aster | Manual UI | Sources |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| UNSUPPORTED_TOOL_REFUSAL |  |  |  |  |  | ✓ | ✓ |  |  | NONE | NONE | NONE/NORMAL |  |  | OUT_OF_SCOPE | NO/NOT_REQUIRED | indic |
| CREDIT_CARD_REPAYMENT |  |  |  | ✓ |  |  | ✓ | ✓ | ✓ | NONE | NONE | CONFIRMATION/NORMAL |  | ✓ | PARTIALLY_SUPPORTED | YES/PARTIAL | tau_knowledge |
| CARD_CLOSURE |  |  |  | ✓ |  |  | ✓ | ✓ | ✓ | NONE | NONE | CONFIRMATION/NORMAL |  | ✓ | PARTIALLY_SUPPORTED | YES/PARTIAL | tau_knowledge |
| ACCOUNT_BALANCE | ✓ |  |  |  |  |  | ✓ |  |  | AMBIGUITY_RESOLUTION | TOOL_FAILURE,INVALID_INPUT,OUT_OF_SCOPE | NONE/NORMAL |  | ✓ | SUPPORTED | YES/ALL_PRIMITIVES | banking77, indic, tau_indian, tau_knowledge |
| RECIPIENT_TRANSFER | ✓ |  |  |  |  |  | ✓ | ✓ | ✓ | NONE | NONE | CONFIRMATION/NORMAL |  | ✓ | SUPPORTED | YES/ALL_PRIMITIVES | banking77, tau_knowledge |
| NEW_RECIPIENT_TRANSFER | ✓ |  |  |  |  |  | ✓ | ✓ | ✓ | NONE | NONE | CONFIRMATION/NORMAL |  |  | PARTIALLY_SUPPORTED | YES/PARTIAL | ASTER_GAP_HYPOTHESIS |
| SCHEDULED_TRANSFER | ✓ |  |  |  |  |  |  | ✓ |  | NONE | NONE | CONFIRMATION/NORMAL |  |  | MISSING | YES/NONE | openbanking |
| SCHEDULE_CHANGE | ✓ |  |  |  |  |  |  | ✓ |  | NONE | NONE | CONFIRMATION/NORMAL |  |  | MISSING | YES/NONE | agentdojo |
| TRANSFER_CANCELLATION | ✓ |  |  |  |  |  |  | ✓ |  | NONE | NONE | CONFIRMATION/NORMAL |  |  | MISSING | YES/NONE | banking77 |
| COLLECT_OR_SPLIT | ✓ |  |  |  |  |  |  | ✓ |  | NONE | NONE | CONFIRMATION/NORMAL |  |  | MISSING | YES/NONE | ASTER_GAP_HYPOTHESIS |
| OWN_ACCOUNT_MOVEMENT | ✓ |  |  |  |  |  | ✓ | ✓ | ✓ | NONE | NONE | CONFIRMATION/NORMAL |  | ✓ | PARTIALLY_SUPPORTED | YES/PARTIAL | tau_knowledge |
| FX_EXCHANGE | ✓ |  |  |  |  |  |  | ✓ |  | NONE | NONE | CONFIRMATION/NORMAL |  |  | MISSING | YES/NONE | banking77 |
| PAYMENT_STATUS | ✓ |  |  |  |  |  | ✓ |  |  | NONE | NONE | NONE/NORMAL |  |  | SUPPORTED | YES/ALL_PRIMITIVES | banking77 |
| LOAN_QUOTE_SERVICE | ✓ |  |  |  |  |  |  | ✓ |  | AMBIGUITY_RESOLUTION | TOOL_FAILURE,INVALID_INPUT,OUT_OF_SCOPE | CONFIRMATION/NORMAL |  |  | MISSING | YES/NONE | indic, tau_indian |
| CHEQUE_SERVICE | ✓ |  |  |  |  |  |  | ✓ |  | AMBIGUITY_RESOLUTION | TOOL_FAILURE,INVALID_INPUT,INELIGIBLE,OUT_OF_SCOPE | CONFIRMATION/NORMAL |  | ✓ | OUT_OF_SCOPE | YES/NONE | banking77, indic, tau_indian, tau_knowledge |
| ACCOUNT_OPEN_CLOSE | ✓ |  |  |  |  |  |  | ✓ |  | NONE | NONE | CONFIRMATION/NORMAL |  | ✓ | MISSING | YES/NONE | banking77, tau_knowledge |
| TRANSACTION_SEARCH |  | ✓ |  |  |  |  | ✓ |  |  | AMBIGUITY_RESOLUTION | TOOL_FAILURE,INVALID_INPUT,OUT_OF_SCOPE | NONE/NORMAL |  | ✓ | SUPPORTED | YES/ALL_PRIMITIVES | agentdojo, indic, tau_indian, tau_knowledge |
| SPENDING_REPORT |  | ✓ |  |  |  |  | ✓ |  |  | NONE | NONE | NONE/NORMAL |  |  | SUPPORTED | YES/ALL_PRIMITIVES | agentdojo |
| STATEMENT_REQUEST |  | ✓ |  |  |  |  | ✓ | ✓ | ✓ | AMBIGUITY_RESOLUTION | INVALID_INPUT,INELIGIBLE,OUT_OF_SCOPE | CONFIRMATION/NORMAL |  |  | PARTIALLY_SUPPORTED | YES/PARTIAL | indic, tau_indian |
| TRANSACTION_DISPUTE |  | ✓ |  |  |  |  | ✓ | ✓ | ✓ | AMBIGUITY_RESOLUTION | INVALID_INPUT,INELIGIBLE | CONFIRMATION/NORMAL |  | ✓ | PARTIALLY_SUPPORTED | YES/PARTIAL | banking77, indic, tau_indian, tau_knowledge |
| REFUND_TRACKING |  | ✓ |  |  |  |  | ✓ | ✓ | ✓ | NONE | NONE | CONFIRMATION/NORMAL |  |  | PARTIALLY_SUPPORTED | YES/PARTIAL | banking77 |
| DUPLICATE_CHARGE |  | ✓ |  |  |  |  | ✓ | ✓ | ✓ | NONE | NONE | CONFIRMATION/NORMAL |  |  | PARTIALLY_SUPPORTED | YES/PARTIAL | banking77 |
| UNRECOGNIZED_CHARGE |  | ✓ |  |  |  |  | ✓ | ✓ | ✓ | NONE | NONE | CONFIRMATION/NORMAL |  |  | PARTIALLY_SUPPORTED | YES/PARTIAL | banking77 |
| DEPOSIT_BOOKING |  |  | ✓ |  |  |  | ✓ | ✓ | ✓ | AMBIGUITY_RESOLUTION | TOOL_FAILURE,INVALID_INPUT,INELIGIBLE,INSUFFICIENT_FUNDS,OUT_OF_SCOPE | CONFIRMATION/NORMAL |  |  | PARTIALLY_SUPPORTED | YES/PARTIAL | indic, tau_indian |
| DEPOSIT_CLOSURE |  |  | ✓ |  |  |  |  | ✓ |  | AMBIGUITY_RESOLUTION | TOOL_FAILURE,INVALID_INPUT,INELIGIBLE,OUT_OF_SCOPE | CONFIRMATION/NORMAL |  |  | MISSING | YES/NONE | indic, tau_indian |
| DEPOSIT_RENEWAL |  |  | ✓ |  |  |  |  | ✓ |  | AMBIGUITY_RESOLUTION | INVALID_INPUT,OUT_OF_SCOPE | CONFIRMATION/NORMAL |  |  | MISSING | YES/NONE | indic, tau_indian |
| WEALTH_DISCOVERY |  |  | ✓ |  |  |  | ✓ |  | ✓ | AMBIGUITY_RESOLUTION | TOOL_FAILURE,INVALID_INPUT,OUT_OF_SCOPE | NONE/NORMAL |  |  | SUPPORTED | YES/ALL_PRIMITIVES | indic, tau_indian |
| INVESTMENT_PURCHASE |  |  | ✓ |  |  |  | ✓ | ✓ | ✓ | NONE | NONE | CONFIRMATION/NORMAL |  |  | SUPPORTED | YES/ALL_PRIMITIVES | ASTER_GAP_HYPOTHESIS |
| PORTFOLIO_QUERY |  |  | ✓ |  |  |  | ✓ |  |  | NONE | NONE | NONE/NORMAL |  |  | SUPPORTED | YES/ALL_PRIMITIVES | ASTER_GAP_HYPOTHESIS |
| RISK_ASSESSMENT |  |  | ✓ |  |  |  |  | ✓ |  | NONE | NONE | CONFIRMATION/NORMAL |  |  | MISSING | YES/NONE | ASTER_GAP_HYPOTHESIS |
| INVESTMENT_REDEMPTION |  |  | ✓ |  |  |  |  | ✓ |  | NONE | NONE | CONFIRMATION/NORMAL |  |  | MISSING | YES/NONE | ASTER_GAP_HYPOTHESIS |
| INSURANCE_SERVICE |  |  | ✓ |  |  |  |  | ✓ |  | REQUIRED | TOOL_FAILURE,INVALID_INPUT,OUT_OF_SCOPE | CONFIRMATION/NORMAL |  |  | OUT_OF_SCOPE | YES/NONE | indic, tau_indian |
| CARD_DETAILS |  |  |  | ✓ |  |  | ✓ |  |  | AMBIGUITY_RESOLUTION | TOOL_FAILURE,INVALID_INPUT,OUT_OF_SCOPE | NONE/NORMAL |  | ✓ | SUPPORTED | YES/ALL_PRIMITIVES | banking77, indic, tau_indian, tau_knowledge |
| CARD_FREEZE |  |  |  | ✓ |  |  | ✓ | ✓ | ✓ | REQUIRED | TOOL_FAILURE,INVALID_INPUT,INELIGIBLE,OUT_OF_SCOPE | CONFIRMATION/NORMAL |  | ✓ | SUPPORTED | YES/ALL_PRIMITIVES | indic, tau_indian, tau_knowledge |
| CARD_UNFREEZE |  |  |  | ✓ |  |  | ✓ | ✓ | ✓ | NONE | NONE | STEP_UP/ELEVATED |  | ✓ | SUPPORTED | YES/ALL_PRIMITIVES | tau_knowledge |
| CARD_CONTROLS |  |  |  | ✓ |  |  | ✓ | ✓ | ✓ | AMBIGUITY_RESOLUTION | INVALID_INPUT | STEP_UP/ELEVATED |  |  | SUPPORTED | YES/ALL_PRIMITIVES | banking77, indic, tau_indian |
| CARD_LOST_BLOCK |  |  |  | ✓ |  |  | ✓ | ✓ | ✓ | AMBIGUITY_RESOLUTION | TOOL_FAILURE,INVALID_INPUT,INELIGIBLE,OUT_OF_SCOPE | CONFIRMATION/NORMAL |  |  | PARTIALLY_SUPPORTED | YES/PARTIAL | banking77, indic, tau_indian |
| CARD_REPLACEMENT |  |  |  | ✓ |  |  | ✓ | ✓ | ✓ | NONE | INELIGIBLE | CONFIRMATION/NORMAL |  | ✓ | PARTIALLY_SUPPORTED | YES/PARTIAL | banking77, indic, tau_indian, tau_knowledge |
| CARD_LIMIT_CHANGE |  |  |  | ✓ |  |  | ✓ | ✓ | ✓ | NONE | NONE | CONFIRMATION/NORMAL |  | ✓ | PARTIALLY_SUPPORTED | YES/PARTIAL | banking77, tau_knowledge |
| CARD_APPLICATION |  |  |  | ✓ |  |  | ✓ | ✓ | ✓ | NONE | NONE | CONFIRMATION/NORMAL |  | ✓ | SUPPORTED | YES/ALL_PRIMITIVES | banking77, tau_knowledge |
| CARD_ACTIVATION |  |  |  | ✓ |  |  |  | ✓ |  | NONE | NONE | CONFIRMATION/NORMAL |  | ✓ | MISSING | YES/NONE | banking77, tau_knowledge |
| CARD_PIN_SERVICE |  |  |  | ✓ |  |  |  | ✓ |  | NONE | NONE | CONFIRMATION/NORMAL |  | ✓ | OUT_OF_SCOPE | YES/NONE | banking77, tau_knowledge |
| CARD_REWARDS_SERVICE |  |  |  | ✓ |  |  |  | ✓ |  | NONE | NONE | CONFIRMATION/NORMAL |  | ✓ | MISSING | YES/NONE | tau_knowledge |
| CARD_DELIVERY |  |  |  | ✓ |  |  |  | ✓ |  | NONE | NONE | CONFIRMATION/NORMAL |  |  | MISSING | YES/NONE | banking77 |
| RECURRING_QUERY |  |  |  |  | ✓ |  | ✓ |  |  | AMBIGUITY_RESOLUTION | TOOL_FAILURE,INVALID_INPUT,OUT_OF_SCOPE | NONE/NORMAL |  |  | SUPPORTED | YES/ALL_PRIMITIVES | indic, openbanking |
| RECURRING_STOP |  |  |  |  | ✓ |  | ✓ | ✓ | ✓ | NONE | INELIGIBLE | CONFIRMATION/NORMAL |  |  | SUPPORTED | YES/ALL_PRIMITIVES | openbanking, tau_indian |
| RECURRING_CREATE |  |  |  |  | ✓ |  |  | ✓ |  | NONE | NONE | CONFIRMATION/NORMAL |  |  | MISSING | YES/NONE | agentdojo, banking77, openbanking |
| RECURRING_MODIFY |  |  |  |  | ✓ |  |  | ✓ |  | NONE | NONE | CONFIRMATION/NORMAL |  |  | MISSING | YES/NONE | ASTER_GAP_HYPOTHESIS |
| RECURRING_DETECTION |  |  |  |  | ✓ |  | ✓ |  | ✓ | NONE | NONE | NONE/NORMAL |  |  | PARTIALLY_SUPPORTED | YES/PARTIAL | ASTER_GAP_HYPOTHESIS |
| POLICY_RETRIEVAL |  |  |  |  |  | ✓ | ✓ |  | ✓ | AMBIGUITY_RESOLUTION | TOOL_FAILURE,INVALID_INPUT,OUT_OF_SCOPE | NONE/NORMAL |  | ✓ | OUT_OF_SCOPE | NO/NOT_REQUIRED | banking77, indic, tau_indian, tau_knowledge |
| SECURITY_INJECTION |  |  |  |  |  | ✓ | ✓ |  |  | NONE | NONE | NONE/SECURITY_ADVERSARIAL | ✓ |  | OUT_OF_SCOPE | NO/NOT_REQUIRED | agentdojo |
| SECURITY_PRIVACY |  |  |  |  |  | ✓ | ✓ |  |  | NONE | NONE | NONE/SECURITY_ADVERSARIAL | ✓ |  | OUT_OF_SCOPE | NO/NOT_REQUIRED | agentdojo, banking77, indic |
| SERVICE_ESCALATION |  |  |  |  |  | ✓ |  | ✓ |  | AMBIGUITY_RESOLUTION | TOOL_FAILURE,INVALID_INPUT,OUT_OF_SCOPE | CONFIRMATION/NORMAL |  | ✓ | MISSING | PRIMITIVES_ONLY/NONE | banking77, indic, tau_indian, tau_knowledge |
| PROFILE_CHANGE |  |  |  |  |  | ✓ |  | ✓ |  | NONE | NONE | CONFIRMATION/NORMAL |  | ✓ | MISSING | PRIMITIVES_ONLY/NONE | agentdojo, banking77, tau_knowledge |
| REFERRAL_PROGRAM |  |  |  |  |  | ✓ |  | ✓ |  | NONE | NONE | CONFIRMATION/NORMAL |  | ✓ | OUT_OF_SCOPE | PRIMITIVES_ONLY/NONE | tau_knowledge |
| FINANCIAL_MARKET_RESEARCH |  |  | ✓ |  |  |  | ✓ |  |  | NONE | NONE | NONE/NORMAL |  |  | OUT_OF_SCOPE | YES/NONE | fintoolbench |
| BILL_TO_TRANSFER |  |  |  |  |  | ✓ | ✓ | ✓ | ✓ | NONE | NONE | CONFIRMATION/NORMAL |  |  | PARTIALLY_SUPPORTED | PRIMITIVES_ONLY/PARTIAL | agentdojo |
| TRANSACTION_TO_TRANSFER |  |  |  |  |  | ✓ | ✓ | ✓ | ✓ | NONE | NONE | CONFIRMATION/NORMAL |  |  | SUPPORTED | PRIMITIVES_ONLY/ALL_PRIMITIVES | agentdojo |
| FRAUD_PROTECTION_DISPUTE |  |  |  |  |  | ✓ | ✓ | ✓ | ✓ | NONE | NONE | CONFIRMATION/NORMAL |  |  | PARTIALLY_SUPPORTED | PRIMITIVES_ONLY/PARTIAL | tau_indian |
| ACCOUNT_TO_DEPOSIT |  |  |  |  |  | ✓ | ✓ | ✓ | ✓ | NONE | INELIGIBLE | CONFIRMATION/NORMAL |  |  | PARTIALLY_SUPPORTED | PRIMITIVES_ONLY/PARTIAL | tau_indian |
| DEPOSIT_REINVESTMENT |  |  | ✓ |  |  |  | ✓ | ✓ | ✓ | NONE | NONE | CONFIRMATION/NORMAL |  |  | MISSING | YES/NONE | tau_indian |
| RELOCATION_PAYMENTS |  |  |  |  |  | ✓ | ✓ | ✓ | ✓ | NONE | NONE | CONFIRMATION/NORMAL |  |  | PARTIALLY_SUPPORTED | PRIMITIVES_ONLY/PARTIAL | agentdojo |
| SPENDING_TO_RECURRING_STOP |  |  |  |  |  | ✓ | ✓ | ✓ | ✓ | NONE | NONE | CONFIRMATION/NORMAL |  |  | SUPPORTED | PRIMITIVES_ONLY/ALL_PRIMITIVES | ASTER_COMPOSED |
| ACCOUNT_TO_INVESTMENT |  |  |  |  |  | ✓ | ✓ | ✓ | ✓ | NONE | NONE | CONFIRMATION/NORMAL |  |  | SUPPORTED | PRIMITIVES_ONLY/ALL_PRIMITIVES | ASTER_COMPOSED |
| CARD_ANOMALY_PROTECT |  |  |  |  |  | ✓ | ✓ | ✓ | ✓ | NONE | NONE | CONFIRMATION/NORMAL |  |  | SUPPORTED | PRIMITIVES_ONLY/ALL_PRIMITIVES | ASTER_COMPOSED |
| BUDGET_TO_SCHEDULE |  |  |  |  |  | ✓ | ✓ | ✓ | ✓ | NONE | NONE | CONFIRMATION/NORMAL |  |  | PARTIALLY_SUPPORTED | PRIMITIVES_ONLY/PARTIAL | ASTER_COMPOSED |
| PAYMENT_RISK_ESCALATION | ✓ |  |  |  |  |  | ✓ | ✓ | ✓ | NONE | NONE | CONFIRMATION/NORMAL |  |  | PARTIALLY_SUPPORTED | YES/PARTIAL | ASTER_GAP_HYPOTHESIS |

## 跨域、变体与去重

| 组合 | 出处 | 所需原语 | 当前支持 |
|---|---|---|---|
| UNSUPPORTED_TOOL_REFUSAL | SOURCE_SUPPORTED | SECURITY_EVAL | OUT_OF_SCOPE |
| POLICY_RETRIEVAL | SOURCE_SUPPORTED | PUBLIC_KNOWLEDGE, KNOWLEDGE_AGENT | OUT_OF_SCOPE |
| SECURITY_INJECTION | SOURCE_SUPPORTED | SECURITY_EVAL | OUT_OF_SCOPE |
| SECURITY_PRIVACY | SOURCE_SUPPORTED | SECURITY_EVAL | OUT_OF_SCOPE |
| SERVICE_ESCALATION | SOURCE_SUPPORTED | SERVICE_CASE | MISSING |
| PROFILE_CHANGE | SOURCE_SUPPORTED | PROFILE_UPDATE | MISSING |
| REFERRAL_PROGRAM | SOURCE_SUPPORTED | REFERRAL | OUT_OF_SCOPE |
| BILL_TO_TRANSFER | SOURCE_SUPPORTED | BILL_DOCUMENT, RECIPIENT_CREATE, TRANSFER | PARTIALLY_SUPPORTED |
| TRANSACTION_TO_TRANSFER | SOURCE_SUPPORTED | TRANSACTION_READ, RECIPIENT_READ, TRANSFER | SUPPORTED |
| FRAUD_PROTECTION_DISPUTE | SOURCE_SUPPORTED | TRANSACTION_READ, CARD_BLOCK, DISPUTE | PARTIALLY_SUPPORTED |
| ACCOUNT_TO_DEPOSIT | SOURCE_SUPPORTED | ACCOUNT_READ, DEPOSIT_BOOK | PARTIALLY_SUPPORTED |
| RELOCATION_PAYMENTS | SOURCE_SUPPORTED | PROFILE_UPDATE, SCHEDULE_EDIT, TRANSACTION_READ, TRANSFER | PARTIALLY_SUPPORTED |
| SPENDING_TO_RECURRING_STOP | ASTER_COMPOSED | SPENDING, RECURRING_READ, RECURRING_STOP | SUPPORTED |
| ACCOUNT_TO_INVESTMENT | ASTER_COMPOSED | ACCOUNT_READ, WEALTH_PRODUCTS, RISK_PROFILE, SUITABILITY, INVESTMENT_BUY | SUPPORTED |
| CARD_ANOMALY_PROTECT | ASTER_COMPOSED | TRANSACTION_READ, CARD_READ, CARD_FREEZE | SUPPORTED |
| BUDGET_TO_SCHEDULE | ASTER_COMPOSED | SPENDING, ACCOUNT_READ, SCHEDULE_CREATE | PARTIALLY_SUPPORTED |

真正组合可来自交易→付款、异常交易→卡片保护/争议、账户→投资、消费→周期扣款停止。安全和知识也是独立轴，不因使用身份检查就把每条任务算成跨业务域。`cross_domain_kind` 区分多业务域组合与平台支持类条目。

四个明确 ASTER_COMPOSED：SPENDING_TO_RECURRING_STOP、ACCOUNT_TO_INVESTMENT、CARD_ANOMALY_PROTECT、BUDGET_TO_SCHEDULE。它们从来源支持的原语与 Aster 当前流程组合，**不是从公开数据直接复用的任务**。

重复例子：TauIndian `sqfrz`/`edgbcarddisamb` 与 Indic freeze 类工具共享 CARD_FREEZE；`sqmand`/`sq2mandaudit`/`edgamandwrong` 共享 RECURRING_STOP；Banking77 的同主题只增加语言证据。冻结与永久停卡、自愿销卡、补卡不合并；存款与基金认购不合并；退款与向朋友退回款项不合并。

有用变体：可用余额不足、卡片同名消歧、取消错误 mandate ID 的纠正、已停止/已永久停卡的重复请求、开启与关闭渠道的认证差异。Aster 的过期 intent、旧状态冲突、会话变化、同键重试/异键重复，需要本地编写测试，不伪装成上游现成案例。

## 提议套件层

层可重叠，不相加形成总任务数。

| 层 | 可用候选族数 |
|---|---|
| core_manual | 31 |
| composite | 6 |
| robustness | 17 |
| security | 2 |
| knowledge_policy | 16 |

## 三种选择模式（仅推荐候选）

### MINIMAL_CORE — 7 个族

`ACCOUNT_TO_INVESTMENT`, `CARD_ANOMALY_PROTECT`, `SPENDING_TO_RECURRING_STOP`, `CARD_APPLICATION`, `CARD_UNFREEZE`, `RECIPIENT_TRANSFER`, `CARD_CONTROLS`

### BALANCED — 25 个族

`ACCOUNT_BALANCE`, `ACCOUNT_TO_INVESTMENT`, `BUDGET_TO_SCHEDULE`, `CARD_ANOMALY_PROTECT`, `CARD_APPLICATION`, `CARD_CONTROLS`, `CARD_DETAILS`, `CARD_FREEZE`, `CARD_LOST_BLOCK`, `CARD_REPLACEMENT`, `CARD_UNFREEZE`, `FRAUD_PROTECTION_DISPUTE`, `PAYMENT_STATUS`, `POLICY_RETRIEVAL`, `RECIPIENT_TRANSFER`, `RECURRING_QUERY`, `RECURRING_STOP`, `SPENDING_REPORT`, `SPENDING_TO_RECURRING_STOP`, `STATEMENT_REQUEST`, `TRANSACTION_DISPUTE`, `TRANSACTION_SEARCH`, `TRANSACTION_TO_TRANSFER`, `UNSUPPORTED_TOOL_REFUSAL`, `WEALTH_DISCOVERY`

### EXTENDED — 45 个族

`UNSUPPORTED_TOOL_REFUSAL`, `CREDIT_CARD_REPAYMENT`, `CARD_CLOSURE`, `ACCOUNT_BALANCE`, `RECIPIENT_TRANSFER`, `NEW_RECIPIENT_TRANSFER`, `SCHEDULED_TRANSFER`, `SCHEDULE_CHANGE`, `TRANSFER_CANCELLATION`, `OWN_ACCOUNT_MOVEMENT`, `FX_EXCHANGE`, `PAYMENT_STATUS`, `ACCOUNT_OPEN_CLOSE`, `TRANSACTION_SEARCH`, `SPENDING_REPORT`, `STATEMENT_REQUEST`, `TRANSACTION_DISPUTE`, `REFUND_TRACKING`, `DUPLICATE_CHARGE`, `UNRECOGNIZED_CHARGE`, `WEALTH_DISCOVERY`, `CARD_DETAILS`, `CARD_FREEZE`, `CARD_UNFREEZE`, `CARD_CONTROLS`, `CARD_LOST_BLOCK`, `CARD_REPLACEMENT`, `CARD_LIMIT_CHANGE`, `CARD_APPLICATION`, `CARD_ACTIVATION`, `RECURRING_QUERY`, `RECURRING_STOP`, `RECURRING_CREATE`, `RECURRING_MODIFY`, `POLICY_RETRIEVAL`, `SECURITY_INJECTION`, `SECURITY_PRIVACY`, `BILL_TO_TRANSFER`, `TRANSACTION_TO_TRANSFER`, `FRAUD_PROTECTION_DISPUTE`, `SPENDING_TO_RECURRING_STOP`, `ACCOUNT_TO_INVESTMENT`, `CARD_ANOMALY_PROTECT`, `BUDGET_TO_SCHEDULE`, `PAYMENT_RISK_ESCALATION`

MINIMAL_CORE 用确定性贪心覆盖当前可操作候选所需的原语，不宣称数学最优，也不把缺失能力当作已覆盖。BALANCED 增加有证据的异常与组合，含尚需开发的能力；EXTENDED 保留所有高/中价值 DIRECT/ADAPTABLE 及组合候选，扩展安全与知识。三者都不是可立即执行或最终冻结的 case 清单。

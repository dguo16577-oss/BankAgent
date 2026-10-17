"""Reviewed B0 semantic decisions. These are hypotheses for review, not a frozen suite.
Each family names a distinct outcome; amounts, identities and failure modes are variants.
"""
DOMAINS = ["PAYMENTS", "SPENDING_AND_TRANSACTIONS", "WEALTH", "CARDS", "RECURRING_AND_DIRECT_DEBIT", "CROSS_DOMAIN"]
P, S, W, C, R, X = DOMAINS
# capability: domain, operations, UI, authorization, persisted effects, limits
CAPABILITIES = {
 "ACCOUNT_READ": (P, "listAccounts getAccount", "/app/accounts", "NONE", "none", "Original balances and estimated FX equivalent; no account creation"),
 "RECIPIENT_READ": (P, "getRecipients", "/app/payments/transfers/new", "NONE", "none", "Search existing owned recipients; cannot add one"),
 "TRANSFER": (P, "createTransferIntent getTransferIntent executeTransfer getTransferReceipt", "/app/payments/transfers/new", "CONFIRMATION", "intent, debit, transaction, receipt, idempotency", "Immediate existing-recipient CNY transfer only; no external settlement"),
 "TRANSACTION_READ": (S, "listTransactions getTransaction", "/app/transactions", "NONE", "none", "API filters and opaque cursor; no dispute or refund mutation"),
 "SPENDING": (S, "getSpendingSummary", "/app/spending", "NONE", "none", "Eligible completed debits; custom windows <=366 days, category/merchant/daily aggregations"),
 "CARD_READ": (C, "getCards getCardDetail", "/app/cards", "NONE", "none", "Masked details and controls"),
 "CARD_FREEZE": (C, "prepareCardAction getCardActionIntent executeCardAction getCardActionReceipt", "/app/cards/{cardId}", "CONFIRMATION", "card status, intent, receipt, idempotency", "Protective reversible freeze, not permanent lost/stolen block"),
 "CARD_UNFREEZE": (C, "prepareCardAction getCardActionIntent executeCardAction getCardActionReceipt", "/app/cards/{cardId}", "STEP_UP", "card status, bound grant consumption, security event, receipt", "AAL2 grant bound to session/intent/hash"),
 "CARD_CONTROLS": (C, "prepareCardAction getCardActionIntent executeCardAction getCardActionReceipt", "/app/cards/{cardId}", "STEP_UP", "four card controls, receipt, conditional grant consumption", "OFF is confirmation; any ON requires step-up; no numeric limits"),
 "CARD_APPLICATION": (C, "submitProductApplication listProductApplications getProductApplication", "/products/{slug}#apply", "CONFIRMATION", "SUBMITTED application only", "Debit/credit intake, not underwriting, issuance, delivery or activation"),
 "LOAN_APPLICATION": (P, "submitProductApplication listProductApplications getProductApplication", "/products/personal-loan#apply", "CONFIRMATION", "SUBMITTED application only", "No approval, funding or servicing"),
 "RECURRING_READ": (R, "listRecurringPayments getRecurringPayment", "/app/spending/recurring/{recurringPaymentId}", "NONE", "none", "Provenance and detected-only records; seeded patterns, no live detector"),
 "RECURRING_STOP": (R, "prepareRecurringPaymentAction getRecurringPaymentActionIntent executeRecurringPaymentAction getRecurringPaymentActionReceipt", "/app/spending/recurring/{recurringPaymentId}", "CONFIRMATION", "STOPPED, clear nextExpectedAt, intent, receipt", "Bank-managed only; not external service-contract cancellation"),
 "WEALTH_PRODUCTS": (W, "listInvestmentProducts getInvestmentProduct", "/app/wealth", "NONE", "none", "Type/risk filters and product details; no side-by-side compare screen"),
 "PORTFOLIO": (W, "getWealthPortfolio", "/app/wealth", "NONE", "none", "Demo valuation and holdings; no live NAV"),
 "RISK_PROFILE": (W, "getRiskProfile", "/app/wealth", "NONE", "none", "Read existing profile; no assessment questionnaire/update"),
 "SUITABILITY": (W, "createSuitabilityCheck getSuitabilityCheck", "/app/wealth/products/{productId}/invest", "NONE", "suitability check", "Server-computed suitability using existing risk profile"),
 "INVESTMENT_BUY": (W, "createInvestmentOrderIntent getInvestmentOrderIntent executeInvestmentOrder getInvestmentOrder", "/app/wealth/products/{productId}/invest", "CONFIRMATION", "account debit, position, transaction, order, idempotency", "CNY simulated purchase; no redemption; not fixed-deposit booking"),
 "PUBLIC_KNOWLEDGE": (X, "getPublicHome getPublicNavigation listPublicCatalog getPublicCatalogItem listSupportArticles getSupportArticle getPublicRates listPublicOffers searchPublicContent", "/support", "NONE", "none", "Public product/fee/support browsing and keyword search; not agent RAG or sourced policy decisions"),
 "SESSION": (X, "getSession login logout", "/login", "NONE", "session, security events", "Server session + CSRF; demo local credentials; no real-world KYC"),
 "STEP_UP": (X, "createStepUpChallenge getStepUpChallenge verifyStepUpChallenge", "/app/security/step-up/{challengeId}", "STEP_UP", "challenge, intent-bound single-use authorization, events", "Only CARD_ACTION_INTENT execution currently consumes grants"),
 "OVERVIEW": (X, "getOverview", "/app/overview", "NONE", "none", "Web read model; not another banking domain"),
}
# Missing primitives are kept distinct from numbers of cases/families.
MISSING = {
 "CARD_CLOSE": (C, "OPTIONAL", "HIGH", "Voluntary card-account closure, settlement and retention policy; not lost/stolen blocking"),
 "CARD_REPAY": (C, "SHOULD_CONSIDER", "HIGH", "Credit balance repayment and liability ledger; not a generic outgoing transfer"),
 "RECIPIENT_CREATE": (P, "MUST_CONSIDER", "MEDIUM", "Owned recipient creation and validation"),
 "SCHEDULE_CREATE": (P, "MUST_CONSIDER", "HIGH", "Dated instruction plus execution lifecycle, not just a date field"),
 "SCHEDULE_EDIT": (P, "SHOULD_CONSIDER", "HIGH", "Versioned schedule amendment and cancellation"),
 "TRANSFER_CANCEL": (P, "SHOULD_CONSIDER", "HIGH", "Define cancellable pre-settlement state; completed transfer cannot simply be undone"),
 "COLLECT_SPLIT": (P, "OPTIONAL", "HIGH", "Collection request, participants and settlement status"),
 "PAYMENT_RISK": (P, "MUST_CONSIDER", "HIGH", "Risk decision and payment-bound authorization; current grants are card-only"),
 "OWN_ACCOUNT_TRANSFER": (P, "SHOULD_CONSIDER", "MEDIUM", "Atomically debit/credit two owned accounts"),
 "FX_EXECUTE": (P, "OPTIONAL", "HIGH", "Executable quote/expiry/settlement; display rate is not an FX engine"),
 "STATEMENT_EXPORT": (S, "SHOULD_CONSIDER", "MEDIUM", "Downloadable statement with immutable reporting boundaries"),
 "DISPUTE": (S, "MUST_CONSIDER", "HIGH", "Transaction-linked dispute intake, evidence and status; not automatic refund"),
 "REFUND": (S, "SHOULD_CONSIDER", "HIGH", "Refund status and controlled refund posting"),
 "ANOMALY_DETECT": (S, "SHOULD_CONSIDER", "HIGH", "Explainable suspicious/duplicate detection; never auto-mutate solely from inference"),
 "CARD_BLOCK": (C, "MUST_CONSIDER", "MEDIUM", "Permanent lost/stolen lifecycle distinct from freeze"),
 "CARD_REPLACE": (C, "SHOULD_CONSIDER", "HIGH", "Replacement request and lifecycle, linked to old card"),
 "CARD_LIMIT": (C, "SHOULD_CONSIDER", "HIGH", "Versioned numeric limits and risk-based step-up"),
 "CARD_ACTIVATE": (C, "OPTIONAL", "HIGH", "Issuance/activation identity and lifecycle"),
 "CARD_PIN": (C, "OUT_OF_SCOPE", "HIGH", "PIN changes require specialist secure handling; not plain text tools"),
 "RECURRING_CREATE": (R, "SHOULD_CONSIDER", "HIGH", "Create mandate/standing order with scope and execution lifecycle"),
 "RECURRING_EDIT": (R, "SHOULD_CONSIDER", "HIGH", "Modify/restart plan with review and version checks"),
 "PATTERN_DETECT": (R, "OPTIONAL", "HIGH", "Actual transaction-based recurring detector; current records are seeded"),
 "DEPOSIT_BOOK": (W, "OPTIONAL", "HIGH", "Fixed/recurring deposit terms and maturity; not mutual-fund purchase"),
 "DEPOSIT_CLOSE": (W, "OPTIONAL", "HIGH", "Premature closure quote, penalty and accrued interest"),
 "DEPOSIT_RENEW": (W, "OPTIONAL", "MEDIUM", "Deposit renewal instructions"),
 "REDEMPTION": (W, "SHOULD_CONSIDER", "HIGH", "Units/valuation/liquidity/settlement; no strong direct reuse evidence in selected sources"),
 "RISK_ASSESS": (W, "MUST_CONSIDER", "MEDIUM", "Manual risk questionnaire and versioned assessment update"),
 "LOAN_SERVICING": (P, "OUT_OF_SCOPE", "HIGH", "Amortization, payoff/foreclosure and collateral; intake alone does not provide it"),
 "CHEQUE": (P, "OUT_OF_SCOPE", "HIGH", "Cheque clearing/book/stop infrastructure is not in current product"),
 "PROFILE_UPDATE": (X, "OPTIONAL", "MEDIUM", "Verified contact/address updates"),
 "SERVICE_CASE": (X, "SHOULD_CONSIDER", "MEDIUM", "Complaint/human handoff case and status"),
 "REWARDS": (C, "OPTIONAL", "HIGH", "Rewards ledger, adjustments and fee retention"),
 "ACCOUNT_LIFECYCLE": (P, "OPTIONAL", "HIGH", "Account open/close with eligibility and settlement rules"),
 "INSURANCE": (W, "OUT_OF_SCOPE", "HIGH", "Insurance underwriting/claims, outside six-domain execution scope"),
 "REFERRAL": (X, "OUT_OF_SCOPE", "MEDIUM", "Referral campaign eligibility and payout"),
 "BILL_DOCUMENT": (P, "OPTIONAL", "MEDIUM", "Trusted bill intake plus untrusted-text boundary"),
 "SECURITY_EVAL": (X, "OUT_OF_SCOPE", "MEDIUM", "Future agent prompt-injection evaluation, not a missing manual product"),
 "KNOWLEDGE_AGENT": (X, "OUT_OF_SCOPE", "HIGH", "Future sourced retrieval/procedure reasoning; do not build Agent in B0"),
 "MARKET_RESEARCH": (W, "OUT_OF_SCOPE", "HIGH", "External market/company data tools; not customer banking execution"),
}
# id | domain | adaptability | primitives | description. Provenance assigned by normalization.
FAMILY_ROWS = """
UNSUPPORTED_TOOL_REFUSAL|CROSS_DOMAIN|ADAPTABLE|SECURITY_EVAL|未提供或不存在的工具应澄清与拒绝虚构执行；不作为应新增产品功能。
CREDIT_CARD_REPAYMENT|CARDS|ADAPTABLE|CARD_READ CARD_REPAY|从银行账户偿还信用卡欠款，需更新负债而非只记普通转账。
CARD_CLOSURE|CARDS|ADAPTABLE|CARD_READ CARD_CLOSE|自愿关闭信用卡账户，处理欠款和结清条件，区别于遗失停卡。
ACCOUNT_BALANCE|PAYMENTS|DIRECT|ACCOUNT_READ|查询账户余额与可用余额，避免把待处理资金视为可支配资金。
RECIPIENT_TRANSFER|PAYMENTS|ADAPTABLE|RECIPIENT_READ TRANSFER|向已存在收款人立即转账；名称、金额变化属于变体。
NEW_RECIPIENT_TRANSFER|PAYMENTS|ADAPTABLE|RECIPIENT_CREATE TRANSFER|确认并创建新收款人后转账。
SCHEDULED_TRANSFER|PAYMENTS|ADAPTABLE|SCHEDULE_CREATE|创建一次性未来付款；必须具有执行与失败生命周期。
SCHEDULE_CHANGE|PAYMENTS|ADAPTABLE|SCHEDULE_EDIT|修改未来付款的金额、收款人或日期。
TRANSFER_CANCELLATION|PAYMENTS|ADAPTABLE|TRANSFER_CANCEL|在可取消阶段撤销付款指令；不等同退回已完成转账。
COLLECT_OR_SPLIT|PAYMENTS|INSPIRATION_ONLY|COLLECT_SPLIT|分摊账单或向他人发起收款请求，不能用单向转账冒充。
OWN_ACCOUNT_MOVEMENT|PAYMENTS|ADAPTABLE|ACCOUNT_READ OWN_ACCOUNT_TRANSFER|本人账户间资金移动，需借贷两端同时更新。
FX_EXCHANGE|PAYMENTS|ADAPTABLE|FX_EXECUTE|执行外币兑换，区别于只查演示汇率。
PAYMENT_STATUS|PAYMENTS|ADAPTABLE|TRANSACTION_READ|查询待处理、失败或未到账付款；限状态解释，不许虚构外部清算追踪。
LOAN_QUOTE_SERVICE|PAYMENTS|PARTIAL|LOAN_SERVICING|贷款月供、提前结清或抵押品测算；区别于贷款申请收件。
CHEQUE_SERVICE|PAYMENTS|NOT_APPLICABLE|CHEQUE|支票簿、止付与清算专有流程。
ACCOUNT_OPEN_CLOSE|PAYMENTS|ADAPTABLE|ACCOUNT_LIFECYCLE|开户或销户，含余额和未结事项处理。
TRANSACTION_SEARCH|SPENDING_AND_TRANSACTIONS|DIRECT|TRANSACTION_READ|按账户、日期和交易特征查询明细。
SPENDING_REPORT|SPENDING_AND_TRANSACTIONS|DIRECT|SPENDING|汇总选定周期的消费与类别并解释统计边界。
STATEMENT_REQUEST|SPENDING_AND_TRANSACTIONS|ADAPTABLE|TRANSACTION_READ STATEMENT_EXPORT|按正确周期生成可交付对账单。
TRANSACTION_DISPUTE|SPENDING_AND_TRANSACTIONS|ADAPTABLE|TRANSACTION_READ DISPUTE|识别交易并提交、追踪争议，不直接保证退款。
REFUND_TRACKING|SPENDING_AND_TRANSACTIONS|ADAPTABLE|TRANSACTION_READ REFUND|查询退款或发起符合规则的退款流程。
DUPLICATE_CHARGE|SPENDING_AND_TRANSACTIONS|ADAPTABLE|TRANSACTION_READ ANOMALY_DETECT DISPUTE|核查疑似重复扣款并区分合法重复购买。
UNRECOGNIZED_CHARGE|SPENDING_AND_TRANSACTIONS|ADAPTABLE|TRANSACTION_READ DISPUTE|核实本人不认识的交易并提交争议。
DEPOSIT_BOOKING|WEALTH|PARTIAL|ACCOUNT_READ DEPOSIT_BOOK|固定或定期储蓄存款开户，需利率、期限与资金约束。
DEPOSIT_CLOSURE|WEALTH|PARTIAL|DEPOSIT_CLOSE|提前支取存款，先报价罚息和到手金额再确认。
DEPOSIT_RENEWAL|WEALTH|PARTIAL|DEPOSIT_RENEW|调整到期续存选项，保留存款合同语义。
WEALTH_DISCOVERY|WEALTH|ADAPTABLE|WEALTH_PRODUCTS PUBLIC_KNOWLEDGE|查找并阅读产品、费用及风险；不把营销收益当保证。
INVESTMENT_PURCHASE|WEALTH|INSPIRATION_ONLY|RISK_PROFILE SUITABILITY INVESTMENT_BUY|Aster 产品适当性检查后认购；来源存款不能直接替代。
PORTFOLIO_QUERY|WEALTH|INSPIRATION_ONLY|PORTFOLIO|查询当前持仓和演示估值。
RISK_ASSESSMENT|WEALTH|INSPIRATION_ONLY|RISK_ASSESS|建立或更新个人风险评估。
INVESTMENT_REDEMPTION|WEALTH|INSPIRATION_ONLY|REDEMPTION|赎回投资并处理到账与估值；本次来源缺乏直接可复用案例。
INSURANCE_SERVICE|WEALTH|NOT_APPLICABLE|INSURANCE|保单与理赔非本轮目标银行执行域。
CARD_DETAILS|CARDS|DIRECT|CARD_READ|读取掩码卡片、状态和渠道开关。
CARD_FREEZE|CARDS|DIRECT|CARD_READ CARD_FREEZE|暂时冻结选定卡片并核验，保持可逆保护语义。
CARD_UNFREEZE|CARDS|ADAPTABLE|CARD_READ CARD_UNFREEZE STEP_UP|解冻提升风险，需要 Aster 的绑定式认证。
CARD_CONTROLS|CARDS|ADAPTABLE|CARD_READ CARD_CONTROLS|调整消费渠道开关；开启和关闭的授权要求不同。
CARD_LOST_BLOCK|CARDS|ADAPTABLE|CARD_READ CARD_BLOCK|遗失或盗用后永久停用，不能以暂时冻结宣称完成。
CARD_REPLACEMENT|CARDS|ADAPTABLE|CARD_READ CARD_REPLACE|补换卡及状态核验，不等同申请新产品。
CARD_LIMIT_CHANGE|CARDS|ADAPTABLE|CARD_READ CARD_LIMIT|调整数额限额，区别于布尔渠道开关。
CARD_APPLICATION|CARDS|ADAPTABLE|CARD_APPLICATION PUBLIC_KNOWLEDGE|阅读卡产品条件并提交申请，状态止于待审核。
CARD_ACTIVATION|CARDS|ADAPTABLE|CARD_ACTIVATE|激活新卡及检查发卡资格。
CARD_PIN_SERVICE|CARDS|NOT_APPLICABLE|CARD_PIN|PIN 重置或更改，不通过普通对话收集秘密。
CARD_REWARDS_SERVICE|CARDS|PARTIAL|REWARDS|奖励或年费纠错，需要专用账本与政策。
CARD_DELIVERY|CARDS|PARTIAL|CARD_REPLACE|查询实体卡寄送，现有申请没有履约配送流程。
RECURRING_QUERY|RECURRING_AND_DIRECT_DEBIT|DIRECT|RECURRING_READ|查询已记录的订阅、授权扣款及下一次付款信息。
RECURRING_STOP|RECURRING_AND_DIRECT_DEBIT|ADAPTABLE|RECURRING_READ RECURRING_STOP|停止银行侧未来扣款或撤销可管理授权，不取消商家合同。
RECURRING_CREATE|RECURRING_AND_DIRECT_DEBIT|ADAPTABLE|RECURRING_CREATE|建立站立指令或扣款授权及计划。
RECURRING_MODIFY|RECURRING_AND_DIRECT_DEBIT|ADAPTABLE|RECURRING_EDIT|修改金额、时间或重新启用周期付款。
RECURRING_DETECTION|RECURRING_AND_DIRECT_DEBIT|PARTIAL|TRANSACTION_READ PATTERN_DETECT|从交易发现周期模式并区分推断与已授权对象。
POLICY_RETRIEVAL|CROSS_DOMAIN|ADAPTABLE|PUBLIC_KNOWLEDGE KNOWLEDGE_AGENT|基于可溯源产品与程序资料给出政策答案；不是缺少一个银行按钮。
SECURITY_INJECTION|CROSS_DOMAIN|ADAPTABLE|SECURITY_EVAL|隔离账单、交易备注和工具输出中的恶意指令。
SECURITY_PRIVACY|CROSS_DOMAIN|ADAPTABLE|SECURITY_EVAL|拒绝第三方越权、密码索取与数据外传。
SERVICE_ESCALATION|CROSS_DOMAIN|PARTIAL|SERVICE_CASE|正确创建或追踪人工服务工单；不能虚构已转人工。
PROFILE_CHANGE|CROSS_DOMAIN|PARTIAL|PROFILE_UPDATE|验证后修改客户信息。
REFERRAL_PROGRAM|CROSS_DOMAIN|NOT_APPLICABLE|REFERRAL|推荐活动资格与奖金政策。
FINANCIAL_MARKET_RESEARCH|WEALTH|NOT_APPLICABLE|MARKET_RESEARCH|公司报表或市场数据工具分析，不是客户持仓或银行变更。
BILL_TO_TRANSFER|CROSS_DOMAIN|ADAPTABLE|BILL_DOCUMENT RECIPIENT_CREATE TRANSFER|从账单读取付款要求并独立确认收款人再付款。
TRANSACTION_TO_TRANSFER|CROSS_DOMAIN|ADAPTABLE|TRANSACTION_READ RECIPIENT_READ TRANSFER|从历史交易识别对象后执行经确认的转账。
FRAUD_PROTECTION_DISPUTE|CROSS_DOMAIN|ADAPTABLE|TRANSACTION_READ CARD_BLOCK DISPUTE|发现异常后保护卡片并提交交易争议。
ACCOUNT_TO_DEPOSIT|CROSS_DOMAIN|PARTIAL|ACCOUNT_READ DEPOSIT_BOOK|根据账户可用资金与政策选择存款金额。
DEPOSIT_REINVESTMENT|WEALTH|PARTIAL|DEPOSIT_CLOSE DEPOSIT_BOOK|到期或提前结清存款后重新存入，需正确计息。
RELOCATION_PAYMENTS|CROSS_DOMAIN|PARTIAL|PROFILE_UPDATE SCHEDULE_EDIT TRANSACTION_READ TRANSFER|搬家后更新地址、房租指令并处理相关历史往来。
SPENDING_TO_RECURRING_STOP|CROSS_DOMAIN|ADAPTABLE|SPENDING RECURRING_READ RECURRING_STOP|先分析消费，再由用户选定可管理订阅并停止未来扣款。
ACCOUNT_TO_INVESTMENT|CROSS_DOMAIN|ADAPTABLE|ACCOUNT_READ WEALTH_PRODUCTS RISK_PROFILE SUITABILITY INVESTMENT_BUY|读取可用资金，检查产品和适当性后确认认购。
CARD_ANOMALY_PROTECT|CROSS_DOMAIN|ADAPTABLE|TRANSACTION_READ CARD_READ CARD_FREEZE|人工确认异常交易后先冻结卡片，不自动宣称争议已处理。
BUDGET_TO_SCHEDULE|CROSS_DOMAIN|ADAPTABLE|SPENDING ACCOUNT_READ SCHEDULE_CREATE|结合预算与余额设置未来付款，执行前仍需确认。
PAYMENT_RISK_ESCALATION|PAYMENTS|ADAPTABLE|TRANSFER PAYMENT_RISK|对高风险付款升级审核，不能使用卡片授权替代付款授权。
"""

TAU_FAMILIES = {
 "edgablk2x":"CARD_LOST_BLOCK", "edgadestructive":"DEPOSIT_CLOSURE", "edgaineligible":"DEPOSIT_BOOKING", "edgainsuff":"DEPOSIT_BOOKING", "edgamandwrong":"RECURRING_STOP", "edgaphantom":"CHEQUE_SERVICE", "edgapolicy":"TRANSACTION_DISPUTE", "edgbcarddisamb":"CARD_FREEZE", "edgbfdcap":"ACCOUNT_TO_DEPOSIT", "edgbloanrd":"DEPOSIT_BOOKING", "edgbmatelig":"RECURRING_STOP", "edgbmindchange":"DEPOSIT_BOOKING", "edgbstmtwin":"STATEMENT_REQUEST", "edgbtwocards":"CARD_REPLACEMENT", "hpbal":"ACCOUNT_BALANCE", "hpcard":"CARD_DETAILS", "hpemi":"LOAN_QUOTE_SERVICE", "hpgold":"LOAN_QUOTE_SERVICE", "hpkb":"POLICY_RETRIEVAL", "hprate":"WEALTH_DISCOVERY", "hpservice":"CHEQUE_SERVICE", "hptxn":"TRANSACTION_SEARCH", "sq2cardblk":"CARD_REPLACEMENT", "sq2emi":"LOAN_QUOTE_SERVICE", "sq2fdladder":"DEPOSIT_REINVESTMENT", "sq2gold":"LOAN_QUOTE_SERVICE", "sq2insur":"INSURANCE_SERVICE", "sq2loanfc":"LOAN_QUOTE_SERVICE", "sq2mandaudit":"RECURRING_STOP", "sq2rdsize":"DEPOSIT_BOOKING", "sq2seniorfd":"DEPOSIT_BOOKING", "sq2statement":"TRANSACTION_DISPUTE", "sqcheq":"CHEQUE_SERVICE", "sqclose":"DEPOSIT_CLOSURE", "sqctl":"CARD_CONTROLS", "sqdisp":"FRAUD_PROTECTION_DISPUTE", "sqfd":"ACCOUNT_TO_DEPOSIT", "sqfrz":"CARD_FREEZE", "sqkb":"DEPOSIT_RENEWAL", "sqmand":"RECURRING_STOP", "sqreloc":"CHEQUE_SERVICE", "sqrenew":"DEPOSIT_RENEWAL", "tlacctdet":"STATEMENT_REQUEST", "tlfdmat":"DEPOSIT_BOOKING", "tlgoldltv":"LOAN_QUOTE_SERVICE", "tlinsur":"INSURANCE_SERVICE", "tlprodoff":"WEALTH_DISCOVERY", "tlrddet":"DEPOSIT_RENEWAL", "tlrdmat":"DEPOSIT_BOOKING", "tlreqstat":"SERVICE_ESCALATION"
}
TOOL_FAMILIES = {
 "get_all_requests":"SERVICE_ESCALATION",
 "get_account_balance":"ACCOUNT_BALANCE", "get_account_details":"ACCOUNT_BALANCE", "get_transaction_history":"TRANSACTION_SEARCH", "show_mandates":"RECURRING_QUERY", "cancel_mandate":"RECURRING_STOP", "stop_cheque_payment":"CHEQUE_SERVICE", "request_cheque_book":"CHEQUE_SERVICE", "request_duplicate_statement":"STATEMENT_REQUEST", "get_card_details":"CARD_DETAILS", "toggle_card_freeze":"CARD_FREEZE", "block_card":"CARD_LOST_BLOCK", "set_card_controls":"CARD_CONTROLS", "create_fd":"DEPOSIT_BOOKING", "create_rd":"DEPOSIT_BOOKING", "close_deposit":"DEPOSIT_CLOSURE", "update_deposit_renewal":"DEPOSIT_RENEWAL", "get_deposit_closure_quote":"DEPOSIT_CLOSURE", "get_fd_details":"DEPOSIT_BOOKING", "get_rd_details":"DEPOSIT_BOOKING", "calculate_fd_maturity":"DEPOSIT_BOOKING", "calculate_rd_maturity":"DEPOSIT_BOOKING", "get_deposit_loan_rates":"WEALTH_DISCOVERY", "get_products_and_offers":"WEALTH_DISCOVERY", "calculate_emi":"LOAN_QUOTE_SERVICE", "calculate_gold_loan_ltv":"LOAN_QUOTE_SERVICE", "get_gold_rate":"LOAN_QUOTE_SERVICE", "get_loan_details":"LOAN_QUOTE_SERVICE", "get_loan_foreclosure_quote":"LOAN_QUOTE_SERVICE", "get_insurance_details":"INSURANCE_SERVICE", "raise_request":"SERVICE_ESCALATION", "get_request_status":"SERVICE_ESCALATION", "update_address":"PROFILE_CHANGE", "search_knowledge_base":"POLICY_RETRIEVAL", "transfer_to_human_agents":"SERVICE_ESCALATION", "schedule_recurring_transfer":"RECURRING_CREATE", "find_recurring_charges":"RECURRING_DETECTION", "search_transactions_by_merchant":"TRANSACTION_SEARCH", "set_upi_transfer_limit":"PAYMENT_RISK_ESCALATION", "calculate_loan_prepayment_savings":"LOAN_QUOTE_SERVICE", "set_balance_alert":"ACCOUNT_BALANCE"
}
COMPOSED = {"SPENDING_TO_RECURRING_STOP", "ACCOUNT_TO_INVESTMENT", "CARD_ANOMALY_PROTECT", "BUDGET_TO_SCHEDULE"}

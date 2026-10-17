# B0 — 银行行为数据来源审计

检索日期：2026-09-29。脚本版本：b0.1；固定 commit、数据 SHA 与逐文件 SHA-256 见 [sources.yaml](../../research/banking-behaviors/sources.yaml)。脚本哈希及输入/输出计数见 [statistics.json](../../research/banking-behaviors/reports/statistics.json)。

筛选与去重：先读取原生任务/工具/评分结构，再按业务结果归一化；金额、身份、日期与异常处理留作变体。不同来源可共享同一族，单任务也可支持多个族。人工语义映射完整保存在脚本中，可复算但仍需评审。

## 边界与关键发现

- 本次只做下载、静态解析、溯源和候选映射；没有运行上游 Agent，也没有评分模型。
- 缓存在用户目录 `.cache/aster-b0`，项目只保留清单、索引、规则与报告；上游代码从未导入执行。
- 银行业务对话、攻击目标、语言样本和规范操作不能相加后称为同一种任务。
- 当前应用是含申请扩展的 Customer 1.10.0 / Public 冻结合同，共 51 个已实现操作；不是历史 M24 的 48 个。
- tau3/tau2 banking_knowledge 是同一来源的不同发布名称；不得重复计数。

## TauIndianBankBench / NPCI tau-indian-banking

| 项目 | 核验结果 |
|---|---|
| 组织/作者 | Krishanu Adhikary, Prashant Devadiga; NPCI AI Research Team; tau2 harness Sierra Research |
| 论文 | 未验证独立论文；不以推测补全 |
| 发布时间/版本说明 | CITATION.cff identifies software v1.0.0, released 2026-08-30; no dedicated paper URL verified. Harness papers are not a separate banking dataset. |
| 许可证 | MIT code and domain/tasks per LICENSE and HF metadata. Ten KB documents have third-party provenance; do not infer every regulatory document is relicensed MIT. |
| 原生单位与核验计数 | {"tasks": 1000, "native_families": 50, "unit": "conversation", "reward_bases": {"ACTION+DB": 1000}} |
| 格式 | JSON tasks and DB, Markdown policy/KB, Python tools/evaluators |
| 任务结构 | id; description{purpose,notes family=...}; user_scenario; initial_state.initialization_data; evaluation_criteria{actions,communicate_info,nl_assertions,reward_basis} |
| 工具数量与口径 | 34 = 33 TOOL_NAMES banking operations + human handoff |
| 语言 | English task text; Indian context, not verified multilingual tasks |
| 真实/合成来源 | Synthetic customers, balances, IDs and conversations |
| 初态 | Shared synthetic DB plus per-task active_customer override |
| 可变状态 | Yes, bank service state. Soft-write service requests have distinct mutation semantics; not all tool calls debit funds. |
| 预期终态 | Derived by replaying gold actions against initial DB; not a literal final-state fixture per task |
| 预期工具调用 | Yes, argument checks and write purity |
| 多轮 | LLM customer simulator with scripted sequence/hidden info |
| 政策 | policy.md plus 24 KB documents and provenance.json |
| 安全 | Confirmation, refusing duplicate destructive writes, wrong IDs and disclosure constraints; not a dedicated prompt-injection corpus |
| 评分 | All 1000 use ACTION+DB. Required actions and no extra writes plus normalized DB comparison; communicate checks and optional NL judge are diagnostics, not the primary reward. |
| Aster 适用性 | Strong cards, mandate cancellation, state sequencing and funds/ineligibility variants. FD/RD semantics only partially map to Aster fund purchase. |
| 限制 | No generic immediate-transfer execution tool despite NPCI branding. INR/UPI/IFSC, cheque, deposit interest, senior eligibility and loan rules are regional. 1000 tasks are 50 native families, not 1000 independent capabilities. |

### 固定来源与实际读取文件

- [tau_indian](https://github.com/npci/TauIndianBankBench)：`dd4ecc7f5e1d0454243eb4cae8c03d2b496ca00f`，版本时间 `2026-09-08T14:03:17Z`；下载 20 个固定文件。
  - [LICENSE](https://raw.githubusercontent.com/npci/TauIndianBankBench/dd4ecc7f5e1d0454243eb4cae8c03d2b496ca00f/LICENSE)
  - [README.md](https://raw.githubusercontent.com/npci/TauIndianBankBench/dd4ecc7f5e1d0454243eb4cae8c03d2b496ca00f/README.md)
  - [src/tau2/domains/indian_banking/service.py](https://raw.githubusercontent.com/npci/TauIndianBankBench/dd4ecc7f5e1d0454243eb4cae8c03d2b496ca00f/src/tau2/domains/indian_banking/service.py)
  - [src/tau2/domains/indian_banking/tools.py](https://raw.githubusercontent.com/npci/TauIndianBankBench/dd4ecc7f5e1d0454243eb4cae8c03d2b496ca00f/src/tau2/domains/indian_banking/tools.py)
  - [src/tau2/evaluator/evaluator_action.py](https://raw.githubusercontent.com/npci/TauIndianBankBench/dd4ecc7f5e1d0454243eb4cae8c03d2b496ca00f/src/tau2/evaluator/evaluator_action.py)
  - [src/tau2/evaluator/evaluator_env.py](https://raw.githubusercontent.com/npci/TauIndianBankBench/dd4ecc7f5e1d0454243eb4cae8c03d2b496ca00f/src/tau2/evaluator/evaluator_env.py)
- [tau_indian_data](https://huggingface.co/datasets/NPCI/tau-indian-banking)：`747d97ff1e51f0f9a97374a5603d27bc438984a4`，版本时间 `2026-09-08T17:46:01.000Z`；下载 34 个固定文件。
  - [README.md](https://huggingface.co/datasets/NPCI/tau-indian-banking/resolve/747d97ff1e51f0f9a97374a5603d27bc438984a4/README.md)
  - [tau2/domains/indian_banking/db.json](https://huggingface.co/datasets/NPCI/tau-indian-banking/resolve/747d97ff1e51f0f9a97374a5603d27bc438984a4/tau2/domains/indian_banking/db.json)
  - [tau2/domains/indian_banking/tasks.json](https://huggingface.co/datasets/NPCI/tau-indian-banking/resolve/747d97ff1e51f0f9a97374a5603d27bc438984a4/tau2/domains/indian_banking/tasks.json)

代表性原始记录已读取，以下只保留族级转述与定位，不复制长文本：

| 族 | 来源 ID | 转述 | 原文件 |
|---|---|---|---|
| ACCOUNT_BALANCE | rl_hpbal_0155 | 查询账户余额与可用余额，避免把待处理资金视为可支配资金。 | [定位](https://huggingface.co/datasets/NPCI/tau-indian-banking/resolve/747d97ff1e51f0f9a97374a5603d27bc438984a4/tau2/domains/indian_banking/tasks.json) |
| LOAN_QUOTE_SERVICE | rl_hpemi_0110 | 贷款月供、提前结清或抵押品测算；区别于贷款申请收件。 | [定位](https://huggingface.co/datasets/NPCI/tau-indian-banking/resolve/747d97ff1e51f0f9a97374a5603d27bc438984a4/tau2/domains/indian_banking/tasks.json) |
| CHEQUE_SERVICE | rl_edgaphantom_0014 | 支票簿、止付与清算专有流程。 | [定位](https://huggingface.co/datasets/NPCI/tau-indian-banking/resolve/747d97ff1e51f0f9a97374a5603d27bc438984a4/tau2/domains/indian_banking/tasks.json) |
| TRANSACTION_SEARCH | rl_hptxn_0004 | 按账户、日期和交易特征查询明细。 | [定位](https://huggingface.co/datasets/NPCI/tau-indian-banking/resolve/747d97ff1e51f0f9a97374a5603d27bc438984a4/tau2/domains/indian_banking/tasks.json) |

## IndicBankBench

| 项目 | 核验结果 |
|---|---|
| 组织/作者 | Suvradip Paul, Chandra Bhushan, Harsh Sharma, Nitin Kukreja, Yatharth Dedhia, Keyur Doshi, Prashant Devadiga / NPCI |
| 论文 | [论文](https://arxiv.org/abs/2609.29167) |
| 发布时间/版本说明 | Paper September 2026; exact dataset release date not established from tagged release. Commit and HF creation dates separately recorded. |
| 许可证 | Code MIT; case data CC BY 4.0 (DATA_LICENSE.md). Attribute NPCI and mark adaptations. |
| 原生单位与核验计数 | {"tasks": 799, "native_families": null, "native_tool_signatures": 100, "unit": "scripted case", "domains": {"accounts_and_transactions": 138, "calculators": 90, "capability": 68, "cards": 103, "customer_service_and_catalog": 178, "deposits_and_loans": 222}, "axes": {"general_agentic_multitool": 112, "2_bad_tool_response": 36, "3_confusing_intent": 53, "6_context_switching": 44, "5_contradicting_info": 77, "1_happy_path": 39, "9_irrelevant_rag": 24, "8_long_context": 89, "4_not_enough_info": 61, "11_out_of_scope_refuse": 40, "10_unseen_tools": 14, "7_wrong_info": 142, "capability_credentials_jailbreak": 6, "capability_fabrication": 6, "capability_financial_advice": 6, "capability_harmful_illegal": 6, "capability_inappropriate": 6, "capability_political": 6, "capability_social_engineering": 19, "capability_third_party": 13}, "behaviors": {"answer": 625, "clarify": 65, "decline": 109}, "mock_kinds": {"record_set_filtered": 1879, "outcome_fixed": 2814, "outcome_merged": 22}} |
| 格式 | One JSON file per case; tool schema JSON; Python deterministic mock executor and hybrid grader |
| 任务结构 | case_id, axis, domain, tool, target_behavior, setup, tools_exposed, user_turns, mock, gold{tool_calls,dependencies,arg_gate,expected_resolution}, grading |
| 工具数量与口径 | 32 canonical tools in tools.json; unseen-tool cases intentionally ask about unavailable capabilities |
| 语言 | English utterances; Indian personas/regions. Name Indic does not imply Hindi/Chinese translations exist. |
| 真实/合成来源 | Synthetic |
| 初态 | login_context, prior messages and per-case mock records |
| 可变状态 | Partial run-scoped state: outcome_merged carries structured changes into later reads; most outcome_fixed writes return scripted outputs, not a general financial database |
| 预期终态 | No full final bank DB oracle; tool arguments/dependencies and response gates instead |
| 预期工具调用 | Yes, gold calls plus required/optional argument gates |
| 多轮 | Scripted user_turns (not the same as tau's adaptive simulated customer) |
| 政策 | base_system_prompt and tool global_conventions; injected policy/context in cases |
| 安全 | Credential jailbreak, social engineering, third-party requests and harmful actions; separate from ordinary feature coverage |
| 评分 | S1 visible resource IDs, S2 confirmation before writes (may need judge), S3 valid arguments, S4 no raw null/NaN leakage; A1-A3 action gates; response judge required; advisory quality does not change verdict |
| Aster 适用性 | Strongest complementary robustness/clarification/refusal matrix for existing primitives |
| 限制 | 799 cases / 6 source domains / 20 axes; 100 tool-signature labels are NOT 100 authored business families. A hypothetical unseen tool is a refusal test, not proof of available capability. Requires model APIs to run full evaluation, but B0 inspection does not. |

### 固定来源与实际读取文件

- [indic](https://github.com/npci/IndicBankBench)：`6740551098e446b438ab51da206d382961f5f358`，版本时间 `2026-09-25T10:13:32Z`；下载 21 个固定文件。
  - [LICENSE](https://raw.githubusercontent.com/npci/IndicBankBench/6740551098e446b438ab51da206d382961f5f358/LICENSE)
  - [README.md](https://raw.githubusercontent.com/npci/IndicBankBench/6740551098e446b438ab51da206d382961f5f358/README.md)
  - [indicbankbench/harness/grader.py](https://raw.githubusercontent.com/npci/IndicBankBench/6740551098e446b438ab51da206d382961f5f358/indicbankbench/harness/grader.py)
  - [indicbankbench/harness/mock_executor.py](https://raw.githubusercontent.com/npci/IndicBankBench/6740551098e446b438ab51da206d382961f5f358/indicbankbench/harness/mock_executor.py)
  - [indicbankbench/tools.json](https://raw.githubusercontent.com/npci/IndicBankBench/6740551098e446b438ab51da206d382961f5f358/indicbankbench/tools.json)
- [indic_data](https://huggingface.co/datasets/NPCI/IndicBankBench)：`f123e13b423591ce6a0c1bc170fc1a02fe17dacb`，版本时间 `2026-09-25T05:43:57.000Z`；下载 804 个固定文件。
  - [DATA_LICENSE.md](https://huggingface.co/datasets/NPCI/IndicBankBench/resolve/f123e13b423591ce6a0c1bc170fc1a02fe17dacb/DATA_LICENSE.md)
  - [README.md](https://huggingface.co/datasets/NPCI/IndicBankBench/resolve/f123e13b423591ce6a0c1bc170fc1a02fe17dacb/README.md)

代表性原始记录已读取，以下只保留族级转述与定位，不复制长文本：

| 族 | 来源 ID | 转述 | 原文件 |
|---|---|---|---|
| UNSUPPORTED_TOOL_REFUSAL | acct.get_account_balance.unseen_tools.001 | 未提供或不存在的工具应澄清与拒绝虚构执行；不作为应新增产品功能。 | [定位](https://huggingface.co/datasets/NPCI/IndicBankBench/resolve/f123e13b423591ce6a0c1bc170fc1a02fe17dacb/case_bank/accounts_and_transactions/get_account_balance/unseen_tools.001.json) |
| ACCOUNT_BALANCE | acct.agentic.balance_gated.001 | 查询账户余额与可用余额，避免把待处理资金视为可支配资金。 | [定位](https://huggingface.co/datasets/NPCI/IndicBankBench/resolve/f123e13b423591ce6a0c1bc170fc1a02fe17dacb/case_bank/accounts_and_transactions/agentic/balance_gated.001.json) |
| LOAN_QUOTE_SERVICE | acct.agentic.emi_debit_check.001 | 贷款月供、提前结清或抵押品测算；区别于贷款申请收件。 | [定位](https://huggingface.co/datasets/NPCI/IndicBankBench/resolve/f123e13b423591ce6a0c1bc170fc1a02fe17dacb/case_bank/accounts_and_transactions/agentic/emi_debit_check.001.json) |
| CHEQUE_SERVICE | acct.agentic.account_type_cheque_correction.001 | 支票簿、止付与清算专有流程。 | [定位](https://huggingface.co/datasets/NPCI/IndicBankBench/resolve/f123e13b423591ce6a0c1bc170fc1a02fe17dacb/case_bank/accounts_and_transactions/agentic/account_type_cheque_correction.001.json) |

## AgentDojo Banking (effective suite through v1_2_2)

| 项目 | 核验结果 |
|---|---|
| 组织/作者 | ETH Zurich SPY Lab and collaborators; Debenedetti et al. |
| 论文 | [论文](https://arxiv.org/abs/2406.13352) |
| 发布时间/版本说明 | Paper 2024-06; pinned repository commit 2026-06-02; version overlays resolved by class identity |
| 许可证 | MIT |
| 原生单位与核验计数 | {"user_tasks": 16, "injection_tasks": 9} |
| 格式 | Python task classes with YAML environment/injection vectors |
| 任务结构 | UserTask: PROMPT, ground_truth, utility; InjectionTask: GOAL, security and injection constraints; environment bank_account/filesystem/user_account |
| 工具数量与口径 | 11 tools listed in banking/task_suite.py, including banking, file and user-account helpers |
| 语言 | English |
| 真实/合成来源 | Synthetic environment and authored user/attacker goals |
| 初态 | Shared YAML accounts, transactions, schedules and files |
| 可变状态 | Yes: transactions, scheduled transactions and user account fields |
| 预期终态 | Per-task utility predicates, sometimes response substring checks; attacker success separate security predicate |
| 预期工具调用 | ground_truth FunctionCall lists, but not every utility test requires an exact trace |
| 多轮 | No adaptive customer dialogue in base banking tasks; single user goal with multiple tools |
| 政策 | Attack/trust-boundary rules, not a production banking policy manual |
| 安全 | 9 distinct attack goal definitions; malicious bills/notes/history can alter payments or leak data. Do not multiply 16 by 9 and call it an observed valid case count. |
| 评分 | Deterministic utility/security Python checks; some read tasks use weak answer substrings |
| Aster 适用性 | Best small source of history-to-payment, schedule amendment and untrusted-document risks |
| 限制 | 16 user tasks + 9 attack goals, not 25 ordinary banking features. Literal IBANs, float amounts, password-changing tool and permissive transfer require redesign; never carry attacker instructions into execution. |

### 固定来源与实际读取文件

- [agentdojo](https://github.com/ethz-spylab/agentdojo)：`089ed468cf3ed0322acc66b0211f26d9d90dbf60`，版本时间 `2026-06-02T09:59:58Z`；下载 15 个固定文件。
  - [LICENSE](https://raw.githubusercontent.com/ethz-spylab/agentdojo/089ed468cf3ed0322acc66b0211f26d9d90dbf60/LICENSE)
  - [README.md](https://raw.githubusercontent.com/ethz-spylab/agentdojo/089ed468cf3ed0322acc66b0211f26d9d90dbf60/README.md)
  - [src/agentdojo/default_suites/v1/banking/user_tasks.py](https://raw.githubusercontent.com/ethz-spylab/agentdojo/089ed468cf3ed0322acc66b0211f26d9d90dbf60/src/agentdojo/default_suites/v1/banking/user_tasks.py)
  - [src/agentdojo/default_suites/v1/tools/banking_client.py](https://raw.githubusercontent.com/ethz-spylab/agentdojo/089ed468cf3ed0322acc66b0211f26d9d90dbf60/src/agentdojo/default_suites/v1/tools/banking_client.py)
  - [src/agentdojo/default_suites/v1_1_1/banking/user_tasks.py](https://raw.githubusercontent.com/ethz-spylab/agentdojo/089ed468cf3ed0322acc66b0211f26d9d90dbf60/src/agentdojo/default_suites/v1_1_1/banking/user_tasks.py)
  - [src/agentdojo/default_suites/v1_2/banking/injection_tasks.py](https://raw.githubusercontent.com/ethz-spylab/agentdojo/089ed468cf3ed0322acc66b0211f26d9d90dbf60/src/agentdojo/default_suites/v1_2/banking/injection_tasks.py)
  - [src/agentdojo/default_suites/v1_2_2/banking/user_tasks.py](https://raw.githubusercontent.com/ethz-spylab/agentdojo/089ed468cf3ed0322acc66b0211f26d9d90dbf60/src/agentdojo/default_suites/v1_2_2/banking/user_tasks.py)

代表性原始记录已读取，以下只保留族级转述与定位，不复制长文本：

| 族 | 来源 ID | 转述 | 原文件 |
|---|---|---|---|
| SCHEDULE_CHANGE | UserTask2 | 修改未来付款的金额、收款人或日期。 | [定位](https://raw.githubusercontent.com/ethz-spylab/agentdojo/089ed468cf3ed0322acc66b0211f26d9d90dbf60/src/agentdojo/default_suites/v1/banking/user_tasks.py) |
| TRANSACTION_SEARCH | UserTask7 | 按账户、日期和交易特征查询明细。 | [定位](https://raw.githubusercontent.com/ethz-spylab/agentdojo/089ed468cf3ed0322acc66b0211f26d9d90dbf60/src/agentdojo/default_suites/v1/banking/user_tasks.py) |
| SPENDING_REPORT | UserTask1 | 汇总选定周期的消费与类别并解释统计边界。 | [定位](https://raw.githubusercontent.com/ethz-spylab/agentdojo/089ed468cf3ed0322acc66b0211f26d9d90dbf60/src/agentdojo/default_suites/v1/banking/user_tasks.py) |
| RECURRING_CREATE | UserTask6 | 建立站立指令或扣款授权及计划。 | [定位](https://raw.githubusercontent.com/ethz-spylab/agentdojo/089ed468cf3ed0322acc66b0211f26d9d90dbf60/src/agentdojo/default_suites/v1_2_2/banking/user_tasks.py) |

## Sierra tau2-bench / tau3 / tau-Knowledge banking_knowledge (one source, not three)

| 项目 | 核验结果 |
|---|---|
| 组织/作者 | Sierra Research; Ben Shi, Ola Zytek, Pedram Razavi, Victor Barres and collaborators |
| 论文 | [论文](https://arxiv.org/abs/2603.04370) |
| 发布时间/版本说明 | tau3 release 2026-03-18; README notes v1.0.1 grading fixes July 2026. This audit pins newer main commit dated 2026-09-28, not falsely labeling it the v1.0.1 tag. |
| 许可证 | MIT repository LICENSE; fictional-bank knowledge corpus at this revision |
| 原生单位与核验计数 | {"tasks": 97, "unit": "dual-control conversation", "native_families": null, "action_signatures": 61, "aggregate_tasks": 97, "aggregate_different_ids": ["task_027", "task_046", "task_048", "task_053", "task_056", "task_061", "task_062", "task_081", "task_083", "task_084", "task_085", "task_088", "task_102"], "has_initial_override": 75, "requires_documents": 97, "reward_bases": {"DB": 87, "ACTION": 9, "DB+NL_ASSERTION": 1}, "unique_required_documents": 218} |
| 格式 | 97 runtime task JSON files, shared transactional DB, JSON knowledge documents, Python tools and evaluators |
| 任务结构 | id, user_scenario, initial_state, evaluation_criteria, user_tools, required_documents; discoverable calls carry nested actual tool names |
| 工具数量与口径 | 58 decorated base KnowledgeTools + 10 decorated KnowledgeUserTools; retrieval mixins add variant-dependent tools. Not all 68 are initially visible; hidden tools are unlocked through knowledge procedures. |
| 语言 | English |
| 真实/合成来源 | Fictional Rho-Bank customer/product/policy environment, synthetic tasks |
| 初态 | Shared db.json, with per-task overrides in 75/97 tasks |
| 可变状态 | Yes, user and agent tools can update accounts/cards/disputes/referrals and discovery logs |
| 预期终态 | Derived DB comparison for 88 tasks (87 DB-only + 1 DB/NL); 9 action-only |
| 预期工具调用 | Yes, gold actions include user-requestor actions and hidden-tool names |
| 多轮 | Adaptive user simulator plus dual-control user tools |
| 政策 | 698 document files in pinned tree; 218 unique required documents all acquired, plus three general sample documents where distinct |
| 安全 | Identity verification, procedural gates and escalation; not a dedicated adversarial attack corpus |
| 评分 | Actual runtime: 87 DB, 9 ACTION, 1 DB+NL_ASSERTION. Environment explicitly loads tasks/task_*.json; 13 differ from top-level tasks.json, which must not be used as the runtime authority. |
| Aster 适用性 | Strong knowledge+action procedures, card servicing, disputes and internal account movement; separate KNOWLEDGE_LAYER_CANDIDATE |
| 限制 | All 97 require documents and all have action criteria; none can honestly be counted as pure static QA from this audit. Policy-directed hidden tools and customer simulations are not missing manual Web screens. Fixed-deposit/mutual-fund suitability is not its core coverage. |

### 固定来源与实际读取文件

- [tau_knowledge](https://github.com/sierra-research/tau2-bench)：`5bfa7e37b36656b37dc6d022156be6563c1007f3`，版本时间 `2026-09-28T19:42:48Z`；下载 369 个固定文件。
  - [LICENSE](https://raw.githubusercontent.com/sierra-research/tau2-bench/5bfa7e37b36656b37dc6d022156be6563c1007f3/LICENSE)
  - [README.md](https://raw.githubusercontent.com/sierra-research/tau2-bench/5bfa7e37b36656b37dc6d022156be6563c1007f3/README.md)
  - [src/tau2/domains/banking_knowledge/environment.py](https://raw.githubusercontent.com/sierra-research/tau2-bench/5bfa7e37b36656b37dc6d022156be6563c1007f3/src/tau2/domains/banking_knowledge/environment.py)
  - [src/tau2/domains/banking_knowledge/retrieval_toolkits.py](https://raw.githubusercontent.com/sierra-research/tau2-bench/5bfa7e37b36656b37dc6d022156be6563c1007f3/src/tau2/domains/banking_knowledge/retrieval_toolkits.py)
  - [src/tau2/domains/banking_knowledge/tools.py](https://raw.githubusercontent.com/sierra-research/tau2-bench/5bfa7e37b36656b37dc6d022156be6563c1007f3/src/tau2/domains/banking_knowledge/tools.py)
  - [src/tau2/evaluator/evaluator_env.py](https://raw.githubusercontent.com/sierra-research/tau2-bench/5bfa7e37b36656b37dc6d022156be6563c1007f3/src/tau2/evaluator/evaluator_env.py)

代表性原始记录已读取，以下只保留族级转述与定位，不复制长文本：

| 族 | 来源 ID | 转述 | 原文件 |
|---|---|---|---|
| CREDIT_CARD_REPAYMENT | task_043 | 从银行账户偿还信用卡欠款，需更新负债而非只记普通转账。 | [定位](https://raw.githubusercontent.com/sierra-research/tau2-bench/5bfa7e37b36656b37dc6d022156be6563c1007f3/data/tau2/domains/banking_knowledge/tasks/task_043.json) |
| CARD_CLOSURE | task_048 | 自愿关闭信用卡账户，处理欠款和结清条件，区别于遗失停卡。 | [定位](https://raw.githubusercontent.com/sierra-research/tau2-bench/5bfa7e37b36656b37dc6d022156be6563c1007f3/data/tau2/domains/banking_knowledge/tasks/task_048.json) |
| RECIPIENT_TRANSFER | task_016 | 向已存在收款人立即转账；名称、金额变化属于变体。 | [定位](https://raw.githubusercontent.com/sierra-research/tau2-bench/5bfa7e37b36656b37dc6d022156be6563c1007f3/data/tau2/domains/banking_knowledge/tasks/task_016.json) |
| OWN_ACCOUNT_MOVEMENT | task_056 | 本人账户间资金移动，需借贷两端同时更新。 | [定位](https://raw.githubusercontent.com/sierra-research/tau2-bench/5bfa7e37b36656b37dc6d022156be6563c1007f3/data/tau2/domains/banking_knowledge/tasks/task_056.json) |

## BANKING77

| 项目 | 核验结果 |
|---|---|
| 组织/作者 | PolyAI; Iñigo Casanueva, Tadas Temčinas, Daniela Gerz, Matthew Henderson, Ivan Vulić |
| 论文 | [论文](https://arxiv.org/abs/2003.04807) |
| 发布时间/版本说明 | Paper March 2020 / ACL ConvAI workshop 2020; repository snapshot commit separate |
| 许可证 | CC BY 4.0 (repository LICENSE), not the Apache license of third-party HF loader code |
| 原生单位与核验计数 | {"train": 10003, "test": 3080, "unit": "utterance, NOT executable task", "native_families": 77} |
| 格式 | train.csv, test.csv, categories.json |
| 任务结构 | text, category; 77 intent names |
| 工具数量与口径 | 0 |
| 语言 | English |
| 真实/合成来源 | Online banking query corpus per README; exact collection/anonymization not independently established, not labeled synthetic by this audit |
| 初态 | No |
| 可变状态 | No |
| 预期终态 | No |
| 预期工具调用 | No |
| 多轮 | No |
| 政策 | No |
| 安全 | User mentions of fraud/lost cards, not executable attacker tests |
| 评分 | Intent classification label, not banking action success |
| Aster 适用性 | LANGUAGE_DATA for taxonomy and paraphrases, especially card problems, refund and payment-status wording |
| 限制 | 10003 train + 3080 test = 13083 utterances; these are never counted as 13083 banking workflows. Existing families gain wording coverage only. |

### 固定来源与实际读取文件

- [banking77](https://github.com/PolyAI-LDN/task-specific-datasets)：`57ec275d8078af65b7731c2a98be812d844a6d6b`，版本时间 `2022-04-29T12:23:20Z`；下载 5 个固定文件。
  - [LICENSE](https://raw.githubusercontent.com/PolyAI-LDN/task-specific-datasets/57ec275d8078af65b7731c2a98be812d844a6d6b/LICENSE)
  - [README.md](https://raw.githubusercontent.com/PolyAI-LDN/task-specific-datasets/57ec275d8078af65b7731c2a98be812d844a6d6b/README.md)
  - [banking_data/categories.json](https://raw.githubusercontent.com/PolyAI-LDN/task-specific-datasets/57ec275d8078af65b7731c2a98be812d844a6d6b/banking_data/categories.json)
  - [banking_data/test.csv](https://raw.githubusercontent.com/PolyAI-LDN/task-specific-datasets/57ec275d8078af65b7731c2a98be812d844a6d6b/banking_data/test.csv)
  - [banking_data/train.csv](https://raw.githubusercontent.com/PolyAI-LDN/task-specific-datasets/57ec275d8078af65b7731c2a98be812d844a6d6b/banking_data/train.csv)

代表性原始记录已读取，以下只保留族级转述与定位，不复制长文本：

| 族 | 来源 ID | 转述 | 原文件 |
|---|---|---|---|
| ACCOUNT_BALANCE | train:3302 | 查询账户余额与可用余额，避免把待处理资金视为可支配资金。 | [定位](https://raw.githubusercontent.com/PolyAI-LDN/task-specific-datasets/57ec275d8078af65b7731c2a98be812d844a6d6b/banking_data/train.csv) |
| RECIPIENT_TRANSFER | train:7006 | 向已存在收款人立即转账；名称、金额变化属于变体。 | [定位](https://raw.githubusercontent.com/PolyAI-LDN/task-specific-datasets/57ec275d8078af65b7731c2a98be812d844a6d6b/banking_data/train.csv) |
| TRANSFER_CANCELLATION | train:2078 | 在可取消阶段撤销付款指令；不等同退回已完成转账。 | [定位](https://raw.githubusercontent.com/PolyAI-LDN/task-specific-datasets/57ec275d8078af65b7731c2a98be812d844a6d6b/banking_data/train.csv) |
| FX_EXCHANGE | train:1358 | 执行外币兑换，区别于只查演示汇率。 | [定位](https://raw.githubusercontent.com/PolyAI-LDN/task-specific-datasets/57ec275d8078af65b7731c2a98be812d844a6d6b/banking_data/train.csv) |

## FinToolBench

| 项目 | 核验结果 |
|---|---|
| 组织/作者 | Double-wk / FinToolBench paper authors (see paper; author identities not inferred from handle) |
| 论文 | [论文](https://arxiv.org/abs/2603.08262) |
| 发布时间/版本说明 | Paper March 2026; pinned code snapshot 2026-07-13 |
| 许可证 | UNKNOWN: no LICENSE found in pinned repository tree. FinanceBench/OpenFinData-derived questions may carry separate rights; no raw samples redistributed. |
| 原生单位与核验计数 | {"tasks": 295, "unit": "financial research query", "keys": ["answer", "category", "context", "dataset_name", "original_idx", "question", "reasoning", "select_tools", "tool_nums"], "native_families": null} |
| 格式 | JSONL questions and 760-tool annotated manifest; Python evaluation |
| 任务结构 | original_idx, dataset_name, category, question, answer, context, select_tools, tool_nums, reasoning |
| 工具数量与口径 | 760 manifest lines, not 760 independently executed/verified tools in B0 |
| 语言 | English inspected question text |
| 真实/合成来源 | Adapted financial QA / research queries; not a synthetic customer banking ledger |
| 初态 | No customer bank state; tool results depend on external financial-data providers |
| 可变状态 | No customer financial mutation demonstrated by inspected query set |
| 预期终态 | No banking ledger oracle |
| 预期工具调用 | Selected tool names, not necessarily full gold argument traces |
| 多轮 | Not a tau-style adaptive customer workflow |
| 政策 | Tool finance attributes include timeliness/intent/regulatory domains |
| 安全 | Compliance mismatch scoring, not a prompt-injection task set |
| 评分 | Tool execution/capability metrics plus correctness/judge and finance attribute mismatch; evaluation needs provider access, inspection is offline |
| Aster 适用性 | Screened out of core banking capabilities; useful retrieval/compliance ideas only |
| 限制 | 295 market/company analysis queries; e.g. financial-statement metric retrieval. Do not call this 295 wealth purchase tasks. Runtime provider availability and license remain unresolved. |

### 固定来源与实际读取文件

- [fintoolbench](https://github.com/Double-wk/FinToolBench)：`5469c85f9523e5f8976471b670c992a3563dfcde`，版本时间 `2026-07-13T15:48:39Z`；下载 7 个固定文件。
  - [README.md](https://raw.githubusercontent.com/Double-wk/FinToolBench/5469c85f9523e5f8976471b670c992a3563dfcde/README.md)
  - [data/question/select_data_real_remove_duplicates.jsonl](https://raw.githubusercontent.com/Double-wk/FinToolBench/5469c85f9523e5f8976471b670c992a3563dfcde/data/question/select_data_real_remove_duplicates.jsonl)
  - [tools/tools_all_annotated.jsonl](https://raw.githubusercontent.com/Double-wk/FinToolBench/5469c85f9523e5f8976471b670c992a3563dfcde/tools/tools_all_annotated.jsonl)

代表性原始记录已读取，以下只保留族级转述与定位，不复制长文本：

| 族 | 来源 ID | 转述 | 原文件 |
|---|---|---|---|
| FINANCIAL_MARKET_RESEARCH | line:1 | 公司报表或市场数据工具分析，不是客户持仓或银行变更。 | [定位](https://raw.githubusercontent.com/Double-wk/FinToolBench/5469c85f9523e5f8976471b670c992a3563dfcde/data/question/select_data_real_remove_duplicates.jsonl) |

## Open Banking UK Read/Write Data API specifications

| 项目 | 核验结果 |
|---|---|
| 组织/作者 | Open Banking UK / ecosystem contributors |
| 论文 | 未验证独立论文；不以推测补全 |
| 发布时间/版本说明 | Inspected six OpenAPI artifacts report version 4.0.1; pinned repository commit 2026-09-18; exact tagged release date not verified |
| 许可证 | Open Banking Open Licence declared in README/spec info. Linked current URL returned a Cookie Policy page during audit, so legal terms not independently revalidated; retain pointers, do not vendor specs. |
| 原生单位与核验计数 | {"unit": "specification operations, NOT tasks", "tasks": 0, "specs": {"account-info-openapi.yaml": {"version": "4.0.1", "license": {"name": "open-licence", "url": "https://www.openbanking.org.uk/open-licence"}, "operations": 29}, "confirmation-funds-openapi.yaml": {"version": "4.0.1", "license": {"name": "open-licence", "url": "https://www.openbanking.org.uk/open-licence"}, "operations": 4}, "event-notifications-openapi.yaml": {"version": "4.0.1", "license": {"name": "open-licence", "url": "https://www.openbanking.org.uk/open-licence"}, "operations": 1}, "events-openapi.yaml": {"version": "4.0.1", "license": {"name": "open-licence", "url": "https://www.openbanking.org.uk/open-licence"}, "operations": 5}, "payment-initiation-openapi.yaml": {"version": "4.0.1", "license": {"name": "open-licence", "url": "https://www.openbanking.org.uk/open-licence"}, "operations": 41}, "vrp-openapi.yaml": {"version": "4.0.1", "license": {"name": "open-licence", "url": "https://www.openbanking.org.uk/open-licence"}, "operations": 9}}} |
| 格式 | OpenAPI YAML |
| 任务结构 | paths, operations, consent/payment schemas, errors and statuses |
| 工具数量与口径 | 89 HTTP operations across six specs, not agent tools or executed cases |
| 语言 | English |
| 真实/合成来源 | Industry interface specification, not a dataset of customer tasks |
| 初态 | No runnable scenario initial bank database |
| 可变状态 | Defines mutation semantics but does not supply an executable bank environment |
| 预期终态 | No benchmark oracle |
| 预期工具调用 | No task traces |
| 多轮 | Consent/payment lifecycle can inform authored scenarios; not dialogue data |
| 政策 | Consent, SCA and regulated Open Banking assumptions |
| 安全 | Security/consent definitions, not an attack corpus |
| 评分 | None |
| Aster 适用性 | SPECIFICATION_DERIVED evidence for scheduled payments, standing orders and consent lifecycle |
| 限制 | UK SCA/TPP consent is not Aster's card-bound ActionAuthorization. VRP consent deletion is not automatically identical to direct-debit mandate cancellation. No standard-conformance claim. |

### 固定来源与实际读取文件

- [openbanking](https://github.com/OpenBankingUK/read-write-api-specs)：`484a1795680d9852600247878b9fd2bfe584c0aa`，版本时间 `2026-09-18T10:54:25Z`；下载 7 个固定文件。
  - [README.md](https://raw.githubusercontent.com/OpenBankingUK/read-write-api-specs/484a1795680d9852600247878b9fd2bfe584c0aa/README.md)
  - [dist/openapi/account-info-openapi.yaml](https://raw.githubusercontent.com/OpenBankingUK/read-write-api-specs/484a1795680d9852600247878b9fd2bfe584c0aa/dist/openapi/account-info-openapi.yaml)
  - [dist/openapi/payment-initiation-openapi.yaml](https://raw.githubusercontent.com/OpenBankingUK/read-write-api-specs/484a1795680d9852600247878b9fd2bfe584c0aa/dist/openapi/payment-initiation-openapi.yaml)
  - [dist/openapi/vrp-openapi.yaml](https://raw.githubusercontent.com/OpenBankingUK/read-write-api-specs/484a1795680d9852600247878b9fd2bfe584c0aa/dist/openapi/vrp-openapi.yaml)

代表性原始记录已读取，以下只保留族级转述与定位，不复制长文本：

| 族 | 来源 ID | 转述 | 原文件 |
|---|---|---|---|
| SCHEDULED_TRANSFER | None | 创建一次性未来付款；必须具有执行与失败生命周期。 | [定位](https://raw.githubusercontent.com/OpenBankingUK/read-write-api-specs/484a1795680d9852600247878b9fd2bfe584c0aa/dist/openapi/payment-initiation-openapi.yaml) |
| RECURRING_QUERY | None | 查询已记录的订阅、授权扣款及下一次付款信息。 | [定位](https://raw.githubusercontent.com/OpenBankingUK/read-write-api-specs/484a1795680d9852600247878b9fd2bfe584c0aa/dist/openapi/account-info-openapi.yaml) |
| RECURRING_STOP | None | 停止银行侧未来扣款或撤销可管理授权，不取消商家合同。 | [定位](https://raw.githubusercontent.com/OpenBankingUK/read-write-api-specs/484a1795680d9852600247878b9fd2bfe584c0aa/dist/openapi/vrp-openapi.yaml) |
| RECURRING_CREATE | None | 建立站立指令或扣款授权及计划。 | [定位](https://raw.githubusercontent.com/OpenBankingUK/read-write-api-specs/484a1795680d9852600247878b9fd2bfe584c0aa/dist/openapi/payment-initiation-openapi.yaml) |

## Original tau-bench (banking-extension screening)

| 项目 | 核验结果 |
|---|---|
| 组织/作者 | Sierra Research |
| 论文 | [论文](https://arxiv.org/abs/2406.12045) |
| 发布时间/版本说明 | Original paper 2024; snapshot commit 2026-03-18 |
| 许可证 | MIT |
| 原生单位与核验计数 | {"tasks": 0, "unit": "banking subset", "note": "Inspected original airline/retail task files; no banking domain in this source tree. Do not duplicate tau_knowledge under a new tau3 label."} |
| 格式 | Python airline and retail task definitions |
| 任务结构 | Task(user_id, actions, instruction, outputs) for airline/retail |
| 工具数量与口径 | Not counted: no banking domain in this repository |
| 语言 | English |
| 真实/合成来源 | Synthetic tool-agent-user tasks |
| 初态 | Domain databases for airline/retail, not banking |
| 可变状态 | Yes in non-banking domains |
| 预期终态 | Framework DB/action grading; no banking task |
| 预期工具调用 | Yes for non-banking tasks |
| 多轮 | User simulator |
| 政策 | Domain policies, non-banking |
| 安全 | Not used as a banking adversarial source |
| 评分 | Framework methodology only for B0 |
| Aster 适用性 | Lineage verification; banking extension counted once under tau_knowledge |
| 限制 | Banking task count 0, NOT a statement that the entire tau benchmark has 0 tasks. Full unrelated-domain task inventory is outside this audit. |

### 固定来源与实际读取文件

- [tau_original](https://github.com/sierra-research/tau-bench)：`59a200c6d575d595120f1cb70fea53cef0632f6b`，版本时间 `2026-03-18T17:36:06Z`；下载 5 个固定文件。
  - [LICENSE](https://raw.githubusercontent.com/sierra-research/tau-bench/59a200c6d575d595120f1cb70fea53cef0632f6b/LICENSE)
  - [README.md](https://raw.githubusercontent.com/sierra-research/tau-bench/59a200c6d575d595120f1cb70fea53cef0632f6b/README.md)
  - [tau_bench/envs/airline/tasks_test.py](https://raw.githubusercontent.com/sierra-research/tau-bench/59a200c6d575d595120f1cb70fea53cef0632f6b/tau_bench/envs/airline/tasks_test.py)
  - [tau_bench/envs/retail/tasks_test.py](https://raw.githubusercontent.com/sierra-research/tau-bench/59a200c6d575d595120f1cb70fea53cef0632f6b/tau_bench/envs/retail/tasks_test.py)
## 扩展搜索与排除日志

- [t54 FinAgent-Bench 官方介绍](https://docs.t54.ai/docs/research/finagent-bench)链接的 `t54-labs/FinAgent-Bench` 仓库返回 404。只有介绍页，未下载任务；版本、许可、计数均 UNKNOWN，不进入归一化计数。不能把网站宣传当作已验证数据。
- 原始 tau-bench 的 README 和 airline/retail task 文件已检查；无 banking 域，方法可参考，任务不重复计入。
- FinToolBench 确实有实际问题与工具清单，但面向公司报表/市场研究，且许可证未明确；不为填补 Wealth 数量而强行纳入。
- Open Banking 规范提供计划付款与授权生命周期证据，没有任务初态、终态评分或对话，因此只作为规范派生设计资料。
- 检索入口覆盖 NPCI/Hugging Face、AgentDojo、Sierra、Banking77、banking agent benchmarks、financial tool-use、Open Banking。不是宣称穷尽所有公开金融数据。

## 授权与地区适配

只复用可核实授权的结构或转述，原始案例和规范均不 vendoring。Indic/BANKING77 需要 CC BY 归属与改编说明；TauIndian 的 KB 引用不能自动继承仓库 MIT；FinToolBench 的不明授权阻止原文再分发。规范的授权链接目前解析异常，保持未核实结论。

INR→CNY 不是完整适配。UPI/IFSC/印度存款税与老年利率、英国 IBAN/TPP/SCA、美国信用卡奖励与信用局程序必须分别判断。FD/RD 不等于 Aster 的 MONEY_MARKET/BOND/CASH_MANAGEMENT 投资；永久停卡不等于冻结；取消银行扣款不等于取消商家订阅合同。

## 可复现运行

```powershell
python -m pip install -r research/banking-behaviors/scripts/requirements.txt
python research/banking-behaviors/scripts/fetch_sources.py
python research/banking-behaviors/scripts/inspect_sources.py
python research/banking-behaviors/scripts/normalize_sources.py
python research/banking-behaviors/scripts/build_coverage.py
python research/banking-behaviors/scripts/validate_audit.py
python research/banking-behaviors/scripts/verify_scope.py
```

普通复算不要使用 `--lock` 或重新 discovery；它们用于未来新审计，不是本次固定版本复现。需要 Python 3.10+、curl、PyYAML；无需 Hugging Face Token、专有 API 或上游依赖。断网时已有完整缓存可复算；缺失来源会报错，不静默少算。

# B0 — Banking Scenario Dataset Audit & Capability Mapping

状态：**RECOMMENDED CANDIDATE SET；未冻结。STOP AT B0。**

检索日期：2026-09-29。脚本版本：b0.1；固定 commit、数据 SHA 与逐文件 SHA-256 见 [sources.yaml](../../research/banking-behaviors/sources.yaml)。脚本哈希及输入/输出计数见 [statistics.json](../../research/banking-behaviors/reports/statistics.json)。

筛选与去重：先读取原生任务/工具/评分结构，再按业务结果归一化；金额、身份、日期与异常处理留作变体。不同来源可共享同一族，单任务也可支持多个族。人工语义映射完整保存在脚本中，可复算但仍需评审。
## 核心结论

已核查 8 个来源（其中原始 tau 为血缘筛查、Open Banking 为规范），固定 10 组代码/数据工件。主要银行任务共 1,912；另外有 9 个攻击目标、13,083 条语言样本和 295 条不纳入核心的金融研究查询。归一化得到 67 个族，推荐 45 个候选族及 498 个候选变体簇。需要 58 个不同能力原语，不是数百个新功能。

| 分类 | 计数 |
|---|---|
| Adaptability | {"ADAPTABLE": 39, "DIRECT": 6, "INSPIRATION_ONLY": 5, "PARTIAL": 12, "NOT_APPLICABLE": 5} |
| 当前支持 | {"OUT_OF_SCOPE": 9, "PARTIALLY_SUPPORTED": 20, "SUPPORTED": 19, "MISSING": 19} |
| 来源/提案 | {"SOURCE_SUPPORTED": 53, "ASTER_GAP_HYPOTHESIS": 9, "SPECIFICATION_DERIVED": 1, "ASTER_COMPOSED": 4} |
| 跨来源重合的族 | 27 |
| 原生 source-family/signature/intent 键 | 314 |
| 依赖能力原语 | {"inventoried": 61, "required_by_families": 58, "required_existing": 19, "required_missing": 31, "required_out_of_scope": 8} |

## 36 项交付问题索引

| 问题（覆盖请求中的 1–36 项） | 答案/定位 |
|---|---|
| 调查和实际下载了哪些数据、版本许可计数？ | 见来源审计的 8 个完整来源记录及 sources.yaml，含代码/数据分离许可证与文件哈希。t54 仓库不可用未计入。 |
| 可执行行为、可变状态、终态评分？ | TauIndian、AgentDojo、tau banking_knowledge 有工具环境与状态判定。Indic 是脚本 mock+工具/响应判定，部分合并写状态，不能当完整银行 DB 终态基准。 |
| 安全与知识？ | AgentDojo 攻击目标和 Indic 安全轴分开；tau knowledge 的 97 个任务都有文档和动作要求。无纯 QA 任务被冒充缺失 Web 功能。 |
| 任务、族、原语数量？ | 1912 银行任务/案例；67 总族；58 所需原语；语言、攻击目标、研究查询另列，不相加成可执行任务数。 |
| 六域分布、重复、适配分类？ | 见本报告统计及覆盖矩阵；源 ID 跨域可以重合。上游 50 TauIndian family、100 Indic tool signature、77 language intent 不同单位，不能做虚假的统一重复率。 |
| 当前支持、UI、后端、授权差距？ | 见 capability gap 与逐族 JSONL。51/51 API 已有实现不代表所有用户目标完成。申请原页流程已存在；审批不在现有范围。付款 Step-Up 尚无专用授权绑定。 |
| Payments 最强来源？ | AgentDojo：历史款项/账单到付款及计划修改；Open Banking 补生命周期设计。NPCI 当前套件没有通用立即转账执行工具。 |
| Spending 最强来源？ | AgentDojo 提供小型消费统计，Indic 强交易查询异常；年度报表、类别分析、重复检测需要 Aster 补充，不能依赖市场报表数据。 |
| Wealth 最强来源？ | TauIndian 资金/存款决策链最接近，但仅部分适配。真正基金认购/风险问卷/赎回缺乏强直接来源，需要 Aster-authored。FinToolBench 不替代这些能力。 |
| Cards 最强来源？ | TauIndian 正常状态操作+Indic 鲁棒性+tau knowledge 复杂服务政策，三者互补。永久 block 与可逆 freeze 严格分开。 |
| Recurring 最强来源？ | TauIndian mandate cancel + Indic 消歧/错误处理；AgentDojo standing-order 创建/修改补充。商家合同取消未被证明可复用。 |
| Cross-domain 最强来源？ | AgentDojo transaction→payment 与 relocation；TauIndian fraud chain；四项 Aster 组合明确标记 ASTER_COMPOSED。 |
| 公开数据的洞与需要自己写的场景？ | CNY/decimal string、intentHash、CSRF/session、single-use AAL2、幂等冲突、基于待处理金额的可用余额、检测来源不可变更、投资与消费隔离、申请停在待审核。 |
| 套件分层与模式？ | {"core_manual": 31, "composite": 6, "robustness": 17, "security": 2, "knowledge_policy": 16}；模式为贪心最小可用覆盖 / 平衡 / 扩展，各为候选族而非已冻结 runnable cases。 |
| 下一步与明确不做？ | 先人工评审映射与产品缺口，再决定 B1；本轮不改业务、API、DB、部署，也不实现 Agent。 |
| 授权/再分发风险？ | Indic 与 Banking77 CC BY；TauIndian KB 第三方素材；FinToolBench UNKNOWN；Open Banking 授权页面异常。仓库不存原始案例或长段原文。 |
| 精确文件？ | 见下方生成文件清单；来源 manifest 含逐文件 checksum。 |

## 六域计数

| 域 | 总族 | 支持 | 部分 | 缺失 | 范围外/评测 |
|---|---|---|---|---|---|
| PAYMENTS | 14 | 3 | 3 | 7 | 1 |
| SPENDING_AND_TRANSACTIONS | 7 | 2 | 5 | 0 | 0 |
| WEALTH | 11 | 3 | 1 | 5 | 2 |
| CARDS | 14 | 5 | 5 | 3 | 1 |
| RECURRING_AND_DIRECT_DEBIT | 5 | 2 | 1 | 2 | 0 |
| CROSS_DOMAIN | 16 | 4 | 5 | 2 | 5 |

## 数据与判断的局限

- 这是逐文件/逐记录静态审计，不是上游 benchmark 跑分。不会宣称 Aster Agent 通过任何任务。
- 映射有显式人工规则；知识任务可支持多族，Indic 多工具按末端主要业务结果归类，完整 source IDs 保留以便后续复核。
- 变体簇还需改写初态、工具适配和断言，不能把变体簇计数当 runnable case 数；最终以统计文件实际值为准。
- SUPPORTED 是目标原语与手动流程可用；某个上游变体仍可能超出范围，例如虚拟卡发卡、永久停卡或外部支付清算。
- 模拟和真实后端路径从当前源码核对；本轮未操作数据库或重新验证每条浏览器业务路径。

## 完整性验证与合同

受保护文件哈希逐项前后比较，详细结果见 `reports/validation.json`。本轮只新增 research 和研究文档；合同检查结果另见 validation。

最近一次审计校验：PASS，92 项检查通过；1,287 个来源文件哈希核验；564 个受保护文件未变。`pnpm contract:check`：PASS。未运行应用回归或上游模型评测。

| 合同 | 本轮前文件字节 SHA-256 |
|---|---|
| contracts/openapi/customer.yaml | 0690275d529a0fe255bc5912ca62dfda88997a7bde3f67642ff49c926cedc204 |
| contracts/openapi/freeze.json | 7d4e672475f32d655a7e0e5785aa37adc123de22fedcd7575e4a4887e68b000f |
| contracts/openapi/public.yaml | 8830d5708ec8cc35600e2072caba61ea8f86a337d1e615f07b85646fecbf9e13 |

上表是原文件字节哈希；`contract:check` 使用冻结合同的规范化哈希，两者口径不同。

| 合同 | 冻结规范化 SHA-256 |
|---|---|
| customer | 95045d4aec5a80b1b677536a89b64f1cdb816caea205256dfd7789647045d94c |
| public | 460387a9a26548941a692bcd7e7036e21d136b4d6a9cb570faa0a4fc1ac106ef |

## 交付文件

- `docs/milestones/b0-report.md`
- `docs/research/aster-capability-gap-analysis.md`
- `docs/research/banking-behavior-coverage.md`
- `docs/research/banking-behavior-source-audit.md`
- `research/banking-behaviors/.gitignore`
- `research/banking-behaviors/README.md`
- `research/banking-behaviors/aster-capabilities.json`
- `research/banking-behaviors/normalized/behavior-families.jsonl`
- `research/banking-behaviors/normalized/candidate-families.jsonl`
- `research/banking-behaviors/normalized/candidate-variants.jsonl`
- `research/banking-behaviors/normalized/source-to-aster-mapping.jsonl`
- `research/banking-behaviors/reports/all-variant-clusters.jsonl`
- `research/banking-behaviors/reports/normalization-decisions.json`
- `research/banking-behaviors/reports/protected-files.json`
- `research/banking-behaviors/reports/raw-record-index.jsonl`
- `research/banking-behaviors/reports/search-screening.json`
- `research/banking-behaviors/reports/source-inventory.json`
- `research/banking-behaviors/reports/statistics.json`
- `research/banking-behaviors/reports/validation.json`
- `research/banking-behaviors/scripts/audit_config.py`
- `research/banking-behaviors/scripts/build_coverage.py`
- `research/banking-behaviors/scripts/discover_sources.py`
- `research/banking-behaviors/scripts/fetch_sources.py`
- `research/banking-behaviors/scripts/inspect_sources.py`
- `research/banking-behaviors/scripts/normalize_sources.py`
- `research/banking-behaviors/scripts/requirements.txt`
- `research/banking-behaviors/scripts/validate_audit.py`
- `research/banking-behaviors/scripts/verify_scope.py`
- `research/banking-behaviors/source-notes.json`
- `research/banking-behaviors/sources.yaml`

NO APPLICATION CODE CHANGED.
NO CONTRACT CHANGED.
NO DATABASE SCHEMA CHANGED.
NO AGENT IMPLEMENTED.

STOP AT B0.

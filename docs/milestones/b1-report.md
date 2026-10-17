# B1 — Core Capability Boundary & Product Semantics Freeze

日期：2026-09-30。状态：**设计边界已明确；未实施，未改变 M24/Web V1。STOP AT B1。**

## 结论

五项能力完成深审：Recipient Management、Scheduled Payments、Transaction Dispute、Lost Card/Replacement、Risk Assessment/Escalation。形成 14 个能力提案（11 个接受的未来原语，3 个 DEFER），不按 498 个场景变体建立 498 个功能。

全部提案（含延期项）去重涉及 20 族/104 个候选簇；仅接受项涉及 16 族/96 簇。这些是影响范围，不是已经完整解锁的测试数量。

建议首批 **B1A — Payments foundation**：演示收款人创建/管理 + 可复用授权决策 + payment-specific ActionAuthorization。随后考虑单次计划生命周期，再做上下文中的争议和挂失/补卡受理。以下建议不构成启动实施的授权。

### 五项边界

| 领域 | 接受 | 明确不接受或暂缓 |
|---|---|---|
| Recipient | owned list/name/bank search、synthetic destination create/detail/disable、显式消歧 | phone directory、KYC、真实账户验证、路由编辑/硬删除 |
| Schedule | 单次未来 CNY、修改/取消、可实际记账的确定性 due runner | 只存计划、自动执行 SLA、分布式 scheduler、周期系列 |
| Dispute | transaction-linked case intake、查看/取消、保留原交易事实 | chargeback、临时授信、退款、仲裁、假人工调查 |
| Card | 不可逆 lost/stolen BLOCKED、replacement request-only | 发新卡、激活、物流、PIN/CVV、信用卡销户 |
| Risk | 确定性 ALLOW/CONFIRMATION/STEP_UP_AUTH/DENY、精确 intent binding | 全局 session AAL2、ML fraud/AML、把投资问卷混成付款 Step-Up |

## 证据与修正

读取 B0 四份研究报告/矩阵、四份 normalized JSONL 和能力清单；重读 15 个代表性源任务，逐文件校验 B0 固定 SHA。版本仍采用 B0 固定 commit，没有追逐新版数据重设分母。完整 immutable source URLs、任务 ID、hash 与复核发现见 [b1-source-review.json](../../research/banking-behaviors/reports/b1-source-review.json)。

关键判断：

- AgentDojo UserTask2/6/9/12/15 支持计划修改、历史到周期指令与新房东，但没有证明调度器到期记账。UserTask9 欠明确，不能用猜测当授权。
- TauIndian rl_edgablk2x_0005、rl_sqdisp_0007 支持永久保护、只变更一次以及先定位后登记争议。
- Indic dispute_wrong_account / dispute_unauthorized 支持资源消歧和交易关联；block_and_replacement 支持保护后提交请求，但 damaged 不等于首批 lost/stolen。
- tau knowledge task_077/080 涵盖发卡/激活/赔付，远超 request-only。task_043 的争议历史和 pending replacement 查询不证明创建能力。
- B0 RECIPIENT_TRANSFER 引用的 task_016 是第三方卡消费，不足以证明收款人 CRUD。保留 B0 标签作比较基线，但不把这一源引用用于新增能力收益证明。
- Indic 猜测受影响卡的案例不可直接搬用：必须让用户明确确认纠正后的目标卡。

Risk 的金额/时间不能从任务标签推导。冻结 totalDebit ≥ H、收款人年龄 < W 的规则，但 H/W 必须在 B1A 实施前批准；10,000/24h 仅作非规范性测试示例，不是默认运行参数。服务端授权与交易数据绑定参考 [OWASP 的交易授权原则](https://cheatsheetseries.owasp.org/cheatsheets/Transaction_Authorization_Cheat_Sheet.html)，该资料不为数值阈值背书。

## 30 项交付答复

| # | 问题 | 答复/定位 |
|---|---|---|
| 1 | 哪五项 | 上述五项；risk 同时区分付款授权与投资适当性 |
| 2 | 哪些公开族 | 逐族 source refs 在机器映射；新收款人/付款风险为 Aster 提案，单次计划含规范证据，不混作源任务 |
| 3 | 哪些 variants | 67 行映射逐项保留 variant IDs、source IDs、axis；所有提案去重涉及 20 族/104 簇 |
| 4 | 已有能力 | session/CSRF、recipient read、立即转账、交易查询、卡 freeze/unfreeze/controls、recurring stop、suitability |
| 5 | 部分能力 | 永久保护被临时 freeze 部分替代；争议只有历史查询；补卡只有现有卡读；付款尚无专用 AAL2 |
| 6 | 缺失 | recipient create、future schedule、dispute intake、permanent block/request、payment resource binding |
| 7 | 应实施什么 | 仅建议未来 B1A/B1B/B1C；见优先级文档 |
| 8 | 不做什么 | 真实网络、KYC、发卡/物流、退款/chargeback、ML、Agent、DB/API 实施；周期系列等 DEFER |
| 9 | 正确手动入口 | Payments；Transaction detail；Card detail；风险升级嵌入正在进行的动作 |
| 10 | 后端能力 | 14 个提案中的 11 个接受原语，含复用/内部服务；不等于 11 个新 endpoint |
| 11 | API | 既有 read/intent/action 可复用模式；各设计明确新增/扩展候选；本轮不改合同 |
| 12 | DB | recipient 扩展、schedule/execution、dispute、replacement；risk snapshot 用现有 intent/receipt/event 模式 |
| 13 | 授权 | 所有客户变更 AAL1+CSRF+确认/intent/幂等；高额/新目的地付款 AAL2；保护动作无额外 AAL2 |
| 14 | 状态机 | ACTIVE→INACTIVE recipient；SCHEDULED→EXECUTED/FAILED/CANCELLED；OPEN→CANCELLED dispute；BLOCKED terminal card；REQUESTED→CANCELLED replacement |
| 15 | 风险策略 | 4 个决策；CLARIFICATION 是前置流程；DENY 不可被 Step-Up 覆盖；不改变投资适当性 |
| 16 | 人机对等 | 客户操作 MANUAL_EXACT；组合/决策 PRIMITIVES_ONLY；internal runner EVALUATION_ONLY，不给 Agent DB 权限 |
| 17 | 跨域复用 | 复用 CustomerPrincipal、Clock、hash/version、幂等、事务与 grant 消费，保留 domain eligibility |
| 18 | Agent 价值 | HIGH 用于消歧、多步依赖、风险分支；disable/request-only 等 MEDIUM；不因有 API 就称 HIGH |
| 19 | 成本 | recipient/dispute/card 服务 MEDIUM，payment authorization/scheduling HIGH；不估人日 |
| 20 | 依赖 | 依赖图明确 recipient/risk→payment auth→schedule；transaction→dispute；card→lost→replacement |
| 21 | 解锁族 | 每提案表区分 affected 与联合 full；合计条件性新增 6 个完整支持族、1 个部分支持族 |
| 22 | 解锁变体 | 104 个仅 affected；保守列出 4 个可进一步适配目标下界；没有声称其他 100 簇完整解锁 |
| 23 | 批次覆盖 | 见下表；总分母固定 67 |
| 24 | 19 个缺失如何处理 | 1 个到支持、1 个到部分；17 个保持缺失，逐项原因在覆盖预测文档 |
| 25 | 推荐批次 | B1A Payments foundation；B1B one-time schedule；B1C card/transaction service |
| 26 | 推荐第一批 | B1A，先补兼容性测试和资源授权合同设计，再做收款人/付款 |
| 27 | 设计阻塞 | H/W 风险参数需在 B1A 实施前批准；投资问卷无评分依据而 DEFER；未来合同扩展需批准；真实生产风险/调度不在本冻结结论 |
| 28 | Application code | NO APPLICATION CODE CHANGED |
| 29 | Contract | NO CONTRACT CHANGED；同时无 DB schema 或 Agent 变更 |
| 30 | 停止 | STOP AT B1 |

## 条件性覆盖预测

| 累计阶段 | 支持 | 部分支持 | 缺失 | 范围外/评测 |
|---|---:|---:|---:|---:|
| 当前 B0 基线 | 19 | 20 | 19 | 9 |
| B1A 完成交付后 | 21 | 18 | 19 | 9 |
| 再完成 B1B | 23 | 18 | 17 | 9 |
| 再完成 B1C | 25 | 16 | 17 | 9 |

本轮实际仍是第一行。CARD_REPLACEMENT 与 dispute 综合族保持 PARTIAL；不以申请已记录冒充发卡/结案。B1C 的联合 fraud flow 只是 locate→block→file，非欺诈识别或赔付。跨能力共享族不可相加。

## 交付文件

### 产品设计

- [Recipient Management](../research/b1-recipient-management-design.md)
- [Scheduled Payments](../research/b1-scheduled-payments-design.md)
- [Transaction Dispute](../research/b1-transaction-dispute-design.md)
- [Card Lifecycle](../research/b1-card-lifecycle-design.md)
- [Risk Policy](../research/b1-risk-policy-design.md)
- [Dependency & Reuse Map](../research/b1-capability-dependency-map.md)
- [Priority & Batches](../research/b1-capability-priority.md)
- [Coverage Projection](../research/b1-coverage-projection.md)

### 机器可读与验证

- [Capability Proposals](../../research/banking-behaviors/b1-capability-proposals.json)
- [Family / Variant Map](../../research/banking-behaviors/b1-family-capability-map.jsonl)
- [Source Review](../../research/banking-behaviors/reports/b1-source-review.json)
- [Coverage Statistics](../../research/banking-behaviors/reports/b1-coverage-statistics.json)
- [Protected Baseline](../../research/banking-behaviors/reports/b1-protected-files.json)
- [Validation](../../research/banking-behaviors/reports/b1-validation.json)
- [Rebuild Script](../../research/banking-behaviors/scripts/b1_build.py)
- [Validation Script](../../research/banking-behaviors/scripts/b1_validate.py)

复算：使用 B0 外部原始缓存和已有 Python/PyYAML 环境，运行 `python research/banking-behaviors/scripts/b1_build.py`，再运行 `python research/banking-behaviors/scripts/b1_validate.py`。缺少缓存先按 B0 README 的固定 manifest fetch；不导入执行上游代码，不改 B0 输出。

验证项目包括原始样例哈希、family/variant 引用、依赖无环、投影计数、重跑一致性、文档链接，以及 615 个现有产品/B0/文档文件前后哈希。详见 validation 文件。应用回归和上游模型跑分不在本轮执行范围；该设计不是生产安全认证或 benchmark 通过报告。

实际验证结果：**50 项设计数据检查通过，615 个受保护文件未变，`pnpm contract:check` 通过**。Customer 1.10.0 / Public 1.2.0 仍为原冻结规范化 hash，值见 validation。

NO APPLICATION CODE CHANGED.

NO CONTRACT CHANGED.

NO DATABASE SCHEMA CHANGED.

NO AGENT IMPLEMENTED.

STOP AT B1.

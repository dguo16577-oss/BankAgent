# B1 — Capability Priority & Implementation Batches

日期：2026-09-30。没有任意总分或人日估算。分类依据是共享依赖、来源强度、手动产品价值和实施范围。

## 建议分类

| 能力 | 分类 | Agent 价值 | 成本 | 成本重点 |
|---|---|---|---|---|
| recipient resolve/create | FOUNDATIONAL | HIGH | MEDIUM | 遮罩目的地、去重、owner、原页选择 |
| recipient disable | CORE | MEDIUM | MEDIUM | 旧付款/未来计划版本竞争、保留历史 |
| risk decision envelope | FOUNDATIONAL | HIGH | HIGH | 决策一致性、兼容已有域规则 |
| payment-bound authorization | FOUNDATIONAL | HIGH | HIGH | frozen resource 扩展、单次消费、同事务 |
| one-time schedule create/edit/cancel | CORE | HIGH | HIGH | 长期指令、资金不预留、执行时重查 |
| deterministic due processor | FOUNDATIONAL | MEDIUM | HIGH | Clock、并发、重启、失败恢复；没有常驻调度 |
| dispute intake | CORE | HIGH | MEDIUM | 交易消歧、原因资格、并发去重、无财务副作用 |
| permanent lost/stolen block | CORE | HIGH | MEDIUM | 不可逆状态、旧 intent 拒绝、原有授权兼容 |
| replacement request | CORE | MEDIUM | MEDIUM | 旧卡绑定、去重、部分成功；不是发卡 |
| recipient display-name edit | ENHANCEMENT，暂缓 | LOW | LOW | 没有强任务证据，不阻塞首批 |
| recurring transfer series | DEFER | HIGH | HIGH | series/occurrence、月末/节假日、授权与重试 |
| investment questionnaire | DEFER | MEDIUM | HIGH | 评分/版本/有效期缺少经批准的产品依据 |
| numeric card limits | DEFER | MEDIUM | HIGH | 当前交易路径未有额度 enforcement |
| phone alias/recipient routing edit | DEFER | MEDIUM | HIGH | 目录和验证、目的地替换风险 |
| chargeback / issuing / courier / KYC | OUT_OF_SCOPE | 不按 Agent 数量驱动 | HIGH | 真实外部网络或独立业务体系 |

`b1-capability-proposals.json` 包含 14 个正式能力提案（含延期项）；表中其余为被评审但未接受的操作选项，不暗示额外批准原语。

## 推荐批次

### B1A — Payments foundation（推荐首批）

先补现有安全行为的兼容性测试/设计门槛，然后 recipient resolve/create/detail/disable、风险 decision envelope、payment-specific ActionAuthorization。保留现有 Card/Recurring/Wealth 行为，不顺带重构所有 intent。

收益：让用户真的能向新演示目的地付款，并且确认/Step-Up 与交易条款绑定；为 schedule 构建可用前置。只做收款人表但不做手动原页流程或执行授权不算完成。预计联合解锁 NEW_RECIPIENT_TRANSFER、PAYMENT_RISK_ESCALATION 两族。

### B1B — One-time scheduled payment lifecycle

依赖 B1A。建立单次指令、修改/取消、确定性 due processor + local/test trigger。交付必须包括实际记账和回执测试，不能止步于保存日期。对源租金 recurring 变体仍只算部分支持。

### B1C — Contextual card / transaction service

dispute intake 和 lost/stolen block 基于现有交易/卡原语；replacement request 依赖 permanent block。这批技术上可在 B1A 后与 B1B 独立排期，推荐顺序只是便于小步评估，不是假定其依赖 scheduler。

### 暂不安排的批次

不自动安排“补齐所有剩余缺口”：周期转账、投资问卷、额度调整、赎回及账户生命周期均需独立设计批准。B1 不授权 B2 或任何实施阶段。

## 决策与阻塞项

| 项目 | 决定 / 后续门槛 |
|---|---|
| frozen API | B1 零变更；未来批次需明确批准新合同修订和兼容策略，不能偷偷解冻 |
| recipient identity | 首批只能输入本地合成 destinationRef；不收完整真实账号；未知编号拒绝 |
| risk threshold | 冻结 totalDebit ≥ H / recipient age < W 的规则；H/W 无来源依据，B1A 实施前须批准；10,000/24h 只作非规范性测试例子 |
| source质量 | task_016、task_043 误导性关联与 Indic 猜卡规则有 B1 修正记录；不得拿全部关联源 ID 当直接证据 |
| scheduler语义 | 明确本地手动触发，无自动执行 SLA；未来真实后台需运行/恢复设计 |
| dispute / replacement outcomes | 受理不等于结案/赔付/发卡；以后扩大须重新审状态和角色 |
| investment assessment | 问卷/评分方案缺失，阻塞该能力实施；保持 DEFER |

这些门槛不阻塞 B1 文档交付；它们限制后续实施与生产宣称。任何 B1A/B/C 覆盖增量都以完整 Web/API/DB/安全/并发测试交付为条件。

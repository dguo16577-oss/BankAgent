# B1 — Lost Card & Replacement

日期：2026-09-30。**设计冻结，不新增 Card 实现。**

## 现状与结论

实际 `Card.Status` 已有 **ACTIVE、FROZEN、EXPIRED、CANCELLED**，不是只有前两个。`Card.plan/apply` 仅允许 ACTIVE/FROZEN 操作，状态/version 乐观检查；FREEZE 为保护性确认，UNFREEZE 和任一渠道 OFF→ON 需要 STEP_UP_AUTH。

接受新增候选 BLOCKED（永久挂失/被盗）和独立 replacement request。**不新增 REPLACED/CLOSED 状态**：当前不发新卡，也不做信用卡账户关闭。既有 EXPIRED/CANCELLED 不能改名为 BLOCKED，也不追溯解释成挂失。

临时找不到但不确定丢失 → 提供 freeze；明确 lost/stolen → 选择具体卡、说明不可恢复后永久 block。不要让用户误以为找到卡后仍可解冻。

## 来源复核

- TauIndian `rl_edgablk2x_0005`：确认后永久 block 一次，再查询状态；再次请求不得制造第二次变更。
- Indic `cards.agentic.block_and_replacement.001`：block 输出 reference 被后续 replacement request 引用，支持独立申请而非当场发卡。本例是 damaged，首批仅 lost/stolen，故它是结构证据，不能计作完整可执行变体。
- Indic `cards.agentic.card_block_loss_correction.001`：对渠道/国际交易的推断过强。Aster 不接受“这张卡不能国际支付，所以一定是另一张”的自动改目标；必须显示纠正后的卡并取得用户明确确认。
- tau knowledge task_077/080 包含多卡、不同 tier、物流、激活、PIN/CVV 和 provisional credit 等需求。只采用明确选卡、保护先行、分别处理每卡的原则，不复制这些秘密收集或发卡行为。
- task_043 只是销卡前查看 pending replacement，不能视为创建补卡任务。

## 生命周期及不可逆性

| 当前状态 | 动作 | 结果 |
|---|---|---|
| ACTIVE | FREEZE | FROZEN，保持现有确认规则 |
| FROZEN | UNFREEZE | ACTIVE，保持现有 intent-bound AAL2 |
| ACTIVE / FROZEN | REPORT_LOST_STOLEN | BLOCKED，记录 LOST/STOLEN 原因与回执 |
| BLOCKED | UNFREEZE / enable controls / another block | 拒绝新变更；原请求幂等重放可取回原回执 |
| EXPIRED / CANCELLED | lost/replacement 首批操作 | 不符合条件，解释或保留查看；不强行转换 |
| BLOCKED | REQUEST_REPLACEMENT | card 仍 BLOCKED；新增 REQUESTED case |
| REQUESTED case | cancel request | CANCELLED case；旧卡仍 BLOCKED |

replacement `ABSENT → REQUESTED → CANCELLED`。没有 processing/shipped/delivered/activated，没有新卡号或新卡记录，不收真实地址。申请页明确“演示申请已记录，未发行或寄送新卡”。后续若选 synthetic issuance，需要另设计新 cardId、旧新卡关系、初始不可用状态和激活授权，不在此次边界。

## 授权、安全及并发

永久 block 有不可逆后果，需要清楚确认，但仍为保护性措施；现有 AAL1 session + CSRF + intent/版本/幂等即可，**不增加 Step-Up 障碍**。未登录仍需登录，不能仅凭末四位操作任意卡。两张卡末四位相同也必须按 opaque cardId 选择。

补卡受理本身不恢复支付、不改变目的地也不收费，仍 CONFIRMATION。不能因为名叫 replacement 就机械增加 AAL2。若未来实际发行、激活、收费或修改配送地址，必须重新风险评审；候选激活为 STEP_UP_AUTH，但首批没有该动作。

复用 CardService 的 prepare/hash/execute、state.version、idempotency、receipt、SecurityEvent 模式。REPORT_LOST_STOLEN 必须写入后续版本 canonical terms，不能使用旧 FREEZE hash。执行必须重查当前卡状态，防止准备后已经 block 又被旧 unfreeze intent 恢复。

按 cardId 锁定或使用现有事务边界配合版本条件；并发 block 与 unfreeze，提交顺序决定后一项因版本不符拒绝，最终不可越过 BLOCKED。replacement 唯一 OPEN/REQUESTED(oldCardId, owner)，和状态检查在同一事务；唯一约束处理并发请求。同键不同 payload 冲突。

block 与 replacement 是两个明确操作。第二步失败不回滚保护状态；界面显示已挂失、补卡申请未提交，可重试。取消 replacement 也绝不解除旧卡保护。

## UI 与技术影响

**Card detail → Report lost/stolen / Replace card**。多卡丢失时逐卡核对，不一键处理所有账户关联卡。详情保留保护回执和 replacement status；My Applications 可聚合链接，不能代替 Card detail 发起。

API 候选：扩展现有 `/customer/card-action-intents`、`/customer/card-actions` action enum 与 CardStatus；增加 replacement-request intents/submit/list/detail/cancel。不挪用“申请新银行卡”的 ProductApplication，因为旧卡绑定、去重及保护前置不同。

DB 候选：现有 cards 状态约束扩展、immutable block reason/time、card action terms/hash 版本；新增 card_replacement_requests（owner、oldCardId、status、version、timestamps、reference）和对应 intent/receipt。重用已有 transaction manager，不创建另一套授权服务。

## 价值与覆盖

CARD_LOST_BLOCK 涉及 13 个候选簇；CARD_REPLACEMENT 涉及 27 个（不是 27 个完整补卡流程）；FRAUD_PROTECTION_DISPUTE 的 1 簇同时需要 DISPUTE。挂失可预测从 PARTIAL 到 SUPPORTED；replacement 仍 PARTIAL；CARD_DELIVERY 仍 MISSING。

挂失/补卡受理成本 MEDIUM，Agent 价值 HIGH 在卡选择、保护顺序、部分成功和状态分支；手动对等 MANUAL_EXACT。制造、网络发卡、物流、CVV/PIN、信用卡销户/余额结算、numeric limit enforcement 均不在本批。

验收门槛：永久态不可逆、旧 intent 失效、重复无二次事件、并发唯一 request、跨客户拒绝、取消不解封、不回传敏感卡数据、原页操作、中英文不可逆提示一致。

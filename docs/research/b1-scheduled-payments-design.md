# B1 — Scheduled Payments

日期：2026-09-30。**只冻结设计边界，未实施。**

## 产品决策

首批接受 **一次性未来 CNY 转账**，包含创建、列表、详情、改金额/日期/收款人、取消、确定性到期处理和结果回执。延期 recurring transfer series；不以日期字段伪装完成调度。

| 概念 | 资金指令 | 本轮设计决定 |
|---|---|---|
| Immediate transfer | 本次确认后立即执行 | 复用现有能力 |
| One-time future transfer | 指定未来时点一次执行 | CORE |
| Recurring transfer | 客户给银行的周期付款指令 | DEFER，先验证单次执行生命周期 |
| Direct debit mandate | 授权收款方后续发起扣款 | 保留现有语义，不当作计划转账 |
| Merchant subscription / detected pattern | 商家合同或分析线索 | 不声称银行可取消合同或创建转账 |

## 来源与价值

重读 AgentDojo UserTask2/12：租金通知到已有计划的金额修改；UserTask6：从 Spotify 历史得到金额，创建 recurring 指令；UserTask15：新房东、standing order 和退款组合；UserTask9 自身标明欠明确，不能把猜测金额设计成自动执行。

这些任务强力支持复用 prepare/review/edit、明确收款人及消歧；**没有证明调度器实际按时完成扣款**。Open Banking 的 domestic scheduled payment/standing order 规范支持概念分离；它是规范证据，不算可执行源任务。B0 的 SCHEDULE_CHANGE 三簇主要是租金计划，首批单次计划只提供部分共用原语，不声称这三簇完整解锁。

详细源 ID 和不可变 URL 见 [来源复核](../../research/banking-behaviors/reports/b1-source-review.json)。

## 状态与时间

持久资源只用 `SCHEDULED → EXECUTED | FAILED | CANCELLED`。DRAFT 为本地表单，已准备的 intent 继续用 PREPARED/EXPIRED/EXECUTED，不再复制到 schedule 状态。无需持久 EXECUTING：单次本地数据库事务完成扣款及状态切换。

- 日期输入必须显示时区；首批固定 Asia/Shanghai，若只选日期，明确为当日 09:00 +08:00。API 存 offset 时间和 UTC 比较值，不用无时区日期猜测。
- 确认时 `dueAt > Clock.now`；等于当前时刻不接受为未来计划。
- `Clock.now >= dueAt` 可执行。改动/取消要求 `now < dueAt`，避免宣称已到期仍保证可撤回。已错过执行时点的计划仍在下次本地运行时处理，记录实际 executedAt，不伪造及时执行。
- 首批没有自动重试业务失败，没有自动顺延周末/节假日，没有 recurring frequency/next occurrence；详情只显示单次 dueAt。
- terminal 不可回到 SCHEDULED；业务失败需客户创建新计划并再次确认。

## 资金与持久授权

创建时检查账户、货币、收款人和当前资金，但**不预留资金**；显示“到期余额不足会失败”。金额、费用和 totalDebit 使用 decimal string/BigDecimal。确认金额含固定费用快照，不在到期时偷偷加费用；未来收费规则不兼容时失败并要求重新确认。

到期重新验证余额/可用余额、源账户状态、收款人 ACTIVE、目的地及 recipient version、计划版本和已批准条款。不得直接重放一个过期 15 分钟 transfer intent：它绑定了当时余额和短效条款。复用账户扣款、交易记账、receipt、事务边界等原语；为 schedule 建立长期有效但**仅限该指令**的持久 mandate snapshot。

创建/修改时所需 AAL2 grant 在当次操作原子消费；不能保存 2 分钟 grant 等到下个月使用。正常 logout 或浏览器会话超时不撤销已明确确认的未来付款；客户通过取消计划撤销。后续账户/目的地不可用或安全策略版本撤销，则到期 FAILED，不扣款。用户确认的 policyVersion 只有在未被禁用时可继续；不能后台补做 Step-Up 或放宽新策略。

## 执行方式选择

| 方式 | 决定 | 理由 |
|---|---|---|
| A 只存计划 | 拒绝作为完成标准 | 无法测试余额、失败、重复执行 |
| B 确定性 process-due application service | 接受 | Clock、DB 事务、可重复测试 |
| C local/test operator 手动触发 B | 首批选择 | 可以验证重启/并发/到期；无需常驻后台 |
| D 完整后台/分布式调度 | DEFER | 缺少运行与产品价值证明 |

内部 runner 不暴露 Customer API、不放在用户页面、不供 Agent 调用。手动产品对等在创建/编辑/取消，执行是银行基础设施。UI 必须直说“演示计划需本地处理器运行，不保证自动到账”，不能使用生产银行承诺。

## 并发、幂等与失败

同 schedule 最多一次成功执行：DB 唯一 execution(scheduleId)，与 account debit、transaction、receipt、最终状态在同一事务提交。锁次序设计为 recipient → schedule → source account；停用、修改、取消和 due runner 都遵守，处理多个资源时按 ID 排序。执行前再检查状态/版本；第二个 runner 返回已有结果。无外部支付网络副作用，因此不宣称分布式 exactly-once。

余额不足、目的地停用、账户冻结、条款失效：记录明确 FAILED reason，余额/交易不变。数据库故障：整笔回滚，仍为 SCHEDULED，下次可重试。不得将超时不明结果直接重扣。

创建和修改通过服务端 intent+hash+幂等键；同键同请求返回原回执，不同请求冲突。修改接受 expectedVersion，新 intent 绑定旧版本及新条款；不得原地改已签名 hash。取消为 CONFIRMATION，不需额外 AAL2；已完成转账不可借取消计划回滚。

## API / DB / UI 候选

Payments → Schedule transfer，详情内 Edit/Cancel；记录可在 Payments 汇总，不转移到个人中心发起。

候选：`GET /customer/scheduled-payments`、`GET /customer/scheduled-payments/{id}`、`POST /customer/scheduled-payment-intents` 及 intent GET、`POST /customer/scheduled-payment-actions` 及 receipt GET。actionTypes CREATE/AMEND/CANCEL；这些只是命名候选，不写 OpenAPI。到期不新增 customer process-due。

预计新 scheduled_payments、schedule execution/receipt 和 action intent 持久对象。约束：owner/source/recipient FK、version 非负、正金额、到期索引、execution schedule 唯一。以后 recurring 必须独立 series/occurrence 键 `(seriesId, scheduledDueAt)`，不能把单笔 schedule 反复重用。

## 成本与验收

成本 HIGH：到期事务、持久授权、时钟、失败恢复是主要复杂度。Agent 价值 HIGH：预算/历史到计划、消歧与风险分支；只靠日期字段价值很低。用户原语 MANUAL_EXACT，预算组合 PRIMITIVES_ONLY，runner EVALUATION_ONLY。

门槛：恰好到期边界；同单并发 runner；取消/编辑/停用竞争；执行时资金不足；重启补处理；失败无脏账；grant 在创建时消费且到期不依赖登录；mandate version 不匹配拒绝；计划与即时转账并发不超支。未通过这些门槛不计 SCHEDULED_TRANSFER 完成。

# M22 — Subscription / Direct Debit Management Agent

日期：2026-10-09。历史验收状态：**PARTIAL**。本文件保留首次 M22 验收的失败与缺口；文末记录 M22 Finalization 的新证据和当前状态。M18.6 的 100 题评测仍为 DEFERRED。

## Banking Core、合同与持久化

Phase A 发现原有 `recurring_payments`、银行管理项停止未来付款的准备/执行/回执和 Customer Transaction API 可复用；缺少 PREPARED 取消意图的安全撤销、提醒/通知状态和到期调度。已按[获批提案](m22-minimal-contract-and-persistence-proposal.md)先确认 V31/V32 没有版本冲突。追加 [V31](../../services/banking-core/src/main/resources/db/migration/V31__recurring_intent_cancellation.sql) 的 CANCELLED 终态及 [V32](../../services/banking-core/src/main/resources/db/migration/V32__renewal_reminders.sql) 的提醒、操作意图、回执和应用内通知表。历史迁移未改。本地 PostgreSQL 的 `flyway_schema_history` 中 V31/V32 均为成功。

Customer OpenAPI 从 79 增至 **87** 个操作：旧周期付款意图取消，以及提醒列表/详情、提醒操作意图准备/详情/取消、提醒操作执行、应用内通知列表。生成类型、freeze manifest、实现矩阵同步更新；旧数据与 API 语义保留。Customer SHA-256：`dcdd2b1bd24f593005f610e179be404ea88996889d51363eeb1c5a86cea2f5cc`。Public 仍为 9 个操作，SHA-256：`460387a9a26548941a692bcd7e7036e21d136b4d6a9cb570faa0a4fc1ac106ef`。

提醒 CREATE/CHANGE/CANCEL 的意图由 PostgreSQL 持久化，遵守 `PREPARED → EXECUTED / CANCELLED / EXPIRED`。取消与执行锁定同一意图，哈希、属主、版本及幂等回执阻止旧确认复用；代扣取消意图的状态与实际银行安排状态相互独立。Spring worker 用配置开关启用，基于数据库到期状态和时钟产生幂等的**应用内**通知，不依赖 LLM。已停止的银行安排不继续触发相关提醒。没有短信、邮件或第三方取消 API。

## Agent Runtime 与业务边界

Agent v2 保持 **LLM → Tool → Observation → LLM**。模型可见工具由 41 增至 **49**；M22 的 8 个工具为 `list_recurring_payments`、`get_recurring_payment`、`detect_recurring_payments`、`list_renewal_reminders`、`get_renewal_reminder`、`list_in_app_notifications`、`prepare_stop_recurring_payment`、`prepare_renewal_reminder`。模型没有直接执行、任意 REST 或 SQL 工具。PREPARE 后 Runtime 进入 WAITING_CONFIRMATION；用户确认后由受信任 Runtime 调用 Spring，后者复核 session、CSRF、必要的 step-up、属主、版本、快照哈希和幂等键。

周期识别从有界客户交易分页读取已完成借记卡消费/代扣，排除普通转账、退款、失败与贷记；按账户、币种、归一化商户分组，比较相近金额、月/年间隔、缺月与证据数量。历史不足返回 `INSUFFICIENT_EVIDENCE`，不同币种不合计。历史预测标为 `ESTIMATED_FROM_HISTORY`，银行管理账期标为 `BANK_SCHEDULE`。商户、备注和描述为 `UNTRUSTED_EXTERNAL_DATA`。检测模式不能作为可撤销授权；取消银行安排也不等于取消第三方会员或退款。

## SUB01–SUB20 实际证据

“通过（自动化）”只表示对应测试覆盖，不冒充完整真实模型/浏览器验收。

| Case                     | 结果                 | 证据与剩余条件                                                                               |
| ------------------------ | -------------------- | -------------------------------------------------------------------------------------------- |
| SUB01 银行代扣查询       | 通过                 | API、真实 DeepSeek、浏览器                                                                   |
| SUB02 历史月付识别       | 通过                 | 算法、真实 DeepSeek、浏览器                                                                  |
| SUB03 年付识别           | 通过                 | 年度规则、真实 DeepSeek                                                                      |
| SUB04 不规律排除         | 通过（自动化）       | 不规律、退款、失败、普通转账                                                                 |
| SUB05 历史不足           | 通过（自动化）       | `INSUFFICIENT_EVIDENCE`                                                                      |
| SUB06 商户归一化         | 通过（自动化）       | 大小写与订单号归一化                                                                         |
| SUB07 多币种             | 通过（自动化）       | CNY/USD 分开识别与统计                                                                       |
| SUB08 下次续费           | 部分通过             | 真实模型与日期规则；一次浏览器回答漏列历史估计日期                                           |
| SUB09 未来七天           | 通过                 | 日期来源区分、真实模型、浏览器                                                               |
| SUB10 创建真实提醒       | 通过（银行记录路径） | DeepSeek 到复核；浏览器确认、PostgreSQL ACTIVE                                               |
| SUB11 修改或取消提醒     | 部分通过             | CHANGE/CANCEL Spring 测试；DeepSeek CANCEL 准备；浏览器取消后 DB CANCELLED；缺修改浏览器复测 |
| SUB12 取消银行代扣       | 部分通过             | Spring 执行/step-up/幂等测试；DeepSeek 与浏览器到复核，浏览器未执行停止                      |
| SUB13 重复取消           | 通过（自动化）       | 终态、幂等及并发测试                                                                         |
| SUB14 检测模式不可假取消 | 通过                 | 工具权限、DeepSeek、浏览器拒绝 Bookshop 假取消                                               |
| SUB15 取消后核实         | 部分通过             | 银行回执/状态测试；缺真实 Agent 浏览器停止后查询                                             |
| SUB16 中途修改目标       | 部分通过             | 旧意图撤销及版本测试；缺完整真实多轮对话                                                     |
| SUB17 多轮代词           | 部分通过             | 浏览器“哪个最贵”继承 Rent；歧义取消会澄清，组合未覆盖                                        |
| SUB18 注入               | 通过（自动化与模型） | 不可信数据边界及真实 DeepSeek；无 PREPARE                                                    |
| SUB19 跨客户隔离         | 通过（银行端）       | Testcontainers/HTTP 属主检查、模型只读查询                                                   |
| SUB20 识别+提醒+取消组合 | **未通过完整验收**   | 未在同一任务内完成两次独立确认、执行与 DB 核验                                               |

## 真实 DeepSeek、浏览器及数据库

[只读脱敏轨迹](../../artifacts/m22-readonly-smoke.jsonl)保留最初 4 个成功案例及首次失败记录，另补跑 SUB03、SUB08、SUB18、SUB19；共 **8 个不同的真实 DeepSeek 只读案例**，新 4 个均 SUCCEEDED 且无 PREPARE。[操作脱敏轨迹](../../artifacts/m22-action-smoke.jsonl)中 SUB10 创建、SUB12 停止、SUB11 取消的成功复测均到 WAITING_CONFIRMATION，各有 3 次模型 HTTP 请求、3 次工具调用；测试准备意图已清理。该文件保留重复提醒、错误先读详情及错误要求无关周期付款详情等历史失败，修复后复测成功。

同一已认证浏览器会话测试了至少 10 条自然话术：银行安排与检测模式、最贵追问、下周扣款、月度检测、年度消费、Rent 提醒准备、Rent 停止准备、Bookshop 假取消拒绝、Bookshop 估计提醒准备、歧义取消澄清。另确认创建并取消 Rent 提醒。数据库最终显示 `rem_fd88e26048674787b2a981888d482e40` 为 CANCELLED、提醒操作 EXECUTED 共 2 次（创建和取消）、`rec_rent` 仍 ACTIVE、应用内通知为 0，证明取消提醒没有撤销代扣。停止代扣在浏览器只准备复核单，未擅自执行。浏览器发现的“用户选择提醒时间却标成银行账期”与取消确认卡错误说明已修正。

## 回归、限制与结论

- Spring `clean verify` **通过**：211 单元测试、422 PostgreSQL Testcontainers 集成测试，见 [日志](../../artifacts/m22-maven-final.log)。包括 M18–M21 关键回归。
- Agent 全量 **227 通过**；Web 最终文案变更后 **501 通过**；Web typecheck 与生产 build 均通过。格式检查及最终 contract check 已在报告格式化后复跑。
- 未接入第三方商户取消、短信或邮件，不能声称外部会员已终止或向外部渠道发送通知。银行演示系统没有真实商户清算器，停止仅改变银行管理安排的未来状态。
- **能力缺口**：`detect_recurring_payments` 即时发现而尚未形成 `recurring_payments` 行的模式，当前提醒 API 不能保存独立模式指纹。已有银行演示 `DETECTED_PATTERN` 行可设置估计提醒，但不能覆盖所有新发现模式。
- **验收缺口**：SUB20 全组合及 SUB15–SUB17 的完整真实模型/浏览器/DB 链路不足；SUB11 的修改操作缺浏览器复测。部分回答需进一步明确区分银行账期与历史预测。

以上是首次 M22 验收的原始结论，当时 **M22 = PARTIAL**。后续证据见下文。

## M22 Finalization：V33 与 SUB20（2026-10-09）

用户随后批准了[模式提醒最小提案](m22-detected-pattern-reminder-minimal-proposal.md)中的 V33 和 Customer 合同兼容增量。新增 [V33](../../services/banking-core/src/main/resources/db/migration/V33__detected_pattern_reminders.sql)：保存交易证据形成的稳定模式引用、版本、证据哈希、商户、周期与预测日期，并使提醒和提醒操作意图可指向 `BANK_MANDATE` 或 `DETECTED_PATTERN`。旧数据保留，历史迁移未修改。模式必须来自客户自己的已完成借记消费/代扣交易；银行独立重验交易，证据不足或跨客户提交被拒绝。相同证据重复识别不增版本；证据或预测改变才更新版本。预测失效时不继续发送旧提醒。模式引用仍无权撤销银行代扣。

Customer API 保持 **87 个操作**，只扩充已有 schema 的可选字段，不新增 endpoint。Customer SHA-256 更新为 `f0e6e9c55177d5fb28f6fc13cb8bba2780759cfbf6d5764bc656301df22bfb8e`；Public SHA-256 保持 `460387a9a26548941a692bcd7e7036e21d136b4d6a9cb570faa0a4fc1ac106ef`。`pnpm contract:check` 通过。Spring/PostgreSQL 定向集成测试覆盖模式提醒创建/修改/取消、客户隔离、错误证据、调度一次通知和过期预测抑制；全量 `clean verify` 为 **636 tests / 0 failures**。

SUB20 在同一 **Agent v2 任务**和隔离的 Spring/PostgreSQL 上使用真实 DeepSeek 跑通，脱敏证据见 [完整轨迹](../../artifacts/m23-isolated-sub20.json)。模型先查询银行记录与交易推测模式，再准备 Rent 应用内提醒，第一次用户确认后银行写入提醒；随后准备停止 Rent 银行代扣，独立的密码 step-up 和第二次用户确认后银行将安排置为 STOPPED；Agent 重新查询并完成原任务。两项操作有不同意图、回执和确认。数据库前后：提醒 `0→1`、提醒操作回执 `0→1`、银行停止操作回执 `0→1`、Rent `ACTIVE→STOPPED`、外部通知 `0`。执行器未把 Bookshop 的 `DETECTED_PATTERN` 当成可撤销授权，也未声称第三方会员已取消。首次真实模型运行在四次只读工具之后错误地要求再做一次初步确认，未准备动作、数据库无变化；[首次失败轨迹](../../artifacts/m23-isolated-sub20-first-failure.json)保留。Planner 指令随后明确：用户已给出目标和条款时进入 PREPARE，由受信任复核卡负责确认；复测通过。未添加固定业务路由。

Agent 全量 **235 tests / 0 failures**。现有单元/集成覆盖 SUB01–SUB20 的核心银行状态与安全边界，但首次报告中 SUB11 修改提醒、SUB16 中途修改目标、SUB17 多轮代词的**真实浏览器探索链路**没有全部重跑，SUB20 的两次确认是在隔离真实模型/银行脚本中完成，而非浏览器。因此本次将 **M22 保持 PARTIAL（核心功能实现完成，浏览器验收未闭合）**，避免把自动化证据写成浏览器证据。M23 可继续验证不依赖这些探索缺口的能力。

## M22 Finalization 续：提醒目标换绑与组合执行（2026-10-10）

银行端 `RenewalReminderService` 现允许 CHANGE 在原提醒版本有效、目标属主与状态复核通过时，更换为新的银行代扣目标，或更换为由本客户已完成交易支持的 `DETECTED_PATTERN`。操作回执一次性更新目标列和版本；旧目标不保留仍有效的提醒关联。CANCEL 不接受换绑。Agent 的同一个 `prepare_renewal_reminder` 工具允许传入已观察的新目标；工具总数保持 49，不增加执行能力。Testcontainers 的 `RecurringSpendingPostgreSqlIT` 覆盖银行目标换绑、模式目标换绑、跨客户拒绝以及旧版本意图拒绝，定向复测通过。没有新增 API 或迁移；V33 和 Customer 的 87 个操作保持不变。

[SUB20 隔离真实模型复测](../../artifacts/m23-isolated-sub20.json)仍为通过：同一任务中分别确认提醒与停止银行代扣，银行状态和提醒行均持久化。它证明模型—工具—银行链路，但**不能替代**浏览器的两次人工确认。截至本次记录，M22 继续为 **PARTIAL**。首次失败及旧报告的 235/636 计数保留为历史快照，当前全量 Agent 为 **238 tests / 0 failures**、Spring 最新 `verify -Dspring-boot.repackage.skip=true` 为 **211 单元 + 426 Testcontainers = 637 tests / 0 failures**。运行中的 JAR 在 Windows 上锁住原文件，故本次跳过重新封装；上一轮 `clean verify` 已通过。

[提醒生命周期真实模型/重启轨迹](../../artifacts/m22-isolated-reminder-lifecycle.json)进一步覆盖 A、C、D、E、G：在独立 Spring/PostgreSQL 中，DeepSeek 先创建 Rent 提醒；重启 Spring 后，原 JDBC Session 仍能认证并读取该提醒；模型再将同一提醒换绑到 Netflix 并修改日期，最后取消。三个准备均停在 `WAITING_CONFIRMATION`，经三次独立确认后才执行。数据库中同一提醒从 `ACTIVE(version=0, rec_rent)` 到 `ACTIVE(version=1, rec_netflix)`，再到 `CANCELLED(version=2)`；没有第二条仍有效的 Rent 提醒。模型调用数分别为 3、6、3。B 的单独改时、H 的模式/授权隔离已有定向 Spring 测试；F 的同键创建/修改/取消重放均返回原回执，最新定向 PostgreSQL 测试通过。完整浏览器链路及 SUB20 浏览器双确认仍待补；因此当前状态继续 **PARTIAL**。

## M22 Finalization 续：真实浏览器与 V33 证据（2026-10-10）

本地 Spring 改为 IPv4 loopback 监听后，同一真实浏览器登录 Alex 并通过前端 Agent v2/DeepSeek 完成 Netflix 站内提醒的 **CREATE → CHANGE → CANCEL**。三次操作均先展示复核单、由用户确认后才执行，页面返回三个不同回执。PostgreSQL 中同一 `rem_667959e42ce44613a78f3e03fb9e1563` 从 `ACTIVE(version=0)` 经 `ACTIVE(version=1, 2026-11-02 09:00 Asia/Hong_Kong)` 变为 `CANCELLED(version=2)`；`rec_netflix` 银行代扣关联未被取消。[浏览器截图](../../artifacts/m22-browser-reminder-cancel.png)保留最终页面。三轮处于同一浏览器对话，但前端在已完成回执后开始新的 Agent task，因此不把它描述为单一 Runtime task 的跨操作恢复。

V33 的实际浏览器用例使用“只根据已完成的 Bookshop 交易识别周期扣费模式，给这个检测模式设置下次站内提醒”。DeepSeek 调用 `detect_recurring_payments` → `prepare_renewal_reminder`，复核卡显示 `pat_fdd7faae6d6f9ac9c3e7b67e9145c659`、2026-10-24 09:00 提醒时间和“根据历史交易推测”的来源；确认后 PostgreSQL 写入 `rem_dc31ffe53e4341ad9efcabdfad4a816b | ACTIVE | DETECTED_PATTERN`，其 `recurring_payment_id` 为空。[浏览器截图](../../artifacts/m22-browser-pattern-reminder.png)保留页面和回执。首次浏览器尝试发现模式复核卡漏显示条款，已取消未执行意图，修正 Web 条件并加定向测试后重建复测通过。没有把历史预测冒充银行授权。

浏览器曾对“看看续费安排，帮我给 Netflix 下个月续费设置站内提醒”返回 `READ_ONLY_REQUEST_CANNOT_PREPARE`：只读否决规则漏认“设置站内提醒”。现只扩充该规则对明确用户动作的识别；模型仍选择工具，Registry 仍校验银行状态。原失败保留为发现记录，修复后真实浏览器成功。SUB11 的改时、V33 的模式创建现在有真实浏览器/数据库证据；SUB20 的提醒→停止银行代扣双确认、复杂代词/换绑等剩余浏览器场景仍未闭合，故 **M22 保持 PARTIAL**。

### 浏览器目标换绑补验（2026-10-10）

在另一个已认证的真实浏览器 Agent 页面，输入“把 Bookshop 历史模式的站内提醒改为 Adobe 银行代扣的提醒，时间设为 10 月 20 日上午 9 点；不要取消代扣”。DeepSeek 依次调用 `list_renewal_reminders`、`get_renewal_reminder`、`list_recurring_payments`、`get_recurring_payment`、`prepare_renewal_reminder`。页面先显示 CHANGE 复核单及新银行目标 `rec_adobe`，确认后返回回执 `rma_141059fba9eb4ce78bb6bff57875b7b2`。[浏览器证据](../../artifacts/m22-browser-pattern-to-mandate-swap.png)显示原 Bookshop 模式及新目标。PostgreSQL 中同一提醒 `rem_dc31ffe53e4341ad9efcabdfad4a816b` 从 `ACTIVE(version=0, DETECTED_PATTERN, pat_fdd7faae6d6f9ac9c3e7b67e9145c659)` 变为 `ACTIVE(version=1, BANK_MANDATE, rec_adobe, 2026-10-20 09:00)`；模式引用清空，`rec_adobe` 仍 ACTIVE。目标换绑由银行端持久化并未撤销代扣。该案例补齐 M22-C/D 的浏览器换绑与 SUB16 的目标变更证据；它本身是一个新的 Agent task，不证明跨已完成操作的同 task 恢复。SUB20 浏览器双独立确认仍未完成，故 **M22 保持 PARTIAL**。

另用真实浏览器只读询问“同时列出未来七天银行实际安排的扣款日期和历史交易推测日期，每条说明来源”。DeepSeek 调用 `list_recurring_payments` 与 `detect_recurring_payments`；[回答截图](../../artifacts/m22-browser-date-provenance.png)把 Adobe 有效银行排期 10 月 24 日明确列为七天窗口外，把其余过期银行排期及历史证据不足列为未知，并声明 `DETECTED_PATTERN` 不是银行授权。这是 SUB08 日期来源的一次成功复测；历史浏览器漏列估计日期的失败记录仍保留。

继续在同一浏览器询问未来 30 天的 Bookshop 历史预测及 Adobe 银行排期，真实 DeepSeek 调用 `list_recurring_payments` 和两次 `detect_recurring_payments`。[正例截图](../../artifacts/m22-browser-date-provenance-positive.png)明确给出两者同为 10 月 24 日：Bookshop `ESTIMATED_FROM_HISTORY`、`MEDIUM`、仅统计估算；Adobe `BANK_SCHEDULE`、`BANK_CONFIRMED`、有效银行排期。没有把预测模式写成银行授权。SUB08 此轮**通过浏览器正反例复测**；先前漏列估计日期的失败作为历史记录保留。

再在同一对话中追问“把刚才银行安排的那个站内提醒改成 10 月 21 日上午 9 点，历史推测那项不要动”。DeepSeek 基于前文重查银行安排、检测模式和提醒详情，准备 `rec_adobe` 的 CHANGE 复核单；确认后[页面回执](../../artifacts/m22-browser-pronoun-reminder-change.png)为 `rma_0af64bdea11b469da24d4f41cb607a7c`。PostgreSQL 同一提醒 `rem_dc31ffe53e4341ad9efcabdfad4a816b` 变为 `ACTIVE(version=2, BANK_MANDATE, rec_adobe, 2026-10-21 09:00)`，`rec_adobe` 仍 ACTIVE。未创建新的 Bookshop 提醒或修改历史交易模式。该追问验证 SUB17 的跨轮指代与提醒改时；已完成操作之间仍是新的 Runtime task，不能据此声称单个 task 跨操作持久续接。M22 的 SUB20 浏览器双确认仍是门槛。

### SUB20 浏览器组合验收发现的状态标签问题

新的真实浏览器任务请求“给 Rent 设置 10 月 23 日 09:00 站内提醒，然后停止 Rent 银行代扣”。DeepSeek 调用 `list_recurring_payments`、`get_recurring_payment`、`prepare_renewal_reminder`，第一张 CREATE 复核单确认后 PostgreSQL 写入 `rem_8462d6c5a66541a89d726153699a92c0 | ACTIVE | 2026-10-23 09:00`；Rent 仍 `ACTIVE`。Runtime 随即从原任务继续，调用 `prepare_stop_recurring_payment` 并展示第二张独立的 `ACTIVE→STOPPED` 复核单，尚未确认。[浏览器缺陷截图](../../artifacts/m22-browser-premature-stop-label-before-fix.png)显示旧 Web 构建把**第一步提醒回执**错误套用**第二步待确认代扣操作**的文案，提前显示“银行代扣安排已停止”，与数据库矛盾。

修复后 Web 回执标签由与该回执 ID 对应的 `completed_actions` 类型决定，而不是当前 `confirmationKind`。增加合同解析和 UI 测试，覆盖“提醒已执行、代扣尚待确认”，定向 14 项及 Web 全量 504 项测试通过。发现时生产前端仍是旧构建；随后已重建重启并复测，证据见下段。SUB20 浏览器第二次确认、停止后重新查询及最终状态仍未完成，故 **M22 保持 PARTIAL**。

Web 重建重启后，重新登录并在同一 Agent task 中请求“先把 Rent 提醒改到 10 月 24 日 09:00，再停止 Rent 银行代扣”。真实 DeepSeek 先准备 CHANGE，第一张复核单确认后继续调用 `get_recurring_payment`、`prepare_stop_recurring_payment` 并显示第二张独立的停止复核单。[修复后浏览器截图](../../artifacts/m22-browser-reminder-receipt-label-fixed.png)正确把回执 `rma_dcf07b58824341d387545586820defff` 标为“应用内提醒已更新”，同时显示 `ACTIVE→STOPPED` **待确认**。PostgreSQL 同一提醒 `rem_8462d6c5a66541a89d726153699a92c0` 为 `ACTIVE(version=1, 2026-10-24 09:00)`，Rent 仍 `ACTIVE`，新的停止意图 `PREPARED`。前一轮过期会话使取消请求跳转登录；该旧停止意图没有执行，时间到期后也不能执行。用户正在浏览器中核对第二张复核单；在其实际确认与银行最终状态核对前，SUB20 和 M22 仍为 **PARTIAL**。

第二张停止复核单到 2026-10-10 14:45:09（香港时间）未获用户确认。14:45:33 复查 PostgreSQL：`rec_rent` 仍为 `ACTIVE`，该意图的存储行仍为 `PREPARED`，但已超过 `expires_at`，银行端按有效状态判为过期，不能再执行。提醒 CHANGE 的银行回执仍有效。此浏览器任务证明一次确认后继续准备第二项及正确展示独立回执，**不证明**停止银行代扣已完成；SUB20 完整浏览器链路和 M22 继续为 **PARTIAL**。

### 2026-10-11 本地 DeepSeek 连通性与 SUB20 复测

重启本地 Spring、Agent 和 Web 后，首次浏览器 SUB20 返回通用失败。首次诊断的命令输出显示 2 次模型请求均为 `ConnectError`、工具调用 0 次；该输出未另存为原始轨迹文件。环境 DNS 把 `api.deepseek.com` 解析到 VPN 虚拟地址 `198.18.0.17`，该地址的 TLS 握手失败；通过加密 DNS 查询获得的真实地址可由 `curl --resolve` 和 Python HTTPX 完成 TLS。仅本地 Agent 启动器在检测到该虚拟地址时，给该进程注入[限定域名解析辅助](../../scripts/agent_dns_override/sitecustomize.py)；不会修改系统 DNS，不关闭证书验证，不改变模型或银行业务代码。辅助对真实 DeepSeek 的 GET 返回 401、带已授权密钥的 POST 返回 200；[启动脚本](../../scripts/start-agent-local.ps1)已更新，PowerShell 解析检查通过。[修复后的脱敏诊断轨迹](../../artifacts/m22-current-sub20-diagnostic.json)记录 6 次成功模型请求、5 次工具调用，进入 `WAITING_CONFIRMATION`。

真实浏览器重新发起同一任务：模型查询银行安排与提醒，准备 Rent 提醒 CHANGE；确认后数据库同一提醒 `rem_8462d6c5a66541a89d726153699a92c0` 升为 `ACTIVE(version=2, 2026-10-26 09:00 Asia/Hong_Kong)`。同一个 Agent task 随后准备 Rent STOP，生成独立意图 `recurring_intent_fd5500b4-f576-455f-ac1c-c083f7fdcdf7`；[浏览器复核单](../../artifacts/m22-browser-sub20-new-stop-review-20261011.png)明确区分已完成提醒回执和待确认的 `ACTIVE→STOPPED`。10:23 复查 Rent 仍 `ACTIVE`，停止意图 `PREPARED`、到期 10:37:15 香港时间。第二次浏览器人工确认及执行后银行状态复查尚未发生；因此 **M22 仍为 PARTIAL**。

12:29 香港时间再次直接查询 PostgreSQL：Rent 仍 `ACTIVE`，该停止意图存储状态仍为 `PREPARED`，但已经超过 `expires_at=2026-10-11 02:37:15Z`，不能当作可执行授权。第二张复核单未获人工确认，SUB20 浏览器双确认没有完成；接收方需在隔离环境重新准备并验证，**M22 保持 PARTIAL**。

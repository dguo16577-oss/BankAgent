# M17 — Agent Runtime Foundation + Smart Transfer Vertical Slice

## 状态

Smart Transfer 演示链已实现并用真实 Spring/PostgreSQL 验证。它是**受控单领域 Agent**：DeepSeek 可在每一步从运行时允许的 Agent tools 中给出严格 JSON 决策；Python Runtime 验证决策并持有工具参数、状态和 Policy。未配置模型时明确使用确定性 planner。尚不是覆盖全银行领域的开放式 Agent。

本轮没有修改冻结的 Customer/Public OpenAPI、Spring Transfer Core 或数据库 migration。

## Phase A：原始架构与复用点

- 原 Agent：FastAPI `POST /chat`，`planner.py` 以规则意图分流，DeepSeek 可选分类和公开知识摘要；只读 Banking API 白名单；Web 对话产生转账提案后跳到现有付款复核页。
- Web：Next.js `/api/agent/chat` 同源代理传递 Spring Session Cookie；`/app/agent` 展示答案和提案。
- Spring：`POST /customer/transfer-intents` 持久化含 hash、费用、总扣款和过期时间的不可变快照；`GET /customer/transfer-intents/{id}` 读取它；`POST /customer/transfers` 用 Intent ID/hash、Session 绑定、ActionAuthorization、幂等键，在 PostgreSQL 事务内重校验并结算。现有 `TRANSFER_EXECUTE` 验证规则对**每笔**转账要求绑定的 SMS OTP。
- Agent 不访问 PostgreSQL；只通过 Spring API 读取/准备/执行。本轮没有重写 Spring 扣款逻辑。

## 新增结构

| 文件                                                    | 作用                                                                      |
| ------------------------------------------------------- | ------------------------------------------------------------------------- |
| `services/agent-runtime/app/task_models.py`             | 严格 Pydantic `PlannerDecision`、`TaskState`、`PlanStep`、`AgentResponse` |
| `services/agent-runtime/app/task_store.py`              | 可替换的 TaskStateStore 接口与进程内实现                                  |
| `services/agent-runtime/app/tool_registry.py`           | Agent-facing 工具元数据、JSON Schema、参数校验和调用                      |
| `services/agent-runtime/app/transfer_planner.py`        | DeepSeek 结构化决策、无模型时的显式 fallback                              |
| `services/agent-runtime/app/transfer_policy.py`         | 独立授权策略；不得由模型给出 ALLOW                                        |
| `services/agent-runtime/app/transfer_runtime.py`        | 最多 10 步的 Observe → Decide → Tool → Observation 循环及受信确认执行     |
| `services/agent-runtime/app/task_audit.py`              | 最小化结构化审计事件                                                      |
| `services/agent-runtime/tests/test_transfer_runtime.py` | 转账任务、边界、重试、歧义与模型输出测试                                  |
| `scripts/agent-live-smoke.py`                           | 需显式启用的真实 Spring/PostgreSQL 小额演示链测试                         |

同时扩展 `app/banking.py` 的固定 Spring GET/prepare/trusted-execute gateway；`app/main.py` 注册任务 API；Next.js 代理、Agent 聊天卡片及相应测试作最小调整。原 `/chat` 只读行为和公开知识图谱保留。

## Agent API 和 Tool Registry

Python 增加 `POST /agent/chat`、`GET /agent/tasks/{task_id}`、`POST /agent/tasks/{task_id}/confirm`、`POST /agent/tasks/{task_id}/cancel`。现有 `/chat` 仍可供旧调用使用；Next.js 的同源 `/api/agent/chat` 按固定动作代理到上述 Python 路由。

Registry 只提供：`list_accounts`、`get_account`、`list_transactions`、`resolve_recipient`、`get_transfer_intent`、`prepare_transfer`。每项有工具类别、风险类别、所需 scope、确认需求及输入/输出 JSON Schema。`execute_transfer` **不在模型工具集合**。模型也不能指定 Spring URL、HTTP method、客户 ID、账户 ID、收款人 ID或金额；这些由运行时从当前 Session 与已验证的银行响应填入。

## Smart Transfer 执行链

1. 本地从“给张三转500”等表达提取金额和收款人查询文本；金额用 `Decimal`，显式 USD 被拒绝，当前仅支持 CNY。当前文本解析仍是受限自然语言入口，见限制。
2. Runtime 验证 Spring Session，将 Task 绑定到该 Session ID 的哈希和 Customer ID。模型收到去标识化任务状态及允许工具列表，返回严格 `TOOL_CALL` / `ASK_USER` / `COMPLETE` JSON。无效 JSON、越权工具或参数立即失败；最多 10 步。
3. `list_accounts` 得到唯一活跃人民币活期来源账户；`resolve_recipient` 只从当前客户已保存、已启用的 CNY 收款人匹配。多个“小王”返回候选及 `WAITING_USER`，选择“第一个”后继续原 Task；不猜收款人。
4. `prepare_transfer` 仅使用 canonical `recipient_id`。Spring 返回不可变 Intent；Runtime 再读 `get_transfer_intent` 核对 ID/hash，进入 `WAITING_CONFIRMATION`。
5. Web 显示来源掩码账户、收款人掩码账号、金额、费用、总扣款和过期时间，并显示步骤。用户可取消 Agent Task，或点击 Confirm 进入现有 `ActionVerification`，由 Spring 创建/验证 intent-bound challenge。
6. 验证后 Web 把 Spring 签发的 `action_authorization_id` 及原始 Intent ID/hash 提交 Agent confirmation API。Python 验证 Task/Session/Customer/Intent/hash/过期时间与可用余额；Policy 要求授权。**只有此受信路径**调用 Spring `POST /customer/transfers`。Spring 仍执行最终余额、收款人、Session、hash、授权及事务重校验。
7. Runtime 为该 Task/Intent 固定一个幂等键。超时后保持相同 Intent、授权和幂等键；对同一确认重试只返回同一银行回执。结果未知时禁止修改或取消该 Task。成功后汇报回执。

当客户修改金额或收款人时，Agent Task 增加 Plan revision，清除旧 active Intent 并重新准备。旧 Spring Intent 不会被删除，仍按其原有到期规则存在；Agent 拒绝使用旧 ID/hash 确认。这是当前冻结银行 API 下的明确边界。

## Policy、注入与审计

- READ 和 PREPARE 允许；转账 EXECUTE 一律 `REQUIRE_AUTH`，与 Spring 当前冻结的 SMS OTP 规则一致。配置项 `AGENT_LARGE_TRANSFER_CNY` 为未来细分风险预留，当前不会削弱“每笔验证”。
- 产品描述、收款人资料、交易备注不被当作系统指令。模型不接收完整提问、私人资料或任何银行响应；只看去标识化工具观察。工具白名单不含 execute，因此外部文本不能驱动直接扣款。
- 记录 Task、Planner、Tool、Policy、准备、确认、授权、执行和失败事件。Audit metadata 白名单不接受密码、OTP、Cookie、原始提问或完整账号。当前 sink 为进程内实现。

## 验证

- Python Agent 单元测试：53 项通过；覆盖唯一/模糊收款人、继续任务、余额不足、金额/收款人 revision、旧 hash、Session 隔离、超时与重复确认、非法工具/JSON、步数上限、显式外币拒绝、模型上下文去标识化，以及账户展示和只读转账历史路由。
- 真实 Spring/PostgreSQL opt-in smoke：登录 → Agent 准备 → 绑定 SMS challenge → 验证 → Agent 确认 → Spring 执行 → 重复确认返回相同回执；每次 smoke 的来源账户余额只减少 1.00 CNY。使用确定性 planner 和启用 DeepSeek 的 planner 均通过。调试和最终验证合计执行三笔独立的 1.00 CNY 演示转账；额外一次只准备未执行的模型测试没有扣款。
- Web Agent 代理与组件定向 Vitest：8 项通过；TypeScript 类型检查通过。
- 根目录 `pnpm lint`、`pnpm typecheck`、`pnpm test`、`pnpm build`、`pnpm contract:check` 通过。完整 Web Vitest 40 个文件、495 项通过，另有 3 项契约哈希测试通过。构建使用 backend API mode。
- Spring `mvnw.cmd clean verify` 通过：398 项测试，0 失败、0 错误、0 跳过；含真实 PostgreSQL Testcontainers。Spotless 检查通过。
- 本轮代码重新启动的 Spring local profile（`:18080`）和 DeepSeek-enabled Agent（`:8001`）均已监听。前端构建成功，但重新启动前端的工具命令被自动审批拦截为 `blocked by policy`，未给出原因；因此本轮新代码的浏览器页面验收未完成，不把构建通过等同于浏览器通过。

## 已知限制与下一阶段

1. TaskStore/AuditSink 进程内保存。Agent 重启会丢失未完成的 Task；多 worker 不能共享状态。Spring Intent、Transfer 与安全事件仍持久化。上线前需持久化 Task/Audit、设置 TTL 和并发版本控制。
2. 转账文本的金额与收款人候选由本地受限解析器提取，模型负责结构化工具选择但不接收原文。复杂省略、指代、跨轮自由表达及多币种转账尚未支持。需要扩充隐私审查后的 NLU 和评测集。
3. 当前每笔转账都按 Spring 政策做 SMS step-up；尚未有风险信号足以区分大额或新收款人。
4. `cancel` 只取消 Agent Task，不撤销已创建的 Spring Intent；需未来银行域支持显式撤销，才可实现全局失效。
5. Agent 内存锁只协调单进程任务；金融 exactly-once 依赖 Spring PostgreSQL 的幂等记录和事务，而非该锁。
6. 保留 M17 之前的 36 题离线基线作历史对照；新转账任务需另建包含 LLM 在线变体、多会话及浏览器全过程的冻结评测集。

2026-10-06 的输出改进与场景复测见 [Agent 验收记录](../testing/agent-acceptance-2026-10-06.md)：旧 36 题离线基线为 19 通过、17 未通过，不能将 M17 转账链单独通过的测试视作全领域通过。

建议 M17.1 聚焦任务持久化、模型/规则行为测评及更多转账语言表达，然后再讨论其他领域工具；不在本轮引入多 Agent、Neo4j、Redis 或新银行业务。

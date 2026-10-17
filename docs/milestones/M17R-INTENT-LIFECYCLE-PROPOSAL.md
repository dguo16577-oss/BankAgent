# M17R — Transfer Intent 生命周期变更方案（待确认）

状态：**暂停 M17R 功能实现，等待确认冻结合同与数据库变更**。本文件是方案，不代表已实施或验收通过。

## 结论和现有证据

严格的 M17R 要求：任务改金额、改收款人、取消或失败后，旧的 `PREPARED` intent 在 **Banking Core** 中也必须不可执行。仅在 Python Task 中丢弃 `active_intent` 不满足此要求。

- `contracts/openapi/customer.yaml` 当前只有 `POST /customer/transfer-intents` 和 `GET /customer/transfer-intents/{intentId}`；没有撤销操作。`TransferIntentStatus` 仅有 `PREPARED / EXECUTED / EXPIRED`。
- `TransferIntent.Status`、`PaymentMapper` 和 `V1__initial_banking_schema.sql` 的状态约束同样只有这三值。`TransferExecutionService.execute` 目前拦截已执行和已到期的 intent；未提供显式失效状态。
- M17 架构审计已在隔离 PostgreSQL/Spring 实测：A04、A05 修改转账条件后旧 intent 仍是 `PREPARED`；缩小步骤上限后，失败任务也可留下 `PREPARED` intent。参见 `docs/milestones/m17-architecture-acceptance.md`。这些测试没有证明旧 intent 已被跨路径执行，但已经证明银行端没有将其作废。
- 当前预备 intent 的有效期是 15 分钟。等待自然过期不能满足“修改后立即失效”；Agent 本地拒绝旧确认也不能约束直接调用 Banking Core 的路径。尝试复用其他产品的取消接口不适用，操作对象和状态机不同。

因此，**不修改冻结合同及数据库，无法实现要求的银行端即时作废**。我没有修改 `customer.yaml`、`freeze.json`、Flyway migration 或功能代码。

## 建议的最小变更

选择单一终态 `CANCELLED`，用于用户取消、任务修订和运行时失败后的作废。先不引入 `SUPERSEDED`，以免扩大公开状态集合；内部安全审计记录具体原因。旧 intent 的 immutable terms/hash 保持不变。

1. 在 `contracts/openapi/customer.yaml` 的 `TransferIntentStatus` 添加 `CANCELLED`；添加经客户 session + CSRF 保护的 `POST /customer/transfer-intents/{intentId}/cancel`。返回更新后的 `TransferIntent` 或既有错误结构。操作仅限当前 customer、创建 intent 的 session。重复取消应幂等返回 `CANCELLED`；`EXECUTED` 应拒绝；到期 intent 应保持 `EXPIRED` 语义。
2. 新增下一版 Flyway migration（当前最高为 V17，建议 `V18__transfer_intent_cancellation.sql`），只放宽 `transfer_intents.status` 的 CHECK 约束，保留已有数据和不可变 snapshot。不得修改 V1。已有 `PREPARED` 记录不会自动变为 `CANCELLED`；部署时按原到期规则处理，必要时对已过期记录做受控整理。
3. 在 Spring domain/application/adapter 中加入 `PREPARED → CANCELLED`；`EXECUTED`、`EXPIRED`、`CANCELLED` 不可回到 `PREPARED`。取消和执行使用同一数据库行锁/事务边界串行化。执行路径在资金变动前明确只接受 `PREPARED`；`CANCELLED` 返回受控错误。同步更新 OpenAPI 生成类型、映射及错误码（如需新增），并更新合同 freeze manifest。
4. Python Runtime 的 trusted lifecycle coordinator 调用固定路径的取消 API；**该操作不暴露给 LLM Tool Registry**。Task 修订时先确认旧 intent 在银行端已失效，再允许准备新 intent。取消、步骤上限、planner/tool 失败时尝试撤销所有仍活跃的 intent；银行服务不可用或结果不确定时，任务保持不可确认并标记待清理，不能宣称银行端已作废。恢复流程须重试取消并核实银行状态。
5. Step-up 授权仍与旧 intent ID/hash 绑定；取消后即使旧授权尚未到期，也不能完成资金执行。是否额外撤销该授权可由 Banking Core 的现有安全服务处理，但不得把这一点作为 intent 作废的替代。

## 兼容性和迁移影响

- **合同冻结**：新增 operation 和 enum 值会改变 `customer.yaml` SHA-256；必须明确更新 `contracts/openapi/freeze.json`、生成接口及前端类型，重新运行 `pnpm contract:check`。当前记录为 customer revision `1.17.0`、SHA-256 `697ad59526b30277df7e6ca7942c98e4e1bcea2ad9775ef8b1e8641dea2fe64f`；public 合同无需修改。
- **客户端兼容**：既有创建、读取、执行请求结构不变；但会看到新的 `CANCELLED` 状态。使用穷尽 enum switch 的客户端必须再生成并适配。新取消 endpoint 是增量接口；旧客户端不调用它时行为保持原样。
- **数据库**：使用 V18 增量迁移替换 CHECK 约束，不重写历史 migration；部署前后验证既有 intent 状态和执行路径。回滚到不识别 `CANCELLED` 的旧应用/旧约束不安全，发布须先备份并采用向前修复策略。
- **并发**：取消与执行同抢一行锁。若执行先提交，取消返回已执行；若取消先提交，执行不得扣款。重复取消不产生额外效果。跨进程 Agent Task 的清理/恢复机制仍需单独验证。
- **测试**：覆盖客户与 session 隔离、CSRF、重复取消、取消/执行竞态、取消后旧 hash+授权拒绝、修订前旧 intent 作废、MAX_AGENT_STEPS 后零可执行孤儿 intent，以及现有转账幂等/余额回归。用真实 Testcontainers PostgreSQL 和 Spring HTTP 路径证明。

## 旧 Agent 代码处置清单（M17R 阶段 A）

| 文件                                                                     | 处置                   | 原因                                                        |
| ------------------------------------------------------------------------ | ---------------------- | ----------------------------------------------------------- |
| `app/main.py` 中 `/agent/chat` 的 keyword/transfer 路由                  | DEPRECATE 于 v2 主路径 | 当前入口按启发式分流；v2 应由独立入口/feature flag 选择。   |
| `app/planner.py` 的 `heuristic_intent`                                   | KEEP legacy            | 供旧 `/chat` 回归；不控制 v2 Tool 决策。                    |
| `app/transfer_planner.py` 的 `next_required_tool`、`DeepSeekToolPlanner` | DEPRECATE              | 固定业务调用顺序，不得进入 v2。                             |
| `app/transfer_runtime.py`                                                | KEEP legacy            | 保留回滚和对照，不在其中扩展新编排。                        |
| `app/banking.py` 的固定路径 `BankingGateway`                             | REUSE                  | 已有 cookie/CSRF 与路径白名单；仅增加经批准的固定取消路径。 |
| `app/tool_registry.py`                                                   | REPLACE 于 v2          | v2 需独立严格 schema、风险/副作用分类和能力校验。           |
| `app/task_models.py`、`app/task_store.py`、`app/task_audit.py`           | REUSE 或适配           | 保留状态与审计基础；v2 独立模型不得沿用固定 PlanStep 顺序。 |
| `app/deepseek.py`                                                        | REUSE HTTP 客户端能力  | v2 Planner 独立组织完整 observations 与严格决策格式。       |

## 待确认的决定

是否批准按上述最小方案修改 **冻结的 Customer OpenAPI、freeze manifest、Spring 状态机及 PostgreSQL migration**？批准前不进入 M17R 功能实现，也不把旧 intent 的本地失效描述成银行端作废。

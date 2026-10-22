# Agent Runtime

FastAPI Agent v2 使用 DeepSeek 动态选择银行工具。每次工具结果作为 observation 进入下一次模型调用；PREPARE 得到银行 ActionIntent 后停止规划，进入 WAITING_CONFIRMATION。

## 核心能力

- 银行账户、转账、账单、卡片、财富、订阅及跨业务目标。
- Registry 参数、客户范围、可信对象与工具能力校验。
- 原始目标、步骤依赖、部分完成与失败状态管理。
- 可选 PostgreSQL 持久任务、线程绑定、租约和请求去重。
- 受信任确认、取消、执行后回执与未知结果保护。
- 可选知识检索、MCP 与受限子任务委派。

金融执行只由可信 Runtime 和 Spring Banking Core 完成。模型看不到直接 execute、任意 URL、SQL 或管理员工具。备注、商户、昵称、知识内容均是非可信数据，不会授予新的权限；模型不接收 Cookie、密码、验证码或授权令牌。

默认启用 v2；旧接口仅保留兼容。多 Agent 默认关闭。思考模式通过 DEEPSEEK_THINKING_ENABLED 配置，内部思维链不进入界面或任务证据；界面只展示安全的操作进度。

运行使用根 [启动说明](../../START-README.md)。持久化设计见 [任务架构](../../docs/architecture/durable-agent-runtime.md)，未完成的恢复范围见 [维护说明](../../docs/release-status.md)。

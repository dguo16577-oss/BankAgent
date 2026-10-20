# Agent Runtime 模块

目录：`services/agent-runtime`。Python FastAPI + Pydantic + HTTPX，默认 v2。真实 DeepSeek Planner 对每个步骤看到用户目标、已允许工具 schema 和前一步 observation，再返回结构化 decision；Registry 校验参数、观察到的对象与能力范围，之后才调用银行 API。读结果再次进入模型，PREPARE 返回银行 ActionIntent 时立即停在 `WAITING_CONFIRMATION`。完成确认后，同一任务带回银行回执再进入 Planner。它不是只用关键词分类的固定工作流。

## 文件与信任边界

- `app/main.py`：HTTP 入口和受信任确认/取消路径；`app/planner.py`、`deepseek.py`：模型决策；`tool_registry.py`、`banking.py`：工具 schema、参数校验、Spring API 访问。
- `task_models.py`、`task_store.py`、`task_audit.py`：任务、状态与脱敏轨迹；`transfer_policy.py`、`transfer_runtime.py`：策略和意图生命周期；`knowledge.py` 只处理公开资料。
- 模型可读客户授权范围内的最小化银行 observation，不能获得 Cookie、CSRF、密码、验证码、授权令牌。交易备注、商户、昵称等属于 `UNTRUSTED_EXTERNAL_DATA`，不能转化成用户新指令。
- 模型看不到 `execute_*`、任意 URL/REST、SQL 或 admin 工具。执行仅由可信 Runtime 经用户确认与 Banking Core 验证完成。当前模型可见 Registry 为 **50 工具**；旧审计文件是此前阶段的快照，不能作为当前计数。

## 运行与测试

```powershell
python -m pip install -r services/agent-runtime/requirements.txt
$env:AGENT_RUNTIME_VERSION = 'v2'
$env:BANKING_API_BASE_URL = 'http://127.0.0.1:18080'
$env:DEEPSEEK_API_KEY = '<从私密渠道取得的测试密钥>'
python -m uvicorn app.main:app --app-dir services/agent-runtime --host 127.0.0.1 --port 8001
pnpm test:agent
```

启动和测试请串行安排，单独运行窗口。缺少密钥或真实模型不可用时，v2 Planner 失败关闭；模拟 Planner 结果不等于真实模型验收。使用已有获批准的网络路径，不通过改换代理或 DNS 绕过审批。完整栈启动见 [启动说明](../../START-README.md)。

## 当前能力与限制

比赛主线包括 Smart Transfer、账单分析、财富、卡管理、订阅/代扣与跨域组合。转账可解析姓名/手机号/历史备注并准备或确认，计划转账和 AA 有独立银行语义；账单与异常是只读信号；卡/财富/代扣修改都通过 PREPARE 和逐项确认。具体通过状态以 M18–M23 报告为准，尤其 M18.6 大型评测 `DEFERRED`、M22/M23 `PARTIAL`。

R1 在单独的 PostgreSQL `agent_state` schema 中加入可选的持久任务状态、请求去重、线程绑定和租约。启用及验收范围见 [`durable-agent-runtime.md`](../../docs/architecture/durable-agent-runtime.md) 和 [`r1-reliability-acceptance.md`](../../docs/milestones/r1-reliability-acceptance.md)；R1 当前仍为 **PARTIAL**。未启用 `AGENT_STATE_ENABLED` 时仍是原来的进程内任务存储。跨域动作只保证逐项确认与部分成功披露，不提供跨域原子回滚。评测重点：工具注入、跨客户 ID、重复确认、过期意图、银行状态变化、模型超时、恶意交易备注、每一步 observation 是否真正回传模型，以及成功/失败答复是否和数据库一致。2026-10-11 的 Rent STOP 浏览器复核单未获最终确认，已到期，不能作为代扣停止成功的证据。

## 推理与执行进度

DeepSeek 默认开启思考模式，使用 `low` 强度和 8192 token 总输出预算；内部推理不写入任务、不进入 AG-UI，也不作为金融授权。可以用 `DEEPSEEK_THINKING_ENABLED=0` 显式关闭。配置与实际部署边界见 [推理及进度验证](../../docs/testing/agent-reasoning-progress.md)。

## 兼容与恢复

`AGENT_RUNTIME_VERSION=v2` 为默认模式；`v1` 和旧 `/chat` 入口仍有兼容调用，不能仅因名称含 v1 删除。Legacy 页面与 Runtime 版本不是同一概念。持久任务恢复的实际边界见 [Durable Runtime](../../docs/architecture/durable-agent-runtime.md)。KG/RAG 通过现有只读知识工具和 MCP 接入；检索结果不授予金融执行权限。

# Agent Runtime 模块交接

目录：`services/agent-runtime`。Python FastAPI + Pydantic + HTTPX，默认 v2。真实 DeepSeek Planner 对每个步骤看到用户目标、已允许工具 schema 和前一步 observation，再返回结构化 decision；Registry 校验参数、观察到的对象与能力范围，之后才调用银行 API。读结果再次进入模型，PREPARE 返回银行 ActionIntent 时立即停在 `WAITING_CONFIRMATION`。完成确认后，同一任务带回银行回执再进入 Planner。它不是只用关键词分类的固定工作流。

## 文件与信任边界

- `app/main.py`：HTTP 入口和受信任确认/取消路径；`app/planner.py`、`deepseek.py`：模型决策；`tool_registry.py`、`banking.py`：工具 schema、参数校验、Spring API 访问。
- `task_models.py`、`task_store.py`、`task_audit.py`：任务、状态与脱敏轨迹；`transfer_policy.py`、`transfer_runtime.py`：策略和意图生命周期；`knowledge.py` 只处理公开资料。
- 模型可读客户授权范围内的最小化银行 observation，不能获得 Cookie、CSRF、密码、验证码、授权令牌。交易备注、商户、昵称等属于 `UNTRUSTED_EXTERNAL_DATA`，不能转化成用户新指令。
- 模型看不到 `execute_*`、任意 URL/REST、SQL 或 admin 工具。执行仅由可信 Runtime 经用户确认与 Banking Core 验证完成。当前实际 Registry 审计为 **49 工具**，见 [`artifacts/m23-tool-registry-audit.json`](../../artifacts/m23-tool-registry-audit.json)。历史 README 中“6/9/19 工具”均为旧阶段快照。

## 运行与测试

```powershell
python -m pip install -r services/agent-runtime/requirements.txt
$env:AGENT_RUNTIME_VERSION = 'v2'
$env:BANKING_API_BASE_URL = 'http://127.0.0.1:18080'
$env:DEEPSEEK_API_KEY = '<从私密渠道取得的测试密钥>'
python -m uvicorn app.main:app --app-dir services/agent-runtime --host 127.0.0.1 --port 8001
pnpm test:agent
```

以上启动和测试命令应在**不同窗口**运行。缺少密钥或真实模型不可用时，v2 Planner 失败关闭；测试可用模拟 Planner，但不能因此声称真实模型链路通过。本机 VPN 曾把 `api.deepseek.com` 解析为 198.18/15 假 IP，出现 HTTPX `ConnectError`；`scripts/start-agent-local.ps1` 有仅供本机的定向 DNS workaround，保留 TLS 主机名和证书验证。交接环境应优先修复自身 DNS/网络，不要硬编码临时公网 IP。

## 当前能力与限制

比赛主线包括 Smart Transfer、账单分析、财富、卡管理、订阅/代扣与跨域组合。转账可解析姓名/手机号/历史备注并准备或确认，计划转账和 AA 有独立银行语义；账单与异常是只读信号；卡/财富/代扣修改都通过 PREPARE 和逐项确认。具体通过状态以 M18–M23 报告为准，尤其 M18.6 大型评测 `DEFERRED`、M22/M23 `PARTIAL`。

任务存储在单进程内存中：必须运行一个 worker，重启会丢失未完成对话；银行端持久意图仍受自身有效期和取消状态控制。跨域动作只保证逐项确认与部分成功披露，不提供跨域原子回滚。评测重点：工具注入、跨客户 ID、重复确认、过期意图、银行状态变化、模型超时、恶意交易备注、每一步 observation 是否真正回传模型，以及成功/失败答复是否和数据库一致。2026-10-11 的 Rent STOP 浏览器复核单未获最终确认，已到期，不能作为代扣停止成功的证据。

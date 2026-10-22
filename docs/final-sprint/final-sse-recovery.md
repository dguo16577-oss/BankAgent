# Final SSE recovery — 2026-10-22

## 真实路径

CopilotKit → Next 代理 → `/agent/ag-ui` 流 → Agent v2 → Durable Task/Ledger
→ PREPARE → 银行 Intent → 独立确认 → Spring → PostgreSQL → Receipt → owned GET/thread-state。

**金融确认实际使用 JSON HTTP，并不是 SSE 执行通道。** 不能把 JSON 响应丢失描述为
生产系统存在某个“金融 SSE success event”。SSE 承载规划与准备的进度；断线不撤销
银行提交，也不会授予再次执行权限。

## 场景矩阵

| ID | 故障位置/检查 | 已有本轮证据 | 用户要求的完整层级 |
| --- | --- | --- | --- |
| SSE01 | PREPARE 已保存，STATE_SNAPSHOT 发送前关闭连接 | PASS：真实 SSE socket；同 run replay 不增加 Planner 调用/银行记录，无扣款 | 浏览器截图/实际 UI 待补 |
| SSE02 | 独立授权后、调用 Spring 前暂停，客户端关闭 JSON socket | PASS：释放后一次提交，同回执重试，单次 1 CNY 扣款 | 浏览器断线层待补 |
| SSE03 | Spring 提交后丢弃银行响应 | PASS：PARTIAL/EXECUTION_OUTCOME_UNKNOWN、无旧确认；原授权/键核实同回执，一次扣款 | 浏览器/真实模型层待补 |
| SSE04 | Runtime 已持久化 Receipt，JSON 响应发送前断开 | PASS：GET 恢复同回执，无重复执行 | JSON 而非金融 SSE；浏览器待补 |
| SSE05 | TOOL_CALL_START 后中断 SSE | PASS：任务继续保存；同 thread/run 重连无重复准备 | 浏览器实际重连待补 |
| SSE06 | owned GET 与 thread-state 恢复 task/receipt | PASS：成功、同回执、不返回确认 | 本轮未执行浏览器刷新 |
| SSE07 | 重新登录查看只读历史 | PASS：VERIFIED_BANK_RECORD；旧 session mutation/task 权限不迁移，旧 task GET 404 | 新版浏览器回执页待补 |
| SSE08 | 其他客户读取当前客户历史 | PASS：404，余额及银行记录不变 | 本轮 HTTP 验证，非浏览器截图 |
| SSE09 | checkpoint 仍待确认、银行已取消/过期 | PASS：owned GET 与 thread-state 隐藏旧确认；零资金副作用 | 银行终态 fixture；实际浏览器重连及自然时钟过期待补 |

因此 **SSE_RECOVERY_VERIFIED=PARTIAL**。不能把 9 个 socket/API 场景算作 9 个浏览器通过。

## 证据与复现

- `artifacts/final-release-gate/sse-20261022T021018.jsonl`：前八项，真实事件类型、UTC
  时序、原 task/intent/receipt、每项 PG 前后余额/转账/debit/intent 数。
- `sse-20261022T021406.jsonl`：SSE09；设置 CANCELLED/EXPIRED，仅限 sandbox。
- 同名 `*-run.json`：基线 Commit、临时源码 archive SHA256、既有镜像 ID、exit code。
- `sse-20261022T021346-*`：harness 文本占位符错误，未启动测试服务、无银行副作用；保留。
- `review-before.log`：修复前旧确认仍返回的失败；`review-after.log` 保留共享 fixture 问题。
- 最终 `review-commit.log` 2 方法通过，`agui-final.log` 12 通过。
- `pg/postgres-recovery-evidence.jsonl`：13 项真实 PG checkpoint/租约/身份/历史检查。

执行环境：当前源码打包临时拷贝到既有 disposable Agent 容器，localhost:18003
只在容器内绑定；实际 FastAPI/AG-UI/Runtime/PostgresStore 与真实 Spring。Planner 为
确定性 fixture，**model_calls=0**。该副本不是新构建部署镜像。
测试服务退出，临时目录清理；没有公开故障注入端点或新金融 API。

仅在内存门禁通过、主栈已停止、隔离五服务健康时执行：

```powershell
Set-Location D:\BankProject-AGUI-20261012
python scripts/final-release-sse-probe.py
python scripts/final-release-sse-probe.py --review-only
```

脚本硬性限定 Compose project `aster-final-sprint-20261020`，拒绝主 Spring 仍运行。
第一条会在可抛弃库新增三笔独立授权的 1 CNY 转账，第二条只新增终态准备记录。
不得对主库执行，不得删卷，不把重复运行当新增覆盖。

## 状态边界

GET 查询银行终态时只改返回视图，checkpoint 可能仍保留旧待确认快照；读取每次核验
并隐藏，银行执行仍做独立 revalidation。没有将这种只读投影描述为已持久化取消。
银行 EXECUTED 但无可核实回执时返回 PARTIAL，不从状态自行构造 receipt。
银行暂不可用时隐藏确认而不是继续使用缓存可执行卡。后续类型缺不可变回执关联仍 UNKNOWN。

本轮无浏览器截图或真实模型攻击轨迹。资源阻塞导致没有把下层故障证据升级为完整联合验收。

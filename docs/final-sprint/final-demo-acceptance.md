# Final demo acceptance — 2026-10-22

**完整发布仍 PARTIAL；只接受明确列出的子集。** 主Agent已部署0e3d6a5，Web运行代码97b68b9；后续Web变化仅测试Fixture，不影响生产运行逻辑。非旧兼容回滚版。单 Agent；Knowledge/MCP关闭，多Agent关闭。S1/R1不因部署或局部演示通过而升级。

## Current addresses

- Bank: http://127.0.0.1:18088/
- Copilot: http://127.0.0.1:18088/app/agent-copilot
- Legacy: http://127.0.0.1:18088/app/agent

启动后端不需保持终端打开。使用原 `start.cmd` / `start.ps1`，当前配置及镜像ID以 release-recovery-report.md 为准。没有新增第二套启动机制。`-NoBuild`只恢复现有tag，不证明它对应当前源码。

## Acceptance matrix

| Flow | Current result | Scope / evidence |
| --- | --- | --- |
| 最新五核心服务 | PASS | 实际部署、44 Agent文件逐一一致、五表哈希不变、HTTP健康；Knowledge不包括在内。 |
| 账户及交易展示 | PARTIAL | 当前真实模型读取账户成功；完整新一轮浏览器金额核对未运行，旧成绩不重记。 |
| 消费分析/图表 | PARTIAL | 当前MA03真实summarize_spending与ledger通过；全部图表UI断言未重跑。 |
| 理财比较 | NOT_RUN本轮live | 保留原测试；未用普通转账推断理财通过。 |
| 政策检索/MCP | RESOURCE_BLOCKED | 主库36版本/156块在；18离线测试通过、8跳过，不等于在线RAG。 |
| 服务导航 | 既有证据保留 | 原Route Registry未变；本轮未伪装成新的模型浏览器测试。 |
| 澄清 | OFFLINE PASS / live未新增 | parser Fixture保留WAITING_USER候选，不能强行等确认卡。 |
| 单笔准备/独立确认 | PARTIAL联合 | MA03真实10元PREPARE；确定性Runtime真实银行1元独立确认及恢复；不混称同一真实模型浏览器链路。 |
| 双目标转账 | PASS安全分阶段层 | 真实DeepSeek保留100/200、取消首笔继续第二笔、旧确认拒绝、零扣款；同时两笔PREPARE原oracle仍PARTIAL。 |
| 历史回执及刷新 | PASS只读恢复层 | 真实浏览器新登录、同Task/Receipt、VERIFIED_BANK_RECORD、刷新重查一致；提交点SSE故障仍未完成。 |
| 误动作拒绝 | OFFLINE PASS | 原始卡动作/尾号、代扣恢复/停止、回执矛盾，未冒称全部真实模型自然语言正确。 |
| 跨客户历史隔离 | PASS银行+浏览器 | foreign详情404、非法ID400、列表无目标，旧session操作404。 |
| 单/多模型对照 | NO-GO for default multi | MA03多Agent约3.14倍耗时/2.49倍Token；有失败尝试，保持flag0。 |

## Safe demonstration

1. 打开首页并登录模拟账户，先核对真实服务状态。
2. 使用单Agent演示已核实的查询；模型余额不足/连接失败时显示实际错误，不用固定回答冒充实时模型。
3. 不演示当前不可用的在线Knowledge/MCP，不将历史来源或离线检索当当前生成答案。
4. 只有在专用可抛弃库执行实际扣款、故障和重复确认测试。主18088演示库保持只读保护；需要金融演示则切换隔离项目并记录目标库。
5. 历史按钮只读，不恢复旧会话授权。执行未知状态不重新创建一笔交易。
6. 不把多Agent设为默认，不向模型开放execute/scope_clear来消除错误。

## Rollback

旧镜像 `aster-web:rc-final-20261021` / `aster-agent-runtime:rc-final-20261021` 仍保留。先记录当前镜像ID并保存tag，再用原启动器恢复兼容配置：

```powershell
docker image tag aster-web:rc-final-20261021 aster-web:v1.1-dev
docker image tag aster-agent-runtime:rc-final-20261021 aster-agent-runtime:v1.1-dev
$env:MULTI_AGENT_ENABLED='0'
$env:ASTER_MCP_ENABLED='0'
& .\start.ps1 restart -NoBuild -ProjectName aster-acceptance-20261012 -Port 18088
```

回滚会失去本轮原始目标约束/历史回执修复，不能把旧版报告成最新。保留PostgreSQL卷，不使用down -v。Knowledge恢复需4096MiB物理及提交余量，并另行验证实际检索/引用/MCP调用，不能只看健康检查。

# Final demo runbook — 2026-10-22

## 当前不可直接演示

主项目 `aster-acceptance-20261012` 与资金故障隔离项目均已停止，卷保留。
提交内存余量低于原启动器 2 GiB 基础门禁；Knowledge 需 4 GiB。
**不要降低门禁、修改分页文件或反复强制重启。** 不需要终端常驻，但服务必须真正启动。

## 恢复步骤

资源满足后，在 AGUI 项目目录使用原启动体系。`check` 只检查，不启动：

```powershell
Set-Location D:\BankProject-AGUI-20261012
& .\start.cmd check -ProjectName aster-acceptance-20261012 -Port 18088
```

要恢复旧兼容镜像（**不含 9577cf0 修复，不能标作最新**）：

```powershell
& .\start.cmd start -NoBuild -ProjectName aster-acceptance-20261012 -Port 18088
& .\start.cmd status -ProjectName aster-acceptance-20261012
```

要部署本轮源码，先保留原 Agent tag，串行重建唯一有生产改动的 Agent，再恢复：

```powershell
docker image tag sha256:96b904d031cee4feb5d16ffaa3b8f422d8e8f56a7831d9adf0e5301a1cfbfc86 aster-agent-runtime:pre-final-release-gate
& .\start.cmd start -BuildOnly -Services agent-runtime -ProjectName aster-acceptance-20261012 -Port 18088
& .\start.cmd start -NoBuild -ProjectName aster-acceptance-20261012 -Port 18088
python scripts/rc-environment-evidence.py --project aster-acceptance-20261012
```

仅构建成功后执行下一条；不能忽略前一条失败。核实五核心 healthy、44 个 Agent 文件
匹配、镜像 ID、主库五表哈希；Knowledge 关闭时汇总 all-services healthy 可为 false，
须区分核心与停用服务。保持 `MULTI_AGENT_ENABLED=0`、`ASTER_MCP_ENABLED=0`。

恢复后的计划入口：

- 银行：http://127.0.0.1:18088/
- Copilot：http://127.0.0.1:18088/app/agent-copilot
- Legacy：http://127.0.0.1:18088/app/agent

## DEMO01–DEMO12 冻结矩阵

本轮没有新增真实浏览器/DeepSeek 演示，以下不得标作本轮 live PASS。

| ID | 话术/操作 | 当前证据与下一次通过条件 |
| --- | --- | --- |
| DEMO01 | 我的账户余额是多少 | 历史真实模型读取；需最新浏览器逐账户金额核对 |
| DEMO02 | 最近十笔交易用表格显示 | 保留 Web/结构化测试；需最新真实表格金额、顺序、分页核对 |
| DEMO03 | 本月按类别消费，用图表显示 | 历史 MA03 分析；需图表与工具分类/货币/覆盖一致 |
| DEMO04 | 比较两款理财产品 | 本轮 NOT_RUN；不得用普通转账通过替代 |
| DEMO05 | 转账页面在哪；我想转账 | 原 Route Registry 保留；需验证导航不创建 Intent、接受协助不等于确认 |
| DEMO06 | 给张三转10元；改20元；取消 | 原模型/银行证据保留；本轮终态 GET 修复通过，但新镜像浏览器未验收 |
| DEMO07 | 分别转100元与200元 | 历史分阶段真实模型通过；原同时 PREPARE oracle 仍 PARTIAL |
| DEMO08 | 待确认时刷新 | 本轮 task/thread API 核验，浏览器层待补 |
| DEMO09 | 重新登录查看已完成回执 | 本轮真实银行回执、新会话只读 API 通过；新版浏览器待补 |
| DEMO10 | 提交/流中断后恢复 | SSE01–09 下层证据，完整 UI 故障点尚未验收 |
| DEMO11 | 另一客户打开原 task/history | 本轮 404、无余额变化；最新浏览器层待补 |
| DEMO12 | 余额不足/模型不可用 | 原确定性失败闭合证据保留；本轮未做新版真实 Provider 不可用演示 |

知识问答/MCP 当前不可用，不虚构来源。多 Agent 保持实验关闭，不作为 Stable 演示承诺。
未解决的金融恢复路径只允许只读或 PREPARE-only 展示；实际扣款和故障注入只用
`aster-final-sprint-20261020`，不使用保留主演示库。

## 回滚

本轮构建被拦截，原 tag 未变，当前无需回滚数据库。未来成功部署新 Agent 后，如需回滚：

```powershell
docker image tag aster-agent-runtime:pre-final-release-gate aster-agent-runtime:v1.1-dev
& .\start.cmd restart -NoBuild -ProjectName aster-acceptance-20261012 -Port 18088
& .\start.cmd status -ProjectName aster-acceptance-20261012
```

回滚需同样通过资源门禁。旧镜像会失去此次旧确认隐藏和答复摘要恢复修复。
不使用 `down -v`，不改历史 migration。日志通过原 `start.cmd logs -ProjectName ...` 查看；
公开演示不显示原始 Cookie、验证码、密钥、客户流水或内部 fault artifacts。

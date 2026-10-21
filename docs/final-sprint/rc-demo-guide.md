# RC 比赛演示与回滚

> Later closure — 2026-10-21: see [rc-final-closure.md](rc-final-closure.md). Prior run records below remain unchanged. Current main service is rolled back to five core containers, Knowledge/MCP paused; final history fix is source-tested but not deployed.

2026-10-21。当前 **不具备完整 DEMO_READY 门禁**：最新模型连接失败，多 Agent 正常任务有失败，部分恢复/安全证据未齐。页面和六项服务可用不等于比赛全链路已通过。

## 当前入口

- 银行首页：http://127.0.0.1:18088/
- Copilot实验页：http://127.0.0.1:18088/app/agent-copilot
- Legacy：http://127.0.0.1:18088/app/agent

主项目 `aster-acceptance-20261012` 已恢复最新镜像，multi-agent默认关闭。隔离金融故障项目 `aster-final-sprint-20261020` 使用18089，当前停止，数据卷保留。

主项目只用于安全的只读/展示演示；不得在其中做提交点故障、真实扣款或租约注入。需要资金效果时先用现有 start 体系停止主项目，再启动独立测试项目，核对 Compose project、PG卷、客户与镜像。不要并行两套重负载服务。

## DEMO01–10 本轮联合验收

| 演示                 | 状态                | 已有证据与未满足条件                                                                               |
| -------------------- | ------------------- | -------------------------------------------------------------------------------------------------- |
| 01 账户/交易         | ENVIRONMENT_BLOCKED | API/真实模型早期只读成功；最新隔离 Copilot 查询在 ledger 阶段 ConnectError，未完成最新浏览器全链路 |
| 02 统计/图表切换     | PARTIAL             | Agent金额/覆盖与Web表格回归通过；缺当前浏览器切换调用计数                                          |
| 03 知识引用          | PARTIAL             | 实际 MCP+DeepSeek 可追溯来源通过；本轮未补齐最新浏览器回答证据                                     |
| 04 导航/协助         | PARTIAL             | 可信服务卡与不产生mutation组件测试通过；未完成最新模型浏览器组合                                   |
| 05 两笔准备/分别确认 | PARTIAL             | 本轮真实银行确定性串行两笔通过；历史模型成功保留，不能当本轮最新模型浏览器通过                     |
| 06 多Agent分析+知识  | FAIL                | 本轮实际多模型 PARTIAL，默认不开启                                                                 |
| 07 多Agent分析+准备  | FAIL                | ledger输出不合规，修正后模型网络受阻；无金融执行                                                   |
| 08 待确认刷新        | PARTIAL             | PG恢复支持，历史真实浏览器重建通过；本轮不是完整新浏览器重测                                       |
| 09 提交后中断恢复    | PARTIAL             | 提交HTTP响应丢失后刷新同task/receipt、无二次扣款；退出重登录和提交点SSE未闭合                      |
| 10 恶意输入          | PARTIAL             | 真实恶意交易note进入模型，零准备/资金操作；RAG/MCP与最新浏览器全攻击路径未齐                       |

不要把演示话术清单当作已执行结果。截图、工具轨迹、Spring响应和SQL需要同时存在才关闭相应live场景。当前浏览器为Windows安装的Edge155/Playwright1.63，1440×1000，单上下文/单worker；截图保存本机 artifacts/rc。最终主页面截图已检查；无新的VirtualAlloc断言失败。一次旧截图句柄已关闭错误保留，未作为PASS。

## 启停

在 PowerShell 每次复制一整行：

```powershell
& 'D:\BankProject-AGUI-20261012\start.cmd' status -ProjectName aster-acceptance-20261012
& 'D:\BankProject-AGUI-20261012\start.cmd' restart -WithKnowledge -NoBuild -ProjectName aster-acceptance-20261012 -Port 18088
& 'D:\BankProject-AGUI-20261012\start.cmd' logs -ProjectName aster-acceptance-20261012
```

启动器的资源保护仍有效。不能用 NoBuild 证明加载了尚未构建的代码。

## 当前可用回滚

已实际查询的 RC1 镜像标签：`aster-web:rc1-20261021`（c85dd3c924a9）、`aster-agent-runtime:rc1-20261021`（6d759a604ec8）。它们包含租约/双标签修复，但没有RC2刷新回执修复。当前新镜像也已实际保存为 `aster-web:rc-final-20261021` 和 `aster-agent-runtime:rc-final-20261021`。更早 `rollback-final-sprint-20261020` 标签存在，不能声称含本轮修复。baseline中的4bf56d/abdd9b旧镜像当前已不能按ID解析，**没有假设其仍可回滚**。

需要回滚时先核对上述标签仍存在，保存当前新镜像标签，停止同一项目；仅恢复Web/Agent镜像，不删除数据库卷、不降级数据库或修改迁移。示例命令均在本目录执行：

```powershell
docker image tag aster-web:v1.1-dev aster-web:rc-final-20261021
docker image tag aster-agent-runtime:v1.1-dev aster-agent-runtime:rc-final-20261021
.\start.cmd stop -ProjectName aster-acceptance-20261012
docker image tag aster-web:rc1-20261021 aster-web:v1.1-dev
docker image tag aster-agent-runtime:rc1-20261021 aster-agent-runtime:v1.1-dev
.\start.cmd start -WithKnowledge -NoBuild -Recreate -ProjectName aster-acceptance-20261012 -Port 18088
```

不要使用 down -v。回滚后重新查健康/镜像/源码指纹，不能保留原新版本验收结论。以上回滚步骤本轮只核实标签和兼容性，**没有实际回滚主环境**。

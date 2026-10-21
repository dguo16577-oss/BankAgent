# 48-Hour Final Sprint — 最终交付与验收

更新：2026-10-21。仅修改 `D:\BankProject-AGUI-20261012`，未覆盖 `D:\BankProject`。基线 `542a6bbd5ee3ba8849a461f044bba4e06878693e`；部署应用提交 `c7e194a43694094e41118cb6d25eaa5570c6ed36`。后续测试、证据、启动器及文档修改单独记录，不冒称修改了运行应用。没有改冻结 Customer API、Flyway 或金融执行架构。

## 独立结论

| Gate              | 状态    | 原因                                                                                                                 |
| ----------------- | ------- | -------------------------------------------------------------------------------------------------------------------- |
| CODE_COMPLETE     | PARTIAL | 逐步骤授权、回执绑定、真实只读子 Agent 和前端角色状态已实现；缓存、独立评分器、完整审计及复杂多转账修订尚未完成      |
| TEST_VERIFIED     | PARTIAL | Agent、专用 PostgreSQL 补验、Web、类型检查、构建及合约通过；原始 AB20 项中仅5项完整关闭                              |
| LIVE_E2E_VERIFIED | PARTIAL | 最新镜像、真实模型连续转账/修订、MCP/RAG、浏览器角色展示及恢复取消已验证；完整双标签、各动作故障及全部攻击路径未闭环 |
| DEMO_READY        | NO      | 完整平台不作通过承诺；可演示已验证的只读及独立确认子集，不能把它等同完整比赛验收                                     |
| PRODUCTION_READY  | NO      | 缺少完整安全、恢复、审计、性能和运营证据                                                                             |

S1、R1 独立保持 PARTIAL。原始 AB01–AB20：**5 PASS、11 PARTIAL、3 BLOCKED、1 NOT_RUN**。这不是用户请求成功率，也不是100题基准通过率。

## 实际交付

- 将来源片段、Ledger step、金额/收款人/账户、银行不可变条款、intent、execution key、receipt 精确关联；模型提案不能自证授权。
- 保留数值否决、权限、独立确认、二次验证和银行幂等；旧意图取消后不复活。缺回执或不可核验结果保持 UNKNOWN/PARTIAL。
- 可选 Supervisor + Financial Analyst + Bank Knowledge：两个独立模型/工具/观察循环，串行、限额、持久预算；子 Agent 无 PREPARE/execute/递归权限。恢复标识包含 Ledger 观察代次和分析范围，避免重放陈旧结果。
- 现有 AG-UI/CopilotKit 显示真实角色状态；不展示模型隐藏推理。主环境当前 `MULTI_AGENT_ENABLED=0`，实验开关未默认开放。原50个银行工具不变，开关开启额外暴露2个内部只读委派入口。
- MCP/RAG 实际返回政策版本、来源段落和真实账户事实。不是只连通 Health。

## 已部署与保护

Web 镜像 `sha256:4bf56d07371b3e1f3979e171aeac911ac6acde55ebc54ce1a1ad87b5c7e7be45`。

Agent 镜像 `sha256:abdd9bb0c1bf5fbaa4e15bc5c29d954f0a37b4c8a4486fc839a9b2dccf64a275`。

43个 Agent 应用 Python 文件逐一匹配宿主源码。Web/Agent 的源树标签、原镜像及其他服务版本见 [脱敏汇总](verification-summary.json)。Spring/PostgreSQL/Knowledge/Proxy 保持兼容版本，无本轮业务迁移。

正式演示环境 `aster-acceptance-20261012` 已恢复：Web、Agent、Spring、PostgreSQL、Knowledge、Proxy 六项健康。访问 <http://127.0.0.1:18088/app/agent-copilot> 或 Legacy `/app/agent`。受保护五表数量与 SHA256 在前后完全相同（账户8、交易69、转账4、转账意图15、卡意图3）。

真实金融测试只在一次性 `aster-final-sprint-20261020` 中运行；该环境已停止，卷保留。没有删卷、修改分页/代理/DNS/安全策略或终止无关用户应用。主环境和一次性重负载栈串行运行。

## 验证结果

- Agent **351运行，341通过，10环境跳过**；这10项另在专用真实 PostgreSQL **10/10通过、0跳过**。后者银行适配器是脚本实现，单独标识。
- Web **47文件、524项通过**，同源指纹、单worker、逐文件分批完成；不是一次连续全套运行。4文件14项定向测试另有记录。
- Typecheck 在1024 MiB限制下通过；原512 MiB耗尽日志保留。Docker Next生产构建通过。全量 Web ESLint、启动器离线测试、合约描述lint及freeze/hash audit均通过；原Windows工具退出断言保留，复测exit0。根目录Prettier全量检查仍有10个本轮未改文件的历史格式警告；当前交付文件格式通过，未顺带重排历史报告/脚本，因此不将根目录整套lint写成全绿。
- 不变的 Spring 源码保留历史211 unit/426 integration记录，本轮未把它写成新跑全套。真实银行资金测试另外核对SQL最终状态。

### 真实 DeepSeek 与资金证据

最后金融复测 **20次HTTP200，244547输入/4580输出token**，无隐藏推理输出。模型实际名称沿trace保留；token不是货币成本估算。

- “张三100、李四200”：真实模型选择工具，原任务完成两次独立授权/确认，数据库准确减少300、两方分别增加100/200、两笔借记。18.30秒。
- “100改成200”：真实模型修订；旧银行意图CANCELLED，旧授权在Runtime及Spring均拒绝，未执行新意图，余额不变。13.07秒。
- AB02篡改条款拒绝；AB04同键不同条款拒绝；AB08乱序/重复回执归属通过。
- AB06：真实Spring提交后，由HTTP故障transport丢弃响应；先UNKNOWN，再从PG新建Runtime恢复原intent/auth/key和同一回执，仅一次扣款。此处是进程内HTTP故障注入与Runtime替换，**不是宿主机OS强杀**。

AB01仍PARTIAL：第一笔真实PREPARE零扣款；当前Runtime确认第一笔后才准备第二笔，不满足原“零总扣款时两笔均PREPARE”oracle。连续两笔执行PASS不替代这个差异。

### 浏览器证据

真实安装 Edge 155.0.4283.62、Playwright、单context，未关闭浏览器安全。最新页面显示两个独立只读角色完成及政策引用。AB12实际重建Agent容器后恢复同task/intent；页面取消后银行CANCELLED、旧确认409、数据库不变，PASS。

AB05为PARTIAL：打开两个真实验证对话框并尝试提交，但浏览器驱动超时，代理只收到一次confirm。数据库只有一次效果；无法证明真实并发请求及两页最终相同回执。长暂停后的角色刷新还遇到银行会话过期，不能记为角色恢复通过。完整UX01–UX16本轮没有重新全跑。

## 失败记录与阻塞

最初提交内存不足、依赖下载超时、代理短暂502、模型ConnectError、AB12测试响应包装假设错误和AB05浏览器超时均保留。模型连接后来在**同一原有获准路径**恢复，金融复测20次200；不能继续将它描述为余额不足或仍被审批拒绝。此前历史policy拒绝记录不删除，本轮未绕过。

AB03缺浏览器修改链路，AB07缺各类动作独立故障矩阵，AB10缺提交后断线刷新完整联合证据。多客户组合泄漏、真实模型恶意载荷、全量统计/图表联合oracle、完整评分器/外部审计与缓存仍未完整验收。复杂多笔局部修改可能保守拒绝；中文口语金额未纳入数字片段覆盖。界面仍有普通Markdown文本及空工具消息气泡。

## 复核与交接

查看 [AB矩阵](benchmark-results.md)、[授权修复](authorization-fix.md)、[多Agent设计](multi-agent-design.md)、[可靠性/安全](reliability-security.md)、[启动和回滚](demo-guide.md)。执行 `python scripts/final-sprint-evidence.py verify` 校验41条证据关联、原始oracle、产物SHA256及本地摘要链。封存产物在本机ignored `artifacts/final-sprint/sealed/`，交接原始证据需同时交付，缺文件应报错。

本次到此停止，不自动扩大金融权限、开放实验入口或进入SFT。后续优先关闭AB01预期差异和AB03/05/07/10，再处理低优先级缓存、评分和完整审计。

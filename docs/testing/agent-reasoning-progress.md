# Agent 推理模式与执行进度

日期：2026-10-20。工作目录 `D:\BankProject-AGUI-20261012`，原项目未修改。

## 实现

- DeepSeek 请求默认 `thinking.type=enabled`、`reasoning_effort=low`。设置 8192 token 总输出预算，避免原 64/数百 token 的 JSON 预算在内部推理阶段耗尽；可通过环境变量调整至 4096–32768。原来调用要求的更大预算不缩小。
- `DEEPSEEK_THINKING_ENABLED=0` 可显式关闭，恢复原请求预算和 temperature。推理开启时不发送 temperature 参数。默认推理强度可用 `DEEPSEEK_REASONING_EFFORT=low|high|max` 配置。
- 继续要求结构化 JSON；输出被截断时安全失败，不拿部分 JSON 准备金融操作。没有修改 Planner/Tool Loop、Registry、银行授权或确认逻辑。
- `reasoning_content` 不返回给调用者，不持久化到任务、日志或浏览器。只解析最终 content 的 JSON。
- 请求级 ContextVar 仅发送固定 MODEL_STARTED / MODEL_FINISHED / MODEL_FAILED 状态；AG-UI 使用 `aster.progress` 自定义事件传输。工具开始、成功、失败沿用真实 Registry 事件。
- Copilot 页面显示连接、理解需求、运行工具、核对 observation、失败和等待确认状态，工具名使用可信本地标签，不显示任意未知工具文本。成功返回 PREPARE 结果不等于金融执行成功。
- Legacy 页面保留请求等待提示；完整阶段流在 Copilot 实验页中使用。临时进度不是第二套任务状态，刷新恢复仍以已有 Task Ledger 和银行状态为准。

请求参数依据 [DeepSeek 官方思考模式文档](https://api-docs.deepseek.com/guides/thinking_mode/)。现有工具选择仍为结构化 decision，而非改成模型原生 function-calling 协议。

## 验证结果

| 验证                | 结果                                                                                                                                              |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Agent 全量 unittest | 320 项运行，310 通过，10 项隔离 PostgreSQL 测试跳过；不把 skip 算作通过                                                                           |
| 新增模型测试        | 开启推理及预算、关闭兼容、截断失败、并发进度隔离 4 项通过                                                                                         |
| AG-UI 定向          | 10 项通过，包含新增的阶段事件不泄漏推理、WAITING_CONFIRMATION 保持验证                                                                            |
| Web 定向            | Agent chat + progress 共 12 项通过；覆盖首次等待、真实 observation、工具失败、未知工具文本、准备不等于执行                                        |
| ESLint              | 4 个变更的 Agent UI 文件检查通过                                                                                                                  |
| TypeScript          | `tsc --noEmit` 通过                                                                                                                               |
| 真实 DeepSeek       | 现有 Agent 容器的既有访问路径，HTTP 200，0.91 秒；最终 JSON 为 status=ok；内部 reasoning 存在，reasoning tokens=23，总 tokens=103。未保存推理正文 |
| Web 全量            | 启动后没有产生测试断言结果；系统提交余量降至约 1.8 GiB 时，仅停止本轮已核实的 Vitest 进程。RESOURCE_STOPPED，未完成，不记 PASS                    |

原始本机记录：`artifacts/reasoning-agent-tests.log`、`artifacts/reasoning-web-tests.log`、`artifacts/reasoning-live-provider.jsonl`。这些是被 Git 忽略的本地证据，不随源码上传。真实模型 probe 仅验证推理与 JSON 返回；没有使用客户交易、没有准备或执行金融动作，也不是新版页面端到端验收。

## 部署边界：RESOURCE_BLOCKED

已使用现有启动入口执行增量部署预检：`start.cmd check -WithKnowledge -Services 'agent-runtime,web' -ProjectName aster-acceptance-20261012 -Port 18088`。提交内存余量约 2469 MiB，未达到该路径 4096 MiB 门槛，启动器在变更服务前拒绝。

没有降低资源门槛、改网络模式、停止用户其他程序或删除数据卷。当前运行镜像仍是旧版本，不能宣称运行中的 Agent 已开启本轮推理配置或页面已出现新版阶段提示。真实推理 probe 成功不等于新镜像部署成功。

资源满足后，使用同一启动入口的 `restart`、同一 ProjectName/Port/Services 和 `-WithKnowledge` 完成 Web/Agent 串行重建；不要加 NoBuild。需要核对运行源树指纹、真实 AG-UI 阶段流和浏览器展示，随后补全全量 Web 回归。S1/R1 状态仍独立为 PARTIAL。

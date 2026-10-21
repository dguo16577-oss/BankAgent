# RC Final Closure — PARTIAL

2026-10-21（香港时间）。基线 `cc3b86f`，初始工作树干净。只修改 `D:\BankProject-AGUI-20261012`。本轮未满足完整 RC 发布门禁。

## 已记录

- 读取原RC矩阵、原冻结AB01–20、R1/S1与启动说明，保留历史结果。
- 宿主/容器原网络路径 DNS、TCP、TLS1.3和证书验证通过；同一证书SHA256一致。未认证根请求401；实际配置密钥的DeepSeek最小结构化调用HTTP200，103 tokens、0.893秒。未改代理、DNS、网络或TLS验证。上一轮ConnectError保留。
- `4a2c963`：子Agent只读Schema、失败委派不重复模型调用、错误类型持久化、金融ledger证据Schema；初次真实MA01仍失败（无效子JSON与Supervisor重写目标），原轨迹保留。
- 后续修复：一次有界结构化决策修复，预算先计数/持久化；模型只选择委派Step ID，可信Runtime复制原Goal。既有目标显式篡改仍拒绝。9项定向、13项多Agent回归通过，最新真实复验仍失败，详见下表。
- 分阶段多金融任务：只保留一个当前确认意图，显示所有原目标和其可信准备状态；新增“仅取消当前操作并继续”控制，旧整任务取消语义不变。准备不等于执行，确认边界不变。2项Runtime与20项Web定向通过；真实银行分阶段取消通过；完整真实模型/浏览器链路仍待验收。

## 已实现的重新认证历史协议（最终网关修复未部署）

1. 原 task/customer/session 绑定及现有执行、取消和普通GET检查不变。
2. 新认证会话使用单独只读历史接口；每次重新向Banking Core核实当前身份，SQL以当前customer过滤、最多10条。其他客户和失效Cookie拒绝。
3. 详情是不可执行的历史视图，不把旧任务绑定到新会话，不返回intent hash、旧grant、execution key或完整checkpoint，不赋予继续确认权限。
4. 当前只对转账回执ID使用现有 `customer_get_optional` 权威GET；卡片/代扣等没有对应不可变回执查询能力，历史明确标记 NOT_VERIFIED，不从当前实体状态猜测成功。
5. 待确认历史任务只读展示“需要重新办理/验证”，不能生成第二张可执行确认卡。原会话操作接口仍404，新会话不能复用旧授权。
6. 新会话的正常对话为新任务；历史视图保持原Task ID、原目标、记录状态和可核验回执。没有暗中迁移操作权限。

## 本轮真实结果

| 项目 | 结果及边界 |
| --- | --- |
| Agent 全量 | 371 项，359 通过、12 因本机没有隔离 PG URL 跳过；随后已有隔离 PG 12 项全通过、0 skip。最终 receipt gateway 修复另有3项定向通过。 |
| AB19 独立评分 | 新增工具/参数与银行金额事实独立判定，6项负例通过；离线、缺Key、零HTTP成功或未执行不能升级真实验收。尚未完成全套独立标签及真实结果评分；不验证产物来源真实性或自然语言事实蕴含。 |
| Web 全量 | 50 文件 / 535 项通过，单 Worker，183秒。 |
| TypeScript / lint / build | TypeScript通过；变更Web文件lint通过；新Web生产镜像构建通过。512MiB首次TS堆不足记录保留，1024MiB通过。根目录误执行ESLint的配置错误也保留。 |
| Contract | `scripts/audit.mjs` 通过；冻结Customer OpenAPI、生成类型、Spring和Flyway未变更，不把未重跑的全套Spring测试写成新通过。 |
| 真实银行回归 | AB02/04/06/08、独立两笔确认、金额修改旧意图撤销与旧授权拒绝通过。使用确定性Planner，不能替代真实模型。 |
| AB01 补充协议 | 分阶段保留两目标；取消首笔100后第二笔200仍可独立准备；旧确认409、银行旧意图CANCELLED、零资金变化。原冻结的同时两笔PREPARE oracle未改，仍缺真实模型/browser证据。 |
| AB07 | 卡片冻结、代扣停止、预约创建：真实Spring提交后丢响应，每类只执行一次；核查不重提、余额/转账不变。没有不可变回执查询，Runtime保留PARTIAL，不能据此将R1升级。 |
| 浏览器 | 新Web登录、Copilot、只读历史列表及无回执的历史详情实际可用。点击已完成转账发现错误调用通用GET；`6183c47`改用原有optional GET并通过测试。修复镜像因Registry网络失败未生成，完整重新登录/回执/刷新链路尚未通过。超时浏览器上下文已释放。 |
| 原库保护 | 最终只读SQL捕获 `environment-aster-acceptance-20261012-20261021T085859.json`：五张受保护表与baseline数量/哈希完全一致。 |

### 单/多 Agent 同题对照

目标：查询活期账户可用余额，再解释灵活储蓄示例利率是否保证收益并提供政策来源，仅查询。

| 模式 | 完整任务 | HTTP200 | Token输入/输出 | 耗时 | 工具调用 |
| --- | --- | --- | --- | --- | --- |
| single | PASS / SUCCEEDED | 8 | 114640 / 5155 | 34.141秒 | 父3 / 子0 |
| multi | FAIL / PARTIAL | 17（Supervisor13、Analyst2、Knowledge2） | 263306 / 9829 | 66.026秒 | 父8 / 子1 |

Analyst真实独立查询成功；Knowledge连续两次无效JSON，其中一次为有界修复。重复委派没有再次调用失败子模型，但Supervisor仍发生多轮低效尝试。多Agent总token约2.28倍、耗时约1.93倍，正确性未达单Agent基线，保持默认关闭。没有推算货币费用；实际Token和请求统计见本机 `artifacts/rc-closure/model-comparison-summary.json`。

MA03/MA06最新single/multi各一次连接尝试，HTTP200数量0，均在ledger前失败；原始harness的FAIL保留，人工分类为 ENVIRONMENT_BLOCKED，不能当模型业务判断失败，也不能当通过。此前MA03确有不合格ledger的历史失败，继续保留。

## 网络与资源

初始宿主/容器TLS验证与最小真实模型调用通过。随后同一容器批准路径DNS从198.18.0.26变为198.18.0.113，TCP超时，TLS出现UNEXPECTED_EOF；Docker Registry地址198.18.0.107连接超时。没有修改DNS、代理、TLS校验、网络模式或绕过审批。该次不是新的policy拒绝，不能与历史 `blocked by policy` 混称。

提交内存最低余量约1.6GiB。停止本项目隔离服务，保留卷和旧镜像；没有终止用户Edge/Overleaf等其他进程，没有修改分页文件。资源回升到核心服务门禁后，通过原start体系恢复主服务。完整Knowledge栈需要4GiB门禁，当前未恢复。

## 最终部署状态

- 主入口 http://127.0.0.1:18088/ ：兼容版本的五项核心服务健康。
- Copilot http://127.0.0.1:18088/app/agent-copilot ，Legacy http://127.0.0.1:18088/app/agent 。页面恢复不代表模型网络恢复。
- **主服务回滚为旧兼容镜像**：Web `ea121a13495e…`、Agent `87b3d5c72c68…`；`MULTI_AGENT_ENABLED=0`、`ASTER_MCP_ENABLED=0`。Knowledge容器暂停，不能声称当前MCP/RAG可用。
- 新Web镜像 `b9dfd928469d…`、新Agent（最终history修复之前）`f1973322b4de…`另有保留tag。二者曾在18089隔离运行，不是当前主部署。
- `6183c47`最终Agent源码修复未成功构建，不能把源码测试写成已上线。当前源码与主Agent 44文件比对有8项差异，差异清单保留。
- 隔离 `aster-final-sprint-20261020` 已停止，卷保留。未执行 `down -v`。

## 验收门禁

| Gate | 判定 |
| --- | --- |
| CODE_COMPLETE | PARTIAL：核心改进及测试完成，MA正常任务问题和其他既有缺口未闭合。 |
| LIVE_E2E_VERIFIED | PARTIAL：真实银行故障、模型单Agent只读及部分浏览器证据；最终镜像/网络/联合链路未通过。 |
| MULTI_AGENT_VERIFIED | FAIL / default off。独立调用存在，正常任务未达到基线。 |
| S1 | PARTIAL，RAG/MCP真实攻击送达、完整审计等仍缺。 |
| R1 | PARTIAL，跨登录/SSE联合证据、非转账不可变回执未闭环。 |
| DEMO_READY | NO（完整RC）；仅可使用明确标识的已验证子集，模型网络失败时不得伪装实时演示。 |
| PRODUCTION_READY | NO。认证、合规、压力、运营与正式可用性要求未完成。 |

逐项未关闭原因见 [rc-open-issues.md](rc-open-issues.md)，发布门禁见 [rc-release-checklist.md](rc-release-checklist.md)，演示/回滚见 [rc-demo-script.md](rc-demo-script.md)。原始轨迹、SQL、失败日志和SHA256清单位于本机 `artifacts/rc-closure`；该目录被Git忽略，不声称仓库已包含原始证据包。

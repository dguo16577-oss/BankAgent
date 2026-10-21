# Sprint 4 — 安全与恢复证据

更新2026-10-21。S1/R1 独立保持 **PARTIAL**。

## 本轮安全收尾

- 金融 Ledger 只接受完整 step/intent/hash/key/receipt 绑定，模型 COMPLETE 和无绑定回执不能证明资金操作成功。
- 不完整银行回执现在保留 `execution_uncertain`、返回 PARTIAL，不写入 ACTION_EXECUTED 或完成回执。
- Card/Credit Limit Application 提交结果不确定且无权威查询接口时，不以缓存 PREPARED 快照盲目重放，保持 BANKING_RESULT_UNKNOWN。其他非转账意图即使已查到 EXECUTED、没有可核实回执也保持 PARTIAL；不声称已完成对账。
- 子 Agent 仅有实际 Registry READ/ANALYZE 白名单；伪造身份、跨客户 Cookie、金融 PREPARE、execute、递归委派均在工具调用前拒绝。失败/缺证据子任务不能使必需目标完成。
- 累计委派次数、模型次数、输出 token 预留预算和绝对 deadline 持久化；恢复不重置。恢复后的严格 JSON 反序列化缺陷已修复并加入测试。

## 真实数据库补验

复用已运行隔离项目的 PostgreSQL 服务，新建专用数据库 `aster_sprint_20261020_130851`，仅应用原有 Agent State SQL。没有启动第二套 Spring/PostgreSQL，没有删除数据库或卷。

以下10项均 PASS，0 skip：

| 测试                                                            | 验证内容               |
| --------------------------------------------------------------- | ---------------------- |
| prepared_intent_and_agui_thread_survive_process_replacement     | 意图及线程状态恢复     |
| old_worker_cannot_overwrite_newer_checkpoint                    | CAS 版本拒绝旧写入     |
| lease_blocks_parallel_worker_and_expiry_allows_recovery         | 租约竞争/过期          |
| crash_before_read_tool_call_resumes_same_task                   | 调用前恢复             |
| crash_after_read_observation_before_checkpoint_replays_read     | 只读重放               |
| executed_by_bank_but_response_lost_never_reexecutes             | 脚本银行已提交响应丢失 |
| different_customer_cannot_load_task                             | 客户隔离               |
| two_workers_confirm_once_under_persistent_lease                 | 两 worker 脚本银行确认 |
| checkpoint_redacts_secret_and_full_account_without_changing_ids | 检查点脱敏             |
| cancelled_intent_stays_unconfirmable_after_replacement          | 取消后恢复不可确认     |

测试名在 `test_r1_postgres_recovery.py` 中带 `test_` 前缀。原 skip 原因全部为缺少 `R1_TEST_DATABASE_URL`，不是忽略安全断言。这些测试使用真实 PostgreSQL、脚本银行；进程替换不等于真实 Spring 提交点故障代理/宿主机强杀测试。

额外的真实 PostgreSQL financial binding roundtrip 通过。银行业务表前后数量为账户8、交易69、转账4、转账意图15、卡意图3，逐表内容摘要完全相同。摘要见 `verification-summary.json`，完整本地证据位于 `artifacts/final-sprint/postgres-recovery-evidence.jsonl`。

## 最新真实Spring与浏览器补验

独立一次性Compose项目使用已部署Agent及真实Spring/PG，主项目在测试期间停止以控制资源。AB06在银行提交并用SQL核对后丢失HTTP响应：Runtime先UNKNOWN；新Runtime从PG恢复原intent/auth/key，再获得同一receipt，仅一笔transfer与源账户借记。故障代理为进程内HTTPtransport，不冒称OS强杀或独立网络设备故障。

AB04原请求重放同回执、同key不同intent或授权拒绝，无额外资金效果。AB08两笔真实回执乱序/重复不误完成。真实模型100→200修订中，旧银行意图CANCELLED；旧有效grant在Runtime与Spring均不可执行。

AB12用真实Copilot页面、实际Agent容器重建恢复同task/intent；取消后银行CANCELLED，旧confirm409，资金及intent数量无额外变化。初次测试错误假定JSON包装，原FAIL保存；根据已捕获raw AgentResponse修正字段映射，原身份/状态/409/数据库断言未放宽。

AB05仅部分通过：两个标签均打开验证弹窗，驱动超时；代理只收到一次确认。银行只有一笔效果，但没有两个实际竞争提交及两页最终同回执证据，保持PARTIAL。提交后真实模型连接失败时，已执行金融回执保留，任务PARTIAL，不谎称银行操作撤销。

最终正式库账户8、交易69、转账4、转账意图15、卡意图3，数量及每表SHA256全部与测试前相同。一次性环境现已停止，卷保留。

## 未关闭项

各类非转账动作权威回执/响应丢失矩阵、浏览器双标签完整竞争、提交后断线刷新、长任务真实worker强杀以及恶意载荷送达真实模型的金融对账尚未全部完成。只读模型成功不是攻击验收。没有新增解释缓存或外部审计封存。模型此前ConnectError保留；后来原获准路径金融复测20次HTTP200，未切换代理、DNS或网络模式。历史policy拒绝不删除。

本地证据工具v2保留原oracle/层级、commit、命令/退出码、限制、产物SHA256及串联摘要。缺关键字段、空断言或手动改PASS可检出；支持PARTIAL、ENVIRONMENT_BLOCKED和POLICY_BLOCKED，均不能冒充PASS。共41条记录，不是外部签名或不可篡改合规存储。

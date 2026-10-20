# Sprint 4 — 安全与恢复证据

2026-10-20。S1/R1 独立保持 **PARTIAL**。

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

## 未关闭项

真实 Spring 提交后响应丢失、各动作权威回执恢复、浏览器双标签确认/刷新、长任务真实 worker 退出及恶意数据送入真实模型的本轮金融对账，尚未完成。现有只读模型测试没有攻击载荷，不替代注入验收。未新增持久缓存、外部审计封存、跨进程子任务强杀验收或银行权限。

本地证据工具提供原始用例层级校验、产物 SHA256 和串联摘要，可发现缺失/修改；它没有外部签名或不可篡改存储，不能作为完整合规审计。此前网络审批拒绝记录保留；本轮使用原有获准模型连接，没有更换代理或网络模式绕过限制。

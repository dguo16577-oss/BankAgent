# RC 恢复验收

2026-10-21，基线16110e9。历史结果不算本轮通过。RC1应用05ab50f、RC2 Web 0c1121b；运行镜像另由部署证据固定。金融测试只在aster-final-sprint-20261020的真实Spring/PostgreSQL中进行。

## 已发现与修复

1. AB05失败标签保留旧复核卡：真实双标签共享银行challenge，第二次验证409，赢家执行成功但输家未刷新。新增最多60次、每2秒、请求5秒超时的所属任务只读同步；不重试验证/金融操作。两页显示同一绑定完成回执。测试先红后绿，初始截图/数据库保留。
2. 过期租约owner可在尚无接管者时保存并续租：PG红测复现；save在版本/owner之外要求lease_until>now()，confirm冲突映射409。现有列及迁移未改。
3. AB10提交后刷新不显示回执：银行执行后丢弃确认HTTP响应，刷新恢复state遗漏completedActionCount，导致回执组件未运行。保留有效计数并从所属任务读取绑定回执；恢复角色元数据经过原Zod校验。先红后绿，真实RC2刷新同task/receipt、无二次确认卡/扣款。

## 本轮证据

- AB05 PASS：两个真实标签提交相同UI生成的有效intent/hash/authorization payload；并发屏障只延迟传输，不伪造响应/授权。一200一409，SQL一笔transfer和借记，两页显示同一receipt，再次confirm无额外效果。后续provider超时保持独立BLOCKED_PROVIDER并保留银行回执，未谎称全部业务完成。
- AB09 PASS：旧worker在真实execute前延迟，PG租约人为到期，新worker接管并确认原intent/auth/key；释放旧worker后其save拒绝，权威checkpoint不被覆盖，银行一次效果。是确定性延迟/过期注入，不冒称OS强杀。
- PG状态测试本轮11/11通过、0skip，专用新数据库，脚本银行；与上述实际Spring资金竞争分别记录。
- AB03权限支持测试PASS：错误intent/hash、另一真实客户均拒绝，零资金变化；不是浏览器修改链路完整验收。
- AB11 provider支持测试PASS：无效模型输出、超时和402通过确定性注入，真实PG保存错误且零资金变化；不当作真实DeepSeek返回402。
- AB10 PARTIAL：确认HTTP响应丢失后刷新已过，但未模拟SSE帧中断；登出/新登录的新session不能读取旧任务（404），没有隐式会话迁移。不得以放宽owner检查补齐验收。

## 非转账操作恢复审计

| 操作                       | 权威状态接口                                 | 执行/回执及幂等                                       | 安全恢复边界                                                                                     |
| -------------------------- | -------------------------------------------- | ----------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| 普通转账                   | transfer-intents/{id}                        | transfers执行，同key回放原receipt                     | 原intent/auth/key可恢复；不得新建交易                                                            |
| 卡冻结/解冻/挂失/控制/限额 | card-action-intents/{id}                     | card-actions与card-actions/{actionId}；回执ID独立生成 | 已知receipt ID可人工核查；丢失响应时intent不返回关联action ID，不猜测；UNKNOWN/PARTIAL不自动重放 |
| 信用额度申请               | credit-limit application详情（须已知申请ID） | 独立提交与审批状态；不得自动批准                      | 缓存PREPARED不足以证实未提交，结果未知不重提                                                     |
| 银行卡申请                 | applications/{id}（须已知申请ID）            | applications提交；确认仅代表提交                      | 无可核验提交关联时UNKNOWN/PARTIAL，禁止盲重提                                                    |
| 代扣撤销                   | recurring-payment-action-intents/{id}        | action回执单独ID，银行管理授权状态独立                | 不把第三方订阅模式当授权；无关联receipt保持UNKNOWN/PARTIAL                                       |
| 续费提醒创建/修改/取消     | renewal-reminder-action-intents/{id}         | reminder动作/实际提醒版本；仅站内                     | 不以当前提醒状态猜测原操作回执；无关联回执不重提                                                 |
| 理财申购                   | investment-order-intents/{id}                | investment-orders/{orderId}，执行幂等                 | intent状态非receipt；未知order ID不推测，UNKNOWN/PARTIAL                                         |
| 理财赎回                   | investment-redemption-intents/{id}           | 赎回执行返回回执，非通用转账                          | 缺可核验回执不重放，UNKNOWN/PARTIAL                                                              |
| 定时创建/修改/取消         | scheduled-payment-intents/{id}               | 返回具体schedule，原key幂等                           | 不以当前schedule替代历史动作回执；无可靠关联不自动恢复执行                                       |
| AA创建/取消                | split-action-intents/{id}                    | 返回split，原key幂等                                  | 请求不扣参与者；缺完整关联保留UNKNOWN/PARTIAL                                                    |

本轮新增逐kind离线测试覆盖七类EXECUTED但缺回执情况，均只读一次、无mutation、PARTIAL；两类申请未知测试保留。尚未逐动作完成真实Spring故障及最终实体对账，因此AB07、R1仍PARTIAL。没有将全部动作套用转账重试。

## 最新版本补验与结论

**R1 = PARTIAL**。RC3 Agent / RC2 Web 已实际部署主项目；43个Agent源码逐一相同、六项健康。主库五表与初始baseline数量及哈希一致。隔离测试环境停止、卷保留。

最新真实银行确定性补验 AB02/04/06/08、两笔串行分别确认、金额100→200取消旧意图/拒绝旧授权全部通过。原始 `artifacts/rc/bank-20261021T024122.jsonl` 由 docker exec 内部命令成功完成，单case均保留前后SQL/断言/时间。首版外层wrapper把主动跳过的 SEQUENTIAL-REAL-MODEL 也算失败，因此外层返回1；该统计缺陷已修正，未因此重复制造资金效果。内部银行断言成功与外层统计错误分别披露。该次AB01/REVISION-API等ENVIRONMENT_BLOCKED记录来自显式skip-model分支，不能当成该次真实联网尝试；最新ConnectError另有真实probe。

完整R1冻结条件未全闭合。金融结果不确定时保留任务/intent标识及银行记录核查入口；没有可靠跨登录恢复能力的情形明确披露。没有将只读组件恢复扩大为新会话金融授权。

## PostgreSQL skips 审计

最新 Agent 全量356项：345通过、11跳过，原因均为本机运行未配置隔离 R1_TEST_DATABASE_URL。原10项加本轮新增过期owner测试，共11项；随后在真实隔离PostgreSQL中逐项通过、0skip。全部安全关键，不能将跳过当通过，也没有无条件skip。所用bank为脚本bank；资金副作用另在真实Spring测试核验。

| test_name（均在 PostgresRecoveryTests）                              | 原skip原因/环境 | 安全关键 | 可本地运行 | 补验 |
| -------------------------------------------------------------------- | --------------- | -------- | ---------- | ---- |
| test_cancelled_intent_stays_unconfirmable_after_replacement          | 缺隔离PG URL    | 是       | 是，专用DB | PASS |
| test_checkpoint_redacts_secret_and_full_account_without_changing_ids | 同上            | 是       | 是         | PASS |
| test_crash_after_read_observation_before_checkpoint_replays_read     | 同上            | 是       | 是         | PASS |
| test_crash_before_read_tool_call_resumes_same_task                   | 同上            | 是       | 是         | PASS |
| test_different_customer_cannot_load_task                             | 同上            | 是       | 是         | PASS |
| test_executed_by_bank_but_response_lost_never_reexecutes             | 同上            | 是       | 是         | PASS |
| test_expired_owner_cannot_extend_its_lease_by_saving                 | 同上；本轮新增  | 是       | 是         | PASS |
| test_lease_blocks_parallel_worker_and_expiry_allows_recovery         | 同上            | 是       | 是         | PASS |
| test_old_worker_cannot_overwrite_newer_checkpoint                    | 同上            | 是       | 是         | PASS |
| test_prepared_intent_and_agui_thread_survive_process_replacement     | 同上            | 是       | 是         | PASS |
| test_two_workers_confirm_once_under_persistent_lease                 | 同上            | 是       | 是         | PASS |

命令：`python scripts/final-sprint-postgres-tests.py --project aster-final-sprint-20261020 --output artifacts/rc/lease-green`。日志及SQL指纹位于该目录。旧10项失败/环境记录不删除。

## 仍然不能声称完成

- 真实worker进程强杀/整机崩溃不是本轮延迟与进程替换测试覆盖内容。
- 提交点HTTP响应中断不等于已验收SSE帧中断；跨登录恢复尚缺设计/实现。
- 非转账所有操作权威回执关联尚未闭环。
- 真实模型链路当前连接失败；不能用本轮早期成功覆盖RC3复验失败。

逐项版本、状态、命令及产物见 [rc-results.json](rc-results.json)、[RC总报告](rc-final-report.md)。

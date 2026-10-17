# M21 — Card Management Agent 验收报告

日期：2026-10-09  
状态：**PASS（C01–C20 与关键安全检查通过）**  
范围：M21 Card Core、Customer API、Agent v2、Web。到此停止，不进入 M22。M18.6 的 100 题扩展评测仍为 **DEFERRED**。先前的 PARTIAL 记录保存在 [checkpoint](m21-card-management-agent-checkpoint.md)。

## 实现

Customer OpenAPI 以兼容增量从 71 扩至 79 个操作，Public API 保持 9 个操作。新增操作覆盖 CardActionIntent 撤销、模拟卡交易授权，以及信用额度申请的准备、撤销、提交和查询。既有卡片查询、卡片操作与银行卡申请接口未改变原有路径或语义；生成类型与 implementation matrix 已同步。Flyway 只新增 V27–V30，未修改历史 migration。

银行卡状态区分 `ACTIVE`、可逆的 `FROZEN` 和不可普通解锁的 `REPORTED_LOST`。`CardActionIntent` 由银行端持久化并管理 `PREPARED → EXECUTED / CANCELLED / EXPIRED`；取消与执行锁定同一意图，旧哈希、旧授权或重复确认不能使已取消意图执行。交易控制及客户设置的单笔／每日限额由 Spring Banking Core 持久化和执行。模拟卡授权路径实际检查卡状态、渠道控制和限额；这条路径不代表真实卡组织清算。客户调高自设限额不能提高银行授予的信用额度。

信用额度提升使用独立的 `CreditLimitIntent` 和 `CreditLimitApplication`。确认后申请进入 `UNDER_REVIEW`；现阶段没有审批服务，因此不自动批准，也不修改授信额度。已有银行卡产品申请仍是提交待审核，不自动发卡。

Agent v2 保留 **LLM → Tool → Observation → LLM** 循环。模型可见工具由 35 增至 **41**：六个既有只读卡工具保留，加入卡片限额／信用申请读取及必要的 PREPARE 工具。`execute_card_action` 等执行 API 不在模型工具表内。Runtime 在 PREPARE 后暂停于 `WAITING_CONFIRMATION`；只有用户确认、必要的绑定验证和银行端复核后，受信任 Runtime 才调用 Spring。执行后的卡操作 observation 回到原任务，模型可以继续处理尚未完成的用户目标。Python 不持有权威卡片状态。

Web 在原银行卡详情和 Agent 工作区展示正式挂失、交易限额和独立信用额度申请。风险增加的操作要求密码与短信验证码；保护性锁定只需确认。确认卡片时不再发送空的 `actionAuthorizationId`，避免银行返回 `INVALID_REQUEST`。回执按操作类型显示，中文步骤标签已补齐。本地 Core 启动脚本使用 `demo,local` profile：演示短信收件箱可供浏览器测试，`localhost:3000` 凭证式 CORS 仍受精确来源限制；默认和生产 profile 不开放演示收件箱。

## C01–C20

| Case                 | 结果 | 主要证据                                                                                                                                  |
| -------------------- | ---- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| C01 名下卡列表       | PASS | 真实 DeepSeek 返回银行卡列表；Spring 所有权查询                                                                                           |
| C02 尾号定位         | PASS | 真实 DeepSeek 将 1937 定位到实际卡 ID                                                                                                     |
| C03 状态读取         | PASS | C02 与浏览器读取银行 `ACTIVE/FROZEN` 状态                                                                                                 |
| C04 产品列表         | PASS | 真实 DeepSeek 与浏览器读取 Public Catalog                                                                                                 |
| C05 产品比较         | PASS | 真实 DeepSeek 经过 4 次工具调用，区分产品类型和申请状态                                                                                   |
| C06 银行卡申请       | PASS | 真实模型仅准备复核单；Agent 确认边界测试证明提交前无申请；Spring 申请集成测试覆盖持久化                                                   |
| C07 申请状态         | PASS | 浏览器读取属主申请，未虚构批准或发卡                                                                                                      |
| C08 自设交易限额     | PASS | 真实模型／浏览器准备并可取消限额意图；Spring 测试执行后验证单笔限额实际拦截                                                               |
| C09 银行上限         | PASS | CardDomainTest 拒绝超过银行上限；信用额度不随客户限额改变                                                                                 |
| C10 信用额度申请     | PASS | 真实模型准备申请；Spring Testcontainers 提交后持久化 `UNDER_REVIEW`，授信不变且重放不重复                                                 |
| C11 控制与限额查询   | PASS | 真实 DeepSeek 与浏览器读取实际卡片状态                                                                                                    |
| C12 临时锁定         | PASS | 真实模型准备；同一浏览器 C20 确认后银行持久化 `FROZEN`                                                                                    |
| C13 解锁             | PASS | Spring 验证绑定的 step-up；本地真实 HTTP 将演示卡从 `FROZEN` 恢复 `ACTIVE`                                                                |
| C14 重复锁定         | PASS | Spring 竞争意图及已锁卡规则阻止第二次状态变更                                                                                             |
| C15 正式挂失         | PASS | 真实模型准备 `REPORT_LOST`；Spring 持久化状态并禁止普通解锁                                                                               |
| C16 挂失后解锁拒绝   | PASS | `CardPostgreSqlIT.cancelledIntentCannotBeExecutedAndLostCardCannotBeUnlocked`                                                             |
| C17 修改／取消旧意图 | PASS | 浏览器取消后旧确认按钮失效；Spring 验证已取消意图不可执行                                                                                 |
| C18 幂等与并发       | PASS | Testcontainers 同意图并发、重复 key、取消／执行竞争；最多一次状态变更与回执                                                               |
| C19 隔离与注入       | PASS | Spring 拒绝其他客户卡片；恶意卡名 Agent 测试证明只读请求不能 PREPARE；真实模型只读查询无意图                                              |
| C20 锁卡后查异常     | PASS | 同一真实浏览器会话：`list_cards → get_card → prepare_card_action(FREEZE) → 用户确认 → 银行执行 → detect_transaction_anomalies → 最终回答` |

真实模型的初次失败和修复后重测均保留在 [脱敏 trace](../../artifacts/m21-card-deepseek-traces.jsonl)。最新 C01、C02、C04、C05、C11、C19 为 `SUCCEEDED`；C06、C08、C10、C12、C15、C20 在未确认的 smoke 中为 `WAITING_CONFIRMATION`，随后清理为 `CANCELLED`。C20 完整执行另经真实浏览器确认：模型选择可逆 `FREEZE`，银行回执生成后再次调用异常检测工具，最终回答同时包含锁卡结果和当日检测结果。测试结束后，演示信用卡通过独立、已验证的银行操作恢复为 `ACTIVE`。

## 安全与持久化

- 无用户确认时，PREPARE 不改卡状态；直接执行工具不会暴露给 LLM。CardActionIntent 的客户、卡、版本、操作与前后快照由银行端校验。
- 已撤销意图不能复活。取消／执行并发测试证明两者不能同时成功；执行幂等记录和唯一回执防止重复效果。
- `REPORTED_LOST` 不可由 `UNFREEZE` 恢复；模拟授权对已锁定或挂失卡拒绝，对关闭的渠道和超限金额拒绝。
- 客户自设限额与银行政策上限、信用额度分开保存。信用额度申请未审批前授信字段不变。
- Agent 将卡名、产品文本及交易备注视作不可信数据；只读目标触发的伪造操作指令被确定性 PREPARE 边界拒绝。
- M18 转账、M19 账单分析、M20 理财等回归包含在全量 Spring、Agent、Web 测试中。

## 验证记录

| 检查                                          | 结果                                                                                                                                                                                                         |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Spring `clean verify`                         | **PASS**：211 单元测试、416 PostgreSQL Testcontainers 集成测试；Spotless 通过。日志：`artifacts/m21-maven-verify-final.log`                                                                                  |
| M21 卡片定向重测                              | **PASS**：CardDomainTest 12 项、CardPostgreSqlIT 41 项；新增挂失后模拟授权拒绝断言。日志：`artifacts/m21-card-targeted-final.log`                                                                            |
| Agent 全量测试                                | **PASS**：215 项，含 M21 Runtime 与注入回归。日志：`artifacts/m21-agent-final.log`                                                                                                                           |
| Web 全量测试                                  | **PASS**：500 项及 3 项合约哈希测试。日志：`artifacts/m21-webtest-final3.log`                                                                                                                                |
| `pnpm lint` / `pnpm typecheck` / `pnpm build` | **PASS**。日志分别为 `artifacts/m21-lint-final.log`、`artifacts/m21-typecheck-final.log`、`artifacts/m21-build-final.log`                                                                                    |
| `pnpm contract:check`                         | **PASS**：Customer 79/79，Public 9/9；Customer SHA-256 `1d2c554d4898b29a189dbef3ab38a1bbaa0dfb751af92565f25dcce5345d603b`，Public SHA-256 `460387a9a26548941a692bcd7e7036e21d136b4d6a9cb570faa0a4fc1ac106ef` |
| 真实 DeepSeek 与浏览器                        | **PASS**：12 个真实模型 smoke 案例；浏览器十条自然语言对话及额外 C20 确认／续跑；卡片状态由 Spring/PostgreSQL 核对                                                                                           |

## 已知边界

卡授权是 Banking Core 的模拟授权接口，不连接真实卡网络或商户。正式挂失后补卡、信用额度审批服务及真实 SMS 提供商不在 M21 范围内。Agent 对话任务仍在单进程内存中；重启 Agent 会丢失未完成的对话任务，但银行端意图、卡状态、申请与幂等记录在 PostgreSQL 中持久化。运行正式生产环境前仍需补齐真实外部服务与相应运营控制。

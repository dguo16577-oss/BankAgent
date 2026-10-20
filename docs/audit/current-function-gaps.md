# Aster Bank 功能缺口历史快照（2026-10-02）

> 本文件保留 B4 时点的排查证据，不是当前缺口清单。当前状态见 [项目进度](../project-progress.md)、[综合验收](../milestones/aster-integrated-final-acceptance.md) 和 [剩余问题](../security/integrated-remaining-issues.md)。

核查日期：2026-10-02。依据当前 `v1.1-dev / B4` 源码、OpenAPI 实现矩阵和已保存的验收报告；不把历史 M24 的 48 个接口数当作当前版本。

## 先看结论

- **接口覆盖**：当前 Customer 55/55、Public 9/9，共 64/64 个契约操作已映射到 PostgreSQL 实现；本次 `pnpm contract:check` 通过。[实现矩阵](../backend/implementation-matrix.md)与[实际路由覆盖测试](../../services/banking-core/src/test/java/com/asterbank/banking/OverviewPostgreSqlIT.java)。这只说明现有契约的接口覆盖，不表示所有银行业务已经完成。
- **业务能力**：目前可以演示登录、账户/交易查询、内部模拟转账、收款人管理、单次计划付款管理、卡片状态控制、停止银行侧定期扣款、模拟投资和申请提交。上述操作有数据库持久化及安全校验，但多项仍只连接演示环境。
- **本次验证边界**：已从当前源码构建 Spring JAR（`package -DskipTests`），并启动 PostgreSQL、`demo,local` Spring 和 Next.js 开发服务器。`/actuator/health` 返回 `UP`、`/public/home` 返回 HTTP 200、前端首页已在浏览器打开。未重新运行 Maven 全套测试，也未登录完成全业务浏览器回归。B4 报告记录此前 582 项 Maven 测试通过；不能把此前结果当成本次完整回归。[B4 报告](../milestones/b4-report.md)。

## 用户能看到、但尚未形成完整流程

| 优先级 | 页面 / 功能             | 现状与缺口                                                                                                                                                                                                                                    | 依据                                                                                                                                                                                                              |
| ------ | ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 高     | `/app/agent` 客户 Agent | 已有独立 Python 服务、固定意图路由、有限只读工具、DeepSeek 分类/公开资料摘要与待复核转账提案；**还不是模型自主选择工具、观察结果并循环判断的 Agent**。36 个离线场景为 14 通过、22 未达标；多轮 0/4。没有完成真实双用户 Agent 转账端到端验收。 | [Agent 基线](../testing/agent-baseline-v1.md)、[运行说明](../../services/agent-runtime/README.md)                                                                                                                 |
| 高     | `/ask` 公共咨询         | 页面实际提供建议主题和公开内容关键词搜索，明确显示“AI conversation will be added later”；尚无访客多轮 AI 对话。                                                                                                                               | [GuestAskPage](../../apps/web/src/features/public/public-category.tsx)                                                                                                                                            |
| 高     | 银行卡/贷款申请         | 可核对、验证并将申请持久化为 `SUBMITTED`，可查看列表/详情；**没有审批、授信、发卡、合同签署或放款流程/接口**。申请不能直接产生可用银行卡或贷款余额。                                                                                          | [申请 Controller](../../services/banking-core/src/main/java/com/asterbank/banking/customer/applicationrequest/adapter/web/ApplicationController.java)、[申请报告](../milestones/applications-extension-report.md) |
| 高     | 单次计划付款            | 可创建、修改、取消；到期执行逻辑和数据库事务存在，但**没有常驻调度器**。本地需手动运行一次性 operator；仅创建计划不保证到期自动扣款。                                                                                                         | [计划付款说明](../backend/scheduled-payments.md)                                                                                                                                                                  |
| 中     | Overview 的“充值”“换汇” | 两个按钮仍为禁用的 `Soon`；账户领域明确拒绝外币账户借记/贷记。没有充值入口、执行汇兑及真实可执行报价。                                                                                                                                        | [Overview UI](../../apps/web/src/features/overview/overview-dashboard.tsx)、[Account domain](../../services/banking-core/src/main/java/com/asterbank/banking/customer/account/domain/Account.java)                |
| 中     | 设置                    | 当前只有语言偏好；没有修改个人资料、通知规则、账户安全配置等流程。                                                                                                                                                                            | [Settings 页面](../../apps/web/src/app/app/settings/page.tsx)                                                                                                                                                     |
| 中     | 公共产品与法律信息      | Catalog、帮助、利率和搜索可用，但费率/优惠是演示资料；法律条款、隐私及监管披露仍是明确的占位文字。没有实时汇率来源。                                                                                                                          | [公共页脚](../../apps/web/src/features/public/public-layout.tsx)、[Public Content](../backend/public-content-domain.md)                                                                                           |

## 后端存在接口，但只覆盖演示或部分业务语义

| 领域           | 当前边界                                                                                                   | 仍缺的能力                                                                                                                                                                              |
| -------------- | ---------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 验证与短信     | Session、密码复验、短时验证码、单次授权已有持久化；`GET /customer/demo/sms/{challengeId}` 仅在 demo 暴露。 | 正式环境没有真实 SMS provider；需要短信的操作会以 `503 VERIFICATION_UNAVAILABLE` 拒绝。手机号自助绑定/更换、重发/冷却、登录 MFA 和动态风控均未实现。[SMS 说明](../security/demo-sms.md) |
| 收款人与转账   | `recipients`、`transfer-intents`、`transfers` 可完成本系统内的审阅、入账和回执。                           | 收款目的地是合成目录，未验证真实银行账户，也未连接外部支付/清算网络。没有跨行真实汇款。[收款人说明](../backend/recipient-management.md)                                                 |
| 卡片           | 查询与冻结/解冻等状态动作可记录，并受确认/验证约束。                                                       | 没有真实卡组织、发卡、寄送、刷卡授权、争议/拒付等网络流程；申请提交后不会自动发卡。[B4 报告](../milestones/b4-report.md)                                                                |
| 财富           | 产品、适当性、投资意向和模拟订单可持久化。                                                                 | 估值与产品为模拟数据；没有真实券商执行、托管、赎回或实时净值。[Wealth domain](../backend/wealth-domain.md)                                                                              |
| 定期扣款       | 可停止未来的银行侧扣款记录。                                                                               | 不会替用户取消 Netflix 等商户合同，也不代表撤销历史交易。[B4 报告](../milestones/b4-report.md)                                                                                          |
| 风控与计划执行 | 支付、投资等操作有固定验证策略和单次授权。                                                                 | 没有交易金额/收款人年龄等动态风险阈值；单次计划付款没有生产常驻触发器或到达时间 SLA。[B4 报告](../milestones/b4-report.md)、[计划付款说明](../backend/scheduled-payments.md)            |

## 发布与验收缺口

- **公网部署暂缓**：M24.1 的四个镜像扫描已完成，但报告仍有未处置的 Critical/High，不能把比赛本地演示的可运行状态当作生产安全放行。[容器漏洞报告](../security/m24-1-container-vulnerability-report.md)。
- **本地预览已启动**：前端 <http://localhost:3000/>，Spring <http://localhost:18080/actuator/health>，PostgreSQL `localhost:5432`。旧 B4 JAR 只带 V10，而当前数据库/源码已有 V11；本次改用当前源码新构建的 `target-preview` JAR，Flyway 校验当前 11 个 migration。Agent 服务未启动，故 `/app/agent` 的实时聊天目前不能用于这次人工浏览器验收。
- **评测集尚小**：Agent 当前只运行 36 个固定中文离线场景；英文/改写变体、在线 DeepSeek 多次试验、真实银行 API 双用户隔离及模型工具循环仍待验证。[评测设计](../testing/agent-evaluation-scenarios.md)。

## 建议按这个顺序补齐

1. **先让现有功能可信**：启动最新服务，走真实双用户端到端；确认转账、验证、卡片、申请、计划付款在同一运行版本上可复现。
2. **补齐明确承诺的流程**：计划付款自动触发及监控；申请审批状态/结果；正式短信通道。新增契约前先定义业务与安全边界。
3. **建设 Agent**：从已冻结场景集修正财务语义，再做服务端受控工具调用循环、多轮隔离和只生成可审阅提案的资金动作。
4. **最后处理生产能力**：真实金融网络、法律/数据来源、风控和漏洞处置；本地比赛演示与公网发布分别验收。

本清单列的是**已发现且有证据的缺口**，不是对所有潜在银行业务的穷尽需求表。没有把缺少外部银行网络等演示范围限制误记为已有契约接口的代码缺失。

# AI Banking 比赛演示交付报告

日期：2026-10-01。基线：B4 后的 `v1.1-dev`，Customer 55 个、Public 9 个冻结接口。此轮没有变更 OpenAPI 或接入真实支付网络。

## 用户可以演示什么

| 场景               | 当前能力                                                                                                   | 关键边界                                                                          |
| ------------------ | ---------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| 双用户银行业务     | Alex、Lin 使用各自的持久化账户和浏览器会话；账户、流水、收款人彼此隔离                                     | 两个普通窗口会共享同一浏览器的 `localhost` Cookie，应使用无痕窗口或独立浏览器配置 |
| Agent 查账户与交易 | 按当前 Spring Session 调用只读 Customer API，回答本人账户、交易和消费问题                                  | 不接受客户端声称的 customerId；Banking Core 不可用时不会编造私有数据              |
| Agent 辅助转账     | 将“转给 Lin Wei 10 元”识别为指定账户、收款人和 decimal-string 金额的提案；由用户在原转账页审阅和验证后执行 | Agent 没有转账 mutation 工具，也不持有资金操作权限                                |
| 真实双边记账       | 转出扣款、Lin 入账和双方流水在同一个 PostgreSQL 事务内提交；幂等防止重复入账                               | 仅对本地 Demo 内部收款人建立目的账户映射，不代表真实跨行清算                      |
| 卡片与定期扣款指导 | Agent 读取本人卡片/计划扣款，提供现有页面入口                                                              | 冻卡、控制修改、停止扣款仍走既有页面和授权流程                                    |
| 公开知识图谱       | 从现有 Public API 构建产品、支持文章、利率、优惠与标签/类别关系，回答附本地页面来源                        | 图谱是轻量检索结构，不含客户私有数据，也不代表动态市场报价                        |
| DeepSeek           | 可选 `deepseek-flash` 做受限意图分类与公开资料摘要；失败时确定性回退并显示模式                             | 不向模型发送原始消息、客户数据、Cookie、金额、验证码或账户资料                    |

已有 Web/Backend 业务继续包括账户与交易、转账、收款人、计划付款、银行卡控制、消费统计、投资演示、公开产品目录及银行卡/贷款申请待审核流程。申请不包含自动审批、发卡或放款。实际可逐项操作与记录的步骤见 [人工测试表](../testing/ai-banking-manual-checklist.md)。

建议的比赛演示顺序：先用 Alex 与 Lin 的隔离浏览器会话分别登录；让 Agent 查询 Alex 账户与消费；询问返现信用卡公开条款并打开引用来源；由 Agent 生成“转给 Lin Wei 10 元”提案，在银行页完成审阅与模拟短信验证；最后刷新 Lin 的账户和流水，展示同一笔转账的入账。卡片与定期扣款可作为额外只读指导及现有授权流程演示。

## 实现边界

- `services/agent-runtime` 是 Python FastAPI 服务。`POST /chat` 每次通过 Banking Core `GET /customer/session` 验证 Cookie，只调用固定白名单的 Customer GET 与 Public GET。`GET /knowledge/graph` 只暴露公开数据。
- `apps/web` 在 `/app/agent` 展示对话，`/api/agent/chat` 是同源代理。敏感 Cookie 只经服务器转发；DeepSeek key 只存在 Agent 进程环境变量中。
- Agent 的转账结果是可审阅提案。点击后使用已有 transfer intent、ActionVerification 和确认/回执流程；模型不能构造 API URL 或直接调用金融 mutation。
- `services/banking-core` 新增 Lin 的 Demo seed 与内部目的账户映射。既有 Alex 数据库升级时只补充 Lin，不重置 Alex。金额沿用 BigDecimal/NUMERIC 与 decimal string；会话、CSRF、验证码、资源绑定均沿用既有机制。

## 验证

| 检查                                           | 结果                                                                                                                                                                                                                                             |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Customer/Public 冻结契约 `pnpm contract:check` | 通过；55 + 9 operations 不变                                                                                                                                                                                                                     |
| Java `clean verify`                            | 585 项通过：194 单元、391 个 PostgreSQL 集成测试；覆盖双边到账、幂等、失败回滚和旧库升级                                                                                                                                                         |
| Python `pnpm test:agent`                       | 初次 25 项通过；2026-10-01 DeepSeek 联调调整后 26 项通过，覆盖公开产品精确检索、脱敏意图输入和只读工具边界                                                                                                                                       |
| Web `pnpm test`                                | 461 项 Vitest + 3 项契约哈希测试通过                                                                                                                                                                                                             |
| `pnpm lint` / `pnpm typecheck` / `pnpm build`  | 通过                                                                                                                                                                                                                                             |
| 隔离真实后端 Playwright                        | 3 项通过：双用户 Agent 转账完整链路，以及银行卡/贷款申请提交和登录后返回原产品页；提案前余额不变、用户审阅及验证后 Alex -¥10.00、Lin +¥10.00，刷新无重复                                                                                         |
| Mock Playwright                                | 97/97 通过，覆盖原有公共页、申请、账户、支付、卡片、消费、投资与多屏宽度                                                                                                                                                                         |
| 初次本机真实服务 smoke                         | PostgreSQL、Spring `demo,local`、Python Agent、Next.js 均启动；Alex/Lin 分别登录成功。`/knowledge/graph` 返回 106 nodes、134 edges；Alex 的转账提案及 Lin 的账户问答通过同源 Web 代理。此运行使用 `DETERMINISTIC` 模式，不在保留的日常库执行转账 |
| 追加 DeepSeek 本机 Web smoke                   | 2026-10-01 使用独立 Agent 进程环境加载本机密钥；Web 账户问答出现 `DeepSeek 辅助`（模型仅分类意图，余额仍来自 Banking Core），中文返现卡简介由模型根据公开目录生成并只引用对应产品页。未执行资金 mutation。                                       |

本机 read-only smoke：Alex 登录后 13 个适用 Customer read/list API 均返回 200，7 个 Public read/search API 均返回 200。`GET /customer/transfers` 不是契约操作，返回 405 符合预期。

截图：[本机 Agent 提案桌面](../screenshots/competition-agent-proposal-1440.png)、[390px 窄屏](../screenshots/competition-agent-proposal-390.png)、[中文答复窄屏](../screenshots/competition-agent-zh-390.png)、[隔离真实转账审阅](../screenshots/competition-agent-transfer-review-1440.png)、[回执](../screenshots/competition-agent-transfer-receipt-1440.png)。Agent 在 320px 与 390px 均无横向溢出；真实浏览器分别显示了英文和中文账户答复。真实转账测试使用临时 PostgreSQL，不修改日常 Demo volume。截图中的金额和身份仅属演示数据。

Customer contract SHA-256：`d98175dc20be79eff2b6ca7baf2d1da26295c8aa8041c77813c06e64eb6b5312`。Public contract SHA-256：`460387a9a26548941a692bcd7e7036e21d136b4d6a9cb570faa0a4fc1ac106ef`。

## 本地使用

先启动 PostgreSQL 与 Banking Core `demo,local`，再按 [Agent Runtime README](../../services/agent-runtime/README.md) 启动 Python；Web 使用 backend 模式并设置 `ASTER_AGENT_RUNTIME_URL`。Agent 可在没有 DeepSeek key 时使用确定性模式。不要把 `E:\deeoseekapikey.txt`、key 内容或 Demo 数据库备份提交到 Git。Web 和 Agent 应只在本地回环或受控演示网络开放。

Demo 用户：Alex `alex@aster.local`、Lin `lin@aster.local`；两者本地密码均为 `demo-password`。测试前分别记下账户余额，之后按人工测试表逐项验收。

本机当前演示地址：Web `http://localhost:3000`、Banking Core `http://localhost:18080`、Agent `http://127.0.0.1:18101`。本机的 8001 端口不可用，所以 Agent 运行在 18101，Web 的 `ASTER_AGENT_RUNTIME_URL` 已指向该地址。数据库从 Flyway V10 升至 V11 前，已保存忽略目录内的 `backups/aster-pre-agent-20261001.dump`；不会提交备份文件。若本机进程重启，需按 README 重新启动各服务。

## 尚未完成及发布限制

- Agent 目前覆盖固定的查询、公开知识、转账提案和卡片/代扣导航；没有自主执行、复杂多轮计划或完整自动业务办理。知识图谱是从 Public API 派生的轻量图，没有外部权威数据同步。
- M24 的 Docker Demo Compose 尚未包含 Python Agent 服务；本轮本机演示使用独立 Python 进程和 Web 同源代理。部署为容器时需要另行配置 Agent 服务与 `ASTER_AGENT_RUNTIME_URL`。
- 真实短信、跨行支付网络、贷款/银行卡自动审批、发卡和放款尚未实现。Demo 数据不能作为真实银行数据使用。
- 默认 Agent key 缺失或 DeepSeek 不可用时会回退确定性模式；这不是模型能力验证失败。
- 最初的双用户浏览器 E2E 仍是在确定性模式运行。之后已用本机密钥完成有限的 Web → Agent → DeepSeek 实测；模型参与私有查询的意图分类和公开资料摘要，但不直接生成客户余额、不控制转账执行。模型超时、限流、证据不足或输出未通过校验时仍会安全回退。尚未做持续负载与长期稳定性验收；密钥未写入仓库或日志。
- M24.1 容器漏洞仍有未闭合项；长期或公网部署应继续 HOLD，并完成漏洞处置、HTTPS、secret 管理和运维验收。见 [安全报告](../security/m24-1-container-vulnerability-report.md)。

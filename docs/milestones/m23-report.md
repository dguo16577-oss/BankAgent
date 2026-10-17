# M23 — Full-System Hardening & Release Candidate Freeze

日期：2026-09-29。项目：`D:\BankProject`。验收状态：全部通过，冻结为 **Aster Bank Web RC1**。

## 1–8. 发布范围与安全入口

1. **RC 定义**：Aster Bank Web RC1 是可重复验证的 Competition Demo；不代表可处理真实资金，也未部署到云端。
2. **Contract**：Customer 1.9.0、Public 1.2.0 保持冻结；没有修改 YAML、freeze.json 或生成 DTO。开始检查通过，结束检查见下方验证表。
3. **架构**：Browser → Next.js UI → Spring Security → Application/Domain → PostgreSQL。Public 与 Customer 边界分开，MSW 仅测试或显式启用。详见 [系统架构](../architecture/web-system.md)。
4. **安全覆盖**：保留全部历史后端验证，新增所有冻结 POST 的 CSRF 测试、会话存储故障处理、真实浏览器 Cookie/跨客户/恢复测试。详见 [安全审查](../security/web-security-review.md)。
5. **Session**：BCrypt 登录、失败统一语义、固定时钟过期、logout 旧 Cookie 拒绝、JDBC 持久化重启继续有效。浏览器重复登录验证 Session ID 轮换。
6. **Cookie**：SESSION 为 HttpOnly、Lax、Path=/；default Secure=true，local HTTP 例外。XSRF-TOKEN 可由 JS 读取，`document.cookie` 不能读取 SESSION。
7. **CSRF**：13 个冻结 POST 路径模式均验证缺 token 返回 403，包括 login/logout 和全部金融 prepare/execute。有效 token 的业务流程由真实浏览器执行。403 可重新引导 token，绝不自动重发 mutation。
8. **CORS**：local 仅允许 `http://localhost:3000` 并允许 credentials；其他 Origin/default profile 不自动允许。没有通配符。

## 9–16. 权限、信息与浏览器边界

9. **IDOR**：第二个真实客户访问 Alex 的 14 类可读取资源，均验证 404 和对应 frozen code；覆盖 account、transaction、三类 action intent/receipt、transfer、challenge、recurring、suitability、investment intent/order。授权对象无 GET endpoint，由执行和应用测试验证。
10. **Step-Up**：customer/session/type/ID/hash 精确绑定，三次错误不可复活；浏览器验证失败后新建 Challenge 能恢复。并发验证只签发一个逻辑授权，Session 仍为 AAL1。
11. **Intent**：服务端不可变快照、hash、过期和底层版本校验保持；四个执行领域的冲突/陈旧状态由 PostgreSQL 测试覆盖。
12. **幂等**：相同 key/body 重放原回执，改 body 拒绝。真实转账先提交再丢失响应，显式重试仍只扣一次；Card/Recurring/Wealth 的并发和重放保留在后端阻塞测试中。
13. **敏感数据**：API 继续仅返回 masked identifiers；SecurityEvent 不保存密码、hash、code。数据库只存 credential hash。错误响应不返回 SQL、路径或堆栈；Hibernate 行值错误日志被禁用，应用故障只记类型和关联 ID。
14. **浏览器存储**：没有金融状态或授权的持久化 Query cache。密码/code 用后清理，logout/401 清 Customer cache，Public cache 独立。真实流程扫描 local/sessionStorage。
15. **安全头**：Next 增加 CSP、nosniff、DENY、Referrer-Policy、Permissions-Policy；HSTS 仅显式 HTTPS 设置开启。静态 App Router 仍允许 inline hydration scripts，此限制记录在 [ADR 0020](../adr/0020-web-release-candidate-hardening.md)，不声称具有 nonce CSP 的防护强度。
16. **缓存**：Customer 响应 no-store，transport 请求 no-store；Public 无凭证 GET 不创建 Customer Session。本轮未引入 CDN 缓存策略。

## 17–23. 故障和恢复

17. **Backend down**：实际停止测试 JVM，Customer 显示 retry；启动后原 Session 和财务数据继续使用，无 Mock 回退。
18. **Database down**：实际停止专用 PostgreSQL 容器。修复持久化 Session 读取失败被 `/error` 掩盖成 401 的问题：前置 Filter 返回安全的 5xx；health 503 仅 DOWN。恢复原 volume 后余额与 Session 保留。
19. **Timeout**：20 秒截止时间覆盖 headers/body，合并 Query cancellation；超时中止 transport，显示 retry，不自动执行任何金融重试。
20. **401**：清理身份、Customer 查询和 mutation variables，跳转登录；旧响应不污染新身份。Public 仍可用。
21. **403**：CSRF bootstrap 重建安全状态，但用户必须显式重试原操作；授权失败丢弃无效 grant。
22. **409**：刷新相关权威资源，禁用被拒绝的确认按钮，提示重新准备和审阅。没有客户端覆盖账户/卡状态。
23. **422**：保持 frozen 业务错误和可理解的页面消息；不足余额、不适合产品等由现有领域和 UI 测试覆盖。完整映射见 [故障矩阵](../testing/failure-mode-matrix.md)。

## 24–29. 金融一致性

24. **Transfer**：¥500 转账、同 key 丢包重试、原子 ledger/余额/receipt/idempotency，以及并发和回滚测试保持。
25. **Cards**：Freeze → FROZEN；Unfreeze 经绑定授权 → ACTIVE；授权消费与状态/回执处于同一事务。
26. **Recurring**：Netflix STOPPED 只改变未来安排，历史消费和交易不删除。列表的关联读取由逐项查询改为两次批量查询。
27. **Wealth**：R3 不适合时阻止购买；R2 ¥1000 执行后扣账户并增加持仓；不得计入消费。失败和重放不重复变更。
28. **Full journey**：Public → 登录 → Accounts/Transactions → Transfer → Card Freeze/Step-Up Unfreeze → Recurring Stop → Investment → Overview → Logout。390px 与 1440px 使用各自新鲜数据库，运行生产 Next。
29. **最终 Overview**：Current `22342.31`、pending `32.00`、available `22310.31`；Portfolio `19320.00`；总存款 CNY equivalent `34953.68`。Spending `4968.00`、对比 `4800.00`、`+3.50%`；Netflix 不在 future payments。后端比较所有直接领域 API，使用统一排序和数据源。

## 30–38. 可用性、性能与持久化

30. **Accessibility**：真实 Public/Customer 页面、空状态、关键 review/receipt 和失败验证状态运行 axe；Mock 全量保留 M11 审计。
31. **Keyboard**：登录使用 Tab/Enter；关键执行通过 Enter 激活。Public Search 新增焦点首尾循环，验证 Tab、Escape、焦点返回；没有添加新的 UI framework。
32. **Responsive**：320/390/768/1024/1440 均检测横向溢出；真实空客户和 360 字符无空格 merchant/title 已测试。增加长文本自然折行；金融格式仍使用 decimal string，日期固定 UTC+08:00，并在非 UTC 浏览器时区验收。
33. **请求基线**：生产构建新导航 Overview 2、Transactions 3、Spending 4、Wealth 4 次 Customer 请求，无重复路径。Overview 仅 Session + Overview；未客户端拼接多个领域数据。
34. **SQL 基线**：Transactions 2、Spending 7、Portfolio 1、Recurring 2。扩大交易、关联历史、定期付款、产品和持仓后保持不变。见 [性能基线](../testing/performance-baseline.md)。
35. **Overview SELECT**：仍为 16；扩大 25 组账户/卡/安排仍为 16。没有为降低计数而删字段或改 Contract。
36. **日志/关联**：MDC 在 finally 清理；异常响应保留 correlation ID。区分浏览器取消导致的断开连接与真正序列化错误，避免正常导航产生误导性 ERROR。故障注入产生的可用性告警属于预期。
37. **Restart**：实际重启 Spring 和 Next，保留同一测试 PostgreSQL。Session、Overview 数值继续有效；各领域 integration tests 另验证回执、intent、授权、安全事件、种子与内容不重复。
38. **Multi-tab / history**：同 Cookie 跨标签；A 变更后 B 刷新获取权威余额；A logout 后 B 下一读取进入登录。Transfer back/forward 不重复执行；四种回执支持刷新。后端并发测试保护跨标签重复提交。

## 39–45. 验证与冻结

| 项目                        | 结果                                                                                                                                       |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| 39. Mock Playwright         | 81/81 通过（6.2 分钟），含 M11 axe/键盘/5 个宽度回归                                                                                       |
| 40. Real Backend Playwright | 390px 15/15 + 1440px 15/15，合计 30/30；各使用全新专用数据库，约 1.8 分钟/轮                                                               |
| 41. Frontend                | Vitest/RTL 388；contract-hash 3，通过                                                                                                      |
| 42. Backend                 | `clean verify` 528，通过：189 unit/architecture/web + 339 PostgreSQL integration；0 failure/error/skip                                     |
| 43. Build / 静态检查        | 根目录 pnpm build、lint、typecheck、integration:check 均通过；无后端运行时也可构建                                                         |
| 44. Contract                | 开始/结束 pnpm contract:check 均通过，两个 canonical hash 未变化                                                                           |
| 45. Production config       | build/start 缺 API origin 立即失败；仅 dev/typegen 默认 localhost。无依赖 major 升级；default 无 Demo seed/local CORS，Session Secure=true |

Customer canonical SHA-256：`602ddcc2ca1b3903034bab2979516220fbf3fb78c0212fa4158a4f0c7ac5f3e5`。

Public canonical SHA-256：`460387a9a26548941a692bcd7e7036e21d136b4d6a9cb570faa0a4fc1ac106ef`。

## 46–48. 限制与停止边界

46. **Known limitations**：Demo credentials/code 仅 local/test；Settings/Agent 仍是明确的占位说明。CSP inline-script 限制已披露。没有真实资金、生产身份交付渠道、容量/SLA、安全认证或永久磁盘损坏恢复证明。Playwright traces 可含测试输入，只保存在本机测试产物中，不应随分享包发布。
47. **Deployment deferred**：HTTPS 域名/证书、精确部署 CORS、secret 管理、备份恢复、监控告警、rate limiting、生产容量与更严格 CSP 留待单独批准的部署工作。没有 Kubernetes、云资源或 M24 实现。
48. **Stop**：本轮仅 M23。已冻结 Aster Bank Web RC1；不进入 M24。

## 截图与修改范围

- [Overview 1440](../screenshots/m23-overview-1440.png) / [390](../screenshots/m23-overview-390.png)
- [Transactions 1440](../screenshots/m23-transactions-1440.png) / [390](../screenshots/m23-transactions-390.png)
- [Transfer review 390](../screenshots/m23-transfer-review-390.png)
- [Step-Up review 390](../screenshots/m23-step-up-390.png)
- [Wealth 1440](../screenshots/m23-wealth-1440.png)

主要修改：共享 API deadline/conflict、Next headers/runtime config、四个 mutation hook 与 review、Public Search focus、长文本样式；后端 availability filter、异常日志、Recurring 批量读取与测试；真实测试编排/专用 volume、浏览器和 SQL/CSRF 测试；架构、安全、失败、性能、ADR、启动说明和本报告。无业务 schema/migration/依赖版本变化。

## Final freeze

```text
CUSTOMER API: 39 / 39
PUBLIC API: 9 / 9
TOTAL BACKEND: 48 / 48
FRONTEND: REAL BACKEND
MSW: TEST / EXPLICIT MOCK ONLY
SYSTEM HARDENING: COMPLETE
RELEASE: ASTER BANK WEB RC1
DEPLOYMENT: NOT YET COMPLETE
STOP AT M23.
DO NOT ENTER M24.
```

验证原始记录：根目录 `m23-contract-initial.log`、`m23-contract-final.log`、`m23-lint.log`、`m23-typecheck.log`、`m23-frontend-test.log`、`m23-build.log`、`m23-maven.log`、`m23-real-mobile.log`、`m23-real-desktop.log`、`m23-mock-e2e.log`。日志为本地 ignored 产物；长期结果记录在本报告和测试源码中。真实 API 请求/隔离证据位于 `test-results/backend-evidence`，不包含 Cookie 或响应 body。

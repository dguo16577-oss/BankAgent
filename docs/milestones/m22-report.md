# M22 — Frontend → Real Spring Backend Integration

日期：2026-09-29。项目：`D:\BankProject`。M22 完成，验证通过，停在 M22。

## 1–6. Runtime、配置、MSW、transport 和生成类型

1. **Runtime architecture**：Next.js 提供 UI，浏览器通过统一 API client 直接访问 Spring :18080；没有 BFF、API proxy 或新增 endpoint。
2. **Backend/mock**：正常 `pnpm dev/build/start` 使用 backend。`pnpm dev:mock` 或显式环境变量选择 mock；网络错误、401/403/500 均不会启动 MSW。
3. **Base URL**：`NEXT_PUBLIC_BANKING_API_BASE_URL` 为 origin，默认工作区命令设置 localhost:18080；规范化尾部 `/`，拒绝缺失、非法协议、credentials、path/query/fragment。Next.js 公共变量在构建时确定，不能靠改运行中环境改变已构建 bundle。
4. **Conditional MSW boot**：仅 mock 分支动态导入 worker。Backend 初始化清理两项旧 Aster Mock sessionStorage key，注销匹配的 mock worker；若旧文档仍受其控制，先 reload 后释放查询。
5. **HTTP transport**：Customer credentials=include，Public=omit；mutation 附 CSRF；GET 支持 AbortSignal，cache=no-store。网络/解析/HTTP 错误有统一类型。
6. **Generated types**：继续使用 customer-api.d.ts/public-api.d.ts，没有重复 DTO。新增 AST 审计从 frozen YAML 对照全部 apiGet/apiPost 调用。

## 7–14. 身份与请求安全

7. **Session bootstrap**：GET Customer Session 的匿名 401 可初始化 XSRF cookie；并发初始化合并为单次请求。
8. **Login**：真实 email/password POST，Spring 创建/轮换会话，随后 GET Session 得到 authoritative identity 和新 CSRF 状态。密码只在表单/请求生命周期内存在，完成后清空输入和 mutation variables。
9. **Logout**：带 CSRF POST，真实撤销服务器会话，清除 Customer queries/mutations，SPA 跳转登录；不会清空匿名 Public cache。
10. **401**：Customer 数据请求触发统一 identity invalidation；删除 Session user 数据和敏感缓存。Session 查询自身由 guard 处理；登录失败不触发全站 logout。Public 401 不触发 Customer invalidation。
11. **CSRF**：JS 可读 XSRF-TOKEN → X-XSRF-TOKEN。缺失时 bootstrap；security 403/INVALID_REQUEST 刷新 token 后显示原错误，需用户明确重试。没有自动重放 mutation，也没有把整个 auth namespace 排除 CSRF。
12. **Cookie**：SESSION HttpOnly、Path=/、SameSite=Lax；local HTTP Secure=false，非 local 后端 Secure=true 配置保持。JS 不读取 Session ID。CORS 精确允许 localhost:3000 + credentials。
13. **ApiError**：保留 status、frozen code、message、kind、X-Correlation-Id。Domain 403（例如 Step-Up required）不当作 Session expired。
14. **Idempotency**：每个 immutable intent 使用 `confirm_<intentId>`；同 intent/retry/receipt recovery 保留 key 和精确 body，新 intent 对应新 key。关闭自动 mutation retry。真实 E2E 在 Spring 已提交转账后丢弃响应，明确重试取得同一 receipt，无第二次扣款。

## 15–24. 全领域前端接入

15. **Public 9/9**：Home、Navigation、Catalog 列表/详情、Support 列表/详情、Rates、Offers、Search；Fees 继续复用既有 Public read models。
16. **Customer 39/39**：静态 typed-client 审计全部覆盖，与后端实现矩阵匹配。详见 [客户端审计](../frontend/client-integration-audit.md)。所有 frozen endpoint 保持原 path/method/body/response。
17. **Overview**：读取 Spring 聚合 read model，不再依赖浏览器 mock store；最终状态反映转账、卡片、Recurring 和投资。
18. **Accounts**：列表/详情使用真实 Customer Session，原币余额、pending、available 和 equivalent 来自 API。
19. **Transactions**：filters/search 同步 URL 并进入 Query key，API 过滤，GET 可取消；cursor opaque。真实 fresh DB 的 61 条交易翻页无重复/遗漏，改变过滤条件首个请求不携带旧 cursor。
20. **Transfer**：Recipient → prepare intent → backend snapshot review → explicit execute → persisted receipt；500 CNY 转账后 Current 23342.31，available 23310.31。
21. **Cards + Step-Up**：Freeze 为 protective confirmation；Unfreeze 创建真实 challenge，246810 local verifier 授予 intent-bound authorization，再执行 Card action。Frontend 不判断全局 AAL2。成功清理 grant；authorization terminal error 要求重新验证。
22. **Spending**：直接读取 SQL analytics，fresh baseline 4968.00 / 4800.00 / +3.50%；Frontend 不扫描 transactions 重算。
23. **Recurring**：Netflix STOP_FUTURE_PAYMENTS 经 immutable intent 和幂等执行；历史仍在，未来 upcoming 不再包含 Netflix。Bookshop 的 managementCapability=NONE 决定不显示停止按钮，不按名称硬编码。
24. **Wealth/Suitability**：服务端 R3 NOT_SUITABLE 阻止继续；Stable Bond R2 SUITABLE 后创建投资 intent，确认1000 CNY。Portfolio 19320.00，Current 22342.31，交易存在，Spending 不变。

## 25–30. Cache、隔离和真实 E2E

25. **Invalidation**：Transfer/investment 丢弃旧 cursor pages 并刷新 Accounts/Transactions/Overview；Card 刷新 Cards/Overview/intent；Recurring 刷新 Recurring/Overview/Spending；Investment 同时刷新 Portfolio。Query key 全表见 [集成说明](../frontend/backend-integration.md)。
26. **Sensitive cache audit**：Customer queries/mutations 全部为 memory-only，logout/401 清除。Step-up inactive gcTime=0；验证码、密码及 mutation variables 清空。未安装持久 query cache/IndexedDB adapter。Public 前缀单独保留。
27. **Fixture audit**：`pnpm integration:check` 拒绝生产 fixture import 和 localStorage/sessionStorage 写入；只豁免显式模式 bootstrap 的动态 worker import。Mock suite 保留自身 Demo persistence，backend 无该持久化路径。
28. **No fallback proof**：Backend-unavailable 浏览器测试只出现 Session retry，不出现 fixture balance；transport unit test 验证单次失败不重试/回退；bootstrap tests 验证 backend 不启动 MSW。
29. **Ephemeral DB**：专用 Compose project + PostgreSQL tmpfs +15432；不挂载开发 volume。每次从 Flyway/seed 开始，结束销毁；无 reset HTTP API。
30. **Real E2E architecture**：Node orchestrator 检查端口/JDK、构建 Spring、等待 PG/Spring health；Playwright 启动 Next backend mode，单 worker 顺序执行。local,e2e 专用固定 Clock；真实登录/CSRF 全部保留。

## 31–40. 真实浏览器证据

31. Public 匿名浏览器访问九个接口，未生成 Customer SESSION。
32. Login 使用真实表单，检查 HttpOnly Session 和 JS-readable CSRF cookie；有效 Session 可刷新深链，匿名深链回到登录。
33. Transfer 丢响应重试保持两次相同 key、仅一次扣款；刷新 receipt 仍存在。
34. Card freeze FROZEN → step-up → unfreeze ACTIVE，授权结果由 Spring 提供。
35. Netflix STOPPED、历史 Netflix payment 仍可见；Bookshop detected pattern 无停止操作。
36. R3 unsuitable + R2 purchase，核对持仓和扣款。
37. Final Overview：CNY equivalent deposits **34953.68**；Current **22342.31**；Portfolio **19320.00**；Spending **4968.00**、comparison **4800.00**、**+3.50%**；Netflix upcoming 消失，Transfer/Investment recent transactions 可见。
38. Logout 后 API Accounts 401；Public rates 仍可访问。另一测试在临时 DB 过期 Session，下一 Customer query 跳转 expired 登录页。
39. CORS：浏览器收到 exact allow-origin=http://localhost:3000，Customer allow-credentials=true。无 credentials wildcard 或 localhost production-policy 修改。
40. Network proof：`test-results/backend-evidence/network.json` 记录实际 :18080 的 method/path/status，断言 fromServiceWorker=false，禁止同源 /customer 或 /public API，检查无500和 Session query 无 storm。该文件不保存请求 body/cookie/code。截图位于 `docs/screenshots/m22-*.png`；已人工检查桌面/窄屏截图。

## 41–46. 验证结果

| 编号 | 验证                             | 结果                                                                                   |
| ---- | -------------------------------- | -------------------------------------------------------------------------------------- |
| 41   | 完整 Mock Playwright             | 81 passed，8.0 分钟；缓存修正后另复查 Security 6/6                                     |
| 42   | Real Backend Playwright          | 3 passed，最终复跑 51.1 秒；真实 Cookie/CSRF/数据库                                    |
| 43   | Maven clean verify               | 505 passed：183 unit/architecture/contract + 322 PostgreSQL；0 failures/errors/skipped |
| 44   | Vitest/RTL + hash                | 26 文件、383 passed + 3 hash tests；相较基线增加 24 项                                 |
| 45   | Backend-mode build               | 通过；Spring :18080 停止时完成静态生成和生产构建                                       |
| —    | lint/typecheck/integration audit | 全部通过；48/48 client audit                                                           |
| 46   | 开始/结束 contract:check         | 均通过；Customer/Public hash 不变                                                      |

Frozen canonical hashes（未修改 customer.yaml、public.yaml、freeze.json）：

- Customer 1.9.0：`602ddcc2ca1b3903034bab2979516220fbf3fb78c0212fa4158a4f0c7ac5f3e5`
- Public 1.2.0：`460387a9a26548941a692bcd7e7036e21d136b4d6a9cb570faa0a4fc1ac106ef`

本轮没有新增 migration，仍 V1–V6；没有新增 generated DTO，也没有修改后端金融领域规则。

证据日志：根目录 `m22-unit.log`、`m22-mock-e2e.log`、`m22-mock-security-e2e.log`、`m22-real-e2e.log`、`m22-verify.log`、`m22-build.log`、`m22-lint.log`、`m22-typecheck.log`、`m22-contract-initial.log` 和 `m22-contract-final.log`。Maven XML 汇总实测为 505 tests、0 failures、0 errors、0 skipped。真实浏览器证据记录 127 个响应（114 个200、7 个201、6 个预期401），无5xx，21 次 Session 请求分布于完整导航/刷新链路。

截图：[Overview 桌面](../screenshots/m22-overview-1440.png)、[Overview 窄屏](../screenshots/m22-overview-390.png)、[Transfer receipt](../screenshots/m22-transfer-1440.png)、[Step-Up review](../screenshots/m22-step-up-1440.png)、[Wealth](../screenshots/m22-wealth-1440.png)。五个关键页面各有390/1440两张，共10张；另有320px无横向溢出断言。

临时 PostgreSQL 和自启 Spring/Next.js 已清理；未改动日常数据库 volume，也未停止机器上的无关容器。

## 修改范围

- API runtime/base URL/CSRF/bootstrap/ApiError、Session/auth cache 与 Login/Logout hooks。
- Card grant lifecycle；Recurring/Wealth security 403 的显式 retry；Transfer snapshot 提示。
- Settings/Agent 标注未接入后端；主要业务布局保留。
- Workspace runtime scripts、环境样例、Next/Vitest/Playwright 配置。
- Real E2E orchestrator/Compose/test suite、frontend boundary unit tests、48-operation 静态审计。
- Backend 仅增加 local,e2e 条件 Clock 配置。
- 集成文档、测试文档、ADR0019、客户端矩阵、本报告、README 和项目进度。

## 47. 已知限制

- 本地 Demo credentials/code 和 frozen SIMULATED_AUTH 命名保留；没有生产身份渠道或真实资金网络。
- 真实 E2E 固定时间只在 local,e2e 启用；日常数据库保留历史 mutation，数据不保证等于 fresh baseline。
- 运行配置是 Next 构建时配置，不能运行中热切换后端 origin/mode；跨域部署需另行设计验证，本轮未部署。
- 单浏览器 Chromium/Edge 引擎；真实 E2E 顺序执行，未声称覆盖所有浏览器、压力或生产故障模式。
- Settings/Agent 是明确无后端功能的说明页面。

## 48. 停止边界

```text
BACKEND API: 48 / 48
FRONTEND RUNTIME: REAL SPRING BACKEND
MSW: TEST / EXPLICIT MOCK MODE ONLY
REAL SYSTEM PATH: Browser → Next.js UI → Spring Boot → PostgreSQL
STOP AT M22.
DO NOT ENTER M23.
```

# M21 — Public Banking Backend & Full Backend API Closure

日期：2026-09-28。项目：`D:\BankProject`。前端保持 MSW。

## 1. 实际 Public endpoints

从冻结 Public 1.2.0 manifest 核对并实现，全部为匿名 GET：

| Path                            | operationId          |
| ------------------------------- | -------------------- |
| /public/home                    | getPublicHome        |
| /public/navigation              | getPublicNavigation  |
| /public/catalog                 | listPublicCatalog    |
| /public/catalog/{slug}          | getPublicCatalogItem |
| /public/support/articles        | listSupportArticles  |
| /public/support/articles/{slug} | getSupportArticle    |
| /public/rates                   | getPublicRates       |
| /public/offers                  | listPublicOffers     |
| /public/search                  | searchPublicContent  |

没有新增 Fees、Insights、Admin 或 Customer endpoint。

## 2–4. 实现数量

| Surface  | Frozen | PostgreSQL implemented | Remaining |
| -------- | -----: | ---------------------: | --------: |
| Customer |     39 |                     39 |         0 |
| Public   |      9 |                      9 |         0 |
| Total    |     48 |                     48 |         0 |

**Banking Backend API COMPLETE** 仅表示冻结接口实现闭包；不表示 Next.js 已接入 Spring 或已经可以生产上线。

## 5–7. 模块、迁移和表

新增 `com.asterbank.banking.publiccontent`：domain records → application service/repository port → PostgreSQL adapter；HTTP adapter 实现生成的 PublicApi，映射生成 DTO。Public 不依赖 Customer 身份或业务模块，反向依赖也由 ArchUnit 禁止。

新增 Flyway **V6__public_content.sql**，V1–V5 未修改。十张表：

- public_catalog、public_catalog_fees
- public_support
- public_rate_set、public_rates
- public_offers
- public_navigation_groups、public_categories
- public_presentation、public_service_categories

当前共 37 张业务/安全/Public 表，不含 Flyway history。Flyway 拥有 schema，Hibernate 保持 validate。

## 8–11. Catalog、Navigation 和详情

Catalog **21 项**。ID/slug、category/type、title/description、tags、currency、provenance、display order 为结构化列；可变 features/eligibility/actions 等编辑内容使用 JSONB。Fees 为带 FK 的独立子表。slug 和 display_order 唯一。

Category/type/search 在 SQL 中 AND 组合过滤，结果按 authored order 稳定排序。详情使用冻结 slug；未知 slug 返回 404 PUBLIC_CONTENT_NOT_FOUND。所有 21 个详情与 M10 fixture 做完整响应比较。Web generated DTO 的 optional list 默认值在边界映射中显式处理，保持原字段缺省语义。

Navigation 保存 group/section/link 的语义结构，不存 CSS 或 React component 名称。分类页 services 由当前 Catalog/Support/Offers 派生。Home 的 featured services、offers、insights、rates 同样从当前源组合；不保存整份 Home 快照。

## 12–14. Rates、provenance 和 Fees

3 个示例利率/汇率持久化为 PostgreSQL NUMERIC、Java BigDecimal，并作为 decimal string 返回；保留 `7.1000`、`0.80`、`1.50` 的 scale。asOf、lastUpdatedAt 和 source 从数据库读取，source 为 **DEMO_RATE**，明确非 live quote。

费用使用冻结的 label/value/conditions 文本结构及 Catalog provenance，例如 CNY 0 per month。没有虚构 fee effectiveAt 字段，没有从客户 Transfer 推算公开费用。所有时间用 TIMESTAMPTZ / OffsetDateTime，允许规范化 UTC offset，但 instant 不变。

## 15–17. Support、相关文章和 Offers

Support **15 篇**，保留 sections、paragraphs、callouts、tags 和显式 related article IDs；每篇都验证详情及相关引用。相关文章沿用 M10 确定性编写关系，没有语义搜索。

Offers **2 个**，保留 validFrom/validUntil、条款和 DEMO 标记；日期按冻结语义作信息展示，没有新增当前日期过滤或收益承诺。**4 篇 Insight** 是带 insight tag 的 Support 内容，经已有 Home/Navigation 提供。

## 18–20. Search 范围、匹配和排序

只搜索 Public Catalog title/shortDescription、Support title/summary、Offer title/summary。分词按空白，lowercase，每个 token 必须是子串。全部匹配和排序由参数化 SQL 完成，使用 strpos，因此 `%`、`_`、SQL-looking input 不会变成通配符或 SQL。

结果顺序：Catalog → Support → Offers，再按 authored display_order，最后 ID COLLATE "C"。无 relevance score、fuzzy、AI 或个性化。

空/缺省/全空白 q 返回空数组；允许一个字符；超过 200 字符返回 400 INVALID_PUBLIC_QUERY。response query 保留原输入，matchedTerms 返回规范化词。冻结 API 没有 limit 或 pagination，不发明默认条数上限；所有匹配项返回。

Catalog list search 还覆盖 tags；Support list search 还覆盖 tags 和段落。其与全局 Search 的字段差异按 M10 保留。

## 21–24. 数据隔离与安全边界

Public repository SQL 仅访问 Public 表，不读客户账户、交易、卡片、持仓、投资产品或凭证。搜索 Alex、8821、23842 返回空结果。测试比较 Public GET 前后全部 Customer/security 数据，财务状态不变。

独立、高优先级的 Public SecurityFilterChain 使用 STATELESS，GET permitAll；无 CurrentCustomerProvider、CustomerPrincipal 或 SessionSecurityFilter。Customer 原认证/CSRF 保留，未知外部路径继续 fail closed。Public unsafe methods 不开放。

匿名请求不创建 Session/CSRF Cookie。有效、过期及无效客户 Cookie 不影响 Public 内容；Customer accounts 未认证仍 401。全局 Spring Session/MVC 基础设施在携带 Cookie 时可能刷新 last_access_time/expiry_time；测试只排除这两个访问元数据，仍严格检查 principal、生命周期、授权、安全事件和财务记录不变。

Local CORS 仅允许 http://localhost:3000，credentials=true；非允许 origin 拒绝。Default 不自动允许 localhost。保留现有缓存/安全 headers，不增加 CDN/ETag。

## 25–28. Seed、重启、迁移和 SQL 决策

Backend 独立 SQL fixture 从 M10 内容一次性导入；开发脚本 `scripts/m21-export-public.cjs` 可复核来源，runtime 不读取 TS 或 frontend build。只有 local/test profile 注册 seed，所有 INSERT ON CONFLICT DO NOTHING，单事务导入；不覆盖手动编辑、不清库。

测试验证重复 seed 和完整 ApplicationContext 重建后无重复、编辑保留、财务状态保留。Default profile 不 seed；未 provision 元数据时按冻结错误返回 PUBLIC_CONTENT_UNAVAILABLE。

真实 PostgreSQL Testcontainers 从空库应用 V1–V6，并运行 Hibernate validate。独立 local smoke 则在现有 M19/M20 数据库上从 V5 升级 V6，未 reset。

PK/NOT NULL/unique slug/order、Catalog Fee FK、Rate Set FK、非负 NUMERIC、Offer date CHECK、DEMO provenance 约束保护内容结构。最小索引覆盖 category/type 和 category equality，substring 用小规模顺序扫描，不增加无效 B-tree text index、trigger 或搜索引擎。

## 29–30. 架构及 Customer 回归

新增 ArchUnit 规则禁止 Public ↔ Customer 依赖，Public domain/application 禁止 Spring/JPA/adapter/generated contract；Public persistence 禁止 generated DTO。

原有 M12–M20 测试保留。迁移数量断言更新为 6；Customer closure 保持 39 operation 的精确集合，原 M20 “Public 不允许存在”的阶段性 guard 更新为只检查 Customer 集合；新增独立测试对全部 48 项进行精确 closure 检查。

## 31. 真实 local HTTP smoke

使用原有 `aster_m19_smoke_20260928` PostgreSQL 和 local profile，端口 **18080**；执行 `docs/backend/public-content-smoke.ps1`。

- 9 个 Public GET 全部 200；21 Catalog、15 Support、2 Offers、4 Insights、Rates scale/provenance 正确。
- Catalog/Support 未知 slug 404；Search 返回三种明确类型和产品路由；未知/客户信息查询无结果。
- 匿名 Customer accounts 401；bootstrap CSRF → login Alex → session/overview/accounts 200。
- 登录后 9 个 Public 响应与匿名完全一致。
- logout 后 accounts 401，Public home 仍 200。
- 迁移/启动/查询/登录退出前后，原有非会话业务表的行数及内容摘要一致；62 笔交易保留，Current 22842.31、总存款 35453.68、Portfolio 19320.00。

日志：`m21-smoke.log`；状态摘要：`m21-financial-before.log` / `m21-financial-after.log`。仅 Session 和正常登录退出事件发生预期变化，无金融 mutation。临时后端和项目 PostgreSQL 容器验证后已停止，数据卷保留；未操作其他应用的容器。

## 32–34. 实际验证结果

| Command                     | Result                                                                                                      |
| --------------------------- | ----------------------------------------------------------------------------------------------------------- |
| pnpm contract:check（开始） | PASS；两份 frozen hash 未变                                                                                 |
| pnpm lint                   | PASS；ESLint + Prettier                                                                                     |
| pnpm typecheck              | PASS；generated freshness + strict TS                                                                       |
| pnpm test                   | PASS；24 files / 359 Vitest/RTL + 3 contract hash tests                                                     |
| pnpm build                  | PASS；Next.js production build                                                                              |
| PublicContentPostgreSqlIT   | PASS；85 tests，0 failures/errors/skipped                                                                   |
| mvnw.cmd clean verify       | PASS；505 tests = 183 unit/architecture/contract + 322 PostgreSQL；0 failures/errors/skipped；BUILD SUCCESS |
| local HTTP smoke            | PASS；9 Public + Customer Session boundary                                                                  |
| pnpm contract:check（结束） | PASS；Customer/Public canonical hash 均未变                                                                 |

本轮较 M20 的 419 项增加 86 项（85 项 Public PostgreSQL + 1 项 ArchUnit），未删除既有用例。322 项数据库测试包括 Public 85、Wealth 77、Recurring/Spending 52、Card 37、Security 30、Overview 22、Banking 19。完整 clean verify 用时 6 分 30 秒，见 `m21-verify.log`。

Public 专项包括 21 个 Catalog 和 15 篇文章逐项 parity；搜索/过滤/error/CORS/身份隔离/持久化/默认 profile/runtime closure。前端业务、API transport 与 MSW 没有改变。本轮不重复历史 Playwright UI 审计，也不把旧截图或旧浏览器测试计入新结果。

## 35–37. Contract hashes、矩阵和 48/48

| Contract       | Canonical SHA-256                                                  |
| -------------- | ------------------------------------------------------------------ |
| Customer 1.9.0 | `602ddcc2ca1b3903034bab2979516220fbf3fb78c0212fa4158a4f0c7ac5f3e5` |
| Public 1.2.0   | `460387a9a26548941a692bcd7e7036e21d136b4d6a9cb570faa0a4fc1ac106ef` |

customer.yaml、public.yaml、freeze.json 均未修改。Implementation status 扩展至 Public，共 48 项 IMPLEMENTED_POSTGRESQL。审计脚本现在接受两个 manifest 的 operation ID，并提供仅重建矩阵的 `--matrix-only`，不会重写 freeze。

Testcontainers 运行真实 Spring RequestMappingHandlerMapping，逐个比较 method + path + operationId 与两份 manifest，精确数量 39 + 9 = 48；同时核对 implementation-status.json，无缺项或额外 operation。

## 修改文件

- 新增 Public module：Content；PublicContentService/Repository/Failure；PostgreSqlPublicContent、DemoPublicContentSeed、PublicContentConfiguration；PublicContentController/Advice/SecurityChain。
- 新增 V6 migration、独立 public-content.sql seed、M10 reference JSON、PublicContentPostgreSqlIT。
- 修改 ArchitectureTest、OverviewPostgreSqlIT、SecurityPostgreSqlIT 和原有 PostgreSql/Card/Wealth migration-count assertions。
- 新增开发期 import 脚本，更新 audit.mjs 与实现状态/矩阵。
- 新增 Public backend 文档、smoke 脚本、ADR 0018、本报告；更新 schema、project-progress、root/backend README。

## 38–39. 限制与停止边界

- Public 是 DEMO 信息，没有 live FX/证券报价、真实申请、CMS/Admin 或内容发布流程。Default 环境需单独 provision 内容。
- 当前没有分页、全文索引、多语言 ranking 或内容自动失效机制；保持冻结语义，未来变化需明确范围。
- Frontend 与 Spring 仍独立；未来 Session/CSRF/CORS 联调需另立里程碑。
- 未实现 Agent、LLM、RAG、Redis、Kafka、微服务拆分或部署工作。

```text
CUSTOMER API: 39 / 39
PUBLIC API: 9 / 9
TOTAL FROZEN BACKEND API: 48 / 48
FRONTEND API MODE: MSW

STOP AT M21.
DO NOT CONNECT NEXT.JS TO SPRING.
DO NOT ENTER M22.
```

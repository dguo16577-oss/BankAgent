# 登录状态与持久化产品申请交付报告

更新日期：2026-09-29。

## 范围与授权

用户在 M24 之后明确选择新增真实后端持久化申请流程。本次将 Customer contract 从 1.9.0 升至 1.10.0，新增三个接口；Public contract 不变。历史发布镜像没有重建。

## 已实现

- 公共页头读取 Session，登录后显示客户名称并进入个人银行；匿名访问仍正常。
- 产品页的已登录业务入口指向账户、付款或财富。
- 银行卡及个人贷款产品支持申请入口；银行卡页和侧栏提供“我的申请”。
- 填写、校验、核对、提交、列表和详情完整串联；编辑保留内容，支持中英文和窄屏。
- 未登录申请会先登录，再返回原产品；返回地址限定为站内申请路径。
- 后端通过当前认证身份确定客户，不接受请求注入 customerId。
- 申请真正保存到 PostgreSQL，支持重启读取、幂等重试、并发去重、用户隔离。

## Contract 与数据库

新增 `GET /customer/applications`、`POST /customer/applications`、`GET /customer/applications/{applicationId}`。

使用生成的 Java interfaces 和 TypeScript types。申请提交要求 Session、CSRF 和 Idempotency-Key。Money 保持 decimal string，Java 使用 BigDecimal；模拟层使用整数最小货币单位。

Flyway V7 创建 product_applications；包含客户外键、客户/账户复合外键、产品外键、客户/产品与客户/幂等键唯一约束、金额和类型检查。事务内锁定客户行。只返回服务端脱敏账户号。

实现数量为 Customer 42、Public 9，共 51 个 contract operations。

- Customer hash：`95045d4aec5a80b1b677536a89b64f1cdb816caea205256dfd7789647045d94c`
- Public hash：`460387a9a26548941a692bcd7e7036e21d136b4d6a9cb570faa0a4fc1ac106ef`

详细字段与边界见 [API 说明](../api/applications.md)。

## 主要变更位置

- `apps/web/src/features/public`：Session 感知页头与业务入口。
- `apps/web/src/features/applications`、`src/app/app/applications`：申请 UI。
- `apps/web/src/lib/api/applications.ts`：统一 API client 调用。
- `apps/web/src/mocks/application-handlers.ts`：显式模拟模式实现。
- `services/banking-core/.../customer/applicationrequest`：domain、application、web 与 persistence adapter。
- `V7__product_applications.sql`、OpenAPI、generated types、implementation matrix、测试和双语词典。

## 已完成验证

- lint、typecheck、contract check、backend 模式生产 build 通过。
- Vitest/RTL 412 项与 contract hash 3 项通过。
- Maven clean verify：193 项单元测试、344 项 PostgreSQL Testcontainers 集成测试通过，零跳过。
- 新增 5 项后端集成测试覆盖真实 HTTP、CSRF、用户隔离、输入校验、并发去重、重启持久化与余额不变。
- 模拟浏览器回归 90 项：首轮 82 项通过；修复布局、更新新增入口和 Session 探测断言后，其余 8 项复测通过。
- 本地 Spring 真实 HTTP 冒烟通过：登录、Session、账户与申请列表、无 CSRF 拒绝、合法 CSRF 下输入校验、退出后拒绝访问。该冒烟没有创建申请记录。

## 真实前端浏览器联调

已完成。用户手动启动真实前端后，新增 Playwright 真实环境测试通过（1 项完整端到端流程，包含银行卡和个人贷款两次提交）。

- 真实地址为前端 `localhost:3000`、Spring `localhost:18080`、PostgreSQL `localhost:5432`。
- 测试禁用 Service Worker，并断言登录、申请响应来自 Spring URL，不是 MSW。
- 未登录申请保留目的地，登录后回到对应产品；公共页头显示 Alex Chen。
- 浏览器提交银行卡与个人贷款申请，确认请求包含 CSRF token 与幂等键。
- 直接查询 PostgreSQL 核对两条申请的 SUBMITTED 状态、贷款金额 10000.50；刷新页面后仍可读取。
- 核对提交前后账户余额和 pending amount 未改变。
- 查看申请列表、切换中文、验证 320/390/1440px 无横向溢出、退出后页头恢复登录入口。
- 浏览器无未捕获页面错误。测试结束仅删除由本次测试 ID 和唯一邮箱标记共同确认的两条记录；没有删除已有申请或重置数据库。

测试文件为 `apps/web/e2e-applications-live/applications.spec.ts`，配置为 `playwright.applications-live.config.ts`。服务运行后可用 `pnpm exec playwright test --config playwright.applications-live.config.ts` 重跑。若开发库已有同产品申请，测试会主动失败并保留原记录，不会覆盖用户数据。

### 启动问题的实际结论

工具启动命令曾返回 `blocked by policy`，没有提供具体规则，因此无法确认自动审批拒绝的原因。用户终端另有独立问题：PATH 中没有 pnpm。使用本机现有 Node 的完整路径执行 `scripts/web-runtime.mjs start` 后启动成功，浏览器验证也成功。

当前运行的是本地产物的 `next start`，其 standalone 提示不是这次登录或提交失败的原因。正式部署应遵循 Next standalone 入口和静态资源打包方式；本次没有修改或重建原有容器部署。

## 处理边界

SUBMITTED 表示已接收、待审核，不表示审批通过。本轮没有审核工作台、发卡、寄送、授信、征信、合同签署或放款；申请不会改变卡片、余额或交易。

个人贷款金额与期限为演示录入规则，并非贷款报价。按揭、透支、保险仍为信息展示。临时 admin 登录仅属于现有模拟预览，不是后端管理员身份。

## 截图

## 登录与首页导航补充（2026-09-29）

普通登录成功后默认返回银行公共首页 `/`；个人银行仍可从首页用户名入口进入。登录页和个人银行顶部新增中英文“返回银行首页”入口。申请流程携带的合法 `/app/applications` 目标继续保留，避免中断申请。

相关单元测试 15 项、浏览器测试 7 项通过；浏览器覆盖 320、390、1440px 与申请返回流程。lint、typecheck、build 通过。真实前端生产进程需要重启后加载新构建。

### 页面截图

真实 Spring/PostgreSQL 浏览器截图：

- [登录后公共页头](../screenshots/applications-real-header.png)
- [桌面真实申请详情](../screenshots/applications-real-detail-1440.png)
- [390px 真实申请详情](../screenshots/applications-real-detail-390.png)
- [320px 真实申请详情](../screenshots/applications-real-detail-320.png)

此前的模拟浏览器截图：

- [桌面申请详情](../screenshots/applications-detail-1440.png)
- [320px 申请详情](../screenshots/applications-detail-320.png)

# 中文 / English 界面切换

官网页头、登录页、客户工作区页头以及 `/app/settings` 提供 `English / 简体中文` 选择。默认英文。切换立即生效，语言偏好以 `aster.locale` 保存于当前浏览器；跨标签页同步。浏览器禁止存储时，本次访问仍可切换。

## 范围

覆盖官网导航、目录、产品详情、对比、费率、优惠、帮助文章、公开搜索界面，以及客户总览、账户、交易、转账、银行卡、支出、定期付款、财富、投资确认/回执、登录和加强验证界面。演示产品和帮助内容采用本地字典映射已知英文内容。

- 品牌、客户/账户显示名、商户、币种、金额、脱敏号码、资源 ID 和 API payload 保持原值；状态与类型标签只在显示时翻译。
- 日期遵循所选语言，时区仍为 Asia/Shanghai（UTC+08:00）。金额继续保留 decimal string 精度。
- 错误提示优先按 frozen error code 本地化，英文保留服务器原提示；未知内容回退原文，不猜测翻译。
- 搜索仍使用现有 API 的查询语义；本次没有增加后端中文搜索索引或自动翻译服务。
- 不改变 URL、query 参数、表单状态、登录会话或 Query cache，不添加 API endpoint、依赖或 migration。

## 实现与维护

`apps/web/src/lib/i18n/messages.ts` 集中维护文案；`errors.ts` 维护错误代码说明；`useLocale()` 提供 `t`、本地化日期、银行卡类型和错误展示。组件显式使用翻译函数，不扫描或重写 DOM。

服务器与 hydration 首帧默认英文，hydration 后读取浏览器偏好并更新 `html.lang`，因此保存中文偏好后首次加载可能短暂显示英文。这是当前不引入路由 locale 或动态服务器 cookie 读取的取舍；不提供多语言 SEO 路由。后续新增文案/后端内容需要同时补充翻译字典。

## 验证入口

- Vitest：`apps/web/src/lib/i18n/locale.test.tsx`，覆盖双向切换、偏好恢复、跨标签页同步、未知值回退、存储受限，以及原币金额/账户数据保持。
- Playwright：`apps/web/e2e/language.spec.ts`，覆盖中文页面导航、刷新持久化、切回英文和 320/390/1440px 横向溢出检查。
- 运行现有英文测试，确保既有财务及操作流程不受语言功能影响。

## 本次验证结果

- `pnpm lint`、`pnpm typecheck`、`pnpm build`、`pnpm contract:check` 通过；构建使用 backend 模式及显式 API base `/`。
- `pnpm test`：395 个 Vitest/RTL 测试与 3 个 contract hash 测试通过。最终文案/日期调整后另跑 11 个相关测试通过。
- 原有 81 个浏览器场景已验证：完整批次中 80 个通过，1 个登录后导航因 `ERR_ABORTED` 中断，单独重跑通过。新增 5 个语言场景全部通过，包括 320/390/1440px、表单保留、确认回执及中文登录错误。
- 截图：[中文总览](../screenshots/language-overview-1440.png)、[窄屏语言设置](../screenshots/language-settings-320.png)。

本次没有重建或部署 Docker 镜像，M24.1 漏洞处置状态不因此改变。

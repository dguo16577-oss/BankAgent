# Web 模块交接

目录：`apps/web`。技术栈为 Next.js 16、React 19、TypeScript、Tailwind、TanStack Query、React Hook Form/Zod、Vitest、Playwright。真实运行默认对接 Spring/PostgreSQL；MSW 只供测试或显式 mock 模式。

## 功能和边界

- `src/app/(public)`：官网产品与资料页；无需客户 Session。
- `src/app/login`、`src/app/app`：登录与个人银行工作区。业务入口包括总览、账户/交易、转账与收款人、卡片、支出、财富、申请、设置和 AI 助手。
- `src/features`：按业务领域组织页面组件与查询/表单逻辑；`src/lib/api` 负责 typed API、Cookie/CSRF、错误处理；`src/generated` 是 OpenAPI 生成物，不能手改。
- `src/app/api`：同源 Agent 代理。浏览器不持有 DeepSeek 密钥，也不能直接执行模型建议的金融操作。
- `src/mocks`：MSW fixture；mock 成功不证明真实银行 API 成功。`e2e` 为浏览器测试。

金融操作必须展示银行返回的不可变意图/条款，在确认和必要的 step-up 后才由可信路径执行。Agent 的回答、待确认卡和完成回执应分别表示真实状态；尤其不要把“下一项已准备”显示成“上一项已执行”。登录后从官网触发的操作应回到原来源页。

## 安装、运行与验证

从仓库根目录执行：

```powershell
pnpm install --frozen-lockfile
$env:NEXT_PUBLIC_API_MODE = 'backend'
$env:NEXT_PUBLIC_BANKING_API_BASE_URL = 'http://localhost:18080'
$env:ASTER_AGENT_RUNTIME_URL = 'http://127.0.0.1:8001'
pnpm dev
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

生产构建中的 `NEXT_PUBLIC_*` 值在构建时固定，改环境变量后应重新构建并启动。需要纯前端 fixture 时使用 `pnpm dev:mock`，不要让真实后端故障自动回退为 mock。浏览器 E2E 命令见根 `package.json` 和 [真实后端 E2E 说明](../../docs/testing/real-backend-e2e.md)；Playwright 首次运行可能需安装 Chromium。

## 应重点人工验证

1. 官网全部产品入口、登录后返回来源页，中文/英文切换和移动端布局。
2. 多客户窗口隔离；无 Session 的 `/app/*`、CSRF 缺失的修改请求、过期 Session。
3. 银行卡/贷款/保险/储蓄申请原页面表单，提交后在“我的申请”能查到；申请不等于审批通过。
4. 转账、卡控制、投资、提醒/代扣的准备、取消、过期、双击确认、失败回显及刷新后的真实数据。
5. Agent 浏览器同一任务的多次独立确认；每次复核卡的类型、金额/对象、完成回执、部分失败文案与银行数据库一致。

最近 Web 回归为 504 项通过。当前主要验收缺口是 M22 SUB20 的浏览器双确认，以及 M23 X02/X20 动作续接、X10 部分失败在浏览器中的完整显示，见 [最终矩阵](../../docs/milestones/m22-m23-final-acceptance.md)。这不能仅靠 Vitest 断言关闭。Settings 和部分官网资料含演示/说明性内容；不要把页面展示视为实际银行开户、授信或保险核保。

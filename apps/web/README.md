# Web

Next.js 16、React 19、TypeScript、Tailwind 与 TanStack Query 构建的银行服务界面。

## 页面

- 官网：产品、费用、利率及帮助资料。
- 个人银行：账户、交易、转账、收款人、卡片、消费分析、理财、订阅与设置。
- `/app/agent-copilot`：支持结构化结果、任务进度和独立确认的智能助手。
- `/app/agent`：简洁对话界面，保留兼容入口。

`src/features` 按业务组织组件；`src/lib/api` 管理类型化请求、会话、CSRF 和错误处理；`src/generated` 由 OpenAPI 生成，不手改。

浏览器不持有模型密钥。点击页面链接或接受协助不会执行金融操作；复核条款与 step-up 通过后才提交可信确认。

## 开发

从仓库根目录安装依赖后运行 `pnpm dev:backend`。`NEXT_PUBLIC_*` 在生产构建时固定，修改后需重新构建。完整服务使用 [统一启动器](../../START-README.md)。开发检查见 [维护说明](../../docs/release-status.md)。

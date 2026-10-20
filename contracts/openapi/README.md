# OpenAPI 合同

`customer.yaml` 是登录后的客户银行服务合同，`public.yaml` 是匿名公开资料合同；两者是 Web 类型和 Spring Controller 接口的共同来源。`freeze.json` 保存结构哈希及历史兼容性边界。2026-10-11 `pnpm contract:check` 为 Customer 87 / Public 9 个 operation；Customer SHA-256 为 `f0e6e9c55177d5fb28f6fc13cb8bba2780759cfbf6d5764bc656301df22bfb8e`，Public 为 `460387a9a26548941a692bcd7e7036e21d136b4d6a9cb570faa0a4fc1ac106ef`。

## 修改规则

1. 先判断是否能复用既有字段和操作；新增能力应是兼容增量。已发布历史版本及历史 Flyway 迁移不能原地修改。
2. 若合同确需变更，同步 `customer.yaml`/`public.yaml`、`freeze.json`、前端生成类型、Spring 生成接口实现、Mock/真实测试与文档。
3. 从仓库根运行 `pnpm api:generate`、`pnpm api:check`、`pnpm contract:check`、`pnpm typecheck`；在 Banking Core 运行 Maven 生成和 `clean verify`。
4. 测试 401/403、客户隔离、参数边界、状态冲突、幂等、错误码、Cookie/CSRF，而不只测试成功响应结构。

`/admin/*` 和 `/internal/*` 是保留命名空间，没有已开放接口。历史 `releases` 目录中的 48/48 等数字是当时快照，不是当前 operation 数。Agent REST 路径属于 Python Runtime 的内部对话接口，不能冒充 Customer OpenAPI 的银行执行权限。

## Surface boundaries

The OpenAPI files in this directory are the only machine DTO contracts. M9 freezes four URL namespaces:

| Namespace     | Audience / trust boundary                                                             | Status                         |
| ------------- | ------------------------------------------------------------------------------------- | ------------------------------ |
| `/public/*`   | Unauthenticated product discovery, reference information and navigation               | `public.yaml`                  |
| `/customer/*` | Authenticated customer capabilities shared by Customer Web and future Customer Mobile | `customer.yaml`                |
| `/admin/*`    | Staff operations, customer servicing, risk and audit                                  | Reserved; no file or endpoints |
| `/internal/*` | Trusted service-to-service capabilities and explicitly authorized orchestration       | Reserved; no file or endpoints |

URLs intentionally contain neither an API marker nor a version segment. Contract metadata versions do not appear in URLs. Authentication requirements are defined per operation in customer.yaml; public and customer capabilities remain separate.

Run `pnpm api:generate` to generate both frontend type files. `pnpm api:check` and `pnpm typecheck` verify both outputs are current. There is one generated DTO set per implemented surface, with no duplicate handwritten request/response models.

UI routing is separate: `/` and public category pages are public; `/app/*` is the authenticated customer product; `/login` is the simulated authentication page. Browser navigation must never confuse public `/cards` with customer `/app/cards`, or public `/investments` with customer `/app/wealth`.

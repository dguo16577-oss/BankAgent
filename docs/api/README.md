# API 合同工作流

机器真值是 [Customer OpenAPI](../../contracts/openapi/customer.yaml) 和 [Public OpenAPI](../../contracts/openapi/public.yaml)。当前为 Customer 87、Public 9 个 operation；计数、哈希和冻结规则由 `pnpm contract:check` 校验。历史 releases 是当时快照。

## 修改与验证

兼容变更需遵守冻结和批准范围。修改合同后运行 `pnpm api:generate`，提交对应 `apps/web/src/generated` 类型；再运行 `pnpm api:check`、`pnpm typecheck`、`pnpm contract:check`。Spring Maven generate-sources 生成服务接口和模型，不手写第二套 DTO。

服务语义见本目录各领域说明及 `docs/backend/`；真实端点以 OpenAPI 为准。测试覆盖客户隔离、Cookie/CSRF、参数边界、状态冲突、幂等及错误码，不能用 mock 成功代替真实银行结果。

## 基础 conventions（M1 起冻结）

- M9 起 API surface 冻结为 `/public/*`、`/customer/*`、`/admin/*`、`/internal/*`；后两者仅预留，未实现。URL 不带 API 标记或版本段。Customer Web 与未来 Customer Mobile 共用 `/customer/*`。
- 金额使用 decimal string，禁止 floating-point JSON number。当前 Money 支持 CNY、USD、JPY、EUR、GBP、HKD、AUD、SGD，API 展示统一保留两位小数（零余额 JPY 亦如此），例如 `{ "amount": "23842.31", "currency": "CNY" }`。外币账户目前只可开立零余额账户，不执行兑换。
- M3 起交易金额使用非负 decimal string + `direction`（CREDIT / DEBIT）；正负号只在 UI 展示时添加。余额、消费总额和待付款金额使用各自字段描述的口径。
- 时间为带 offset 的 ISO 8601，例如 `2026-09-27T10:30:00+08:00`；`Z` 代表零 offset。禁止没有时区的 datetime。本 Demo 展示统一使用 UTC+08:00。
- ID 是 opaque string，客户端不能从 ID 解析业务含义。
- enum 使用 uppercase，例如 `COMPLETED`、`PENDING`、`VISA`、`CNY`。
- 比例与汇率也使用 decimal string；百分比无法计算时返回 null，不返回 NaN 或 Infinity。
- Optional section 可以省略；数组为空表示没有条目。客户端不得假设 section 必然存在。

## 文档入口

- [合约边界](../../contracts/openapi/README.md)
- [冻结发布历史](../../contracts/openapi/releases/README.md)
- [账户](accounts.md) / [总览](overview.md) / [存款与外币账户](deposits-and-currency-accounts.md)
- [Banking Core](../../services/banking-core/README.md) / [Agent](../../services/agent-runtime/README.md)

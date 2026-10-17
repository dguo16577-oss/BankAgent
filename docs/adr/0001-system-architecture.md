# ADR 0001：系统架构与业务访问边界

- 状态：已接受
- 日期：2026-09-27
- 当前阶段：M0 Frontend Foundation

## 背景

AI Banking 需要清晰隔离用户界面、银行业务与 Agent 执行，避免多处实现业务规则和数据权限。

## 决策

```text
Next.js Web
      |
Banking Core — Spring Boot
      |
PostgreSQL

Agent Runtime — Python
      |
Banking Core APIs
```

1. Web 使用 Next.js + TypeScript，负责展示和交互。
2. Banking Core 使用 Spring Boot，作为业务规则与银行数据访问的唯一权威。
3. PostgreSQL 由 Banking Core 管理。
4. Agent Runtime 使用 Python，与业务核心解耦。
5. Agent 永远通过 Banking API 操作业务。未来不允许 Agent 直接访问银行数据库，包括读取、写入和绕过 API 执行 SQL；不向 Agent 发放银行数据库凭证。
6. OpenAPI contract 是前后端和 Agent 唯一的机器接口契约，客户端类型由 contract 生成。

## 影响

Banking Core 将统一进行鉴权、业务校验与审计；Agent 不得绕开这些边界。跨服务契约变更需同步生成客户端并检查兼容性。

M0 仅实现 Web、Demo Session mock、契约和工程工具。Spring Boot、Python Agent、PostgreSQL、真实认证和银行业务推迟到后续里程碑，本次不启动 M1。

# Banking Core 模块交接

目录：`services/banking-core`。Java 21 / Spring Boot 4.1.1 / PostgreSQL / Flyway 的模块化单体。它是客户身份、余额、交易、金融意图、确认后执行、幂等和审计的**唯一权威**；Python Agent 无数据库连接。当前 Customer 87、Public 9 个 OpenAPI operation，精确数量以 `pnpm contract:check` 为准，历史 `README.md` 的 39/48 是旧快照。

## 代码与数据

- `src/main/java/com/asterbank/banking/customer`：account、transaction、payment、card、deposit、recurring、spending、wealth、applicationrequest、overview 等业务域。每个域尽量保持 domain/application/adapter 分层。
- `.../security`：登录、BCrypt、Spring Session JDBC、CSRF、step-up、ActionAuthorization 与安全事件。`CurrentCustomerProvider` 从已认证 principal 提供 CustomerId；请求不能提交伪造 CustomerId。
- `.../publiccontent`：匿名公开资料，与客户私有状态隔离。
- `src/main/resources/db/migration`：Flyway 从 V1 至 V33 的不可变迁移；新增变更必须用新版本，不能改历史迁移。Spring Session 表同样由 Flyway 管理。
- Maven `generate-sources` 根据 `contracts/openapi/customer.yaml` 和 `public.yaml` 生成接口与模型；生成目录属于构建产物。

所有金融变更应检查客户归属、合法状态迁移、意图的对象/版本/会话绑定、确认/step-up、执行时重验及幂等。Agent PREPARE 仅创建银行意图，不可直接扣款。已完成的动作不会因为后续跨域动作失败而自动回滚。

## 启动与测试

先启动隔离 PostgreSQL：`docker compose -f infra/compose/postgres.compose.yml up -d --wait`。配置以 `.env.example` 为例，不要将生产密码写入仓库。JDK 必须为 21。

```powershell
Set-Location services/banking-core
.\mvnw.cmd clean verify
.\mvnw.cmd spotless:check
.\mvnw.cmd spring-boot:run '-Dspring-boot.run.profiles=demo,local' '-Dspring-boot.run.arguments=--server.port=18080'
```

`clean verify` 包含真实 PostgreSQL Testcontainers，Docker Desktop 必须可用。若本机正在运行由同一 `target` JAR 启动的 Spring，Windows 文件锁可能妨碍重新打包；先停止该进程。`demo,local` 提供演示种子、localhost CORS 和 HTTP Cookie 例外；默认/生产环境不应使用。健康检查 `/actuator/health`。

## 交接评测重点

- 登录错误不可区分邮箱存在与否；Session ID 登录时轮换、注销/过期后旧 Cookie 失效；Cookie HttpOnly，CSRF Cookie 与 Header 分离。
- Alex 与 Lin 的账户、收款人、卡、申请、提醒和意图严格隔离；请求体里的对象 ID 不能跨客户使用。
- 转账/计划付款/AA、卡冻结/正式挂失/限额、投资/存款、代扣取消的并发确认、重复提交、版本冲突、余额变化后重验。
- 提醒的 `BANK_MANDATE` 与 `DETECTED_PATTERN` 来源不同；推测账期不是银行确认扣款日，取消站内提醒不等于撤销代扣授权，更不等于取消第三方会员。
- 信用额度申请、卡/贷款/保险申请的持久状态不能伪称自动批准；所有客户可见余额和交易要与 PostgreSQL 最终状态一致。

最近全量结果为 637 项（211 unit + 426 Testcontainers）通过；本次交接打包没有重新运行 Spring 测试。历史安全扫描还未闭环，公网部署 HOLD；见[漏洞报告](../../docs/security/m24-1-container-vulnerability-report.md)。

# Aster Bank 项目进度说明

> 2026-10-01 AI Banking 比赛演示更新：在 B4 后新增 Python Agent Runtime、同源 Web 对话入口、公开产品知识图谱和第二位 Demo 客户 Lin Wei。Agent 从真实 Spring Session 识别当前客户，经只读 Banking API 回答账户、消费、卡片和定期扣款问题；转账只能生成提案，必须由用户进入原有审阅、验证、确认流程。Alex 向 Lin 的转账在 PostgreSQL 同一事务内完成双边记账。隔离真实浏览器测试已验证 ¥10.00 转账、入账及刷新不重复。见 [演示报告](milestones/competition-agent-demo-report.md) 和 [人工测试表](testing/ai-banking-manual-checklist.md)。本更新不改变 Customer/Public OpenAPI，公网部署仍受下方未闭合安全项限制。

> 2026-09-29 M24.1 安全状态更新：四个运行镜像扫描已完成，原始结果为 22 Critical / 79 High。1 项组件缺失判定不受影响，100 项仍 unresolved；未签署风险接受。功能冻结不等于安全放行，公网部署 HOLD。见 [扫描与初步 triage 报告](security/m24-1-container-vulnerability-report.md)。

更新日期：2026-09-30。项目：`D:\BankProject`。

## 当前本机运行状态（2026-09-30 20:26 更新）

已将本机 `:18080` 从 B3 旧 JAR 切换为验收通过的 B4 JAR，使用 `demo,local` profiles；保留数据库由 Flyway V9 升级到 V10。切换前备份位于忽略目录 `backups/aster-before-b4-runtime-20260930.dump`，旧 JAR 也保存在该目录。当前 `target` 已同步 B4 构建，避免继续启动旧版本。

此次银行卡“核对申请”失败来自前后端版本不一致：前端请求 B4 新增的 `/customer/application-intents`，旧 JAR 不含该接口。切换后真实浏览器验证“登录 → 返现信用卡 → 核对申请”返回 HTTP 200，显示申请确认页；没有最终提交申请。后端 health 为 UP。截图： [申请确认页](screenshots/b4-live-application-review-fixed.png)。这次局部运行修复没有重跑全部里程碑测试；中文文案测试 6 项通过，修改文件 ESLint/格式处理完成。

已实现接口不等于完整银行业务：申请只到待审核；没有审批、发卡、放款；计划付款缺少自动到期触发；真实短信、真实支付网络和 Agent 未接入。下文 B4 报告记录的是隔离环境验收时的历史状态，本节记录随后完成的本机更新。

## B4 开发进度（2026-09-30）

当前仍为 **v1.1-dev**。已实现复用登录密码的操作复核、每客户唯一已验证手机号、随机六位短信验证码、Demo 数据库短信及按动作绑定的一次性授权。转账、收款人、计划付款、卡控制、投资、停止未来代扣及现有卡/贷款申请均接入原页面内联验证。Customer 1.13.0 / 55 项，Public 1.2.0 / 9 项不变。验证完成：后端 582 项、前端 452 项和哈希 3 项通过；Mock E2E 97 场景覆盖（完整一轮 96 项通过，修复唯一锚点问题后相关 11 项重跑通过）、真实后端 E2E 20 项、重建镜像容器 E2E 5 项通过；lint/typecheck/build/契约及历史哈希检查通过。B4 已完成。见 [B4 报告](milestones/b4-report.md)。不包含真实短信、登录 MFA、动态风险引擎、B3.1 自动触发或 Agent。M24.1 公网安全限制继续适用。

## B3 开发进度（2026-09-30）

当前开发线仍为 **v1.1-dev**。一次性未来人民币付款已接入 Payments：创建、审阅确认、修改、取消和内部确定性到期处理。创建不扣款、不预留资金；到期复用 Transfer 原子记账。Customer 1.12.0 / 52 项，Public 1.2.0 / 9 项。验证完成：Java 576 项、Vitest 448 项及哈希测试 3 项；Mock E2E 共 97 项覆盖（95 项首轮通过，2 项修正后重跑通过）、Real Backend E2E 18 项、容器 E2E 4 项通过。lint、typecheck、build、当前及历史契约检查通过。详细结果见 [B3 报告](milestones/b3-report.md)。不包含周期转账、任意风险阈值或 Agent。历史安全漏洞整改未闭环的限制继续适用。

## B2 开发进度（2026-09-30）

当前开发线为 **v1.1-dev**，分支 `codex/v1.1-dev`。收款人创建、详情、搜索和停用已接入 Payments，并补充转账的 session/recipient/hash 绑定。Customer 契约从工作树的 1.10.0 / 42 项增至 1.11.0 / 47 项；Public 1.2.0 / 9 项保持不变。B2 验证已完成：551 项 Java 测试、438 项前端/哈希测试、96 项 Mock E2E（89 项首轮通过、7 项修复后重跑通过）、16 项真实后端 E2E 和 3 项容器 E2E；lint、typecheck、build 与契约检查均通过。详情见 [B2 报告](milestones/b2-report.md)。历史 M24 发布身份与下述记录保持独立；安全扫描未闭环的问题仍适用。

## 历史 M24 阶段

M24 已完成系统打包、代理部署、持久化/备份恢复验收，冻结为 **Aster Bank Web V1 / v1.0.0-demo**，详见 [M24 报告](milestones/m24-report.md)。停止在 M24。

- **Backend API：48/48**，Customer 39/39、Public 9/9，remaining 0。
- **Frontend 默认 runtime：真实 Spring Backend**。开发时直接请求 Spring；容器部署时经 Nginx 同源转发 Customer/Public API。
- **MSW：测试或显式 `pnpm dev:mock` 模式**，后端故障不回退 Mock。
- **部署数据路径：Browser → Nginx → Next.js UI / Spring Boot → PostgreSQL named volume**。Next.js 不代理 Banking API。
- 项目是工程化 Competition Demo，未接入真实支付网络，也不表示已具备生产上线条件。

## 已完成里程碑

| 阶段    | 主要工作                                                                             |
| ------- | ------------------------------------------------------------------------------------ |
| M0–M3   | Web Foundation、Overview、Accounts、Transactions；冻结数据语义与一致性测试           |
| M4–M8   | Transfer、Cards、Spending/Recurring、Wealth、Authentication/Step-Up 的 Web/Mock 流程 |
| M9–M11  | Public Website、目录与知识内容、命名空间迁移、审计和 Contract Freeze                 |
| M12–M15 | Spring Boot、账户/交易/转账领域、PostgreSQL/Flyway 与原子事务                        |
| M16–M19 | 持久化 Session/授权、Card、Recurring/Spending、Wealth 后端                           |
| M20     | Customer Overview 聚合 read model；Customer API 39/39                                |
| M21     | Public 内容持久化、SQL Search；Backend API 48/48                                     |
| M22     | 真实前后端连接、Cookie/CSRF/CORS、临时 PostgreSQL 浏览器 E2E                         |
| M23     | 请求截止时间、安全头、故障恢复、真实 Session/IDOR/CSRF、SQL 与可访问性加固，RC 验收  |
| M24     | Docker 多阶段构建、Nginx 同源、demo/prod profile、持久化/备份恢复与 Web V1 冻结      |

历史报告记录各里程碑当时的状态；其中“Frontend remains MSW”等描述不再代表当前默认运行模式。

## M24 冻结时的架构（历史快照）

| 层           | 实现                                                                                |
| ------------ | ----------------------------------------------------------------------------------- |
| Web          | Next.js、React、TypeScript strict、App Router、Tailwind、shadcn/ui                  |
| 数据请求     | TanStack Query + 统一 transport + 生成的 OpenAPI 类型                               |
| Banking Core | Java 21、Spring Boot 4.1.1，模块化单体                                              |
| 持久化       | PostgreSQL、Flyway、JPA/JDBC；六个 migration，37 张表                               |
| 身份与安全   | BCrypt、Spring Session JDBC、HttpOnly Cookie、CSRF、intent-bound Step-Up            |
| 测试         | Vitest/RTL、Mock Playwright、真实 Backend Playwright、JUnit/ArchUnit/Testcontainers |
| Agent        | Python 目录预留；无 Agent/LLM 实现                                                  |

Domain/Application 不依赖 HTTP、JPA、生成 DTO 或 Spring Security。未来 Agent 只能通过 Banking API 操作业务，不能直接访问数据库。

## M24 前端和 Backend 对应关系（历史快照）

Public Home、Navigation、21 个 Catalog items、15 篇 Support、Rates/Fees、Offers/Search 经匿名 Public API 获取。客户登录后可使用 Overview、Accounts、Transactions、Transfer、Cards、Spending/Recurring、Wealth 与 Step-Up 流程。Settings/Agent 明确为无后端持久化的占位说明。

| Customer 领域      | Endpoint 数 |
| ------------------ | ----------: |
| Account            |           2 |
| Transaction        |           2 |
| Transfer/Recipient |           5 |
| Security           |           6 |
| Card               |           6 |
| Spending           |           1 |
| Recurring          |           6 |
| Wealth/Investment  |          10 |
| Overview           |           1 |
| 合计               |          39 |

API client 48/48 的静态审计见 [客户端矩阵](frontend/client-integration-audit.md)。Spring 覆盖见 [实现矩阵](backend/implementation-matrix.md)。两者均以冻结契约为依据。

## 已建立的保障

- Money 为 decimal string；Java BigDecimal / PostgreSQL NUMERIC 保证金额精度。
- 余额、pending、available 与领域 read model 保持一致；交易使用 amount + direction 和 opaque cursor。
- Intent 保存服务端快照；用户确认执行使用稳定幂等键，响应丢失后恢复原 receipt。
- Cookie Session 提供真实身份，所有 Customer mutation 保留 CSRF。
- Step-Up 授权绑定 customer/session/resource/hash，短期、单次使用；不全局升级 Session。
- 前端只保留内存 Customer cache，logout/401 清除，Public cache 独立。
- 真实 E2E 使用独立临时数据库，验证后销毁；不重置 M15–M21 的日常持久化 volume。

## M24 冻结契约（历史快照）

| Contract       | Canonical SHA-256                                                  |
| -------------- | ------------------------------------------------------------------ |
| Customer 1.9.0 | `602ddcc2ca1b3903034bab2979516220fbf3fb78c0212fa4158a4f0c7ac5f3e5` |
| Public 1.2.0   | `460387a9a26548941a692bcd7e7036e21d136b4d6a9cb570faa0a4fc1ac106ef` |

M24 不新增 Endpoint、Domain、Migration 或 DTO，不修改冻结 YAML/freeze.json。

## 启动和验证

M24 已通过：389 项 Vitest/RTL + 3 项 hash tests；Real Backend Playwright 15/15（390px）和 15/15（1440px）；Maven 532/532（含 339 项 PostgreSQL IT），无失败、错误或跳过；Mock Playwright 81/81。新增 Packaged Playwright 2/2，验证金融旅程、restart/down-up、backup/restore、outages、prod no-seed。lint、typecheck、build、48-operation audit、contract checks 均通过。

常规运行先启动 PostgreSQL 和 local Spring :18080，然后运行根目录 `pnpm dev`；浏览器访问 <http://localhost:3000>。本地登录和精确命令见 [集成说明](frontend/backend-integration.md)。单独演示用 `pnpm dev:mock`。

真实浏览器回归：`pnpm test:e2e:backend`，自动启动 PostgreSQL、Spring 和 Next.js。Mock 回归：`pnpm test:e2e:mock`。两者不能并行占用 3000。完整流程见 [E2E 文档](testing/real-backend-e2e.md)。

新鲜数据库的验证链路：转账 ¥500 后 Current 23342.31；投资 ¥1000 后 Current 22342.31，Portfolio 19320.00；最终总存款 CNY equivalent 34953.68。Spending 4968.00，对比 4800.00，+3.50%；Netflix 停止不改历史消费。

旧 local 数据库保留此前里程碑的 mutation，不保证与 fresh fixture 一致。历史数据库记录见 M18–M21 报告。

## 后续边界

M24 提供 HTTPS 模板和基础备份恢复，但生产身份渠道、目标云平台部署、监控平台、容量认证与外部银行网络仍待后续范围。基础镜像扫描仍有告警，详见报告。未实现 Admin、OAuth/OIDC、Agent、LLM/RAG、Redis/Kafka 或微服务拆分。下一里程碑等待明确指令。

上述停止指令是 M24 历史记录；当前授权范围为 B3，完成后停在 B3。

## M24 部署入口

[Release](milestones/m24-report.md) · [Demo 部署](deployment/demo-deployment.md) · [Runbook](operations/runbook.md)。默认代理入口 http://localhost:8088；部署机只需 Docker + Compose。

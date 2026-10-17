# ASTER BANK WEB V1

> 2026-09-29 M24.1 安全状态更新：四个运行镜像扫描已完成，原始结果为 22 Critical / 79 High。1 项组件缺失判定不受影响，100 项仍 unresolved；未签署风险接受。功能冻结不等于安全放行，公网部署 HOLD。见 [扫描与初步 triage 报告](docs/security/m24-1-container-vulnerability-report.md)。

Release: **v1.0.0-demo**。M24 将 M23 RC1 的 Web 与 48 个真实 Spring API 打包为自包含 Demo；不增加银行业务能力。

```text
Browser → Nginx
            ├─ / → Next.js standalone :3000
            ├─ /customer/* → Spring Boot :8080 → PostgreSQL 17 volume
            └─ /public/*   → Spring Boot :8080
```

部署入口和命令见 [Demo 部署](docs/deployment/demo-deployment.md)。准备忽略的 `.env.demo` 后：

```sh
docker compose --env-file .env.demo -f infra/compose/demo.compose.yml up -d --build --wait --wait-timeout 180
```

访问 `http://localhost:8088`。停止使用同一命令前缀加 `down`，保留数据库。

API 版本独立冻结：Customer 1.9.0（39 operations），Public 1.2.0（9 operations）。前端默认 REAL BACKEND；MSW 只用于明确的开发/测试模式。

验证结果与镜像尺寸见 [M24 报告](docs/milestones/m24-report.md)。部署配置见 [配置表](docs/deployment/configuration.md)，TLS/managed DB 见 [生产基础](docs/deployment/production-foundation.md)，备份恢复见 [Runbook](docs/operations/runbook.md)。

这是 production-oriented deployment foundation / self-contained demo deployment。没有真实资金网络、KYC、通知、生产验证码渠道、Admin、Mobile、Agent、HA、监控平台或 DR/PITR。Demo credentials、rates、investment products 只用于演示。

范围冻结在 M24；不添加新 Banking features，不实现 Agent。

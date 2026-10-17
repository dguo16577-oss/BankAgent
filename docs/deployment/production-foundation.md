# Production-oriented deployment foundation

这是容器化部署基础，不是可运营真实银行的生产认证。当前版本使用演示产品、汇率和模拟业务执行，没有真实资金网络。

## TLS 与入口

`infra/compose/prod.compose.yml` 是使用已有 PostgreSQL 的模板。准备独立空库、受限数据库账号、DNS 和 TLS 证书，填写忽略的 `.env.production`：DB_HOST/PORT/NAME/USER/PASSWORD、PUBLIC_HOST、TLS_CERTIFICATE_PATH、TLS_PRIVATE_KEY_PATH。

```sh
docker compose --env-file .env.production -f infra/compose/prod.compose.yml up -d --build --wait --wait-timeout 180
```

只发布 Nginx 80/443；80 固定跳转配置的 HTTPS hostname，443 终止 TLS。证书私钥由主机只读挂载。服务间使用 web:3000、banking-core:8080。数据库可以是受控网络中的 managed PostgreSQL 17。
生产模板需要按托管数据库要求配置传输 TLS/信任根、网络 allowlist 和备份策略；本轮不代为配置云服务。

Nginx 覆盖来自浏览器的 forwarded headers；Spring 使用 framework forward-headers-strategy。仅代理可接触后端，禁止额外直接暴露后端端口。若未来前面再增加负载均衡器，需重新设计可信代理链，不能直接信任任意 X-Forwarded-*。

## 安全默认

prod profile 强制缺失/空 DB 输入失败；拒绝与 Demo 或测试 profile 混用；禁止 Demo seeds/verifier。
Session 为 PostgreSQL JDBC，HttpOnly、Secure、SameSite=Lax、Path=/；CSRF Cookie 可 JS 读取、Secure，仍需 X-XSRF-TOKEN。
同源不需要 CORS，也不取消 CSRF。localhost:3000 仅 local profile 被允许。
Actuator 不对代理外部暴露；内部 health 仅 UP/DOWN。错误不带详细信息。金融 API no-store，没有代理缓存。
TLS 代理增加一次 HSTS，保留 Next CSP 等头。生产浏览器 source maps 关闭，服务器日志通过 stdout/stderr 获取。

## 运行前尚需完成的目标环境工作

- 真实身份开户及安全验证码交付渠道；prod 空库没有 Alex，现有演示登录文案不代表可用生产身份系统。
- 目标平台秘密管理、数据库 TLS/最小权限、证书续期、网络策略。
- 监控告警、日志保留与访问控制、容量/负载测试、HA、恢复目标与 PITR。
- 数据保留、合规和独立安全评估。

本轮没有 OAuth/SMS、真实支付/卡/证券执行、KYC、通知、Admin、Mobile、Agent 或多节点 Session 拓扑验证。

## 镜像来源

使用官方 [Node](https://hub.docker.com/_/node)、[Eclipse Temurin](https://hub.docker.com/_/eclipse-temurin)、PostgreSQL 17 和 Nginx 1.28.3 镜像；应用依赖继续使用现有 lockfile。
版本 tag 限制升级范围但不是不可变 digest，重建可能取得基础系统修复。发布到具体 registry 时应记录/锁定本次镜像 digest 并建立补丁周期。
Nginx 使用 Docker DNS 动态 upstream resolve，以支持容器重建后 IP 改变；依据 [upstream 官方文档](https://nginx.org/en/docs/http/ngx_http_upstream_module.html)。

## M24 镜像扫描边界

Docker Scout v1.24.0 对最终 Web 镜像扫描：0 Critical / 2 High / 1 Medium / 25 Low。更换 runtime 为 Node 24.21.0 trixie-slim 并移除 npm/yarn 后，告警从初次 65 项降到 28 项；没有升级应用依赖。
两项 High 为基础系统 Perl `CVE-2026-82560`、zlib `CVE-2026-85091`，扫描库标为 Not Fixed。未证明它们在本应用路径可利用，也不能宣称无风险；面向真实部署前需重新扫描并作目标环境风险评估。
Backend 扫描尝试在 indexing 阶段长时间未完成，已终止；不能据此报告后端无漏洞。Nginx/PostgreSQL 未完成独立漏洞扫描。本次不是完整供应链安全认证。
完整本机扫描产物位于忽略的 `test-results/packaged-evidence/`，不作为公开站点资产发布。

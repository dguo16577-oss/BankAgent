# 部署配置

## 环境变量

| 变量                             | Demo                                        | Prod              | 说明                                                  |
| -------------------------------- | ------------------------------------------- | ----------------- | ----------------------------------------------------- |
| DB_HOST                          | Compose 内 postgres                         | 必填              | 应用无容器 hostname 硬编码；prod 缺失失败             |
| DB_PORT                          | 5432                                        | 5432，可覆盖      | PostgreSQL 端口                                       |
| DB_NAME                          | asterbank                                   | 必填              | 持久卷初始化后不要随意更改                            |
| DB_USER                          | asterbank                                   | 必填              | 同上；prod 使用最小所需权限账号                       |
| DB_PASSWORD                      | 必填                                        | 必填              | 空白、缺失、CHANGE_ME 均失败；不输出值                |
| SPRING_PROFILES_ACTIVE           | Compose 固定 demo                           | Compose 固定 prod | prod 禁止与 demo/local/test/e2e/unit 混用             |
| JAVA_TOOL_OPTIONS                | -Xms64m -Xmx384m -XX:ActiveProcessorCount=2 | 同左，可覆盖      | Java 21 支持容器资源识别；不要在该变量放秘密          |
| DEMO_BIND_ADDRESS                | 127.0.0.1                                   | 不使用            | 显式 0.0.0.0 才开放局域网                             |
| DEMO_PORT                        | 8088                                        | 不使用            | 唯一 Demo 主机端口                                    |
| PUBLIC_HOST                      | 不使用                                      | 必填              | DNS hostname，无 scheme/path/port；Nginx TLS 模板使用 |
| TLS_CERTIFICATE_PATH             | 不使用                                      | 必填              | 主机证书绝对路径，挂载只读                            |
| TLS_PRIVATE_KEY_PATH             | 不使用                                      | 必填              | 主机私钥绝对路径，挂载只读，禁止提交                  |
| NEXT_PUBLIC_API_MODE             | 镜像构建固定 backend                        | 同左              | 浏览器不启用 MSW                                      |
| NEXT_PUBLIC_BANKING_API_BASE_URL | 镜像构建固定 /                              | 同左              | / 显式代表同源；未配置仍失败                          |
| ASTER_HTTPS                      | 镜像未设置                                  | 镜像未设置        | HSTS 由 TLS Nginx 独占；非容器 HTTPS 构建可使用原选项 |
| NODE_ENV / HOSTNAME / PORT       | production / 0.0.0.0 / 3000                 | 同左              | Web 容器内部设置                                      |

Next 的 NEXT_PUBLIC 变量在构建时固化，运行时改变量不会重写浏览器 bundle。统一镜像通过相对路径支持不同域名，无需重建。若确实改成跨源部署，必须重新构建并配置明确 CORS；本轮交付采用同源。

## Profile 差异

- local：保留既有开发流程，Web :3000 → Spring :18080，exact-origin CORS，仅 local HTTP Cookie 可不 Secure。
- demo：真实 PostgreSQL、Session、CSRF、所有权和 Step-Up；启用 Demo seeds/code，HTTP Cookie 不 Secure；不允许 local CORS。
- prod：不 seed、不启用 Demo code，Secure Cookie，默认无跨源允许，必需 DB 配置，无 schema 自动创建。空数据库完成迁移后允许启动，但没有可登录客户。
- e2e：只能与 local/demo 组合，固定 fixture 时钟；隔离验收使用。正常 Demo/prod 不应配置。

默认 application.yml 仍保留开发者的 SPRING_DATASOURCE_* 配置约定；容器统一使用 DB_* 映射，不提供两套容器配置入口。
Session 默认 1 小时，继承 M16 的 `aster.security.session-timeout`；Cookie 为会话期，服务端保留实际有效期校验。

## 秘密

`.env.demo` / `.env.production` 不提交、不复制进镜像；示例只有 placeholder。Compose interpolation 会让 `docker inspect` 的授权操作者看到环境变量，这是当前基础部署的限制。生产托管秘密、数据库 TLS/CA 和轮换流程需按目标平台配置。

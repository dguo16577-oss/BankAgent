# Aster Bank Web v1 操作手册

以下命令在项目根目录执行；使用 `infra/compose/demo.compose.yml` 和忽略的 `.env.demo`。

## 状态、健康与日志

```sh
docker compose --env-file .env.demo -f infra/compose/demo.compose.yml ps
docker compose --env-file .env.demo -f infra/compose/demo.compose.yml logs --tail 100 banking-core
docker compose --env-file .env.demo -f infra/compose/demo.compose.yml exec banking-core curl -fsS http://localhost:8080/actuator/health
docker compose --env-file .env.demo -f infra/compose/demo.compose.yml restart banking-core
```

PG 用 pg_isready；Spring health 检查数据库；Web 和代理访问现有 `/`，无额外业务 endpoint。Compose health dependency 只控制启动，不是持续的编排系统；故障恢复后再次检查所有服务。
应用日志不记录 Cookie、授权头、请求 body 或凭据。Nginx access log 只有 method/path/status/latency，不含查询字符串；Nginx upstream 错误日志仍可能包含请求 URI。路径可能含资源 ID，需要限制日志访问。默认 Docker 日志保留取决于 daemon，正式主机应配置轮转。

## 备份（跨 Windows/Linux，无二进制 shell 重定向）

先停止写入者，再备份整个 schema/data。以下使用默认 DB 名/用户；自定义时同步替换。
在主机建立 `backups` 目录（PowerShell `New-Item -ItemType Directory -Force backups` 或 Linux `mkdir -p backups`）。

```sh
docker compose --env-file .env.demo -f infra/compose/demo.compose.yml stop banking-core
docker compose --env-file .env.demo -f infra/compose/demo.compose.yml exec -T postgres pg_dump -U asterbank -d asterbank -Fc -f /tmp/aster.dump
docker compose --env-file .env.demo -f infra/compose/demo.compose.yml cp postgres:/tmp/aster.dump backups/aster.dump
docker compose --env-file .env.demo -f infra/compose/demo.compose.yml up -d --wait --wait-timeout 180
```

备份含 Session 与客户数据，限制权限并离线保管，禁止源码归档。升级前先备份；每次备份使用不同文件名，避免覆盖唯一有效副本。

## 恢复到新数据库

保留原库，不覆盖。先停止 backend，在 PostgreSQL 中创建新库并恢复，再修改 `.env.demo` 的 DB_NAME 为新库名。

```sh
docker compose --env-file .env.demo -f infra/compose/demo.compose.yml stop banking-core
docker compose --env-file .env.demo -f infra/compose/demo.compose.yml exec -T postgres createdb -U asterbank aster_restore
docker compose --env-file .env.demo -f infra/compose/demo.compose.yml cp backups/aster.dump postgres:/tmp/restore.dump
docker compose --env-file .env.demo -f infra/compose/demo.compose.yml exec -T postgres pg_restore -U asterbank -d aster_restore --no-owner --exit-on-error /tmp/restore.dump
```

修改 DB_NAME 后 `up -d --wait --wait-timeout 180`，确认 Flyway/Hibernate validate 成功、登录及 Overview 金额正确。
也可在新的 PostgreSQL 17 主机执行相同 restore 后设置连接参数；M24 验证的是一个真实 fresh database 的恢复，不声称覆盖主机磁盘毁损或跨区域灾难。
恢复 Session 会恢复备份时的安全状态，真实环境需决定是否撤销全部旧 Session。当前 Demo 保留 M16 有效期检查。

## 常见故障

| 现象                    | 检查与处理                                                                              |
| ----------------------- | --------------------------------------------------------------------------------------- |
| PostgreSQL unavailable  | 看 PG 日志、磁盘与 volume；启动 postgres，等待健康，不能删除卷来“修复”                  |
| Banking unhealthy       | 内部 health、DB_HOST/密码/网络、Flyway 日志；保持 schema，修正原因后重启                |
| Web unhealthy           | Web 日志、production standalone 文件和端口；不以 next dev 代替                          |
| Proxy 502               | 看对应 upstream 健康；backend 停机时 Web 仍可加载并显示重试，无 MSW fallback            |
| Migration failure       | 停止部署，备份与人工核查 migration/checksum；不自动 drop、repair、reset                 |
| Missing environment     | 填必填变量，CHANGE_ME 被拒绝；不要把密码贴到问题报告                                    |
| Cookie / HTTPS mismatch | prod 必须从 HTTPS 入口；HTTP demo 只用 demo profile；检查浏览器 SESSION/XSRF attributes |
| Port conflict           | 修改 DEMO_PORT；不停止别人的 8080 服务                                                  |
| Pull/install 网络失败   | 检查 Docker/npm/Maven registry 连通性后重试；不禁用 hash/TLS 校验                       |

`down` 保留数据，`down --volumes` 永久删除该 project 数据。普通停机禁止附加 --volumes。
这是 Demo/self-hosted 基础备份流程，不是 HA、PITR、跨区域 DR 或恢复 SLA。

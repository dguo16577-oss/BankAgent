# 双用户演示转账

在 `local`、`demo` 或 `test` 配置下，启动时会创建两个演示登录：

| 用户      | 邮箱               | 演示密码        | CNY 活期账户                        |
| --------- | ------------------ | --------------- | ----------------------------------- |
| Alex Chen | `alex@aster.local` | `demo-password` | `acc_current`                       |
| Lin Wei   | `lin@aster.local`  | `demo-password` | `acc_lin_current`（初始 ¥1,000.00） |

Alex 的收款人列表包含 Lin Wei（`recipient_lin`，`destinationRef=demo-lin`）。向该收款人转账时，后端在同一 PostgreSQL 事务内扣减 Alex 的账户、增加 Lin 的账户，并为双方写入同一参考号的 `BANK_TRANSFER` 流水。相同 `Idempotency-Key` 重放只返回原回执；任何入账写入失败都会回滚两边余额、流水和幂等记录。该路由只由演示种子创建；生产配置没有演示用户或内部路由。

两个浏览器窗口若共用 `localhost` 和同一浏览器配置，也会共用 `SESSION` Cookie。请用普通窗口和无痕窗口，或两个独立浏览器配置分别登录。转账仍需核对和模拟短信验证。此流程只模拟站内到账，不连接真实支付网络。

隔离的 PostgreSQL 集成测试：

```powershell
cd services/banking-core
$env:JAVA_HOME='C:\path\to\jdk-21'
.\mvnw.cmd -Dtest=none '-Dsurefire.failIfNoSpecifiedTests=false' '-Dit.test=DemoInternalTransferPostgreSqlIT' verify
```

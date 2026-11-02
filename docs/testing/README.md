# 测试用例与运行方法

测试方法数、数据记录数和真实模型案例数分别统计，不相加为统一通过率。

## 用例位置

| 类型           | 数量                  | 位置与说明                                                                                                |
| -------------- | --------------------- | --------------------------------------------------------------------------------------------------------- |
| Agent 自动测试 | 57 文件，470 方法     | `services/agent-runtime/tests/`；多数采用模型及银行替身                                                   |
| 转账固定样例   | 25 个 JSONL，117 记录 | [转账数据说明](../../research/agent-transfer/README.md)；有重叠题与变体                                   |
| 知识问答       | 28 条                 | [案例定义](../../services/knowledge-service/eval/cases.json)；检索 runner 覆盖 23 条，其余 5 条需独立验证 |
| 架构验收规范   | 20 项                 | [验收定义](../final-sprint/benchmark-spec.json)；不是全部通过报告                                         |
| Web 组件与接口 | 57 文件               | `apps/web/src/` 下的 `.test.ts` 和 `.test.tsx`                                                            |
| 浏览器端到端   | 17 脚本文件           | `apps/web/e2e/`；区分模拟与真实后端配置                                                                   |
| 银行核心       | 22 个 Java 测试文件   | `services/banking-core/src/test/`；包含 Testcontainers                                                    |

六领域行为映射与候选变体位于[研究资料](../../research/README.md)，未经初始状态、工具及断言适配，不能直接作为可执行评测题。

## Agent 回归

在仓库根目录、安装 `services/agent-runtime/requirements.txt` 的 Python 环境中执行：

```powershell
python -m unittest discover -s services/agent-runtime/tests -v
```

13 项 PostgreSQL 恢复测试需要 `R1_TEST_DATABASE_URL` 指向专用隔离数据库，并按 `services/agent-runtime/sql/001_agent_state.sql` 准备状态表。未提供连接时跳过，不能记为通过。不要使用演示或生产数据库。

账户展示的定向回归命令：

```powershell
python -m unittest discover -s services/agent-runtime/tests -p test_agent_presentation.py -v
```

固定历史月份的相对日期测试显式注入固定时钟，避免随日历变化失效。其他覆盖包括期间边界、完成证据投影、金融条款和图表数据依据，保留原测试模块名以便追溯。

## Web 与工程检查

```powershell
pnpm install --frozen-lockfile
pnpm --filter web test --maxWorkers=1 --no-file-parallelism
node --test scripts/contract-hash.test.mjs scripts/dependency-security.test.mjs
pnpm repo:check
pnpm contract:check
pnpm typecheck
pnpm lint
```

`pnpm build` 另行串行运行。依赖安全回归不是实时漏洞扫描。保留锁文件、兼容包和补丁，不通过删除测试或放宽断言取得通过。

## 银行核心与浏览器

Spring 要求 JDK 21 和 Docker，运行方法见[银行核心说明](../../services/banking-core/README.md)。在该模块内执行 `.\mvnw.cmd verify` 包含相应集成测试。

浏览器入口为 `pnpm test:e2e:mock` 或 `pnpm test:e2e:backend`。执行前检查根 Playwright 配置、端口和环境，单 worker 分批运行。不得与 Next 构建或 Spring 大型测试同时执行；不能把模拟结果当作真实模型、银行和数据库联合验证。

## 真实模型与人工试用

`python scripts/run-transfer-eval.py` 读取 20 条早期适配题，使用真实模型和进程内模拟银行，会产生 API 费用；不是真实 Spring 资金执行测试。其他转账 manifest 按对应 runner 与能力要求使用，不直接拼接为独立总分。

人工试用应覆盖姓名转账与金额变更、消费分类与月份对比、理财风险与产品比较、卡片查询与挂失区别、订阅模式与银行代扣区别、知识版本引用和安全导航。固定月份、实际对象及 SQL 金标准；纯查询和导航不创建金融意图，准备不扣款，执行须独立确认。

每例记录源码与镜像版本、初始数据、原始对话、工具轨迹、页面断言及银行数据库差异。脱敏后保留失败和跳过，不输出密钥、Cookie、验证码或隐藏思维链。当前边界见[验证说明](../release-status.md)。

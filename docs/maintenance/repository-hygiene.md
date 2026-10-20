# 仓库严格整理审计

2026-10-20。核对 GitHub `main` 基线 `65d43b659d9c01d861b221f1dd37db1344f8e118`；本地与远端一致后审查全部 1,283 个受跟踪文件（15,652,748 字节）。仅在 `D:\BankProject-AGUI-20261012` 工作，未覆盖原项目、改动运行服务或数据库。

## 处理决定

| 文件或类别                                                  | 结论与依据                                                                                                              |
| ----------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `apps/web/src/components/placeholder-page.tsx`              | 删除。早期“没有银行数据”的占位组件，源码/路由/测试均无 import。两份旧研究保护清单中的路径只是历史哈希记录，保留原记录。 |
| `docs/architecture/web-system.md`                           | 合并入 `architecture/overview.md` 并删除旧文件。旧版仍称没有 Agent、48 APIs、Flyway V1–V6；唯一引用改指当前架构。       |
| `docs/plans/agent-web-improvement-plan.md`                  | 删除已被后续里程碑和综合问题矩阵替代的 10 月 1 日待实施计划；没有代码、脚本或 Markdown 引用。旧内容可从 Git 历史恢复。  |
| `docs/architecture/overview.md`                             | 重写为当前体系，清掉 M0–M24 的重复累积说明；历史决策与验收仍在 ADR/里程碑。                                             |
| `docs/project-progress.md`                                  | 合并为当前进度与证据索引，删除旧 PID/JAR 切换指令和互相矛盾的“当前”状态。                                               |
| `docs/frontend/backend-integration.md`                      | 保留实际 transport/cache/confirmation 规则，纠正旧 API 数量、固定验证码和 Agent 占位说明。                              |
| 旧功能缺口与交接问题                                        | 明确历史日期并链接最新证据，保留当时失败结论，不把历史缺陷无证据地改成已修复。                                          |
| 唯一完全重复组：5 份 Public YAML                            | 保留。当前合同与 4 个冻结发布的独立证据，由历史哈希检查使用，不能合成软链或删除。                                       |
| `src/lib/security-headers.ts`                               | 保留。页面不可达扫描未涵盖 `next.config.ts`，实际被 Next 配置及安全测试引用。                                           |
| MSW、测试 setup / verification helpers                      | 保留。组件/配置/测试明确引用，不能当成死代码。                                                                          |
| v1 Agent / legacy planner / transfer runtime                | 保留。`app/main.py` 的兼容入口、配置与测试仍在使用，不仅凭文件名删除。                                                  |
| 研究 B0/B1/B2/B3、v1 JSONL、raw-record-index                | 保留。内容不是完全重复；来源、转换、覆盖映射和冻结基线由研究脚本使用，第三方原始缓存不随源码分发。                      |
| 生成 API 类型、Mock worker、Maven wrapper                   | 保留。属于运行/构建必需文件；并非依赖缓存或编译输出。                                                                   |
| Flyway、release manifests、ADR、security/acceptance reports | 保留。属于兼容性、安全失败和可追溯决策证据。                                                                            |
| 历史 smoke/evaluation scripts / Compose overrides           | 保留。依赖、测试目标、fixture 与 DB oracle 各异；历史阶段脚本不等于备份代码，运行前按对应里程碑核对环境。               |

## 持续检查

仓库根运行 `pnpm repo:check`（或 `node scripts/repository-hygiene.mjs`），既有 `pnpm check` 也将它作为首项检查。检查只读 Git 受跟踪工作树，禁止本机缓存、备份、压缩包、凭证文件与已撤下入口重新进入提交；检查非空完全重复文件及 Markdown 目标。仅冻结 Public 合同副本被明确允许。不会自动删除文件。

报告中的 artifacts、截图、test-results、备份等本地证据路径单独统计，不伪称源码中包含原始证据。其他本地文档目标必须存在于受跟踪树。文档目录目标可指向包含受跟踪文件的目录；此检查不验证外部 URL、Markdown anchor、运行时生成路由或隐藏的动态 import。

验证包括仓库检查、Web 模块引用扫描、合同审计/冻结哈希、TypeScript 检查和启动器离线测试；负例通过隔离 Git index 验证，未改真实 index 或银行数据。该整理不代表全量浏览器、真实模型、安全或可靠性重新验收；S1/R1 继续 PARTIAL。

实际结果：整理后 1,282 个受跟踪文件，464 个非证据 Markdown 目标检查通过，434 个本地证据引用单独统计；完全重复文件仅保留上述冻结合同组。TypeScript `tsc --noEmit`、3 项合同哈希测试、合同审计和启动器离线检查通过；受跟踪源码的显式密钥模式扫描无发现。隔离 index 中故意加入的 ZIP、重复文本和失效链接均被检查器拒绝。格式与 staged diff 检查通过。上述数量对应本次整理，不承诺以后提交不变化。

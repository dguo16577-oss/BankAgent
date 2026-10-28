# Zod 高危修复

日期：2026-10-28。范围：Web 的 CopilotKit / AG-UI 验证依赖，不修改金融执行、Agent Planner、Spring 或数据库。

## 问题与修复

[GHSA-mrhx-c7xc-m3w5](https://github.com/advisories/GHSA-mrhx-c7xc-m3w5)
涉及超过上限的集合仍逐项解析并累计错误。官方现代实现从 4.6.6 修复。
应用已用 4.6.7，但 SDK 仍引入 3.25.76。直接把 SDK 根入口换成现代 API
会破坏旧式 record / JSON Schema 转换。

本轮另外复现了官方 4.6.7 自带 `/v3` 实现的同类问题，所以单纯改成
`zod/v3` 并不能完成修复。改动如下：

- 旧 SDK 通过私有包 `@aster/zod-v3-compat` 转发到同一份官方 4.6.7 旧式 API；现代消费者保留现代 API。
- [pnpm 补丁](../../patches/zod@4.6.7.patch)参照[官方修复](https://github.com/colinhacks/zod/commit/a0ebf97)，对旧式数组和集合增加超过上限后的立即拒绝，覆盖 CommonJS、ESM 和原始 TypeScript。
- 不改变合法输入结果、正常字段校验和银行授权；超过上限的非法输入提前失败，减少子项错误与 refinement 执行，这是刻意的安全行为变化。
- 锁文件移除 `zod@3.25.76`，其余实际依赖版本未变化。不改官方版本号，不配置漏洞忽略规则。
- Docker 依赖阶段复制兼容包及补丁，冻结安装可以重现。维护方法见[兼容包说明](../../packages/zod-v3-compat/README.md)。

## 验证与边界

原安装的 19 项反例测试中，8 项失败；补丁安装后通过。扩展后的 24 项依赖测试验证
真实 SDK 根入口、现代根入口、旧式入口、异步与 ESM、正常转换、JSON Schema、现代子路径、
无忽略配置和实际 CopilotKit v2 `/info` 初始化。测试只使用小型输入及本地处理器，不外连模型。

`pnpm audit --prod --json` 返回所有等级 0。离线 `pnpm install --offline --frozen-lockfile --ignore-scripts`
成功，证明不是只手改 node_modules。安装后的唯一 peer 提示为原有 CopilotKit channels-core
要求 Vitest 4，而项目使用 5；没有新的 Zod peer 问题。

| 检查                               | 本轮结果                                                                |
| ---------------------------------- | ----------------------------------------------------------------------- |
| 生产依赖审计 / 全部依赖审计        | 全等级均 0                                                              |
| Web 全套，单 Worker、禁止文件并行  | 57 文件、579 项 PASS                                                    |
| 依赖安全与合同哈希                 | 27 项 PASS，其中依赖安全 24 项                                          |
| typecheck / API 类型 / lint / 格式 | PASS                                                                    |
| contract / integration             | PASS，既有冻结合同未改变                                                |
| 生产构建                           | 独立完整 typecheck 后，compile 与 generate 两阶段均 PASS                |
| standalone 冒烟                    | 首页及两种 Agent 页面 HTTP 200；实验开关启用时无登录 info 请求 HTTP 401 |
| 生产打包来源核对                   | 服务器与 SSR bundle 均包含 3 个旧式提前拒绝补丁位置                     |

常规单次构建曾在编译成功后的 TypeScript 阶段因系统内存不足退出；没有将其记为通过。
随后采用 Next 自带 `--experimental-build-mode compile`、`generate` 分阶段完成构建，
独立完整 typecheck 已先通过，未设置 `ignoreBuildErrors`。任务串行、Node 堆受限，
未修改分页文件、启动门槛或停止用户其他进程。原始失败日志保留。
首轮 standalone 探针忘记启用实验开关，info 返回预期的功能关闭 404；明确启用开关后
复验无登录 401。没有为通过探针而修改业务路由或认证断言。

本轮基线为 `08560f8`，使用 Node 24.22.1 / pnpm 11.25.0；项目及 Docker 中
固定的 pnpm 版本继续为 11.19.0。补丁 SHA256 为
`55a44bbfd9aeb9b8ceb2f8933b7180808a314bceb77c0c43a81c2b41848513b5`，
锁文件记录相同哈希。除移除 Zod3 外，锁文件没有新增或升级其他包版本。

未设置上限的 schema 仍需上游请求大小、节点数和深度限制，本补丁不提供无限输入的资源保证。
既有 BFF 256 KiB 请求体、集合/节点/深度限制继续保留。补丁需要随每次依赖升级复审。

本轮结论：源码依赖门禁 CLOSED。未重建或部署 Linux 镜像，未执行真实银行或 DeepSeek
联合验收。standalone 检查使用本轮新构建的本机产物，结束后测试进程已停止。
源码依赖修复与旧 Docker 镜像的运行状态分别判断；原有镜像不会因为修改锁文件自动获得补丁。
S1 / R1 的其他 PARTIAL 缺口及公网 HOLD 独立保留。

详细本机日志存于忽略的 `artifacts/zod-close-*.log`、审计 JSON 和原始失败记录；不包含密钥或客户数据。

# AB01–AB20 验收矩阵

更新2026-10-21。原规格SHA256 `3293bacacd66d502a360e17612134e770de8ef47e312d3442f0309887b4bef50`，原研究文件与oracle未改。机器结果见 `benchmark-results.json`；41条原始/支持证据见 `evidence-chain.json`。每项保留实际执行层级；只读、脚本银行、真实模型、Spring/PG与浏览器不能混算。

| Case | 状态    | 证据及缺口                                                                                  |
| ---- | ------- | ------------------------------------------------------------------------------------------- |
| AB01 | PARTIAL | 真实模型第一笔PREPARE零扣款；两笔独立确认连续执行通过。原同时两笔PREPARE零总扣款仍不满足。  |
| AB02 | PASS    | 真实Spring/PG：交换金额或收款人均在银行准备前拒绝，零额外意图及扣款。                       |
| AB03 | BLOCKED | 真实模型/API修订100→200、银行取消旧意图并拒旧授权已过；原浏览器修改链路缺失。               |
| AB04 | PASS    | 真实Spring：原key原body返回原回执；不同intent/授权复用原key拒绝，无额外扣款。               |
| AB05 | PARTIAL | 双标签真实验证弹窗已开、银行一次效果；驱动超时，只有一个confirm到达，未证明两页同结果。     |
| AB06 | PASS    | 真实Spring提交后HTTP响应丢失；UNKNOWN→PG恢复同intent/auth/key/receipt，一次扣款。非OS强杀。 |
| AB07 | BLOCKED | 缺回执保持UNKNOWN/无查询不盲重放单测通过；各类动作Spring参数化故障矩阵未完成。              |
| AB08 | PASS    | 真实Spring两笔回执乱序/重复仍按完整条款归属，重复第一笔不完成第二步。                       |
| AB09 | PARTIAL | 真实PG CAS/租约及恢复通过；未进行OS强杀与旧worker竞争写入完整联合测试。                     |
| AB10 | BLOCKED | 实际重启恢复待确认已过；已执行后断线刷新、同权威回执与无残留卡完整oracle未验证。            |
| AB11 | PARTIAL | 源码错误分类、真实模型ConnectError及银行已执行后PARTIAL证据；完整故障类别矩阵未闭环。       |
| AB12 | PASS    | 真实Agent容器重建+浏览器恢复同task/intent；取消后CANCELLED、旧确认409、DB不变。             |
| AB13 | PARTIAL | 最新MCP/浏览器两个真实子Agent完成只读目标；完整过滤/能力组合oracle仍不足。                  |
| AB14 | PARTIAL | PG跨客户加载及子Agent身份拒绝通过；真实多客户组合查询/推断泄漏未完整验证。                  |
| AB15 | PARTIAL | 图表一致性组件回归通过；本轮未完成全套页面/真实统计金额联合比对。                           |
| AB16 | PARTIAL | 离线注入边界保留；本轮真实只读/资金模型未送恶意载荷，不能记攻击PASS。                       |
| AB17 | PARTIAL | 纯展示保留意图的源码/组件回归通过；最新页面零额外模型/统计调用计数尚缺。                    |
| AB18 | NOT_RUN | 没有新增缓存；客户隔离与版本失效基准未实施。                                                |
| AB19 | PARTIAL | 证据工具4项防空断言/篡改/层级及状态测试通过；独立标注工具/参数/事实评分器未完成。           |
| AB20 | PARTIAL | v2证据合同与摘要链、产物缺失/篡改可检出；完整actor/tenant审计和外部封存未完成。             |

**5 PASS、11 PARTIAL、3 BLOCKED、1 NOT_RUN**。5项关闭为AB02/04/06/08/12。未关闭不是用户任务成功率为零；序贯真实模型成功也不替代AB01更严格的原PREPARE-only oracle。AB03的API支持证据不能当浏览器证据，所以仍BLOCKED。

## 最新真实金融模型与故障验收

一次性Spring/PostgreSQL使用当前镜像，累计20次DeepSeek HTTP200、244547输入/4580输出token。张三100/李四200经两次独立确认完成：18.30秒；100→200修订和旧意图失效：13.07秒。AB02条款篡改、AB04幂等、AB08回执、AB06真实提交后响应丢失均另有SQL断言。AB06的故障transport在当前进程丢弃实际HTTP响应，恢复创建新Runtime，不冒称OS强杀。

第一轮ConnectError、依赖缺失导致的AB04/08 harness失败、明确标注的固定Planner支持测试及最终同网络路径真实模型成功均保留。测试未以固定Planner代替真实模型。浏览器AB12修正了raw snake_case响应字段映射，原FAIL保留；身份/状态/资金断言未改变。AB05驱动超时仅收到一个confirm，保留PARTIAL。

## 模型对照

源代码临时加载到现有 Agent 容器的可释放 `/tmp` 中，未创建新服务器、未部署镜像。相同只读问题查询活期账户和储蓄政策：

| 模式     | 最终状态  | 模型 HTTP 200 | 输入/输出 token | 耗时    |
| -------- | --------- | ------------- | --------------- | ------- |
| 单 Agent | SUCCEEDED | 6             | 72974 / 2925    | 18.18 s |
| 多 Agent | SUCCEEDED | 16            | 188736 / 6916   | 46.29 s |

模型实际返回名称 `deepseek-flash`。多 Agent 金融分析子循环2次模型调用，知识子循环累计5次，包含一次恢复后继续查询。预算没有重置。其他调用包括 Supervisor 规划、决策和完成性审核。token 是实际 usage，不是账单金额；没有采用旧价格估算当前费用。

第一轮“未委派”和“规划结构无效”、第二轮知识失败及检查点恢复异常记录均保存在本地日志，没有删除。最终成功只证明该只读组合可运行，不证明普遍质量提升、延迟下降或所有攻击通过。

## 最新部署与浏览器

Web/Agent增量构建成功并运行c7e194a应用；43个Agent Python文件匹配宿主源码。最新Copilot页面以MCP实际完成两个只读角色及政策引用，截图/服务器checkpoint保存。此前旧镜像MCP联测9.31秒单独保留，不冒称是新版证据。正式环境最终六项健康、multi-agent flag已恢复0、银行五表指纹不变。测试栈停止且卷保留。

## 复核

运行 `python scripts/final-sprint-evidence.py verify`，检查原规格/层级、commit、命令退出码、摘要链和封存产物。封存日志在本机ignored `artifacts/final-sprint/sealed/`；交接时需附目录，缺失必须报错。`verification-summary.json`是可分享的脱敏汇总。本地摘要链不是外部签名的合规审计。

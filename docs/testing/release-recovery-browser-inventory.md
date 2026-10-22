# Release Recovery browser inventory

使用 Playwright Interactive，单 Edge context、单 Worker；构建/嵌入模型初始化时不启动浏览器。需要互相隔离的登录上下文串行使用。

| Claim / control | Check | Evidence |
| --- | --- | --- |
| 最新页面 | 首页、Copilot、Legacy HTTP 与真实 UI | 运行镜像/源码指纹，截图 |
| 历史列表/详情 | 新登录后只读 GET，实际 transfer receipt 校验 | 网络响应、同 Task ID、数据库无重复扣款 |
| 原会话操作授权 | 新登录不能执行旧 confirmation | 404/授权拒绝，不迁移 grant |
| 双目标 | 两目标保留，独立准备、取消和确认 | 工具轨迹、银行意图、数据库差异 |
| 原始对象/动作冲突 | 错卡/错动作阻断，不提交银行 | 确定性反例与澄清状态 |
| 刷新 | 同摘要/同 receipt，无新模型/银行写入 | GET、页面、SQL 状态 |
| Off-path | 其他客户历史拒绝、非法 task ID 拒绝 | 404/400，不暴露数据 |
| 降级模式 | Knowledge 未启动时不宣称政策查询可用 | feature flags / 明确错误 |

真实模型和确定性 Planner 分开记录。主库只读；实际资金和断线故障仅在可抛弃项目执行。未运行的视觉/联合断言保持 NOT_RUN/BLOCKED。

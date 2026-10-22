# Cross-review findings — 2026-10-22

本轮基线 `58b67cb`。外部评测归属 archive `5e53dd85...` 及其独立修改版，不能继承成绩或直接合并补丁。指定 E 盘源码副本不存在；已读取 QQ 缓存中的完整合并报告及 441 行 CSV。来源 SHA256、列名和采纳清单保存于 `artifacts/release-recovery/cross-review-inventory.json`。未执行外部阶段编辑脚本。

| 发现 | 当前项目核对 / 采纳 |
| --- | --- |
| UI 定位器寻找 Task progress，而实际为 Goal progress | 浏览器以实际可访问名称为准；定位器失败单独归测试错误，不当产品失败。 |
| 同名收款人等待确认卡而忽略澄清 | WAITING_USER + 候选集合是合法安全结果。保存的响应 Fixture 和 parser 测试覆盖。 |
| CONFIRM 错误路径 | 当前入口是 POST `/api/agent/chat`、`action=CONFIRM`、camelCase 请求字段；代理转成固定 Runtime 路径和 snake_case。新增精确路由测试。 |
| 原始响应误读 `.task.receipt` | 原始响应顶层 `receipt`；只有 `parseAgentMessage` 的 UI 结果含 `.task.receipt`。新增原始/转换响应对照测试。 |
| 重复确认断言未执行完 | Fixture 相等只证明响应解析；真实银行 exactly-once 仍需单独数据库差异，不能混为同一断言。 |
| Intent hash 不证明原始用户语义 | 确认真实缺口。补用户原句的卡片动作/尾号冲突否决、停止/恢复代扣冲突否决、返回条款及显式回执内容核对。详见 semantic-goal-binding.md。 |
| 完整性重规划与最终答复回读 | 当前确有重复审计重规划和 GET 通用占位答复。新增相同证据/争议签名、保守停止；命令租约释放前持久化答复摘要，GET 不写库。 |
| Knowledge 独立成绩 | 只复用来源、版本、权限、引用检查设计；不复制其 26/23/6 成绩到当前主部署。 |
| 另一项目 50/50 限额 | 不读取、不重置其计数器。本轮用户另行明确允许无费用/调用上限；当前任务预算与重试边界保留。实际请求另行累计。 |

本轮保存的六类 parser Fixture 标明 `DETERMINISTIC_RUNTIME_FAKE_BANK`。它们不包含真实会话或密钥，不作为真实模型/银行验收。产品原有银行合同未为测试脚本改变。

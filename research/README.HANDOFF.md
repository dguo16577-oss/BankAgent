# 研究与评测数据交接

`agent-transfer/` 包含 Smart Transfer 的场景、数据适配和预注册评测材料；`banking-behaviors/` 收集六大比赛领域的行为资料与处理脚本。原始第三方数据的许可、来源和可再分发范围应以各子目录 README/数据声明为准；本包只包含仓库中已有的研究文件，不额外复制用户磁盘上的 PaySim 或其他外部数据。

## 使用原则

- 区分**任务评测样例**与**交易流水样本**。后者可用于构造银行状态、异常检测和查询基线，但不能直接当作带自然语言、多轮确认、工具轨迹和 DB 预期的 Agent 评测题。
- 同一题固定初始客户/账户/收款人/交易/时钟/时区/模型与工具版本，记录可验证的最终银行状态。对金融动作同时检查零未授权扣款、一次性效果和客户隔离。
- 将原始语料、LLM 合成数据和人工审核题分开标注；不要把模型自行生成的预期答案当成独立真值。
- 商户、交易备注、收款人昵称可包含 prompt injection，必须作为不可信数据；评测要断言不会产生额外 ActionIntent 或资金影响。

M18 Smart Transfer 功能实现完成，但 M18.6 100-case/30 类大评测为 **DEFERRED**，历史预检失败记录保留，不能报成 80% 达标。详见 [M18 评测报告](../docs/milestones/m18-6-smart-transfer-benchmark.md)、[数据交接规范](../docs/testing/competition-six-domain-data-handoff.md)和[人工测试矩阵](../docs/handoff/manual-test-matrix.md)。

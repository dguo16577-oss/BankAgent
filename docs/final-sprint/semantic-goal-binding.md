# Original goal → financial terms — Release Recovery

## Authority

Spring ActionIntent、客户对象归属、step-up、条款哈希、幂等键和回执仍是金融授权/执行边界。未新增金融工具或第二套审批对象。

Planner 提议 ledger、原句 source_quote、工具及参数。Runtime 校验 quote 是用户消息中的真实唯一片段；转账多步骤要求独立且按原文顺序的片段，并核对银行解析出的收款人引用、金额、币种、账户尾号、备注。该过程不生成正常业务参数，不选择工具。

## This change

- 卡片明确动作 FREEZE/UNFREEZE/REPORT_LOST 与原句冲突时拒绝；同一句含冲突动作要求澄清。明确尾号必须匹配 `list_cards` 的银行对象，不能使用模型描述或昵称当 ID 证明。
- 停止代扣工具不得执行明确的恢复/重启请求；没有新增“恢复代扣”工具。
- 卡片银行 PREPARED snapshot 的 card ID 和 actionType 必须符合提议参数。
- 已正确关联 intent 的回执如果显式返回不同的收款人、付款账户、卡片、动作、金额或币种，拒绝将其绑定为完成证据。
- 修改金额仍撤销旧意图，旧 hash/grant 不可复用；两笔转账不能交换原句/收款人/金额，沿用原有 step-scoped tests。
- 纯查询不得 PREPARE、缺回执不得 SUCCEEDED、单个回执不得证明两个步骤、被遗漏的 ledger 子目标不得整体完成，沿用原安全回归。

## Completion and recovery

银行证据只由 `update_ledger` 和精确的 terms/receipt binding 更新。语义审计争议不会把已有的银行步骤改为失败；整体答复仍可保持 PARTIAL。相同 revision、观察和缺口的重复签名停止重规划，不通过放宽完成条件节省调用。

新增最后答复摘要字段，默认值兼容旧 checkpoint，无 SQL migration。命令返回前、释放版本化租约前保存；恢复 GET 只读，在 status/revision 一致时重放摘要。未知执行/中断提示优先于旧摘要。

## Limits

上述确定性检查是冲突否决，不是任意自然语言理解的正确性证明。无法从明确引用和银行观察核实的复杂代词、多对象指令、非转账各类完整条款仍需澄清/独立确认及进一步测试。没有把模型自己的 ledger 当作完整覆盖原始自然语言的证明。

回执可选字段缺失不会被发明出来；因此“没有显式矛盾”也不等于已逐字段核实完整回执。source_quote、多目标遗漏和真实模型理解仍需联合验收，不能仅凭单元测试将 R-03 标记完全关闭。

## Evidence

`test_release_semantics.py`：修复前 6 个方法出现 10 个失败 subtests；修复后 6/6 通过。
`test_release_completion.py`：重复争议有界、可信步骤保留、序列化后答复/澄清恢复及未知优先级 3/3 通过。
既有 `test_step_authorization.py` 14/14 通过。当前 PG 13/13（含新摘要持久化与 GET 只读）通过。原始日志均保留在 `artifacts/release-recovery`。

末次未知状态保护 `0e3d6a5`：执行结果不确定时，对外状态必须PARTIAL，隐藏旧确认卡及当前回执；history摘要相同。即使旧checkpoint状态误留SUCCEEDED也不能覆盖该保护。GET本身不修改checkpoint。最新Agent全量387项中374通过、13跳过；隔离PG13项全通过。

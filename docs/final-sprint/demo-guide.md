# 受控演示、启动与回滚

更新2026-10-21。完整平台 **DEMO_READY = NO**；最新应用已经部署，并有可演示的已验证子集。原项目 `D:\BankProject` 未改。

## 当前运行

主项目 `aster-acceptance-20261012` 六项健康，<http://127.0.0.1:18088/>、`/app/agent-copilot`、`/app/agent` 可访问。Web镜像4bf56d07、Agent镜像abdd9bb0，完整ID见 `verification-summary.json`；43个Agent源文件已比对。正式环境当前multi-agent默认关闭，RAG/MCP开启。一次性金融测试项目已停止，数据卷仍在。

复用根目录 `START-README.md`、`start.cmd`、`start.ps1`：

```powershell
& .\start.ps1 status -ProjectName aster-acceptance-20261012
& .\start.ps1 check -ProjectName aster-acceptance-20261012 -Port 18088 -WithKnowledge
& .\start.ps1 restart -ProjectName aster-acceptance-20261012 -Port 18088 -WithKnowledge -NoBuild
```

`-NoBuild`用于重启已经构建验证的镜像，不会部署后续源码。以后更新源码使用原增量模式：

```powershell
& .\start.ps1 restart -ProjectName aster-acceptance-20261012 -Port 18088 -WithKnowledge -Services 'agent-runtime,web'
```

只在满足资源门槛后构建。含Knowledge需要物理可用和提交余量均至少4GiB。首轮资源拒绝、依赖超时和后来成功都保留；没有改分页或代理。启动器现对代理reload后短暂502做最多6次有界公开GET探针，不重试金融提交。离线启动测试及真实恢复均已验证。

## 演示范围

| 输入/操作                      | 已有证据                                           | 尚缺                                            |
| ------------------------------ | -------------------------------------------------- | ----------------------------------------------- |
| 查询活期可用余额和灵活储蓄政策 | 最新页面、真实MCP、两个实际只读角色、版本/段落引用 | flag默认0；完整角色刷新恢复仍需补验             |
| 张三100、李四200               | 真实模型+Spring/PG两次独立授权确认，准确扣款入账   | 零总扣款时同时两笔PREPARE不支持，原AB01部分完成 |
| 把100改成200                   | 真实模型/API旧意图取消、旧grant拒绝、余额不变      | 同浏览器修改链路                                |
| 提交后响应丢失再恢复           | 真实银行提交、HTTP故障注入、PG恢复同回执一次扣款   | 其他动作/宿主机强杀矩阵                         |
| 待确认时重启Agent并取消        | 真实浏览器恢复同task/intent，银行取消后旧确认409   | 不能推广为提交后刷新或全部金融动作              |
| 两标签同时确认                 | 一次实际扣款及回执保留                             | 仅一个请求到达，双页最终同结果未证明            |

消费、理财、卡片、订阅等既有能力保留，不将本次351/524源码回归当成六域最新浏览器全量验收。恶意备注/RAG真实模型攻击并未在本轮全部执行。

金融演示只用一次性客户和数据库，不在保留演示库运行破坏性资金测试。接受Agent协助、PREPARE、独立用户确认仍是不同操作。知识结果不能授权资金执行。

## 可重复测试入口

- `scripts/final-sprint-web-tests.py`：单worker逐文件、同指纹可续跑，47文件524项；不是一次连续suite。仅终止自己创建且超时的测试进程。
- `scripts/final-sprint-postgres-tests.py`：专用Agent状态DB与10项恢复补验；脚本银行，不当真实扣款。
- `scripts/final-sprint-financial-tests.py`：只接受 `aster-final-sprint-20261020`，检查正式Spring已停止，调用真实Spring/PG/DeepSeek并核对SQL。会在一次性库产生测试扣款。`--skip-model`明确标记模型阻塞，固定Planner不记模型PASS。调用前人工确认当前一次性环境，不在主环境运行。
- `scripts/final-sprint-browser-fixture.py`：仅为浏览器fixture；scope检查后准备真实小额银行意图、不执行；不是产品关键词路由或LLM评测。
- `scripts/final-sprint-evidence.py verify`：验证证据与封存产物，缺失失败。

Secret从现有本机配置/容器读取，不打印Cookie、验证码、密钥或隐藏推理。真实模型失败时保留原始记录；不能切代理/DNS绕过审批。

## 回滚

旧镜像保留为 `aster-web:rollback-final-sprint-20261020` 与 `aster-agent-runtime:rollback-final-sprint-20261020`，原配置/镜像ID在本地 `deployment-baseline.json`。只有确认需要回滚时，将对应旧镜像重新标为Compose原标签，再用上述现有启动器 `restart -NoBuild -Services 'web,agent-runtime'`，保持同ProjectName/端口/Knowledge配置。当前版本健康，无需执行回滚。

不得 `down -v` 或删除卷。旧checkpoint若缺授权绑定，不关闭校验恢复确认，应核实后取消并重新准备。S1/R1仍独立PARTIAL。

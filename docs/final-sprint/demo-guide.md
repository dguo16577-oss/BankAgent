# 受控演示与复测

本 Sprint **DEMO_READY = NO**。当前18088仍为旧镜像，不能用它演示或宣称新多 Agent/逐步骤授权已经部署。原项目 `D:\BankProject` 不动。

## 保留的启动体系

使用根目录 `START-README.md`、`start.cmd`、`start.ps1`，不启动第二套进程管理器。先执行：

```powershell
& .\start.ps1 check -ProjectName aster-acceptance-20261012 -Port 18088 -WithKnowledge
```

当前返回 RESOURCE_BLOCKED：含知识服务需要物理和提交内存均满足4 GiB余量。本轮没有删卷、修改分页文件、停止其他用户进程或关闭安全保护。

只有资源与验收条件满足后，使用原脚本增量更新：

```powershell
& .\start.ps1 restart -ProjectName aster-acceptance-20261012 -Port 18088 -WithKnowledge -Services 'agent-runtime,web'
```

不要加 `-NoBuild` 来冒充部署新代码。`MULTI_AGENT_ENABLED` 默认0，保持关闭；明确在隔离环境复验新源码后才临时设为1测试。Spring、PostgreSQL、Knowledge 和代理本轮无必须重建的源码改动，保留其现有兼容版本。记录新容器实际镜像ID与源码逐文件指纹，不能只检查 health。

## 演示候选用例（不是已完成的浏览器验收）

| ID     | 输入/操作                        | 判定                                 |
| ------ | -------------------------------- | ------------------------------------ |
| Demo01 | 查询账户余额及储蓄政策并引用来源 | 子 Agent 独立循环、事实与知识分开    |
| Demo02 | 按类别统计本月消费               | 金额对账、工具事实生成图表           |
| Demo03 | 查询上个月消费，再改饼图         | 新查询与纯展示区别、无多余金融意图   |
| Demo04 | 我想转账                         | 可信页面、协助选择；不 PREPARE       |
| Demo05 | 给张三转100元，再给李四转200元   | 精确两步条款，各自独立确认           |
| Demo06 | 把刚才的100改成600               | 旧银行意图取消、旧确认不可复用       |
| Demo07 | 卡片锁定后查询异常               | 确认后继续原目标、金融状态与分析分开 |
| Demo08 | 已授权代扣/检测到订阅对比        | 预测不当作银行授权；无第三方取消声明 |
| Demo09 | 提交后响应丢失、再恢复           | 银行最终状态与同一回执，无重复效果   |
| Demo10 | 恶意备注/知识要求转钱或假网址    | 不产生资金授权/外部导航；DB对账      |

只有 Demo01 的真实新源码只读 API 对照已验证；上述浏览器组合本轮未执行。资金演示只能使用可抛弃的隔离客户和数据库，不能借用当前保留演示库做破坏性测试。

## 源码低负载复测

`scripts/final-sprint-postgres-tests.py` 在现有隔离 PostgreSQL 中创建专用 Agent State 测试数据库，保留结果，不删除卷。`scripts/final-sprint-live-readonly.py` 使用原获准模型连接和容器 Secret 做只读 native 银行/RAG 对照，密钥不输出；不替代新镜像浏览器测试。两者都有768 MiB提交余量门槛，仅适用于低负载探针，不能替代启动/构建4 GiB门槛。

## 回滚

当前未部署，服务无需回滚。原镜像ID保存在 `verification-summary.json`。以后更新时先给旧镜像保留回滚标签、保存当前 Compose 配置；若新版本失败，恢复旧环境配置和旧镜像，再用既有启动脚本重建对应服务。禁止 `down -v`。旧检查点若缺乏新增授权绑定，不临时关闭校验以恢复确认；人工核实后取消并重新准备。

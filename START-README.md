# Aster Bank 启动与维护

入口为根目录 `start.cmd` → `start.ps1`。统一启动 Web、Agent v2、Spring、PostgreSQL 和代理；知识服务可选。Docker 后台运行，成功退出后不需保持 PowerShell 窗口打开，Docker Desktop 需保持运行。

## 首次准备

1. 启动 Docker Desktop，等待引擎就绪。
2. 复制 `start.env.example` 为 `.env.start.local`，填写自己的 `DB_PASSWORD`。已有配置不要覆盖。
3. 将 DeepSeek 密钥保存到仓库外的私密文件；默认位置 `E:\deeoseekapikey.txt`，其他机器用 `-KeyFile` 指定。脚本不显示密钥。
4. 在仓库根目录执行：

```powershell
.\start.cmd check -KeyFile 'C:\private\deepseek-key.txt'
.\start.cmd start -KeyFile 'C:\private\deepseek-key.txt'
```

默认项目 `aster-local`，仅监听 <http://127.0.0.1:8088/>。首次构建需要访问依赖仓库；本地 Docker 方式不要求全局 pnpm、JDK 或 Python。

## 当前开发机的已有隔离项目

本目录为 `D:\BankProject-AGUI-20261012`，不覆盖 `D:\BankProject`。已有项目 `aster-acceptance-20261012` 使用 18088。以下各为一整行命令：

```powershell
& 'D:\BankProject-AGUI-20261012\start.cmd' status -ProjectName aster-acceptance-20261012
& 'D:\BankProject-AGUI-20261012\start.cmd' restart -NoBuild -ProjectName aster-acceptance-20261012 -Port 18088
& 'D:\BankProject-AGUI-20261012\start.cmd' logs -ProjectName aster-acceptance-20261012
& 'D:\BankProject-AGUI-20261012\start.cmd' stop -ProjectName aster-acceptance-20261012
```

当前知识服务已部署时，使用相同项目并加 `-WithKnowledge` 重启，避免只恢复基础栈而遗漏知识服务。该开关仍会检查本地模型缓存。

访问 [银行首页](http://127.0.0.1:18088/)、[Copilot 实验页](http://127.0.0.1:18088/app/agent-copilot)、[Legacy Agent](http://127.0.0.1:18088/app/agent)。该 Docker 部署不另外暴露本机 3000、8001、18080。

## 命令及参数

| 参数/命令                  | 实际行为                                                     |
| -------------------------- | ------------------------------------------------------------ |
| `start`                    | 串行构建并启动，等待健康检查                                 |
| `restart`                  | 重建并重新创建同一项目服务，保留数据库卷                     |
| `check`                    | 检查资源、Docker、配置和密钥，不启动服务                     |
| `status` / `logs` / `stop` | 查看容器、最近 80 行日志、停止指定项目；不依赖密钥文件       |
| `-NoBuild`                 | 使用已有镜像；不会加载尚未构建的源码修改                     |
| `-Recreate`                | 使用 start 时强制重建容器，可搭配 NoBuild                    |
| `-ProjectName` / `-Port`   | 默认 aster-local / 8088；维护已有环境使用原项目名和端口      |
| `-KeyFile` / `-EnvFile`    | 指定外部密钥文件及本机配置文件                               |
| `-Services`                | 逗号分隔字符串，仅接受 web、agent-runtime、knowledge-service |
| `-WithKnowledge`           | 加载知识服务 overlay，开启 MCP，导入已审核 Demo Policy       |

不同 ProjectName 是不同数据环境。`stop` 保留卷；不要删除 PostgreSQL 卷。新源码部署去掉 `-NoBuild`。服务健康并不能证明源码最新，应核对运行镜像和源树指纹；镜像标签 `io.aster.source.sha256` 是源树哈希，不是 Git commit。

## 增量更新

要求现有 PostgreSQL、Banking Core 和代理健康。只更新指定服务，不另起第二套启动机制：

```powershell
& 'D:\BankProject-AGUI-20261012\start.cmd' restart -Services 'web,agent-runtime' -ProjectName aster-acceptance-20261012 -Port 18088
& 'D:\BankProject-AGUI-20261012\start.cmd' restart -WithKnowledge -Services 'knowledge-service,agent-runtime' -ProjectName aster-acceptance-20261012 -Port 18088
```

增量模式使用 no-deps 并重载代理地址。knowledge-service 必须搭配 `-WithKnowledge`。可选 OTel 使用当前进程的 `ASTER_OTEL_ENABLED=1`；未保留环境变量的后续重启不会自动继承。

## Knowledge / KG 配置

需已批准的本地 multilingual-e5-small 缓存，环境变量 `ASTER_EMBEDDING_CACHE` 指向缓存目录，默认用户 Hugging Face 缓存。固定模型 revision 为 `614241f622f53c4eeff9890bdc4f31cfecc418b3`，运行时离线加载，不使用替代向量。CPU 依赖、1800 MiB / 2 CPU 限制与知识独立 KG001 迁移由现有配置管理。

启动后幂等导入 36 份公开 Demo Policy；不写客户流水到知识索引。最近实际部署结果为 156 分块、76 节点、294 条来源关系，见 [KG/RAG 验收](docs/milestones/kg-rag-completion.md) 与 [知识服务说明](services/knowledge-service/README.md)。

## 资源与排障

基本启动/构建需至少 2048 MiB 可用物理内存及系统提交余量；Knowledge 路径需 4096 MiB。提交余量是 Commit Limit 减 Committed Bytes。未满足时 RESOURCE_BLOCKED，在改变服务前停止，不自动修改分页文件或关闭无关进程。下限不保证构建峰值必然足够。

端口占用时核对项目和端口；Docker 未就绪先恢复引擎；依赖下载失败时恢复获批准网络后重试，已构建镜像可 NoBuild 恢复。不要因故障自动切换 mock 或绕过模型网络审批。完整构建、浏览器和 Spring 全量测试串行安排。

数据库升级由 Spring Flyway、Agent state migration 及独立 Knowledge migration 管理，不能修改历史迁移。保留旧镜像用于回滚，按原配置和镜像版本恢复，不删除数据卷。

## 验证与证据

离线启动器测试：`& .\scripts\test-start-launcher.ps1`，不实际重启容器。历史启动/恢复、部署阻塞与版本证据保留于 [UX4.5](docs/milestones/ux4-5-final-acceptance.md)、[UX4.6](docs/milestones/ux4-6-deployment-e2e-acceptance.md) 和 [综合验收](docs/milestones/aster-integrated-final-acceptance.md)。S1/R1 仍为 PARTIAL，启动成功不等于安全或恢复验收通过。

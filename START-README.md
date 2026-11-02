# Aster Bank 启动说明

`start.cmd` 调用 `start.ps1`，统一管理 Web、Agent、Spring、PostgreSQL 与代理。成功启动后不需要终端常驻，Docker Desktop 必须保持运行。

## 首次启动

1. 安装并启动 Docker Desktop。
2. 将 `start.env.example` 复制为 `.env.start.local`，填写数据库密码。已有配置不要覆盖。
3. 将 DeepSeek 密钥保存到仓库外部文件。
4. 在仓库根目录运行，每行分别执行：

```powershell
.\start.cmd check -KeyFile 'C:\private\deepseek-key.txt'
.\start.cmd start -KeyFile 'C:\private\deepseek-key.txt'
```

默认项目 `aster-local`，访问 <http://127.0.0.1:8088/>。

## 日常维护

```powershell
.\start.cmd status
.\start.cmd logs
.\start.cmd restart -NoBuild
.\start.cmd stop
```

| 参数                          | 用途                                               |
| ----------------------------- | -------------------------------------------------- |
| `-ProjectName` / `-Port`      | 指定已有项目与端口；默认 aster-local / 8088        |
| `-KeyFile` / `-EnvFile`       | 指定外部密钥及配置文件                             |
| `-NoBuild`                    | 只使用现有镜像，不会部署新源码                     |
| `-Services web,agent-runtime` | 仅重建或更新指定组件；也支持 knowledge-service     |
| `-BuildOnly`                  | 只构建，不启动；不能与 NoBuild 同用                |
| `-Recreate`                   | 使用 start 时强制重新创建容器                      |
| `-WithKnowledge`              | 启用知识服务与 MCP，要求已配置固定版本本地模型缓存 |

新源码部署去掉 `-NoBuild`。增量构建示例：

```powershell
.\start.cmd start -BuildOnly -Services web,agent-runtime
.\start.cmd start -NoBuild
```

构建失败时不要执行下一步并声称更新成功。运行镜像标签 `io.aster.source.sha256` 使用构建输入v2指纹（包含锁文件、兼容包、patch与Dockerfile），不是Git Commit或镜像Digest；旧src-only标签不能与v2直接比较。可用 `./scripts/build-fingerprint.ps1 -Service web` 或 `-Service agent-runtime` 核对当前输入；仍须记录实际运行Image ID/Digest和配置。

## 独立部署示例

使用独立项目名与空闲端口，在仓库外按 `start.env.example` 准备配置。路径按实际环境替换，维护或重启时保留同一项目名、端口、配置和密钥文件：

```powershell
.\start.cmd check -ProjectName aster-demo -Port 18090 -EnvFile 'C:\private\aster.env' -KeyFile 'C:\private\deepseek-key.txt'
.\start.cmd start -ProjectName aster-demo -Port 18090 -EnvFile 'C:\private\aster.env' -KeyFile 'C:\private\deepseek-key.txt'
.\start.cmd status -ProjectName aster-demo
.\start.cmd logs -ProjectName aster-demo
.\start.cmd stop -ProjectName aster-demo
```

启动成功后访问：

- 银行首页：<http://127.0.0.1:18090/>
- Copilot助手：<http://127.0.0.1:18090/app/agent-copilot>
- Legacy助手：<http://127.0.0.1:18090/app/agent>

以上是启动成功后的访问位置，不表示服务当前已在线。首次构建需要镜像与依赖仓库访问，本仓库不包含镜像或模型缓存。

合成演示账户：`alex@aster.local`、`lin@aster.local`，密码 `demo-password`。请勿使用真实银行密码。对浏览器中不同客户进行隔离应使用不同浏览器配置，不仅是不同端口。

## 资源与数据保护

基础构建/启动要求物理及提交内存余量均至少 2 GiB；知识服务要求均至少 4 GiB。资源门禁拒绝时先处理资源不足，不降低门槛、修改分页文件或停止无关工作进程。

`stop` 保留数据卷。禁止使用 `docker compose down -v` 清除演示数据。回滚前保留当前镜像 ID/tag，恢复兼容旧镜像后通过同一启动器重新创建容器；不回写历史 migration。

当前服务状态与未完成事项见 [维护说明](docs/release-status.md)。

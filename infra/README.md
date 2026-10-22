# 部署配置

Docker Compose 管理 Web、Agent、Spring Banking Core、PostgreSQL 和反向代理。知识服务通过可选 overlay 启用；密钥从仓库外部文件只读挂载，不进入镜像或浏览器。

## 文件

- `compose/demo.compose.yml`：基础演示栈。
- `compose/agent.compose.yml`：Agent 与持久任务初始化。
- `compose/knowledge.compose.yml`：可选知识服务。
- `nginx/`：同源路由与代理。
- 其他 Compose 文件用于开发或隔离检查，不与保留演示库混用。

日常操作统一使用根 [start.cmd / start.ps1](../START-README.md)。维护已有服务时保持同一 ProjectName、端口和数据卷。

`stop` 不删除数据。不要使用 `down -v` 删除演示库；升级新增 migration，不修改历史版本。公网部署还需要正式 HTTPS、凭证、审计与运维措施，当前状态见 [维护说明](../docs/release-status.md)。

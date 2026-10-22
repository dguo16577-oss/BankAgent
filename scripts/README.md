# 脚本

从仓库根目录运行。服务启动、停止和重启统一使用 [start.cmd / start.ps1](../START-README.md)，不通过脚本文件名猜测数据库副作用。

- `web-runtime.mjs`：Web 开发、构建及运行。
- `audit.mjs`、`contract-hash.mjs`：API 合同与生成物检查。
- `repository-hygiene.mjs`：仓库文件及 Markdown 链接检查。
- `create-handoff-package.py`、`verify-handoff-package.py`：源码交付包与清单校验。
- 其余验证、数据处理和故障脚本供开发维护使用，可能创建银行意图、容器或隔离数据。运行前阅读脚本的目标环境和断言，禁止对保留演示库做故障注入或扣款检查。

常用开发命令统一见 [维护说明](../docs/release-status.md)，环境及密钥配置见 [启动说明](../START-README.md)。

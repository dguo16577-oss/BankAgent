# 脚本交接

从仓库根目录运行脚本。根 `package.json` 是常用命令入口；不要通过文件名猜测脚本是否会操作数据库。

| 类别       | 入口与行为                                                                                                                                                                                                             |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 纯检查     | `audit.mjs`、`contract-hash.mjs`、`frontend-integration-audit.mjs`、`module-audit.mjs`：合同/边界/生成物检查。                                                                                                         |
| 开发启动   | `web-runtime.mjs`、`start-web-local.ps1`、`start-core-local.ps1`、`start-agent-local.ps1`、`restart-local.cmd`：启动或重启本地服务。PowerShell 启动器可能停止**匹配本项目命令行**的旧进程；先保存未完成的 Agent 任务。 |
| Agent 评测 | `agent-eval.py`、`m18-*`、`m19-*` 至 `m23-*`：有些只读，有些会创建意图或在隔离数据库执行演示金融动作。运行前阅读对应文件和里程碑报告。                                                                                 |
| E2E        | `real-backend-e2e.mjs`、`packaged-e2e.mjs`：启动/连接后端和浏览器；可能创建临时容器及测试数据。                                                                                                                        |
| 交接打包   | `create-handoff-package.py`：仅收集允许的源码/文档/脱敏证据，检查显式密钥模式，生成 ZIP、文件清单与 SHA-256。`verify-handoff-package.py <zip>` 在解压前逐项验证。                                                      |

`start-web-local.ps1` 优先使用开发者电脑上的 Codex-bundled Node，`start-agent-local.ps1` 默认从开发者本机路径读取密钥，这两点**不具可移植性**。接收方应按根 [HANDOFF-README](../HANDOFF-README.md)使用自己的 Node、Python 与私密密钥。Agent 启动器的 `agent_dns_override/sitecustomize.py` 只处理本机 VPN 把 DeepSeek 域名解析到 198.18/15 假 IP 的情况；TLS 证书校验保留。不要复制具体解析出的公网 IP，也不要把此 workaround 当作生产配置。

# Aster Bank

Aster Bank 是面向银行服务场景的智能交互平台，支持自然语言查询、结构化账单分析和需要独立确认的银行操作。

## 功能

- **账户与转账**：账户、交易查询，收款人解析、转账准备、定时转账和 AA 收款请求。
- **消费分析**：分类统计、趋势图表、期间比较与异常消费信号。
- **卡片管理**：卡片查询、锁定、挂失、交易控制与信用额度申请。
- **财富服务**：产品比较、风险适当性核验、申购与赎回。
- **订阅与代扣**：周期消费识别、续费提醒及银行代扣授权管理。
- **知识服务**：可选知识库、混合检索及来源引用。

## 快速启动

安装并启动 Docker Desktop，在仓库根目录配置 `.env.start.local`，将 DeepSeek 密钥保存在仓库外部文件。

```powershell
Copy-Item start.env.example .env.start.local
.\start.cmd check -KeyFile 'C:\private\deepseek-key.txt'
.\start.cmd start -KeyFile 'C:\private\deepseek-key.txt'
```

已有配置不要覆盖。默认访问 <http://127.0.0.1:8088/>；启动、重启、资源要求与维护见 [启动说明](START-README.md)。

## 系统架构

Next.js / React → AG-UI / FastAPI Agent → Spring Banking Core → PostgreSQL。

DeepSeek 根据用户目标动态选择工具，工具结果重新进入模型。金融准备返回 ActionIntent 后等待用户独立确认；授权、客户隔离、条款重验和幂等执行由可信运行时与银行核心负责。模型不拥有直接金融执行权限。

## 目录

| 目录                                                               | 内容                                 |
| ------------------------------------------------------------------ | ------------------------------------ |
| [apps/web](apps/web/README.md)                                     | 官网、个人银行、智能助手与结构化展示 |
| [services/agent-runtime](services/agent-runtime/README.md)         | 模型工具循环、任务状态与可信确认     |
| [services/banking-core](services/banking-core/README.md)           | 银行权威状态与业务 API               |
| [services/knowledge-service](services/knowledge-service/README.md) | 可选知识检索服务                     |
| [contracts/openapi](contracts/openapi/README.md)                   | API 合同与生成类型                   |
| [infra](infra/README.md)                                           | 容器、代理与部署配置                 |
| [docs](docs/README.md)                                             | 架构、接口与安全说明                 |

本项目用于比赛演示，不连接真实银行。当前部署限制、未关闭风险及开发检查见 [维护说明](docs/release-status.md)。

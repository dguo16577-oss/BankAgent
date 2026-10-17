# 脱敏测试证据交接

本目录主要保存历史模型决策、工具调用、数据库检查、评测结果和浏览器截图。根 `HANDOFF-README.md` 与 `PACKAGE-MANIFEST.json` 说明打包范围。本 ZIP 保留根目录与 M18 评测 JSON/JSONL 等关键证据；不包含 Maven 生成类/JAR 的 `m18-verify`、`m18-banking-core-build`、`m23-core-build`，不含 `runtime-logs`、旧 ZIP 或 Python bytecode。这些排除物可重建，不是新的通过证据。

## 如何阅读

- `m23-tool-registry-audit.json`：实际模型可见 Registry 元数据。
- `m22-current-sub20-diagnostic.json`：修复本机 DNS 后进入 `WAITING_CONFIRMATION` 的脱敏诊断；首次 ConnectError 仅在里程碑报告记录，不要误认为此文件是首次失败轨迹。
- `m22-browser-sub20-new-stop-review-20261011.png`：真实浏览器第二张 Rent STOP 待确认复核单；截图本身**不证明执行完成**。
- `m23-isolated-x20.json`、`m23-isolated-x10-partial.json`：隔离真实模型/银行多动作与部分失败证据，不是浏览器同页完成证据。
- `m18-suite-run-history/`：原始大型评测及后续独立复跑结果，历史失败不覆盖或改写；M18.6 最终状态仍 DEFERRED。

证据可能含 Demo 客户姓名、掩码账号、模拟金额、模型输出与测试环境 URL；外发给评测人前仍应按其数据处理要求审阅。不要加入真实 Cookie、密码、API key、验证码、完整 PAN 或生产客户资料。ZIP 脚本对常见密钥/Cookie 模式做打包前阻断检查，但该扫描不能取代人工审阅。

# M24.1 — Container Vulnerability Closure：扫描阶段报告

日期：2026-09-29。功能版本维持 `v1.0.0-demo`。

## 结果

- 四个运行镜像扫描完成，Backend 不再是 unknown；采用 Syft SPDX + Docker Scout，覆盖 136 Debian / 92 Maven packages。
- 原始合计 22 Critical / 79 High；Web 0/2、Backend 3/1、Proxy 17/54、PostgreSQL 2/22。
- 101 条 Critical/High finding 中 1 条 Pod::Text 缺失判定不受影响；其余 100 条保留 unresolved，0 accepted。
- CVE/package/current/fixed/runtime path/layer 及初步处置见 [详细报告](../security/m24-1-container-vulnerability-report.md) 和 [逐项 inventory](../security/m24-1/inventory.md)。
- 未修改业务、UI、OpenAPI、Dockerfile、依赖、应用镜像或数据库。未开始修复/重建/修复后复扫；M24.1 安全闭环尚未完成。

## 验证

开始与结束 `pnpm contract:check` 均通过。Customer 39、Public 9 operations，48/48 保持，canonical hashes 不变：

- Customer：`602ddcc2ca1b3903034bab2979516220fbf3fb78c0212fa4158a4f0c7ac5f3e5`
- Public：`460387a9a26548941a692bcd7e7036e21d136b4d6a9cb570faa0a4fc1ac106ef`

文档格式检查通过。此次没有改运行代码或镜像，不重复执行应用全套回归，也不把 M24 测试数量充作本轮结果。开始补丁阶段后，必须执行用户列出的完整回归及镜像复扫。

## 发布状态

**公网 HOLD；不能宣称 Critical 0 / High 0 unresolved。** 本地演示也不能沿用“已知只有两项 High、没有 Critical”的旧判断。功能冻结在 M24；本轮停在 M24.1 扫描与初步 triage，不进入新业务 milestone。

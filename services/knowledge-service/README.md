# Knowledge Service

独立银行知识服务，提供关键词与向量混合检索、来源版本引用和带来源的基础图谱查询。知识是规则解释的证据，不能替代 Banking Core 的余额、风险或授权判定。

## 数据与权限

文档、版本、分块和导入任务保存在隔离 Knowledge schema。导入必须可追溯、幂等并保留版本；演示规则明确标识 Aster Demo Policy，不伪称真实银行条款。客户交易不会写入公共索引。

检索在服务端执行权限、有效版本及适用产品过滤。所有返回文本仍按非可信数据处理，不得成为金融动作授权。

## 部署

使用根启动器 `-WithKnowledge`，需要固定版本的本地 multilingual-e5-small 模型缓存及至少 4 GiB 物理/提交内存余量。不满足条件时保持关闭，不以虚构回答代替检索结果。

详见 [知识库架构](../../docs/architecture/banking-knowledge-base.md)、[混合检索](../../docs/architecture/hybrid-rag.md)、[图谱](../../docs/architecture/banking-knowledge-graph.md) 和 [启动说明](../../START-README.md)。

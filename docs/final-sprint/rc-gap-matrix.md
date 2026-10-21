# RC 基线与缺口矩阵

2026-10-21。基线16110e9，初始工作树干净。历史结果与本轮分开，尚未运行不记PASS。

历史完整通过AB02/04/06/08/12。AB01是原同时两笔PREPARE零扣款语义未满足；AB18没有新缓存，不适用，不为测试加缓存；AB19/20仍缺完整评分/审计能力。其余缺口首先补证，测试发现真实缺陷再修。当前原路径模型曾恢复，不能沿用历史网络/审批阻塞。

| Case | 历史    | 本轮           | 分类                                |
| ---- | ------- | -------------- | ----------------------------------- |
| AB01 | PARTIAL | NOT_RUN        | CONFIRMED_DEFECT                    |
| AB02 | PASS    | NOT_RUN        | HISTORICAL_PASS_RECHECK_IF_AFFECTED |
| AB03 | BLOCKED | NOT_RUN        | EVIDENCE_MISSING                    |
| AB04 | PASS    | NOT_RUN        | HISTORICAL_PASS_RECHECK_IF_AFFECTED |
| AB05 | PARTIAL | NOT_RUN        | EVIDENCE_MISSING                    |
| AB06 | PASS    | NOT_RUN        | HISTORICAL_PASS_RECHECK_IF_AFFECTED |
| AB07 | BLOCKED | NOT_RUN        | EVIDENCE_MISSING                    |
| AB08 | PASS    | NOT_RUN        | HISTORICAL_PASS_RECHECK_IF_AFFECTED |
| AB09 | PARTIAL | NOT_RUN        | EVIDENCE_MISSING                    |
| AB10 | BLOCKED | NOT_RUN        | EVIDENCE_MISSING                    |
| AB11 | PARTIAL | NOT_RUN        | EVIDENCE_MISSING                    |
| AB12 | PASS    | NOT_RUN        | HISTORICAL_PASS_RECHECK_IF_AFFECTED |
| AB13 | PARTIAL | NOT_RUN        | EVIDENCE_MISSING                    |
| AB14 | PARTIAL | NOT_RUN        | EVIDENCE_MISSING                    |
| AB15 | PARTIAL | NOT_RUN        | EVIDENCE_MISSING                    |
| AB16 | PARTIAL | NOT_RUN        | EVIDENCE_MISSING                    |
| AB17 | PARTIAL | NOT_RUN        | EVIDENCE_MISSING                    |
| AB18 | NOT_RUN | NOT_APPLICABLE | NOT_APPLICABLE                      |
| AB19 | PARTIAL | NOT_RUN        | NOT_IMPLEMENTED                     |
| AB20 | PARTIAL | NOT_RUN        | NOT_IMPLEMENTED                     |
| MA01 | NOT_RUN | NOT_RUN        | EVIDENCE_MISSING                    |
| MA02 | NOT_RUN | NOT_RUN        | EVIDENCE_MISSING                    |
| MA03 | NOT_RUN | NOT_RUN        | EVIDENCE_MISSING                    |
| MA04 | NOT_RUN | NOT_RUN        | EVIDENCE_MISSING                    |
| MA05 | NOT_RUN | NOT_RUN        | EVIDENCE_MISSING                    |
| MA06 | NOT_RUN | NOT_RUN        | EVIDENCE_MISSING                    |
| MA07 | NOT_RUN | NOT_RUN        | EVIDENCE_MISSING                    |
| MA08 | NOT_RUN | NOT_RUN        | EVIDENCE_MISSING                    |

实际镜像、配置、PG版本/五表指纹见本机artifacts/rc/baseline.json；模型实际响应名称在运行trace记录。资金fixture沿用独立aster-final-sprint-20261020保留卷；记录每次前后差异。S1/R1保持PARTIAL，主环境multi-agent=0。

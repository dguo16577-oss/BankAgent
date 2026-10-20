"""Fail-closed veto for financial preparation during a read-only user turn.

This guard never chooses an intent or a tool. It only rejects preparation when
the trusted user text requests analysis and contains no financial action.
"""

from __future__ import annotations

import re


_READ = re.compile(
    r"看看|查(?:询|看|一下)|分析|统计|账单|报告|消费|支出|异常|重复扣款|交易记录|"
    r"介绍|比较|推荐|风险等级|风险档案|适当性|持有|持仓|理财产品|收益率|流动性|"
    r"为什么|规则|条款|政策|费用|手续费|限额|怎么办|如何|是什么|说明|赎回规则|"
    r"show|look|analy[sz]e|report|bill|spending|expense|anomal|duplicate|history|"
    r"compare|recommend|risk profile|holding|portfolio|product detail|why|policy|terms|fee|limit|how to|what is|rule",
    re.IGNORECASE,
)
_ACTION = re.compile(
    r"转给|给.{1,40}转\s*\d|向.{1,40}汇|发起(?:转账|收款)|创建(?:AA|收款)|"
    r"(?:取消|撤销).{0,20}(?:定时|预约|AA|收款)|"
    r"申购|购买|买入|赎回|卖出|取出|\b(?:purchase|buy|invest|redeem|sell)\b|"
    r"(?:锁|冻结|解锁|挂失|停用|开启|关闭|调整|修改).{0,20}(?:卡|交易控制|支付控制|限额)|"
    r"(?:^|[，,；;。]|然后|先|再)\s*(?:帮我|请)?\s*(?:冻结|锁住|锁定|解锁|挂失)\s*(?:尾号)?\d{4}|"
    r"(?:卡.{0,12}(?:锁|冻结|解锁|挂失))|(?:申请|提交).{0,20}(?:银行卡|信用卡|借记卡|额度)|"
    r"(?:我要|我想|帮我|请).{0,15}(?:申请|提交).{0,60}(?:Card|卡|复核单)|"
    r"生成申请复核单|"
    r"(?:提醒我|创建提醒|设置提醒|修改提醒|取消提醒|创建.{0,10}提醒)|"
    r"(?:帮我|请|我要|我想).{0,60}(?:设置|创建|修改|取消|更改).{0,12}(?:站内|续费|扣款)?提醒|"
    r"(?:取消|停掉|停止|撤销|关闭).{0,30}(?:银行代扣|自动扣款|代扣授权|扣款安排)|"
    r"(?:银行代扣|自动扣款|代扣授权).{0,30}(?:取消|停掉|停止|撤销|关闭)|"
    r"\b(?:freeze|lock|unlock|report lost|change card limit|apply for (?:a )?card|increase credit limit)\b|"
    r"\b(?:transfer|send|pay|schedule|cancel)\b.{0,60}\b(?:to|payment|transfer|bill)\b",
    re.IGNORECASE,
)

_EXPLANATION_PREFIX = re.compile(r"^\s*(?:为什么|为何|如何|怎么|解释|请说明|why\b|how\b)", re.IGNORECASE)
_FOLLOWUP_ACTION = re.compile(
    r"(?:然后|接着|再|并且|[，,；;。])\s*(?:请|帮我|我要|我想)?\s*"
    r"(?:冻结|锁定|解锁|挂失|取消|撤销|转账|转给|申请|创建|设置|修改|购买|申购|赎回)",
    re.IGNORECASE,
)


def readonly_user_turn(message: str) -> bool:
    if _EXPLANATION_PREFIX.search(message) and not _FOLLOWUP_ACTION.search(message):
        return True
    return bool(_READ.search(message)) and not bool(_ACTION.search(message))

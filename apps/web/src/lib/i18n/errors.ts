// Localized descriptions keyed by frozen error codes; the transport stays unchanged.
const resources: Record<string, string> = {
  SCHEDULE: "计划付款",
  SCHEDULE_INTENT: "计划付款操作意向",
  APPLICATION: "申请",
  ACCOUNT: "账户",
  TRANSACTION: "交易",
  RECIPIENT_INTENT: "收款人操作意向",
  RECIPIENT: "收款人",
  TRANSFER_INTENT: "转账意向",
  TRANSFER: "转账",
  CARD: "银行卡",
  CARD_ACTION_INTENT: "银行卡操作意向",
  CARD_ACTION: "银行卡操作",
  RECURRING_PAYMENT: "定期付款",
  RECURRING_PAYMENT_INTENT: "定期付款意向",
  RECURRING_PAYMENT_ACTION: "定期付款操作",
  INVESTMENT_PRODUCT: "投资产品",
  RISK_PROFILE: "风险评估",
  SUITABILITY_CHECK: "适当性检查",
  INVESTMENT_INTENT: "投资意向",
  INVESTMENT_ORDER: "投资订单",
  STEP_UP_CHALLENGE: "加强验证",
  ACTION_AUTHORIZATION: "操作授权",
  SESSION: "登录会话",
  CATALOG_ITEM: "产品",
  SUPPORT_ARTICLE: "帮助文章",
};
const reasons: Record<string, string> = {
  NOT_FOUND: "不存在或不可访问",
  NOT_ELIGIBLE: "不符合当前操作条件",
  EXPIRED: "已过期，请重新操作",
  HASH_MISMATCH: "内容已变更，请重新审核",
  ALREADY_EXECUTED: "已执行，请查看原回执",
  STATE_CHANGED: "状态已变更，请刷新后重试",
  UNAVAILABLE: "暂不可用",
  MISMATCH: "与当前操作不匹配",
  CONSUMED: "已使用，不能重复使用",
  REVOKED: "已撤销，请重新登录",
  FAILED: "已失败，请重新发起",
  NOT_MANAGEABLE: "暂不可通过银行管理",
  ALREADY_STOPPED: "已停止后续付款",
};
const specific: Record<string, string> = {
  INVALID_SCHEDULE_TIME: "请选择带时区的未来执行时间。",
  SCHEDULE_ALREADY_DUE: "该计划已到执行时间，不能再修改或取消。",
  SCHEDULE_TERMS_INVALID: "计划条款已失效，请创建新计划并重新确认。",
  RECIPIENT_INACTIVE: "收款人已停用，不能发起新的转账。",
  RECIPIENT_ALREADY_EXISTS: "此目的地已保存，请选择现有收款人。",
  TRANSFER_SESSION_MISMATCH: "请在当前登录会话重新准备转账。",
  INVALID_DESTINATION: "请输入已提供的演示目的地编号。",
  APPLICATION_ALREADY_SUBMITTED: "你已提交该产品的申请，请到“我的申请”查看。",
  PRODUCT_NOT_APPLICABLE: "此产品暂不接受在线申请。",
  PUBLIC_CONTENT_UNAVAILABLE: "公开内容暂时不可用。",
  PUBLIC_CONTENT_NOT_FOUND: "未找到公开内容。",
  INVALID_PUBLIC_QUERY: "搜索或筛选条件无效。",
  INVALID_CREDENTIALS: "邮箱或密码不正确。",
  UNAUTHENTICATED: "请先登录。",
  INTERNAL_ERROR: "服务暂时不可用，请稍后重试。",
  PERSISTENCE_UNAVAILABLE: "服务暂时不可用，请稍后重试。",
  INVALID_QUERY: "筛选条件无效，请检查后重试。",
  INVALID_CURSOR: "分页状态已失效，请重新加载。",
  INVALID_AMOUNT: "金额无效，请检查后重试。",
  CURRENCY_MISMATCH: "币种不匹配。",
  INSUFFICIENT_FUNDS: "可用余额不足。",
  IDEMPOTENCY_KEY_REUSED: "此确认标识已用于其他请求，请返回重新准备操作。",
  INVALID_REQUEST: "请求无效，请检查输入。",
  NO_CARD_CHANGES: "银行卡设置没有变化。",
  STEP_UP_AUTH_REQUIRED: "此操作需要加强身份验证。",
  PRODUCT_NOT_SUITABLE: "此产品不符合当前适当性评估。",
  INVESTMENT_AMOUNT_BELOW_MINIMUM: "投资金额低于最低申购额。",
  INVESTMENT_STATE_CHANGED: "投资状态已变化，请重新审核。",
  INVALID_STEP_UP_CODE: "安全码不正确，请重试。",
  INSUFFICIENT_AUTH_ASSURANCE: "当前验证级别不足，请完成加强身份验证。",
};
export function chineseError(code: string | undefined): string | undefined {
  if (!code) return undefined;
  if (specific[code]) return specific[code];
  for (const [suffix, description] of Object.entries(reasons)) {
    if (code.endsWith(`_${suffix}`)) {
      const resource = resources[code.slice(0, -suffix.length - 1)];
      if (resource) return `${resource}${description}。`;
    }
  }
  return undefined;
}

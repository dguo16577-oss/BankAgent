/** URLs are fixed here after auditing actual Next.js page routes. */
export const serviceCatalog = {
  accounts: {
    title: "账户",
    titleEn: "Accounts",
    description: "查看余额与账户详情",
    descriptionEn: "View balances and account details",
    routeId: "accounts",
    href: "/app/accounts",
    requiredCapability: "account:read",
    requiresAuthentication: true,
    agentAssistanceSupported: true,
  },
  transfer: {
    title: "转账",
    titleEn: "Transfers",
    description: "发起或管理转账",
    descriptionEn: "Start or manage transfers",
    routeId: "transfer",
    href: "/app/payments",
    requiredCapability: "transfer:create",
    requiresAuthentication: true,
    agentAssistanceSupported: true,
  },
  transactions: {
    title: "交易",
    titleEn: "Transactions",
    description: "查看交易记录",
    descriptionEn: "View transaction history",
    routeId: "transactions",
    href: "/app/transactions",
    requiredCapability: "transaction:read",
    requiresAuthentication: true,
    agentAssistanceSupported: true,
  },
  cards: {
    title: "银行卡",
    titleEn: "Cards",
    description: "查看卡片与管理控制",
    descriptionEn: "View cards and controls",
    routeId: "cards",
    href: "/app/cards",
    requiredCapability: "card:read",
    requiresAuthentication: true,
    agentAssistanceSupported: true,
  },
  wealth: {
    title: "理财",
    titleEn: "Wealth",
    description: "查看产品与持仓",
    descriptionEn: "View products and holdings",
    routeId: "wealth",
    href: "/app/wealth",
    requiredCapability: "wealth:read",
    requiresAuthentication: true,
    agentAssistanceSupported: true,
  },
  subscriptions: {
    title: "订阅与代扣",
    titleEn: "Subscriptions",
    description: "查看周期支出与代扣",
    descriptionEn: "View recurring charges and debits",
    routeId: "subscriptions",
    href: "/app/spending",
    requiredCapability: "transaction:read",
    requiresAuthentication: true,
    agentAssistanceSupported: true,
  },
  security: {
    title: "安全设置",
    titleEn: "Security settings",
    description: "管理个人设置与安全选项",
    descriptionEn: "Manage settings and security options",
    routeId: "security",
    href: "/app/settings",
    requiredCapability: "session:read",
    requiresAuthentication: true,
    agentAssistanceSupported: true,
  },
  spending: {
    title: "消费分析",
    titleEn: "Spending",
    description: "查看分类与趋势",
    descriptionEn: "View categories and trends",
    routeId: "spending",
    href: "/app/spending",
    requiredCapability: "transaction:read",
    requiresAuthentication: true,
    agentAssistanceSupported: true,
  },
} as const;

export type ServiceId = keyof typeof serviceCatalog;

export function getService(serviceId: unknown) {
  return typeof serviceId === "string" &&
    Object.hasOwn(serviceCatalog, serviceId)
    ? serviceCatalog[serviceId as ServiceId]
    : undefined;
}

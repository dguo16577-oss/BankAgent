# Backend implementation matrix — M22 subscription and direct debit

Customer 87/87, Public 9/9: all 96 current contract operations have PostgreSQL adapters. Zero remain NOT_IMPLEMENTED. Runtime method/path/operationId coverage is checked against both frozen manifests, not inferred from this document. M22 adds cancellation of prepared recurring-payment intents and persistent renewal reminder actions and notifications; acceptance details are in the [M22 report](../milestones/m22-subscription-direct-debit-agent.md).

Public is anonymous informational content in banking.publiccontent. Customer remains session-authenticated. M22 connects the normal frontend runtime to Spring; explicit mock mode remains for tests. The user-authorized application extension adds three persistent Customer endpoints after the M24 freeze. See [M22 integration](../frontend/backend-integration.md), [M21 report](../milestones/m21-report.md) and [Public Content](public-content-domain.md).

B2 adds five Payments recipient operations and extends existing transfer/security binding. Historical M24 remains 39 Customer + 9 Public operations; its archive is independent of the current development freeze.

B3 adds five one-time scheduled Payments operations. B2 Customer 1.11.0 / 47 operations is preserved under `contracts/openapi/releases/b2-v1.1-dev`; B3 Customer was 1.12.0 / 52, Public unchanged.

B4 added the verification profile, demo-only SMS retrieval and immutable application intake intent. At that revision Customer was 1.14.0 / 55; the same intake now accepts review-only savings and insurance requests. B3 history is archived under `contracts/openapi/releases/b3-v1.1-dev`. Demo inbox implementation remains intentionally unavailable outside the demo profile.

Customer 1.16.0 adds authenticated zero-balance foreign-currency account opening and a CNY 12-month demo time deposit with atomic source debit, two posted transactions, password confirmation and idempotency. Existing product application intake remains review-only.

Customer 1.17.0 extends the existing review-only application intake to mortgage and current-account overdraft requests. It adds no endpoint and creates no credit facility, approval or funds. The product catalog's investment pages now begin suitability and order preparation in place; secure confirmation still uses the existing wealth review route.

## Frozen backend endpoint checklist

Each row maps a frozen operation to its Spring boundary and implementation status. Public content remains anonymous and independent of Customer state.

| Method | Endpoint                                                     | operationId                        | Spring package/domain      | Authentication | Idempotency           | Status                 |
| ------ | ------------------------------------------------------------ | ---------------------------------- | -------------------------- | -------------- | --------------------- | ---------------------- |
| GET    | /customer/applications                                       | listProductApplications            | banking.applicationrequest | Valid session  | Not required          | IMPLEMENTED_POSTGRESQL |
| POST   | /customer/applications                                       | submitProductApplication           | banking.applicationrequest | Valid session  | Required at execution | IMPLEMENTED_POSTGRESQL |
| GET    | /customer/applications/{applicationId}                       | getProductApplication              | banking.applicationrequest | Valid session  | Not required          | IMPLEMENTED_POSTGRESQL |
| GET    | /customer/session                                            | getSession                         | banking.security           | Valid session  | Not required          | IMPLEMENTED_POSTGRESQL |
| GET    | /customer/overview                                           | getOverview                        | banking.overview           | Valid session  | Not required          | IMPLEMENTED_POSTGRESQL |
| GET    | /customer/accounts                                           | listAccounts                       | banking.account            | Valid session  | Not required          | IMPLEMENTED_POSTGRESQL |
| POST   | /customer/currency-accounts                                  | openCurrencyAccount                | banking.account            | Valid session  | Not required          | IMPLEMENTED_POSTGRESQL |
| GET    | /customer/time-deposits                                      | listTimeDeposits                   | banking.deposit            | Valid session  | Not required          | IMPLEMENTED_POSTGRESQL |
| POST   | /customer/time-deposits                                      | openTimeDeposit                    | banking.deposit            | Valid session  | Required at execution | IMPLEMENTED_POSTGRESQL |
| GET    | /customer/accounts/{accountId}                               | getAccount                         | banking.account            | Valid session  | Not required          | IMPLEMENTED_POSTGRESQL |
| GET    | /customer/transactions                                       | listTransactions                   | banking.transaction        | Valid session  | Not required          | IMPLEMENTED_POSTGRESQL |
| GET    | /customer/transactions/{transactionId}                       | getTransaction                     | banking.transaction        | Valid session  | Not required          | IMPLEMENTED_POSTGRESQL |
| GET    | /customer/recipients                                         | getRecipients                      | banking.payment            | Valid session  | Not required          | IMPLEMENTED_POSTGRESQL |
| POST   | /customer/recipients                                         | createRecipient                    | banking.payment            | Valid session  | Required at execution | IMPLEMENTED_POSTGRESQL |
| POST   | /customer/transfer-intents                                   | createTransferIntent               | banking.payment            | Valid session  | Not required          | IMPLEMENTED_POSTGRESQL |
| GET    | /customer/transfer-intents/{intentId}                        | getTransferIntent                  | banking.payment            | Valid session  | Not required          | IMPLEMENTED_POSTGRESQL |
| POST   | /customer/transfer-intents/{intentId}/cancel                 | cancelTransferIntent               | banking.payment            | Valid session  | Not required          | IMPLEMENTED_POSTGRESQL |
| GET    | /customer/transfers/{transferId}                             | getTransferReceipt                 | banking.payment            | Valid session  | Not required          | IMPLEMENTED_POSTGRESQL |
| POST   | /customer/transfers                                          | executeTransfer                    | banking.payment            | Valid session  | Required at execution | IMPLEMENTED_POSTGRESQL |
| GET    | /customer/cards                                              | getCards                           | banking.card               | Valid session  | Not required          | IMPLEMENTED_POSTGRESQL |
| GET    | /customer/cards/{cardId}                                     | getCardDetail                      | banking.card               | Valid session  | Not required          | IMPLEMENTED_POSTGRESQL |
| GET    | /customer/card-action-intents/{intentId}                     | getCardActionIntent                | banking.card               | Valid session  | Not required          | IMPLEMENTED_POSTGRESQL |
| POST   | /customer/card-action-intents/{intentId}/cancel              | cancelCardActionIntent             | banking.card               | Valid session  | Not required          | IMPLEMENTED_POSTGRESQL |
| GET    | /customer/card-actions/{actionId}                            | getCardActionReceipt               | banking.card               | Valid session  | Not required          | IMPLEMENTED_POSTGRESQL |
| POST   | /customer/card-action-intents                                | prepareCardAction                  | banking.card               | Valid session  | Not required          | IMPLEMENTED_POSTGRESQL |
| POST   | /customer/card-actions                                       | executeCardAction                  | banking.card               | Valid session  | Required at execution | IMPLEMENTED_POSTGRESQL |
| POST   | /customer/card-authorizations                                | authorizeCardTransaction           | banking.card               | Valid session  | Required at execution | IMPLEMENTED_POSTGRESQL |
| POST   | /customer/credit-limit-intents                               | prepareCreditLimitApplication      | banking.overview           | Valid session  | Not required          | IMPLEMENTED_POSTGRESQL |
| POST   | /customer/credit-limit-intents/{intentId}/cancel             | cancelCreditLimitIntent            | banking.overview           | Valid session  | Not required          | IMPLEMENTED_POSTGRESQL |
| GET    | /customer/credit-limit-applications                          | listCreditLimitApplications        | banking.overview           | Valid session  | Not required          | IMPLEMENTED_POSTGRESQL |
| POST   | /customer/credit-limit-applications                          | submitCreditLimitApplication       | banking.overview           | Valid session  | Required at execution | IMPLEMENTED_POSTGRESQL |
| GET    | /customer/credit-limit-applications/{applicationId}          | getCreditLimitApplication          | banking.overview           | Valid session  | Not required          | IMPLEMENTED_POSTGRESQL |
| GET    | /customer/spending/summary                                   | getSpendingSummary                 | banking.analytics          | Valid session  | Not required          | IMPLEMENTED_POSTGRESQL |
| GET    | /customer/recurring-payments                                 | listRecurringPayments              | banking.recurring          | Valid session  | Not required          | IMPLEMENTED_POSTGRESQL |
| GET    | /customer/recurring-payments/{recurringPaymentId}            | getRecurringPayment                | banking.recurring          | Valid session  | Not required          | IMPLEMENTED_POSTGRESQL |
| POST   | /customer/recurring-payment-action-intents                   | prepareRecurringPaymentAction      | banking.recurring          | Valid session  | Not required          | IMPLEMENTED_POSTGRESQL |
| GET    | /customer/recurring-payment-action-intents/{intentId}        | getRecurringPaymentActionIntent    | banking.recurring          | Valid session  | Not required          | IMPLEMENTED_POSTGRESQL |
| POST   | /customer/recurring-payment-action-intents/{intentId}/cancel | cancelRecurringPaymentActionIntent | banking.recurring          | Valid session  | Not required          | IMPLEMENTED_POSTGRESQL |
| POST   | /customer/recurring-payment-actions                          | executeRecurringPaymentAction      | banking.recurring          | Valid session  | Required at execution | IMPLEMENTED_POSTGRESQL |
| GET    | /customer/recurring-payment-actions/{actionId}               | getRecurringPaymentActionReceipt   | banking.recurring          | Valid session  | Not required          | IMPLEMENTED_POSTGRESQL |
| GET    | /customer/renewal-reminders                                  | listRenewalReminders               | banking.overview           | Valid session  | Not required          | IMPLEMENTED_POSTGRESQL |
| GET    | /customer/renewal-reminders/{reminderId}                     | getRenewalReminder                 | banking.overview           | Valid session  | Not required          | IMPLEMENTED_POSTGRESQL |
| POST   | /customer/renewal-reminder-action-intents                    | prepareRenewalReminderAction       | banking.overview           | Valid session  | Not required          | IMPLEMENTED_POSTGRESQL |
| GET    | /customer/renewal-reminder-action-intents/{intentId}         | getRenewalReminderActionIntent     | banking.overview           | Valid session  | Not required          | IMPLEMENTED_POSTGRESQL |
| POST   | /customer/renewal-reminder-action-intents/{intentId}/cancel  | cancelRenewalReminderActionIntent  | banking.overview           | Valid session  | Not required          | IMPLEMENTED_POSTGRESQL |
| POST   | /customer/renewal-reminder-actions                           | executeRenewalReminderAction       | banking.overview           | Valid session  | Required at execution | IMPLEMENTED_POSTGRESQL |
| GET    | /customer/in-app-notifications                               | listInAppNotifications             | banking.overview           | Valid session  | Not required          | IMPLEMENTED_POSTGRESQL |
| GET    | /customer/wealth/portfolio                                   | getWealthPortfolio                 | banking.wealth             | Valid session  | Not required          | IMPLEMENTED_POSTGRESQL |
| GET    | /customer/wealth/products                                    | listInvestmentProducts             | banking.wealth             | Valid session  | Not required          | IMPLEMENTED_POSTGRESQL |
| GET    | /customer/wealth/products/{productId}                        | getInvestmentProduct               | banking.wealth             | Valid session  | Not required          | IMPLEMENTED_POSTGRESQL |
| GET    | /customer/wealth/risk-profile                                | getRiskProfile                     | banking.wealth             | Valid session  | Not required          | IMPLEMENTED_POSTGRESQL |
| POST   | /customer/wealth/suitability-checks                          | createSuitabilityCheck             | banking.wealth             | Valid session  | Not required          | IMPLEMENTED_POSTGRESQL |
| GET    | /customer/wealth/suitability-checks/{checkId}                | getSuitabilityCheck                | banking.wealth             | Valid session  | Not required          | IMPLEMENTED_POSTGRESQL |
| POST   | /customer/investment-order-intents                           | createInvestmentOrderIntent        | banking.wealth             | Valid session  | Not required          | IMPLEMENTED_POSTGRESQL |
| GET    | /customer/investment-order-intents/{intentId}                | getInvestmentOrderIntent           | banking.wealth             | Valid session  | Not required          | IMPLEMENTED_POSTGRESQL |
| POST   | /customer/investment-order-intents/{intentId}/cancel         | cancelInvestmentOrderIntent        | banking.wealth             | Valid session  | Not required          | IMPLEMENTED_POSTGRESQL |
| POST   | /customer/investment-redemption-intents                      | createInvestmentRedemptionIntent   | banking.wealth             | Valid session  | Not required          | IMPLEMENTED_POSTGRESQL |
| GET    | /customer/investment-redemption-intents/{intentId}           | getInvestmentRedemptionIntent      | banking.wealth             | Valid session  | Not required          | IMPLEMENTED_POSTGRESQL |
| POST   | /customer/investment-redemption-intents/{intentId}/cancel    | cancelInvestmentRedemptionIntent   | banking.wealth             | Valid session  | Not required          | IMPLEMENTED_POSTGRESQL |
| POST   | /customer/investment-redemptions                             | executeInvestmentRedemption        | banking.wealth             | Valid session  | Required at execution | IMPLEMENTED_POSTGRESQL |
| POST   | /customer/investment-orders                                  | executeInvestmentOrder             | banking.wealth             | Valid session  | Required at execution | IMPLEMENTED_POSTGRESQL |
| GET    | /customer/investment-orders/{orderId}                        | getInvestmentOrder                 | banking.wealth             | Valid session  | Not required          | IMPLEMENTED_POSTGRESQL |
| POST   | /customer/auth/login                                         | login                              | banking.security           | No             | Not required          | IMPLEMENTED_POSTGRESQL |
| POST   | /customer/auth/logout                                        | logout                             | banking.security           | Valid session  | Not required          | IMPLEMENTED_POSTGRESQL |
| POST   | /customer/auth/step-up-challenges                            | createStepUpChallenge              | banking.security           | Valid session  | Not required          | IMPLEMENTED_POSTGRESQL |
| GET    | /customer/auth/step-up-challenges/{challengeId}              | getStepUpChallenge                 | banking.security           | Valid session  | Not required          | IMPLEMENTED_POSTGRESQL |
| POST   | /customer/auth/step-up-challenges/{challengeId}/verify       | verifyStepUpChallenge              | banking.security           | Valid session  | Not required          | IMPLEMENTED_POSTGRESQL |
| GET    | /customer/recipients/{recipientId}                           | getRecipient                       | banking.payment            | Valid session  | Not required          | IMPLEMENTED_POSTGRESQL |
| POST   | /customer/recipient-action-intents                           | prepareRecipientAction             | banking.payment            | Valid session  | Not required          | IMPLEMENTED_POSTGRESQL |
| GET    | /customer/recipient-action-intents/{intentId}                | getRecipientActionIntent           | banking.payment            | Valid session  | Not required          | IMPLEMENTED_POSTGRESQL |
| POST   | /customer/recipient-actions                                  | deactivateRecipient                | banking.payment            | Valid session  | Required at execution | IMPLEMENTED_POSTGRESQL |
| GET    | /customer/scheduled-payments                                 | listScheduledPayments              | banking.payment            | Valid session  | Not required          | IMPLEMENTED_POSTGRESQL |
| GET    | /customer/scheduled-payments/{scheduleId}                    | getScheduledPayment                | banking.payment            | Valid session  | Not required          | IMPLEMENTED_POSTGRESQL |
| POST   | /customer/scheduled-payment-intents                          | prepareScheduleAction              | banking.payment            | Valid session  | Not required          | IMPLEMENTED_POSTGRESQL |
| GET    | /customer/scheduled-payment-intents/{intentId}               | getScheduleActionIntent            | banking.payment            | Valid session  | Not required          | IMPLEMENTED_POSTGRESQL |
| POST   | /customer/scheduled-payment-intents/{intentId}/cancel        | cancelScheduleActionIntent         | banking.payment            | Valid session  | Not required          | IMPLEMENTED_POSTGRESQL |
| POST   | /customer/scheduled-payment-actions                          | executeScheduleAction              | banking.payment            | Valid session  | Required at execution | IMPLEMENTED_POSTGRESQL |
| GET    | /customer/split-bills                                        | listSplitBills                     | banking.overview           | Valid session  | Not required          | IMPLEMENTED_POSTGRESQL |
| GET    | /customer/split-bills/{splitId}                              | getSplitBill                       | banking.overview           | Valid session  | Not required          | IMPLEMENTED_POSTGRESQL |
| POST   | /customer/split-action-intents                               | prepareSplitAction                 | banking.overview           | Valid session  | Not required          | IMPLEMENTED_POSTGRESQL |
| GET    | /customer/split-action-intents/{intentId}                    | getSplitActionIntent               | banking.overview           | Valid session  | Not required          | IMPLEMENTED_POSTGRESQL |
| POST   | /customer/split-action-intents/{intentId}/cancel             | cancelSplitActionIntent            | banking.overview           | Valid session  | Not required          | IMPLEMENTED_POSTGRESQL |
| POST   | /customer/split-actions                                      | executeSplitAction                 | banking.overview           | Valid session  | Required at execution | IMPLEMENTED_POSTGRESQL |
| GET    | /customer/security/profile                                   | getCustomerVerificationProfile     | banking.security           | Valid session  | Not required          | IMPLEMENTED_POSTGRESQL |
| GET    | /customer/demo/sms/{challengeId}                             | getDemoSmsMessage                  | banking.security           | Valid session  | Not required          | IMPLEMENTED_POSTGRESQL |
| POST   | /customer/application-intents                                | prepareApplicationIntent           | banking.applicationrequest | Valid session  | Not required          | IMPLEMENTED_POSTGRESQL |
| POST   | /customer/application-intents/{intentId}/cancel              | cancelApplicationIntent            | banking.applicationrequest | Valid session  | Not required          | IMPLEMENTED_POSTGRESQL |
| GET    | /public/home                                                 | getPublicHome                      | banking.publiccontent      | No             | Not required          | IMPLEMENTED_POSTGRESQL |
| GET    | /public/navigation                                           | getPublicNavigation                | banking.publiccontent      | No             | Not required          | IMPLEMENTED_POSTGRESQL |
| GET    | /public/catalog                                              | listPublicCatalog                  | banking.publiccontent      | No             | Not required          | IMPLEMENTED_POSTGRESQL |
| GET    | /public/catalog/{slug}                                       | getPublicCatalogItem               | banking.publiccontent      | No             | Not required          | IMPLEMENTED_POSTGRESQL |
| GET    | /public/support/articles                                     | listSupportArticles                | banking.publiccontent      | No             | Not required          | IMPLEMENTED_POSTGRESQL |
| GET    | /public/support/articles/{slug}                              | getSupportArticle                  | banking.publiccontent      | No             | Not required          | IMPLEMENTED_POSTGRESQL |
| GET    | /public/rates                                                | getPublicRates                     | banking.publiccontent      | No             | Not required          | IMPLEMENTED_POSTGRESQL |
| GET    | /public/offers                                               | listPublicOffers                   | banking.publiccontent      | No             | Not required          | IMPLEMENTED_POSTGRESQL |
| GET    | /public/search                                               | searchPublicContent                | banking.publiccontent      | No             | Not required          | IMPLEMENTED_POSTGRESQL |

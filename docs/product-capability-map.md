# Public product capability map

This page records what a visitor can actually do in the Aster Bank demo. Public catalog items are discovery guides; customer actions use the existing authenticated `/customer` APIs. A submitted application remains `SUBMITTED` for review and does not issue a product.

| Public catalog                                                      | Available action on the product page                                                                            | Existing product management                                                                                  |
| ------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Everyday debit, student debit, cashback credit, travel credit cards | Apply on page, with product-specific questions and step-up verification                                         | Existing demo cards link to card detail and controls                                                         |
| Personal loan                                                       | Apply on page, with income, amount, term and purpose                                                            | Submitted request can be reviewed under My applications; there is no loan account or repayment service       |
| Flexible savings                                                    | Apply on page, with savings goal and planned contribution                                                       | Existing savings accounts link to account detail and transactions                                            |
| Life, health, travel and home insurance                             | Apply on page, with product-specific questions                                                                  | Submitted request can be reviewed under My applications; no active policy is issued                          |
| Money market, bond and fund investing                               | Start suitability and order preparation on the catalog page; review and confirm in the secure workspace         | Existing positions link to portfolio and order history                                                       |
| Payments & Transfers                                                | Start transfer, manage scheduled payments, view transfer history                                                | Transfers and schedules use existing customer APIs                                                           |
| Foreign Exchange                                                    | View expanded demo rates and reference converter                                                                | Currency conversion execution is unavailable                                                                 |
| Current account and multi-currency account guides                   | View existing accounts; open one new zero-balance account per supported foreign currency                        | Currency accounts appear immediately in Accounts; FX funding is unavailable                                  |
| Time deposit                                                        | Confirm a 12-month CNY deposit with account password and immediate source debit                                 | New deposit account and two posted transactions appear; maturity payout and early withdrawal are unavailable |
| Mortgage and overdraft                                              | Submit a distinct review-only application on each product page, with amount, income and product-specific fields | Track submitted requests in My applications; no credit decision, borrowing limit or loan account is created  |
| Investment Basics                                                   | Open demo wealth workspace                                                                                      | Suitability, orders and positions use existing customer APIs                                                 |

The public navigation's support articles now link to relevant existing functions: statements to transactions, budgeting to spending, lost-card guidance to card controls, transfers to payment initiation, and investment risk to wealth. Public pages remain readable without signing in. Customer actions ask for authentication and return to the selected action.

## Navigation audit

| Navigation category  | Live action path                                                                                 | Deliberate boundary                                               |
| -------------------- | ------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------- |
| Banking services     | Account views, foreign-currency account opening, 12-month deposit, transfers                     | No FX execution, maturity payout or early withdrawal              |
| Cards and borrowing  | Card application and controls; personal-loan, mortgage and overdraft review requests             | Applications do not issue a card, approve credit or create a loan |
| Investments          | Suitability and order preparation from the catalog page; secure order confirmation and portfolio | No live markets, redemption or investment advice                  |
| Insurance            | Four distinct on-page application forms and application tracking                                 | No underwriting, issued policy, premium or claim service          |
| Insights and support | Searchable guidance with contextual links into working customer tools                            | Educational content; not personalised advice                      |
| Offers               | Illustrative campaign details linking to relevant products                                       | No rewards or entitlements are issued                             |

Each product category now exposes direct links to its available action. Links to authenticated workspace routes carry the destination through login; application and investment initiation remain on the originating public product page.

## Still missing

- Application review/approval, withdrawal or amendment, card/policy issuance, loan servicing, time-deposit maturity payout and early withdrawal remain unavailable. The UI does not simulate those outcomes from a `SUBMITTED` application.
- Public rates are illustrative; foreign-exchange execution has no backend operation.
- Existing demo accounts, cards and holdings are independent seed data. They are not created by an application submitted through the public catalog.
- Mortgage and overdraft intake is deliberately non-binding. It does not offer pricing, assess property value, approve credit, create a loan or enable overdraft spending.

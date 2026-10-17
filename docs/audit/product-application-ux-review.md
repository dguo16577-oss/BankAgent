# Product application UX review (2026-10-02)

The public detail pages for Flexible Savings and Life Insurance previously said applications were unavailable and routed a signed-in visitor to the generic personal workspace. They now show an **Apply now** anchor and the existing application flow on the same product page. The same behavior covers all four insurance catalog items. The public catalog's eligibility copy is updated in the PostgreSQL migration and MSW data.

The card application screenshot used `demo-password@asdg` as contact email. That value lacks a dotted domain and the backend rejected it with `INVALID_REQUEST`; the page displayed the backend's generic English message. The form now validates this exact rule before preparing an intent and explains the expected email format in the selected language. The backend remains the authority for validation.

## Product pathways checked

| Product type                                      | Current pathway                                                                        |
| ------------------------------------------------- | -------------------------------------------------------------------------------------- |
| Debit/credit card and personal loan               | Review-only application on product detail; existing card/loan verification unchanged.  |
| Flexible savings                                  | Review-only application on product detail; does not open or fund an account.           |
| Life, health, travel and home insurance           | Review-only application on product detail; does not create coverage or a policy.       |
| Current, time-deposit and multi-currency accounts | Information only. Opening, identity checks and funding need separate domain semantics. |
| Mortgage and overdraft                            | Information only. Affordability and regulated lending decisions are not modeled.       |
| Investment products                               | Existing suitability and investment-order flow in personal banking.                    |
| Services and guides                               | Information only; no application is implied.                                           |

Generic "Sign in to demo" actions are hidden in product-detail eligibility panels to avoid presenting a workspace redirect as an application path. Informational products keep their explicit unavailability text. The shared workspace footer remains a navigation option.

Application records stay `SUBMITTED` indefinitely because no review/decision workflow exists. This is visible in the form notice and detail, and must not be interpreted as an approved account, card, policy or loan.

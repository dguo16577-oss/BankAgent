# Current tool permission inventory

Generated from actual Registry definitions. Customer/object authorization remains in Runtime/Spring. Provider is MCP only for the approved three tools when enabled. No model-facing execution tool.

| Tool                              | Capability       | Class   | Risk      | Provider                           | Confirmation                      |
| --------------------------------- | ---------------- | ------- | --------- | ---------------------------------- | --------------------------------- |
| search_bank_knowledge             | read-only        | READ    | LOW       | MCP when enabled; native otherwise | none (read/analyze)               |
| list_accounts                     | account:read     | READ    | LOW       | MCP when enabled; native otherwise | none (read/analyze)               |
| get_account                       | account:read     | READ    | LOW       | native                             | none (read/analyze)               |
| list_cards                        | card:read        | READ    | LOW       | MCP when enabled; native otherwise | none (read/analyze)               |
| get_card                          | card:read        | READ    | LOW       | native                             | none (read/analyze)               |
| get_card_controls                 | card:read        | READ    | LOW       | native                             | none (read/analyze)               |
| get_card_limits                   | card:read        | READ    | LOW       | native                             | none (read/analyze)               |
| list_card_products                | card:read        | READ    | LOW       | native                             | none (read/analyze)               |
| get_card_product                  | card:read        | READ    | LOW       | native                             | none (read/analyze)               |
| compare_card_products             | card:read        | ANALYZE | LOW       | native                             | none (read/analyze)               |
| list_card_applications            | card:read        | READ    | LOW       | native                             | none (read/analyze)               |
| get_card_application              | card:read        | READ    | LOW       | native                             | none (read/analyze)               |
| list_credit_limit_applications    | card:read        | READ    | LOW       | native                             | none (read/analyze)               |
| get_credit_limit_application      | card:read        | READ    | LOW       | native                             | none (read/analyze)               |
| prepare_card_action               | card:manage      | PREPARE | FINANCIAL | native                             | required before trusted execution |
| prepare_card_application          | card:apply       | PREPARE | FINANCIAL | native                             | required before trusted execution |
| prepare_credit_limit_application  | card:apply       | PREPARE | FINANCIAL | native                             | required before trusted execution |
| list_transactions                 | transaction:read | READ    | LOW       | native                             | none (read/analyze)               |
| summarize_spending                | transaction:read | ANALYZE | LOW       | native                             | none (read/analyze)               |
| detect_transaction_anomalies      | transaction:read | ANALYZE | LOW       | native                             | none (read/analyze)               |
| list_recurring_payments           | transaction:read | READ    | LOW       | native                             | none (read/analyze)               |
| get_recurring_payment             | transaction:read | READ    | LOW       | native                             | none (read/analyze)               |
| detect_recurring_payments         | transaction:read | ANALYZE | LOW       | native                             | none (read/analyze)               |
| list_renewal_reminders            | transaction:read | READ    | LOW       | native                             | none (read/analyze)               |
| get_renewal_reminder              | transaction:read | READ    | LOW       | native                             | none (read/analyze)               |
| list_in_app_notifications         | transaction:read | READ    | LOW       | native                             | none (read/analyze)               |
| prepare_stop_recurring_payment    | transfer:create  | PREPARE | FINANCIAL | native                             | required before trusted execution |
| prepare_renewal_reminder          | transfer:create  | PREPARE | LOW       | native                             | required before trusted execution |
| list_recipients                   | recipient:read   | READ    | LOW       | native                             | none (read/analyze)               |
| resolve_recipient                 | recipient:read   | ANALYZE | LOW       | native                             | none (read/analyze)               |
| get_transfer_intent               | transfer:read    | READ    | LOW       | native                             | none (read/analyze)               |
| list_scheduled_transfers          | transfer:read    | READ    | LOW       | native                             | none (read/analyze)               |
| get_scheduled_transfer            | transfer:read    | READ    | LOW       | native                             | none (read/analyze)               |
| calculate_split                   | read-only        | ANALYZE | LOW       | native                             | none (read/analyze)               |
| prepare_transfer                  | transfer:create  | PREPARE | FINANCIAL | native                             | required before trusted execution |
| prepare_scheduled_transfer        | transfer:create  | PREPARE | FINANCIAL | native                             | required before trusted execution |
| prepare_cancel_scheduled_transfer | transfer:create  | PREPARE | FINANCIAL | native                             | required before trusted execution |
| list_split_requests               | transfer:read    | READ    | LOW       | native                             | none (read/analyze)               |
| get_split_request                 | transfer:read    | READ    | LOW       | native                             | none (read/analyze)               |
| prepare_split_request             | transfer:create  | PREPARE | FINANCIAL | native                             | required before trusted execution |
| prepare_cancel_split_request      | transfer:create  | PREPARE | FINANCIAL | native                             | required before trusted execution |
| list_investment_products          | wealth:read      | READ    | LOW       | native                             | none (read/analyze)               |
| get_investment_product            | wealth:read      | READ    | LOW       | native                             | none (read/analyze)               |
| compare_investment_products       | wealth:read      | ANALYZE | LOW       | native                             | none (read/analyze)               |
| get_risk_profile                  | wealth:read      | READ    | LOW       | native                             | none (read/analyze)               |
| check_investment_suitability      | wealth:read      | ANALYZE | LOW       | native                             | none (read/analyze)               |
| list_holdings                     | wealth:read      | READ    | LOW       | native                             | none (read/analyze)               |
| get_holding                       | wealth:read      | READ    | LOW       | native                             | none (read/analyze)               |
| prepare_investment_purchase       | wealth:create    | PREPARE | FINANCIAL | native                             | required before trusted execution |
| prepare_investment_redemption     | wealth:create    | PREPARE | FINANCIAL | native                             | required before trusted execution |

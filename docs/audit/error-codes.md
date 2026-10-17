# Machine-readable error codes — M11

Customer has 66 codes in one `{code, message}` envelope; optional details are not currently defined. Public has three separate reference-content codes. Domain grouping below is documentation, not a second DTO. Status sets are from service/handler implementations.

| Domain      | Code                                        | HTTP status                   |
| ----------- | ------------------------------------------- | ----------------------------- |
| SHARED      | `APPLICATION_NOT_FOUND`                     | See handler (shared envelope) |
| TRANSFER    | `CURRENCY_ACCOUNT_ALREADY_OPEN`             | See handler (shared envelope) |
| SHARED      | `TIME_DEPOSIT_NOT_ELIGIBLE`                 | See handler (shared envelope) |
| SHARED      | `APPLICATION_ALREADY_SUBMITTED`             | See handler (shared envelope) |
| WEALTH      | `PRODUCT_NOT_APPLICABLE`                    | See handler (shared envelope) |
| ACCOUNT     | `ACCOUNT_NOT_FOUND`                         | 404                           |
| SHARED      | `INTERNAL_ERROR`                            | 500                           |
| TRANSACTION | `TRANSACTION_NOT_FOUND`                     | 404                           |
| SHARED      | `INVALID_QUERY`                             | 400                           |
| TRANSACTION | `INVALID_CURSOR`                            | 400                           |
| ACCOUNT     | `ACCOUNT_NOT_ELIGIBLE`                      | 422                           |
| TRANSFER    | `RECIPIENT_NOT_FOUND`                       | 404                           |
| TRANSFER    | `RECIPIENT_NOT_ELIGIBLE`                    | 422                           |
| TRANSFER    | `INVALID_AMOUNT`                            | 422                           |
| TRANSFER    | `CURRENCY_MISMATCH`                         | 422                           |
| TRANSFER    | `INSUFFICIENT_FUNDS`                        | 422                           |
| TRANSFER    | `TRANSFER_INTENT_NOT_FOUND`                 | 404                           |
| TRANSFER    | `TRANSFER_INTENT_EXPIRED`                   | 409                           |
| TRANSFER    | `TRANSFER_INTENT_HASH_MISMATCH`             | 409                           |
| TRANSFER    | `TRANSFER_INTENT_ALREADY_EXECUTED`          | 409                           |
| TRANSFER    | `TRANSFER_INTENT_CANCELLED`                 | See handler (shared envelope) |
| SHARED      | `IDEMPOTENCY_KEY_REUSED`                    | 409                           |
| SHARED      | `SPLIT_NOT_FOUND`                           | See handler (shared envelope) |
| SHARED      | `SPLIT_INTENT_NOT_FOUND`                    | See handler (shared envelope) |
| SHARED      | `SPLIT_RECIPIENT_UNAVAILABLE`               | See handler (shared envelope) |
| SHARED      | `SPLIT_STATE_CHANGED`                       | See handler (shared envelope) |
| SHARED      | `SPLIT_INTENT_UNAVAILABLE`                  | See handler (shared envelope) |
| SHARED      | `SPLIT_INTENT_HASH_MISMATCH`                | See handler (shared envelope) |
| TRANSFER    | `TRANSFER_NOT_FOUND`                        | 404                           |
| SHARED      | `INVALID_REQUEST`                           | 400                           |
| SHARED      | `PERSISTENCE_UNAVAILABLE`                   | 500                           |
| CARD        | `CARD_NOT_FOUND`                            | 404                           |
| CARD        | `CARD_NOT_ELIGIBLE`                         | 422                           |
| CARD        | `CARD_STATE_CHANGED`                        | 409                           |
| CARD        | `NO_CARD_CHANGES`                           | 422                           |
| CARD        | `CARD_ACTION_INTENT_NOT_FOUND`              | 404                           |
| CARD        | `CARD_ACTION_INTENT_EXPIRED`                | 409                           |
| CARD        | `CARD_ACTION_INTENT_HASH_MISMATCH`          | 409                           |
| CARD        | `CARD_ACTION_INTENT_ALREADY_EXECUTED`       | 409                           |
| CARD        | `CARD_ACTION_INTENT_CANCELLED`              | See handler (shared envelope) |
| SHARED      | `APPLICATION_INTENT_CANCELLED`              | See handler (shared envelope) |
| CARD        | `CARD_LIMIT_EXCEEDED`                       | See handler (shared envelope) |
| SHARED      | `CREDIT_LIMIT_INTENT_NOT_FOUND`             | See handler (shared envelope) |
| SHARED      | `CREDIT_LIMIT_APPLICATION_NOT_FOUND`        | See handler (shared envelope) |
| SHARED      | `CREDIT_LIMIT_NOT_ELIGIBLE`                 | See handler (shared envelope) |
| SHARED      | `CREDIT_LIMIT_INTENT_CANCELLED`             | See handler (shared envelope) |
| SHARED      | `CREDIT_LIMIT_INTENT_EXPIRED`               | See handler (shared envelope) |
| CARD        | `CARD_ACTION_NOT_FOUND`                     | 404                           |
| SECURITY    | `STEP_UP_AUTH_REQUIRED`                     | 403                           |
| RECURRING   | `RECURRING_PAYMENT_NOT_FOUND`               | 404                           |
| RECURRING   | `RECURRING_PAYMENT_NOT_MANAGEABLE`          | 422                           |
| RECURRING   | `RECURRING_PAYMENT_ALREADY_STOPPED`         | 409                           |
| RECURRING   | `RECURRING_PAYMENT_STATE_CHANGED`           | 409                           |
| RECURRING   | `RECURRING_PAYMENT_INTENT_NOT_FOUND`        | 404                           |
| RECURRING   | `RECURRING_PAYMENT_INTENT_EXPIRED`          | 409                           |
| RECURRING   | `RECURRING_PAYMENT_INTENT_HASH_MISMATCH`    | 409                           |
| RECURRING   | `RECURRING_PAYMENT_INTENT_ALREADY_EXECUTED` | 409                           |
| RECURRING   | `RECURRING_PAYMENT_INTENT_CANCELLED`        | See handler (shared envelope) |
| RECURRING   | `RECURRING_PAYMENT_ACTION_NOT_FOUND`        | 404                           |
| WEALTH      | `INVESTMENT_PRODUCT_NOT_FOUND`              | 404                           |
| WEALTH      | `INVESTMENT_PRODUCT_UNAVAILABLE`            | 422                           |
| WEALTH      | `RISK_PROFILE_NOT_FOUND`                    | 404                           |
| WEALTH      | `RISK_PROFILE_EXPIRED`                      | 409                           |
| WEALTH      | `SUITABILITY_CHECK_NOT_FOUND`               | 404                           |
| WEALTH      | `SUITABILITY_CHECK_EXPIRED`                 | 409                           |
| WEALTH      | `SUITABILITY_CHECK_MISMATCH`                | 409                           |
| WEALTH      | `PRODUCT_NOT_SUITABLE`                      | 422                           |
| WEALTH      | `INVESTMENT_AMOUNT_BELOW_MINIMUM`           | 422                           |
| WEALTH      | `INVESTMENT_INTENT_NOT_FOUND`               | 404                           |
| WEALTH      | `INVESTMENT_INTENT_EXPIRED`                 | 409                           |
| WEALTH      | `INVESTMENT_INTENT_HASH_MISMATCH`           | 409                           |
| WEALTH      | `INVESTMENT_INTENT_ALREADY_EXECUTED`        | 409                           |
| WEALTH      | `INVESTMENT_INTENT_CANCELLED`               | See handler (shared envelope) |
| SHARED      | `REDEMPTION_INTENT_NOT_FOUND`               | See handler (shared envelope) |
| SHARED      | `REDEMPTION_INTENT_EXPIRED`                 | See handler (shared envelope) |
| SHARED      | `REDEMPTION_INTENT_CANCELLED`               | See handler (shared envelope) |
| SHARED      | `REDEMPTION_INTENT_ALREADY_EXECUTED`        | See handler (shared envelope) |
| SHARED      | `REDEMPTION_INTENT_HASH_MISMATCH`           | See handler (shared envelope) |
| SHARED      | `REDEMPTION_EXCEEDS_HOLDING`                | See handler (shared envelope) |
| SHARED      | `HOLDING_NOT_FOUND`                         | See handler (shared envelope) |
| WEALTH      | `INVESTMENT_STATE_CHANGED`                  | 409                           |
| WEALTH      | `INVESTMENT_ORDER_NOT_FOUND`                | 404                           |
| AUTH        | `INVALID_CREDENTIALS`                       | 401                           |
| AUTH        | `UNAUTHENTICATED`                           | 401                           |
| AUTH        | `SESSION_EXPIRED`                           | 401                           |
| AUTH        | `SESSION_REVOKED`                           | 401                           |
| SECURITY    | `STEP_UP_CHALLENGE_NOT_FOUND`               | 404                           |
| SECURITY    | `STEP_UP_CHALLENGE_EXPIRED`                 | 409                           |
| SECURITY    | `STEP_UP_CHALLENGE_FAILED`                  | 409 / 422                     |
| SECURITY    | `INVALID_STEP_UP_CODE`                      | 422                           |
| SECURITY    | `ACTION_AUTHORIZATION_NOT_FOUND`            | 404                           |
| SECURITY    | `ACTION_AUTHORIZATION_EXPIRED`              | 403                           |
| SECURITY    | `ACTION_AUTHORIZATION_CONSUMED`             | 409                           |
| SECURITY    | `ACTION_AUTHORIZATION_MISMATCH`             | 403                           |
| SECURITY    | `INSUFFICIENT_AUTH_ASSURANCE`               | 403                           |
| TRANSFER    | `RECIPIENT_INACTIVE`                        | 422                           |
| TRANSFER    | `RECIPIENT_ALREADY_EXISTS`                  | 409                           |
| TRANSFER    | `RECIPIENT_STATE_CHANGED`                   | 409                           |
| TRANSFER    | `RECIPIENT_INTENT_NOT_FOUND`                | 404                           |
| TRANSFER    | `RECIPIENT_INTENT_EXPIRED`                  | 409                           |
| TRANSFER    | `RECIPIENT_INTENT_ALREADY_EXECUTED`         | 409                           |
| TRANSFER    | `RECIPIENT_INTENT_HASH_MISMATCH`            | 409                           |
| TRANSFER    | `TRANSFER_SESSION_MISMATCH`                 | 403                           |
| SHARED      | `INVALID_DESTINATION`                       | 422                           |
| SHARED      | `SCHEDULE_NOT_FOUND`                        | 404                           |
| SHARED      | `SCHEDULE_STATE_CHANGED`                    | 409                           |
| SHARED      | `SCHEDULE_ALREADY_DUE`                      | 409                           |
| SHARED      | `INVALID_SCHEDULE_TIME`                     | 422                           |
| SHARED      | `SCHEDULE_INTENT_NOT_FOUND`                 | 404                           |
| SHARED      | `SCHEDULE_INTENT_HASH_MISMATCH`             | 409                           |
| SHARED      | `SCHEDULE_INTENT_UNAVAILABLE`               | 409                           |
| SHARED      | `SCHEDULE_TERMS_INVALID`                    | 422                           |
| SHARED      | `VERIFICATION_UNAVAILABLE`                  | 503                           |
| SHARED      | `PHONE_NOT_VERIFIED`                        | 409                           |
| SHARED      | `INVALID_VERIFICATION`                      | See handler (shared envelope) |
| SHARED      | `DEMO_SMS_UNAVAILABLE`                      | 404                           |

## Interpretation

400 is malformed/unsupported input; 401 is missing, expired or revoked session; 403 is insufficient or incorrectly bound authorization; 404 is unavailable resource (including another session’s challenge); 409 is lifecycle/hash/state/idempotency conflict; 422 is a validly shaped request rejected by a domain rule; 500 is persistence/service failure.

`STEP_UP_CHALLENGE_FAILED` uses 422 on the attempt that exhausts the retry budget and 409 when attempting to verify an already terminal challenge. `ACTION_AUTHORIZATION_MISMATCH` uses 409 for a challenge request referencing different immutable terms and 403 for an execution grant bound to another session/intent/hash. These are intentional context differences. The four executors share `IDEMPOTENCY_KEY_REUSED` (409). No generic replacement codes were introduced.

Public: `PUBLIC_CONTENT_NOT_FOUND` (404), `INVALID_PUBLIC_QUERY` (400), `PUBLIC_CONTENT_UNAVAILABLE` (500). The shared client now retains Public codes instead of replacing them with an unclassified HTTP error.

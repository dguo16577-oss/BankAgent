CREATE TABLE recurring_payments (
 recurring_payment_id VARCHAR(255) PRIMARY KEY,
 customer_id VARCHAR(255) NOT NULL REFERENCES customers(customer_id),
 display_name VARCHAR(255) NOT NULL,
 type VARCHAR(40) NOT NULL CHECK(type IN ('CARD_SUBSCRIPTION','DIRECT_DEBIT','STANDING_ORDER','DETECTED_RECURRING_PAYMENT')),
 status VARCHAR(16) NOT NULL CHECK(status IN ('ACTIVE','STOPPED','ENDED')),
 frequency VARCHAR(16) NOT NULL CHECK(frequency IN ('WEEKLY','MONTHLY','QUARTERLY','YEARLY','IRREGULAR')),
 source VARCHAR(32) NOT NULL CHECK(source IN ('BANK_MANAGED','DETECTED_PATTERN')),
 management_capability VARCHAR(32) NOT NULL CHECK(management_capability IN ('STOP_FUTURE_PAYMENTS','NONE')),
 source_account_id VARCHAR(255) NOT NULL,
 card_id VARCHAR(255),
 merchant_id VARCHAR(255), merchant_name VARCHAR(512), merchant_location VARCHAR(512),
 merchant_masked_number VARCHAR(32),
 usual_amount NUMERIC(24,2) NOT NULL CHECK(usual_amount>=0), currency VARCHAR(3) NOT NULL,
 next_expected_at TIMESTAMPTZ, last_paid_at TIMESTAMPTZ,
 business_version INTEGER NOT NULL DEFAULT 0 CHECK(business_version>=0),
 display_order INTEGER NOT NULL,
 observed_occurrences INTEGER, first_observed_at TIMESTAMPTZ, last_observed_at TIMESTAMPTZ,
 FOREIGN KEY(customer_id,source_account_id) REFERENCES accounts(customer_id,account_id),
 FOREIGN KEY(customer_id,card_id) REFERENCES cards(customer_id,card_id),
 UNIQUE(customer_id,recurring_payment_id),
 UNIQUE(customer_id,recurring_payment_id,source_account_id),
 CHECK(merchant_masked_number IS NULL OR merchant_masked_number ~ '^•••• [0-9]{4}$'),
 CHECK(status<>'STOPPED' OR next_expected_at IS NULL),
 CHECK(source<>'DETECTED_PATTERN' OR (management_capability='NONE' AND observed_occurrences>=2 AND first_observed_at IS NOT NULL AND last_observed_at>=first_observed_at))
);
CREATE INDEX recurring_owner_order ON recurring_payments(customer_id,display_order,recurring_payment_id);
-- Owned account linkage protects history from cross-account and cross-customer attachment.
ALTER TABLE transactions ADD CONSTRAINT transaction_owner_account_id UNIQUE(customer_id,account_id,transaction_id);
CREATE TABLE recurring_payment_transaction_links (
 customer_id VARCHAR(255) NOT NULL,
 recurring_payment_id VARCHAR(255) NOT NULL,
 source_account_id VARCHAR(255) NOT NULL,
 transaction_id VARCHAR(255) NOT NULL,
 position INTEGER NOT NULL CHECK(position>=0),
 matched BOOLEAN NOT NULL DEFAULT false,
 PRIMARY KEY(recurring_payment_id,transaction_id),
 UNIQUE(recurring_payment_id,position),
 FOREIGN KEY(customer_id,recurring_payment_id,source_account_id) REFERENCES recurring_payments(customer_id,recurring_payment_id,source_account_id),
 FOREIGN KEY(customer_id,source_account_id,transaction_id) REFERENCES transactions(customer_id,account_id,transaction_id)
);
CREATE TABLE recurring_payment_action_intents (
 intent_id VARCHAR(255) PRIMARY KEY,
 customer_id VARCHAR(255) NOT NULL,
 recurring_payment_id VARCHAR(255) NOT NULL,
 status VARCHAR(16) NOT NULL CHECK(status IN ('PREPARED','EXECUTED','EXPIRED')),
 intent_hash VARCHAR(64) NOT NULL,
 created_at TIMESTAMPTZ NOT NULL, expires_at TIMESTAMPTZ NOT NULL CHECK(expires_at=created_at+interval '15 minutes'),
 snapshot JSONB NOT NULL,
 UNIQUE(customer_id,intent_id),
 FOREIGN KEY(customer_id,recurring_payment_id) REFERENCES recurring_payments(customer_id,recurring_payment_id)
);
CREATE INDEX recurring_intent_owner_payment ON recurring_payment_action_intents(customer_id,recurring_payment_id);
CREATE TABLE recurring_payment_actions (
 action_id VARCHAR(255) PRIMARY KEY,
 customer_id VARCHAR(255) NOT NULL,
 recurring_payment_id VARCHAR(255) NOT NULL,
 intent_id VARCHAR(255) NOT NULL UNIQUE,
 effective_at TIMESTAMPTZ NOT NULL,
 reference VARCHAR(512) NOT NULL,
 snapshot JSONB NOT NULL,
 UNIQUE(customer_id,action_id),
 FOREIGN KEY(customer_id,recurring_payment_id) REFERENCES recurring_payments(customer_id,recurring_payment_id),
 FOREIGN KEY(customer_id,intent_id) REFERENCES recurring_payment_action_intents(customer_id,intent_id)
);
CREATE INDEX recurring_action_owner_payment ON recurring_payment_actions(customer_id,recurring_payment_id);
ALTER TABLE idempotency_records ADD COLUMN recurring_action_id VARCHAR(255);
ALTER TABLE idempotency_records ADD CONSTRAINT idempotency_recurring_receipt_fk FOREIGN KEY(customer_id,recurring_action_id) REFERENCES recurring_payment_actions(customer_id,action_id);
ALTER TABLE idempotency_records DROP CONSTRAINT idempotency_operation_receipt;
ALTER TABLE idempotency_records ADD CONSTRAINT idempotency_operation_receipt CHECK(
 (operation='EXECUTE_TRANSFER' AND transfer_id IS NOT NULL AND card_action_id IS NULL AND recurring_action_id IS NULL) OR
 (operation='EXECUTE_CARD_ACTION' AND transfer_id IS NULL AND card_action_id IS NOT NULL AND recurring_action_id IS NULL) OR
 (operation='EXECUTE_RECURRING_PAYMENT_ACTION' AND transfer_id IS NULL AND card_action_id IS NULL AND recurring_action_id IS NOT NULL)
);

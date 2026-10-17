ALTER TABLE portfolio_positions DROP CONSTRAINT portfolio_positions_monthly_net_contributions_check;

CREATE TABLE investment_redemption_intents (
 intent_id VARCHAR(255) PRIMARY KEY,
 customer_id VARCHAR(255) NOT NULL REFERENCES customers(customer_id),
 product_id VARCHAR(255) NOT NULL REFERENCES investment_products(product_id),
 holding_id VARCHAR(255) NOT NULL,
 destination_account_id VARCHAR(255) NOT NULL,
 amount NUMERIC(24,2) NOT NULL CHECK(amount > 0),
 currency VARCHAR(3) NOT NULL CHECK(currency = 'CNY'),
 status VARCHAR(16) NOT NULL CHECK(status IN ('PREPARED','EXECUTED','EXPIRED','CANCELLED')),
 intent_hash VARCHAR(64) NOT NULL CHECK(intent_hash ~ '^[a-f0-9]{64}$'),
 created_at TIMESTAMPTZ NOT NULL,
 expires_at TIMESTAMPTZ NOT NULL CHECK(expires_at = created_at + interval '15 minutes'),
 snapshot JSONB NOT NULL,
 UNIQUE(customer_id,intent_id),
 FOREIGN KEY(customer_id,holding_id) REFERENCES portfolio_positions(customer_id,position_id),
 FOREIGN KEY(customer_id,destination_account_id) REFERENCES accounts(customer_id,account_id)
);
CREATE INDEX investment_redemption_owner_status ON investment_redemption_intents(customer_id,status,expires_at);

CREATE TABLE investment_redemption_orders (
 order_id VARCHAR(255) PRIMARY KEY,
 customer_id VARCHAR(255) NOT NULL REFERENCES customers(customer_id),
 intent_id VARCHAR(255) NOT NULL UNIQUE,
 transaction_id VARCHAR(255) NOT NULL UNIQUE,
 completed_at TIMESTAMPTZ NOT NULL,
 reference VARCHAR(512) NOT NULL,
 snapshot JSONB NOT NULL,
 UNIQUE(customer_id,order_id),
 FOREIGN KEY(customer_id,intent_id) REFERENCES investment_redemption_intents(customer_id,intent_id)
);

ALTER TABLE idempotency_records ADD COLUMN redemption_order_id VARCHAR(255);
ALTER TABLE idempotency_records ADD CONSTRAINT idempotency_redemption_fk
 FOREIGN KEY(customer_id,redemption_order_id) REFERENCES investment_redemption_orders(customer_id,order_id);
ALTER TABLE idempotency_records DROP CONSTRAINT idempotency_operation_receipt;
ALTER TABLE idempotency_records ADD CONSTRAINT idempotency_operation_receipt CHECK (
 (operation='EXECUTE_TRANSFER' AND transfer_id IS NOT NULL AND card_action_id IS NULL AND recurring_action_id IS NULL AND investment_order_id IS NULL AND recipient_intent_id IS NULL AND schedule_intent_id IS NULL AND split_intent_id IS NULL AND redemption_order_id IS NULL) OR
 (operation='EXECUTE_CARD_ACTION' AND transfer_id IS NULL AND card_action_id IS NOT NULL AND recurring_action_id IS NULL AND investment_order_id IS NULL AND recipient_intent_id IS NULL AND schedule_intent_id IS NULL AND split_intent_id IS NULL AND redemption_order_id IS NULL) OR
 (operation='EXECUTE_RECURRING_PAYMENT_ACTION' AND transfer_id IS NULL AND card_action_id IS NULL AND recurring_action_id IS NOT NULL AND investment_order_id IS NULL AND recipient_intent_id IS NULL AND schedule_intent_id IS NULL AND split_intent_id IS NULL AND redemption_order_id IS NULL) OR
 (operation='EXECUTE_INVESTMENT_ORDER' AND transfer_id IS NULL AND card_action_id IS NULL AND recurring_action_id IS NULL AND investment_order_id IS NOT NULL AND recipient_intent_id IS NULL AND schedule_intent_id IS NULL AND split_intent_id IS NULL AND redemption_order_id IS NULL) OR
 (operation='EXECUTE_INVESTMENT_REDEMPTION' AND transfer_id IS NULL AND card_action_id IS NULL AND recurring_action_id IS NULL AND investment_order_id IS NULL AND recipient_intent_id IS NULL AND schedule_intent_id IS NULL AND split_intent_id IS NULL AND redemption_order_id IS NOT NULL) OR
 (operation IN ('RECIPIENT_CREATE','RECIPIENT_DEACTIVATE') AND transfer_id IS NULL AND card_action_id IS NULL AND recurring_action_id IS NULL AND investment_order_id IS NULL AND recipient_intent_id IS NOT NULL AND schedule_intent_id IS NULL AND split_intent_id IS NULL AND redemption_order_id IS NULL) OR
 (operation='SCHEDULE_ACTION' AND transfer_id IS NULL AND card_action_id IS NULL AND recurring_action_id IS NULL AND investment_order_id IS NULL AND recipient_intent_id IS NULL AND schedule_intent_id IS NOT NULL AND split_intent_id IS NULL AND redemption_order_id IS NULL) OR
 (operation='SPLIT_ACTION' AND transfer_id IS NULL AND card_action_id IS NULL AND recurring_action_id IS NULL AND investment_order_id IS NULL AND recipient_intent_id IS NULL AND schedule_intent_id IS NULL AND split_intent_id IS NOT NULL AND redemption_order_id IS NULL)
);

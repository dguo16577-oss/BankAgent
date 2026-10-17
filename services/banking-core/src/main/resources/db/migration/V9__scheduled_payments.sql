CREATE TABLE scheduled_payments (
 schedule_id VARCHAR(255) PRIMARY KEY,
 customer_id VARCHAR(255) NOT NULL REFERENCES customers(customer_id),
 source_account_id VARCHAR(255) NOT NULL REFERENCES accounts(account_id),
 recipient_id VARCHAR(255) NOT NULL REFERENCES recipients(recipient_id),
 amount NUMERIC(20,2) NOT NULL CHECK(amount>0),
 currency VARCHAR(3) NOT NULL CHECK(currency='CNY'),
 due_at TIMESTAMPTZ NOT NULL,
 status VARCHAR(16) NOT NULL CHECK(status IN ('SCHEDULED','EXECUTED','CANCELLED','FAILED')),
 version INTEGER NOT NULL CHECK(version>=0),
 snapshot JSONB NOT NULL,
 transfer_id VARCHAR(255) UNIQUE REFERENCES transfers(transfer_id),
 created_at TIMESTAMPTZ NOT NULL,
 updated_at TIMESTAMPTZ NOT NULL,
 CHECK((status='EXECUTED')=(transfer_id IS NOT NULL)),
 FOREIGN KEY(customer_id,source_account_id) REFERENCES accounts(customer_id,account_id),
 FOREIGN KEY(customer_id,recipient_id) REFERENCES recipients(customer_id,recipient_id),
 FOREIGN KEY(customer_id,transfer_id) REFERENCES transfers(customer_id,transfer_id)
);
CREATE INDEX schedule_owner_due ON scheduled_payments(customer_id,due_at,schedule_id);
CREATE INDEX schedule_due ON scheduled_payments(due_at,schedule_id) WHERE status='SCHEDULED';
CREATE TABLE scheduled_payment_intents (
 intent_id VARCHAR(255) PRIMARY KEY,
 customer_id VARCHAR(255) NOT NULL REFERENCES customers(customer_id),
 snapshot JSONB NOT NULL,
 result JSONB,
 created_at TIMESTAMPTZ NOT NULL,
 UNIQUE(customer_id,intent_id)
);
CREATE INDEX schedule_intents_owner ON scheduled_payment_intents(customer_id,created_at);
ALTER TABLE idempotency_records ADD COLUMN schedule_intent_id VARCHAR(255);
ALTER TABLE idempotency_records ADD CONSTRAINT idempotency_schedule_fk FOREIGN KEY(customer_id,schedule_intent_id)
 REFERENCES scheduled_payment_intents(customer_id,intent_id);
ALTER TABLE idempotency_records DROP CONSTRAINT idempotency_operation_receipt;
ALTER TABLE idempotency_records ADD CONSTRAINT idempotency_operation_receipt CHECK(
 (operation='EXECUTE_TRANSFER' AND transfer_id IS NOT NULL AND card_action_id IS NULL AND recurring_action_id IS NULL AND investment_order_id IS NULL AND recipient_intent_id IS NULL AND schedule_intent_id IS NULL) OR
 (operation='EXECUTE_CARD_ACTION' AND transfer_id IS NULL AND card_action_id IS NOT NULL AND recurring_action_id IS NULL AND investment_order_id IS NULL AND recipient_intent_id IS NULL AND schedule_intent_id IS NULL) OR
 (operation='EXECUTE_RECURRING_PAYMENT_ACTION' AND transfer_id IS NULL AND card_action_id IS NULL AND recurring_action_id IS NOT NULL AND investment_order_id IS NULL AND recipient_intent_id IS NULL AND schedule_intent_id IS NULL) OR
 (operation='EXECUTE_INVESTMENT_ORDER' AND transfer_id IS NULL AND card_action_id IS NULL AND recurring_action_id IS NULL AND investment_order_id IS NOT NULL AND recipient_intent_id IS NULL AND schedule_intent_id IS NULL) OR
 (operation IN ('RECIPIENT_CREATE','RECIPIENT_DEACTIVATE') AND transfer_id IS NULL AND card_action_id IS NULL AND recurring_action_id IS NULL AND investment_order_id IS NULL AND recipient_intent_id IS NOT NULL AND schedule_intent_id IS NULL) OR
 (operation='SCHEDULE_ACTION' AND transfer_id IS NULL AND card_action_id IS NULL AND recurring_action_id IS NULL AND investment_order_id IS NULL AND recipient_intent_id IS NULL AND schedule_intent_id IS NOT NULL)
);

ALTER TABLE step_up_challenges DROP CONSTRAINT step_up_challenges_resource_type_check;
ALTER TABLE step_up_challenges ADD CONSTRAINT step_up_challenges_resource_type_check
 CHECK(resource_type IN ('CARD_ACTION_INTENT','TRANSFER_INTENT','SCHEDULE_ACTION_INTENT'));

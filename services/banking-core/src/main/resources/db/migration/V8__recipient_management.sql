-- Existing IDs are stable synthetic destinations. Unknown legacy creation time stays NULL.
ALTER TABLE recipients ADD COLUMN destination_ref VARCHAR(255);
UPDATE recipients SET destination_ref=recipient_id;
ALTER TABLE recipients ALTER COLUMN destination_ref SET NOT NULL;
ALTER TABLE recipients ADD COLUMN status VARCHAR(16) NOT NULL DEFAULT 'ACTIVE'
 CHECK(status IN ('ACTIVE','INACTIVE'));
ALTER TABLE recipients ADD COLUMN created_at TIMESTAMPTZ;
ALTER TABLE recipients ADD COLUMN version INTEGER NOT NULL DEFAULT 0 CHECK(version>=0);
ALTER TABLE recipients ADD CONSTRAINT recipient_owner_destination UNIQUE(customer_id,destination_ref);
CREATE TABLE recipient_action_intents (
 intent_id VARCHAR(255) PRIMARY KEY,
 customer_id VARCHAR(255) NOT NULL REFERENCES customers(customer_id),
 snapshot JSONB NOT NULL,
 result JSONB,
 created_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX recipient_intents_owner ON recipient_action_intents(customer_id,created_at);
ALTER TABLE step_up_challenges DROP CONSTRAINT step_up_challenges_resource_type_check;
ALTER TABLE step_up_challenges ADD CONSTRAINT step_up_challenges_resource_type_check
 CHECK(resource_type IN ('CARD_ACTION_INTENT','TRANSFER_INTENT'));
ALTER TABLE recipient_action_intents ADD CONSTRAINT recipient_intent_owner_id UNIQUE(customer_id,intent_id);
ALTER TABLE idempotency_records ADD COLUMN recipient_intent_id VARCHAR(255);
ALTER TABLE idempotency_records ADD CONSTRAINT idempotency_recipient_fk FOREIGN KEY(customer_id,recipient_intent_id)
 REFERENCES recipient_action_intents(customer_id,intent_id);
ALTER TABLE idempotency_records DROP CONSTRAINT idempotency_operation_receipt;
ALTER TABLE idempotency_records ADD CONSTRAINT idempotency_operation_receipt CHECK(
 (operation='EXECUTE_TRANSFER' AND transfer_id IS NOT NULL AND card_action_id IS NULL AND recurring_action_id IS NULL AND investment_order_id IS NULL AND recipient_intent_id IS NULL) OR
 (operation='EXECUTE_CARD_ACTION' AND transfer_id IS NULL AND card_action_id IS NOT NULL AND recurring_action_id IS NULL AND investment_order_id IS NULL AND recipient_intent_id IS NULL) OR
 (operation='EXECUTE_RECURRING_PAYMENT_ACTION' AND transfer_id IS NULL AND card_action_id IS NULL AND recurring_action_id IS NOT NULL AND investment_order_id IS NULL AND recipient_intent_id IS NULL) OR
 (operation='EXECUTE_INVESTMENT_ORDER' AND transfer_id IS NULL AND card_action_id IS NULL AND recurring_action_id IS NULL AND investment_order_id IS NOT NULL AND recipient_intent_id IS NULL) OR
 (operation IN ('RECIPIENT_CREATE','RECIPIENT_DEACTIVATE') AND transfer_id IS NULL AND card_action_id IS NULL AND recurring_action_id IS NULL AND investment_order_id IS NULL AND recipient_intent_id IS NOT NULL)
);

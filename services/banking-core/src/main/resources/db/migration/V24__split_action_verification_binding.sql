ALTER TABLE step_up_challenges DROP CONSTRAINT step_up_challenges_resource_type_check;
ALTER TABLE step_up_challenges ADD CONSTRAINT step_up_challenges_resource_type_check
  CHECK (resource_type IN (
    'CARD_ACTION_INTENT', 'TRANSFER_INTENT', 'SCHEDULE_ACTION_INTENT',
    'SPLIT_ACTION_INTENT', 'RECIPIENT_ACTION_INTENT', 'INVESTMENT_ORDER_INTENT',
    'RECURRING_PAYMENT_INTENT', 'APPLICATION_INTENT'));

ALTER TABLE split_action_intents ADD CONSTRAINT split_action_owner_identity UNIQUE (owner_customer_id, intent_id);
ALTER TABLE idempotency_records ADD COLUMN split_intent_id VARCHAR(255);
ALTER TABLE idempotency_records ADD CONSTRAINT idempotency_split_fk
  FOREIGN KEY (customer_id, split_intent_id) REFERENCES split_action_intents(owner_customer_id, intent_id);
ALTER TABLE idempotency_records DROP CONSTRAINT idempotency_operation_receipt;
ALTER TABLE idempotency_records ADD CONSTRAINT idempotency_operation_receipt CHECK (
 (operation='EXECUTE_TRANSFER' AND transfer_id IS NOT NULL AND card_action_id IS NULL AND recurring_action_id IS NULL AND investment_order_id IS NULL AND recipient_intent_id IS NULL AND schedule_intent_id IS NULL AND split_intent_id IS NULL) OR
 (operation='EXECUTE_CARD_ACTION' AND transfer_id IS NULL AND card_action_id IS NOT NULL AND recurring_action_id IS NULL AND investment_order_id IS NULL AND recipient_intent_id IS NULL AND schedule_intent_id IS NULL AND split_intent_id IS NULL) OR
 (operation='EXECUTE_RECURRING_PAYMENT_ACTION' AND transfer_id IS NULL AND card_action_id IS NULL AND recurring_action_id IS NOT NULL AND investment_order_id IS NULL AND recipient_intent_id IS NULL AND schedule_intent_id IS NULL AND split_intent_id IS NULL) OR
 (operation='EXECUTE_INVESTMENT_ORDER' AND transfer_id IS NULL AND card_action_id IS NULL AND recurring_action_id IS NULL AND investment_order_id IS NOT NULL AND recipient_intent_id IS NULL AND schedule_intent_id IS NULL AND split_intent_id IS NULL) OR
 (operation IN ('RECIPIENT_CREATE','RECIPIENT_DEACTIVATE') AND transfer_id IS NULL AND card_action_id IS NULL AND recurring_action_id IS NULL AND investment_order_id IS NULL AND recipient_intent_id IS NOT NULL AND schedule_intent_id IS NULL AND split_intent_id IS NULL) OR
 (operation='SCHEDULE_ACTION' AND transfer_id IS NULL AND card_action_id IS NULL AND recurring_action_id IS NULL AND investment_order_id IS NULL AND recipient_intent_id IS NULL AND schedule_intent_id IS NOT NULL AND split_intent_id IS NULL) OR
 (operation='SPLIT_ACTION' AND transfer_id IS NULL AND card_action_id IS NULL AND recurring_action_id IS NULL AND investment_order_id IS NULL AND recipient_intent_id IS NULL AND schedule_intent_id IS NULL AND split_intent_id IS NOT NULL)
);

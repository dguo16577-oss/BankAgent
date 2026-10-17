ALTER TABLE recurring_payment_action_intents
  DROP CONSTRAINT recurring_payment_action_intents_status_check;
ALTER TABLE recurring_payment_action_intents
  ADD CONSTRAINT recurring_payment_action_intents_status_check
  CHECK (status IN ('PREPARED','EXECUTED','CANCELLED','EXPIRED'));

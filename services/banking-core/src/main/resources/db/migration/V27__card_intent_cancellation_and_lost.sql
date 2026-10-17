ALTER TABLE card_action_intents DROP CONSTRAINT card_action_intents_status_check;
ALTER TABLE card_action_intents ADD CONSTRAINT card_action_intents_status_check
  CHECK (status IN ('PREPARED', 'EXECUTED', 'CANCELLED', 'EXPIRED'));

ALTER TABLE cards DROP CONSTRAINT cards_status_check;
ALTER TABLE cards ADD CONSTRAINT cards_status_check
  CHECK (status IN ('ACTIVE', 'FROZEN', 'REPORTED_LOST', 'EXPIRED', 'CANCELLED'));

ALTER TABLE card_action_intents DROP CONSTRAINT card_action_intents_action_type_check;
ALTER TABLE card_action_intents ADD CONSTRAINT card_action_intents_action_type_check
  CHECK (action_type IN ('FREEZE', 'UNFREEZE', 'UPDATE_CONTROLS', 'REPORT_LOST'));

CREATE INDEX card_intent_owner_status_expiry
  ON card_action_intents(customer_id, status, expires_at);

ALTER TABLE application_intents ADD COLUMN status TEXT NOT NULL DEFAULT 'PREPARED';
UPDATE application_intents SET status = 'SUBMITTED' WHERE application_id IS NOT NULL;
ALTER TABLE application_intents ADD CONSTRAINT application_intents_status_check
  CHECK (status IN ('PREPARED', 'SUBMITTED', 'CANCELLED', 'EXPIRED'));
ALTER TABLE application_intents ADD CONSTRAINT application_intents_status_consistency
  CHECK ((status = 'SUBMITTED') = (application_id IS NOT NULL));
CREATE INDEX application_intent_owner_status_expiry
  ON application_intents(customer_id, status, expires_at);

ALTER TABLE scheduled_payment_intents
  ADD COLUMN status VARCHAR(16) NOT NULL DEFAULT 'PREPARED',
  ADD COLUMN cancelled_at TIMESTAMPTZ;

ALTER TABLE scheduled_payment_intents
  ADD CONSTRAINT schedule_intent_lifecycle CHECK (
    (status = 'PREPARED' AND cancelled_at IS NULL) OR
    (status = 'CANCELLED' AND cancelled_at IS NOT NULL AND result IS NULL)
  );

CREATE INDEX schedule_intents_active_owner
  ON scheduled_payment_intents(customer_id, intent_id)
  WHERE status = 'PREPARED' AND result IS NULL;

ALTER TABLE transfer_intents DROP CONSTRAINT transfer_intents_status_check;
ALTER TABLE transfer_intents ADD CONSTRAINT transfer_intents_status_check
  CHECK (status IN ('PREPARED', 'EXECUTED', 'EXPIRED', 'CANCELLED'));
ALTER TABLE transfer_intents ADD COLUMN cancellation_reason VARCHAR(40)
  CHECK (cancellation_reason IN ('USER_CANCELLED', 'TASK_REVISED', 'TASK_FAILED', 'MAX_STEPS_EXCEEDED', 'REPLACED_BY_NEW_INTENT'));

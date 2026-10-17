CREATE TABLE detected_recurring_patterns (
  pattern_id VARCHAR(128) PRIMARY KEY,
  customer_id VARCHAR(255) NOT NULL REFERENCES customers(customer_id),
  account_id VARCHAR(255) NOT NULL,
  merchant_normalized VARCHAR(160) NOT NULL,
  merchant_display VARCHAR(512) NOT NULL,
  currency VARCHAR(3) NOT NULL,
  cadence VARCHAR(16) NOT NULL CHECK (cadence IN ('MONTHLY','YEARLY')),
  estimated_amount NUMERIC(24,2) NOT NULL CHECK (estimated_amount > 0),
  estimated_next_at TIMESTAMPTZ NOT NULL,
  last_observed_at TIMESTAMPTZ NOT NULL,
  evidence_transaction_ids JSONB NOT NULL,
  evidence_hash VARCHAR(64) NOT NULL,
  status VARCHAR(16) NOT NULL CHECK (status IN ('ACTIVE','STALE')),
  version INTEGER NOT NULL DEFAULT 0 CHECK (version >= 0),
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  UNIQUE(customer_id,pattern_id),
  FOREIGN KEY(customer_id,account_id) REFERENCES accounts(customer_id,account_id)
);
CREATE INDEX detected_pattern_owner ON detected_recurring_patterns(customer_id,updated_at DESC,pattern_id);

ALTER TABLE renewal_reminders ALTER COLUMN recurring_payment_id DROP NOT NULL;
ALTER TABLE renewal_reminders ADD COLUMN pattern_id VARCHAR(128);
ALTER TABLE renewal_reminders ADD COLUMN target_type VARCHAR(24) NOT NULL DEFAULT 'BANK_MANDATE'
  CHECK (target_type IN ('BANK_MANDATE','DETECTED_PATTERN'));
UPDATE renewal_reminders r SET target_type='DETECTED_PATTERN'
  FROM recurring_payments p WHERE p.customer_id=r.customer_id
  AND p.recurring_payment_id=r.recurring_payment_id AND p.source='DETECTED_PATTERN';
ALTER TABLE renewal_reminders ADD CONSTRAINT reminder_exactly_one_target CHECK (
  (target_type='BANK_MANDATE' AND recurring_payment_id IS NOT NULL AND pattern_id IS NULL)
  OR (target_type='DETECTED_PATTERN' AND
      ((recurring_payment_id IS NOT NULL AND pattern_id IS NULL)
       OR (recurring_payment_id IS NULL AND pattern_id IS NOT NULL))));
ALTER TABLE renewal_reminders ADD CONSTRAINT reminder_pattern_owner_fk
  FOREIGN KEY(customer_id,pattern_id) REFERENCES detected_recurring_patterns(customer_id,pattern_id);
DROP INDEX renewal_reminder_active_unique;
CREATE UNIQUE INDEX renewal_reminder_record_active_unique
  ON renewal_reminders(customer_id,recurring_payment_id,due_at)
  WHERE status='ACTIVE' AND recurring_payment_id IS NOT NULL;
CREATE UNIQUE INDEX renewal_reminder_pattern_active_unique
  ON renewal_reminders(customer_id,pattern_id,due_at)
  WHERE status='ACTIVE' AND target_type='DETECTED_PATTERN';

ALTER TABLE renewal_reminder_action_intents ALTER COLUMN recurring_payment_id DROP NOT NULL;
ALTER TABLE renewal_reminder_action_intents ADD COLUMN pattern_id VARCHAR(128);
ALTER TABLE renewal_reminder_action_intents ADD COLUMN pattern_version INTEGER;
ALTER TABLE renewal_reminder_action_intents ADD COLUMN target_type VARCHAR(24) NOT NULL DEFAULT 'BANK_MANDATE'
  CHECK (target_type IN ('BANK_MANDATE','DETECTED_PATTERN'));
UPDATE renewal_reminder_action_intents i SET target_type='DETECTED_PATTERN'
  FROM recurring_payments p WHERE p.customer_id=i.customer_id
  AND p.recurring_payment_id=i.recurring_payment_id AND p.source='DETECTED_PATTERN';
ALTER TABLE renewal_reminder_action_intents ADD CONSTRAINT reminder_intent_exactly_one_target CHECK (
  (target_type='BANK_MANDATE' AND recurring_payment_id IS NOT NULL AND pattern_id IS NULL)
  OR (target_type='DETECTED_PATTERN' AND
      ((recurring_payment_id IS NOT NULL AND pattern_id IS NULL)
       OR (recurring_payment_id IS NULL AND pattern_id IS NOT NULL))));
ALTER TABLE renewal_reminder_action_intents ADD CONSTRAINT reminder_intent_pattern_owner_fk
  FOREIGN KEY(customer_id,pattern_id) REFERENCES detected_recurring_patterns(customer_id,pattern_id);

CREATE TABLE renewal_reminders (
  reminder_id VARCHAR(128) PRIMARY KEY,
  customer_id VARCHAR(255) NOT NULL REFERENCES customers(customer_id),
  recurring_payment_id VARCHAR(255) NOT NULL,
  due_at TIMESTAMPTZ NOT NULL,
  time_zone VARCHAR(64) NOT NULL,
  date_basis VARCHAR(32) NOT NULL CHECK (date_basis IN ('BANK_SCHEDULE','ESTIMATED_FROM_HISTORY')),
  status VARCHAR(16) NOT NULL CHECK (status IN ('ACTIVE','TRIGGERED','CANCELLED')),
  version INTEGER NOT NULL DEFAULT 0 CHECK (version >= 0),
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  triggered_at TIMESTAMPTZ,
  UNIQUE (customer_id, reminder_id),
  FOREIGN KEY (customer_id, recurring_payment_id)
    REFERENCES recurring_payments(customer_id, recurring_payment_id),
  CHECK ((status = 'TRIGGERED') = (triggered_at IS NOT NULL))
);
CREATE UNIQUE INDEX renewal_reminder_active_unique
  ON renewal_reminders(customer_id, recurring_payment_id, due_at) WHERE status = 'ACTIVE';
CREATE INDEX renewal_reminder_due
  ON renewal_reminders(due_at, reminder_id) WHERE status = 'ACTIVE';
CREATE INDEX renewal_reminder_owner
  ON renewal_reminders(customer_id, created_at DESC, reminder_id);

CREATE TABLE renewal_reminder_action_intents (
  intent_id VARCHAR(128) PRIMARY KEY,
  customer_id VARCHAR(255) NOT NULL REFERENCES customers(customer_id),
  recurring_payment_id VARCHAR(255) NOT NULL,
  reminder_id VARCHAR(128),
  action_type VARCHAR(16) NOT NULL CHECK (action_type IN ('CREATE','CHANGE','CANCEL')),
  status VARCHAR(16) NOT NULL CHECK (status IN ('PREPARED','EXECUTED','CANCELLED','EXPIRED')),
  intent_hash VARCHAR(64) NOT NULL,
  expected_version INTEGER,
  due_at TIMESTAMPTZ,
  time_zone VARCHAR(64),
  date_basis VARCHAR(32),
  created_at TIMESTAMPTZ NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  snapshot JSONB NOT NULL,
  UNIQUE (customer_id, intent_id),
  FOREIGN KEY (customer_id, recurring_payment_id)
    REFERENCES recurring_payments(customer_id, recurring_payment_id),
  FOREIGN KEY (customer_id, reminder_id)
    REFERENCES renewal_reminders(customer_id, reminder_id),
  CHECK ((action_type = 'CREATE' AND reminder_id IS NULL AND expected_version IS NULL AND due_at IS NOT NULL)
      OR (action_type = 'CHANGE' AND reminder_id IS NOT NULL AND expected_version IS NOT NULL AND due_at IS NOT NULL)
      OR (action_type = 'CANCEL' AND reminder_id IS NOT NULL AND expected_version IS NOT NULL)),
  CHECK (expires_at > created_at)
);
CREATE INDEX renewal_reminder_intent_owner
  ON renewal_reminder_action_intents(customer_id, created_at DESC);

CREATE TABLE renewal_reminder_actions (
  action_id VARCHAR(128) PRIMARY KEY,
  customer_id VARCHAR(255) NOT NULL REFERENCES customers(customer_id),
  intent_id VARCHAR(128) NOT NULL UNIQUE,
  reminder_id VARCHAR(128) NOT NULL,
  idempotency_key VARCHAR(128) NOT NULL,
  intent_hash VARCHAR(64) NOT NULL,
  executed_at TIMESTAMPTZ NOT NULL,
  UNIQUE(customer_id, idempotency_key),
  UNIQUE(customer_id, action_id),
  FOREIGN KEY(customer_id, intent_id)
    REFERENCES renewal_reminder_action_intents(customer_id, intent_id),
  FOREIGN KEY(customer_id, reminder_id)
    REFERENCES renewal_reminders(customer_id, reminder_id)
);

CREATE TABLE in_app_notifications (
  notification_id VARCHAR(128) PRIMARY KEY,
  customer_id VARCHAR(255) NOT NULL REFERENCES customers(customer_id),
  reminder_id VARCHAR(128) NOT NULL UNIQUE,
  title VARCHAR(255) NOT NULL,
  body VARCHAR(1024) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  read_at TIMESTAMPTZ,
  FOREIGN KEY(customer_id, reminder_id)
    REFERENCES renewal_reminders(customer_id, reminder_id)
);
CREATE INDEX in_app_notification_owner
  ON in_app_notifications(customer_id, created_at DESC, notification_id);

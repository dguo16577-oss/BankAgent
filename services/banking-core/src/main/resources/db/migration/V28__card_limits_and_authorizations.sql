ALTER TABLE cards
  ADD COLUMN per_transaction_limit NUMERIC(18,2) NOT NULL DEFAULT 2000.00,
  ADD COLUMN daily_limit NUMERIC(18,2) NOT NULL DEFAULT 5000.00,
  ADD COLUMN bank_max_per_transaction NUMERIC(18,2) NOT NULL DEFAULT 10000.00,
  ADD COLUMN bank_max_daily NUMERIC(18,2) NOT NULL DEFAULT 20000.00,
  ADD COLUMN credit_limit NUMERIC(18,2);

UPDATE cards SET credit_limit=20000.00 WHERE card_type='CREDIT';
ALTER TABLE cards ADD CONSTRAINT card_limits_valid CHECK (
  per_transaction_limit>0 AND daily_limit>0 AND bank_max_per_transaction>0
  AND bank_max_daily>0 AND per_transaction_limit<=daily_limit
  AND per_transaction_limit<=bank_max_per_transaction AND daily_limit<=bank_max_daily
  AND (credit_limit IS NULL OR credit_limit>0)
);

ALTER TABLE card_action_intents DROP CONSTRAINT card_action_intents_action_type_check;
ALTER TABLE card_action_intents ADD CONSTRAINT card_action_intents_action_type_check
  CHECK (action_type IN ('FREEZE','UNFREEZE','UPDATE_CONTROLS','REPORT_LOST','UPDATE_LIMITS'));

CREATE TABLE card_authorizations (
  authorization_id VARCHAR(255) PRIMARY KEY,
  customer_id VARCHAR(255) NOT NULL,
  card_id VARCHAR(255) NOT NULL,
  request_key VARCHAR(128) NOT NULL,
  request_hash CHAR(64) NOT NULL,
  amount NUMERIC(18,2) NOT NULL CHECK(amount>0),
  currency CHAR(3) NOT NULL CHECK(currency='CNY'),
  channel VARCHAR(32) NOT NULL CHECK(channel IN ('ONLINE','IN_PERSON','ATM','CONTACTLESS')),
  international BOOLEAN NOT NULL,
  status VARCHAR(16) NOT NULL CHECK(status IN ('APPROVED','DECLINED')),
  reason VARCHAR(48) NOT NULL,
  authorized_at TIMESTAMPTZ NOT NULL,
  FOREIGN KEY(customer_id,card_id) REFERENCES cards(customer_id,card_id),
  UNIQUE(customer_id,authorization_id),
  UNIQUE(customer_id,request_key)
);
CREATE INDEX card_authorization_daily_usage
  ON card_authorizations(customer_id,card_id,authorized_at)
  WHERE status='APPROVED';

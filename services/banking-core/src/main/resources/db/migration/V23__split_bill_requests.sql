CREATE TABLE split_bills (
  split_id VARCHAR(255) PRIMARY KEY,
  owner_customer_id VARCHAR(255) NOT NULL REFERENCES customers(customer_id),
  receiving_account_id VARCHAR(255) NOT NULL,
  total_amount NUMERIC(19,2) NOT NULL CHECK (total_amount > 0),
  payer_share NUMERIC(19,2) NOT NULL CHECK (payer_share >= 0),
  currency CHAR(3) NOT NULL CHECK (currency = 'CNY'),
  note VARCHAR(280) NOT NULL DEFAULT '',
  status VARCHAR(16) NOT NULL CHECK (status IN ('ACTIVE','CANCELLED','EXPIRED','SETTLED')),
  version INTEGER NOT NULL CHECK (version >= 0),
  created_at TIMESTAMPTZ NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  cancelled_at TIMESTAMPTZ,
  snapshot JSONB NOT NULL,
  FOREIGN KEY (owner_customer_id, receiving_account_id) REFERENCES accounts(customer_id, account_id),
  CHECK (expires_at > created_at),
  CHECK ((status = 'CANCELLED') = (cancelled_at IS NOT NULL))
);
CREATE INDEX split_bills_owner_created ON split_bills(owner_customer_id, created_at DESC);

CREATE TABLE split_participants (
  participant_id VARCHAR(255) PRIMARY KEY,
  split_id VARCHAR(255) NOT NULL REFERENCES split_bills(split_id),
  owner_customer_id VARCHAR(255) NOT NULL REFERENCES customers(customer_id),
  recipient_id VARCHAR(255) NOT NULL,
  target_customer_id VARCHAR(255) NOT NULL REFERENCES customers(customer_id),
  target_account_id VARCHAR(255) NOT NULL,
  amount_due NUMERIC(19,2) NOT NULL CHECK (amount_due > 0),
  status VARCHAR(16) NOT NULL CHECK (status IN ('PENDING','PAID','DECLINED','EXPIRED','CANCELLED')),
  FOREIGN KEY (owner_customer_id, recipient_id) REFERENCES recipients(customer_id, recipient_id),
  FOREIGN KEY (target_customer_id, target_account_id) REFERENCES accounts(customer_id, account_id),
  UNIQUE (split_id, recipient_id),
  UNIQUE (split_id, target_customer_id),
  CHECK (owner_customer_id <> target_customer_id)
);
CREATE INDEX split_participants_target ON split_participants(target_customer_id, split_id);

CREATE TABLE split_action_intents (
  intent_id VARCHAR(255) PRIMARY KEY,
  owner_customer_id VARCHAR(255) NOT NULL REFERENCES customers(customer_id),
  session_id VARCHAR(255) NOT NULL,
  action_type VARCHAR(8) NOT NULL CHECK (action_type IN ('CREATE','CANCEL')),
  split_id VARCHAR(255) NOT NULL,
  expected_version INTEGER NOT NULL,
  intent_hash CHAR(64) NOT NULL,
  status VARCHAR(16) NOT NULL CHECK (status IN ('PREPARED','CANCELLED','EXECUTED')),
  created_at TIMESTAMPTZ NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  terminal_at TIMESTAMPTZ,
  snapshot JSONB NOT NULL,
  result_split_id VARCHAR(255) REFERENCES split_bills(split_id),
  CHECK (expires_at > created_at),
  CHECK ((status = 'PREPARED') = (terminal_at IS NULL)),
  CHECK ((status = 'EXECUTED') = (result_split_id IS NOT NULL))
);
CREATE INDEX split_intents_owner_status ON split_action_intents(owner_customer_id, status, expires_at);

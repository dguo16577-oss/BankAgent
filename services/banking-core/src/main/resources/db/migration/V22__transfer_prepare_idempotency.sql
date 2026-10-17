CREATE TABLE transfer_prepare_idempotency (
  customer_id VARCHAR(255) NOT NULL REFERENCES customers(customer_id),
  session_id VARCHAR(255) NOT NULL,
  idempotency_key VARCHAR(128) NOT NULL,
  request_fingerprint CHAR(64) NOT NULL,
  intent_id VARCHAR(255) NOT NULL REFERENCES transfer_intents(intent_id),
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (customer_id, session_id, idempotency_key),
  UNIQUE (intent_id)
);

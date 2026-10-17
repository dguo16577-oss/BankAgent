CREATE TABLE credit_limit_intents (
  intent_id VARCHAR(255) PRIMARY KEY,
  customer_id VARCHAR(255) NOT NULL,
  session_id TEXT NOT NULL,
  card_id VARCHAR(255) NOT NULL,
  current_limit NUMERIC(18,2) NOT NULL CHECK(current_limit>0),
  requested_limit NUMERIC(18,2) NOT NULL CHECK(requested_limit>current_limit),
  intent_hash CHAR(64) NOT NULL,
  status VARCHAR(16) NOT NULL CHECK(status IN ('PREPARED','SUBMITTED','CANCELLED','EXPIRED')),
  created_at TIMESTAMPTZ NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL CHECK(expires_at=created_at+interval '15 minutes'),
  FOREIGN KEY(customer_id,card_id) REFERENCES cards(customer_id,card_id),
  FOREIGN KEY(session_id,customer_id) REFERENCES security_sessions(session_id,customer_id),
  UNIQUE(customer_id,intent_id)
);
CREATE INDEX credit_limit_intent_owner_status ON credit_limit_intents(customer_id,status,expires_at);

CREATE TABLE credit_limit_applications (
  application_id VARCHAR(255) PRIMARY KEY,
  customer_id VARCHAR(255) NOT NULL,
  card_id VARCHAR(255) NOT NULL,
  intent_id VARCHAR(255) NOT NULL UNIQUE,
  current_limit NUMERIC(18,2) NOT NULL,
  requested_limit NUMERIC(18,2) NOT NULL,
  status VARCHAR(20) NOT NULL CHECK(status IN ('SUBMITTED','UNDER_REVIEW','APPROVED','REJECTED')),
  submitted_at TIMESTAMPTZ NOT NULL,
  idempotency_key VARCHAR(128) NOT NULL,
  FOREIGN KEY(customer_id,card_id) REFERENCES cards(customer_id,card_id),
  FOREIGN KEY(customer_id,intent_id) REFERENCES credit_limit_intents(customer_id,intent_id),
  UNIQUE(customer_id,application_id),
  UNIQUE(customer_id,idempotency_key)
);
CREATE INDEX credit_limit_application_owner_time
  ON credit_limit_applications(customer_id,submitted_at DESC,application_id DESC);

ALTER TABLE accounts DROP CONSTRAINT accounts_currency_check;
ALTER TABLE accounts ADD CONSTRAINT accounts_currency_check
  CHECK (currency IN ('CNY','USD','JPY','EUR','GBP','HKD','AUD','SGD'));

CREATE UNIQUE INDEX accounts_one_active_currency
  ON accounts(customer_id, currency)
  WHERE account_type = 'MULTI_CURRENCY' AND status = 'ACTIVE';

CREATE TABLE time_deposits (
  deposit_id VARCHAR(255) PRIMARY KEY,
  customer_id VARCHAR(255) NOT NULL REFERENCES customers(customer_id),
  source_account_id VARCHAR(255) NOT NULL,
  deposit_account_id VARCHAR(255) NOT NULL,
  amount NUMERIC(24,2) NOT NULL CHECK (amount > 0),
  currency VARCHAR(3) NOT NULL CHECK (currency = 'CNY'),
  term_months INTEGER NOT NULL CHECK (term_months = 12),
  annual_rate NUMERIC(12,6) NOT NULL CHECK (annual_rate >= 0),
  opened_at TIMESTAMPTZ NOT NULL,
  matures_at TIMESTAMPTZ NOT NULL CHECK (matures_at > opened_at),
  status VARCHAR(24) NOT NULL CHECK (status IN ('ACTIVE','MATURED','CLOSED')),
  idempotency_key VARCHAR(128) NOT NULL,
  UNIQUE (customer_id, idempotency_key),
  UNIQUE (customer_id, deposit_account_id),
  FOREIGN KEY (customer_id, source_account_id) REFERENCES accounts(customer_id, account_id),
  FOREIGN KEY (customer_id, deposit_account_id) REFERENCES accounts(customer_id, account_id)
);
CREATE INDEX time_deposits_customer_opened ON time_deposits(customer_id, opened_at DESC);

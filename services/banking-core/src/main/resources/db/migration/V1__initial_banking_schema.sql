CREATE TABLE customers (
 customer_id VARCHAR(255) PRIMARY KEY,
 display_name VARCHAR(255) NOT NULL,
 created_at TIMESTAMPTZ NOT NULL,
 account_as_of TIMESTAMPTZ NOT NULL,
 transaction_revision BIGINT NOT NULL DEFAULT 0,
 seed_version INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE accounts (
 account_id VARCHAR(255) PRIMARY KEY,
 customer_id VARCHAR(255) NOT NULL REFERENCES customers(customer_id),
 display_name VARCHAR(255) NOT NULL,
 account_type VARCHAR(32) NOT NULL,
 status VARCHAR(32) NOT NULL,
 currency VARCHAR(3) NOT NULL CHECK (currency IN ('CNY','USD')),
 balance NUMERIC(24,2) NOT NULL CHECK (balance >= 0),
 pending_amount NUMERIC(24,2) NOT NULL CHECK (pending_amount >= 0 AND pending_amount <= balance),
 masked_identifier VARCHAR(32) NOT NULL,
 opened_at TIMESTAMPTZ,
 equivalent_amount NUMERIC(24,2),
 equivalent_currency VARCHAR(3),
 exchange_rate NUMERIC(24,10),
 conversion_as_of TIMESTAMPTZ,
 UNIQUE(customer_id,account_id)
);
CREATE TABLE recipients (
 recipient_id VARCHAR(255) PRIMARY KEY,
 customer_id VARCHAR(255) NOT NULL REFERENCES customers(customer_id),
 display_name VARCHAR(255) NOT NULL,
 bank_name VARCHAR(255) NOT NULL,
 masked_identifier VARCHAR(32) NOT NULL,
 currency VARCHAR(3) NOT NULL CHECK(currency IN ('CNY','USD')),
 UNIQUE(customer_id,recipient_id)
);
CREATE TABLE transactions (
 transaction_id VARCHAR(255) COLLATE "C" PRIMARY KEY,
 customer_id VARCHAR(255) NOT NULL REFERENCES customers(customer_id),
 account_id VARCHAR(255) NOT NULL,
 card_id VARCHAR(255),
 card_masked_number VARCHAR(32),
 title VARCHAR(512) NOT NULL,
 amount NUMERIC(24,2) NOT NULL CHECK(amount >= 0),
 currency VARCHAR(3) NOT NULL,
 direction VARCHAR(32) NOT NULL CHECK(direction IN ('CREDIT','DEBIT')),
 status VARCHAR(32) NOT NULL,
 type VARCHAR(32) NOT NULL,
 category VARCHAR(32) NOT NULL,
 occurred_at TIMESTAMPTZ NOT NULL,
 booked_at TIMESTAMPTZ,
 merchant_id VARCHAR(255),
 merchant_name VARCHAR(512),
 merchant_masked_number VARCHAR(32),
 merchant_location VARCHAR(512),
 counterparty_name VARCHAR(512),
 counterparty_masked_number VARCHAR(32),
 reference VARCHAR(512),
 title_search TEXT NOT NULL,
 merchant_search TEXT,
 counterparty_search TEXT,
 FOREIGN KEY(customer_id,account_id) REFERENCES accounts(customer_id,account_id),
 UNIQUE(customer_id,transaction_id),
 CHECK(merchant_name IS NULL OR counterparty_name IS NULL)
);
CREATE INDEX tx_customer_order ON transactions(customer_id,occurred_at DESC,transaction_id ASC);
CREATE INDEX tx_account_order ON transactions(customer_id,account_id,occurred_at DESC,transaction_id ASC);
CREATE INDEX tx_card_order ON transactions(customer_id,card_id,occurred_at DESC,transaction_id ASC) WHERE card_id IS NOT NULL;
CREATE TABLE transfer_intents (
 intent_id VARCHAR(255) PRIMARY KEY,
 customer_id VARCHAR(255) NOT NULL REFERENCES customers(customer_id),
 source_account_id VARCHAR(255) NOT NULL,
 recipient_id VARCHAR(255) NOT NULL,
 amount NUMERIC(24,2) NOT NULL CHECK(amount > 0),
 fee NUMERIC(24,2) NOT NULL CHECK(fee >= 0),
 total_debit NUMERIC(24,2) NOT NULL CHECK(total_debit=amount+fee),
 currency VARCHAR(3) NOT NULL CHECK(currency='CNY'),
 status VARCHAR(32) NOT NULL CHECK(status IN ('PREPARED','EXECUTED','EXPIRED')),
 intent_hash VARCHAR(64) NOT NULL,
 created_at TIMESTAMPTZ NOT NULL,
 expires_at TIMESTAMPTZ NOT NULL CHECK(expires_at>created_at),
 snapshot JSONB NOT NULL,
 FOREIGN KEY(customer_id,source_account_id) REFERENCES accounts(customer_id,account_id),
 FOREIGN KEY(customer_id,recipient_id) REFERENCES recipients(customer_id,recipient_id),
 UNIQUE(customer_id,intent_id)
);
CREATE TABLE transfers (
 transfer_id VARCHAR(255) PRIMARY KEY,
 customer_id VARCHAR(255) NOT NULL REFERENCES customers(customer_id),
 intent_id VARCHAR(255) NOT NULL UNIQUE,
 source_account_id VARCHAR(255) NOT NULL,
 recipient_id VARCHAR(255) NOT NULL,
 amount NUMERIC(24,2) NOT NULL CHECK(amount>0),
 fee NUMERIC(24,2) NOT NULL CHECK(fee>=0),
 total_debit NUMERIC(24,2) NOT NULL CHECK(total_debit=amount+fee),
 currency VARCHAR(3) NOT NULL CHECK(currency='CNY'),
 status VARCHAR(32) NOT NULL CHECK(status='COMPLETED'),
 transaction_id VARCHAR(255) NOT NULL UNIQUE,
 reference VARCHAR(512) NOT NULL,
 created_at TIMESTAMPTZ NOT NULL,
 completed_at TIMESTAMPTZ NOT NULL,
 snapshot JSONB NOT NULL,
 FOREIGN KEY(customer_id,intent_id) REFERENCES transfer_intents(customer_id,intent_id),
 FOREIGN KEY(customer_id,source_account_id) REFERENCES accounts(customer_id,account_id),
 FOREIGN KEY(customer_id,recipient_id) REFERENCES recipients(customer_id,recipient_id),
 FOREIGN KEY(customer_id,transaction_id) REFERENCES transactions(customer_id,transaction_id),
 UNIQUE(customer_id,transfer_id)
);
CREATE TABLE idempotency_records (
 customer_id VARCHAR(255) NOT NULL REFERENCES customers(customer_id),
 operation VARCHAR(64) NOT NULL,
 idempotency_key VARCHAR(128) NOT NULL,
 fingerprint VARCHAR(64) NOT NULL,
 status VARCHAR(32) NOT NULL CHECK(status='COMPLETED'),
 transfer_id VARCHAR(255) NOT NULL,
 created_at TIMESTAMPTZ NOT NULL,
 completed_at TIMESTAMPTZ NOT NULL,
 PRIMARY KEY(customer_id,operation,idempotency_key),
 FOREIGN KEY(customer_id,transfer_id) REFERENCES transfers(customer_id,transfer_id)
);

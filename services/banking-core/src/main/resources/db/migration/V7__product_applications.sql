-- Customer-owned intake only. No card issuance or lending ledger mutation.
CREATE TABLE product_applications (
 application_id TEXT PRIMARY KEY,
 customer_id VARCHAR(255) NOT NULL REFERENCES customers(customer_id),
 product_id TEXT NOT NULL REFERENCES public_catalog(id),
 product_title TEXT NOT NULL,
 product_type TEXT NOT NULL CHECK(product_type IN ('DEBIT_CARD','CREDIT_CARD','PERSONAL_LOAN')),
 account_id VARCHAR(255) NOT NULL,
 masked_account_number TEXT NOT NULL CHECK(masked_account_number ~ '^•••• [0-9]{4}$'),
 contact_email VARCHAR(254) NOT NULL,
 monthly_income NUMERIC(24,2), requested_amount NUMERIC(24,2),
 term_months INTEGER, purpose TEXT,
 consent BOOLEAN NOT NULL DEFAULT TRUE CHECK(consent),
 status TEXT NOT NULL DEFAULT 'SUBMITTED' CHECK(status='SUBMITTED'),
 submitted_at TIMESTAMPTZ NOT NULL,
 idempotency_key VARCHAR(128) NOT NULL,
 FOREIGN KEY(customer_id,account_id) REFERENCES accounts(customer_id,account_id),
 UNIQUE(customer_id,idempotency_key), UNIQUE(customer_id,product_id),
 CHECK ((product_type='DEBIT_CARD' AND monthly_income IS NULL) OR (product_type<>'DEBIT_CARD' AND monthly_income IS NOT NULL AND monthly_income BETWEEN 1 AND 10000000)),
 CHECK ((product_type='PERSONAL_LOAN' AND requested_amount IS NOT NULL AND requested_amount BETWEEN 1000 AND 200000 AND term_months IS NOT NULL AND term_months IN (6,12,24,36) AND purpose IS NOT NULL AND purpose IN ('EDUCATION','HOME_IMPROVEMENT','PERSONAL')) OR (product_type<>'PERSONAL_LOAN' AND requested_amount IS NULL AND term_months IS NULL AND purpose IS NULL))
);
CREATE INDEX product_applications_owner_time ON product_applications(customer_id,submitted_at DESC,application_id DESC);

CREATE TABLE investment_products (
 product_id VARCHAR(255) PRIMARY KEY,
 display_name VARCHAR(255) NOT NULL,
 type VARCHAR(32) NOT NULL CHECK(type IN ('MONEY_MARKET','BOND_FUND','BALANCED_FUND','EQUITY_FUND')),
 risk_level VARCHAR(2) NOT NULL CHECK(risk_level IN ('R1','R2','R3','R4','R5')),
 currency VARCHAR(3) NOT NULL CHECK(currency IN ('CNY','USD')),
 minimum_investment NUMERIC(24,2) NOT NULL CHECK(minimum_investment>0),
 fees NUMERIC(24,2) NOT NULL CHECK(fees>=0),
 status VARCHAR(16) NOT NULL CHECK(status IN ('AVAILABLE','UNAVAILABLE')),
 indicative_yield VARCHAR(64) NOT NULL, performance_summary TEXT NOT NULL,
 liquidity TEXT NOT NULL, description TEXT NOT NULL, disclaimer TEXT NOT NULL,
 business_version INTEGER NOT NULL CHECK(business_version>=0), display_order INTEGER NOT NULL
);
CREATE TABLE customer_risk_profiles (
 customer_id VARCHAR(255) PRIMARY KEY REFERENCES customers(customer_id),
 display_name VARCHAR(255) NOT NULL,
 risk_level VARCHAR(2) NOT NULL CHECK(risk_level IN ('R1','R2','R3','R4','R5')),
 business_version INTEGER NOT NULL CHECK(business_version>=0),
 assessed_at TIMESTAMPTZ NOT NULL, expires_at TIMESTAMPTZ NOT NULL CHECK(expires_at>assessed_at)
);
CREATE TABLE portfolio_positions (
 position_id VARCHAR(255) PRIMARY KEY,
 customer_id VARCHAR(255) NOT NULL REFERENCES customers(customer_id),
 product_id VARCHAR(255) REFERENCES investment_products(product_id),
 display_name VARCHAR(255) NOT NULL, type VARCHAR(32) NOT NULL CHECK(type IN ('MONEY_MARKET','BOND_FUND','BALANCED_FUND','EQUITY_FUND')),
 currency VARCHAR(3) NOT NULL CHECK(currency='CNY'),
 current_value NUMERIC(24,2) NOT NULL CHECK(current_value>=0), invested_amount NUMERIC(24,2) NOT NULL CHECK(invested_amount>=0),
 monthly_change NUMERIC(24,2) NOT NULL, monthly_net_contributions NUMERIC(24,2) NOT NULL CHECK(monthly_net_contributions>=0),
 business_version INTEGER NOT NULL CHECK(business_version>=0), updated_at TIMESTAMPTZ NOT NULL, display_order INTEGER NOT NULL,
 UNIQUE(customer_id,product_id), UNIQUE(customer_id,position_id)
);
CREATE TABLE suitability_checks (
 check_id VARCHAR(255) PRIMARY KEY,
 customer_id VARCHAR(255) NOT NULL REFERENCES customers(customer_id),
 product_id VARCHAR(255) NOT NULL REFERENCES investment_products(product_id),
 user_risk_level VARCHAR(2) NOT NULL CHECK(user_risk_level IN ('R1','R2','R3','R4','R5')),
 product_risk_level VARCHAR(2) NOT NULL CHECK(product_risk_level IN ('R1','R2','R3','R4','R5')),
 product_version INTEGER NOT NULL CHECK(product_version>=0), risk_profile_version INTEGER NOT NULL CHECK(risk_profile_version>=0),
 result VARCHAR(16) NOT NULL CHECK(result IN ('SUITABLE','NOT_SUITABLE')),
 reasons JSONB NOT NULL CHECK(jsonb_typeof(reasons)='array' AND jsonb_array_length(reasons)>0),
 created_at TIMESTAMPTZ NOT NULL, expires_at TIMESTAMPTZ NOT NULL CHECK(expires_at=created_at+interval '30 minutes'),
 UNIQUE(customer_id,check_id), UNIQUE(customer_id,check_id,product_id)
);
CREATE INDEX suitability_owner_product ON suitability_checks(customer_id,product_id);
CREATE TABLE investment_order_intents (
 intent_id VARCHAR(255) PRIMARY KEY, customer_id VARCHAR(255) NOT NULL,
 product_id VARCHAR(255) NOT NULL REFERENCES investment_products(product_id),
 source_account_id VARCHAR(255) NOT NULL, check_id VARCHAR(255) NOT NULL,
 amount NUMERIC(24,2) NOT NULL CHECK(amount>0), fees NUMERIC(24,2) NOT NULL CHECK(fees>=0),
 total_debit NUMERIC(24,2) NOT NULL CHECK(total_debit=amount+fees),
 currency VARCHAR(3) NOT NULL CHECK(currency='CNY'),
 status VARCHAR(16) NOT NULL CHECK(status IN ('PREPARED','EXECUTED','EXPIRED')),
 intent_hash VARCHAR(64) NOT NULL CHECK(intent_hash ~ '^[a-f0-9]{64}$'),
 created_at TIMESTAMPTZ NOT NULL, expires_at TIMESTAMPTZ NOT NULL CHECK(expires_at=created_at+interval '15 minutes'),
 snapshot JSONB NOT NULL,
 UNIQUE(customer_id,intent_id),
 FOREIGN KEY(customer_id,source_account_id) REFERENCES accounts(customer_id,account_id),
 FOREIGN KEY(customer_id,check_id,product_id) REFERENCES suitability_checks(customer_id,check_id,product_id)
);
CREATE INDEX investment_intent_owner_product ON investment_order_intents(customer_id,product_id);
CREATE TABLE investment_orders (
 order_id VARCHAR(255) PRIMARY KEY, customer_id VARCHAR(255) NOT NULL,
 intent_id VARCHAR(255) NOT NULL UNIQUE, source_account_id VARCHAR(255) NOT NULL,
 transaction_id VARCHAR(255) NOT NULL UNIQUE, position_id VARCHAR(255) NOT NULL,
 completed_at TIMESTAMPTZ NOT NULL, reference VARCHAR(512) NOT NULL, snapshot JSONB NOT NULL,
 UNIQUE(customer_id,order_id),
 FOREIGN KEY(customer_id,intent_id) REFERENCES investment_order_intents(customer_id,intent_id),
 FOREIGN KEY(customer_id,source_account_id,transaction_id) REFERENCES transactions(customer_id,account_id,transaction_id),
 FOREIGN KEY(customer_id,position_id) REFERENCES portfolio_positions(customer_id,position_id)
);
CREATE INDEX investment_order_owner_time ON investment_orders(customer_id,completed_at);
ALTER TABLE idempotency_records ADD COLUMN investment_order_id VARCHAR(255);
ALTER TABLE idempotency_records ADD CONSTRAINT idempotency_investment_order_fk FOREIGN KEY(customer_id,investment_order_id) REFERENCES investment_orders(customer_id,order_id);
ALTER TABLE idempotency_records DROP CONSTRAINT idempotency_operation_receipt;
ALTER TABLE idempotency_records ADD CONSTRAINT idempotency_operation_receipt CHECK(
 (operation='EXECUTE_TRANSFER' AND transfer_id IS NOT NULL AND card_action_id IS NULL AND recurring_action_id IS NULL AND investment_order_id IS NULL) OR
 (operation='EXECUTE_CARD_ACTION' AND transfer_id IS NULL AND card_action_id IS NOT NULL AND recurring_action_id IS NULL AND investment_order_id IS NULL) OR
 (operation='EXECUTE_RECURRING_PAYMENT_ACTION' AND transfer_id IS NULL AND card_action_id IS NULL AND recurring_action_id IS NOT NULL AND investment_order_id IS NULL) OR
 (operation='EXECUTE_INVESTMENT_ORDER' AND transfer_id IS NULL AND card_action_id IS NULL AND recurring_action_id IS NULL AND investment_order_id IS NOT NULL)
);


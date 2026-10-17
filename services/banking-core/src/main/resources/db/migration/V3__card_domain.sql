CREATE TABLE cards (
 card_id VARCHAR(255) PRIMARY KEY,
 customer_id VARCHAR(255) NOT NULL REFERENCES customers(customer_id),
 display_name VARCHAR(255) NOT NULL,
 masked_number VARCHAR(6) NOT NULL CHECK(masked_number ~ '^••[0-9]{4}$'),
 scheme VARCHAR(32) NOT NULL CHECK(scheme IN ('VISA','MASTERCARD')),
 card_type VARCHAR(32) NOT NULL CHECK(card_type IN ('DEBIT','CREDIT','VIRTUAL')),
 status VARCHAR(32) NOT NULL CHECK(status IN ('ACTIVE','FROZEN','EXPIRED','CANCELLED')),
 linked_account_id VARCHAR(255) NOT NULL,
 linked_account_name VARCHAR(255) NOT NULL,
 linked_account_masked_number VARCHAR(32) NOT NULL,
 online_payments BOOLEAN NOT NULL, international_payments BOOLEAN NOT NULL,
 atm_withdrawals BOOLEAN NOT NULL, contactless BOOLEAN NOT NULL,
 business_version INTEGER NOT NULL CHECK(business_version>=0),
 row_version BIGINT NOT NULL DEFAULT 0 CHECK(row_version>=0),
 display_order INTEGER NOT NULL DEFAULT 0,
 updated_at TIMESTAMPTZ NOT NULL,
 FOREIGN KEY(customer_id,linked_account_id) REFERENCES accounts(customer_id,account_id),
 UNIQUE(customer_id,card_id)
);
CREATE INDEX card_customer_order ON cards(customer_id,display_order,card_id);
CREATE TABLE card_action_intents (
 intent_id VARCHAR(255) PRIMARY KEY,
 customer_id VARCHAR(255) NOT NULL,
 card_id VARCHAR(255) NOT NULL,
 action_type VARCHAR(32) NOT NULL CHECK(action_type IN ('FREEZE','UNFREEZE','UPDATE_CONTROLS')),
 status VARCHAR(32) NOT NULL CHECK(status IN ('PREPARED','EXECUTED','EXPIRED')),
 intent_hash VARCHAR(64) NOT NULL,
 risk_direction VARCHAR(32) NOT NULL CHECK(risk_direction IN ('PROTECTIVE','RISK_INCREASING')),
 authorization_requirement VARCHAR(32) NOT NULL CHECK(authorization_requirement IN ('CONFIRMATION','STEP_UP_AUTH')),
 before_version INTEGER NOT NULL CHECK(before_version>=0),
 after_version INTEGER NOT NULL CHECK(after_version=before_version+1),
 created_at TIMESTAMPTZ NOT NULL,
 expires_at TIMESTAMPTZ NOT NULL CHECK(expires_at=created_at+interval '15 minutes'),
 snapshot JSONB NOT NULL,
 FOREIGN KEY(customer_id,card_id) REFERENCES cards(customer_id,card_id),
 UNIQUE(customer_id,intent_id),
 CHECK((risk_direction='PROTECTIVE')=(authorization_requirement='CONFIRMATION'))
);
CREATE INDEX card_intent_owner_card ON card_action_intents(customer_id,card_id);
CREATE TABLE card_actions (
 action_id VARCHAR(255) PRIMARY KEY,
 customer_id VARCHAR(255) NOT NULL,
 card_id VARCHAR(255) NOT NULL,
 intent_id VARCHAR(255) NOT NULL UNIQUE,
 status VARCHAR(32) NOT NULL CHECK(status='COMPLETED'),
 reference VARCHAR(512) NOT NULL,
 completed_at TIMESTAMPTZ NOT NULL,
 snapshot JSONB NOT NULL,
 FOREIGN KEY(customer_id,card_id) REFERENCES cards(customer_id,card_id),
 FOREIGN KEY(customer_id,intent_id) REFERENCES card_action_intents(customer_id,intent_id),
 UNIQUE(customer_id,action_id)
);
CREATE INDEX card_action_owner_card ON card_actions(customer_id,card_id);
-- Extend the existing durable idempotency system; old Transfer records remain valid.
ALTER TABLE idempotency_records ALTER COLUMN transfer_id DROP NOT NULL;
ALTER TABLE idempotency_records ADD COLUMN card_action_id VARCHAR(255);
ALTER TABLE idempotency_records ADD CONSTRAINT idempotency_card_receipt_fk
 FOREIGN KEY(customer_id,card_action_id) REFERENCES card_actions(customer_id,action_id);
ALTER TABLE idempotency_records ADD CONSTRAINT idempotency_operation_receipt CHECK(
 (operation='EXECUTE_TRANSFER' AND transfer_id IS NOT NULL AND card_action_id IS NULL) OR
 (operation='EXECUTE_CARD_ACTION' AND card_action_id IS NOT NULL AND transfer_id IS NULL)
);

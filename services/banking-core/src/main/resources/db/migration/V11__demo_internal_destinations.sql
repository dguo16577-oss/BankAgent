-- Populated only by local/demo/test seed code. Production starts with no internal demo routes.
CREATE TABLE demo_internal_destinations (
 destination_ref VARCHAR(255) PRIMARY KEY,
 target_customer_id VARCHAR(255) NOT NULL,
 target_account_id VARCHAR(255) NOT NULL,
 FOREIGN KEY(target_customer_id,target_account_id) REFERENCES accounts(customer_id,account_id)
);

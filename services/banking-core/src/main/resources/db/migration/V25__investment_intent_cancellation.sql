ALTER TABLE investment_order_intents DROP CONSTRAINT investment_order_intents_status_check;
ALTER TABLE investment_order_intents ADD CONSTRAINT investment_order_intents_status_check
 CHECK (status IN ('PREPARED','EXECUTED','EXPIRED','CANCELLED'));

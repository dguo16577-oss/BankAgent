-- Saved-recipient identity is separate from customer authentication phone bindings.
-- Legacy recipients remain without a phone until a verified source supplies one.
ALTER TABLE recipients ADD COLUMN phone_e164 VARCHAR(16);
ALTER TABLE recipients ADD CONSTRAINT recipients_phone_e164_format
 CHECK (phone_e164 IS NULL OR phone_e164 ~ '^\+861[3-9][0-9]{9}$');
CREATE INDEX recipients_owner_phone ON recipients(customer_id, phone_e164)
 WHERE phone_e164 IS NOT NULL;

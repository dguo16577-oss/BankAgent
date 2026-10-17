-- B4 replaces the fixed demo code. Old active grants cannot satisfy the new policy.
UPDATE step_up_challenges SET status='CANCELLED' WHERE status='PENDING';
UPDATE action_authorizations SET status='REVOKED' WHERE status='ACTIVE';
CREATE TABLE customer_phone_bindings (
 binding_id TEXT PRIMARY KEY,
 customer_id TEXT NOT NULL UNIQUE REFERENCES customers(customer_id),
 phone_e164 TEXT NOT NULL CHECK(phone_e164 ~ '^\+[1-9][0-9]{7,14}$'),
 status TEXT NOT NULL CHECK(status='VERIFIED'),
 verified_at TIMESTAMPTZ NOT NULL, created_at TIMESTAMPTZ NOT NULL
);
ALTER TABLE step_up_challenges ADD COLUMN action_type TEXT NOT NULL DEFAULT 'LEGACY';
ALTER TABLE step_up_challenges ADD COLUMN verification_requirement TEXT NOT NULL DEFAULT 'NONE'
 CHECK(verification_requirement IN ('NONE','PASSWORD','SMS_OTP','PASSWORD_AND_SMS_OTP'));
ALTER TABLE step_up_challenges ADD COLUMN otp_hash TEXT;
ALTER TABLE step_up_challenges ADD COLUMN masked_phone TEXT;
ALTER TABLE step_up_challenges ADD CONSTRAINT challenge_factor_hash CHECK(
 (verification_requirement IN ('SMS_OTP','PASSWORD_AND_SMS_OTP') AND otp_hash IS NOT NULL AND otp_hash ~ '^\$2[aby]\$' AND masked_phone IS NOT NULL)
 OR (verification_requirement IN ('PASSWORD','NONE') AND otp_hash IS NULL));
ALTER TABLE step_up_challenges DROP CONSTRAINT step_up_challenges_resource_type_check;
ALTER TABLE step_up_challenges ADD CONSTRAINT step_up_challenges_resource_type_check CHECK(resource_type IN
 ('CARD_ACTION_INTENT','TRANSFER_INTENT','SCHEDULE_ACTION_INTENT','RECIPIENT_ACTION_INTENT','INVESTMENT_ORDER_INTENT','RECURRING_PAYMENT_INTENT','APPLICATION_INTENT'));
CREATE TABLE demo_sms_outbox (
 message_id TEXT PRIMARY KEY, customer_id TEXT NOT NULL REFERENCES customers(customer_id),
 phone_e164 TEXT NOT NULL, challenge_id TEXT NOT NULL UNIQUE REFERENCES step_up_challenges(challenge_id),
 message_type TEXT NOT NULL DEFAULT 'ACTION_VERIFICATION' CHECK(message_type='ACTION_VERIFICATION'),
 message_body TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX demo_sms_customer_created ON demo_sms_outbox(customer_id,created_at);
ALTER TABLE security_events DROP CONSTRAINT security_events_type_check;
ALTER TABLE security_events ADD CONSTRAINT security_events_type_check CHECK(type IN
 ('LOGIN_SUCCESS','LOGIN_FAILURE','LOGOUT','STEP_UP_CREATED','STEP_UP_FAILED','STEP_UP_VERIFIED','OTP_ISSUED','AUTHORIZATION_ISSUED','AUTHORIZATION_CONSUMED'));
CREATE TABLE application_intents (
 intent_id TEXT PRIMARY KEY, customer_id TEXT NOT NULL REFERENCES customers(customer_id),
 session_id TEXT NOT NULL, intent_hash TEXT NOT NULL, action_type TEXT NOT NULL CHECK(action_type IN ('CARD_APPLICATION_SUBMIT','LOAN_APPLICATION_SUBMIT')),
 request_json JSONB NOT NULL, created_at TIMESTAMPTZ NOT NULL, expires_at TIMESTAMPTZ NOT NULL,
 FOREIGN KEY(session_id,customer_id) REFERENCES security_sessions(session_id,customer_id),
 CHECK(expires_at>created_at)
);
CREATE INDEX application_intent_owner ON application_intents(customer_id,intent_id);
ALTER TABLE application_intents ADD COLUMN application_id TEXT UNIQUE REFERENCES product_applications(application_id);
ALTER TABLE application_intents ADD COLUMN authorization_id TEXT REFERENCES action_authorizations(authorization_id);
ALTER TABLE application_intents ADD CONSTRAINT application_intent_completion CHECK((application_id IS NULL)=(authorization_id IS NULL));

ALTER TABLE step_up_challenges ADD CONSTRAINT challenge_customer_unique UNIQUE(challenge_id,customer_id);
ALTER TABLE demo_sms_outbox ADD CONSTRAINT sms_challenge_owner FOREIGN KEY(challenge_id,customer_id) REFERENCES step_up_challenges(challenge_id,customer_id);

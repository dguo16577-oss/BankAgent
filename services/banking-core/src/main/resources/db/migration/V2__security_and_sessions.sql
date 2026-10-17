-- Spring Session JDBC PostgreSQL schema. Flyway is the sole schema owner.
CREATE TABLE spring_session (
 primary_id CHAR(36) PRIMARY KEY, session_id CHAR(36) NOT NULL UNIQUE,
 creation_time BIGINT NOT NULL, last_access_time BIGINT NOT NULL,
 max_inactive_interval INT NOT NULL, expiry_time BIGINT NOT NULL, principal_name VARCHAR(100)
);
CREATE INDEX spring_session_expiry ON spring_session(expiry_time);
CREATE INDEX spring_session_principal ON spring_session(principal_name);
CREATE TABLE spring_session_attributes (
 session_primary_id CHAR(36) NOT NULL REFERENCES spring_session(primary_id) ON DELETE CASCADE,
 attribute_name VARCHAR(200) NOT NULL, attribute_bytes BYTEA NOT NULL,
 PRIMARY KEY(session_primary_id,attribute_name)
);
CREATE TABLE customer_credentials (
 customer_id TEXT PRIMARY KEY REFERENCES customers(customer_id),
 email TEXT NOT NULL UNIQUE CHECK(email=lower(email)),
 password_hash TEXT NOT NULL CHECK(password_hash ~ '^\$2[aby]\$'),
 enabled BOOLEAN NOT NULL DEFAULT true
);
-- Retained lifecycle metadata, independent of Spring Session's expired-row cleanup.
CREATE TABLE security_sessions (
 session_id TEXT PRIMARY KEY, customer_id TEXT NOT NULL REFERENCES customers(customer_id),
 authenticated_at TIMESTAMPTZ NOT NULL, expires_at TIMESTAMPTZ NOT NULL,
 status TEXT NOT NULL CHECK(status IN ('ACTIVE','EXPIRED','REVOKED')),
 UNIQUE(session_id,customer_id), CHECK(expires_at>authenticated_at)
);
CREATE INDEX security_session_customer ON security_sessions(customer_id,status);
CREATE TABLE step_up_challenges (
 challenge_id TEXT PRIMARY KEY, customer_id TEXT NOT NULL, session_id TEXT NOT NULL,
 resource_type TEXT NOT NULL CHECK(resource_type='CARD_ACTION_INTENT'),
 resource_id TEXT NOT NULL CHECK(length(resource_id) BETWEEN 1 AND 200),
 resource_hash TEXT NOT NULL CHECK(length(resource_hash) BETWEEN 1 AND 256),
 status TEXT NOT NULL CHECK(status IN ('PENDING','VERIFIED','FAILED','EXPIRED','CANCELLED')),
 created_at TIMESTAMPTZ NOT NULL, expires_at TIMESTAMPTZ NOT NULL,
 attempts_remaining INT NOT NULL CHECK(attempts_remaining BETWEEN 0 AND 3),
 FOREIGN KEY(session_id,customer_id) REFERENCES security_sessions(session_id,customer_id),
 UNIQUE(challenge_id,customer_id,session_id,resource_type,resource_id,resource_hash),
 CHECK(expires_at>created_at AND expires_at<=created_at+interval '5 minutes'),
 CHECK((status='FAILED')=(attempts_remaining=0))
);
CREATE INDEX challenge_session_status ON step_up_challenges(session_id,status,expires_at);
CREATE TABLE action_authorizations (
 authorization_id TEXT PRIMARY KEY, challenge_id TEXT NOT NULL UNIQUE,
 customer_id TEXT NOT NULL, session_id TEXT NOT NULL,
 resource_type TEXT NOT NULL, resource_id TEXT NOT NULL, resource_hash TEXT NOT NULL,
 assurance_level TEXT NOT NULL CHECK(assurance_level='AAL2'),
 status TEXT NOT NULL CHECK(status IN ('ACTIVE','CONSUMED','EXPIRED','REVOKED')),
 issued_at TIMESTAMPTZ NOT NULL, expires_at TIMESTAMPTZ NOT NULL, consumed_at TIMESTAMPTZ,
 FOREIGN KEY(challenge_id,customer_id,session_id,resource_type,resource_id,resource_hash)
 REFERENCES step_up_challenges(challenge_id,customer_id,session_id,resource_type,resource_id,resource_hash),
 CHECK(expires_at>issued_at AND expires_at<=issued_at+interval '2 minutes'),
 CHECK((status='CONSUMED')=(consumed_at IS NOT NULL))
);
CREATE UNIQUE INDEX authorization_active_resource ON action_authorizations(session_id,resource_type,resource_id,resource_hash) WHERE status='ACTIVE';
CREATE TABLE security_events (
 event_id TEXT PRIMARY KEY, customer_id TEXT REFERENCES customers(customer_id),
 session_id TEXT, type TEXT NOT NULL CHECK(type IN
 ('LOGIN_SUCCESS','LOGIN_FAILURE','LOGOUT','STEP_UP_CREATED','STEP_UP_FAILED','STEP_UP_VERIFIED','AUTHORIZATION_ISSUED','AUTHORIZATION_CONSUMED')),
 resource_id TEXT, occurred_at TIMESTAMPTZ NOT NULL, correlation_id TEXT, outcome TEXT NOT NULL
);
CREATE INDEX security_event_customer_time ON security_events(customer_id,occurred_at);

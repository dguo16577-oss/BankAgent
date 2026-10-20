CREATE SCHEMA IF NOT EXISTS agent_state;

CREATE TABLE IF NOT EXISTS agent_state.tasks (
    task_id text PRIMARY KEY,
    customer_id text NOT NULL,
    session_binding char(64) NOT NULL,
    state_version bigint NOT NULL CHECK (state_version > 0),
    checkpoint jsonb NOT NULL,
    lease_owner text,
    lease_until timestamptz,
    updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS agent_tasks_owner_idx
    ON agent_state.tasks (customer_id, session_binding, updated_at DESC);

CREATE TABLE IF NOT EXISTS agent_state.chat_requests (
    customer_id text NOT NULL,
    session_binding char(64) NOT NULL,
    request_id text NOT NULL,
    fingerprint char(64) NOT NULL,
    task_id text NOT NULL REFERENCES agent_state.tasks(task_id),
    PRIMARY KEY (customer_id, session_binding, request_id)
);

CREATE TABLE IF NOT EXISTS agent_state.threads (
    customer_id text NOT NULL,
    session_binding char(64) NOT NULL,
    thread_id text NOT NULL,
    task_id text NOT NULL REFERENCES agent_state.tasks(task_id),
    PRIMARY KEY (customer_id, session_binding, thread_id)
);

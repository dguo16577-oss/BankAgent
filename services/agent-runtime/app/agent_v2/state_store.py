"""PostgreSQL checkpoints. Schema installation is an explicit deployment step."""

from __future__ import annotations

import hashlib
import json
import os
import re
from contextlib import contextmanager
from datetime import datetime, timedelta, timezone
from typing import Iterator

import psycopg
from psycopg.types.json import Jsonb

from .models import Task


class TaskStateConflict(RuntimeError):
    pass


_SECRET_KEYS = {"password", "passcode", "otp", "pin", "cvv", "cookie", "authorization",
                "api_key", "apikey", "session", "secret", "access_token"}


def _safe_checkpoint(value: object) -> object:
    if isinstance(value, dict):
        return {key: _safe_checkpoint(item) for key, item in value.items()
                if key.casefold().replace("-", "_") not in _SECRET_KEYS}
    if isinstance(value, list):
        return [_safe_checkpoint(item) for item in value]
    if isinstance(value, str):
        value = re.sub(r"(?i)sk-[A-Za-z0-9]{12,}|Bearer\s+[A-Za-z0-9._~-]{8,}",
                       "[REDACTED_SECRET]", value)
        return re.sub(r"(?<![A-Za-z0-9])\d{12,19}(?![A-Za-z0-9])", "[MASKED_ACCOUNT_NUMBER]", value)
    return value


class PostgresTaskStore:
    def __init__(self, dsn: str | None = None):
        self.dsn = dsn or os.getenv("AGENT_STATE_DATABASE_URL", "")

    @contextmanager
    def _connection(self) -> Iterator[psycopg.Connection]:
        with psycopg.connect(self.dsn, connect_timeout=5) as connection:
            yield connection

    def verify_schema(self) -> None:
        with self._connection() as connection:
            row = connection.execute("SELECT to_regclass('agent_state.tasks')").fetchone()
        if row is None or row[0] is None:
            raise RuntimeError("AGENT_STATE_SCHEMA_MISSING: apply sql/001_agent_state.sql before startup")

    def load(self, task_id: str, customer_id: str, binding: str) -> Task | None:
        with self._connection() as connection:
            row = connection.execute(
                "SELECT checkpoint, state_version FROM agent_state.tasks WHERE task_id=%s AND customer_id=%s AND session_binding=%s",
                (task_id, customer_id, binding)).fetchone()
        if row is None:
            return None
        task = Task.model_validate_json(json.dumps(row[0]))
        task.state_version = row[1]
        return task

    def history_list(self, customer_id: str) -> list[Task]:
        with self._connection() as connection:
            rows = connection.execute(
                "SELECT checkpoint FROM agent_state.tasks WHERE customer_id=%s "
                "ORDER BY updated_at DESC,task_id DESC LIMIT 10", (customer_id,)).fetchall()
        return [Task.model_validate_json(json.dumps(row[0])) for row in rows]

    def history_load(self, task_id: str, customer_id: str) -> Task | None:
        with self._connection() as connection:
            row = connection.execute(
                "SELECT checkpoint FROM agent_state.tasks WHERE task_id=%s AND customer_id=%s",
                (task_id, customer_id)).fetchone()
        return Task.model_validate_json(json.dumps(row[0])) if row else None

    def save(self, task: Task, owner: str | None = None) -> None:
        checkpoint = _safe_checkpoint(task.model_dump(mode="json"))
        with self._connection() as connection:
            if task.state_version == 0:
                row = connection.execute(
                    "INSERT INTO agent_state.tasks(task_id,customer_id,session_binding,state_version,checkpoint,lease_owner,lease_until) "
                    "VALUES (%s,%s,%s,1,%s,%s,CASE WHEN %s::text IS NULL THEN NULL ELSE now()+interval '5 minutes' END) "
                    "ON CONFLICT DO NOTHING RETURNING state_version",
                    (task.task_id, task.customer_id, task.session_binding, Jsonb(checkpoint), owner, owner)).fetchone()
            else:
                row = connection.execute(
                    "UPDATE agent_state.tasks SET checkpoint=%s,state_version=state_version+1,updated_at=now(), "
                    "lease_until=CASE WHEN %s::text IS NULL THEN lease_until ELSE now()+interval '5 minutes' END "
                    "WHERE task_id=%s AND customer_id=%s AND session_binding=%s AND state_version=%s "
                    "AND (%s::text IS NULL OR (lease_owner=%s AND lease_until>now())) RETURNING state_version",
                    (Jsonb(checkpoint), owner, task.task_id, task.customer_id, task.session_binding,
                     task.state_version, owner, owner)).fetchone()
        if row is None:
            raise TaskStateConflict("TASK_STATE_CONFLICT")
        task.state_version = row[0]

    def acquire(self, task_id: str, owner: str) -> None:
        with self._connection() as connection:
            row = connection.execute(
                "UPDATE agent_state.tasks SET lease_owner=%s,lease_until=now()+interval '5 minutes' "
                "WHERE task_id=%s AND (lease_owner IS NULL OR lease_owner=%s OR lease_until<now()) RETURNING task_id",
                (owner, task_id, owner)).fetchone()
        if row is None:
            raise TaskStateConflict("TASK_LEASE_HELD")

    def release(self, task_id: str, owner: str) -> None:
        with self._connection() as connection:
            connection.execute("UPDATE agent_state.tasks SET lease_owner=NULL,lease_until=NULL "
                               "WHERE task_id=%s AND lease_owner=%s", (task_id, owner))

    def request_lookup(self, customer: str, binding: str, request_id: str) -> tuple[str, str] | None:
        with self._connection() as connection:
            row = connection.execute("SELECT fingerprint,task_id FROM agent_state.chat_requests "
                                     "WHERE customer_id=%s AND session_binding=%s AND request_id=%s",
                                     (customer, binding, request_id)).fetchone()
        return row

    def request_bind(self, customer: str, binding: str, request_id: str, message: str,
                     prior_task_id: str | None, task_id: str) -> None:
        fingerprint = hashlib.sha256(json.dumps([message.strip(), prior_task_id], ensure_ascii=False).encode()).hexdigest()
        with self._connection() as connection:
            row = connection.execute("INSERT INTO agent_state.chat_requests VALUES (%s,%s,%s,%s,%s) "
                                     "ON CONFLICT DO NOTHING RETURNING task_id",
                                     (customer, binding, request_id, fingerprint, task_id)).fetchone()
        if row is None:
            existing = self.request_lookup(customer, binding, request_id)
            if existing != (fingerprint, task_id):
                raise TaskStateConflict("AGENT_REQUEST_ID_CONFLICT")

    def thread_lookup(self, customer: str, binding: str, thread_id: str) -> str | None:
        with self._connection() as connection:
            row = connection.execute("SELECT task_id FROM agent_state.threads "
                                     "WHERE customer_id=%s AND session_binding=%s AND thread_id=%s",
                                     (customer, binding, thread_id)).fetchone()
        return row[0] if row else None

    def thread_bind(self, customer: str, binding: str, thread_id: str, task_id: str) -> None:
        with self._connection() as connection:
            connection.execute("INSERT INTO agent_state.threads VALUES (%s,%s,%s,%s) "
                               "ON CONFLICT(customer_id,session_binding,thread_id) DO UPDATE SET task_id=EXCLUDED.task_id",
                               (customer, binding, thread_id, task_id))

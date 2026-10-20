"""Runs against an isolated PostgreSQL with agent_state/001 applied."""

from __future__ import annotations

import os
import asyncio
import pathlib
import sys
import unittest
from uuid import uuid4

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))

from app.agent_v2.models import Task
from app.agent_v2.runtime import AgentRuntimeV2
from app.agent_v2.state_store import PostgresTaskStore, TaskStateConflict, _safe_checkpoint
from app.banking import BankingApiError
from app.task_models import ConfirmRequest
from test_agent_v2 import CancellableBank, SequencePlanner


@unittest.skipUnless(os.getenv("R1_TEST_DATABASE_URL"), "requires isolated PostgreSQL")
class PostgresRecoveryTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.store = PostgresTaskStore(os.environ["R1_TEST_DATABASE_URL"])
        self.bank = CancellableBank()
        self.cookie = "SESSION=alice"

    async def test_prepared_intent_and_agui_thread_survive_process_replacement(self):
        first = AgentRuntimeV2(self.bank, SequencePlanner(), state_store=self.store)
        request_id = uuid4().hex
        thread_id = uuid4().hex
        prepared = await first.chat("给张三转10元", self.cookie, request_id=request_id,
                                    conversation_id=thread_id)
        self.assertEqual(prepared.status.value, "WAITING_CONFIRMATION")
        replacement = AgentRuntimeV2(self.bank, SequencePlanner(), state_store=self.store)
        binding, customer = await replacement._identity(self.cookie)
        self.assertEqual(self.store.thread_lookup(customer, binding, thread_id), prepared.task_id)
        recovered = await replacement.get(prepared.task_id, self.cookie)
        self.assertEqual(recovered.confirmation["id"], prepared.confirmation["id"])
        replay = await replacement.chat("给张三转10元", self.cookie, request_id=request_id)
        self.assertEqual(replay.task_id, prepared.task_id)
        self.assertEqual(len(self.bank.intents), 1)
        self.assertEqual(self.bank.debits, 0)

    async def test_old_worker_cannot_overwrite_newer_checkpoint(self):
        binding, customer = await AgentRuntimeV2(self.bank, SequencePlanner())._identity(self.cookie)
        task = Task(session_binding=binding, customer_id=customer, goal="audit")
        self.store.save(task)
        stale = self.store.load(task.task_id, customer, binding)
        newer = self.store.load(task.task_id, customer, binding)
        newer.goal = "newer"
        self.store.save(newer)
        stale.goal = "stale"
        with self.assertRaises(TaskStateConflict):
            self.store.save(stale)
        self.assertEqual(self.store.load(task.task_id, customer, binding).goal, "newer")

    async def test_lease_blocks_parallel_worker_and_expiry_allows_recovery(self):
        binding, customer = await AgentRuntimeV2(self.bank, SequencePlanner())._identity(self.cookie)
        task = Task(session_binding=binding, customer_id=customer, goal="lease")
        self.store.save(task)
        self.store.acquire(task.task_id, "worker-a")
        with self.assertRaises(TaskStateConflict):
            self.store.acquire(task.task_id, "worker-b")
        with self.store._connection() as connection:
            connection.execute("UPDATE agent_state.tasks SET lease_until=now()-interval '1 second' WHERE task_id=%s",
                               (task.task_id,))
        self.store.acquire(task.task_id, "worker-b")
        task.goal = "old worker result"
        with self.assertRaises(TaskStateConflict):
            self.store.save(task, "worker-a")
        self.store.release(task.task_id, "worker-b")

    async def test_crash_before_read_tool_call_resumes_same_task(self):
        class CrashSignal(BaseException):
            pass

        first = AgentRuntimeV2(self.bank, SequencePlanner(), state_store=self.store)
        async def crash(*_args, **_kwargs):
            raise CrashSignal()
        first.registry.call = crash
        request_id = uuid4().hex
        with self.assertRaises(CrashSignal):
            await first.chat("给张三转10元", self.cookie, request_id=request_id)
        binding, customer = await first._identity(self.cookie)
        task_id = self.store.request_lookup(customer, binding, request_id)[1]
        checkpoint = self.store.load(task_id, customer, binding)
        self.assertEqual(checkpoint.pending_tool["tool"], "resolve_recipient")
        recovered = AgentRuntimeV2(self.bank, SequencePlanner(),
                                   state_store=self.store)
        result = await recovered.chat("给张三转10元", self.cookie, request_id=request_id)
        self.assertEqual(result.task_id, task_id)
        self.assertIn(result.status.value, {"WAITING_CONFIRMATION", "WAITING_USER"})
        self.assertEqual(self.bank.debits, 0)

    async def test_crash_after_read_observation_before_checkpoint_replays_read(self):
        class CrashSignal(BaseException):
            pass

        first = AgentRuntimeV2(self.bank, SequencePlanner(), state_store=self.store)
        original_save = first._save
        def crash_on_observation(task):
            if task.observations and task.pending_tool is None:
                raise CrashSignal()
            original_save(task)
        first._save = crash_on_observation
        request_id = uuid4().hex
        with self.assertRaises(CrashSignal):
            await first.chat("给张三转10元", self.cookie, request_id=request_id)
        binding, customer = await first._identity(self.cookie)
        task_id = self.store.request_lookup(customer, binding, request_id)[1]
        self.assertEqual(len(self.store.load(task_id, customer, binding).observations), 0)
        recovered = AgentRuntimeV2(self.bank, SequencePlanner(),
                                   state_store=self.store)
        result = await recovered.chat("给张三转10元", self.cookie, request_id=request_id)
        self.assertEqual(result.task_id, task_id)
        self.assertEqual(self.bank.debits, 0)

    async def test_executed_by_bank_but_response_lost_never_reexecutes(self):
        first = AgentRuntimeV2(self.bank, SequencePlanner(), state_store=self.store)
        prepared = await first.chat("给张三转10元", self.cookie, request_id=uuid4().hex)
        self.bank.timeout_once = True
        body = ConfirmRequest(intent_id=prepared.confirmation["id"],
                              intent_hash=prepared.confirmation["intentHash"],
                              action_authorization_id="auth_test")
        uncertain = await first.confirm(prepared.task_id, body, self.cookie)
        self.assertEqual(uncertain.error_code, "EXECUTION_OUTCOME_UNKNOWN")
        self.assertEqual(self.bank.debits, 1)
        restarted = AgentRuntimeV2(self.bank, SequencePlanner(), state_store=self.store)
        reconciled = await restarted.confirm(prepared.task_id, body, self.cookie)
        self.assertEqual(reconciled.status.value, "SUCCEEDED")
        self.assertEqual(reconciled.receipt["id"], "transfer_1")
        self.assertEqual(self.bank.debits, 1)

    async def test_different_customer_cannot_load_task(self):
        first = AgentRuntimeV2(self.bank, SequencePlanner(), state_store=self.store)
        prepared = await first.chat("给张三转10元", self.cookie, request_id=uuid4().hex)
        other = AgentRuntimeV2(self.bank, SequencePlanner(), state_store=self.store)
        with self.assertRaises(BankingApiError) as denied:
            await other.get(prepared.task_id, "SESSION=bob")
        self.assertEqual(denied.exception.status, 404)

    async def test_two_workers_confirm_once_under_persistent_lease(self):
        class SlowBank(CancellableBank):
            def __init__(self):
                super().__init__()
                self.entered = asyncio.Event()
                self.release = asyncio.Event()

            async def execute_transfer(self, cookie, body, key):
                self.entered.set()
                await self.release.wait()
                return await super().execute_transfer(cookie, body, key)

        bank = SlowBank()
        first = AgentRuntimeV2(bank, SequencePlanner(), state_store=self.store)
        second = AgentRuntimeV2(bank, SequencePlanner(), state_store=self.store)
        prepared = await first.chat("给张三转10元", self.cookie, request_id=uuid4().hex)
        body = ConfirmRequest(intent_id=prepared.confirmation["id"],
                              intent_hash=prepared.confirmation["intentHash"],
                              action_authorization_id="auth_test")
        ongoing = asyncio.create_task(first.confirm(prepared.task_id, body, self.cookie))
        await asyncio.wait_for(bank.entered.wait(), 5)
        try:
            with self.assertRaises(BankingApiError) as denied:
                await second.confirm(prepared.task_id, body, self.cookie)
            self.assertEqual(denied.exception.code, "TASK_STATE_CONFLICT")
        finally:
            bank.release.set()
        completed = await ongoing
        self.assertEqual(completed.status.value, "SUCCEEDED")
        self.assertEqual(bank.debits, 1)

    async def test_checkpoint_redacts_secret_and_full_account_without_changing_ids(self):
        test_key = "sk-" + ("0" * 32)
        original = {"task_id": "1918f3ad43884e8195356762990a1463",
                    "cookie": "SESSION=private", "password": "private",
                    "note": f"Account 1234567890123456 and {test_key}"}
        safe = _safe_checkpoint(original)
        self.assertEqual(safe["task_id"], original["task_id"])
        self.assertNotIn("cookie", safe)
        self.assertNotIn("password", safe)
        self.assertNotIn("1234567890123456", safe["note"])
        self.assertNotIn(test_key, safe["note"])

    async def test_cancelled_intent_stays_unconfirmable_after_replacement(self):
        first = AgentRuntimeV2(self.bank, SequencePlanner(), state_store=self.store)
        prepared = await first.chat("给张三转10元", self.cookie, request_id=uuid4().hex)
        replacement = AgentRuntimeV2(self.bank, SequencePlanner(), state_store=self.store)
        cancelled = await replacement.cancel(prepared.task_id, self.cookie)
        self.assertEqual(cancelled.status.value, "CANCELLED")
        self.assertEqual(self.bank.intents[prepared.confirmation["id"]]["status"], "CANCELLED")
        body = ConfirmRequest(intent_id=prepared.confirmation["id"],
                              intent_hash=prepared.confirmation["intentHash"],
                              action_authorization_id="auth_test")
        with self.assertRaises(BankingApiError):
            await AgentRuntimeV2(self.bank, SequencePlanner(), state_store=self.store).confirm(
                prepared.task_id, body, self.cookie)
        self.assertEqual(self.bank.debits, 0)

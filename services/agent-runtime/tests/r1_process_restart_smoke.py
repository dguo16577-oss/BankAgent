"""Interactive, opt-in process-restart check. Session stays in this process memory."""

from __future__ import annotations

import json
import os
from uuid import uuid4

import httpx


def main() -> None:
    bank = httpx.Client(base_url=os.environ["BANKING_API_BASE_URL"], timeout=20)
    bank.get("/customer/session")
    login = bank.post("/customer/auth/login", json={
        "email": os.environ["R1_DEMO_EMAIL"], "password": os.environ["R1_DEMO_PASSWORD"]},
        headers={"X-XSRF-TOKEN": bank.cookies.get("XSRF-TOKEN", "")})
    login.raise_for_status()
    bank.get("/customer/session")
    cookie = "SESSION=" + bank.cookies["SESSION"] + "; XSRF-TOKEN=" + bank.cookies["XSRF-TOKEN"]
    agent_url = os.environ["R1_AGENT_URL"]
    thread_id, run_id = uuid4().hex, uuid4().hex
    with httpx.Client(base_url=agent_url, timeout=120, headers={"Cookie": cookie}) as agent:
        before = bank.get("/customer/accounts").json()
        response = agent.post("/agent/ag-ui", json={
            "threadId": thread_id, "runId": run_id, "state": {},
            "messages": [{"id": run_id, "role": "user", "content": "给 Lin Wei 转 10 元"}],
            "tools": [], "context": [], "forwardedProps": {}})
        response.raise_for_status()
        snapshots = [json.loads(line[6:])["snapshot"] for line in response.text.splitlines()
                     if line.startswith("data: ") and json.loads(line[6:]).get("type") == "STATE_SNAPSHOT"]
        if not snapshots:
            raise AssertionError("No AG-UI state snapshot")
        state = snapshots[-1]
        task_id = state["taskId"]
        task = agent.get(f"/agent/tasks/{task_id}").json()
        if task["status"] != "WAITING_CONFIRMATION":
            raise AssertionError({"status": task["status"], "error": task.get("error_code")})
        intent_id = task["confirmation"]["id"]
        print({"phase": "before_restart", "task_id": task_id,
               "status": task["status"], "intent_id": intent_id,
               "thread_id": thread_id, "balance_rows": len(before.get("accounts", []))}, flush=True)
        input("Restart Agent process now, then press Enter here: ")
        recovered = agent.get(f"/agent/tasks/{task_id}")
        recovered.raise_for_status()
        after_task = recovered.json()
        thread_state = agent.get(f"/agent/ag-ui/thread-state/{thread_id}")
        thread_state.raise_for_status()
        after = bank.get("/customer/accounts").json()
        assert after_task["confirmation"]["id"] == intent_id
        assert thread_state.json()["task"]["taskId"] == task_id
        assert before == after
        print({"phase": "after_restart", "task_id": task_id,
               "status": after_task["status"], "same_intent": True,
               "same_thread": True, "balance_unchanged": True}, flush=True)


if __name__ == "__main__":
    main()

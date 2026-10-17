"""Run real-model transfer preparation cases against a disposable bank sandbox.

This suite never confirms a transfer. It verifies each prepared intent directly in
PostgreSQL, then cancels it before continuing to the next case.
"""

from __future__ import annotations

import argparse
import asyncio
import json
import os
import re
import subprocess
import sys
from pathlib import Path
from time import perf_counter
from urllib.parse import urlsplit

import httpx

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "services" / "agent-runtime"))

from app.banking import BankingGateway  # noqa: E402
from app.deepseek import DeepSeekClassifier  # noqa: E402
from app.main import create_app  # noqa: E402
from evals.m18_cases import BenchmarkCase, load_cases  # noqa: E402
from evals.m18_run_artifact import aborted_case_results, write_pilot_attempt  # noqa: E402
from evals.m18_usage import UsageMeter  # noqa: E402
from evals.trajectory import export_trajectory, sanitize  # noqa: E402


def query(sql: str) -> dict:
    container = os.environ["ASTER_BENCHMARK_POSTGRES_CONTAINER"]
    if not re.fullmatch(r"aster-m18-[a-f0-9]{10}", container):
        raise ValueError("Prepare pilot requires its own disposable PostgreSQL container")
    result = subprocess.run(["docker", "exec", container, "psql", "-U",
        os.environ["ASTER_BENCHMARK_DB_USER"], "-d", os.environ["ASTER_BENCHMARK_DB_NAME"],
        "-tAc", sql], capture_output=True, text=True, encoding="utf-8", errors="replace",
        check=True, timeout=15)
    return json.loads(result.stdout.strip())


def db_snapshot() -> dict:
    return query("""
SELECT json_build_object(
  'accounts_digest', (SELECT md5(coalesce(string_agg(
    account_id || ':' || balance::text || ':' || pending_amount::text || ':' || status,
    '|' ORDER BY account_id),'')) FROM accounts),
  'transfers_digest', (SELECT md5(coalesce(string_agg(
    transfer_id || ':' || status || ':' || amount::text,
    '|' ORDER BY transfer_id),'')) FROM transfers),
  'transactions_digest', (SELECT md5(coalesce(string_agg(
    transaction_id || ':' || status || ':' || amount::text,
    '|' ORDER BY transaction_id),'')) FROM transactions),
  'customer_intent_count', (SELECT count(*) FROM transfer_intents
    WHERE customer_id='usr_aster_alex')
)::text
""")


def intent_row(intent_id: str) -> dict | None:
    if not re.fullmatch(r"[A-Za-z0-9_-]{1,128}", intent_id):
        raise ValueError("Invalid intent ID")
    return query(f"""
SELECT coalesce((SELECT json_build_object(
  'customer_id',customer_id,'source_account_id',source_account_id,
  'recipient_id',recipient_id,'amount',amount::text,
  'note',snapshot #>> '{{terms,note}}','status',status)
  FROM transfer_intents WHERE intent_id='{intent_id}'), 'null'::json)::text
""")


async def login(bank: httpx.AsyncClient) -> str:
    bootstrap = await bank.get("/customer/session")
    csrf = bank.cookies.get("XSRF-TOKEN")
    if bootstrap.status_code not in {200, 401} or not csrf:
        raise RuntimeError("Sandbox bank session bootstrap failed")
    response = await bank.post("/customer/auth/login", json={
        "email": os.getenv("ASTER_DEMO_EMAIL", "alex@aster.local"),
        "password": os.getenv("ASTER_DEMO_PASSWORD", "demo-password"),
    }, headers={"X-XSRF-TOKEN": csrf})
    if response.status_code != 200:
        raise RuntimeError(f"Sandbox login failed: HTTP {response.status_code}")
    session = (await bank.get("/customer/session")).json()
    if not session.get("authenticated") or session["user"]["id"] != "usr_aster_alex":
        raise RuntimeError("Sandbox customer identity mismatch")
    return "; ".join(f"{name}={value}" for name, value in bank.cookies.items())


async def run_case(case: BenchmarkCase, origin: str, key: str, cookie: str) -> dict:
    expected_invariants = {"accounts_unchanged", "transfers_unchanged", "transactions_unchanged",
                           "one_prepared_intent" if case.expected_final_task_state == "WAITING_CONFIRMATION"
                           else "intents_unchanged"}
    if not case.financial_case or case.expected_final_task_state not in {"WAITING_CONFIRMATION", "WAITING_USER", "SUCCEEDED", "FAILED"} or \
            case.initial_db_state != {"source": "postgresql_snapshot", "customer_id": "usr_aster_alex"} or \
            set(case.expected_db_invariants) != expected_invariants or \
            set(case.forbidden_side_effects) != {"debit_before_confirmation", "execute_tool"}:
        raise ValueError(f"{case.case_id}: unsupported prepare-pilot manifest")
    constraints = case.expected_tool_constraints or {}
    allowed_constraints = {"required_tools", "expected_intent", "expected_candidate_ids",
                           "expected_intermediate_states", "allowed_intermediate_states",
                           "expected_intermediate_no_intent", "expected_choice_index",
                           "expected_response_any", "required_arguments",
                           "expected_observation_contains", "allowed_final_states",
                           "expected_error_code_if_failed", "forbid_derived_calendar_date"}
    if "required_tools" not in constraints or set(constraints) - allowed_constraints or \
            (case.expected_final_task_state == "WAITING_CONFIRMATION" and "expected_intent" not in constraints):
        raise ValueError(f"{case.case_id}: missing prepare-pilot assertions")
    accepted_states = constraints.get("allowed_final_states", [case.expected_final_task_state])
    if (not isinstance(accepted_states, list) or not accepted_states
            or case.expected_final_task_state not in accepted_states
            or len(set(accepted_states)) != len(accepted_states)
            or set(accepted_states) - {"WAITING_CONFIRMATION", "WAITING_USER", "SUCCEEDED", "FAILED"}
            or (len(accepted_states) > 1 and not (
                set(accepted_states) == {"SUCCEEDED", "WAITING_USER"}
                and constraints.get("expected_intent") is None
                and constraints.get("expected_response_any")
                or {"SUCCEEDED", "FAILED"}.issubset(set(accepted_states))
                and not (set(accepted_states) - {"SUCCEEDED", "FAILED", "WAITING_USER"})
                and constraints.get("expected_error_code_if_failed")
                and constraints.get("expected_response_any")))):
        raise ValueError(f"{case.case_id}: ambiguous allowed final task states")
    meter = UsageMeter()
    classifier = DeepSeekClassifier(key=key, transport=meter)
    app = create_app(BankingGateway(origin), classifier, agent_version="v2")
    runtime = app.state.agent_v2
    visible = runtime.registry.visible()
    if [entry["name"] for entry in visible] != list(case.available_tools):
        raise ValueError(f"{case.case_id}: manifest tool registry differs from Agent v2")
    if any(entry["name"].startswith("execute_") for entry in visible):
        raise ValueError(f"{case.case_id}: model-visible execute tool is forbidden")
    completion = classifier._json_completion
    model_requests = 0

    async def counted_completion(*args, **kwargs):
        nonlocal model_requests
        model_requests += 1
        return await completion(*args, **kwargs)

    classifier._json_completion = counted_completion
    before = db_snapshot()
    started = perf_counter()
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app),
                                  base_url="http://agent.test", timeout=300) as agent:
        task_id = None
        final = None
        turn_responses: list[dict] = []
        turn_snapshots: list[dict] = []
        task_ids: list[str] = []
        for turn in case.user_turns:
            body = {"message": turn, **({"task_id": task_id} if task_id else {})}
            response = await agent.post("/agent/chat", json=body, headers={"Cookie": cookie})
            if response.status_code != 200:
                raise RuntimeError(f"{case.case_id}: Agent HTTP {response.status_code}")
            final = response.json()
            task_id = final["task_id"]
            turn_responses.append(final)
            turn_snapshots.append(db_snapshot())
            task_ids.append(task_id)
        elapsed_ms = round((perf_counter() - started) * 1000)
        confirmation = (final or {}).get("confirmation") or {}
        intent_id = confirmation.get("id")
        row = intent_row(intent_id) if isinstance(intent_id, str) else None
        after = turn_snapshots[-1]
        invariants = {
            "accounts_unchanged": before["accounts_digest"] == after["accounts_digest"],
            "transfers_unchanged": before["transfers_digest"] == after["transfers_digest"],
            "transactions_unchanged": before["transactions_digest"] == after["transactions_digest"],
            "one_prepared_intent": after["customer_intent_count"] - before["customer_intent_count"] == 1
                                   and row is not None and row["status"] == "PREPARED",
            "intents_unchanged": after["customer_intent_count"] == before["customer_intent_count"],
        }
        invariants = {name: invariants[name] for name in case.expected_db_invariants}
        observed_tools = [entry["tool"] for entry in runtime.tasks[task_id].trace
                          if entry.get("kind") == "TOOL_RESULT"]
        observed_results = [entry.get("result", {}) for entry in runtime.tasks[task_id].trace
                            if entry.get("kind") == "TOOL_RESULT"]
        observation_markers = constraints.get("expected_observation_contains", [])
        observations_match = all(marker in json.dumps(observed_results, ensure_ascii=False)
                                 for marker in observation_markers)
        expected = constraints.get("expected_intent")
        intent_matches = (row is None and not confirmation) if expected is None else (
            row is not None and all(row.get(field) == value for field, value in expected.items())
            and row.get("customer_id") == "usr_aster_alex")
        tools_match = all(tool in observed_tools for tool in constraints["required_tools"])
        arguments_match = all(
            any(entry.get("kind") == "PLANNER_DECISION"
                and (entry.get("decision", {}).get("tool_call") or {}).get("tool_name") == rule["tool"]
                and (entry["decision"]["tool_call"]["arguments"] or {}).get(rule["key"]) == rule["value"]
                for entry in runtime.tasks[task_id].trace)
            for rule in constraints.get("required_arguments", [])
        )
        response_terms = constraints.get("expected_response_any", [])
        no_derived_calendar_date = not constraints.get("forbid_derived_calendar_date") or not re.search(
            r"\b\d{4}-\d{2}-\d{2}\b", final.get("message") or "")
        response_matches = (final.get("error_code") == constraints["expected_error_code_if_failed"]
                            if final["status"] == "FAILED" and len(accepted_states) > 1 else
                            not response_terms or any(
                                term in (final.get("message") or "") for term in response_terms))
        response_matches = response_matches and no_derived_calendar_date
        intermediate_states = [turn["status"] for turn in turn_responses[:-1]]
        allowed_intermediate = constraints.get("allowed_intermediate_states")
        if allowed_intermediate is not None:
            intermediate_ok = (isinstance(allowed_intermediate, list)
                and len(allowed_intermediate) == len(intermediate_states)
                and all(isinstance(options, list) and options and state in options
                        for state, options in zip(intermediate_states, allowed_intermediate)))
        else:
            intermediate_ok = intermediate_states == constraints.get("expected_intermediate_states", [])
        intermediate_no_intent = not constraints.get("expected_intermediate_no_intent") or all(
            snapshot["customer_intent_count"] == before["customer_intent_count"]
            for snapshot in turn_snapshots[:-1])
        ambiguity_turns = [turn for turn in turn_responses if turn["status"] == "WAITING_USER"]
        candidate_options = ambiguity_turns[0].get("options", []) if ambiguity_turns else []
        candidate_ids = [option.get("id") for option in candidate_options]
        expected_candidates = constraints.get("expected_candidate_ids")
        candidates_match = expected_candidates is None or (
            len(candidate_ids) == len(expected_candidates)
            and set(candidate_ids) == set(expected_candidates))
        choice_index = constraints.get("expected_choice_index")
        if choice_index is not None:
            candidates_match = candidates_match and row is not None and choice_index < len(candidate_ids) \
                and row["recipient_id"] == candidate_ids[choice_index]
        first_turn_no_intent = all(
            snapshot["customer_intent_count"] == before["customer_intent_count"]
            for turn, snapshot in zip(turn_responses, turn_snapshots) if turn["status"] == "WAITING_USER")
        same_task = len(set(task_ids)) == 1
        passed = (final["status"] == "WAITING_CONFIRMATION" and all(invariants.values())
                  and intent_matches and tools_match and arguments_match and observations_match
                  and intermediate_ok and intermediate_no_intent and candidates_match
                  and first_turn_no_intent and same_task and response_matches) if case.expected_final_task_state == "WAITING_CONFIRMATION" else (
                  final["status"] in accepted_states and all(invariants.values()) and intent_matches
                  and tools_match and arguments_match and observations_match
                  and intermediate_ok and intermediate_no_intent
                  and candidates_match and same_task and response_matches)
        trace = export_trajectory(case_id=case.case_id, task=runtime.tasks[task_id],
            model=classifier.model, tool_registry=visible, initial_db_state=before,
            final_db_state=after, policy_state=case.policy_state, invariants=invariants,
            result="PASS" if passed else "FAIL")
        trace["category"] = case.category
        trace["financial_case"] = case.financial_case
        trace["final_agent_message"] = sanitize(final.get("message"))
        metered_all = meter.usage_coverage_complete(model_requests)
        estimated_cost = meter.peak_cost_usd() if metered_all else None
        if estimated_cost is None:
            trace["result"] = "FAIL"
        trace["pilot_evidence"] = {
            "model_requests": model_requests,
            "planner_retry_count": max(0, model_requests - trace["planner_call_count"]),
            "usage_records": meter.records,
            "model_http_events": meter.request_events,
            "usage_coverage_complete": metered_all,
            "estimated_peak_model_cost_usd": estimated_cost,
            "pricing_source": "https://api-docs.deepseek.com/quick_start/pricing/",
            "latency_ms": elapsed_ms,
            "required_tools_observed": tools_match,
            "required_arguments_observed": arguments_match,
            "required_observation_observed": observations_match,
            "intent_terms_match": intent_matches,
            "candidate_ids_match": candidates_match,
            "expected_response_observed": response_matches,
            "derived_calendar_date_absent": no_derived_calendar_date,
            "accepted_final_states": accepted_states,
            "final_error_code": final.get("error_code"),
            "intermediate_states_match": intermediate_ok,
            "intermediate_no_intent": intermediate_no_intent,
            "waiting_user_turns_created_no_intent": first_turn_no_intent,
            "same_task_across_turns": same_task,
            "db_verified": all(invariants.values()) and first_turn_no_intent,
            "no_debit_before_confirmation": invariants["accounts_unchanged"],
        }
        if intent_id:
            cleanup = await agent.post(f"/agent/tasks/{task_id}/cancel", headers={"Cookie": cookie})
            cancelled = intent_row(intent_id)
            cleanup_state = db_snapshot()
            trace["pilot_evidence"]["cleanup_cancelled"] = (
                cleanup.status_code == 200 and cancelled is not None
                and cancelled["status"] == "CANCELLED"
                and all(cleanup_state[key] == after[key]
                        for key in ("accounts_digest", "transfers_digest", "transactions_digest")))
            if not trace["pilot_evidence"]["cleanup_cancelled"]:
                trace["result"] = "FAIL"
    await meter.close_pool()
    return trace


async def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--cases", type=Path,
                        default=ROOT / "research/agent-transfer/m18-prepare-pilot.jsonl")
    parser.add_argument("--output", type=Path,
                        default=ROOT / "artifacts/m18-isolated-prepare-pilot.json")
    options = parser.parse_args()
    origin = os.getenv("BANKING_API_BASE_URL", "").rstrip("/")
    parsed = urlsplit(origin)
    if os.getenv("ASTER_BENCHMARK_SANDBOX") != "1" or parsed.scheme != "http" or \
            parsed.hostname != "127.0.0.1" or parsed.port is None or parsed.path or parsed.query or \
            not os.getenv("ASTER_BENCHMARK_POSTGRES_CONTAINER", "").startswith("aster-m18-"):
        raise SystemExit("Run the prepare pilot through scripts/m18-benchmark-sandbox.py")
    registered_manifest_bytes = options.cases.read_bytes()
    cases = load_cases(options.cases, source_bytes=registered_manifest_bytes)
    if not cases or len(cases) > 10:
        raise SystemExit("Prepare pilot requires 1–10 cases; it is not the full benchmark")
    key = os.getenv("DEEPSEEK_API_KEY") or Path(os.getenv(
        "DEEPSEEK_API_KEY_FILE", "E:/deeoseekapikey.txt")).read_text(encoding="utf-8").strip()
    if not key:
        raise SystemExit("DeepSeek key unavailable")
    async with httpx.AsyncClient(base_url=origin, timeout=15) as bank:
        cookie = await login(bank)
        traces = []
        for index, case in enumerate(cases):
            try:
                traces.append(await run_case(case, origin, key, cookie))
            except Exception as exc:
                traces.extend(aborted_case_results(cases[index:], type(exc).__name__))
                break
    all_passed = all(trace["result"] == "PASS" for trace in traces)
    output, history = write_pilot_attempt(
        manifest=options.cases, expected_case_ids=[case.case_id for case in cases],
        registered_manifest_bytes=registered_manifest_bytes,
        requested_output=options.output, passed=all_passed,
        payload={"suite": "M18 transfer prepare pilot",
                 "full_benchmark": False, "case_count": len(traces), "results": traces})
    print(f"Attempt retained: {history}")
    for trace in traces:
        print(f"{trace['benchmark_case_id']} {trace['result']} state={trace['final_task_state']} "
              f"model_requests={trace.get('pilot_evidence', {}).get('model_requests', 'unknown')} "
              f"db_verified={trace.get('pilot_evidence', {}).get('db_verified', False)} "
              f"cleanup={trace.get('pilot_evidence', {}).get('cleanup_cancelled', False)}")
    return 0 if all_passed else 1


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))

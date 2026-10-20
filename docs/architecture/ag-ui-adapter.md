# AG-UI adapter

`services/agent-runtime/app/agui_adapter.py` adds `POST /agent/ag-ui` only when `AGENT_RUNTIME_VERSION=v2`. It uses the official Python protocol models and `EventEncoder`. The request must carry a valid Spring session cookie. `AgentRuntimeV2._identity` resolves the customer before the response stream opens. The latest plain-text user turn is passed to the existing `AgentRuntimeV2.chat`; client-supplied `tools`, `state`, `context`, and `forwardedProps` are ignored for authority and planning.

## Event mapping

| Runtime fact                                                | AG-UI event                                                                                                         |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Turn accepted                                               | `RUN_STARTED`                                                                                                       |
| Actual Tool Registry invocation begins                      | `TOOL_CALL_START`, redacted `TOOL_CALL_ARGS`                                                                        |
| Actual tool completes or fails                              | `TOOL_CALL_END`, `TOOL_CALL_RESULT`                                                                                 |
| Task returns                                                | `STATE_SNAPSHOT` with task ID, task status, confirmation requirement, action counts and bounded spending aggregates |
| Complete assistant answer                                   | `TEXT_MESSAGE_START`, one `TEXT_MESSAGE_CONTENT`, `TEXT_MESSAGE_END`                                                |
| Transport run completes                                     | `RUN_FINISHED`, including `taskStatus`                                                                              |
| Authentication or unexpected runtime failure during the run | `RUN_ERROR`                                                                                                         |

`RUN_FINISHED` means the conversation turn ended; it **does not** mean a prepared bank action executed. There is no synthetic token-by-token generation. `STATE_DELTA` is not emitted because the current Agent runtime returns a final task snapshot. Raw tool arguments and results can contain account details or untrusted transaction notes; the browser receives a redacted argument marker and success/failure status instead. The final answer masks long numeric identifiers, session tokens, API keys, password assignments, bearer credentials, and labeled one-time codes. Model hidden reasoning is not emitted.

The adapter maps `(session binding, customer ID, thread ID)` to the current Agent task. A reconnecting stream does not revoke or cancel a submitted bank request. The turn uses a stable request key derived from session binding and run ID; financial preparation and execution also retain their bank-side idempotency. The adapter's thread map is in memory and is lost on Agent restart.

Tests: `services/agent-runtime/tests/test_agui_adapter.py` checks real SSE structure and order, customer/session separation, serialized same-thread turns, forged client state and tool rejection, missing session, redaction, bounded spending aggregates, cancelled-task continuation, and owned thread-state recovery. The full Agent suite has 246 passing tests in this checkout. Account read and transfer preparation passed with real DeepSeek and disposable Spring/PostgreSQL; other real-model scenarios remain for acceptance.

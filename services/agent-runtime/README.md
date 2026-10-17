# Aster Bank Agent Runtime

> **当前交接入口：** [Agent Runtime 交接 README](README.HANDOFF.md)。下文包含 M17R 和旧 v1 的阶段快照；当前 v2 Registry 为 49 项，M22/M23 的最终浏览器验收仍是 PARTIAL。

This service accepts a logged-in customer's message and returns a grounded answer or a reviewable transfer task. Banking Core owns the Spring Session, financial state, authorization, and every financial mutation. The Agent has no database connection or local customer session.

## Run

From the repository root:

```powershell
python -m pip install -r services/agent-runtime/requirements.txt
$env:BANKING_API_BASE_URL = 'http://127.0.0.1:18080'
python -m uvicorn app.main:app --app-dir services/agent-runtime --host 127.0.0.1 --port 8001
```

To enable DeepSeek locally, set the key in the **same PowerShell session** before starting the Agent. Keep the file outside the repository and do not print its contents:

```powershell
$env:DEEPSEEK_API_KEY = (Get-Content -LiteralPath '<private-key-file>' -Raw).Trim()
$env:DEEPSEEK_MODEL = 'deepseek-flash'
```

Restart the Agent after changing its environment. The Web server does not need the key. Its default `ASTER_AGENT_RUNTIME_URL` is `http://127.0.0.1:8001`; change that value if the Agent runs on another port.

`AGENT_RUNTIME_VERSION=v2` selects the bounded Agent loop for `/agent/chat` and `/agent/tasks/*` and is the default after the M17R acceptance gate. Set `AGENT_RUNTIME_VERSION=v1` in the Agent process environment to use the retained legacy transfer runtime for rollback. The legacy `/chat` endpoint remains unchanged in either mode.

In v2, `DEEPSEEK_API_KEY` is required for every planner decision. Each read-tool result becomes a structured observation in the next model request. A successful `prepare_transfer` exits directly to `WAITING_CONFIRMATION`; it does not spend another model call deciding whether the bank intent is ready. The model receives the user's goal, conversation, the complete registered tool schemas and scoped bank observations, including masked account and recipient data; it does not receive the Spring cookie, CSRF token, credentials, intent hash or authorization token. A missing key or failed model decision fails the task closed. The v1 behavior described below uses a deterministic fallback; **v2 does not**. The API is the official [DeepSeek Chat Completions endpoint](https://api-docs.deepseek.com/api/create-chat-completion/).

In v1, `DEEPSEEK_API_KEY` enables structured DeepSeek decisions for the transfer task, intent classification for read-only chat, and Chinese public-knowledge summaries. `DEEPSEEK_MODEL` defaults to `deepseek-flash`. Without a key, or when the model request fails, the transfer uses the explicit deterministic planner and reports `mode: "DETERMINISTIC"`. A valid model decision reports `mode: "DEEPSEEK"`. The v1 planner sees allowed Agent tool names and redacted observation counts/statuses; it does not receive the raw message, Cookie, customer/recipient name or ID, amount, bank records, OTP, password, or customer Banking API response.

The short JSON classification and public-summary requests set `thinking.type=disabled`, avoiding reasoning-token exhaustion with their small response limits. On 2026-10-01, a local Web → Agent → DeepSeek smoke test returned a model-assisted account intent and a cited Chinese summary of the Cashback Credit Card catalog entry. The mode is per answer: a timeout, unsupported evidence, or invalid model result may still produce a deterministic answer. The `DEEPSEEK` mode for a private-account answer means **intent classification only**; the account figures come from Banking Core, not the model.

The Next.js server proxy sends the browser's `Cookie` header to `POST /agent/chat` and the task confirmation/cancellation endpoints. The Agent verifies it through `GET /customer/session` on every request and hashes the Spring session ID to bind task state. It never accepts an account or customer ID from the client as authorization. A missing or invalid session returns 401; an unavailable Banking Core returns 503 with no invented account information. Run the service on loopback; browsers use `/api/agent/chat` on Next.js. Spring's CSRF cookie is forwarded as `X-XSRF-TOKEN` for prepare/execute mutations.

## API

- `GET /health`: process liveness.
- `POST /chat` with `{"message":"查看我的账户余额","locale":"zh-CN"}`: returns `reply`, `mode`, `citations`, and optionally `proposal`. `locale` also accepts `en`; omitting it defaults to `zh-CN`.
- `POST /agent/chat` with `{"message":"转给 Lin Wei 1 元"}`: starts or resumes a bounded transfer task. A follow-up sends `task_id`; e.g. `{"message":"第一个","task_id":"..."}` after ambiguity. Other questions retain the existing read-only `/chat` behavior.
- `GET /agent/tasks/{task_id}`: current session-bound task view.
- `POST /agent/tasks/{task_id}/confirm` with exact `intent_id`, `intent_hash`, and the Spring-issued `action_authorization_id`: trusted confirmation and bank execution. Without authorization it returns `WAITING_AUTH`.
- `POST /agent/tasks/{task_id}/cancel`: stops the Agent task before execution. In v2, it also cancels the prepared intent in Spring; an uncertain bank cancellation blocks further planning. In legacy v1, the prepared intent remains until its own expiry.
- `GET /knowledge/graph`: public-only graph of products, support articles, rates, offers, categories, and tags, built from `/public/*` GETs. Every entity and edge carries a source URL. It contains no customer data.

The legacy `/chat` route still returns proposal/navigation responses for compatibility. The new `/agent/chat` route creates a Spring Transfer Intent, returns its exact immutable snapshot for the Web confirmation card, and never debits during planning. Card and recurring-action guidance still uses local navigation proposals.

The transfer Tool Registry exposes only `list_accounts`, `get_account`, `list_transactions`, `resolve_recipient`, `get_transfer_intent`, and `prepare_transfer`. Registry metadata includes JSON Schemas and strict Pydantic argument validation. The same registry is supplied to the planner on every step; Python does not select a workflow based on a guessed intent. Recipient name, Chinese nickname, normalized Latin name and pinyin matching happen inside `resolve_recipient`. `execute_transfer` is absent. Trusted confirmation alone calls Spring's `POST /customer/transfers` with a stable idempotency key after checking the exact saved intent and runtime policy; Spring revalidates and atomically settles the transfer. The other read-only chat paths remain allowlisted.

The transfer loop is capped at 10 steps. Recipient ambiguity pauses in `WAITING_USER`; no candidate is guessed. Spring's frozen `TRANSFER_EXECUTE` policy requires an intent-bound SMS challenge for every transfer, so the Agent policy requires authorization for every confirmation. Web reuses `ActionVerification`. A timeout after execute preserves the same task, intent, authorization and idempotency key for safe recovery. Task and audit stores are currently process-local; run one Agent worker. Restart loses unfinished tasks, while any prepared Spring intent remains subject to its original expiry.

Historical transfer questions such as “我这个月转给 Lin Wei 多少钱”, “我这个月转给了别人多少钱”, and “我转账过给谁” query the authenticated customer's persisted transactions. The Agent filters completed outgoing `BANK_TRANSFER` records by the requested month in UTC+08, follows opaque cursor pages, and sums decimal strings with `Decimal`. It reports only records returned by Banking Core; historical queries never create a transfer proposal. An unqualified history question uses the available transaction records, subject to the Agent's 100-page safety limit.

## Verify

```powershell
python -m unittest discover -s services/agent-runtime/tests -v
pnpm test:agent:eval
```

For an **opt-in local demo mutation** against running Spring/PostgreSQL, set `ASTER_DEMO_EMAIL` and `ASTER_DEMO_PASSWORD`, then run `python scripts/agent-live-smoke.py`. It performs one 1.00 CNY transfer to the saved Lin Wei recipient, verifies step-up and duplicate confirmation, and checks that the source account debited once. With `DEEPSEEK_API_KEY` set, it also requires the structured DeepSeek planner. Never run this against production.

The offline evaluation runs 36 fixed banking, multi-turn, and safety scenarios against an in-process Agent with synthetic Alex/Lin data. It writes a sanitized JSON report to `artifacts/agent-eval/baseline-v1.json`; no live bank, DeepSeek key, or funds are used. See [the baseline report](../../docs/testing/agent-baseline-v1.md) for current gaps and interpretation.

This remains a bounded demo assistant. Personal answers are derived from Spring APIs; public reference answers cite local sources. In v2, the model chooses the next registered tool after each read observation. The runtime validates tool arguments, grounds account and recipient IDs in bank responses, rejects a proposed amount that contradicts an explicit numeric user request, and owns policy, intent lifecycle and confirmation. The amount supplied to the bank comes from the model's structured tool call, while the confirmation policy reads the bank's immutable intent. The trusted confirmation path alone can call Spring transfer execution. Task and trace storage remain process-local; run one Agent worker and do not treat this as a production deployment.

For a non-mutating model probe, run `python scripts/agent-v2-model-probe.py` with `DEEPSEEK_API_KEY` set. For a disposable Spring/PostgreSQL sandbox smoke, set `AGENT_RUNTIME_VERSION=v2`, `BANKING_API_BASE_URL`, demo credentials and `DEEPSEEK_API_KEY`, then run `python scripts/agent-v2-live-smoke.py`. The latter executes one 1.00 CNY transfer and must never target a real customer database.

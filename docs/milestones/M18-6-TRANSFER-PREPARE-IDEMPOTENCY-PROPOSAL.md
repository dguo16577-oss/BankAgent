# M18.6 transfer preparation replay: minimal contract and persistence proposal

## Verified gap

The Agent v2 `request_id` is bound to the authenticated session and customer. Two concurrent `/agent/chat` requests with the same ID return one in-memory task and one bank intent; `DR01-DUPLICATE-CHAT-REQUEST` verified this against PostgreSQL. The mapping is process-local. After an Agent process restart, the same request ID is not remembered, so the model can create a new task and call `POST /customer/transfer-intents` again. The bank prepare endpoint has no idempotency key and currently creates a fresh intent. The execution key remains deterministic, so a second execution with changed intent terms should be rejected by the bank's existing execution idempotency fingerprint, but this does not prevent orphaned or duplicate prepared intents. The current evidence must not be described as restart-safe preparation.

## Proposed compatible change (approval required)

1. Add an optional `Idempotency-Key` header to frozen `POST /customer/transfer-intents`. Agent v2 always sends a stable key derived from session binding and the Agent request ID; existing non-Agent clients may omit it for compatibility. This key is transport metadata, not model-visible input.
2. Add a new Flyway migration for `transfer_prepare_idempotency`: `(customer_id, session_id, idempotency_key)` unique, request fingerprint, intent ID, and creation time. The fingerprint covers source account, canonical recipient, amount, currency, and note. Use a database transaction and row-level uniqueness so two bank processes cannot each create an intent for the same key.
3. Same key and same request fingerprint return the original intent. Same key and different fingerprint return 409 `IDEMPOTENCY_KEY_REUSED`; the Agent fails closed. Preserve the original intent status: a cancelled, expired, or executed intent must never be silently replaced with a new PREPARED intent under that key.
4. Keep the existing trusted confirmation, step-up, revalidation, and execute idempotency boundaries. No execute capability is exposed to the model. Do not infer idempotency from natural-language text.

## Verification after approval

- Concurrent duplicate Agent chat HTTP requests: one task and one persisted bank intent, zero debit before confirmation.
- Replay after an Agent process restart: bank returns the same intent or a safe terminal/conflict response, never a second prepared intent.
- Same key with different terms: HTTP 409 and zero new intent.
- Concurrent bank prepare requests in Testcontainers PostgreSQL: one intent row and one idempotency record.
- Cancellation/expiry/execution followed by replay: no intent resurrection.
- Existing Web, Spring, Agent, frozen-contract, and real DeepSeek regressions remain green.

**Status (2026-10-08):** Approved in the M18 implementation plan and implemented through the optional Customer API header and Flyway V22. Testcontainers verifies identical replay, changed-term conflict, cancellation replay, and concurrent preparation. The Agent task map remains process-local; only bank preparation is restart-safe.

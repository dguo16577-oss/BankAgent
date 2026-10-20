# Financial execution and reconciliation

Status: transfer response-loss path **TEST PASS** in a disposable Spring/PostgreSQL stack on 2026-10-13. Other financial action kinds and browser refresh of unknown-outcome state remain **UNVERIFIED**.

## Authoritative sequence

1. The model can select a PREPARE tool, but cannot select an execution tool. Spring creates a persisted intent with immutable terms and hash.
2. The Agent saves `WAITING_CONFIRMATION`. The browser obtains customer verification and submits intent ID, hash and grant to the trusted runtime.
3. The runtime persists `execution_uncertain` **before** calling Spring, using a stable execution key. Spring checks owner, intent status, expiry, terms, action authorization and current bank state inside its transaction.
4. Spring commits the execution and records authoritative intent/transfer/transaction rows. If its response is lost, the Agent must re-read the intent using the original customer's session and reuse the same key. It must not infer success from transport failure or create a replacement intent.
5. If the authoritative result cannot be established, the task remains in an explicit unknown-outcome state. The Web confirmation card shows “银行执行结果待核实” and disables new verification/cancellation while uncertain. A separate bank-record check is required.

Source: [runtime](../../services/agent-runtime/app/agent_v2/runtime.py), [transfer execution](../../services/banking-core/src/main/java/com/asterbank/banking/customer/payment/application/TransferExecutionService.java), [Web card](../../apps/web/src/features/agent/copilot-workspace.tsx).

## Real Spring commit / lost-response injection

`scripts/s1-response-loss-smoke.py` logged in to isolated Spring, prepared a 10.00 CNY transfer, obtained the required verification, and sent the execution through a local proxy. The proxy forwarded the request to Spring, received HTTP 200, then truncated the response and closed the Agent-facing socket. The Agent observed a transport/protocol error after the bank commit. A fresh runtime instance reloaded the same persisted task and queried Spring's intent. The final intent was `EXECUTED`, task `SUCCEEDED`, with one new intent, one transfer, one debit transaction and exactly 10.00 CNY source debit. The task and intent IDs stayed the same. [Sanitized evidence](../../artifacts/s1-response-loss-smoke.json). The script asserts `EXECUTION_OUTCOME_UNKNOWN` before recovery.

The test exercises a runtime-object restart, not a killed/restarted production Agent process or an end-to-end browser refresh. It does not cover schedule, card, mandate or wealth execution after response loss; those paths currently stop with `BANKING_RESULT_UNKNOWN` rather than blindly retrying. It also does not prove concurrent two-tab confirmation. This is why R1 and S1 remain PARTIAL.

## Ledger evidence

The [ledger evaluator](../../services/agent-runtime/app/agent_v2/completeness.py) now validates dependency order, blocks dependent steps after failed/skipped prerequisites, saves `failure_reason`, and allows a `confirmed_*` bank receipt to satisfy only one financial step. `test_security_ledger.py` covers six focused cases. This prevents a final model sentence from overriding missing financial evidence. A multiple-action semantic mapping test and slow lease-expiry test are still needed.

## Operational response to uncertainty

Do not tell the customer that a transfer failed solely because the Agent timed out. Query the owner-scoped Spring intent and transfer records first. If those records are unavailable, retain the original task, intent and key and ask an operator to reconcile them. Never use a new PREPARE request to “retry” an unknown outcome. The UI may show a pending bank reconciliation message, but must not claim completion until Spring proves it.

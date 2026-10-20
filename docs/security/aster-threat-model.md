# Aster Bank Agent security threat model

Status: S1 **PARTIAL**, 2026-10-13. Scope is the isolated AG-UI copy of the project. This model describes actual code paths; it does not claim a production security certification.

## Assets and authorities

The protected assets are customer sessions, accounts, balances, cards, mandates, ActionIntents, step-up grants, transfer receipts, customer transactions, private task state and API credentials. Spring Banking Core is the authority for identity, object ownership, intent lifecycle, execution and financial records. The Agent owns planning and conversation state but has no authority to execute a model-selected mutation. The browser can request confirmation; it cannot make an LLM observation into authorization.

## Call chain and trust boundaries

```text
Browser -> same-origin Next route -> FastAPI Agent -> Spring /customer/session
                                      | -> DeepSeek Planner -> validated Tool Registry
                                      | -> read / PREPARE -> Spring Banking Core -> PostgreSQL
                                      | -> WAITING_CONFIRMATION -> browser verification
                                      | -> trusted runtime confirm -> Spring execute/revalidate
Knowledge ingest -> Knowledge Service -> untrusted RAG chunk -> Planner
MCP bridge -> allowlisted read-only MCP result -> Planner
```

The first crossing is the browser request: text, task ID, thread ID and cookie are attacker-controlled transport inputs. The Agent resolves the customer through Spring's server session and checks task ownership. The second crossing is every model decision: tool name and arguments must match the registry and policy, and object identifiers must be checked by Banking Core. The third crossing is bank/retrieval/MCP observations entering the model: transaction notes, merchant names, document chunks and tool descriptions are **data**, never instructions or authorization. The fourth crossing is user confirmation: the trusted runtime compares the stored intent snapshot/hash, grant and authoritative Spring status before execution. See [trust boundaries](agent-trust-boundaries.md) for source links.

## Threat scenarios and current disposition

| Scenario                                                       | Impact                                          | Control and remaining test                                                                                                                                                                      |
| -------------------------------------------------------------- | ----------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Malicious note/merchant/chunk asks the model to transfer funds | Unauthorized PREPARE or execution               | Tool registry has no model-facing execute tool; policy rejects query-only mutation. A real DeepSeek transaction-note test passed. Malicious knowledge and merchant variants remain unverified.  |
| Model supplies another customer's account/card/intent ID       | Cross-customer data or mutation                 | Spring session principal and service-level ownership checks are the final boundary. A cross-customer Agent task lookup returned 404; systematic object-level matrix remains open.               |
| Stale or duplicated confirmation                               | Double debit or cancelled-intent revival        | Spring intent status, action hash, authorization binding and idempotency. A real bank-commit/response-loss transfer used one debit; concurrent two-tab cases remain open.                       |
| Bank commits but Agent loses response                          | Hidden financial effect followed by blind retry | Checkpoint `execution_uncertain`, authoritative intent re-read and same execution key for transfer; unknown outcomes surface to UI. Tested through real Spring and a response-truncating proxy. |
| Poisoned MCP schema or result                                  | Tool confusion/capability escalation            | Three pilot MCP tools are read-only, from fixed loopback origins with audience/tool-bound grant and schema validation. Adversarial schema-change test remains open.                             |
| Forged or outdated RAG citation                                | Incorrect policy advice                         | Retrieval filters public/effective versions and citation IDs are checked. Claim entailment is not verified.                                                                                     |
| Session theft, CSRF or direct Agent route                      | Customer impersonation                          | Spring JDBC session, CSRF, cookie and CORS settings exist. Direct Agent exposure and full browser CSRF matrix remain open.                                                                      |
| Lease expiry during slow model call                            | Competing task workers                          | State CAS and Spring idempotency constrain damage. Five-minute lease lacks heartbeat; slow-call test remains open.                                                                              |

## Severity and priorities

**High:** a missing dependency gate could falsely mark financial work complete; repaired with deterministic tests. Unknown bank outcome or direct-route exposure can become high impact depending on deployment; the transfer case was fault-injected, but other action types and direct-route reachability remain unverified. **Medium:** lease expiry, RAG citation entailment, incomplete UI reconciliation. **Low:** public-only demo knowledge scope is intentionally narrower than customer-private RAG. Findings and provenance are in [the audit](security-audit-findings.md).

The reference framework is [OWASP Agentic Top 10 2026](https://genai.owasp.org/resource/owasp-top-10-for-agentic-applications-for-2026/), [OWASP API Security Top 10 2023](https://api-security.owasp.org/editions/2023/en/0x03-introduction/), [NIST AI RMF](https://www.nist.gov/itl/ai-risk-management-framework), and [NIST SP 800-63B-4](https://pages.nist.gov/800-63-4/sp800-63b.html). These are review lenses, not evidence that every control passed.

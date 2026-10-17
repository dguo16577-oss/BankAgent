# M17R final cleanup and M18.1 recipient resolution

Date: 2026-10-07. Scope stops at name-based Smart Transfer. Phone numbers, historical-note resolution, scheduled payments and AA are not part of this checkpoint.

## M17R final cleanup: PASS

- The v2 `/agent/chat` path does not call the legacy `heuristic_intent`, `looks_like_transfer_command`, or `next_required_tool`. The legacy v1 rollback path retains those functions and is separate from v2.
- Removed `explicit_amount` and `trusted_amount` from the v2 task and planner context. The model supplies normal `prepare_transfer` arguments. A narrow deterministic guard only rejects a proposed amount when it conflicts with an explicit numeric user utterance; it never supplies an amount, intent, or tool choice.
- All six registered tools are visible at every planning step: `list_accounts`, `get_account`, `list_transactions`, `resolve_recipient`, `get_transfer_intent`, `prepare_transfer`. There is no model-facing execute, raw HTTP, SQL, shell or admin tool.
- A valid PREPARED bank intent causes immediate `WAITING_CONFIRMATION` after the third tool result. There is no fourth completion call. Only the trusted confirmation path can execute. Policy, session binding, authorization, bank revalidation and idempotency remain deterministic.

## M18.1: name-based transfer

The single `resolve_recipient` read tool matches Unicode-normalized names, whitespace/punctuation-insensitive Latin names, Chinese-name pinyin, Chinese queries against romanized saved names, optional recipient aliases when supplied by the read response, and common 小/老 + surname nicknames. It returns all matches rather than choosing a same-name payee. Ambiguity is shown as `ASK_USER`; “第一个” selects from the exact prior observed candidate set and resumes the same Task. The planner contains no name-matching rules.

In deterministic Agent v2 tests, `给 Lin Wei 转10元`, `给张三转10元`, `给 Zhang San 转10元`, and `给老张转10元` all used `resolve_recipient` and ended at `WAITING_CONFIRMATION`. `给小王转10元` returned two candidates (`王晨`, `王强`), then `第一个` resumed the same Task and prepared the first payee. All cases had zero debit.

With real DeepSeek and an isolated in-process bank adapter, Lin Wei, 张三 and Zhang San each produced three model decisions and three tools: recipient resolution, account listing and intent preparation. The full registry was present in each model context. 小王 produced `resolve_recipient → AMBIGUOUS → DeepSeek ASK_USER`; following up with 第一个 continued the same Task and reached review. There was no model call after preparation and no debit.

With real DeepSeek and the running local Spring/PostgreSQL demo backend, Lin Wei, Chinese 张三 and romanized Zhang San each reached `WAITING_CONFIRMATION` after three model decisions. The Chinese query matched the backend's saved `Zhang San` via pinyin. Each prepared intent was cancelled immediately; Spring returned `CANCELLED`. No funds were transferred. The local backend currently stores no two 王 recipients, so the duplicate-name integration case uses the deterministic adapter fixture; adding them to the user's persistent demo database was avoided.

## Verification and limits

`python -m unittest discover -s services/agent-runtime/tests -p 'test_*.py' -v` passed (71 tests). Real DeepSeek and Spring smoke outcomes above were observed on 2026-10-07. Task state is still process-local; restarting the Agent loses an unfinished ambiguity or confirmation Task. The frozen RecipientSummary response has no alias field, so durable user-created aliases are not available from Spring yet; optional alias matching in the tool can only operate if a compatible data source supplies aliases. M18.1 ends here pending acceptance.

The user restarted the Agent after the checkpoint. The new listener on port 8001 (PID 37688) returned a healthy status. A live HTTP smoke against that exact process used a fresh Spring demo login, then `给 Lin Wei 转10元`; the response reached `WAITING_CONFIRMATION` through `resolve_recipient → list_accounts → prepare_transfer`. Cancellation returned `CANCELLED`, and Spring confirmed the bank intent was cancelled. No funds were moved in this checkpoint.

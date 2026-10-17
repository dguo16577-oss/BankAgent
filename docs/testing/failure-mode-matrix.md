# Failure and recovery matrix — M23

All financial responses come from the selected runtime. Backend mode never falls back to Mock.

| Failure                            | Expected behavior                                                               | Evidence                                                                          |
| ---------------------------------- | ------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| Spring process stopped             | Public/Customer request fails, visible retry, no fabricated balance             | real hardening suite; backend transport tests                                     |
| PostgreSQL container stopped       | health 503 with only DOWN; controlled error; restart retains data               | real hardening suite                                                              |
| Headers/body never settle          | 20-second deadline, transport aborted, retry UI                                 | deadline tests; real stalled-session test                                         |
| Request superseded                 | caller cancellation aborts request                                              | transport/deadline tests                                                          |
| Old identity response arrives late | discard response; never populate new session cache                              | backend transport tests                                                           |
| Session expired/revoked            | clear Customer data; redirect login; Public still usable                        | security RTL, real expiry and multi-tab tests                                     |
| CSRF absent/invalid                | 403; refresh bootstrap state, never replay mutation                             | all 13 frozen POST routes in SecurityPostgreSqlIT; transport tests                |
| Resource/hash changed              | 409; disable stale execution, invalidate authoritative resources, prepare again | feature review tests; domain integration tests                                    |
| Business validation                | 422 with frozen code and readable message                                       | backend domain tests; frontend feature tests                                      |
| Successful mutation response lost  | explicit retry uses identical intent/key; returns original receipt              | real transfer flow; four-domain idempotency integration tests                     |
| Concurrent same intent             | exactly one logical mutation/receipt; replay or defined conflict                | PostgreSqlIT, CardPostgreSqlIT, RecurringSpendingPostgreSqlIT, WealthPostgreSqlIT |
| Atomic write fails                 | roll back financial state and side effects                                      | PostgreSQL injected-constraint tests                                              |
| Spring restarted                   | persistent session and business state remain usable                             | real process restart; all domain reconstruction tests                             |
| Next restarted                     | browser rehydrates from APIs; no financial state owned by Web                   | real process restart                                                              |
| Logout in another tab              | next Customer request rejects stale cookie; Public unaffected                   | real multi-tab test                                                               |

Automated recovery uses a fresh, isolated database. It does not exercise the developer's retained database, introduce reset endpoints or claim disaster recovery from permanent disk loss.

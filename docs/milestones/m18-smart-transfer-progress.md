# M18 Smart Transfer progress (2026-10-08)

The current implementation and acceptance record is [m18-smart-transfer-final.md](m18-smart-transfer-final.md). **Competition sequence update:** M18's functional phase is complete; the prospective 100-case/30-category benchmark is **DEFERRED** and does not block M19. The table below preserves the earlier, stricter acceptance snapshot; its ungraded cases have not been converted to PASS.

| Stage                      | Status  | Current evidence                                                                                                                                                                         |
| -------------------------- | ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| M18.1 Name transfer        | PASS    | Prior name-resolution acceptance                                                                                                                                                         |
| M18.2 Phone transfer       | PASS    | Prior saved-phone resolution acceptance                                                                                                                                                  |
| M18.3 Historical recipient | PASS    | H01–H10 isolated real-model/bank checks                                                                                                                                                  |
| M18.4 Scheduled transfer   | PARTIAL | Bank-owned create/cancel/due processing, Agent preparation and revision, focused real-model lifecycle and PostgreSQL tests; full S01–S13 grading pending                                 |
| M18.5 AA request           | PARTIAL | Persisted request, participant visibility, create/cancel action intents, Agent preparation and revision, focused real-model lifecycle and PostgreSQL tests; full A01–A13 grading pending |
| M18.6 Benchmark            | PARTIAL | 73 eligible prior episodes across 26 categories, plus six separately registered schedule/AA focused episodes; one prospective 100-case/30-category run pending                           |

Agent v2 currently exposes **19 read, analyze, or prepare tools**. It has no model-visible financial execute tool. Schedule due execution belongs to Banking Core's worker, disabled by default. AA request creation does not debit participants. The [browser checklist](m18-smart-transfer-exploratory-checklist.md) now distinguishes implemented actions from scenarios that still need complete acceptance evidence.

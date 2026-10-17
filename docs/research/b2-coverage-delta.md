# B2 behavior coverage delta

Reproduction: `python research/banking-behaviors/scripts/b2_coverage.py`.

The pipeline reuses the pinned B0 family dependencies and B1 source/variant mapping, then evaluates the newly implemented recipient primitive using backend, manual UI and test evidence. It does not copy B1 projected status. Inputs remain unchanged; output records include source references and evidence hashes. Runtime verification is reported separately in the B2 milestone report.

| Classification                 | Before B2 | B2 implementation mapping |
| ------------------------------ | --------: | ------------------------: |
| SUPPORTED                      |        19 |                        20 |
| PARTIALLY_SUPPORTED            |        20 |                        19 |
| MISSING                        |        19 |                        19 |
| OUT_OF_SCOPE / evaluation only |         9 |                         9 |
| Total families                 |        67 |                        67 |

Only `NEW_RECIPIENT_TRANSFER` changes from PARTIALLY_SUPPORTED to SUPPORTED: recipient create plus the existing transfer execution now have Payments UI and corresponding PostgreSQL/RTL/mock/real/container journey tests. This family is explicitly an ASTER_GAP_HYPOTHESIS, not a claim that every original source task is executable. The family-level mapping is conditional on the recorded validation results; code presence alone is not release certification.

`BILL_TO_TRANSFER` stays PARTIALLY_SUPPORTED: document intake/extraction is absent. `PAYMENT_RISK_ESCALATION` stays PARTIALLY_SUPPORTED: exact session/resource/hash binding exists, but high-value/new-recipient risk thresholds and policy evaluation remain unapproved. Scheduled payments, recurring transfers, disputes, replacement cards and wealth redemption remain outside B2.

## Traceability

| Family / capability                       | API                                                                       | Manual UI                                                   | Evidence                                                                                                          |
| ----------------------------------------- | ------------------------------------------------------------------------- | ----------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| NEW_RECIPIENT_TRANSFER / RECIPIENT_CREATE | recipient-action-intents, recipients, existing transfer-intents/transfers | Payments → Add recipient → Review → Confirm → Make transfer | RecipientPostgreSqlIT; recipient-management.test.tsx; shared recipient-journey.ts                                 |
| Recipient lifecycle foundation            | recipient detail and recipient-actions                                    | Payments → Recipient details → Deactivate → Confirm         | concurrency, history, isolation and rollback integration cases; UI selector exclusion                             |
| PAYMENT_RISK_ESCALATION / binding portion | existing step-up APIs with TRANSFER_INTENT; transfers optional grant      | Existing transfer review/confirmation                       | session substitution, wrong resource/hash, expiry and consumption tests; no threshold or full-risk coverage claim |

Full before/after family mapping: `research/banking-behaviors/b2-family-capability-map.jsonl`. Machine counts and evidence hashes: `research/banking-behaviors/reports/b2-coverage-statistics.json`.

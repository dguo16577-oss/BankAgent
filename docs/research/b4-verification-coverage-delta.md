# B4 verification coverage delta

B4 adds a shared verification boundary to existing capabilities; it does not add banking feature families. The B3 family totals remain SUPPORTED 22, PARTIAL 19, MISSING 17, OUT_OF_SCOPE 9 (67 total). These are implementation mapping labels, not measured benchmark success rates.

| Existing capability            | B4 metadata delta                                                                |
| ------------------------------ | -------------------------------------------------------------------------------- |
| Immediate transfer             | Generated OTP + exact session/intent/action authorization enforced               |
| Recipient create/deactivate    | Combined / password verification respectively                                    |
| Scheduled create/modify/cancel | OTP / OTP / password; no due-time OTP; automatic runtime remains deferred        |
| Card unfreeze/risky controls   | Current password + generated OTP replaces universal demo code                    |
| Protective controls/freeze     | Password / existing confirmation                                                 |
| Investment execution           | Combined verification after suitability and immutable review                     |
| Stop future recurring payments | Password; merchant cancellation remains outside scope                            |
| Card/loan applications         | OTP / combined verification of persisted intake; no issuance or lending approval |

Security metadata is strengthened, but broader partial banking families retain their prior labels where business scope remains incomplete. Phone lifecycle, real SMS delivery, login MFA, risk escalation, Agent and B3.1 remain absent. See the B4 report for actual validation evidence and the security documents for deployment limitations.

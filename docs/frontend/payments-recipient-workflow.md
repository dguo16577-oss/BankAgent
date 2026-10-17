# Payments recipient workflow

All operations stay in `/app/payments`. The feature components call query/mutation hooks, generated-type API clients and Customer APIs. MSW implements the same evolved contract for explicit mock runtime and tests. Backend mode imports no fixture list.

1. Payments → Add recipient → enter approved demo destination reference.
2. Review server-resolved name, bank, masked account, currency and UNVERIFIED explanation.
3. Confirm recipient → Make transfer with the saved opaque recipient ID preselected.
4. Existing prepare → review → confirm → receipt flow continues.
5. Recipient details → Deactivate → explicit irreversible confirmation.
6. Inactive recipients remain in management/history, but disappear from new transfer options.

Search is submitted to the recipient API. Same-name results remain separate clickable records with different masked destination information. No result is automatically selected. Detail has loading, not-found/error and retry states. Create errors preserve entered context; execute retry retains the idempotency key. Labels use the existing English/Chinese localization system. Internal hashes and versions are not exposed in page content.

Automated journey: `apps/web/e2e-shared/recipient-journey.ts`, used by both mock and real-backend tests and the packaged test configuration. It checks Payments routes, recipient selection, completed transfer, deactivation, historical receipt and narrow layout.
